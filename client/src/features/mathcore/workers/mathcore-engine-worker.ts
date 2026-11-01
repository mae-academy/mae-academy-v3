/// <reference lib="webworker" />
/**
 * Mathcore engine Worker (ADR-11): normalizes, evaluates and samples. Parsing happens in the parse Worker.
 * The page only draws. File name: emitted as `mathcore-engine-worker-<hash>.js` so the chunk audit measures it.
 */
import { bench } from "./benchEntry";
import { centralDifference } from "@shared/mathcore/calculus/derivative";
import { describeExplicit, describeExtent } from "@shared/mathcore/describe/describe";
import {
  FIELD_STRIDE_DRAG, FIELD_STRIDE_FULL, MASK_REFINE_STEP_DRAG, IMPLICIT_DENSE_FRACTION_DRAG, PRECISION_WARNING_MAGNITUDE, IMPLICIT_CELL_PX_DRAG, PARAMETER_TURN, SAMPLE_DRAG_FACTOR, SAMPLE_INITIAL_FULL, SAMPLE_INITIAL_MIN, IMPLICIT_CELL_PX_FULL, IMPLICIT_REFINE_DRAG, IMPLICIT_REFINE_FULL, STRIP_WORKERS_MIN, WARMUP_BUDGET_MS, WARMUP_DELAY_MS, WARMUP_PASSES,
} from "@shared/mathcore/constants";
import { GraphEngine } from "@shared/mathcore/engine/graphEngine";
import { implicitField } from "@shared/mathcore/implicit/strips";
import type { FieldOptions, FieldResult } from "@shared/mathcore/implicit/strips";
import { analyzeMatrix, analyzeSystem, symbolLatex } from "@shared/mathcore/linalg/analyze";
import { numberText } from "@shared/mathcore/linalg/format";
import type { MatrixAnalysis, SystemAnalysis } from "@shared/mathcore/linalg/analyze";
import { systemLines2, transform2 } from "@shared/mathcore/linalg/transform2";
import { renderFrame3 } from "@shared/mathcore/render3d/frame";
import type { RawParser } from "@shared/mathcore/parse/parse";
import { sampleExplicit, sampleParametric, samplePolar } from "@shared/mathcore/sample/adaptive";
import type { SampleResult } from "@shared/mathcore/sample/adaptive";
import type { ParsedEntry } from "./parseProtocol";
import type { EngineRequest, EngineResponse, ItemResult, ViewRequest } from "./protocol";
import { superseded } from "./requestQueue";
import { WarmupPlan } from "./warmup";
import { StripTimeout, createStripPool, stripWorkerCount } from "./stripPool";
import type { StripPool, StripWorkerLike } from "./stripPool";

declare const self: DedicatedWorkerGlobalScope;


let engine: GraphEngine | null = null;

/**
 * Strip Workers for implicit fields (STEPS.md §7.1 technique 4): see `stripWorkerCount` (cores − STRIP_RESERVED_CORES, both
 * cores on a two-core machine, up to STRIP_WORKERS_MAX), and none below STRIP_WORKERS_MIN. If a strip Worker
 * fails or stalls, the pool is closed for good and this Worker computes fields itself from then on.
 */
const STRIP_WORKERS = stripWorkerCount(self.navigator?.hardwareConcurrency ?? 1);
let pool: StripPool | null = null;
let stripsFailed = false;
function stripPool(): StripPool | null {
  if (pool || stripsFailed || STRIP_WORKERS < STRIP_WORKERS_MIN || typeof Worker === "undefined") return pool;
  try {
    pool = createStripPool(
      STRIP_WORKERS,
      () => new Worker(new URL("./mathcore-strip-worker.ts", import.meta.url), { type: "module" }) as unknown as StripWorkerLike,
    );
  } catch {
    pool = null;
    stripsFailed = true;
  }
  return pool;
}

/** Field options for a view: drag quality (coarse lattice, quarter mask, coarse tracing of dense fields) or full. */
function fieldOptions(view: ViewRequest, relation: FieldOptions["relation"]): FieldOptions {
  const drag = view.quality === "drag";
  return {
    width: view.width,
    height: view.height,
    cellPx: drag ? IMPLICIT_CELL_PX_DRAG : IMPLICIT_CELL_PX_FULL,
    refine: drag ? IMPLICIT_REFINE_DRAG : IMPLICIT_REFINE_FULL,
    stride: drag ? FIELD_STRIDE_DRAG : FIELD_STRIDE_FULL,
    relation,
    refineStep: drag ? MASK_REFINE_STEP_DRAG : 1,
    coarseWhenDense: drag ? IMPLICIT_DENSE_FRACTION_DRAG : undefined,
  };
}

