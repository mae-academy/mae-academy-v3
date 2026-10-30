/**
 * Math Core graphing page (route /mathcore). Phases 1–2 of STEPS.md §11: expression list, sliders, Canvas renderer,
 * route-level lazy loading, Graph IR as the single state (ADR-9) in the link (?g=), PNG/SVG/JSON export and text
 * descriptions. Compute Engine, parsing and sampling live in the engine Worker (ADR-1, ADR-11, ADR-12).
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildSvg } from "@shared/mathcore/export/svg";
import { LINK_PARAM, decodeGraph, encodeGraph, exportJson, importJson } from "@shared/mathcore/ir/codec";
import type { GraphIR, Item, Param, Viewport } from "@shared/mathcore/ir/types";
import { DEFAULT_VIEWPORT, emptyGraph } from "@shared/mathcore/ir/types";
import { PARSE_DEBOUNCE_MS } from "@shared/mathcore/constants";
import { NS } from "../i18n/register";
import type { DrawCurve, DrawField, DrawPoint, Scene } from "../render/renderer";
import { PALETTE_TOKENS, resolveColor } from "../render/renderer";
import { describeItem } from "./describeText";
import { ExpressionRow } from "./ExpressionRow";
import type { DraggablePoint, TraceTarget } from "./GraphCanvas";
import { GraphCanvas, triangleRun } from "./GraphCanvas";
import { SliderRow } from "./SliderRow";
import type { EngineClient, WorkerLike } from "../workers/engineClient";
import { createEngineClient } from "../workers/engineClient";
import type { EngineResponse, ItemResult } from "../workers/protocol";
import "../mathcore.css";

/** The link in the address bar is refreshed this long after the last change. */
const LINK_DEBOUNCE_MS = 500;
/** Default curve width when an item has no style (canvas drawing units). */
const DEFAULT_WIDTH = 2.5;

/** Theory section (STEPS.md §4, repo rule: every studio has one); loaded after the graph is usable. */
const SimulationDocumentation = lazy(() => import("@/components/simulations/SimulationDocumentation"));

type Result = Extract<EngineResponse, { type: "result" }>;
type Trace = Extract<EngineResponse, { type: "trace" }>;

