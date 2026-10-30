/**
 * Implicit curves F(x, y) = 0 and inequalities (STEPS.md §6.1 Implicit, §7.3, §11 Phase 3).
 *
 * `contour`: evaluate F on a coarse lattice, find the cells whose corners change sign, refine only those cells with a
 * finer lattice, then run Marching Squares on the fine cells. Each crossing sits where linear interpolation of the two
 * corner values gives zero. Crossings are chained into polylines through shared lattice-edge ids, so the output is
 * a few long curves, not thousands of segments.
 *
 * `regionMask`: the sign field of an inequality, one byte per pixel, for ImageData shading.
 *
 * Domain rules (STEPS.md §9): a cell with an undefined corner (NaN, ±∞) draws nothing; a sign change that is really
 * a pole (F jumps from +large to −large, as for y = tan x written as F = y − tan x) is dropped by a monotone-bracket
 * test: halfway between each corner and the crossing, F must keep the corner's sign and not grow.
 */
import type { Viewport } from "../ir/types";
import type { Polyline } from "../sample/adaptive";

export interface ContourOptions {
  /** View size in CSS pixels. */
  width: number;
  height: number;
  /** Coarse cell size in pixels. */
  cellPx: number;
  /** Subdivisions per coarse cell that contains the curve (1 = no refinement). */
  refine: number;
}

export interface ContourResult {
  polylines: Polyline[];
  /** Evaluations of F, including the pole check (STEPS.md §7.1: cost is the number of evaluations). */
  evaluations: number;
}

type Corners = [number, number, number, number];

export function contour(F: (x: number, y: number) => number, vp: Viewport, o: ContourOptions): ContourResult {
  const cols = Math.max(1, Math.ceil(o.width / o.cellPx));
  const rows = Math.max(1, Math.ceil(o.height / o.cellPx));
  const R = Math.max(1, Math.floor(o.refine));
  const NX = cols * R;
  const NY = rows * R;
  const dx = (vp.xmax - vp.xmin) / NX;
  const dy = (vp.ymax - vp.ymin) / NY;
  const stride = NX + 1;
  const vals = new Float64Array(stride * (NY + 1));
  const known = new Uint8Array(vals.length);
  let evaluations = 0;

  const value = (i: number, j: number): number => {
    const k = j * stride + i;
    if (known[k] === 0) {
      vals[k] = F(vp.xmin + i * dx, vp.ymin + j * dy);
      known[k] = 1;
      evaluations++;
    }
    return vals[k];
  };

  /** Crossing point on a lattice edge, or null when the sign change is a pole or the edge has no crossing. */
  const crossings = new Map<number, [number, number] | null>();
  const crossing = (i: number, j: number, vertical: boolean): [number, number] | null => {
    const id = 2 * (j * stride + i) + (vertical ? 1 : 0);
    if (crossings.has(id)) return crossings.get(id) as [number, number] | null;
    const a = value(i, j);
    const b = vertical ? value(i, j + 1) : value(i + 1, j);
    let p: [number, number] | null = null;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 !== b > 0) {
      const t = a === b ? 0.5 : a / (a - b);
      const ax = vp.xmin + i * dx;
      const ay = vp.ymin + j * dy;
      const bx = vertical ? ax : ax + dx;
      const by = vertical ? ay + dy : ay;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      // Pole filter: toward a true zero |F| shrinks and keeps its sign; toward a pole it grows or flips.
      const shrinks = (corner: number, qx: number, qy: number) => {
        if (corner === 0) return true;
        const f = F(qx, qy);
        evaluations++;
        return Number.isFinite(f) && f > 0 === corner > 0 && Math.abs(f) <= Math.abs(corner);
      };
      if (shrinks(a, (ax + x) / 2, (ay + y) / 2) && shrinks(b, (x + bx) / 2, (y + by) / 2)) p = [x, y];
    }
    crossings.set(id, p);
    return p;
  };

  const edgeId = (i: number, j: number, vertical: boolean) => 2 * (j * stride + i) + (vertical ? 1 : 0);
  const adjacency = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a))?.push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b))?.push(a);
  };

  const cell = (i: number, j: number) => {
    const v00 = value(i, j);
    const v10 = value(i + 1, j);
    const v11 = value(i + 1, j + 1);
    const v01 = value(i, j + 1);
    if (!(Number.isFinite(v00) && Number.isFinite(v10) && Number.isFinite(v11) && Number.isFinite(v01))) return;
    const c: Corners = [v00 > 0 ? 1 : 0, v10 > 0 ? 1 : 0, v11 > 0 ? 1 : 0, v01 > 0 ? 1 : 0];
    if (c[0] === c[1] && c[1] === c[2] && c[2] === c[3]) return;
    // Edges in order: bottom, right, top, left.
    const e = [
      [i, j, false],
      [i + 1, j, true],
      [i, j + 1, false],
      [i, j, true],
    ] as const;
    const has = e.map(([ei, ej, v]) => crossing(ei, ej, v) !== null);
    const ids = e.map(([ei, ej, v]) => edgeId(ei, ej, v));
    const n = has.filter(Boolean).length;
    if (n === 2) {
      const [a, b] = ids.filter((_, k) => has[k]);
      link(a, b);
    } else if (n === 4) {
      // Saddle: the centre value decides which corners are joined through the middle of the cell.
      const centrePositive = (v00 + v10 + v11 + v01) / 4 > 0;
      if (centrePositive === (c[0] === 1)) {
        link(ids[0], ids[1]);
        link(ids[2], ids[3]);
      } else {
        link(ids[0], ids[3]);
        link(ids[2], ids[1]);
      }
    }
    // One or three valid crossings mean a pole removed an edge: the cell draws nothing.
  };

  // Coarse pass: only cells whose corners change sign, or mix defined and undefined values, are refined.
  for (let cj = 0; cj < rows; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      const i0 = ci * R;
      const j0 = cj * R;
      const corner = [value(i0, j0), value(i0 + R, j0), value(i0 + R, j0 + R), value(i0, j0 + R)];
      const finite = corner.filter(Number.isFinite);
      if (finite.length === 0) continue;
      const mixedSign = finite.some((v) => v > 0) && finite.some((v) => v <= 0);
      if (!mixedSign && finite.length === 4) continue;
      for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) cell(i0 + a, j0 + b);
    }
  }

  // Chain the segments: open curves start at nodes with one neighbour; what remains are closed loops.
  const point = (id: number): [number, number] => {
    const vertical = id % 2 === 1;
    const k = (id - (vertical ? 1 : 0)) / 2;
    return crossing(k % stride, Math.floor(k / stride), vertical) as [number, number];
  };
  const used = new Set<number>();
  const polylines: Polyline[] = [];
  const walk = (start: number) => {
    const pts: number[] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      used.add(cur);
      const [x, y] = point(cur);
      pts.push(x, y);
      const next = (adjacency.get(cur) ?? []).find((n) => n !== prev && !used.has(n));
      if (next === undefined) {
        // A closed loop returns to its start.
        if ((adjacency.get(cur) ?? []).includes(start) && prev !== start && pts.length > 4) pts.push(...point(start));
        break;
      }
      prev = cur;
      cur = next;
    }
    if (pts.length >= 4) polylines.push(Float64Array.from(pts));
  };
  const nodes = Array.from(adjacency.entries());
  for (const [id, nb] of nodes) if (nb.length === 1 && !used.has(id)) walk(id);
  for (const [id] of nodes) if (!used.has(id)) walk(id);
  return { polylines, evaluations };
}

