/**
 * Annotated Gauss-Jordan elimination (STEPS.md §8.2): a written step tree where each row operation is shown in LaTeX
 * (Rᵢ ← Rᵢ − kRⱼ, Rᵢ ↔ Rⱼ, Rᵢ ← kRᵢ) with the pivot highlighted. Exact for rational input; otherwise floating
 * point where a difference is zero only when it is cancellation noise of its own operands.
 */
import { CANCELLATION_RELATIVE } from "../constants";
import { Fraction } from "./fraction";
import { numberLatex } from "./format";
import type { Mat } from "./matrix";
import { toFractions } from "./matrix";


interface Field<T> {
  zero: T;
  one: T;
  add: (a: T, b: T) => T;
  sub: (a: T, b: T) => T;
  mul: (a: T, b: T) => T;
  div: (a: T, b: T) => T;
  isZero: (a: T) => boolean;
  isOne: (a: T) => boolean;
  /** Compares |a| and |b|. */
  cmpAbs: (a: T, b: T) => number;
  neg: (a: T) => T;
  latex: (a: T) => string;
  num: (a: T) => number;
}

const exactField: Field<Fraction> = {
  zero: Fraction.ZERO,
  one: Fraction.ONE,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  div: (a, b) => a.div(b),
  isZero: (a) => a.isZero(),
  isOne: (a) => a.isOne(),
  cmpAbs: (a, b) => a.compareAbs(b),
  neg: (a) => a.neg(),
  latex: (a) => a.toLatex(),
  num: (a) => a.toNumber(),
};

/**
 * Floating-point field for irrational input. A difference counts as zero only when it is cancellation noise of its
 * own operands (|a − b| ≤ CANCELLATION_RELATIVE·(|a| + |b|)), so tiny but genuine entries (1e-13, or 1e-8 next to
 * 1e8) are kept, and the matrix's overall scale plays no part (§9: relative comparisons only).
 */
const floatField: Field<number> = {
  zero: 0,
  one: 1,
  add: (a, b) => snap(a + b, a, b),
  sub: (a, b) => snap(a - b, a, b),
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  isZero: (a) => a === 0,
  isOne: (a) => Math.abs(a - 1) <= CANCELLATION_RELATIVE,
  cmpAbs: (a, b) => Math.sign(Math.abs(a) - Math.abs(b)),
  neg: (a) => -a,
  latex: numberLatex,
  num: (a) => a,
};

function snap(r: number, a: number, b: number): number {
  return Math.abs(r) <= CANCELLATION_RELATIVE * (Math.abs(a) + Math.abs(b)) ? 0 : r;
}

export type RowOp =
  | { op: "swap"; i: number; j: number }
  | { op: "scale"; i: number; k: number }
  | { op: "add"; i: number; j: number; k: number };

export interface GaussStep {
  op: RowOp;
  /** LaTeX of the operation, rows numbered from 1: `R_2 \leftarrow R_2 - \frac{3}{2}R_1`. */
  latex: string;
  /** Matrix after the step, as numbers and as LaTeX entries. */
  matrix: number[][];
  matrixLatex: string[][];
  /** Pivot used by this step [row, column] (0-based), highlighted in the UI. */
  pivot: [number, number];
}

export interface GaussResult {
  steps: GaussStep[];
  /** Reduced row echelon form. */
  rref: number[][];
  rrefLatex: string[][];
  rank: number;
  pivots: Array<[number, number]>;
  exact: boolean;
  /** For an augmented system [A | b]: the solution type and, when unique, the solution. */
  system?: { kind: "unique"; x: number[]; xLatex: string[] } | { kind: "none" } | { kind: "infinite"; free: number[] };
}

function rowLabel(i: number): string {
  return `R_{${i + 1}}`;
}

