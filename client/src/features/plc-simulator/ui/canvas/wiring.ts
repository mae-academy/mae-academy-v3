import type { Branch, BranchId, LadNode, Network, NodeId } from '../../domain/ast';
import type { EvalTree } from '../../engine/compiler';

/**
 * Pure wire-routing pass: turns a network plus its evaluation tree into the exact set of horizontal
 * segments, vertical rails and junction dots to draw.
 *
 * Every wire is derived from the same tree the scan engine executes, which gives two guarantees the
 * renderer relies on: a wire can only exist where power can actually flow, and each segment knows
 * which tree node's output feeds it, so simulation colouring needs no geometry of its own.
 *
 * Symbols draw their own leads out to their cell edges; this pass only fills the gaps *between*
 * them, so a contact at column `c` bridges boundaries `c` and `c + 1` with no seam.
 */

export type LeafTree = Extract<EvalTree, { kind: 'leaf' }>;
export type ParallelTree = Extract<EvalTree, { kind: 'parallel' }>;

/** Which side of which tree node energises a wire. */
export interface FlowRef {
  readonly tree: EvalTree;
  readonly side: 'in' | 'out';
}

const flowIn = (tree: EvalTree): FlowRef => ({ tree, side: 'in' });
const flowOut = (tree: EvalTree): FlowRef => ({ tree, side: 'out' });

/** Horizontal wire between two column boundaries on one row. */
export interface HSegment {
  readonly key: string;
  readonly row: number;
  readonly from: number;
  readonly to: number;
  readonly flow: FlowRef;
}

/** Vertical rail at a column boundary, from the centre of `fromRow` to the centre of `toRow`. */
export interface VSegment {
  readonly key: string;
  readonly boundary: number;
  readonly fromRow: number;
  readonly toRow: number;
  readonly flow: FlowRef;
}

export interface Junction {
  readonly key: string;
  readonly boundary: number;
  readonly row: number;
  readonly flow: FlowRef;
}

export interface LeafPlacement {
  readonly node: LadNode;
  readonly tree: LeafTree;
  /** Power arriving at each pin, top to bottom; index 0 is the rung itself. */
  readonly pinFlows: readonly FlowRef[];
  /** Left rail energisation: true only while the controller is scanning. */
  readonly rail: FlowRef;
}

export interface WiringPlan {
  readonly rows: number;
  readonly cols: number;
  readonly hSegments: readonly HSegment[];
  readonly vSegments: readonly VSegment[];
  readonly junctions: readonly Junction[];
  readonly leaves: readonly LeafPlacement[];
  /** Nodes the engine cannot reach (wrong row, missing branch); drawn flagged and unwired. */
  readonly orphanIds: ReadonlySet<NodeId>;
  /** Left rail energisation. */
  readonly rail: FlowRef;
}

const isSinkNode = (node: LadNode): boolean => node.type !== 'contact' && node.type !== 'compare';

/** A group whose lanes drive outputs: its lanes run on to the right rail instead of merging. */
function hasSink(tree: EvalTree): boolean {
  switch (tree.kind) {
    case 'leaf':
      return isSinkNode(tree.node);
    case 'series':
      return tree.children.some(hasSink);
    case 'parallel':
      return tree.lanes.some(hasSink);
    default:
      return false;
  }
}

interface PlanState {
  readonly cols: number;
  readonly branches: ReadonlyMap<BranchId, Branch>;
  readonly h: HSegment[];
  readonly v: VSegment[];
  readonly dots: Junction[];
  readonly leaves: LeafPlacement[];
  readonly rail: FlowRef;
  counter: number;
}

export function planWiring(network: Network, root: EvalTree): WiringPlan {
  const state: PlanState = {
    cols: network.grid.cols,
    branches: new Map(network.branches.map((b) => [b.id, b])),
    h: [],
    v: [],
    dots: [],
    leaves: [],
    rail: flowIn(root),
    counter: 0,
  };

  planLane(root, 0, 0, state.cols, flowIn(root), state);

  // Plan continuous base through-wires for any additional top-level rungs (row > 0) that have no nodes/branches
  for (let r = 1; r < network.grid.rows; r++) {
    const hasAnyNode = network.nodes.some(
      (n) => r >= n.layout.row && r < n.layout.row + n.layout.rowSpan,
    );
    const hasAnyBranch = network.branches.some(
      (b) => r >= b.rowStart && r <= b.rowEnd,
    );
    if (!hasAnyNode && !hasAnyBranch) {
      state.h.push({
        key: key(state, 'h'),
        row: r,
        from: 0,
        to: state.cols,
        flow: state.rail,
      });
    }
  }

  const reached = new Set(state.leaves.map((leaf) => leaf.node.id));
  const orphanIds = new Set<NodeId>();
  for (const node of network.nodes) if (!reached.has(node.id)) orphanIds.add(node.id);

  return {
    rows: network.grid.rows,
    cols: state.cols,
    hSegments: state.h,
    vSegments: state.v,
    junctions: state.dots,
    leaves: state.leaves,
    orphanIds,
    rail: flowIn(root),
  };
}

