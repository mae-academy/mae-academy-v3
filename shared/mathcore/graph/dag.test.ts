import { describe, expect, it } from "vitest";
import { buildDag, transitiveDependents } from "./dag";

describe("dependency DAG", () => {
  it("orders definitions before uses, in document order otherwise", () => {
    const d = buildDag([
      { id: "p", defines: [], uses: ["k"] },
      { id: "k", defines: ["k"], uses: ["a"] },
      { id: "a", defines: ["a"], uses: [] },
      { id: "q", defines: [], uses: [] },
    ]);
    expect(d.order).toEqual(["a", "q", "k", "p"]);
    expect(d.cycles).toEqual([]);
  });

  it("finds cycles, including self-reference, and blocks their dependents", () => {
    const d = buildDag([
      { id: "x1", defines: ["a"], uses: ["b"] },
      { id: "x2", defines: ["b"], uses: ["c"] },
      { id: "x3", defines: ["c"], uses: ["a"] },
      { id: "s", defines: ["s"], uses: ["s"] },
      { id: "u", defines: [], uses: ["a"] },
      { id: "free", defines: [], uses: [] },
    ]);
    expect(d.cycles).toContainEqual(["x1", "x2", "x3"]);
    expect(d.cycles).toContainEqual(["s"]);
    expect(d.order).toEqual(["free"]);
  });

  it("lists transitive dependents only", () => {
    const d = buildDag([
      { id: "a", defines: ["a"], uses: [] },
      { id: "b", defines: ["b"], uses: ["a"] },
      { id: "c", defines: [], uses: ["b"] },
      { id: "d", defines: [], uses: [] },
    ]);
    expect(Array.from(transitiveDependents(d, ["a"])).sort()).toEqual(["b", "c"]);
  });

  it("reports names defined by more than one item", () => {
    const d = buildDag([
      { id: "1", defines: ["a"], uses: [] },
      { id: "2", defines: ["a"], uses: [] },
    ]);
    expect(d.conflicts).toEqual([{ name: "a", ids: ["1", "2"] }]);
  });
});
