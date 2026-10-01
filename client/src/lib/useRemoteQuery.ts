import { useEffect, useRef, useState } from 'react';

export interface RemoteQuery<T> {
  /** The latest successful answer; kept while a newer request is in flight or after it failed. */
  readonly data: T | null;
  /** Message of the latest failure; cleared by the next success. */
  readonly error: string | null;
  readonly pending: boolean;
}

const CACHE_LIMIT = 96;
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

const cacheRead = <T,>(id: string): T | undefined => {
  if (!cache.has(id)) return undefined;
  const value = cache.get(id) as T;
  cache.delete(id); // refresh recency
  cache.set(id, value);
  return value;
};
const cacheWrite = (id: string, value: unknown): void => {
  cache.set(id, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
};

/** Drops every cached answer (used when the transport changes, e.g. in tests). */
export const clearRemoteQueryCache = (): void => { cache.clear(); inflight.clear(); };

/**
 * Starts (or joins) the request for `key` ahead of time so the first render of a studio can read its answer from
 * memory. The request is never aborted by consumers; failures are swallowed and simply leave the cache empty.
 */
export function prefetchRemoteQuery<T>(namespace: string, key: string, fetcher: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  const id = `${namespace}|${key}`;
  const hit = cacheRead<T>(id);
  if (hit !== undefined) return Promise.resolve(hit);
  const running = inflight.get(id) as Promise<T | undefined> | undefined;
  if (running) return running;
  const request = fetcher(new AbortController().signal).then(
    data => { cacheWrite(id, data); return data; },
    () => undefined,
  ).finally(() => { inflight.delete(id); });
  inflight.set(id, request);
  return request;
}

/**
 * Runs `fetcher` on the serverless engine whenever `key` changes (a serialisable description of the
 * request), debounced, with older in-flight requests abandoned. `enabled: false` clears nothing and sends nothing.
 * With a `namespace`, answers are memoised per (namespace, key): a repeated key resolves from memory without a request
 * and, when already cached on mount, on the very first render.
 */
export function useRemoteQuery<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, options: { debounceMs?: number; enabled?: boolean; namespace?: string } = {}): RemoteQuery<T> {
  const { debounceMs = 0, enabled = true, namespace } = options;
  const [state, setState] = useState<RemoteQuery<T>>(() => {
    const hit = namespace && enabled ? cacheRead<T>(`${namespace}|${key}`) : undefined;
    return hit !== undefined ? { data: hit, error: null, pending: false } : { data: null, error: null, pending: enabled };
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return undefined;
    const id = namespace ? `${namespace}|${key}` : null;
    const hit = id ? cacheRead<T>(id) : undefined;
    if (hit !== undefined) {
      setState(prev => (prev.data === hit && !prev.pending && !prev.error ? prev : { data: hit, error: null, pending: false }));
      return undefined;
    }
    const controller = new AbortController();
    setState(prev => (prev.pending ? prev : { ...prev, pending: true }));
    const onData = (data: T) => { if (id) cacheWrite(id, data); if (!controller.signal.aborted) setState({ data, error: null, pending: false }); };
    const onError = (error: unknown) => {
      if (controller.signal.aborted) return;
      setState(prev => ({ data: prev.data, error: error instanceof Error ? error.message : 'Evaluation failed', pending: false }));
    };
    const run = () => fetcherRef.current(controller.signal).then(onData, onError);
    const joined = id ? inflight.get(id) as Promise<T | undefined> | undefined : undefined;
    if (joined) {
      // Join the prefetch; if it failed (resolves undefined) fall back to a normal request.
      joined.then(data => { if (controller.signal.aborted) return; if (data !== undefined) onData(data); else void run(); });
      return () => controller.abort();
    }
    const timer = setTimeout(run, debounceMs);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, debounceMs, enabled, namespace]);

  return state;
}
