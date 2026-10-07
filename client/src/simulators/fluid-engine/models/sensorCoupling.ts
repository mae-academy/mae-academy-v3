/**
 * Limit-switch tagging and coupling for the canvas.
 *
 * Every cylinder carries two position sensors the engine reports as `${cylinderId}:S1` (retracted)
 * and `${cylinderId}:S2` (extended). Their visible tags are editable; valve ends are linked to a
 * sensor by its engine id, so renaming a tag never breaks a link.
 */
import { OPERATOR_PROP, SENSOR_PROP, cylinderMetaOf } from '@shared/fluid/engine/componentSolvers';
import { sensorId } from '@shared/fluid/engine/FluidEngine';
import type { OperatorSide } from '@shared/fluid/engine/types';
import { VALVE_SPECS, type FluidProps } from './fluidCatalog';

interface Part { id: string; type: string; label: string; props: FluidProps }

export const RETRACT_TAG_PROP = 'retractTag';
export const EXTEND_TAG_PROP = 'extendTag';

/** Operators a limit switch can drive: rollers ride on the cylinder's cam, a pilot end is fed by a reed switch. */
export const SENSOR_LINKABLE_OPERATORS = ['Roller', 'Idle-Return Roller', 'Pneumatic Pilot'];
export const isSensorLinkable = (kind: unknown): boolean => SENSOR_LINKABLE_OPERATORS.includes(String(kind));

export const isCylinder = (part: Pick<Part, 'id' | 'type' | 'props'>): boolean => Boolean(cylinderMetaOf(part));

/** Tags are typed with or without the KaTeX `$…$` delimiters; they are stored bare (`1B2`). */
export const normalizeTag = (value: string): string => value.replace(/\$/g, '').trim();

/** DIN / ISO 1219-2 position sensors (B): 1A1 → 1B1 / 1B2, 1A2 → 1B3 / 1B4, 2A1 → 2B1 / 2B2. */
export function defaultSensorTags(label: string): [string, string] {
  const match = /^(\d+)A(\d+)$/.exec(label);
  if (!match) return [`${label}-B1`, `${label}-B2`];
  const index = Number(match[2]);
  return [`${match[1]}B${2 * index - 1}`, `${match[1]}B${2 * index}`];
}

/** [retract tag, extend tag] of a cylinder: the edited names, or the defaults where a name is unset or blank. */
export function sensorTagsOf(cylinder: Pick<Part, 'label' | 'props'>, automatic?: [string, string]): [string, string] {
  const [retract, extend] = automatic ?? defaultSensorTags(cylinder.label);
  const named = (key: string, fallback: string) => {
    const value = typeof cylinder.props[key] === 'string' ? normalizeTag(String(cylinder.props[key])) : '';
    return value !== '' ? value : fallback;
  };
  return [named(RETRACT_TAG_PROP, retract), named(EXTEND_TAG_PROP, extend)];
}

export interface SensorOption {
  /** Engine sensor id, stored on the linked valve. */
  value: string;
  tag: string;
  cylinderId: string;
  cylinderLabel: string;
  end: 'retracted' | 'extended';
}

/** Every limit switch in the schematic, in component order. */
export function listSensorOptions(parts: Part[], automatic: Record<string, [string, string]> = {}): SensorOption[] {
  return parts.filter(isCylinder).flatMap(cylinder => {
    const [retract, extend] = sensorTagsOf(cylinder, automatic[cylinder.id]);
    return [
      { value: sensorId(cylinder.id, 'S1'), tag: retract, cylinderId: cylinder.id, cylinderLabel: cylinder.label, end: 'retracted' as const },
      { value: sensorId(cylinder.id, 'S2'), tag: extend, cylinderId: cylinder.id, cylinderLabel: cylinder.label, end: 'extended' as const },
    ];
  });
}

/** Ends of a valve whose current operator can be coupled to a limit switch. */
export function linkableSides(props: FluidProps): OperatorSide[] {
  return (['left', 'right'] as const).filter(side => isSensorLinkable(props[OPERATOR_PROP[side]]));
}

/** Engine sensor id linked to one end of a valve, or '' when unlinked. */
export function linkedSensor(props: FluidProps, side: OperatorSide): string {
  const value = props[SENSOR_PROP[side]];
  return typeof value === 'string' ? value : '';
}

/** Links (or, with '', unlinks) one end of a valve. */
export function setLinkedSensor(props: FluidProps, side: OperatorSide, value: string): FluidProps {
  const { [SENSOR_PROP[side]]: _previous, ...rest } = props;
  return value ? { ...rest, [SENSOR_PROP[side]]: value } : rest;
}

/** Changes a valve property; swapping an operator for one that cannot be coupled drops that end's link. */
export function setValveProperty(props: FluidProps, key: string, value: unknown): FluidProps {
  const next = { ...props, [key]: value };
  const side = (['left', 'right'] as const).find(candidate => OPERATOR_PROP[candidate] === key);
  return side && !isSensorLinkable(value) ? setLinkedSensor(next, side, '') : next;
}

/** Tag shown beside each linked end of a valve (links to sensors that no longer exist are omitted). */
export function linkedSensorTags(props: FluidProps, options: SensorOption[]): Partial<Record<OperatorSide, string>> {
  const tags: Partial<Record<OperatorSide, string>> = {};
  for (const side of linkableSides(props)) {
    const option = options.find(candidate => candidate.value === linkedSensor(props, side));
    if (option) tags[side] = option.tag;
  }
  return tags;
}

/** Property holding the tag a person typed for the operator on one end of a valve (`leftTag` / `rightTag`). */
export const OPERATOR_TAG_PROP: Record<OperatorSide, string> = { left: 'leftTag', right: 'rightTag' };

/** The edited tag of a valve end's operator, or '' while it is left on its automatic ISO tag. */
export function customOperatorTag(props: FluidProps, side: OperatorSide): string {
  const value = props[OPERATOR_TAG_PROP[side]];
  return typeof value === 'string' ? normalizeTag(value) : '';
}

/** Operators that ride a cam on a cylinder: a tag shared with a position sensor couples them mechanically. */
export const ROLLER_OPERATORS = ['Roller', 'Idle-Return Roller'];

/**
 * Mechanical trip linkage by tag: a roller end whose tag equals the tag of exactly one position sensor (a roller tagged `1B2`
 * sits on the cam at the extended end of the cylinder whose sensor is `1B2`) is linked to that sensor. A link picked in the
 * inspector wins; an ambiguous tag links nothing. Parts come back untouched (same array) when nothing needed resolving.
 */
export function resolveTagLinks<T extends Part>(parts: T[], options: SensorOption[]): T[] {
  const sensorsByTag = new Map<string, SensorOption[]>();
  for (const option of options) {
    const key = option.tag.toLowerCase();
    sensorsByTag.set(key, [...(sensorsByTag.get(key) ?? []), option]);
  }
  let changed = false;
  const resolved = parts.map(part => {
    if (!VALVE_SPECS[part.type]) return part;
    let props = part.props;
    for (const side of ['left', 'right'] as const) {
      if (!ROLLER_OPERATORS.includes(String(part.props[OPERATOR_PROP[side]])) || options.some(option => option.value === linkedSensor(part.props, side))) continue;
      const tag = customOperatorTag(part.props, side);
      const matches = tag ? sensorsByTag.get(tag.toLowerCase()) : undefined;
      if (matches?.length === 1) props = setLinkedSensor(props, side, matches[0].value);
    }
    if (props === part.props) return part;
    changed = true;
    return { ...part, props };
  });
  return changed ? resolved : parts;
}
