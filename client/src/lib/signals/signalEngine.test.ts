import { describe, expect, it } from "vitest";
import { analyzeSignal, analyzeWindowedSignal, detectedFundamentalPeriod, evaluateSignal, evaluateWindowedSignal, evenComponent, extractImpulseMarkers, oddComponent, parseSignalExpression } from "./signalEngine";

function ast(source: string) { const parsed = parseSignalExpression(source); if (!parsed.ok) throw new Error(parsed.error); return parsed.ast; }

describe("Signal Operations & Properties engine", () => {
  it("evaluates core deterministic-time signals without representing delta as infinity", () => {
    expect(evaluateSignal(ast("u(t)"), -0.1)).toBe(0);
    expect(evaluateSignal(ast("r(t)"), 2)).toBe(2);
    expect(evaluateSignal(ast("rect(t)"), 0)).toBe(1);
    expect(evaluateSignal(ast("tri(t)"), 0.5)).toBeCloseTo(0.5);
    expect(evaluateSignal(ast("delta(t)"), 0)).toBe(0);
  });

  it("samples a carrier when it multiplies a symbolic Dirac impulse", () => {
    const impulses = extractImpulseMarkers(ast("sin(t)*delta(t-1)"));
    expect(impulses).toHaveLength(1);
    expect(impulses[0].at).toBeCloseTo(1);
    expect(impulses[0].area).toBeCloseTo(Math.sin(1));
    expect(impulses[0].latex).toContain("\\delta");
  });

  it("detects a common fundamental period through integer LCM scaling", () => {
    expect(detectedFundamentalPeriod(ast("sin(t)+cos(2*t)"))).toBeCloseTo(2 * Math.PI, 5);
  });

  it("classifies a finite-duration pulse as an energy signal", () => {
    const result = analyzeSignal(ast("rect(t)"), "aperiodic");
    expect(result.classification).toBe("Energy");
    expect(result.energyEstimate).toBeCloseTo(1, 1);
  });

  it("calculates average power for a declared periodic sinusoid", () => {
    const result = analyzeSignal(ast("sin(t)"), "periodic");
    expect(result.classification).toBe("Power");
    expect(result.averagePower).toBeCloseTo(0.5, 3);
  });

  it("decomposes a shifted signal into mathematically consistent even and odd components", () => {
    const signal = ast("sin(t)+1");
    expect(evenComponent(signal, 0.7)).toBeCloseTo(1, 8);
    expect(oddComponent(signal, 0.7)).toBeCloseTo(Math.sin(0.7), 8);
  });

  it("accepts visual MathLive fractions and command-style named signals", () => {
    const parsed = parseSignalExpression("\\frac{1}{2}\\sin(2\\pi t)+\\operatorname{rect}(t)");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(evaluateSignal(parsed.ast, 0)).toBeCloseTo(1);
  });

  it("zero-pads an aperiodic base window and repeats a periodic base window with modulo extension", () => {
    const signal = ast("rect(t)"); const window = { from: 0, to: 1 };
    expect(evaluateWindowedSignal(signal, -0.1, window, "aperiodic")).toBe(0);
    expect(evaluateWindowedSignal(signal, 0.2, window, "aperiodic")).toBe(1);
    expect(evaluateWindowedSignal(signal, 1.2, window, "periodic")).toBe(1);
  });

  it("derives periodic power from the specified base-window width without a manual override", () => {
    const result = analyzeWindowedSignal(ast("sin(2*pi*t)"), { from: 0, to: 1 }, "periodic");
    expect(result.effectivePeriod).toBeCloseTo(1);
    expect(result.averagePower).toBeCloseTo(0.5, 3);
    expect(result.steps.join(" ")).toContain("t_2-t_1");
  });

  it("normalizes the structured integral and derivative controls emitted by the MathLive keyboard", () => {
    const integral = parseSignalExpression("\\int_{0}^{t}t\\,d\\tau");
    const derivative = parseSignalExpression("\\frac{d}{dt}\\left(t^2\\right)");
    expect(integral.ok).toBe(true);
    expect(derivative.ok).toBe(true);
    if (integral.ok) expect(evaluateSignal(integral.ast, 2)).toBeCloseTo(2, 2);
    if (derivative.ok) expect(evaluateSignal(derivative.ast, 3)).toBeCloseTo(6, 2);
  });
});
