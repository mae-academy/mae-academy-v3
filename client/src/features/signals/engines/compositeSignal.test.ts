import { describe, expect, it } from "vitest";
import { differentiate, nodeToLatex, renameVariable } from "./diracIntegral";
import { analyzeCompositeSignal, createCompositeSignal, integrateFromMinusInfinity, parseCompositeSignal, sampleCompositeSignal } from "./compositeSignal";

function build(source: string) {
  const parsed = parseCompositeSignal(source);
  if (!parsed.ok) throw new Error(parsed.error);
  return createCompositeSignal(parsed.node, parsed.latex);
}

/** Mirrors the pill's click handler: differentiate the parsed node and rebuild a composite model from the result. */
function applyDerivative(source: string) {
  const model = build(source);
  const derivative = differentiate(model.node, "t");
  return build(`x(t)=${nodeToLatex(derivative)}`);
}

/** Mirrors the ∫₋∞ᵗ pill's click handler. */
function applyRunningIntegral(source: string) {
  const model = build(source);
  const antiderivative = integrateFromMinusInfinity(model.node);
  return build(`x(t)=${nodeToLatex(antiderivative)}`);
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

  it("straddles a step discontinuity with a t0⁻/t0⁺ wall pair instead of a diagonal or a gap", () => {
    const model = build("x(t)=u(t)");
    const [segment] = sampleCompositeSignal(model, -2, 2);
    const wallIndex = segment.findIndex((point, index) => index > 0 && Math.abs(point.value - segment[index - 1].value) > 0.5);
    expect(wallIndex).toBeGreaterThan(0);
    const [before, after] = [segment[wallIndex - 1], segment[wallIndex]];
    expect(after.time - before.time).toBeLessThan(1e-4); // a near-vertical wall, not a slanted ramp
    expect(before.value).toBeCloseTo(0, 6);
    expect(after.value).toBeCloseTo(1, 6);
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

  describe("derivative quick action (d/dt)", () => {
    it("synthesizes two opposite-signed impulses at the rect(t) jump edges", () => {
      const model = applyDerivative("x(t)=\\text{rect}(t)");
      expect(model.impulses).toHaveLength(2);
      const byTime = [...model.impulses].sort((a, b) => a.time - b.time);
      expect(byTime[0]).toMatchObject({ time: -0.5, weight: 1 });
      expect(byTime[1]).toMatchObject({ time: 0.5, weight: -1 });
    });

    it("gives u(t) a single unit impulse at the origin", () => {
      const model = applyDerivative("x(t)=u(t)");
      expect(model.impulses).toHaveLength(1);
      expect(model.impulses[0]).toMatchObject({ time: 0, weight: 1 });
    });

    it("keeps smooth signals (sin, cos, exp, r) analytic — no spurious impulses", () => {
      const model = applyDerivative("x(t)=\\sin(2\\pi t)");
      expect(model.impulses).toHaveLength(0);
      expect(model.valueAt(0)).toBeCloseTo(2 * Math.PI * Math.cos(0), 4); // d/dt sin(2πt) = 2π cos(2πt)
    });

    it("differentiates the ramp r(t) into the plain step u(t), with no impulse", () => {
      const model = applyDerivative("x(t)=r(t)");
      expect(model.impulses).toHaveLength(0);
      expect(model.valueAt(-1)).toBeCloseTo(0, 6);
      expect(model.valueAt(1)).toBeCloseTo(1, 6);
    });

    it("scales the sgn(t) impulse by 2", () => {
      const model = applyDerivative("x(t)=\\text{sgn}(t)");
      expect(model.impulses).toHaveLength(1);
      expect(model.impulses[0]).toMatchObject({ time: 0, weight: 2 });
    });
  });

  describe("running integral quick action (∫₋∞ᵗ)", () => {
    it("accumulates δ(t) into u(t)", () => {
      const model = applyRunningIntegral("x(t)=\\delta(t)");
      expect(model.valueAt(-1)).toBeCloseTo(0, 6);
      expect(model.valueAt(1)).toBeCloseTo(1, 6);
    });

    it("accumulates u(t) into the ramp r(t)", () => {
      const model = applyRunningIntegral("x(t)=u(t)");
      expect(model.valueAt(-2)).toBeCloseTo(0, 6);
      expect(model.valueAt(3)).toBeCloseTo(3, 6);
    });

    it("accumulates rect(t) into a ramp from -0.5 that saturates at 1", () => {
      const model = applyRunningIntegral("x(t)=\\text{rect}(t)");
      expect(model.valueAt(-1)).toBeCloseTo(0, 6);
      expect(model.valueAt(0)).toBeCloseTo(0.5, 6); // halfway up the ramp
      expect(model.valueAt(2)).toBeCloseTo(1, 6); // saturated
    });

    it("reports a friendly error for a non-convergent running integral instead of guessing", () => {
      const model = build("x(t)=\\sin(2\\pi t)");
      expect(() => integrateFromMinusInfinity(model.node)).toThrow(/closed-form|convergent/i);
    });
  });

  describe("explicit operator syntax (typed directly into the equation)", () => {
    it("keeps \\int_{-\\infty}^{t}\\delta(\\tau)d\\tau in the parsed latex while plotting u(t)", () => {
      const parsed = parseCompositeSignal("x(t)=\\int_{-\\infty}^{t}\\delta(\\tau)d\\tau");
      expect(parsed.ok).toBe(true);
      const model = build("x(t)=\\int_{-\\infty}^{t}\\delta(\\tau)d\\tau");
      expect(model.valueAt(-1)).toBeCloseTo(0, 6);
      expect(model.valueAt(1)).toBeCloseTo(1, 6);
    });

    it("accumulates an explicit running integral of u(τ) into the ramp r(t)", () => {
      const model = build("x(t)=\\int_{-\\infty}^{t}u(\\tau)d\\tau");
      expect(model.valueAt(-2)).toBeCloseTo(0, 6);
      expect(model.valueAt(3)).toBeCloseTo(3, 6);
    });

    it("straddles the running integral's internal δ-jump with a crisp wall, not a diagonal", () => {
      const model = build("x(t)=\\int_{-\\infty}^{t}\\delta(\\tau)d\\tau");
      expect(model.breakpoints).toContain(0);
      const [segment] = sampleCompositeSignal(model, -2, 2);
      const wallIndex = segment.findIndex((point, index) => index > 0 && Math.abs(point.value - segment[index - 1].value) > 0.5);
      expect(wallIndex).toBeGreaterThan(0);
      expect(segment[wallIndex].time - segment[wallIndex - 1].time).toBeLessThan(1e-4);
    });

    it("evaluates an explicit derivative wrapper of rect(t) into a pair of Dirac impulses", () => {
      const model = build("x(t)=\\frac{d}{dt}\\left[\\text{rect}(t)\\right]");
      expect(model.impulses).toHaveLength(2);
      const byTime = [...model.impulses].sort((a, b) => a.time - b.time);
      expect(byTime[0]).toMatchObject({ time: -0.5, weight: 1 });
      expect(byTime[1]).toMatchObject({ time: 0.5, weight: -1 });
    });

    it("evaluates an explicit derivative wrapper of u(t) into a single unit impulse", () => {
      const model = build("x(t)=\\frac{d}{dt}\\left[u(t)\\right]");
      expect(model.impulses).toHaveLength(1);
      expect(model.impulses[0]).toMatchObject({ time: 0, weight: 1 });
    });

    it("folds an embedded definite integral into its constant value alongside other terms", () => {
      const model = build("x(t)=u(t)+\\int_{0}^{2}e^{\\tau-2}\\delta(2\\tau-4)d\\tau");
      expect(model.valueAt(-1)).toBeCloseTo(0.5, 6); // u(-1)=0, plus the constant 0.5
      expect(model.valueAt(1)).toBeCloseTo(1.5, 6); // u(1)=1, plus the constant 0.5
    });

    it("surfaces a domain error from a nested definite integral as a clean parse failure", () => {
      const parsed = parseCompositeSignal("x(t)=\\int_{-\\infty}^{\\infty}\\sqrt{\\tau-1}\\delta(\\tau+2)d\\tau");
      expect(parsed.ok).toBe(false);
      expect(!parsed.ok && parsed.error).toMatch(/square root/i);
    });

    it("still rejects a genuinely malformed integral instead of silently guessing", () => {
      const parsed = parseCompositeSignal("x(t)=\\int_{0}^{2}\\text{rect}(\\tau)");
      expect(parsed.ok).toBe(false);
    });

    it("round-trips the explicit running-integral pill's τ-renamed latex back through the grammar", () => {
      // Regression: nodeToLatex must emit \tau (a command), not the bare literal "tau" — otherwise the
      // lexer re-splits it into three single-letter idents (t·a·u) and silently multiplies them.
      const model = build("x(t)=u(t)");
      const renamed = renameVariable(model.node, "t", "tau");
      const latex = `x(t)=\\int_{-\\infty}^{t}\\left[${nodeToLatex(renamed)}\\right]\\,d\\tau`;
      expect(latex).not.toContain("tau)"); // no bare, un-escaped "tau" should ever appear
      const rebuilt = build(latex);
      expect(rebuilt.valueAt(-2)).toBeCloseTo(0, 6);
      expect(rebuilt.valueAt(3)).toBeCloseTo(3, 6);
    });
  });
});
