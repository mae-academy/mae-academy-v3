import type { BranchId, LogicWidth, Network, NetworkId, NodeId, NumericType } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import { ilToLad, ladToIl, type TranspileDiagnostic } from '../../transpiler';
import type { PaletteItemId } from '../palette/catalog';
import type { Cell } from './geometry';
import {
  addLane,
  addParallelBranch,
  addRung,
  createEmptyNetwork,
  extendBranchLeft,
  extendBranchRight,
  findNode,
  moveNode,
  padNetwork,
  placeItem,
  removeNodes,
  replaceNode,
  resizeGrid,
  retype,
  retypeWordLogic,
  setSlot,
  shrinkBranchLeft,
  shrinkBranchRight,
  usedAddresses,
  usedInstances,
  type EditResult,
} from './network-edit';
import type { SlotKey } from './operand-slots';
import { anchorRailNodes, planPlacement, type PlacementPlan } from './placement-rules';

/**
 * Central editor state. A pure reducer so undo/redo, selection and the LAD <-> STL hand-off are all
 * unit-testable without React; `usePlcEditorState` is only a thin binding around it.
 */

export type EditorView = 'LAD' | 'STL';

export interface Selection {
  readonly networkId: NetworkId | null;
  readonly nodeId: NodeId | null;
  readonly cell: Cell | null;
}

export interface StlState {
  readonly draft: string;
  /** True once the user has typed; an untouched draft never overwrites the ladder. */
  readonly dirty: boolean;
  readonly diagnostics: readonly TranspileDiagnostic[];
}

export interface EditorState {
  readonly present: readonly Network[];
  readonly past: readonly (readonly Network[])[];
  readonly future: readonly (readonly Network[])[];
  readonly selection: Selection;
  /** Palette entry waiting for a cell click, or being dragged. */
  readonly armed: PaletteItemId | null;
  readonly view: EditorView;
  readonly stl: StlState;
  /** Why the last edit was refused; surfaced through an aria-live region. */
  readonly notice: string | null;
  readonly idCounter: number;
}

export type EditorAction =
  | { readonly type: 'select'; readonly selection: Selection }
  | { readonly type: 'arm'; readonly item: PaletteItemId | null }
  | { readonly type: 'placeItem'; readonly networkId: NetworkId; readonly itemId: PaletteItemId; readonly row: number; readonly col: number }
  /** Canvas placement: snaps outputs to the right rail and builds parallel branches on demand. */
  | { readonly type: 'placeSmart'; readonly networkId: NetworkId; readonly itemId: PaletteItemId; readonly row: number; readonly col: number }
  /** Replaces the whole program (file import), as one undoable step. */
  | { readonly type: 'loadNetworks'; readonly networks: readonly Network[] }
  | { readonly type: 'moveNode'; readonly networkId: NetworkId; readonly nodeId: NodeId; readonly row: number; readonly col: number }
  | { readonly type: 'replaceNode'; readonly networkId: NetworkId; readonly nodeId: NodeId; readonly newItemId: PaletteItemId }
  | { readonly type: 'deleteSelection' }
  | { readonly type: 'setSlot'; readonly networkId: NetworkId; readonly nodeId: NodeId; readonly slot: SlotKey; readonly text: string }
  | { readonly type: 'setNodeSymbol'; readonly networkId: NetworkId; readonly nodeId: NodeId; readonly symbol: string }
  | { readonly type: 'retype'; readonly networkId: NetworkId; readonly nodeId: NodeId; readonly dataType: NumericType }
  | { readonly type: 'retypeWordLogic'; readonly networkId: NetworkId; readonly nodeId: NodeId; readonly width: LogicWidth }
  | { readonly type: 'addBranch'; readonly networkId: NetworkId; readonly nodeId: NodeId }
  | { readonly type: 'addLane'; readonly networkId: NetworkId; readonly branchId: BranchId }
  | { readonly type: 'addRung'; readonly networkId: NetworkId }
  | { readonly type: 'extendBranchLeft'; readonly networkId: NetworkId; readonly branchId: BranchId }
  | { readonly type: 'extendBranchRight'; readonly networkId: NetworkId; readonly branchId: BranchId }
  | { readonly type: 'shrinkBranchLeft'; readonly networkId: NetworkId; readonly branchId: BranchId }
  | { readonly type: 'shrinkBranchRight'; readonly networkId: NetworkId; readonly branchId: BranchId }
  | { readonly type: 'resizeGrid'; readonly networkId: NetworkId; readonly cols: number }
  | { readonly type: 'addNetwork'; readonly afterId?: NetworkId }
  | { readonly type: 'deleteNetwork'; readonly networkId: NetworkId }
  | { readonly type: 'renameNetwork'; readonly networkId: NetworkId; readonly title: string }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'enterStl' }
  | { readonly type: 'stlChange'; readonly text: string }
  | { readonly type: 'leaveStl' }
  | { readonly type: 'discardStl' }
  | { readonly type: 'dismissNotice' };

