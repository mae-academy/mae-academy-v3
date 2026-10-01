/**
 * MAE Academy State-Space Studio — pure TypeScript algebra engine.
 * This file deliberately avoids runtime matrix dependencies so the n=2/n=3
 * learning workspace exposes every linear-control operation client-side.
 */

import type { Matrix, Vector, ComplexValue, PolePlacementResult, StateTrajectory } from "../../../../shared/control/matrixTypes";
import { EPSILON, formatNumber, matrixToLatex, vectorToLatex, complexToLatex } from "../../../../shared/control/matrixTypes";
export type { Matrix, Vector, ComplexValue, PolePlacementResult, StateTrajectory };
export { formatNumber, matrixToLatex, vectorToLatex, complexToLatex };

export const zeros = (rows: number, columns: number): Matrix => Array.from({ length: rows }, () => Array(columns).fill(0));
export const identity = (size: number): Matrix => Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)));
export const cloneMatrix = (matrix: Matrix): Matrix => matrix.map((row) => [...row]);

export function assertMatrix(matrix: Matrix, columns?: number) {
  if (!matrix.length || !matrix.every((row) => row.length === (columns ?? matrix[0].length))) throw new Error("Invalid matrix dimensions.");
}

export function addMatrices(left: Matrix, right: Matrix): Matrix {
  assertMatrix(left); assertMatrix(right, left[0].length);
  if (left.length !== right.length) throw new Error("Matrix addition requires equal dimensions.");
  return left.map((row, rowIndex) => row.map((value, columnIndex) => value + right[rowIndex][columnIndex]));
}

export function subtractMatrices(left: Matrix, right: Matrix): Matrix {
  assertMatrix(left); assertMatrix(right, left[0].length);
  if (left.length !== right.length) throw new Error("Matrix subtraction requires equal dimensions.");
  return left.map((row, rowIndex) => row.map((value, columnIndex) => value - right[rowIndex][columnIndex]));
}

export const scaleMatrix = (matrix: Matrix, scalar: number): Matrix => matrix.map((row) => row.map((value) => value * scalar));

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  assertMatrix(left); assertMatrix(right);
  if (left[0].length !== right.length) throw new Error("Matrix multiplication requires matching inner dimensions.");
  const output = zeros(left.length, right[0].length);
  for (let row = 0; row < left.length; row++) {
    for (let column = 0; column < right[0].length; column++) {
      for (let index = 0; index < right.length; index++) output[row][column] += left[row][index] * right[index][column];
    }
  }
  return output;
}

export const transpose = (matrix: Matrix): Matrix => matrix[0].map((_, column) => matrix.map((row) => row[column]));
export const matrixVectorProduct = (matrix: Matrix, vector: Vector): Vector => matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
export const vectorToColumn = (vector: Vector): Matrix => vector.map((value) => [value]);
export const columnToVector = (matrix: Matrix): Vector => matrix.map((row) => row[0]);

export function determinant(matrix: Matrix): number {
  assertMatrix(matrix);
  if (matrix.length !== matrix[0].length) throw new Error("Determinant requires a square matrix.");
  const working = cloneMatrix(matrix);
  let sign = 1;
  let result = 1;
  for (let column = 0; column < working.length; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < working.length; row++) if (Math.abs(working[row][column]) > Math.abs(working[pivotRow][column])) pivotRow = row;
    if (Math.abs(working[pivotRow][column]) < EPSILON) return 0;
    if (pivotRow !== column) { [working[pivotRow], working[column]] = [working[column], working[pivotRow]]; sign *= -1; }
    const pivot = working[column][column];
    result *= pivot;
    for (let row = column + 1; row < working.length; row++) {
      const factor = working[row][column] / pivot;
      for (let next = column + 1; next < working.length; next++) working[row][next] -= factor * working[column][next];
    }
  }
  return result * sign;
}

export function inverse(matrix: Matrix): Matrix {
  assertMatrix(matrix);
  if (matrix.length !== matrix[0].length) throw new Error("Inverse requires a square matrix.");
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, ...identity(size)[index]]);
  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
    if (Math.abs(augmented[pivotRow][column]) < EPSILON) throw new Error("Matrix is singular and cannot be inverted.");
    if (pivotRow !== column) [augmented[pivotRow], augmented[column]] = [augmented[column], augmented[pivotRow]];
    const pivot = augmented[column][column];
    for (let index = 0; index < size * 2; index++) augmented[column][index] /= pivot;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = 0; index < size * 2; index++) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row.slice(size));
}

