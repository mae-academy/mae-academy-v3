import { describe, expect, it } from "vitest";
import { apply, detFloat } from "./matrix";
import type { Mat } from "./matrix";
import type { Eigen3Kind } from "./qr";
import { EIGEN_CASES, typedMatrix } from "./eigenCases";
import { complexPlane3, eigen3, eigenspace3, eigenvalues, hessenberg } from "./qr";

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

describe("3×3 eigenvalues: repeated, defective and extreme scales (Phase 5 review)", () => {
  it("defective and repeated cases are classified exactly, with exact values and eigenspace sizes", () => {
    const cases: Array<[number[][], number[], number]> = [
      // λ = 1 triple with one Jordan block: one eigen-direction.
      [[[-2, 4, -3], [-5, 7, -4], [-3, 4, -2]], [1, 1, 1], 1],
      // 3, 2, 2 with 2 defective.
      [[[0, 4, -4], [-4, 8, -5], [-3, 4, -1]], [3, 2, 2], 2],
      // λ = 2 triple with a two-dimensional eigenspace.
      [[[0, 4, -4], [-3, 8, -6], [-2, 4, -2]], [2, 2, 2], 2],
      // Scalar matrix: three directions.
      [[[5, 0, 0], [0, 5, 0], [0, 0, 5]], [5, 5, 5], 3],
    ];
    for (const [A, values, nvec] of cases) {
      const e = eigen3(A);
      expect(e.kind, JSON.stringify(A)).toBe("repeated-real");
      expect(e.values.map((v) => v.re)).toEqual(values);
      expect(e.values.every((v) => v.im === 0)).toBe(true);
      expect(e.vectors.length, JSON.stringify(A)).toBe(nvec);
      for (const { value, vector } of e.vectors) {
        const Av = A.map((r) => r[0] * vector[0] + r[1] * vector[1] + r[2] * vector[2]);
        Av.forEach((x, i) => expect(x).toBeCloseTo(value * vector[i], 10));
      }
    }
  });

  it("entries near 1e154 and 1e-170 neither throw nor lose accuracy", () => {
    const base = [[1, 2, 0], [0, 1, 1], [1, 0, 3]];
    const ref = eigenvalues(base);
    for (const k of [1e154, 1e-170, 1e300]) {
      const got = eigenvalues(base.map((r) => r.map((v) => v * k)));
      for (const g of got) {
        const w = ref.reduce((p, q) => (Math.hypot(q.re * k - g.re, q.im * k - g.im) < Math.hypot(p.re * k - g.re, p.im * k - g.im) ? q : p));
        expect(Math.hypot(g.re - w.re * k, g.im - w.im * k) / (Math.hypot(w.re, w.im) * k)).toBeLessThan(1e-12);
      }
    }
  });

  it("the kind follows the exact discriminant: one real root and a complex pair, or three real roots", () => {
    expect(eigen3([[0, -1, 0], [1, 0, 0], [0, 0, 2]]).kind).toBe("complex-pair");
    expect(eigen3([[2, 1, 0], [1, 2, 0], [0, 0, 5]]).kind).toBe("distinct-real");
  });
});

describe("A3: entries near 1e±200 (eigenvectors, eigenspaces, complex planes)", () => {
  const cases: Array<[string, number[][], Eigen3Kind, number]> = [
    ["distinct real", [[2, 1, 0], [1, 2, 0], [0, 0, 5]], "distinct-real", 3],
    ["complex pair", [[0, -1, 0], [1, 0, 0], [0, 0, 2]], "complex-pair", 1],
    ["Jordan block", [[2, 1, 0], [0, 2, 1], [0, 0, 2]], "repeated-real", 1],
    ["double with a plane", [[1, 0, 0], [0, 1, 0], [0, 0, 3]], "repeated-real", 3],
  ];
  for (const k of [1e200, 1e-200, 1e154, 1e300, 1e-300]) {
    for (const [name, base, kind, nvec] of cases) {
      it(`${name} × ${k}: same kind, finite unit vectors with A v = λ v`, () => {
        const A = base.map((r) => r.map((v) => v * k));
        const e = eigen3(A);
        expect(e.kind).toBe(kind);
        expect(e.vectors).toHaveLength(nvec);
        for (const { value, vector } of e.vectors) {
          expect(vector.every(Number.isFinite)).toBe(true);
          expect(Math.hypot(...vector)).toBeCloseTo(1, 12);
          // Residual relative to the matrix scale (entries are tens of orders from 1, so compare after dividing by k).
          const res = A.map((row, i) => (row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2] - value * vector[i]) / k);
          expect(Math.hypot(...res)).toBeLessThan(1e-9);
        }
      });
    }
    it(`complex plane × ${k} is finite and spans the invariant plane`, () => {
      const A = [[0, -1, 0], [1, 0, 0], [0, 0, 2]].map((r) => r.map((v) => v * k));
      const pair = eigen3(A).values.find((v) => v.im > 0);
      const plane = pair && complexPlane3(A, pair);
      expect(plane).not.toBeNull();
      if (plane) for (const v of [...plane.u, ...plane.w]) expect(Number.isFinite(v)).toBe(true);
      if (plane) expect(Math.hypot(...plane.u, ...plane.w)).toBeCloseTo(1, 12);
    });
  }
});

