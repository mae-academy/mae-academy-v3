import type { CounterState, RuntimeStateSnapshot, TimerState } from './engine/runtime-state';
import type { RuntimeWire } from '../../plc/schema';

const TIMER_FNS = ['TON', 'TOF', 'TONR'] as const;

/** Packs the engine's carried state into the compact positional form (see schema.ts). */
export function packRuntime(state: RuntimeStateSnapshot): RuntimeWire {
  return [
    state.edges.map(([id, level]) => [id, level ? 1 : 0] as [string, 0 | 1]),
    state.timers.map(([address, t]) => [
      address,
      t.accumulatedMs,
      (t.timing ? 1 : 0) | (t.previousIn ? 2 : 0),
      t.lastScan,
      t.pending ? ([TIMER_FNS.indexOf(t.pending.fn), t.pending.timeBaseMs, t.pending.preset, t.pending.input ? 1 : 0] as [number, number, number, 0 | 1]) : 0,
    ]),
    state.counters.map(([address, c]) => [
      address,
      (c.previousCu ? 1 : 0) | (c.previousCd ? 2 : 0) | (c.previousLd ? 4 : 0) | (c.previousR ? 8 : 0),
      c.lastScan,
    ]),
  ];
}

export function unpackRuntime(wire: RuntimeWire): RuntimeStateSnapshot {
  const [edges, timers, counters] = wire;
  return {
    edges: edges.map(([id, level]) => [id, level === 1] as [string, boolean]),
    timers: timers.map(([address, accumulatedMs, flags, lastScan, pending]) => {
      const state: TimerState = {
        accumulatedMs,
        timing: (flags & 1) !== 0,
        previousIn: (flags & 2) !== 0,
        lastScan,
        pending: pending === 0 ? null : { fn: TIMER_FNS[pending[0]]!, timeBaseMs: pending[1], preset: pending[2], input: pending[3] === 1 },
      };
      return [address, state] as [string, TimerState];
    }),
    counters: counters.map(([address, flags, lastScan]) => {
      const state: CounterState = { previousCu: (flags & 1) !== 0, previousCd: (flags & 2) !== 0, previousLd: (flags & 4) !== 0, previousR: (flags & 8) !== 0, lastScan };
      return [address, state] as [string, CounterState];
    }),
  };
}
