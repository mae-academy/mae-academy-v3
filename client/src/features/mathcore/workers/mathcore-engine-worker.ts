/// <reference lib="webworker" />
/**
 * Mathcore engine Worker (ADR-11): normalizes, evaluates and samples. Parsing happens in the parse Worker.
 * The page only draws. File name: emitted as `mathcore-engine-worker-<hash>.js` so the chunk audit measures it.
 */
import { bench } from "./benchEntry";
import { centralDifference } from "@shared/mathcore/calculus/derivative";
import { describeExplicit, describeExtent } from "@shared/mathcore/describe/describe";
import {
  FIELD_STRIDE_DRAG, FIELD_STRIDE_FULL, IMPLICIT_CELL_PX_DRAG, PARAMETER_TURN, SAMPLE_DRAG_FACTOR, SAMPLE_INITIAL_FULL, SAMPLE_INITIAL_MIN, IMPLICIT_CELL_PX_FULL, IMPLICIT_REFINE_DRAG, IMPLICIT_REFINE_FULL, STRIP_WORKERS_MAX,
} from "@shared/mathcore/constants";
import { GraphEngine } from "@shared/mathcore/engine/graphEngine";
import { implicitField } from "@shared/mathcore/implicit/strips";
import type { FieldOptions, FieldResult } from "@shared/mathcore/implicit/strips";
import { DISPLAY_DIGITS, analyzeMatrix, analyzeSystem, symbolLatex } from "@shared/mathcore/linalg/analyze";
import type { MatrixAnalysis, SystemAnalysis } from "@shared/mathcore/linalg/analyze";
import { systemLines2, transform2 } from "@shared/mathcore/linalg/transform2";
import { renderFrame3 } from "@shared/mathcore/render3d/frame";
import type { RawParser } from "@shared/mathcore/parse/parse";
import { sampleExplicit, sampleParametric, samplePolar } from "@shared/mathcore/sample/adaptive";
import type { SampleResult } from "@shared/mathcore/sample/adaptive";
import type { ParsedEntry } from "./parseProtocol";
import type { EngineRequest, EngineResponse, ItemResult, ViewRequest } from "./protocol";
import { superseded } from "./requestQueue";
import { createStripPool } from "./stripPool";
import type { StripPool, StripWorkerLike } from "./stripPool";

declare const self: DedicatedWorkerGlobalScope;


let engine: GraphEngine | null = null;

/**
 * Strip Workers for implicit fields (STEPS.md §7.1 technique 4): one per spare core, up to STRIP_WORKERS_MAX, and
 * none on a machine with fewer than three cores (two strips on one spare core gain nothing). If a strip Worker fails
 * the pool is closed and this Worker computes fields itself from then on.
 */
const STRIP_WORKERS = Math.min(STRIP_WORKERS_MAX, Math.max(0, (self.navigator?.hardwareConcurrency ?? 1) - 1));
let pool: StripPool | null = null;
function stripPool(): StripPool | null {
  if (pool || STRIP_WORKERS < 2 || typeof Worker === "undefined") return pool;
  try {
    pool = createStripPool(
      STRIP_WORKERS,
      () => new Worker(new URL("./mathcore-strip-worker.ts", import.meta.url), { type: "module" }) as unknown as StripWorkerLike,
    );
  } catch {
    pool = null;
  }
  return pool;
}

async function field(e: GraphEngine, id: string, F: (x: number, y: number) => number, view: ViewRequest, o: FieldOptions): Promise<FieldResult> {
  const p = stripPool();
  const source = p ? e.implicitSource(id) : null;
  if (p && source) {
    try {
      return await p.run(source, view.viewport, o);
    } catch {
      p.dispose();
      pool = null;
    }
  }
  return implicitField(F, view.viewport, o);
}
const last = new Map<string, ItemResult>();

/** Canvas label text (no LaTeX): 6 significant digits, no float noise. */
const plain = (v: number) => String(Number(v.toPrecision(DISPLAY_DIGITS)));