describe("A2: defective and repeated 3×3 matrices typed as decimals", () => {
  // Changed in the per-value accuracy round: the matrices are P · J · P⁻¹ formed with exact decimals and rounded once,
  // as typing them would. The earlier version multiplied in floating point, which rounds every entry differently; the
  // eigenvalues of those stored doubles are, exactly, a split pair or triple (1e-8 apart), and eigen3 now reports
  // them as they are (per-value accuracy, STEPS.md §8.2) instead of merging them by a tolerance.
  const P = [[1, 1, 0], [0, 1, 1], [1, 0, 1]];
  const Pinv = [[1, -1, 1], [1, 1, -1], [-1, 1, 1]].map((r) => r.map((v) => v / 2));
  const jordan = (l: number, m: number, form: "J3" | "J21" | "D21") =>
    form === "J3" ? [[l, 1, 0], [0, l, 1], [0, 0, l]] : form === "J21" ? [[l, 1, 0], [0, l, 0], [0, 0, m]] : [[l, 0, 0], [0, l, 0], [0, 0, m]];
  // [form, eigenvalue multiset (descending), eigen-directions]
  const expected = (l: number, m: number): Record<string, [number[], number]> => ({
    J3: [[l, l, l], 1],
    J21: [m > l ? [m, l, l] : [l, l, m], 2],
    D21: [m > l ? [m, l, l] : [l, l, m], 3],
  });
  for (const l of [0.1, -3.7, 0.001, 2]) {
    for (const form of ["J3", "J21", "D21"] as const) {
      it(`P·${form}(${l})·P⁻¹ typed as decimals is repeated with the right eigenspaces`, () => {
        const m = 5;
        const A = typedMatrix(P, Pinv, jordan(l, m, form));
        const e = eigen3(A);
        const [values, nvec] = expected(l, m)[form];
        expect(e.kind).toBe("repeated-real");
        expect(e.values.every((v) => v.im === 0)).toBe(true);
        e.values.forEach((v, i) => expect(v.re).toBeCloseTo(values[i], 12));
        expect(e.vectors).toHaveLength(nvec);
        for (const { value, vector } of e.vectors) {
          const res = A.map((row, i) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2] - value * vector[i]);
          expect(Math.hypot(...res)).toBeLessThan(1e-7);
        }
      });
    }
  }
  it("the same matrices with floating-point rounded entries report the eigenvalues of the stored doubles", () => {
    // Not merged: their exact eigenvalues differ by about 1e-8 relative, and the values are exact for what is stored.
    const mm = (X: number[][], Y: number[][]) => X.map((r) => Y[0].map((_, j) => r.reduce((t, v, k) => t + v * Y[k][j], 0)));
    const A = mm(mm(P, jordan(0.1, 5, "J3")), Pinv);
    const e = eigen3(A);
    const trace = A[0][0] + A[1][1] + A[2][2];
    expect(e.values.reduce((t, v) => t + v.re, 0)).toBeCloseTo(trace, 12);
    expect(e.values.every((v) => Math.abs(v.re - 0.1) < 1e-4)).toBe(true);
  });
  it("typed decimals: a Jordan block with λ = 1.1 keeps one direction and the triple value 1.1", () => {
    const e = eigen3([[1.1, 1, 0], [0, 1.1, 1], [0, 0, 1.1]]);
    expect(e.values.map((v) => v.re)).toEqual([1.1, 1.1, 1.1]);
    expect(e.vectors).toHaveLength(1);
  });
  it("eigenvalues that really differ stay distinct and exact", () => {
    expect(eigen3([[1, 0, 0], [0, 1.001, 0], [0, 0, 5]]).kind).toBe("distinct-real");
    expect(eigen3([[1, 0.5, 0], [0, 1.01, 0], [0, 0, 5]]).values.map((v) => v.re)).toEqual([5, 1.01, 1]);
    // Eigenvalues 1 and 1 + 2⁻³⁰ of a diagonal matrix are not merged (they were within the old 1e-6 tolerance).
    const near = eigen3([[1, 0, 0], [0, 1 + 2 ** -30, 0], [0, 0, 5]]);
    expect(near.kind).toBe("distinct-real");
    expect(near.values.map((v) => v.re)).toEqual([5, 1 + 2 ** -30, 1]);
  });
  it("widely spread eigenvalues are not mistaken for repeated ones (the earlier unit-norm test merged them)", () => {
    // Matrix with eigenvalues 1, 1.5 and 1000 (‖A‖ about 6e4): the earlier unit-norm discriminant test took 1 and 1.5
    // for a double root and returned 0.25 relative error.
    const spread = EIGEN_CASES.find((c) => c.name === "spread 1 … 1000");
    if (!spread) throw new Error("case missing");
    const r = eigen3(spread.matrix);
    expect(r.kind).toBe("distinct-real");
    expect(r.values.map((v) => v.re)).toEqual([1000, 1.5, 1]);
  });
});
