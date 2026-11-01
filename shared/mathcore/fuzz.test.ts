/**
 * Fixed-seed differential fuzz subset (STEPS.md §10): ~500 random expressions vs mpmath, zero failures allowed.
 * The full 10,000-expression run is offline: scripts/mathcore/oracle/check-fuzz.ts.
 */
import { describe, expect, it } from "vitest";
import { compareWithOracle } from "./oracleCompare";
import fuzz from "./__golden__/fuzz.json";

describe("differential fuzz subset", () => {
  it("covers about 500 expressions from the fixed seed", () => {
    expect(fuzz.expressions).toBe(500);
    expect(fuzz.entries.length).toBeGreaterThan(450);
  });

  it("has zero failures against mpmath (relative error ≤ 1e-12, domain errors non-finite)", () => {
    expect(compareWithOracle(fuzz.entries as Parameters<typeof compareWithOracle>[0], fuzz.tolerance)).toEqual([]);
  });
});
