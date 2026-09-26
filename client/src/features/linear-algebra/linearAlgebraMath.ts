import { BasisChangeSolver, type BasisChangeResult } from "./BasisChangeSolver";

/**
 * Linear Algebra Studio math engine.
 * Pure TypeScript only: no external numerical algebra dependency is used here.
 */
export type Matrix = number[][];
export type LinearOperation = "transform" | "multiply" | "solve" | "eigen" | "null" | "determinant";
export const MAX_PEDAGOGICAL_MATRIX_DIMENSION = 8;
export const MAX_PEDAGOGICAL_RHS_COLUMNS = 4;
export type SystemClassification = "unique" | "infinite" | "inconsistent";
export type RhsSystemResult = { classification: SystemClassification; solution?: number[]; residualInfinityNorm?: number };
export type LuStatus = "regular" | "near-singular" | "singular";
export type LuFactorization = {
  P: Matrix;
  L: Matrix;
  U: Matrix;
  permutationSign: number;
  determinant: number;
  status: LuStatus;
  pivotThreshold: number;
  reconstructionResidualInfinityNorm?: number;
};

export type MathStep = { id: string; title: string; latex: string; note?: string };
export type EigenPair = { value: number; vector: number[] };
export type LinearAnalysis = {
  operation: LinearOperation;
  steps: MathStep[];
  result?: Matrix;
  determinant?: number;
  lu?: LuFactorization;
  rref?: Matrix;
  solution?: number[];
  nullBasis?: number[][];
  subspaces?: {
    rank: number;
    nullity: number;
    pivotColumns: number[];
    freeColumns: number[];
    columnBasis: number[][];
    nullBasis: number[][];
    columnResidualInfinityNorms: number[];
    nullResidualInfinityNorms: number[];
  };
  eigenpairs?: EigenPair[];
  basisChange?: BasisChangeResult;
  system?: {
    rankA: number;
    rankAugmented: number;
    rhs: RhsSystemResult[];
    solutionMatrix?: Matrix;
  };
  originalVector: number[];
  transformedVector: number[];
};

const EPS = 1e-9;

export function formatNumber(value: number, digits = 4) {
  if (Math.abs(value) < EPS) return "0";
  return Number(value.toFixed(digits)).toString();
}

export function cloneMatrix(matrix: Matrix): Matrix { return matrix.map((row) => [...row]); }
export function identity(size: number): Matrix { return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => row === column ? 1 : 0)); }
function assertRectangular(matrix: Matrix) {
  if (!matrix.length || !matrix[0].length || matrix.some((row) => row.length !== matrix[0].length)) throw new Error("A non-empty rectangular matrix is required.");
}
const MATRIX_COLUMN_COLORS = ["#e11d48", "#7c3aed", "#0284c7", "#16a34a", "#d97706"];
export function matrixToLatex(matrix: Matrix, colorColumns = false) {
  assertRectangular(matrix);
  const alignment = "r".repeat(matrix[0].length);
  const cells = matrix.map((row) => row.map((value, column) => colorColumns ? `\\textcolor{${MATRIX_COLUMN_COLORS[column % MATRIX_COLUMN_COLORS.length]}}{${formatNumber(value)}}` : formatNumber(value)).join(" & "));
  return `\\left[\\begin{array}{${alignment}}${cells.join("\\\\")}\\end{array}\\right]`;
}
export function vectorToLatex(vector: number[]) {
  if (!vector.length) return "\\left[\\begin{array}{r}0\\end{array}\\right]";
  return `\\left[\\begin{array}{r}${vector.map((value) => formatNumber(value)).join("\\\\")}\\end{array}\\right]`;
}

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  assertRectangular(left); assertRectangular(right);
  if (left[0].length !== right.length) throw new Error("Matrix dimensions are incompatible for multiplication.");
  return left.map((row) => right[0].map((_, column) => row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
}

function infinityNorm(vector: number[]) { return vector.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0); }
function matrixInfinityNorm(matrix: Matrix) { return matrix.reduce((maximum, row) => Math.max(maximum, row.reduce((sum, value) => sum + Math.abs(value), 0)), 0); }
function matrixDifferenceInfinityNorm(left: Matrix, right: Matrix) { return matrixInfinityNorm(left.map((row, r) => row.map((value, c) => value - right[r][c]))); }
function vectorResidualInfinityNorm(A: Matrix, x: number[], b: number[]) {
  return infinityNorm(A.map((row, index) => row.reduce((sum, value, column) => sum + value * x[column], 0) - b[index]));
}

