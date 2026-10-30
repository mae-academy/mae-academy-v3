import { describe, expect, it } from "vitest";
import type { Viewport } from "../ir/types";
import { contour, extentOf, insideTest, regionMask, stitch } from "./marching";

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

describe("Phase 3 re-review regressions", () => {
  const FULL = { width: 1600, height: 1000, cellPx: 6, refine: 4 };
  const DRAG = { width: 1600, height: 1000, cellPx: 12, refine: 2 };
  /** Longest segment lying within `tol` of the vertical line x = x0 (an asymptote drawn as a curve). */
  const verticalAt = (polys: readonly Float64Array[], x0: number, tol: number) => {
    let worst = 0;
    for (const p of polys) {
      for (let i = 0; i + 3 < p.length; i += 2) {
        if (Math.abs(p[i] - x0) < tol && Math.abs(p[i + 2] - x0) < tol) worst = Math.max(worst, Math.abs(p[i + 3] - p[i + 1]));
      }
    }
    return worst;
  };

  it("a pole next to a lattice point is not drawn: y = 1/(x − 0.5) on views where a corner lands at the pole", () => {
    const F = (x: number, y: number) => y - 1 / (x - 0.5);
    const views: Array<[Viewport, number, number]> = [
      [{ xmin: -7, xmax: 3, ymin: -3.125, ymax: 3.125, aspect: "free" }, 800, 500],
      [{ xmin: -5, xmax: 5, ymin: -3, ymax: 3, aspect: "free" }, 1000, 600],
      [{ xmin: -4.5, xmax: 5.5, ymin: -3, ymax: 3, aspect: "free" }, 400, 250],
      [{ xmin: -10, xmax: 10, ymin: -6, ymax: 6, aspect: "free" }, 1600, 1000],
    ];
    for (const [view, width, height] of views) {
      for (const o of [{ cellPx: 6, refine: 4 }, { cellPx: 12, refine: 2 }]) {
        const c = contour(F, view, { width, height, ...o });
        expect(verticalAt(c.polylines, 0.5, 1e-3), JSON.stringify([view, width, o])).toBeLessThan(0.05);
        expect(c.polylines.length).toBeGreaterThanOrEqual(2);
      }
    }
    // Other rational and trigonometric poles.
    for (const [G, x0] of [[(x: number, y: number) => y - 1 / (x - 1) ** 3, 1], [(x: number, y: number) => y * (x + 2) - 1, -2], [(x: number, y: number) => y - Math.tan(x), Math.PI / 2]] as const) {
      const c = contour(G, { xmin: -5, xmax: 5, ymin: -3, ymax: 3, aspect: "free" }, FULL);
      expect(verticalAt(c.polylines, x0, 1e-3)).toBeLessThan(0.05);
    }
  });

  it("a bounded jump is not a crossing: y = floor(x) draws no vertical risers", () => {
    const c = contour((x, y) => y - Math.floor(x), { xmin: -3.3, xmax: 3.3, ymin: -3.1, ymax: 3.1, aspect: "free" }, FULL);
    for (const k of [-2, -1, 0, 1, 2, 3]) expect(verticalAt(c.polylines, k, 1e-3)).toBeLessThan(0.05);
    expect(c.polylines.length).toBeGreaterThanOrEqual(6);
  });

  it("stitching many pieces stays fast: tan x · tan y = 1 at ±60, 1600×1000 full quality", () => {
    const t0 = performance.now();
    const c = contour((x, y) => Math.tan(x) * Math.tan(y) - 1, { xmin: -60, xmax: 60, ymin: -37.5, ymax: 37.5, aspect: "equal" }, FULL);
    const ms = performance.now() - t0;
    // tan x tan y = 1 ⟺ cos(x + y) = 0 where defined: about 76 diagonal lines across this view, cut at the points
    // where tan x or tan y is infinite. Every vertex lies on one of them.
    expect(c.polylines.length).toBeGreaterThan(40);
    expect(c.polylines.length).toBeLessThan(400);
    for (const [x, y] of points(c.polylines)) expect(Math.abs(Math.cos(x + y))).toBeLessThan(1e-3);
    expect(ms).toBeLessThan(2000);
  });

  it("shading agrees with per-pixel evaluation for patterns at the block spacing", () => {
    const mismatch = (F: (x: number, y: number) => number, view: Viewport, width: number, height: number, stride: number, cellPx: number) => {
      const inside = insideTest(">");
      const exact = regionMask(F, view, width, height, stride, inside);
      const fast = regionMask(F, view, width, height, stride, inside, cellPx);
      let bad = 0;
      for (let i = 0; i < exact.data.length; i++) if (exact.data[i] !== fast.data[i]) bad++;
      return bad / exact.data.length;
    };
    for (const h of [20, 21, 22]) {
      const view: Viewport = { xmin: -h, xmax: h, ymin: -h * 0.625, ymax: h * 0.625, aspect: "equal" };
      expect(mismatch((x, y) => Math.sin(40 * x) * Math.sin(40 * y), view, 1600, 1000, 1, 6), `±${h}`).toBeLessThan(0.02);
    }
    // Stripes whose period is exactly one block (6 px) and two blocks.
    const view: Viewport = { xmin: 0, xmax: 1600, ymin: 0, ymax: 1000, aspect: "equal" };
    for (const period of [6, 12]) {
      expect(mismatch((x) => Math.sin((2 * Math.PI * (x - 1)) / period), view, 1600, 1000, 1, 6), `period ${period}`).toBeLessThan(0.02);
    }
    // Drag quality (stride 4, 12 px cells).
    expect(mismatch((x, y) => Math.sin(40 * x) * Math.sin(40 * y), vp(5, 3), 1600, 1000, 4, 12)).toBeLessThan(0.05);
  });

  it("a defined sliver between undefined corners is shaded and drawn: y < √(0.0004 − x²)", () => {
    const F = (x: number, y: number) => y - Math.sqrt(0.0004 - x * x);
    const view = { xmin: -10, xmax: 10, ymin: -6.25, ymax: 6.25, aspect: "equal" as const };
    const inside = insideTest("<");
    const exact = regionMask(F, view, 1600, 1000, 1, inside);
    const fast = regionMask(F, view, 1600, 1000, 1, inside, 6);
    const count = (d: Uint8Array) => d.reduce((n, v) => n + v, 0);
    expect(count(exact.data)).toBeGreaterThan(0);
    expect(count(fast.data)).toBe(count(exact.data));
    expect(contour(F, view, FULL).polylines.length).toBeGreaterThan(0);
  });

  it("the engine's drag setting on a full-size canvas still closes circles", () => {
    const r = rng(7);
    for (let k = 0; k < 200; k++) {
      const cx = (r() - 0.5) * 6;
      const cy = (r() - 0.5) * 3;
      const R = 0.2 + r() * 2;
      const c = contour((x, y) => (x - cx) ** 2 + (y - cy) ** 2 - R * R, vp(8, 5), DRAG);
      const inView = cx - R > -8 && cx + R < 8 && cy - R > -5 && cy + R < 5;
      if (inView) expect(c.polylines.length, `circle ${k}`).toBe(1);
    }
  });
});

