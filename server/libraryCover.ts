import type { Request, Response } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HOST_ALLOWLISTS, readLimited, safeFetch } from "./ssrf";

const CACHE_DIR = path.resolve(process.env.PDF_CACHE_DIR ?? ".cache", "covers");
/** Internet Archive identifiers only: the upstream URL is always archive.org/services/img/<id>. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
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

async function download(id: string): Promise<Buffer | null> {
  try {
    const res = await safeFetch(`https://archive.org/services/img/${encodeURIComponent(id)}`, { allowlist: [...HOST_ALLOWLISTS.archive], signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const image = await readLimited(res, MAX_COVER_BYTES);
    if (image.length === 0) return null;
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
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=604800");
  res.send(image);
}
