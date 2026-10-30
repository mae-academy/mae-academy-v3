import { describe, expect, it } from "vitest";
import { emptyGraph } from "@shared/mathcore/ir/types";
import type { GraphIR } from "@shared/mathcore/ir/types";
import { validateGraph } from "@shared/mathcore/ir/schema";
import { mergeParams } from "./mergeParams";

const g = (params: GraphIR["params"]): GraphIR => ({ ...emptyGraph(), params });
const p = (value: number, min = -10, max = 10, step = 0.1) => ({ value, min, max, step });

describe("mergeParams (page ← engine Worker)", () => {
  it("adds sliders the Worker created and removes ones it removed", () => {
    expect(mergeParams(g({ a: p(1) }), g({ b: p(1) }), "load").params).toEqual({ b: p(1) });
  });
  it("keeps the page's range and step, takes the value only from a load", () => {
    const page = g({ a: p(3, -50, 50, 0.5) });
    expect(mergeParams(page, g({ a: p(9) }), "param").params.a).toEqual(p(3, -50, 50, 0.5));
    expect(mergeParams(page, g({ a: p(9) }), "load").params.a).toEqual(p(9, -50, 50, 0.5));
  });
  it("widens the range for a value outside it, so the document stays valid (Phase 3 review)", () => {
    const merged = mergeParams(g({ a: p(2) }), g({ a: p(50, -10, 50) }), "load");
    expect(merged.params.a).toEqual(p(50, -10, 50));
    expect(validateGraph(merged).ok).toBe(true);
  });
  it("returns the same object when nothing changed (no render loop)", () => {
    const page = g({ a: p(1) });
    expect(mergeParams(page, g({ a: p(1) }), "view")).toBe(page);
  });
});
