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
 * Domain rules (STEPS.md §9): a cell with an undefined corner (NaN, ±∞) draws nothing. Every sign change on a lattice
 * edge is bisected (CROSSING_BISECTIONS times): toward a real zero the bracket values shrink, toward a pole (y = tan x
 * written as F = y − tan x) they grow, so the pole is dropped; the bisection also places the crossing accurately.
 *
 * Refinement (two-level quadtree): a coarse cell is refined when its corners change sign, when a corner is undefined,
 * or when a corner value is within NEAR_ZERO_CELLS cell-widths of zero at the local slope, which catches a curve that
 * bulges into a cell without changing its corner signs (the cap of a circle). Curve following then refines the
 * neighbour of any coarse cell where a curve ends on the border (a spike narrower than a coarse cell). Curve ends
 * left less than STITCH_CELLS fine cells apart are finally joined.
 *
 * Limits: a curve where F touches zero without changing sign (x² + y² = 0, (x − y)² = 0) is not found by any
 * sign-based method; a closed curve smaller than a fine cell may be missed.
 */
import { CROSSING_BISECTIONS, NEAR_ZERO_CELLS, STITCH_CELLS } from "../constants";
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
      const ax = vp.xmin + i * dx;
      const ay = vp.ymin + j * dy;
      // Bisect along the edge (parameter s in [0, 1]) keeping the sign change inside the bracket.
      let lo = 0;
      let hi = 1;
      let flo = a;
      let fhi = b;
      let exact: number | null = a === 0 ? 0 : b === 0 ? 1 : null;
      for (let k = 0; k < CROSSING_BISECTIONS && exact === null; k++) {
        const m = (lo + hi) / 2;
        const fm = F(vertical ? ax : ax + m * dx, vertical ? ay + m * dy : ay);
        evaluations++;
        if (!Number.isFinite(fm)) {
          lo = hi = NaN;
          break;
        }
        if (fm === 0) exact = m;
        else if (fm > 0 === flo > 0) {
          lo = m;
          flo = fm;
        } else {
          hi = m;
          fhi = fm;
        }
      }
      // A real zero leaves a bracket whose values shrank; a pole leaves values that grew.
      const isRoot = exact !== null || (Number.isFinite(lo) && Math.max(Math.abs(flo), Math.abs(fhi)) <= Math.max(Math.abs(a), Math.abs(b)));
      if (isRoot) {
        const s = exact ?? lo + ((hi - lo) * flo) / (flo - fhi);
        p = vertical ? [ax, ay + s * dy] : [ax + s * dx, ay];
      }
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

  /**
   * Largest change of F between a corner of the coarse cell at (i0, j0) and its neighbouring coarse lattice points:
   * the local slope over one coarse cell. Looking one cell outward sees a valley that lies inside the cell, where the
   * cell's own corners are almost equal.
   */
  const coarseSlope = (i0: number, j0: number): number => {
    // Hot path (every coarse cell): plain loops, no allocation. NaN comparisons are false, so undefined
    // neighbours are ignored.
    let s = 0;
    for (let c = 0; c < 4; c++) {
      const ci = c === 1 || c === 2 ? i0 + R : i0;
      const cj = c >= 2 ? j0 + R : j0;
      const v = value(ci, cj);
      for (let n = 0; n < 4; n++) {
        const ni = n === 0 ? ci + R : n === 1 ? ci - R : ci;
        const nj = n === 2 ? cj + R : n === 3 ? cj - R : cj;
        if (ni < 0 || nj < 0 || ni > NX || nj > NY) continue;
        const d = Math.abs(value(ni, nj) - v);
        if (d > s) s = d;
      }
    }
    return s;
  };
  const refined = new Uint8Array(cols * rows);
  let refinedCount = 0;
  const refine = (ci: number, cj: number) => {
    if (ci < 0 || cj < 0 || ci >= cols || cj >= rows || refined[cj * cols + ci]) return;
    refined[cj * cols + ci] = 1;
    refinedCount++;
    for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) cell(ci * R + a, cj * R + b);
  };
  // Coarse pass: refine cells that change sign, mix defined and undefined corners, or come close to zero.
  for (let cj = 0; cj < rows; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      const i0 = ci * R;
      const j0 = cj * R;
      if (needsRefinement4(value(i0, j0), value(i0 + R, j0), value(i0 + R, j0 + R), value(i0, j0 + R), coarseSlope(i0, j0))) {
        refine(ci, cj);
      }
    }
  }
  // Curve following: a curve cannot stop inside the view, so an end lying on the border of a refined coarse cell
  // continues into the neighbour across that border (a spike narrower than a coarse cell is found this way).
  for (let pass = 0; pass < cols * rows; pass++) {
    const before = refinedCount;
    const dangling: number[] = [];
    adjacency.forEach((nb, id) => {
      if (nb.length === 1) dangling.push(id);
    });
    for (const id of dangling) {
      const vertical = id % 2 === 1;
      const k = (id - (vertical ? 1 : 0)) / 2;
      const i = k % stride;
      const j = Math.floor(k / stride);
      if (vertical && i % R === 0) {
        refine(i / R - 1, Math.floor(j / R));
        refine(i / R, Math.floor(j / R));
      } else if (!vertical && j % R === 0) {
        refine(Math.floor(i / R), j / R - 1);
        refine(Math.floor(i / R), j / R);
      }
    }
    if (refinedCount === before) break;
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
  return { polylines: stitch(polylines, STITCH_CELLS * Math.hypot(dx, dy), vp), evaluations };
}

