import { describe, expect, it } from 'vitest';
import { portsOf } from '@shared/fluid/engine/componentSolvers';
import { VALVE_TABLES } from '@shared/fluid/engine/valveTables';
import { FLUID_CATALOG, FLUID_LIBRARY_CATEGORIES, VALVE_SPECS, defaultFluidProps, getFluidDefinition, circuitOfTag, nextFluidTag } from './fluidCatalog';
import { isOnGrid } from './fluidGrid';
import { pressureColor } from './pressureColors';

describe('fluid catalog', () => {
  it('new valves are operable: pushbutton against a return spring, or a pilot on each end of a 3-position valve', () => {
    const two = defaultFluidProps(getFluidDefinition('valve-5-2')!);
    expect([two.actuationLeft, two.actuationRight]).toEqual(['Pushbutton', 'Spring Return']);
    const three = defaultFluidProps(getFluidDefinition('valve-5-3')!);
    expect([three.actuationLeft, three.actuationRight]).toEqual(['Pneumatic Pilot', 'Pneumatic Pilot']);
  });

  it('numbers parts by ISO stem', () => {
    expect(nextFluidTag('valve-3-2-nc', [])).toBe('1V1');
    expect(nextFluidTag('valve-3-2-nc', ['1V1', '1V3'])).toBe('1V4');
    expect(nextFluidTag('shuttle-valve', ['1V1'])).toBe('1V2');
    expect(nextFluidTag('cylinder-double', ['1A1'])).toBe('1A2');
    expect(nextFluidTag('hyd-pump', [])).toBe('0P1');
    expect(nextFluidTag('frl-detailed', [])).toBe('0Z1');
  });

  it('continues numbering inside the active branch and starts a fresh series for a new one', () => {
    expect(nextFluidTag('valve-3-2-nc', ['1V1', '2V1'], 2)).toBe('2V2');
    expect(nextFluidTag('valve-3-2-nc', ['1V1', '2V1', '2V2'], 2)).toBe('2V3');
    expect(nextFluidTag('valve-3-2-nc', ['1V1', '2V1'], 3)).toBe('3V1');
    expect(nextFluidTag('cylinder-double', ['1A1'], 2)).toBe('2A1');
    expect(nextFluidTag('frl-detailed', ['0Z1'], 2)).toBe('0Z2');
    expect(circuitOfTag('2V3')).toBe(2);
    expect(circuitOfTag('Clamp')).toBeUndefined();
  });

  it('hydraulic valves expose the tank line: ports P, T, A and B (3/2 valves P, T and A)', () => {
    const letters = (type: string) => {
      const def = getFluidDefinition(type)!;
      return def.portsFor({ ...defaultFluidProps(def), actuationLeft: 'None', actuationRight: 'None' }).map(p => p.lettering).sort();
    };
    for (const type of ['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float', 'hvalve-4-3-tandem']) expect(letters(type), type).toEqual(['A', 'B', 'P', 'T']);
    expect(letters('hvalve-3-2-nc')).toEqual(['A', 'P', 'T']);
    expect(getFluidDefinition('hvalve-4-3')!.portsFor({}).find(p => p.lettering === 'T')!.type).toBe('EXHAUST');
  });

  it('keeps each medium palette separate: hydraulics opens with its energy and return elements', () => {
    expect(Object.keys(FLUID_LIBRARY_CATEGORIES.HYDRAULIC)[0]).toBe('Power Supply & Tank');
    expect(FLUID_LIBRARY_CATEGORIES.HYDRAULIC['Power Supply & Tank'].map(item => item.id)).toEqual(['hyd-pump', 'hyd-tank', 'hyd-accumulator', 'hyd-filter', 'hyd-cooler']);
    expect(FLUID_LIBRARY_CATEGORIES.HYDRAULIC['Safety & Pressure Control'].map(item => item.id)).toEqual(['hyd-pressure-relief', 'hyd-reducing-valve', 'hyd-reducing-valve-3way']);
    expect(Object.keys(FLUID_LIBRARY_CATEGORIES.PNEUMATIC)).not.toContain('Power Supply & Tank');
  });

  it('hydraulic mode lists no pneumatic-only part and the pneumatic palette no hydraulic one', () => {
    const ids = (medium: 'PNEUMATIC' | 'HYDRAULIC') => Object.values(FLUID_LIBRARY_CATEGORIES[medium]).flat().map(item => item.id);
    for (const type of ['pressure-source', 'air-reservoir', 'frl-detailed', 'frl-simplified', 'valve-5-2', 'valve-5-3', 'valve-3-2-no', 'valve-2-2-no', 'valve-4-2', 'shuttle-valve', 'time-delay-valve', 'quick-exhaust', 'silencer', 'exhaust-port', 'air-motor-fixed']) {
      expect(ids('HYDRAULIC'), type).not.toContain(type);
    }
    for (const type of ids('HYDRAULIC')) expect(getFluidDefinition(type)!.media, type).toContain('HYDRAULIC');
    for (const type of ids('PNEUMATIC')) expect(getFluidDefinition(type)!.media, type).toContain('PNEUMATIC');
  });

  it('offers the 4-port valves first, with the three standard 4/3 neutrals', () => {
    expect(FLUID_LIBRARY_CATEGORIES.HYDRAULIC['Directional Control Valves'].map(item => item.id)).toEqual(['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float', 'hvalve-4-3-tandem', 'hvalve-3-2-nc']);
  });

  it('every port of every part sits on the 20 px grid, so wires land on grid nodes', () => {
    for (const entry of FLUID_CATALOG) {
      for (const port of entry.portsFor(defaultFluidProps(entry))) expect([isOnGrid(port.x), isOnGrid(port.y)], `${entry.type}.${port.id}`).toEqual([true, true]);
    }
  });

  it('gives shared supplies hydraulic pressure when placed in a hydraulic circuit', () => {
    const source = getFluidDefinition('pressure-source')!;
    expect(defaultFluidProps(source).pressure).toBe(6);
    expect(defaultFluidProps(source, 'HYDRAULIC').pressure).toBe(50);
  });
});

