/**
 * Adaptive curve sampling (STEPS.md §6.1 Explicit/Polar/Parametric, §9 edge cases).
 *
 * - Undefined domain: the curve is cut at NaN and ±Infinity.
 * - A jump between neighbouring samples (more than a few pixels after refinement) is bisected before it is treated
 *   as an asymptote: if at least half of it survives narrowing to a tiny interval it is a discontinuity and the
 *   curve is cut; otherwise it is a steep but continuous part and the points are kept.
 * - Refinement stops at a tolerance in world units, so a caller passes the size of one pixel.
 */
import { PRECISION_WARNING_MAGNITUDE } from "../constants";

/** One connected piece of a curve: interleaved x0, y0, x1, y1, … */
export type Polyline = Float64Array;

export interface SampleResult {
  segments: Polyline[];
  /** Number of function evaluations (STEPS.md §7.1: cost is the number of evaluations). */
  evaluations: number;
  /** STEPS.md §9: some |coordinate| exceeded 10⁸, where float64 loses precision. */
  precisionWarning: boolean;
}

export interface ExplicitOptions {
  /** World-space tolerance for the midpoint test, normally one pixel in y. */
  tolerance: number;
  /** Visible y-range height (context for callers; jump detection itself works in pixels, see JUMP_PIXELS). */
  yRange: number;
  /** Initial uniform intervals (default 200). */
  initial?: number;
  /** Maximum points per curve (default 4000, the 2000-sample budget with refinement headroom). */
  maxPoints?: number;
  /** Maximum bisection depth per initial interval (default 8). */
  maxDepth?: number;
}

const DEFAULT_INITIAL = 200;
const DEFAULT_MAX_POINTS = 4000;
const DEFAULT_MAX_DEPTH = 8;
/** Bisection steps used to decide whether a jump is a discontinuity. */
const JUMP_BISECTIONS = 40;
/** Neighbouring samples further apart than this many pixels (after refinement) are checked as a possible jump. */
const JUMP_PIXELS = 8;

const finite = Number.isFinite;

/**
 * Samples y = f(x) on [xmin, xmax]. The same routine samples x = g(y) with the roles swapped by the caller.
 */
export function sampleExplicit(f: (x: number) => number, xmin: number, xmax: number, opts: ExplicitOptions): SampleResult {
  const initial = opts.initial ?? DEFAULT_INITIAL;
  const maxPoints = opts.maxPoints ?? DEFAULT_MAX_POINTS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  let evaluations = 0;
  const ev = (x: number) => {
    evaluations++;
    return f(x);
  };
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };

  const refine = (a: number, fa: number, b: number, fb: number, depth: number) => {
    if (depth >= maxDepth || xs.length >= maxPoints) return;
    const m = (a + b) / 2;
    const fm = ev(m);
    const needs =
      finite(fa) !== finite(fb) ||
      finite(fa) !== finite(fm) ||
      (finite(fa) && finite(fb) && finite(fm) && Math.abs(fm - (fa + fb) / 2) > opts.tolerance);
    if (needs) {
      refine(a, fa, m, fm, depth + 1);
      push(m, fm);
      refine(m, fm, b, fb, depth + 1);
    } else {
      push(m, fm);
    }
  };

  const h = (xmax - xmin) / initial;
  let prevX = xmin;
  let prevY = ev(xmin);
  push(prevX, prevY);
  for (let i = 1; i <= initial; i++) {
    const x = i === initial ? xmax : xmin + i * h;
    const y = ev(x);
    refine(prevX, prevY, x, y, 0);
    push(x, y);
    prevX = x;
    prevY = y;
  }

  // Split into segments at non-finite values and at confirmed discontinuities.
  const segments: Polyline[] = [];
  let cur: number[] = [];
  let precisionWarning = false;
  const flush = () => {
    if (cur.length >= 4) segments.push(Float64Array.from(cur));
    else if (cur.length === 2) segments.push(Float64Array.from(cur));
    cur = [];
  };
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!finite(y)) {
      flush();
      continue;
    }
    if (Math.abs(x) > PRECISION_WARNING_MAGNITUDE || Math.abs(y) > PRECISION_WARNING_MAGNITUDE) precisionWarning = true;
    if (cur.length >= 2) {
      const px = cur[cur.length - 2];
      const py = cur[cur.length - 1];
      if (Math.abs(y - py) > JUMP_PIXELS * opts.tolerance && isDiscontinuity(ev, px, py, x, y)) flush();
    }
    cur.push(x, y);
  }
  flush();
  return { segments, evaluations, precisionWarning };
}

/**
 * Bisects [a, b] toward the jump. A continuous steep function's jump shrinks with the interval; a pole or a step
 * keeps at least half of its size down to an interval of about 1e-12 of the original width.
 */
