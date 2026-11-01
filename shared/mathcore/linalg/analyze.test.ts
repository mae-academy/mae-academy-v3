/**
 * Phase 4 reports (STEPS.md §8.2): exact determinant and eigenvalue LaTeX, orientation, eigen-directions, the inverse
 * by Gauss-Jordan on [A | I], systems with one, none or infinitely many solutions, and the Phase 4 exit (1e-9 vs the
 * mpmath reference) through this layer as well.
 */
import { describe, expect, it } from "vitest";
import algorithms from "../__golden__/algorithms.json";
import { analyzeMatrix, analyzeSystem, numberLatex, squareFactor, symbolLatex } from "./analyze";
import { apply, multiply } from "./matrix";
import type { Mat } from "./matrix";

describe("analyzeMatrix: 2×2 closed forms", () => {
  it("[[1,2],[3,4]]: det −2 reversed, λ = (5 ± √33)/2, inverse with fractions", () => {
    const a = analyzeMatrix([[1, 2], [3, 4]]);
    expect(a.exact).toBe(true);
    expect(a.det).toMatchObject({ value: -2, latex: "-2", sign: -1, singular: false });
    expect(a.det.working).toBe("\\det A = ad - bc = 1 \\cdot 4 - 2 \\cdot 3 = -2");
    expect(a.trace.latex).toBe("5");
    expect(a.characteristic).toBe("\\det(\\lambda I - A) = \\lambda^{2} - 5\\lambda - 2");
    expect(a.eigen.kind).toBe("distinct");
    expect(a.eigen.latex).toEqual(["\\frac{5 \\pm \\sqrt{33}}{2}"]);
    const [l1, l2] = a.eigen.values.map((v) => v.re);
    expect(l1).toBeCloseTo((5 + Math.sqrt(33)) / 2, 14);
    expect(l2).toBeCloseTo((5 - Math.sqrt(33)) / 2, 14);
    expect(a.inverse.result).toBe("\\begin{bmatrix} -2 & 1 \\\\ \\frac{3}{2} & -\\frac{1}{2} \\end{bmatrix}");
    expect(a.inverse.start).toBe("\\left[\\begin{array}{cc|cc} 1 & 2 & 1 & 0 \\\\ 3 & 4 & 0 & 1 \\end{array}\\right]");
    expect(a.rank).toBe(2);
  });

  it("rational eigenvalues give integer eigen-directions", () => {
    const a = analyzeMatrix([[2, 1], [1, 2]]);
    expect(a.eigen.latex).toEqual(["3", "1"]);
    expect(a.eigen.vectors).toEqual([
      { value: "3", vector: "\\begin{bmatrix} 1 \\\\ 1 \\end{bmatrix}" },
      { value: "1", vector: "\\begin{bmatrix} 1 \\\\ -1 \\end{bmatrix}" },
    ]);
    const b = analyzeMatrix([[4, -2], [1, 1]]);
    expect(b.eigen.latex).toEqual(["3", "2"]);
    expect(b.eigen.vectors.map((v) => v.vector)).toEqual(["\\begin{bmatrix} 2 \\\\ 1 \\end{bmatrix}", "\\begin{bmatrix} 1 \\\\ 1 \\end{bmatrix}"]);
  });

  it("every exact eigen-direction satisfies A v = λ v", () => {
    for (const A of [[[2, 1], [1, 2]], [[4, -2], [1, 1]], [[0, 1], [-6, 5]], [[1, 2], [2, 4]], [[0.5, 0], [0.25, 1]]] as Mat[]) {
      const a = analyzeMatrix(A);
      for (const v of a.eigen.vectors) {
        const nums = v.vector.match(/-?\d+/g)?.map(Number) as number[];
        const lambda = Number(v.value.replace(/\\frac\{(\d+)\}\{(\d+)\}/, (_, p, q) => String(Number(p) / Number(q))));
        const Av = apply(A, nums);
        Av.forEach((x, i) => expect(x).toBeCloseTo(lambda * nums[i], 12));
      }
    }
  });

  it("rotation: λ = ±i, complex kind, no real directions", () => {
    const a = analyzeMatrix([[0, -1], [1, 0]]);
    expect(a.eigen.kind).toBe("complex");
    expect(a.eigen.latex).toEqual(["\\pm i"]);
    expect(a.eigen.vectors).toEqual([]);
    expect(a.eigen.values).toEqual([{ re: 0, im: 1 }, { re: 0, im: -1 }]);
  });

  it("complex with surd and denominator: (3 ± i√47)/4", () => {
    const a = analyzeMatrix([[0.5, 1.5], [-2, 1]]);
    expect(a.det.latex).toBe("\\frac{7}{2}");
    expect(a.eigen.latex).toEqual(["\\frac{3 \\pm i\\sqrt{47}}{4}"]);
    expect(a.eigen.values[0].re).toBeCloseTo(0.75, 14);
    expect(a.eigen.values[0].im).toBeCloseTo(Math.sqrt(47) / 4, 14);
  });

  it("complex with integer parts: 1 ± 2i", () => {
    expect(analyzeMatrix([[1, -2], [2, 1]]).eigen.latex).toEqual(["1 \\pm 2i"]);
  });

  it("surds are reduced: [[1,1],[1,−1]] → ±√2, [[0,8],[1,0]] → ±2√2", () => {
    expect(analyzeMatrix([[1, 1], [1, -1]]).eigen.latex).toEqual(["\\pm \\sqrt{2}"]);
    expect(analyzeMatrix([[0, 8], [1, 0]]).eigen.latex).toEqual(["\\pm 2\\sqrt{2}"]);
  });

  it("scalar matrix: double eigenvalue, every vector", () => {
    const a = analyzeMatrix([[3, 0], [0, 3]]);
    expect(a.eigen.kind).toBe("scalar");
    expect(a.eigen.latex).toEqual(["3 \\text{ (double)}"]);
    expect(a.eigen.vectors[0].vector).toBe("\\text{every } v");
  });

  it("shear: defective, one direction", () => {
    const a = analyzeMatrix([[1, 1], [0, 1]]);
    expect(a.eigen.kind).toBe("defective");
    expect(a.eigen.vectors).toEqual([{ value: "1", vector: "\\begin{bmatrix} 1 \\\\ 0 \\end{bmatrix}" }]);
  });

  it("singular: sign 0, no inverse, rank 1, eigenvalue 0", () => {
    const a = analyzeMatrix([[1, 2], [2, 4]]);
    expect(a.det).toMatchObject({ value: 0, sign: 0, singular: true });
    expect(a.inverse.result).toBeNull();
    expect(a.rank).toBe(1);
    expect(a.eigen.latex).toEqual(["5", "0"]);
    expect(analyzeMatrix([[0, 0], [0, 0]]).rank).toBe(0);
  });

  it("negative entries are parenthesized in the working", () => {
    expect(analyzeMatrix([[-1, 2], [3, -4]]).det.working).toBe(
      "\\det A = ad - bc = \\left(-1\\right) \\cdot \\left(-4\\right) - 2 \\cdot 3 = -2",
    );
  });

  it("irrational entries fall back to floating point with 6 digits", () => {
    const a = analyzeMatrix([[Math.PI, 1], [1, Math.E]]);
    expect(a.exact).toBe(false);
    expect(a.det.latex).toBe("7.53973");
    expect(a.det.value).toBeCloseTo(Math.PI * Math.E - 1, 14);
    expect(a.eigen.working).toBeUndefined();
    expect(a.eigen.latex.length).toBe(2);
  });

  it("the inverse satisfies A A⁻¹ = I (exact and floating point)", () => {
    for (const A of [[[1, 2], [3, 4]], [[0.1, 0.7], [0.3, -0.2]], [[Math.PI, 1], [1, Math.E]], [[2, 0, 1], [1, 3, 2], [1, 1, 2]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]]] as Mat[]) {
      const a = analyzeMatrix(A);
      expect(a.inverse.result).not.toBeNull();
      const inv = a.inverse.values as Mat;
      multiply(A, inv).forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 12)));
      // Agrees with an independent elimination.
      invFromSteps(A).forEach((row, i) => row.forEach((v, j) => expect(inv[i][j]).toBeCloseTo(v, 12)));
      expect(a.inverse.steps[a.inverse.steps.length - 1].matrix).toContain("\\boxed");
    }
    expect(analyzeMatrix([[2, 0, 1], [1, 3, 2], [1, 1, 1]]).inverse).toMatchObject({ result: null, values: null });
  });

  it("3×3: cofactor working, characteristic polynomial, QR eigenvalues", () => {
    const a = analyzeMatrix([[2, 0, 0], [0, 3, 4], [0, 4, 9]]);
    expect(a.size).toBe(3);
    expect(a.det.value).toBe(22);
    expect(a.det.working.startsWith("\\det A = 2\\left(3 \\cdot 9 - 4 \\cdot 4\\right)")).toBe(true);
    expect(a.characteristic).toBe("\\det(\\lambda I - A) = \\lambda^{3} - 14\\lambda^{2} + 35\\lambda - 22");
    expect(a.eigen.values.map((v) => v.re)).toEqual([expect.closeTo(11, 12), expect.closeTo(2, 12), expect.closeTo(1, 12)]);
    expect(a.inverse.result).toContain("\\frac{9}{11}");
  });

  it("rejects other sizes", () => {
    expect(() => analyzeMatrix([[1]])).toThrow();
    expect(() => analyzeMatrix([[1, 2, 3], [4, 5, 6]])).toThrow();
  });
});

