import { describe, expect, it } from "vitest";
import { classifyPoleStability, findPolynomialRoots, simulateLtiStepResponse } from "./controlMath";
import { closedLoopTransfer, type TransferPolynomial } from "./pidMath";

describe("Control Systems grand logic audit", () => {
  it("resolves poles on the imaginary axis without numerical collapse", () => {
    const roots = findPolynomialRoots([1, 0, 1]);

    expect(roots).toHaveLength(2);
    expect(roots.every((root) => Number.isFinite(root.re) && Number.isFinite(root.im))).toBe(true);
    expect(roots.every((root) => Math.abs(root.re) < 1e-10)).toBe(true);
    expect(roots.map((root) => Math.abs(root.im)).sort()).toEqual([1, 1]);
    expect(classifyPoleStability(roots)).toBe("marginally-stable");
  });

  it("halts an exponentially growing step response at a deterministic safety bound", () => {
    const response = simulateLtiStepResponse([1], [1, -1], 1, 40, 0.01);
    const largestMagnitude = Math.max(...response.y.map((value) => Math.abs(value)));

    expect(response.t.at(-1)).toBeLessThan(40);
    expect(largestMagnitude).toBeLessThanOrEqual(1e9);
    expect(response.y.every(Number.isFinite)).toBe(true);
    expect(response.termination).toBe("unstable-growth");
  });

  it("forms the positive-feedback characteristic denominator when H(s) is negative", () => {
    const unityController: TransferPolynomial = { numerator: [1], denominator: [1], latex: "1" };
    const result = closedLoopTransfer(
      unityController,
      [1],
      [1, 1],
      { numerator: [-1], denominator: [1], latex: "-1" },
    );

    expect(result.closedLoop.numerator).toEqual([1]);
    expect(result.closedLoop.denominator).toEqual([1, 0]);
  });
});
