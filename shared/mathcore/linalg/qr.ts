/**
 * Eigenvalues of small real matrices (STEPS.md §8.2: 3×3 by QR iteration with Wilkinson shift).
 *
 * 1. Householder reduction to upper Hessenberg form (same eigenvalues, cheaper QR steps).
 * 2. Francis double-shift QR. The two shifts are the eigenvalues of the trailing 2×2 block (the Wilkinson shift,
 *    taken as a conjugate pair), so complex eigenvalues converge in real arithmetic. A negligible sub-diagonal entry
 *    deflates a 1×1 block (real eigenvalue) or a 2×2 block (real pair or complex pair). After 10 and 20 iterations
 *    without deflation an exceptional shift breaks cycles. (Algorithm of EISPACK `hqr`.)
 * Repeated and complex eigenvalues are therefore handled explicitly, as the plan requires.
 */
import { EIGEN_CLUSTER_RELATIVE, EIGEN_DISC_RELATIVE, EIGEN_IMAG_RELATIVE } from "../constants";
import type { Mat } from "./matrix";
import { detExact, powerOfTwoScale, toDyadic } from "./matrix";
import { Fraction } from "./fraction";

export { EIGEN_IMAG_RELATIVE };

export interface EigenValue {
  re: number;
  im: number;
}

/** Iterations per eigenvalue before giving up (EISPACK uses 30). */
const MAX_ITERATIONS = 30;
/** Iteration counts at which an exceptional shift is applied. */
const EXCEPTIONAL_SHIFT_AT = new Set([10, 20]);

const sign = (a: number, b: number) => (b >= 0 ? Math.abs(a) : -Math.abs(a));

/** Householder reduction to upper Hessenberg form (in a copy). */
export function hessenberg(A: Mat): Mat {
  const n = A.length;
  const H = A.map((r) => r.slice());
  for (let k = 0; k < n - 2; k++) {
    let alpha = 0;
    for (let i = k + 1; i < n; i++) alpha += H[i][k] * H[i][k];
    alpha = Math.sqrt(alpha);
    if (alpha === 0) continue;
    if (H[k + 1][k] > 0) alpha = -alpha;
    const v = new Array<number>(n).fill(0);
    v[k + 1] = H[k + 1][k] - alpha;
    for (let i = k + 2; i < n; i++) v[i] = H[i][k];
    const vv = v.reduce((s, x) => s + x * x, 0);
    if (vv === 0) continue;
    // H ← (I − 2vvᵀ/vᵀv) H (I − 2vvᵀ/vᵀv)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = k + 1; i < n; i++) s += v[i] * H[i][j];
      s = (2 * s) / vv;
      for (let i = k + 1; i < n; i++) H[i][j] -= s * v[i];
    }
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = k + 1; j < n; j++) s += H[i][j] * v[j];
      s = (2 * s) / vv;
      for (let j = k + 1; j < n; j++) H[i][j] -= s * v[j];
    }
    for (let i = k + 2; i < n; i++) H[i][k] = 0;
  }
  return H;
}

/**
 * All eigenvalues of a real square matrix, real ones with im = 0, complex ones in conjugate pairs. The matrix is
 * divided by a power of two near its largest entry first (exact), so entries near 1e±300 neither overflow nor
 * underflow inside the reduction; the eigenvalues are scaled back.
 */
export function eigenvalues(A: Mat): EigenValue[] {
  const n = A.length;
  if (n === 0 || A.some((r) => r.length !== n)) throw new RangeError("eigenvalues needs a square matrix");
  if (A.flat().some((v) => !Number.isFinite(v))) throw new RangeError("eigenvalues needs finite entries");
  const k = powerOfTwoScale(A);
  return eigenvaluesScaled(A.map((r) => r.map((v) => v / k))).map((e) => ({ re: e.re * k, im: e.im * k }));
}