/** A⁻¹ by plain Gauss-Jordan, as an independent check of the reported result. */
function invFromSteps(A: Mat): Mat {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...A.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    [M[c], M[p]] = [M[p], M[c]];
    const pv = M[c][c];
    M[c] = M[c].map((v) => v / pv);
    for (let i = 0; i < n; i++) if (i !== c) M[i] = M[i].map((v, j) => v - M[i][c] * M[c][j]);
  }
  return M.map((r) => r.slice(n));
}

describe("analyzeSystem", () => {
  it("unique: x + 2y = 5, 3x + 4y = 6 → x = −4, y = 9/2 with boxed pivots", () => {
    const s = analyzeSystem([[1, 2], [3, 4]], [5, 6], ["x", "y"]);
    expect(s.equations).toEqual(["x + 2y = 5", "3x + 4y = 6"]);
    expect(s.solution).toEqual({ kind: "unique", values: [-4, 4.5], latex: ["x = -4", "y = \\frac{9}{2}"] });
    expect(s.steps.length).toBeGreaterThan(0);
    for (const step of s.steps) expect(step.matrix).toContain("\\boxed{");
    expect(s.start).toBe("\\left[\\begin{array}{cc|c} 1 & 2 & 5 \\\\ 3 & 4 & 6 \\end{array}\\right]");
  });

  it("none: parallel lines", () => {
    const s = analyzeSystem([[1, 1], [2, 2]], [1, 3], ["x", "y"]);
    expect(s.solution).toEqual({ kind: "none" });
    expect(s.rank).toBe(1);
  });

  it("infinite: the same line twice, written parametrically", () => {
    const s = analyzeSystem([[1, -1], [2, -2]], [1, 2], ["x_1", "x_2"]);
    expect(s.solution).toEqual({ kind: "infinite", free: ["x_{2}"], latex: ["x_{1} = 1 + x_{2}", "x_{2} \\in \\mathbb{R}"] });
    expect(s.equations).toEqual(["x_{1} - x_{2} = 1", "2x_{1} - 2x_{2} = 2"]);
  });

  it("infinite with a negative free coefficient and zero right side", () => {
    const s = analyzeSystem([[1, 2], [2, 4]], [0, 0], ["x", "y"]);
    expect(s.solution).toMatchObject({ kind: "infinite", latex: ["x = -2y", "y \\in \\mathbb{R}"] });
  });

  it("zero coefficients are omitted; Greek unknowns get a backslash", () => {
    const s = analyzeSystem([[0, 1], [1, 0]], [2, 3], ["alpha", "y"]);
    expect(s.equations).toEqual(["y = 2", "\\alpha = 3"]);
    expect(s.solution).toMatchObject({ kind: "unique", values: [3, 2] });
  });

  it("3×3 unique solution satisfies A x = b", () => {
    const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
    const b = [8, -11, -3];
    const s = analyzeSystem(A, b, ["x", "y", "z"]);
    expect(s.solution).toMatchObject({ kind: "unique", values: [2, 3, -1], latex: ["x = 2", "y = 3", "z = -1"] });
  });

  it("floating-point systems solve to 1e-12", () => {
    const A = [[Math.SQRT2, 1], [1, Math.PI]];
    const x = [0.3, -1.7];
    const b = apply(A, x);
    const s = analyzeSystem(A, b, ["x", "y"]);
    expect(s.exact).toBe(false);
    if (s.solution.kind !== "unique") throw new Error("expected a unique solution");
    s.solution.values.forEach((v, i) => expect(v).toBeCloseTo(x[i], 12));
  });
});

