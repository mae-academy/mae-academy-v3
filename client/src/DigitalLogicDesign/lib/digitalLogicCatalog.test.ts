import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from './circuitTypes';
import { filterTabDCatalog, filterTabDImportedComponents, isTabDComponentAvailable } from './digitalLogicCatalog';

const component = (type: string): CircuitComponent => ({ id: type, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: type, props: {} });

describe('Tab D catalog policy', () => {
  it('excludes SCR, DIAC, and TRIAC from the documented learner catalog only', () => {
    expect(['scr', 'diac', 'triac'].every((id) => !isTabDComponentAvailable(id))).toBe(true);
    expect(isTabDComponentAvailable('opamp')).toBe(true);
    expect(filterTabDCatalog([{ id: 'scr' }, { id: 'diode' }, { id: 'triac' }]).map((item) => item.id)).toEqual(['diode']);
  });

  it('removes excluded power semiconductors from a Tab D NAD import while retaining valid components', () => {
    expect(filterTabDImportedComponents([component('scr'), component('resistor'), component('diac'), component('opamp')]).map((item) => item.type)).toEqual(['resistor', 'opamp']);
  });
});
