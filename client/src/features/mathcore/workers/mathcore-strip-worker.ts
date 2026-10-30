/// <reference lib="webworker" />
/**
 * Strip Worker (STEPS.md §7.1 technique 4): computes the curve and shading of one horizontal strip of an implicit
 * field. Started by the engine Worker; holds only the compiler and the field code.
 */
import { bindImplicit } from "@shared/mathcore/implicit/source";
import { implicitField } from "@shared/mathcore/implicit/strips";
import type { StripRequest, StripResponse } from "./stripProtocol";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<StripRequest>) => {
  const { id, source, viewport, options } = ev.data;
  try {
    const result = implicitField(bindImplicit(source), viewport, options);
    const transfer: Transferable[] = result.polylines.map((p) => p.buffer);
    if (result.mask) transfer.push(result.mask.data.buffer);
    self.postMessage({ id, ok: true, result } satisfies StripResponse, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) } satisfies StripResponse);
  }
};
