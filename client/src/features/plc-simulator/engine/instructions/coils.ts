import type { CoilNode, ContactNode } from '../../domain/ast';
import { isIndexedArea } from '../../domain/types';
import type { ExecContext } from '../context';
import { offsetBitAddress } from './shared';

/**
 * Contact: samples the referenced bit and gates the incoming power flow.
 * A contact on a T/C address reads that instance's status bit, as on real hardware.
 */
export function executeContact(node: ContactNode, ctx: ExecContext, powerIn: boolean): boolean {
  const level = ctx.memory.readBit(node.operand);
  switch (node.variant) {
    case 'NO':
      return powerIn && level;
    case 'NC':
      return powerIn && !level;
    // Edge contacts sample the operand every scan, so the transition is detected even while the
    // rung ahead of them is de-energised; only the conduction result is gated by `powerIn`.
    case 'P':
      return ctx.state.risingEdge(node.id, level) && powerIn;
    case 'N':
      return ctx.state.fallingEdge(node.id, level) && powerIn;
    default: {
      const exhaustive: never = node.variant;
      return exhaustive;
    }
  }
}

/**
 * Coil: consumes power flow and passes it through, so several coils may sit in series on a rung.
 * Inside a de-energised MCR zone, plain outputs are forced off while S/R keep their retained state.
 */
export function executeCoil(node: CoilNode, ctx: ExecContext, powerIn: boolean): boolean {
  switch (node.variant) {
    case 'MASTER':
      if (node.mode === 'begin') ctx.pushMcr(powerIn, node.id);
      else ctx.popMcr(node.id);
      return powerIn;

    case 'OUT':
    case 'INTERNAL':
      ctx.memory.writeBit(node.target, ctx.energised && powerIn);
      return powerIn;

    case 'SET':
    case 'RESET': {
      if (!ctx.energised || !powerIn) return powerIn;
      const value = node.variant === 'SET';
      for (let i = 0; i < node.count; i++) {
        const address = offsetBitAddress(ctx, node.target, i);
        if (!value && isIndexedArea(ctx.memory.resolve(address).area)) {
          // R on a T/C instance clears the current value and the accumulator, not just the bit.
          ctx.memory.write(address, 0);
          ctx.state.resetTimer(address);
        }
        ctx.memory.writeBit(address, value);
      }
      return powerIn;
    }

    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
