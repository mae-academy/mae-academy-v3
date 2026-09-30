import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { MemoryMap } from '../../domain/memory';
import type { Network } from '../../domain/ast';
import type { EvalTree } from '../../engine/compiler';
import type { FlowTrace } from '../../engine/flow-trace';
import type { PlcRuntimePort } from '../../remote/runtime-port';
import type { FlowRef } from './wiring';

/**
 * Bridge between a running controller (`PlcRuntimePort`) and the canvas.
 *
 * The store fans one runtime subscription out to any number of components, and every hook below
 * hands `useSyncExternalStore` a *primitive* snapshot (a boolean or a number). React therefore only
 * re-renders the individual wire, contact or value whose own snapshot changed, no matter how often
 * scans complete — the rung, the canvas and every unchanged wire stay untouched.
 */
export interface SimulationStore {
  readonly memory: MemoryMap;
  readonly trace: FlowTrace;
  /** Fires after every scan, mode change, program download and reset. */
  subscribe(listener: () => void): () => void;
  /** Bumped whenever the compiled program (and so every tree identity) is replaced. */
  programVersion(): number;
  /** The runtime's own tree for `network`, or null if that exact network object is not loaded. */
  treeFor(network: Network): EvalTree | null;
}

export function createSimulationStore(runtime: PlcRuntimePort): SimulationStore {
  const trace = runtime.enableFlowTrace();
  const listeners = new Set<() => void>();
  let version = 0;
  let detach: (() => void) | null = null;

  const attach = (): void => {
    detach = runtime.subscribe((event) => {
      if (event.type === 'scan' || event.type === 'mode') {
        listeners.forEach((listener) => listener());
      } else if (event.type === 'program' || event.type === 'reset') {
        version += 1;
        listeners.forEach((listener) => listener());
      }
    });
  };

  return {
    memory: runtime.memory,
    trace,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) attach();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detach?.();
          detach = null;
        }
      };
    },
    programVersion: () => version,
    // The tree depends only on nodes + branches, so a network whose grid was merely padded or
    // resized by the editor still maps onto the runtime's tree.
    treeFor: (network) =>
      runtime.compiled.networks.find(
        (compiled) =>
          compiled.source === network ||
          (compiled.source.id === network.id &&
            compiled.source.nodes === network.nodes &&
            compiled.source.branches === network.branches),
      )?.root ?? null,
  };
}

const SimulationContext = createContext<SimulationStore | null>(null);

export function SimulationProvider({ store, children }: { store: SimulationStore | null; children: ReactNode }) {
  return <SimulationContext.Provider value={store}>{children}</SimulationContext.Provider>;
}

/** The active simulation, or null while editing offline. */
export const useSimulation = (): SimulationStore | null => useContext(SimulationContext);

const noopSubscribe = (): (() => void) => () => {};

/** Re-renders only when the compiled program is swapped, so trees can be looked up again. */
export function useProgramVersion(): number {
  const sim = useSimulation();
  const subscribe = useCallback((cb: () => void) => (sim ? sim.subscribe(cb) : noopSubscribe()), [sim]);
  return useSyncExternalStore(subscribe, () => (sim ? sim.programVersion() : 0), () => 0);
}

/** Bit mask of the flow at every ref (bit i = refs[i]); one number, so one cheap comparison. */
export function useFlowMask(refs: readonly FlowRef[]): number {
  const sim = useSimulation();
  const subscribe = useCallback((cb: () => void) => (sim ? sim.subscribe(cb) : noopSubscribe()), [sim]);
  const read = (): number => {
    if (!sim) return 0;
    let mask = 0;
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      if (ref && sim.trace.read(ref.tree, ref.side)) mask |= 1 << i;
    }
    return mask;
  };
  return useSyncExternalStore(subscribe, read, () => 0);
}

/** Power state of a single wire segment. */
export function useFlow(ref: FlowRef): boolean {
  const sim = useSimulation();
  const subscribe = useCallback((cb: () => void) => (sim ? sim.subscribe(cb) : noopSubscribe()), [sim]);
  return useSyncExternalStore(subscribe, () => (sim ? sim.trace.read(ref.tree, ref.side) : false), () => false);
}

/** Live value of one memory bit. Unknown or unreadable addresses read as false. */
export function useMemoryBit(address: string | undefined): boolean {
  const sim = useSimulation();
  const subscribe = useCallback(
    (cb: () => void) => (sim ? sim.memory.subscribe(() => cb()) : noopSubscribe()),
    [sim],
  );
  const read = (): boolean => {
    if (!sim || address === undefined) return false;
    try {
      return sim.memory.readBit(address);
    } catch {
      return false;
    }
  };
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Live value of one memory word (timer ET, counter CV, VW ...). */
export function useMemoryWord(address: string | undefined): number | null {
  const sim = useSimulation();
  const subscribe = useCallback(
    (cb: () => void) => (sim ? sim.memory.subscribe(() => cb()) : noopSubscribe()),
    [sim],
  );
  const read = (): number | null => {
    if (!sim || address === undefined) return null;
    try {
      return sim.memory.readSigned(address);
    } catch {
      return null;
    }
  };
  return useSyncExternalStore(subscribe, read, () => null);
}