describe('catalog ↔ engine contract', () => {
  it('exposes the engine parameters under the names and defaults the engine reads', () => {
    const defaults = (type: string) => defaultFluidProps(getFluidDefinition(type)!);
    expect(defaults('flow-control').openingPercentage).toBe(100);
    expect(defaults('flow-control-oneway').openingPercentage).toBe(100);
    expect(defaults('sequence-ext').switchingPressure).toBe(4.5);
    expect(defaults('sequence-combo').switchingPressure).toBe(4.5);
    expect(defaults('hyd-pressure-relief').crackingPressure).toBe(60);
    expect(defaults('check-valve-spring').crackingPressure).toBe(0.2);
    expect(defaults('air-motor-variable')).toMatchObject({ speed: 3000, capacityRatio: 1 });
  });

  it('draws every valve from the engine flow tables', () => {
    for (const [type, spec] of Object.entries(VALVE_SPECS)) {
      expect(spec.cells).toBe(VALVE_TABLES[type].envelopes);
      expect(spec.positions).toBe(VALVE_TABLES[type].positions);
    }
  });

  it('every terminal a user can wire is a port the engine simulates', () => {
    const pilots = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
    for (const def of FLUID_CATALOG) {
      for (const props of [defaultFluidProps(def), { ...defaultFluidProps(def), ...pilots }]) {
        const simulated = portsOf({ id: 'c', type: def.type, props });
        const drawn = def.portsFor(props).map(port => port.id);
        expect(drawn.length, def.type).toBeGreaterThan(0);
        for (const id of drawn) expect(simulated, `${def.type}:${id}`).toContain(id);
      }
    }
  });
});

describe('pressure heat map', () => {
  it('colours pneumatic lines by pressure band', () => {
    expect(pressureColor(6, 'PNEUMATIC')).toBe('#0284c7');
    expect(pressureColor(4, 'PNEUMATIC')).toBe('#0284c7');
    expect(pressureColor(2.5, 'PNEUMATIC')).toBe('#38bdf8');
    expect(pressureColor(0, 'PNEUMATIC')).toBe('#94a3b8');
  });

  it('colours hydraulic lines by pressure band', () => {
    expect(pressureColor(50, 'HYDRAULIC')).toBe('#b91c1c');
    expect(pressureColor(20, 'HYDRAULIC')).toBe('#ea580c');
    expect(pressureColor(0, 'HYDRAULIC')).toBe('#64748b');
  });
});
