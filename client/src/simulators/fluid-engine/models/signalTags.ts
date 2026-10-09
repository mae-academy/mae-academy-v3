/**
 * ISO 1219-2 designations of the signal devices attached to a circuit, derived from the schematic so they never need typing:
 * manual operators and cam-operated valves take `nSm` (circuit n, running m); cylinder position sensors take `nBm`; solenoids take `nYm`. The circuit number is the one
 * in the valve's or cylinder's own tag (1V1 → 1, 2A1 → 2).
 */
import { OPERATOR_PROP, SENSOR_PROP, isMechanicalOperator } from '@shared/fluid/engine/componentSolvers';
import type { OperatorSide } from '@shared/fluid/engine/types';
import type { FluidProps } from './fluidCatalog';
import { VALVE_SPECS } from './fluidCatalog';
import { customOperatorTag, isCylinder, linkedSensorTags, type SensorOption } from './sensorCoupling';

interface Part { id: string; type: string; label: string; props: FluidProps }

export const SOLENOID_OPERATOR = 'Solenoid';
export const SERVICE_UNIT = 'service-unit';
/** Hydraulic power unit: its shut-off is an input too, but carries no 0S tag of its own. */
export const POWER_UNIT = 'hyd-power-unit';
/** Operators a person drives directly; the rest (plunger, rollers) are driven by a moving machine part. */
export const MANUAL_OPERATORS = ['Pushbutton', 'Hand Lever', 'Detent Lever', 'Foot Pedal'];
const SIDES: OperatorSide[] = ['left', 'right'];

export const operatorKey = (id: string, side: OperatorSide) => `${id}:${side}`;
const circuitOf = (label: string) => /^(\d+)/.exec(label)?.[1] ?? '0';

export interface SignalTags {
  /** Tag of each valve end's operator, keyed `valveId:side` (rollers coupled to a limit switch take that switch's tag instead). */
  operators: Record<string, string>;
  /** Default [retract, extend] tags of each cylinder, keyed by cylinder id. */
  sensors: Record<string, [string, string]>;
}

export function assignSignalTags(parts: Part[]): SignalTags {
  const operators: SignalTags['operators'] = {};
  const sensors: SignalTags['sensors'] = {};
  const next: Record<string, { s: number; y: number; b: number }> = {};
  const counter = (circuit: string) => (next[circuit] ??= { s: 0, y: 0, b: 0 });
  const valves = parts.filter(part => VALVE_SPECS[part.type]);
  const operatorsWhere = (test: (kind: string, linked: boolean) => boolean) => valves.flatMap(valve => SIDES.flatMap(side => {
    const kind = String(valve.props[OPERATOR_PROP[side]] ?? 'None');
    const linked = Boolean(valve.props[SENSOR_PROP[side]]);
    return isMechanicalOperator(kind) && test(kind, linked) ? [{ valve, side }] : [];
  }));

  for (const { valve, side } of operatorsWhere(kind => kind === SOLENOID_OPERATOR)) operators[operatorKey(valve.id, side)] = `${circuitOf(valve.label)}Y${++counter(circuitOf(valve.label)).y}`;
  // The main service unit's integrated shut-off valve is the circuit-0 manual input: 0S1, 0S2, …
  for (const unit of parts.filter(part => part.type === SERVICE_UNIT)) operators[operatorKey(unit.id, 'right')] = `0S${++counter('0').s}`;
  for (const { valve, side } of operatorsWhere(kind => MANUAL_OPERATORS.includes(kind))) operators[operatorKey(valve.id, side)] = `${circuitOf(valve.label)}S${++counter(circuitOf(valve.label)).s}`;
  for (const cylinder of parts.filter(isCylinder)) {
    const c = counter(circuitOf(cylinder.label));
    sensors[cylinder.id] = [`${circuitOf(cylinder.label)}B${++c.b}`, `${circuitOf(cylinder.label)}B${++c.b}`];
  }
  // Rollers and plungers that no limit switch drives are limit-switch devices of their own.
  for (const { valve, side } of operatorsWhere((kind, linked) => kind !== SOLENOID_OPERATOR && !MANUAL_OPERATORS.includes(kind) && !linked)) {
    operators[operatorKey(valve.id, side)] = `${circuitOf(valve.label)}S${++counter(circuitOf(valve.label)).s}`;
  }
  return { operators, sensors };
}

/** Tag drawn beside each driven end of a valve: the one typed in the inspector, else the coupled limit switch's, else the operator's own ISO tag. */
export function operatorTagsOf(valve: Part, tags: SignalTags, options: SensorOption[]): Partial<Record<OperatorSide, string>> {
  if (valve.type === SERVICE_UNIT) return tags.operators[operatorKey(valve.id, 'right')] ? { right: tags.operators[operatorKey(valve.id, 'right')] } : {};
  const linked = linkedSensorTags(valve.props, options);
  const result: Partial<Record<OperatorSide, string>> = {};
  for (const side of SIDES) {
    if (!isMechanicalOperator(valve.props[OPERATOR_PROP[side]])) continue;
    const tag = customOperatorTag(valve.props, side) || linked[side] || tags.operators[operatorKey(valve.id, side)];
    if (tag) result[side] = tag;
  }
  return result;
}
