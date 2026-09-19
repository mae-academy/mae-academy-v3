import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import type { Network, NetworkId, NodeId } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import { buildNetworkTree, type EvalTree } from '../../engine/compiler';
import type { SymbolMap } from '../../transpiler';
import type { PaletteItemId } from '../palette/catalog';
import { describeNode } from './components/symbols/NodeView';
import { LadderEnvContext, type EditingTarget, type LadderEnv } from './env';
import type { Cell } from './geometry';
import { LadderRung } from './LadderRung';
import { findNode } from './network-edit';
import { validateSlot, slotsOf } from './operand-slots';
import { useProgramVersion, useSimulation } from './simulation';
import type { PlcEditor } from './usePlcEditorState';
import { nodeAt } from './wiring';

export interface LadderCanvasProps {
  editor: PlcEditor;
  profile: HardwareProfile;
  symbols?: SymbolMap;
  /** Force a read-only view. A simulation being attached implies read-only. */
  readOnly?: boolean;
  className?: string;
}

const NO_SYMBOLS: SymbolMap = {};

/** Trees are immutable per network object, so an edit only rebuilds the network it touched. */
const treeCache = new WeakMap<Network, EvalTree>();
function treeOf(network: Network): EvalTree {
  let tree = treeCache.get(network);
  if (!tree) {
    tree = buildNetworkTree(network);
    treeCache.set(network, tree);
  }
  return tree;
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * The interactive canvas: a stack of ladder rungs plus every pointer / keyboard handler. All SVG
 * drawing is delegated to `LadderRung` and the symbol components; this file only turns user input
 * into editor actions, so the two concerns never share code.
 */
export function LadderCanvas({ editor, profile, symbols = NO_SYMBOLS, readOnly = false, className = '' }: LadderCanvasProps) {
  const { state, networks, actions, selection } = editor;
  const sim = useSimulation();
  const programVersion = useProgramVersion();
  const interactive = !readOnly && sim === null;
  const [editing, setEditing] = useState<EditingTarget | null>(null);

  // In a simulation the runtime's own trees are used so wire colours can be looked up by identity;
  // if the loaded program is not this exact network, fall back to a local tree (drawn unpowered).
  const trees = useMemo(
    () => networks.map((network) => sim?.treeFor(network) ?? treeOf(network)),
    // programVersion invalidates the runtime's trees after a program download
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [networks, sim, programVersion],
  );

  const locate = useCallback(
    (nodeId: NodeId): { network: Network; nodeId: NodeId } | null => {
      for (const network of networks) if (findNode(network, nodeId)) return { network, nodeId };
      return null;
    },
    [networks],
  );

  const env = useMemo<LadderEnv>(
    () => ({
      profile,
      symbols,
      interactive,
      editing,
      beginEdit(nodeId, slot) {
        const found = locate(nodeId);
        if (!found) return;
        setEditing({ networkId: found.network.id, nodeId, slot });
      },
      commitEdit(nodeId, slot, text) {
        const found = locate(nodeId);
        setEditing(null);
        if (found) actions.setSlot(found.network.id, nodeId, slot, text);
      },
      cancelEdit: () => setEditing(null),
      validate(nodeId, slot, text) {
        const found = locate(nodeId);
        const node = found ? findNode(found.network, nodeId) : undefined;
        return node ? validateSlot(node, slot, text, profile) : 'That element no longer exists';
      },
    }),
    [profile, symbols, interactive, editing, locate, actions],
  );

  const onSelectCell = useCallback(
    (networkId: NetworkId, cell: Cell) => {
      const network = networks.find((n) => n.id === networkId);
      const node = network ? nodeAt(network, cell.row, cell.col) : undefined;
      actions.selectCell(networkId, cell, node?.id ?? null);
    },
    [networks, actions],
  );

  const onSelectNode = useCallback(
    (networkId: NetworkId, nodeId: NodeId) => {
      const node = networks.find((n) => n.id === networkId)?.nodes.find((n) => n.id === nodeId);
      if (node) actions.selectCell(networkId, { row: node.layout.row, col: node.layout.col }, nodeId);
    },
    [networks, actions],
  );

  const onPlace = useCallback(
    (networkId: NetworkId, item: PaletteItemId, row: number, col: number) => actions.placeItem(networkId, item, row, col),
    [actions],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!interactive || event.target instanceof HTMLInputElement) return;

    const network = networks.find((n) => n.id === selection.networkId) ?? networks[0];
    if (!network) return;
    const cell = selection.cell ?? { row: 0, col: 0 };

    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const row = Math.max(0, Math.min(network.grid.rows - 1, cell.row + arrow[0]));
      const col = Math.max(0, Math.min(network.grid.cols - 1, cell.col + arrow[1]));
      if (event.altKey && selection.nodeId !== null) actions.moveNode(network.id, selection.nodeId, row, col);
      else onSelectCell(network.id, { row, col });
      return;
    }

    switch (event.key) {
      case 'Enter': {
        if (state.armed !== null) {
          event.preventDefault();
          actions.placeItem(network.id, state.armed, cell.row, cell.col);
        } else if (selection.nodeId !== null) {
          const node = findNode(network, selection.nodeId);
          const first = node ? slotsOf(node)[0] : undefined;
          if (first) {
            event.preventDefault();
            env.beginEdit(selection.nodeId, first.key);
          }
        }
        break;
      }
      case 'Delete':
      case 'Backspace':
        if (selection.nodeId !== null) {
          event.preventDefault();
          actions.deleteSelection();
        }
        break;
      case 'Escape':
        if (state.armed !== null) actions.arm(null);
        else actions.clearSelection();
        break;
      default:
    }
  };

  const selectedNode =
    selection.networkId !== null && selection.nodeId !== null
      ? networks.find((n) => n.id === selection.networkId)?.nodes.find((n) => n.id === selection.nodeId)
      : undefined;
  const announcement =
    state.notice ??
    (selectedNode
      ? `Selected ${describeNode(selectedNode)}`
      : selection.cell
        ? `Cell row ${selection.cell.row + 1}, column ${selection.cell.col + 1}, empty`
        : '');

  return (
    <LadderEnvContext.Provider value={env}>
      <div
        role="application"
        aria-roledescription="ladder logic editor"
        aria-label="Ladder logic editor. Arrow keys move between cells, Enter places the armed instruction or edits the selected one, Delete removes it."
        tabIndex={interactive ? 0 : -1}
        onKeyDown={onKeyDown}
        className={`relative flex flex-col gap-4 overflow-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${className}`}
        data-armed={state.armed ?? undefined}
      >
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {state.notice !== null && (
          <div
            role="alert"
            className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-200"
          >
            <span>{state.notice}</span>
            <button type="button" onClick={actions.dismissNotice} className="font-semibold underline">
              Dismiss
            </button>
          </div>
        )}

        {networks.map((network, index) => {
          const tree = trees[index];
          if (!tree) return null;
          return (
            <section key={network.id} aria-label={`Network ${index + 1}`} className="min-w-max">
              <header className="mb-1 flex items-center gap-2 px-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold tabular-nums">Network {index + 1}</span>
                <input
                  key={`${network.id}:${network.title ?? ''}`}
                  defaultValue={network.title ?? ''}
                  disabled={!interactive}
                  placeholder="Title"
                  aria-label={`Network ${index + 1} title`}
                  onBlur={(event) => actions.renameNetwork(network.id, event.target.value.trim())}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  className="h-6 w-56 rounded border border-transparent bg-transparent px-1.5 hover:border-slate-300 focus:border-sky-500 focus:outline-none dark:hover:border-slate-600"
                />
                {interactive && (
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Add a column to network ${index + 1}`}
                      disabled={network.grid.cols >= profile.limits.maxGridCols}
                      onClick={() => actions.resizeGrid(network.id, network.grid.cols + 1)}
                      className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-700"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" /> col
                    </button>
                    <button
                      type="button"
                      aria-label={`Add a network below network ${index + 1}`}
                      onClick={() => actions.addNetwork(network.id)}
                      className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" /> network
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete network ${index + 1}`}
                      disabled={networks.length <= 1}
                      onClick={() => actions.deleteNetwork(network.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-red-100 disabled:opacity-40 dark:hover:bg-red-950/60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                )}
              </header>
              <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                <LadderRung
                  network={network}
                  index={index}
                  tree={tree}
                  selectedNodeId={selection.networkId === network.id ? selection.nodeId : null}
                  selectedCell={selection.networkId === network.id ? selection.cell : null}
                  armed={interactive ? state.armed : null}
                  interactive={interactive}
                  previewCell={editor.previewCell}
                  onAddBranch={actions.addBranch}
                  onAddLane={actions.addLane}
                  onSelectCell={onSelectCell}
                  onSelectNode={onSelectNode}
                  onPlace={onPlace}
                />
              </div>
            </section>
          );
        })}
      </div>
    </LadderEnvContext.Provider>
  );
}
