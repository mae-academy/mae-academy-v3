import type { Request, Response } from "express";
import { HOST_ALLOWLISTS, readLimited, safeFetch } from "./ssrf";

const DOAB_URL = "https://directory.doabooks.org/rest/search";
const TIMEOUT_MS = 9000;
const MAX_QUERY_LENGTH = 200;
const MAX_LIMIT = 30;
const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const cache = new Map<string, { body: string; expires: number }>();

/**
 * GET /api/library/doab?query=&limit=&offset=
 * The DOAB directory sends no CORS headers, so browsers cannot call it. This route pins the host, validates the
 * inputs and caches answers (the directory takes 3-17 s per request). Only `expand=metadata` is requested: the
 * bitstreams that would add covers made the request 3-6x slower.
 */
export async function libraryDoabHandler(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const limit = Math.min(Number.parseInt(String(req.query.limit ?? "15"), 10) || 15, MAX_LIMIT);
  const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  if (!query || query.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: "query is required (max 200 characters)" });
    return;
  }

  const key = `${query}|${limit}|${offset}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    res.type("application/json").send(hit.body);
    return;
  }

  try {
    const params = new URLSearchParams({ query, expand: "metadata", limit: String(limit), offset: String(offset) });
    const upstream = await safeFetch(`${DOAB_URL}?${params.toString()}`, {
      allowlist: [...HOST_ALLOWLISTS.doab],
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `DOAB answered ${upstream.status}` });
      return;
    }
    const body = (await readLimited(upstream, MAX_BODY_BYTES)).toString("utf8");
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { body, expires: Date.now() + TTL_MS });
    res.type("application/json").send(body);
  } catch {
    res.status(504).json({ error: "DOAB did not respond in time" });
  }
}

const HANDLE_PATTERN = /^\d+(\.\d+)*\/\d+$/;
const itemCache = new Map<string, { body: string; expires: number }>();

/**
 * GET /api/library/doab-item?handle=20.500.12854/130855
 * One DOAB record with its metadata and cover thumbnail (bitstreams are cheap for a single record, ~1 s).
 */
export async function libraryDoabItemHandler(req: Request, res: Response): Promise<void> {
  const handle = typeof req.query.handle === "string" ? req.query.handle : "";
  if (!HANDLE_PATTERN.test(handle)) {
    res.status(400).json({ error: "handle must look like 20.500.12854/130855" });
    return;
  }

  const hit = itemCache.get(handle);
  if (hit && hit.expires > Date.now()) {
    res.type("application/json").send(hit.body);
    return;
  }

  try {
    const upstream = await safeFetch(`https://directory.doabooks.org/rest/handle/${handle}?expand=metadata,bitstreams`, {
      allowlist: [...HOST_ALLOWLISTS.doab],
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (upstream.status === 404) {
      res.status(404).json({ error: "DOAB record not found" });
      return;
    }
    if (!upstream.ok) {
      res.status(502).json({ error: `DOAB answered ${upstream.status}` });
      return;
    }
    const body = (await readLimited(upstream, MAX_BODY_BYTES)).toString("utf8");
    if (itemCache.size >= CACHE_MAX_ENTRIES) itemCache.delete(itemCache.keys().next().value as string);
    itemCache.set(handle, { body, expires: Date.now() + TTL_MS });
    res.type("application/json").send(body);
  } catch {
    res.status(504).json({ error: "DOAB did not respond in time" });
  }
}
