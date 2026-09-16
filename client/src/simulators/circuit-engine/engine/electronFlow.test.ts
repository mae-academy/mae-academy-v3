import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../models/circuitTypes';
import { TabDSimulationEngine } from './analogSimulation';
import { SimulationEngine } from './simulation';
import { getDotsOnPath, pathLength } from '../models/wiring';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label: id,
  props,
});

const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string, path: [number, number][] = [[0, 0], [40, 0]]): CircuitWire => ({
  id,
  fromComp,
  fromTerm,
  toComp,
  toTerm,
  routing: 'orthogonal',
  path,
});

describe('Electron Flow & Branch Current Physics', () => {
  it('strictly halts current and phase drift when circuit is open (open switch)', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('SW1', 'sw-spst-no', { state: 'open' }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_src_sw', 'V1', 'pos', 'SW1', 'a'),
      wire('w_sw_r', 'SW1', 'b', 'R1', 'a'),
      wire('w_r_gnd', 'R1', 'b', 'GND', 'gnd'),
      wire('w_src_gnd', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    const snap0 = engine.step(0.016);
    const snap1 = engine.step(0.016);

    // Wires across the open branch must have zero current
    expect(snap1.wireCurrents['w_sw_r']).toBe(0);
    expect(snap1.wireCurrents['w_r_gnd']).toBe(0);

    // Phases must not advance on open circuit
    const p0 = snap0.wirePhases?.['w_sw_r'] ?? 0;
    const p1 = snap1.wirePhases?.['w_sw_r'] ?? 0;
    expect(p1 - p0).toBe(0);
  });

  it('guarantees identical current and continuous flow before and after a component', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 10 }),
      component('R1', 'resistor', { resistance: 500 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_before', 'V1', 'pos', 'R1', 'a'),
      wire('w_after', 'R1', 'b', 'V1', 'neg'),
      wire('w_gnd', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    const snap = engine.step(0.016);
    const iBefore = snap.wireCurrents['w_before'];
    const iAfter = snap.wireCurrents['w_after'];

    // In a series circuit with 10V and 500 Ohm, current is 20 mA = 0.02 A
    expect(Math.abs(iBefore)).toBeCloseTo(0.02, 4);
    expect(Math.abs(iAfter)).toBeCloseTo(0.02, 4);

    // Both wires must have positive direction (V1:pos -> R1:a, and R1:b -> V1:neg)
    expect(iBefore).toBeGreaterThan(0);
    expect(iAfter).toBeGreaterThan(0);
    expect(iBefore).toBeCloseTo(iAfter, 6);
  });

  it('proves relative speed scaling: higher branch current visibly and smoothly moves faster', () => {
    // Two parallel branches: R_heavy = 100 Ohm (0.1 A), R_light = 1000 Ohm (0.01 A)
    const components = [
      component('V1', 'dc-voltage', { voltage: 10 }),
      component('R_heavy', 'resistor', { resistance: 100 }),
      component('R_light', 'resistor', { resistance: 1000 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_h1', 'V1', 'pos', 'R_heavy', 'a'),
      wire('w_h2', 'R_heavy', 'b', 'V1', 'neg'),
      wire('w_l1', 'V1', 'pos', 'R_light', 'a'),
      wire('w_l2', 'R_light', 'b', 'V1', 'neg'),
      wire('w_gnd', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    const snap0 = engine.step(0.016);
    const snap1 = engine.step(0.016);

    const diffHeavy = (snap1.wirePhases?.['w_h1'] ?? 0) - (snap0.wirePhases?.['w_h1'] ?? 0);
    const diffLight = (snap1.wirePhases?.['w_l1'] ?? 0) - (snap0.wirePhases?.['w_l1'] ?? 0);

    // R_heavy branch carries 0.1 A, R_light branch carries 0.01 A
    expect(snap1.wireCurrents['w_h1']).toBeCloseTo(0.1, 3);
    expect(snap1.wireCurrents['w_l1']).toBeCloseTo(0.01, 3);

    // Higher current branch MUST advance faster than lower current branch
    expect(diffHeavy).toBeGreaterThan(diffLight);

    // Both must be positive and bounded (smooth, non-strobing)
    expect(diffLight).toBeGreaterThan(0);
    expect(diffHeavy).toBeLessThan(0.1); // at 0.016s, 2.4 cycles/s * 0.016s ~ 0.0384 cycles
  });

  it('getDotsOnPath shifts uniformly by dot spacing, ensuring equal velocity regardless of wire length', () => {
    const shortPath: [number, number][] = [[0, 0], [40, 0]]; // 40 px -> 1 dot
    const longPath: [number, number][] = [[0, 0], [400, 0]]; // 400 px -> 10 dots

    const shortDots0 = getDotsOnPath(shortPath, 1, 0);
    const shortDots1 = getDotsOnPath(shortPath, 1, 0.5);

    const longDots0 = getDotsOnPath(longPath, 10, 0);
    const longDots1 = getDotsOnPath(longPath, 10, 0.5);

    // In 0.5 phase increment, short wire dot moves 20 px
    const shortDrift = shortDots1[0][0] - shortDots0[0][0];
    // In 0.5 phase increment, long wire first dot also moves exactly 20 px
    const longDrift = longDots1[0][0] - longDots0[0][0];

    expect(shortDrift).toBeCloseTo(20, 2);
    expect(longDrift).toBeCloseTo(20, 2);
  });
});
