import type { NodeId, TimerFn } from '../domain/ast';
import type { PlcAddress } from '../domain/types';

/**
 * Volatile state that must survive between scans but has no place in the static AST or in the
 * PLC memory image: previous-scan sample points for edge detection and the sub-time-base
 * accumulators of timer instances.
 *
 * Keys are stable AST identities (`NodeId` for contacts, instance address for timers/counters),
 * so reloading a program that keeps its ids also keeps its runtime behaviour.
 */

/**
 * Enable request latched by a 1 ms / 10 ms timer box during Phase B and consumed by Phase C,
 * which advances those resolutions asynchronously to rung execution (see `instructions/timers.ts`).
 */
export interface TimerLatch {
  readonly fn: TimerFn;
  readonly timeBaseMs: number;
  readonly preset: number;
  readonly input: boolean;
}

/** Sub-time-base bookkeeping for one timer instance. CV and Q themselves live in the MemoryMap. */
export interface TimerState {
  /** Accumulated milliseconds; CV = floor(accumulatedMs / timeBaseMs). */
  accumulatedMs: number;
  /** TOF only: the post-falling-edge delay is running. */
  timing: boolean;
  /** IN as sampled on the previous scan (edge detection for TOF). */
  previousIn: boolean;
  /** Scan counter of the last execution; lets Phase C spot instances skipped by an MCR zone. */
  lastScan: number;
  /** Set by Phase B for asynchronous resolutions, cleared by Phase C. */
  pending: TimerLatch | null;
}

/** Previous-scan pin levels for one counter instance. CV and Q live in the MemoryMap. */
export interface CounterState {
  previousCu: boolean;
  previousCd: boolean;
  previousLd: boolean;
  previousR: boolean;
  lastScan: number;
}

const createTimerState = (): TimerState => ({
  accumulatedMs: 0,
  timing: false,
  previousIn: false,
  lastScan: 0,
  pending: null,
});

const createCounterState = (): CounterState => ({
  previousCu: false,
  previousCd: false,
  previousLd: false,
  previousR: false,
  lastScan: 0,
});

export interface RuntimeStateSnapshot {
  edges: [NodeId, boolean][];
  timers: [PlcAddress, TimerState][];
  counters: [PlcAddress, CounterState][];
}

export class RuntimeState {
  /** Previous conduction state of P/N contacts, keyed by node. */
  private readonly contactEdges = new Map<NodeId, boolean>();
  private readonly timers = new Map<PlcAddress, TimerState>();
  private readonly counters = new Map<PlcAddress, CounterState>();

  /** Rising-edge detector for a P contact; records the new level for the next scan. */
  risingEdge(nodeId: NodeId, level: boolean): boolean {
    const previous = this.contactEdges.get(nodeId) ?? false;
    this.contactEdges.set(nodeId, level);
    return level && !previous;
  }

  /** Falling-edge detector for an N contact; records the new level for the next scan. */
  fallingEdge(nodeId: NodeId, level: boolean): boolean {
    const previous = this.contactEdges.get(nodeId) ?? false;
    this.contactEdges.set(nodeId, level);
    return !level && previous;
  }

  timer(instance: PlcAddress): TimerState {
    let state = this.timers.get(instance);
    if (!state) {
      state = createTimerState();
      this.timers.set(instance, state);
    }
    return state;
  }

  counter(instance: PlcAddress): CounterState {
    let state = this.counters.get(instance);
    if (!state) {
      state = createCounterState();
      this.counters.set(instance, state);
    }
    return state;
  }

  /** Clears the accumulator of a timer instance (S7-200 `R` on a T address). */
  resetTimer(instance: PlcAddress): void {
    const state = this.timers.get(instance);
    if (!state) return;
    state.accumulatedMs = 0;
    state.timing = false;
    state.pending = null;
  }

  /** Visits every live timer instance; used by Phase C to drain latched enables. */
  forEachTimer(visit: (instance: PlcAddress, state: TimerState) => void): void {
    this.timers.forEach((state, instance) => visit(instance, state));
  }

  /** Plain-object copy of everything that must survive between requests. */
  exportState(): RuntimeStateSnapshot {
    return {
      edges: Array.from(this.contactEdges, ([id, level]) => [id, level] as [NodeId, boolean]),
      timers: Array.from(this.timers, ([addr, t]) => [addr, { ...t, pending: t.pending ? { ...t.pending } : null }] as [PlcAddress, TimerState]),
      counters: Array.from(this.counters, ([addr, c]) => [addr, { ...c }] as [PlcAddress, CounterState]),
    };
  }

  importState(snapshot: RuntimeStateSnapshot): void {
    this.clear();
    for (const [id, level] of snapshot.edges) this.contactEdges.set(id, level);
    for (const [addr, t] of snapshot.timers) this.timers.set(addr, { ...t, pending: t.pending ? { ...t.pending } : null });
    for (const [addr, c] of snapshot.counters) this.counters.set(addr, { ...c });
  }

  /** Cold start: forget every edge and accumulator (STOP -> RUN transition). */
  clear(): void {
    this.contactEdges.clear();
    this.timers.clear();
    this.counters.clear();
  }
}
