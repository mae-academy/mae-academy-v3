/**
 * Teaching reports for a matrix or a linear system (STEPS.md §8.2): determinant with its working, trace and
 * characteristic polynomial, eigenvalues in closed form (2×2) or by QR (3×3), the inverse by Gauss-Jordan on [A | I],
 * and the solution of A x = b by Gauss-Jordan on [A | b]. Everything is plain data with LaTeX strings, so the Worker
 * builds it and the page only typesets it.
 *
 * Exact arithmetic is used when every entry is a short decimal (Fraction); otherwise floating point with
 * `DISPLAY_DIGITS` significant digits in the LaTeX (the numbers themselves keep full precision).
 */
import { Fraction } from "./fraction";
import type { GaussResult } from "./gaussJordan";
import { gaussJordan, matrixToLatex } from "./gaussJordan";
import type { Mat } from "./matrix";
import { DIRECTION_SIGN_RELATIVE, DISPLAY_DIGITS, SQUARE_FACTOR_LIMIT } from "../constants";
import { numberLatex } from "./format";
import { determinant, eigen2, eigenvector, toFractions } from "./matrix";
import type { EigenValue } from "./qr";
import { EIGEN_IMAG_RELATIVE, eigen3 } from "./qr";

export { DISPLAY_DIGITS, numberLatex };

export interface StepReport {
  /** Row operation, e.g. `R_2 \leftarrow R_2 - 3R_1`. */
  op: string;
  /** Matrix after the operation, pivot boxed. */
  matrix: string;
}

export interface EigenReport {
  kind: "distinct" | "scalar" | "defective" | "complex" | "distinct-real" | "repeated-real" | "complex-pair";
  values: EigenValue[];
  /** One LaTeX string per eigenvalue (a conjugate pair as one `a \pm bi`). */
  latex: string[];
  /** Eigen-directions for the real eigenvalues. */
  vectors: Array<{ value: string; vector: string }>;
  /** Closed-form working for 2×2: λ = (T ± √(T² − 4D)) / 2 with the numbers substituted. */
  working?: string;
  /** 2×2: unit eigen-directions for the canvas (none for a scalar matrix: every direction; none when complex). */
  directions?: Array<[number, number]>;
  /** 2×2 with complex eigenvalues α ± iβ: rotation angle θ and scale r in the real eigenvector basis. */
  rotation?: { theta: number; scale: number };
}

export interface MatrixAnalysis {
  size: 2 | 3;
  /** LaTeX of the matrix's name (`M`, or `A` for an unnamed matrix), used in every formula. */
  name: string;
  values: number[][];
  latex: string;
  exact: boolean;
  det: { value: number; latex: string; sign: -1 | 0 | 1; singular: boolean; working: string };
  trace: { value: number; latex: string };
  characteristic: string;
  eigen: EigenReport;
  /** Gauss-Jordan on [A | I]; `result` is A⁻¹ in LaTeX and `values` its numbers, both null for a singular matrix. */
  inverse: { start: string; steps: StepReport[]; result: string | null; values: number[][] | null };
  rank: number;
}

export type SystemSolution =
  | { kind: "unique"; values: number[]; latex: string[] }
  | { kind: "none" }
  /** Pivot unknowns written in terms of the free ones (`x = 1 + y`), then `y \\in \\mathbb{R}`. */
  | { kind: "infinite"; free: string[]; latex: string[] };

export interface SystemAnalysis {
  size: 2 | 3;
  unknowns: string[];
  A: number[][];
  b: number[];
  /** The system written as equations, one LaTeX line each. */
  equations: string[];
  start: string;
  steps: StepReport[];
  rank: number;
  exact: boolean;
  solution: SystemSolution;
}

// ---------------------------------------------------------------- number formatting

type Num = { exact: Fraction | null; value: number };

const fromFraction = (f: Fraction): Num => ({ exact: f, value: f.toNumber() });
const latexOf = (n: Num): string => (n.exact ? n.exact.toLatex() : numberLatex(n.value));
/** Wraps a negative number in parentheses for a product such as (−2)(3). */
const factor = (n: Num): string => (n.value < 0 || (n.exact !== null && n.exact.n < BigInt(0)) ? `\\left(${latexOf(n)}\\right)` : latexOf(n));

