/**
 * Parallel strips for implicit fields (STEPS.md §7.1 technique 4): the canvas is cut into horizontal strips, each
 * strip is a complete field job (curve + shading) that a Worker can run on its own, and the results are merged.
 *
 * Strip borders fall on coarse-cell and shading-block boundaries, and every strip computes its border from the same
 * formula, so neighbouring strips evaluate F at identical points along the shared border: a curve crossing it ends at
 * the same point in both strips and `stitch` joins it (distance 0). Mask rows line up and are concatenated.
 */
import { MASK_MIN_BLOCK, STITCH_CELLS } from "../constants";
import type { Viewport } from "../ir/types";
import type { Relation } from "./marching";
import { contour, insideTest, regionMask, stitch } from "./marching";

export interface FieldOptions {
  /** View size in CSS pixels. */
  width: number;
  height: number;
  cellPx: number;
  refine: number;
  /** Shading stride (mask pixel = stride × stride CSS pixels); ignored without a relation other than "=". */
  stride: number;
  relation: Relation;
}

export interface FieldResult {
  polylines: Float64Array[];
  /** Shading for inequalities, row 0 at the top. */
  mask: { width: number; height: number; data: Uint8Array } | null;
  evaluations: number;
}

/** Curve and shading of F over one view (one strip, or the whole canvas). */
export function implicitField(F: (x: number, y: number) => number, vp: Viewport, o: FieldOptions): FieldResult {
  const c = contour(F, vp, { width: o.width, height: o.height, cellPx: o.cellPx, refine: o.refine });
  if (o.relation === "=") return { polylines: c.polylines, mask: null, evaluations: c.evaluations };
  const m = regionMask(F, vp, o.width, o.height, o.stride, insideTest(o.relation), o.cellPx);
  return { polylines: c.polylines, mask: { width: m.width, height: m.height, data: m.data }, evaluations: c.evaluations + m.evaluations };
}

export interface Strip {
  /** Pixel rows [top, bottom) of the canvas, row 0 at the top (whole shading rows: see `planStrips`). */
  top: number;
  bottom: number;
  viewport: Viewport;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Strip height unit: a whole number of coarse cells and of shading blocks (same block rule as `regionMask`). */
export function stripUnit(cellPx: number, stride: number): number {
  const block = stride * Math.max(MASK_MIN_BLOCK, Math.round(cellPx / stride));
  const c = Math.max(1, Math.round(cellPx));
  return (c * block) / gcd(c, block);
}

/**
 * Up to `count` strips of whole units, top to bottom, planned in shading rows: the canvas has ⌈height / stride⌉
 * mask rows of equal height, every strip takes whole rows (the last one may reach up to stride − 1 pixels past the
 * canvas bottom, exactly as the single-run mask does), so the merged mask has the single run's rows. Border y values
 * come from one formula, so two strips sharing a border agree on it to the bit.
 */
export function planStrips(vp: Viewport, width: number, height: number, cellPx: number, stride: number, count: number): Strip[] {
  const unitRows = stripUnit(cellPx, stride) / stride;
  const rows = Math.max(1, Math.ceil(height / stride));
  const units = Math.max(1, Math.ceil(rows / unitRows));
  const n = Math.max(1, Math.min(Math.floor(count), units));
  const borderY = (row: number) => (row >= rows ? vp.ymin : vp.ymax - (row / rows) * (vp.ymax - vp.ymin));
  const strips: Strip[] = [];
  for (let k = 0; k < n; k++) {
    const r0 = Math.min(rows, Math.round((k * units) / n) * unitRows);
    const r1 = k === n - 1 ? rows : Math.min(rows, Math.round(((k + 1) * units) / n) * unitRows);
    if (r1 <= r0) continue;
    strips.push({ top: r0 * stride, bottom: r1 * stride, viewport: { ...vp, ymax: borderY(r0), ymin: borderY(r1) } });
  }
  return strips;
}

/** Joins strip results (top to bottom): curves stitched across the borders, mask rows concatenated. */
export function mergeStrips(parts: readonly FieldResult[], vp: Viewport, o: FieldOptions): FieldResult {
  const all = parts.flatMap((p) => p.polylines);
  const R = Math.max(1, Math.floor(o.refine));
  const NX = Math.max(1, Math.ceil(o.width / o.cellPx)) * R;
  const NY = Math.max(1, Math.ceil(o.height / o.cellPx)) * R;
  const gap = STITCH_CELLS * Math.hypot((vp.xmax - vp.xmin) / NX, (vp.ymax - vp.ymin) / NY);
  const polylines = parts.length > 1 ? stitch(all, gap, vp) : all;
  const evaluations = parts.reduce((n, p) => n + p.evaluations, 0);
  if (parts.every((p) => p.mask === null)) return { polylines, mask: null, evaluations };
  const masks = parts.map((p) => p.mask).filter((m): m is NonNullable<FieldResult["mask"]> => m !== null);
  const width = masks[0].width;
  const height = masks.reduce((n, m) => n + m.height, 0);
  const data = new Uint8Array(width * height);
  let offset = 0;
  for (const m of masks) {
    data.set(m.data, offset);
    offset += m.data.length;
  }
  return { polylines, mask: { width, height, data }, evaluations };
}
