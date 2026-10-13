import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LadNode, LogicWidth, NetworkId, NumericType } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { SymbolMap } from '../../transpiler';
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, X } from 'lucide-react';
import { FIELD_INPUT, PANEL, PANEL_TITLE } from '../chrome';
import { describeNode } from './components/symbols/NodeView';
import { findNode } from './network-edit';
import { readSlot, slotsOf, validateSlot, type SlotKey } from './operand-slots';
import type { PlcEditor } from './usePlcEditorState';
import {
  PALETTE_CATEGORIES,
  getPaletteItem,
  type PaletteCategory,
  type PaletteItem,
  type PaletteItemId,
} from '../palette/catalog';

const TYPES: readonly NumericType[] = ['BYTE', 'INT', 'DINT', 'REAL'];
const LOGIC_WIDTHS: readonly LogicWidth[] = ['BYTE', 'WORD', 'DWORD'];
const WIDTH_LABEL: Readonly<Record<LogicWidth, string>> = { BYTE: 'Byte', WORD: 'Word', DWORD: 'DWord' };

/** Maps an AST node to its corresponding or representative PaletteItemId */
function nodeToPaletteItemId(node: LadNode): PaletteItemId {
  switch (node.type) {
    case 'contact':
      switch (node.variant) {
        case 'NO': return 'contact-no';
        case 'NC': return 'contact-nc';
        case 'P': return 'contact-p';
        case 'N': return 'contact-n';
      }
    case 'coil':
      switch (node.variant) {
        case 'SET': return 'coil-set';
        case 'RESET': return 'coil-reset';
        default: return 'coil-out';
      }
    case 'timer':
      switch (node.fn) {
        case 'TOF': return 'timer-tof';
        case 'TONR': return 'timer-tonr';
        default: return 'timer-ton';
      }
    case 'counter':
      switch (node.fn) {
        case 'CTD': return 'counter-ctd';
        case 'CTUD': return 'counter-ctud';
        default: return 'counter-ctu';
      }
    case 'compare':
      switch (node.op) {
        case '<>': return 'cmp-ne';
        case '>=': return 'cmp-ge';
        case '<=': return 'cmp-le';
        case '>': return 'cmp-gt';
        case '<': return 'cmp-lt';
        default: return 'cmp-eq';
      }
    case 'math':
      switch (node.fn) {
        case 'SUB': return 'math-sub';
        case 'MUL': return 'math-mul';
        case 'DIV': return 'math-div';
        case 'SQR': return 'math-sqr';
        case 'SIN': return 'math-sin';
        case 'COS': return 'math-cos';
        case 'EXP': return 'math-exp';
        case 'LN': return 'math-ln';
        case 'ABS': return 'math-abs';
        default: return 'math-add';
      }
    case 'wordLogic':
      switch (node.fn) {
        case 'W_OR': return 'wl-or';
        case 'W_XOR': return 'wl-xor';
        case 'W_NOT': return 'wl-not';
        default: return 'wl-and';
      }
  }
}

/** Determines compatible palette replacement categories/items for a given node */
function getCompatibleCategories(node: LadNode): readonly PaletteCategory[] {
  if (node.type === 'contact') {
    const bitCat = PALETTE_CATEGORIES.find((c) => c.id === 'bit');
    if (!bitCat) return [];
    return [{
      ...bitCat,
      items: bitCat.items.filter((item) => item.id.startsWith('contact-')),
    }];
  }
  if (node.type === 'coil') {
    const bitCat = PALETTE_CATEGORIES.find((c) => c.id === 'bit');
    if (!bitCat) return [];
    return [{
      ...bitCat,
      items: bitCat.items.filter((item) => item.id.startsWith('coil-')),
    }];
  }
  if (node.type === 'timer' || node.type === 'counter') {
    const tcCat = PALETTE_CATEGORIES.find((c) => c.id === 'timerCounter');
    return tcCat ? [tcCat] : [];
  }
  if (node.type === 'compare') {
    const cmpCat = PALETTE_CATEGORIES.find((c) => c.id === 'compare');
    return cmpCat ? [cmpCat] : [];
  }
  if (node.type === 'math' || node.type === 'wordLogic') {
    const mlCat = PALETTE_CATEGORIES.find((c) => c.id === 'mathLogic');
    return mlCat ? [mlCat] : [];
  }
  return PALETTE_CATEGORIES;
}

interface ReplaceComponentControlProps {
  node: LadNode;
  onReplace: (newItemId: PaletteItemId) => void;
}

/** Floating popover mirroring electrical-circuits ReplaceComponentControl */
function ReplaceComponentControl({ node, onReplace }: ReplaceComponentControlProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const currentItemId = nodeToPaletteItemId(node);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const categories = useMemo(() => {
    if (!open) return [];
    const trimmed = query.trim().toLowerCase();
    const available = getCompatibleCategories(node);

    return available
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            !trimmed ||
            item.label.toLowerCase().includes(trimmed) ||
            item.description.toLowerCase().includes(trimmed),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [open, query, node]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Replace selected component with compatible instruction"
        className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:border-sky-400 hover:bg-slate-100 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-200 dark:hover:border-sky-500 dark:hover:bg-[#181c24]"
      >
        <RefreshCw size={13} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <span>Replace</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[360px] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl dark:border-[#1a1d24] dark:bg-[#0d0f14]">
          <input
            autoFocus
            placeholder="Search replacement..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-100 dark:placeholder-slate-500"
          />
          <div className="flex flex-col gap-2">
            {categories.map((category) => (
              <div key={category.id} className="space-y-1">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {category.label}
                </div>
                {category.items.map((item) => {
                  const isCurrent = item.id === currentItemId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onReplace(item.id);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        isCurrent
                          ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-sans text-xs font-medium">{item.label}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{item.description}</span>
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">Current</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {categories.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500">
                No compatible replacements found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
        className={`${FIELD_INPUT} font-sans ${error === null ? '' : '!border-red-500'}`}
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
          className={`${FIELD_INPUT} font-sans pe-6`}
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
  const { t } = useTranslation('simulators');
  const { selection, networks, actions } = editor;
  const networkId: NetworkId | null = selection.networkId;
  const network = networkId === null ? undefined : networks.find((n) => n.id === networkId);
  const node: LadNode | undefined = network && selection.nodeId !== null ? findNode(network, selection.nodeId) : undefined;

  return (
    <section aria-label="Selected element" className={`${PANEL} ${className}`}>
      <div className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-[#1a1d24]">
        <div className={PANEL_TITLE}>{t('plc.nodeInspector', 'Node Inspector')}</div>
      </div>

      {!network || !node || networkId === null ? (
        <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">{t('shell.emptyInspector', 'Select an element to inspect its properties.')}</p>
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
                    className="flex h-6 w-6 max-sm:h-11 max-sm:w-11 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-[#1a1d24] dark:text-slate-300 dark:hover:bg-[#13161c]"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Shift element right"
                    onClick={() => actions.moveNode(networkId, node.id, node.layout.row, node.layout.col + 1)}
                    className="flex h-6 w-6 max-sm:h-11 max-sm:w-11 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-[#1a1d24] dark:text-slate-300 dark:hover:bg-[#13161c]"
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <ReplaceComponentControl
            node={node}
            onReplace={(newItemId) => actions.replaceNode(networkId, node.id, newItemId)}
          />

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