async function field(e: GraphEngine, id: string, F: (x: number, y: number) => number, view: ViewRequest, o: FieldOptions): Promise<FieldResult> {
  // A drag frame is about 10 ms of work: with only two strips the messages and the merge cost as much as they save, so
  // it stays in this Worker; release frames (100+ ms) always use the strips.
  const p = view.quality === "drag" && STRIP_WORKERS <= 2 ? null : stripPool();
  const source = p ? e.implicitSource(id) : null;
  if (p && source) {
    try {
      return await p.run(source, view.viewport, o);
    } catch (err) {
      // A stalled run: the Workers are busy with it, so the pool is replaced next time, and the field is reported as
      // too heavy rather than recomputed here (that would outlast the page's watchdog). A failed Worker: strips are
      // off for this visit and fields are computed here.
      p.dispose();
      pool = null;
      if (err instanceof StripTimeout) throw err;
      stripsFailed = true;
    }
  }
  return implicitField(F, view.viewport, o);
}
const last = new Map<string, ItemResult>();

/**
 * Drag-quality frames of implicit items by item id. The release that follows a drag shows a drag-quality frame first
 * (progressive display); when the view and the document are the same as in the last drag frame, that frame is reused
 * instead of being computed again. `version` changes with every load and parameter change.
 */
let version = 0;
const dragFrames = new Map<string, { key: string; result: ItemResult }>();

