import type { WordLogicNode } from '../../domain/ast';
import type { ExecContext } from '../context';
import { LOGIC_MASKS, readRaw } from '../numeric';
import { mirrorBit } from './shared';

/**
 * W-AND / W-OR / W-XOR / W-NOT. Operands are treated as raw bit patterns of the declared width,
 * never as signed numbers, and the result is masked back to that width before it reaches memory.
 */
export function executeWordLogic(node: WordLogicNode, ctx: ExecContext, powerIn: boolean): boolean {
  if (!powerIn || !ctx.energised) return false;

  let result: number;
  switch (node.fn) {
    case 'W_AND':
      result = readRaw(ctx.memory, node.in1, node.width) & readRaw(ctx.memory, node.in2, node.width);
      break;
    case 'W_OR':
      result = readRaw(ctx.memory, node.in1, node.width) | readRaw(ctx.memory, node.in2, node.width);
      break;
    case 'W_XOR':
      result = readRaw(ctx.memory, node.in1, node.width) ^ readRaw(ctx.memory, node.in2, node.width);
      break;
    case 'W_NOT':
      result = ~readRaw(ctx.memory, node.in, node.width);
      break;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }

  result = (result & LOGIC_MASKS[node.width]) >>> 0;
  ctx.memory.write(node.out, result);
  ctx.flags.zero = result === 0;

  mirrorBit(ctx, node.eno, true);
  return true;
}
