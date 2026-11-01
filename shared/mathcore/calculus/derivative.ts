/**
 * Numerical derivatives and tangents (STEPS.md §7.3, §8.1).
 * Central differences (f(x+h) − f(x−h)) / 2h with h ≈ √ε · max(1, |x|).
 */
import { DERIVATIVE_STEP_SCALE } from "../constants";

export function derivativeStep(x: number): number {
  return DERIVATIVE_STEP_SCALE * Math.max(1, Math.abs(x));
}

export function centralDifference(f: (x: number) => number, x: number): number {
  const h = derivativeStep(x);
  return (f(x + h) - f(x - h)) / (2 * h);
}

export interface Tangent {
  x0: number;
  y0: number;
  /** f′(x₀). */
  slope: number;
  /** y-intercept of the tangent line y = slope·x + intercept. */
  intercept: number;
  /** Slope triangle with horizontal leg Δx (the caller picks a visible size). */
  triangle: { dx: number; dy: number };
}

/** Tangent at x₀; null where f is undefined or the derivative is not finite. */
export function tangentAt(f: (x: number) => number, x0: number, triangleDx = 1): Tangent | null {
  const y0 = f(x0);
  const slope = centralDifference(f, x0);
  if (!Number.isFinite(y0) || !Number.isFinite(slope)) return null;
  return { x0, y0, slope, intercept: y0 - slope * x0, triangle: { dx: triangleDx, dy: slope * triangleDx } };
}

/** Secant through (x₀, f(x₀)) and (x₀+h, f(x₀+h)); animating h → 0 shows the secant becoming the tangent. */
export function secantSlope(f: (x: number) => number, x0: number, h: number): number {
  return (f(x0 + h) - f(x0)) / h;
}
