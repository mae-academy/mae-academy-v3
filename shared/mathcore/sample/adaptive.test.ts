import { describe, expect, it } from "vitest";
import { tangentAt, secantSlope } from "../calculus/derivative";
import { sampleExplicit, sampleParametric, samplePolar } from "./adaptive";
import { closestPoint } from "./closest";

const opts = { tolerance: 0.01, yRange: 12 };

describe("explicit sampling", () => {
  it("returns one connected segment for a smooth function", () => {
    const r = sampleExplicit(Math.sin, -10, 10, opts);
    expect(r.segments).toHaveLength(1);
    const pts = r.segments[0];
    for (let i = 0; i < pts.length; i += 2) expect(pts[i + 1]).toBeCloseTo(Math.sin(pts[i]), 12);
  });

  it("cuts the curve at NaN (undefined domain)", () => {
    const r = sampleExplicit((x) => Math.sqrt(x), -5, 5, opts);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0][0]).toBeGreaterThanOrEqual(0);
  });

  it("cuts at a pole but keeps a steep continuous curve connected", () => {
    const pole = sampleExplicit((x) => 1 / x, -5, 5.3, opts);
    expect(pole.segments.length).toBe(2);
    const steep = sampleExplicit((x) => 50 * Math.atan(100 * x), -5, 5.3, opts);
    expect(steep.segments.length).toBe(1);
  });

  it("cuts a step function whose jumps are small compared with the view (floor on [-10, 10])", () => {
    const r = sampleExplicit(Math.floor, -9.5, 9.5, { tolerance: 20 / 600, yRange: 20 });
    expect(r.segments.length).toBe(20);
  });

  it("cuts at every jump of floor (5 jumps on [-2.5, 2.5])", () => {
    const r = sampleExplicit((x) => 10 * Math.floor(x), -2.5, 2.5, { tolerance: 0.01, yRange: 6 });
    expect(r.segments.length).toBe(6);
  });

  it("tan(x) has one piece per branch on [-5, 5] (poles at ±π/2, ±3π/2)", () => {
    const r = sampleExplicit(Math.tan, -5, 5, opts);
    expect(r.segments.length).toBe(5);
  });

  it("refines where the curve bends and stays within the point budget", () => {
    const r = sampleExplicit((x) => Math.sin(1 / x), 0.01, 1, { tolerance: 0.001, yRange: 2 });
    expect(r.segments.reduce((n, s) => n + s.length / 2, 0)).toBeLessThanOrEqual(4001);
    expect(r.evaluations).toBeGreaterThan(200);
  });

  it("warns about precision loss beyond 1e8 (STEPS.md §9)", () => {
    expect(sampleExplicit((x) => x * 1e9, -1, 1, { tolerance: 1, yRange: 10 }).precisionWarning).toBe(true);
    expect(sampleExplicit((x) => x, -1, 1, opts).precisionWarning).toBe(false);
  });
});

describe("parametric and polar sampling", () => {
  it("samples a unit circle closed and on the curve", () => {
    const r = sampleParametric(Math.cos, Math.sin, 0, 2 * Math.PI, { tolerance: 0.001 });
    expect(r.segments).toHaveLength(1);
    const s = r.segments[0];
    for (let i = 0; i < s.length; i += 2) expect(Math.hypot(s[i], s[i + 1])).toBeCloseTo(1, 12);
    expect(s[0]).toBeCloseTo(s[s.length - 2], 12);
  });

  it("polar cardioid r = 1 + cos θ", () => {
    const r = samplePolar((t) => 1 + Math.cos(t), 0, 2 * Math.PI, { tolerance: 0.001 });
    expect(r.segments).toHaveLength(1);
    const s = r.segments[0];
    for (let i = 0; i < s.length; i += 2) {
      const th = Math.atan2(s[i + 1], s[i]);
      if (Math.hypot(s[i], s[i + 1]) > 1e-6) expect(Math.hypot(s[i], s[i + 1])).toBeCloseTo(1 + Math.cos(th), 9);
    }
  });
});

describe("tangents and tracing (STEPS.md §8.1)", () => {
  it("tangent slope matches f′ within 1e-7 and the slope triangle uses it", () => {
    const t = tangentAt((x) => x ** 3, 2, 0.5);
    expect(t).not.toBeNull();
    expect(Math.abs((t?.slope ?? 0) - 12) / 12).toBeLessThan(1e-7);
    expect(t?.triangle.dy).toBeCloseTo(6, 6);
    expect(tangentAt(Math.sqrt, -1)).toBeNull();
  });

  it("secant slope approaches the tangent as h → 0", () => {
    const errs = [1, 0.1, 0.01, 0.001].map((h) => Math.abs(secantSlope(Math.exp, 1, h) - Math.E));
    for (let i = 1; i < errs.length; i++) expect(errs[i]).toBeLessThan(errs[i - 1]);
  });

  it("finds the closest point on a curve for point-on-curve tracing", () => {
    const r = sampleExplicit((x) => x * x, -3, 3, opts);
    const c = closestPoint(r.segments, 1, 0.5);
    expect(c).not.toBeNull();
    expect(c?.y).toBeCloseTo((c?.x ?? 0) ** 2, 2);
    expect(c?.distance).toBeLessThan(0.5);
  });
});