/**
 * Coarse-cell test shared by the contour and the region mask: sign change, a partly undefined cell, or a corner
 * within NEAR_ZERO_CELLS cell-widths of zero at the local slope (change of F over one coarse cell; when the caller
 * does not supply it, the largest difference along the cell's own edges).
 */
export function needsRefinement(corner: readonly number[], localSlope?: number): boolean {
  if (corner.length === 4) return needsRefinement4(corner[0], corner[1], corner[2], corner[3], localSlope ?? 0);
  const finite = corner.filter(Number.isFinite);
  if (finite.length === 0) return false;
  if (finite.length < corner.length) return true;
  if (finite.some((v) => v > 0) && finite.some((v) => v <= 0)) return true;
  let slope = localSlope ?? 0;
  for (let k = 0; k < 4; k++) slope = Math.max(slope, Math.abs(corner[k] - corner[(k + 1) % 4]));
  const nearest = Math.min(...finite.map(Math.abs));
  return nearest <= NEAR_ZERO_CELLS * slope;
}

/** `needsRefinement` for four corners without allocating (called for every coarse cell). */
export function needsRefinement4(a: number, b: number, c: number, d: number, localSlope: number): boolean {
  const fa = Number.isFinite(a);
  const fb = Number.isFinite(b);
  const fc = Number.isFinite(c);
  const fd = Number.isFinite(d);
  if (!fa && !fb && !fc && !fd) return false;
  if (!(fa && fb && fc && fd)) return true;
  const pos = (a > 0 ? 1 : 0) + (b > 0 ? 1 : 0) + (c > 0 ? 1 : 0) + (d > 0 ? 1 : 0);
  if (pos !== 0 && pos !== 4) return true;
  const slope = Math.max(localSlope, Math.abs(a - b), Math.abs(b - c), Math.abs(c - d), Math.abs(d - a));
  return Math.min(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) <= NEAR_ZERO_CELLS * slope;
}

/**
 * Joins polyline ends closer than `gap` (gaps left by cells that could not be resolved), closing loops. An end on the
 * border of the view is where the curve leaves it, never a gap, so it is not joined.
 */
