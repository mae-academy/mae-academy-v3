/**
 * Definite integrals (STEPS.md §7.3): adaptive Simpson for general values; Riemann sums for teaching (`riemann.ts`).
 */
import {
  DIVERGENCE_BOUND, INTEGRAL_MAX_DEPTH, INTEGRAL_TOLERANCE, ABSCISSA_RELATIVE, PEAK_BRACKET, SINGULAR_PEAK_RATIO, PEAK_ITERATIONS, TAIL_ALPHA_MARGIN, TANH_SINH_EDGE_FRACTION, TANH_SINH_MIN_LEVEL, TAIL_MODEL_UNCERTAINTY, TANH_SINH_MAX_LEVEL, TANH_SINH_NOISE_FLOOR, TANH_SINH_RELATIVE,
} from "../constants";

export interface SimpsonOptions {
  /** Absolute tolerance on the whole interval. */
  tolerance?: number;
  /** Maximum recursion depth; a branch that reaches it is accepted as is and flagged. */
  maxDepth?: number;
}

export interface IntegralResult {
  value: number;
  /** False when a branch hit the depth limit or produced a non-finite value. */
  converged: boolean;
  evaluations: number;
  /**
   * Set when the answer was accepted at the tanh-sinh noise floor: the last change between levels plus the model
   * uncertainty of the endpoint tails (a bound on the error, not the error itself).
   */
  estimatedError?: number;
}

const DEFAULT_TOLERANCE = INTEGRAL_TOLERANCE;
const DEFAULT_MAX_DEPTH = INTEGRAL_MAX_DEPTH;

export function adaptiveSimpson(f: (x: number) => number, a: number, b: number, opts: SimpsonOptions = {}): IntegralResult {
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { value: NaN, converged: false, evaluations: 0 };
  if (a === b) return { value: 0, converged: true, evaluations: 0 };
  let evaluations = 3;
  let converged = true;
  const fa = f(a);
  const fb = f(b);
  const m = (a + b) / 2;
  const fm = f(m);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);

  const step = (a0: number, b0: number, fa0: number, fm0: number, fb0: number, s: number, eps: number, depth: number): number => {
    const m0 = (a0 + b0) / 2;
    const lm = (a0 + m0) / 2;
    const rm = (m0 + b0) / 2;
    const flm = f(lm);
    const frm = f(rm);
    evaluations += 2;
    const left = ((m0 - a0) / 6) * (fa0 + 4 * flm + fm0);
    const right = ((b0 - m0) / 6) * (fm0 + 4 * frm + fb0);
    const diff = left + right - s;
    if (!Number.isFinite(left + right)) {
      converged = false;
      return left + right;
    }
    if (depth >= maxDepth) {
      converged = false;
      return left + right + diff / 15;
    }
    // Absolute test, scaled by the current estimate so large integrals are not over-refined.
    if (Math.abs(diff) <= 15 * Math.max(eps, Math.abs(left + right) * Number.EPSILON * 4)) return left + right + diff / 15;
    return step(a0, m0, fa0, flm, fm0, left, eps / 2, depth + 1) + step(m0, b0, fm0, frm, fb0, right, eps / 2, depth + 1);
  };

  const value = step(a, b, fa, fm, fb, whole, tol, 0);
  return { value, converged: converged && Number.isFinite(value), evaluations };
}

/**
 * Tanh-sinh (double-exponential) quadrature. It never evaluates the endpoints, so integrable endpoint
 * singularities such as ∫₀¹ ln t dt or ∫₀¹ t^(−1/2) dt converge.
 */
