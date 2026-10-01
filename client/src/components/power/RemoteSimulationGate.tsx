import type { ReactNode } from "react";
import { useRemoteQuery, prefetchRemoteQuery } from "@/lib/useRemoteQuery";

/** Warms the cache with a studio's default parameters so its first render needs no round-trip. */
export function prefetchSimulation<P, S>(namespace: string, parameters: P, fetcher: (parameters: P, signal: AbortSignal) => Promise<S>): void {
  if (import.meta.env.MODE === "test") return;
  void prefetchRemoteQuery(namespace, JSON.stringify(parameters), (signal) => fetcher(parameters, signal));
}

/**
 * Runs a converter simulation on the serverless engine whenever its parameters change and hands the last good result to
 * `children`. Until the first answer arrives (or when the engine rejects the parameters) a status line replaces the studio body.
 */
export function RemoteSimulationGate<P, S>({ namespace, parameters, fetcher, children }: { namespace: string; parameters: P; fetcher: (parameters: P, signal: AbortSignal) => Promise<S>; children: (simulation: S) => ReactNode }) {
  const query = useRemoteQuery(JSON.stringify(parameters), (signal) => fetcher(parameters, signal), { debounceMs: 30, namespace });
  if (!query.data) {
    return (
      <div role="status" className="min-h-[640px] rounded-2xl border border-slate-200/70 bg-white/70 p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        {query.error ?? "Solving the converter model…"}
      </div>
    );
  }
  return <>{children(query.data)}</>;
}