let idCounter = 0;
const newId = () => `e${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** The graph in the address, or a starter graph; `invalid` when a `?g=` was present but could not be read. */
function initialGraph(): { graph: GraphIR; invalid: boolean } {
  const encoded = new URLSearchParams(window.location.search).get(LINK_PARAM);
  let invalid = false;
  if (encoded) {
    const r = decodeGraph(encoded);
    if (r.ok) return { graph: r.graph, invalid: false };
    invalid = true;
  }
  return { graph: { ...emptyGraph(), items: [{ id: newId(), latex: "y=a\\sin(x)" }] }, invalid };
}

/**
 * Takes the Worker's document into the page's. The Worker decides which sliders exist (it creates and removes them);
 * the page keeps its own ranges, steps and animation, which the user may have edited since the request was sent.
 * Values come from the Worker only for a `load`: retyping `a = 2` as `a = 5` moves the slider, a drag does not.
 */
function mergeParams(g: GraphIR, res: Result): GraphIR {
  const next: Record<string, Param> = {};
  for (const [name, theirs] of Object.entries(res.graph.params)) {
    const mine = g.params[name];
    next[name] = mine ? { ...mine, value: res.cause === "load" ? theirs.value : mine.value } : theirs;
  }
  return JSON.stringify(next) === JSON.stringify(g.params) ? g : { ...g, params: next };
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function MathcorePage() {
  const { t, i18n } = useTranslation(NS);
  const [initial] = useState(initialGraph);
  const [graph, setGraph] = useState<GraphIR>(initial.graph);
  const [linkNotice] = useState<string | null>(initial.invalid ? t("linkInvalid") : null);
  const [themeTick, setThemeTick] = useState(0);
  const traceAt = useRef<{ id: string; x: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bench, setBench] = useState<unknown>(null);
  const [linkTooLarge, setLinkTooLarge] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const client = useRef<EngineClient | null>(null);
  const graphRef = useRef(graph);
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);
  const size = useRef({ w: 800, h: 500 });

  const view = useCallback(
    (quality: "drag" | "full", viewport: Viewport = graphRef.current.viewport) => ({
      viewport,
      width: canvasEl?.clientWidth || size.current.w,
      height: canvasEl?.clientHeight || size.current.h,
      quality,
    }),
    [canvasEl],
  );

  useEffect(() => {
    document.title = t("title");
  }, [t]);

  useEffect(() => {
    const c = createEngineClient({
      createWorker: () =>
        new Worker(new URL("../workers/mathcore-engine-worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike,
      onResult: (res) => {
        if (res.type === "result") {
          setResult(res);
          setNotice(null);
          setGraph((g) => mergeParams(g, res));
          // A tangent follows its curve when a slider moves it.
          if (traceAt.current) c.trace(traceAt.current.id, traceAt.current.x);
        } else if (res.type === "bench") setBench(res.results);
        else if (res.type === "error") setNotice(t("engineError", { message: res.message }));
      },
      onTrace: setTrace,
      onRestart: () => {
        setNotice(t("engineRestarted"));
        c.send({ type: "load", graph: graphRef.current, view: view("full") });
      },
    });
    client.current = c;
    return () => c.dispose();
    // One Worker per page visit; `view` reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Items or parameter ranges changed: send the document, debounced (STEPS.md §7.1 technique 5).
  const docKey = useMemo(
    () => JSON.stringify([graph.items, Object.entries(graph.params).map(([k, p]) => [k, p.min, p.max, p.step])]),
    [graph.items, graph.params],
  );
  useEffect(() => {
    const id = setTimeout(() => client.current?.send({ type: "load", graph: graphRef.current, view: view("full") }), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [docKey, view]);

  // The theme class on <html> decides every token color: repaint when it changes.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  // The link always carries the full Graph IR (?g=); too large → keep the address bar as it was and say so.
  // A shared link that could not be read stays in the address bar until the user edits something.
  useEffect(() => {
    if (initial.invalid && graph.items === initial.graph.items) return;
    const id = setTimeout(() => {
      const enc = encodeGraph(graph);
      setLinkTooLarge(!enc.ok);
      if (enc.ok) {
        const url = new URL(window.location.href);
        url.searchParams.set(LINK_PARAM, enc.encoded);
        window.history.replaceState(window.history.state, "", url);
      }
    }, LINK_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [graph, initial]);

  const setItems = (items: Item[]) => setGraph((g) => ({ ...g, items }));

  const setParam = (name: string, value: number, quality: "drag" | "full") => {
    setGraph((g) => (g.params[name] ? { ...g, params: { ...g.params, [name]: { ...g.params[name], value } } } : g));
    client.current?.send({ type: "param", name, value, view: view(quality) });
  };

  const setRange = (name: string, patch: Partial<Param>) =>
    setGraph((g) => {
      const p = { ...g.params[name], ...patch };
      p.value = Math.min(p.max, Math.max(p.min, p.value));
      return { ...g, params: { ...g.params, [name]: p } };
    });

  const setViewport = (v: Viewport, quality: "drag" | "full") => {
    setGraph((g) => ({ ...g, viewport: v }));
    client.current?.send({ type: "view", view: view(quality, v) });
  };

  const results = useMemo(() => new Map((result?.items ?? []).map((r) => [r.id, r])), [result]);

  const colors = useMemo(() => {
    const root = document.documentElement;
    return graph.items.map((it, i) => resolveColor(root, it.style?.color, PALETTE_TOKENS[i % PALETTE_TOKENS.length]));
    // `result` and `themeTick` only trigger a re-read of the tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.items, result, themeTick]);

  const scene: Scene = useMemo(() => {
    const curves: DrawCurve[] = [];
    const fields: DrawField[] = [];
    const points: DrawPoint[] = [];
    graph.items.forEach((it, i) => {
      const r = results.get(it.id);
      if (!r || it.style?.hidden) return;
      if (r.field) fields.push({ ...r.field, color: colors[i] });
      // A strict inequality (< or >) does not include its boundary, so the boundary is dashed.
      const strict = r.relation === "<" || r.relation === ">";
      if (r.segments.length) {
        curves.push({ segments: r.segments, color: colors[i], width: it.style?.width ?? DEFAULT_WIDTH, dash: it.style?.dash ?? (strict ? "dashed" : undefined), highlighted: trace?.id === it.id });
      }
      if (r.point) points.push({ x: r.point.x, y: r.point.y, color: colors[i] });
    });
    const traced = trace && Number.isFinite(trace.y) ? trace : null;
    if (traced) points.push({ x: traced.x, y: traced.y, color: colors[graph.items.findIndex((it) => it.id === traced.id)] ?? colors[0], label: `(${traced.x.toPrecision(4)}, ${traced.y.toPrecision(4)})` });
    return {
      viewport: graph.viewport,
      grid: graph.view.grid,
      curves,
      fields,
      points,
      tangent:
        traced && traced.slope !== null
          ? { x0: traced.x, y0: traced.y, slope: traced.slope, dx: triangleRun(graph.viewport), color: resolveColor(document.documentElement, undefined, "--muted-foreground") }
          : null,
    };
  }, [graph, results, colors, trace]);

  const traceTargets: TraceTarget[] = (result?.items ?? [])
    .filter((r) => r.kind === "Explicit" && r.segments.length > 0)
    .map((r) => ({ id: r.id, segments: r.segments }));

  const draggable: DraggablePoint[] = (result?.items ?? [])
    .filter((r): r is ItemResult & { point: { x: number; y: number } } => !!r.point && !!(r.dragParams?.x || r.dragParams?.y))
    .map((r) => ({ id: r.id, x: r.point.x, y: r.point.y }));

  // A dragged point snaps to its parameters' slider steps (Desmos behaviour), within [min, max].
  const snap = (name: string, v: number) => {
    const p = graphRef.current.params[name];
    if (!p) return v;
    const stepped = p.min + Math.round((v - p.min) / p.step) * p.step;
    const digits = Math.max(0, -Math.floor(Math.log10(p.step)) + 1);
    return Math.min(p.max, Math.max(p.min, Number(stepped.toFixed(digits))));
  };

  const onDragPoint = (id: string, x: number, y: number, quality: "drag" | "full") => {
    const r = results.get(id);
    if (r?.dragParams?.x) setParam(r.dragParams.x, snap(r.dragParams.x, x), quality);
    if (r?.dragParams?.y) setParam(r.dragParams.y, snap(r.dragParams.y, y), quality);
  };

  const exportSvg = () => {
    const root = document.documentElement;
    const svg = buildSvg({
      width: canvasEl?.clientWidth || size.current.w,
      height: canvasEl?.clientHeight || size.current.h,
      viewport: graph.viewport,
      background: resolveColor(root, undefined, "--background"),
      axis: resolveColor(root, undefined, "--muted-foreground"),
      curves: scene.curves.map((c) => ({ segments: c.segments, stroke: c.color, width: c.width, dash: c.dash })),
      title: t("title"),
      description: descriptions.join(" "),
    });
    download("mathcore-graph.svg", new Blob([svg], { type: "image/svg+xml" }));
  };

  const share = async () => {
    const enc = encodeGraph(graph);
    if (!enc.ok) {
      setNotice(t("linkTooLarge"));
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(LINK_PARAM, enc.encoded);
    await navigator.clipboard?.writeText(url.toString());
    setNotice(t("linkCopied"));
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const r = importJson(await file.text());
    if (r.ok) setGraph(r.graph);
    else setNotice(t("importFailed"));
  };

  const descriptions = graph.items
    .map((it, i) => {
      const r = results.get(it.id);
      return r?.description ? describeItem(t, `${t("expressionLabel", { n: i + 1 })}`, r.description) : null;
    })
    .filter((d): d is string => d !== null);

  const params = Object.entries(graph.params).sort(([a], [b]) => a.localeCompare(b));
  const isRtl = i18n.language === "ar";

  return (
    <div className="mc-page" dir={isRtl ? "rtl" : "ltr"}>
      <header className="mc-header">
        <div>
          <h1 className="mc-title">{t("title")}</h1>
          <p className="mc-subtitle">{t("subtitle")}</p>
        </div>
        <div className="mc-toolbar" role="toolbar">
          <button type="button" className="mc-button" onClick={() => void share()} disabled={linkTooLarge} title={linkTooLarge ? t("linkTooLarge") : undefined}>
            {t("share")}
          </button>
          <button type="button" className="mc-button" onClick={() => canvasEl?.toBlob((b) => b && download("mathcore-graph.png", b))}>
            {t("exportPng")}
          </button>
          <button type="button" className="mc-button" onClick={exportSvg}>
            {t("exportSvg")}
          </button>
          <button type="button" className="mc-button" onClick={() => download("mathcore-graph.json", new Blob([exportJson(graph)], { type: "application/json" }))}>
            {t("exportJson")}
          </button>
          <label className="mc-button">
            {t("importJson")}
            <input type="file" accept="application/json,.json" className="mc-sr" onChange={(e) => void onImport(e.target.files?.[0])} />
          </label>
          <button type="button" className="mc-button" onClick={() => setViewport({ ...DEFAULT_VIEWPORT }, "full")}>
            {t("resetView")}
          </button>
        </div>
      </header>
      {notice && (
        <p className="mc-notice" role="status">
          {notice}
        </p>
      )}
      {linkTooLarge && <p className="mc-notice">{t("linkTooLarge")}</p>}
      {linkNotice && (
        <p className="mc-notice" role="status">
          {linkNotice}
        </p>
      )}
      <div className="mc-layout">
        <aside className="mc-panel" aria-label={t("expressions")}>
          {!result && <p className="mc-note">{t("loadingEngine")}</p>}
          <ol className="mc-list">
            {graph.items.map((it, i) => (
              <ExpressionRow
                key={it.id}
                index={i}
                latex={it.latex}
                color={colors[i]}
                result={results.get(it.id)}
                onChange={(latex) => setItems(graph.items.map((x) => (x.id === it.id ? { ...x, latex } : x)))}
                onRemove={() => setItems(graph.items.filter((x) => x.id !== it.id))}
                onEnter={() => setItems([...graph.items.slice(0, i + 1), { id: newId(), latex: "" }, ...graph.items.slice(i + 1)])}
              />
            ))}
          </ol>
          <button type="button" className="mc-button mc-add" onClick={() => setItems([...graph.items, { id: newId(), latex: "" }])}>
            + {t("addExpression")}
          </button>
          {params.length > 0 && (
            <section aria-label={t("parameters")}>
              <h2 className="mc-section-title">{t("parameters")}</h2>
              <ul className="mc-list">
                {params.map(([name, p]) => (
                  <SliderRow key={name} name={name} param={p} onValue={(v, q) => setParam(name, v, q)} onRange={(patch) => setRange(name, patch)} />
                ))}
              </ul>
            </section>
          )}
          <details className="mc-details">
            <summary>{t("descriptions")}</summary>
            <div aria-live="polite">
              {descriptions.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </div>
          </details>
          {result && (
            <p className="mc-meta">
              {t("evaluations", { count: result.evaluations, changed: result.reevaluated.length })}
            </p>
          )}
          <details className="mc-details">
            <summary>{t("benchHeader")}</summary>
            <button type="button" className="mc-button" onClick={() => client.current?.send({ type: "bench" })}>
              {t("benchmarks")}
            </button>
            {Array.isArray(bench) && (
              <table className="mc-bench" dir="ltr">
                <tbody>
                  {(bench as Array<{ id: string; median: number; unit: string; target: number; pass: boolean }>).map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{b.unit === "ms" ? `${b.median.toFixed(3)} ms` : `${Math.round(b.median).toLocaleString()} /s`}</td>
                      <td>{b.pass ? t("benchPass") : t("benchFail")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </details>
        </aside>
        <section className="mc-graph">
          <GraphCanvas
            scene={scene}
            onViewport={setViewport}
            traceTargets={traceTargets}
            onTrace={(target) => {
              traceAt.current = target;
              if (target) client.current?.trace(target.id, target.x);
              else setTrace(null);
            }}
            draggable={draggable}
            onDragPoint={onDragPoint}
            equalAspect={graph.viewport.aspect === "equal"}
            onCanvas={(el) => {
              setCanvasEl(el);
              if (el) size.current = { w: el.clientWidth, h: el.clientHeight };
            }}
          />
          {trace && trace.slope !== null && (
            <p className="mc-trace" dir="ltr" aria-live="polite">
              {t("tangentAt", { x: trace.x.toPrecision(6), slope: trace.slope.toPrecision(8) })}
            </p>
          )}
        </section>
      </div>
      <Suspense fallback={null}>
        <SimulationDocumentation topic="mathcore" />
      </Suspense>
    </div>
  );
}
