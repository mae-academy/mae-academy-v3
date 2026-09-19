import { Redo2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CANVAS_DOTS_STYLE, CANVAS_SURFACE, ICON_PILL_BUTTON, PANEL, WindowBar } from '../chrome';
import type { Network } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { SymbolMap } from '../../transpiler';
import { getPaletteItem, type PaletteItemId } from '../palette/catalog';
import { Toolbox } from '../palette/Toolbox';
import type { EditorView } from './editor-reducer';
import { LadderCanvas } from './LadderCanvas';
import { NodeInspector } from './NodeInspector';
import { SimulationProvider, type SimulationStore } from './simulation';
import { StlEditor } from './StlEditor';
import { usePlcEditorState, type PlcEditor as PlcEditorHandle } from './usePlcEditorState';

export interface PlcEditorProps {
  profile: HardwareProfile;
  initialNetworks?: readonly Network[];
  symbols?: SymbolMap;
  /** Attach a running controller to colour wires and show live values; the canvas turns read-only. */
  simulation?: SimulationStore | null;
  /** Called with the ladder after every committed edit. */
  onNetworksChange?: (networks: readonly Network[]) => void;
  className?: string;
}

const VIEW_OPTIONS = [
  { label: 'LAD', value: 'LAD' },
  { label: 'STL / IL', value: 'STL' },
] as const satisfies readonly { label: string; value: EditorView }[];

const isTextField = (target: EventTarget): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

/**
 * Palette + ladder canvas + STL editor, wired to one editor state. Also the place where the two
 * placement gestures meet: an entry is dropped where it is dragged, placed in the selected cell
 * when one is chosen, and otherwise armed for the next cell click.
 */
export function PlcEditor({
  profile,
  initialNetworks,
  symbols,
  simulation = null,
  onNetworksChange,
  className = '',
}: PlcEditorProps) {
  const editor = usePlcEditorState(profile, initialNetworks);

  const notify = useRef(onNetworksChange);
  notify.current = onNetworksChange;
  useEffect(() => {
    notify.current?.(editor.state.present);
  }, [editor.state.present]);

  return <PlcEditorView editor={editor} profile={profile} symbols={symbols} simulation={simulation} className={className} />;
}

export interface PlcEditorViewProps {
  /** Editor state owned by the caller, so a host can read and drive it. */
  editor: PlcEditorHandle;
  profile: HardwareProfile;
  symbols?: SymbolMap;
  simulation?: SimulationStore | null;
  /** Hardware rack (or any panel) shown above the node inspector in the right column. */
  rightPanel?: ReactNode;
  className?: string;
}

/** The editor UI over externally-owned state. `PlcEditor` is this plus its own state. */
export function PlcEditorView({ editor, profile, symbols, simulation = null, rightPanel, className = '' }: PlcEditorViewProps) {
  const { state, actions, selection, canUndo, canRedo } = editor;
  const simulating = simulation !== null;
  const draggedFromPalette = useRef(false);

  const onActivate = useCallback(
    (item: PaletteItemId) => {
      const cell = selection.cell;
      // A selected empty cell means "put it here"; otherwise arm and wait for the next click.
      if (selection.networkId !== null && cell !== null && selection.nodeId === null) {
        actions.placeItem(selection.networkId, item, cell.row, cell.col);
      } else {
        actions.arm(state.armed === item ? null : item);
      }
    },
    [actions, selection, state.armed],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isTextField(event.target) || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) actions.redo();
      else actions.undo();
    } else if (key === 'y') {
      event.preventDefault();
      actions.redo();
    }
  };

  const armedLabel = state.armed === null ? null : getPaletteItem(state.armed).description;
  const hasRight = rightPanel !== undefined || !simulating;

  return (
    <SimulationProvider store={simulation}>
      <div
        onKeyDown={onKeyDown}
        className={`grid min-h-0 gap-2.5 lg:grid-cols-[14rem_minmax(0,1fr)] ${hasRight ? 'xl:grid-cols-[14rem_minmax(0,1fr)_21rem]' : ''} ${className}`}
      >
        <Toolbox
          armed={state.armed}
          disabled={simulating || state.view === 'STL'}
          onActivate={onActivate}
          onDragStart={(item) => {
            draggedFromPalette.current = true;
            actions.arm(item);
          }}
          onDragEnd={() => {
            if (draggedFromPalette.current) actions.arm(null);
            draggedFromPalette.current = false;
          }}
          className="max-h-[70vh] lg:max-h-none"
        />

        <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
          <div className={`${PANEL} shrink-0 !flex-row flex-wrap items-center gap-2 px-2 py-1.5`}>
            <SegmentedControl<EditorView>
              aria-label="Program view"
              size="sm"
              value={state.view}
              options={VIEW_OPTIONS.map((option) => ({ ...option }))}
              onChange={(view) => actions.setView(view)}
              disabled={simulating}
              className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
            />
            <button type="button" onClick={actions.undo} disabled={!canUndo || simulating} aria-label="Undo" title="Undo (Ctrl+Z)" className={`${ICON_PILL_BUTTON} !h-7 !w-7`}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={actions.redo} disabled={!canRedo || simulating} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={`${ICON_PILL_BUTTON} !h-7 !w-7`}>
              <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {armedLabel !== null && (
              <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                Placing: {armedLabel}. Click a cell, or press Esc to cancel
              </span>
            )}
            {simulating && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Simulation attached: editing is locked
              </span>
            )}
          </div>

          {state.view === 'LAD' ? (
            <section className={`${PANEL} min-h-0 flex-1`}>
              <WindowBar icon={<span className="font-mono text-[10px] font-bold">LAD</span>} title="ladder.lad" trailing={`${editor.networks.length} network${editor.networks.length === 1 ? '' : 's'}`} />
              <div className={`min-h-0 flex-1 overflow-auto ${CANVAS_SURFACE}`} style={CANVAS_DOTS_STYLE}>
                <LadderCanvas editor={editor} profile={profile} symbols={symbols} className="p-3" />
              </div>
            </section>
          ) : (
            <div className="min-h-0 flex-1">
              <StlEditor
                text={state.stl.draft}
                diagnostics={state.stl.diagnostics}
                dirty={state.stl.dirty}
                notice={state.notice}
                onChange={actions.editStl}
                onDiscard={actions.discardStl}
              />
            </div>
          )}
        </div>

        {hasRight && (
          <div className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto lg:col-span-2 xl:col-span-1">
            {rightPanel}
            {!simulating && state.view === 'LAD' && <NodeInspector editor={editor} profile={profile} className="shrink-0" />}
          </div>
        )}
      </div>
    </SimulationProvider>
  );
}
