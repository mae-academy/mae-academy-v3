import { describe, expect, it } from 'vitest';
import { measureResistanceWithTestSource, SimulationEngine } from '@/simulators/circuit-engine/engine/simulation';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';

describe('Tab B DMM resistance test-source method', () => {
  it('reports a 12-ohm branch as 12 base ohms with a 1 A test current', () => {
    const circuit: MNAElement[] = [{ type: 'resistor', id: 'R12', positive: 'probe-hi', negative: '0', resistance: 12 }];
    expect(measureResistanceWithTestSource(circuit, 'probe-hi', '0')).toBeCloseTo(12, 10);
  });

  it('deactivates independent voltage sources before applying the resistance test', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vs', positive: 'probe-hi', negative: '0', voltage: 24 },
      { type: 'resistor', id: 'R12', positive: 'probe-hi', negative: '0', resistance: 12 },
    ];
    expect(measureResistanceWithTestSource(circuit, 'probe-hi', '0')).toBeCloseTo(0, 10);
  });
});

describe('Coil-driven relay contact actuation', () => {
  const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
  const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

  it('flips a 12 V relay SPDT from NC to NO the instant a closed switch applies 12 V DC across its coil, with no manual override', () => {
    const components = [
      component('VC', 'dc-voltage', { voltage: 12 }),
      component('SW', 'sw-spst-no', { state: 'open' }),
      component('K1', 'relay-spdt', { coilVoltage: 12, coilR: 400 }),
      component('VL', 'dc-voltage', { voltage: 10 }),
      component('R_NO', 'resistor', { resistance: 1000 }),
      component('R_NC', 'resistor', { resistance: 1000 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('c1', 'VC', 'pos', 'SW', 'a'), wire('c2', 'SW', 'b', 'K1', 'coil+'),
      wire('c3', 'VC', 'neg', 'K1', 'coil-'), wire('c4', 'VC', 'neg', 'GND', 'gnd'),
      wire('l1', 'VL', 'pos', 'K1', 'com'), wire('l2', 'VL', 'neg', 'GND', 'gnd'),
      wire('no1', 'K1', 'no', 'R_NO', 'a'), wire('no2', 'R_NO', 'b', 'GND', 'gnd'),
      wire('nc1', 'K1', 'nc', 'R_NC', 'a'), wire('nc2', 'R_NC', 'b', 'GND', 'gnd'),
    ];
    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);

    // Coil de-energized (switch open): NC conducts, NO is open — the relay's normal resting state.
    let snapshot = engine.step(1e-3);
    expect(snapshot.branchCurrents.R_NC).toBeGreaterThan(0.009);
    expect(Math.abs(snapshot.branchCurrents.R_NO ?? 0)).toBeLessThan(1e-6);

    // Closing SW applies the full 12 V coil rating — no click on the relay itself, purely coil-driven.
    const energized = components.map(item => item.id === 'SW' ? { ...item, props: { state: 'closed' } } : item);
    engine.setCircuit(energized, wires);
    engine.step(1e-3);
    snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.branchCurrents.R_NO).toBeGreaterThan(0.009);
    expect(Math.abs(snapshot.branchCurrents.R_NC ?? 0)).toBeLessThan(1e-6);

    // Reopening SW de-energizes the coil and the contacts revert immediately, still with no manual state set anywhere.
    engine.setCircuit(components, wires);
    engine.step(1e-3);
    snapshot = engine.step(1e-3);
    expect(snapshot.branchCurrents.R_NC).toBeGreaterThan(0.009);
    expect(Math.abs(snapshot.branchCurrents.R_NO ?? 0)).toBeLessThan(1e-6);
    expect(components.every(item => item.props.manualState === undefined)).toBe(true);
  });
});
