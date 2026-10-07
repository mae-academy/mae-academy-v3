/**
 * Couples the relay ladder to the pneumatic schematic.
 *
 * Fluid → electrical: a cylinder's limit switches (the engine's `snapshot.sensors`) become the signals of the ladder's
 * sensor contacts, matched by tag (1B1, 1B2 …).
 * Electrical → fluid: a ladder solenoid whose tag equals the tag of a valve end driven by a Solenoid operator (1Y1, 1Y2 …)
 * energises that end. Both directions only exchange tags, so renaming a sensor or solenoid on either side re-couples them.
 */
import { OPERATOR_PROP } from '@shared/fluid/engine/componentSolvers';
import type { OperatorSide } from '@shared/fluid/engine/types';
import { VALVE_SPECS, type FluidProps } from './fluidCatalog';
import type { SensorOption } from './sensorCoupling';
import { SOLENOID_OPERATOR, operatorKey, operatorTagsOf, type SignalTags } from './signalTags';
import { tagKey } from './relayLadder';

interface Part { id: string; type: string; label: string; props: FluidProps }

const SIDES: OperatorSide[] = ['left', 'right'];

/** Sensor signals for the ladder, by lower-cased tag; a tag shared by several limit switches is made when any of them is. */
export function sensorSignals(options: SensorOption[], sensors: Record<string, boolean>): Record<string, boolean> {
  const signals: Record<string, boolean> = {};
  for (const option of options) {
    const key = tagKey(option.tag);
    signals[key] = Boolean(signals[key]) || Boolean(sensors[option.value]);
  }
  return signals;
}

export interface SolenoidTarget {
  componentId: string;
  side: OperatorSide;
  /** Designation of the solenoid on the valve end (1Y1). */
  tag: string;
  /** Key of the end in the engine's manual inputs. */
  key: string;
}

/** Every valve end driven by a solenoid, in canvas order. */
export function solenoidTargets(parts: Part[], tags: SignalTags, options: SensorOption[]): SolenoidTarget[] {
  return parts.filter(part => VALVE_SPECS[part.type]).flatMap(valve => {
    const designations = operatorTagsOf(valve, tags, options);
    return SIDES.flatMap(side => {
      const tag = designations[side];
      return valve.props[OPERATOR_PROP[side]] === SOLENOID_OPERATOR && tag ? [{ componentId: valve.id, side, tag, key: operatorKey(valve.id, side) }] : [];
    });
  });
}

/** Which valve ends the energised ladder solenoids hold on, keyed `valveId:side` (false for every solenoid end that is not). */
export function solenoidDrive(targets: SolenoidTarget[], energised: Record<string, boolean>): Record<string, boolean> {
  const drive: Record<string, boolean> = {};
  for (const target of targets) drive[target.key] = Boolean(energised[tagKey(target.tag)]);
  return drive;
}

/** Designations a person may pick for new ladder elements: limit switches of the schematic, solenoid ends of its valves. */
export const knownSensorTags = (options: SensorOption[]): string[] => Array.from(new Set(options.map(option => option.tag)));
export const knownSolenoidTags = (targets: SolenoidTarget[]): string[] => Array.from(new Set(targets.map(target => target.tag)));
