import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from './circuitTypes';
import { filterTabDCatalog, filterTabDImportedComponents, isTabDComponentAvailable } from './analogComponentCatalog';

const component = (type: string): CircuitComponent => ({ id: type, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: type, props: {} });

describe('Tab D catalog policy', () => {
  it('excludes DIAC and TRIAC from the documented learner catalog while SCR is temporarily available', () => {
    expect(['diac', 'triac'].every((id) => !isTabDComponentAvailable(id))).toBe(true);
    expect(isTabDComponentAvailable('scr')).toBe(true);
    expect(isTabDComponentAvailable('opamp')).toBe(true);
    expect(filterTabDCatalog([{ id: 'diac' }, { id: 'diode' }, { id: 'triac' }]).map((item: { id: string }) => item.id)).toEqual(['diode']);
  });

  it('removes excluded power semiconductors from a Tab D NAD import while retaining valid components', () => {
    expect(filterTabDImportedComponents([component('diac'), component('resistor'), component('triac'), component('opamp')]).map((item: CircuitComponent) => item.type)).toEqual(['resistor', 'opamp']);
  });

  it('excludes digital inputs, outputs, and all requested logic-gate families', () => {
    const forbidden = ['digital-input', 'digital-output', 'gate-and', 'gate-or', 'gate-not', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'];
    expect(forbidden.every((id) => !isTabDComponentAvailable(id))).toBe(true);
    expect(filterTabDCatalog([...forbidden, 'resistor', 'ground'].map((id) => ({ id })))).toEqual([{ id: 'resistor' }, { id: 'ground' }]);
  });
});
