import type { LadNode } from '../../domain/ast';
import type { ExecContext } from '../context';
import { executeCoil, executeContact } from './coils';
import { executeCompare } from './compare';
import { executeCounter } from './counters';
import { executeMath } from './math';
import { pin, type PinLevels } from './shared';
import { executeTimer } from './timers';
import { executeWordLogic } from './word-logic';

export { advanceAsyncTimers } from './timers';
export type { PinLevels } from './shared';

/**
 * Single dispatch point for the evaluator.
 * Every instruction consumes the power flow arriving on its pins and returns its outgoing flow
 * (ENO for boxes, pass-through for coils), so elements can be cascaded in series on one rung.
 */
export function executeNode(node: LadNode, ctx: ExecContext, pins: PinLevels): boolean {
  const powerIn = pin(pins, 0);
  switch (node.type) {
    case 'contact':
      return executeContact(node, ctx, powerIn);
    case 'coil':
      return executeCoil(node, ctx, powerIn);
    case 'timer':
      return executeTimer(node, ctx, powerIn);
    case 'counter':
      return executeCounter(node, ctx, pins);
    case 'compare':
      return executeCompare(node, ctx, powerIn);
    case 'math':
      return executeMath(node, ctx, powerIn);
    case 'wordLogic':
      return executeWordLogic(node, ctx, powerIn);
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
