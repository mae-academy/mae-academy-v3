import type { ContinuousConvolutionResult, ConvolutionPoint } from "@shared/signals/results";
import { evaluateSignal, type SignalNode } from "@shared/signals/signalEngine";
import type { ConvolutionFrameWire } from "@/services/signalsClient";

/**
 * Playback frames of y(t) come from the serverless convolution engine as one sweep over the visible window.
 * Between two sweep samples the output is linearly interpolated, so scrubbing and animation stay at frame
 * rate with no request per frame; the integrand shown under the cursor is pointwise x(τ)·h(t−τ) of the
 * user's own expressions (plotting, not integration).
 */
export function frameFromSweep(frames: readonly ConvolutionFrameWire[] | null, x: SignalNode, h: SignalNode, t: number, tauRange: { from: number; to: number }, integrandSamples = 480): ContinuousConvolutionResult {
  if (!frames || frames.length === 0) return { t, value: 0, overlap: tauRange, points: [], usedDeltaShortcut: false, overlapLatex: "" };
  const first = frames[0]; const last = frames[frames.length - 1];
  const clamped = Math.min(last.t, Math.max(first.t, t));
  const position = last.t === first.t ? 0 : ((clamped - first.t) / (last.t - first.t)) * (frames.length - 1);
  const lower = Math.min(frames.length - 2, Math.max(0, Math.floor(position)));
  const a = frames[lower]; const b = frames[Math.min(frames.length - 1, lower + 1)];
  const fraction = b.t === a.t ? 0 : (clamped - a.t) / (b.t - a.t);
  const nearest = fraction < 0.5 ? a : b;
  const value = a.value + (b.value - a.value) * fraction;
  const overlap = nearest.overlap;
  const points: ConvolutionPoint[] = [];
  if (!nearest.usedDeltaShortcut && Number.isFinite(overlap.from) && Number.isFinite(overlap.to) && overlap.to >= overlap.from) {
    for (let index = 0; index <= integrandSamples; index += 1) {
      const tau = overlap.from + ((overlap.to - overlap.from) * index) / integrandSamples;
      const xValue = evaluateSignal(x, tau); const shiftedH = evaluateSignal(h, t - tau);
      points.push({ tau, x: xValue, shiftedH, product: Number.isFinite(xValue) && Number.isFinite(shiftedH) ? xValue * shiftedH : 0 });
    }
  }
  return { t, value, overlap, points, usedDeltaShortcut: nearest.usedDeltaShortcut, overlapLatex: nearest.overlapLatex };
}
