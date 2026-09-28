import { describe, expect, it } from "vitest";
import { parseTransferFunction } from "./laplaceEngine";
import { analyzeForwardZ, deriveInverseZSteps, inverseZ } from "./zTransformEngine";

const text = (steps: Array<{ lines: string[] }>, index: number) => steps[index].lines.join("\n");

describe("forward z-transform derivation", () => {
  it("derives 0.5^n u[n] ↔ z/(z−0.5) with ROC |z|>0.5", () => {
    const result = analyzeForwardZ("(0.5)^{n}u[n]");
    expect(result.error).toBeNull();
    expect(result.steps).toHaveLength(5);
    expect(text(result.steps, 2)).toContain("|z|>0.5");
    expect(text(result.steps, 4)).toContain("|z|>0.5");
    expect(result.system?.numerator).toEqual([1, 0]);
    expect(result.system?.denominator).toEqual([1, -0.5]);
    expect(result.rocKind).toBe("right");
  });
  it("derives the left-sided pair −a^n u[−n−1] with the interior ROC", () => {
    const result = analyzeForwardZ("-(2)^{n}u[-n-1]");
    expect(text(result.steps, 3)).toContain("|z|<2");
    expect(result.system?.numerator).toEqual([1, 0]);
    expect(result.system?.denominator).toEqual([1, -2]);
    expect(result.rocKind).toBe("left");
  });
  it("combines terms and intersects ROCs into an annulus", () => {
    const result = analyzeForwardZ("(0.5)^{n}u[n]-(2)^{n}u[-n-1]");
    expect(text(result.steps, 4)).toContain("0.5<|z|<2");
    expect(result.rocKind).toBe("two-sided");
  });
  it("sifts a delayed impulse", () => { expect(analyzeForwardZ("\\delta[n-2]").system?.denominator).toEqual([1, 0, 0]); });
});

describe("inverse z-transform derivation", () => {
  it("recovers a·pⁿu[n] for a right-sided ROC", () => {
    const system = parseTransferFunction("z/(z-0.5)", "z");
    const result = inverseZ(system, "right");
    expect(result.value(0)).toBeCloseTo(1, 6); expect(result.value(3)).toBeCloseTo(0.125, 6); expect(result.value(-1)).toBeCloseTo(0, 6);
    expect(result.timeLatex).toContain("0.5^{n}u[n]");
  });
  it("uses the left-sided form for an interior ROC", () => {
    const result = inverseZ(parseTransferFunction("z/(z-2)", "z"), "left");
    expect(result.value(-1)).toBeCloseTo(-0.5, 6); expect(result.value(2)).toBeCloseTo(0, 6);
  });
  it("expands H(z)/z with two poles and matches the ROC", () => {
    const system = parseTransferFunction("z/((z-0.5)(z-0.25))", "z");
    const steps = deriveInverseZSteps(system, "right");
    expect(steps).toHaveLength(5);
    expect(text(steps, 1)).toContain("\\lim_{z\\to p_{");
    expect(text(steps, 3)).toContain("u[n]");
    const result = inverseZ(system, "right");
    // h[n] = 4(0.5)^n − 4(0.25)^n
    expect(result.value(2)).toBeCloseTo(4 * 0.25 - 4 * 0.0625, 5);
  });
  it("handles a pole at the origin with a delta", () => {
    const result = inverseZ(parseTransferFunction("1/z", "z"), "right");
    expect(result.value(1)).toBeCloseTo(1, 6); expect(result.value(0)).toBeCloseTo(0, 6);
  });
});