export const HISTORY_LIMIT = 100;
const NO_SELECTION: Selection = { networkId: null, nodeId: null, cell: null };

// ---- construction ------------------------------------------------------------------------------

/** Highest numeric suffix in any id, so freshly minted ids never collide with loaded ones. */
function nextCounter(networks: readonly Network[]): number {
  let highest = 0;
  const scan = (id: string): void => {
    const match = /(\d+)$/.exec(id);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number(match[1]));
  };
  for (const network of networks) {
    scan(network.id);
    network.nodes.forEach((node) => scan(node.id));
    network.branches.forEach((branch) => scan(branch.id));
  }
  return highest + 1;
}

export function createInitialState(initial: readonly Network[], profile: HardwareProfile): EditorState {
  const networks =
    initial.length > 0
      ? initial.map((network) => anchorRailNodes(padNetwork(network, profile.limits)))
      : [createEmptyNetwork('net_1')];
  return {
    present: networks,
    past: [],
    future: [],
    selection: NO_SELECTION,
    armed: null,
    view: 'LAD',
    stl: { draft: '', dirty: false, diagnostics: [] },
    notice: null,
    idCounter: nextCounter(networks),
  };
}

// ---- helpers -----------------------------------------------------------------------------------

function commit(state: EditorState, present: readonly Network[], patch: Partial<EditorState> = {}): EditorState {
  return {
    ...state,
    ...patch,
    present,
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    future: [],
    notice: patch.notice ?? null,
  };
}

const refuse = (state: EditorState, reason: string): EditorState => ({ ...state, notice: reason });

const replaceNetwork = (
  networks: readonly Network[],
  networkId: NetworkId,
  next: Network,
): readonly Network[] => networks.map((network) => (network.id === networkId ? next : network));

function mint(state: EditorState, prefix: string): { id: string; counter: number } {
  const taken = new Set<string>();
  state.present.forEach((n) => {
    taken.add(n.id);
    n.nodes.forEach((node) => taken.add(node.id));
    n.branches.forEach((branch) => taken.add(branch.id));
  });
  let counter = state.idCounter;
  while (taken.has(`${prefix}_${counter}`)) counter += 1;
  return { id: `${prefix}_${counter}`, counter: counter + 1 };
}

/** Applies an edit to one network; pushes history on success, records the refusal otherwise. */
function applyEdit(
  state: EditorState,
  networkId: NetworkId,
  edit: (network: Network) => EditResult,
  counter: number,
  patch: (result: Extract<EditResult, { ok: true }>) => Partial<EditorState> = () => ({}),
): EditorState {
  const network = state.present.find((n) => n.id === networkId);
  if (!network) return state;
  const result = edit(network);
  if (!result.ok) return refuse(state, result.reason);
  return commit(state, replaceNetwork(state.present, networkId, result.network), {
    idCounter: counter,
    ...patch(result),
  });
}

/** Why `itemId` cannot go at the cell, or null when it can. Used for live drop-target feedback. */
export function checkPlacement(
  networks: readonly Network[],
  networkId: NetworkId,
  itemId: PaletteItemId,
  row: number,
  col: number,
  profile: HardwareProfile,
): string | null {
  const network = networks.find((n) => n.id === networkId);
  if (!network) return 'No such network';
  const result = placeItem(
    network,
    { itemId, nodeId: '__preview__', row, col },
    { usedInstances: usedInstances(networks), usedAddresses: usedAddresses(networks) },
    profile.limits,
  );
  return result.ok ? null : result.reason;
}

/** Dry run of a canvas drop: where it lands and why it would be refused. Drives live drop feedback. */
export function previewPlacement(
  networks: readonly Network[],
  networkId: NetworkId,
  itemId: PaletteItemId,
  row: number,
  col: number,
  profile: HardwareProfile,
): PlacementPlan {
  const network = networks.find((n) => n.id === networkId);
  if (!network) return { ok: false, cell: { row, col }, reason: 'No such network' };
  return planPlacement(
    network,
    { itemId, nodeId: '__preview__', row, col },
    { usedInstances: usedInstances(networks), usedAddresses: usedAddresses(networks) },
    profile.limits,
    '__preview_branch__',
  );
}

// ---- reducer -----------------------------------------------------------------------------------