/** Reports by item id and input values: a pan or zoom redraws the geometry but does not redo the elimination. */
const analyses = new Map<string, { key: string; value: MatrixAnalysis | SystemAnalysis }>();
function cachedAnalysis<T extends MatrixAnalysis | SystemAnalysis>(id: string, input: unknown, build: () => T): T {
  const key = JSON.stringify(input);
  const hit = analyses.get(id);
  if (hit && hit.key === key) return hit.value as T;
  const value = build();
  analyses.set(id, { key, value });
  return value;
}

/**
 * LaTeX → raw MathJSON comes from the parse Worker (via the page) with each `load`; parsing never runs here.
 * A string without an entry, or whose parse failed or timed out, becomes an error on its line.
 */
let parsed: Record<string, ParsedEntry> = {};
const parser: RawParser = (latex) => {
  const entry = parsed[latex];
  if (!entry) throw new Error("This line has not been parsed yet");
  if (!entry.ok) throw new Error(entry.message);
  return entry.raw;
};

async function sampleItem(e: GraphEngine, id: string, view: ViewRequest): Promise<ItemResult> {
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
  const factor = view.quality === "drag" ? SAMPLE_DRAG_FACTOR : 1;
  const pxY = ((ymax - ymin) / view.height) * factor;
  const pxX = ((xmax - xmin) / view.width) * factor;
  const initial = Math.max(SAMPLE_INITIAL_MIN, Math.round(SAMPLE_INITIAL_FULL / factor));
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
      r = samplePolar(rt.r, 0, PARAMETER_TURN, { tolerance: Math.min(pxX, pxY), initial });
      break;
    case "Parametric":
      r = sampleParametric(rt.x, rt.y, 0, PARAMETER_TURN, { tolerance: Math.min(pxX, pxY), initial });
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
    case "Matrix": {
      const t = state.type;
      const name = (t.kind === "Matrix2" || t.kind === "Matrix3") && t.name ? symbolLatex(t.name) : "A";
      const analysis = cachedAnalysis(id, [rt.values, name], () => analyzeMatrix(rt.values, name));
      const out: ItemResult = { ...base, linalg: { type: "matrix", analysis } };
      if (rt.size === 2) {
        const g = transform2(rt.values, view.viewport);
        out.transform = { grid: g.grid, iHat: g.iHat, jHat: g.jHat, parallelogram: g.parallelogram, orientation: g.orientation, eigenLines: g.eigenLines };
      }
      return out;
    }
    case "GaussSystem": {
      const analysis = cachedAnalysis(id, [rt.A, rt.b, rt.unknowns], () => analyzeSystem(rt.A, rt.b, rt.unknowns));
      const out: ItemResult = { ...base, linalg: { type: "system", analysis } };
      if (rt.unknowns.length === 2) {
        out.segments = systemLines2(rt.A, rt.b, view.viewport);
        const s = analysis.solution;
        if (s.kind === "unique") {
          out.point = { x: s.values[0], y: s.values[1] };
          out.label = `(${plain(s.values[0])}, ${plain(s.values[1])})`;
        }
      }
      return out;
    }
    case "Implicit": {
      const drag = view.quality === "drag";
      const f = await field(e, id, rt.F, view, {
        width: view.width,
        height: view.height,
        cellPx: drag ? IMPLICIT_CELL_PX_DRAG : IMPLICIT_CELL_PX_FULL,
        refine: drag ? IMPLICIT_REFINE_DRAG : IMPLICIT_REFINE_FULL,
        stride: drag ? FIELD_STRIDE_DRAG : FIELD_STRIDE_FULL,
        relation: rt.relation,
      });
      const out: ItemResult = { ...base, segments: f.polylines, relation: rt.relation };
      if (f.mask) out.field = { ...f.mask, viewport: view.viewport };
      if (!drag) {
        out.description = describeExtent(f.polylines);
        if (out.field) out.description.shaded = out.field.data.reduce((n, v) => n + v, 0) / out.field.data.length;
      }
      return out;
    }
    default:
      return base;
  }
  const out: ItemResult = { ...base, segments: r.segments, precisionWarning: r.precisionWarning };
  if (view.quality === "full") {
    out.description = rt.kind === "Explicit" && rt.dependent === "y" ? describeExplicit(r.segments) : describeExtent(r.segments);
  }
  return out;
}

