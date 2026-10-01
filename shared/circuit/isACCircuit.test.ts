import { describe, expect, it } from 'vitest';
import { isACCircuit, AC_COMPONENT_TYPES } from './isACCircuit';
import type { CircuitComponent } from './circuitTypes';

function makeComp(type: string, id = 'c1'): CircuitComponent {
  return {
    id,
    type,
    x: 0,
    y: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    label: id,
    props: {},
  };
}

describe('isACCircuit detection helper', () => {
  it('returns false for empty or null component collections', () => {
    expect(isACCircuit([])).toBe(false);
    expect(isACCircuit(null)).toBe(false);
    expect(isACCircuit(undefined)).toBe(false);
  });

  it('returns false for pure DC circuits', () => {
    const dcComponents: CircuitComponent[] = [
      makeComp('ground', 'gnd'),
      makeComp('dc-voltage', 'v1'),
      makeComp('resistor', 'r1'),
      makeComp('resistor', 'r2'),
      makeComp('dc-current', 'i1'),
      makeComp('vccs', 'g1'),
      makeComp('vcvs', 'e1'),
      makeComp('cccs', 'f1'),
      makeComp('ccvs', 'h1'),
      makeComp('diode', 'd1'),
    ];
    expect(isACCircuit(dcComponents)).toBe(false);
  });

  it('detects capacitors', () => {
    const circuit: CircuitComponent[] = [
      makeComp('resistor', 'r1'),
      makeComp('capacitor', 'c1'),
      makeComp('dc-voltage', 'v1'),
    ];
    expect(isACCircuit(circuit)).toBe(true);
  });

  it('detects inductors', () => {
    const circuit: CircuitComponent[] = [
      makeComp('resistor', 'r1'),
      makeComp('inductor', 'l1'),
    ];
    expect(isACCircuit(circuit)).toBe(true);
  });

  it('detects AC voltage sources across type name variants', () => {
    expect(isACCircuit([makeComp('ac-voltage')])).toBe(true);
    expect(isACCircuit([makeComp('ac_voltage')])).toBe(true);
    expect(isACCircuit([makeComp('ac_voltage_source')])).toBe(true);
    expect(isACCircuit([makeComp('vac')])).toBe(true);
  });

  it('detects AC current sources across type name variants', () => {
    expect(isACCircuit([makeComp('ac-current')])).toBe(true);
    expect(isACCircuit([makeComp('ac_current')])).toBe(true);
    expect(isACCircuit([makeComp('ac_current_source')])).toBe(true);
    expect(isACCircuit([makeComp('iac')])).toBe(true);
  });

  it('detects transformers and coupled inductors', () => {
    expect(isACCircuit([makeComp('transformer')])).toBe(true);
    expect(isACCircuit([makeComp('transformer-ct')])).toBe(true);
    expect(isACCircuit([makeComp('autotransformer')])).toBe(true);
    expect(isACCircuit([makeComp('coupled-inductor')])).toBe(true);
  });

  it('detects complex impedance and three-phase sources', () => {
    expect(isACCircuit([makeComp('impedance')])).toBe(true);
    expect(isACCircuit([makeComp('three-phase-source')])).toBe(true);
    expect(isACCircuit([makeComp('three-phase-rail')])).toBe(true);
  });
});