function augment(left: Matrix, right: Matrix): Matrix { return left.map((row, index) => [...row, ...right[index]]); }

export function rref(input: Matrix, columnsOfA = input[0]?.length ?? 0) {
  const matrix = cloneMatrix(input);
  const steps: MathStep[] = [{ id: "rref-initial", title: "Augmented matrix", latex: matrixToLatex(matrix) }];
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columnsOfA && pivotRow < matrix.length; column++) {
    let best = pivotRow;
    for (let row = pivotRow + 1; row < matrix.length; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[best][column])) best = row;
    if (Math.abs(matrix[best][column]) < EPS) continue;
    if (best !== pivotRow) {
      [matrix[pivotRow], matrix[best]] = [matrix[best], matrix[pivotRow]];
      steps.push({ id: `swap-${pivotRow}-${best}`, title: "Partial pivot", latex: matrixToLatex(matrix), note: `R_{${pivotRow + 1}} \\leftrightarrow R_{${best + 1}}` });
    }
    const pivot = matrix[pivotRow][column];
    if (Math.abs(pivot - 1) > EPS) {
      matrix[pivotRow] = matrix[pivotRow].map((value) => value / pivot);
      steps.push({ id: `scale-${pivotRow}-${column}`, title: "Normalize pivot", latex: matrixToLatex(matrix), note: `R_{${pivotRow + 1}} \\leftarrow \\frac{1}{${formatNumber(pivot)}}R_{${pivotRow + 1}}` });
    }
    for (let row = 0; row < matrix.length; row++) {
      if (row === pivotRow || Math.abs(matrix[row][column]) < EPS) continue;
      const factor = matrix[row][column];
      matrix[row] = matrix[row].map((value, index) => Math.abs(value - factor * matrix[pivotRow][index]) < EPS ? 0 : value - factor * matrix[pivotRow][index]);
      steps.push({ id: `eliminate-${row}-${column}`, title: "Eliminate column", latex: matrixToLatex(matrix), note: `R_{${row + 1}} \\leftarrow R_{${row + 1}} - (${formatNumber(factor)})R_{${pivotRow + 1}}` });
    }
    pivots.push(column);
    pivotRow++;
  }
  return { matrix, pivots, steps };
}

function minor(matrix: Matrix, row: number, column: number): Matrix { return matrix.filter((_, rowIndex) => rowIndex !== row).map((source) => source.filter((_, columnIndex) => columnIndex !== column)); }

