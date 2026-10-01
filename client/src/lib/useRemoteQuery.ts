import { useEffect, useRef, useState } from 'react';

export interface RemoteQuery<T> {
  /** The latest successful answer; kept while a newer request is in flight or after it failed. */
  readonly data: T | null;
  /** Message of the latest failure; cleared by the next success. */
  readonly error: string | null;
  readonly pending: boolean;
}

/**
 * Runs `fetcher` on the serverless engine whenever `key` changes (a serialisable description of the
 * request), debounced, with older in-flight requests abandoned. `enabled: false` clears nothing and sends nothing.
 */
export function useRemoteQuery<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, options: { debounceMs?: number; enabled?: boolean } = {}): RemoteQuery<T> {
  const { debounceMs = 0, enabled = true } = options;
  const [state, setState] = useState<RemoteQuery<T>>({ data: null, error: null, pending: enabled });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState(prev => (prev.pending ? prev : { ...prev, pending: true }));
    const timer = setTimeout(() => {
      fetcherRef.current(controller.signal).then(
        data => { if (!controller.signal.aborted) setState({ data, error: null, pending: false }); },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setState(prev => ({ data: prev.data, error: error instanceof Error ? error.message : 'Evaluation failed', pending: false }));
        },
      );
    }, debounceMs);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, debounceMs, enabled]);

  return state;
}
