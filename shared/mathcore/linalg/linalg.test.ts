import { describe, expect, it } from "vitest";
import { Fraction } from "./fraction";
import { gaussJordan, matrixToLatex } from "./gaussJordan";
import type { Mat } from "./matrix";
import { apply, detFloat, determinant, eigen2, multiply } from "./matrix";
import { transform2 } from "./transform2";

/** Deterministic pseudo-random numbers for property tests. */
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
const randomMatrix = (n: number, r: () => number): Mat => Array.from({ length: n }, () => Array.from({ length: n }, () => r() * 20 - 10));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

describe("Fraction", () => {
  it("normalizes sign and lowest terms", () => {
    const f = new Fraction(6n, -4n);
    expect([f.n, f.d]).toEqual([-3n, 2n]);
    expect(f.toLatex()).toBe("-\\frac{3}{2}");
    expect(new Fraction(4n, 2n).toLatex()).toBe("2");
  });
  it("converts short decimals exactly and refuses long ones", () => {
    expect(Fraction.fromNumber(0.125)?.toLatex()).toBe("\\frac{1}{8}");
    expect(Fraction.fromNumber(-2.5)?.toLatex()).toBe("-\\frac{5}{2}");
    expect(Fraction.fromNumber(Math.PI)).toBeNull();
    expect(Fraction.fromNumber(NaN)).toBeNull();
  });
  it("does exact arithmetic", () => {
    const third = new Fraction(1n, 3n);
    expect(third.add(third).add(third).isOne()).toBe(true);
    expect(third.mul(new Fraction(3n)).isOne()).toBe(true);
    expect(() => third.div(Fraction.ZERO)).toThrow();
  });
});

