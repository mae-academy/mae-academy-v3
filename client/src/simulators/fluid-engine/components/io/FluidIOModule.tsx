import React from 'react';
import { V3Math } from '@/components/ui/V3Math';
import type { SchematicComponent } from '@/components/common/schematic/schematicTypes';
import { CONTROL_SYSTEMS_HEADING } from '@/simulators/shared/workspace/workspaceChrome';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { OPERATOR_PROP, SENSOR_PROP, isMechanicalOperator } from '@shared/fluid/engine/componentSolvers';
import { sensorId } from '@shared/fluid/engine/FluidEngine';
import type { EngineSnapshot, OperatorSide } from '@shared/fluid/engine/types';
import { optionLabel, useFluidT } from '../../i18n/fluidText';
import { VALVE_SPECS, type FluidMedium } from '../../models/fluidCatalog';
import { labelToLatex } from '../../models/fluidLabel';
import { PRESSURE_SCALE } from '../../models/pressureColors';
import { sensorTagsOf, type SensorOption } from '../../models/sensorCoupling';
import { elementsOf, tagKey, type LadderCircuit } from '../../models/relayLadder';
import type { RelayLadder } from '../../hooks/useRelayLadder';
import { POWER_UNIT, SERVICE_UNIT, SOLENOID_OPERATOR, operatorKey, operatorTagsOf, type SignalTags } from '../../models/signalTags';

/** Active-state crimson shared with the platform's status indicators. */
export const ACTIVE_INDICATOR = '#EF4444';

/** Supply lamp colour: the same red pilot as every other input. */
export const SUPPLY_LIVE = ACTIVE_INDICATOR;

/** Muted ring of an unlit pilot lamp. */
const LED_RING = '#D1D5DB';

/** Round pilot lamp: glowing crimson (or `glow`) while energised (1), muted grey when not (0). */
export function Lamp({ on, off, glow = ACTIVE_INDICATOR, size = 10 }: { on: boolean; off: string; glow?: string; size?: number }) {
  const tr = useFluidT();
  return <span aria-label={on ? tr('board.active') : tr('board.inactive')} style={{ width: size, height: size, borderRadius: 9999, flexShrink: 0, background: on ? glow : off, border: on ? 'none' : `1.5px solid ${LED_RING}`, boxShadow: on ? `0 0 8px 1px ${glow}` : 'none', transition: 'all 0.2s ease-in-out' }} />;
}

/** Push + Latch for momentary operators; a single ON / OFF toggle for levers, solenoids and limit-switch rollers. */
export type ChannelMode = 'push-latch' | 'toggle';
const KIND_NAME: Record<string, string> = { Pushbutton: 'pushbutton', 'Hand Lever': 'handLever', 'Detent Lever': 'detentLever', 'Foot Pedal': 'footPedal', Plunger: 'plunger', Roller: 'roller', 'Idle-Return Roller': 'idleRoller', Solenoid: 'solenoid' };
const TOGGLE_KINDS = ['Hand Lever', 'Detent Lever', 'Solenoid', 'Roller', 'Idle-Return Roller'];
export const channelModeOf = (kind: string): ChannelMode => (TOGGLE_KINDS.includes(kind) ? 'toggle' : 'push-latch');

const Tag = ({ label }: { label: string }) => <span style={{ fontSize: 14, fontWeight: 700 }}><V3Math math={labelToLatex(label)} /></span>;

export interface InputChannelProps {
  colors: Palette;
  /** ISO 1219-2 tag, e.g. `1S1` or `1Y1`; drawn in KaTeX type. */
  tag: string;
  /** Source of the signal, already translated, e.g. `1V1 · Pushbutton`. */
  description: string;
  /** Effective state of the input: held down or latched. */
  active: boolean;
  /** Whether the Latch toggle is locked on. */
  latched: boolean;
  /** Inputs only respond once the simulation has been started. */
  live: boolean;
  /** Buttons offered: Push + Latch, or one ON / OFF toggle. */
  mode?: ChannelMode;
  /** Lamp colour when active (the supply lamp is blue, signal inputs crimson). */
  glow?: string;
  /** Momentary pulse: starts on mouse down / touch; the owner releases it on mouse up. */
  onPush: () => void;
  onLatchToggle: () => void;
}

