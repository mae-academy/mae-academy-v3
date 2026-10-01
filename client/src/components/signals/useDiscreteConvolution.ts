import { useMemo } from "react";
import type { DiscreteConvolution } from "@shared/signals/results";
import { discreteConvolutionRemote } from "@/services/signalsClient";
import { useRemoteQuery } from "@/lib/useRemoteQuery";

/**
 * y[n] = Σ x[k]h[n−k] and its per-n contribution matrix, computed by the serverless engine. Until the first
 * answer arrives (and for sequences the engine rejects) a zero-filled result of the right length keeps the
 * scope laid out; the arithmetic itself never runs in the browser.
 */
export function useDiscreteConvolution(x: number[], h: number[]): DiscreteConvolution {
  const { data, error } = useRemoteQuery(`${x.join(",")}|${h.join(",")}`, (signal) => discreteConvolutionRemote(x, h, signal), { debounceMs: 30 });
  const length = Math.max(1, x.length + h.length - 1);
  return useMemo(() => (data && !error && data.values.length === length ? data : { values: Array<number>(length).fill(0), contributions: Array.from({ length }, () => []) }), [data, error, length]);
}