const B0 = BigInt(0);
const B1 = BigInt(1);

function babs(a: bigint): bigint {
  return a < B0 ? -a : a;
}

function bgcd(a: bigint, b: bigint): bigint {
  let x = babs(a);
  let y = babs(b);
  while (y !== B0) [x, y] = [y, x % y];
  return x;
}

/** n = k² · r with r as square-free as trial division up to SQUARE_FACTOR_LIMIT finds it (n > 0). */
export function squareFactor(n: bigint): { k: bigint; r: bigint } {
  let k = B1;
  let r = n;
  for (let p = 2; p <= SQUARE_FACTOR_LIMIT; p++) {
    const bp = BigInt(p);
    const sq = bp * bp;
    if (sq > r) break;
    while (r % sq === B0) {
      r /= sq;
      k *= bp;
    }
  }
  return { k, r };
}

/**
 * p ± q√r (r > 0 square-free, or r = −1 style handled by the caller) over one denominator:
 * `\frac{5 \pm \sqrt{33}}{2}`, `1 \pm 2i`, `\pm \frac{\sqrt{2}}{2}`.
 */
function plusMinusLatex(p: Fraction, q: Fraction, root: bigint, imaginary: boolean): string {
  const m = (p.d * q.d) / bgcd(p.d, q.d);
  const a = (p.n * m) / p.d;
  const b = babs((q.n * m) / q.d);
  const radical = root === B1 ? "" : `\\sqrt{${root}}`;
  const coefficient = b === B1 && (radical !== "" || imaginary) ? "" : b.toString();
  const tail = `${coefficient}${imaginary ? "i" : ""}${radical}`;
  const top = a === B0 ? `\\pm ${tail}` : `${a} \\pm ${tail}`;
  if (m === B1) return top;
  return a === B0 ? `\\pm \\frac{${tail}}{${m}}` : `\\frac{${top}}{${m}}`;
}

/** LaTeX column vector. */
const vectorLatex = (entries: string[]) => `\\begin{bmatrix} ${entries.join(" \\\\ ")} \\end{bmatrix}`;

/** Integer direction proportional to rational (x, y), smallest integers, first non-zero entry positive. */
function integerDirection(v: Fraction[]): string[] {
  const nonZero = v.filter((f) => !f.isZero());
  if (nonZero.length === 0) return v.map(() => "0");
  const lcm = nonZero.reduce((l, f) => (l * f.d) / bgcd(l, f.d), B1);
  const ints = v.map((f) => (f.n * lcm) / f.d);
  const g = ints.reduce((acc, x) => bgcd(acc, x), B0) || B1;
  const s = (ints.find((x) => x !== B0) as bigint) < B0 ? -B1 : B1;
  return ints.map((x) => ((s * x) / g).toString());
}

/** Unit direction with DISPLAY_DIGITS digits, first non-zero entry positive. */
function unitDirection(v: number[]): string[] {
  const n = Math.hypot(...v);
  const first = v.find((x) => Math.abs(x) > DIRECTION_SIGN_RELATIVE * n) ?? 1;
  const s = first < 0 ? -1 : 1;
  return v.map((x) => numberLatex((s * x) / n));
}

// ---------------------------------------------------------------- matrices

function steps(g: GaussResult, extra: number): StepReport[] {
  return g.steps.map((s) => ({ op: s.latex, matrix: matrixToLatex(s.matrixLatex, { augmented: extra, pivot: s.pivot }) }));
}

function determinantWorking(A: Mat, F: Fraction[][] | null, det: Num, name: string): string {
  const e = (i: number, j: number): Num => (F ? fromFraction(F[i][j]) : { exact: null, value: A[i][j] });
  const times = (x: Num, y: Num) => `${factor(x)} \\cdot ${factor(y)}`;
  if (A.length === 2) {
    return `\\det ${name} = ad - bc = ${times(e(0, 0), e(1, 1))} - ${times(e(0, 1), e(1, 0))} = ${latexOf(det)}`;
  }
  // Cofactor expansion along the first row.
  const minor = (r1: number, r2: number, c1: number, c2: number) => `${times(e(r1, c1), e(r2, c2))} - ${times(e(r1, c2), e(r2, c1))}`;
  return (
    `\\det ${name} = ${factor(e(0, 0))}\\left(${minor(1, 2, 1, 2)}\\right) - ${factor(e(0, 1))}\\left(${minor(1, 2, 0, 2)}\\right)` +
    ` + ${factor(e(0, 2))}\\left(${minor(1, 2, 0, 1)}\\right) = ${latexOf(det)}`
  );
}

