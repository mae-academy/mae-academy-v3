import type { CircuitComponent } from '@/simulators/digital-logic/models/circuitTypes';
import { COMPONENT_DEFS, type ComponentDef } from '@/simulators/digital-logic/models/componentDefs';

/** Components intentionally excluded from the documented Tab D learner catalog only. */
export const TAB_D_EXCLUDED_COMPONENT_IDS = new Set(['scr', 'diac', 'triac']);

export function isTabDComponentAvailable(componentId: string): boolean {
  return !TAB_D_EXCLUDED_COMPONENT_IDS.has(componentId);
}

export function filterTabDCatalog<T extends { id: string }>(items: readonly T[]): T[] {
  return items.filter((item) => isTabDComponentAvailable(item.id));
}

export function filterTabDImportedComponents(components: readonly CircuitComponent[]): CircuitComponent[] {
  return components.filter((component) => isTabDComponentAvailable(component.type));
}

export const DIGITAL_LOGIC_CATEGORIES = [
  'Inputs & Probes',
  'Logic Gates',
  'Combinational Circuits',
  'Sequential Circuits',
] as const;

export type DigitalLogicCategory = typeof DIGITAL_LOGIC_CATEGORIES[number];

export const DIGITAL_LOGIC_CATEGORY_MAP: Record<DigitalLogicCategory, string[]> = {
  'Inputs & Probes': [
    'digital-input',
    'digital-output',
    'logic-clock',
  ],
  'Logic Gates': [
    'gate-and',
    'gate-or',
    'gate-not',
    'gate-nand',
    'gate-nor',
    'gate-xor',
    'gate-xnor',
  ],
  'Combinational Circuits': [
    'logic-half-adder',
    'logic-full-adder',
    'logic-half-subtractor',
    'logic-full-subtractor',
    'logic-comparator',
    'logic-mux',
    'logic-demux',
    'logic-encoder',
    'logic-decoder',
    'logic-nbit-adder',
    'logic-parity',
    'logic-alu-4bit',
  ],
  'Sequential Circuits': [
    'logic-ff-d',
    'logic-ff-jk',
    'logic-ff-sr',
    'logic-ff-t',
    'logic-counter',
    'logic-shift-register',
    'logic-nbit-register',
    'logic-frequency-divider',
    'logic-ram-16x8',
    'logic-rom-16x8',
  ],
};

export function getDigitalLogicCategory(componentId: string): DigitalLogicCategory | null {
  for (const [category, ids] of Object.entries(DIGITAL_LOGIC_CATEGORY_MAP)) {
    if (ids.includes(componentId)) {
      return category as DigitalLogicCategory;
    }
  }
  return null;
}

export function getDigitalLogicComponentsByCategory(category: DigitalLogicCategory): ComponentDef[] {
  const ids = DIGITAL_LOGIC_CATEGORY_MAP[category] ?? [];
  return ids
    .map(id => COMPONENT_DEFS[id])
    .filter((def): def is ComponentDef => Boolean(def));
}

export function getAllDigitalLogicComponentDefs(): ComponentDef[] {
  return DIGITAL_LOGIC_CATEGORIES.flatMap(cat => getDigitalLogicComponentsByCategory(cat));
}
