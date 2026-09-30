import type { EvalTree } from '../engine/compiler';
import type { FlowTrace } from '../engine/flow-trace';

/**
 * Must enumerate nodes in exactly the order the server does (api/_lib/plc/trace.ts): pre-order,
 * leaf inlets, series children, parallel lanes, networks in order.
 */
export function forEachTreeNode(roots: readonly EvalTree[], visit: (tree: EvalTree, index: number) => void): number {
  let index = 0;
  const walk = (tree: EvalTree): void => {
    visit(tree, index++);
    if (tree.kind === 'leaf') tree.inlets.forEach(walk);
    else if (tree.kind === 'series') tree.children.forEach(walk);
    else tree.lanes.forEach(walk);
  };
  roots.forEach(walk);
  return index;
}

/** Loads a server power-flow trace into the local trace. Returns false if the trees do not line up. */
export function applyWireTrace(
  trace: FlowTrace,
  roots: readonly EvalTree[],
  wire: { nodes: number; bits: string },
  fromBase64: (text: string) => Uint8Array,
): boolean {
  if (forEachTreeNode(roots, () => {}) !== wire.nodes) return false;
  const bytes = fromBase64(wire.bits);
  forEachTreeNode(roots, (tree, i) => {
    const a = 2 * i;
    const b = a + 1;
    trace.record(tree, ((bytes[a >> 3] ?? 0) & (1 << (a & 7))) !== 0, ((bytes[b >> 3] ?? 0) & (1 << (b & 7))) !== 0);
  });
  return true;
}