/** λⁿ terms with signed coefficients: `\lambda^2 - 5\lambda + 6`. */
function polynomialLatex(coefficients: Num[]): string {
  const n = coefficients.length - 1;
  let out = "";
  coefficients.forEach((c, i) => {
    const power = n - i;
    const zero = c.exact ? c.exact.isZero() : c.value === 0;
    if (zero && i > 0) return;
    const negative = c.exact ? c.exact.n < B0 : c.value < 0;
    const mag = c.exact ? latexOf(fromFraction(c.exact.abs())) : numberLatex(Math.abs(c.value));
    const unit = mag === "1" && power > 0;
    const v = power === 0 ? "" : power === 1 ? "\\lambda" : `\\lambda^{${power}}`;
    const term = `${unit ? "" : mag}${v}`;
    out += out === "" ? `${negative ? "-" : ""}${term}` : ` ${negative ? "-" : "+"} ${term}`;
  });
  return out;
}

function eigenReport2(A: Mat, F: Fraction[][] | null, T: Num, D: Num): EigenReport {
  const [[a, b], [c, d]] = A;
  const unitOf = (lambda: number): [number, number] => eigenvector(a, b, c, d, lambda);
  if (F && T.exact && D.exact) {
    // Exact classification from the rational discriminant T² − 4D; the numbers come from the same closed form, so
    // the kind, the LaTeX and the values always agree.
    const disc = T.exact.mul(T.exact).sub(D.exact.mul(new Fraction(BigInt(4))));
    const working = `\\lambda = \\frac{T \\pm \\sqrt{T^2 - 4D}}{2} = \\frac{${latexOf(T)} \\pm \\sqrt{${latexOf(fromFraction(disc))}}}{2}`;
    const half = T.exact.div(new Fraction(BigInt(2)));
    if (disc.isZero()) {
      const value = half;
      const values: EigenValue[] = [{ re: value.toNumber(), im: 0 }, { re: value.toNumber(), im: 0 }];
      const scalar = F[0][1].isZero() && F[1][0].isZero() && F[0][0].sub(F[1][1]).isZero();
      const vec = scalar ? null : directionExact(F, value);
      return {
        kind: scalar ? "scalar" : "defective",
        values,
        latex: [`${value.toLatex()} \\text{ (double)}`],
        vectors: vec ? [{ value: value.toLatex(), vector: vec.latex }] : [{ value: value.toLatex(), vector: "\\text{every } v" }],
        directions: vec ? [vec.unit] : [],
        working,
      };
    }
    // √(n/d) = √(n·d) / d, then square factors out.
    const negative = disc.n < B0;
    const { k, r } = squareFactor(babs(disc.n) * disc.d);
    const q = new Fraction(k, disc.d * BigInt(2));
    if (!negative && r === B1) {
      // Rational eigenvalues: exact eigenvectors too.
      const l1 = half.add(q);
      const l2 = half.sub(q);
      const v1 = directionExact(F, l1) as { latex: string; unit: [number, number] };
      const v2 = directionExact(F, l2) as { latex: string; unit: [number, number] };
      return {
        kind: "distinct",
        values: [{ re: l1.toNumber(), im: 0 }, { re: l2.toNumber(), im: 0 }],
        latex: [l1.toLatex(), l2.toLatex()],
        vectors: [{ value: l1.toLatex(), vector: v1.latex }, { value: l2.toLatex(), vector: v2.latex }],
        directions: [v1.unit, v2.unit],
        working,
      };
    }
    const h = half.toNumber();
    const off = q.toNumber() * Math.sqrt(Number(r));
    if (negative) {
      return {
        kind: "complex",
        values: [{ re: h, im: off }, { re: h, im: -off }],
        latex: [plusMinusLatex(half, q, r, true)],
        vectors: [],
        directions: [],
        rotation: rotationOf(h, off, A[1][0]),
        working,
      };
    }
    // The root of larger magnitude directly, the other as det / λ₁ (no cancellation).
    const big = h >= 0 ? h + off : h - off;
    const small = D.value / big;
    const [l1, l2] = big >= small ? [big, small] : [small, big];
    return {
      kind: "distinct",
      values: [{ re: l1, im: 0 }, { re: l2, im: 0 }],
      latex: [plusMinusLatex(half, q, r, false)],
      vectors: [l1, l2].map((l) => ({ value: numberLatex(l), vector: vectorLatex(unitDirection(unitOf(l))) })),
      directions: [unitOf(l1), unitOf(l2)],
      working,
    };
  }
  const e = eigen2(A);
  switch (e.kind) {
    case "distinct":
      return {
        kind: "distinct",
        values: e.values.map((v) => ({ re: v, im: 0 })),
        latex: e.values.map(numberLatex),
        vectors: e.values.map((v, i) => ({ value: numberLatex(v), vector: vectorLatex(unitDirection(e.vectors[i])) })),
        directions: e.vectors,
      };
    case "scalar":
      return {
        kind: "scalar",
        values: [{ re: e.value, im: 0 }, { re: e.value, im: 0 }],
        latex: [`${numberLatex(e.value)} \\text{ (double)}`],
        vectors: [{ value: numberLatex(e.value), vector: "\\text{every } v" }],
        directions: [],
      };
    case "defective":
      return {
        kind: "defective",
        values: [{ re: e.value, im: 0 }, { re: e.value, im: 0 }],
        latex: [`${numberLatex(e.value)} \\text{ (double)}`],
        vectors: [{ value: numberLatex(e.value), vector: vectorLatex(unitDirection(e.vector)) }],
        directions: [e.vector],
      };
    case "complex":
      return {
        kind: "complex",
        values: [{ re: e.re, im: e.im }, { re: e.re, im: -e.im }],
        latex: [`${numberLatex(e.re)} \\pm ${numberLatex(e.im)}i`],
        vectors: [],
        directions: [],
        rotation: rotationOf(e.re, e.im, A[1][0]),
      };
  }
}

