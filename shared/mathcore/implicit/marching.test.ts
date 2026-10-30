import { describe, expect, it } from "vitest";
import type { Viewport } from "../ir/types";
import { contour, extentOf, insideTest, regionMask } from "./marching";

const vp = (h: number, v: number): Viewport => ({ xmin: -h, xmax: h, ymin: -v, ymax: v, aspect: "equal" });
const opts = { width: 400, height: 250, cellPx: 6, refine: 4 };
const points = (polys: readonly Float64Array[]) => polys.flatMap((p) => Array.from({ length: p.length / 2 }, (_, i) => [p[2 * i], p[2 * i + 1]] as const));

describe("Marching Squares contour (STEPS.md §7.3)", () => {
  it("a circle x² + y² = 9 is one closed curve whose points lie on it", () => {
    const r = contour((x, y) => x * x + y * y - 9, vp(5, 3.125), opts);
    expect(r.polylines).toHaveLength(1);
    const p = r.polylines[0];
    expect(p[0]).toBeCloseTo(p[p.length - 2], 12);
    expect(p[1]).toBeCloseTo(p[p.length - 1], 12);
    for (const [x, y] of points(r.polylines)) expect(Math.abs(Math.hypot(x, y) - 3)).toBeLessThan(2e-3);
  });

  it("refines only where the curve is: far fewer evaluations than a fine full grid", () => {
    const r = contour((x, y) => x * x + y * y - 9, vp(5, 3.125), opts);
    const fullFine = (Math.ceil(400 / 6) * 4 + 1) * (Math.ceil(250 / 6) * 4 + 1);
    expect(r.evaluations).toBeLessThan(fullFine / 4);
  });

  it("a hyperbola xy = 1 gives two pieces, not joined through the origin", () => {
    const r = contour((x, y) => x * y - 1, vp(5, 3.125), opts);
    expect(r.polylines).toHaveLength(2);
    for (const [x, y] of points(r.polylines)) expect(Math.abs(x * y - 1)).toBeLessThan(0.02);
  });

  it("resolves a saddle: x² − y² = 0 is two crossing lines", () => {
    const r = contour((x, y) => x * x - y * y, vp(4, 4), { width: 100, height: 100, cellPx: 5, refine: 2 });
    for (const [x, y] of points(r.polylines)) expect(Math.abs(Math.abs(x) - Math.abs(y))).toBeLessThan(0.05);
  });

  it("an undefined region draws nothing: y = √x has no curve for x < 0", () => {
    const r = contour((x, y) => y - Math.sqrt(x), vp(5, 3.125), opts);
    expect(r.polylines.length).toBeGreaterThan(0);
    for (const [x] of points(r.polylines)) expect(x).toBeGreaterThanOrEqual(-0.1);
  });

  it("does not draw the vertical lines at the poles of y = tan x", () => {
    const r = contour((x, y) => y - Math.tan(x), vp(5, 3.125), opts);
    expect(r.polylines.length).toBeGreaterThanOrEqual(3);
    for (const [x, y] of points(r.polylines)) expect(Math.abs(y - Math.tan(x))).toBeLessThan(0.1 * Math.max(1, Math.abs(y)));
    // No polyline spans a pole at ±π/2, ±3π/2 (it would run from the bottom to the top of the view).
    for (const p of r.polylines) {
      const ys = Array.from({ length: p.length / 2 }, (_, i) => p[2 * i + 1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6.3);
      const xs = Array.from({ length: p.length / 2 }, (_, i) => p[2 * i]);
      for (const pole of [Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 2, (-3 * Math.PI) / 2]) {
        expect(Math.min(...xs) < pole && Math.max(...xs) > pole).toBe(false);
      }
    }
  });

  it("an empty curve gives no polylines, and a curve outside the view too", () => {
    expect(contour((x, y) => x * x + y * y + 1, vp(5, 3), opts).polylines).toEqual([]);
    expect(contour((x, y) => x * x + y * y - 400, vp(5, 3), opts).polylines).toEqual([]);
  });

  it("reports the extent of the curves for the text description", () => {
    const r = contour((x, y) => x * x + y * y - 9, vp(5, 3.125), opts);
    const e = extentOf(r.polylines);
    expect(e?.xmin).toBeCloseTo(-3, 1);
    expect(e?.ymax).toBeCloseTo(3, 1);
  });
});

describe("inequality region", () => {
  it("shades the inside of x² + y² < 9 with area π·9 within 1%", () => {
    const view = vp(5, 3.125);
    const m = regionMask((x, y) => x * x + y * y - 9, view, 800, 500, 1, insideTest("<"));
    const inside = m.data.reduce((n, v) => n + v, 0);
    const area = (inside / (m.width * m.height)) * 10 * 6.25;
    expect(Math.abs(area - 9 * Math.PI) / (9 * Math.PI)).toBeLessThan(0.01);
  });

  it("strict and non-strict differ only on the boundary; undefined points are outside", () => {
    expect(insideTest("<")(0)).toBe(false);
    expect(insideTest("<=")(0)).toBe(true);
    expect(insideTest(">")(0)).toBe(false);
    expect(insideTest(">=")(0)).toBe(true);
    expect(insideTest("=")(-1)).toBe(false);
    const m = regionMask((x) => Math.sqrt(x) - 1, vp(5, 3), 100, 60, 1, insideTest("<"));
    // Left half (x < 0) is undefined, so it is not shaded; right half is shaded where √x < 1, i.e. 0 ≤ x < 1.
    for (let j = 0; j < m.height; j++) for (let i = 0; i < 50; i++) expect(m.data[j * m.width + i]).toBe(0);
  });

  it("drag quality samples every 4th pixel", () => {
    const m = regionMask((x) => x, vp(5, 3), 400, 250, 4, insideTest(">"));
    expect(m.width).toBe(100);
    expect(m.height).toBe(63);
  });
});