/**
 * One digital-input channel as a slim PLC strip: tag, red pilot LED and a segmented ON / OFF / PUSH block.
 * ON latches the input high, OFF latches it low, PUSH holds it high while the pointer is down (the owner releases it).
 * Levers, rollers and the supply shut-off have no momentary action, so they get ON / OFF only.
 */
export function InputChannel({ colors, tag, description, active, latched, live, mode = 'push-latch', glow, onPush, onLatchToggle }: InputChannelProps) {
  const tr = useFluidT();
  const held = active && !latched;
  const segment = (selected: boolean, first: boolean, last: boolean): React.CSSProperties => ({
    width: '100%', minHeight: 24, padding: '2px 0', fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', cursor: live ? 'pointer' : 'not-allowed', opacity: live ? 1 : 0.5, userSelect: 'none',
    border: selected ? `1.5px solid ${colors.muted}` : '1.5px solid transparent', background: selected ? colors.panel : colors.panelAlt, color: selected ? colors.text : colors.muted,
    borderRadius: `${first ? 8 : 4}px ${first ? 8 : 4}px ${last ? 8 : 4}px ${last ? 8 : 4}px`,
  });
  const labels = { on: tr('io.on'), off: tr('io.off'), push: tr('board.push') };
  const count = mode === 'push-latch' ? 3 : 2;
  const set = (target: boolean) => { if (latched !== target) onLatchToggle(); };
  return (
    <div data-testid="fluid-input-row" data-input={tag} title={description} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '6px 3px', border: `1px solid ${colors.line}`, borderRadius: 8, background: colors.panel, minWidth: 0 }}>
      <span data-testid="fluid-input-tag" style={{ color: colors.text, maxWidth: '100%', overflow: 'hidden' }}><Tag label={tag} /></span>
      <Lamp on={active} off="transparent" glow={glow} size={12} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{description}</span>
      <div role="group" aria-label={tr('io.channelControls')} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: 2, border: `1px solid ${colors.line}`, borderRadius: 10, background: colors.panelAlt }}>
        <button type="button" disabled={!live} title={live ? tr('board.latchTip') : tr('board.pressRunTip')} aria-pressed={latched} onClick={() => set(true)} style={segment(latched, true, count === 2 ? false : false)}>{labels.on}</button>
        <button type="button" disabled={!live} title={live ? tr('board.latchTip') : tr('board.pressRunTip')} aria-pressed={!latched && !held} onClick={() => set(false)} style={segment(!latched && !held, false, count === 2)}>{labels.off}</button>
        {mode === 'push-latch' && (
          <button type="button" disabled={!live} title={live ? tr('board.holdTip') : tr('board.pressRunTip')} aria-pressed={held} onMouseDown={onPush} onTouchStart={event => { event.preventDefault(); onPush(); }} style={segment(held, false, true)}>{labels.push}</button>
        )}
      </div>
    </div>
  );
}

export interface FluidIOModuleProps {
  colors: Palette;
  medium: FluidMedium;
  components: SchematicComponent[];
  snapshot: EngineSnapshot;
  /** Effective (held or latched) state of each driven input, `bridge.manualInputs`. */
  manualInputs: Record<string, { left?: boolean; right?: boolean }>;
  latched: Record<string, boolean>;
  live: boolean;
  signalTags: SignalTags;
  sensorOptions: SensorOption[];
  onPush: (id: string, side: OperatorSide) => void;
  onLatchToggle: (id: string, side: OperatorSide) => void;
  /** Opens or closes the main shut-off of a service unit. */
  onShutoffChange: (id: string, on: boolean) => void;
  /** Control Circuit ladder: its pushbuttons become inputs here and its solenoids show their drive as lamps. */
  ladder?: { circuit: LadderCircuit; relay: RelayLadder };
}

const sectionTitle: React.CSSProperties = { marginBottom: 6 };
const readout = (colors: Palette): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '6px 10px', background: colors.panelAlt });

/**
 * Right-hand I/O module in the style of the PLC simulator: digital inputs discovered from the schematic (manual operators,
 * limit-switch rollers, solenoids), each a Push / Latch channel with a pilot lamp, then the plant's outputs.
 */