/**
 * α ± iβ: in the real basis of an eigenvector, A is a rotation by θ = atan2(β, α) scaled by r = |λ|. The sense is
 * that in which A turns every vector (no real eigen-direction, so it never changes): the sign of î × Aî, which is
 * the matrix entry c = a₂₁ (counter-clockwise positive). `c` is omitted for 3×3 (the plane's orientation is drawn).
 */
function rotationOf(re: number, im: number, c = 1): { theta: number; scale: number } {
  return { theta: Math.sign(c || 1) * Math.atan2(Math.abs(im), re), scale: Math.hypot(re, im) };
}

/** Eigen-direction of a rational 2×2 for rational λ: integers for the LaTeX, and a unit vector for the canvas. */
function directionExact(F: Fraction[][], lambda: Fraction): { latex: string; unit: [number, number] } | null {
  const [[a, b], [c, d]] = F;
  const r1 = [b, lambda.sub(a)];
  const r2 = [lambda.sub(d), c];
  const v = r1.every((x) => x.isZero()) ? r2 : r1;
  if (v.every((x) => x.isZero())) return null;
  const ints = integerDirection(v);
  const nums = ints.map(Number);
  const n = Math.hypot(nums[0], nums[1]);
  return { latex: vectorLatex(ints), unit: [nums[0] / n, nums[1] / n] };
}

