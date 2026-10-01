import type { Request, Response } from "express";
import { assertSafeTarget, configuredProxyAllowlist, SsrfError } from "./ssrf";

const MAX_REDIRECTS = 5;
const MAX_BYTES = 50 * 1024 * 1024; // inline viewer stream ceiling
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024; // books can be 100+ MB; downloads are streamed, never buffered
const TIMEOUT_MS = 20_000; // time to first byte only; a long transfer must not be cut off mid-stream
export const PDF_MAGIC = Buffer.from("%PDF");

class ProxyError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Applies the shared outbound policy (https only, no IP literals / credentials / odd ports, public addresses only, optional host allowlist). */
async function assertPublicHttpUrl(raw: string): Promise<URL> {
  try {
    return await assertSafeTarget(raw, configuredProxyAllowlist());
  } catch (error) {
    if (error instanceof SsrfError) throw new ProxyError(error.status, error.message);
    throw error;
  }
}

const UPSTREAM_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;
const isTransientStatus = (status: number): boolean => status === 429 || status === 502 || status === 503 || status === 504;

/** One upstream GET, retried on network errors and transient 429 / 502 / 503 / 504 answers (never on an abort). */
async function fetchUpstreamWithRetry(url: URL, signal: AbortSignal, range?: string): Promise<globalThis.Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const upstream = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          Accept: "application/pdf,*/*;q=0.8",
          "User-Agent": "MAEAcademy-PdfProxy/1.0",
          ...(range ? { Range: range } : {}),
        },
      });
      if (!isTransientStatus(upstream.status) || attempt >= UPSTREAM_ATTEMPTS) return upstream;
      await upstream.body?.cancel();
    } catch (error) {
      if (signal.aborted || attempt >= UPSTREAM_ATTEMPTS) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
  }
}

/** Follows redirects manually so every hop is re-validated against the SSRF rules. */
export async function fetchWithValidatedRedirects(start: string, signal: AbortSignal, range?: string): Promise<globalThis.Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicHttpUrl(current);
    const upstream = await fetchUpstreamWithRetry(url, signal, range);
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) throw new ProxyError(502, "Redirect without location");
      current = new URL(location, url).toString();
      await upstream.body?.cancel();
      continue;
    }
    return upstream;
  }
  throw new ProxyError(508, "Too many redirects");
}

type Disposition = "inline" | "attachment";

const DEFAULT_FILENAME = "research_paper.pdf";

/** ASCII-only, path-safe filename ending in .pdf (the value ends up inside a Content-Disposition header). */
function safeFilename(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_FILENAME;
  const base = raw
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return base ? `${base}.pdf` : DEFAULT_FILENAME;
}

/**
 * Streams a remote PDF back same-origin (dropping the publisher's X-Frame-Options / CSP).
 * Refuses private hosts, non-PDF payloads and oversized files with a plain-text error and a real status code.
 * `inline` renders in a viewer; `attachment` forces the browser to save the file to disk.
 */
function createPdfHandler(disposition: Disposition) {
  return (req: Request, res: Response): Promise<void> => streamPdf(req, res, disposition);
}

/** GET /api/pdf-proxy?url=<https url> - inline, for the in-page viewer. */
export const pdfProxyHandler = createPdfHandler("inline");

/** GET /api/pdf-download?url=<https url>&name=<optional filename> - forces a file download. */
export const pdfDownloadHandler = createPdfHandler("attachment");

