import { PlotError, type PlotResult, type PlotStage } from "./plotProtocol";
import { getPlotRunner } from "./plotRunner";

/** Outcome of a plot job: exactly one of `result` or `error`. */
export type PlotOutcome = { result: PlotResult; error?: undefined } | { error: PlotError; result?: undefined };

export interface PlotJob {
  promise: Promise<PlotOutcome>;
  /** Latest stage reached (null before the first event). */
  stage(): PlotStage | null;
  subscribe(listener: (stage: PlotStage) => void): () => void;
}

const MAX_CACHED = 12;
// Insertion-ordered, so the first key is the least recently used.
const settled = new Map<string, PlotOutcome>();
const inflight = new Map<string, PlotJob>();

/** Results are cached per code string; failures that a retry could fix (timeout, download) are not. */
function cacheable(outcome: PlotOutcome): boolean {
  return outcome.result !== undefined || outcome.error.kind === "rejected" || outcome.error.kind === "python" || outcome.error.kind === "limit";
}

export function cachedPlot(code: string): PlotOutcome | undefined {
  const hit = settled.get(code);
  if (hit) {
    settled.delete(code);
    settled.set(code, hit);
  }
  return hit;
}

export function runningPlot(code: string): PlotJob | undefined {
  return inflight.get(code);
}

/** Starts (or joins) the run for `code`; callers for the same code share one execution. */
export function startPlot(code: string): PlotJob {
  const existing = inflight.get(code);
  if (existing) return existing;
  let stage: PlotStage | null = null;
  const listeners = new Set<(stage: PlotStage) => void>();
  const promise = getPlotRunner()
    .run(code, {
      onProgress: (next) => {
        stage = next;
        listeners.forEach((listener) => listener(next));
      },
    })
    .then<PlotOutcome, PlotOutcome>(
      (result) => ({ result }),
      (cause: unknown) => ({ error: cause instanceof PlotError ? cause : new PlotError("internal", cause instanceof Error ? cause.message : String(cause)) }),
    )
    .then((outcome) => {
      inflight.delete(code);
      if (cacheable(outcome)) {
        settled.set(code, outcome);
        while (settled.size > MAX_CACHED) settled.delete(settled.keys().next().value as string);
      }
      return outcome;
    });
  const job: PlotJob = {
    promise,
    stage: () => stage,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  inflight.set(code, job);
  return job;
}

/** Test seam. */
export function clearPlotCaches(): void {
  settled.clear();
  inflight.clear();
}
