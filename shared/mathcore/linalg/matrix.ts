/**
 * Linear algebra for 2×2 and 3×3 matrices (STEPS.md §8.2, Phase 4; 3×3 eigenvalues in qr.ts).
 *
 * - Determinant by Gaussian elimination with partial pivoting (the plan's method), exact for rational input.
 * - "Singular" is decided relative to the matrix scale (Hadamard bound), never by an absolute tolerance (§9).
 * - 2×2 eigenvalues in closed form, computed without cancellation; repeated and complex cases are reported
 *   explicitly (scalar matrix = every direction, defective = one direction, complex = rotation-scaling).
 */
import { Fraction } from "./fraction";

export type Mat = number[][];

/** |det| below this times the Hadamard bound (product of row norms) counts as singular. */
export const SINGULAR_RELATIVE_TOLERANCE = 1e-12;

export function size(A: Mat): number {
  return A.length;
}

export function isSquare(A: Mat, n?: number): boolean {
  return A.length > 0 && A.every((r) => r.length === A.length) && (n === undefined || A.length === n);
}

/** Product of the Euclidean row norms: an upper bound on |det| (Hadamard). */
export function hadamardBound(A: Mat): number {
  return A.reduce((p, r) => p * Math.hypot(...r), 1);
}

export interface Determinant {
  value: number;
  /** Exact value when every entry is rational with few decimals. */
  exact: Fraction | null;
  singular: boolean;
  /** +1 orientation preserved, −1 reversed, 0 singular (STEPS.md §8.2: negative orientation changes colour). */
  sign: -1 | 0 | 1;
}

/** Exact entries, or null when any entry is not a short decimal. */
export function toFractions(A: Mat): Fraction[][] | null {
  const out: Fraction[][] = [];
  for (const row of A) {
    const r: Fraction[] = [];
    for (const v of row) {
      const f = Fraction.fromNumber(v);
      if (!f) return null;
      r.push(f);
    }
    out.push(r);
  }
  return out;
}

/** Floating-point determinant by Gaussian elimination with partial pivoting. */
export function detFloat(A: Mat): number {
  const n = A.length;
  const M = A.map((r) => r.slice());
  let det = 1;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (M[p][k] === 0) return 0;
    if (p !== k) {
      [M[p], M[k]] = [M[k], M[p]];
      det = -det;
    }
    det *= M[k][k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j < n; j++) M[i][j] -= f * M[k][j];
    }
  }
  return det;
}

/** Exact determinant by fraction-valued elimination. */
export function detExact(F: Fraction[][]): Fraction {
  const n = F.length;
  const M = F.map((r) => r.slice());
  let det = Fraction.ONE;
  for (let k = 0; k < n; k++) {
    let p = -1;
    for (let i = k; i < n; i++) if (!M[i][k].isZero()) {
      p = i;
      break;
    }
    if (p < 0) return Fraction.ZERO;
    if (p !== k) {
      [M[p], M[k]] = [M[k], M[p]];
      det = det.neg();
    }
    det = det.mul(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k].div(M[k][k]);
      for (let j = k; j < n; j++) M[i][j] = M[i][j].sub(f.mul(M[k][j]));
    }
  }
  return det;
}

export function determinant(A: Mat): Determinant {
  if (!isSquare(A)) throw new RangeError("determinant needs a square matrix");
  const F = toFractions(A);
  const exact = F ? detExact(F) : null;
  const value = exact ? exact.toNumber() : detFloat(A);
  const singular = exact ? exact.isZero() : Math.abs(value) <= SINGULAR_RELATIVE_TOLERANCE * hadamardBound(A) || !Number.isFinite(value);
  return { value, exact, singular, sign: singular ? 0 : value > 0 ? 1 : -1 };
}

export type Eigen2 =
  | { kind: "distinct"; values: [number, number]; vectors: [[number, number], [number, number]] }
  /** λI: every direction is an eigenvector (the double radial case). */
  | { kind: "scalar"; value: number }
  /** Repeated eigenvalue with a single eigen-direction (a shear). */
  | { kind: "defective"; value: number; vector: [number, number] }
  /** α ± iβ: rotation by θ = atan2(β, α) with scaling r = √det. */
  | { kind: "complex"; re: number; im: number; r: number; theta: number };

function unit(v: [number, number]): [number, number] {
  const n = Math.hypot(v[0], v[1]);
  return n === 0 ? [1, 0] : [v[0] / n, v[1] / n];
}

/** Eigen-direction of [[a, b], [c, d]] for eigenvalue λ, from the better-conditioned row of A − λI. */
function eigenvector(a: number, b: number, c: number, d: number, lambda: number): [number, number] {
  const r1: [number, number] = [b, lambda - a];
  const r2: [number, number] = [lambda - d, c];
  return unit(Math.hypot(...r1) >= Math.hypot(...r2) ? r1 : r2);
}

/** Relative tolerance under which the discriminant counts as zero (repeated eigenvalue). */
const REPEATED_RELATIVE_TOLERANCE = 1e-12;

export function eigen2(A: Mat): Eigen2 {
  if (!isSquare(A, 2)) throw new RangeError("eigen2 needs a 2×2 matrix");
  const [[a, b], [c, d]] = A;
  const half = (a + d) / 2;
  // Discriminant (λ − half)² = ((a − d)/2)² + bc, written without the cancellation of half² − det.
  const disc = ((a - d) / 2) ** 2 + b * c;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Number.MIN_VALUE) ** 2;
  if (Math.abs(disc) <= REPEATED_RELATIVE_TOLERANCE * scale) {
    if (b === 0 && c === 0 && a === d) return { kind: "scalar", value: a };
    const offDiagonal = Math.max(Math.abs(b), Math.abs(c), Math.abs(a - d));
    if (offDiagonal <= REPEATED_RELATIVE_TOLERANCE * Math.sqrt(scale)) return { kind: "scalar", value: half };
    return { kind: "defective", value: half, vector: eigenvector(a, b, c, d, half) };
  }
  if (disc < 0) {
    const im = Math.sqrt(-disc);
    return { kind: "complex", re: half, im, r: Math.hypot(half, im), theta: Math.atan2(im, half) };
  }
  // Larger-magnitude root first, the other from det / λ₁ (no cancellation when half and √disc nearly cancel).
  const s = Math.sqrt(disc);
  const l1 = half >= 0 ? half + s : half - s;
  const det = a * d - b * c;
  const l2 = l1 !== 0 ? det / l1 : half - (l1 - half);
  const values: [number, number] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return { kind: "distinct", values, vectors: [eigenvector(a, b, c, d, values[0]), eigenvector(a, b, c, d, values[1])] };
}

export function multiply(A: Mat, B: Mat): Mat {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}

export function apply(A: Mat, v: number[]): number[] {
  return A.map((row) => row.reduce((s, x, k) => s + x * v[k], 0));
}
