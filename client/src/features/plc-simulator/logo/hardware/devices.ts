import type { Bit } from '../engine/types';

/** Bench voltage classes (spec §1.1): each maps to one Basic unit variant. */
export type DeviceClass = '230RC' | '12/24RC';

export interface DeviceSpec {
  readonly id: DeviceClass;
  readonly model: string;
  readonly supply: {
    readonly kind: 'AC' | 'DC';
    readonly volts: number;
    /** Hot conductor label: phase L1 or L+. */
    readonly hot: 'L1' | 'L+';
    /** Return conductor label: neutral N or ground M. */
    readonly ret: 'N' | 'M';
  };
  /** Digital input thresholds, volts (spec §1.3): below `low` reads 0, above `high` reads 1. */
  readonly threshold: { readonly low: number; readonly high: number };
  /**
   * Isolated input groups. On the 230RC, I1-I4 and I5-I8 may sit on different phases but one group
   * may never mix phases (spec §1.2).
   */
  readonly inputGroups: readonly (readonly number[])[];
  /** Relay contact rating per terminal, amperes. */
  readonly relayAmps: number;
}

export const DEVICES: Readonly<Record<DeviceClass, DeviceSpec>> = {
  '230RC': {
    id: '230RC',
    model: 'LOGO! 230RC',
    supply: { kind: 'AC', volts: 230, hot: 'L1', ret: 'N' },
    threshold: { low: 40, high: 79 },
    inputGroups: [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ],
    relayAmps: 10,
  },
  '12/24RC': {
    id: '12/24RC',
    model: 'LOGO! 12/24RC',
    supply: { kind: 'DC', volts: 24, hot: 'L+', ret: 'M' },
    threshold: { low: 5, high: 8 },
    inputGroups: [[1, 2, 3, 4, 5, 6, 7, 8]],
    relayAmps: 10,
  },
};

/** Basic unit I/O: 8 inputs, 4 relay outputs (spec §1.1). */
export const BASIC_INPUTS = 8;
export const BASIC_OUTPUTS = 4;

/**
 * Terminal voltage -> logic level. Inside the undefined band between the two thresholds the input
 * stage does not switch, so the previous level is held.
 */
export function classifyInput(volts: number, spec: DeviceSpec, previous: Bit): Bit {
  const magnitude = Math.abs(volts);
  if (magnitude < spec.threshold.low) return 0;
  if (magnitude > spec.threshold.high) return 1;
  return previous;
}

// ---- field devices -----------------------------------------------------------------------------

export type ActuatorKind = 'pushbutton' | 'switch' | 'limit' | 'sensor' | 'spare';
export type ContactType = 'NO' | 'NC';

export interface InputDevice {
  readonly kind: ActuatorKind;
  readonly contact: ContactType;
  /** Plant designation, e.g. `S1`, `B2`. */
  readonly symbol: string;
  /** Function tag shown on the bench. */
  readonly tag: string;
}

/** Pushbuttons spring back when released; every other actuator stays where it was put. */
export const isMomentary = (device: InputDevice): boolean => device.kind === 'pushbutton';

/** A make contact (NO) closes when actuated; a break contact (NC) opens. */
export const contactClosed = (device: InputDevice, actuated: boolean): boolean => device.kind !== 'spare' && actuated !== (device.contact === 'NC');

/** Field devices offered by the per-input configuration menu. A PIR sensor is a make contact only. */
export const INPUT_DEVICE_OPTIONS: readonly { readonly kind: ActuatorKind; readonly contact: ContactType; readonly label: string }[] = [
  { kind: 'pushbutton', contact: 'NO', label: 'Pushbutton · NO' },
  { kind: 'pushbutton', contact: 'NC', label: 'Pushbutton · NC' },
  { kind: 'switch', contact: 'NO', label: 'Latching switch · NO' },
  { kind: 'switch', contact: 'NC', label: 'Latching switch · NC' },
  { kind: 'limit', contact: 'NO', label: 'Limit switch · NO' },
  { kind: 'limit', contact: 'NC', label: 'Limit switch · NC' },
  { kind: 'sensor', contact: 'NO', label: 'PIR motion sensor · NO' },
  { kind: 'spare', contact: 'NO', label: 'Spare · unused input' },
];

export type LoadKind = 'lamp' | 'contactor' | 'beacon' | 'motor' | 'none';

export interface OutputLoad {
  readonly kind: LoadKind;
  readonly symbol: string;
  readonly tag: string;
}

export const ACTUATOR_LABEL: Readonly<Record<ActuatorKind, string>> = {
  pushbutton: 'pushbutton',
  switch: 'latching switch',
  limit: 'limit switch',
  sensor: 'motion sensor',
  spare: 'spare input',
};

/** What can hang across a relay contact, with the plant-designation prefix and default tag of each. */
export const LOAD_OPTIONS: readonly { readonly kind: LoadKind; readonly label: string; readonly prefix: string; readonly tag: string }[] = [
  { kind: 'lamp', label: 'Pilot indicator lamp', prefix: 'H', tag: 'Pilot lamp' },
  { kind: 'contactor', label: 'Contactor drive coil', prefix: 'K', tag: 'Contactor coil' },
  { kind: 'beacon', label: 'Warning flashing beacon', prefix: 'H', tag: 'Warning beacon' },
  { kind: 'motor', label: 'Motor', prefix: 'M', tag: 'Motor' },
  { kind: 'none', label: 'Spare · open circuit', prefix: 'X', tag: 'Open circuit' },
];

export function loadOf(kind: LoadKind, channel: number): OutputLoad {
  const option = LOAD_OPTIONS.find((candidate) => candidate.kind === kind) ?? LOAD_OPTIONS[0];
  return { kind: option?.kind ?? 'lamp', symbol: `${option?.prefix ?? 'H'}${channel}`, tag: option?.tag ?? 'Pilot lamp' };
}
