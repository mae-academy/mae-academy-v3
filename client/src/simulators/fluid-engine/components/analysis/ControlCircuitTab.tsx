import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CONTROL_SYSTEMS_HEADING } from '@/simulators/shared/workspace/workspaceChrome';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { useFluidT } from '../../i18n/fluidText';
import type { RelayLadder } from '../../hooks/useRelayLadder';
import { startStopExample } from '../../models/ladderExamples';
import {
  addParallel, addPath, addSeries, findElement, isConditionKind, makeElement, removeElement, removePath, setLoad, suggestTag, tagKey, updateElement,
  type ContactForm, type LadderCircuit, type LadderElement, type LadderElementKind, type TimerMode,
} from '../../models/relayLadder';
import { LadderGlyphIcon, type LadderTheme } from '../ladder/LadderGlyphs';
import { RelayLadderDiagram, type LadderSelection, type LadderSite } from '../ladder/RelayLadderDiagram';

interface PaletteEntry {
  id: string;
  kind: LadderElementKind;
  form?: ContactForm;
  mode?: TimerMode;
  /** Key under `ladder.palette.` */
  label: string;
}

const SWITCHES: PaletteEntry[] = [
  { id: 'pushbutton-no', kind: 'pushbutton', form: 'NO', label: 'pushbuttonNO' },
  { id: 'pushbutton-nc', kind: 'pushbutton', form: 'NC', label: 'pushbuttonNC' },
  { id: 'sensor', kind: 'sensor', label: 'sensor' },
];
const CONTACTS: PaletteEntry[] = [
  { id: 'relay-contact-no', kind: 'relayContact', form: 'NO', label: 'relayContactNO' },
  { id: 'relay-contact-nc', kind: 'relayContact', form: 'NC', label: 'relayContactNC' },
  { id: 'timer-contact-no', kind: 'timerContact', form: 'NO', label: 'timerContactNO' },
  { id: 'timer-contact-nc', kind: 'timerContact', form: 'NC', label: 'timerContactNC' },
];
const LOADS: PaletteEntry[] = [
  { id: 'relay-coil', kind: 'relayCoil', label: 'relayCoil' },
  { id: 'solenoid', kind: 'solenoid', label: 'solenoid' },
  { id: 'timer-on', kind: 'timerCoil', mode: 'on', label: 'timerOn' },
  { id: 'timer-off', kind: 'timerCoil', mode: 'off', label: 'timerOff' },
];

export interface ControlCircuitTabProps {
  colors: Palette;
  isDark: boolean;
  circuit: LadderCircuit;
  onCircuitChange: (circuit: LadderCircuit) => void;
  ladder: RelayLadder;
  /** The fluid simulation is running or paused: the circuit is energised. */
  live: boolean;
  /** Limit-switch tags of the schematic (1B1, 1B2 …) offered for new sensors. */
  sensorTags: string[];
  /** Solenoid tags of the schematic's valves (1Y1 …) offered for new solenoids. */
  solenoidTags: string[];
  /** Tags the example circuit is built on: the end-of-stroke switch and the solenoid. */
  exampleTags: { stop: string; solenoid: string };
}

export function ladderThemeOf(colors: Palette, isDark: boolean): LadderTheme {
  return { isDark, ink: colors.text, faint: colors.subtle, live: colors.powered, active: isDark ? '#fb7185' : '#e11d48', selection: colors.selection, surface: colors.panel };
}

