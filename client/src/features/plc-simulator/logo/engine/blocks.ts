import { COUNT_MAX, toMs } from './time';
import type { Bit, LogoBlock, TimeValue } from './types';

/**
 * Evaluators for every implemented GF / SF block (spec §4.2, §4.4). Each is a pure step:
 * pin levels (already defaulted and inverted, in `BLOCK_SPECS[type].pins` order) + previous state +
 * elapsed wall time since the previous scan → next state. `q` of the returned state is the output.
 */

export interface BlockState {
  readonly q: Bit;
  /** Elapsed time of the running timer, ms. */
  readonly ta: number;
  /** Block-specific internal phase (0 = idle). */
  readonly phase: number;
  /** Counter value. */
  readonly cnt: number;
  /** Previous-cycle pin levels: bit i = pin i. Drives every edge detector. */
  readonly prev: number;
}

export const INITIAL_BLOCK_STATE: BlockState = { q: 0, ta: 0, phase: 0, cnt: 0, prev: 0 };

const bit = (value: boolean): Bit => (value ? 1 : 0);
const ZERO: TimeValue = { base: 's', value: 0 };

export function stepBlock(block: LogoBlock, pins: readonly Bit[], state: BlockState, dtMs: number): BlockState {
  const prevMask = pins.reduce<number>((mask, level, index) => mask | (level << index), 0);
  const now = (index: number): boolean => pins[index] === 1;
  const was = (index: number): boolean => ((state.prev >> index) & 1) === 1;
  const rise = (index: number): boolean => now(index) && !was(index);
  const fall = (index: number): boolean => !now(index) && was(index);
  const next = (patch: Partial<BlockState>): BlockState => ({ ...state, ...patch, prev: prevMask });
  const all = pins.every((level) => level === 1);
  const allBefore = pins.every((_, index) => was(index));
  const any = pins.some((level) => level === 1);
  const p = block.params;
  const ms = (time: TimeValue | undefined): number => toMs(time ?? ZERO);

  switch (block.type) {
    // ---- basic functions: combinational, x-defaults already applied ----
    case 'AND':
      return next({ q: bit(all) });
    case 'AND_EDGE':
      return next({ q: bit(all && !allBefore) });
    case 'NAND':
      return next({ q: bit(!all) });
    case 'NAND_EDGE':
      return next({ q: bit(!all && allBefore) });
    case 'OR':
      return next({ q: bit(any) });
    case 'NOR':
      return next({ q: bit(!any) });
    case 'XOR':
      return next({ q: bit(now(0) !== now(1)) });
    case 'NOT':
      return next({ q: bit(!now(0)) });

    // ---- timers ----
    case 'ON_DELAY': {
      const T = ms(p.T);
      if (!now(0)) return next({ q: 0, ta: 0 });
      const ta = rise(0) ? 0 : Math.min(T, state.ta + dtMs);
      return next({ q: bit(ta >= T), ta });
    }

    case 'OFF_DELAY': {
      const T = ms(p.T);
      if (now(1)) return next({ q: 0, ta: 0, phase: 0 }); // R has priority
      if (rise(0)) return next({ q: 1, ta: 0, phase: 0 });
      if (fall(0) && state.q === 1) return T <= 0 ? next({ q: 0, ta: 0, phase: 0 }) : next({ ta: 0, phase: 1 });
      if (state.phase === 1) {
        const ta = Math.min(T, state.ta + dtMs);
        return ta >= T ? next({ q: 0, ta, phase: 0 }) : next({ ta });
      }
      return next({});
    }

    case 'ON_OFF_DELAY': {
      const TH = ms(p.TH);
      const TL = ms(p.TL);
      if (now(0)) {
        if (state.q === 1) return next({ ta: 0 }); // a pending off-delay is cancelled
        const ta = rise(0) ? 0 : Math.min(TH, state.ta + dtMs);
        return ta >= TH ? next({ q: 1, ta: 0 }) : next({ ta });
      }
      if (state.q === 0) return next({ ta: 0 }); // a pending on-delay is cancelled
      const ta = fall(0) ? 0 : Math.min(TL, state.ta + dtMs);
      return ta >= TL ? next({ q: 0, ta: 0 }) : next({ ta });
    }

    case 'RETENTIVE_ON_DELAY': {
      const T = ms(p.T);
      if (now(1)) return next({ q: 0, ta: 0, phase: 0 });
      if (state.phase === 0 && state.q === 0 && rise(0)) {
        return T <= 0 ? next({ q: 1, ta: 0, phase: 2 }) : next({ ta: 0, phase: 1 });
      }
      if (state.phase === 1) {
        const ta = Math.min(T, state.ta + dtMs);
        return ta >= T ? next({ q: 1, ta, phase: 2 }) : next({ ta });
      }
      return next({});
    }

    case 'WIPING_RELAY': {
      const T = ms(p.T);
      if (rise(0)) return next({ q: bit(T > 0), ta: 0 });
      if (state.q === 1) {
        if (!now(0)) return next({ q: 0, ta: 0 }); // early abort when Trg falls first
        const ta = Math.min(T, state.ta + dtMs);
        return next({ q: bit(ta < T), ta });
      }
      return next({});
    }

    case 'PULSE_GENERATOR': {
      if (!now(0)) return next({ q: 0, ta: 0, phase: 0 });
      let phase = state.phase === 0 ? 1 : state.phase; // enabling starts with the pulse (TH)
      let ta = state.phase === 0 ? 0 : state.ta + dtMs;
      for (let guard = 0; guard < 10_000; guard++) {
        const length = phase === 1 ? ms(p.TH) : ms(p.TL);
        if (length <= 0 || ta < length) break;
        ta -= length;
        phase = phase === 1 ? 2 : 1;
      }
      const high = phase === 1;
      return next({ q: bit(high !== now(1)), ta, phase }); // Inv inverts only while enabled
    }

    case 'STAIRWAY': {
      const T = ms(p.T);
      if (rise(0)) return T <= 0 ? next({ q: 0, ta: 0, phase: 0 }) : next({ q: 1, ta: 0, phase: 1 }); // (re)trigger
      if (state.phase !== 1) return next({});
      const ta = Math.min(T, state.ta + dtMs);
      if (ta >= T) return next({ q: 0, ta, phase: 0 });
      const warnAt = T - ms(p['T!']);
      const warnLength = ms(p['T!L']);
      const warning = ms(p['T!']) > 0 && warnLength > 0 && ta >= warnAt && ta < warnAt + warnLength;
      return next({ q: bit(!warning), ta });
    }

    // ---- counter ----
    case 'UP_DOWN_COUNTER': {
      if (now(0)) return next({ q: 0, cnt: 0 });
      const cnt = rise(1) ? Math.max(0, Math.min(COUNT_MAX, state.cnt + (now(2) ? -1 : 1))) : state.cnt;
      const on = p.On ?? 0;
      const off = p.Off ?? 0;
      // Limits are checked once per scan: a fast count can jump over a window (spec §4.4.13).
      const q: Bit = on >= off ? (cnt >= on ? 1 : cnt < off ? 0 : state.q) : bit(on <= cnt && cnt < off);
      return next({ q, cnt });
    }

    // ---- bistable ----
    case 'LATCHING_RELAY':
      return next({ q: now(1) ? 0 : now(0) ? 1 : state.q }); // reset dominates

    case 'PULSE_RELAY': {
      const s = now(1);
      const r = now(2);
      if (s && r) return next({ q: p.Par === 'SR' ? 1 : 0 });
      if (s) return next({ q: 1 });
      if (r) return next({ q: 0 });
      return next({ q: rise(0) ? bit(state.q === 0) : state.q }); // Trg toggles only when S = R = 0
    }

    default: {
      const exhaustive: never = block.type;
      return exhaustive;
    }
  }
}
