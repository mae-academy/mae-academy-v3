import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import type { Expr } from "../ast/expr";
import { parseLatex } from "../parse/parse";
import { inferType, parameterSymbols } from "./inferType";

const ce = new ComputeEngine();
const parse = (latex: string): Expr => {
  const r = parseLatex(latex, (s) => ce.parse(s, { form: "raw" }).json);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r.expr;
};
const kind = (latex: string) => inferType(parse(latex)).kind;

describe("inferType (STEPS.md §6.2)", () => {
  it("classifies the §6.1 example items", () => {
    expect(kind("y = a\\sin(x)")).toBe("Explicit");
    expect(kind("x^2 + y^2 = 9")).toBe("Implicit");
    expect(kind("M = \\begin{bmatrix} a & 1 \\\\ 0 & 1 \\end{bmatrix}")).toBe("Matrix2");
    expect(kind("\\frac{dy}{dx} = x - y")).toBe("ODE1");
  });

  it("checks the ODE form before the generic cases", () => {
    const t = inferType(parse("y' = x - y"));
    expect(t).toEqual({ kind: "ODE1", dependent: "y", independent: "x", F: ["Subtract", "x", "y"] });
    expect(inferType(parse("\\frac{dx}{dt} = y"))).toMatchObject({ kind: "ODE1", dependent: "x", independent: "t" });
    expect(kind("\\frac{d^2y}{dx^2} = -y")).toBe("Unknown");
  });

  it("Scalar accepts raw numbers and constant expressions", () => {
    expect(inferType(parse("a = 2"))).toMatchObject({ kind: "Scalar", name: "a", literal: 2 });
    expect(inferType(parse("a = -\\frac{1}{2}"))).toMatchObject({ kind: "Scalar", literal: -0.5 });
    expect(inferType(parse("b = 2a"))).toMatchObject({ kind: "Scalar", name: "b", literal: null });
    expect(inferType(["Equal", "a", { num: "3" } as unknown as Expr])).toMatchObject({ kind: "Scalar" });
  });

  it("y = f(x) only if y does not appear on the right; same for x and r", () => {
    expect(kind("y = x^2")).toBe("Explicit");
    expect(inferType(parse("x = y^2"))).toMatchObject({ kind: "Explicit", dependent: "x", independent: "y" });
    expect(kind("y = x + y^2")).toBe("Implicit");
    expect(kind("x^2 = y")).toBe("Explicit");
    expect(kind("r = 1 + \\cos(\\theta)")).toBe("Polar");
    // Implicit polar relations are not in v1: r on both sides is reported, not guessed.
    expect(kind("r = r^2 + \\theta")).toBe("Unknown");
  });

  it("anything else with Equal is Implicit with F = lhs − rhs", () => {
    expect(inferType(parse("x y = 1"))).toEqual({
      kind: "Implicit",
      F: ["Subtract", ["Multiply", "x", "y"], 1],
      relation: "=",
      strict: false,
    });
  });

  it("Less and Greater are strict Implicit; ≤ and ≥ are not", () => {
    expect(inferType(parse("x^2+y^2<4"))).toMatchObject({ kind: "Implicit", relation: "<", strict: true });
    expect(inferType(parse("y > x^2"))).toMatchObject({ kind: "Implicit", relation: ">", strict: true });
    expect(inferType(parse("y \\le x"))).toMatchObject({ kind: "Implicit", relation: "<=", strict: false });
  });

  it("matrices must be 2×2 or 3×3", () => {
    expect(kind("\\begin{pmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{pmatrix}")).toBe("Matrix3");
    expect(inferType(parse("\\begin{pmatrix}1&2\\\\3&4\\\\5&6\\end{pmatrix}"))).toMatchObject({ kind: "Unknown" });
  });

  it("free z without x, y is ComplexMap, deferred by D2", () => {
    expect(inferType(parse("z^2+1"))).toMatchObject({ kind: "Unknown", reason: expect.stringMatching(/D2/) as unknown });
  });

  it("parametric pairs, points, polar, function definitions, distributions, integrals", () => {
    expect(kind("(\\cos t, \\sin t)")).toBe("Parametric");
    expect(kind("(1, 2)")).toBe("Point");
    expect(kind("f(x) = x^2")).toBe("FunctionDef");
    expect(kind("\\operatorname{Normal}(0, 1)")).toBe("Distribution");
    expect(kind("\\int_0^1 x^2 dx")).toBe("RiemannSum");
    expect(kind("\\sin(x)")).toBe("Explicit");
    expect(kind("3")).toBe("Value");
  });

  it("is total: never throws on malformed input", () => {
    for (const bad of [["Define"], ["Equal"], ["Matrix"], ["Tuple", 1, 2, 3, 4], ["Less", 1, 2, 3]] as Expr[]) {
      expect(() => inferType(bad)).not.toThrow();
      expect(inferType(bad).kind).toBe("Unknown");
    }
  });

  it("lists the parameters an item depends on", () => {
    expect(parameterSymbols(parse("y = a\\sin(bx) + c"))).toEqual(["a", "b", "c"]);
  });
});

