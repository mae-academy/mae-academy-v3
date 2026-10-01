/** Shared auto-scaling primitives for every plotting scope (nice bounds, nice ticks, support detection). */

const NICE_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/** Smallest "human" value (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k) that is >= value. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const mantissa = value / power;
  const nice = NICE_MANTISSAS.find((m) => m >= mantissa - 1e-9) ?? 10;
  return Number((nice * power).toPrecision(12));
}

/** Symmetric zero-centred bound with headroom: peaks never touch the frame. Flat/zero data → 1. */
export function symmetricYBound(peak: number, headroom = 1.2): number {
  if (!Number.isFinite(peak) || peak < 1e-12) return 1;
  return niceCeil(peak * headroom);
}

/** Clean tick values (steps of 1, 2, 5 × 10^k) covering [min, max]. */
export function niceTicks(min: number, max: number, maxTicks = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [0];
  const rough = span / Math.max(1, maxTicks);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / power;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * power;
  const ticks: number[] = [];
  for (let v = Math.ceil((min - 1e-9) / step) * step; v <= max + step * 1e-3; v += step) {
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : Number(v.toFixed(10)));
  }
  return ticks;
}

export interface Support { lo: number; hi: number; unbounded: boolean }

/** Numerically locates where |f| is non-negligible on [-radius, radius]; ends that reach the search edge are flagged unbounded. */
export function estimateSupport(fn: (t: number) => number, radius = 24, step = 0.05, tolerance = 1e-6): Support {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = -radius; t <= radius + 1e-9; t += step) {
    const v = fn(t);
    if (Number.isFinite(v) && Math.abs(v) > tolerance) {
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  if (lo === Infinity) return { lo: -1, hi: 1, unbounded: false };
  return { lo, hi, unbounded: lo <= -radius + 0.1 || hi >= radius - 0.1 };
}

/**
 * Symmetric convolution interaction window [-R, R]: covers x, h and y = x*h supports with 10% margin.
 * Unbounded (u(t), sinusoids…) ends contribute a fixed reference span so the view stays readable.
 */
export function convolutionWindow(
  xFn: (t: number) => number,
  hFn: (t: number) => number,
  { minRadius = 2, maxRadius = 20, unboundedSpan = 5 }: { minRadius?: number; maxRadius?: number; unboundedSpan?: number } = {},
): { from: number; to: number } {
  const sx = estimateSupport(xFn);
  const sh = estimateSupport(hFn);
  const cap = (s: Support) => ({ lo: s.unbounded && s.lo <= -23.9 ? -unboundedSpan : s.lo, hi: s.unbounded && s.hi >= 23.9 ? unboundedSpan : s.hi });
  const a = cap(sx);
  const b = cap(sh);
  const reach = Math.max(
    Math.abs(a.lo), Math.abs(a.hi), Math.abs(b.lo), Math.abs(b.hi),
    Math.abs(a.lo + b.lo), Math.abs(a.hi + b.hi),
  );
  const radius = Math.min(maxRadius, Math.max(minRadius, niceCeil(reach * 1.1)));
  return { from: -radius, to: radius };
}