describe("determinant (STEPS.md §8.2: by Gaussian elimination)", () => {
  it("exact values for integer matrices", () => {
    expect(determinant([[1, 2], [3, 4]])).toMatchObject({ value: -2, sign: -1, singular: false });
    expect(determinant([[1, 2], [3, 4]]).exact?.toLatex()).toBe("-2");
    expect(determinant([[2, 0, 0], [0, 3, 0], [0, 0, 4]]).value).toBe(24);
    expect(determinant([[0, 1], [1, 0]]).value).toBe(-1);
    expect(determinant([[0, 0, 1], [0, 1, 0], [1, 0, 0]]).value).toBe(-1);
  });
  it("detects singular matrices exactly and relative to scale", () => {
    expect(determinant([[1, 2], [2, 4]])).toMatchObject({ singular: true, sign: 0 });
    expect(determinant([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).singular).toBe(true);
    // Irrational entries: singular within rounding, decided relative to the Hadamard bound.
    const s = Math.SQRT2;
    expect(determinant([[s, s * Math.PI], [1, Math.PI]]).singular).toBe(true);
    // A tiny but well-scaled matrix is not singular.
    expect(determinant([[1e-100, 0], [0, 1e-100]]).singular).toBe(false); // det = 1e-200, still a double
  });
  it("matches closed forms and det(AB) = det(A)det(B) on random matrices", () => {
    const r = rng(42);
    for (let k = 0; k < 500; k++) {
      const A = randomMatrix(2, r);
      const closed = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      expect(rel(detFloat(A), closed)).toBeLessThan(1e-9);
      const B = randomMatrix(3, r);
      const C = randomMatrix(3, r);
      expect(rel(detFloat(multiply(B, C)), detFloat(B) * detFloat(C))).toBeLessThan(1e-9);
    }
  });
  it("row swap flips the sign", () => {
    const A = [[1, 5, 2], [3, -1, 4], [0, 2, 7]];
    expect(determinant([A[1], A[0], A[2]]).value).toBe(-determinant(A).value);
  });
});

describe("2×2 eigenvalues (closed form, explicit special cases)", () => {
  it("distinct real", () => {
    const e = eigen2([[2, 1], [1, 2]]);
    expect(e.kind).toBe("distinct");
    if (e.kind === "distinct") {
      expect(e.values[0]).toBeCloseTo(3, 14);
      expect(e.values[1]).toBeCloseTo(1, 14);
      expect(Math.abs(e.vectors[0][0])).toBeCloseTo(Math.SQRT1_2, 14);
    }
  });
  it("complex pair: a rotation by 90° is 0 ± i with θ = π/2", () => {
    const e = eigen2([[0, -1], [1, 0]]);
    expect(e).toMatchObject({ kind: "complex", re: 0, im: 1, r: 1 });
    if (e.kind === "complex") expect(e.theta).toBeCloseTo(Math.PI / 2, 15);
  });
  it("repeated: scalar matrix (every direction) vs shear (one direction)", () => {
    expect(eigen2([[2, 0], [0, 2]])).toEqual({ kind: "scalar", value: 2 });
    const shear = eigen2([[1, 1], [0, 1]]);
    expect(shear.kind).toBe("defective");
    if (shear.kind === "defective") {
      expect(shear.value).toBe(1);
      expect(Math.abs(shear.vector[0])).toBeCloseTo(1, 14);
      expect(shear.vector[1]).toBeCloseTo(0, 14);
    }
  });
  it("no cancellation for widely separated eigenvalues", () => {
    const e = eigen2([[1e8, 1], [0, 1e-8]]);
    expect(e.kind).toBe("distinct");
    if (e.kind === "distinct") {
      expect(rel(e.values[0], 1e8)).toBeLessThan(1e-14);
      expect(rel(e.values[1], 1e-8)).toBeLessThan(1e-12);
    }
  });
  it("satisfies Av = λv, trace and determinant on 2000 random matrices", () => {
    const r = rng(7);
    for (let k = 0; k < 2000; k++) {
      const A = randomMatrix(2, r);
      const e = eigen2(A);
      const tr = A[0][0] + A[1][1];
      const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      if (e.kind === "distinct") {
        expect(rel(e.values[0] + e.values[1], tr) < 1e-9 || Math.abs(e.values[0] + e.values[1] - tr) < 1e-9).toBe(true);
        expect(Math.abs(e.values[0] * e.values[1] - det)).toBeLessThan(1e-9 * Math.max(1, Math.abs(det)));
        for (let i = 0; i < 2; i++) {
          const v = e.vectors[i];
          const Av = apply(A, v);
          expect(Math.hypot(Av[0] - e.values[i] * v[0], Av[1] - e.values[i] * v[1])).toBeLessThan(1e-9 * Math.max(1, Math.abs(e.values[i])));
        }
      } else if (e.kind === "complex") {
        expect(2 * e.re).toBeCloseTo(tr, 9);
        expect(rel(e.re ** 2 + e.im ** 2, det)).toBeLessThan(1e-9);
      }
    }
  });
});

describe("Gauss-Jordan with annotated steps", () => {
  it("solves a 2×2 system exactly and writes the row operations in LaTeX", () => {
    const g = gaussJordan([[2, 1, 5], [1, 3, 10]], true);
    expect(g.exact).toBe(true);
    expect(g.system).toEqual({ kind: "unique", x: [1, 3], xLatex: ["1", "3"] });
    expect(g.steps.map((s) => s.latex)).toEqual([
      "R_{1} \\leftarrow \\frac{1}{2}R_{1}",
      "R_{2} \\leftarrow R_{2} - R_{1}",
      "R_{2} \\leftarrow \\frac{2}{5}R_{2}",
      "R_{1} \\leftarrow R_{1} - \\frac{1}{2}R_{2}",
    ]);
    expect(g.steps[0].pivot).toEqual([0, 0]);
    expect(g.steps[2].matrixLatex[1]).toEqual(["0", "1", "3"]);
  });
  it("uses partial pivoting (swaps a zero or small pivot)", () => {
    const g = gaussJordan([[0, 1, 2], [3, 1, 1]], true);
    expect(g.steps[0].latex).toBe("R_{1} \\leftrightarrow R_{2}");
    expect(g.system?.kind).toBe("unique");
  });
  it("reports inconsistent and underdetermined systems", () => {
    expect(gaussJordan([[1, 1, 1], [2, 2, 3]], true).system).toEqual({ kind: "none" });
    expect(gaussJordan([[1, 1, 2], [2, 2, 4]], true).system).toEqual({ kind: "infinite", free: [1] });
  });
  it("computes rank and RREF of a 3×3 singular matrix exactly", () => {
    const g = gaussJordan([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(g.rank).toBe(2);
    expect(g.rrefLatex).toEqual([["1", "0", "-1"], ["0", "1", "2"], ["0", "0", "0"]]);
  });
  it("falls back to floating point for irrational entries and still solves", () => {
    const g = gaussJordan([[Math.SQRT2, 1, 1 + Math.SQRT2], [1, Math.PI, 1 + Math.PI]], true);
    expect(g.exact).toBe(false);
    expect(g.system?.kind).toBe("unique");
    if (g.system?.kind === "unique") {
      expect(g.system.x[0]).toBeCloseTo(1, 12);
      expect(g.system.x[1]).toBeCloseTo(1, 12);
    }
  });
  it("solves 500 random 3×3 systems: A·x reproduces b", () => {
    const r = rng(99);
    for (let k = 0; k < 500; k++) {
      const A = randomMatrix(3, r);
      const xTrue = [r() * 4 - 2, r() * 4 - 2, r() * 4 - 2];
      const b = apply(A, xTrue);
      const g = gaussJordan(A.map((row, i) => [...row, b[i]]), true);
      expect(g.system?.kind).toBe("unique");
      if (g.system?.kind === "unique") {
        const res = apply(A, g.system.x).map((v, i) => v - b[i]);
        expect(Math.hypot(...res)).toBeLessThan(1e-9 * Math.max(1, Math.hypot(...b)));
      }
    }
  });
  it("renders augmented matrices with a bar and a boxed pivot", () => {
    expect(matrixToLatex([["1", "2", "3"]], { augmented: true, pivot: [0, 0] })).toBe(
      "\\left[\\begin{array}{cc|c} \\boxed{1} & 2 & 3 \\end{array}\\right]",
    );
  });
});

describe("2×2 transform geometry (STEPS.md §8.2)", () => {
  const view = { xmin: -5, xmax: 5, ymin: -5, ymax: 5, aspect: "equal" as const };
  it("î goes to the first column and ĵ to the second", () => {
    const g = transform2([[2, -1], [1, 3]], view);
    expect(g.iHat).toEqual([2, 1]);
    expect(g.jHat).toEqual([-1, 3]);
  });
  it("the unit square's image has area |det| and the orientation sign", () => {
    const g = transform2([[0, 1], [1, 0]], view);
    const p = g.parallelogram;
    let area = 0;
    for (let i = 0; i + 3 < p.length; i += 2) area += p[i] * p[i + 3] - p[i + 2] * p[i + 1];
    expect(Math.abs(area / 2)).toBe(1);
    expect(g.orientation).toBe(-1);
    expect(transform2([[1, 2], [2, 4]], view).singular).toBe(true);
  });
  it("transformed grid lines stay parallel and evenly spaced", () => {
    const g = transform2([[1, 0.5], [0.2, 1]], view);
    const dir = (l: Float64Array) => Math.atan2(l[3] - l[1], l[2] - l[0]);
    const verticals = g.grid.filter((_, i) => i % 2 === 0);
    for (const l of verticals) expect(Math.abs(Math.sin(dir(l) - dir(verticals[0])))).toBeLessThan(1e-12);
    // Spacing: consecutive lines x = k map to offsets A·(1, 0) apart.
    const mid = (l: Float64Array) => [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2];
    const d1 = mid(verticals[21]).map((v, i) => v - mid(verticals[20])[i]);
    const d2 = mid(verticals[22]).map((v, i) => v - mid(verticals[21])[i]);
    expect(d1[0]).toBeCloseTo(d2[0], 12);
    expect(d1[1]).toBeCloseTo(d2[1], 12);
  });
  it("draws eigen-lines for real eigenvalues and none for a rotation", () => {
    expect(transform2([[2, 1], [1, 2]], view).eigenLines).toHaveLength(2);
    expect(transform2([[1, 1], [0, 1]], view).eigenLines).toHaveLength(1);
    expect(transform2([[0, -1], [1, 0]], view).eigenLines).toHaveLength(0);
  });
});

describe("Fraction.fromNumber edge cases (found while testing)", () => {
  it("never turns a tiny non-zero number into zero", () => {
    expect(Fraction.fromNumber(1e-200)).toBeNull();
    expect(Fraction.fromNumber(0)?.isZero()).toBe(true);
    expect(Fraction.fromNumber(0.1)?.toLatex()).toBe("\\frac{1}{10}");
    expect(Fraction.fromNumber(1e15)?.toLatex()).toBe("1000000000000000");
  });
});
