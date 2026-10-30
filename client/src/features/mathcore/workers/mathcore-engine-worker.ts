/// <reference lib="webworker" />
/**
 * Mathcore engine Worker (ADR-11): parses (Compute Engine is imported here, lazily, ADR-1), evaluates and samples.
 * The page only draws. File name: emitted as `mathcore-engine-worker-<hash>.js` so the chunk audit measures it.
 */
import { bench } from "./benchEntry";
import { centralDifference } from "@shared/mathcore/calculus/derivative";
import { describeExplicit } from "@shared/mathcore/describe/describe";
import { GraphEngine } from "@shared/mathcore/engine/graphEngine";
import type { RawParser } from "@shared/mathcore/parse/parse";
import { sampleExplicit, sampleParametric, samplePolar } from "@shared/mathcore/sample/adaptive";
import type { SampleResult } from "@shared/mathcore/sample/adaptive";
import type { EngineRequest, EngineResponse, ItemResult, ViewRequest } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

/** Quarter resolution while dragging (STEPS.md §7.1 technique 2). */
const DRAG_FACTOR = 4;
/** Initial uniform intervals for explicit curves at full quality; drag uses a quarter. */
const FULL_INITIAL = 200;
/** Polar and parametric parameter ranges (one full turn; Desmos-like default). */
const TURN = 2 * Math.PI;

let parser: RawParser | null = null;
let engine: GraphEngine | null = null;
const last = new Map<string, ItemResult>();

async function getParser(): Promise<RawParser> {
  if (parser) return parser;
  const { ComputeEngine } = await import("@cortex-js/compute-engine");
  const ce = new ComputeEngine();
  parser = (latex: string) => ce.parse(latex, { form: "raw" }).json;
  return parser;
}

function sampleItem(e: GraphEngine, id: string, view: ViewRequest): ItemResult {
  const state = e.item(id);
  const base: ItemResult = {
    id,
    kind: state?.type.kind ?? "Unknown",
    errors: state?.errors ?? [],
    warnings: state?.warnings ?? [],
    segments: [],
  };
  const rt = e.runtime(id);
  if (!rt || !state || state.errors.length > 0) return base;
  const { xmin, xmax, ymin, ymax } = view.viewport;
  const factor = view.quality === "drag" ? DRAG_FACTOR : 1;
  const pxY = ((ymax - ymin) / view.height) * factor;
  const pxX = ((xmax - xmin) / view.width) * factor;
  const initial = Math.max(25, Math.round(FULL_INITIAL / factor));
  let r: SampleResult;
  switch (rt.kind) {
    case "Explicit":
      if (rt.dependent === "y") {
        r = sampleExplicit(rt.f, xmin, xmax, { tolerance: pxY, yRange: ymax - ymin, initial });
      } else {
        // x = g(y): sample in y and swap coordinates.
        r = sampleExplicit(rt.f, ymin, ymax, { tolerance: pxX, yRange: xmax - xmin, initial });
        r.segments = r.segments.map((s) => {
          const out = new Float64Array(s.length);
          for (let i = 0; i < s.length; i += 2) {
            out[i] = s[i + 1];
            out[i + 1] = s[i];
          }
          return out;
        });
      }
      break;
    case "Polar":
      r = samplePolar(rt.r, 0, TURN, { tolerance: Math.min(pxX, pxY), jump: Math.max(xmax - xmin, ymax - ymin), initial });
      break;
    case "Parametric":
      r = sampleParametric(rt.x, rt.y, 0, TURN, { tolerance: Math.min(pxX, pxY), jump: Math.max(xmax - xmin, ymax - ymin), initial });
      break;
    case "Point": {
      const t = state.type.kind === "Point" ? state.type : null;
      const params = e.graph.params;
      const dragParams: ItemResult["dragParams"] = {};
      if (t && typeof t.x === "string" && params[t.x]) dragParams.x = t.x;
      if (t && typeof t.y === "string" && params[t.y]) dragParams.y = t.y;
      return { ...base, point: { x: rt.x, y: rt.y }, dragParams };
    }
    case "Value":
      return { ...base, value: rt.value };
    default:
      return base;
  }
  const out: ItemResult = { ...base, segments: r.segments, precisionWarning: r.precisionWarning };
  if (view.quality === "full" && rt.kind === "Explicit" && rt.dependent === "y") out.description = describeExplicit(r.segments);
  return out;
}

function respond(seq: number, e: GraphEngine, view: ViewRequest, ids: readonly string[], reevaluated: string[], t0: number) {
  for (const id of ids) last.set(id, sampleItem(e, id, view));
  const items = e.graph.items.map((it) => last.get(it.id) ?? sampleItem(e, it.id, view));
  const msg: EngineResponse = {
    type: "result",
    seq,
    graph: e.graph,
    items,
    evaluations: e.evaluations,
    reevaluated,
    ms: performance.now() - t0,
  };
  // Copies are posted (not transferred) because `last` keeps the arrays for items that did not change.
  self.postMessage(msg);
}

async function handle(req: EngineRequest): Promise<void> {
  const t0 = performance.now();
  try {
    switch (req.type) {
      case "load": {
        const p = await getParser();
        engine = new GraphEngine(p, req.graph);
        last.clear();
        respond(req.seq, engine, req.view, engine.graph.items.map((i) => i.id), engine.graph.items.map((i) => i.id), t0);
        break;
      }
      case "param": {
        if (!engine) return;
        const ids = engine.setParam(req.name, req.value);
        respond(req.seq, engine, req.view, ids, ids, t0);
        break;
      }
      case "view": {
        if (!engine) return;
        respond(req.seq, engine, req.view, engine.graph.items.map((i) => i.id), [], t0);
        break;
      }
      case "trace": {
        const rt = engine?.runtime(req.id);
        if (!rt || rt.kind !== "Explicit" || rt.dependent !== "y") return;
        const y = rt.f(req.x);
        const slope = centralDifference(rt.f, req.x);
        self.postMessage({
          type: "trace", seq: req.seq, id: req.id, x: req.x, y, slope: Number.isFinite(slope) ? slope : null,
        } satisfies EngineResponse);
        break;
      }
      case "bench":
        self.postMessage({ type: "bench", seq: req.seq, results: bench() } satisfies EngineResponse);
        break;
    }
  } catch (err) {
    self.postMessage({ type: "error", seq: req.seq, message: err instanceof Error ? err.message : String(err) } satisfies EngineResponse);
  }
}

self.onmessage = (ev: MessageEvent<EngineRequest>) => {
  void handle(ev.data);
};
