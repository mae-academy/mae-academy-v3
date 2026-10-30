/**
 * Definite integrals (STEPS.md §7.3): adaptive Simpson for general values; Riemann sums for teaching (`riemann.ts`).
 */
import {
  DIVERGENCE_BOUND, INTEGRAL_MAX_DEPTH, INTEGRAL_TOLERANCE, ABSCISSA_RELATIVE, TAIL_ALPHA_MARGIN, TAIL_MODEL_UNCERTAINTY, TANH_SINH_MAX_LEVEL, TANH_SINH_NOISE_FLOOR, TANH_SINH_RELATIVE,
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
    const left = { d1: NaN, f1: NaN, d2: NaN, f2: NaN };
    const right = { d1: NaN, f1: NaN, d2: NaN, f2: NaN };
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
      const fl = leftOk ? f(xl) : 0;
      const fr = rightOk ? f(xr) : 0;
      evaluations += 2;
      if (!Number.isFinite(fl) || !Number.isFinite(fr)) return { value: NaN, converged: false, evaluations };
      sum += w * (fl + fr);
      if (leftOk) Object.assign(left, { d1: left.d2, f1: left.f2, d2: xl - a, f2: fl });
      if (rightOk) Object.assign(right, { d1: right.d2, f1: right.f2, d2: b - xr, f2: fr });
    }
    const tl = endpointTail(left);
    const tr = endpointTail(right);
    if (Number.isNaN(tl) || Number.isNaN(tr)) return { value: NaN, converged: false, evaluations };
    const value = half * h * sum + tl + tr;
    tail = Math.abs(tl) + Math.abs(tr);
    lastChange = Math.abs(value - prev);
    if (level > 2 && lastChange <= Math.max(tolerance, Math.abs(value) * TANH_SINH_RELATIVE)) return { value, converged: true, evaluations };
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

/**
 * ∫ over the stretch next to an endpoint that no double abscissa can reach (closer than one ulp of the endpoint).
 * From the two innermost samples, f ≈ C·d^(−α); the tail is ∫₀^d C u^(−α) du = f·d / (1 − α). α ≥ 1 is not
 * integrable: NaN. A bounded integrand (α ≤ 0) contributes at most f·d, below rounding: 0.
 */
function endpointTail(s: { d1: number; f1: number; d2: number; f2: number }): number {
  if (!(s.d2 > 0 && s.d1 > s.d2) || s.f1 === 0 || s.f2 === 0 || s.f1 > 0 !== s.f2 > 0) return 0;
  const alpha = Math.log(Math.abs(s.f2 / s.f1)) / Math.log(s.d1 / s.d2);
  if (!(alpha > 0)) return 0;
  if (alpha >= 1 - TAIL_ALPHA_MARGIN) return NaN;
  return (s.f2 * s.d2) / (1 - alpha);
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
  const blewUp = !Number.isFinite(simpson.value) || peak > DIVERGENCE_BOUND || !Number.isFinite(f(a)) || !Number.isFinite(f(b));
  if (simpson.converged && !blewUp) return simpson;
  if (!blewUp) return { ...simpson, converged: true };
  const whole = tanhSinh(f, a, b);
  if (whole.converged) return whole;
  const split = singularAt ?? peakAt;
  if (split > a && split < b) {
    const left = tanhSinh(f, a, split);
    const right = tanhSinh(f, split, b);
    if (left.converged && right.converged) {
      return { value: left.value + right.value, converged: true, evaluations: left.evaluations + right.evaluations };
    }
  }
  return { value: NaN, converged: false, evaluations: simpson.evaluations + whole.evaluations };
}
