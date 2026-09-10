import { useCallback, useEffect, useRef, useState } from "react";

import type {
  SpiceRequest,
  SpiceResponse,
} from "@/simulators/circuit-engine/engine/spiceWorker";

export type SpiceVectors = Record<string, number[]>;

export interface UseSpiceEngineReturn {
  isSimulating: boolean;
  results: SpiceVectors | null;
  error: string | null;
  runSimulation: (netlist: string) => Promise<void>;
  reset: () => void;
}

/** Drives the ngspice-wasm worker, keeping SPICE runs off the main thread. */
export function useSpiceEngine(): UseSpiceEngineReturn {
  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<SpiceVectors | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<string, (response: SpiceResponse) => void>()
  );
  const latestIdRef = useRef<string | null>(null);
  const nextIdRef = useRef(0);
  const mountedRef = useRef(true);

  /** Resolves every in-flight request with an error, e.g. when the worker dies or unmounts. */
  const failAllPending = useCallback((message: string) => {
    const pending = pendingRef.current;
    pendingRef.current = new Map();
    pending.forEach((resolve, id) => {
      resolve({ type: "ERROR", payload: { error: message }, id });
    });
  }, []);

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    // Created lazily: a consumer that never simulates should not pay for the 7 MB wasm fetch.
    const worker = new Worker(
      new URL("../../engine/spiceWorker.ts", import.meta.url),
      {
        type: "module",
      }
    );

    worker.onmessage = (event: MessageEvent<SpiceResponse>) => {
      const response = event.data;
      const id = response.id;
      if (id !== undefined) {
        pendingRef.current.get(id)?.(response);
        pendingRef.current.delete(id);
      }

      // A slow earlier run must never overwrite the newest one's outcome.
      if (!mountedRef.current || id !== latestIdRef.current) return;

      setIsSimulating(false);
      if (response.type === "SUCCESS") {
        setResults(response.payload.vectors ?? {});
        setError(null);
      } else {
        setResults(null);
        setError(
          response.payload.error ??
            "The SPICE engine failed for an unknown reason."
        );
      }
    };

    const handleFailure = (message: string) => {
      // Without this the worker could die mid-boot and leave isSimulating stuck true.
      workerRef.current?.terminate();
      workerRef.current = null;
      failAllPending(message);
      if (!mountedRef.current) return;
      setIsSimulating(false);
      setResults(null);
      setError(message);
    };

    worker.onerror = (event: ErrorEvent) => {
      handleFailure(event.message || "The SPICE worker crashed.");
    };
    worker.onmessageerror = () => {
      handleFailure(
        "The SPICE worker sent a message that could not be deserialized."
      );
    };

    workerRef.current = worker;
    return worker;
  }, [failAllPending]);

  /** Never rejects — failures land in `error`, so callers do not need a try/catch. */
  const runSimulation = useCallback(
    (netlist: string): Promise<void> => {
      const id = String(nextIdRef.current++);
      latestIdRef.current = id;

      if (mountedRef.current) {
        setIsSimulating(true);
        setError(null);
      }

      return new Promise<void>(resolve => {
        pendingRef.current.set(id, () => resolve());

        try {
          const request: SpiceRequest = {
            type: "RUN_SIMULATION",
            payload: { netlist },
            id,
          };
          getWorker().postMessage(request);
        } catch (cause) {
          pendingRef.current.delete(id);
          if (mountedRef.current && id === latestIdRef.current) {
            setIsSimulating(false);
            setResults(null);
            setError(cause instanceof Error ? cause.message : String(cause));
          }
          resolve();
        }
      });
    },
    [getWorker]
  );

  const reset = useCallback(() => {
    latestIdRef.current = null;
    setIsSimulating(false);
    setResults(null);
    setError(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      // Unblock anyone still awaiting runSimulation at unmount.
      failAllPending(
        "The SPICE engine was torn down before the simulation finished."
      );
    };
  }, [failAllPending]);

  return { isSimulating, results, error, runSimulation, reset };
}
