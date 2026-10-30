/**
 * Comparison of engine values with oracle values (golden corpus, fuzz subset, offline fuzz run).
 * Test-and-tooling helper; not imported by the app.
 */
import type { Expr } from "./ast/expr";
import { compile } from "./compile/compile";

export interface OracleEntry {
  id: string;
  mathjson: Expr;
  samples: Array<{ x: number; value: string | null }>;
}

/** Returns one message per failing sample; empty when everything matches. */
export function compareWithOracle(entries: readonly OracleEntry[], tolerance: number): string[] {
  const failures: string[] = [];
  for (const e of entries) {
    let f: ReturnType<typeof compile>;
    try {
      f = compile(e.mathjson, { variables: ["x"] });
    } catch (err) {
      failures.push(`${e.id}: compile failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const s of e.samples) {
      const got = f.evaluate([s.x]);
      if (s.value === null) {
        if (Number.isFinite(got)) failures.push(`${e.id} ${JSON.stringify(e.mathjson)} at ${s.x}: expected a domain error, got ${got}`);
        continue;
      }
      const want = Number(s.value);
      const rel = Math.abs(got - want) / Math.abs(want);
      if (!(rel <= tolerance)) {
        failures.push(`${e.id} ${JSON.stringify(e.mathjson)} at ${s.x}: got ${got}, want ${s.value} (rel ${rel.toExponential(2)})`);
      }
    }
  }
  return failures;
}