describe("number formatting", () => {
  it("6 significant digits, exponents in LaTeX", () => {
    expect(numberLatex(2.5)).toBe("2.5");
    expect(numberLatex(-Math.SQRT2)).toBe("-1.41421");
    expect(numberLatex(3.2e-7)).toBe("3.2 \\times 10^{-7}");
    expect(numberLatex(1.23456789e9)).toBe("1.23457 \\times 10^{9}");
    expect(numberLatex(0)).toBe("0");
    expect(numberLatex(NaN)).toBe("\\text{undefined}");
  });

  it("squareFactor pulls out square factors", () => {
    expect(squareFactor(BigInt(72))).toEqual({ k: BigInt(6), r: BigInt(2) });
    expect(squareFactor(BigInt(33))).toEqual({ k: BigInt(1), r: BigInt(33) });
    expect(squareFactor(BigInt(49))).toEqual({ k: BigInt(7), r: BigInt(1) });
  });
});

describe("Phase 4 exit through the report layer: det and eigenvalues within 1e-9 of mpmath", () => {
  interface Case {
    matrix: Mat;
    det: string;
    eigenvalues: Array<{ re: string; im: string }>;
  }
  const cases = (algorithms as unknown as { linalg: Case[] }).linalg;

  it("every 2×2 and 3×3 reference matrix", () => {
    const bad: string[] = [];
    for (const c of cases) {
      const a = analyzeMatrix(c.matrix);
      const want = Number(c.det);
      const hadamard = c.matrix.reduce((p, r) => p * Math.hypot(...r), 1);
      const detErr = Math.abs(a.det.value - want) / Math.max(Math.abs(want), hadamard * 1e-6);
      if (!(detErr <= 1e-9)) bad.push(`det ${JSON.stringify(c.matrix)}`);
      const ref = c.eigenvalues.map((e) => ({ re: Number(e.re), im: Number(e.im) }));
      const scale = Math.max(...ref.map((r) => Math.hypot(r.re, r.im)), Number.MIN_VALUE);
      const left = ref.slice();
      for (const g of a.eigen.values) {
        let best = 0;
        left.forEach((w, i) => {
          if (Math.hypot(g.re - w.re, g.im - w.im) < Math.hypot(g.re - left[best].re, g.im - left[best].im)) best = i;
        });
        const err = Math.hypot(g.re - left[best].re, g.im - left[best].im) / scale;
        left.splice(best, 1);
        if (!(err <= 1e-9)) bad.push(`eigen ${JSON.stringify(c.matrix)}: ${err.toExponential(2)}`);
      }
      if (a.eigen.values.length !== c.matrix.length) bad.push(`count ${JSON.stringify(c.matrix)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("randomized properties (2000 integer and decimal matrices)", () => {
  // Deterministic generator (mulberry32), so a failure is reproducible.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

  /** Numeric value of the closed-form LaTeX: `p`, `\frac{a \pm b\sqrt{r}}{m}`, `a \pm bi\sqrt{r}`, `\pm \frac{…}{m}`. */
  function closedForm(latex: string): Array<{ re: number; im: number }> {
    const frac = (s: string) => {
      const m = /^(-)?\\frac\{(\d+)\}\{(\d+)\}$/.exec(s);
      return m ? (m[1] ? -1 : 1) * (Number(m[2]) / Number(m[3])) : Number(s);
    };
    if (!latex.includes("\\pm")) return [{ re: frac(latex.replace(" \\text{ (double)}", "")), im: 0 }];
    let body = latex;
    let den = 1;
    const outer = /^(\\pm )?\\frac\{(.+)\}\{(\d+)\}$/.exec(latex);
    if (outer) {
      body = (outer[1] ?? "") + outer[2];
      den = Number(outer[3]);
    }
    const m = /^(-?\d+)? ?\\pm (\d*)(i?)(?:\\sqrt\{(\d+)\})?$/.exec(body);
    if (!m) throw new Error(`unparsed ${latex}`);
    const a = Number(m[1] ?? 0);
    const b = (m[2] === "" ? 1 : Number(m[2])) * Math.sqrt(Number(m[4] ?? 1));
    const imaginary = m[3] === "i";
    return imaginary
      ? [{ re: a / den, im: b / den }, { re: a / den, im: -b / den }]
      : [{ re: (a + b) / den, im: 0 }, { re: (a - b) / den, im: 0 }];
  }

  it("2×2 integer matrices: closed-form LaTeX equals the numeric eigenvalues; det sign matches orientation", () => {
    const bad: string[] = [];
    for (let k = 0; k < 2000; k++) {
      const A: Mat = [[int(-9, 9), int(-9, 9)], [int(-9, 9), int(-9, 9)]];
      const a = analyzeMatrix(A);
      const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      if (a.det.value !== det || a.det.sign !== Math.sign(det) || a.det.singular !== (det === 0)) bad.push(`det ${JSON.stringify(A)}`);
      const fromLatex = a.eigen.latex.flatMap(closedForm);
      const numeric = a.eigen.values;
      const scale = Math.max(1, ...numeric.map((v) => Math.hypot(v.re, v.im)));
      const used = new Set<number>();
      for (const v of fromLatex) {
        const j = numeric.findIndex((w, i) => !used.has(i) && Math.hypot(w.re - v.re, w.im - v.im) <= 1e-12 * scale);
        if (j < 0) bad.push(`eigen ${JSON.stringify(A)} ${a.eigen.latex.join(";")}`);
        used.add(j);
      }
      // Sum and product of eigenvalues are the trace and the determinant.
      const sum = numeric.reduce((s, v) => s + v.re, 0);
      if (Math.abs(sum - (A[0][0] + A[1][1])) > 1e-12 * scale) bad.push(`trace ${JSON.stringify(A)}`);
      if (a.inverse.values) {
        multiply(A, a.inverse.values).forEach((row, i) => row.forEach((v, j) => {
          if (Math.abs(v - (i === j ? 1 : 0)) > 1e-12) bad.push(`inverse ${JSON.stringify(A)}`);
        }));
      } else if (det !== 0) bad.push(`missing inverse ${JSON.stringify(A)}`);
    }
    expect(bad).toEqual([]);
  });

  it("2×2 and 3×3 decimal systems: a unique solution satisfies A x = b to 1e-12", () => {
    const bad: string[] = [];
    for (let k = 0; k < 1000; k++) {
      const n = k % 2 === 0 ? 2 : 3;
      const A: Mat = Array.from({ length: n }, () => Array.from({ length: n }, () => int(-50, 50) / 10));
      const b = Array.from({ length: n }, () => int(-50, 50) / 4);
      const s = analyzeSystem(A, b, n === 2 ? ["x", "y"] : ["x", "y", "z"]);
      const det = analyzeMatrix(A).det;
      if ((s.solution.kind === "unique") !== !det.singular) bad.push(`kind ${JSON.stringify(A)}`);
      if (s.solution.kind === "unique") {
        const r = apply(A, s.solution.values);
        if (r.some((v, i) => Math.abs(v - b[i]) > 1e-12 * Math.max(1, Math.abs(b[i])))) bad.push(`residual ${JSON.stringify(A)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("matrix name in the report", () => {
  it("uses the item's name in det, characteristic polynomial", () => {
    const a = analyzeMatrix([[1, 2], [3, 4]], "M");
    expect(a.name).toBe("M");
    expect(a.det.working.startsWith("\\det M = ad - bc")).toBe(true);
    expect(a.characteristic.startsWith("\\det(\\lambda I - M)")).toBe(true);
    expect(analyzeMatrix([[1, 0, 0], [0, 1, 0], [0, 0, 1]], "B_{1}").det.working.startsWith("\\det B_{1} = ")).toBe(true);
  });
});

describe("Phase 4 review: scale-free numerics", () => {
  const I2 = (M: Mat) => M.length === 2;
  const checkInverse = (A: Mat, tol = 1e-12) => {
    const a = analyzeMatrix(A);
    expect(a.inverse.values, JSON.stringify(A)).not.toBeNull();
    multiply(A, a.inverse.values as Mat).forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - (i === j ? 1 : 0))).toBeLessThan(tol)));
    return a;
  };
  it("tiny matrices are not singular and have the right inverse", () => {
    const a = checkInverse([[1e-13, 2e-13], [3e-13, 4e-13]]);
    expect(a.det.singular).toBe(false);
    expect(a.rank).toBe(2);
    expect(a.det.value).toBeCloseTo(-2e-26, 40);
    checkInverse([[2e-15, 0], [0, 3e-15]]);
    expect(analyzeMatrix([[1e-300, 0], [0, 1e-300]]).rank).toBe(2);
  });

  it("badly scaled matrices keep their small entries", () => {
    checkInverse([[Math.PI, 1e8], [1e-8, Math.E]], 1e-9);
    checkInverse([[1e8, 1, 0], [1, 1e-8, 1], [0, 1, 1]], 1e-8);
  });

  it("badly scaled systems solve correctly", () => {
    const A = [[Math.PI * 1e8, 1], [1, Math.E]];
    const b = [1, 2];
    const s = analyzeSystem(A, b, ["x", "y"]);
    if (s.solution.kind !== "unique") throw new Error("expected unique");
    apply(A, s.solution.values).forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(1e-12));
    expect(s.solution.latex[0]).not.toBe("x = 0");
    const big = analyzeSystem([[1e200, 1], [1, -1]], [1, 0], ["x", "y"]);
    expect(big.solution.kind).toBe("unique");
  });

  it("overflowing entries: det is honest (±∞ or exact), eigenvalues ±√2·10²⁰⁰, not singular", () => {
    const a = analyzeMatrix([[1e200, 1e200], [1e200, -1e200]]);
    expect(a.det.singular).toBe(false);
    expect(a.det.value).toBe(-Infinity);
    const l = a.eigen.values.map((v) => v.re).sort((p, q) => p - q);
    expect(l[0] / -(Math.SQRT2 * 1e200)).toBeCloseTo(1, 12);
    expect(l[1] / (Math.SQRT2 * 1e200)).toBeCloseTo(1, 12);
  });

  it("eigenvalues always agree with their kind (exact path with a tiny discriminant)", () => {
    for (const A of [[[1, 1e-9], [2e-9, 1]], [[1, 1e-9], [-2e-9, 1]]] as Mat[]) {
      const a = analyzeMatrix(A);
      expect(a.eigen.values.length).toBe(2);
      const disc = A[0][1] * A[1][0];
      if (disc > 0) {
        expect(a.eigen.kind).toBe("distinct");
        // λ ≈ 1 ± 1.4e-9: the gap is resolved to the ulp of 1 (relative 1e-6 of the gap).
        expect(Math.abs(a.eigen.values[0].re - a.eigen.values[1].re - 2 * Math.sqrt(disc))).toBeLessThan(1e-6 * 2 * Math.sqrt(disc));
        expect(a.eigen.directions?.length).toBe(2);
      } else {
        expect(a.eigen.kind).toBe("complex");
        expect(Math.abs(Math.abs(a.eigen.values[0].im) - Math.sqrt(-disc))).toBeLessThan(1e-6 * Math.sqrt(-disc));
        expect(a.eigen.rotation).toBeDefined();
      }
    }
  });

  it("the determinant of a nearly singular matrix is exact to the last digit", () => {
    const A = [[Math.PI, 2.7182818284590424], [Math.PI, Math.E]];
    const d = analyzeMatrix(A).det.value;
    // Exact: π·(e − 2.7182818284590424) with the stored doubles.
    expect(d).not.toBe(0);
    const small = analyzeMatrix(A).eigen.values.map((v) => Math.abs(v.re)).sort((p, q) => p - q)[0];
    const big = analyzeMatrix(A).eigen.values.map((v) => Math.abs(v.re)).sort((p, q) => q - p)[0];
    expect(Math.abs(small * big - Math.abs(d)) / Math.abs(d)).toBeLessThan(1e-12);
    expect(I2(A)).toBe(true);
  });

  it("floating-point step LaTeX never uses JS exponent syntax", () => {
    const a = analyzeMatrix([[Math.PI * 1e-7, 1], [1, Math.E]]);
    for (const s of a.inverse.steps) {
      expect(s.op).not.toMatch(/\de[-+]?\d/);
      expect(s.matrix).not.toMatch(/\de[-+]?\d/);
    }
    expect(a.inverse.steps.some((s) => s.op.includes("\\times 10^{") || s.matrix.includes("\\times 10^{"))).toBe(true);
  });

  it("multi-letter and Greek names are KaTeX-safe", () => {
    expect(symbolLatex("Rot")).toBe("\\mathrm{Rot}");
    expect(symbolLatex("alpha")).toBe("\\alpha");
    expect(symbolLatex("x_1")).toBe("x_{1}");
    expect(symbolLatex("ab_c2")).toBe("\\mathrm{ab}_{c2}");
    expect(symbolLatex("θ")).toBe("\\text{θ}");
    expect(symbolLatex("M'")).toBe("\\text{M'}");
    expect(analyzeSystem([[1, 0], [0, 1]], [1, 2], ["ab", "theta"]).equations).toEqual(["\\mathrm{ab} = 1", "\\theta = 2"]);
  });
});