export function isDiscontinuity(f: (x: number) => number, a: number, fa: number, b: number, fb: number): boolean {
  // A real jump keeps at least half of its size however closely it is bracketed; a steep continuous part loses
  // half of it with every bisection.
  const keep = Math.abs(fb - fa) / 2;
  let lo = a;
  let hi = b;
  let flo = fa;
  let fhi = fb;
  for (let k = 0; k < JUMP_BISECTIONS; k++) {
    const m = (lo + hi) / 2;
    if (m === lo || m === hi) break;
    const fm = f(m);
    if (!finite(fm)) return true;
    // Keep the half with the larger jump.
    if (Math.abs(fm - flo) >= Math.abs(fhi - fm)) {
      hi = m;
      fhi = fm;
    } else {
      lo = m;
      flo = fm;
    }
    if (Math.abs(fhi - flo) < keep) return false;
  }
  return Math.abs(fhi - flo) >= keep;
}

export interface ParametricOptions {
  /** World-space tolerance (one pixel). */
  tolerance: number;
  initial?: number;
  maxPoints?: number;
  maxDepth?: number;
}

/** Samples (x(t), y(t)) for t in [t0, t1] with the same refinement and cutting rules as `sampleExplicit`. */
export function sampleParametric(
  fx: (t: number) => number,
  fy: (t: number) => number,
  t0: number,
  t1: number,
  opts: ParametricOptions,
): SampleResult {
  const initial = opts.initial ?? DEFAULT_INITIAL;
  const maxPoints = opts.maxPoints ?? DEFAULT_MAX_POINTS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  let evaluations = 0;
  const ev = (t: number): [number, number] => {
    evaluations++;
    return [fx(t), fy(t)];
  };
  const pts: number[] = [];
  const ok = (p: [number, number]) => finite(p[0]) && finite(p[1]);

  const refine = (a: number, pa: [number, number], b: number, pb: [number, number], depth: number) => {
    if (depth >= maxDepth || pts.length / 3 >= maxPoints) return;
    const m = (a + b) / 2;
    const pm = ev(m);
    const needs =
      ok(pa) !== ok(pb) ||
      ok(pa) !== ok(pm) ||
      (ok(pa) && ok(pb) && ok(pm) && Math.hypot(pm[0] - (pa[0] + pb[0]) / 2, pm[1] - (pa[1] + pb[1]) / 2) > opts.tolerance);
    if (needs) {
      refine(a, pa, m, pm, depth + 1);
      pts.push(m, pm[0], pm[1]);
      refine(m, pm, b, pb, depth + 1);
    } else {
      pts.push(m, pm[0], pm[1]);
    }
  };

  const h = (t1 - t0) / initial;
  let pt = t0;
  let pp = ev(t0);
  pts.push(pt, pp[0], pp[1]);
  for (let i = 1; i <= initial; i++) {
    const t = i === initial ? t1 : t0 + i * h;
    const p = ev(t);
    refine(pt, pp, t, p, 0);
    pts.push(t, p[0], p[1]);
    pt = t;
    pp = p;
  }

  const segments: Polyline[] = [];
  let cur: number[] = [];
  let precisionWarning = false;
  const flush = () => {
    if (cur.length >= 2) segments.push(Float64Array.from(cur));
    cur = [];
  };
  for (let i = 0; i < pts.length; i += 3) {
    const t = pts[i];
    const x = pts[i + 1];
    const y = pts[i + 2];
    if (!finite(x) || !finite(y)) {
      flush();
      continue;
    }
    if (Math.abs(x) > PRECISION_WARNING_MAGNITUDE || Math.abs(y) > PRECISION_WARNING_MAGNITUDE) precisionWarning = true;
    if (cur.length >= 2 && i >= 3) {
      const px = cur[cur.length - 2];
      const py = cur[cur.length - 1];
      if (Math.hypot(x - px, y - py) > JUMP_PIXELS * opts.tolerance) {
        const tPrev = pts[i - 3];
        const dist = (tt: number) => {
          const p = ev(tt);
          return Math.hypot(p[0] - px, p[1] - py);
        };
        // Same rule as explicit curves, applied to the distance from the previous point.
        if (isDiscontinuity(dist, tPrev, 0, t, Math.hypot(x - px, y - py))) flush();
      }
    }
    cur.push(x, y);
  }
  flush();
  return { segments, evaluations, precisionWarning };
}

/** Polar r = f(θ) for θ in [θ0, θ1] (default one full turn), sampled as a parametric curve. */
export function samplePolar(r: (theta: number) => number, theta0: number, theta1: number, opts: ParametricOptions): SampleResult {
  return sampleParametric(
    (th) => r(th) * Math.cos(th),
    (th) => r(th) * Math.sin(th),
    theta0,
    theta1,
    opts,
  );
}
