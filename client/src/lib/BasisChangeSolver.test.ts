import { describe, expect, it } from "vitest";
import { BasisChangeSolver } from "./BasisChangeSolver";

describe("Phase 1C basis-change solver", () => {
  const basis = [[2, 1], [1, 1]];
  const transformation = [[2, 0], [0, 3]];

  it("conjugates the standard transformation into the proposed basis and preserves the physical vector", () => {
    const result = BasisChangeSolver.solve(transformation, basis, [[3], [-2]]);
    expect(result.transformationInBasis[0][0]).toBeCloseTo(1, 12);
    expect(result.transformationInBasis[0][1]).toBeCloseTo(-1, 12);
    expect(result.transformationInBasis[1][0]).toBeCloseTo(2, 12);
    expect(result.transformationInBasis[1][1]).toBeCloseTo(4, 12);
    expect(result.sourceStandard).toEqual([[4], [1]]);
    expect(result.transformedStandard).toEqual([[8], [3]]);
    expect(result.transformedCoordinates).toEqual([[5], [-2]]);
    expect(result.inverseResidualInfinityNorm).toBeLessThan(1e-9);
    expect(result.coordinateResidualInfinityNorm).toBeLessThan(1e-9);
    expect(result.conjugacyResidualInfinityNorm).toBeLessThan(1e-9);
  });

  it("preserves a transformation when the proposed basis is the standard identity basis", () => {
    const result = BasisChangeSolver.solve(transformation, [[1, 0], [0, 1]], [[2], [1]]);
    expect(result.transformationInBasis).toEqual(transformation);
    expect(result.sourceStandard).toEqual([[2], [1]]);
    expect(result.transformedCoordinates).toEqual([[4], [3]]);
  });

  it("respects composition under a shared basis", () => {
    const first = [[1, 1], [0, 1]];
    const second = [[2, 0], [0, 3]];
    const composed = [[2, 2], [0, 3]];
    const coordinates = [[1], [2]];
    const once = BasisChangeSolver.solve(composed, basis, coordinates);
    const afterFirst = BasisChangeSolver.solve(first, basis, coordinates);
    const afterSecond = BasisChangeSolver.solve(second, basis, afterFirst.transformedCoordinates);
    expect(afterSecond.transformedCoordinates[0][0]).toBeCloseTo(once.transformedCoordinates[0][0], 12);
    expect(afterSecond.transformedCoordinates[1][0]).toBeCloseTo(once.transformedCoordinates[1][0], 12);
    expect(afterSecond.coordinateResidualInfinityNorm).toBeLessThan(1e-9);
  });

  it("rejects a dependent basis rather than inventing basis coordinates", () => {
    expect(() => BasisChangeSolver.solve(transformation, [[1, 2], [2, 4]], [[1], [0]])).toThrow(/singular|dependent/i);
  });
});
