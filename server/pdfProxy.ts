import type { Request, Response } from "express";
import { fetchWithValidatedRedirects, openPdf, PDF_MAGIC, ProxyError, singleRange, TIMEOUT_MS, type Disposition } from "../api/_lib/library/pdf";

// The fetch / validation / header logic lives in api/_lib/library/pdf.ts, shared with the Vercel functions
// api/pdf-proxy.ts and api/pdf-download.ts. This file is the Express transport, plus the research batch check below.
export { fetchWithValidatedRedirects, PDF_MAGIC };

/**
 * Streams a remote PDF back same-origin (dropping the publisher's X-Frame-Options / CSP).
 * Refuses private hosts, non-PDF payloads and oversized files with a plain-text error and a real status code.
 * `inline` renders in a viewer; `attachment` forces the browser to save the file to disk.
 * Host policy: `PDF_PROXY_ALLOWED_HOSTS` when set, else any public https host (unchanged Express behaviour).
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
    const { status, headers, reader, first, maxBytes } = await openPdf({
      target,
      range: singleRange(req.headers.range),
      signal: controller.signal,
      disposition,
      filename: req.query.name,
    });
    clearTimeout(timer); // headers + first chunk arrived: from here only client disconnects abort the transfer

    res.status(status);
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);

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
