import { MAX_SCHEMATIC_PROMPT_CHARS } from "@shared/aiTypes";

/**
 * Client side of text-to-image schematics: the server route first, a public image host when that fails.
 * Results are cached per prompt for the page's lifetime so re-renders, thread switches and remounts never
 * spend another request; only the prompt is persisted with the chat, never the image.
 */

export type SchematicSource =
  /** Bytes from our own `/api/ai/schematic` route (Gemini). */
  | { kind: "server"; blob: Blob }
  /** A direct image URL from the fallback host; the browser loads it, so it may be cross-origin. */
  | { kind: "fallback"; url: string };

const FALLBACK_STYLE = "black and white textbook electrical schematic, white background, IEC 60617 symbols, clean orthogonal wiring, labeled nodes, thin line art, no shading, no photo: ";

/** Prompt text is untrusted model output: it only ever goes into a JSON body or `encodeURIComponent`. */
export function clampPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, MAX_SCHEMATIC_PROMPT_CHARS);
}

export function fallbackImageUrl(prompt: string, seed?: number): string {
  const styled = `${FALLBACK_STYLE}${clampPrompt(prompt)}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(styled)}?width=1024&height=640&nologo=true&model=flux${seed === undefined ? "" : `&seed=${seed}`}`;
}

const cache = new Map<string, SchematicSource>();
const inflight = new Map<string, Promise<SchematicSource>>();

export function cachedSchematic(prompt: string): SchematicSource | undefined {
  return cache.get(clampPrompt(prompt));
}

/** Test hook: forget everything. */
export function resetSchematicCache(): void {
  cache.clear();
  inflight.clear();
}

async function fetchFromServer(prompt: string): Promise<SchematicSource> {
  const response = await fetch("/api/ai/schematic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw new Error(`schematic route ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") || blob.size === 0) throw new Error("schematic route returned no image");
  return { kind: "server", blob };
}

/**
 * Resolves the image source for a prompt: cached result, the join of an identical request already running, or a new
 * request to the server route that falls back to the image host on any failure. `fresh` skips the cache (Regenerate)
 * and varies the fallback seed so the host does not hand back the same picture.
 */
export function loadSchematic(rawPrompt: string, options: { fresh?: boolean } = {}): Promise<SchematicSource> {
  const prompt = clampPrompt(rawPrompt);
  if (options.fresh) {
    cache.delete(prompt);
    inflight.delete(prompt);
  } else {
    const hit = cache.get(prompt);
    if (hit) return Promise.resolve(hit);
    const running = inflight.get(prompt);
    if (running) return running;
  }
  const seed = options.fresh ? Math.floor(Math.random() * 1_000_000) : undefined;
  const request = fetchFromServer(prompt)
    .catch((): SchematicSource => ({ kind: "fallback", url: fallbackImageUrl(prompt, seed) }))
    .then((source) => {
      if (inflight.get(prompt) === request) {
        cache.set(prompt, source);
        inflight.delete(prompt);
      }
      return source;
    });
  inflight.set(prompt, request);
  return request;
}

/** Records that a fallback URL failed to load so the next visit does not reuse it. */
export function forgetSchematic(rawPrompt: string): void {
  cache.delete(clampPrompt(rawPrompt));
}

// Replies created during this page session may generate their image on their own; restored ones wait for a click.
const sessionMessages = new Set<string>();
export function markSessionMessage(id: string): void {
  sessionMessages.add(id);
}
export function isSessionMessage(id: string): boolean {
  return sessionMessages.has(id);
}