export function rank(matrix: Matrix): number {
  assertMatrix(matrix);
  const working = cloneMatrix(matrix);
  let pivotRow = 0;
  for (let column = 0; column < working[0].length && pivotRow < working.length; column++) {
    let candidate = pivotRow;
    for (let row = pivotRow + 1; row < working.length; row++) if (Math.abs(working[row][column]) > Math.abs(working[candidate][column])) candidate = row;
    if (Math.abs(working[candidate][column]) < EPSILON) continue;
    [working[pivotRow], working[candidate]] = [working[candidate], working[pivotRow]];
    const pivot = working[pivotRow][column];
    for (let index = column; index < working[0].length; index++) working[pivotRow][index] /= pivot;
    for (let row = 0; row < working.length; row++) {
      if (row === pivotRow) continue;
      const factor = working[row][column];
      for (let index = column; index < working[0].length; index++) working[row][index] -= factor * working[pivotRow][index];
    }
    pivotRow++;
  }
  return pivotRow;
}

export function matrixPower(matrix: Matrix, exponent: number): Matrix {
  if (matrix.length !== matrix[0].length || exponent < 0 || !Number.isInteger(exponent)) throw new Error("Matrix power requires a non-negative integer power of a square matrix.");
  let result = identity(matrix.length);
  let base = cloneMatrix(matrix);
  let power = exponent;
  while (power > 0) {
    if (power % 2 === 1) result = multiplyMatrices(result, base);
    base = multiplyMatrices(base, base);
    power = Math.floor(power / 2);
  }
  return result;
}

export const trace = (matrix: Matrix): number => matrix.reduce((sum, row, index) => sum + row[index], 0);

/** Faddeev–LeVerrier coefficients for det(sI - A), ordered [1, c1, ..., cn]. */
export function characteristicPolynomial(matrix: Matrix): number[] {
  if (matrix.length !== matrix[0].length) throw new Error("Characteristic polynomial requires a square matrix.");
  const size = matrix.length;
  let b = identity(size);
  const coefficients = [1];
  for (let index = 1; index <= size; index++) {
    const coefficient = -trace(multiplyMatrices(matrix, b)) / index;
    coefficients.push(Math.abs(coefficient) < EPSILON ? 0 : coefficient);
    b = addMatrices(multiplyMatrices(matrix, b), scaleMatrix(identity(size), coefficient));
  }
  return coefficients;
}

const realCubeRoot = (value: number) => (value < 0 ? -Math.pow(-value, 1 / 3) : Math.pow(value, 1 / 3));

/** Real-coefficient polynomial roots up to cubic order; complex roots are returned as pairs. */
export function polynomialRoots(coefficients: number[]): ComplexValue[] {
  const firstNonzero = coefficients.findIndex((value) => Math.abs(value) > EPSILON);
  if (firstNonzero === -1) return [];
  const normalized = coefficients.slice(firstNonzero).map((value) => value / coefficients[firstNonzero]);
  const degree = normalized.length - 1;
  if (degree <= 0) return [];
  if (degree === 1) return [{ re: -normalized[1], im: 0 }];
  if (degree === 2) {
    const [, b, c] = normalized;
    const discriminant = b * b - 4 * c;
    if (discriminant >= -EPSILON) {
      const root = Math.sqrt(Math.max(0, discriminant));
      return [{ re: (-b + root) / 2, im: 0 }, { re: (-b - root) / 2, im: 0 }];
    }
    const imaginary = Math.sqrt(-discriminant) / 2;
    return [{ re: -b / 2, im: imaginary }, { re: -b / 2, im: -imaginary }];
  }
  if (degree === 3) {
    const [, a, b, c] = normalized;
    const p = b - (a * a) / 3;
    const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
    const discriminant = (q * q) / 4 + (p * p * p) / 27;
    if (discriminant >= -EPSILON) {
      const root = Math.sqrt(Math.max(0, discriminant));
      const u = realCubeRoot(-q / 2 + root);
      const v = realCubeRoot(-q / 2 - root);
      const realRoot = u + v - a / 3;
      const complexReal = -(u + v) / 2 - a / 3;
      const complexImaginary = (Math.sqrt(3) / 2) * (u - v);
      return [{ re: realRoot, im: 0 }, { re: complexReal, im: complexImaginary }, { re: complexReal, im: -complexImaginary }];
    }
    const radius = 2 * Math.sqrt(-p / 3);
    const angle = Math.acos((3 * q / (2 * p)) * Math.sqrt(-3 / p));
    return [0, 1, 2].map((index) => ({ re: radius * Math.cos((angle + 2 * Math.PI * index) / 3) - a / 3, im: 0 }));
  }
  throw new Error("The studio supports eigenvalue extraction through third-order systems.");
}

