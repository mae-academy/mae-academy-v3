import { describe, expect, it } from "vitest";
import { parseTransferFunction } from "@/features/signals/engines/laplaceEngine";
import { buildComplexSurface, colorParameter, heightFor, magnitudeAt, softClamp, SURFACE_HEIGHT } from "@/components/signals/complexSurfaceModel";

describe("complex |H| surface model", () => {
  it("soft clamp is identity below the knee, monotone, and bounded by C", () => {
    expect(softClamp(0.5, 2)).toBe(0.5);
    let previous = 0;
    for (const m of [0.1, 1, 1.5, 1.8, 3, 10, 1e6, Infinity]) {
      const h = softClamp(m, 2);
      expect(h).toBeGreaterThanOrEqual(previous);
      expect(h).toBeLessThanOrEqual(2);
      previous = h;
    }
  });

  it("resolves the two jω resonances of 1/(s²+0.4s+4) near ω = ±2 without flattening them", () => {
    const system = parseTransferFunction("\\frac{1}{s^2+0.4s+4}", "s");
    const surface = buildComplexSurface(system);
    expect(surface.extent).toBe(3);
    const { frequency, magnitude } = surface.slice;
    const peaks: number[] = [];
    for (let i = 1; i < magnitude.length - 1; i++) if (magnitude[i] > magnitude[i - 1] && magnitude[i] >= magnitude[i + 1]) peaks.push(frequency[i]);
    expect(peaks).toHaveLength(2);
    for (const w of peaks) expect(Math.abs(Math.abs(w) - 1.98)).toBeLessThan(0.05);
    // The resonance peak (|H(j2)| ≈ 1.25) stays below the soft-clamp knee: its true shape is kept.
    expect(Math.max(...magnitude)).toBeLessThanOrEqual(0.75 * surface.ceiling);
    expect(surface.ceiling).toBeGreaterThanOrEqual(3.5 * surface.median);
    // Pole chimneys are capped.
    for (const y of surface.vy) expect(y).toBeLessThanOrEqual(SURFACE_HEIGHT + 1e-6);
  });

  it("z-mode evaluates a polar disc spanning r ∈ [0, 2] with the unit-circle slice", () => {
    const system = parseTransferFunction("\\frac{z+0.5}{z^2-1.2z+0.32}", "z");
    const surface = buildComplexSurface(system);
    expect(surface.extent).toBe(2);
    for (const p of surface.slice.points) expect(Math.hypot(p.re, p.im)).toBeCloseTo(1, 10);
    const maxR = Math.max(...Array.from(surface.vx, (x, i) => Math.hypot(x, surface.vz[i])));
    expect(maxR).toBeCloseTo(1, 5);
    expect(heightFor(surface, 0)).toBe(0);
  });

  it("chimneys never plateau: heights keep rising toward a pole and zeros touch the floor", () => {
    const system = parseTransferFunction("\\frac{s}{s^2+4s+13}", "s");
    const surface = buildComplexSurface(system);
    // March toward the pole −2 + j3 along σ: every step is strictly higher, never reaching the ceiling.
    let previous = -1;
    for (const d of [0.6, 0.3, 0.15, 0.08, 0.04, 0.02, 0.01]) {
      const h = heightFor(surface, magnitudeAt(system, -2 + d, 3));
      expect(h).toBeGreaterThan(previous);
      expect(h).toBeLessThan(SURFACE_HEIGHT);
      previous = h;
    }
    expect(heightFor(surface, magnitudeAt(system, 0, 0))).toBe(0);
    expect(softClamp(1e9, 2)).toBeLessThan(2);
  });

  it("renders 1/(s²+4s+13) poles as tall needle spires with a deep gap between them", () => {
    const system = parseTransferFunction("\\frac{1}{s^2+4s+13}", "s");
    const surface = buildComplexSurface(system);
    const at = (re: number, im: number) => heightFor(surface, magnitudeAt(system, re, im)) / SURFACE_HEIGHT;
    // Tall and sharp at the pole −2 + j3 …
    expect(at(-2 + 0.03, 3)).toBeGreaterThan(0.85);
    // … localised: half height is crossed within ~0.3 of the pole, the floor is back by 0.6.
    expect(at(-2 + 0.3, 3)).toBeLessThan(0.55);
    expect(at(-2 + 0.6, 3)).toBeLessThan(0.3);
    // Deep separation between the conjugate pair (on the real axis between them).
    expect(at(-2, 0)).toBeLessThan(0.13);
    // The refined grid places a vertex exactly on each pole: the mesh tip reaches full height.
    expect(Math.max(...surface.vy)).toBeCloseTo(SURFACE_HEIGHT, 5);
  });

  it("colour parameter is continuous, monotone and log-equalised (no low-band crush)", () => {
    const system = parseTransferFunction("\\frac{1}{s^2+4s+13}", "s");
    const surface = buildComplexSurface(system);
    const tau = (m: number) => colorParameter(m, surface.floorScale, surface.ceiling);
    expect(tau(0)).toBe(0);
    expect(tau(Infinity)).toBe(1);
    let previous = -1;
    for (const f of [1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.3, 0.6, 0.95]) { const t = tau(f * surface.ceiling); expect(t).toBeGreaterThan(previous); expect(t).toBeLessThan(1); previous = t; }
    // The median landscape magnitude lands well inside the ramp (cyan-ish), not stuck at the blue end.
    expect(tau(surface.median)).toBeGreaterThan(0.15);
    // Neighbouring vertices differ by a small, continuous τ step (sub-pixel-scale colour deltas).
    let worst = 0;
    const cols = surface.quadCols + 1;
    for (let i = 0; i + 1 < surface.vt.length; i++) if ((i + 1) % cols !== 0) worst = Math.max(worst, Math.abs(surface.vt[i + 1] - surface.vt[i]));
    expect(worst).toBeLessThan(0.7);
    for (const sh of surface.vshade) { expect(sh).toBeGreaterThanOrEqual(0); expect(sh).toBeLessThanOrEqual(1); }
  });
});
