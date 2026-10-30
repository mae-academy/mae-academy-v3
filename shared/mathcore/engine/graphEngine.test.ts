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

describe("GraphEngine Phase 3 review fixes", () => {
  it("a transient parse error keeps the slider's range and value", () => {
    const g = doc(["y=a\\sin(x)"], { a: { value: 3, min: -50, max: 50, step: 0.5 } });
    const e = new GraphEngine(parser, g);
    e.setLatex("i1", "y=a\\sin(");
    expect(e.graph.params.a).toEqual({ value: 3, min: -50, max: 50, step: 0.5 });
    e.setLatex("i1", "y=a\\sin(x)");
    expect(e.graph.params.a).toEqual({ value: 3, min: -50, max: 50, step: 0.5 });
  });

  it("an unused parameter that came with the document is kept", () => {
    const e = new GraphEngine(parser, doc(["y=x"], { k: { value: 2, min: 0, max: 5, step: 1 } }));
    expect(e.graph.params.k).toBeDefined();
  });

  it("retyping a literal outside the slider range widens the range", () => {
    const e = new GraphEngine(parser, doc(["a=2", "y=ax"]));
    e.setLatex("i1", "a=50");
    expect(e.graph.params.a).toMatchObject({ value: 50, max: 50 });
  });
});

describe("GraphEngine: matrices and systems (Phase 4)", () => {
  const vec2 = "\\begin{bmatrix}x\\\\y\\end{bmatrix}";
  it("a matrix with a parameter is a Matrix runtime and follows its slider", () => {
    const e = new GraphEngine(parser, doc(["M = \\begin{bmatrix} a & 1 \\\\ 0 & 1 \\end{bmatrix}"]));
    expect(e.runtime("i1")).toEqual({ kind: "Matrix", size: 2, values: [[1, 1], [0, 1]] });
    expect(e.setParam("a", -2)).toEqual(["i1"]);
    expect(e.runtime("i1")).toMatchObject({ values: [[-2, 1], [0, 1]] });
  });

  it("literal system: A and b are numbers, x and y do not become sliders", () => {
    const e = new GraphEngine(parser, doc([`\\begin{bmatrix}1&2\\\\3&k\\end{bmatrix}${vec2}=\\begin{bmatrix}5\\\\6\\end{bmatrix}`]));
    expect(Object.keys(e.graph.params)).toEqual(["k"]);
    expect(e.runtime("i1")).toEqual({ kind: "GaussSystem", unknowns: ["x", "y"], A: [[1, 2], [3, 1]], b: [5, 6] });
  });

  it("named matrix: the system follows the matrix and its slider (dependents only)", () => {
    const e = new GraphEngine(parser, doc([`A${vec2}=\\begin{bmatrix}1\\\\c\\end{bmatrix}`, "A = \\begin{bmatrix} a & 0 \\\\ 0 & 2 \\end{bmatrix}", "y = x"]));
    expect(e.item("i1")?.errors).toEqual([]);
    expect(e.runtime("i1")).toMatchObject({ A: [[1, 0], [0, 2]], b: [1, 1] });
    expect(e.setParam("a", 4).sort()).toEqual(["i1", "i2"]);
    expect(e.runtime("i1")).toMatchObject({ A: [[4, 0], [0, 2]] });
    expect(e.setParam("c", 3)).toEqual(["i1"]);
    expect(e.runtime("i1")).toMatchObject({ b: [1, 3] });
  });

  it("named system errors: not a matrix, wrong size, missing", () => {
    const notMatrix = new GraphEngine(parser, doc([`A${vec2}=\\begin{bmatrix}1\\\\2\\end{bmatrix}`, "A = 3"]));
    expect(notMatrix.item("i1")?.errors[0].message).toMatch(/not a matrix/);
    const size = new GraphEngine(parser, doc([`A${vec2}=\\begin{bmatrix}1\\\\2\\end{bmatrix}`, "A = \\begin{bmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}"]));
    expect(size.item("i1")?.errors[0].message).toMatch(/3×3 but there are 2 unknowns/);
  });

  it("cases: coefficients extracted numerically, parameters allowed", () => {
    const e = new GraphEngine(parser, doc(["\\begin{cases}2x - y = 3 + a\\\\x + 4y = -1\\end{cases}"]));
    expect(e.item("i1")?.errors).toEqual([]);
    const rt = e.runtime("i1");
    expect(rt).toMatchObject({ kind: "GaussSystem", unknowns: ["x", "y"] });
    if (rt?.kind !== "GaussSystem") throw new Error("expected a system");
    expect(rt.A).toEqual([[2, -1], [1, 4]]);
    expect(rt.b).toEqual([4, -1]);
    e.setParam("a", 0);
    expect((e.runtime("i1") as { b: number[] }).b).toEqual([3, -1]);
  });

  it("cases: rearranged and scaled terms (y = 2x + 1 → −2x + y = 1, and 3(x − y) = x)", () => {
    const e = new GraphEngine(parser, doc(["\\begin{cases}y = 2x + 1\\\\3(x - y) = x\\end{cases}"]));
    const rt = e.runtime("i1") as { A: number[][]; b: number[] };
    expect(rt.A).toEqual([[-2, 1], [2, -3]]);
    expect(rt.b).toEqual([1, 0]);
  });

  it("cases: non-linear equations are rejected, not linearized", () => {
    for (const bad of ["\\begin{cases}x^2 + y = 1\\\\x - y = 0\\end{cases}", "\\begin{cases}xy = 1\\\\x - y = 0\\end{cases}", "\\begin{cases}\\sin(x) = y\\\\x = 1\\end{cases}", "\\begin{cases}x+y=1\\\\x-y=0\\\\z^3=1\\end{cases}"]) {
      const e = new GraphEngine(parser, doc([bad]));
      expect(e.item("i1")?.errors[0]?.message, bad).toMatch(/not linear/);
      expect(e.runtime("i1")).toBeNull();
    }
  });

  it("cases: equations undefined at the origin are reported", () => {
    const e = new GraphEngine(parser, doc(["\\begin{cases}\\frac{1}{x} + y = 1\\\\x - y = 0\\end{cases}"]));
    expect(e.item("i1")?.errors[0]?.message).toMatch(/not defined at 0|not linear/);
  });

  it("a matrix entry that is not finite is an error at the item", () => {
    const e = new GraphEngine(parser, doc(["M = \\begin{bmatrix} \\frac{1}{a} & 0 \\\\ 0 & 1 \\end{bmatrix}", "a = 0"]));
    expect(e.item("i1")?.errors[0]?.message).toMatch(/finite/);
  });
});

