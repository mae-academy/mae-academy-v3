/**
 * Phase 1C basis-change engine.
 * This solver is deliberately independent from React and the wider Linear Algebra Studio.
 */

export type BasisMatrix = number[][];
export type BasisCondition = "regular" | "near-singular";

export type BasisChangeResult = {
  basis: BasisMatrix;
  basisInverse: BasisMatrix;
  transformation: BasisMatrix;
  transformationInBasis: BasisMatrix;
  sourceCoordinates: BasisMatrix;
  sourceStandard: BasisMatrix;
  transformedStandard: BasisMatrix;
  transformedCoordinates: BasisMatrix;
  determinant: number;
  condition: BasisCondition;
  pivotThreshold: number;
  inverseResidualInfinityNorm: number;
  coordinateResidualInfinityNorm: number;
  conjugacyResidualInfinityNorm: number;
};

const EPSILON = 1e-9;

function assertRectangular(matrix: BasisMatrix, name: string) {
  if (!matrix.length || !matrix[0].length || matrix.some((row) => row.length !== matrix[0].length)) {
    throw new Error(`${name} must be a non-empty rectangular matrix.`);
  }
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new Error(`${name} contains a non-finite entry.`);
  }
}

function clone(matrix: BasisMatrix): BasisMatrix { return matrix.map((row) => [...row]); }

function identity(size: number): BasisMatrix {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => row === column ? 1 : 0));
}

function multiply(left: BasisMatrix, right: BasisMatrix): BasisMatrix {
  if (left[0].length !== right.length) throw new Error("Basis-change matrix dimensions are incompatible.");
  return left.map((row) => right[0].map((_, column) => row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
}

function matrixInfinityNorm(matrix: BasisMatrix) {
  return matrix.reduce((maximum, row) => Math.max(maximum, row.reduce((sum, value) => sum + Math.abs(value), 0)), 0);
}

function differenceInfinityNorm(left: BasisMatrix, right: BasisMatrix) {
  return matrixInfinityNorm(left.map((row, rowIndex) => row.map((value, columnIndex) => value - right[rowIndex][columnIndex])));
}

function invertWithPartialPivoting(matrix: BasisMatrix) {
  const size = matrix.length;
  const left = clone(matrix);
  const inverse = identity(size);
  const scale = Math.max(1, matrixInfinityNorm(matrix));
  const pivotThreshold = Number.EPSILON * scale * Math.max(1, size) * 64;
  const nearThreshold = Math.sqrt(Number.EPSILON) * scale;
  let determinant = 1;
  let sign = 1;
  let nearSingular = false;

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(left[row][column]) > Math.abs(left[pivotRow][column])) pivotRow = row;
    }
    const pivotMagnitude = Math.abs(left[pivotRow][column]);
    if (pivotMagnitude <= pivotThreshold) {
      throw new Error("The proposed basis is singular or numerically dependent; choose linearly independent basis vectors.");
    }
    if (pivotMagnitude <= nearThreshold) nearSingular = true;
    if (pivotRow !== column) {
      [left[column], left[pivotRow]] = [left[pivotRow], left[column]];
      [inverse[column], inverse[pivotRow]] = [inverse[pivotRow], inverse[column]];
      sign *= -1;
    }
    const pivot = left[column][column];
    determinant *= pivot;
    left[column] = left[column].map((value) => value / pivot);
    inverse[column] = inverse[column].map((value) => value / pivot);
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = left[row][column];
      if (Math.abs(factor) <= EPSILON) continue;
      left[row] = left[row].map((value, index) => Math.abs(value - factor * left[column][index]) <= EPSILON ? 0 : value - factor * left[column][index]);
      inverse[row] = inverse[row].map((value, index) => Math.abs(value - factor * inverse[column][index]) <= EPSILON ? 0 : value - factor * inverse[column][index]);
    }
  }

  return { inverse, determinant: determinant * sign, condition: nearSingular ? "near-singular" as const : "regular" as const, pivotThreshold };
}

export class BasisChangeSolver {
  static solve(transformation: BasisMatrix, basis: BasisMatrix, sourceCoordinates: BasisMatrix): BasisChangeResult {
    assertRectangular(transformation, "Transformation matrix");
    assertRectangular(basis, "Basis matrix");
    assertRectangular(sourceCoordinates, "Coordinate matrix");
    const dimension = basis.length;
    if (basis[0].length !== dimension) throw new Error("A basis-change matrix must be square, with one basis vector per column.");
    if (transformation.length !== dimension || transformation[0].length !== dimension) throw new Error("The transformation must be square and use the same dimension as the proposed basis.");
    if (sourceCoordinates.length !== dimension) throw new Error("Coordinate vectors must have the same dimension as the proposed basis.");

    const inverted = invertWithPartialPivoting(basis);
    const transformationInBasis = multiply(multiply(inverted.inverse, transformation), basis);
    const sourceStandard = multiply(basis, sourceCoordinates);
    const transformedStandard = multiply(transformation, sourceStandard);
    const transformedCoordinates = multiply(transformationInBasis, sourceCoordinates);
    const reconstructedStandard = multiply(basis, transformedCoordinates);
    const identityMatrix = identity(dimension);

    return {
      basis: clone(basis),
      basisInverse: inverted.inverse,
      transformation: clone(transformation),
      transformationInBasis,
      sourceCoordinates: clone(sourceCoordinates),
      sourceStandard,
      transformedStandard,
      transformedCoordinates,
      determinant: inverted.determinant,
      condition: inverted.condition,
      pivotThreshold: inverted.pivotThreshold,
      inverseResidualInfinityNorm: differenceInfinityNorm(multiply(basis, inverted.inverse), identityMatrix),
      coordinateResidualInfinityNorm: differenceInfinityNorm(reconstructedStandard, transformedStandard),
      conjugacyResidualInfinityNorm: differenceInfinityNorm(multiply(basis, transformationInBasis), multiply(transformation, basis)),
    };
  }
}