export function FluidIOModule({ colors, medium, components, snapshot, manualInputs, latched, live, signalTags, sensorOptions, onPush, onLatchToggle, onShutoffChange, ladder }: FluidIOModuleProps) {
  const tr = useFluidT();
  const ladderParts = ladder ? elementsOf(ladder.circuit) : [];
  const seen = new Set<string>();
  const uniqueBy = (kind: string) => ladderParts.filter(part => part.kind === kind && !seen.has(`${kind}:${tagKey(part.tag)}`) && seen.add(`${kind}:${tagKey(part.tag)}`));
  const ladderButtons = uniqueBy('pushbutton');
  const ladderSolenoids = uniqueBy('solenoid');
  const supplies = components.filter(component => component.type === SERVICE_UNIT || component.type === POWER_UNIT);
  const channels = components.filter(component => VALVE_SPECS[component.type]).flatMap(valve => {
    const tags = operatorTagsOf(valve, signalTags, sensorOptions);
    return (['left', 'right'] as const).flatMap(side => {
      const kind = String(valve.props[OPERATOR_PROP[side]] ?? 'None');
      const linked = String(valve.props[SENSOR_PROP[side]] ?? '');
      return isMechanicalOperator(kind) && kind !== SOLENOID_OPERATOR && tags[side] ? [{ id: valve.id, side, tag: tags[side]!, kind, description: tr(`io.kinds.${KIND_NAME[kind] ?? 'pushbutton'}`), tripped: Boolean(linked && snapshot.sensors[linked]) }] : [];
    });
  });
  /** Solenoid coils are loads of the control circuit: read-only, lit while the valve end is energised (ladder or Control Board). */
  const valveSolenoids = components.filter(component => VALVE_SPECS[component.type]).flatMap(valve => {
    const tags = operatorTagsOf(valve, signalTags, sensorOptions);
    return (['left', 'right'] as const).flatMap(side => (String(valve.props[OPERATOR_PROP[side]] ?? 'None') === SOLENOID_OPERATOR && tags[side] ? [{ key: operatorKey(valve.id, side), tag: tags[side]!, on: Boolean(manualInputs[valve.id]?.[side]) }] : []));
  });
  const outputs = [
    ...valveSolenoids,
    ...ladderSolenoids.filter(part => !valveSolenoids.some(item => tagKey(item.tag) === tagKey(part.tag))).map(part => ({ key: `ladder:${tagKey(part.tag)}`, tag: part.tag, on: Boolean(ladder?.relay.result.solenoids[tagKey(part.tag)]) })),
  ];
  const cylinders = components.filter(component => snapshot.cylinders[component.id]);
  const motors = components.filter(component => snapshot.motors[component.id]);
  const reliefs = components.filter(component => snapshot.reliefValves[component.id]);
  const labelOf = (id: string) => components.find(component => component.id === id)?.label ?? id;

  return (
    <div className="w-full overflow-hidden rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line }} data-testid="fluid-io-module">
      <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
        <div className={CONTROL_SYSTEMS_HEADING}>{tr('io.title')}</div>
        <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.muted }}>{tr('io.digitalInputs')}</div>
      </div>
      <div style={{ display: 'grid', gap: 12, padding: 12 }}>
        {live && snapshot.diagnostics.length > 0 && (
          <section role="alert" data-testid="fluid-diagnostics" style={{ display: 'grid', gap: 6 }}>
            {snapshot.diagnostics.map(diagnostic => {
              const tone = diagnostic.severity === 'error' ? colors.danger : '#d97706';
              return (
                <div key={`${diagnostic.componentId}-${diagnostic.code}`} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${tone}66`, background: `${tone}14`, color: tone, borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                  <span>{labelOf(diagnostic.componentId)}</span>
                  <span>{tr(`diagnostics.${diagnostic.code}`)}</span>
                </div>
              );
            })}
          </section>
        )}
        <section data-testid="fluid-input-strip">
          {channels.length === 0 && supplies.length === 0 && ladderButtons.length === 0 ? (
            <div style={{ fontSize: 12, color: colors.muted }}>{tr('board.emptyInputs')}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {supplies.map(unit => {
                const on = unit.props.shutoff !== 'OFF';
                return (
                  <InputChannel
                    key={`${unit.id}:supply`}
                    colors={colors}
                    tag={unit.label}
                    description={tr('io.shutoff')}
                    active={on && (snapshot.portPressure[`${unit.id}:out`] ?? 0) > 0.05}
                    glow={SUPPLY_LIVE}
                    latched={on}
                    live
                    mode="toggle"
                    onPush={() => undefined}
                    onLatchToggle={() => onShutoffChange(unit.id, !on)}
                  />
                );
              })}
              {channels.map(channel => {
                const key = operatorKey(channel.id, channel.side);
                return (
                  <InputChannel
                    key={key}
                    colors={colors}
                    tag={channel.tag}
                    description={channel.description}
                    active={Boolean(manualInputs[channel.id]?.[channel.side]) || channel.tripped}
                    mode={channelModeOf(channel.kind)}
                    latched={Boolean(latched[key])}
                    live={live}
                    onPush={() => onPush(channel.id, channel.side)}
                    onLatchToggle={() => onLatchToggle(channel.id, channel.side)}
                  />
                );
              })}
              {ladder && ladderButtons.map(button => {
                const key = tagKey(button.tag);
                return (
                  <div key={`ladder:${key}`} data-testid="ladder-io-input">
                    <InputChannel
                      colors={colors}
                      tag={button.tag}
                      description={tr('io.kinds.pushbutton')}
                      active={Boolean(ladder.relay.pressed[key])}
                      mode="push-latch"
                      latched={Boolean(ladder.relay.latched[key])}
                      live={live}
                      onPush={() => ladder.relay.operate(button.tag, false)}
                      onLatchToggle={() => ladder.relay.operate(button.tag, true)}
                    />
                  </div>
                );
              })}
              {!live && <div style={{ fontSize: 11, color: colors.muted }}>{tr('board.pressRunInputs')}</div>}
            </div>
          )}
        </section>
        {outputs.length > 0 && (
          <section data-testid="fluid-digital-outputs">
            <div className="mae-panel-section-header" style={sectionTitle}>{tr('io.digitalOutputs')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
              {outputs.map(output => (
                <div key={output.key} data-testid="fluid-output-row" data-output={output.tag} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', border: `1px solid ${colors.line}`, borderRadius: 6, background: colors.panelAlt, minWidth: 0 }}>
                  <Lamp on={live && output.on} off={colors.line} />
                  <Tag label={output.tag} />
                  <span style={{ marginInlineStart: 'auto', fontSize: 9, fontWeight: 700, color: live && output.on ? ACTIVE_INDICATOR : colors.muted }}>{live && output.on ? '24 V' : '0 V'}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {cylinders.length > 0 && (
          <section>
            <div className="mae-panel-section-header" style={sectionTitle}>{tr('board.actuators')}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {cylinders.map(cylinder => {
                const state = snapshot.cylinders[cylinder.id];
                const pct = Math.round(state.stroke * 100);
                const [retracted, extended] = sensorTagsOf(cylinder, signalTags.sensors[cylinder.id]);
                return (
                  <div key={cylinder.id} style={{ ...readout(colors), flexWrap: 'wrap' }}>
                    <Tag label={cylinder.label} />
                    <span title={tr('board.retractExtend')} style={{ flex: 1, minWidth: 40, height: 6, borderRadius: 9999, background: colors.line, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: PRESSURE_SCALE[medium].high }} /></span>
                    <span style={{ color: colors.muted, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                    <span style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.muted }}>
                      <Lamp on={Boolean(snapshot.sensors[sensorId(cylinder.id, 'S1')])} off={colors.line} /><V3Math math={labelToLatex(retracted)} />
                      <Lamp on={Boolean(snapshot.sensors[sensorId(cylinder.id, 'S2')])} off={colors.line} /><V3Math math={labelToLatex(extended)} />
                      <span style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums' }}>{state.chamberPressureA.toFixed(1)} / {state.chamberPressureB.toFixed(1)} bar</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {(motors.length > 0 || reliefs.length > 0) && (
          <section>
            <div className="mae-panel-section-header" style={sectionTitle}>{tr('board.rotary')}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {motors.map(motor => {
                const state = snapshot.motors[motor.id];
                return (
                  <div key={motor.id} data-testid="fluid-tachometer" style={readout(colors)}>
                    <Tag label={motor.label} />
                    <Lamp on={state.rpm !== 0} off={colors.line} />
                    <span style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums' }}>{Math.round(state.rpm)} rpm</span>
                    <span style={{ color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>{Math.round(state.angle)}°</span>
                  </div>
                );
              })}
              {reliefs.map(valve => {
                const open = snapshot.reliefValves[valve.id].open;
                return (
                  <div key={valve.id} style={readout(colors)}>
                    <Tag label={valve.label} />
                    <Lamp on={open} off={colors.line} />
                    <span style={{ color: colors.muted }}>{open ? tr('board.relieving') : tr('board.closed')}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
