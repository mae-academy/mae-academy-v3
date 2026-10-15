/// Web Worker that runs model-written matplotlib scripts in Pyodide, off the main thread. The Worker, the CSP and
/// Pyodide's in-memory filesystem are the security boundary; the AST validator in plotPython.ts is defense in depth.
import type { PyodideInterface, loadPyodide as LoadPyodideSignature } from "pyodide";
import { PLOT_DPI, PLOT_MAX_FIGURE_INCHES, PLOT_MAX_PNG_BYTES, type PlotErrorKind, type PlotRequest, type PlotResponse, type PlotStage, type PlotSummary } from "./plotProtocol";
import { assertPlotCode } from "./plotValidate";
import { PLOT_VALIDATOR_PY, plotRunnerSource } from "./plotPython";

const PYODIDE_VERSION = "0.27.8";
// Same CDN and version as the Code Studio runner (pythonEngine.ts); vercel.json already allows it for script and connect.
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// `lib` is dom-only in this project, so worker globals are cast rather than pulling in lib.webworker.
const ctx = globalThis as unknown as {
  postMessage(message: PlotResponse, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<PlotRequest>) => void): void;
};

function post(message: PlotResponse, transfer?: Transferable[]): void {
  ctx.postMessage(message, transfer);
}

interface Runtime {
  pyodide: PyodideInterface;
  /** Package sets already loaded. */
  loaded: Set<string>;
}

let runtimePromise: Promise<Runtime> | null = null;

class StageError extends Error {
  constructor(
    readonly kind: PlotErrorKind,
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

function loadRuntime(id: number): Promise<Runtime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    post({ type: "progress", id, stage: "runtime" });
    const module = (await import(/* @vite-ignore */ `${PYODIDE_CDN_BASE}pyodide.mjs`)) as { loadPyodide: typeof LoadPyodideSignature };
    const pyodide = await module.loadPyodide({ indexURL: PYODIDE_CDN_BASE });
    // Validator first: it only needs the standard library, so a hostile script is refused before numpy is downloaded.
    pyodide.runPython(PLOT_VALIDATOR_PY);
    return { pyodide, loaded: new Set<string>() };
  })();
  // A failed download must not poison later runs.
  runtimePromise.catch(() => {
    runtimePromise = null;
  });
  return runtimePromise;
}

async function ensurePackages(runtime: Runtime, id: number, stage: PlotStage, names: string[]): Promise<void> {
  const key = names.join(",");
  if (runtime.loaded.has(key)) return;
  post({ type: "progress", id, stage });
  await runtime.pyodide.loadPackage(names);
  runtime.loaded.add(key);
}

interface PythonOutcome {
  ok: boolean;
  kind?: PlotErrorKind;
  message?: string;
  line?: number | null;
  summary?: string;
  warnings?: string[];
}

async function run(request: PlotRequest): Promise<void> {
  const { id, code } = request;
  try {
    assertPlotCode(code);
    const runtime = await loadRuntime(id);
    const { pyodide } = runtime;

    // Refuse before any package is fetched.
    pyodide.globals.set("_plot_code", code);
    const check = pyodide.runPython(`
try:
    validate_plot_code(_plot_code)
    _verdict = None
except PlotRejected as _exc:
    _verdict = [_exc.message, _exc.line]
_verdict
`) as { toJs(): unknown; destroy(): void } | null;
    if (check) {
      const [message, line] = check.toJs() as [string, number | null];
      check.destroy();
      throw new StageError("rejected", message, line ?? undefined);
    }

    await ensurePackages(runtime, id, "numpy", ["numpy"]);
    await ensurePackages(runtime, id, "matplotlib", ["matplotlib"]);
    if (!runtime.loaded.has("runner")) {
      pyodide.runPython(plotRunnerSource());
      pyodide.runPython("warmup()");
      runtime.loaded.add("runner");
    }
    if (/^\s*(?:import|from)\s+scipy\b/m.test(code)) await ensurePackages(runtime, id, "scipy", ["scipy"]);

    post({ type: "progress", id, stage: "rendering" });
    pyodide.globals.set("_plot_debug", request.debug === true);
    const proxy = pyodide.runPython(`run_plot(_plot_code, _plot_debug, ${PLOT_DPI}, ${PLOT_MAX_FIGURE_INCHES}, ${PLOT_MAX_PNG_BYTES})`) as { toJs(options: object): unknown; destroy(): void };
    const outcome = proxy.toJs({ dict_converter: Object.fromEntries }) as PythonOutcome;
    proxy.destroy();
    pyodide.globals.delete("_plot_code");
    pyodide.globals.delete("_plot_debug");

    if (!outcome.ok || !outcome.summary) {
      throw new StageError(outcome.kind ?? "python", outcome.message ?? "The plot could not be drawn.", outcome.line ?? undefined);
    }
    // The PNG stays in Python (LAST_PNG); copy it out of WebAssembly memory through the buffer protocol.
    const pngProxy = pyodide.globals.get("LAST_PNG") as { getBuffer(): { data: Uint8Array; release(): void }; destroy(): void };
    const pngBuffer = pngProxy.getBuffer();
    const bytes = new Uint8Array(pngBuffer.data.length);
    bytes.set(pngBuffer.data);
    pngBuffer.release();
    pngProxy.destroy();
    pyodide.runPython("LAST_PNG = b''");
    const view = new DataView(bytes.buffer);
    // IHDR width/height live at fixed offsets 16 and 20.
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    post(
      { type: "result", id, png: bytes.buffer, width, height, dpi: PLOT_DPI, summary: JSON.parse(outcome.summary) as PlotSummary, warnings: outcome.warnings ?? [] },
      [bytes.buffer],
    );
  } catch (cause) {
    if (cause instanceof StageError) {
      post({ type: "error", id, kind: cause.kind, message: cause.message, line: cause.line });
      return;
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    const kind: PlotErrorKind = /rejected|not allowed/i.test(message) ? "rejected" : /fetch|network|load|failed to/i.test(message) ? "load" : "internal";
    post({ type: "error", id, kind, message: message.split("\n")[0].slice(0, 300) });
  }
}

// One request at a time: the Python interpreter is single-threaded and the runner queues on the other side anyway.
let chain: Promise<void> = Promise.resolve();
ctx.addEventListener("message", (event) => {
  const request = event.data;
  if (!request || request.type !== "run") return;
  chain = chain.then(() => run(request));
});