const key = (state: PlanState, kind: string): string => `${kind}${state.counter++}`;

function elementStart(tree: EvalTree, state: PlanState): number {
  if (tree.kind === 'leaf') return tree.node.layout.col;
  if (tree.kind === 'parallel') return state.branches.get(tree.branchId)?.splitCol ?? 0;
  return 0;
}

/**
 * Lays out one lane: its elements in column order, with a horizontal wire across every gap and
 * a final wire from the last element to `endB` (the passthrough that reaches the right rail).
 */
function planLane(
  tree: EvalTree,
  row: number,
  startB: number,
  endB: number,
  inFlow: FlowRef,
  state: PlanState,
): void {
  const elements = tree.kind === 'series' ? tree.children : [tree];
  let cursor = startB;
  let flow = inFlow;

  for (const element of elements) {
    const start = elementStart(element, state);
    if (start > cursor) state.h.push({ key: key(state, 'h'), row, from: cursor, to: start, flow });

    if (element.kind === 'leaf') {
      planLeaf(element, row, startB, state);
      cursor = Math.max(cursor, element.node.layout.col + element.node.layout.colSpan);
      flow = flowOut(element);
    } else if (element.kind === 'parallel') {
      cursor = Math.max(cursor, planParallel(element, state));
      flow = flowOut(element);
    }
  }

  if (cursor < endB) state.h.push({ key: key(state, 'h'), row, from: cursor, to: endB, flow });
}

function planLeaf(tree: LeafTree, row: number, laneStart: number, state: PlanState): void {
  const { node } = tree;
  state.leaves.push({
    node,
    tree,
    pinFlows: [flowIn(tree), ...tree.inlets.map(flowOut)],
    rail: state.rail,
  });
  // Pin chains hang on the rows below the box and run in from the lane's start to its left edge.
  tree.inlets.forEach((inlet, index) => {
    planLane(inlet, row + 1 + index, laneStart, node.layout.col, flowIn(inlet), state);
  });
}

/** Plans a parallel group and returns the boundary where wiring resumes after it. */
function planParallel(tree: ParallelTree, state: PlanState): number {
  const branch = state.branches.get(tree.branchId);
  if (!branch || tree.laneRows.length === 0) return 0;

  const splitB = branch.splitCol;
  const mergeB = branch.mergeCol + 1;
  const outputs = hasSink(tree);
  const laneEnd = outputs ? state.cols : mergeB;
  const firstRow = tree.laneRows[0] ?? branch.rowStart;
  const lastRow = tree.laneRows[tree.laneRows.length - 1] ?? branch.rowEnd;

  const entering = flowIn(tree);
  state.v.push({ key: key(state, 'vs'), boundary: splitB, fromRow: firstRow, toRow: lastRow, flow: entering });
  if (!outputs) {
    state.v.push({ key: key(state, 'vm'), boundary: mergeB, fromRow: firstRow, toRow: lastRow, flow: flowOut(tree) });
  }

  // Every lane row except the last is a T-junction; the last one is a plain corner.
  tree.laneRows.forEach((laneRow, index) => {
    if (index < tree.laneRows.length - 1) {
      state.dots.push({ key: key(state, 'js'), boundary: splitB, row: laneRow, flow: entering });
      if (!outputs) state.dots.push({ key: key(state, 'jm'), boundary: mergeB, row: laneRow, flow: flowOut(tree) });
    }
    const lane = tree.lanes[index];
    if (lane) planLane(lane, laneRow, splitB, laneEnd, entering, state);
  });

  return laneEnd;
}

/** Node whose footprint contains the cell, if any. */
export function nodeAt(network: Network, row: number, col: number): LadNode | undefined {
  return network.nodes.find((node) => {
    const l = node.layout;
    return row >= l.row && row < l.row + l.rowSpan && col >= l.col && col < l.col + l.colSpan;
  });
}
