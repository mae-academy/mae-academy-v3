/** Browser entry for the STEPS.md §7.2 benchmarks (run on the D1 devices from the mathcore page). */
import { runBenchmarks } from "@shared/mathcore/bench/benchmarks";

export function bench() {
  return runBenchmarks();
}
