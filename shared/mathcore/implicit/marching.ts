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
import { CONTOUR_PROBES, CROSSING_BISECTIONS, STITCH_CANDIDATES, STITCH_ROUNDS, JITTER_MARGIN, MASK_EDGE_PROBE_BLOCK, MASK_MIN_BLOCK, MASK_PROBES_LARGE, MASK_PROBES_SMALL, NEAR_ZERO_CELLS, CROSSING_BISECTIONS_MAX, POLE_TEST_STEP, ROOT_SPREAD_RATIO, STITCH_CELLS, VIEW_BORDER_RELATIVE } from "../constants";
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
  /**
   * Drag frames of dense fields: when at least this fraction of the coarse cells needs refinement, the curve is
   * traced on the coarse cells themselves (refine = 1) instead of on R × R fine cells each. The exact frame follows on
   * release. Absent: always refine.
   */
  coarseWhenDense?: number;
}

export interface ContourResult {
  polylines: Polyline[];
  /** Evaluations of F, including the pole check (STEPS.md §7.1: cost is the number of evaluations). */
  evaluations: number;
  /** True when `coarseWhenDense` took effect: the curve was traced on coarse cells. */
  coarse?: boolean;
}

/**
 * Deterministic pseudo-random offset in (JITTER_MARGIN, 1 − JITTER_MARGIN) for probe q of cell (i, j). Probes at
 * irregular positions turn a pattern that repeats at a fraction of the cell spacing into disagreement with the
 * corners, where probes on a regular sub-grid would land on the same phase as the corners (aliasing).
 */
