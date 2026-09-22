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

    // Created lazily: a consumer that never runs Python should not pay for the Pyodide fetch.
    const worker = new Worker(
      new URL("./executionWorker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<ExecutionResponse>) => {
      const response = event.data;
      const id = response.id;
      if (id !== undefined) {
        pendingRef.current.get(id)?.(response);
        pendingRef.current.delete(id);
      }

      // A slow earlier run must never overwrite the newest one's outcome.
      if (!mountedRef.current || id !== latestIdRef.current) return;
      setIsRunning(false);
      setResult(response.payload);
    };

    const handleFailure = (message: string) => {
      workerRef.current?.terminate();
      workerRef.current = null;
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

      const workerLanguage: "python" = language;
      const worker = getWorker();

      return new Promise<void>(resolve => {
        // A tight synchronous loop in interpreted user code (JSCPP has no built-in yield point)
        // can hang the worker's own message loop forever; Worker.terminate() is the only escape.
        const timeout = setTimeout(() => {
          pendingRef.current.delete(id);
          worker.terminate();
          workerRef.current = null;
          if (mountedRef.current && id === latestIdRef.current) {
            setIsRunning(false);
            setResult(TIMED_OUT_RESULT);
          }
          resolve();
        }, WORKER_TIMEOUT_MS);

        pendingRef.current.set(id, () => {
          clearTimeout(timeout);
          resolve();
        });

        try {
          const request: ExecutionRequest = {
            type: "RUN",
            payload: { language: workerLanguage, code, options },
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
    return () => {
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      void masmEngine.dispose();
      failAllPending(
        "The execution engine was torn down before the run finished."
      );
    };
  }, [failAllPending]);

  return { isRunning, result, runCode, reset };
}