/** Canvas label text (no LaTeX): DISPLAY_DIGITS significant digits, no float noise. */
const plain = numberText;
/** §9: values beyond 10⁸ lose precision in double arithmetic; the row says so. */
const beyondPrecision = (values: readonly number[]) => values.some((v) => Math.abs(v) > PRECISION_WARNING_MAGNITUDE);
/** Symbol as the user wrote it, for canvas labels. */
const displayText = (name: string) => ({ Pi: "π", ExponentialE: "e" } as Record<string, string>)[name] ?? name;

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
      const out: ItemResult = { ...base, linalg: { type: "matrix", analysis }, precisionWarning: beyondPrecision(rt.values.flat()) };
      if (rt.size === 2) {
        const g = transform2(rt.values, view.viewport, analysis.eigen);
        out.transform = {
          grid: g.grid, iHat: g.iHat, jHat: g.jHat, parallelogram: g.parallelogram, orientation: g.orientation,
          eigenLines: g.eigenLines, eigenMarker: g.eigenMarker,
          name: t.kind === "Matrix2" && t.name ? displayText(t.name) : "A",
        };
      }
      return out;
    }
    case "GaussSystem": {
      const analysis = cachedAnalysis(id, [rt.A, rt.b, rt.unknowns], () => analyzeSystem(rt.A, rt.b, rt.unknowns));
      const solved = analysis.solution.kind === "unique" ? analysis.solution.values : [];
      const out: ItemResult = { ...base, linalg: { type: "system", analysis }, precisionWarning: beyondPrecision([...rt.A.flat(), ...rt.b, ...solved]) };
      // Drawn on the axes only when the unknowns are x and y (in either order); columns follow the axes.
      const ix = rt.unknowns.indexOf("x");
      const iy = rt.unknowns.indexOf("y");
      if (rt.unknowns.length === 2 && ix >= 0 && iy >= 0) {
        out.segments = systemLines2(rt.A.map((r) => [r[ix], r[iy]]), rt.b, view.viewport);
        const s = analysis.solution;
        if (s.kind === "unique") {
          out.point = { x: s.values[ix], y: s.values[iy] };
          out.label = `(${plain(s.values[ix])}, ${plain(s.values[iy])})`;
        }
      }
      return out;
    }
    case "Implicit": {
      const drag = view.quality === "drag";
      const cacheKey = `${version}|${view.width}x${view.height}|${JSON.stringify(view.viewport)}`;
      if (drag) {
        const hit = dragFrames.get(id);
        if (hit && hit.key === cacheKey) return { ...hit.result, reused: true };
      }
      const f = await field(e, id, rt.F, view, fieldOptions(view, rt.relation));
      const out: ItemResult = { ...base, segments: f.polylines, relation: rt.relation };
      if (f.mask) out.field = { ...f.mask, viewport: view.viewport };
      if (!drag) {
        out.description = describeExtent(f.polylines);
        if (out.field) {
          let on = 0;
          const data = out.field.data;
          for (let k = 0; k < data.length; k++) on += data[k];
          out.description.shaded = on / data.length;
        }
      } else dragFrames.set(id, { key: cacheKey, result: out });
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

/** The 3D frame; a failure leaves the frame out (the rows still show their reports and errors). */
function safeFrame3(e: GraphEngine, view: ViewRequest, colors: NonNullable<ViewRequest["colors3d"]>) {
  try {
    return renderFrame3(e, view, colors, (id, a, b, u) => cachedAnalysis(id, [a, b, u], () => analyzeSystem(a, b, u)));
  } catch {
    return undefined;
  }
}

/** One item's failure (a numerical exception while sampling or analysing) is an error on that line only. */
async function safeSample(e: GraphEngine, id: string, view: ViewRequest): Promise<ItemResult> {
  try {
    return await sampleItem(e, id, view);
  } catch (err) {
    const state = e.item(id);
    return {
      id,
      kind: state?.type.kind ?? "Unknown",
      errors: [...(state?.errors ?? []), { message: err instanceof Error ? err.message : String(err) }],
      warnings: state?.warnings ?? [],
      segments: [],
    };
  }
}

async function respond(
  seq: number, cause: "load" | "param" | "view", e: GraphEngine, view: ViewRequest, ids: readonly string[], reevaluated: string[], t0: number,
  partial = false,
): Promise<void> {
  for (const id of ids) last.set(id, await safeSample(e, id, view));
  const items: ItemResult[] = [];
  for (const it of e.graph.items) items.push(last.get(it.id) ?? (await safeSample(e, it.id, view)));
  const msg: EngineResponse = {
    type: "result",
    seq,
    graph: e.graph,
    items,
    evaluations: e.evaluations,
    reevaluated,
    cause,
    frame3d: view.mode === "3d" && view.colors3d ? safeFrame3(e, view, view.colors3d) : undefined,
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
  if (req.type === "load" || req.type === "view") lastView = req.view;
  try {
    switch (req.type) {
      case "load": {
        parsed = req.parsed;
        // The engine is kept between loads so parsed lines and slider literals survive an edit.
        if (engine) engine.load(req.graph, { fresh: req.fresh });
        else engine = new GraphEngine(parser, req.graph);
        last.clear();
        analyses.clear();
        version++;
        dragFrames.clear();
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
        version++;
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
  else scheduleWarmup();
}

function schedule(): void {
  if (scheduled || busy) return;
  scheduled = true;
  setTimeout(() => void pump(), 0);
}

/**
 * Idle warm-up (see WarmupPlan): after a request is served and nothing is queued, silent drag-quality passes of the
 * implicit items at slightly shifted views, so the JIT (here and in the strip Workers) is warm before the first drag.
 * They run only while idle, one pass per task, and queued requests always go first.
 */
const warmup = new WarmupPlan(WARMUP_PASSES, WARMUP_BUDGET_MS);
let lastView: ViewRequest | null = null;
let warmShifts = 0;
function scheduleWarmup(): void {
  if (warmup.done || !lastView || !engine) return;
  setTimeout(() => void warmPass(), WARMUP_DELAY_MS);
}
async function warmPass(): Promise<void> {
  const e = engine;
  const v = lastView;
  if (!e || !v || busy || scheduled || !warmup.mayRun(pending.length)) {
    if (pending.length > 0) schedule();
    return;
  }
  const items = e.graph.items.filter((it) => e.runtime(it.id)?.kind === "Implicit");
  if (items.length === 0) return;
  busy = true;
  const t = performance.now();
  let ok = true;
  try {
    const shift = (v.viewport.xmax - v.viewport.xmin) * 0.0007 * ++warmShifts;
    const view: ViewRequest = { ...v, quality: "drag", viewport: { ...v.viewport, xmin: v.viewport.xmin + shift, xmax: v.viewport.xmax + shift } };
    for (const it of items) {
      const rt = e.runtime(it.id);
      if (rt?.kind === "Implicit") await field(e, it.id, rt.F, view, fieldOptions(view, rt.relation));
    }
  } catch {
    ok = false;
  } finally {
    busy = false;
  }
  warmup.record(performance.now() - t, ok);
  if (pending.length > 0) schedule();
  else scheduleWarmup();
}

self.onmessage = (ev: MessageEvent<EngineRequest>) => {
  pending.push(ev.data);
  schedule();
};