export function jitter(i: number, j: number, q: number): number {
  let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(q + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return JITTER_MARGIN + (1 - 2 * JITTER_MARGIN) * ((h >>> 0) / 4294967296);
}

/**
 * Per-edge scratch of `contour`, reused between calls (a Worker runs one contour at a time): zero means "nothing
 * recorded", and only the entries a call touched are cleared afterwards, so a call costs time in proportion to its
 * curve, not to the size of the lattice. Frames with more entries than SCRATCH_MAX_EDGES use fresh arrays.
 */
interface ContourScratch {
  /** 0 unknown, 1 no crossing, slot + 2 otherwise. */
  slotOf: Int32Array;
  /** First and second neighbour of a crossing in the chain, plus one (0 = none). */
  nb0: Int32Array;
  nb1: Int32Array;
  used: Uint8Array;
  /** Edge ids whose `slotOf` was set, and crossings linked into the chain (in first-link order). */
  touched: number[];
  nodes: number[];
}
const SCRATCH_MAX_EDGES = 4_000_000;
let sharedScratch: ContourScratch | null = null;
const newScratch = (edges: number): ContourScratch => ({
  slotOf: new Int32Array(edges),
  nb0: new Int32Array(edges),
  nb1: new Int32Array(edges),
  used: new Uint8Array(edges),
  touched: [],
  nodes: [],
});

export function contour(F: (x: number, y: number) => number, vp: Viewport, o: ContourOptions): ContourResult {
  const edges = 2 * (Math.max(1, Math.ceil(o.width / o.cellPx)) * Math.max(1, Math.floor(o.refine)) + 1) * (Math.max(1, Math.ceil(o.height / o.cellPx)) * Math.max(1, Math.floor(o.refine)) + 1);
  if (edges > SCRATCH_MAX_EDGES) return contourWith(newScratch(edges), F, vp, o);
  if (!sharedScratch || sharedScratch.slotOf.length < edges) sharedScratch = newScratch(edges);
  const sc = sharedScratch;
  try {
    return contourWith(sc, F, vp, o);
  } finally {
    for (const id of sc.touched) sc.slotOf[id] = 0;
    for (const id of sc.nodes) {
      sc.nb0[id] = 0;
      sc.nb1[id] = 0;
      sc.used[id] = 0;
    }
    sc.touched.length = 0;
    sc.nodes.length = 0;
  }
}

function contourWith(sc: ContourScratch, F: (x: number, y: number) => number, vp: Viewport, o: ContourOptions): ContourResult {
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

  // The last lattice row and column sit exactly on the view border, so two strips sharing a border evaluate F at
  // the same points there.
  const latX = (i: number) => (i === NX ? vp.xmax : vp.xmin + i * dx);
  const latY = (j: number) => (j === NY ? vp.ymax : vp.ymin + j * dy);
  const value = (i: number, j: number): number => {
    const k = j * stride + i;
    if (known[k] === 0) {
      vals[k] = F(latX(i), latY(j));
      known[k] = 1;
      evaluations++;
    }
    return vals[k];
  };

  // Crossing points are stored by lattice-edge id (2 · vertex index + 1 for a vertical edge): `slotOf[id]` is
  // 0 before the edge is looked at, 1 when it has no crossing (no sign change, or a pole), else 2 + the index of its
  // point in `crossX`/`crossY`. Typed arrays instead of Maps: this is the hot path of every drag frame.
  const NONE = -1;
  const { slotOf, nb0, nb1, used, touched, nodes } = sc;
  touched.length = 0;
  nodes.length = 0;
  let crossX = new Float64Array(256);
  let crossY = new Float64Array(256);
  let crossCount = 0;
  /** Slot of the crossing on a lattice edge, or NONE when the sign change is a pole or the edge has no crossing. */
  const crossing = (i: number, j: number, vertical: boolean, len = 1): number => {
    const id = 2 * (j * stride + i) + (vertical ? 1 : 0);
    const known = slotOf[id];
    if (known !== 0) return known - 2;
    const a = value(i, j);
    const b = vertical ? value(i, j + len) : value(i + len, j);
    let slot = NONE;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 !== b > 0) {
      const ax = latX(i);
      const ay = latY(j);
      // Bisect along the edge (parameter s in [0, 1]) keeping the sign change inside the bracket.
      let lo = 0;
      let hi = 1;
      let flo = a;
      let fhi = b;
      let exact: number | null = a === 0 ? 0 : b === 0 ? 1 : null;
      // Spread |F(hi) − F(lo)| of the bracket: it shrinks with the bracket at a zero, grows at a pole, and stays at a
      // jump of a bounded F (floor), whatever the corner values are (a corner next to a pole can be huge). A steep but
      // finite F (tanh(10⁵·g)) or a weak zero (|d|^0.2) looks like a jump until the bracket is inside its transition,
      // so when the spread has not shrunk after CROSSING_BISECTIONS halvings, bisection goes on (up to
      // CROSSING_BISECTIONS_MAX) and the test is repeated against the spread at that point.
      let reference = NaN;
      let isRoot = false;
      for (let k = 0; k < CROSSING_BISECTIONS_MAX && exact === null; k++) {
        if (k === POLE_TEST_STEP) reference = Math.abs(fhi - flo);
        if (k === CROSSING_BISECTIONS) {
          if (Math.abs(fhi - flo) <= ROOT_SPREAD_RATIO * reference) {
            isRoot = true;
            break;
          }
          reference = Math.abs(fhi - flo);
        }
        const m = (lo + hi) / 2;
        const fm = F(vertical ? ax : ax + m * dx * len, vertical ? ay + m * dy * len : ay);
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
      if (!isRoot) isRoot = exact !== null || (Number.isFinite(lo) && Math.abs(fhi - flo) <= ROOT_SPREAD_RATIO * reference);
      if (isRoot) {
        const t = exact ?? lo + ((hi - lo) * flo) / (flo - fhi);
        if (crossCount === crossX.length) {
          const gx = new Float64Array(2 * crossCount);
          const gy = new Float64Array(2 * crossCount);
          gx.set(crossX);
          gy.set(crossY);
          crossX = gx;
          crossY = gy;
        }
        crossX[crossCount] = vertical ? ax : ax + t * dx * len;
        crossY[crossCount] = vertical ? ay + t * dy * len : ay;
        slot = crossCount++;
      }
    }
    slotOf[id] = slot + 2;
    touched.push(id);
    return slot;
  };

  const edgeId = (i: number, j: number, vertical: boolean) => 2 * (j * stride + i) + (vertical ? 1 : 0);
  // Each crossing is shared by two cells and a cell joins it to one other crossing, so a node has at most two
  // neighbours: first and second are kept in insertion order; `nodes` lists the nodes in the order they were first linked.
  const addNeighbour = (a: number, b: number) => {
    if (nb0[a] === 0) {
      nb0[a] = b + 1;
      nodes.push(a);
    } else nb1[a] = b + 1;
  };
  const link = (a: number, b: number) => {
    addNeighbour(a, b);
    addNeighbour(b, a);
  };

  /** Marching-squares cell with lower-left lattice corner (i, j) and sides of `len` lattice steps. */
  const cell = (i: number, j: number, len = 1) => {
    const v00 = value(i, j);
    const v10 = value(i + len, j);
    const v11 = value(i + len, j + len);
    const v01 = value(i, j + len);
    if (!(Number.isFinite(v00) && Number.isFinite(v10) && Number.isFinite(v11) && Number.isFinite(v01))) return;
    const c0 = v00 > 0 ? 1 : 0;
    const c1 = v10 > 0 ? 1 : 0;
    const c2 = v11 > 0 ? 1 : 0;
    const c3 = v01 > 0 ? 1 : 0;
    if (c0 === c1 && c1 === c2 && c2 === c3) return;
    // Edges in order: bottom, right, top, left.
    const h0 = crossing(i, j, false, len) !== NONE;
    const h1 = crossing(i + len, j, true, len) !== NONE;
    const h2 = crossing(i, j + len, false, len) !== NONE;
    const h3 = crossing(i, j, true, len) !== NONE;
    const id0 = edgeId(i, j, false);
    const id1 = edgeId(i + len, j, true);
    const id2 = edgeId(i, j + len, false);
    const id3 = edgeId(i, j, true);
    const n = (h0 ? 1 : 0) + (h1 ? 1 : 0) + (h2 ? 1 : 0) + (h3 ? 1 : 0);
    if (n === 2) {
      // The two edges that have a crossing, in edge order.
      let first = -1;
      let second = -1;
      if (h0) first = id0;
      if (h1) {
        if (first < 0) first = id1;
        else second = id1;
      }
      if (h2) {
        if (first < 0) first = id2;
        else second = id2;
      }
      if (h3) {
        if (first < 0) first = id3;
        else second = id3;
      }
      link(first, second);
    } else if (n === 4) {
      // Saddle: F at the centre of the cell decides which corners are joined through the middle (the corner average
      // when the centre is undefined).
      const fc = F(vp.xmin + (i + len / 2) * dx, vp.ymin + (j + len / 2) * dy);
      evaluations++;
      const centrePositive = (Number.isFinite(fc) ? fc : (v00 + v10 + v11 + v01) / 4) > 0;
      if (centrePositive === (c0 === 1)) {
        link(id0, id1);
        link(id2, id3);
      } else {
        link(id0, id3);
        link(id2, id1);
      }
    }
    // One or three valid crossings mean a pole removed an edge: the cell draws nothing.
  };

  /**
   * Largest change of F between a corner of the coarse cell at (i0, j0) and its neighbouring coarse lattice points:
   * the local slope over one coarse cell. Looking one cell outward sees a valley that lies inside the cell, where the
   * cell's own corners are almost equal.
   */
  // Slope seen from each coarse lattice point: the largest |ΔF| to its four coarse neighbours, computed once per point
  // (a coarse cell then takes the largest of its four corners). NaN comparisons are false, so undefined neighbours
  // are ignored.
  const pointSlope = new Float64Array((cols + 1) * (rows + 1));
  for (let J = 0; J <= rows; J++) {
    for (let I = 0; I <= cols; I++) {
      const v = value(I * R, J * R);
      let sl = 0;
      if (I < cols) sl = Math.max(sl, Math.abs(value((I + 1) * R, J * R) - v) || 0);
      if (I > 0) sl = Math.max(sl, Math.abs(value((I - 1) * R, J * R) - v) || 0);
      if (J < rows) sl = Math.max(sl, Math.abs(value(I * R, (J + 1) * R) - v) || 0);
      if (J > 0) sl = Math.max(sl, Math.abs(value(I * R, (J - 1) * R) - v) || 0);
      pointSlope[J * (cols + 1) + I] = sl;
    }
  }
  const coarseSlope = (ci: number, cj: number): number => {
    const k = cj * (cols + 1) + ci;
    return Math.max(pointSlope[k], pointSlope[k + 1], pointSlope[k + cols + 1], pointSlope[k + cols + 2]);
  };
  const refined = new Uint8Array(cols * rows);
  let refinedCount = 0;
  // Dense drag frames (see ContourOptions.coarseWhenDense): decided after the coarse pass, which only flags cells.
  let coarse = false;
  const refine = (ci: number, cj: number) => {
    if (ci < 0 || cj < 0 || ci >= cols || cj >= rows || refined[cj * cols + ci]) return;
    refined[cj * cols + ci] = 1;
    refinedCount++;
    if (coarse) cell(ci * R, cj * R, R);
    else for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) cell(ci * R + a, cj * R + b);
  };
  const flagged: number[] = [];
  // Coarse pass: refine cells that change sign, mix defined and undefined corners, or come close to zero.
  for (let cj = 0; cj < rows; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      const i0 = ci * R;
      const j0 = cj * R;
      const a = value(i0, j0);
      const b = value(i0 + R, j0);
      const c = value(i0 + R, j0 + R);
      const d = value(i0, j0 + R);
      if (needsRefinement4(a, b, c, d, coarseSlope(ci, cj))) {
        flagged.push(cj * cols + ci);
        continue;
      }
      // Probes inside the cell: a defined sliver between undefined corners (y = √(ε − x²)), or a sign change that
      // repeats at a fraction of the cell spacing and so does not show at the corners.
      const allUndefined = !Number.isFinite(a) && !Number.isFinite(b) && !Number.isFinite(c) && !Number.isFinite(d);
      for (let q = 0; q < CONTOUR_PROBES; q++) {
        const v = F(vp.xmin + (i0 + R * jitter(ci, cj, 2 * q)) * dx, vp.ymin + (j0 + R * jitter(ci, cj, 2 * q + 1)) * dy);
        evaluations++;
        if (allUndefined ? Number.isFinite(v) : !Number.isFinite(v) || v > 0 !== a > 0) {
          flagged.push(cj * cols + ci);
          break;
        }
      }
    }
  }
  coarse = o.coarseWhenDense !== undefined && R > 1 && flagged.length >= o.coarseWhenDense * cols * rows;
  for (const idx of flagged) refine(idx % cols, Math.floor(idx / cols));
  // Curve following: a curve cannot stop inside the view, so an end lying on the border of a refined coarse cell
  // continues into the neighbour across that border (a spike narrower than a coarse cell is found this way).
  for (let pass = 0; pass < cols * rows; pass++) {
    const before = refinedCount;
    const dangling: number[] = [];
    for (const id of nodes) if (nb1[id] === 0) dangling.push(id);
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
  const polylines: Polyline[] = [];
  const walk = (start: number) => {
    const pts: number[] = [];
    let prev = -1;
    let cur = start;
    const push = (id: number) => {
      const slot = slotOf[id] - 2;
      pts.push(crossX[slot], crossY[slot]);
    };
    for (;;) {
      used[cur] = 1;
      push(cur);
      const a = nb0[cur] - 1;
      const b = nb1[cur] - 1;
      const next = a !== -1 && a !== prev && !used[a] ? a : b !== -1 && b !== prev && !used[b] ? b : -1;
      if (next === -1) {
        // A closed loop returns to its start.
        if ((a === start || b === start) && prev !== start && pts.length > 4) push(start);
        break;
      }
      prev = cur;
      cur = next;
    }
    if (pts.length >= 4) polylines.push(Float64Array.from(pts));
  };
  const order = nodes.slice();
  for (const id of order) if (nb1[id] === 0 && !used[id]) walk(id);
  for (const id of order) if (!used[id]) walk(id);
  const cellScale = coarse ? R : 1;
  return { polylines: stitch(polylines, STITCH_CELLS * Math.hypot(dx * cellScale, dy * cellScale), vp), evaluations, coarse };
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
 *
 * Near-linear: ends are bucketed in a grid of `gap`-sized cells, candidate pairs are matched closest first (each end
 * at most once), and the matched lines are walked into chains and loops.
 */
export function stitch(polylines: Float64Array[], gap: number, vp?: Viewport): Float64Array[] {
  const n = polylines.length;
  const closed = (l: Float64Array) => l.length >= 6 && l[0] === l[l.length - 2] && l[1] === l[l.length - 1];
  const edgeTol = vp ? VIEW_BORDER_RELATIVE * Math.max(vp.xmax - vp.xmin, vp.ymax - vp.ymin) : 0;
  const onBorder = (x: number, y: number) =>
    !!vp && (Math.abs(x - vp.xmin) <= edgeTol || Math.abs(x - vp.xmax) <= edgeTol || Math.abs(y - vp.ymin) <= edgeTol || Math.abs(y - vp.ymax) <= edgeTol);
  // End e = 2k + side: side 0 is the start of line k, side 1 its end.
  const ex = new Float64Array(2 * n);
  const ey = new Float64Array(2 * n);
  const open = new Uint8Array(2 * n);
  const buckets = new Map<string, number[]>();
  const size = gap > 0 ? gap : 1;
  const key = (x: number, y: number) => `${Math.floor(x / size)},${Math.floor(y / size)}`;
  for (let k = 0; k < n; k++) {
    const l = polylines[k];
    if (l.length < 4 || closed(l)) continue;
    for (let side = 0; side < 2; side++) {
      const e = 2 * k + side;
      ex[e] = side === 0 ? l[0] : l[l.length - 2];
      ey[e] = side === 0 ? l[1] : l[l.length - 1];
      if (onBorder(ex[e], ey[e])) continue;
      open[e] = 1;
      const kk = key(ex[e], ey[e]);
      (buckets.get(kk) ?? buckets.set(kk, []).get(kk))?.push(e);
    }
  }
  // Each end proposes only its STITCH_CANDIDATES nearest still-unmatched partners, so ends clustered in one cell (a
  // tangle) cost a distance scan, not a sort of every pair. Pairs are matched closest first; ends left unmatched
  // propose again among the unmatched ones, until a round adds nothing.
  const match = new Int32Array(2 * n).fill(-1);
  const best: Array<[number, number]> = [];
  for (let round = 0; round < STITCH_ROUNDS; round++) {
    const pairs: Array<[number, number, number]> = [];
    for (let e = 0; e < 2 * n; e++) {
      if (!open[e] || match[e] >= 0) continue;
      const bx = Math.floor(ex[e] / size);
      const by = Math.floor(ey[e] / size);
      best.length = 0;
      for (let u = -1; u <= 1; u++) {
        for (let v = -1; v <= 1; v++) {
          for (const f of buckets.get(`${bx + u},${by + v}`) ?? []) {
            if (f === e || match[f] >= 0) continue;
            // A line's own two ends join only when it is long enough to be a loop.
            if (f >> 1 === e >> 1 && polylines[e >> 1].length < 8) continue;
            const d = Math.hypot(ex[e] - ex[f], ey[e] - ey[f]);
            if (d > gap) continue;
            if (best.length < STITCH_CANDIDATES) best.push([d, f]);
            else if (d < best[best.length - 1][0]) best[best.length - 1] = [d, f];
            else continue;
            best.sort((p, q) => p[0] - q[0]);
          }
        }
      }
      for (const [d, f] of best) pairs.push([d, Math.min(e, f), Math.max(e, f)]);
    }
    if (pairs.length === 0) break;
    pairs.sort((p, q) => p[0] - q[0]);
    let added = 0;
    for (const [, e, f] of pairs) {
      if (match[e] < 0 && match[f] < 0) {
        match[e] = f;
        match[f] = e;
        added++;
      }
    }
    if (added === 0) break;
  }
  const out: Float64Array[] = [];
  const visited = new Uint8Array(n);
  // A joined piece whose first point repeats the last point so far is appended without it (no duplicate vertex).
  const push = (acc: number[], x: number, y: number) => {
    if (acc.length >= 2 && acc[acc.length - 2] === x && acc[acc.length - 1] === y) return;
    acc.push(x, y);
  };
  const append = (acc: number[], l: Float64Array, reversed: boolean) => {
    if (!reversed) for (let i = 0; i < l.length; i += 2) push(acc, l[i], l[i + 1]);
    else for (let i = l.length - 2; i >= 0; i -= 2) push(acc, l[i], l[i + 1]);
  };
  /** Walks from end `start` (entering its line there) along matched ends until a free end or back to the start. */
  const walk = (start: number) => {
    const acc: number[] = [];
    let e = start;
    for (;;) {
      const k = e >> 1;
      visited[k] = 1;
      append(acc, polylines[k], (e & 1) === 1);
      const m = match[e ^ 1];
      if (m < 0) break;
      if (visited[m >> 1]) {
        // Close the loop (already closed when the last piece ended exactly on the first point).
        push(acc, acc[0], acc[1]);
        break;
      }
      e = m;
    }
    out.push(Float64Array.from(acc));
  };
  for (let k = 0; k < n; k++) {
    const l = polylines[k];
    if (l.length < 4 || closed(l)) {
      visited[k] = 1;
      out.push(l);
    }
  }
  for (let e = 0; e < 2 * n; e++) if (!visited[e >> 1] && match[e] < 0) walk(e);
  // What is left is made of loops (every end matched).
  for (let k = 0; k < n; k++) if (!visited[k]) walk(2 * k);
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
  /**
   * Blocks that need refinement are sampled every `refineStep` mask pixels in each direction and the value is repeated
   * over the step × step group (1 = every mask pixel). Drag frames use 2 (MASK_REFINE_STEP_DRAG): a dense field
   * refines nearly every block, and the exact frame follows on release.
   */
  refineStep = 1,
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
  const B = cellPx ? Math.max(MASK_MIN_BLOCK, Math.round(cellPx / stride)) : 0;
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
  // Slope seen from each lattice point (largest |ΔF| to its four neighbours), once per point as in `contour`.
  const pointSlope = new Float64Array(lat.length);
  for (let J = 0; J <= ch; J++) {
    for (let I = 0; I <= cw; I++) {
      const v = at(I, J);
      let sl = 0;
      if (I < cw) sl = Math.max(sl, Math.abs(at(I + 1, J) - v) || 0);
      if (I > 0) sl = Math.max(sl, Math.abs(at(I - 1, J) - v) || 0);
      if (J < ch) sl = Math.max(sl, Math.abs(at(I, J + 1) - v) || 0);
      if (J > 0) sl = Math.max(sl, Math.abs(at(I, J - 1) - v) || 0);
      pointSlope[J * (cw + 1) + I] = sl;
    }
  }
  for (let J = 0; J < ch; J++) {
    for (let I = 0; I < cw; I++) {
      const k = J * (cw + 1) + I;
      const slope = Math.max(pointSlope[k], pointSlope[k + 1], pointSlope[k + cw + 1], pointSlope[k + cw + 2]);
      const i1 = Math.min(w, (I + 1) * B);
      const j1 = Math.min(h, (J + 1) * B);
      const c0 = at(I, J);
      const c1 = at(I + 1, J);
      const c2 = at(I + 1, J + 1);
      const c3 = at(I, J + 1);
      let refineBlock = needsRefinement4(c0, c1, c2, c3, slope);
      if (!refineBlock) {
        // Probes at jittered positions inside the block (more when the block is large): a pattern repeating at a
        // fraction of the block spacing, or a defined sliver between undefined corners, does not show at the corners.
        const allUndefined = !Number.isFinite(c0) && !Number.isFinite(c1) && !Number.isFinite(c2) && !Number.isFinite(c3);
        const want = allUndefined ? -1 : inside(c0) ? 1 : 0;
        const x0 = vp.xmin + I * B * sx;
        const y0 = vp.ymax - J * B * sy;
        const wx = (i1 - I * B) * sx;
        const wy = (j1 - J * B) * sy;
        const probes = B >= MASK_EDGE_PROBE_BLOCK ? MASK_PROBES_LARGE : MASK_PROBES_SMALL;
        for (let q = 0; q < probes && !refineBlock; q++) {
          const v = F(x0 + wx * jitter(I, J, 2 * q), y0 - wy * jitter(I, J, 2 * q + 1));
          evaluations++;
          if (allUndefined) refineBlock = Number.isFinite(v);
          else refineBlock = !Number.isFinite(v) || (inside(v) ? 1 : 0) !== want || Math.abs(v) <= NEAR_ZERO_CELLS * slope;
        }
      }
      if (refineBlock) {
        if (refineStep <= 1) {
          for (let j = J * B; j < j1; j++) for (let i = I * B; i < i1; i++) pixel(i, j);
        } else {
          for (let j = J * B; j < j1; j += refineStep) {
            const gh = Math.min(refineStep, j1 - j);
            for (let i = I * B; i < i1; i += refineStep) {
              const gw = Math.min(refineStep, i1 - i);
              const v = F(vp.xmin + (i + gw / 2) * sx, vp.ymax - (j + gh / 2) * sy);
              evaluations++;
              if (Number.isFinite(v) && inside(v)) {
                for (let jj = 0; jj < gh; jj++) for (let ii = 0; ii < gw; ii++) data[(j + jj) * w + i + ii] = 1;
              }
            }
          }
        }
      } else if (Number.isFinite(c0) && inside(c0)) {
        for (let j = J * B; j < j1; j++) data.fill(1, j * w + I * B, j * w + i1);
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
