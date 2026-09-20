import {
  validateNetworkLayout,
  type Branch,
  type BranchId,
  type LadNode,
  type LayoutIssue,
  type Network,
  type NodeId,
  type NumericType,
} from '../../domain/ast';
import type { ProgramLimits } from '../../domain/hardware';
import { buildNetworkTree, inletCount } from '../../engine/compiler';
import { anchorsToRail, createNode, type PaletteItemId, type PlacementContext } from '../palette/catalog';
import { readSlot, slotsOf, writeSlot } from './operand-slots';
import { planWiring } from './wiring';

/**
 * Pure structural edits of one `Network`. Every function returns a new network or a reason it
 * refused; nothing mutates, so the editor can push results straight onto its undo stack.
 *
 * Rows are global but lanes are per branch, so edits never insert or delete rows — they only claim
 * free cells. That keeps unrelated branches that merely share a row index untouched.
 */

export type EditResult =
  | { readonly ok: true; readonly network: Network; readonly nodeId?: NodeId }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): EditResult => ({ ok: false, reason });

export const MIN_COLS = 8;
export const FIXED_GRID_COLS = 8;

export const createEmptyNetwork = (id: string, cols = FIXED_GRID_COLS): Network => ({
  id,
  grid: { rows: 1, cols },
  nodes: [],
  branches: [],
});

// ---- queries -----------------------------------------------------------------------------------

const covers = (node: LadNode, row: number, col: number): boolean => {
  const l = node.layout;
  return row >= l.row && row < l.row + l.rowSpan && col >= l.col && col < l.col + l.colSpan;
};

export const findNode = (network: Network, nodeId: NodeId): LadNode | undefined =>
  network.nodes.find((node) => node.id === nodeId);

const branchById = (network: Network, id: BranchId): Branch | undefined =>
  network.branches.find((branch) => branch.id === id);

function depth(network: Network, branch: Branch): number {
  let d = 0;
  let cursor: Branch | undefined = branch;
  while (cursor && cursor.parentId !== null && d < 64) {
    cursor = branchById(network, cursor.parentId);
    d += 1;
  }
  return d;
}

/** Innermost branch whose bounds contain the cell; null for the main rung. */
export function resolveBranch(network: Network, row: number, col: number): BranchId | null {
  let best: Branch | null = null;
  let bestDepth = -1;
  for (const branch of network.branches) {
    const inside =
      row >= branch.rowStart && row <= branch.rowEnd && col >= branch.splitCol && col <= branch.mergeCol;
    if (!inside) continue;
    const d = depth(network, branch);
    if (d > bestDepth) {
      best = branch;
      bestDepth = d;
    }
  }
  return best === null ? null : best.id;
}

/** True when nothing occupies `row` across columns `c0..c1`, ignoring the listed branches. */
function rowFree(
  network: Network,
  row: number,
  c0: number,
  c1: number,
  ignore: ReadonlySet<BranchId> = new Set(),
): boolean {
  for (const node of network.nodes) {
    const l = node.layout;
    if (row >= l.row && row < l.row + l.rowSpan && l.col <= c1 && l.col + l.colSpan - 1 >= c0) return false;
    // A multi-pin box owns the wire run to its left on each of its pin rows.
    const pins = inletCount(node);
    if (pins > 1 && row > l.row && row < l.row + pins && c0 < l.col) return false;
  }
  for (const branch of network.branches) {
    if (ignore.has(branch.id)) continue;
    if (row >= branch.rowStart && row <= branch.rowEnd && branch.splitCol <= c1 && branch.mergeCol >= c0) return false;
  }
  return true;
}

function ancestors(network: Network, branchId: BranchId | null): Branch[] {
  const chain: Branch[] = [];
  let cursor = branchId === null ? undefined : branchById(network, branchId);
  while (cursor && chain.length < 64) {
    chain.push(cursor);
    cursor = cursor.parentId === null ? undefined : branchById(network, cursor.parentId);
  }
  return chain;
}

