/**
 * Definite integrals (STEPS.md §7.3): adaptive Simpson for general values; Riemann sums for teaching (`riemann.ts`).
 */

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

/** Default absolute tolerance relative to the integral's scale. */
const DEFAULT_TOLERANCE = 1e-12;
const DEFAULT_MAX_DEPTH = 50;

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
