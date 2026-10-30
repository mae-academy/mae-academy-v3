/**
 * Geometry of a 2×2 linear map for the canvas (STEPS.md §8.2): the coordinate grid deformed by A (lines stay
 * parallel and evenly spaced), î → first column, ĵ → second column, the unit square's image shaded by the
 * determinant, and eigen-directions as lines through the origin.
 */
import type { Viewport } from "../ir/types";
import type { Eigen2, Mat } from "./matrix";
import { determinant, eigen2, powerOfTwoScale } from "./matrix";
import { TRANSFORM_BOX_MARGIN, TRANSFORM_GRID_MAX_LINES, TRANSFORM_RADIAL_LINES } from "../constants";

export interface Transform2Geometry {
  /** Images of the grid lines x = k and y = k that cross the view, each a 2-point polyline [x0, y0, x1, y1]. */
  grid: Float64Array[];
  /** A·î and A·ĵ (the matrix columns). */
  iHat: [number, number];
  jHat: [number, number];
  /** Image of the unit square: (0,0), Aî, Aî + Aĵ, Aĵ. */
  parallelogram: Float64Array;
  det: number;
  orientation: -1 | 0 | 1;
  singular: boolean;
  eigen: Eigen2;
  /** Eigen-directions as lines through the origin clipped to the view (2-point polylines). */
  eigenLines: Float64Array[];
  /**
   * How the eigen-directions are drawn (STEPS.md §8.2: repeated and complex eigenvalues handled explicitly):
   * `lines` two directions; `double` one direction of a repeated eigenvalue (drawn as a double line); `radial` a
   * scalar matrix, every direction is an eigen-direction (radial lines); `rotation` complex α ± iβ, an arc of θ.
   */
  eigenMarker: { kind: "lines" | "double" | "radial" | "rotation"; theta?: number };
}

/** Optional eigen-directions from the analysis (exact when the matrix is rational), so canvas and report agree. */
export interface EigenHint {
  kind: string;
  directions?: Array<[number, number]>;
  rotation?: { theta: number };
}

/** Radial lines drawn for a scalar matrix. */
const RADIAL_LINES = TRANSFORM_RADIAL_LINES;

/** Segment of the line {p + t·d} inside the box (slab clipping), or null if it misses the box. */
export function clipLine2(p: [number, number], d: [number, number], box: { xmin: number; xmax: number; ymin: number; ymax: number }): Float64Array | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  const lo = [box.xmin, box.ymin];
  const hi = [box.xmax, box.ymax];
  for (let k = 0; k < 2; k++) {
    if (d[k] === 0) {
      if (p[k] < lo[k] || p[k] > hi[k]) return null;
      continue;
    }
    const a = (lo[k] - p[k]) / d[k];
    const b = (hi[k] - p[k]) / d[k];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t0 < t1)) return null;
  return Float64Array.of(p[0] + t0 * d[0], p[1] + t0 * d[1], p[0] + t1 * d[0], p[1] + t1 * d[1]);
}

