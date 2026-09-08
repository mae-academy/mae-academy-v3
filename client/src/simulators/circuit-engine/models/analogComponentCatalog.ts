import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';

/** Components intentionally excluded from the documented Tab D learner catalog only. */
export const TAB_D_EXCLUDED_COMPONENT_IDS = new Set([
  'scr', 'diac', 'triac',
  'digital-input', 'digital-output', 'gate-and', 'gate-or', 'gate-not',
  'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor',
  'sw-dpdt',
]);

export function isTabDComponentAvailable(componentId: string): boolean {
  return !TAB_D_EXCLUDED_COMPONENT_IDS.has(componentId);
}

export function filterTabDCatalog<T extends { id: string }>(items: readonly T[]): T[] {
  return items.filter((item) => isTabDComponentAvailable(item.id));
}

export function filterTabDImportedComponents(components: readonly CircuitComponent[]): CircuitComponent[] {
  return components.filter((component) => isTabDComponentAvailable(component.type));
}
