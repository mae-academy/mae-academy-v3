import type { Request, Response } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARCHIVE_ID_PATTERN, COVER_HEADERS, fetchArchiveCover } from "../api/_lib/library/catalog";

const CACHE_DIR = path.resolve(process.env.PDF_CACHE_DIR ?? ".cache", "covers");
/** Internet Archive identifiers only: the upstream URL is always archive.org/services/img/<id>. */
const ID_PATTERN = ARCHIVE_ID_PATTERN;
const CONCURRENCY = 6;

let active = 0;
const waiting: (() => void)[] = [];
const inFlight = new Map<string, Promise<Buffer | null>>();

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Fetch (shared with the Vercel function api/library/cover.ts, which relies on the CDN instead of a disk cache), then cache on disk. */
async function download(id: string): Promise<Buffer | null> {
  try {
    const image = await fetchArchiveCover(id);
    if (!image) return null;
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${id}.img`), image);
    return image;
  } catch {
    return null;
  }
}

async function getCover(id: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(CACHE_DIR, `${id}.img`));
  } catch {
    // not cached yet
  }
  const pending = inFlight.get(id) ?? withSlot(() => download(id)).finally(() => inFlight.delete(id));
  inFlight.set(id, pending);
  return pending;
}

/** GET /api/library/cover?id=<identifier>: disk-cached book cover so repeat visits are instant. */
export async function libraryCoverHandler(req: Request, res: Response): Promise<void> {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!ID_PATTERN.test(id)) {
    res.status(404).end();
    return;
  }
  const image = await getCover(id);
  if (!image) {
    res.status(404).end();
    return;
  }
  for (const [name, value] of Object.entries(COVER_HEADERS)) res.setHeader(name, value);
  res.send(image);
}
