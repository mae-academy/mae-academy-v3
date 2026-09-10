import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from './circuitTypes';
import { filterTabDCatalog, filterTabDImportedComponents, isTabDComponentAvailable } from './analogComponentCatalog';

const component = (type: string): CircuitComponent => ({ id: type, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: type, props: {} });

describe('Tab D catalog policy', () => {
  it('includes SCR, op-amp, DIAC, and TRIAC in Power Semiconductors category and catalog', () => {
    expect(['scr', 'op-amp', 'diac', 'triac'].every((id) => isTabDComponentAvailable(id))).toBe(true);
    expect(isTabDComponentAvailable('opamp')).toBe(true);
    expect(filterTabDCatalog([{ id: 'diac' }, { id: 'diode' }, { id: 'triac' }]).map((item: { id: string }) => item.id)).toEqual(['diac', 'diode', 'triac']);
  });

  it('retains power semiconductors in a Tab D NAD import', () => {
    expect(filterTabDImportedComponents([component('diac'), component('resistor'), component('triac'), component('opamp')]).map((item: CircuitComponent) => item.type)).toEqual(['diac', 'resistor', 'triac', 'opamp']);
  });

  it('excludes digital inputs, outputs, and all requested logic-gate families', () => {
    const forbidden = ['digital-input', 'digital-output', 'gate-and', 'gate-or', 'gate-not', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'];
    expect(forbidden.every((id) => !isTabDComponentAvailable(id))).toBe(true);
    expect(filterTabDCatalog([...forbidden, 'resistor', 'ground'].map((id) => ({ id })))).toEqual([{ id: 'resistor' }, { id: 'ground' }]);
  });
});
