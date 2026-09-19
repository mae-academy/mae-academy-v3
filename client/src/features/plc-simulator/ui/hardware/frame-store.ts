/**
 * Coalesces bursts of change notifications into at most one UI update per animation frame (and no
 * more often than `minIntervalMs`). A scan at 20 ms can fire hundreds of memory notifications per
 * second across a panel; the LCD and status readouts subscribe here instead, so they refresh at a
 * steady, human-perceptible rate and never compete with canvas interaction for the main thread.
 */
export interface FrameStore {
  subscribe(listener: () => void): () => void;
  getVersion(): number;
}

export interface FrameStoreOptions {
  /** Lower bound between two published frames. 0 = every animation frame. */
  readonly minIntervalMs: number;
  /** Frame scheduler; defaults to requestAnimationFrame (setTimeout where unavailable). */
  readonly schedule: (callback: () => void) => () => void;
  readonly now: () => number;
}

const defaultSchedule = (callback: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
};

export const DEFAULT_FRAME_OPTIONS: FrameStoreOptions = {
  minIntervalMs: 50,
  schedule: defaultSchedule,
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

/**
 * @param attach subscribes to the underlying change sources; called with `notify` when the first
 *               listener arrives and undone when the last one leaves, so an idle panel costs nothing.
 */
export function createFrameStore(
  attach: (notify: () => void) => () => void,
  options: Partial<FrameStoreOptions> = {},
): FrameStore {
  const { minIntervalMs, schedule, now } = { ...DEFAULT_FRAME_OPTIONS, ...options };
  const listeners = new Set<() => void>();
  let version = 0;
  let dirty = false;
  let cancel: (() => void) | null = null;
  let lastPublished = Number.NEGATIVE_INFINITY;
  let detach: (() => void) | null = null;

  const pump = (): void => {
    cancel = null;
    if (!dirty) return;
    if (now() - lastPublished < minIntervalMs) {
      cancel = schedule(pump); // too soon: try again next frame
      return;
    }
    dirty = false;
    lastPublished = now();
    version += 1;
    listeners.forEach((listener) => listener());
  };

  const notify = (): void => {
    dirty = true;
    if (cancel === null) cancel = schedule(pump);
  };

  return {
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) detach = attach(notify);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detach?.();
          detach = null;
          cancel?.();
          cancel = null;
          dirty = false;
        }
      };
    },
  };
}
