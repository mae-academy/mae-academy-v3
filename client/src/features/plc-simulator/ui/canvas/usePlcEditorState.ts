import { useCallback, useEffect, useId, useMemo, useReducer } from 'react';
import type { BranchId, LogicWidth, Network, NetworkId, NodeId, NumericType } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { PaletteItemId } from '../palette/catalog';
import {
  checkPlacement,
  previewPlacement,
  createEditorReducer,
  createInitialState,
  type EditorState,
  type EditorView,
  type Selection,
} from './editor-reducer';
import type { Cell } from './geometry';
import type { PlacementPlan } from './placement-rules';
import type { SlotKey } from './operand-slots';

export interface PlcEditorActions {
  selectCell(networkId: NetworkId, cell: Cell, nodeId?: NodeId | null): void;
  selectNode(networkId: NetworkId, nodeId: NodeId): void;
  clearSelection(): void;
  arm(item: PaletteItemId | null): void;
  /** Canvas placement: outputs snap to the right rail, dropping under an element forks a branch. */
  placeItem(networkId: NetworkId, item: PaletteItemId, row: number, col: number): void;
  /** Replaces the whole program in one undoable step. */
  loadNetworks(networks: readonly Network[]): void;
  moveNode(networkId: NetworkId, nodeId: NodeId, row: number, col: number): void;
  deleteSelection(): void;
  setSlot(networkId: NetworkId, nodeId: NodeId, slot: SlotKey, text: string): void;
  setNodeSymbol(networkId: NetworkId, nodeId: NodeId, symbol: string): void;
  retype(networkId: NetworkId, nodeId: NodeId, dataType: NumericType): void;
  retypeWordLogic(networkId: NetworkId, nodeId: NodeId, width: LogicWidth): void;
  addBranch(networkId: NetworkId, nodeId: NodeId): void;
  addLane(networkId: NetworkId, branchId: BranchId): void;
  extendBranchLeft(networkId: NetworkId, branchId: BranchId): void;
  extendBranchRight(networkId: NetworkId, branchId: BranchId): void;
  shrinkBranchLeft(networkId: NetworkId, branchId: BranchId): void;
  shrinkBranchRight(networkId: NetworkId, branchId: BranchId): void;
  resizeGrid(networkId: NetworkId, cols: number): void;
  addNetwork(afterId?: NetworkId): void;
  deleteNetwork(networkId: NetworkId): void;
  renameNetwork(networkId: NetworkId, title: string): void;
  undo(): void;
  redo(): void;
  /** Switch view. Returns nothing; check `state.view` afterwards (leaving STL can be refused). */
  setView(view: EditorView): void;
  editStl(text: string): void;
  discardStl(): void;
  dismissNotice(): void;
}

export interface PlcEditor {
  readonly state: EditorState;
  readonly networks: readonly Network[];
  readonly selection: Selection;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly actions: PlcEditorActions;
  /** Why the armed / given palette item cannot go at a cell (null = it can). */
  checkCell(networkId: NetworkId, item: PaletteItemId, row: number, col: number): string | null;
  /** Where a drop would land (rail-snapped, branch-forking) and why it might be refused. */
  previewCell(networkId: NetworkId, item: PaletteItemId, row: number, col: number): PlacementPlan;
}

/** Dev-only: every mounted editor, so the console shorthands can pick the one in use. */
const DEBUG_EDITORS = new Map<string, EditorState>();

/**
 * Publishes `__PLC_NETWORKS__` / `__PLC_NETWORK__` for the editor the user is working in — the one
 * holding a selection — so a hidden second workspace can never shadow the visible one.
 */
function publishDebugState(): void {
  if (typeof window === 'undefined') return;
  const entries = Array.from(DEBUG_EDITORS.values());
  const active = entries.find((entry) => entry.selection.networkId !== null) ?? entries[0];
  const debugWindow = window as Window & {
    __PLC_NETWORK__?: Network;
    __PLC_NETWORKS__?: readonly Network[];
    __PLC_EDITORS__?: readonly (readonly Network[])[];
  };
  debugWindow.__PLC_EDITORS__ = entries.map((entry) => entry.present);
  debugWindow.__PLC_NETWORKS__ = active?.present ?? [];
  debugWindow.__PLC_NETWORK__ = active
    ? (active.present.find((n) => n.id === active.selection.networkId) ?? active.present[0])
    : undefined;
}

