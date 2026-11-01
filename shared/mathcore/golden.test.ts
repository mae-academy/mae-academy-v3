/**
 * Golden corpus (STEPS.md §10): every expression evaluated by the engine matches mpmath within relative error 1e-12.
 */
import { describe, expect, it } from "vitest";
import type { Expr } from "./ast/expr";
import { compile } from "./compile/compile";
import golden from "./__golden__/eval.json";

interface Entry {
  id: string;
  latex: string;
  mathjson: Expr;
  samples: { x: number; value: string | null }[];
}

const entries = golden.entries as unknown as Entry[];

describe("golden corpus", () => {
  it("has 300 expressions at 50-digit precision", () => {
    expect(entries).toHaveLength(300);
    expect(golden.precisionDigits).toBe(50);
  });

  it("matches mpmath within 1e-12 relative error at every sample", () => {
    const failures: string[] = [];
    for (const e of entries) {
      const f = compile(e.mathjson, { variables: ["x"] });
      for (const s of e.samples) {
        const got = f.evaluate([s.x]);
        if (s.value === null) {
          if (Number.isFinite(got)) failures.push(`${e.id} ${e.latex} at ${s.x}: expected domain error, got ${got}`);
          continue;
        }
        const want = Number(s.value);
        const rel = Math.abs(got - want) / Math.abs(want);
        if (!(rel <= golden.tolerance)) failures.push(`${e.id} ${e.latex} at ${s.x}: got ${got}, want ${s.value} (rel ${rel.toExponential(2)})`);
      }
    }
    expect(failures).toEqual([]);
  });
});
