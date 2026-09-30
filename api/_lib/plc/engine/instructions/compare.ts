import type { CompareNode } from '../../domain/ast';
import type { ExecContext } from '../context';
import { readNumeric } from '../numeric';

/**
 * Comparison contact. Both operands are read with the box's declared type, so an INT compare
 * sign-extends while a BYTE compare stays unsigned. Power flows on when the relation holds.
 */
export function executeCompare(node: CompareNode, ctx: ExecContext, powerIn: boolean): boolean {
  if (!powerIn) return false;

  const lhs = readNumeric(ctx.memory, node.lhs, node.dataType);
  const rhs = readNumeric(ctx.memory, node.rhs, node.dataType);

  switch (node.op) {
    case '==':
      return lhs === rhs;
    case '<>':
      return lhs !== rhs;
    case '>':
      return lhs > rhs;
    case '<':
      return lhs < rhs;
    case '>=':
      return lhs >= rhs;
    case '<=':
      return lhs <= rhs;
    default: {
      const exhaustive: never = node.op;
      return exhaustive;
    }
  }
}
