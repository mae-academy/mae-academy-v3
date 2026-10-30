/**
 * Pool of strip Workers (STEPS.md §7.1 technique 4): one implicit field is cut into as many strips as there are
 * Workers, the strips run in parallel, and the results are merged (curves stitched across strip borders, shading
 * rows concatenated). A failed Worker rejects the run; the engine Worker then computes the field itself.
 */
import type { Viewport } from "@shared/mathcore/ir/types";
import type { ImplicitSource } from "@shared/mathcore/implicit/source";
import type { FieldOptions, FieldResult } from "@shared/mathcore/implicit/strips";
import { mergeStrips, planStrips } from "@shared/mathcore/implicit/strips";
import type { StripRequest, StripResponse } from "./stripProtocol";

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

export function createStripPool(size: number, createWorker: () => StripWorkerLike): StripPool {
  const workers = Array.from({ length: size }, createWorker);
  const waiting = new Map<number, { resolve: (r: FieldResult) => void; reject: (e: Error) => void }>();
  let nextId = 0;
  const failAll = (message: string) => {
    waiting.forEach((w) => w.reject(new Error(message)));
    waiting.clear();
  };
  for (const w of workers) {
    w.onmessage = (ev) => {
      const pending = waiting.get(ev.data.id);
      if (!pending) return;
      waiting.delete(ev.data.id);
      if (ev.data.ok) pending.resolve(ev.data.result);
      else pending.reject(new Error(ev.data.message));
    };
    w.onerror = () => failAll("A strip Worker stopped");
  }
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
      return Promise.all(parts).then((r) => mergeStrips(r, viewport, options));
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