function eigenvaluesScaled(A: Mat): EigenValue[] {
  const n = A.length;
  const a = hessenberg(A);
  const wr = new Array<number>(n).fill(0);
  const wi = new Array<number>(n).fill(0);
  let anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);

  let nn = n - 1;
  let t = 0;
  let p = 0;
  let q = 0;
  let r = 0;
  // Assigned on the first pass through the loop before they are read (EISPACK's register-style variables).
  let s: number;
  let w: number;
  let x: number;
  let y: number;
  let z: number;
  while (nn >= 0) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 1; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) {
          a[l][l - 1] = 0;
          break;
        }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn] = 0;
        nn--;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z !== 0) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -z;
            wi[nn] = z;
          }
          nn -= 2;
        } else {
          if (its === MAX_ITERATIONS) throw new Error("QR iteration did not converge");
          if (EXCEPTIONAL_SHIFT_AT.has(its)) {
            t += x;
            for (let i = 0; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else a[k][k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return wr.map((re, i) => ({ re, im: wi[i] })).sort((u, v) => v.re - u.re || v.im - u.im);
}

export type Eigen3Kind = "distinct-real" | "repeated-real" | "complex-pair";

export interface Eigen3 {
  kind: Eigen3Kind;
  values: EigenValue[];
  /** Unit eigenvectors for the real eigenvalues (a repeated eigenvalue may contribute 2 or 3). */
  vectors: Array<{ value: number; vector: [number, number, number] }>;
}

/** Relative tolerance for treating two eigenvalues as equal, or an imaginary part as zero. */
const EIGEN_EQUAL_TOLERANCE = EIGEN_IMAG_RELATIVE;

const cross = (u: number[], v: number[]): [number, number, number] => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const norm3 = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

/**
 * Null space of A − λI for a 3×3 A: 1, 2 or 3 unit vectors depending on the rank. Works on A and λ divided by a power
 * of two near the largest entry (exact), so cross products of rows neither overflow nor underflow for entries near
 * 1e±200.
 */
export function eigenspace3(A: Mat, lambda: number): Array<[number, number, number]> {
  const k = powerOfTwoScale([...A, [lambda, 0, 0]]);
  const M = A.map((row, i) => row.map((v, j) => v / k - (i === j ? lambda / k : 0)));
  const scale = Math.max(...A.flat().map((v) => Math.abs(v / k)), Math.abs(lambda / k), Number.MIN_VALUE);
  const tol = 1e-8 * scale;
  const crosses = [cross(M[0], M[1]), cross(M[0], M[2]), cross(M[1], M[2])].sort((u, v) => norm3(v) - norm3(u));
  if (norm3(crosses[0]) > tol * scale) {
    const c = crosses[0];
    const nrm = norm3(c);
    return [[c[0] / nrm, c[1] / nrm, c[2] / nrm]];
  }
  // Rank ≤ 1: the eigenspace is the plane orthogonal to the largest row (or everything if M = 0).
  const rows = M.slice().sort((u, v) => norm3(v) - norm3(u));
  if (norm3(rows[0]) <= tol) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const nrow = rows[0].map((v) => v / norm3(rows[0]));
  const helper = Math.abs(nrow[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(nrow, helper);
  const un = norm3(u);
  const e1: [number, number, number] = [u[0] / un, u[1] / un, u[2] / un];
  const e2 = cross(nrow, e1);
  return [e1, e2];
}

/**
 * Characteristic polynomial λ³ + aλ² + bλ + c of a 3×3 matrix, exactly (on the stored doubles), and its discriminant
 * Δ = 18abc − 4a³c + a²b² − 4b³ − 27c²: Δ > 0 three distinct real roots, Δ < 0 one real root and a complex pair,
 * Δ = 0 a repeated root (all three equal when also a² = 3b).
 */
function cubic3(A: Mat): { a: Fraction; b: Fraction; c: Fraction; disc: Fraction } | null {
  const F = toDyadic(A);
  if (!F) return null;
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
 * 3×3 eigen-decomposition. The matrix is divided by a power of two near its largest entry first (exact), so entries
 * near 1e±200 neither overflow nor underflow; values are scaled back, unit vectors are unaffected.
 *
 * The kind comes from the exact discriminant of the characteristic polynomial, so repeated and defective cases are
 * recognised exactly (QR alone splits a triple root by ~1e-5); a repeated root and the simple one are then exact too:
 * for λ³ + aλ² + bλ + c with Δ = 0, the double root is (9c − ab) / (2(a² − 3b)) and the simple one
 * (4ab − 9c − a³) / (a² − 3b); a triple root is −a/3. Eigen-directions number 3 − rank(A − λI).
 *
 * A matrix whose entries were rounded (typed decimals, a similarity transform of a Jordan form) has Δ ≠ 0 although it
 * is a repeated-root matrix to working precision. When |Δ| ≤ EIGEN_DISC_RELATIVE for the matrix scaled to unit size
 * (eigenvalues closer than about 1e-6 of the matrix norm), the roots are treated as repeated: a triple root is
 * trace/3, a double root (trace − simple)/2 with the simple root from QR (symmetric functions of the roots are
 * insensitive to the splitting), and the eigenspaces come from the numerical rank of A − λI. Distinct and complex
 * values otherwise come from QR.
 */
export function eigen3(A: Mat): Eigen3 {
  if (A.length !== 3 || A.some((r) => r.length !== 3)) throw new RangeError("eigen3 needs a 3×3 matrix");
  if (A.flat().some((v) => !Number.isFinite(v))) throw new RangeError("eigen3 needs finite entries");
  const k = powerOfTwoScale(A);
  const r = eigen3Scaled(A.map((row) => row.map((v) => v / k)));
  return { kind: r.kind, values: r.values.map((e) => ({ re: e.re * k, im: e.im * k })), vectors: r.vectors.map((v) => ({ value: v.value * k, vector: v.vector })) };
}

const dist = (u: EigenValue, v: EigenValue) => Math.hypot(u.re - v.re, u.im - v.im);

function eigen3Scaled(A: Mat): Eigen3 {
  const cub = cubic3(A);
  const three = new Fraction(BigInt(3));
  let roots: Array<{ value: number; multiplicity: number }> | null = null;
  if (cub && cub.disc.isZero()) {
    const { a, b, c } = cub;
    const p = a.mul(a).sub(b.mul(three));
    if (p.isZero()) roots = [{ value: a.neg().div(three).toNumber(), multiplicity: 3 }];
    // p = (sum of squared root gaps) / 2 = 2d² for a double root and a simple one d apart: a tiny p means the three
    // roots coincide to working precision (rounded entries), which the tolerance path below handles.
    else if (Math.sqrt(Math.abs(p.toNumber()) / 2) > EIGEN_CLUSTER_RELATIVE) {
      const double = c.mul(new Fraction(BigInt(9))).sub(a.mul(b)).div(p.mul(new Fraction(BigInt(2))));
      const simple = a.mul(b).mul(new Fraction(BigInt(4))).sub(c.mul(new Fraction(BigInt(9)))).sub(a.mul(a).mul(a)).div(p);
      roots = [{ value: double.toNumber(), multiplicity: 2 }, { value: simple.toNumber(), multiplicity: 1 }];
    }
  }
  const values = roots ? [] : eigenvalues(A);
  if (!roots) {
    // Product of squared root gaps (the discriminant), for a matrix of unit size.
    const disc = cub ? Math.abs(cub.disc.toNumber()) : dist(values[0], values[1]) ** 2 * dist(values[0], values[2]) ** 2 * dist(values[1], values[2]) ** 2;
    if (disc <= EIGEN_DISC_RELATIVE) {
      const trace = A[0][0] + A[1][1] + A[2][2];
      // The isolated root is the one farthest from the other two; if even that one is close, all three coincide.
      const gap = values.map((v, i) => Math.min(...values.filter((_, j) => j !== i).map((w) => dist(v, w))));
      const s = gap.indexOf(Math.max(...gap));
      if (gap[s] <= EIGEN_CLUSTER_RELATIVE) roots = [{ value: trace / 3, multiplicity: 3 }];
      else {
        const simple = values[s].re;
        roots = [{ value: (trace - simple) / 2, multiplicity: 2 }, { value: simple, multiplicity: 1 }];
      }
    }
  }
  if (roots) {
    const flat: EigenValue[] = roots
      .flatMap((r) => Array.from({ length: r.multiplicity }, () => ({ re: r.value, im: 0 })))
      .sort((u, v) => v.re - u.re);
    const vectors = roots.flatMap((r) => eigenspace3(A, r.value).slice(0, r.multiplicity).map((vector) => ({ value: r.value, vector })));
    return { kind: "repeated-real", values: flat, vectors };
  }
  const scale = Math.max(...values.map((v) => Math.hypot(v.re, v.im)), Number.MIN_VALUE);
  // Δ < 0: one real root and a complex pair, whatever the rounding in QR says.
  const complex = cub ? cub.disc.n < BigInt(0) : values.some((v) => Math.abs(v.im) > EIGEN_EQUAL_TOLERANCE * scale);
  if (cub) {
    if (complex) {
      // The real root is the value with the smallest |im|; the pair keeps its conjugate imaginary parts.
      const sorted = values.slice().sort((u, v) => Math.abs(u.im) - Math.abs(v.im));
      sorted[0] = { re: sorted[0].re, im: 0 };
      values.splice(0, values.length, ...sorted);
    } else for (const v of values) v.im = 0;
  }
  const reals = values.filter((v) => v.im === 0 || Math.abs(v.im) <= EIGEN_EQUAL_TOLERANCE * scale).map((v) => v.re);
  const vectors = reals.flatMap((value) => eigenspace3(A, value).slice(0, 1).map((vector) => ({ value, vector })));
  return { kind: complex ? "complex-pair" : "distinct-real", values, vectors };
}

/**
 * For a complex eigenvalue λ = α + iβ of a 3×3 matrix, a complex eigenvector v = u + iw (null vector of A − λI as the
 * cross product of two of its rows, in complex arithmetic). In the basis (u, w) of the invariant plane, A acts as a
 * rotation by θ = atan2(β, α) scaled by |λ|.
 */
export function complexPlane3(A: Mat, lambda: EigenValue): { u: [number, number, number]; w: [number, number, number] } | null {
  type C = [number, number];
  const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
  // Divided by a power of two near the largest entry (exact) so products of entries near 1e±200 stay finite.
  const k = powerOfTwoScale([...A, [lambda.re, lambda.im, 0]]);
  const M: C[][] = A.map((r, i) => r.map((v, j): C => (i === j ? [v / k - lambda.re / k, -lambda.im / k] : [v / k, 0])));
  const cross = (p: C[], q: C[]): C[] => [
    sub(mul(p[1], q[2]), mul(p[2], q[1])),
    sub(mul(p[2], q[0]), mul(p[0], q[2])),
    sub(mul(p[0], q[1]), mul(p[1], q[0])),
  ];
  const size = (v: C[]) => Math.hypot(...v.map((c) => Math.hypot(c[0], c[1])));
  const options = [cross(M[0], M[1]), cross(M[0], M[2]), cross(M[1], M[2])].sort((a, b) => size(b) - size(a));
  const v = options[0];
  const n = size(v);
  if (!(n > 0)) return null;
  return { u: v.map((c) => c[0] / n) as [number, number, number], w: v.map((c) => c[1] / n) as [number, number, number] };
}
