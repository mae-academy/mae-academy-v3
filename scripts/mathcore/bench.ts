/**
 * Runs the mathcore benchmarks in Node (STEPS.md §7.2). On the D1 laptop run it there; browser numbers come from the
 * mathcore page. Node numbers on a cloud machine are reference figures, not D1 measurements.
 *
 *   pnpm exec tsx scripts/mathcore/bench.ts
 */
import { runBenchmarks } from "../../shared/mathcore/bench/benchmarks";

for (const r of runBenchmarks()) {
  const value = r.unit === "ms" ? `${r.median.toFixed(3)} ms` : `${Math.round(r.median).toLocaleString("en")} samples/s`;
  const target = r.unit === "ms" ? `≤ ${r.target} ms` : `≥ ${r.target.toLocaleString("en")} samples/s`;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(18)} ${value.padStart(22)}   target ${target}   (${r.budgetCase})`);
}
