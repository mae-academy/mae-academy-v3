/**
 * Shared Worker helper (STEPS.md §7.3): spawns the engine Worker, numbers every request, drops stale responses, and
 * restarts the Worker when a task runs longer than 5 seconds (§9: cancellation with timeout). Same pattern as
 * features/plot/plotRunner.ts.
 */
import { WORKER_TIMEOUT_MS } from "@shared/mathcore/constants";
import type { EngineRequest, EngineResponse } from "./protocol";

/** Distributive Omit, so each request variant keeps its own fields. */
type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;

/** Until a Worker has answered once it may still be starting (module download), so every request gets this limit. */
const LOAD_TIMEOUT_MS = 30_000;

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
  onResult: (res: Exclude<EngineResponse, { type: "trace" }>) => void;
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
  /** True once this Worker has answered a request, i.e. Compute Engine is loaded. */
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
      clear();
      // Only a real answer proves the Worker is running; an error reply may come from a failed start.
      if (res.type !== "error") warm = true;
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
      }, warm ? timeoutMs : Math.max(timeoutMs, LOAD_TIMEOUT_MS));
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