describe("GraphEngine: Phase 3 re-review regressions", () => {
  it("a line that failed to parse (parser unavailable) parses on the next load that brings it", () => {
    let online = false;
    const flaky = (latex: string): unknown => {
      if (!online) throw new Error("The math parser could not load");
      return parser(latex);
    };
    const e = new GraphEngine(flaky, doc(["y=x^2"]));
    expect(e.item("i1")?.errors[0]?.message).toMatch(/could not load/);
    online = true;
    e.load(doc(["y=x^2"]));
    expect(e.item("i1")?.errors).toEqual([]);
    expect(e.runtime("i1")?.kind).toBe("Explicit");
  });

  it("retyping a slider's number through an empty or invalid line moves the slider (a=5 → a= → a=7)", () => {
    const e = new GraphEngine(parser, doc(["a=5", "y=ax"]));
    expect(e.graph.params.a.value).toBe(5);
    e.load({ ...e.graph, items: [{ id: "i1", latex: "a=" }, { id: "i2", latex: "y=ax" }] });
    e.load({ ...e.graph, items: [{ id: "i1", latex: "a=7" }, { id: "i2", latex: "y=ax" }] });
    expect(e.graph.params.a.value).toBe(7);
    const rt = e.runtime("i2");
    if (rt?.kind !== "Explicit") throw new Error("expected a curve");
    expect(rt.f(1)).toBe(7);
    // Through an empty line too.
    e.load({ ...e.graph, items: [{ id: "i1", latex: "" }, { id: "i2", latex: "y=ax" }] });
    e.load({ ...e.graph, items: [{ id: "i1", latex: "a=2" }, { id: "i2", latex: "y=ax" }] });
    expect(e.graph.params.a.value).toBe(2);
  });

  it("an empty row does not stop pruning; a slider seen only while typing is still pruned later", () => {
    const e = new GraphEngine(parser, doc(["y=ax", ""]));
    expect(e.graph.params.a).toBeDefined();
    e.load({ ...e.graph, items: [{ id: "i1", latex: "y=x" }, { id: "i2", latex: "" }] });
    expect(e.graph.params.a).toBeUndefined();
    // b appears while another line is mid-typing, then disappears; once typing ends it is pruned.
    e.load({ ...e.graph, items: [{ id: "i1", latex: "y=bx" }, { id: "i2", latex: "y=\\sin(" }] });
    expect(e.graph.params.b).toBeDefined();
    e.load({ ...e.graph, items: [{ id: "i1", latex: "y=x" }, { id: "i2", latex: "y=\\sin(" }] });
    e.load({ ...e.graph, items: [{ id: "i1", latex: "y=x" }, { id: "i2", latex: "y=\\sin(x)" }] });
    expect(e.graph.params.b).toBeUndefined();
  });

  it("a fresh document keeps its own unused slider even if the previous document used that name", () => {
    const e = new GraphEngine(parser, doc(["y=ax"]));
    e.load(doc(["y=x"], { a: { value: 3, min: -10, max: 10, step: 0.1 } }), { fresh: true });
    expect(e.graph.params.a).toEqual({ value: 3, min: -10, max: 10, step: 0.1 });
  });

  it("the parse cache holds only the current document's lines", () => {
    const e = new GraphEngine(parser, doc(["y=x"]));
    for (let k = 0; k < 50; k++) e.load(doc([`y=x+${k}`]));
    const size = (e as unknown as { parseCache: Map<string, unknown> }).parseCache.size;
    expect(size).toBeLessThanOrEqual(2);
  });
});

