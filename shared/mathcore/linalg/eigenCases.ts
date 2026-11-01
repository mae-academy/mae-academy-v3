/**
 * Exact 3×3 eigenvalue cases for the per-value accuracy test (STEPS.md §8.2: 1e-9 for every eigenvalue).
 *
 * Each matrix is A = P · D · P⁻¹ with P an integer unit-triangular product (so P⁻¹ is an integer matrix too) and D
 * diagonal (or one 2×2 rotation-scaling block) with dyadic entries. The product is formed in exact rational arithmetic
 * and every entry must be exactly a double, so the eigenvalues of the matrix as stored are exactly the entries of D: no
 * oracle and no rounding in the reference. A case whose entries are not exact doubles throws when this module loads.
 *
 * They live here, not in `__golden__/` (human-owned and read-only); `generate_algorithms.py` is unchanged.
 */
import { decimalRational } from "./exactRoots";
import { Fraction } from "./fraction";
import type { Mat } from "./matrix";

export interface EigenCase {
  name: string;
  family: "spread" | "small" | "near-repeated" | "ill-conditioned" | "complex";
  matrix: Mat;
  /** Exact eigenvalues (doubles that equal the rational values exactly). */
  eigenvalues: Array<{ re: number; im: number }>;
}

type FM = Fraction[][];
const fr = (n: number): Fraction => {
  const f = Fraction.fromDouble(n);
  if (!f) throw new Error(`not finite: ${n}`);
  return f;
};
const fm = (m: number[][]): FM => m.map((r) => r.map(fr));
const mul = (A: FM, B: FM): FM => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s.add(v.mul(B[k][j])), Fraction.ZERO)));

/** Unit upper triangular [[1,a,0],[0,1,b],[0,0,1]] and its inverse. */
const U = (a: number, b: number) => ({ P: fm([[1, a, 0], [0, 1, b], [0, 0, 1]]), Pi: fm([[1, -a, a * b], [0, 1, -b], [0, 0, 1]]) });
/** Unit lower triangular [[1,0,0],[a,1,0],[0,b,1]] and its inverse. */
const L = (a: number, b: number) => ({ P: fm([[1, 0, 0], [a, 1, 0], [0, b, 1]]), Pi: fm([[1, 0, 0], [-a, 1, 0], [a * b, -b, 1]]) });

function conjugate(D: number[][], u: ReturnType<typeof U>, l: ReturnType<typeof L>, name: string): Mat {
  const P = mul(u.P, l.P);
  const Pi = mul(l.Pi, u.Pi);
  const A = mul(mul(P, fm(D)), Pi);
  return A.map((row, i) =>
    row.map((f, j) => {
      const x = f.toNumber();
      if (!fr(x).sub(f).isZero()) throw new Error(`${name}: entry (${i}, ${j}) is not exactly a double`);
      return x;
    }),
  );
}

const diag = (a: number, b: number, c: number): number[][] => [[a, 0, 0], [0, b, 0], [0, 0, c]];
const real = (name: string, family: EigenCase["family"], ev: [number, number, number], u: ReturnType<typeof U>, l: ReturnType<typeof L>): EigenCase => ({
  name,
  family,
  matrix: conjugate(diag(...ev), u, l, name),
  eigenvalues: ev.map((re) => ({ re, im: 0 })),
});
const rotation = (name: string, a: number, b: number, c: number, u: ReturnType<typeof U>, l: ReturnType<typeof L>): EigenCase => ({
  name,
  family: "complex",
  matrix: conjugate([[a, -b, 0], [b, a, 0], [0, 0, c]], u, l, name),
  eigenvalues: [{ re: a, im: b }, { re: a, im: -b }, { re: c, im: 0 }],
});

export const EIGEN_CASES: EigenCase[] = [
  // Eigenvalues spread over many orders of magnitude: the smallest is 1e-3 … 1e-12 of ‖A‖.
  ...[1e3, 1e6, 1e9, 1e12].map((s) => real(`spread 1 … ${s}`, "spread", [1, s / 1000 + 0.5, s], U(2, 3), L(1, 2))),
  ...[1e6, 1e8, 1e10, 1e12].map((l) => real(`small eigenvalue 1 next to ${l}, ${3 * l}`, "small", [1, l, 3 * l], U(3, -2), L(2, 1))),
  real("tiny eigenvalues 1, 2⁻²⁰, 2⁻⁴⁰ in a unit-size matrix", "small", [1, 2 ** -20, 2 ** -40], U(2, 1), L(1, 1)),
  real("negative and tiny eigenvalues −1, 2⁻³⁰, 2⁻⁴⁵", "small", [-1, 2 ** -30, 2 ** -45], U(1, 3), L(2, 1)),
  // Near-repeated eigenvalues (diagonalisable, well-conditioned eigenvectors): every value stays exact.
  ...[20, 30, 40].map((k) => real(`near-repeated 1 and 1 + 2^-${k}, plus 5`, "near-repeated", [1, 1 + 2 ** -k, 5], U(3, 2), L(1, 1))),
  ...[20, 30, 40].map((k) => real(`near-repeated: 1, 1 + 2^-${k}, 1 + 2^${1 - k}`, "near-repeated", [1, 1 + 2 ** -k, 1 + 2 ** (1 - k)], U(2, 1), L(1, 2))),
  // Ill-conditioned eigenvector matrix (P has entries up to k).
  ...[100, 1000].map((k) => real(`ill-conditioned P, k = ${k}`, "ill-conditioned", [1, 2, 3], U(k, k), L(k, 1))),
  // Complex pairs.
  rotation("complex 1 ± 2i, 3", 1, 2, 3, U(2, 1), L(1, 1)),
  rotation("complex 2⁻²⁰ ± i, 1e6", 2 ** -20, 1, 1e6, U(1, 2), L(2, 1)),
  rotation("complex 1e6 ± 2⁻¹⁰ i, 1", 1e6, 2 ** -10, 1, U(3, 1), L(1, 2)),
  rotation("complex 2⁻³⁰ ± 2⁻³⁰ i, 1e6", 2 ** -30, 2 ** -30, 1e6, U(1, 1), L(1, 1)),
  rotation("complex 1 ± 1e-6 i, 1e3 (nearly real pair)", 1, 2 ** -20, 1000, U(2, 3), L(1, 1)),
];

/**
 * A matrix as a person types it: P · D · P⁻¹ formed with exact decimals (0.1 means 1/10), then each entry written as the
 * nearest double of its exact decimal value (the one rounding that typing `0.1` implies). P, P⁻¹ and D are given as
 * decimal numbers; every product entry must have a finite decimal expansion.
 */
export function typedMatrix(P: Mat, Pinv: Mat, D: Mat): Mat {
  const exact = (M: Mat): FM => {
    const f = decimalRational(M);
    if (!f) throw new Error("typedMatrix: not finite");
    return f;
  };
  const A = mul(mul(exact(P), exact(D)), exact(Pinv));
  const ten = BigInt(10);
  return A.map((row) =>
    row.map((f) => {
      let pow = BigInt(1);
      for (let m = 0; m <= 40; m++, pow *= ten) {
        if ((f.n * pow) % f.d === BigInt(0)) return Number(`${(f.n * pow) / f.d}e-${m}`);
      }
      throw new Error("typedMatrix: entry has no finite decimal expansion");
    }),
  );
}
