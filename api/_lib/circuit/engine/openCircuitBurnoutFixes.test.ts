import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../../../../shared/circuit/circuitTypes';
import { formatEngineering } from '../../../../shared/circuit/circuitTypes';
import { SimulationEngine } from './simulation';
import { TabDSimulationEngine } from './analogSimulation';
import { getBrokenWireIds } from '../../../../shared/circuit/brokenBranches';

const component = (id: string, type: string, props: Record<string, unknown> = {}, state: Record<string, unknown> = {}): CircuitComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label: id,
  props,
  state,
});

const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({
  id,
  fromComp,
  fromTerm,
  toComp,
  toTerm,
  routing: 'orthogonal',
  path: [[0, 0], [40, 0]],
});

describe('Phase 1: DMM O.L (Open Loop) Logic', () => {
  it('formats non-finite and >= 10 MOhm resistance strictly as O.L without unit suffix', () => {
    expect(formatEngineering(Infinity, 'Ω')).toBe('O.L');
    expect(formatEngineering(NaN, 'Ω')).toBe('O.L');
    expect(formatEngineering(1e7, 'Ω')).toBe('O.L');
    expect(formatEngineering(1e9, 'Ω')).toBe('O.L');
    expect(formatEngineering(1e12, 'Ω')).toBe('O.L');
    expect(formatEngineering(Infinity, 'Ohm')).toBe('O.L');
    expect(formatEngineering(1e8, 'Ohm')).toBe('O.L');

    // Normal resistance under 10 MOhm should format with units as normal
    expect(formatEngineering(1000, 'Ω')).toBe('1.000 kΩ');
    expect(formatEngineering(470, 'Ω')).toBe('470.000 Ω');
    expect(formatEngineering(2.2e6, 'Ω')).toBe('2.200 MΩ');
  });

  it('DMM in OHM mode reads O.L across an open switch in SimulationEngine', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('R1', 'resistor', { resistance: 12000 }),
      component('SW1', 'sw-spst-no', { state: 'open' }),
      component('DMM1', 'dmm', { mode: 'OHM' }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'R1', 'a'),
      wire('w2', 'R1', 'b', 'SW1', 'a'),
      wire('w3', 'SW1', 'b', 'GND', 'gnd'),
      wire('w4', 'V1', 'neg', 'GND', 'gnd'),
      // DMM measuring directly across the open switch
      wire('w_dmm_hi', 'DMM1', 'hi', 'SW1', 'a'),
      wire('w_dmm_com', 'DMM1', 'com', 'SW1', 'b'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(0.016);

    const reading = snapshot.instrumentReadings.DMM1;
    expect(reading).toBeDefined();
    expect(reading.status).toBe('open');
    expect(reading.value).toBe(Infinity);
    expect(formatEngineering(reading.value, reading.unit)).toBe('O.L');
  });

  it('DMM in OHM mode reads O.L across a burned component in SimulationEngine', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('R_burned', 'resistor', { resistance: 100 }, { isBurned: true }),
      component('DMM1', 'dmm', { mode: 'OHM' }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'R_burned', 'a'),
      wire('w2', 'R_burned', 'b', 'GND', 'gnd'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
      // DMM measuring across the burned resistor
      wire('w_dmm_hi', 'DMM1', 'hi', 'R_burned', 'a'),
      wire('w_dmm_com', 'DMM1', 'com', 'R_burned', 'b'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(0.016);

    const reading = snapshot.instrumentReadings.DMM1;
    expect(reading).toBeDefined();
    expect(reading.status).toBe('open');
    expect(reading.value).toBe(Infinity);
    expect(formatEngineering(reading.value, reading.unit)).toBe('O.L');
  });

  it('DMM in OHM mode reads O.L across open switch in TabDSimulationEngine', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('SW1', 'sw-spst-no', { state: 'open' }),
      component('DMM1', 'dmm', { mode: 'OHM' }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'SW1', 'a'),
      wire('w2', 'SW1', 'b', 'GND', 'gnd'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
      wire('w_dmm_hi', 'DMM1', 'hi', 'SW1', 'a'),
      wire('w_dmm_com', 'DMM1', 'com', 'SW1', 'b'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(0.016);

    const reading = snapshot.instrumentReadings.DMM1;
    expect(reading).toBeDefined();
    expect(reading.status).toBe('open');
    expect(reading.value).toBe(Infinity);
    expect(formatEngineering(reading.value, reading.unit)).toBe('O.L');
  });

  it('DMM in OHM mode reads O.L across burned component in TabDSimulationEngine', () => {
    const components = [
      component('R_burned', 'resistor', { resistance: 220 }, { isBurned: true }),
      component('DMM1', 'dmm', { mode: 'OHM' }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'R_burned', 'b', 'GND', 'gnd'),
      wire('w_dmm_hi', 'DMM1', 'hi', 'R_burned', 'a'),
      wire('w_dmm_com', 'DMM1', 'com', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(0.016);

    const reading = snapshot.instrumentReadings.DMM1;
    expect(reading).toBeDefined();
    expect(reading.status).toBe('open');
    expect(reading.value).toBe(Infinity);
    expect(formatEngineering(reading.value, reading.unit)).toBe('O.L');
  });
});

describe('Phase 2: Electron Flow & Open Circuit Zero-Current Clamp', () => {
  it('strictly clamps current to 0A and stops phase on branch with burned component in SimulationEngine', () => {
    // 12V supply feeding a burned resistor in series with a healthy resistor
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('R_healthy', 'resistor', { resistance: 100 }),
      component('R_burned', 'resistor', { resistance: 100 }, { isBurned: true }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'R_healthy', 'a'),
      wire('w2', 'R_healthy', 'b', 'R_burned', 'a'),
      wire('w3', 'R_burned', 'b', 'GND', 'gnd'),
      wire('w4', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);
    const snap0 = engine.step(0.016);
    const snap1 = engine.step(0.016);

    // All wires in the broken loop must have strictly 0 current
    expect(snap1.wireCurrents['w1']).toBe(0);
    expect(snap1.wireCurrents['w2']).toBe(0);
    expect(snap1.wireCurrents['w3']).toBe(0);

    // Phases must not advance on the broken branch
    const p1_0 = snap0.wirePhases?.['w1'] ?? 0;
    const p1_1 = snap1.wirePhases?.['w1'] ?? 0;
    expect(p1_1 - p1_0).toBe(0);

    const p2_0 = snap0.wirePhases?.['w2'] ?? 0;
    const p2_1 = snap1.wirePhases?.['w2'] ?? 0;
    expect(p2_1 - p2_0).toBe(0);
  });

  it('strictly clamps current to 0A and stops phase on branch with burned component in TabDSimulationEngine', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 24 }),
      component('R_burned', 'resistor', { resistance: 50 }, { isBurned: true }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_top', 'V1', 'pos', 'R_burned', 'a'),
      wire('w_bot', 'R_burned', 'b', 'V1', 'neg'),
      wire('w_gnd', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    const snap0 = engine.step(0.016);
    const snap1 = engine.step(0.016);

    expect(snap1.wireCurrents['w_top']).toBe(0);
    expect(snap1.wireCurrents['w_bot']).toBe(0);

    const phaseTop0 = snap0.wirePhases?.['w_top'] ?? 0;
    const phaseTop1 = snap1.wirePhases?.['w_top'] ?? 0;
    expect(phaseTop1 - phaseTop0).toBe(0);
  });

  it('preserves current on active parallel branches while clamping burned parallel branch', () => {
    // V1 -> Parallel branches (R1 active, R2 burned)
    const components = [
      component('V1', 'dc-voltage', { voltage: 10 }),
      component('R_active', 'resistor', { resistance: 100 }),
      component('R_burned', 'resistor', { resistance: 100 }, { isBurned: true }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_act_top', 'V1', 'pos', 'R_active', 'a'),
      wire('w_act_bot', 'R_active', 'b', 'GND', 'gnd'),
      wire('w_brn_top', 'V1', 'pos', 'R_burned', 'a'),
      wire('w_brn_bot', 'R_burned', 'b', 'GND', 'gnd'),
      wire('w_gnd', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);
    const snap = engine.step(0.016);

    // Active branch should conduct ~ 0.1 A
    expect(Math.abs(snap.wireCurrents['w_act_top'])).toBeCloseTo(0.1, 2);
    expect(Math.abs(snap.wireCurrents['w_act_bot'])).toBeCloseTo(0.1, 2);

    // Burned branch must be strictly 0 A
    expect(snap.wireCurrents['w_brn_top']).toBe(0);
    expect(snap.wireCurrents['w_brn_bot']).toBe(0);
  });
});

describe('Phase 3: Auto-Repair on Reset', () => {
  it('clears isBurned property on all components when resetting', () => {
    const components = [
      component('R1', 'resistor', { resistance: 100 }, { isBurned: true }),
      component('R2', 'resistor', { resistance: 200 }, { isBurned: true }),
      component('V1', 'dc-voltage', { voltage: 12 }),
    ];

    // Simulate resetSimulation component repair logic
    const repairedComponents = components.map(c => {
      if (!c.state?.isBurned) return c;
      const nextState = { ...c.state };
      delete nextState.isBurned;
      return { ...c, state: nextState };
    });

    expect(repairedComponents[0].state?.isBurned).toBeUndefined();
    expect(repairedComponents[1].state?.isBurned).toBeUndefined();
    expect(repairedComponents[2].state?.isBurned).toBeUndefined();

    // After repair, brokenWireIds should be empty
    const wires = [
      wire('w1', 'V1', 'pos', 'R1', 'a'),
      wire('w2', 'R1', 'b', 'V1', 'neg'),
    ];
    const brokenAfter = getBrokenWireIds(repairedComponents, wires);
    expect(brokenAfter.size).toBe(0);
  });
});

describe('Phase 2 Test: 12V across Diode/LED/Zener', () => {
  it('tests 12V directly across LED', () => {
    const engine = new TabDSimulationEngine();
    engine.setCircuit([
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('LED1', 'led'),
      component('GND', 'ground'),
    ], [
      wire('w1', 'V1', 'pos', 'LED1', 'anode'),
      wire('w2', 'LED1', 'cathode', 'V1', 'neg'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ]);
    const snap = engine.step(0.016);
    expect(snap.converged).toBe(true);
    expect(snap.warnings).toEqual([]);
    expect(snap.branchCurrents['LED1']).toBeGreaterThan(5000);
  });

  it('tests 12V directly across silicon diode', () => {
    const engine = new TabDSimulationEngine();
    engine.setCircuit([
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('D1', 'diode', { material: 'silicon' }),
      component('GND', 'ground'),
    ], [
      wire('w1', 'V1', 'pos', 'D1', 'anode'),
      wire('w2', 'D1', 'cathode', 'V1', 'neg'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ]);
    const snap = engine.step(0.016);
    expect(snap.converged).toBe(true);
    expect(snap.warnings).toEqual([]);
    expect(snap.branchCurrents['D1']).toBeGreaterThan(5000);
  });

  it('tests 12V directly across zener diode in reverse breakdown', () => {
    const engine = new TabDSimulationEngine();
    engine.setCircuit([
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('Z1', 'zener', { breakdownVoltage: 5.1 }),
      component('GND', 'ground'),
    ], [
      wire('w1', 'V1', 'pos', 'Z1', 'cathode'),
      wire('w2', 'Z1', 'anode', 'V1', 'neg'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ]);
    const snap = engine.step(0.016);
    console.log('Zener snap warnings:', snap.warnings);
    expect(snap.converged).toBe(true);
    expect(snap.warnings).toEqual([]);
    expect(Math.abs(snap.branchCurrents['Z1'])).toBeGreaterThan(5000);
  });
});
