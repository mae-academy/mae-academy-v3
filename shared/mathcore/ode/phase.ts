/**
 * Direction fields, equilibria and their classification (STEPS.md §8.3).
 *
 * - Direction field: an arrow per grid cell along (1, f(x, y)) for dy/dx = f, or along (f, g) for a 2D system.
 * - Equilibria of x′ = f(x, y), y′ = g(x, y): cells where both components change sign are refined by Newton's
 *   method with a central-difference Jacobian, then de-duplicated.
 * - Classification from the Jacobian's eigenvalues: attractor (stable node or spiral), repeller (unstable node or
 *   spiral), saddle, centre; a zero eigenvalue is reported as non-hyperbolic (linearization decides nothing).
 */
import type { Viewport } from "../ir/types";
import { eigen2 } from "../linalg/matrix";

export type Field2 = (x: number, y: number) => [number, number];

/** Arrow length as a fraction of the grid cell. */
const ARROW_FRACTION = 0.7;
/** Arrow-head side length as a fraction of the arrow. */
const HEAD_FRACTION = 0.3;
const HEAD_ANGLE = Math.PI / 7;

export interface DirectionField {
  /** Line segments [x0, y0, x1, y1, …] in world coordinates: shafts, and heads when `heads` is set. */
  segments: Float64Array;
  /** Arrows drawn (cells with an undefined slope are skipped). */
  count: number;
}

/**
 * Arrows on a cols × rows grid. `normalize` draws every arrow the same length (direction only), which is how slope
 * fields are taught; `heads` adds arrow heads (systems have a direction of time, slope fields do not).
 */
export function directionField(field: Field2, view: Viewport, cols: number, rows: number, opts: { heads: boolean }): DirectionField {
  const dx = (view.xmax - view.xmin) / cols;
  const dy = (view.ymax - view.ymin) / rows;
  // Arrows are measured in screen-proportional units so they look the same length on a non-square view.
  const len = ARROW_FRACTION * Math.min(dx, dy);
  const out: number[] = [];
  let count = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = view.xmin + (i + 0.5) * dx;
      const y = view.ymin + (j + 0.5) * dy;
      const [u, v] = field(x, y);
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
      // Direction in units of cells, then back to world units, so the arrow keeps its screen angle.
      const su = u / dx;
      const sv = v / dy;
      const m = Math.hypot(su, sv);
      if (m === 0) continue;
      const ux = ((su / m) * len * dx) / Math.min(dx, dy);
      const uy = ((sv / m) * len * dy) / Math.min(dx, dy);
      const x0 = x - ux / 2;
      const y0 = y - uy / 2;
      const x1 = x + ux / 2;
      const y1 = y + uy / 2;
      out.push(x0, y0, x1, y1);
      if (opts.heads) {
        const ang = Math.atan2(sv, su);
        const hl = HEAD_FRACTION * len;
        for (const side of [-1, 1]) {
          const a = ang + Math.PI + side * HEAD_ANGLE;
          out.push(x1, y1, x1 + (Math.cos(a) * hl * dx) / Math.min(dx, dy), y1 + (Math.sin(a) * hl * dy) / Math.min(dx, dy));
        }
      }
      count++;
    }
  }
  return { segments: Float64Array.from(out), count };
}

/** Slope field of dy/dx = f(x, y) as a 2D field (1, f). */
export const slopeAsField = (f: (x: number, y: number) => number): Field2 => (x, y) => [1, f(x, y)];

export type EquilibriumType =
  | "stable-node"
  | "unstable-node"
  | "saddle"
  | "stable-spiral"
  | "unstable-spiral"
  | "center"
  | "stable-degenerate"
  | "unstable-degenerate"
  | "non-hyperbolic";

/** The four colour classes of STEPS.md §8.3. */
export type StabilityClass = "attractor" | "repeller" | "saddle" | "center" | "non-hyperbolic";

export interface Equilibrium {
  x: number;
  y: number;
  jacobian: [[number, number], [number, number]];
  type: EquilibriumType;
  stability: StabilityClass;
  /** Eigenvalues of the Jacobian (re, im). */
  eigenvalues: Array<{ re: number; im: number }>;
}

/** Relative tolerance for "real part is zero" (centre / non-hyperbolic). */
const ZERO_PART_TOLERANCE = 1e-7;
const NEWTON_ITERATIONS = 50;
const NEWTON_TOLERANCE = 1e-12;
const JACOBIAN_STEP = Math.cbrt(Number.EPSILON);