export type Relation = "=" | "<" | "<=" | ">" | ">=";

/** Which side of F = 0 an inequality shades. */
export function insideTest(relation: Relation): (v: number) => boolean {
  switch (relation) {
    case "<":
      return (v) => v < 0;
    case "<=":
      return (v) => v <= 0;
    case ">":
      return (v) => v > 0;
    case ">=":
      return (v) => v >= 0;
    default:
      return () => false;
  }
}

export interface RegionMask {
  width: number;
  height: number;
  /** Row 0 is the top of the view, as in ImageData; 1 = inside the region. */
  data: Uint8Array;
  evaluations: number;
}

/** Sign field sampled at pixel centres, `stride` pixels apart (stride 4 while dragging, 1 on release). */
export function regionMask(
  F: (x: number, y: number) => number,
  vp: Viewport,
  width: number,
  height: number,
  stride: number,
  inside: (v: number) => boolean,
): RegionMask {
  const w = Math.max(1, Math.ceil(width / stride));
  const h = Math.max(1, Math.ceil(height / stride));
  const data = new Uint8Array(w * h);
  const sx = (vp.xmax - vp.xmin) / w;
  const sy = (vp.ymax - vp.ymin) / h;
  for (let j = 0; j < h; j++) {
    const y = vp.ymax - (j + 0.5) * sy;
    for (let i = 0; i < w; i++) {
      const v = F(vp.xmin + (i + 0.5) * sx, y);
      data[j * w + i] = Number.isFinite(v) && inside(v) ? 1 : 0;
    }
  }
  return { width: w, height: h, data, evaluations: w * h };
}

/** Bounding box of polylines, for the text description of curves without a function graph. */
export function extentOf(polylines: readonly Polyline[]): { xmin: number; xmax: number; ymin: number; ymax: number } | null {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const p of polylines) {
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (p[i] < xmin) xmin = p[i];
      if (p[i] > xmax) xmax = p[i];
      if (p[i + 1] < ymin) ymin = p[i + 1];
      if (p[i + 1] > ymax) ymax = p[i + 1];
    }
  }
  return xmin <= xmax ? { xmin, xmax, ymin, ymax } : null;
}
