import type { EvalTree } from './engine/compiler';
import type { FlowTrace } from './engine/flow-trace';

/**
 * Depth-first, pre-order index of every node in a program's evaluation trees: leaf inlets, series
 * children and parallel lanes, networks in order. The client compiles the same program into
 * identical trees, so an index identifies the same node on both sides without sending any
 * topology over the wire.
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

export interface WireTrace {
  /** Number of tree nodes; the client refuses a trace whose count differs from its own tree. */
  readonly nodes: number;
  /** Two bits per node, LSB first: bit 2i = power in, bit 2i+1 = power out. Base64. */
  readonly bits: string;
}

export function encodeTrace(roots: readonly EvalTree[], trace: FlowTrace, toBase64: (b: Uint8Array) => string): WireTrace {
  const nodes = forEachTreeNode(roots, () => {});
  const bytes = new Uint8Array(Math.ceil((nodes * 2) / 8));
  forEachTreeNode(roots, (tree, i) => {
    const sample = trace.get(tree);
    if (!sample) return;
    if (sample.in) bytes[(2 * i) >> 3]! |= 1 << ((2 * i) & 7);
    if (sample.out) bytes[(2 * i + 1) >> 3]! |= 1 << ((2 * i + 1) & 7);
  });
  return { nodes, bits: toBase64(bytes) };
}
