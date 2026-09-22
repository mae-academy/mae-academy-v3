import {
  executeRemoteC,
  executeRemoteCpp,
  type ExecutionResult as RemoteResult,
} from "@/features/execution-engine/remoteCppEngine";

export type RemoteLanguage = "c" | "cpp";

const MAX_ENTRIES = 64;

interface CacheEntry {
  source: string;
  stdin: string;
  result: RemoteResult;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RemoteResult>>();

/** cyrb53: fast 53-bit string hash. */
export function hashCode(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const ch = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const makeCacheKey = (language: RemoteLanguage, code: string, stdin: string) =>
  `${language}:${hashCode(code + stdin)}`;

/** LRU read: a hit is re-inserted so it becomes the most recently used entry. */
export function peekCachedRun(
  language: RemoteLanguage,
  code: string,
  stdin = ""
): RemoteResult | null {
  const key = makeCacheKey(language, code, stdin);
  const entry = cache.get(key);
  // The stored source guards against the (astronomically unlikely) hash collision.
  if (!entry || entry.source !== code || entry.stdin !== stdin) return null;
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

/** Cached remote run; concurrent identical requests (e.g. pre-warm then Run) share one fetch. */
export function runRemoteCached(
  language: RemoteLanguage,
  code: string,
  stdin = ""
): Promise<RemoteResult> {
  const hit = peekCachedRun(language, code, stdin);
  if (hit) return Promise.resolve(hit);

  const key = makeCacheKey(language, code, stdin);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const executor = language === "cpp" ? executeRemoteCpp : executeRemoteC;
  const request = executor(code, stdin)
    .then(result => {
      // Transport failures are transient; only real compile/run outcomes are cached.
      if (!result.error) {
        cache.set(key, { source: code, stdin, result });
        if (cache.size > MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      }
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Fire-and-forget background compile so a later Run is served from memory. */
export function prewarmRemote(language: string, code: string): void {
  if (language !== "c" && language !== "cpp") return;
  if (!code.trim() || peekCachedRun(language, code)) return;
  void runRemoteCached(language, code).catch(() => undefined);
}

export function clearExecutionCache(): void {
  cache.clear();
  inFlight.clear();
}
