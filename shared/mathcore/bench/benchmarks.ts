/**
 * Benchmarks for the STEPS.md §7.2 budgets. Pure TypeScript with `performance.now()`, so the same cases run in Node
 * (scripts/mathcore/bench.ts) and in the browser on the D1 devices (the mathcore page runs them on request).
 * Results are measurements, never assumptions: each case reports the median of its runs.
 */
import { compile } from "../compile/compile";
import { sampleExplicit } from "../sample/adaptive";

export interface BenchResult {
  id: string;
  /** STEPS.md §7.2 case it measures. */
  budgetCase: string;
  /** Target from §7.2, in milliseconds (or samples per second where `unit` says so). */
  target: number;
  unit: "ms" | "samples/s";
  median: number;
  runs: number;
  pass: boolean;
}

/** Runs per case; the median of these is reported. */
const RUNS = 25;

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function time(fn: () => void, runs = RUNS): number {
  fn(); // warm-up (JIT)
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    t.push(performance.now() - t0);
  }
  return median(t);
}

const now = (): number => performance.now();

/** Every benchmark case; later phases add theirs here (implicit fields in Phase 3, Monte Carlo in Phase 10). */
export function runBenchmarks(): BenchResult[] {
  const out: BenchResult[] = [];
  const add = (id: string, budgetCase: string, target: number, unit: BenchResult["unit"], m: number, runs = RUNS) =>
    out.push({ id, budgetCase, target, unit, median: m, runs, pass: unit === "ms" ? m <= target : m >= target });

  // Slider drag: 3 curves × 2000 samples re-evaluated with a new parameter value (closures only, no recompile).
  const curves = [
    compile(["Multiply", "a", ["Sin", "x"]], { variables: ["x", "a"] }),
    compile(["Add", ["Power", "x", 2], ["Multiply", "a", "x"]], { variables: ["x", "a"] }),
    compile(["Exp", ["Multiply", ["Negate", "a"], ["Power", "x", 2]]], { variables: ["x", "a"] }),
  ];
  const vals = new Float64Array(2);
  const ys = new Float64Array(2000);
  let a = 0.5;
  add("drag-3x2000", "Dragging slider, 3 curves × 2000 samples", 2, "ms", time(() => {
    a += 0.01;
    vals[1] = a;
    for (const c of curves) {
      for (let i = 0; i < 2000; i++) {
        vals[0] = -10 + (20 * i) / 1999;
        ys[i] = c.evaluate(vals);
      }
    }
  }));

  // One curve updated after a parameter change: full adaptive sampling at one-pixel tolerance.
  add("update-1-curve", "Updating one curve after parameter change", 4, "ms", time(() => {
    a += 0.01;
    vals[1] = a;
    sampleExplicit((x) => {
      vals[0] = x;
      return curves[0].evaluate(vals);
    }, -10, 10, { tolerance: 12 / 600, yRange: 12 });
  }));

  // Raw evaluation throughput, as a reference figure for the other budgets.
  const n = 200_000;
  const t0 = now();
  for (let i = 0; i < n; i++) {
    vals[0] = i * 1e-4;
    curves[1].evaluate(vals);
  }
  const perSecond = n / ((now() - t0) / 1000);
  add("eval-throughput", "Closure evaluations per second (reference)", 1_000_000, "samples/s", perSecond, 1);
  return out;
}
