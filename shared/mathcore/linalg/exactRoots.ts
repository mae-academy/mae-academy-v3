/**
 * Eigenvalues of a 3×3 matrix to full double precision per value (STEPS.md §8.2: 1e-9 for every eigenvalue, not
 * relative to the largest).
 *
 * The characteristic polynomial λ³ + aλ² + bλ + c is computed exactly from the stored doubles (rational arithmetic),
 * and its roots are refined in 512-bit fixed point (BigInt): the real roots by safeguarded Newton inside brackets
 * fixed by the polynomial's critical points, the complex pair (if any) from the deflated quadratic. A small root of a
 * badly scaled matrix, which a QR iteration loses to rounding (its error is about ε‖A‖), comes out with full relative
 * accuracy because the polynomial is evaluated without rounding error. Roots closer together than 2⁻⁴⁶⁰ (a double
 * root of the exact polynomial) are not resolved here: the function returns null and the caller keeps its other result.
 */
import { Fraction } from "./fraction";
import type { Mat } from "./matrix";
import { detExact, toDyadic } from "./matrix";

export interface Root {
  re: number;
  im: number;
}

/**
 * Characteristic polynomial λ³ + aλ² + bλ + c of a 3×3 matrix, exactly (on the stored doubles), and its discriminant
 * Δ = 18abc − 4a³c + a²b² − 4b³ − 27c²: Δ > 0 three distinct real roots, Δ < 0 one real root and a complex pair,
 * Δ = 0 a repeated root (all three equal when also a² = 3b).
 */
export function cubic3(A: Mat): { a: Fraction; b: Fraction; c: Fraction; disc: Fraction } | null {
  const F = toDyadic(A);
  return F ? cubic3Exact(F) : null;
}

/** The same for a matrix of exact rationals. */
export function cubic3Exact(F: Fraction[][]): { a: Fraction; b: Fraction; c: Fraction; disc: Fraction } {
  const T = F[0][0].add(F[1][1]).add(F[2][2]);
  const minor = (i: number, j: number) => F[i][i].mul(F[j][j]).sub(F[i][j].mul(F[j][i]));
  const M = minor(0, 1).add(minor(0, 2)).add(minor(1, 2));
  const D = detExact(F);
  const a = T.neg();
  const b = M;
  const c = D.neg();
  const n = (k: number) => new Fraction(BigInt(k));
  const disc = n(18).mul(a).mul(b).mul(c)
    .sub(n(4).mul(a).mul(a).mul(a).mul(c))
    .add(a.mul(a).mul(b).mul(b))
    .sub(n(4).mul(b).mul(b).mul(b))
    .sub(n(27).mul(c).mul(c));
  return { a, b, c, disc };
}

/**
 * The matrix as typed: each entry replaced by the exact rational of its shortest decimal form (0.1 → 1/10, not the
 * nearest double). Null for a non-finite entry or an exponent beyond ±40 (those are exact doubles already).
 */
export function decimalRational(A: Mat): Fraction[][] | null {
  const ten = BigInt(10);
  const out: Fraction[][] = [];
  for (const row of A) {
    const r: Fraction[] = [];
    for (const v of row) {
      if (!Number.isFinite(v)) return null;
      const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(v));
      if (!m) return null;
      const exp = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
      if (Math.abs(exp) > 40) return null;
      let digits = BigInt(m[2] + (m[3] ?? ""));
      if (m[1]) digits = -digits;
      let f = new Fraction(digits);
      let pow = BigInt(1);
      for (let i = 0; i < Math.abs(exp); i++) pow *= ten;
      f = exp >= 0 ? f.mul(new Fraction(pow)) : f.div(new Fraction(pow));
      r.push(f);
    }
    out.push(r);
  }
  return out;
}

const BITS = 512;
const SH = BigInt(BITS);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const THREE = BigInt(3);
const FOUR = BigInt(4);
/** A value this small (2⁻⁴⁴⁰) counts as zero when it decides a sign. */
const NEGLIGIBLE = ONE << BigInt(BITS - 440);
/** Newton/bisection stops when the bracket is this narrow (2⁻⁴⁸⁰ absolute). */
const STOP = ONE << BigInt(BITS - 480);
const MAX_ITERATIONS = 700;

