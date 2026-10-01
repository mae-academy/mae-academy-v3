import { describe, expect, it } from "vitest";
import { continuousConvolutionAt, discreteConvolution, overlapBounds, supportRange } from "./convolutionEngine";
import { parseSignalExpression } from "../../../shared/signals/signalEngine";

function signal(source: string) { const parsed = parseSignalExpression(source); if (!parsed.ok) throw new Error(parsed.error); return parsed.ast; }

describe("Convolution Engine", () => {
  it("calculates finite rect support and dynamic overlap bounds", () => {
    expect(supportRange(signal("rect(t)"))).toEqual({ from: -0.5, to: 0.5 });
    expect(overlapBounds(signal("rect(t)"), signal("rect(t)"), 0)).toEqual({ from: -0.5, to: 0.5 });
  });
  it("uses trapezoidal integration for the rectangular-pulse triangle result", () => {
    const x = signal("rect(t)"); const atZero = continuousConvolutionAt(x, x, 0); const atHalf = continuousConvolutionAt(x, x, 0.5);
    expect(atZero.value).toBeCloseTo(1, 2); expect(atHalf.value).toBeCloseTo(0.5, 2); expect(atZero.usedDeltaShortcut).toBe(false);
  });
  it("uses the symbolic shortcut for a shifted Dirac impulse", () => {
    const result = continuousConvolutionAt(signal("rect(t)"), signal("delta(t-2)"), 2);
    expect(result.usedDeltaShortcut).toBe(true); expect(result.value).toBeCloseTo(1); expect(result.points).toHaveLength(0);
  });
  it("computes discrete convolution and records every contributing table cell", () => {
    const result = discreteConvolution([1, 2], [3, 4]);
    expect(result.values).toEqual([3, 10, 8]); expect(result.contributions[1]).toEqual([{ xIndex: 0, hIndex: 1, value: 4, active: true }, { xIndex: 1, hIndex: 0, value: 6, active: true }]);
  });
});
