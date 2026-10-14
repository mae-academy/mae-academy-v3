import { MAX_IMAGE_PROMPT_CHARS } from "@shared/aiTypes";

/**
 * Client side of AI illustrations: only our own `/api/ai/generate-image` route is ever called (no other host).
 * Successful blobs are cached per prompt for the page's lifetime and identical in-flight requests are shared, so
 * re-renders, thread switches and remounts never spend another request. Only the prompt is persisted with the chat.
 */

export class IllustrationError extends Error {
  /** HTTP status of the route, or 0 for a network failure / unreadable response. */
  readonly status: number;
  constructor(status: number) {
    super(`illustration route ${status}`);
    this.name = "IllustrationError";
    this.status = status;
  }
}

/** Prompt text is untrusted model output: it only ever goes into a JSON body. */
export function clampImagePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, MAX_IMAGE_PROMPT_CHARS);
}

const cache = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();

export function cachedIllustration(prompt: string): Blob | undefined {
  return cache.get(clampImagePrompt(prompt));
}

/** Test hook: forget everything. */
export function resetIllustrationCache(): void {
  cache.clear();
  inflight.clear();
}

async function fetchIllustration(prompt: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    throw new IllustrationError(0);
  }
  if (!response.ok) throw new IllustrationError(response.status);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") || blob.size === 0) throw new IllustrationError(0);
  return blob;
}

/**
 * Resolves the image for a prompt: the cached result, the join of an identical request already running, or a new
 * request. `fresh` skips the cache (Regenerate). Rejects with `IllustrationError`; failures are never cached.
 */
export function loadIllustration(rawPrompt: string, options: { fresh?: boolean } = {}): Promise<Blob> {
  const prompt = clampImagePrompt(rawPrompt);
  if (options.fresh) {
    cache.delete(prompt);
    inflight.delete(prompt);
  } else {
    const hit = cache.get(prompt);
    if (hit) return Promise.resolve(hit);
    const running = inflight.get(prompt);
    if (running) return running;
  }
  const request = fetchIllustration(prompt).then(
    (blob) => {
      if (inflight.get(prompt) === request) {
        cache.set(prompt, blob);
        inflight.delete(prompt);
      }
      return blob;
    },
    (error) => {
      if (inflight.get(prompt) === request) inflight.delete(prompt);
      throw error;
    },
  );
  inflight.set(prompt, request);
  return request;
}
