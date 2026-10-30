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
    expect(r.evaluations).toBeLessThan(fullFine / 2);
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

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Phase 3 review regressions (closed curves, pole filter false rejects)", () => {
  const view = vp(5, 3.125);
  const isClosed = (p: Float64Array) => p[0] === p[p.length - 2] && p[1] === p[p.length - 1];

  it("circles of every size are drawn as one closed loop (300 random circles per size band)", () => {
    const r = rng(314);
    const bands: Array<[number, number]> = [[0.1, 0.3], [0.3, 1], [1, 2.5]];
    for (const [rmin, rmax] of bands) {
      let broken = 0;
      for (let k = 0; k < 300; k++) {
        const rad = rmin + (rmax - rmin) * r();
        const cx = (r() * 2 - 1) * (5 - rad);
        const cy = (r() * 2 - 1) * (3.125 - rad);
        const c = contour((x, y) => (x - cx) ** 2 + (y - cy) ** 2 - rad * rad, view, opts);
        if (!(c.polylines.length === 1 && isClosed(c.polylines[0]))) broken++;
      }
      expect(broken, `radius ${rmin}–${rmax}: ${broken} of 300 not one closed loop`).toBe(0);
    }
  });

  it("a thin ellipse (a = 3, b = 0.05) is one closed loop", () => {
    const c = contour((x, y) => (x / 3) ** 2 + (y / 0.05) ** 2 - 1, view, opts);
    expect(c.polylines).toHaveLength(1);
    expect(isClosed(c.polylines[0])).toBe(true);
  });

  it("oscillating curves stay in one piece: y = sin(10x), y = sin(20x), y = sin(2x²)", () => {
    for (const f of [(x: number) => Math.sin(10 * x), (x: number) => Math.sin(20 * x), (x: number) => Math.sin(2 * x * x)]) {
      const c = contour((x, y) => y - f(x), view, opts);
      expect(c.polylines).toHaveLength(1);
      for (const [x, y] of points(c.polylines)) expect(Math.abs(y - f(x))).toBeLessThan(5e-3);
    }
  });

  it("the heart (x² + y² − 1)³ = x²y³ is one closed curve", () => {
    const c = contour((x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3, vp(2, 1.5), opts);
    expect(c.polylines).toHaveLength(1);
  });

  // Lines 0.8 px apart, (y − c)² = 1e-4, lie inside one fine lattice row (1.5 px) and are not resolvable by sign;
  // the documented limit. Two fine cells apart (3 px) they must both be found.
  it("two lines 3 px apart, (y − c)² = 0.0375², are both found", () => {
    const r = rng(8);
    let missing = 0;
    for (let k = 0; k < 100; k++) {
      const c0 = (r() * 2 - 1) * 2.5;
      const c = contour((x, y) => (y - c0) ** 2 - 0.0375 ** 2, view, opts);
      if (c.polylines.length < 2) missing++;
    }
    expect(missing).toBe(0);
  });

  it("crossings are accurate to a fraction of a fine cell (bisection)", () => {
    const c = contour((x, y) => x * x + y * y - 9, view, opts);
    for (const [x, y] of points(c.polylines)) expect(Math.abs(Math.hypot(x, y) - 3)).toBeLessThan(1e-4);
  });

  it("y = tan(3x) still has no pole lines", () => {
    const c = contour((x, y) => y - Math.tan(3 * x), view, opts);
    for (const p of c.polylines) {
      const xs = Array.from({ length: p.length / 2 }, (_, i) => p[2 * i]);
      for (let k = -5; k <= 5; k++) {
        const pole = (Math.PI / 2 + k * Math.PI) / 3;
        expect(Math.min(...xs) < pole && Math.max(...xs) > pole).toBe(false);
      }
    }
  });
});

describe("randomized properties (implicit engine soundness)", () => {
  /** Random smooth F: a conic plus a trigonometric ripple, with random coefficients. */
  const randomF = (r: () => number) => {
    const [a, b, c, d, e, k, m, s] = Array.from({ length: 8 }, () => r() * 2 - 1);
    return (x: number, y: number) => a * x * x + b * y * y + c * x * y + d * x + e * y - 0.5 + 0.3 * s * Math.sin(2 * k * x + 3 * m * y);
  };
  const view = vp(5, 3.125);
  const fine = 10 / (Math.ceil(400 / 6) * 4);

  it("every contour point lies on its curve: |F(p)| / |∇F(p)| below a tenth of a fine cell (200 random F)", () => {
    const r = rng(1234);
    for (let k = 0; k < 200; k++) {
      const F = randomF(r);
      const c = contour(F, view, opts);
      for (const [x, y] of points(c.polylines)) {
        const h = 1e-6;
        const g = Math.hypot((F(x + h, y) - F(x - h, y)) / (2 * h), (F(x, y + h) - F(x, y - h)) / (2 * h));
        if (g < 1e-6) continue; // tangency: distance is not defined by the gradient
        expect(Math.abs(F(x, y)) / g).toBeLessThan(0.1 * fine);
      }
    }
  });

  it("the adaptive mask agrees with per-pixel evaluation except within a pixel of the boundary (200 random F)", () => {
    const r = rng(77);
    for (let k = 0; k < 200; k++) {
      const F = randomF(r);
      const exact = regionMask(F, view, 200, 125, 1, insideTest("<"));
      const fast = regionMask(F, view, 200, 125, 1, insideTest("<"), 8);
      let mismatches = 0;
      for (let i = 0; i < exact.data.length; i++) if (exact.data[i] !== fast.data[i]) mismatches++;
      expect(mismatches).toBe(0);
      expect(fast.evaluations).toBeLessThanOrEqual(exact.evaluations + (Math.ceil(200 / 8) + 1) * (Math.ceil(125 / 8) + 1));
    }
  });

  it("the adaptive mask evaluates far fewer pixels for a simple region", () => {
    const exact = regionMask((x, y) => x * x + y * y - 4, view, 1600, 1000, 1, insideTest("<"));
    const fast = regionMask((x, y) => x * x + y * y - 4, view, 1600, 1000, 1, insideTest("<"), 8);
    expect(fast.data).toEqual(exact.data);
    expect(fast.evaluations).toBeLessThan(exact.evaluations / 5);
  });

  it("partly undefined regions match per-pixel evaluation (√ domain edge)", () => {
    const F = (x: number, y: number) => y - Math.sqrt(x);
    const exact = regionMask(F, view, 200, 125, 1, insideTest(">="));
    const fast = regionMask(F, view, 200, 125, 1, insideTest(">="), 8);
    expect(fast.data).toEqual(exact.data);
  });
});