export function stitch(polylines: Float64Array[], gap: number, vp?: Viewport): Float64Array[] {
  const lines = polylines.map((p) => Array.from(p));
  const end = (l: number[], atStart: boolean): [number, number] => (atStart ? [l[0], l[1]] : [l[l.length - 2], l[l.length - 1]]);
  const edgeTol = vp ? 1e-9 * Math.max(vp.xmax - vp.xmin, vp.ymax - vp.ymin) : 0;
  const onBorder = (p: [number, number]) =>
    !!vp &&
    (Math.abs(p[0] - vp.xmin) <= edgeTol || Math.abs(p[0] - vp.xmax) <= edgeTol || Math.abs(p[1] - vp.ymin) <= edgeTol || Math.abs(p[1] - vp.ymax) <= edgeTol);
  const dist = (a: [number, number], b: [number, number]) =>
    onBorder(a) || onBorder(b) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1]);
  const closed = (l: number[]) => l.length >= 6 && l[0] === l[l.length - 2] && l[1] === l[l.length - 1];
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < lines.length && !merged; i++) {
      const a = lines[i];
      if (closed(a)) continue;
      // Close a loop whose own ends nearly meet.
      if (a.length >= 8 && dist(end(a, true), end(a, false)) <= gap) {
        a.push(a[0], a[1]);
        merged = true;
        break;
      }
      for (let j = i + 1; j < lines.length && !merged; j++) {
        const b = lines[j];
        if (closed(b)) continue;
        // Try the four end pairings; reverse as needed so a's end meets b's start.
        const options: Array<[boolean, boolean]> = [[false, true], [false, false], [true, true], [true, false]];
        for (const [aStart, bStart] of options) {
          if (dist(end(a, aStart), end(b, bStart)) > gap) continue;
          const aa = aStart ? reversePoints(a) : a;
          const bb = bStart ? b : reversePoints(b);
          lines[i] = aa.concat(bb);
          lines.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  return lines.map((l) => Float64Array.from(l));
}

function reversePoints(l: number[]): number[] {
  const out: number[] = [];
  for (let k = l.length - 2; k >= 0; k -= 2) out.push(l[k], l[k + 1]);
  return out;
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

/**
 * Sign field sampled at pixel centres, `stride` pixels apart (stride 4 while dragging, 1 on release).
 *
 * With `cellPx`, the field is adaptive (STEPS.md §7.1 technique 3): F is evaluated on a coarse lattice first, and a
 * coarse block whose corners agree, are defined and are not near zero (the same test as the contour, `needsRefinement`)
 * is filled without evaluating its pixels. Only blocks near the boundary, or partly undefined, are evaluated per pixel.
 */
export function regionMask(
  F: (x: number, y: number) => number,
  vp: Viewport,
  width: number,
  height: number,
  stride: number,
  inside: (v: number) => boolean,
  cellPx?: number,
): RegionMask {
  const w = Math.max(1, Math.ceil(width / stride));
  const h = Math.max(1, Math.ceil(height / stride));
  const data = new Uint8Array(w * h);
  const sx = (vp.xmax - vp.xmin) / w;
  const sy = (vp.ymax - vp.ymin) / h;
  let evaluations = 0;
  const pixel = (i: number, j: number) => {
    const v = F(vp.xmin + (i + 0.5) * sx, vp.ymax - (j + 0.5) * sy);
    evaluations++;
    data[j * w + i] = Number.isFinite(v) && inside(v) ? 1 : 0;
  };
  const B = cellPx ? Math.max(2, Math.round(cellPx / stride)) : 0;
  if (!B) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pixel(i, j);
    return { width: w, height: h, data, evaluations };
  }
  // Coarse lattice at block corners (mask-pixel boundaries), row 0 at the top like the mask.
  const cw = Math.ceil(w / B);
  const ch = Math.ceil(h / B);
  const lat = new Float64Array((cw + 1) * (ch + 1));
  for (let J = 0; J <= ch; J++) {
    for (let I = 0; I <= cw; I++) {
      lat[J * (cw + 1) + I] = F(vp.xmin + I * B * sx, vp.ymax - J * B * sy);
      evaluations++;
    }
  }
  const at = (I: number, J: number) => lat[J * (cw + 1) + I];
  let slope = 0;
  const diff = (ci: number, cj: number, ni: number, nj: number) => {
    if (ni < 0 || nj < 0 || ni > cw || nj > ch) return;
    const d = Math.abs(at(ni, nj) - at(ci, cj));
    if (d > slope) slope = d;
  };
  for (let J = 0; J < ch; J++) {
    for (let I = 0; I < cw; I++) {
      slope = 0;
      for (let c = 0; c < 4; c++) {
        const ci = c === 1 || c === 2 ? I + 1 : I;
        const cj = c >= 2 ? J + 1 : J;
        diff(ci, cj, ci + 1, cj);
        diff(ci, cj, ci - 1, cj);
        diff(ci, cj, ci, cj + 1);
        diff(ci, cj, ci, cj - 1);
      }
      const i1 = Math.min(w, (I + 1) * B);
      const j1 = Math.min(h, (J + 1) * B);
      const c0 = at(I, J);
      if (needsRefinement4(c0, at(I + 1, J), at(I + 1, J + 1), at(I, J + 1), slope)) {
        for (let j = J * B; j < j1; j++) for (let i = I * B; i < i1; i++) pixel(i, j);
      } else {
        const fill = inside(c0) ? 1 : 0;
        if (fill) for (let j = J * B; j < j1; j++) data.fill(1, j * w + I * B, j * w + i1);
      }
    }
  }
  return { width: w, height: h, data, evaluations };
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
