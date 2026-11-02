/**
 * Library metadata lookups shared by the Express server (server/libraryResolve.ts, libraryCover.ts, libraryDoab.ts)
 * and the Vercel functions under api/library/. Node runtime only (the SSRF policy resolves DNS).
 *
 * Moved unchanged from the Express handlers. Each lookup is pinned to one fixed upstream host:
 *   archive.org (metadata, covers) and directory.doabooks.org (DOAB search and records).
 * In-memory caches live per process / per warm function instance.
 */
import { buildDownloadUrl, pickPdfFile, type ArchiveFile } from "../../../client/src/lib/internetarchive";
import { HOST_ALLOWLISTS, readLimited, safeFetch } from "../security/ssrf";

/** A JSON reply: `body` is the exact JSON text to send with `status`. */
export interface JsonReply {
  readonly status: number;
  readonly body: string;
}
const jsonError = (status: number, error: string): JsonReply => ({ status, body: JSON.stringify({ error }) });

/** Internet Archive identifiers only: keeps requests pinned to archive.org/<path>/<id>. */
export const ARCHIVE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

// ─── POST /api/library/resolve-pdfs ──────────────────────────────────────────────────────────────

const METADATA_URL = "https://archive.org/metadata";
const MAX_IDS = 60;
const BATCH_SIZE = 15;
const RESOLVE_TIMEOUT_MS = 6000;
const RESOLVE_TTL_MS = 60 * 60 * 1000;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;

interface MetadataResponse {
  metadata?: { "access-restricted-item"?: string };
  files?: ArchiveFile[];
  is_dark?: boolean;
}

const resolveCache = new Map<string, { url: string | null; expires: number }>();

/** Real download URL of the best PDF, or null when the item is restricted, missing or has no PDF file. */
async function resolveOne(id: string): Promise<string | null> {
  const hit = resolveCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.url;

  try {
    const res = await safeFetch(`${METADATA_URL}/${encodeURIComponent(id)}`, { allowlist: [...HOST_ALLOWLISTS.archive], signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS) });
    if (!res.ok) return null; // transient failures are not cached
    const data = JSON.parse((await readLimited(res, MAX_METADATA_BYTES)).toString("utf8")) as MetadataResponse;
    const restricted = data.metadata?.["access-restricted-item"] === "true" || data.is_dark === true;
    const file = restricted ? null : pickPdfFile(data.files);
    const url = file ? buildDownloadUrl(id, file.name) : null;
    if (resolveCache.size >= 5000) resolveCache.delete(resolveCache.keys().next().value as string);
    resolveCache.set(id, { url, expires: Date.now() + RESOLVE_TTL_MS });
    return url;
  } catch {
    return null;
  }
}

/**
 * body: { ids: string[] }  ->  { results: Record<id, string | null> }
 * Preflight for the See Also section: a book only counts as readable if a non-restricted PDF file really exists.
 */
export async function resolveArchivePdfs(body: unknown): Promise<JsonReply> {
  const raw = typeof body === "object" && body !== null ? (body as { ids?: unknown }).ids : undefined;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string" || !ARCHIVE_ID_PATTERN.test(id))) {
    return jsonError(400, "Body must be { ids: string[] } of Internet Archive identifiers");
  }

  const ids = Array.from(new Set(raw as string[])).slice(0, MAX_IDS);
  const results: Record<string, string | null> = {};
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const urls = await Promise.all(batch.map(resolveOne));
    batch.forEach((id, index) => {
      results[id] = urls[index];
    });
  }
  return { status: 200, body: JSON.stringify({ results }) };
}

// ─── GET /api/library/cover ──────────────────────────────────────────────────────────────────────

const COVER_TIMEOUT_MS = 30_000;
const MAX_COVER_BYTES = 2 * 1024 * 1024;

