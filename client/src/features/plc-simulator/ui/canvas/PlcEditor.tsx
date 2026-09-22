import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { registerUnifiedMonacoThemes } from '@/lib/monacoTheme';
import { PANEL, WindowBar } from '../chrome';
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
  { label: 'IL', value: 'STL' },
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
  const { state, actions, selection } = editor;
  const simulating = simulation !== null;
  const draggedFromPalette = useRef(false);

  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true,
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const onActivate = useCallback(
    (item: PaletteItemId) => {
      const cell = selection.cell;
      // A selected empty cell means "put it here"
      if (selection.networkId !== null && cell !== null && selection.nodeId === null) {
        actions.placeItem(selection.networkId, item, cell.row, cell.col);
      }
    },
    [actions, selection],
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
          {state.view === 'LAD' ? (
            <section className={`${PANEL} min-h-0 flex-1`}>
              <WindowBar
                icon={<span className="font-mono text-[10px] font-bold">LAD</span>}
                title="ladder.lad"
                trailing={
                  <div className="flex items-center gap-2">
                    <SegmentedControl<EditorView>
                      aria-label="Program view"
                      size="sm"
                      value={state.view}
                      options={VIEW_OPTIONS.map((option) => ({ ...option }))}
                      onChange={(view) => actions.setView(view)}
                      disabled={simulating}
                      className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
                    />
                    <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
                      {editor.networks.length} network{editor.networks.length === 1 ? '' : 's'}
                    </span>
                  </div>
                }
              />
              <div className="min-h-0 flex-1 overflow-auto bg-white p-3 dark:bg-[#090a0d]">
                <LadderCanvas editor={editor} profile={profile} symbols={symbols} />
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
                theme={isDark ? 'mae-dark' : 'mae-light'}
                beforeMount={registerUnifiedMonacoThemes}
                trailing={
                  <SegmentedControl<EditorView>
                    aria-label="Program view"
                    size="sm"
                    value={state.view}
                    options={VIEW_OPTIONS.map((option) => ({ ...option }))}
                    onChange={(view) => actions.setView(view)}
                    disabled={simulating}
                    className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
                  />
                }
              />
            </div>
          )}
        </div>

        {hasRight && (
          <div className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto lg:col-span-2 xl:col-span-1">
            {rightPanel}
            {!simulating && state.view === 'LAD' && <NodeInspector editor={editor} profile={profile} symbols={symbols} className="shrink-0" />}
          </div>
        )}
      </div>
    </SimulationProvider>
  );
}
