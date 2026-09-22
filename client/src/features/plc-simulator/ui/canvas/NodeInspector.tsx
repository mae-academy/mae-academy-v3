import { useId, useState } from 'react';
import type { LadNode, LogicWidth, NetworkId, NumericType } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { SymbolMap } from '../../transpiler';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { FIELD_INPUT, PANEL, PANEL_TITLE } from '../chrome';
import { describeNode } from './components/symbols/NodeView';
import { findNode } from './network-edit';
import { readSlot, slotsOf, validateSlot, type SlotKey } from './operand-slots';
import type { PlcEditor } from './usePlcEditorState';

const TYPES: readonly NumericType[] = ['BYTE', 'INT', 'DINT', 'REAL'];
const LOGIC_WIDTHS: readonly LogicWidth[] = ['BYTE', 'WORD', 'DWORD'];
const WIDTH_LABEL: Readonly<Record<LogicWidth, string>> = { BYTE: 'Byte', WORD: 'Word', DWORD: 'DWord' };

interface SlotFieldProps {
  label: string;
  value: string;
  validate: (text: string) => string | null;
  onCommit: (text: string) => void;
}

/** One operand input; commits on Enter or blur, and only when the value validates. */
function SlotField({ label, value, validate, onCommit }: SlotFieldProps) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const errorId = useId();
  // Follow external changes (undo, inline edit) without clobbering what is being typed.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const error = validate(draft);
  const commit = (): void => {
    if (error === null && draft.trim() !== value) onCommit(draft);
    else if (error !== null) setDraft(value);
  };

  return (
    <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="mae-panel-field-label">{label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(value);
        }}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        spellCheck={false}
        className={`${FIELD_INPUT} font-mono ${error === null ? '' : '!border-red-500'}`}
      />
      {error !== null && (
        <span id={errorId} role="alert" className="col-start-2 text-[10px] leading-tight text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

interface SymbolFieldProps {
  label: string;
  value: string;
  onCommit: (text: string) => void;
}

function SymbolField({ label, value, onCommit }: SymbolFieldProps) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = (): void => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };

  return (
    <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="mae-panel-field-label">{label}</span>
      <div className="relative flex items-center">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(value);
          }}
          placeholder="e.g. Start_PB, Motor"
          spellCheck={false}
          className={`${FIELD_INPUT} font-mono pe-6`}
        />
        {draft && (
          <button
            type="button"
            aria-label="Clear symbol tag"
            onClick={() => {
              setDraft('');
              onCommit('');
            }}
            className="absolute end-1.5 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    </label>
  );
}

/**
 * Form view of the selected element. Every operand is reachable here, including ones a compact
 * box has no room to draw, and the same validation that guards inline edits applies.
 */
export function NodeInspector({
  editor,
  profile,
  symbols,
  className = '',
}: {
  editor: PlcEditor;
  profile: HardwareProfile;
  symbols?: SymbolMap;
  className?: string;
}) {
  const { selection, networks, actions } = editor;
  const networkId: NetworkId | null = selection.networkId;
  const network = networkId === null ? undefined : networks.find((n) => n.id === networkId);
  const node: LadNode | undefined = network && selection.nodeId !== null ? findNode(network, selection.nodeId) : undefined;

  return (
    <section aria-label="Selected element" className={`${PANEL} ${className}`}>
      <div className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-[#1a1d24]">
        <div className={PANEL_TITLE}>Node Inspector</div>
      </div>

      {!network || !node || networkId === null ? (
        <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">Select an element to inspect its properties.</p>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          <div className="text-xs">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{describeNode(node)}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                row {node.layout.row + 1}, column {node.layout.col + 1}
              </span>
              {node.type === 'coil' || node.type === 'timer' || node.type === 'counter' ? (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Anchored to output rail</span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Shift element left"
                    disabled={node.layout.col <= 0}
                    onClick={() => actions.moveNode(networkId, node.id, node.layout.row, node.layout.col - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-[#1a1d24] dark:text-slate-300 dark:hover:bg-[#13161c]"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Shift element right"
                    onClick={() => actions.moveNode(networkId, node.id, node.layout.row, node.layout.col + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-[#1a1d24] dark:text-slate-300 dark:hover:bg-[#13161c]"
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {slotsOf(node).map((slot) => {
            const isAddressSlot = slot.key === 'operand' || slot.key === 'target' || slot.key === 'instance';
            const address = isAddressSlot ? readSlot(node, slot.key) : undefined;
            const currentSymbol =
              node.symbol !== undefined
                ? node.symbol
                : address && symbols
                  ? (symbols[address.toUpperCase()]?.name ?? '')
                  : '';

            return (
              <div key={`${node.id}:${slot.key}`} className="contents">
                <SlotField
                  label={slot.label}
                  value={readSlot(node, slot.key)}
                  validate={(text) => validateSlot(node, slot.key as SlotKey, text, profile)}
                  onCommit={(text) => actions.setSlot(networkId, node.id, slot.key, text)}
                />
                {isAddressSlot && (
                  <SymbolField
                    label="Symbol Name"
                    value={currentSymbol}
                    onCommit={(text) => actions.setNodeSymbol(networkId, node.id, text)}
                  />
                )}
              </div>
            );
          })}

          {(node.type === 'compare' || node.type === 'math') && (
            <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 text-xs">
              <span className="mae-panel-field-label">Data type</span>
              {/* SQRT/SIN/COS/EXP/LN are REAL-only on the S7-200; ABS, the comparators and the
                  destructive ADD/SUB/MUL/DIV boxes switch freely across BYTE/INT/DINT/REAL. */}
              {node.type === 'math' && !('in1' in node) && node.fn !== 'ABS' ? (
                <select value="REAL" disabled className={FIELD_INPUT}>
                  <option value="REAL">REAL</option>
                </select>
              ) : (
                <select
                  value={node.dataType}
                  onChange={(event) => actions.retype(networkId, node.id, event.target.value as NumericType)}
                  className={FIELD_INPUT}
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {node.type === 'wordLogic' && (
            <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 text-xs">
              <span className="mae-panel-field-label">Width</span>
              <select
                value={node.width}
                onChange={(event) => actions.retypeWordLogic(networkId, node.id, event.target.value as LogicWidth)}
                className={FIELD_INPUT}
              >
                {LOGIC_WIDTHS.map((width) => (
                  <option key={width} value={width}>
                    {WIDTH_LABEL[width]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Use the <span className="font-semibold text-sky-600 dark:text-sky-400">+</span> handles on the canvas to fork a parallel branch or add a lane.
          </p>

          <button
            type="button"
            onClick={actions.deleteSelection}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-rose-300 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </section>
  );
}