const mul = (x: bigint, y: bigint): bigint => (x * y) >> SH;
const div = (x: bigint, y: bigint): bigint => (x << SH) / y;
const abs = (x: bigint): bigint => (x < ZERO ? -x : x);
const sign = (x: bigint): number => (x > ZERO ? 1 : x < ZERO ? -1 : 0);

function isqrt(n: bigint): bigint {
  if (n < TWO) return n;
  let x = ONE << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> ONE;
    if (y >= x) return x;
    x = y;
  }
}
const sqrtFixed = (x: bigint): bigint => isqrt(x << SH);
const fromFraction = (f: Fraction): bigint => (f.n << SH) / f.d;
const toNumber = (x: bigint): number => Number(x) / 2 ** BITS;

/** The real root of the cubic inside [lo, hi] (p changes sign there and is monotone), or null if it does not converge. */
function bracketRoot(p: (x: bigint) => bigint, dp: (x: bigint) => bigint, lo0: bigint, hi0: bigint): bigint | null {
  let lo = lo0;
  let hi = hi0;
  const slo = sign(p(lo));
  if (slo === 0) return lo;
  if (slo === sign(p(hi))) return null;
  let x = (lo + hi) >> ONE;
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    const fx = p(x);
    const s = sign(fx);
    if (s === 0) return x;
    if (s === slo) lo = x;
    else hi = x;
    if (hi - lo <= STOP) return (lo + hi) >> ONE;
    // Newton from x when it stays inside the bracket and the bracket is already narrow, else bisect.
    let next = (lo + hi) >> ONE;
    if (it >= 30) {
      const d = dp(x);
      if (d !== ZERO) {
        const n = x - div(fx, d);
        if (n > lo && n < hi) next = n;
      }
    }
    x = next;
  }
  return null;
}

/** All three eigenvalues from the exact characteristic polynomial (sorted by real part, descending), or null. */
export function refinedEigenvalues3(A: Mat): Root[] | null {
  const cub = cubic3(A);
  if (!cub || cub.disc.isZero()) return null;
  const a = fromFraction(cub.a);
  const b = fromFraction(cub.b);
  const c = fromFraction(cub.c);
  const p = (x: bigint): bigint => mul(mul(x + a, x) + b, x) + c;
  const dp = (x: bigint): bigint => mul(THREE * x + TWO * a, x) + b;
  // Cauchy bound: every root has |λ| ≤ 1 + max(|a|, |b|, |c|).
  const bound = (ONE << SH) + [abs(a), abs(b), abs(c)].reduce((m, v) => (v > m ? v : m), ZERO);
  const roots: bigint[] = [];
  const critDisc = mul(a, a) - THREE * b;
  if (critDisc <= ZERO) {
    const r = bracketRoot(p, dp, -bound, bound);
    if (r === null) return null;
    roots.push(r);
  } else {
    const s = sqrtFixed(critDisc);
    const x1 = (-a - s) / THREE;
    const x2 = (-a + s) / THREE;
    const p1 = p(x1);
    const p2 = p(x2);
    if (abs(p1) < NEGLIGIBLE || abs(p2) < NEGLIGIBLE) return null;
    const pts = [-bound, x1, x2, bound];
    for (let k = 0; k < 3; k++) {
      const lo = pts[k];
      const hi = pts[k + 1];
      if (sign(p(lo)) !== sign(p(hi))) {
        const r = bracketRoot(p, dp, lo, hi);
        if (r === null) return null;
        roots.push(r);
      }
    }
  }
  if (roots.length === 3) return roots.map((r) => ({ re: toNumber(r), im: 0 })).sort((u, v) => v.re - u.re);
  if (roots.length !== 1) return null;
  const r = roots[0];
  // Deflate: λ³ + aλ² + bλ + c = (λ − r)(λ² + qλ + s).
  const q = a + r;
  const s2 = b + mul(r, q);
  const disc2 = s2 - mul(q, q) / FOUR;
  if (disc2 <= NEGLIGIBLE) return null;
  const re = -q / TWO;
  const im = sqrtFixed(disc2);
  return [
    { re: toNumber(r), im: 0 },
    { re: toNumber(re), im: toNumber(im) },
    { re: toNumber(re), im: -toNumber(im) },
  ].sort((u, v) => v.re - u.re || v.im - u.im);
}
