/**
 * Phase 0 items 1–2: MathJSON shapes recorded by running the pinned Compute Engine 0.58.0, and their normalized form.
 * A Compute Engine upgrade that changes any of these shapes fails here first (STEPS.md §12, "MathJSON shape changes").
 */
import { ComputeEngine } from "@cortex-js/compute-engine";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeStatement } from "./normalize";

const ce = new ComputeEngine();
const raw = (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;

describe("Compute Engine pin", () => {
  it("is exactly 0.58.0", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@cortex-js/compute-engine"]).toBe("0.58.0");
  });
});

describe("ADR-2 parse option (owner decision Q1)", () => {
  it("canonical: false is a partial canonicalization in 0.58.0, not a raw parse", () => {
    // Subtract is rewritten to Add/Negate and operands are reordered: not the "no rewrite" ADR-2 assumed.
    expect(ce.parse("x - y", { canonical: false }).json).toEqual(["Add", "x", ["Negate", "y"]]);
    expect(ce.parse("1 + \\cos(\\theta)", { canonical: false }).json).toEqual(["Add", ["Cos", "theta"], 1]);
    expect(ce.parse("x^{1/3}", { canonical: false }).json).toEqual(["Root", "x", 3]);
  });

  it("form: raw keeps the input as typed", () => {
    expect(raw("x - y")).toEqual(["Subtract", "x", "y"]);
    expect(raw("1 + \\cos(\\theta)")).toEqual(["Add", 1, ["Cos", "theta"]]);
    expect(raw("x^{1/3}")).toEqual(["Power", "x", ["Divide", 1, 3]]);
  });
});

/** The 20 recorded expressions (Phase 0 item 2): LaTeX, raw MathJSON from 0.58.0, normalized core form. */
const SHAPES: Array<[string, unknown, unknown]> = [
  ["y = a\\sin(x)", ["Equal", "y", ["InvisibleOperator", "a", ["Sin", "x"]]], ["Equal", "y", ["Multiply", "a", ["Sin", "x"]]]],
  ["x^2 + y^2 = 9", ["Equal", ["Add", ["Power", "x", 2], ["Power", "y", 2]], 9], ["Equal", ["Add", ["Power", "x", 2], ["Power", "y", 2]], 9]],
  [
    "\\begin{bmatrix} a & 1 \\\\ 0 & 1 \\end{bmatrix}",
    ["Matrix", ["List", ["List", "a", 1], ["List", 0, 1]], "'[]'"],
    ["Matrix", ["List", ["List", "a", 1], ["List", 0, 1]]],
  ],
  [
    "\\begin{bmatrix} 1&2&3\\\\4&5&6\\\\7&8&9 \\end{bmatrix}",
    ["Matrix", ["List", ["List", 1, 2, 3], ["List", 4, 5, 6], ["List", 7, 8, 9]], "'[]'"],
    ["Matrix", ["List", ["List", 1, 2, 3], ["List", 4, 5, 6], ["List", 7, 8, 9]]],
  ],
  [
    "\\begin{bmatrix}[cc]1&2\\\\3&4\\end{bmatrix}",
    ["Matrix", ["List", ["List", 1, 2], ["List", 3, 4]], "'[]'", "'=='"],
    ["Matrix", ["List", ["List", 1, 2], ["List", 3, 4]]],
  ],
  [
    "\\frac{dy}{dx} = x - y",
    ["Equal", ["Divide", ["InvisibleOperator", "d", "y"], ["InvisibleOperator", "d", "x"]], ["Subtract", "x", "y"]],
    ["Equal", ["D", "y", "x"], ["Subtract", "x", "y"]],
  ],
  ["\\frac{d}{dx} y = x - y", ["D", ["Equal", "y", ["Subtract", "x", "y"]], "x"], ["Equal", ["D", "y", "x"], ["Subtract", "x", "y"]]],
  ["y' = x - y", ["Equal", ["Prime", "y"], ["Subtract", "x", "y"]], ["Equal", ["D", "y", "x"], ["Subtract", "x", "y"]]],
  [
    "\\frac{dx}{dt} = y",
    ["Equal", ["Divide", ["InvisibleOperator", "d", "x"], ["InvisibleOperator", "d", "t"]], "y"],
    ["Equal", ["D", "x", "t"], "y"],
  ],
  ["r = 1 + \\cos(\\theta)", ["Equal", "r", ["Add", 1, ["Cos", "theta"]]], ["Equal", "r", ["Add", 1, ["Cos", "theta"]]]],
  ["x^2+y^2<4", ["Less", ["Add", ["Power", "x", 2], ["Power", "y", 2]], 4], ["Less", ["Add", ["Power", "x", 2], ["Power", "y", 2]], 4]],
  ["y > x^2", ["Greater", "y", ["Power", "x", 2]], ["Greater", "y", ["Power", "x", 2]]],
  ["a = 2", ["Equal", "a", 2], ["Equal", "a", 2]],
  [
    "f(x) = x^2",
    ["Equal", ["InvisibleOperator", "f", ["Delimiter", "x"]], ["Power", "x", 2]],
    ["Define", "f", ["List", "x"], ["Power", "x", 2]],
  ],
  ["\\int_0^1 x^2 dx", ["Integrate", ["Power", "x", 2], ["Tuple", "x", 0, 1]], ["Integrate", ["Power", "x", 2], "x", 0, 1]],
  ["e^{-x^2}", ["Power", "e", ["Negate", ["Power", "x", 2]]], ["Exp", ["Negate", ["Power", "x", 2]]]],
  ["2\\pi x", ["InvisibleOperator", 2, "Pi", "x"], ["Multiply", 2, "Pi", "x"]],
  [
    "(\\cos t, \\sin t)",
    ["Delimiter", ["Sequence", ["Cos", "t"], ["Sin", "t"]], "'(,)'"],
    ["Tuple", ["Cos", "t"], ["Sin", "t"]],
  ],
  ["y=x\\{0<x<1\\}", ["Equal", "y", ["When", "x", ["Less", 0, "x", 1]]], ["Equal", "y", ["When", "x", ["Less", 0, "x", 1]]]],
  ["\\sin^{-1}(x)", ["Apply", ["InverseFunction", "Sin"], "x"], ["Arcsin", "x"]],
];

describe("recorded MathJSON shapes (Compute Engine 0.58.0, form: raw)", () => {
  it("records exactly 20 expressions", () => expect(SHAPES).toHaveLength(20));
  for (const [latex, rawShape, core] of SHAPES) {
    it(latex, () => {
      expect(raw(latex)).toEqual(rawShape);
      const n = normalizeStatement(rawShape);
      expect(n.errors).toEqual([]);
      expect(n.expr).toEqual(core);
    });
  }
});