function recursiveDeterminant(matrix: Matrix, steps: MathStep[], depth = 0): number {
  if (matrix.length === 1) return matrix[0][0];
  if (matrix.length === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  let determinant = 0;
  for (let column = 0; column < matrix.length; column++) {
    const child = minor(matrix, 0, column);
    const childDeterminant = recursiveDeterminant(child, steps, depth + 1);
    const cofactor = (column % 2 ? -1 : 1) * matrix[0][column] * childDeterminant;
    determinant += cofactor;
    if (depth === 0) steps.push({ id: `cofactor-${column}`, title: "Cofactor expansion", latex: `\\det(A)=\\sum_{j=1}^{${matrix.length}}(-1)^{1+j}A_{1j}\\det(M_{1j}),\\quad C_{1,${column + 1}}=${formatNumber(cofactor)}`, note: `M_{1,${column + 1}}=${matrixToLatex(child)}` });
  }
  return determinant;
}

function factorizeLuWithTrace(matrix: Matrix): { factorization: LuFactorization; steps: MathStep[] } {
  assertRectangular(matrix);
  if (matrix.length !== matrix[0].length) throw new Error("LU factorization requires a square matrix.");
  const size = matrix.length;
  const U = cloneMatrix(matrix);
  const L = identity(size);
  const P = identity(size);
  const steps: MathStep[] = [];
  const scaledNorm = Math.max(1, matrixInfinityNorm(matrix));
  const singularThreshold = Number.EPSILON * scaledNorm * Math.max(1, size) * 64;
  const nearThreshold = Math.sqrt(Number.EPSILON) * scaledNorm;
  let permutationSign = 1;
  let nearSingular = false;
  for (let column = 0; column < size; column++) {
    let best = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(U[row][column]) > Math.abs(U[best][column])) best = row;
    const pivotMagnitude = Math.abs(U[best][column]);
    steps.push({ id: `lu-pivot-${column}`, title: `Pivot ${column + 1}: select largest entry`, latex: `p_${column + 1}=U_{${best + 1},${column + 1}}=${formatNumber(U[best][column])},\quad |p_${column + 1}|=${formatNumber(pivotMagnitude, 12)}`, note: `Search column ${column + 1} from row ${column + 1} downward, then use the largest-magnitude candidate to control round-off.` });
    if (pivotMagnitude <= singularThreshold) {
      steps.push({ id: `lu-singular-pivot-${column}`, title: "Numerically zero pivot", latex: `|p_${column + 1}|\le ${formatNumber(singularThreshold, 12)},\quad \det(A)=0`, note: "Elimination stops because this pivot is numerically zero at the selected tolerance." });
      return { factorization: { P, L, U, permutationSign, determinant: 0, status: "singular", pivotThreshold: singularThreshold }, steps };
    }
    if (pivotMagnitude <= nearThreshold) nearSingular = true;
    if (best !== column) {
      [U[column], U[best]] = [U[best], U[column]];
      [P[column], P[best]] = [P[best], P[column]];
      for (let prior = 0; prior < column; prior++) [L[column][prior], L[best][prior]] = [L[best][prior], L[column][prior]];
      permutationSign *= -1;
      steps.push({ id: `lu-swap-${column}-${best}`, title: `Pivot ${column + 1}: swap rows`, latex: `R_{${column + 1}}\leftrightarrow R_{${best + 1}},\quad \det(P)=${permutationSign},\quad U=${matrixToLatex(U)}`, note: "A row interchange changes the determinant sign and is recorded in P." });
    }
    for (let row = column + 1; row < size; row++) {
      const multiplier = U[row][column] / U[column][column];
      L[row][column] = multiplier;
      for (let inner = column; inner < size; inner++) U[row][inner] = Math.abs(U[row][inner] - multiplier * U[column][inner]) <= singularThreshold ? 0 : U[row][inner] - multiplier * U[column][inner];
      steps.push({ id: `lu-eliminate-${column}-${row}`, title: `Eliminate U_{${row + 1},${column + 1}}`, latex: `m_{${row + 1},${column + 1}}=\frac{U_{${row + 1},${column + 1}}}{U_{${column + 1},${column + 1}}}=${formatNumber(multiplier)},\quad R_{${row + 1}}\leftarrow R_{${row + 1}}-m_{${row + 1},${column + 1}}R_{${column + 1}},\quad U=${matrixToLatex(U)}`, note: `Store m_{${row + 1},${column + 1}} in L while zeroing the entry below the pivot.` });
    }
  }
  const determinant = permutationSign * U.reduce((product, row, index) => product * row[index], 1);
  const reconstructionResidualInfinityNorm = matrixDifferenceInfinityNorm(multiplyMatrices(P, matrix), multiplyMatrices(L, U));
  steps.push({ id: "lu-diagonal-product", title: "Multiply the diagonal of U", latex: `\det(A)=\det(P)\prod_{i=1}^{${size}}U_{ii}=(${permutationSign})\left(${U.map((row, index) => formatNumber(row[index])).join("\cdot")}\right)=${formatNumber(determinant)}`, note: "L has a unit diagonal, so det(L)=1; only the permutation sign and U diagonal contribute." });
  return { factorization: { P, L, U, permutationSign, determinant, status: nearSingular ? "near-singular" : "regular", pivotThreshold: singularThreshold, reconstructionResidualInfinityNorm }, steps };
}

export function luFactorize(matrix: Matrix): LuFactorization {
  return factorizeLuWithTrace(matrix).factorization;
}

