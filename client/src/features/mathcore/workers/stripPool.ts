/**
 * Pool of strip Workers (STEPS.md §7.1 technique 4): one implicit field is cut into as many strips as there are
 * Workers, the strips run in parallel, and the results are merged (curves stitched across strip borders, shading
 * rows concatenated). A failed Worker rejects the run; the engine Worker then computes the field itself.
 */
import type { Viewport } from "@shared/mathcore/ir/types";
import type { ImplicitSource } from "@shared/mathcore/implicit/source";
import type { FieldOptions, FieldResult } from "@shared/mathcore/implicit/strips";
import { mergeStrips, planStrips } from "@shared/mathcore/implicit/strips";
import { STRIP_LOAD_TIMEOUT_MS, STRIP_RESERVED_CORES, STRIP_TIMEOUT_MS, STRIP_WORKERS_MAX } from "@shared/mathcore/constants";
import type { StripRequest, StripResponse } from "./stripProtocol";

/** A strip run that took too long (the field is too heavy), as opposed to a Worker that failed. */
export class StripTimeout extends Error {
  constructor() {
    super("The field took too long to compute");
  }
}

export interface StripWorkerLike {
  postMessage(message: StripRequest): void;
  terminate(): void;
  onmessage: ((event: { data: StripResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface StripPool {
  readonly size: number;
  run(source: ImplicitSource, viewport: Viewport, options: FieldOptions): Promise<FieldResult>;
  dispose(): void;
}

export interface StripPoolOptions {
  /** Limit for a run once every Worker has answered once. */
  timeoutMs?: number;
  /** Limit for runs before that (the strip Worker chunk may still be downloading). */
  loadTimeoutMs?: number;
}

export function createStripPool(size: number, createWorker: () => StripWorkerLike, opts: StripPoolOptions = {}): StripPool {
  const timeoutMs = opts.timeoutMs ?? STRIP_TIMEOUT_MS;
  const loadTimeoutMs = opts.loadTimeoutMs ?? STRIP_LOAD_TIMEOUT_MS;
  const workers = Array.from({ length: size }, createWorker);
  /** Workers that have answered once (the pool is warm when all have: their code is loaded). */
  const answered = new Set<number>();
  const waiting = new Map<number, { resolve: (r: FieldResult) => void; reject: (e: Error) => void }>();
  let nextId = 0;
  const failAll = (message: string) => {
    waiting.forEach((w) => w.reject(new Error(message)));
    waiting.clear();
  };
  workers.forEach((w, index) => {
    w.onmessage = (ev) => {
      answered.add(index);
      const pending = waiting.get(ev.data.id);
      if (!pending) return;
      waiting.delete(ev.data.id);
      if (ev.data.ok) pending.resolve(ev.data.result);
      else pending.reject(new Error(ev.data.message));
    };
    w.onerror = () => failAll("A strip Worker stopped");
  });
  return {
    size,
    run(source, viewport, options) {
      const strips = planStrips(viewport, options.width, options.height, options.cellPx, options.stride, size);
      const parts = strips.map(
        (s, k) =>
          new Promise<FieldResult>((resolve, reject) => {
            const id = ++nextId;
            waiting.set(id, { resolve, reject });
            workers[k % size].postMessage({ id, source, viewport: s.viewport, options: { ...options, height: s.bottom - s.top } });
          }),
      );
      // A strip Worker that stalls fails the run (the engine Worker then computes the field itself).
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StripTimeout()), answered.size === size ? timeoutMs : loadTimeoutMs);
      });
      return Promise.race([Promise.all(parts), limit])
        .then((r) => mergeStrips(r, viewport, options))
        .finally(() => clearTimeout(timer));
    },
    dispose() {
      failAll("The strip pool was closed");
      for (const w of workers) {
        w.onmessage = null;
        w.onerror = null;
        w.terminate();
      }
    },
  };
}

/**
 * Number of strip Workers for a machine with `cores` logical cores: one fewer than the cores (one stays for the page and
 * the engine Worker), up to STRIP_WORKERS_MAX; on two cores both are used, because while a field is computed the page
 * and the engine Worker only wait for it (measured on two real cores, see the follow-up report of 2026-10-31, second round);
 * none below two strips' worth of parallelism.
 */
export function stripWorkerCount(cores: number): number {
  const c = Math.floor(cores);
  if (!(c >= 2)) return 0;
  const n = c === 2 ? 2 : c - STRIP_RESERVED_CORES;
  return Math.min(STRIP_WORKERS_MAX, n);
}
