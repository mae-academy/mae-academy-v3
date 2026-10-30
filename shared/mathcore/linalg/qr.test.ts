import { describe, expect, it } from "vitest";
import { apply, detFloat } from "./matrix";
import type { Mat } from "./matrix";
import { eigen3, eigenspace3, eigenvalues, hessenberg } from "./qr";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Complex arithmetic for checking det(A − λI) = 0 at complex λ. */
type C = [number, number];
const cm = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cs = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const ca = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
function charPoly3(A: Mat, l: C): C {
  const M: C[][] = A.map((r, i) => r.map((v, j) => (i === j ? cs([v, 0], l) : [v, 0])));
  const minor = (r1: number, r2: number, c1: number, c2: number) => cs(cm(M[r1][c1], M[r2][c2]), cm(M[r1][c2], M[r2][c1]));
  return ca(cs(cm(M[0][0], minor(1, 2, 1, 2)), cm(M[0][1], minor(1, 2, 0, 2))), cm(M[0][2], minor(1, 2, 0, 1)));
}

describe("Hessenberg reduction", () => {
  it("zeros below the first sub-diagonal and keeps trace and determinant", () => {
    const A = [[4, 1, -2, 2], [1, 2, 0, 1], [-2, 0, 3, -2], [2, 1, -2, -1]];
    const H = hessenberg(A);
    for (let i = 2; i < 4; i++) for (let j = 0; j < i - 1; j++) expect(H[i][j]).toBe(0);
    expect(H.reduce((s, r, i) => s + r[i], 0)).toBeCloseTo(4 + 2 + 3 - 1, 12);
    expect(detFloat(H)).toBeCloseTo(detFloat(A), 9);
  });
});

describe("QR eigenvalues (Francis double shift, STEPS.md §8.2)", () => {
  it("diagonal and triangular matrices give their diagonal", () => {
    expect(eigenvalues([[3, 0, 0], [0, -1, 0], [0, 0, 2]]).map((v) => v.re)).toEqual([3, 2, -1]);
    const tri = eigenvalues([[1, 5, 7], [0, 4, 9], [0, 0, 6]]);
    expect(tri.map((v) => v.re)).toEqual([6, 4, 1]);
  });
  it("a rotation about z has eigenvalues 1 and e^{±iθ}", () => {
    const th = 0.7;
    const R = [[Math.cos(th), -Math.sin(th), 0], [Math.sin(th), Math.cos(th), 0], [0, 0, 1]];
    const e = eigenvalues(R);
    expect(e[0].re).toBeCloseTo(1, 13);
    const pair = e.filter((v) => v.im !== 0);
    expect(pair).toHaveLength(2);
    for (const v of pair) {
      expect(v.re).toBeCloseTo(Math.cos(th), 13);
      expect(Math.abs(v.im)).toBeCloseTo(Math.sin(th), 13);
    }
  });
  it("repeated eigenvalues: identity, and a defective Jordan block", () => {
    expect(eigen3([[2, 0, 0], [0, 2, 0], [0, 0, 2]])).toMatchObject({ kind: "repeated-real" });
    expect(eigen3([[2, 0, 0], [0, 2, 0], [0, 0, 2]]).vectors).toHaveLength(3);
    const jordan = eigen3([[2, 1, 0], [0, 2, 1], [0, 0, 2]]);
    expect(jordan.kind).toBe("repeated-real");
    expect(jordan.vectors).toHaveLength(1);
    expect(Math.abs(jordan.vectors[0].vector[0])).toBeCloseTo(1, 6);
    // Two-dimensional eigenspace for the double eigenvalue 1.
    const plane = eigen3([[1, 0, 0], [0, 1, 0], [0, 0, 5]]);
    expect(plane.vectors.filter((v) => Math.abs(v.value - 1) < 1e-12)).toHaveLength(2);
  });
  it("sum = trace, product = determinant, det(A − λI) = 0 on 3000 random 3×3 matrices", () => {
    const r = rng(2026);
    for (let k = 0; k < 3000; k++) {
      const A = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => r() * 20 - 10));
      const e = eigenvalues(A);
      const scale = Math.max(...e.map((v) => Math.hypot(v.re, v.im)), 1);
      const tr = A[0][0] + A[1][1] + A[2][2];
      expect(Math.abs(e.reduce((s, v) => s + v.re, 0) - tr)).toBeLessThan(1e-9 * scale);
      expect(Math.abs(e.reduce((s, v) => s + v.im, 0))).toBeLessThan(1e-9 * scale);
      let prod: C = [1, 0];
      for (const v of e) prod = cm(prod, [v.re, v.im]);
      expect(Math.abs(prod[0] - detFloat(A))).toBeLessThan(1e-9 * scale ** 3);
      for (const v of e) {
        const res = charPoly3(A, [v.re, v.im]);
        expect(Math.hypot(...res)).toBeLessThan(1e-8 * scale ** 3);
      }
    }
  });
  it("real eigenvectors satisfy A v = λ v", () => {
    const r = rng(11);
    for (let k = 0; k < 500; k++) {
      // Symmetric matrices always have three real eigenvalues.
      const B = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => r() * 10 - 5));
      const A = B.map((row, i) => row.map((v, j) => v + B[j][i]));
      const e = eigen3(A);
      expect(e.kind === "complex-pair").toBe(false);
      for (const { value, vector } of e.vectors) {
        const Av = apply(A, vector);
        expect(Math.hypot(...Av.map((x, i) => x - value * vector[i]))).toBeLessThan(1e-7 * Math.max(1, Math.abs(value)));
      }
    }
  });
  it("larger matrices work too (5×5 companion matrix of (x−1)(x−2)(x−3)(x−4)(x−5))", () => {
    // x⁵ − 15x⁴ + 85x³ − 225x² + 274x − 120
    const c = [-120, 274, -225, 85, -15];
    const C = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => (j === 4 ? -c[i] : i === j + 1 ? 1 : 0)));
    const e = eigenvalues(C).map((v) => v.re);
    expect(e.map((v) => Math.round(v * 1e8) / 1e8)).toEqual([5, 4, 3, 2, 1]);
  });
  it("rejects non-square and non-finite input", () => {
    expect(() => eigenvalues([[1, 2]])).toThrow();
    expect(() => eigenvalues([[NaN, 0], [0, 1]])).toThrow();
  });
  it("eigenspace of a rank-0 shift is the whole space", () => {
    expect(eigenspace3([[3, 0, 0], [0, 3, 0], [0, 0, 3]], 3)).toHaveLength(3);
  });
});