function eigenReport3(A: Mat): EigenReport {
  const e = eigen3(A);
  const latex: string[] = [];
  const scale = Math.max(...e.values.map((v) => Math.hypot(v.re, v.im)), Number.MIN_VALUE);
  // Equal values are listed once with their multiplicity (exact for repeated roots, see eigen3).
  const seen: number[] = [];
  for (const v of e.values) {
    const real = Math.abs(v.im) <= EIGEN_IMAG_RELATIVE * scale;
    if (real) {
      if (seen.includes(v.re)) continue;
      seen.push(v.re);
      const m = e.values.filter((w) => w.re === v.re && Math.abs(w.im) <= EIGEN_IMAG_RELATIVE * scale).length;
      latex.push(m === 1 ? numberLatex(v.re) : `${numberLatex(v.re)} \\text{ (${m === 2 ? "double" : "triple"})}`);
    } else if (v.im > 0) latex.push(`${numberLatex(v.re)} \\pm ${numberLatex(Math.abs(v.im))}i`);
  }
  const complex = e.values.find((v) => v.im > 0);
  return {
    kind: e.kind,
    values: e.values,
    latex,
    vectors: e.vectors.map((v) => ({ value: numberLatex(v.value), vector: vectorLatex(unitDirection(v.vector)) })),
    ...(complex ? { rotation: rotationOf(complex.re, complex.im) } : {}),
  };
}

/** `name` is the item's matrix name as LaTeX (`M`); an unnamed matrix is called A. */
export function analyzeMatrix(A: Mat, name = "A"): MatrixAnalysis {
  const n = A.length;
  if ((n !== 2 && n !== 3) || A.some((r) => r.length !== n)) throw new RangeError("analyzeMatrix needs a 2×2 or 3×3 matrix");
  const F = toFractions(A);
  const d = determinant(A);
  const det: Num = d.exact ? fromFraction(d.exact) : { exact: null, value: d.value };
  const T: Num = F ? fromFraction(F.reduce((s, row, i) => s.add(row[i]), Fraction.ZERO)) : { exact: null, value: A.reduce((s, row, i) => s + row[i], 0) };
  const entries = F ? F.map((r) => r.map((f) => f.toLatex())) : A.map((r) => r.map(numberLatex));

  let characteristic: string;
  if (n === 2) {
    characteristic = `\\det(\\lambda I - ${name}) = ${polynomialLatex([{ exact: F ? Fraction.ONE : null, value: 1 }, neg(T), det])}`;
  } else {
    // λ³ − Tλ² + Mλ − D, M = sum of the principal 2×2 minors.
    const minor = (i: number, j: number): Num =>
      F
        ? fromFraction(F[i][i].mul(F[j][j]).sub(F[i][j].mul(F[j][i])))
        : { exact: null, value: A[i][i] * A[j][j] - A[i][j] * A[j][i] };
    const M = [minor(0, 1), minor(0, 2), minor(1, 2)].reduce((s, m) => add(s, m));
    characteristic = `\\det(\\lambda I - ${name}) = ${polynomialLatex([{ exact: F ? Fraction.ONE : null, value: 1 }, neg(T), M, neg(det)])}`;
  }

  const identity = A.map((row, i) => [...row, ...A.map((_, j) => (i === j ? 1 : 0))]);
  const g = gaussJordan(identity, n);
  // No inverse when the determinant says singular or the elimination found fewer than n pivots.
  const invertible = !d.singular && g.rank === n;
  const inverse = invertible ? matrixToLatex(g.rrefLatex.map((row) => row.slice(n))) : null;
  return {
    size: n,
    name,
    values: A.map((r) => r.slice()),
    latex: matrixToLatex(entries),
    exact: F !== null,
    det: { value: det.value, latex: latexOf(det), sign: d.sign, singular: d.singular, working: determinantWorking(A, F, det, name) },
    trace: { value: T.value, latex: latexOf(T) },
    characteristic,
    eigen: n === 2 ? eigenReport2(A, F, T, det) : eigenReport3(A),
    inverse: { start: matrixToLatex(identity.map((r, i) => r.map((v, j) => (j < n ? entries[i][j] : String(v)))), { augmented: n }), steps: steps(g, n), result: inverse, values: invertible ? g.rref.map((row) => row.slice(n)) : null },
    // Pivots are taken only in A's columns, so this is the rank of A.
    rank: g.rank,
  };
}

function neg(x: Num): Num {
  return x.exact ? fromFraction(x.exact.neg()) : { exact: null, value: -x.value };
}

function add(x: Num, y: Num): Num {
  return x.exact && y.exact ? fromFraction(x.exact.add(y.exact)) : { exact: null, value: x.value + y.value };
}

