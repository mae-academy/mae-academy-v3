import { describe, expect, it } from "vitest";
import algorithms from "../__golden__/algorithms.json";
import { erf, erfc, gamma, incompleteBeta, incompleteGammaP, incompleteGammaQ, lnGamma } from "./special";

type Case = { args: number[]; value: string };
const table = (algorithms as unknown as { special: Record<string, Case[]> }).special;
const FNS: Record<string, (...a: number[]) => number> = {
  gamma, lnGamma, erf, erfc, incompleteBeta, incompleteGammaP, incompleteGammaQ,
};

describe("special functions vs mpmath/SciPy (STEPS.md §8.6)", () => {
  for (const [name, cases] of Object.entries(table)) {
    it(`${name} within 1e-12 relative error`, () => {
      const bad: string[] = [];
      for (const c of cases) {
        const got = FNS[name](...c.args);
        const want = Number(c.value);
        const rel = Math.abs(got - want) / Math.abs(want);
        if (!(rel <= 1e-12)) bad.push(`${name}(${c.args.join(", ")}) = ${got}, want ${c.value} (rel ${rel.toExponential(2)})`);
      }
      expect(bad).toEqual([]);
    });
  }
});
