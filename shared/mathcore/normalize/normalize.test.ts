import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import { parseLatex } from "../parse/parse";
import { normalize } from "./normalize";

const ce = new ComputeEngine();
const parser = (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;
const core = (latex: string, functions?: string[]) => {
  const r = parseLatex(latex, parser, { functions: new Set(functions) });
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("; "));
  return r.expr;
};

describe("normalize", () => {
  it("implicit multiplication and spelled function names", () => {
    expect(core("xy")).toEqual(["Multiply", "x", "y"]);
    expect(core("sin(x)")).toEqual(["Sin", "x"]);
    expect(core("2asin(x)")).toEqual(["Multiply", 2, "a", ["Sin", "x"]]);
    expect(core("x(x+1)")).toEqual(["Multiply", "x", ["Add", "x", 1]]);
  });

  it("calls user functions only when they are defined", () => {
    expect(core("f(2)", ["f"])).toEqual(["Apply", "f", 2]);
    expect(core("f(2)")).toEqual(["Multiply", "f", 2]);
    expect(core("g(x,y)", ["g"])).toEqual(["Apply", "g", "x", "y"]);
  });

  it("named functions and logs", () => {
    expect(core("\\operatorname{sign}(x)")).toEqual(["Sign", "x"]);
    expect(core("\\log_2(x)")).toEqual(["Log", "x", 2]);
    expect(core("\\log(x)")).toEqual(["Log", "x"]);
    expect(core("\\operatorname{mod}(x,3)")).toEqual(["Mod", "x", 3]);
  });

  it("second-order Leibniz and f'(x)", () => {
    expect(core("\\frac{d^2y}{dx^2}")).toEqual(["D", ["D", "y", "x"], "x"]);
    expect(core("f'(x)", ["f"])).toEqual(["D", ["Apply", "f", "x"], "x"]);
  });

  it("sums and products bind their index", () => {
    expect(core("\\sum_{n=1}^{10} n^2")).toEqual(["Sum", ["Power", "n", 2], "n", 1, 10]);
  });

  it("reports errors with the LaTeX fragment and its position", () => {
    const r = parseLatex("x^2 + ", parser);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].message).toMatch(/unexpected operator/);
      expect(r.errors[0].start).toBe(4);
    }
    expect(parseLatex("\\frac{1}{", parser).ok).toBe(false);
  });

  it("rejects unsupported operations instead of guessing", () => {
    expect(normalize(["PlusMinus", 0, 1]).errors[0].message).toMatch(/Unsupported operation: PlusMinus/);
    expect(normalize("ImaginaryUnit").errors[0].message).toMatch(/D2/);
    expect(normalize(["Integrate", "x", ["Tuple", "x"]]).errors[0].message).toMatch(/definite/);
  });

  it("enforces the input length and node limits (STEPS.md §5.2, §9)", () => {
    expect(parseLatex("x+".repeat(1001) + "x", parser).ok).toBe(false);
    const deep = "1" + "+x".repeat(2600); // under 2000 characters is required first
    expect(parseLatex(deep, parser).ok).toBe(false);
  });

  it("unwraps the object forms of MathJSON", () => {
    expect(normalize({ fn: ["Add", { sym: "x" }, { num: "2.5" }] }).expr).toEqual(["Add", "x", 2.5]);
  });
});
