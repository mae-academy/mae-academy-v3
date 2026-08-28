import { describe, expect, it } from "vitest";
import { analyzeLinearAlgebra, determinantWithSteps, luFactorize, MAX_PEDAGOGICAL_MATRIX_DIMENSION, MAX_PEDAGOGICAL_RHS_COLUMNS } from "./linearAlgebraMath";

describe("Linear Algebra Phase 0 mathematical guardrails", () => {
  it("solves every right-hand-side column and certifies the shared residual", () => {
    const analysis = analyzeLinearAlgebra("solve", [[2, 1], [1, 2]], [[1, 2], [1, 0]]);
    expect(analysis.system?.rankA).toBe(2);
    expect(analysis.system?.rankAugmented).toBe(2);
    expect(analysis.system?.rhs.map((entry) => entry.classification)).toEqual(["unique", "unique"]);
    expect(analysis.system?.solutionMatrix?.[0][0]).toBeCloseTo(1 / 3, 12);
    expect(analysis.system?.solutionMatrix?.[0][1]).toBeCloseTo(4 / 3, 12);
    expect(analysis.system?.solutionMatrix?.[1][0]).toBeCloseTo(1 / 3, 12);
    expect(analysis.system?.solutionMatrix?.[1][1]).toBeCloseTo(-2 / 3, 12);
    expect(analysis.system?.rhs.every((entry) => (entry.residualInfinityNorm ?? Infinity) < 1e-9)).toBe(true);
  });

  it("classifies a mixed multi-RHS augmented system without discarding the later inconsistent column", () => {
    const analysis = analyzeLinearAlgebra("solve", [[1, 1], [2, 2]], [[2, 1], [4, 3]]);
    expect(analysis.system?.rankA).toBe(1);
    expect(analysis.system?.rhs.map((entry) => entry.classification)).toEqual(["infinite", "inconsistent"]);
    expect(analysis.system?.solutionMatrix).toBeUndefined();
    expect(analysis.steps.at(-2)?.latex).toContain("infinite");
    expect(analysis.steps.at(-2)?.latex).toContain("inconsistent");
  });

  it("exports explicit safe pedagogical dimension limits", () => {
    expect(MAX_PEDAGOGICAL_MATRIX_DIMENSION).toBe(8);
    expect(MAX_PEDAGOGICAL_RHS_COLUMNS).toBe(4);
  });

  it("tracks permutation parity and certifies a pivoted LU reconstruction", () => {
    const factorization = luFactorize([[0, 2], [3, 4]]);
    expect(factorization.permutationSign).toBe(-1);
    expect(factorization.status).toBe("regular");
    expect(factorization.determinant).toBeCloseTo(-6, 12);
    expect(factorization.reconstructionResidualInfinityNorm).toBeLessThan(1e-10);
  });

  it("classifies an exactly singular matrix without claiming a full LU reconstruction", () => {
    const determinant = determinantWithSteps([[1, 2], [2, 4]]);
    expect(determinant.value).toBe(0);
    expect(determinant.lu.status).toBe("singular");
    expect(determinant.steps.some((step) => step.id === "lu-singular")).toBe(true);
  });

  it("flags a near-singular pivot while preserving a determinant certificate", () => {
    const factorization = luFactorize([[1, 1], [1, 1 + 1e-10]]);
    expect(factorization.status).toBe("near-singular");
    expect(factorization.determinant).toBeCloseTo(1e-10, 14);
    expect(factorization.reconstructionResidualInfinityNorm).toBeLessThan(1e-10);
  });

  it("emits every pedagogical pivot, swap, elimination, and diagonal-product determinant step", () => {
    const determinant = determinantWithSteps([[0, 2], [3, 4]]);
    const ids = determinant.steps.map((step) => step.id);
    expect(ids).toContain("lu-pivot-0");
    expect(ids).toContain("lu-swap-0-1");
    expect(ids).toContain("lu-eliminate-0-1");
    expect(ids).toContain("lu-pivot-1");
    expect(ids).toContain("lu-diagonal-product");
    expect(determinant.steps.find((step) => step.id === "lu-eliminate-0-1")?.latex).toContain("m_{2,1}");
  });

  it("certifies a full-rank square matrix with a trivial null space and original pivot columns", () => {
    const analysis = analyzeLinearAlgebra("null", [[2, 1], [1, 1]], [[0], [0]]);
    expect(analysis.subspaces).toBeDefined();
    expect(analysis.subspaces?.rank).toBe(2);
    expect(analysis.subspaces?.nullity).toBe(0);
    expect(analysis.subspaces?.pivotColumns).toEqual([0, 1]);
    expect(analysis.subspaces?.columnBasis).toEqual([[2, 1], [1, 1]]);
    expect(analysis.subspaces?.nullBasis).toEqual([]);
    expect(analysis.subspaces?.nullResidualInfinityNorms).toEqual([]);
    expect(analysis.steps.some((step) => step.id === "rank-nullity")).toBe(true);
  });

  it("derives a free-variable null-space basis for a rank-deficient rectangular matrix", () => {
    const A = [[1, 2, 3], [0, 1, 1]];
    const analysis = analyzeLinearAlgebra("null", A, [[0], [0]]);
    expect(analysis.subspaces?.rank).toBe(2);
    expect(analysis.subspaces?.nullity).toBe(1);
    expect(analysis.subspaces?.pivotColumns).toEqual([0, 1]);
    expect(analysis.subspaces?.freeColumns).toEqual([2]);
    expect(analysis.subspaces?.columnBasis).toEqual([[1, 0], [2, 1]]);
    expect(analysis.subspaces?.nullBasis).toEqual([[ -1, -1, 1 ]]);
    expect(analysis.subspaces?.nullResidualInfinityNorms[0]).toBeLessThan(1e-9);
    expect((analysis.subspaces?.rank ?? 0) + (analysis.subspaces?.nullity ?? 0)).toBe(A[0].length);
  });

  it("classifies the zero matrix as a zero-dimensional column space with the canonical null basis", () => {
    const analysis = analyzeLinearAlgebra("null", [[0, 0, 0], [0, 0, 0]], [[0], [0]]);
    expect(analysis.subspaces?.rank).toBe(0);
    expect(analysis.subspaces?.nullity).toBe(3);
    expect(analysis.subspaces?.columnBasis).toEqual([]);
    expect(analysis.subspaces?.nullBasis).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(analysis.subspaces?.nullResidualInfinityNorms.every((residual) => residual < 1e-9)).toBe(true);
  });

  it("builds a basis-change transformation trace without confusing coordinate and standard-space vectors", () => {
    const analysis = analyzeLinearAlgebra("transform", [[2, 0], [0, 3]], [[3], [-2]], [[2, 1], [1, 1]]);
    expect(analysis.basisChange?.transformationInBasis).toEqual([[1, -1], [2, 4]]);
    expect(analysis.basisChange?.sourceStandard).toEqual([[4], [1]]);
    expect(analysis.basisChange?.transformedCoordinates).toEqual([[5], [-2]]);
    expect(analysis.basisChange?.transformedStandard).toEqual([[8], [3]]);
    expect(analysis.basisChange?.coordinateResidualInfinityNorm).toBeLessThan(1e-9);
    expect(analysis.steps.map((step) => step.id)).toContain("basis-geometric-proof");
  });

  it("exposes the three proposed basis vectors as 3D frame columns for the visualizer", () => {
    const basis = [[1, 1, 0], [0, 1, 1], [0, 0, 1]];
    const analysis = analyzeLinearAlgebra("transform", [[2, 1, 0], [1, 2, 1], [0, 1, 2]], [[1], [1], [0]], basis);
    expect(analysis.subspaces?.columnBasis).toEqual([[1, 0, 0], [1, 1, 0], [0, 1, 1]]);
    expect(analysis.originalVector).toEqual([2, 1, 0]);
    expect(analysis.basisChange?.coordinateResidualInfinityNorm).toBeLessThan(1e-9);
  });
});
