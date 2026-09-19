import type { TimerFn, TimerNode } from '../../domain/ast';
import type { PlcAddress } from '../../domain/types';
import type { ExecContext } from '../context';
import { readNumeric } from '../numeric';
import type { TimerState } from '../runtime-state';
import { mirrorBit, mirrorWord } from './shared';

/** S7-200 timer words are signed 16-bit; the current value saturates rather than wrapping. */
const MAX_TICKS = 32767;

/**
 * Timer resolution, faithful to the S7-200:
 *  - 100 ms timers advance only when the box executes, inside Phase B.
 *  - 1 ms and 10 ms timers are maintained by the system asynchronously to rung execution. The box
 *    latches its enable during Phase B and publishes the value produced by the previous Phase C,
 *    which is why a fast timer's bit can change part-way through a scan on real hardware.
 */
const isAsync = (timeBaseMs: number): boolean => timeBaseMs < 100;

export function executeTimer(node: TimerNode, ctx: ExecContext, powerIn: boolean): boolean {
  const state = ctx.state.timer(node.instance);
  state.lastScan = ctx.scan;

  // A timer inside a de-energised MCR zone freezes: it is simply not serviced this scan.
  if (!ctx.energised) {
    state.pending = null;
    return powerIn;
  }

  const preset = clampTicks(readNumeric(ctx.memory, node.inputs.PT, 'INT'));
  ctx.memory.writePreset(node.instance, preset);

  if (isAsync(node.timeBaseMs)) {
    state.pending = { fn: node.fn, timeBaseMs: node.timeBaseMs, preset, input: powerIn };
    // Q/CV were settled by the previous Phase C; republish them for the mirrors.
    publish(ctx, node.instance, node.outputs, ctx.memory.read(node.instance), ctx.memory.readBit(node.instance));
  } else {
    const result = advance(state, node.fn, node.timeBaseMs, preset, powerIn, ctx.deltaMs);
    commit(ctx, node.instance, result);
    publish(ctx, node.instance, node.outputs, result.ticks, result.q);
  }

  mirrorBit(ctx, node.outputs.ENO, powerIn);
  return powerIn;
}

/**
 * Phase C: services every 1 ms / 10 ms timer that latched an enable during Phase B.
 * Instances whose rung did not execute (skipped MCR zone) hold their value.
 */
export function advanceAsyncTimers(ctx: ExecContext): void {
  ctx.state.forEachTimer((instance, state) => {
    const pending = state.pending;
    if (!pending) return;
    state.pending = null;
    const result = advance(state, pending.fn, pending.timeBaseMs, pending.preset, pending.input, ctx.deltaMs);
    commit(ctx, instance, result);
  });
}

interface TimerResult {
  readonly ticks: number;
  readonly q: boolean;
}

function advance(
  state: TimerState,
  fn: TimerFn,
  timeBaseMs: number,
  preset: number,
  input: boolean,
  deltaMs: number,
): TimerResult {
  const previousIn = state.previousIn;
  state.previousIn = input;

  switch (fn) {
    case 'TON': {
      // Current value is cleared whenever the enabling input is off.
      if (!input) {
        state.accumulatedMs = 0;
        state.timing = false;
        return { ticks: 0, q: false };
      }
      state.timing = true;
      state.accumulatedMs += deltaMs;
      const ticks = toTicks(state.accumulatedMs, timeBaseMs);
      return { ticks, q: ticks >= preset };
    }

    case 'TOF': {
      if (input) {
        // Q follows IN immediately; the off-delay is armed but not yet running.
        state.accumulatedMs = 0;
        state.timing = false;
        return { ticks: 0, q: true };
      }
      if (previousIn) {
        // Falling edge starts the off-delay.
        state.accumulatedMs = 0;
        state.timing = true;
      }
      if (!state.timing) return { ticks: toTicks(state.accumulatedMs, timeBaseMs), q: false };
      state.accumulatedMs += deltaMs;
      const ticks = toTicks(state.accumulatedMs, timeBaseMs);
      if (ticks >= preset) {
        // Expired: the timer stops and holds PT, output drops.
        state.timing = false;
        state.accumulatedMs = preset * timeBaseMs;
        return { ticks: preset, q: false };
      }
      return { ticks, q: true };
    }

    case 'TONR': {
      // Retentive: the accumulator survives IN going low and is cleared only by an R instruction.
      if (input) {
        state.timing = true;
        state.accumulatedMs += deltaMs;
      } else {
        state.timing = false;
      }
      const ticks = toTicks(state.accumulatedMs, timeBaseMs);
      return { ticks, q: ticks >= preset };
    }

    default: {
      const exhaustive: never = fn;
      return exhaustive;
    }
  }
}

function commit(ctx: ExecContext, instance: PlcAddress, result: TimerResult): void {
  ctx.memory.write(instance, result.ticks);
  ctx.memory.writeBit(instance, result.q);
}

function publish(
  ctx: ExecContext,
  _instance: PlcAddress,
  outputs: TimerNode['outputs'],
  ticks: number,
  q: boolean,
): void {
  mirrorBit(ctx, outputs.Q, q);
  mirrorWord(ctx, outputs.ET, ticks);
}

const toTicks = (accumulatedMs: number, timeBaseMs: number): number =>
  clampTicks(Math.floor(accumulatedMs / timeBaseMs));

const clampTicks = (value: number): number =>
  !Number.isFinite(value) ? 0 : Math.max(0, Math.min(MAX_TICKS, Math.trunc(value)));
