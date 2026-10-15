import { PLOT_TIMEOUT_MS, PlotError, type PlotResponse, type PlotRequest, type PlotResult, type PlotStage } from "./plotProtocol";
import { prefilterPlotCode } from "./plotValidate";

/** The slice of the Worker API the runner needs; tests pass a fake. */
export interface PlotWorkerLike {
  postMessage(message: PlotRequest): void;
  terminate(): void;
  onmessage: ((event: { data: PlotResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface PlotRunOptions {
  onProgress?: (stage: PlotStage) => void;
  /** Test hook: include the plotted data in the figure summary. */
  debug?: boolean;
}

export interface PlotRunnerConfig {
  createWorker: () => PlotWorkerLike;
  /** Wall-clock limit for the script itself (starts when the worker reports `rendering`). */
  timeoutMs?: number;
  /** Limit for downloading and initialising the runtime, reset on each progress event. */
  loadTimeoutMs?: number;
}

interface Job {
  id: number;
  code: string;
  options: PlotRunOptions;
  resolve: (result: PlotResult) => void;
  reject: (error: PlotError) => void;
}

export interface PlotRunner {
  run(code: string, options?: PlotRunOptions): Promise<PlotResult>;
  /** Terminates the worker (a queued job still runs on a fresh one). */
  dispose(): void;
}

export function createPlotRunner(config: PlotRunnerConfig): PlotRunner {
  const timeoutMs = config.timeoutMs ?? PLOT_TIMEOUT_MS;
  const loadTimeoutMs = config.loadTimeoutMs ?? 180_000;
  let worker: PlotWorkerLike | null = null;
  let nextId = 0;
  const queue: Job[] = [];
  let current: Job | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const dropWorker = () => {
    clearTimer();
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    worker = null;
  };

  const finish = (job: Job, settle: () => void) => {
    if (current !== job) return;
    clearTimer();
    current = null;
    settle();
    pump();
  };

  const armTimer = (job: Job, ms: number, message: string, kind: "timeout" | "load") => {
    clearTimer();
    timer = setTimeout(() => {
      // The interpreter cannot be interrupted: kill the worker, the next job gets a fresh one (and a fresh download from cache).
      dropWorker();
      finish(job, () => job.reject(new PlotError(kind, message)));
    }, ms);
  };

  const handle = (job: Job, response: PlotResponse) => {
    if (response.id !== job.id || current !== job) return;
    if (response.type === "progress") {
      job.options.onProgress?.(response.stage);
      if (response.stage === "rendering") armTimer(job, timeoutMs, `The plot took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped.`, "timeout");
      else armTimer(job, loadTimeoutMs, "The scientific Python runtime could not be loaded in time.", "load");
    } else if (response.type === "result") {
      finish(job, () => job.resolve({ png: new Uint8Array(response.png), width: response.width, height: response.height, dpi: response.dpi, summary: response.summary, warnings: response.warnings }));
    } else {
      finish(job, () => job.reject(new PlotError(response.kind, response.message, response.line)));
    }
  };

  function pump() {
    if (current || queue.length === 0) return;
    const job = queue.shift()!;
    current = job;
    try {
      if (!worker) worker = config.createWorker();
      worker.onmessage = (event) => handle(job, event.data);
      worker.onerror = () => {
        dropWorker();
        finish(job, () => job.reject(new PlotError("internal", "The plot worker stopped unexpectedly.")));
      };
      armTimer(job, loadTimeoutMs, "The scientific Python runtime could not be loaded in time.", "load");
      worker.postMessage({ type: "run", id: job.id, code: job.code, debug: job.options.debug });
    } catch {
      dropWorker();
      finish(job, () => job.reject(new PlotError("internal", "The plot worker could not be started in this browser.")));
    }
  }

  return {
    run(code, options = {}) {
      return new Promise<PlotResult>((resolve, reject) => {
        const refusal = prefilterPlotCode(code);
        if (refusal) {
          reject(new PlotError("rejected", refusal.message, refusal.line));
          return;
        }
        queue.push({ id: ++nextId, code, options, resolve, reject });
        pump();
      });
    },
    dispose() {
      dropWorker();
      const pending = current;
      if (pending) finish(pending, () => pending.reject(new PlotError("internal", "The plot was cancelled.")));
      while (queue.length) queue.shift()!.reject(new PlotError("internal", "The plot was cancelled."));
    },
  };
}

let shared: PlotRunner | null = null;

/** The app-wide runner: one worker, created on the first plot. */
export function getPlotRunner(): PlotRunner {
  if (!shared) {
    shared = createPlotRunner({
      createWorker: () => new Worker(new URL("./plot.worker.ts", import.meta.url), { type: "module" }) as unknown as PlotWorkerLike,
    });
  }
  return shared;
}

// Dev-only handle for manual verification from the browser console (stripped from production builds).
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __maePlot?: unknown }).__maePlot = { run: (code: string, options?: PlotRunOptions) => getPlotRunner().run(code, options) };
}

/** Test seam: replace or reset the shared runner. */
export function setPlotRunnerForTests(runner: PlotRunner | null): void {
  shared = runner;
}