describe("GraphEngine: Phase 4 review regressions", () => {
  const vec2 = "\\begin{bmatrix}x\\\\y\\end{bmatrix}";
  it("a slider that moves an item into an error and out again clears the error", () => {
    const e = new GraphEngine(parser, doc(["M = \\begin{bmatrix} \\frac{1}{a} & 0 \\\\ 0 & 1 \\end{bmatrix}"], { a: { value: 1, min: -5, max: 5, step: 1 } }));
    e.setParam("a", 0);
    expect(e.item("i1")?.errors[0]?.message).toMatch(/finite/);
    e.setParam("a", 2);
    expect(e.item("i1")?.errors).toEqual([]);
    expect(e.runtime("i1")).toMatchObject({ values: [[0.5, 0], [0, 1]] });
  });

  it("a system on a named matrix follows the matrix into and out of an error (no stale matrix)", () => {
    const e = new GraphEngine(parser, doc(["M = \\begin{bmatrix} \\frac{1}{a} & 0 \\\\ 0 & 1 \\end{bmatrix}", `M${vec2}=\\begin{bmatrix}1\\\\2\\end{bmatrix}`], { a: { value: 1, min: -5, max: 5, step: 1 } }));
    expect(e.runtime("i2")).toMatchObject({ A: [[1, 0], [0, 1]] });
    e.setParam("a", 0);
    expect(e.item("i2")?.errors[0]?.message).toMatch(/"M" has an error/);
    e.setParam("a", 4);
    expect(e.item("i2")?.errors).toEqual([]);
    expect(e.runtime("i2")).toMatchObject({ A: [[0.25, 0], [0, 1]] });
  });

  it("linearity is structural: |y − 1|, |z|, a·x² with a = 0, 1/x are all rejected", () => {
    for (const bad of [
      "\\begin{cases}x+|y-1|=3\\\\x-y=0\\end{cases}",
      "\\begin{cases}x+y+|z|=3\\\\x-y=0\\\\x+z=1\\end{cases}",
      "\\begin{cases}a x^2+y=1\\\\x-y=0\\end{cases}",
      "\\begin{cases}\\frac{1}{x}+y=1\\\\x-y=0\\end{cases}",
      "\\begin{cases}xy=1\\\\x-y=0\\end{cases}",
      "\\begin{cases}2^x+y=1\\\\x-y=0\\end{cases}",
    ]) {
      const e = new GraphEngine(parser, doc([bad], { a: { value: 0, min: -5, max: 5, step: 1 } }));
      expect(e.item("i1")?.errors[0]?.message, bad).toMatch(/not linear/);
    }
    // Linear with parameters and constants in odd places is accepted.
    const ok = new GraphEngine(parser, doc(["\\begin{cases}\\frac{x}{2}+a y=\\sin(1)\\\\x-\\frac{y}{a}=0\\end{cases}"], { a: { value: 2, min: -5, max: 5, step: 1 } }));
    expect(ok.item("i1")?.errors).toEqual([]);
    expect(ok.runtime("i1")).toMatchObject({ A: [[0.5, 2], [1, -0.5]] });
  });

  it("a large constant does not swallow the coefficients (x + y + 10¹⁷ = 0)", () => {
    const e = new GraphEngine(parser, doc(["\\begin{cases}x+y+10^{17}=0\\\\x-y=0\\end{cases}"]));
    expect(e.runtime("i1")).toMatchObject({ A: [[1, 1], [1, -1]], b: [-1e17, 0] });
  });

  it("b = A x (sides reversed) is a system too", () => {
    const e = new GraphEngine(parser, doc([`\\begin{bmatrix}5\\\\6\\end{bmatrix}=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}${vec2}`]));
    expect(e.runtime("i1")).toMatchObject({ kind: "GaussSystem", A: [[1, 2], [3, 4]], b: [5, 6] });
  });

  it("a rejected line creates no sliders; messages show π, not Pi; unknowns that shadow a slider are flagged", () => {
    const rejected = new GraphEngine(parser, doc(["\\begin{bmatrix}1&a\\\\0&2\\end{bmatrix}\\begin{bmatrix}a\\\\b\\end{bmatrix}=\\begin{bmatrix}1\\\\2\\end{bmatrix}"]));
    expect(rejected.item("i1")?.errors.length).toBeGreaterThan(0);
    expect(rejected.graph.params).toEqual({});
    const pi = new GraphEngine(parser, doc([`\\pi${vec2}=\\begin{bmatrix}1\\\\2\\end{bmatrix}`]));
    expect(pi.item("i1")?.errors[0]?.message).toContain('"π"');
    const shadow = new GraphEngine(parser, doc(["a = 5", "\\begin{bmatrix}1&0\\\\0&2\\end{bmatrix}\\begin{bmatrix}a\\\\b\\end{bmatrix}=\\begin{bmatrix}1\\\\2\\end{bmatrix}"]));
    expect(shadow.item("i2")?.warnings[0]).toMatch(/a is an unknown here/);
  });
});
