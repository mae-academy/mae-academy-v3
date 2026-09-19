import type { CounterNode } from '../../domain/ast';
import type { ExecContext } from '../context';
import { readNumeric } from '../numeric';
import { mirrorBit, mirrorWord, pin, type PinLevels } from './shared';

/** Counter words are signed 16-bit; the count saturates at the limits instead of wrapping. */
const MAX_COUNT = 32767;
const MIN_COUNT = -32768;

const clamp = (value: number): number => Math.max(MIN_COUNT, Math.min(MAX_COUNT, value));

/**
 * CTU / CTD / CTUD.
 *
 * Pin order follows the box symbol top to bottom, which is how the compiler wires the inlets:
 * CTU `[CU, R]`, CTD `[CD, LD]`, CTUD `[CU, CD, R]`. Count pins are edge sensitive; the control
 * pins R and LD are level sensitive and dominate the count within the same scan.
 */
export function executeCounter(node: CounterNode, ctx: ExecContext, pins: PinLevels): boolean {
  const powerIn = pin(pins, 0);
  const state = ctx.state.counter(node.instance);
  state.lastScan = ctx.scan;

  // A counter inside a de-energised MCR zone is not serviced and holds its value.
  if (!ctx.energised) return powerIn;

  const preset = readNumeric(ctx.memory, node.inputs.PV, 'INT');
  ctx.memory.writePreset(node.instance, preset & 0xffff);

  let value = ctx.memory.readSigned(node.instance);
  let q: boolean;

  switch (node.fn) {
    case 'CTU': {
      const countUp = powerIn && !state.previousCu;
      const reset = pin(pins, 1);
      state.previousCu = powerIn;
      state.previousR = reset;
      if (reset) value = 0;
      else if (countUp && value < MAX_COUNT) value += 1;
      q = value >= preset;
      break;
    }

    case 'CTD': {
      const countDown = powerIn && !state.previousCd;
      const load = pin(pins, 1);
      state.previousCd = powerIn;
      state.previousLd = load;
      // LD presets the counter; counting down stops at zero.
      if (load) value = preset;
      else if (countDown && value > 0) value -= 1;
      q = value <= 0;
      break;
    }

    case 'CTUD': {
      const cd = pin(pins, 1);
      const reset = pin(pins, 2);
      const countUp = powerIn && !state.previousCu;
      const countDown = cd && !state.previousCd;
      state.previousCu = powerIn;
      state.previousCd = cd;
      state.previousR = reset;
      if (reset) value = 0;
      else {
        // Simultaneous edges cancel out, as on a hardware up/down counter.
        if (countUp) value += 1;
        if (countDown) value -= 1;
        value = clamp(value);
      }
      q = value >= preset;
      break;
    }

    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }

  ctx.memory.write(node.instance, value);
  ctx.memory.writeBit(node.instance, q);
  mirrorBit(ctx, node.outputs.Q, q);
  mirrorBit(ctx, node.outputs.ENO, powerIn);
  mirrorWord(ctx, node.outputs.CV, value);
  return powerIn;
}