export function createEditorReducer(profile: HardwareProfile) {
  const { limits } = profile;

  return function reduce(state: EditorState, action: EditorAction): EditorState {
    switch (action.type) {
      case 'select':
        return { ...state, selection: action.selection, notice: null };

      case 'arm':
        return { ...state, armed: action.item, notice: null };

      case 'dismissNotice':
        return { ...state, notice: null };

      case 'placeItem': {
        const minted = mint(state, 'node');
        return applyEdit(
          state,
          action.networkId,
          (network) =>
            placeItem(
              network,
              { itemId: action.itemId, nodeId: minted.id, row: action.row, col: action.col },
              { usedInstances: usedInstances(state.present) },
              limits,
            ),
          minted.counter,
          () => ({
            armed: null,
            selection: {
              networkId: action.networkId,
              nodeId: minted.id,
              cell: { row: action.row, col: action.col },
            },
          }),
        );
      }

      case 'placeSmart': {
        const minted = mint(state, 'node');
        const branch = mint({ ...state, idCounter: minted.counter }, 'branch');
        const landed: { cell: Cell | null } = { cell: null };
        return applyEdit(
          state,
          action.networkId,
          (network) => {
            const plan = planPlacement(
              network,
              { itemId: action.itemId, nodeId: minted.id, row: action.row, col: action.col },
              { usedInstances: usedInstances(state.present), usedAddresses: usedAddresses(state.present) },
              limits,
              branch.id,
            );
            if (!plan.ok) return { ok: false, reason: plan.reason };
            landed.cell = plan.cell;
            return { ok: true, network: plan.network, nodeId: plan.nodeId };
          },
          branch.counter,
          () => ({
            armed: null,
            selection: { networkId: action.networkId, nodeId: minted.id, cell: landed.cell ?? { row: action.row, col: action.col } },
          }),
        );
      }

      case 'loadNetworks': {
        const networks =
          action.networks.length > 0
            ? action.networks.map((network) => anchorRailNodes(padNetwork(network, limits)))
            : [createEmptyNetwork('net_1')];
        return commit(state, networks, { selection: NO_SELECTION, armed: null, idCounter: nextCounter(networks) });
      }

      case 'moveNode':
        return applyEdit(
          state,
          action.networkId,
          (network) => {
            const moved = moveNode(network, action.nodeId, action.row, action.col, limits);
            return moved.ok ? { ...moved, network: anchorRailNodes(moved.network) } : moved;
          },
          state.idCounter,
          () => ({
            selection: {
              networkId: action.networkId,
              nodeId: action.nodeId,
              cell: { row: action.row, col: action.col },
            },
          }),
        );

      case 'replaceNode':
        return applyEdit(
          state,
          action.networkId,
          (network) =>
            replaceNode(
              network,
              action.nodeId,
              action.newItemId,
              limits,
              {
                usedInstances: usedInstances(state.present),
                usedAddresses: usedAddresses(state.present),
              },
            ),
          state.idCounter,
          (result) => {
            const placed = result.nodeId ? findNode(result.network, result.nodeId) : undefined;
            return {
              selection: {
                networkId: action.networkId,
                nodeId: result.nodeId ?? null,
                cell: placed ? { row: placed.layout.row, col: placed.layout.col } : null,
              },
            };
          },
        );

      case 'deleteSelection': {
        const { networkId, nodeId } = state.selection;
        if (networkId === null || nodeId === null) return state;
        const network = state.present.find((n) => n.id === networkId);
        if (!network) return state;
        return commit(state, replaceNetwork(state.present, networkId, removeNodes(network, [nodeId])), {
          selection: { networkId, nodeId: null, cell: state.selection.cell },
        });
      }

      case 'setSlot':
        return applyEdit(
          state,
          action.networkId,
          (network) => ({ ok: true, network: setSlot(network, action.nodeId, action.slot, action.text) }),
          state.idCounter,
        );

      case 'setNodeSymbol':
        return applyEdit(
          state,
          action.networkId,
          (network) => ({
            ok: true,
            network: {
              ...network,
              nodes: network.nodes.map((n) =>
                n.id === action.nodeId ? { ...n, symbol: action.symbol } : n,
              ),
            },
          }),
          state.idCounter,
        );

      case 'retype':
        return applyEdit(
          state,
          action.networkId,
          (network) => ({ ok: true, network: retype(network, action.nodeId, action.dataType) }),
          state.idCounter,
        );

      case 'retypeWordLogic':
        return applyEdit(
          state,
          action.networkId,
          (network) => ({ ok: true, network: retypeWordLogic(network, action.nodeId, action.width) }),
          state.idCounter,
        );

      case 'addBranch': {
        const minted = mint(state, 'branch');
        return applyEdit(
          state,
          action.networkId,
          (network) => addParallelBranch(network, action.nodeId, limits, minted.id),
          minted.counter,
        );
      }

      case 'addLane':
        return applyEdit(
          state,
          action.networkId,
          (network) => addLane(network, action.branchId, limits),
          state.idCounter,
        );

      case 'addRung':
        return applyEdit(
          state,
          action.networkId,
          (network) => addRung(network, limits),
          state.idCounter,
          (result) => ({
            selection: {
              networkId: action.networkId,
              nodeId: null,
              cell: { row: result.network.grid.rows - 1, col: 0 },
            },
          }),
        );

      case 'extendBranchLeft':
        return applyEdit(
          state,
          action.networkId,
          (network) => extendBranchLeft(network, action.branchId, limits),
          state.idCounter,
        );

      case 'extendBranchRight':
        return applyEdit(
          state,
          action.networkId,
          (network) => extendBranchRight(network, action.branchId, limits),
          state.idCounter,
        );

      case 'shrinkBranchLeft':
        return applyEdit(
          state,
          action.networkId,
          (network) => shrinkBranchLeft(network, action.branchId, limits),
          state.idCounter,
        );

      case 'shrinkBranchRight':
        return applyEdit(
          state,
          action.networkId,
          (network) => shrinkBranchRight(network, action.branchId, limits),
          state.idCounter,
        );

      case 'resizeGrid':
        return applyEdit(
          state,
          action.networkId,
          (network) => {
            const resized = resizeGrid(network, action.cols, limits);
            // Outputs stay glued to the right rail when the rung gets wider.
            return resized.ok ? { ...resized, network: anchorRailNodes(resized.network) } : resized;
          },
          state.idCounter,
        );

      case 'addNetwork': {
        if (state.present.length >= limits.maxNetworks) {
          return refuse(state, `This CPU holds at most ${limits.maxNetworks} networks`);
        }
        const minted = mint(state, 'net');
        const created = createEmptyNetwork(minted.id, Math.min(limits.maxGridCols, 8));
        const at = action.afterId === undefined ? state.present.length : state.present.findIndex((n) => n.id === action.afterId) + 1;
        const next = [...state.present.slice(0, at), created, ...state.present.slice(at)];
        return commit(state, next, {
          idCounter: minted.counter,
          selection: { networkId: created.id, nodeId: null, cell: { row: 0, col: 0 } },
        });
      }

      case 'deleteNetwork': {
        if (state.present.length <= 1) return refuse(state, 'A program needs at least one network');
        const next = state.present.filter((n) => n.id !== action.networkId);
        return commit(state, next, { selection: NO_SELECTION });
      }

      case 'renameNetwork': {
        const network = state.present.find((n) => n.id === action.networkId);
        if (!network || network.title === action.title) return state;
        const { title: _previous, ...rest } = network;
        const renamed: Network = action.title === '' ? rest : { ...rest, title: action.title };
        return commit(state, replaceNetwork(state.present, action.networkId, renamed));
      }

      case 'undo': {
        const previous = state.past[state.past.length - 1];
        if (previous === undefined) return state;
        return {
          ...state,
          present: previous,
          past: state.past.slice(0, -1),
          future: [state.present, ...state.future],
          selection: NO_SELECTION,
          notice: null,
        };
      }

      case 'redo': {
        const [next, ...rest] = state.future;
        if (next === undefined) return state;
        return {
          ...state,
          present: next,
          past: [...state.past, state.present],
          future: rest,
          selection: NO_SELECTION,
          notice: null,
        };
      }

      // ---- LAD <-> STL --------------------------------------------------------------------

      case 'enterStl': {
        const generated = ladToIl(state.present);
        return {
          ...state,
          view: 'STL',
          armed: null,
          notice: null,
          stl: { draft: generated.value ?? '', dirty: false, diagnostics: generated.diagnostics },
        };
      }

      case 'stlChange': {
        const parsed = ilToLad(action.text, profile);
        return { ...state, notice: null, stl: { draft: action.text, dirty: true, diagnostics: parsed.diagnostics } };
      }

      case 'leaveStl': {
        if (!state.stl.dirty) return { ...state, view: 'LAD', notice: null };
        const parsed = ilToLad(state.stl.draft, profile);
        if (!parsed.ok || parsed.value === null) {
          return {
            ...state,
            stl: { ...state.stl, diagnostics: parsed.diagnostics },
            notice: 'Fix the STL errors, or discard the changes, before returning to ladder',
          };
        }
        const networks =
          parsed.value.length > 0
            ? parsed.value.map((network) => anchorRailNodes(padNetwork(network, limits)))
            : [createEmptyNetwork('net_1')];
        return commit(state, networks, {
          view: 'LAD',
          selection: NO_SELECTION,
          idCounter: nextCounter(networks),
          stl: { draft: '', dirty: false, diagnostics: [] },
        });
      }

      case 'discardStl':
        return { ...state, view: 'LAD', notice: null, stl: { draft: '', dirty: false, diagnostics: [] } };

      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  };
}
