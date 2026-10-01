import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../../../../shared/circuit/circuitTypes';
import { COMPONENT_DEFS } from '../../../../shared/circuit/componentDefs';
import { TabDSimulationEngine } from './analogSimulation';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('Tab D documented runtime binding', () => {
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
    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(1e-3);
    const observable = engine.getObservableOperatingPoint();

    expect(snapshot.converged).toBe(true);
    expect(snapshot.instrumentReadings.DMM1).toMatchObject({ value: 10, unit: 'V', status: 'ready' });
    expect(Object.values(observable.Yn).some((node: any) => Math.abs(node.iS - 10) < 1e-10)).toBe(true);
    expect(observable.Di.R1.iR).toBeCloseTo(0.01, 10);
  });

  it('uses the positive-only DC rail as a 24 V source against the explicit ground reference', () => {
    const components = [component('RAIL', 'dc-rail', { voltage: 24 }), component('R1', 'resistor', { resistance: 1000 }), component('GND', 'ground')];
    const wires = [wire('w1', 'RAIL', 'pos', 'R1', 'a'), wire('w2', 'R1', 'b', 'GND', 'gnd')];
    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.terminalVoltages['RAIL:pos']).toBeCloseTo(24, 8);
    expect(snapshot.terminalVoltages['RAIL:neg']).toBeUndefined();
    expect(Math.abs(snapshot.branchCurrents.R1)).toBeCloseTo(0.024, 8);
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
      wire('a1', 'A', 'out', 'G1', 'a'), wire('b1', 'B', 'out', 'G1', 'b'), wire('y', 'G1', 'out', 'OUT', 'in'),
    ];
    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    engine.step(1e-3);
    const settled = engine.step(1e-3);
    expect(settled.converged).toBe(true);
    expect(settled.terminalVoltages['G1:out']).toBeCloseTo(5, 8);
  });

  it('measures a resistance through the DMM 1 mA educational test-source model', () => {
    const components = [component('R1', 'resistor', { resistance: 1000 }), component('DMM1', 'dmm', { mode: 'OHM' }), component('GND', 'ground')];
    const wires = [wire('r0', 'R1', 'b', 'GND', 'gnd'), wire('d0', 'DMM1', 'hi', 'R1', 'a'), wire('d1', 'DMM1', 'com', 'GND', 'gnd')];
    const engine = new TabDSimulationEngine(); engine.setCircuit(components, wires);
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
    const engine = new TabDSimulationEngine(); engine.setCircuit(components, wires);
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
    const engine = new TabDSimulationEngine(); engine.setCircuit(components, wires);
    engine.step(1e-3);
    expect((engine as unknown as { tabDRelayStates: Map<string, boolean> }).tabDRelayStates.get('K1')).toBe(true);
    engine.step(1e-3);
    const settled = engine.step(1e-3);
    expect(settled.converged).toBe(true);
    expect(settled.branchCurrents.R1).toBeGreaterThan(0.009);
  });

  it('maps every visible Tab D library component to a model path without a hidden fallback', () => {
    const allComponents = Object.keys(COMPONENT_DEFS).filter(type => type !== 'ground').map((type, index) => component(`C${index}`, type));
    const engine = new TabDSimulationEngine();
    engine.setCircuit([component('GND', 'ground'), ...allComponents], []);
    const compiled = (engine as unknown as { compileDocumentedPrimitives: () => unknown }).compileDocumentedPrimitives();
    expect(compiled).not.toBeNull();
  });

  it('binds the smart diode material to the documented nonlinear model', () => {
    expect(COMPONENT_DEFS.diode.properties.material).toMatchObject({ label: 'Material / Type', options: ['ideal', 'silicon', 'germanium', 'gaas'] });
    const silicon = [component('V1', 'dc-voltage', { voltage: 1 }), component('R1', 'resistor', { resistance: 1000 }), component('D1', 'diode', { material: 'silicon' }), component('GND', 'ground')];
    const germanium = silicon.map(item => item.id === 'D1' ? { ...item, props: { material: 'germanium' } } : item);
    const links = [wire('v', 'V1', 'pos', 'R1', 'a'), wire('r', 'R1', 'b', 'D1', 'anode'), wire('d', 'D1', 'cathode', 'GND', 'gnd'), wire('g', 'V1', 'neg', 'GND', 'gnd')];
    const siEngine = new TabDSimulationEngine(); siEngine.setCircuit(silicon, links);
    const geEngine = new TabDSimulationEngine(); geEngine.setCircuit(germanium, links);
    const si = siEngine.step(1e-3); const ge = geEngine.step(1e-3);
    expect(si.converged).toBe(true);
    expect(ge.converged).toBe(true);
    expect(Math.abs(ge.branchCurrents.R1)).toBeGreaterThan(Math.abs(si.branchCurrents.R1));
  });

  it('returns a TAB_D_MNA snapshot warning for a documented circuit without an explicit ground', () => {
    const engine = new TabDSimulationEngine();
    engine.setCircuit(
      [component('V1', 'dc-voltage', { voltage: 5 }), component('R1', 'resistor', { resistance: 1000 })],
      [wire('w1', 'V1', 'pos', 'R1', 'a'), wire('w2', 'V1', 'neg', 'R1', 'b')],
    );

    const snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(false);
    expect(snapshot.warnings).toEqual([expect.objectContaining({ code: 'TAB_D_MNA', message: expect.stringMatching(/ground reference/i) })]);
  });

  it('turns parallel conflicting ideal voltage sources into a guarded TAB_D_MNA snapshot warning', () => {
    const engine = new TabDSimulationEngine();
    engine.setCircuit(
      [component('V5', 'dc-voltage', { voltage: 5 }), component('V12', 'dc-voltage', { voltage: 12 }), component('GND', 'ground')],
      [
        wire('pos', 'V5', 'pos', 'V12', 'pos'),
        wire('neg1', 'V5', 'neg', 'GND', 'gnd'),
        wire('neg2', 'V12', 'neg', 'GND', 'gnd'),
      ],
    );

    const snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(false);
    expect(snapshot.warnings).toEqual([expect.objectContaining({ code: 'TAB_D_MNA', message: expect.stringMatching(/singular|conflicting/i) })]);
  });

  it('allows extreme diode bias to converge cleanly with massive current via parasitic Rs without solver crash', () => {
    const engine = new TabDSimulationEngine();
    engine.setCircuit(
      [component('V1', 'dc-voltage', { voltage: 1000 }), component('D1', 'diode', { material: 'silicon' }), component('GND', 'ground')],
      [wire('supply', 'V1', 'pos', 'D1', 'anode'), wire('return1', 'V1', 'neg', 'GND', 'gnd'), wire('return2', 'D1', 'cathode', 'GND', 'gnd')],
    );

    const snapshot = engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.warnings.filter(w => w.message.includes('Newton-Raphson'))).toEqual([]);
    expect(Math.abs(snapshot.branchCurrents.D1)).toBeGreaterThan(1000);
  });

  it('computes stable RMS values for AC voltmeter, ammeter, and DMM ACV/ACA modes', () => {
    // 10 V peak AC source at 50 Hz across 100 Ohm resistor -> 100 mA peak
    const components = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 50 }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
      component('VM1', 'voltmeter', { mode: 'AC' }),
      component('AM1', 'ammeter', { mode: 'AC' }),
      component('DMM1', 'dmm', { mode: 'ACV' }),
    ];
    const wires = [
      wire('w1', 'VAC', 'pos', 'AM1', 'pos'),
      wire('w2', 'AM1', 'neg', 'R1', 'a'),
      wire('w3', 'R1', 'b', 'VAC', 'neg'),
      wire('w4', 'VAC', 'neg', 'GND', 'gnd'),
      wire('w5', 'VM1', 'pos', 'R1', 'a'),
      wire('w6', 'VM1', 'neg', 'R1', 'b'),
      wire('w7', 'DMM1', 'hi', 'R1', 'a'),
      wire('w8', 'DMM1', 'com', 'R1', 'b'),
    ];
    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Step through 600 ms to allow the True RMS integrator and 0.5s Display Hold to lock
    let lastSnapshot = engine.step(1e-3);
    for (let i = 0; i < 600; i++) {
      lastSnapshot = engine.step(1e-3);
    }

    expect(lastSnapshot.converged).toBe(true);
    // 10 V peak sine true RMS is ~7.07 V
    expect(lastSnapshot.instrumentReadings.VM1.value).toBeGreaterThan(6.0);
    expect(lastSnapshot.instrumentReadings.VM1.value).toBeLessThan(7.5);
    expect(lastSnapshot.instrumentReadings.DMM1.value).toBeCloseTo(lastSnapshot.instrumentReadings.VM1.value, 2);
    // 0.1 A peak sine true RMS is ~0.0707 A
    expect(lastSnapshot.instrumentReadings.AM1.value).toBeGreaterThan(0.06);
    expect(lastSnapshot.instrumentReadings.AM1.value).toBeLessThan(0.075);

    // Verify reading stability: subsequent step does not fluctuate wildly
    const nextSnapshot = engine.step(1e-3);
    expect(Math.abs(nextSnapshot.instrumentReadings.VM1.value - lastSnapshot.instrumentReadings.VM1.value)).toBeLessThan(0.1);
  });

  it('averages pure AC sinusoidal signals to 0 when measured with DC modes (DCV, DCA, DC voltmeter/ammeter)', () => {
    // 10 V peak AC source at 50 Hz across 100 Ohm resistor -> 100 mA peak
    const components = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 50 }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
      component('VM_DC', 'voltmeter', { mode: 'DC' }),
      component('AM_DC', 'ammeter', { mode: 'DC' }),
      component('DMM_DCV', 'dmm', { mode: 'DCV' }),
    ];
    const wires = [
      wire('w1', 'VAC', 'pos', 'AM_DC', 'pos'),
      wire('w2', 'AM_DC', 'neg', 'R1', 'a'),
      wire('w3', 'R1', 'b', 'VAC', 'neg'),
      wire('w4', 'VAC', 'neg', 'GND', 'gnd'),
      wire('w5', 'VM_DC', 'pos', 'R1', 'a'),
      wire('w6', 'VM_DC', 'neg', 'R1', 'b'),
      wire('w7', 'DMM_DCV', 'hi', 'R1', 'a'),
      wire('w8', 'DMM_DCV', 'com', 'R1', 'b'),
    ];
    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Step through 600 ms so the 100ms sliding window reaches steady state and the 0.5s display hold triggers
    let lastSnapshot = engine.step(1e-3);
    for (let i = 0; i < 600; i++) {
      lastSnapshot = engine.step(1e-3);
    }

    expect(lastSnapshot.converged).toBe(true);
    // Over a 100ms window (exactly 5 full cycles of 50 Hz) with fractional weighting, integral of sine wave averages to 0
    expect(Math.abs(lastSnapshot.instrumentReadings.VM_DC.value)).toBeLessThan(0.01);
    expect(Math.abs(lastSnapshot.instrumentReadings.DMM_DCV.value)).toBeLessThan(0.01);
    expect(Math.abs(lastSnapshot.instrumentReadings.AM_DC.value)).toBeLessThan(0.001);
  });
});
