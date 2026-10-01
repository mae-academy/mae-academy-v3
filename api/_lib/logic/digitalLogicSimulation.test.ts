import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../../../shared/logic/circuitTypes';
import { COMPONENT_DEFS } from '../../../shared/logic/componentDefs';
import { DigitalLogicSimulationEngine } from './digitalLogicSimulation';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('Digital Logic Design cloned runtime binding', () => {
  it('routes a grounded V-R circuit through the documented solver and exposes the DMM observation payload', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 10 }),
      component('R1', 'resistor', { resistance: 1000 }),
      component('GND', 'ground'),
      component('DMM1', 'dmm', { mode: 'DCV' }),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'R1', 'a'),
      wire('w2', 'R1', 'b', 'V1', 'neg'),
      wire('w3', 'R1', 'b', 'GND', 'gnd'),
      wire('w4', 'DMM1', 'hi', 'R1', 'a'),
      wire('w5', 'DMM1', 'com', 'GND', 'gnd'),
    ];
    const engine = new DigitalLogicSimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(1e-3);
    const observable = engine.getObservableOperatingPoint();

    expect(snapshot.converged).toBe(true);
    expect(snapshot.instrumentReadings.DMM1).toMatchObject({ value: 10, unit: 'V', status: 'ready' });
    expect(Object.values(observable.Yn).some(node => Math.abs(node.iS - 10) < 1e-10)).toBe(true);
    expect(observable.Di.R1.iR).toBeCloseTo(0.01, 10);
  });

  it('updates a delayed digital AND macromodel after its two high-level input sources settle', () => {
    const components = [
      component('A', 'digital-input', { state: 'HIGH', highVoltage: 5 }),
      component('B', 'digital-input', { state: 'HIGH', highVoltage: 5 }),
      component('G1', 'gate-and', { threshold: 2.5, highVoltage: 5, delay: 0 }),
      component('OUT', 'digital-output'), component('GND', 'ground'),
    ];
    const wires = [
      wire('a0', 'A', 'gnd', 'GND', 'gnd'), wire('b0', 'B', 'gnd', 'GND', 'gnd'), wire('g0', 'G1', 'gnd', 'GND', 'gnd'), wire('o0', 'OUT', 'gnd', 'GND', 'gnd'),
      wire('a1', 'A', 'out', 'G1', 'a'), wire('b1', 'B', 'out', 'G1', 'b'), wire('y', 'G1', 'y', 'OUT', 'in'),
    ];
    const engine = new DigitalLogicSimulationEngine();
    engine.setCircuit(components, wires);
    engine.step(1e-3);
    const settled = engine.step(1e-3);
    expect(settled.converged).toBe(true);
    expect(settled.terminalVoltages['G1:y']).toBeCloseTo(5, 8);
  });

  it('measures a resistance through the DMM 1 mA educational test-source model', () => {
    const components = [component('R1', 'resistor', { resistance: 1000 }), component('DMM1', 'dmm', { mode: 'OHM' }), component('GND', 'ground')];
    const wires = [wire('r0', 'R1', 'b', 'GND', 'gnd'), wire('d0', 'DMM1', 'hi', 'R1', 'a'), wire('d1', 'DMM1', 'com', 'GND', 'gnd')];
    const engine = new DigitalLogicSimulationEngine(); engine.setCircuit(components, wires);
    const snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.instrumentReadings.DMM1).toMatchObject({ unit: 'Ω', status: 'ready' });
    expect(snapshot.instrumentReadings.DMM1.value).toBeCloseTo(1000, 4);
  });

  it('maps an ideal transformer turns ratio through its dependent-source macromodel', () => {
    const components = [component('V1', 'dc-voltage', { voltage: 12 }), component('T1', 'transformer', { turnRatio: 2 }), component('R1', 'resistor', { resistance: 1000 }), component('GND', 'ground')];
    const wires = [
      wire('p1', 'V1', 'pos', 'T1', 'p1'), wire('p2', 'V1', 'neg', 'T1', 'p2'), wire('g1', 'V1', 'neg', 'GND', 'gnd'),
      wire('s1', 'T1', 's1', 'R1', 'a'), wire('s2', 'T1', 's2', 'R1', 'b'), wire('g2', 'R1', 'b', 'GND', 'gnd'),
    ];
    const engine = new DigitalLogicSimulationEngine(); engine.setCircuit(components, wires);
    const snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.terminalVoltages['T1:s1'] - snapshot.terminalVoltages['T1:s2']).toBeCloseTo(6, 8);
  });

  it('closes a relay contact after its coil reaches pickup voltage and preserves the contact state', () => {
    const components = [
      component('VC', 'dc-voltage', { voltage: 12 }), component('VL', 'dc-voltage', { voltage: 10 }), component('K1', 'relay-spst', { coilVoltage: 12, coilR: 400, contactType: 'NO' }), component('R1', 'resistor', { resistance: 1000 }), component('GND', 'ground'),
    ];
    const wires = [
      wire('c1', 'VC', 'pos', 'K1', 'coil+'), wire('c2', 'VC', 'neg', 'K1', 'coil-'), wire('c3', 'VC', 'neg', 'GND', 'gnd'),
      wire('l1', 'VL', 'pos', 'K1', 'com'), wire('l2', 'VL', 'neg', 'GND', 'gnd'), wire('l3', 'K1', 'no', 'R1', 'a'), wire('l4', 'R1', 'b', 'GND', 'gnd'),
    ];
    const engine = new DigitalLogicSimulationEngine(); engine.setCircuit(components, wires);
    engine.step(1e-3);
    expect((engine as unknown as { tabDRelayStates: Map<string, boolean> }).tabDRelayStates.get('K1')).toBe(true);
    engine.step(1e-3);
    const settled = engine.step(1e-3);
    expect(settled.converged).toBe(true);
    expect(settled.branchCurrents.R1).toBeGreaterThan(0.009);
  });

  it('maps every visible cloned library component to a model path without a hidden fallback', () => {
    const allComponents = Object.keys(COMPONENT_DEFS).filter(type => type !== 'ground').map((type, index) => component(`C${index}`, type));
    const engine = new DigitalLogicSimulationEngine();
    engine.setCircuit([component('GND', 'ground'), ...allComponents], []);
    const compiled = (engine as unknown as { compileDocumentedPrimitives: () => unknown }).compileDocumentedPrimitives();
    expect(compiled).not.toBeNull();
  });

  it('binds the smart diode material to the documented nonlinear model', () => {
    expect(COMPONENT_DEFS.diode.properties.material).toMatchObject({ label: 'Material / Type', options: ['ideal', 'silicon', 'germanium', 'gaas'] });
    const silicon = [component('V1', 'dc-voltage', { voltage: 1 }), component('R1', 'resistor', { resistance: 1000 }), component('D1', 'diode', { material: 'silicon' }), component('GND', 'ground')];
    const germanium = silicon.map(item => item.id === 'D1' ? { ...item, props: { material: 'germanium' } } : item);
    const links = [wire('v', 'V1', 'pos', 'R1', 'a'), wire('r', 'R1', 'b', 'D1', 'anode'), wire('d', 'D1', 'cathode', 'GND', 'gnd'), wire('g', 'V1', 'neg', 'GND', 'gnd')];
    const siEngine = new DigitalLogicSimulationEngine(); siEngine.setCircuit(silicon, links);
    const geEngine = new DigitalLogicSimulationEngine(); geEngine.setCircuit(germanium, links);
    const si = siEngine.step(1e-3); const ge = geEngine.step(1e-3);
    expect(si.converged).toBe(true);
    expect(ge.converged).toBe(true);
    expect(Math.abs(ge.branchCurrents.R1)).toBeGreaterThan(Math.abs(si.branchCurrents.R1));
  });
});
