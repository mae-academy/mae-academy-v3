import React, { useMemo, useState } from 'react';
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

const CONDITIONS: PaletteEntry[] = [
  { id: 'sensor', kind: 'sensor', label: 'sensor' },
  { id: 'pushbutton-no', kind: 'pushbutton', form: 'NO', label: 'pushbuttonNO' },
  { id: 'pushbutton-nc', kind: 'pushbutton', form: 'NC', label: 'pushbuttonNC' },
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
    onCircuitChange(site.type === 'series' ? addSeries(circuit, site.pathId, element)
      : site.type === 'parallel' ? addParallel(circuit, site.pathId, site.group, element)
        : setLoad(circuit, site.pathId, element));
    setSelection({ kind: 'element', id: element.id });
    setArmed(null);
  };

  const newPath = () => {
    const next = addPath(circuit);
    onCircuitChange(next);
    setSelection({ kind: 'path', id: next.paths[next.paths.length - 1].id });
  };

  const arm = (entry: PaletteEntry) => {
    if (armed?.id === entry.id) { setArmed(null); return; }
    // A first part needs a path to land on.
    if (circuit.paths.length === 0) onCircuitChange(addPath(circuit));
    setArmed(entry);
  };

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', minHeight: 34, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    color: colors.text, background: active ? `${colors.primary}22` : colors.panelAlt, border: `1px solid ${active ? colors.primary : colors.line}`, borderRadius: 8,
  });
  const fieldStyle: React.CSSProperties = { background: colors.input, color: colors.text, border: `1px solid ${colors.line}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, minHeight: 28 };
  const labelStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.muted };

  const paletteGroup = (title: string, entries: PaletteEntry[]) => (
    <div role="group" aria-label={title} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted, marginInlineEnd: 4 }}>{title}</span>
      {entries.map(entry => (
        <button
          key={entry.id}
          type="button"
          data-testid={`ladder-palette-${entry.id}`}
          aria-pressed={armed?.id === entry.id}
          title={tr(`ladder.palette.${entry.label}`)}
          onClick={() => arm(entry)}
          style={buttonStyle(armed?.id === entry.id)}
        >
          <LadderGlyphIcon kind={entry.kind} form={entry.form} mode={entry.mode} theme={theme} />
          <span>{tr(`ladder.palette.${entry.label}`)}</span>
        </button>
      ))}
    </div>
  );

  const editElement = (element: LadderElement) => {
    const change = (patch: Partial<Omit<LadderElement, 'id' | 'kind'>>) => onCircuitChange(updateElement(circuit, element.id, patch));
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
        <button type="button" data-testid="ladder-delete-element" onClick={() => { onCircuitChange(removeElement(circuit, element.id)); setSelection(null); }} style={buttonStyle(false)}>{tr('ladder.deleteElement')}</button>
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
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onKeyDown={event => { if (event.key === 'Escape') setArmed(null); }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paletteGroup(tr('ladder.inputs'), CONDITIONS)}
          {paletteGroup(tr('ladder.outputs'), LOADS)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" data-testid="ladder-add-path" onClick={newPath} style={buttonStyle(false)}>{tr('ladder.addPath')}</button>
          <button type="button" data-testid="ladder-example" onClick={() => { onCircuitChange(startStopExample(exampleTags)); setSelection(null); setArmed(null); }} style={buttonStyle(false)}>{tr('ladder.loadExample')}</button>
          <button type="button" data-testid="ladder-clear" onClick={() => { onCircuitChange({ paths: [] }); setSelection(null); setArmed(null); ladder.clearInputs(); }} disabled={circuit.paths.length === 0} style={{ ...buttonStyle(false), opacity: circuit.paths.length === 0 ? 0.5 : 1 }}>{tr('ladder.clear')}</button>
        </div>
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
          <button type="button" data-testid="ladder-delete-path" onClick={() => { onCircuitChange(removePath(circuit, circuit.paths[selectedPath].id)); setSelection(null); }} style={buttonStyle(false)}>{tr('ladder.deletePath', { n: selectedPath + 1 })}</button>
        </div>
      )}
    </div>
  );
}
