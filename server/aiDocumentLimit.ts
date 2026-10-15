/** Per-IP cap on requests that carry document bytes (a PDF analysis is by far the heaviest chat call). Pure and in-memory. */
export const DOCUMENT_REQUESTS_PER_WINDOW = 3;
export const DOCUMENT_WINDOW_MS = 60_000;

export interface DocumentLimiter {
  /** Records a document request for `key` and returns ok, or the time to wait when the cap is reached (nothing recorded). */
  tryAcquire(key: string): { ok: true } | { ok: false; retryAfterMs: number };
}

export function createDocumentLimiter(max = DOCUMENT_REQUESTS_PER_WINDOW, windowMs = DOCUMENT_WINDOW_MS, now: () => number = Date.now): DocumentLimiter {
  const hits = new Map<string, number[]>();
  return {
    tryAcquire(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: Math.max(1, recent[0] + windowMs - t) };
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5_000) hits.forEach((list, k) => list[list.length - 1] <= t - windowMs && hits.delete(k));
      return { ok: true };
    },
  };
}
