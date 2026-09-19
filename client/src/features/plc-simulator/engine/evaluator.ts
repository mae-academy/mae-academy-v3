import { PlcAccessError, PlcAddressError } from '../domain/memory';
import type { CompiledNetwork, EvalTree } from './compiler';
import type { ExecContext } from './context';
import { executeNode, type PinLevels } from './instructions';

/**
 * Power-flow solver.
 *
 * Two rules keep the boolean accumulation faithful to a real rung, and neither may be replaced by
 * short-circuit evaluation:
 *  - A series chain feeds every element even after the flow has collapsed, because a de-energised
 *    coil still has to be written low.
 *  - Every lane of a parallel group is evaluated even once one of them conducts, because lanes may
 *    contain their own coils and boxes.
 */
export function evaluateNetwork(network: CompiledNetwork, ctx: ExecContext): boolean {
  ctx.networkId = network.id;
  // A rung is always fed by the left power rail.
  return evaluate(network.root, ctx, true);
}

function evaluate(tree: EvalTree, ctx: ExecContext, powerIn: boolean): boolean {
  const powerOut = solve(tree, ctx, powerIn);
  ctx.trace?.record(tree, powerIn, powerOut);
  return powerOut;
}

function solve(tree: EvalTree, ctx: ExecContext, powerIn: boolean): boolean {
  switch (tree.kind) {
    case 'leaf':
      return executeLeaf(tree, ctx, powerIn);

    case 'series': {
      let flow = powerIn;
      for (const child of tree.children) flow = evaluate(child, ctx, flow);
      return flow;
    }

    case 'parallel': {
      let merged = false;
      for (const lane of tree.lanes) {
        if (evaluate(lane, ctx, powerIn)) merged = true;
      }
      return merged;
    }

    default: {
      const exhaustive: never = tree;
      return exhaustive;
    }
  }
}

/**
 * Reused single-pin buffer. Safe because an instruction with no extra inlets cannot re-enter the
 * evaluator, so the buffer is read before anything else can overwrite it; it keeps the hot path
 * allocation-free at scan rates of 50 Hz and above.
 */
const singlePin: boolean[] = [false];

function executeLeaf(
  tree: Extract<EvalTree, { kind: 'leaf' }>,
  ctx: ExecContext,
  powerIn: boolean,
): boolean {
  let pins: PinLevels;
  if (tree.inlets.length === 0) {
    singlePin[0] = powerIn;
    pins = singlePin;
  } else {
    // Each secondary pin is fed by its own chain, which starts at the left power rail.
    const levels: boolean[] = [powerIn];
    for (const inlet of tree.inlets) levels.push(evaluate(inlet, ctx, true));
    pins = levels;
  }

  try {
    return executeNode(tree.node, ctx, pins);
  } catch (error) {
    // A single malformed instruction must not abort the scan; report it and treat it as dead.
    const fault = error instanceof PlcAddressError || error instanceof PlcAccessError;
    ctx.report(
      fault ? 'INVALID_OPERAND' : 'UNSUPPORTED_NODE',
      'error',
      `${tree.node.id}: ${error instanceof Error ? error.message : String(error)}`,
      { nodeId: tree.node.id },
    );
    return false;
  }
}