export function determinantWithSteps(matrix: Matrix) {
  if (!matrix.length || matrix.length !== matrix[0].length) throw new Error("Determinant requires a square matrix.");
  const steps: MathStep[] = [{ id: "det-input", title: "Input matrix", latex: `A=${matrixToLatex(matrix)}` }];
  const tracedLu = factorizeLuWithTrace(matrix);
  const lu = tracedLu.factorization;
  steps.push(...tracedLu.steps);
  if (lu.status === "singular") {
    steps.push({ id: "lu-singular", title: "Pivot classification", latex: `\\text{A pivot fell below }${formatNumber(lu.pivotThreshold, 12)};\\quad \\det(A)=0`, note: "Partial pivoting found a numerically zero pivot; no inverse or full LU reconstruction is claimed." });
    steps.push({ id: "det-result", title: "Determinant", latex: "\\boxed{\\det(A)=0}" });
    return { value: 0, steps, lu };
  }
  const statusLatex = lu.status === "near-singular" ? "\\text{near-singular: pivot conditioning requires caution}" : "\\text{regular pivot sequence}";
  steps.push({ id: "lu-factors", title: "Pivoted LU factorization", latex: `PA=LU,\\quad P=${matrixToLatex(lu.P)},\\quad L=${matrixToLatex(lu.L)},\\quad U=${matrixToLatex(lu.U)}`, note: `Permutation parity: ${lu.permutationSign > 0 ? "+1" : "-1"}. ${lu.status === "near-singular" ? "A small pivot was detected." : "All pivots passed the conditioning threshold."}` });
  steps.push({ id: "lu-certificate", title: "LU reconstruction certificate", latex: `\\|PA-LU\\|_\\infty=${formatNumber(lu.reconstructionResidualInfinityNorm ?? 0, 12)},\\quad ${statusLatex}` });
  steps.push({ id: "det-result", title: "Determinant", latex: `\\boxed{\\det(A)=\\det(P)\\prod_iU_{ii}=(${lu.permutationSign})\\prod_iU_{ii}=${formatNumber(lu.determinant)}}` });
  return { value: lu.determinant, steps, lu };
}

function nullSpaceFromRref(reduced: Matrix, pivots: number[], variableCount: number) {
  const freeColumns = Array.from({ length: variableCount }, (_, index) => index).filter((index) => !pivots.includes(index));
  const basis = freeColumns.map((freeColumn) => {
    const vector = Array(variableCount).fill(0);
    vector[freeColumn] = 1;
    pivots.forEach((pivotColumn, row) => { vector[pivotColumn] = -reduced[row][freeColumn]; });
    return vector;
  });
  return { basis, freeColumns };
}

function matrixVectorResidualInfinityNorm(matrix: Matrix, vector: number[]) {
  return infinityNorm(matrix.map((row) => row.reduce((sum, value, column) => sum + value * vector[column], 0)));
}

function subspaceAnalysis(matrix: Matrix) {
  const reduced = rref(matrix, matrix[0].length);
  const nullSpace = nullSpaceFromRref(reduced.matrix, reduced.pivots, matrix[0].length);
  const columnBasis = reduced.pivots.map((pivotColumn) => matrix.map((row) => row[pivotColumn]));
  return {
    reduced,
    rank: reduced.pivots.length,
    nullity: matrix[0].length - reduced.pivots.length,
    pivotColumns: reduced.pivots,
    freeColumns: nullSpace.freeColumns,
    columnBasis,
    nullBasis: nullSpace.basis,
    columnResidualInfinityNorms: columnBasis.map(() => 0),
    nullResidualInfinityNorms: nullSpace.basis.map((vector) => matrixVectorResidualInfinityNorm(matrix, vector)),
  };
}

function qrDecompose(matrix: Matrix) {
  const size = matrix.length;
  const q = Array.from({ length: size }, () => Array(size).fill(0));
  const r = Array.from({ length: size }, () => Array(size).fill(0));
  const columns = Array.from({ length: size }, (_, column) => matrix.map((row) => row[column]));
  for (let column = 0; column < size; column++) {
    let vector = [...columns[column]];
    for (let prior = 0; prior < column; prior++) {
      const qColumn = q.map((row) => row[prior]);
      r[prior][column] = vector.reduce((sum, value, index) => sum + value * qColumn[index], 0);
      vector = vector.map((value, index) => value - r[prior][column] * qColumn[index]);
    }
    r[column][column] = Math.hypot(...vector);
    if (r[column][column] < EPS) continue;
    vector.forEach((value, row) => { q[row][column] = value / r[column][column]; });
  }
  return { q, r };
}