export function tanhSinh(f: (x: number) => number, a: number, b: number, tolerance = INTEGRAL_TOLERANCE): IntegralResult {
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  let evaluations = 0;
  let prev = NaN;
  let lastChange = Infinity;
  /** Size of the analytic endpoint tails at the last level (their model error is a fraction of this). */
  let tail = 0;
  for (let level = 0; level <= TANH_SINH_MAX_LEVEL; level++) {
    const h = 1 / 2 ** level;
    let sum = (Math.PI / 2) * f(mid);
    evaluations++;
    // The two innermost samples on each side (distance from the endpoint, value), for the tail correction.
    const left = { d1: NaN, f1: NaN, d2: NaN, f2: NaN, t: NaN };
    const right = { d1: NaN, f1: NaN, d2: NaN, f2: NaN, t: NaN };
    let leftDone = false;
    let rightDone = false;
    for (let k = 1; ; k++) {
      const t = k * h;
      const s = (Math.PI / 2) * Math.sinh(t);
      const e = Math.exp(-2 * s);
      // Distance from each endpoint, 1 − tanh(s), computed without cancellation.
      const dist = (2 * e) / (1 + e);
      const w = ((Math.PI / 2) * Math.cosh(t) * 4 * e) / ((1 + e) * (1 + e));
      const xl = a + half * dist;
      const xr = b - half * dist;
      // Each side stops on its own once its abscissa no longer represents the intended distance from the endpoint
      // (near 1 that happens at ~1e-16, near 0 far later); the stretch inside is added by `endpointTail`.
      // A distance that repeats the previous one (two nodes rounded onto the same double) also ends the side.
      const leftOk = !leftDone && Math.abs(xl - a - half * dist) <= ABSCISSA_RELATIVE * half * dist && !(xl - a >= left.d2);
      const rightOk = !rightDone && Math.abs(b - xr - half * dist) <= ABSCISSA_RELATIVE * half * dist && !(b - xr >= right.d2);
      if (!leftOk) leftDone = true;
      if (!rightOk) rightDone = true;
      if (w < Number.MIN_VALUE || (!leftOk && !rightOk)) break;
      let fl = leftOk ? f(xl) : 0;
      let fr = rightOk ? f(xr) : 0;
      evaluations += 2;
      // Overflow next to a singular endpoint (x^(−0.99) at a subnormal x) ends that side; the tail covers the rest.
      // Anywhere else a non-finite value means the integrand is not integrable here.
      const nearEnd = dist < TANH_SINH_EDGE_FRACTION;
      if (!Number.isFinite(fl)) {
        if (!nearEnd) return { value: NaN, converged: false, evaluations };
        leftDone = true;
        fl = 0;
      }
      if (!Number.isFinite(fr)) {
        if (!nearEnd) return { value: NaN, converged: false, evaluations };
        rightDone = true;
        fr = 0;
      }
      sum += w * (fl + fr);
      if (leftOk && !leftDone) Object.assign(left, { d1: left.d2, f1: left.f2, d2: xl - a, f2: fl, t });
      if (rightOk && !rightDone) Object.assign(right, { d1: right.d2, f1: right.f2, d2: b - xr, f2: fr, t });
    }
    const tl = endpointTail(left, half * distanceAt(left.t + h / 2));
    const tr = endpointTail(right, half * distanceAt(right.t + h / 2));
    if (Number.isNaN(tl) || Number.isNaN(tr)) return { value: NaN, converged: false, evaluations };
    const value = half * h * sum + tl + tr;
    tail = Math.abs(tl) + Math.abs(tr);
    lastChange = Math.abs(value - prev);
    if (level >= TANH_SINH_MIN_LEVEL && lastChange <= Math.max(tolerance, Math.abs(value) * TANH_SINH_RELATIVE)) return { value, converged: true, evaluations };
    prev = value;
  }
  // Rounding in the abscissae next to a singular endpoint can keep the levels from agreeing to 1e-12 even after the
  // tail correction. Accept agreement to TANH_SINH_NOISE_FLOOR, and say so through `estimatedError`; a divergent
  // integral keeps changing by much more than this and is still rejected.
  if (Math.abs(lastChange) <= TANH_SINH_NOISE_FLOOR * Math.abs(prev)) {
    return { value: prev, converged: true, evaluations, estimatedError: lastChange + TAIL_MODEL_UNCERTAINTY * tail };
  }
  return { value: prev, converged: false, evaluations };
}

/** Distance 1 − tanh((π/2)·sinh t) of the node at t from its endpoint (on [−1, 1]), without cancellation. */
function distanceAt(t: number): number {
  const e = Math.exp(-Math.PI * Math.sinh(t));
  return (2 * e) / (1 + e);
}

/**
 * ∫ over the stretch next to an endpoint that the nodes did not cover: from the endpoint to `cut`, the distance where
 * the last node's share of the quadrature ends (half a step past it in t). From the two innermost nodes,
 * f ≈ C·d^(−α); the tail is ∫₀^cut C u^(−α) du = f₂·d₂^α·cut^(1−α) / (1 − α), which is ≈ f·cut for a bounded integrand
 * (α ≈ 0). α ≥ 1 is not integrable: NaN. Without two usable samples of one sign, the tail is f₂·cut.
 */