/** Smallest step 1, 2 or 5 × 10ⁿ (n ≥ 0) that keeps `span / step` within `max` lines. */
function gridStride(span: number, max: number): number {
  if (span <= max) return 1;
  const raw = span / max;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function transform2(A: Mat, view: Viewport, hint?: EigenHint): Transform2Geometry {
  const [[a, b], [c, d]] = A;
  const det = determinant(A);
  const eigen = eigen2(A);
  // A slightly larger box, so lines run past the canvas edge.
  const mx = (view.xmax - view.xmin) * TRANSFORM_BOX_MARGIN;
  const my = (view.ymax - view.ymin) * TRANSFORM_BOX_MARGIN;
  const box = { xmin: view.xmin - mx, xmax: view.xmax + mx, ymin: view.ymin - my, ymax: view.ymax + my };
  const grid: Float64Array[] = [];
  const col1: [number, number] = [a, c];
  const col2: [number, number] = [b, d];
  if (!det.singular) {
    // Source coordinates of the box corners (A⁻¹ p): the lines x = k (and y = k) that cross the view are those
    // with k between the smallest and largest first (second) coordinate. A⁻¹ = (A/s)⁻¹/s with s a power of two, so
    // entries near 1e±200 neither overflow nor underflow.
    const s0 = powerOfTwoScale(A);
    const [a1, b1, c1, d1] = [a / s0, b / s0, c / s0, d / s0];
    const det1 = a1 * d1 - b1 * c1;
    const inv = (x: number, y: number): [number, number] => [(d1 * (x / s0) - b1 * (y / s0)) / det1, (-c1 * (x / s0) + a1 * (y / s0)) / det1];
    const corners = [inv(box.xmin, box.ymin), inv(box.xmax, box.ymin), inv(box.xmin, box.ymax), inv(box.xmax, box.ymax)];
    for (const axis of [0, 1]) {
      const ks = corners.map((q) => q[axis]);
      const k0 = Math.floor(Math.min(...ks));
      const k1 = Math.ceil(Math.max(...ks));
      const step = gridStride(k1 - k0, TRANSFORM_GRID_MAX_LINES);
      // Lines x = k run along A·ĵ through k·A·î (and y = k along A·î through k·A·ĵ).
      const through = axis === 0 ? col1 : col2;
      const along = axis === 0 ? col2 : col1;
      // Integer index, not k += step: far from the origin a small step would not change k.
      const first = Math.ceil(k0 / step);
      const count = Math.min(Math.floor(k1 / step) - first, 2 * TRANSFORM_GRID_MAX_LINES);
      for (let i = 0; i <= count; i++) {
        const k = (first + i) * step;
        const seg = clipLine2([k * through[0], k * through[1]], along, box);
        if (seg) grid.push(seg);
      }
    }
  } else {
    // Singular: the whole plane lands on the column space (a line), or on the origin when A = 0.
    const dir: [number, number] = Math.hypot(...col1) >= Math.hypot(...col2) ? col1 : col2;
    if (Math.hypot(...dir) > 0) {
      const seg = clipLine2([0, 0], dir, box);
      if (seg) grid.push(seg);
    }
  }
  const directions: Array<[number, number]> =
    hint?.directions ??
    (eigen.kind === "distinct" ? eigen.vectors : eigen.kind === "defective" ? [eigen.vector] : []);
  const kind = hint?.kind ?? eigen.kind;
  let eigenMarker: Transform2Geometry["eigenMarker"] = { kind: "lines" };
  let lines = directions;
  if (kind === "scalar") {
    eigenMarker = { kind: "radial" };
    lines = Array.from({ length: RADIAL_LINES }, (_, i): [number, number] => [Math.cos((Math.PI * i) / RADIAL_LINES), Math.sin((Math.PI * i) / RADIAL_LINES)]);
  } else if (kind === "defective") eigenMarker = { kind: "double" };
  else if (kind === "complex") {
    eigenMarker = { kind: "rotation", theta: hint?.rotation?.theta ?? (eigen.kind === "complex" ? Math.sign(c || 1) * eigen.theta : undefined) };
    lines = [];
  }
  const eigenLines = lines.map((v) => clipLine2([0, 0], v, box)).filter((l): l is Float64Array => l !== null);
  return {
    grid,
    iHat: col1,
    jHat: col2,
    parallelogram: Float64Array.of(0, 0, a, c, a + b, c + d, b, d, 0, 0),
    det: det.value,
    orientation: det.sign,
    singular: det.singular,
    eigen,
    eigenLines,
    eigenMarker,
  };
}

/**
 * Lines a·x + b·y = c of a 2×2 system, each as a 2-point polyline reaching past the view (STEPS.md §6.1 GaussSystem:
 * the solution is where the lines meet). A row 0·x + 0·y = c has no line and is left out.
 */
export function systemLines2(A: Mat, rhs: number[], view: Viewport): Float64Array[] {
  const w = view.xmax - view.xmin;
  const h = view.ymax - view.ymin;
  const out: Float64Array[] = [];
  A.forEach(([a, b], i) => {
    const c = rhs[i];
    if (Math.abs(b) >= Math.abs(a)) {
      if (b === 0) return;
      const x0 = view.xmin - w;
      const x1 = view.xmax + w;
      out.push(Float64Array.of(x0, (c - a * x0) / b, x1, (c - a * x1) / b));
    } else {
      const y0 = view.ymin - h;
      const y1 = view.ymax + h;
      out.push(Float64Array.of((c - b * y0) / a, y0, (c - b * y1) / a, y1));
    }
  });
  return out;
}
