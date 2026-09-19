import { AlertTriangle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { HardwareProfile } from '../../domain/hardware';
import { FIELD_INPUT, PANEL, PANEL_TITLE } from '../chrome';
import type { FbdDiagnostic } from './compile';
import { KINDS, blockCaption, markerIndices, timerInstances, type FbdBlock } from './model';
import type { FbdEditor } from './useFbdEditor';

const rowClass = 'grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 text-xs';

/** Timer preset in seconds; commits on Enter / blur so a half-typed number never reaches the program. */
function PresetField({ block, onCommit }: { block: FbdBlock; onCommit: (ticks: number) => void }) {
  const ticks = block.preset ?? 50;
  const [draft, setDraft] = useState(String(ticks / 10));
  const [seen, setSeen] = useState(ticks);
  if (ticks !== seen) {
    setSeen(ticks);
    setDraft(String(ticks / 10));
  }
  const parsed = Number(draft);
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 3276.7;
  const commit = (): void => {
    if (valid) onCommit(Math.round(parsed * 10));
    else setDraft(String(ticks / 10));
  };
  return (
    <label className={rowClass}>
      <span className="mae-panel-field-label">Preset (s)</span>
      <input
        value={draft}
        inputMode="decimal"
        aria-invalid={!valid}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(String(ticks / 10));
        }}
        className={`${FIELD_INPUT} font-mono ${valid ? '' : '!border-red-500'}`}
      />
    </label>
  );
}

export interface FbdInspectorProps {
  editor: FbdEditor;
  profile: HardwareProfile;
  diagnostics: readonly FbdDiagnostic[];
  className?: string;
}

/** Properties of the selected block plus the compiler's findings for the whole diagram. */
export function FbdInspector({ editor, profile, diagnostics, className = '' }: FbdInspectorProps) {
  const { graph, selection, actions } = editor;
  const block = selection.blockId === null ? undefined : graph.blocks.find((entry) => entry.id === selection.blockId);
  const terminals = block?.kind === 'input' ? (profile.memory.I?.bitCount ?? 0) : (profile.memory.Q?.bitCount ?? 0);
  const letter = block?.kind === 'input' ? 'I' : 'Q';

  return (
    <section aria-label="Selected block" className={`${PANEL} ${className}`}>
      <div className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-[#1a1d24]">
        <div className={PANEL_TITLE}>Block Inspector</div>
      </div>

      {block === undefined ? (
        <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
          {selection.linkId === null ? 'Select a block to inspect its properties.' : 'Wire selected. Press Delete to remove it.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <div className="text-xs">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{KINDS[block.kind].description}</div>
            <div className="font-mono text-slate-500 dark:text-slate-400">
              {blockCaption(block)}
              {(block.kind === 'ton' || block.kind === 'tof') && ` · ${timerInstances(graph).get(block.id)}`}
              {block.kind === 'sr' && ` · M${markerIndices(graph).get(block.id) ?? 0}.0`}
            </div>
          </div>

          {(block.kind === 'input' || block.kind === 'output') && (
            <label className={rowClass}>
              <span className="mae-panel-field-label">Terminal</span>
              <select value={block.index ?? 0} onChange={(event) => actions.patch(block.id, { index: Number(event.target.value) })} className={FIELD_INPUT}>
                {Array.from({ length: terminals }, (_, i) => (
                  <option key={i} value={i}>
                    {letter}
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(block.kind === 'ton' || block.kind === 'tof') && <PresetField block={block} onCommit={(ticks) => actions.patch(block.id, { preset: ticks })} />}

          <button
            type="button"
            onClick={actions.deleteSelection}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-rose-300 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </button>
        </div>
      )}

      {diagnostics.length > 0 && (
        <ul aria-label="Diagram diagnostics" className="max-h-40 overflow-y-auto border-t border-slate-200 text-[11px] dark:border-[#1a1d24]">
          {diagnostics.slice(0, 20).map((diagnostic, index) => (
            <li key={index} className="flex items-start gap-1.5 px-3 py-1.5">
              <AlertTriangle aria-hidden="true" className={`mt-0.5 h-3 w-3 shrink-0 ${diagnostic.severity === 'error' ? 'text-rose-500' : 'text-amber-500'}`} />
              <span className="text-slate-700 dark:text-slate-300">{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
