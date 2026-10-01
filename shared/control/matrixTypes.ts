export const EPSILON = 1e-9;

export type Matrix = number[][];

export type Vector = number[];

export type ComplexValue = { re: number; im: number };

export type PolePlacementResult = { gain: Vector; acl: Matrix; desiredPolynomial: number[]; closedLoopEigenvalues: ComplexValue[] };

export type StateTrajectory = { time: number[]; states: Vector[] };

export const formatNumber = (value: number, precision = 4) => Number((Math.abs(value) < EPSILON ? 0 : value).toFixed(precision)).toString();

export const matrixToLatex = (matrix: Matrix, precision = 3) => `\\begin{bmatrix}${matrix.map((row) => row.map((value) => formatNumber(value, precision)).join(" & ")).join("\\\\")}\\end{bmatrix}`;

export const vectorToLatex = (vector: Vector, precision = 3, row = false) => row ? `\\begin{bmatrix}${vector.map((value) => formatNumber(value, precision)).join(" & ")}\\end{bmatrix}` : `\\begin{bmatrix}${vector.map((value) => formatNumber(value, precision)).join("\\\\")}\\end{bmatrix}`;

export const complexToLatex = (value: ComplexValue, precision = 3) => Math.abs(value.im) < EPSILON ? formatNumber(value.re, precision) : `${formatNumber(value.re, precision)} ${value.im < 0 ? "-" : "+"} ${formatNumber(Math.abs(value.im), precision)}i`;