export function jacobian(field: Field2, x: number, y: number): [[number, number], [number, number]] {
  const hx = JACOBIAN_STEP * Math.max(1, Math.abs(x));
  const hy = JACOBIAN_STEP * Math.max(1, Math.abs(y));
  const [fxp, gxp] = field(x + hx, y);
  const [fxm, gxm] = field(x - hx, y);
  const [fyp, gyp] = field(x, y + hy);
  const [fym, gym] = field(x, y - hy);
  return [
    [(fxp - fxm) / (2 * hx), (fyp - fym) / (2 * hy)],
    [(gxp - gxm) / (2 * hx), (gyp - gym) / (2 * hy)],
  ];
}

export function classify(J: [[number, number], [number, number]]): Pick<Equilibrium, "type" | "stability" | "eigenvalues"> {
  const e = eigen2(J);
  const scale = Math.max(Math.abs(J[0][0]), Math.abs(J[0][1]), Math.abs(J[1][0]), Math.abs(J[1][1]), Number.MIN_VALUE);
  const zero = (v: number) => Math.abs(v) <= ZERO_PART_TOLERANCE * scale;
  if (e.kind === "complex") {
    const eigenvalues = [{ re: e.re, im: e.im }, { re: e.re, im: -e.im }];
    if (zero(e.re)) return { type: "center", stability: "center", eigenvalues };
    return e.re < 0
      ? { type: "stable-spiral", stability: "attractor", eigenvalues }
      : { type: "unstable-spiral", stability: "repeller", eigenvalues };
  }
  const values = e.kind === "distinct" ? e.values : [e.value, e.value];
  const eigenvalues = values.map((re) => ({ re, im: 0 }));
  if (values.some(zero)) return { type: "non-hyperbolic", stability: "non-hyperbolic", eigenvalues };
  if (values[0] > 0 && values[1] > 0) {
    return { type: e.kind === "distinct" ? "unstable-node" : "unstable-degenerate", stability: "repeller", eigenvalues };
  }
  if (values[0] < 0 && values[1] < 0) {
    return { type: e.kind === "distinct" ? "stable-node" : "stable-degenerate", stability: "attractor", eigenvalues };
  }
  return { type: "saddle", stability: "saddle", eigenvalues };
}

/** Newton's method on (f, g) = 0 from (x, y); null if it does not converge to a finite point. */
export function newton2(field: Field2, x: number, y: number): [number, number] | null {
  let px = x;
  let py = y;
  for (let k = 0; k < NEWTON_ITERATIONS; k++) {
    const [f, g] = field(px, py);
    if (!Number.isFinite(f) || !Number.isFinite(g)) return null;
    const J = jacobian(field, px, py);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (det === 0 || !Number.isFinite(det)) return null;
    const sx = (J[1][1] * f - J[0][1] * g) / det;
    const sy = (-J[1][0] * f + J[0][0] * g) / det;
    px -= sx;
    py -= sy;
    if (Math.hypot(sx, sy) <= NEWTON_TOLERANCE * Math.max(1, Math.hypot(px, py))) {
      const [f2, g2] = field(px, py);
      return Number.isFinite(f2) && Number.isFinite(g2) ? [px, py] : null;
    }
  }
  return null;
}

/** Equilibria inside the view, found from a grid of Newton starts and de-duplicated. */
export function findEquilibria(field: Field2, view: Viewport, grid = 24): Equilibrium[] {
  const found: Equilibrium[] = [];
  const dx = (view.xmax - view.xmin) / grid;
  const dy = (view.ymax - view.ymin) / grid;
  const same = (a: number, b: number, c: number, d: number) => Math.abs(a - c) <= 1e-6 * Math.max(1, dx) && Math.abs(b - d) <= 1e-6 * Math.max(1, dy);
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const p = newton2(field, view.xmin + (i + 0.5) * dx, view.ymin + (j + 0.5) * dy);
      if (!p) continue;
      const [x, y] = p;
      if (x < view.xmin || x > view.xmax || y < view.ymin || y > view.ymax) continue;
      if (found.some((e) => same(e.x, e.y, x, y))) continue;
      const J = jacobian(field, x, y);
      found.push({ x, y, jacobian: J, ...classify(J) });
    }
  }
  return found.sort((a, b) => a.x - b.x || a.y - b.y);
}
