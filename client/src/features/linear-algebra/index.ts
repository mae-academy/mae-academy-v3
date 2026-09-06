export * from './BasisChangeSolver';
export * from './BasisFrameGeometry';
export * from './linearAlgebraMath';
export {
  zeros,
  assertMatrix,
  addMatrices,
  subtractMatrices,
  scaleMatrix,
  transpose,
  matrixVectorProduct,
  vectorToColumn,
  columnToVector,
  determinant,
  inverse,
  rank,
  matrixPower,
  trace,
  characteristicPolynomial,
  polynomialRoots,
  eigenvalues,
  polynomialFromRoots,
  controllabilityMatrix,
  observabilityMatrix,
  evaluatePolynomialMatrix,
  ackermannPolePlacement,
  integrateStateRK4,
  complexToLatex,
} from './matrixMath';
export type { Vector, ComplexValue } from './matrixMath';
