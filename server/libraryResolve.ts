import type { Request, Response } from "express";
import { buildDownloadUrl, pickPdfFile, type ArchiveFile } from "../client/src/lib/internetarchive";

const METADATA_URL = "https://archive.org/metadata";
/** Internet Archive identifiers only: keeps the request pinned to archive.org/metadata/<id>. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const MAX_IDS = 60;
const BATCH_SIZE = 15;
const TIMEOUT_MS = 6000;
const TTL_MS = 60 * 60 * 1000;

interface MetadataResponse {
  metadata?: { "access-restricted-item"?: string };
  files?: ArchiveFile[];
  is_dark?: boolean;
}

const cache = new Map<string, { url: string | null; expires: number }>();

/** Real download URL of the best PDF, or null when the item is restricted, missing or has no PDF file. */
async function resolveOne(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.url;

  try {
    const res = await fetch(`${METADATA_URL}/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null; // transient failures are not cached
    const data = (await res.json()) as MetadataResponse;
    const restricted = data.metadata?.["access-restricted-item"] === "true" || data.is_dark === true;
    const file = restricted ? null : pickPdfFile(data.files);
    const url = file ? buildDownloadUrl(id, file.name) : null;
    if (cache.size >= 5000) cache.delete(cache.keys().next().value as string);
    cache.set(id, { url, expires: Date.now() + TTL_MS });
    return url;
  } catch {
    return null;
  }
}

/**
 * POST /api/library/resolve-pdfs   body: { ids: string[] }   ->   { results: Record<id, string | null> }
 * Preflight for the See Also section: a book only counts as readable if a non-restricted PDF file really exists.
 */
export async function libraryResolveHandler(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const raw = typeof body === "object" && body !== null ? (body as { ids?: unknown }).ids : undefined;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string" || !ID_PATTERN.test(id))) {
    res.status(400).json({ error: "Body must be { ids: string[] } of Internet Archive identifiers" });
    return;
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
  res.json({ results });
}