// ---------------------------------------------------------------- systems

/** `2x - y = 3` from one row; coefficients 0 are omitted, 1 and −1 print as signs. */
function equationLatex(row: string[], numeric: number[], unknowns: string[], rhs: string): string {
  let out = "";
  row.forEach((c, j) => {
    if (numeric[j] === 0) return;
    const negative = c.startsWith("-");
    const mag = negative ? c.slice(1) : c;
    const term = `${mag === "1" ? "" : mag}${unknowns[j]}`;
    out += out === "" ? `${negative ? "-" : ""}${term}` : ` ${negative ? "-" : "+"} ${term}`;
  });
  return `${out === "" ? "0" : out} = ${rhs}`;
}

const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "iota", "kappa", "lambda",
  "mu", "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi", "varphi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
]);

/**
 * LaTeX of a symbol name: `x_1` → `x_{1}`, Greek names (`alpha`) get a backslash, other multi-letter names are
 * upright (`\mathrm{Rot}`), so no undefined macro reaches KaTeX.
 */
export function symbolLatex(name: string): string {
  const m = /^([A-Za-z]+)(?:_(\w+))?$/.exec(name);
  // Anything else (θ, M′, …) as escaped text, never empty and never merged with another name.
  if (!m) return `\\text{${name.replace(/[\\{}$&#^_%~]/g, (ch) => `\\${ch}`)}}`;
  const [, base, sub] = m;
  const head = base.length === 1 ? base : GREEK.has(base) ? `\\${base}` : `\\mathrm{${base}}`;
  return sub ? `${head}_{${sub}}` : head;
}

/** x_c = rhs − Σ M[r][j] x_j over the free columns j, for each pivot (r, c) of the RREF of [A | b]. */
function parametric(g: GaussResult, free: number[], names: string[]): string[] {
  const n = names.length;
  const lines = g.pivots.map(([r, c]) => {
    // The LaTeX entries already print values below the elimination tolerance as 0.
    let out = g.rrefLatex[r][n] === "0" ? "" : g.rrefLatex[r][n];
    for (const j of free) {
      if (g.rrefLatex[r][j] === "0") continue;
      const s = g.rrefLatex[r][j];
      // The term moves to the right side, so its sign flips.
      const negative = !s.startsWith("-");
      const mag = negative ? s : s.slice(1);
      const term = `${mag === "1" ? "" : mag}${names[j]}`;
      out += out === "" ? `${negative ? "-" : ""}${term}` : ` ${negative ? "-" : "+"} ${term}`;
    }
    return `${names[c]} = ${out === "" ? "0" : out}`;
  });
  return lines.concat(free.map((j) => `${names[j]} \\in \\mathbb{R}`));
}

export function analyzeSystem(A: Mat, b: number[], unknowns: string[]): SystemAnalysis {
  const n = A.length;
  if ((n !== 2 && n !== 3) || A.some((r) => r.length !== n) || b.length !== n || unknowns.length !== n) {
    throw new RangeError("analyzeSystem needs a 2×2 or 3×3 system");
  }
  const augmented = A.map((row, i) => [...row, b[i]]);
  const F = toFractions(augmented);
  const entries = F ? F.map((r) => r.map((f) => f.toLatex())) : augmented.map((r) => r.map(numberLatex));
  const names = unknowns.map(symbolLatex);
  const g = gaussJordan(augmented, true);
  const sys = g.system;
  let solution: SystemSolution;
  if (!sys || sys.kind === "none") solution = { kind: "none" };
  else if (sys.kind === "infinite") solution = { kind: "infinite", free: sys.free.map((j) => names[j]), latex: parametric(g, sys.free, names) };
  else solution = { kind: "unique", values: sys.x, latex: sys.xLatex.map((v, i) => `${names[i]} = ${v}`) };
  return {
    size: n,
    unknowns,
    A: A.map((r) => r.slice()),
    b: b.slice(),
    equations: entries.map((row, i) => equationLatex(row.slice(0, n), augmented[i].slice(0, n), names, row[n])),
    start: matrixToLatex(entries, { augmented: true }),
    steps: steps(g, 1),
    rank: g.rank,
    exact: g.exact,
    solution,
  };
}
