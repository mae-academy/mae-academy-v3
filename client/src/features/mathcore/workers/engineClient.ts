/**
 * Shared Worker helper (STEPS.md §7.3): spawns the engine Worker, numbers every request, drops stale responses, and
 * restarts the Worker when a task runs longer than 5 seconds (§9: cancellation with timeout). Same pattern as
 * features/plot/plotRunner.ts.
 */
import { ENGINE_LOAD_TIMEOUT_MS, WORKER_TIMEOUT_MS } from "@shared/mathcore/constants";
import type { EngineRequest, EngineResponse } from "./protocol";

/** Distributive Omit, so each request variant keeps its own fields. */
type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;


export interface WorkerLike {
  postMessage(message: EngineRequest): void;
  terminate(): void;
  onmessage: ((event: { data: EngineResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface EngineClient {
  /** Sends a request; only the response to the latest request reaches `onResult`. */
  send(req: WithoutSeq<Exclude<EngineRequest, { type: "trace" }>>): number;
  /** Asks for the value and tangent at x; only the latest trace answer reaches `onTrace`. */
  trace(id: string, x: number): void;
  dispose(): void;
}

export interface EngineClientConfig {
  createWorker: () => WorkerLike;
  onResult: (res: Exclude<EngineResponse, { type: "trace" } | { type: "skipped" }>) => void;
  onTrace?: (res: Extract<EngineResponse, { type: "trace" }>) => void;
  /** Called when the Worker was restarted after a timeout or crash; the page reloads the document. */
  onRestart: (reason: string) => void;
  timeoutMs?: number;
}

export function createEngineClient(config: EngineClientConfig): EngineClient {
  const timeoutMs = config.timeoutMs ?? WORKER_TIMEOUT_MS;
  let worker: WorkerLike | null = null;
  let seq = 0;
  let latest = 0;
  let latestTrace = 0;
  /** True once this Worker has answered a request, i.e. its code is loaded and running. */
  let warm = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const drop = () => {
    clear();
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    worker = null;
    warm = false;
  };

  const ensure = (): WorkerLike => {
    if (worker) return worker;
    const w = config.createWorker();
    w.onmessage = (ev) => {
      const res = ev.data;
      if (res.type === "trace") {
        if (res.seq === latestTrace) config.onTrace?.(res);
        return;
      }
      if (res.seq !== latest) return; // stale: a newer request is pending
      // Any answer proves the Worker's code is running (parsing, and Compute Engine, live in the parse Worker).
      warm = true;
      // A partial (progressive) frame keeps the watchdog running for the full frame that follows.
      if (res.type === "result" && res.partial) {
        config.onResult(res);
        return;
      }
      clear();
      if (res.type === "skipped") return;
      config.onResult(res);
    };
    w.onerror = () => {
      drop();
      config.onRestart("crash");
    };
    worker = w;
    return w;
  };

  return {
    send(req) {
      seq += 1;
      latest = seq;
      const w = ensure();
      clear();
      timer = setTimeout(() => {
        // A runaway evaluation cannot be interrupted inside the Worker: replace the Worker.
        drop();
        config.onRestart("timeout");
      }, warm ? timeoutMs : Math.max(timeoutMs, ENGINE_LOAD_TIMEOUT_MS));
      w.postMessage({ ...req, seq });
      return seq;
    },
    trace(id, x) {
      latestTrace += 1;
      ensure().postMessage({ type: "trace", seq: latestTrace, id, x });
    },
    dispose() {
      drop();
    },
  };
}
