/**
 * PDF streaming shared by the Express server (server/pdfProxy.ts) and the Vercel functions
 * api/pdf-proxy.ts and api/pdf-download.ts. Node runtime only: the SSRF policy resolves DNS (node:dns).
 *
 * The logic here was moved unchanged from server/pdfProxy.ts; only the transport differs:
 * Express writes to `res` (see server/pdfProxy.ts), the Vercel functions return a streamed web `Response`.
 */
import { assertSafeTarget, configuredProxyAllowlist, HOST_ALLOWLISTS, SsrfError } from "../security/ssrf";

const MAX_REDIRECTS = 5;
const MAX_BYTES = 50 * 1024 * 1024; // inline viewer stream ceiling
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024; // books can be 100+ MB; downloads are streamed, never buffered
export const TIMEOUT_MS = 20_000; // time to first byte only; a long transfer must not be cut off mid-stream
export const PDF_MAGIC = Buffer.from("%PDF");

/**
 * Hosts the Vercel PDF functions may fetch from. Every library PDF is an Internet Archive download
 * (`https://archive.org/download/<id>/<file>`, see buildDownloadUrl in client/src/lib/internetarchive.ts), which
 * redirects to a `*.us.archive.org` storage node. Open Library and DOAB records carry no PDF (`pdfUrl: null`), so
 * their hosts are deliberately not listed. Every redirect hop is checked against this list too.
 */
export const LIBRARY_PDF_HOSTS: readonly string[] = [...HOST_ALLOWLISTS.archive];

export class ProxyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Applies the shared outbound policy (https only, no IP literals / credentials / odd ports, public addresses only, optional host allowlist). */
async function assertPublicHttpUrl(raw: string, allowlist: readonly string[] | undefined): Promise<URL> {
  try {
    return await assertSafeTarget(raw, allowlist);
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

/**
 * Follows redirects manually so every hop is re-validated against the SSRF rules.
 * `allowlist` defaults to `PDF_PROXY_ALLOWED_HOSTS` (unset = any public https host), which is what Express has always used.
 */
export async function fetchWithValidatedRedirects(
  start: string,
  signal: AbortSignal,
  range?: string,
  allowlist: readonly string[] | undefined = configuredProxyAllowlist(),
): Promise<globalThis.Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicHttpUrl(current, allowlist);
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

export type Disposition = "inline" | "attachment";

const DEFAULT_FILENAME = "research_paper.pdf";

/** ASCII-only, path-safe filename ending in .pdf (the value ends up inside a Content-Disposition header). */
export function safeFilename(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_FILENAME;
  const base = raw
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return base ? `${base}.pdf` : DEFAULT_FILENAME;
}

/** A single `bytes=a-b` range is forwarded so pdf.js can fetch just the xref + needed pages of large PDFs. */
export const singleRange = (header: unknown): string | undefined =>
  typeof header === "string" && /^bytes=\d*-\d*$/.test(header) ? header : undefined;

export interface OpenedPdf {
  readonly status: 200 | 206;
  readonly headers: Record<string, string>;
  readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  /** First chunk, already read to check the %PDF signature; must be sent before the rest of `reader`. */
  readonly first: ReadableStreamReadResult<Uint8Array>;
  readonly maxBytes: number;
}

/**
 * Fetches `target`, reads the first chunk and verifies it is a PDF, and computes the response headers.
 * Throws ProxyError (with the status to answer) for a missing URL, a refused host, an upstream failure or a non-PDF payload.
 */
export async function openPdf(options: {
  target: string;
  range: string | undefined;
  signal: AbortSignal;
  disposition: Disposition;
  filename: unknown;
  allowlist?: readonly string[];
}): Promise<OpenedPdf> {
  const { target, range, signal, disposition } = options;
  if (!target) throw new ProxyError(400, "Missing url parameter");

  const upstream = await fetchWithValidatedRedirects(target, signal, range, "allowlist" in options ? options.allowlist : configuredProxyAllowlist());
  if (!upstream.ok || !upstream.body) throw new ProxyError(upstream.status === 404 ? 404 : 502, "Failed to fetch PDF from source");

  const partial = upstream.status === 206;
  const contentRange = upstream.headers.get("content-range");
  const startsAtZero = !partial || /^bytes 0-/.test(contentRange ?? "");

  const reader = upstream.body.getReader();
  const first = await reader.read();
  // Only the first byte range of a document carries the %PDF header.
  if (startsAtZero) {
    const head = first.value ? Buffer.from(first.value.subarray(0, 1024)) : Buffer.alloc(0);
    if (!head.includes(PDF_MAGIC)) {
      await reader.cancel();
      throw new ProxyError(415, "Source did not return a PDF document");
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": disposition === "attachment" ? `attachment; filename="${safeFilename(options.filename)}"` : "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": disposition === "attachment" ? "private, no-store" : "public, max-age=3600",
  };
  // Advertise ranges only when the publisher really supports them; lengths are only trustworthy without content-encoding.
  const encoded = upstream.headers.has("content-encoding");
  const length = upstream.headers.get("content-length");
  if (partial || upstream.headers.get("accept-ranges") === "bytes") headers["Accept-Ranges"] = "bytes";
  if (partial && contentRange) headers["Content-Range"] = contentRange;
  if (length && !encoded) headers["Content-Length"] = length;

  return { status: partial ? 206 : 200, headers, reader, first, maxBytes: disposition === "attachment" ? MAX_DOWNLOAD_BYTES : MAX_BYTES };
}

const textResponse = (status: number, message: string): Response =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * Web-standard handler for the Vercel functions: GET ?url=<https url>[&name=<filename>].
 * Same checks, headers and limits as the Express route, restricted to `allowlist` (no environment fallback).
 */
export function createPdfWebHandler(disposition: Disposition, allowlist: readonly string[]): (request: Request) => Promise<Response> {
  return async (request) => {
    const params = new URL(request.url).searchParams;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    request.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const opened = await openPdf({
        target: params.get("url") ?? "",
        range: singleRange(request.headers.get("range")),
        signal: controller.signal,
        disposition,
        filename: params.get("name") ?? undefined,
        allowlist,
      });
      clearTimeout(timer); // headers + first chunk arrived: from here only client disconnects abort the transfer
      const { reader, maxBytes } = opened;
      let pending: ReadableStreamReadResult<Uint8Array> | undefined = opened.first;
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(stream) {
          const chunk = pending ?? (await reader.read());
          pending = undefined;
          if (chunk.done) {
            stream.close();
            return;
          }
          sent += chunk.value.byteLength;
          if (sent > maxBytes) {
            // headers already sent; abort rather than serve a truncated file as complete
            await reader.cancel();
            stream.error(new Error("PDF exceeds the size limit"));
            return;
          }
          stream.enqueue(chunk.value);
        },
        cancel(reason) {
          controller.abort();
          return reader.cancel(reason);
        },
      });
      return new Response(body, { status: opened.status, headers: opened.headers });
    } catch (error) {
      if (error instanceof ProxyError) return textResponse(error.status, error.message);
      if (controller.signal.aborted) return textResponse(504, "Upstream timed out");
      console.error("PDF proxy error:", error);
      return textResponse(502, "Failed to fetch PDF from source");
    } finally {
      clearTimeout(timer);
    }
  };
}
