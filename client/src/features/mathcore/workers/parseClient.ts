/**
 * Parse client (STEPS.md §9): parses LaTeX strings one at a time in the parse Worker, caches results by string, and
 * replaces the Worker when one expression takes longer than 200 ms (the parse is synchronous inside the Worker and
 * cannot be interrupted). The first request of a fresh Worker also downloads Compute Engine, so it gets a longer limit.
 */
import { PARSE_TIMEOUT_MS } from "@shared/mathcore/constants";
import type { ParsedEntry, ParseRequest, ParseResponse } from "./parseProtocol";

/** First request of a fresh Worker: Compute Engine download and start-up. */
export const PARSE_LOAD_TIMEOUT_MS = 30_000;
/** Cached strings kept (the oldest are dropped first). */
const CACHE_LIMIT = 2000;

export interface ParseWorkerLike {
  postMessage(message: ParseRequest): void;
  terminate(): void;
  onmessage: ((event: { data: ParseResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface ParseClient {
  /** Parses every string not yet cached; resolves with the entries for exactly these strings. */
  parseAll(latex: readonly string[]): Promise<Record<string, ParsedEntry>>;
  dispose(): void;
}

export interface ParseClientConfig {
  createWorker: () => ParseWorkerLike;
  timeoutMs?: number;
  loadTimeoutMs?: number;
}

export function createParseClient(config: ParseClientConfig): ParseClient {
  const timeoutMs = config.timeoutMs ?? PARSE_TIMEOUT_MS;
  const loadTimeoutMs = config.loadTimeoutMs ?? PARSE_LOAD_TIMEOUT_MS;
  const cache = new Map<string, ParsedEntry>();
  let worker: ParseWorkerLike | null = null;
  let warm = false;
  let seq = 0;
  /** Requests run strictly one after another (one string in flight). */
  let chain: Promise<void> = Promise.resolve();

  const drop = () => {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    worker = null;
    warm = false;
  };

  const remember = (latex: string, entry: ParsedEntry) => {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(latex, entry);
  };

  const parseOne = (latex: string): Promise<void> =>
    new Promise<void>((resolve) => {
      if (cache.has(latex)) return resolve();
      worker ??= config.createWorker();
      const w = worker;
      const id = ++seq;
      const limit = warm ? timeoutMs : loadTimeoutMs;
      const timer = setTimeout(() => {
        drop();
        remember(latex, {
          ok: false,
          message: limit === timeoutMs ? `Parsing took longer than ${timeoutMs} ms` : "The math parser did not start in time",
        });
        resolve();
      }, limit);
      w.onmessage = (ev) => {
        if (ev.data.seq !== id) return;
        clearTimeout(timer);
        warm = true;
        remember(latex, ev.data.ok ? { ok: true, raw: ev.data.raw } : { ok: false, message: ev.data.message });
        resolve();
      };
      w.onerror = () => {
        clearTimeout(timer);
        drop();
        remember(latex, { ok: false, message: "The math parser stopped unexpectedly" });
        resolve();
      };
      w.postMessage({ seq: id, latex });
    });

  return {
    parseAll(latex) {
      const unique = Array.from(new Set(latex));
      for (const l of unique) chain = chain.then(() => parseOne(l));
      return chain.then(() => {
        const out: Record<string, ParsedEntry> = {};
        for (const l of unique) {
          const e = cache.get(l);
          if (e) out[l] = e;
        }
        return out;
      });
    },
    dispose() {
      drop();
    },
  };
}