export const eigenvalues = (matrix: Matrix): ComplexValue[] => polynomialRoots(characteristicPolynomial(matrix));

export function controllabilityMatrix(a: Matrix, b: Matrix): Matrix {
  const size = a.length;
  if (b.length !== size || b[0].length !== 1) throw new Error("B must have n rows and one column.");
  return a.map((_, row) => Array.from({ length: size }, (_, power) => multiplyMatrices(matrixPower(a, power), b)[row][0]));
}

export function observabilityMatrix(a: Matrix, c: Matrix): Matrix {
  const size = a.length;
  if (c.length !== 1 || c[0].length !== size) throw new Error("C must have one row and n columns.");
  return Array.from({ length: size }, (_, power) => multiplyMatrices(c, matrixPower(a, power))[0]);
}

export const polynomialFromRoots = (roots: number[]): number[] => roots.reduce((polynomial, root) => {
  const output = Array(polynomial.length + 1).fill(0);
  polynomial.forEach((coefficient, index) => { output[index] += coefficient; output[index + 1] -= coefficient * root; });
  return output;
}, [1]);

export function evaluatePolynomialMatrix(coefficients: number[], matrix: Matrix): Matrix {
  const degree = coefficients.length - 1;
  return coefficients.reduce((output, coefficient, index) => addMatrices(output, scaleMatrix(matrixPower(matrix, degree - index), coefficient)), zeros(matrix.length, matrix.length));
}

/** Single-input Ackermann pole placement: K = e_n^T C^{-1} phi_d(A). */
export function ackermannPolePlacement(a: Matrix, b: Matrix, desiredPoles: number[]): PolePlacementResult {
  const size = a.length;
  if (desiredPoles.length !== size) throw new Error("Enter one desired pole for each state.");
  const controllability = controllabilityMatrix(a, b);
  if (rank(controllability) < size) throw new Error("Pole placement is unavailable because the system is uncontrollable.");
  const desiredPolynomial = polynomialFromRoots(desiredPoles);
  const phiA = evaluatePolynomialMatrix(desiredPolynomial, a);
  const selector = [Array.from({ length: size }, (_, index) => (index === size - 1 ? 1 : 0))];
  const gain = multiplyMatrices(multiplyMatrices(selector, inverse(controllability)), phiA)[0];
  const acl = subtractMatrices(a, b.map((row) => gain.map((value) => row[0] * value)));
  return { gain, acl, desiredPolynomial, closedLoopEigenvalues: eigenvalues(acl) };
}

/** RK4 trajectory for x-dot = Ax. The matrix may be A or the pole-placed A_cl. */
export function integrateStateRK4(matrix: Matrix, initialState: Vector, duration = 12, step = 0.025): StateTrajectory {
  const derivative = (state: Vector) => matrixVectorProduct(matrix, state);
  const state = [...initialState];
  const time = [0];
  const states = [[...state]];
  const totalSteps = Math.max(1, Math.ceil(duration / step));
  for (let index = 0; index < totalSteps; index++) {
    const k1 = derivative(state);
    const k2 = derivative(state.map((value, i) => value + (step * k1[i]) / 2));
    const k3 = derivative(state.map((value, i) => value + (step * k2[i]) / 2));
    const k4 = derivative(state.map((value, i) => value + step * k3[i]));
    state.forEach((value, i) => { state[i] = value + (step / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
    time.push(Math.min(duration, (index + 1) * step));
    states.push([...state]);
  }
  return { time, states };
}