describe("stitch", () => {
  it("joins 4000 shuffled, reversed fragments of one circle into one closed loop, quickly", () => {
    const N = 4000;
    const gapAt = (k: number) => (2 * Math.PI * k) / N;
    const frags: Float64Array[] = [];
    for (let k = 0; k < N; k++) {
      // Each fragment leaves a small gap before the next.
      const a = gapAt(k) + 1e-5;
      const b = gapAt(k + 1) - 1e-5;
      const f = Float64Array.of(Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b));
      frags.push(k % 3 === 0 ? Float64Array.of(f[2], f[3], f[0], f[1]) : f);
    }
    const r = rng(3);
    for (let i = frags.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [frags[i], frags[j]] = [frags[j], frags[i]];
    }
    const t0 = performance.now();
    const out = stitch(frags, 1e-4);
    expect(performance.now() - t0).toBeLessThan(300);
    expect(out.length).toBe(1);
    const l = out[0];
    expect(l.length).toBe(4 * N + 2);
    expect(l[0]).toBe(l[l.length - 2]);
    expect(l[1]).toBe(l[l.length - 1]);
  });

  it("never joins ends on the view border, and keeps closed and too-short loops as they are", () => {
    const view: Viewport = { xmin: -1, xmax: 1, ymin: -1, ymax: 1, aspect: "free" };
    const a = Float64Array.of(-1, 0, -0.5, 0.2);
    const b = Float64Array.of(-1, 0.00001, -0.5, -0.2);
    expect(stitch([a, b], 0.01, view).length).toBe(2);
    const closedLoop = Float64Array.of(0, 0, 0.1, 0, 0.1, 0.1, 0, 0);
    const short = Float64Array.of(0.3, 0.3, 0.30001, 0.30001);
    const out = stitch([closedLoop, short], 0.01, view);
    expect(out).toContain(closedLoop);
    expect(out.length).toBe(2);
  });

  it("a matched pair is the closest one: three ends near a point join the nearest two", () => {
    const a = Float64Array.of(0, 0, 1, 0);
    const b = Float64Array.of(1.001, 0, 2, 0);
    const c = Float64Array.of(1.009, 0.001, 1.5, 1);
    const out = stitch([a, b, c], 0.02);
    expect(out.length).toBe(2);
    expect(Array.from(out.find((l) => l.length === 8) ?? [])).toEqual([0, 0, 1, 0, 1.001, 0, 2, 0]);
  });
});