function eigenvectorsFor(matrix: Matrix, values: number[]) {
  const assignedBasisByEigenvalue = new Map<string, number>();
  return values.map((value) => {
    const shifted = matrix.map((row, rowIndex) => row.map((entry, columnIndex) => entry - (rowIndex === columnIndex ? value : 0)));
    const reduced = rref(shifted, shifted[0].length);
    const basis = nullSpaceFromRref(reduced.matrix, reduced.pivots, shifted[0].length).basis;
    const eigenKey = formatNumber(value, 6);
    const assigned = assignedBasisByEigenvalue.get(eigenKey) ?? 0;
    const fallback = Array(shifted.length).fill(0); fallback[0] = 1;
    const raw = basis[assigned] ?? basis[0] ?? fallback;
    assignedBasisByEigenvalue.set(eigenKey, assigned + 1);
    const length = Math.hypot(...raw) || 1;
    return { value, vector: raw.map((entry) => entry / length) };
  });
}

export function eigenAnalysis(matrix: Matrix) {
  if (!matrix.length || matrix.length !== matrix[0].length) throw new Error("Eigen analysis requires a square matrix.");
  const steps: MathStep[] = [{ id: "eigen-input", title: "Characteristic system", latex: `\\det(A-\\lambda I)=0,\\quad A=${matrixToLatex(matrix)}` }];
  let values: number[];
  if (matrix.length === 2) {
    const trace = matrix[0][0] + matrix[1][1];
    const determinant = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
    const discriminant = trace * trace - 4 * determinant;
    if (discriminant < -EPS) throw new Error("This real-vector visualizer cannot display complex eigenpairs.");
    values = [(trace + Math.sqrt(Math.max(0, discriminant))) / 2, (trace - Math.sqrt(Math.max(0, discriminant))) / 2];
    steps.push({ id: "eigen-polynomial", title: "Characteristic polynomial", latex: `\\lambda^2-(${formatNumber(trace)})\\lambda+${formatNumber(determinant)}=0` });
  } else {
    let current = cloneMatrix(matrix);
    for (let iteration = 0; iteration < 72; iteration++) {
      const { q, r } = qrDecompose(current);
      current = multiplyMatrices(r, q);
    }
    values = current.map((row, index) => row[index]);
    steps.push({ id: "eigen-qr", title: "QR iteration", latex: `A_k=Q_kR_k,\\quad A_{k+1}=R_kQ_k,\\quad \\lambda_i\\approx(A_{72})_{ii}` });
  }
  const eigenpairs = eigenvectorsFor(matrix, values);
  eigenpairs.forEach((pair, index) => steps.push({ id: `eigen-pair-${index}`, title: "Eigenpair", latex: `(A-${formatNumber(pair.value)}I)v_${index + 1}=0,\\quad \\lambda_${index + 1}=${formatNumber(pair.value)},\\quad v_${index + 1}=${vectorToLatex(pair.vector)}` }));
  return { eigenpairs, steps };
}

