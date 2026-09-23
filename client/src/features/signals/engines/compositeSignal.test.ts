import { describe, expect, it } from "vitest";
import { analyzeCompositeSignal, createCompositeSignal, parseCompositeSignal, sampleCompositeSignal } from "./compositeSignal";

function build(source: string) {
  const parsed = parseCompositeSignal(source);
  if (!parsed.ok) throw new Error(parsed.error);
  return createCompositeSignal(parsed.node, parsed.latex);
}

const auto = { periodicOverride: "auto" as const, windowStart: -5, windowEnd: 5 };

describe("Composite Signal Engine", () => {
  it("parses and samples a multi-term additive expression", () => {
    const model = build("x(t)=\\sin(2\\pi t)+\\cos(4\\pi t)");
    expect(model.valueAt(0)).toBeCloseTo(1, 6); // sin(0)+cos(0) = 0+1
    expect(model.valueAt(0.25)).toBeCloseTo(Math.sin(2 * Math.PI * 0.25) + Math.cos(4 * Math.PI * 0.25), 6);
  });

  it("detects commensurate frequencies as periodic and computes ω0 / T0 via GCD / LCM", () => {
    const model = build("x(t)=\\sin(2\\pi t)+\\cos(4\\pi t)");
    const analysis = analyzeCompositeSignal(model, auto);
    expect(analysis.autoPeriodic).toBe(true);
    expect(analysis.fundamentalAngularFrequency).toBeCloseTo(2 * Math.PI, 4);
    expect(analysis.fundamentalPeriod).toBeCloseTo(1, 4);
    expect(analysis.classification).toBe("Power Signal");
    expect(analysis.power).toBeGreaterThan(0);
  });

  it("classifies rect(t) as an aperiodic Energy Signal over the observation window", () => {
    const model = build("x(t)=\\text{rect}(t)");
    const analysis = analyzeCompositeSignal(model, auto);
    expect(analysis.autoPeriodic).toBe(false);
    expect(analysis.classification).toBe("Energy Signal");
    expect(analysis.energy).toBeCloseTo(1, 2); // rect(t) has unit area and unit energy
  });

  it("subtracts and multiplies additive/multiplicative components correctly", () => {
    const model = build("x(t)=2\\sin(2\\pi t)-\\text{rect}(t-1)");
    expect(model.valueAt(1)).toBeCloseTo(2 * Math.sin(2 * Math.PI) - 1, 6);
    expect(model.valueAt(10)).toBeCloseTo(2 * Math.sin(2 * Math.PI * 10), 6);
  });

  it("extracts a structural Dirac impulse without corrupting the ordinary sampled trace", () => {
    const model = build("x(t)=u(t)+3\\delta(t-2)");
    expect(model.impulses).toHaveLength(1);
    expect(model.impulses[0]).toMatchObject({ time: 2, weight: 3 });
    expect(model.valueAt(2)).toBeCloseTo(1, 6); // only u(t) contributes to the ordinary sample
  });

  it("segments samples around breakpoints so a step edge is never bridged by one line", () => {
    const model = build("x(t)=u(t)");
    const segments = sampleCompositeSignal(model, -2, 2);
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it("respects a manual Aperiodic override even for a purely sinusoidal signal", () => {
    const model = build("x(t)=\\sin(2\\pi t)");
    const analysis = analyzeCompositeSignal(model, { periodicOverride: "aperiodic", windowStart: -1, windowEnd: 1 });
    expect(analysis.fundamentalPeriod).toBeNull();
    expect(analysis.classification).toBe("Energy Signal");
  });

  it("reports a grammar error without throwing", () => {
    const parsed = parseCompositeSignal("x(t)=q(t)");
    expect(parsed.ok).toBe(false);
  });
});
