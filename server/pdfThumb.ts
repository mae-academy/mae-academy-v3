import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fetchWithValidatedRedirects, PDF_MAGIC } from "./pdfProxy";

const CACHE_DIR = path.resolve(process.env.PDF_CACHE_DIR ?? ".cache", "thumbs");
const THUMB_WIDTH = 600;
const JPEG_QUALITY = 80;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 25_000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const RENDER_CONCURRENCY = 6;

const keyFor = (url: string): string => createHash("sha1").update(url).digest("hex");
const jpgPath = (url: string): string => path.join(CACHE_DIR, `${keyFor(url)}.jpg`);
const missPath = (url: string): string => path.join(CACHE_DIR, `${keyFor(url)}.miss`);

/** Minimal counting semaphore so a burst of requests cannot exhaust CPU / sockets. */
class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

const limiter = new Limiter(RENDER_CONCURRENCY);
const inFlight = new Map<string, Promise<Buffer | null>>();

/** Downloads (SSRF-validated, size-capped) and returns the PDF bytes, or null for anything that is not a PDF. */
async function downloadPdf(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const upstream = await fetchWithValidatedRedirects(url, controller.signal);
    if (!upstream.ok || !upstream.body) return null;
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      if (chunks.length === 0 && !Buffer.from(chunk.value.subarray(0, 1024)).includes(PDF_MAGIC)) {
        await reader.cancel();
        return null;
      }
      total += chunk.value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function renderFirstPage(data: Uint8Array): Promise<Buffer | null> {
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    // pdf.js accepts any canvas-like object in Node; @napi-rs/canvas is one.
    await page.render({ canvasContext: canvas.getContext("2d") as never, viewport, canvas: canvas as never }).promise;
    return canvas.toBuffer("image/jpeg", JPEG_QUALITY);
  } catch {
    return null;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

async function generate(url: string): Promise<Buffer | null> {
  const data = await downloadPdf(url);
  const image = data ? await renderFirstPage(data) : null;
  await mkdir(CACHE_DIR, { recursive: true });
  if (image) await writeFile(jpgPath(url), image);
  else await writeFile(missPath(url), "");
  return image;
}

/** Cached first-page JPEG for a PDF URL, or null when the PDF cannot be fetched / rendered. */
export async function getThumbnail(url: string): Promise<Buffer | null> {
  try {
    return await readFile(jpgPath(url));
  } catch {
    // not cached
  }
  try {
    const miss = await stat(missPath(url));
    if (Date.now() - miss.mtimeMs < MISS_TTL_MS) return null;
  } catch {
    // no negative-cache entry
  }
  const pending = inFlight.get(url) ?? limiter.run(() => generate(url)).finally(() => inFlight.delete(url));
  inFlight.set(url, pending);
  return pending;
}

/** GET /api/pdf-thumb?url=...  Only URLs the featured list vouches for are rendered (not an open renderer). */
export function createThumbHandler(isAllowed: (url: string) => boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    if (!url || !isAllowed(url)) {
      res.status(404).end();
      return;
    }
    const image = await getThumbnail(url);
    if (!image) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(image);
  };
}
