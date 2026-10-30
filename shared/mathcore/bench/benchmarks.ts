/**
 * Benchmarks for the STEPS.md §7.2 budgets. Pure TypeScript with `performance.now()`, so the same cases run in Node
 * (scripts/mathcore/bench.ts) and in the browser on the D1 devices (the mathcore page runs them on request).
 * Results are measurements, never assumptions: each case reports the median of its runs.
 */
import { compile } from "../compile/compile";
import { GraphEngine } from "../engine/graphEngine";
import {
  SAMPLE_DRAG_FACTOR, SAMPLE_INITIAL_FULL, SAMPLE_INITIAL_MIN,
  FIELD_STRIDE_DRAG, FIELD_STRIDE_FULL, IMPLICIT_CELL_PX_DRAG, IMPLICIT_CELL_PX_FULL, IMPLICIT_REFINE_DRAG, IMPLICIT_REFINE_FULL,
} from "../constants";
import { contour, insideTest, regionMask } from "../implicit/marching";
import { emptyGraph } from "../ir/types";
import { sampleExplicit } from "../sample/adaptive";

/** MathJSON as Compute Engine emits it (form: raw) for the three benchmark lines, so the benchmark needs no parser. */
const RAW: Record<string, unknown> = {
  "y=a\\sin(x)": ["Equal", "y", ["InvisibleOperator", "a", ["Sin", "x"]]],
  "y=x^2+ax": ["Equal", "y", ["Add", ["Power", "x", 2], ["InvisibleOperator", "a", "x"]]],
  "y=e^{-ax^2}": ["Equal", "y", ["Power", "e", ["Negate", ["InvisibleOperator", "a", ["Power", "x", 2]]]]],
};


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

  // A whole drag frame as the page runs it: setParam through the dependency graph, then every curve sampled at
  // quarter resolution. Excludes the postMessage copy and the canvas draw (measured on the device in the browser).
  const engine = new GraphEngine((latex) => RAW[latex], { ...emptyGraph(), items: Object.keys(RAW).map((latex, i) => ({ id: `b${i}`, latex })) });
  let v = 0.5;
  add("drag-frame-engine", "Dragging slider, 3 curves: setParam + drag-quality sampling", 2, "ms", time(() => {
    v = v > 9 ? -9 : v + 0.13;
    for (const id of engine.setParam("a", v)) {
      const rt = engine.runtime(id);
      if (rt?.kind === "Explicit") sampleExplicit(rt.f, -10, 10, {
          tolerance: (12 / 600) * SAMPLE_DRAG_FACTOR,
          yRange: 12,
          initial: Math.max(SAMPLE_INITIAL_MIN, SAMPLE_INITIAL_FULL / SAMPLE_DRAG_FACTOR),
        });
    }
  }));

  // Implicit field, STEPS.md §7.2: 400×250 during a drag (curve + quarter-resolution shading) and 1600×1000 on release.
  // F is the engine's compiled closure for x² + y² + sin(3x)·cos(2y) < 9, exactly what the Worker evaluates.
  const Fc = compile(
    ["Subtract", ["Add", ["Power", "x", 2], ["Power", "y", 2], ["Multiply", ["Sin", ["Multiply", 3, "x"]], ["Cos", ["Multiply", 2, "y"]]]], 9],
    { variables: ["x", "y"] },
  );
  const xy = new Float64Array(2);
  const F = (x: number, y: number) => {
    xy[0] = x;
    xy[1] = y;
    return Fc.evaluate(xy);
  };
  const inside = insideTest("<");
  const view = { xmin: -5, xmax: 5, ymin: -3.125, ymax: 3.125, aspect: "equal" as const };
  add("implicit-400x250-drag", "Implicit field 400×250 during drag", 16, "ms", time(() => {
    contour(F, view, { width: 400, height: 250, cellPx: IMPLICIT_CELL_PX_DRAG, refine: IMPLICIT_REFINE_DRAG });
    regionMask(F, view, 400, 250, FIELD_STRIDE_DRAG, inside, IMPLICIT_CELL_PX_DRAG);
  }));
  add("implicit-1600x1000-full", "Implicit field 1600×1000 on release (curve + full shading)", 150, "ms", time(() => {
    contour(F, view, { width: 1600, height: 1000, cellPx: IMPLICIT_CELL_PX_FULL, refine: IMPLICIT_REFINE_FULL });
    regionMask(F, view, 1600, 1000, FIELD_STRIDE_FULL, inside, IMPLICIT_CELL_PX_FULL);
  }, 9));

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
