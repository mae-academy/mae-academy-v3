import { validateNetworkLayout, type BranchId, type LadNode, type Network, type NodeId } from '../../domain/ast';
import type { ProgramLimits } from '../../domain/hardware';
import { inletCount } from '../../engine/compiler';
import type { PaletteItemId, PlacementContext } from '../palette/catalog';
import type { Cell } from './geometry';
import { addLane, addParallelBranch, placeItem, resolveBranch, type EditResult, type PlaceRequest } from './network-edit';

/**
 * Canvas placement policy layered over the pure `network-edit` primitives: output elements are
 * anchored to the right power rail, and dropping under an element builds the parallel branch (or
 * extends an existing one) instead of refusing. `network-edit` itself stays policy-free.
 */

const RAIL_ITEMS: ReadonlySet<PaletteItemId> = new Set<PaletteItemId>([
  'coil-out',
  'coil-set',
  'coil-reset',
  'timer-ton',
  'timer-tof',
  'timer-tonr',
  'counter-ctu',
  'counter-ctd',
  'counter-ctud',
]);

/** Coils, timers and counters terminate the rung, so they only ever live on the right rail. */
export const anchorsToRail = (item: PaletteItemId): boolean => RAIL_ITEMS.has(item);

const isRailNode = (node: LadNode): boolean => node.type === 'coil' || node.type === 'timer' || node.type === 'counter';

/** The cell a drop at `cell` really resolves to: rail items ignore the column and take the last one. */
export const snapToRail = (item: PaletteItemId, cell: Cell, cols: number): Cell =>
  anchorsToRail(item) ? { row: cell.row, col: Math.max(0, cols - 1) } : cell;

// ---- keeping existing outputs on the rail --------------------------------------------------------

/**
 * Moves every coil / timer / counter to the last column, carrying along the branches that end on
 * them. Returns the network untouched if the shifted layout would be invalid, so this can never
 * corrupt a program.
 */
export function anchorRailNodes(network: Network): Network {
  const last = network.grid.cols - 1;
  const rightEdge = (node: LadNode): number => node.layout.col + node.layout.colSpan - 1;
  if (!network.nodes.some((node) => isRailNode(node) && rightEdge(node) !== last)) return network;

  const branchById = new Map(network.branches.map((branch) => [branch.id, branch]));
  const mergeCol = new Map<BranchId, number>();
  const splitCol = new Map<BranchId, number>();

  const nodes = network.nodes.map((node) => {
    if (!isRailNode(node)) return node;
    const shift = last - rightEdge(node);
    if (shift === 0) return node;

    for (let id = node.layout.branchId, guard = 0; id !== null && guard < 64; guard++) {
      const branch = branchById.get(id);
      if (!branch) break;
      if (branch.mergeCol === rightEdge(node)) mergeCol.set(branch.id, last);
      if (branch.splitCol === node.layout.col) splitCol.set(branch.id, node.layout.col + shift);
      id = branch.parentId;
    }
    return { ...node, layout: { ...node.layout, col: node.layout.col + shift } };
  });

  const branches = network.branches.map((branch) => ({
    ...branch,
    splitCol: splitCol.get(branch.id) ?? branch.splitCol,
    mergeCol: mergeCol.get(branch.id) ?? branch.mergeCol,
  }));

  const next: Network = { ...network, nodes, branches };
  return validateNetworkLayout(next).length === 0 ? next : network;
}

// ---- planning a drop -----------------------------------------------------------------------------

export type PlacementKind = 'direct' | 'parallel' | 'lane';

export type PlacementPlan =
  | {
      readonly ok: true;
      readonly network: Network;
      readonly nodeId: NodeId;
      /** The snapped cell the element ends up in. */
      readonly cell: Cell;
      readonly kind: PlacementKind;
      /** Element (kind `parallel`) or branch (kind `lane`) the new lane hangs off. */
      readonly anchorId?: NodeId;
      readonly branchId?: BranchId;
    }
  | { readonly ok: false; readonly cell: Cell; readonly reason: string };

const covers = (node: LadNode, row: number, col: number): boolean => {
  const l = node.layout;
  return row >= l.row && row < l.row + l.rowSpan && col >= l.col && col < l.col + l.colSpan;
};

const finish = (
  result: EditResult,
  cell: Cell,
  kind: PlacementKind,
  extra: { anchorId?: NodeId; branchId?: BranchId },
): PlacementPlan => {
  if (result.ok && result.nodeId !== undefined) {
    return { ok: true, network: result.network, nodeId: result.nodeId, cell, kind, ...extra };
  }
  const reason = result.ok ? 'Nothing was placed' : result.reason;
  return { ok: false, cell, reason };
};

/**
 * Resolves where a palette entry dropped on `(row, col)` actually goes and produces the edited
 * network: snapped to the rail if it is an output, built in place if the cell is free, otherwise
 * hung beneath the element above as a new parallel lane.
 */
export function planPlacement(
  network: Network,
  request: PlaceRequest,
  ctx: PlacementContext,
  limits: ProgramLimits,
  branchId: BranchId,
): PlacementPlan {
  const cell = snapToRail(request.itemId, { row: request.row, col: request.col }, network.grid.cols);
  const snapped: PlaceRequest = { ...request, row: cell.row, col: cell.col };

  const direct = placeItem(network, snapped, ctx, limits);
  if (direct.ok) return finish(direct, cell, 'direct', {});
  if (cell.row === 0) return { ok: false, cell, reason: direct.reason };

  // Below the main rung a cell only carries power inside a branch, so grow one under what is above.
  const branch = resolveBranch(network, cell.row - 1, cell.col);
  const branchOf = branch === null ? undefined : network.branches.find((entry) => entry.id === branch);
  if (branchOf !== undefined && branchOf.rowEnd === cell.row - 1) {
    const grown = addLane(network, branchOf.id, limits);
    if (!grown.ok) return { ok: false, cell, reason: grown.reason };
    return finish(placeItem(grown.network, snapped, ctx, limits), cell, 'lane', { branchId: branchOf.id });
  }

  const above = network.nodes.find((node) => covers(node, cell.row - 1, cell.col));
  if (above !== undefined && above.layout.row + above.layout.rowSpan === cell.row && inletCount(above) <= 1) {
    const forked = addParallelBranch(network, above.id, limits, branchId);
    if (!forked.ok) return { ok: false, cell, reason: forked.reason };
    return finish(placeItem(forked.network, snapped, ctx, limits), cell, 'parallel', { anchorId: above.id });
  }

  return { ok: false, cell, reason: direct.reason };
}
