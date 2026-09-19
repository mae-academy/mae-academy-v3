import type { WordLogicNode } from '../../domain/ast';
import type { ExecContext } from '../context';
import { LOGIC_MASKS, readRaw } from '../numeric';
import { mirrorBit } from './shared';

/**
 * W-AND / W-OR / W-XOR. Operands are treated as raw bit patterns of the declared width, never as
 * signed numbers, and the result is masked back to that width before it reaches memory.
 */
export function executeWordLogic(node: WordLogicNode, ctx: ExecContext, powerIn: boolean): boolean {
  if (!powerIn || !ctx.energised) return false;

  const a = readRaw(ctx.memory, node.in1, node.width);
  const b = readRaw(ctx.memory, node.in2, node.width);

  let result: number;
  switch (node.fn) {
    case 'W_AND':
      result = a & b;
      break;
    case 'W_OR':
      result = a | b;
      break;
    case 'W_XOR':
      result = a ^ b;
      break;
    default: {
      const exhaustive: never = node.fn;
      return exhaustive;
    }
  }

  result = (result & LOGIC_MASKS[node.width]) >>> 0;
  ctx.memory.write(node.out, result);
  ctx.flags.zero = result === 0;

  mirrorBit(ctx, node.eno, true);
  return true;
}