/** The "Control Circuit" tab: a 24 V DC relay-ladder workspace tied to the schematic through limit-switch and solenoid tags. */
export function ControlCircuitTab({ colors, isDark, circuit, onCircuitChange, ladder, live, sensorTags, solenoidTags, exampleTags }: ControlCircuitTabProps) {
  const tr = useFluidT();
  const theme = useMemo(() => ladderThemeOf(colors, isDark), [colors, isDark]);
  const [armed, setArmed] = useState<PaletteEntry | null>(null);
  const [selection, setSelection] = useState<LadderSelection>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Undo / redo of the circuit edits made in this tab.
  const past = useRef<LadderCircuit[]>([]);
  const future = useRef<LadderCircuit[]>([]);
  const [, bump] = useState(0);
  const commit = (next: LadderCircuit) => {
    if (next === circuit) return;
    past.current = [...past.current.slice(-99), circuit];
    future.current = [];
    onCircuitChange(next);
    bump(n => n + 1);
  };
  const undo = () => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, circuit];
    onCircuitChange(previous);
    setSelection(null);
    bump(n => n + 1);
  };
  const redo = () => {
    const next = future.current[future.current.length - 1];
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, circuit];
    onCircuitChange(next);
    setSelection(null);
    bump(n => n + 1);
  };

  const selected = selection?.kind === 'element' ? findElement(circuit, selection.id) : undefined;
  const selectedPath = selection?.kind === 'path' ? circuit.paths.findIndex(path => path.id === selection.id) : -1;
  const armedName = armed ? tr(`ladder.palette.${armed.label}`) : '';

  const place = (site: LadderSite) => {
    if (!armed) return;
    const preferred = armed.kind === 'sensor' ? sensorTags : armed.kind === 'solenoid' ? solenoidTags : [];
    const options: Partial<LadderElement> = {};
    if (armed.form) options.form = armed.form;
    if (armed.mode) options.mode = armed.mode;
    const element = makeElement(armed.kind, suggestTag(circuit, armed.kind, preferred), options);
    commit(site.type === 'series' ? addSeries(circuit, site.pathId, element)
      : site.type === 'parallel' ? addParallel(circuit, site.pathId, site.group, element)
        : setLoad(circuit, site.pathId, element));
    setSelection({ kind: 'element', id: element.id });
    setArmed(null);
  };

  const newPath = () => {
    const next = addPath(circuit);
    commit(next);
    setSelection({ kind: 'path', id: next.paths[next.paths.length - 1].id });
  };

  const arm = (entry: PaletteEntry) => {
    if (armed?.id === entry.id) { setArmed(null); return; }
    // A first part needs a path to land on.
    if (circuit.paths.length === 0) commit(addPath(circuit));
    setArmed(entry);
  };

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', textAlign: 'start', minHeight: 34, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    color: colors.text, background: active ? `${colors.primary}22` : colors.panelAlt, border: `1px solid ${active ? colors.primary : colors.line}`, borderRadius: 8,
  });
  const fieldStyle: React.CSSProperties = { background: colors.input, color: colors.text, border: `1px solid ${colors.line}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, minHeight: 28 };
  const labelStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.muted };

  /** Component Library cards: the same collapsible sections and 2-up card grid as the schematic's library panel. */
  const paletteGroup = (title: string, entries: PaletteEntry[]) => {
    const isCollapsed = collapsed.has(title);
    return (
      <section role="group" aria-label={title} key={title} style={{ marginBottom: 3 }}>
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(title)) next.delete(title); else next.add(title); return next; })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: '8px 5px', fontSize: 11, fontWeight: 750 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{title}</span>
          <span style={{ color: colors.subtle, fontWeight: 600 }}>{entries.length}</span>
        </button>
        {!isCollapsed && (
          <div className="grid grid-cols-2 gap-2 px-1 pb-3">
            {entries.map(entry => {
              const active = armed?.id === entry.id;
              const name = tr(`ladder.palette.${entry.label}`);
              return (
                <button
                  key={entry.id}
                  type="button"
                  data-testid={`ladder-palette-${entry.id}`}
                  aria-pressed={active}
                  title={name}
                  onClick={() => arm(entry)}
                  className="flex h-[96px] flex-col overflow-hidden rounded-md border transition-all active:scale-[.97]"
                  style={{ borderColor: active ? colors.primary : colors.line, background: active ? `${colors.primary}22` : colors.panel, cursor: 'pointer' }}
                  onMouseEnter={event => { if (!active) event.currentTarget.style.background = colors.panelAlt; }}
                  onMouseLeave={event => { if (!active) event.currentTarget.style.background = colors.panel; }}
                >
                  <div className="flex h-12 min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1.5"><LadderGlyphIcon kind={entry.kind} form={entry.form} mode={entry.mode} theme={theme} /></div>
                  <div className="flex h-8 w-full shrink-0 items-center justify-center border-t px-1.5" style={{ borderColor: colors.line, background: `${colors.line}15` }}>
                    <span className="text-[10px] font-medium tracking-tight text-center leading-tight w-full line-clamp-2" style={{ color: colors.text }}>{name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const removeSelected = () => {
    if (selected) commit(removeElement(circuit, selected.id));
    else if (selectedPath >= 0) commit(removePath(circuit, circuit.paths[selectedPath].id));
    else return;
    setSelection(null);
  };

  const editElement = (element: LadderElement) => {
    const change = (patch: Partial<Omit<LadderElement, 'id' | 'kind'>>) => commit(updateElement(circuit, element.id, patch));
    const tagListId = `ladder-tags-${element.kind}`;
    const suggestions = element.kind === 'sensor' ? sensorTags : element.kind === 'solenoid' ? solenoidTags : [];
    const isCondition = isConditionKind(element.kind);
    return (
      <div role="group" aria-label={tr('ladder.properties')} data-testid="ladder-properties" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <label style={labelStyle}>
          {tr('ladder.tag')}
          <input aria-label={tr('ladder.tag')} data-testid="ladder-tag-input" list={suggestions.length ? tagListId : undefined} value={element.tag} onChange={event => change({ tag: event.target.value })} style={{ ...fieldStyle, width: 84 }} />
          {suggestions.length > 0 && <datalist id={tagListId}>{suggestions.map(tag => <option key={tag} value={tag} />)}</datalist>}
        </label>
        <label style={labelStyle}>
          {tr('ladder.caption')}
          <input aria-label={tr('ladder.caption')} data-testid="ladder-caption-input" value={element.caption ?? ''} onChange={event => change({ caption: event.target.value })} style={{ ...fieldStyle, width: 120 }} />
        </label>
        {isCondition && (
          <label style={labelStyle}>
            {tr('ladder.form')}
            <select aria-label={tr('ladder.form')} data-testid="ladder-form-select" value={element.form ?? 'NO'} onChange={event => change({ form: event.target.value as ContactForm })} style={fieldStyle}>
              <option value="NO">{tr('ladder.normallyOpen')}</option>
              <option value="NC">{tr('ladder.normallyClosed')}</option>
            </select>
          </label>
        )}
        {element.kind === 'pushbutton' && (
          <label style={labelStyle}>
            <input type="checkbox" data-testid="ladder-detent" checked={Boolean(element.detent)} onChange={event => change({ detent: event.target.checked })} />
            {tr('ladder.detent')}
          </label>
        )}
        {element.kind === 'sensor' && (
          <label style={labelStyle}>
            <input type="checkbox" data-testid="ladder-force" checked={Boolean(ladder.forced[tagKey(element.tag)])} onChange={event => ladder.forceSensor(element.tag, event.target.checked)} />
            {tr('ladder.force')}
          </label>
        )}
        {element.kind === 'timerCoil' && (
          <>
            <label style={labelStyle}>
              {tr('ladder.mode')}
              <select aria-label={tr('ladder.mode')} data-testid="ladder-mode-select" value={element.mode ?? 'on'} onChange={event => change({ mode: event.target.value as TimerMode })} style={fieldStyle}>
                <option value="on">{tr('ladder.onDelay')}</option>
                <option value="off">{tr('ladder.offDelay')}</option>
              </select>
            </label>
            <label style={labelStyle}>
              {tr('ladder.delay')}
              <input type="number" min={0} step={0.1} aria-label={tr('ladder.delay')} data-testid="ladder-delay-input" value={element.delay ?? 0} onChange={event => change({ delay: Math.max(0, Number(event.target.value) || 0) })} style={{ ...fieldStyle, width: 72 }} />
            </label>
          </>
        )}
        <button type="button" data-testid="ladder-delete-element" onClick={() => { commit(removeElement(circuit, element.id)); setSelection(null); }} style={buttonStyle(false)}>{tr('ladder.deleteElement')}</button>
      </div>
    );
  };

  const hint = armed
    ? tr('ladder.armed', { name: armedName })
    : live ? tr('ladder.hintLive') : tr('ladder.hintIdle');

  return (
    <div
      data-testid="control-circuit"
      data-live={live ? 'true' : 'false'}
      tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape') { setArmed(null); return; }
        // Typing in a property field keeps its own editing behaviour.
        if ((event.target as HTMLElement).closest('input, select, textarea')) return;
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (mod && (key === 'z' || key === 'y')) {
          // The schematic's window-level shortcuts must not undo the drawing underneath.
          event.preventDefault(); event.stopPropagation();
          if (key === 'y' || event.shiftKey) redo(); else undo();
          return;
        }
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        event.preventDefault(); event.stopPropagation();
        removeSelected();
      }}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, outline: 'none' }}
    >
      <aside
        data-testid="ladder-palette"
        className="shrink-0 overflow-hidden rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]"
        style={{ flex: '0 0 232px', background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}
      >
        <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
          <div className={CONTROL_SYSTEMS_HEADING}>{tr('ladder.library')}</div>
        </div>
        <div className="mae-palette-scroll" style={{ padding: '6px 6px 10px' }}>
          {paletteGroup(tr('ladder.groupSwitches'), SWITCHES)}
          {paletteGroup(tr('ladder.groupContacts'), CONTACTS)}
          {paletteGroup(tr('ladder.groupLoads'), LOADS)}
        </div>
      </aside>

      <div data-testid="ladder-workspace" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <button type="button" data-testid="ladder-undo" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={past.current.length === 0} style={{ ...buttonStyle(false), opacity: past.current.length === 0 ? 0.5 : 1 }}>↶</button>
          <button type="button" data-testid="ladder-redo" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo} disabled={future.current.length === 0} style={{ ...buttonStyle(false), opacity: future.current.length === 0 ? 0.5 : 1 }}>↷</button>
          <button type="button" data-testid="ladder-add-path" onClick={newPath} style={buttonStyle(false)}>{tr('ladder.addPath')}</button>
          <button type="button" data-testid="ladder-example" onClick={() => { commit(startStopExample(exampleTags)); setSelection(null); setArmed(null); }} style={buttonStyle(false)}>{tr('ladder.loadExample')}</button>
          <button type="button" data-testid="ladder-clear" onClick={() => { commit({ paths: [] }); setSelection(null); setArmed(null); ladder.clearInputs(); }} disabled={circuit.paths.length === 0} style={{ ...buttonStyle(false), opacity: circuit.paths.length === 0 ? 0.5 : 1 }}>{tr('ladder.clear')}</button>
        </div>

        <div data-testid="ladder-hint" role="status" aria-live="polite" style={{ fontSize: 12, color: armed ? colors.primary : colors.muted }}>{hint}</div>

        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 12, background: colors.canvas, padding: 8 }}>
          <RelayLadderDiagram
            circuit={circuit}
            result={ladder.result}
            simulating={live}
            theme={theme}
            selection={selection}
            onSelect={setSelection}
            armed={armed ? (isConditionKind(armed.kind) ? 'condition' : 'load') : null}
            onSite={place}
            onAddPath={newPath}
            pressed={ladder.pressed}
            forced={ladder.forced}
            onOperate={(element, down) => {
              if (down) ladder.operate(element.tag, Boolean(element.detent));
              else if (!element.detent) ladder.release();
            }}
          />
        </div>

      {selected && editElement(selected)}
      {selectedPath >= 0 && (
        <div role="group" aria-label={tr('ladder.properties')} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: colors.muted }}>
          <span>{tr('ladder.path', { n: selectedPath + 1 })}</span>
          <button type="button" data-testid="ladder-delete-path" onClick={() => { commit(removePath(circuit, circuit.paths[selectedPath].id)); setSelection(null); }} style={buttonStyle(false)}>{tr('ladder.deletePath', { n: selectedPath + 1 })}</button>
        </div>
      )}
      </div>
    </div>
  );
}