async function respond(
  seq: number, cause: "load" | "param" | "view", e: GraphEngine, view: ViewRequest, ids: readonly string[], reevaluated: string[], t0: number,
  partial = false,
): Promise<void> {
  for (const id of ids) last.set(id, await sampleItem(e, id, view));
  const items: ItemResult[] = [];
  for (const it of e.graph.items) items.push(last.get(it.id) ?? (await sampleItem(e, it.id, view)));
  const msg: EngineResponse = {
    type: "result",
    seq,
    graph: e.graph,
    items,
    evaluations: e.evaluations,
    reevaluated,
    cause,
    frame3d: view.mode === "3d" && view.colors3d ? renderFrame3(e, view, view.colors3d, (id, a, b, u) => cachedAnalysis(id, [a, b, u], () => analyzeSystem(a, b, u))) : undefined,
    partial,
    ms: performance.now() - t0,
  };
  // Copies are posted (not transferred) because `last` keeps the arrays for items that did not change.
  self.postMessage(msg);
}

/**
 * Progressive display (STEPS.md §7.2: 1600×1000 field "on release, progressive"): when the document has implicit
 * items, a quarter-resolution frame is posted first, then the full one, under the same sequence number.
 */
async function progressive(
  seq: number, cause: "load" | "view", e: GraphEngine, view: ViewRequest, ids: readonly string[], reevaluated: string[], t0: number,
): Promise<void> {
  const heavy = e.graph.items.some((it) => e.runtime(it.id)?.kind === "Implicit");
  if (view.quality === "full" && heavy) await respond(seq, cause, e, { ...view, quality: "drag" }, ids, reevaluated, t0, true);
  await respond(seq, cause, e, view, ids, reevaluated, t0);
}

async function handle(req: EngineRequest): Promise<void> {
  const t0 = performance.now();
  try {
    switch (req.type) {
      case "load": {
        parsed = req.parsed;
        // The engine is kept between loads so parsed lines and slider literals survive an edit.
        if (engine) engine.load(req.graph, { fresh: req.fresh });
        else engine = new GraphEngine(parser, req.graph);
        last.clear();
        analyses.clear();
        const all = engine.graph.items.map((i) => i.id);
        await progressive(req.seq, "load", engine, req.view, all, all, t0);
        break;
      }
      case "param": {
        if (!engine) {
          self.postMessage({ type: "skipped", seq: req.seq } satisfies EngineResponse);
          return;
        }
        const ids = engine.setParam(req.name, req.value);
        await respond(req.seq, "param", engine, req.view, ids, ids, t0);
        break;
      }
      case "view": {
        if (!engine) {
          self.postMessage({ type: "skipped", seq: req.seq } satisfies EngineResponse);
          return;
        }
        await progressive(req.seq, "view", engine, req.view, engine.graph.items.map((i) => i.id), [], t0);
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

/**
 * Requests run one at a time, in order, so a pan or slider move that arrives while Compute Engine is still loading
 * waits for the document instead of being dropped. A request that a later one makes pointless is skipped: a newer
 * `load` replaces everything, a newer `view` or a newer `param` for the same slider replaces the older one.
 */
const pending: EngineRequest[] = [];
let scheduled = false;
/** A request is being handled (it may be waiting for strip Workers); the next one starts when it finishes. */
let busy = false;

/**
 * Handles one request per task, then yields, so messages that arrived during a long sampling job are queued first
 * and the superseded ones are skipped instead of each being computed in turn.
 */
async function pump(): Promise<void> {
  scheduled = false;
  for (let req = pending.shift(); req; req = pending.shift()) {
    if (superseded(req, pending)) continue;
    busy = true;
    try {
      await handle(req);
    } finally {
      busy = false;
    }
    break;
  }
  if (pending.length > 0) schedule();
}

function schedule(): void {
  if (scheduled || busy) return;
  scheduled = true;
  setTimeout(() => void pump(), 0);
}

self.onmessage = (ev: MessageEvent<EngineRequest>) => {
  pending.push(ev.data);
  schedule();
};