function endpointTail(s: { d1: number; f1: number; d2: number; f2: number }, cut: number): number {
  if (!(s.d2 > 0 && cut > 0) || !Number.isFinite(s.f2)) return 0;
  if (!(s.d1 > s.d2) || s.f1 === 0 || s.f2 === 0 || s.f1 > 0 !== s.f2 > 0) return s.f2 * cut;
  const alpha = Math.log(Math.abs(s.f2 / s.f1)) / Math.log(s.d1 / s.d2);
  if (alpha >= 1 - TAIL_ALPHA_MARGIN) return NaN;
  return (s.f2 * s.d2 ** alpha * cut ** (1 - alpha)) / (1 - alpha);
}


/** Point of largest |f| near `x0` (ternary search on a shrinking bracket; a non-finite value is the point itself). */
function locatePeak(f: (x: number) => number, a: number, b: number, x0: number): number {
  const w = (b - a) * PEAK_BRACKET;
  let lo = Math.max(a, x0 - w);
  let hi = Math.min(b, x0 + w);
  const mag = (x: number) => {
    const v = Math.abs(f(x));
    return Number.isNaN(v) ? -1 : v;
  };
  for (let k = 0; k < PEAK_ITERATIONS && hi - lo > 0; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (m1 === lo || m2 === hi) break;
    const g1 = mag(m1);
    const g2 = mag(m2);
    if (g1 === Infinity) return m1;
    if (g2 === Infinity) return m2;
    if (g1 < g2) lo = m1;
    else hi = m2;
  }
  return (lo + hi) / 2;
}

/**
 * Definite integral used by the compiler.
 *  - Adaptive Simpson first. A bounded integrand with jumps (floor, sign) never meets the tolerance at the jump, but its
 *    value is right up to an interval of width 2⁻⁵⁰, so the depth-limited result is kept.
 *  - If the integrand blows up (endpoint or interior singularity), Simpson's answer is meaningless: tanh-sinh is tried
 *    on the whole interval, then split at the largest sample so an interior singularity becomes two endpoint ones.
 *  - A divergent integral (1/x across 0) converges in neither, and is reported as not converged (the page shows NaN).
 */
export function integrate(f: (x: number) => number, a: number, b: number): IntegralResult {
  let peak = 0;
  let peakAt = (a + b) / 2;
  // A sample that is exactly infinite (1/0, ln 0) is a singular point; it beats any finite peak as the split point.
  let singularAt: number | null = null;
  const watched = (x: number) => {
    const v = f(x);
    if (Math.abs(v) === Infinity && singularAt === null) singularAt = x;
    if (Number.isFinite(v) && Math.abs(v) > peak) {
      peak = Math.abs(v);
      peakAt = x;
    }
    return v;
  };
  const simpson = adaptiveSimpson(watched, a, b);
  // Blown up: a non-finite sample or end value, a sample beyond DIVERGENCE_BOUND, or (Simpson not converged) a sample
  // far above the integrand's mean size, as at 1/√|x − 0.3| whose samples never land on 0.3.
  const mean = Math.abs(simpson.value) / Math.abs(b - a);
  const blewUp =
    !Number.isFinite(simpson.value) ||
    peak > DIVERGENCE_BOUND ||
    (!simpson.converged && peak > SINGULAR_PEAK_RATIO * Math.max(mean, Number.MIN_VALUE)) ||
    !Number.isFinite(f(a)) ||
    !Number.isFinite(f(b));
  if (simpson.converged && !blewUp) return simpson;
  if (!blewUp) return { ...simpson, converged: true };
  // Split at the singular point, located to the last bit: |f| is largest there, so a ternary search around the
  // largest sample narrows it down (a split a few ulps off would leave a near-singular stretch inside a half). An
  // interior singularity is always split first: tanh-sinh over the whole interval can seem to converge across it.
  const split = singularAt ?? locatePeak(f, a, b, peakAt);
  const interior = split - a > PEAK_BRACKET * (b - a) && b - split > PEAK_BRACKET * (b - a);
  const whole = interior ? null : tanhSinh(f, a, b);
  if (whole?.converged) return whole;
  if (split > a && split < b) {
    const left = tanhSinh(f, a, split);
    const right = tanhSinh(f, split, b);
    if (left.converged && right.converged) {
      const err = (left.estimatedError ?? 0) + (right.estimatedError ?? 0);
      return {
        value: left.value + right.value,
        converged: true,
        evaluations: left.evaluations + right.evaluations,
        ...(left.estimatedError !== undefined || right.estimatedError !== undefined ? { estimatedError: err } : {}),
      };
    }
  }
  return { value: NaN, converged: false, evaluations: simpson.evaluations + (whole?.evaluations ?? 0) };
}
