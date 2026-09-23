import { describe, expect, it } from "vitest";
import { evaluateDefiniteIntegral, siftProduct } from "@/features/signals/engines/diracIntegral";
import { createPiecewiseSignal, evaluateBasicSignal, samplePiecewiseSignal, type SignalOperation } from "./signalsEngine";

const operation = (primary: SignalOperation["primary"], transform: Partial<SignalOperation["transform"]> = {}, secondary?: SignalOperation["secondary"]): SignalOperation => ({ primary, secondary, transform: { amplitude: 1, timeScale: 1, timeShift: 0, ...transform } });

describe("piecewise signal dictionary", () => {
  it("evaluates the canonical discontinuous and finite-support signals exactly at their boundaries", () => {
    expect(evaluateBasicSignal({ kind: "step" }, -0.001)).toBe(0);
    expect(evaluateBasicSignal({ kind: "step" }, 0)).toBe(1);
    expect(evaluateBasicSignal({ kind: "ramp" }, -1)).toBe(0);
    expect(evaluateBasicSignal({ kind: "ramp" }, 2)).toBe(2);
    expect(evaluateBasicSignal({ kind: "rect" }, -0.5)).toBe(1);
    expect(evaluateBasicSignal({ kind: "rect" }, 0.5001)).toBe(0);
    expect(evaluateBasicSignal({ kind: "tri" }, 0)).toBe(1);
    expect(evaluateBasicSignal({ kind: "tri" }, 1)).toBe(0);
  });

  it("stabilizes sinc and Sa at the removable singularity", () => {
    expect(evaluateBasicSignal({ kind: "sinc" }, 0)).toBe(1);
    expect(evaluateBasicSignal({ kind: "sa" }, 0)).toBe(1);
  });
});

describe("transformations and symbolic impulses", () => {
  it("maps reflection, scaling, and shifting through y(t)=A x(a t-b)", () => {
    const model = createPiecewiseSignal(operation({ kind: "ramp" }, { amplitude: 2, timeScale: -1, timeShift: 1 }));
    expect(model.valueAt(-2)).toBe(2);
    expect(model.valueAt(0)).toBe(0);
    expect(model.equationLatex).toContain("-t-1");
  });

  it("keeps a Dirac delta symbolic and applies its scale/shift area rule", () => {
    const model = createPiecewiseSignal(operation({ kind: "dirac" }, { amplitude: 4, timeScale: -2, timeShift: 6 }));
    expect(model.valueAt(-3)).toBe(0);
    expect(model.impulses).toHaveLength(1);
    expect(model.impulses[0]).toMatchObject({ time: -3, weight: 2, label: "Area = 2" });
    expect(model.analysis.classification).toBe("Symbolic Distribution");
  });

  it("breaks sampled paths at an actual discontinuity instead of bridging it", () => {
    const model = createPiecewiseSignal(operation({ kind: "step" }));
    expect(samplePiecewiseSignal(model, -1, 1)).toHaveLength(2);
  });
});

describe("energy, power, and periodicity", () => {
  it("uses scale-aware analytic energy for finite-energy signals", () => {
    const model = createPiecewiseSignal(operation({ kind: "rect" }, { amplitude: 2, timeScale: 2 }));
    expect(model.analysis).toMatchObject({ classification: "Energy Signal", energy: 2, power: 0, method: "analytic" });
  });

  it("recognizes sinusoidal power and the GCD fundamental frequency after signal addition", () => {
    const model = createPiecewiseSignal(operation({ kind: "sine", frequencyHz: 10 }, { amplitude: 1, timeScale: -1, timeShift: 0 }, { kind: "cosine", frequencyHz: 15 }));
    expect(model.analysis.classification).toBe("Power Signal");
    expect(model.analysis.fundamentalFrequencyHz).toBe(5);
    expect(model.analysis.fundamentalPeriodSeconds).toBeCloseTo(0.2, 10);
    expect(model.analysis.power).toBeCloseTo(1, 3);
  });

  it("does not misclassify an unbounded ramp as an energy or power signal", () => {
    const model = createPiecewiseSignal(operation({ kind: "ramp" }));
    expect(model.analysis).toMatchObject({ classification: "Neither", energy: Infinity, power: Infinity });
  });
});

const integral = (source: string) => evaluateDefiniteIntegral(source);
const numeric = (source: string) => { const result = integral(source); if (result.kind !== "value") throw new Error(`${result.kind}: ${JSON.stringify(result)}`); return result.value; };

describe("Dirac delta integration rules", () => {
  it("sifts a scaled and shifted impulse with the 1/|A| weight", () => {
    // ∫₀² e^{t-2} δ(2t-4) dt = ½ e⁰ = ½
    expect(numeric("\\int_{0}^{2} e^{t-2}\\delta(2t-4)\\,dt")).toBeCloseTo(0.5, 9);
  });

  it("applies the n-th derivative rule with its (-1)^n and 1/A^n factors", () => {
    // ∫ t³ δ''(t+2) dt = (+1)·x''(-2) = 6(-2) = -12
    expect(numeric("\\int_{-\\infty}^{\\infty} t^3\\delta''(t+2)\\,dt")).toBeCloseTo(-12, 9);
    // ∫₀³ (t-2)² δ'(-t/2+1) dt: A = -½, t₀ = 2, x'(2) = 0
    expect(numeric("\\int_{0}^{3} (t-2)^2\\delta'(-t/2+1)\\,dt")).toBeCloseTo(0, 9);
  });

  it("evaluates the amplitude strictly at the impulse centre", () => {
    expect(numeric("\\int_{-\\infty}^{\\infty} \\sin(t/2)\\delta(t-\\pi)\\,dt")).toBeCloseTo(1, 9);
  });

  it("returns undefined, not NaN, when the amplitude leaves its real domain at t₀", () => {
    const result = integral("\\int_{-\\infty}^{\\infty} \\sqrt{t-1}\\delta(t+2)\\,dt");
    expect(result.kind).toBe("undefined");
    expect(result.kind === "undefined" && result.reason).toMatch(/square root/i);
  });

  it("returns zero when the impulse centre falls outside the bounds", () => {
    expect(numeric("\\int_{0}^{1} t^2\\delta(t-5)\\,dt")).toBe(0);
  });

  it("keeps a running integral symbolic instead of forcing a number", () => {
    expect(integral("\\int_{-\\infty}^{t} x(\\tau)\\,d\\tau").kind).toBe("symbolic");
  });

  it("collapses the sifting product x(t)δ(t-t₀) onto x(t₀)", () => {
    const sifted = siftProduct("(t^2+1)\\delta(t-3)");
    expect(sifted).toMatchObject({ center: 3, weight: 10 });
  });

  it("integrates an ordinary integrand numerically when no impulse is present", () => {
    expect(numeric("\\int_{0}^{\\pi} \\sin(t)\\,dt")).toBeCloseTo(2, 6);
  });
});
