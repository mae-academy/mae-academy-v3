import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import { GraphEngine } from "../engine/graphEngine";
import { emptyGraph } from "../ir/types";
import type { Item } from "../ir/types";
import { classifyStatement, effectiveInterpretation, parseNumberAssignment } from "./classify";
import { deriveHelpers, fractionLatex, nearFraction, parseCalculus } from "./derive";

const ce = new ComputeEngine();
const parser = (l: string): unknown => ce.parse(l, { form: "raw" }).json;
const items = (...l: string[]): Item[] => l.map((latex, i) => ({ id: `i${i + 1}`, latex }));
function run(latex: string[]) {
  const user = items(...latex);
  const helpers = deriveHelpers(user);
  const e = new GraphEngine(parser, { ...emptyGraph(), items: [...user, ...helpers.map((h) => h.item)] });
  return { e, helpers };
}
const valueOf = (e: GraphEngine, id: string) => {
  const r = e.runtime(id);
  return r?.kind === "Value" ? r.value : undefined;
};

describe("calculus statements", () => {
  it("recognises f'(x), d/dx f(x) and integrals with and without bounds", () => {
    expect(parseCalculus("f'(x)")).toMatchObject({ kind: "derivative", fn: "f" });
    expect(parseCalculus("\\frac{d}{dx}f(x)")).toMatchObject({ kind: "derivative", fn: "f" });
    expect(parseCalculus("\\int_0^1 f(x)\\,dx")).toMatchObject({ kind: "integral", lower: "0", upper: "1", body: "f(x)", variable: "x", missingBounds: false });
    expect(parseCalculus("\\int_{0}^{\\pi}\\sin(x)dx")).toMatchObject({ lower: "0", upper: "\\pi", body: "\\sin(x)" });
    expect(parseCalculus("\\int f(x)\\,dx")).toMatchObject({ lower: "a", upper: "b", missingBounds: true });
    expect(parseCalculus("\\int_0 f(x)\\,dx")).toMatchObject({ lower: "0", upper: "b", missingBounds: true });
    expect(parseCalculus("y=x")).toBeNull();
  });

  it("the example from the request: f(x)=x^2 and ∫_0^1 f(x)dx give the area 1/3 within 1e-9", () => {
    const { e, helpers } = run(["f(x)=x^2", "\\int_0^1 f(x)\\,dx"]);
    const value = helpers.find((h) => h.role === "integral");
    expect(value).toBeDefined();
    expect(Math.abs((valueOf(e, value!.item.id) ?? NaN) - 1 / 3)).toBeLessThan(1e-9);
    // The shaded area is an inequality item with no errors.
    const area = helpers.find((h) => h.role === "area")!;
    expect(e.item(area.item.id)?.errors).toEqual([]);
    expect(e.runtime(area.item.id)?.kind).toBe("Implicit");
    expect(e.graph.params).toEqual({});
  });

  it("missing bounds create the sliders a and b, and the value follows them", () => {
    const { e, helpers } = run(["f(x)=x^2", "\\int f(x)\\,dx"]);
    expect(Object.keys(e.graph.params).sort()).toEqual(["a", "b"]);
    e.setParam("a", 0);
    e.setParam("b", 2);
    expect(valueOf(e, helpers.find((h) => h.role === "integral")!.item.id)).toBeCloseTo(8 / 3, 9);
  });

  it("f'(x) creates one slider x_0 and a tangent that follows it", () => {
    const { e, helpers } = run(["f(x)=x^2", "f'(x)"]);
    expect(Object.keys(e.graph.params)).toEqual(["x_0"]);
    e.setParam("x_0", 3);
    const id = (role: string) => helpers.find((h) => h.role === role)!.item.id;
    expect(valueOf(e, id("slope"))).toBeCloseTo(6, 6);
    expect(valueOf(e, id("value"))).toBeCloseTo(9, 9);
    const tangent = e.runtime(id("tangent"));
    expect(tangent?.kind === "Explicit" && tangent.f(3)).toBeCloseTo(9, 6);
    expect(tangent?.kind === "Explicit" && tangent.f(4)).toBeCloseTo(15, 5);
    // The reader's own curve f'(x) is still plotted as before.
    expect(e.runtime("i2")?.kind).toBe("Explicit");
  });

  it("a point the reader defines is used and no slider is created", () => {
    const { e, helpers } = run(["f(x)=x^2", "x_0=2", "\\frac{d}{dx}f(x)"]);
    expect(Object.keys(e.graph.params)).toEqual(["x_0"]);
    expect(e.graph.params["x_0"].value).toBe(2);
    expect(valueOf(e, helpers.find((h) => h.role === "slope")!.item.id)).toBeCloseTo(4, 6);
  });

  it("shows a value as a fraction only when it is one within 1e-9", () => {
    expect(nearFraction(1 / 3)).toEqual({ p: 1, q: 3 });
    expect(fractionLatex({ p: -2, q: 7 })).toBe("-\\frac{2}{7}");
    expect(nearFraction(Math.PI)).toBeNull();
  });
});

describe("classification", () => {
  it("name = number is a slider; x and t are input variables, not sliders", () => {
    expect(classifyStatement("a=3", "Scalar")).toMatchObject({ class: "slider", name: "a" });
    expect(classifyStatement("a=3", "Scalar").options).toBeUndefined();
    expect(classifyStatement("t=2", "Unknown")).toMatchObject({ class: "input", options: ["input", "slider"] });
    expect(classifyStatement("x=3", "Explicit")).toMatchObject({ class: "output", options: ["line", "input"] });
  });

  it("a capital-letter number is unclear: slider or constant, default slider", () => {
    const c = classifyStatement("K=5", "Scalar");
    expect(c.options).toEqual(["slider", "constant"]);
    expect(effectiveInterpretation(c, undefined)).toBe("slider");
    expect(effectiveInterpretation(c, "constant")).toBe("constant");
    expect(effectiveInterpretation(c, "input")).toBe("slider");
  });

  it("function definitions, named matrices, outputs and unknowns", () => {
    expect(classifyStatement("f(x)=x^2", "FunctionDef")).toMatchObject({ class: "function", name: "f" });
    expect(classifyStatement("A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}", "Matrix2")).toMatchObject({ class: "matrix", name: "A" });
    expect(classifyStatement("\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}", "Matrix2").class).toBe("output");
    expect(classifyStatement("y=x^2", "Explicit").class).toBe("output");
    expect(classifyStatement("k=2a", "Scalar").class).toBe("output");
    expect(classifyStatement("???", "Unknown").class).toBe("unknown");
    expect(parseNumberAssignment("a = -2.5")).toEqual({ name: "a", value: -2.5 });
  });
});