function withGrid(network: Network): Network {
  let rows = 1;
  let cols = Math.max(network.grid.cols, 1);
  for (const node of network.nodes) {
    rows = Math.max(rows, node.layout.row + node.layout.rowSpan);
    cols = Math.max(cols, node.layout.col + node.layout.colSpan);
  }
  for (const branch of network.branches) {
    rows = Math.max(rows, branch.rowEnd + 1);
    cols = Math.max(cols, branch.mergeCol + 1);
  }
  return { ...network, grid: { rows, cols } };
}

const PROBLEMS: Readonly<Record<LayoutIssue['code'], string>> = {
  INVALID_SPAN: 'That placement is not a valid grid cell',
  OUT_OF_GRID: 'Outside the grid',
  CELL_OVERLAP: 'That cell is already occupied',
  UNKNOWN_BRANCH: 'The parallel branch no longer exists',
  OUTSIDE_BRANCH: 'The element does not fit inside the parallel branch',
  BRANCH_OUTSIDE_PARENT: 'The branch does not fit inside its parent branch',
};

// ---- placement ---------------------------------------------------------------------------------

/** Adds a fully-formed node, refusing anything the engine could not reach or that overlaps. */
export function placeNode(network: Network, node: LadNode, limits: ProgramLimits): EditResult {
  if (network.nodes.length >= limits.maxNodesPerNetwork) {
    return fail(`A network holds at most ${limits.maxNodesPerNetwork} elements on this CPU`);
  }
  const l = node.layout;
  const rows = Math.max(network.grid.rows, l.row + l.rowSpan);
  const cols = Math.max(network.grid.cols, l.col + l.colSpan);
  if (rows > limits.maxGridRows || cols > limits.maxGridCols) {
    return fail(`The editor grid is limited to ${limits.maxGridRows} rows x ${limits.maxGridCols} columns`);
  }

  const next: Network = { ...network, grid: { rows, cols }, nodes: [...network.nodes, node] };

  const issue = validateNetworkLayout(next).find((entry) => entry.nodeId === node.id);
  if (issue) return fail(PROBLEMS[issue.code]);

  if (planWiring(next, buildNetworkTree(next)).orphanIds.has(node.id)) {
    return fail(
      l.row === 0
        ? 'The engine cannot reach that cell'
        : 'Only the main rung (row 1) and parallel branches carry power. Add a branch first, or place on a branch lane',
    );
  }
  return { ok: true, network: next, nodeId: node.id };
}

export interface PlaceRequest {
  readonly itemId: PaletteItemId;
  readonly nodeId: NodeId;
  readonly row: number;
  readonly col: number;
}

/**
 * Shifts series nodes rightward on the specified row if there is room before the right-rail coil or branch merge.
 */
export function shiftRowRight(
  network: Network,
  row: number,
  col: number,
  limits: ProgramLimits,
): Network | null {
  const branchId = resolveBranch(network, row, col);
  if (branchId !== null) {
    const branch = network.branches.find((b) => b.id === branchId);
    if (!branch) return null;
    const siblings = network.nodes.filter(
      (n) => n.layout.branchId === branchId && n.layout.row === row && n.layout.col >= col,
    );
    if (siblings.length === 0) return network;
    let prepNetwork = network;
    const rightmost = Math.max(...siblings.map((s) => s.layout.col + s.layout.colSpan - 1));
    if (rightmost + 1 > branch.mergeCol) {
      const ext = extendBranchRight(prepNetwork, branchId, limits);
      if (ext.ok) prepNetwork = ext.network;
      else return null;
    }
    const otherNodes = prepNetwork.nodes.filter(
      (n) => n.layout.row === row && !siblings.some((s) => s.id === n.id),
    );
    const canShift = !siblings.some((s) =>
      otherNodes.some((o) => covers(o, row, s.layout.col + 1)),
    );
    if (!canShift) return null;
    return {
      ...prepNetwork,
      nodes: prepNetwork.nodes.map((n) =>
        siblings.some((s) => s.id === n.id)
          ? { ...n, layout: { ...n.layout, col: n.layout.col + 1 } }
          : n,
      ),
    };
  }

  if (row === 0) {
    const railCoils = network.nodes.filter(
      (n) => n.layout.row === 0 && (n.type === 'coil' || n.layout.col === network.grid.cols - 1),
    );
    const railCol = railCoils.length > 0 ? Math.min(...railCoils.map((n) => n.layout.col)) : network.grid.cols - 1;
    const siblings = network.nodes.filter(
      (n) =>
        n.layout.branchId === null &&
        n.layout.row === 0 &&
        n.layout.col >= col &&
        n.type !== 'coil' &&
        n.layout.col < railCol,
    );
    if (siblings.length === 0) return network;
    const rightmost = Math.max(...siblings.map((s) => s.layout.col + s.layout.colSpan - 1));
    if (rightmost + 1 >= railCol) {
      return null;
    }
    const branchesOnRow = network.branches.filter((b) => b.rowStart === 0);
    const collidesWithBranch = siblings.some((s) =>
      branchesOnRow.some((b) => s.layout.col + 1 >= b.splitCol && s.layout.col + 1 <= b.mergeCol),
    );
    if (collidesWithBranch) return null;

    return {
      ...network,
      nodes: network.nodes.map((n) =>
        siblings.some((s) => s.id === n.id)
          ? { ...n, layout: { ...n.layout, col: n.layout.col + 1 } }
          : n,
      ),
    };
  }

  return null;
}