function run<T>(F: Field<T>, M: T[][], extra: number): GaussResult & { exact: boolean } {
  const rows = M.length;
  const cols = M[0].length;
  const varCols = cols - extra;
  const steps: GaussStep[] = [];
  const pivots: Array<[number, number]> = [];
  const snapshot = (op: RowOp, latex: string, pivot: [number, number]) =>
    steps.push({ op, latex, matrix: M.map((r) => r.map(F.num)), matrixLatex: M.map((r) => r.map(F.latex)), pivot });

  let r = 0;
  for (let c = 0; c < varCols && r < rows; c++) {
    // Partial pivoting: the largest |entry| in the column (for exact input, the first non-zero keeps numbers small
    // only when it is also the largest, so both cases use the largest).
    let p = -1;
    for (let i = r; i < rows; i++) if (!F.isZero(M[i][c]) && (p < 0 || F.cmpAbs(M[i][c], M[p][c]) > 0)) p = i;
    if (p < 0) continue;
    if (p !== r) {
      [M[p], M[r]] = [M[r], M[p]];
      snapshot({ op: "swap", i: r, j: p }, `${rowLabel(r)} \\leftrightarrow ${rowLabel(p)}`, [r, c]);
    }
    const pv = M[r][c];
    if (!F.isOne(pv)) {
      const k = F.div(F.one, pv);
      M[r] = M[r].map((v) => F.mul(v, k));
      M[r][c] = F.one; // exactly 1 after scaling, also in floating point
      snapshot({ op: "scale", i: r, k: F.num(k) }, `${rowLabel(r)} \\leftarrow ${coef(F, k)}${rowLabel(r)}`, [r, c]);
    }
    for (let i = 0; i < rows; i++) {
      if (i === r || F.isZero(M[i][c])) continue;
      const k = M[i][c];
      M[i] = M[i].map((v, j) => F.sub(v, F.mul(k, M[r][j])));
      M[i][c] = F.zero;
      const neg = F.cmpAbs(k, F.zero) > 0 && F.num(k) < 0;
      const mag = neg ? F.neg(k) : k;
      snapshot(
        { op: "add", i, j: r, k: -F.num(k) },
        `${rowLabel(i)} \\leftarrow ${rowLabel(i)} ${neg ? "+" : "-"} ${coef(F, mag)}${rowLabel(r)}`,
        [r, c],
      );
    }
    pivots.push([r, c]);
    r++;
  }

  const result: GaussResult = {
    steps,
    rref: M.map((row) => row.map(F.num)),
    rrefLatex: M.map((row) => row.map(F.latex)),
    rank: pivots.length,
    pivots,
    exact: F === (exactField as unknown as Field<T>),
  };
  if (extra === 1) {
    const inconsistent = M.some((row) => row.slice(0, varCols).every((v) => F.isZero(v)) && !F.isZero(row[varCols]));
    if (inconsistent) result.system = { kind: "none" };
    else if (pivots.length < varCols) {
      const pivotCols = new Set(pivots.map(([, c]) => c));
      result.system = { kind: "infinite", free: Array.from({ length: varCols }, (_, j) => j).filter((j) => !pivotCols.has(j)) };
    } else {
      const x = pivots.map(([pr]) => M[pr][varCols]);
      result.system = { kind: "unique", x: x.map(F.num), xLatex: x.map(F.latex) };
    }
  }
  return result;
}

/** `k` as a coefficient in front of a row label: 1 is omitted, fractions are wrapped. */
function coef<T>(F: Field<T>, k: T): string {
  if (F.isOne(k)) return "";
  const s = F.latex(k);
  return s.startsWith("-") ? `\\left(${s}\\right)` : s;
}

/**
 * Gauss-Jordan on A (augmented = false), on [A | b] (augmented = true, last column is b), or on [A | B] with the
 * last `augmented` columns to the right of the bar (no pivots are taken there; [A | I] gives the inverse).
 */
export function gaussJordan(A: Mat, augmented: boolean | number = false): GaussResult {
  if (A.length === 0 || A.some((r) => r.length !== A[0].length)) throw new RangeError("gaussJordan needs a rectangular matrix");
  const extra = augmented === true ? 1 : augmented === false ? 0 : augmented;
  if (!Number.isInteger(extra) || extra < 0 || extra >= A[0].length) throw new RangeError("gaussJordan: bad number of augmented columns");
  const exact = toFractions(A);
  if (exact) return run(exactField, exact, extra);
  return run(floatField, A.map((r) => r.slice()), extra);
}

/**
 * LaTeX of a matrix (bmatrix), optionally with a vertical bar before the last column (`augmented: true`) or before
 * the last `augmented` columns, and a highlighted pivot.
 */
export function matrixToLatex(entries: string[][], options: { augmented?: boolean | number; pivot?: [number, number] } = {}): string {
  const cols = entries[0]?.length ?? 0;
  const body = entries
    .map((row, i) =>
      row.map((v, j) => (options.pivot && options.pivot[0] === i && options.pivot[1] === j ? `\\boxed{${v}}` : v)).join(" & "),
    )
    .join(" \\\\ ");
  const extra = options.augmented === true ? 1 : options.augmented || 0;
  if (extra > 0 && extra < cols) {
    const spec = `${"c".repeat(cols - extra)}|${"c".repeat(extra)}`;
    return `\\left[\\begin{array}{${spec}} ${body} \\end{array}\\right]`;
  }
  return `\\begin{bmatrix} ${body} \\end{bmatrix}`;
}