describe("inferType reviewer findings", () => {
  it("an integral with x free is a function of x; without x it is a RiemannSum", () => {
    expect(kind("\\int_0^x t^2 dt")).toBe("Explicit");
    expect(kind("\\int_0^1 t^2 dt")).toBe("RiemannSum");
  });

  it("x' means d/dt; x' = x is not a self-derivative", () => {
    expect(inferType(parse("x' = y"))).toMatchObject({ kind: "ODE1", dependent: "x", independent: "t" });
    expect(kind("\\frac{dx}{dx} = 1")).toBe("Unknown");
  });

  it("bare reserved symbols other than x need an equation", () => {
    expect(kind("y")).toBe("Unknown");
    expect(kind("\\theta")).toBe("Unknown");
    expect(kind("x")).toBe("Explicit");
    expect(kind("a")).toBe("Value");
  });
});

describe("GaussSystem (STEPS.md §6.1: A x = b)", () => {
  const vec2 = "\\begin{bmatrix}x\\\\y\\end{bmatrix}";
  it("literal matrix times a column of unknowns", () => {
    const t = inferType(parse(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}${vec2}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`));
    expect(t).toEqual({ kind: "GaussSystem", unknowns: ["x", "y"], source: { form: "matrix", A: [[1, 2], [3, 4]], b: [5, 6] } });
    expect(kind(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\cdot${vec2}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`)).toBe("GaussSystem");
  });

  it("3×3 with pmatrix and any unknown names", () => {
    const t = inferType(parse("\\begin{pmatrix}1&2&1\\\\3&4&0\\\\1&1&1\\end{pmatrix}\\begin{pmatrix}a\\\\b\\\\c\\end{pmatrix}=\\begin{pmatrix}5\\\\6\\\\7\\end{pmatrix}"));
    expect(t).toMatchObject({ kind: "GaussSystem", unknowns: ["a", "b", "c"] });
    expect(parameterSymbols(parse("\\begin{pmatrix}1&2&1\\\\3&4&0\\\\1&1&1\\end{pmatrix}\\begin{pmatrix}a\\\\b\\\\c\\end{pmatrix}=\\begin{pmatrix}5\\\\6\\\\7\\end{pmatrix}"))).toEqual(["a", "b", "c"]);
  });

  it("named matrix", () => {
    expect(inferType(parse(`A${vec2}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`))).toEqual({
      kind: "GaussSystem", unknowns: ["x", "y"], source: { form: "matrix", A: { name: "A" }, b: [5, 6] },
    });
  });

  it("cases: 2 equations in x, y and 3 in x, y, z", () => {
    expect(inferType(parse("\\begin{cases}x+2y=5\\\\3x+4y=6\\end{cases}"))).toMatchObject({ kind: "GaussSystem", unknowns: ["x", "y"], source: { form: "equations" } });
    expect(kind("\\begin{cases}x+y+z=1\\\\x-y=0\\\\z=2\\end{cases}")).toBe("GaussSystem");
  });

  it("rejects malformed systems with a reason", () => {
    const reason = (l: string) => {
      const t = inferType(parse(l));
      return t.kind === "Unknown" ? t.reason : t.kind;
    };
    expect(reason(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}${vec2}=5`)).toMatch(/column/);
    expect(reason(`\\begin{bmatrix}1&2&3\\\\3&4&5\\end{bmatrix}${vec2}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`)).toMatch(/2×2/);
    expect(reason(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}${vec2}=\\begin{bmatrix}5\\\\6\\\\7\\end{bmatrix}`)).toMatch(/2 entries/);
    expect(reason(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}x\\\\x\\end{bmatrix}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`)).toMatch(/only once/);
    expect(reason(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\begin{bmatrix}1\\\\y\\end{bmatrix}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`)).toMatch(/names/);
    expect(reason(`\\begin{bmatrix}x&2\\\\3&4\\end{bmatrix}${vec2}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`)).toMatch(/cannot contain the unknowns/);
    expect(reason(`\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}${vec2}=\\begin{bmatrix}y\\\\6\\end{bmatrix}`)).toMatch(/right side cannot/);
    expect(reason("\\begin{bmatrix}1\\\\2\\\\3\\\\4\\end{bmatrix}\\begin{bmatrix}x\\\\y\\\\z\\\\t\\end{bmatrix}=\\begin{bmatrix}1\\\\2\\\\3\\\\4\\end{bmatrix}")).toMatch(/2×2 and 3×3/);
    expect(reason("\\begin{cases}x=1\\end{cases}")).not.toBe("GaussSystem");
    expect(reason("\\begin{cases}x+t=1\\\\y=2\\end{cases}")).toMatch(/t is not allowed/);
    expect(reason("\\begin{cases}x=1\\\\y=2\\\\z=3\\\\x=4\\end{cases}")).toMatch(/2 equations/);
  });
});
