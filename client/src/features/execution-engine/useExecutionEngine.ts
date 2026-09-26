import { useCallback, useEffect, useRef, useState } from "react";

import * as masmEngine from "@/features/execution-engine/masmEngine";
import { toTraceSteps } from "@/features/code-studio/services/cppTrace";
import { runRemoteCached } from "@/features/code-studio/executionCache";
import type {
  ExecutionRequest,
  ExecutionResponse,
} from "@/features/execution-engine/executionWorker";
import type {
  ExecutionOptions,
  ExecutionResult,
  SupportedLanguage,
  TraceStep,
} from "@/features/execution-engine/types";

const WORKER_TIMEOUT_MS = 20000;

const TIMED_OUT_RESULT: ExecutionResult = {
  success: false,
  error: "Execution timed out and was stopped.",
  steps: [],
  totalSteps: 0,
};

export interface UseExecutionEngineReturn {
  isRunning: boolean;
  result: ExecutionResult | null;
  runCode: (
    language: SupportedLanguage,
    code: string,
    options?: ExecutionOptions
  ) => Promise<void>;
  reset: () => void;
}

/** Drives the execution engine: remote real GCC (Wandbox) for C/C++, Pyodide worker for Python, MASM directly. */
export function useExecutionEngine(): UseExecutionEngineReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<string, (response: ExecutionResponse) => void>()
  );
  const latestIdRef = useRef<string | null>(null);
  const nextIdRef = useRef(0);
  const mountedRef = useRef(true);
  /** Tracks whether the PREWARM message has already been sent to prevent double init. */
  const prewarmedRef = useRef(false);

  const failAllPending = useCallback((message: string) => {
    const pending = pendingRef.current;
    pendingRef.current = new Map();
    pending.forEach((resolve, id) => {
      resolve({
        type: "ERROR",
        payload: { success: false, error: message, steps: [], totalSteps: 0 },
        id,
      });
    });
  }, []);

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL("./executionWorker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<ExecutionResponse>) => {
      const response = event.data;
      const id = response.id;

      // PREWARM / READY responses have no id and no pending callback — discard silently.
      if (response.type === "READY") return;

      // Invoke any registered per-request callback (e.g. the Python path which
      // post-processes incremental stdout and calls setResult itself).
      // Track whether the callback existed so we don't double-commit state below.
      const hadCallback = id !== undefined && pendingRef.current.has(id);
      if (id !== undefined) {
        pendingRef.current.get(id)?.(response);
        pendingRef.current.delete(id);
      }

      // If the pending callback handled state updates, skip the generic path.
      if (hadCallback) return;

      // Generic fallback: direct commit for any path that has no dedicated callback
      // (currently unused but kept as a safety net for future message types).
      if (!mountedRef.current || id !== latestIdRef.current) return;
      setIsRunning(false);
      setResult(response.payload);
    };

    const handleFailure = (message: string) => {
      workerRef.current?.terminate();
      workerRef.current = null;
      prewarmedRef.current = false;
      failAllPending(message);
      if (!mountedRef.current) return;
      setIsRunning(false);
      setResult({ success: false, error: message, steps: [], totalSteps: 0 });
    };

    worker.onerror = (event: ErrorEvent) =>
      handleFailure(event.message || "The execution worker crashed.");
    worker.onmessageerror = () =>
      handleFailure(
        "The execution worker sent a message that could not be deserialized."
      );

    workerRef.current = worker;
    return worker;
  }, [failAllPending]);

  /**
   * Eagerly pre-warm the worker and its Pyodide runtime.
   *
   * By doing this on mount (instead of deferring until the first "Run" click),
   * the Python cold-start penalty is absorbed during the page load idle time.
   * The worker is kept alive as a warm singleton — only terminated on unmount
   * or on a fatal crash.
   */
  const prewarmWorker = useCallback(() => {
    if (prewarmedRef.current) return;
    // Guard: Worker is unavailable in jsdom / SSR environments.
    if (typeof Worker === "undefined") return;
    prewarmedRef.current = true;
    const worker = getWorker();
    const request: ExecutionRequest = {
      type: "PREWARM",
      payload: { language: "python", code: "", options: {} },
    };
    try {
      worker.postMessage(request);
    } catch {
      // Swallow — if the worker is busted it will surface on the real run.
    }
  }, [getWorker]);

  /** Never rejects — failures land in `result.error`, so callers do not need a try/catch. */
  const runCode = useCallback(
    (
      language: SupportedLanguage,
      code: string,
      options?: ExecutionOptions
    ): Promise<void> => {
      if (mountedRef.current) {
        setIsRunning(true);
        setResult(null);
      }

      const id = String(nextIdRef.current++);
      latestIdRef.current = id;

      if (language === "masm8086") {
        return masmEngine.run(code, options).then(outcome => {
          if (mountedRef.current && id === latestIdRef.current) {
            setIsRunning(false);
            setResult(outcome);
          }
        });
      }

      if (language === "cpp" || language === "c") {
        const stdin = options?.stdin ?? "";

        return runRemoteCached(language, code, stdin)
          .then(remoteOutcome => {
            if (!mountedRef.current || id !== latestIdRef.current) return;
            setIsRunning(false);

            const isSuccess = remoteOutcome.success && remoteOutcome.exitCode === 0;
            const compilerOrRuntimeError = !isSuccess
              ? (remoteOutcome.stderr || remoteOutcome.error || `Process exited with code ${remoteOutcome.exitCode}`)
              : undefined;

            const terminalOutput = isSuccess && remoteOutcome.stderr
              ? (remoteOutcome.stdout ? `${remoteOutcome.stdout}\n${remoteOutcome.stderr}` : remoteOutcome.stderr)
              : remoteOutcome.stdout;

            // Successful builds are replayed as a per-statement trace of main(); failures keep
            // the single frame so the compiler diagnostics show immediately.
            const steps: TraceStep[] = isSuccess
              ? toTraceSteps(code, remoteOutcome)
              : [
                  {
                    stepIndex: 0,
                    line: 1,
                    callStack: ["main"],
                    variables: {},
                    stdout: terminalOutput,
                  },
                ];

            setResult({
              success: isSuccess,
              error: compilerOrRuntimeError,
              steps,
              totalSteps: steps.length,
            });
          })
          .catch(cause => {
            if (!mountedRef.current || id !== latestIdRef.current) return;
            setIsRunning(false);
            const message = cause instanceof Error ? cause.message : String(cause);
            setResult({
              success: false,
              error: message,
              steps: [],
              totalSteps: 0,
            });
          });
      }

      // ── Python path ──
      // When instant===true → RUN_FAST (no sys.settrace, O(1) stdout dump).
      // When paced (0.5×/1×/2×) → RUN (full sys.settrace trace), so the
      // playback animation loop has real per-line steps to step through.
      // The worker inspects options.instant to decide which harness to use.
      const isInstant = options?.instant === true;
      const workerLanguage: "python" = language;
      const worker = getWorker();

      return new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          pendingRef.current.delete(id);
          worker.terminate();
          workerRef.current = null;
          prewarmedRef.current = false;
          if (mountedRef.current && id === latestIdRef.current) {
            setIsRunning(false);
            setResult(TIMED_OUT_RESULT);
          }
          resolve();
        }, WORKER_TIMEOUT_MS);

        pendingRef.current.set(id, (response) => {
          clearTimeout(timeout);
          if (mountedRef.current && id === latestIdRef.current) {
            // The Python tracer stores *cumulative* stdout at every step
            // (each snapshot contains everything printed so far).  Convert
            // to *incremental* per-step chunks so the terminal progressively
            // appends output as the animation loop advances, matching C++/MASM.
            const raw = response.payload;
            if (!isInstant && raw.steps.length > 1) {
              let prev = "";
              const incremental = raw.steps.map(step => {
                const chunk = (step.stdout ?? "").slice(prev.length);
                prev = step.stdout ?? "";
                return { ...step, stdout: chunk };
              });
              setResult({ ...raw, steps: incremental });
            } else {
              setResult(raw);
            }
            setIsRunning(false);
          }
          resolve();
        });

        try {
          const request: ExecutionRequest = {
            // Always send RUN_FAST so the worker receives the signal; it
            // inspects options.instant internally to pick the right harness.
            type: "RUN_FAST",
            payload: { language: workerLanguage, code, options: { ...options, instant: isInstant } },
            id,
          };
          worker.postMessage(request);
        } catch (cause) {
          clearTimeout(timeout);
          pendingRef.current.delete(id);
          if (mountedRef.current && id === latestIdRef.current) {
            setIsRunning(false);
            setResult({
              success: false,
              error: cause instanceof Error ? cause.message : String(cause),
              steps: [],
              totalSteps: 0,
            });
          }
          resolve();
        }
      });
    },
    [getWorker]
  );

  const reset = useCallback(() => {
    latestIdRef.current = null;
    setIsRunning(false);
    setResult(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // ── Background pre-warm ──
    // Instantiate the web worker and load Pyodide silently upon mounting the
    // Code Studio page — do NOT defer worker init until the first "Run" click.
    // This eliminates the 2–10s cold-start penalty on the first Python run.
    prewarmWorker();

    return () => {
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      prewarmedRef.current = false;
      void masmEngine.dispose();
      failAllPending(
        "The execution engine was torn down before the run finished."
      );
    };
  }, [failAllPending, prewarmWorker]);

  return { isRunning, result, runCode, reset };
}
