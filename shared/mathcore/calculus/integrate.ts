/**
 * Definite integrals (STEPS.md §7.3): adaptive Simpson for general values; Riemann sums for teaching (`riemann.ts`).
 */
import {
  DIVERGENCE_BOUND, INTEGRAL_MAX_DEPTH, INTEGRAL_TOLERANCE, TANH_SINH_MAX_LEVEL, TANH_SINH_NOISE_FLOOR, TANH_SINH_RELATIVE,
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
  for (let level = 0; level <= TANH_SINH_MAX_LEVEL; level++) {
    const h = 1 / 2 ** level;
    let sum = (Math.PI / 2) * f(mid);
    evaluations++;
    for (let k = 1; ; k++) {
      const t = k * h;
      const s = (Math.PI / 2) * Math.sinh(t);
      const e = Math.exp(-2 * s);
      // Distance from each endpoint, 1 − tanh(s), computed without cancellation.
      const dist = (2 * e) / (1 + e);
      const w = ((Math.PI / 2) * Math.cosh(t) * 4 * e) / ((1 + e) * (1 + e));
      const xl = a + half * dist;
      const xr = b - half * dist;
      // Each side stops on its own once its abscissa rounds onto the endpoint: near 0 that happens far later than
      // near 1, and stopping both sides together loses the tail of a singularity at 0.
      const leftOk = xl !== a;
      const rightOk = xr !== b;
      if (w < Number.MIN_VALUE || (!leftOk && !rightOk)) break;
      const fl = leftOk ? f(xl) : 0;
      const fr = rightOk ? f(xr) : 0;
      evaluations += 2;
      if (!Number.isFinite(fl) || !Number.isFinite(fr)) return { value: NaN, converged: false, evaluations };
      sum += w * (fl + fr);
    }
    const value = half * h * sum;
    lastChange = Math.abs(value - prev);
    if (level > 2 && lastChange <= Math.max(tolerance, Math.abs(value) * TANH_SINH_RELATIVE)) return { value, converged: true, evaluations };
    prev = value;
  }
  // Near an endpoint singularity the abscissae lose relative precision (1 − x² cancels), so the levels can stop
  // agreeing at ~1e-12 while the value is right to ~1e-10. Accept that noise floor; a divergent integral keeps
  // changing by much more than this and is still rejected.
  if (Math.abs(lastChange) <= TANH_SINH_NOISE_FLOOR * Math.abs(prev)) return { value: prev, converged: true, evaluations };
  return { value: prev, converged: false, evaluations };
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