/** Palette placement: the owning branch is resolved from the cell, then `placeNode` validates. */
export function placeItem(
  network: Network,
  request: PlaceRequest,
  ctx: PlacementContext,
  limits: ProgramLimits,
): EditResult {
  const branchId = resolveBranch(network, request.row, request.col);
  const node = createNode(
    request.itemId,
    request.nodeId,
    { row: request.row, col: request.col, rowSpan: 1, colSpan: 1, branchId },
    ctx,
  );
  let placed = placeNode(network, node, limits);
  if (!placed.ok && !anchorsToRail(request.itemId)) {
    const shifted = shiftRowRight(network, request.row, request.col, limits);
    if (shifted !== null && shifted !== network) {
      placed = placeNode(shifted, node, limits);
    }
  }
  return placed;
}

// ---- removal -----------------------------------------------------------------------------------

/**
 * Drops empty bottom lanes left behind after deletions and dissolves branches that shrink to a
 * single lane. Lanes in the middle of a group are left alone (they cannot be removed without
 * moving other elements) and surface as the compiler's "empty lane" warning.
 */
export function tidy(network: Network): Network {
  let current = network;

  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    const ordered = [...current.branches].sort((a, b) => depth(current, b) - depth(current, a));

    for (const branch of ordered) {
      const live = branchById(current, branch.id);
      if (!live) continue;

      const hasAnyOccupant =
        current.nodes.some((n) => n.layout.branchId === live.id) ||
        current.branches.some((c) => c.parentId === live.id);

      if (!hasAnyOccupant) {
        current = {
          ...current,
          branches: current.branches.filter((b) => b.id !== live.id),
        };
        changed = true;
        break;
      }

      const occupied = (row: number): boolean =>
        current.nodes.some((n) => n.layout.branchId === live.id && covers(n, row, n.layout.col)) ||
        current.branches.some((c) => c.parentId === live.id && row >= c.rowStart && row <= c.rowEnd);

      if (live.rowEnd > live.rowStart && !occupied(live.rowEnd)) {
        current = {
          ...current,
          branches: current.branches.map((b) => (b.id === live.id ? { ...b, rowEnd: live.rowEnd - 1 } : b)),
        };
        changed = true;
        break;
      }

      if (live.rowEnd === live.rowStart) {
        // One lane left: the group is just a series again.
        current = {
          ...current,
          nodes: current.nodes.map((n) => (n.layout.branchId === live.id ? { ...n, layout: { ...n.layout, branchId: live.parentId } } : n)),
          branches: current.branches
            .filter((b) => b.id !== live.id)
            .map((b) => (b.parentId === live.id ? { ...b, parentId: live.parentId } : b)),
        };
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return withGrid({ ...current, grid: { ...current.grid, rows: 1 } });
}

export function removeNodes(network: Network, ids: readonly NodeId[]): Network {
  const drop = new Set(ids);
  return tidy({ ...network, nodes: network.nodes.filter((node) => !drop.has(node.id)) });
}

export function moveNode(
  network: Network,
  nodeId: NodeId,
  row: number,
  col: number,
  limits: ProgramLimits,
): EditResult {
  const node = findNode(network, nodeId);
  if (!node) return fail('That element no longer exists');

  const without: Network = { ...network, nodes: network.nodes.filter((n) => n.id !== nodeId) };
  const branchId = resolveBranch(without, row, col);
  const moved: LadNode = { ...node, layout: { ...node.layout, row, col, branchId } };
  let placed = placeNode(without, moved, limits);
  if (!placed.ok && node.type !== 'coil' && node.type !== 'timer' && node.type !== 'counter') {
    const shifted = shiftRowRight(without, row, col, limits);
    if (shifted !== null && shifted !== without) {
      placed = placeNode(shifted, moved, limits);
    }
  }
  return placed.ok ? { ok: true, network: tidy(placed.network), nodeId } : placed;
}

// ---- parallel branches -------------------------------------------------------------------------

/**
 * Adds a parallel lane beside `nodeId`: a new branch whose top lane holds the element and whose
 * new bottom lane is empty, ready to receive contacts. Nests when the element is already in a lane.
 */
export function addParallelBranch(
  network: Network,
  nodeId: NodeId,
  limits: ProgramLimits,
  branchId: BranchId,
): EditResult {
  const node = findNode(network, nodeId);
  if (!node) return fail('That element no longer exists');
  if (inletCount(node) > 1) return fail('Counters cannot be wired in parallel from the canvas');

  const l = node.layout;
  const lane = l.row + l.rowSpan;
  if (lane >= limits.maxGridRows) return fail(`The editor grid is limited to ${limits.maxGridRows} rows`);

  const owner = l.branchId;
  const chain = ancestors(network, owner);
  const ignore = new Set(chain.map((b) => b.id));

  // Ancestors must reach down to the new lane, which means their whole width must be free there.
  for (const ancestor of chain) {
    if (ancestor.rowEnd >= lane) break;
    if (!rowFree(network, lane, ancestor.splitCol, ancestor.mergeCol, ignore)) {
      return fail('Not enough room below: move or delete the elements beneath first');
    }
  }
  if (!rowFree(network, lane, l.col, l.col + l.colSpan - 1, ignore)) {
    return fail('Not enough room below: move or delete the elements beneath first');
  }

  const created: Branch = {
    id: branchId,
    parentId: owner,
    splitCol: l.col,
    mergeCol: l.col + l.colSpan - 1,
    rowStart: l.row,
    rowEnd: lane,
  };

  const grown = new Set(chain.filter((b) => b.rowEnd < lane).map((b) => b.id));
  const next: Network = withGrid({
    ...network,
    branches: [
      ...network.branches.map((b) => (grown.has(b.id) ? { ...b, rowEnd: lane } : b)),
      created,
    ],
    nodes: network.nodes.map((n) => (n.id === nodeId ? { ...n, layout: { ...n.layout, branchId } } : n)),
  });

  const issue = validateNetworkLayout(next)[0];
  return issue ? fail(PROBLEMS[issue.code]) : { ok: true, network: next };
}

/** Appends one more empty lane to an existing branch (and any ancestor that has to grow with it). */
export function addLane(network: Network, branchId: BranchId, limits: ProgramLimits): EditResult {
  const branch = branchById(network, branchId);
  if (!branch) return fail('That branch no longer exists');

  const lane = branch.rowEnd + 1;
  if (lane >= limits.maxGridRows) return fail(`The editor grid is limited to ${limits.maxGridRows} rows`);

  const chain = ancestors(network, branchId);
  const ignore = new Set(chain.map((b) => b.id));
  for (const ancestor of chain) {
    if (ancestor.rowEnd >= lane) break;
    if (!rowFree(network, lane, ancestor.splitCol, ancestor.mergeCol, ignore)) {
      return fail('Not enough room below: move or delete the elements beneath first');
    }
  }

  const grown = new Set(chain.filter((b) => b.rowEnd < lane).map((b) => b.id));
  return {
    ok: true,
    network: withGrid({
      ...network,
      branches: network.branches.map((b) => (grown.has(b.id) ? { ...b, rowEnd: lane } : b)),
    }),
  };
}

/** Expands a branch's merge drop-wire one column to the right. */
export function extendBranchRight(
  network: Network,
  branchId: BranchId,
  limits: ProgramLimits,
): EditResult {
  const branch = branchById(network, branchId);
  if (!branch) return fail('That branch no longer exists');

  const newMergeCol = branch.mergeCol + 1;
  if (newMergeCol >= limits.maxGridCols) {
    return fail(`The editor grid is limited to ${limits.maxGridCols} columns`);
  }

  // Find the limit on the right rail
  const railNodes = network.nodes.filter((n) => n.layout.row === 0 && (n.type === 'coil' || n.type === 'timer' || n.type === 'counter' || n.layout.col === limits.maxGridCols - 1));
  const rightRailLimit = railNodes.length > 0 ? Math.min(...railNodes.map((n) => n.layout.col)) : limits.maxGridCols;

  if (newMergeCol >= rightRailLimit) {
    return fail('Not enough room before the right rail');
  }

  // Check if any shifted node will hit the rail
  const nodesToShift = network.nodes.filter((n) => n.layout.col >= newMergeCol && !railNodes.includes(n));
  for (const n of nodesToShift) {
    if (n.layout.col + 1 + n.layout.colSpan - 1 >= rightRailLimit) {
      return fail('Not enough room before the right rail');
    }
  }

  const chain = ancestors(network, branchId);
  const parentGrown = new Set(chain.filter((p) => p.mergeCol < newMergeCol).map((p) => p.id));

  const updatedBranches = network.branches.map((b) => {
    if (b.id === branchId || parentGrown.has(b.id)) {
      // Grows right
      return { ...b, mergeCol: Math.max(b.mergeCol, newMergeCol) };
    }
    if (b.splitCol >= newMergeCol) {
      // Shifts right
      return { ...b, splitCol: b.splitCol + 1, mergeCol: b.mergeCol + 1 };
    }
    return b;
  });

  const updatedNodes = network.nodes.map((n) => {
    if (n.layout.col >= newMergeCol && !railNodes.includes(n)) {
      return { ...n, layout: { ...n.layout, col: n.layout.col + 1 } };
    }
    return n;
  });

  const next = withGrid({
    ...network,
    branches: updatedBranches,
    nodes: updatedNodes,
  });

  const issue = validateNetworkLayout(next)[0];
  return issue ? fail(PROBLEMS[issue.code]) : { ok: true, network: next };
}

/** Expands a branch's split drop-wire one column to the left. */
export function extendBranchLeft(
  network: Network,
  branchId: BranchId,
  limits: ProgramLimits,
): EditResult {
  const branch = branchById(network, branchId);
  if (!branch) return fail('That branch no longer exists');

  if (branch.splitCol <= 0) {
    return fail('Cannot extend branch further left');
  }

  const newSplitCol = branch.splitCol - 1;

  const chain = ancestors(network, branchId);
  const parentGrown = new Set(chain.filter((p) => p.splitCol > newSplitCol).map((p) => p.id));

  const updatedBranches = network.branches.map((b) => {
    if (b.id === branchId || parentGrown.has(b.id)) {
      return { ...b, splitCol: Math.min(b.splitCol, newSplitCol) };
    }
    return b;
  });

  const updatedNodes = network.nodes.map((n) => {
    const l = n.layout;
    if (
      l.col === newSplitCol &&
      l.row >= branch.rowStart &&
      l.row <= branch.rowEnd &&
      (l.branchId === branch.parentId || l.branchId === null)
    ) {
      return { ...n, layout: { ...n.layout, branchId } };
    }
    return n;
  });

  const next = withGrid({
    ...network,
    branches: updatedBranches,
    nodes: updatedNodes,
  });

  const issue = validateNetworkLayout(next)[0];
  return issue ? fail(PROBLEMS[issue.code]) : { ok: true, network: next };
}

/** Shrinks a branch's merge drop-wire one column to the left. */
export function shrinkBranchRight(
  network: Network,
  branchId: BranchId,
  _limits: ProgramLimits,
): EditResult {
  const branch = branchById(network, branchId);
  if (!branch) return fail('That branch no longer exists');

  if (branch.mergeCol <= branch.splitCol) {
    return fail('Cannot shrink branch further: minimum width is 1 column');
  }

  const targetCol = branch.mergeCol;
  const newMergeCol = branch.mergeCol - 1;

  const occupying = network.nodes.filter(
    (n) => n.layout.branchId === branchId && n.layout.col + n.layout.colSpan - 1 >= targetCol,
  );

  let updatedNodes = network.nodes;
  if (occupying.length > 0) {
    const canCompact = occupying.every((n) => {
      const leftCol = n.layout.col - 1;
      if (leftCol < branch.splitCol) return false;
      return !network.nodes.some(
        (other) => other.id !== n.id && covers(other, n.layout.row, leftCol),
      );
    });

    if (!canCompact) {
      return fail('Cannot shrink branch right: column has elements');
    }

    updatedNodes = network.nodes.map((n) =>
      occupying.some((occ) => occ.id === n.id)
        ? { ...n, layout: { ...n.layout, col: n.layout.col - 1 } }
        : n,
    );
  }

  const childConflict = network.branches.some(
    (b) => b.parentId === branchId && b.mergeCol >= targetCol && b.mergeCol <= b.splitCol,
  );
  if (childConflict) {
    return fail('Cannot shrink branch right: nested branch occupies this column');
  }

  const updatedBranches = network.branches.map((b) => {
    if (b.id === branchId) {
      return { ...b, mergeCol: newMergeCol };
    }
    if (b.parentId === branchId && b.mergeCol >= targetCol) {
      return { ...b, mergeCol: Math.min(b.mergeCol, newMergeCol) };
    }
    return b;
  });

  const next = withGrid({
    ...network,
    branches: updatedBranches,
    nodes: updatedNodes,
  });

  const issue = validateNetworkLayout(next)[0];
  return issue ? fail(PROBLEMS[issue.code]) : { ok: true, network: next };
}

/** Shrinks a branch's split drop-wire one column to the right. */
export function shrinkBranchLeft(
  network: Network,
  branchId: BranchId,
  _limits: ProgramLimits,
): EditResult {
  const branch = branchById(network, branchId);
  if (!branch) return fail('That branch no longer exists');

  if (branch.splitCol >= branch.mergeCol) {
    return fail('Cannot shrink branch further: minimum width is 1 column');
  }

  const targetCol = branch.splitCol;
  const newSplitCol = branch.splitCol + 1;

  const occupying = network.nodes.filter(
    (n) => n.layout.branchId === branchId && n.layout.col <= targetCol,
  );

  let updatedNodes = network.nodes;
  if (occupying.length > 0) {
    const canCompact = occupying.every((n) => {
      const rightCol = n.layout.col + 1;
      if (rightCol > branch.mergeCol) return false;
      return !network.nodes.some(
        (other) => other.id !== n.id && covers(other, n.layout.row, rightCol),
      );
    });

    if (!canCompact) {
      return fail('Cannot shrink branch left: column has elements');
    }

    updatedNodes = network.nodes.map((n) =>
      occupying.some((occ) => occ.id === n.id)
        ? { ...n, layout: { ...n.layout, col: n.layout.col + 1 } }
        : n,
    );
  }

  const childConflict = network.branches.some(
    (b) => b.parentId === branchId && b.splitCol <= targetCol && b.splitCol >= b.mergeCol,
  );
  if (childConflict) {
    return fail('Cannot shrink branch left: nested branch occupies this column');
  }

  const updatedBranches = network.branches.map((b) => {
    if (b.id === branchId) {
      return { ...b, splitCol: newSplitCol };
    }
    if (b.parentId === branchId && b.splitCol <= targetCol) {
      return { ...b, splitCol: Math.max(b.splitCol, newSplitCol) };
    }
    return b;
  });

  const next = withGrid({
    ...network,
    branches: updatedBranches,
    nodes: updatedNodes,
  });

  const issue = validateNetworkLayout(next)[0];
  return issue ? fail(PROBLEMS[issue.code]) : { ok: true, network: next };
}

// ---- node edits --------------------------------------------------------------------------------

export function updateNode(network: Network, nodeId: NodeId, change: (node: LadNode) => LadNode): Network {
  return { ...network, nodes: network.nodes.map((n) => (n.id === nodeId ? change(n) : n)) };
}

export function setSlot(network: Network, nodeId: NodeId, slot: Parameters<typeof writeSlot>[1], text: string): Network {
  return updateNode(network, nodeId, (node) => writeSlot(node, slot, text));
}

const DEFAULT_ADDRESS: Readonly<Record<NumericType, string>> = {
  BYTE: 'VB0',
  INT: 'VW0',
  DINT: 'VD0',
  REAL: 'VD0',
};

/** Changes the data type of a compare / math box, resetting address operands to the new width. */
export function retype(network: Network, nodeId: NodeId, type: NumericType): Network {
  return updateNode(network, nodeId, (node) => {
    if (node.type !== 'compare' && node.type !== 'math') return node;
    let next: LadNode = { ...node, dataType: type };
    let offset = 0;
    for (const slot of slotsOf(next)) {
      if (slot.key === 'out') {
        next = writeSlot(next, 'out', DEFAULT_ADDRESS[type].replace(/\d+$/, String(offset + 8)));
        continue;
      }
      const text = readSlot(next, slot.key);
      const isConstant = /^[+-]?[\d.]/.test(text);
      if (!isConstant) next = writeSlot(next, slot.key, DEFAULT_ADDRESS[type].replace(/\d+$/, String(offset)));
      offset += type === 'BYTE' ? 1 : type === 'INT' ? 2 : 4;
    }
    return next;
  });
}

export function resizeGrid(network: Network, cols: number, limits: ProgramLimits): EditResult {
  const needed = withGrid({ ...network, grid: { rows: network.grid.rows, cols: 1 } }).grid.cols;
  const next = Math.min(limits.maxGridCols, Math.max(needed, cols, 1));
  return next === network.grid.cols
    ? fail('The grid is already at that width')
    : { ok: true, network: { ...network, grid: { ...network.grid, cols: next } } };
}

/**
 * Ensures the network conforms to the standard fixed 8-column ladder grid,
 * locking the geometry between the Left Power Rail and Right Neutral Rail.
 */
export function padNetwork(network: Network, limits: ProgramLimits): Network {
  const needed = withGrid({ ...network, grid: { rows: network.grid.rows, cols: 1 } }).grid.cols;
  const cols = Math.min(limits.maxGridCols, Math.max(needed, FIXED_GRID_COLS));
  return { ...network, grid: { ...network.grid, cols } };
}

/** Timer / counter instances claimed anywhere in the program, for default-address selection. */
export function usedInstances(networks: readonly Network[]): ReadonlySet<string> {
  const used = new Set<string>();
  for (const network of networks) {
    for (const node of network.nodes) {
      if (node.type === 'timer' || node.type === 'counter') used.add(node.instance.toUpperCase());
    }
  }
  return used;
}

/** Bit addresses claimed anywhere in the program, for default-address selection. */
export function usedAddresses(networks: readonly Network[]): ReadonlySet<string> {
  const used = new Set<string>();
  for (const network of networks) {
    for (const node of network.nodes) {
      if (node.type === 'contact') used.add(node.operand.toUpperCase());
      if (node.type === 'coil' && node.variant !== 'MASTER') used.add(node.target.toUpperCase());
    }
  }
  return used;
}
