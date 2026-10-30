/**
 * Parse client (STEPS.md §9): parses LaTeX strings one at a time in the parse Worker, caches results by string, and
 * replaces the Worker when one expression takes longer than 200 ms (the parse is synchronous inside the Worker and
 * cannot be interrupted). The first request of a fresh Worker also downloads Compute Engine, so it gets a longer limit.
 *
 * Only answers that depend on the LaTeX alone are cached: a parse, a syntax error, and a timeout that happened twice
 * on a running parser. A crash, an unavailable parser (offline) or a timeout while the parser was starting is
 * returned for this round only, so the line is parsed again next time.
 */
import { PARSE_CACHE_LIMIT, PARSE_LOAD_TIMEOUT_MS, PARSE_TIMEOUT_MS, PARSE_TIMEOUTS_BEFORE_CACHE } from "@shared/mathcore/constants";
import type { ParsedEntry, ParseRequest, ParseResponse } from "./parseProtocol";

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
  /** Answers for this round that are not cached (transient failures). */
  const transient = new Map<string, ParsedEntry>();
  /** Timeouts seen per string on a running parser. */
  const timeouts = new Map<string, number>();
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
    if (cache.size >= PARSE_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(latex, entry);
    transient.delete(latex);
  };
  const once = (latex: string, entry: ParsedEntry) => transient.set(latex, entry);

  const parseOne = (latex: string): Promise<void> =>
    new Promise<void>((resolve) => {
      if (cache.has(latex)) return resolve();
      worker ??= config.createWorker();
      const w = worker;
      const id = ++seq;
      const limit = warm ? timeoutMs : loadTimeoutMs;
      const wasWarm = warm;
      const timer = setTimeout(() => {
        drop();
        if (!wasWarm) once(latex, { ok: false, message: "The math parser did not start in time" });
        else {
          const n = (timeouts.get(latex) ?? 0) + 1;
          timeouts.set(latex, n);
          const entry: ParsedEntry = { ok: false, message: `Parsing took longer than ${timeoutMs} ms` };
          if (n >= PARSE_TIMEOUTS_BEFORE_CACHE) remember(latex, entry);
          else once(latex, entry);
        }
        resolve();
      }, limit);
      w.onmessage = (ev) => {
        if (ev.data.seq !== id) return;
        clearTimeout(timer);
        const d = ev.data;
        if (!d.ok && d.unavailable) {
          // Compute Engine did not load: the Worker is not ready, and the answer says nothing about this LaTeX.
          once(latex, { ok: false, message: d.message });
        } else {
          warm = true;
          remember(latex, d.ok ? { ok: true, raw: d.raw } : { ok: false, message: d.message });
        }
        resolve();
      };
      w.onerror = () => {
        clearTimeout(timer);
        drop();
        once(latex, { ok: false, message: "The math parser stopped unexpectedly" });
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
          const e = cache.get(l) ?? transient.get(l);
          if (e) out[l] = e;
          transient.delete(l);
        }
        return out;
      });
    },
    dispose() {
      drop();
    },
  };
}
