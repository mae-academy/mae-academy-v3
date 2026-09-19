import { useCallback, useMemo, useReducer } from 'react';
import type { BranchId, Network, NetworkId, NodeId, NumericType } from '../../domain/ast';
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
  retype(networkId: NetworkId, nodeId: NodeId, dataType: NumericType): void;
  addBranch(networkId: NetworkId, nodeId: NodeId): void;
  addLane(networkId: NetworkId, branchId: BranchId): void;
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

/**
 * Editor state for the ladder canvas: network list, selection, undo/redo history and the
 * LAD <-> STL switch. Every operation is a dispatch into the pure reducer, so the action object is
 * referentially stable and can be handed to memoised children without causing re-renders.
 */
export function usePlcEditorState(profile: HardwareProfile, initial: readonly Network[] = []): PlcEditor {
  const reducer = useMemo(() => createEditorReducer(profile), [profile]);
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(initial, profile));

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
      retype: (networkId, nodeId, dataType) => dispatch({ type: 'retype', networkId, nodeId, dataType }),
      addBranch: (networkId, nodeId) => dispatch({ type: 'addBranch', networkId, nodeId }),
      addLane: (networkId, branchId) => dispatch({ type: 'addLane', networkId, branchId }),
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