/**
 * Editor state for the ladder canvas: network list, selection, undo/redo history and the
 * LAD <-> STL switch. Every operation is a dispatch into the pure reducer, so the action object is
 * referentially stable and can be handed to memoised children without causing re-renders.
 */
export function usePlcEditorState(profile: HardwareProfile, initial: readonly Network[] = []): PlcEditor {
  const reducer = useMemo(() => createEditorReducer(profile), [profile]);
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(initial, profile));

  // Dev-only debug hook: dump the selected (else first) network from the DevTools console.
  // Several editors are mounted at once (the S7 workspace and the LOGO!/FBD one), so each
  // registers itself rather than overwriting a single global: whichever editor currently holds a
  // selection is the one the user is working in, and that is the one the shorthands point at.
  const debugId = useId();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    DEBUG_EDITORS.set(debugId, state);
    publishDebugState();
    return () => {
      DEBUG_EDITORS.delete(debugId);
      publishDebugState();
    };
  }, [debugId, state]);

  const actions = useMemo<PlcEditorActions>(
    () => ({
      selectCell: (networkId, cell, nodeId = null) =>
        dispatch({ type: 'select', selection: { networkId, nodeId, cell } }),
      selectNode: (networkId, nodeId) =>
        dispatch({ type: 'select', selection: { networkId, nodeId, cell: null } }),
      clearSelection: () => dispatch({ type: 'select', selection: { networkId: null, nodeId: null, cell: null } }),
      arm: (item) => dispatch({ type: 'arm', item }),
      placeItem: (networkId, itemId, row, col) => dispatch({ type: 'placeSmart', networkId, itemId, row, col }),
      loadNetworks: (loaded) => dispatch({ type: 'loadNetworks', networks: loaded }),
      moveNode: (networkId, nodeId, row, col) => dispatch({ type: 'moveNode', networkId, nodeId, row, col }),
      deleteSelection: () => dispatch({ type: 'deleteSelection' }),
      setSlot: (networkId, nodeId, slot, text) => dispatch({ type: 'setSlot', networkId, nodeId, slot, text }),
      setNodeSymbol: (networkId, nodeId, symbol) => dispatch({ type: 'setNodeSymbol', networkId, nodeId, symbol }),
      retype: (networkId, nodeId, dataType) => dispatch({ type: 'retype', networkId, nodeId, dataType }),
      retypeWordLogic: (networkId, nodeId, width) => dispatch({ type: 'retypeWordLogic', networkId, nodeId, width }),
      addBranch: (networkId, nodeId) => dispatch({ type: 'addBranch', networkId, nodeId }),
      addLane: (networkId, branchId) => dispatch({ type: 'addLane', networkId, branchId }),
      extendBranchLeft: (networkId, branchId) => dispatch({ type: 'extendBranchLeft', networkId, branchId }),
      extendBranchRight: (networkId, branchId) => dispatch({ type: 'extendBranchRight', networkId, branchId }),
      shrinkBranchLeft: (networkId, branchId) => dispatch({ type: 'shrinkBranchLeft', networkId, branchId }),
      shrinkBranchRight: (networkId, branchId) => dispatch({ type: 'shrinkBranchRight', networkId, branchId }),
      resizeGrid: (networkId, cols) => dispatch({ type: 'resizeGrid', networkId, cols }),
      addNetwork: (afterId) => dispatch({ type: 'addNetwork', afterId }),
      deleteNetwork: (networkId) => dispatch({ type: 'deleteNetwork', networkId }),
      renameNetwork: (networkId, title) => dispatch({ type: 'renameNetwork', networkId, title }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      setView: (view) => dispatch({ type: view === 'STL' ? 'enterStl' : 'leaveStl' }),
      editStl: (text) => dispatch({ type: 'stlChange', text }),
      discardStl: () => dispatch({ type: 'discardStl' }),
      dismissNotice: () => dispatch({ type: 'dismissNotice' }),
    }),
    [],
  );

  const checkCell = useCallback(
    (networkId: NetworkId, item: PaletteItemId, row: number, col: number) =>
      checkPlacement(state.present, networkId, item, row, col, profile),
    [state.present, profile],
  );

  const previewCell = useCallback(
    (networkId: NetworkId, item: PaletteItemId, row: number, col: number) =>
      previewPlacement(state.present, networkId, item, row, col, profile),
    [state.present, profile],
  );

  return {
    state,
    networks: state.present,
    selection: state.selection,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    actions,
    checkCell,
    previewCell,
  };
}
