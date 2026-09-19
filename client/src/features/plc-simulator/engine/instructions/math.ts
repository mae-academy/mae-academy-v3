import type { MathNode } from '../../domain/ast';
import type { ExecContext } from '../context';
import { readNumeric, toFloat32, writeNumeric } from '../numeric';
import { mirrorBit } from './shared';

/**
 * ADD / SUB / MUL / DIV / SQR / SIN.
 *
 * EN is the rung's power flow: the box computes only while energised. ENO drops on any arithmetic
 * fault (overflow, non-finite REAL, division by zero) so the rest of the rung can react to it.
 * On a division by zero the destination is left untouched, matching the S7-200, and SM1.3 is raised
 * on the runtime status flags.
 */
export function executeMath(node: MathNode, ctx: ExecContext, powerIn: boolean): boolean {
  if (!powerIn || !ctx.energised) return false;

  const integer = node.dataType !== 'REAL';
  const read = (operand: Parameters<typeof readNumeric>[1]): number =>
    readNumeric(ctx.memory, operand, node.dataType);

  const fault = (code: 'DIVIDE_BY_ZERO' | 'ARITHMETIC_OVERFLOW', message: string): false => {
    ctx.flags.overflow = true;
    if (code === 'DIVIDE_BY_ZERO') ctx.flags.divideByZero = true;
    ctx.report(code, code === 'DIVIDE_BY_ZERO' ? 'error' : 'warning', message, {
      nodeId: node.id,
      address: node.out,
    });
    mirrorBit(ctx, node.eno, false);
    return false;
  };

  let result: number;
  switch (node.fn) {
    case 'SQR': {
      const input = read(node.in);
      // Square root of a negative operand is an illegal operation, not a silent NaN.
      if (input < 0) return fault('ARITHMETIC_OVERFLOW', `SQR of a negative operand in ${node.id}`);
      result = Math.sqrt(input);
      break;
    }
    case 'SIN':
      result = Math.sin(read(node.in)); // radians, per the S7 convention
      break;
    case 'ADD':
      result = read(node.in1) + read(node.in2);
      break;
    case 'SUB':
      result = read(node.in1) - read(node.in2);
      break;
    case 'MUL':
      result = read(node.in1) * read(node.in2);
      break;
    case 'DIV': {
      const divisor = read(node.in2);
      if (divisor === 0) {
        return fault('DIVIDE_BY_ZERO', `Division by zero in ${node.id}; destination left unchanged`);
      }
      const quotient = read(node.in1) / divisor;
      // Integer division truncates toward zero; REAL division keeps float32 precision.
      result = integer ? Math.trunc(quotient) : quotient;
      break;
    }
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }

  if (!integer) result = toFloat32(result);
  const written = writeNumeric(ctx.memory, node.out, node.dataType, result);

  ctx.flags.zero = written.stored === 0;
  ctx.flags.negative = written.stored < 0;
  if (written.overflow) {
    ctx.flags.overflow = true;
    ctx.report('ARITHMETIC_OVERFLOW', 'warning', `Result of ${node.id} does not fit ${node.dataType}`, {
      nodeId: node.id,
      address: node.out,
    });
  }

  const eno = !written.overflow;
  mirrorBit(ctx, node.eno, eno);
  return eno;
}
