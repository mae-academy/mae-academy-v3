/**
 * Fourier waterfall scene model (pure, framework-free): decomposes a series into per-harmonic
 * cosines y_k(t) = A_k cos(kω₀t + φ_k), assigns depth lanes per spectrum mode, and evaluates the
 * staggered synthesize/decompose weights. Rendering lives in FourierWaterfall3D.tsx.
 */
import type { FourierSeriesResult } from "@/features/signals/engines/fourierEngine";
import { niceCeil } from "@/lib/plotAutoScale";
import { HARMONIC_SPECTRUM, spectrumHex } from "@/lib/spectralPalette";

export type SpectrumMode = "positive" | "bilateral";

/** Depth tracks follow the shared N (1…50) of the Analysis Settings. */
export const WATERFALL_MAX_HARMONICS = 50;
/** The spectral colour ramp is anchored at |k| = 50; reaching the terminal crimson at k = 50. */
export const COLOR_RAMP_MAX = 50;
/** Minimum samples over the observation window (grows with N · periods-in-window). */
export const WATERFALL_SAMPLES = 481;
const SAMPLES_PER_CYCLE = 32;
const MAX_SAMPLES = 6401;
/** World extents: time → x ∈ [−1, 1], amplitude → y ∈ [−1, 1], depth lanes → z ∈ [−DEPTH/2, DEPTH/2]. */
export const WATERFALL_DEPTH = 2.4;

export interface WaterfallHarmonic {
  /** Signed harmonic index. */
  k: number;
  /** A_k ≥ 0 (one-sided 2|c_k| for k ≥ 1 in positive mode, |c_k| otherwise). */
  amplitude: number;
  /** φ_k (rad). */
  phase: number;
  /** kω₀ (rad/s). */
  omega: number;
  /** Depth lane (1 = nearest the synthesis plane, which is lane 0). */
  lane: number;
  color: string;
  /** y_k(t) sampled on the shared time grid (physical units). */
  values: Float32Array;
}

export interface WaterfallScene {
  mode: SpectrumMode;
  harmonics: WaterfallHarmonic[];
  /** Σ y_k(t) over the displayed harmonics (x_N(t) for positive/bilateral). */
  composite: Float32Array;
  /** Shared time grid t_i (s) spanning the observation window. */
  time: Float32Array;
  window: { start: number; end: number };
  period: number;
  omega0: number;
  /** Symmetric amplitude bound (clean value ≥ every |y|). */
  amplitudeBound: number;
  laneCount: number;
}

const HEX = { slate: "#64748B" } as const;


/** Persistent spectral identity by |k| on the platform ramp: k = 1 royal blue → cyan → emerald → amber → orange → crimson at k ≥ 25; DC slate. */
export function harmonicColor(k: number): string {
  const n = Math.abs(k);
  if (n === 0) return HEX.slate;
  return spectrumHex(HARMONIC_SPECTRUM, (Math.min(n, COLOR_RAMP_MAX) - 1) / (COLOR_RAMP_MAX - 1));
}

/** Harmonic indices in lane order (front → back) for each spectrum mode. */
export function laneOrder(mode: SpectrumMode, n: number): number[] {
  const count = Math.max(0, Math.floor(n));
  if (mode === "positive") return Array.from({ length: count + 1 }, (_, i) => i);
  // Bilateral: negative zone in front, DC in the middle lane, positive zone behind.
  return Array.from({ length: 2 * count + 1 }, (_, i) => i - count);
}

/** z of a depth lane: lane 0 (synthesis plane) at the front, the last lane at the back. */
export function laneDepth(lane: number, laneCount: number): number {
  const spacing = WATERFALL_DEPTH / Math.max(1, laneCount - 1);
  return WATERFALL_DEPTH / 2 - lane * spacing;
}

export interface WaterfallSceneOptions {
  /** Observation window [t_start, t_end] (s); defaults to one period [−T₀/2, T₀/2]. */
  window?: { start: number; end: number };
  /** Fixed sample count; defaults to ≥ 32 samples per cycle of the highest displayed harmonic. */
  samples?: number;
}

export function buildWaterfallScene(series: FourierSeriesResult, n: number, mode: SpectrumMode, options: WaterfallSceneOptions = {}): WaterfallScene {
  const available = Math.max(0, ...series.coefficients.map((c) => Math.abs(c.harmonic)));
  const count = Math.max(1, Math.min(WATERFALL_MAX_HARMONICS, Math.floor(n), available));
  const byIndex = new Map(series.coefficients.map((c) => [c.harmonic, c] as const));
  const window = options.window ?? { start: -series.period / 2, end: series.period / 2 };
  const span = window.end - window.start;
  const samples = options.samples ?? Math.min(MAX_SAMPLES, Math.max(WATERFALL_SAMPLES, Math.ceil((SAMPLES_PER_CYCLE * count * span) / series.period) + 1));
  const time = new Float32Array(samples);
  for (let i = 0; i < samples; i++) time[i] = window.start + (span * i) / (samples - 1);

  const order = laneOrder(mode, count);
  const laneCount = order.length + 1;
  const composite = new Float32Array(samples);
  const harmonics: WaterfallHarmonic[] = [];
  order.forEach((k, index) => {
    const c = byIndex.get(k);
    if (!c) return;
    // Positive mode folds c_{−k} onto c_k: 2|c_k| cos(kω₀t + ∠c_k) is the physical real harmonic.
    const folded = mode === "positive" && k > 0;
    const amplitude = (folded ? 2 : 1) * c.magnitude;
    const phase = c.magnitude < 1e-12 ? 0 : Math.atan2(c.imaginary, c.real);
    const omega = k * series.omega0;
    const values = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const v = amplitude * Math.cos(omega * time[i] + phase);
      values[i] = v;
      composite[i] += v;
    }
    harmonics.push({ k, amplitude, phase, omega, lane: index + 1, color: harmonicColor(k), values });
  });

  let peak = 0;
  for (const h of harmonics) peak = Math.max(peak, h.amplitude);
  for (let i = 0; i < samples; i++) peak = Math.max(peak, Math.abs(composite[i]));
  return { mode, harmonics, composite, time, window, period: series.period, omega0: series.omega0, amplitudeBound: niceCeil(peak || 1), laneCount };
}

/** Fraction of the global synthesis timeline α each harmonic spends travelling. */
const TRAVEL = 0.42;

/** Staggered progress of the `order`-th harmonic (0 = first to leave) for global α ∈ [0, 1]. */
export function harmonicProgress(alpha: number, order: number, count: number): number {
  if (alpha >= 1) return 1;
  if (count <= 1) return Math.max(0, Math.min(1, alpha));
  const start = (order / (count - 1)) * (1 - TRAVEL);
  return Math.max(0, Math.min(1, (alpha - start) / TRAVEL));
}

/** Weight with which a travelling harmonic has merged into the composite (last 30% of its trip). */
export function mergeWeight(progress: number): number {
  const t = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
  return t * t * (3 - 2 * t);
}

export function synthesisDuration(count: number): number {
  return Math.min(3200, 900 + 90 * count);
}
