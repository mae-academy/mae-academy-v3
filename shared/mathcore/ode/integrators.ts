/**
 * ODE integrators (STEPS.md §8.3, Phase 6).
 *
 * - RK4: classical fixed-step fourth order. Halving h divides the global error by about 2⁴ = 16.
 * - RKF45: Runge–Kutta–Fehlberg with an embedded fourth-order solution for the error estimate; the step is
 *   advanced with the fifth-order solution (local extrapolation) and adapted to keep the error within
 *   atol + rtol·|y| per component.
 * Both integrate forward (h > 0) or backward (h < 0); error control always uses |h| (§8.3).
 * Systems are written y′ = f(t, y) with y a vector, so a first-order ODE is the 1-component case.
 */

export type Rhs = (t: number, y: Float64Array, out: Float64Array) => void;

export interface Trajectory {
  t: number[];
  /** y[i] is the state at t[i]. */
  y: Float64Array[];
  /** Why integration ended before the requested end, if it did. */
  stopped?: "non-finite" | "step-underflow" | "max-steps" | "left-view";
  /** Right-hand-side evaluations (STEPS.md §7.1: cost is the number of evaluations). */
  evaluations: number;
}

/** Safety cap so a stiff or exploding problem cannot freeze a Worker. */
export const MAX_ODE_STEPS = 200_000;

const finite = (v: Float64Array) => v.every(Number.isFinite);

export function rk4(f: Rhs, t0: number, y0: ArrayLike<number>, t1: number, steps: number, stop?: (t: number, y: Float64Array) => boolean): Trajectory {
  const n = y0.length;
  const h = (t1 - t0) / steps;
  const k1 = new Float64Array(n);
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const tmp = new Float64Array(n);
  let y = Float64Array.from(y0);
  let t = t0;
  const out: Trajectory = { t: [t], y: [y.slice()], evaluations: 0 };
  for (let s = 0; s < steps; s++) {
    f(t, y, k1);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + (h / 2) * k1[i];
    f(t + h / 2, tmp, k2);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + (h / 2) * k2[i];
    f(t + h / 2, tmp, k3);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + h * k3[i];
    f(t + h, tmp, k4);
    out.evaluations += 4;
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) next[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    // The last step lands exactly on t1 (no drift from adding h repeatedly).
    t = s === steps - 1 ? t1 : t0 + (s + 1) * h;
    if (!finite(next)) {
      out.stopped = "non-finite";
      break;
    }
    y = next;
    out.t.push(t);
    out.y.push(y);
    if (stop?.(t, y)) {
      out.stopped = "left-view";
      break;
    }
  }
  return out;
}

export interface AdaptiveOptions {
  rtol?: number;
  atol?: number;
  /** First step size magnitude (default: 1% of the interval). */
  h0?: number;
  /** Largest step magnitude (default: the whole interval), e.g. to keep a drawn curve smooth. */
  hMax?: number;
  maxSteps?: number;
  stop?: (t: number, y: Float64Array) => boolean;
}

// Fehlberg coefficients.
const A2 = 1 / 4;
const A3 = 3 / 8;
const A4 = 12 / 13;
const B21 = 1 / 4;
const B31 = 3 / 32;
const B32 = 9 / 32;
const B41 = 1932 / 2197;
const B42 = -7200 / 2197;
const B43 = 7296 / 2197;
const B51 = 439 / 216;
const B52 = -8;
const B53 = 3680 / 513;
const B54 = -845 / 4104;
const B61 = -8 / 27;
const B62 = 2;
const B63 = -3544 / 2565;
const B64 = 1859 / 4104;
const B65 = -11 / 40;
// Fifth-order weights (advance) and the difference fifth − fourth (error estimate).
const C1 = 16 / 135;
const C3 = 6656 / 12825;
const C4 = 28561 / 56430;
const C5 = -9 / 50;
const C6 = 2 / 55;
const E1 = 1 / 360;
const E3 = -128 / 4275;
const E4 = -2197 / 75240;
const E5 = 1 / 50;
const E6 = 2 / 55;

/** Step-size controller: safety factor and growth limits. */
const SAFETY = 0.9;
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 5;

export function rkf45(f: Rhs, t0: number, y0: ArrayLike<number>, t1: number, opts: AdaptiveOptions = {}): Trajectory {
  const n = y0.length;
  const rtol = opts.rtol ?? 1e-8;
  const atol = opts.atol ?? 1e-10;
  const dir = t1 >= t0 ? 1 : -1;
  const span = Math.abs(t1 - t0);
  const hMax = opts.hMax ?? span;
  let h = dir * Math.min(opts.h0 ?? span / 100, hMax);
  const maxSteps = opts.maxSteps ?? MAX_ODE_STEPS;
  const k = Array.from({ length: 6 }, () => new Float64Array(n));
  const tmp = new Float64Array(n);
  let y = Float64Array.from(y0);
  let t = t0;
  const out: Trajectory = { t: [t], y: [y.slice()], evaluations: 0 };
  if (span === 0) return out;
  for (let steps = 0; dir * (t1 - t) > 0; steps++) {
    if (steps >= maxSteps) {
      out.stopped = "max-steps";
      break;
    }
    if (dir * (t + h - t1) > 0) h = t1 - t;
    const stage = (dst: Float64Array, tt: number, coeffs: number[]) => {
      for (let i = 0; i < n; i++) {
        let v = y[i];
        for (let s = 0; s < coeffs.length; s++) v += h * coeffs[s] * k[s][i];
        tmp[i] = v;
      }
      f(tt, tmp, dst);
    };
    f(t, y, k[0]);
    stage(k[1], t + A2 * h, [B21]);
    stage(k[2], t + A3 * h, [B31, B32]);
    stage(k[3], t + A4 * h, [B41, B42, B43]);
    stage(k[4], t + h, [B51, B52, B53, B54]);
    stage(k[5], t + h / 2, [B61, B62, B63, B64, B65]);
    out.evaluations += 6;
    const next = new Float64Array(n);
    let errNorm = 0;
    for (let i = 0; i < n; i++) {
      next[i] = y[i] + h * (C1 * k[0][i] + C3 * k[2][i] + C4 * k[3][i] + C5 * k[4][i] + C6 * k[5][i]);
      const e = h * (E1 * k[0][i] + E3 * k[2][i] + E4 * k[3][i] + E5 * k[4][i] + E6 * k[5][i]);
      const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(next[i]));
      errNorm = Math.max(errNorm, Math.abs(e) / sc);
    }
    if (!Number.isFinite(errNorm) || !finite(next)) {
      // Shrink and retry; give up only when the step cannot shrink further.
      h *= MIN_FACTOR;
      if (Math.abs(h) <= Number.EPSILON * Math.max(1, Math.abs(t))) {
        out.stopped = "non-finite";
        break;
      }
      continue;
    }
    if (errNorm <= 1) {
      t += h;
      y = next;
      out.t.push(t);
      out.y.push(y);
      if (opts.stop?.(t, y)) {
        out.stopped = "left-view";
        break;
      }
    }
    // Fifth-order controller on the fourth-order error estimate: factor = safety · err^(−1/5).
    const factor = errNorm === 0 ? MAX_FACTOR : Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, SAFETY * errNorm ** -0.2));
    h = dir * Math.min(Math.abs(h * factor), hMax);
    if (Math.abs(h) <= Number.EPSILON * Math.max(1, Math.abs(t)) * 4) {
      out.stopped = "step-underflow";
      break;
    }
  }
  return out;
}
