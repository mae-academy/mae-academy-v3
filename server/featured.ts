import type { Request, Response } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOpenAlexUrl, parseWork } from "../client/src/lib/openalex";
import { getThumbnail } from "./pdfThumb";

/** A default-view paper whose first-page thumbnail was rendered successfully by this server. */
export interface FeaturedItem {
  id: string;
  pdfUrl: string;
}

interface FeaturedFile {
  builtAt: number;
  items: FeaturedItem[];
}

const TARGET_COUNT = 100;
const CANDIDATE_PAGE_SIZE = 100;
const MAX_CANDIDATE_PAGES = 10;
const BATCH_SIZE = 24;
const TTL_MS = 24 * 60 * 60 * 1000;
const FILE_PATH = path.resolve(process.env.PDF_CACHE_DIR ?? ".cache", "featured.json");

type RawWork = Parameters<typeof parseWork>[0];

let current: FeaturedFile | null = null;
let allowedUrls = new Set<string>();
let building: Promise<void> | null = null;

const setCurrent = (file: FeaturedFile): void => {
  current = file;
  allowedUrls = new Set(file.items.map((item) => item.pdfUrl));
};

/** Urls the thumbnail endpoint is allowed to render. */
export const isFeaturedUrl = (url: string): boolean => allowedUrls.has(url);

async function fetchCandidates(page: number): Promise<RawWork[]> {
  const url = new URL(buildOpenAlexUrl({ page, perPage: CANDIDATE_PAGE_SIZE }));
  const key = process.env.VITE_OPENALEX_API_KEY;
  if (key) url.searchParams.set("api_key", key);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAlex candidate fetch failed (${res.status})`);
  return ((await res.json()) as { results?: RawWork[] }).results ?? [];
}

/**
 * Walks the default (unfiltered) ranking in order and keeps the first TARGET_COUNT papers whose thumbnail
 * actually renders, so the list is top-cited AND guaranteed to have an image.
 */
async function build(): Promise<FeaturedFile> {
  const items: FeaturedItem[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_CANDIDATE_PAGES && items.length < TARGET_COUNT; page++) {
    const candidates = (await fetchCandidates(page))
      .map(parseWork)
      .filter((p) => p.pdfUrl && p.pdfTier >= 2 && !seen.has(p.id)); // tier 1 = hosts known to block servers
    for (let i = 0; i < candidates.length && items.length < TARGET_COUNT; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const thumbs = await Promise.all(batch.map((p) => getThumbnail(p.pdfUrl as string)));
      batch.forEach((paper, index) => {
        seen.add(paper.id);
        if (thumbs[index] && items.length < TARGET_COUNT) items.push({ id: paper.id, pdfUrl: paper.pdfUrl as string });
      });
      console.log(`[featured] ${items.length}/${TARGET_COUNT} verified (page ${page})`);
    }
  }
  return { builtAt: Date.now(), items };
}

async function rebuild(): Promise<void> {
  try {
    const file = await build();
    if (file.items.length === 0) return;
    await mkdir(path.dirname(FILE_PATH), { recursive: true });
    await writeFile(FILE_PATH, JSON.stringify(file));
    setCurrent(file);
    console.log(`[featured] ready: ${file.items.length} papers with verified thumbnails`);
  } catch (error) {
    console.error("[featured] build failed:", error);
  } finally {
    building = null;
  }
}

/** Loads the persisted list (serving it even when stale) and rebuilds in the background when it is missing or old. */
export async function warmFeatured(): Promise<void> {
  try {
    const file = JSON.parse(await readFile(FILE_PATH, "utf8")) as FeaturedFile;
    if (Array.isArray(file.items) && file.items.length > 0) setCurrent(file);
  } catch {
    // no persisted list yet
  }
  if (!current || Date.now() - current.builtAt > TTL_MS) building ??= rebuild();
}

/** GET /api/research/featured -> { ready, items }. While the first build runs, `ready` is false and the client falls back. */
export function featuredHandler(_req: Request, res: Response): void {
  res.json({ ready: current !== null && current.items.length > 0, items: current?.items ?? [] });
}