async function streamPdf(req: Request, res: Response, disposition: Disposition): Promise<void> {
  const target = typeof req.query.url === "string" ? req.query.url : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  res.on("close", () => controller.abort());

  try {
    if (!target) throw new ProxyError(400, "Missing url parameter");

    // Forward a single byte range so pdf.js can fetch just the xref + needed pages of large PDFs.
    const rangeHeader = req.headers.range;
    const range = typeof rangeHeader === "string" && /^bytes=\d*-\d*$/.test(rangeHeader) ? rangeHeader : undefined;

    const upstream = await fetchWithValidatedRedirects(target, controller.signal, range);
    if (!upstream.ok || !upstream.body) throw new ProxyError(upstream.status === 404 ? 404 : 502, "Failed to fetch PDF from source");

    const partial = upstream.status === 206;
    const contentRange = upstream.headers.get("content-range");
    const startsAtZero = !partial || /^bytes 0-/.test(contentRange ?? "");

    const reader = upstream.body.getReader();
    const first = await reader.read();
    clearTimeout(timer); // headers + first chunk arrived: from here only client disconnects abort the transfer
    // Only the first byte range of a document carries the %PDF header.
    if (startsAtZero) {
      const head = first.value ? Buffer.from(first.value.subarray(0, 1024)) : Buffer.alloc(0);
      if (!head.includes(PDF_MAGIC)) {
        await reader.cancel();
        throw new ProxyError(415, "Source did not return a PDF document");
      }
    }

    res.status(partial ? 206 : 200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      disposition === "attachment" ? `attachment; filename="${safeFilename(req.query.name)}"` : "inline",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", disposition === "attachment" ? "private, no-store" : "public, max-age=3600");

    // Advertise ranges only when the publisher really supports them; lengths are only trustworthy without content-encoding.
    const encoded = upstream.headers.has("content-encoding");
    const length = upstream.headers.get("content-length");
    if (partial || upstream.headers.get("accept-ranges") === "bytes") res.setHeader("Accept-Ranges", "bytes");
    if (partial && contentRange) res.setHeader("Content-Range", contentRange);
    if (length && !encoded) res.setHeader("Content-Length", length);

    const maxBytes = disposition === "attachment" ? MAX_DOWNLOAD_BYTES : MAX_BYTES;
    let sent = 0;
    let chunk = first;
    while (!chunk.done) {
      sent += chunk.value.byteLength;
      if (sent > maxBytes) {
        await reader.cancel();
        res.destroy(); // headers already flushed; abort rather than serve a truncated file as complete
        return;
      }
      if (!res.write(chunk.value)) await new Promise<void>((resolve) => res.once("drain", resolve));
      chunk = await reader.read();
    }
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof ProxyError) {
      res.status(error.status).type("text/plain").send(error.message);
    } else if (controller.signal.aborted) {
      res.status(504).type("text/plain").send("Upstream timed out");
    } else {
      console.error("PDF proxy error:", error);
      res.status(502).type("text/plain").send("Failed to fetch PDF from source");
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Batch preflight: which of these URLs will actually render as a PDF? ─────────────────────────

type CheckOutcome = "ok" | "fail" | "timeout";

// 800 ms confirmed only ~35% of truly viewable PDFs in live tests (0 false positives); 1500 ms confirmed ~71%.
const CHECK_TIMEOUT_MS = Number(process.env.PDF_CHECK_TIMEOUT_MS) || 1500;
const MAX_CHECK_URLS = 60;
const CHECK_CONCURRENCY = MAX_CHECK_URLS; // one wave: total latency ~= the per-URL timeout
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

/** Definitive answers are cached; timeouts are not (a slow host may answer next time). */
const checkCache = new Map<string, { ok: boolean; expires: number }>();

function cacheGet(url: string): boolean | undefined {
  const hit = checkCache.get(url);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    checkCache.delete(url);
    return undefined;
  }
  return hit.ok;
}

function cacheSet(url: string, ok: boolean): void {
  if (checkCache.size >= CACHE_MAX_ENTRIES) checkCache.delete(checkCache.keys().next().value as string);
  checkCache.set(url, { ok, expires: Date.now() + CACHE_TTL_MS });
}

/** Requests the first KB (through the same SSRF-validated redirect logic) and looks for the %PDF signature. */
async function checkPdfUrl(url: string, timeoutMs: number): Promise<CheckOutcome> {
  const cached = cacheGet(url);
  if (cached !== undefined) return cached ? "ok" : "fail";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchWithValidatedRedirects(url, controller.signal, "bytes=0-1023");
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      cacheSet(url, false);
      return "fail";
    }
    const reader = upstream.body.getReader();
    const first = await reader.read();
    await reader.cancel();
    const ok = Boolean(first.value) && Buffer.from(first.value!.subarray(0, 1024)).includes(PDF_MAGIC);
    cacheSet(url, ok);
    return ok ? "ok" : "fail";
  } catch (error) {
    if (controller.signal.aborted) return "timeout";
    if (error instanceof ProxyError) cacheSet(url, false); // blocked host / invalid URL: definitive
    return "fail";
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `worker` over `items` with a fixed number of concurrent workers. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

/**
 * POST /api/check-pdfs   body: { urls: string[] }   ->   { results: Record<url, boolean> }
 * A URL is `true` only if it answered within the timeout with real PDF bytes (checked via a 1 KB range request).
 * Private hosts, invalid URLs, HTML pages, timeouts and errors are all `false`.
 */
export async function pdfCheckHandler(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const raw = typeof body === "object" && body !== null ? (body as { urls?: unknown }).urls : undefined;
  if (!Array.isArray(raw) || raw.some((u) => typeof u !== "string")) {
    res.status(400).json({ error: "Body must be { urls: string[] }" });
    return;
  }

  const urls = Array.from(new Set(raw as string[])).slice(0, MAX_CHECK_URLS);
  const outcomes = await mapWithConcurrency(urls, CHECK_CONCURRENCY, (url) => checkPdfUrl(url, CHECK_TIMEOUT_MS));
  const results: Record<string, boolean> = {};
  urls.forEach((url, i) => {
    results[url] = outcomes[i] === "ok";
  });
  res.json({ results });
}
