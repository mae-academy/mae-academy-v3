/**
 * Branch inheritance by wiring. A part that has never been piped (a "floating" part) carries only a provisional tag from the
 * active branch. The moment it is piped to a part of circuit n ≥ 1 it joins that circuit: 1V3 wired to 2A1 becomes 2V1 (or the next
 * free 2Vm). Parts whose tag was typed by hand, and energy parts (circuit 0), never change.
 */
import type { SchematicComponent, SchematicWire } from '@/components/common/schematic/schematicTypes';
import { circuitOfTag, getFluidDefinition, nextFluidTag } from './fluidCatalog';

/** Set on a part when its reference was edited by hand. */
export const MANUAL_TAG_PROP = '_manualTag';

const isEnergyPart = (type: string) => (getFluidDefinition(type)?.isoCode ?? '1').startsWith('0');

/** New tags (by part id) caused by `added` joining the schematic; `before` are the pipes that existed without it. */
export function inheritBranchTags(components: SchematicComponent[], before: SchematicWire[], added: SchematicWire): Array<{ id: string; label: string }> {
  const byId = new Map(components.map(component => [component.id, component]));
  const ends = [[added.fromComp, added.toComp], [added.toComp, added.fromComp]] as const;
  const result: Array<{ id: string; label: string }> = [];
  for (const [selfId, otherId] of ends) {
    const self = byId.get(selfId);
    const other = byId.get(otherId);
    if (!self || !other || self.id === other.id) continue;
    const piped = (part: SchematicComponent) => before.some(wire => wire.fromComp === part.id || wire.toComp === part.id);
    const branch = circuitOfTag(other.label);
    const anchored = Boolean(other.props[MANUAL_TAG_PROP]) || piped(other);
    if (piped(self) || !anchored || self.props[MANUAL_TAG_PROP] || isEnergyPart(self.type) || !branch || circuitOfTag(self.label) === branch) continue;
    const taken = components.filter(component => component.id !== self.id).map(component => component.label);
    result.push({ id: self.id, label: nextFluidTag(self.type, taken, branch) });
  }
  return result;
}