/** archive.org/services/img/<id>, or null when the id is invalid or the answer is not a non-empty image. */
export async function fetchArchiveCover(id: string): Promise<Buffer | null> {
  if (!ARCHIVE_ID_PATTERN.test(id)) return null;
  try {
    const res = await safeFetch(`https://archive.org/services/img/${encodeURIComponent(id)}`, { allowlist: [...HOST_ALLOWLISTS.archive], signal: AbortSignal.timeout(COVER_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const image = await readLimited(res, MAX_COVER_BYTES);
    return image.length === 0 ? null : image;
  } catch {
    return null;
  }
}

/** Headers of a successful cover reply (Express and Vercel). */
export const COVER_HEADERS = { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } as const;

// ─── GET /api/library/doab and /api/library/doab-item ────────────────────────────────────────────

const DOAB_URL = "https://directory.doabooks.org/rest/search";
const DOAB_TIMEOUT_MS = 9000;
const MAX_QUERY_LENGTH = 200;
const MAX_LIMIT = 30;
const DOAB_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const searchCache = new Map<string, { body: string; expires: number }>();

/**
 * ?query=&limit=&offset=  The DOAB directory sends no CORS headers, so browsers cannot call it. This pins the host,
 * validates the inputs and caches answers (the directory takes 3-17 s per request). Only `expand=metadata` is requested:
 * the bitstreams that would add covers made the request 3-6x slower.
 */
export async function doabSearch(input: { query: unknown; limit: unknown; offset: unknown }): Promise<JsonReply> {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const limit = Math.min(Number.parseInt(String(input.limit ?? "15"), 10) || 15, MAX_LIMIT);
  const offset = Math.max(Number.parseInt(String(input.offset ?? "0"), 10) || 0, 0);
  if (!query || query.length > MAX_QUERY_LENGTH) return jsonError(400, "query is required (max 200 characters)");

  const key = `${query}|${limit}|${offset}`;
  const hit = searchCache.get(key);
  if (hit && hit.expires > Date.now()) return { status: 200, body: hit.body };

  try {
    const params = new URLSearchParams({ query, expand: "metadata", limit: String(limit), offset: String(offset) });
    const upstream = await safeFetch(`${DOAB_URL}?${params.toString()}`, {
      allowlist: [...HOST_ALLOWLISTS.doab],
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(DOAB_TIMEOUT_MS),
    });
    if (!upstream.ok) return jsonError(502, `DOAB answered ${upstream.status}`);
    const body = (await readLimited(upstream, MAX_BODY_BYTES)).toString("utf8");
    if (searchCache.size >= CACHE_MAX_ENTRIES) searchCache.delete(searchCache.keys().next().value as string);
    searchCache.set(key, { body, expires: Date.now() + DOAB_TTL_MS });
    return { status: 200, body };
  } catch {
    return jsonError(504, "DOAB did not respond in time");
  }
}

const HANDLE_PATTERN = /^\d+(\.\d+)*\/\d+$/;
const itemCache = new Map<string, { body: string; expires: number }>();

/** ?handle=20.500.12854/130855  One DOAB record with its metadata and cover thumbnail (bitstreams are cheap for one record, ~1 s). */
export async function doabItem(handleInput: unknown): Promise<JsonReply> {
  const handle = typeof handleInput === "string" ? handleInput : "";
  if (!HANDLE_PATTERN.test(handle)) return jsonError(400, "handle must look like 20.500.12854/130855");

  const hit = itemCache.get(handle);
  if (hit && hit.expires > Date.now()) return { status: 200, body: hit.body };

  try {
    const upstream = await safeFetch(`https://directory.doabooks.org/rest/handle/${handle}?expand=metadata,bitstreams`, {
      allowlist: [...HOST_ALLOWLISTS.doab],
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(DOAB_TIMEOUT_MS),
    });
    if (upstream.status === 404) return jsonError(404, "DOAB record not found");
    if (!upstream.ok) return jsonError(502, `DOAB answered ${upstream.status}`);
    const body = (await readLimited(upstream, MAX_BODY_BYTES)).toString("utf8");
    if (itemCache.size >= CACHE_MAX_ENTRIES) itemCache.delete(itemCache.keys().next().value as string);
    itemCache.set(handle, { body, expires: Date.now() + DOAB_TTL_MS });
    return { status: 200, body };
  } catch {
    return jsonError(504, "DOAB did not respond in time");
  }
}

// ─── Web-standard handlers for the Vercel functions ──────────────────────────────────────────────

const jsonResponse = (reply: JsonReply): Response =>
  new Response(reply.body, { status: reply.status, headers: { "content-type": "application/json; charset=utf-8" } });

export async function handleResolvePdfs(request: Request): Promise<Response> {
  const body = await request.json().catch(() => undefined);
  return jsonResponse(await resolveArchivePdfs(body));
}

export async function handleCover(request: Request): Promise<Response> {
  const image = await fetchArchiveCover(new URL(request.url).searchParams.get("id") ?? "");
  return image ? new Response(new Uint8Array(image), { status: 200, headers: COVER_HEADERS }) : new Response(null, { status: 404 });
}

export async function handleDoabSearch(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return jsonResponse(await doabSearch({ query: params.get("query") ?? undefined, limit: params.get("limit") ?? undefined, offset: params.get("offset") ?? undefined }));
}

export async function handleDoabItem(request: Request): Promise<Response> {
  return jsonResponse(await doabItem(new URL(request.url).searchParams.get("handle") ?? undefined));
}
