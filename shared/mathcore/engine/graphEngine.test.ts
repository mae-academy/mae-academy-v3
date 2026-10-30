import { ComputeEngine } from "@cortex-js/compute-engine";
import { describe, expect, it } from "vitest";
import { emptyGraph } from "../ir/types";
import type { GraphIR } from "../ir/types";
import { GraphEngine } from "./graphEngine";

const ce = new ComputeEngine();
const parser = (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;
const doc = (latex: string[], params: GraphIR["params"] = {}): GraphIR => ({
  ...emptyGraph(),
  params,
  items: latex.map((l, i) => ({ id: `i${i + 1}`, latex: l })),
});

describe("GraphEngine", () => {
  it("creates a slider with default values for every undefined symbol (STEPS.md §5.2)", () => {
    const e = new GraphEngine(parser, doc(["y = a\\sin(bx)"]));
    expect(e.graph.params).toEqual({
      a: { value: 1, min: -10, max: 10, step: 0.1 },
      b: { value: 1, min: -10, max: 10, step: 0.1 },
    });
  });

  it("evaluates explicit curves with parameter values and user functions", () => {
    const e = new GraphEngine(parser, doc(["f(x) = x^2 + c", "y = 2f(x)", "c = 3"]));
    const rt = e.runtime("i2");
    expect(rt?.kind).toBe("Explicit");
    if (rt?.kind === "Explicit") expect(rt.f(2)).toBe(14);
    expect(e.graph.params.c.value).toBe(3);
  });

  it("re-evaluates only dependents when a parameter changes (Phase 2 exit, evaluation count measured)", () => {
    const e = new GraphEngine(parser, doc(["y = a x", "y = b x^2", "y = \\sin(x)", "k = 2a", "y = kx + 1"]));
    const before = e.evaluations;
    const ids = e.setParam("a", 5);
    expect(ids).toEqual(["i1", "i4", "i5"]);
    expect(e.evaluations - before).toBe(3);
    const rt = e.runtime("i5");
    if (rt?.kind === "Explicit") expect(rt.f(1)).toBe(11);
    // The unrelated sine curve kept its closure.
    expect(e.setParam("b", 2)).toEqual(["i2"]);
  });

  it("the literal scalar item a = 2 is the slider for a", () => {
    const e = new GraphEngine(parser, doc(["a = 2", "y = a x"]));
    expect(e.graph.params.a.value).toBe(2);
    e.setParam("a", 4);
    const rt = e.runtime("i2");
    if (rt?.kind === "Explicit") expect(rt.f(1)).toBe(4);
  });

  it("rejects dependency cycles with an error naming the items", () => {
    const e = new GraphEngine(parser, doc(["a = b + 1", "b = 2a", "y = x"]));
    expect(e.cycles()).toEqual([["i1", "i2"]]);
    expect(e.item("i1")?.errors[0].message).toMatch(/Circular definition: i1 → i2 → i1/);
    expect(e.runtime("i3")?.kind).toBe("Explicit");
  });

  it("reports names defined twice and parse errors at the item", () => {
    const e = new GraphEngine(parser, doc(["a = 1", "a = 2", "y = x^2 + "]));
    expect(e.item("i1")?.errors[0].message).toMatch(/defined more than once/);
    expect(e.item("i3")?.errors.length).toBeGreaterThan(0);
  });

  it("warns when a stored kind disagrees with inference; inference wins", () => {
    const g = doc(["y = x^2"]);
    g.items[0].kind = "Implicit";
    const e = new GraphEngine(parser, g);
    expect(e.item("i1")?.type.kind).toBe("Explicit");
    expect(e.item("i1")?.warnings[0]).toMatch(/Explicit is used/);
  });

  it("builds runtimes for every Phase 1–2 plot type", () => {
    const e = new GraphEngine(parser, doc(["r = 1 + \\cos(\\theta)", "(\\cos t, \\sin t)", "(1, 2)", "x^2+y^2<4", "\\frac{dy}{dx} = x - y", "M = \\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}"]));
    expect(["i1", "i2", "i3", "i4", "i5", "i6"].map((id) => e.runtime(id)?.kind)).toEqual([
      "Polar", "Parametric", "Point", "Implicit", "ODE1", "Matrix",
    ]);
    const imp = e.runtime("i4");
    if (imp?.kind === "Implicit") expect(imp.F(1, 1)).toBe(-2);
  });
});

describe("GraphEngine reviewer findings (Phases 1-2 review)", () => {
  it("retyping a literal scalar item moves its slider (a = 2 → a = 5)", () => {
    const e = new GraphEngine(parser, doc(["a=2", "y=ax"]));
    e.setLatex("i1", "a=5");
    expect(e.value("a")).toBe(5);
    expect(e.graph.params.a.value).toBe(5);
    const rt = e.runtime("i2");
    if (rt?.kind === "Explicit") expect(rt.f(1)).toBe(5);
  });

  it("an unchanged literal keeps the slider where it was dragged", () => {
    const e = new GraphEngine(parser, doc(["a=2", "y=ax"]));
    e.setParam("a", 4);
    e.load(e.graph); // a reload with the same text
    expect(e.graph.params.a.value).toBe(4);
  });

  it("lines downstream of a cycle, or of a name defined twice, report why they are missing", () => {
    const cyc = new GraphEngine(parser, doc(["a=b", "b=a", "y=ax"]));
    expect(cyc.item("i3")?.errors[0].message).toMatch(/circular/);
    const dup = new GraphEngine(parser, doc(["a=1", "a=2", "y=ax"]));
    expect(dup.item("i3")?.errors[0].message).toMatch(/"a" is defined more than once/);
    expect(dup.runtime("i3")).toBeNull();
  });

  it("removes a slider when its last use is deleted", () => {
    const e = new GraphEngine(parser, doc(["y=qx"]));
    expect(Object.keys(e.graph.params)).toEqual(["q"]);
    e.setLatex("i1", "y=x");
    expect(Object.keys(e.graph.params)).toEqual([]);
  });
});