export function analyzeLinearAlgebra(operation: LinearOperation, A: Matrix, B: Matrix, basis?: Matrix): LinearAnalysis {
  assertRectangular(A); assertRectangular(B);
  const vector = B.map((row) => row[0] ?? 0);
  const transformed = A[0].length === B.length ? multiplyMatrices(A, B).map((row) => row[0]) : vector;
  if (operation === "transform") {
    const proposedBasis = basis ?? identity(A.length);
    const basisChange = BasisChangeSolver.solve(A, proposedBasis, B);
    const conditionLatex = basisChange.condition === "near-singular" ? "\\text{near-singular basis: coordinate sensitivity is elevated}" : "\\text{regular basis}";
    const steps: MathStep[] = [
      { id: "basis-convention", title: "Coordinate convention", latex: `\mathcal{B}=B=${matrixToLatex(basisChange.basis, true)},\\quad [x]_{\mathcal{B}}=${matrixToLatex(basisChange.sourceCoordinates)}`, note: "The columns of B are the proposed basis vectors written in standard coordinates." },
      { id: "basis-invertibility", title: "Basis invertibility", latex: `\\det(B)=${formatNumber(basisChange.determinant, 12)},\\quad B^{-1}=${matrixToLatex(basisChange.basisInverse)},\\quad ${conditionLatex}`, note: "Only a linearly independent basis has a unique coordinate map B^{-1}." },
      { id: "basis-change-operator", title: "Change the operator basis", latex: `[T]_{\\{B}}=B^{-1}TB=${matrixToLatex(basisChange.transformationInBasis)}`, note: "This similarity transform represents the same geometric map T in B-coordinates." },
      { id: "basis-to-standard", title: "Reconstruct the standard vector", latex: `x=B[x]_{\mathcal{B}}=${matrixToLatex(basisChange.basis)}${matrixToLatex(basisChange.sourceCoordinates)}=${matrixToLatex(basisChange.sourceStandard)}` },
      { id: "basis-apply", title: "Transform in basis coordinates", latex: `[T(x)]_{\mathcal{B}}=[T]_{\mathcal{B}}[x]_{\mathcal{B}}=${matrixToLatex(basisChange.transformedCoordinates)}` },
      { id: "basis-geometric-proof", title: "Geometric equivalence proof", latex: `B[T]_{\mathcal{B}}[x]_{\mathcal{B}}=T\\bigl(B[x]_{\mathcal{B}}\\bigr)=${matrixToLatex(basisChange.transformedStandard)},\\quad \\|B[T]_{\mathcal{B}}[x]_{\mathcal{B}}-T(B[x]_{\mathcal{B}})\\|_\\infty=${formatNumber(basisChange.coordinateResidualInfinityNorm, 12)}`, note: "Both coordinate paths land at the same geometric point in standard space." },
      { id: "basis-conjugacy-certificate", title: "Similarity certificate", latex: `\\|B[T]_{\mathcal{B}}-TB\\|_\\infty=${formatNumber(basisChange.conjugacyResidualInfinityNorm, 12)},\\quad \\|BB^{-1}-I\\|_\\infty=${formatNumber(basisChange.inverseResidualInfinityNorm, 12)}` },
    ];
    const basisColumns = basisChange.basis[0].map((_, column) => basisChange.basis.map((row) => row[column]));
    return { operation, steps, result: basisChange.transformedCoordinates, basisChange, subspaces: { rank: basisChange.basis.length, nullity: 0, pivotColumns: basisChange.basis.map((_, index) => index), freeColumns: [], columnBasis: basisColumns, nullBasis: [], columnResidualInfinityNorms: basisColumns.map(() => 0), nullResidualInfinityNorms: [] }, originalVector: basisChange.sourceStandard.map((row) => row[0]), transformedVector: basisChange.transformedStandard.map((row) => row[0]) };
  }
  if (operation === "multiply") {
    const product = multiplyMatrices(A, B);
    const steps: MathStep[] = [
      { id: "multiply-rule", title: "Multiplication rule", latex: `C_{ij}=\\sum_{k=1}^{${A[0].length}}A_{ik}B_{kj}` },
      { id: "multiply-input", title: `Input matrices`, latex: `A=${matrixToLatex(A, true)},\\quad B=${matrixToLatex(B, true)}` },
      { id: "multiply-result", title: "Product", latex: `AB=${matrixToLatex(product)}` },
    ];
    return { operation, steps, result: product, originalVector: vector, transformedVector: transformed };
  }
  if (operation === "determinant") {
    const determinant = determinantWithSteps(A);
    return { operation, steps: determinant.steps, determinant: determinant.value, lu: determinant.lu, originalVector: vector, transformedVector: transformed };
  }
  if (operation === "solve") {
    const augmented = augment(A, B);
    const reduced = rref(augmented, A[0].length);
    const variableCount = A[0].length;
    const rankA = reduced.pivots.length;
    const zeroCoefficientRows = reduced.matrix.map((row) => row.slice(0, variableCount).every((entry) => Math.abs(entry) < EPS));
    const rhs = Array.from({ length: B[0].length }, (_, rhsColumn) => {
      const b = A.map((_, row) => B[row][rhsColumn]);
      const inconsistent = reduced.matrix.some((row, rowIndex) => zeroCoefficientRows[rowIndex] && Math.abs(row[variableCount + rhsColumn]) > EPS);
      if (inconsistent) return { classification: "inconsistent" as const };
      if (rankA < variableCount) return { classification: "infinite" as const };
      const solved = reduced.matrix.slice(0, variableCount).map((row) => row[variableCount + rhsColumn]);
      return { classification: "unique" as const, solution: solved, residualInfinityNorm: vectorResidualInfinityNorm(A, solved, b) };
    });
    const solutionMatrix = rhs.every((entry) => entry.classification === "unique")
      ? Array.from({ length: variableCount }, (_, row) => rhs.map((entry) => entry.solution![row]))
      : undefined;
    const rankAugmented = rankA + (rhs.some((entry) => entry.classification === "inconsistent") ? 1 : 0);
    const solution = B[0].length === 1 && rhs[0].classification === "unique" ? rhs[0].solution : undefined;
    const statuses = rhs.map((entry, index) => `b_{${index + 1}}:\\;\\text{${entry.classification}}`).join(",\\quad");
    const finalLatex = solutionMatrix
      ? `X=${matrixToLatex(solutionMatrix)},\\quad \\|AX-B\\|_\\infty=${formatNumber(Math.max(...rhs.map((entry) => entry.residualInfinityNorm ?? 0)), 8)}`
      : `\\text{System classification: }${statuses}`;
    return {
      operation,
      steps: [...reduced.steps, { id: "solve-classification", title: "System classification", latex: `\\operatorname{rank}(A)=${rankA},\\quad \\operatorname{rank}([A\\mid B])=${rankAugmented},\\quad ${statuses}` }, { id: "solve-result", title: "Solution", latex: finalLatex }],
      rref: reduced.matrix,
      solution,
      system: { rankA, rankAugmented, rhs, solutionMatrix },
      originalVector: vector,
      transformedVector: transformed,
    };
  }
  if (operation === "null") {
    const subspaces = subspaceAnalysis(A);
    const nullBasisLatex = subspaces.nullBasis.length ? subspaces.nullBasis.map(vectorToLatex).join(",\\;") : "\\{0\\}";
    const columnBasisLatex = subspaces.columnBasis.length ? subspaces.columnBasis.map(vectorToLatex).join(",\\;") : "\\{0\\}";
    const pivotLabels = subspaces.pivotColumns.length ? subspaces.pivotColumns.map((column) => column + 1).join(",") : "\\varnothing";
    const freeLabels = subspaces.freeColumns.length ? subspaces.freeColumns.map((column) => column + 1).join(",") : "\\varnothing";
    const nullResidual = Math.max(0, ...subspaces.nullResidualInfinityNorms);
    return {
      operation,
      steps: [
        ...subspaces.reduced.steps,
        { id: "subspace-pivots", title: "Pivot and free columns", latex: `\\operatorname{pivot}(A)=\\{${pivotLabels}\\},\\quad \\operatorname{free}(A)=\\{${freeLabels}\\}`, note: "Pivot indices are read from RREF; the same pivot columns are taken from the original matrix for Col(A)." },
        { id: "column-basis", title: "Column-space basis", latex: `\mathcal{B}_{\\operatorname{Col}(A)}=\\left\\{${columnBasisLatex}\\right\\},\\quad \\dim\\operatorname{Col}(A)=${subspaces.rank}`, note: "These are original columns of A, not columns of RREF(A), so they preserve the actual column space." },
        { id: "null-definition", title: "Null space", latex: `\\operatorname{Nul}(A)=\\{x\\in\\mathbb{R}^{${A[0].length}}\\mid Ax=0\\}` },
        { id: "null-basis", title: "Null-space basis", latex: `\mathcal{B}_{\\operatorname{Nul}(A)}=\\left\\{${nullBasisLatex}\\right\\},\\quad \\dim\\operatorname{Nul}(A)=${subspaces.nullity}`, note: "Set one free variable to 1 at a time and solve each pivot variable from RREF(A)." },
        { id: "rank-nullity", title: "Rank-nullity certificate", latex: `\\operatorname{rank}(A)+\\operatorname{nullity}(A)=${subspaces.rank}+${subspaces.nullity}=${A[0].length}` },
        { id: "null-residual", title: "Null-basis certificate", latex: `\\max_{v\\in\mathcal{B}_{\\operatorname{Nul}(A)}}\\|Av\\|_\\infty=${formatNumber(nullResidual, 12)}`, note: "Each displayed null-space basis vector is checked against the original matrix A." },
      ],
      rref: subspaces.reduced.matrix,
      nullBasis: subspaces.nullBasis,
      subspaces: {
        rank: subspaces.rank,
        nullity: subspaces.nullity,
        pivotColumns: subspaces.pivotColumns,
        freeColumns: subspaces.freeColumns,
        columnBasis: subspaces.columnBasis,
        nullBasis: subspaces.nullBasis,
        columnResidualInfinityNorms: subspaces.columnResidualInfinityNorms,
        nullResidualInfinityNorms: subspaces.nullResidualInfinityNorms,
      },
      originalVector: vector,
      transformedVector: transformed,
    };
  }
  const eigen = eigenAnalysis(A);
  return { operation, steps: eigen.steps, eigenpairs: eigen.eigenpairs, originalVector: vector, transformedVector: transformed };
}
