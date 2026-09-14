import { describe, expect, it } from 'vitest';
import { measureResistanceWithTestSource, SimulationEngine } from '@/simulators/circuit-engine/engine/simulation';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';
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
  const component = (id: string, type: string, props: Record<string, unknown> = {}, label?: string): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: label ?? (props.label as string) ?? id, props });
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

  it('energizes coil K1 via pushbutton S1 to synchronously close 3-phase contactor and power 3-phase motor', () => {
    const components = [
      // Control circuit
      component('V_ctrl', 'dc-voltage', { voltage: 24 }),
      component('S1', 'pb-no', { state: 'open' }),
      component('K1_coil', 'coil', { resistance: 100, activationThreshold: 5, label: 'K1' }),
      component('GND', 'ground'),
      // 3-Phase power circuit
      component('V3', 'three-phase-rail', { lineVoltage: 400, frequency: 50 }),
      component('K1_contact', 'aux-contact-3phase', { contactType: 'NO', linkedTo: 'K1' }),
      component('M1', 'motor-3phase', { nominalV: 400, nominalPower: 5000 }),
    ];
    const wires = [
      // Control circuit wiring
      wire('w_ctrl1', 'V_ctrl', 'pos', 'S1', 'a'),
      wire('w_ctrl2', 'S1', 'b', 'K1_coil', 'pos'),
      wire('w_ctrl3', 'K1_coil', 'neg', 'V_ctrl', 'neg'),
      wire('w_ctrl4', 'V_ctrl', 'neg', 'GND', 'gnd'),
      // 3-Phase power circuit wiring: V3 -> K1_contact (L1, L2, L3)
      wire('w_p1', 'V3', 'l1', 'K1_contact', 'l1'),
      wire('w_p2', 'V3', 'l2', 'K1_contact', 'l2'),
      wire('w_p3', 'V3', 'l3', 'K1_contact', 'l3'),
      // K1_contact (T1, T2, T3) -> M1 (U, V, W)
      wire('w_m1', 'K1_contact', 't1', 'M1', 'u'),
      wire('w_m2', 'K1_contact', 't2', 'M1', 'v'),
      wire('w_m3', 'K1_contact', 't3', 'M1', 'w'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);

    // Initial state: Pushbutton open -> Coil de-energized -> Contactor open -> Motor off
    let snapshot = engine.step(1e-3);
    expect(snapshot.componentPowered.K1_coil).toBe(false);
    expect(snapshot.componentPowered.M1).toBe(false);

    // Press pushbutton S1: energizes K1 coil -> closes 3-phase contactor synchronously -> motor runs
    const pressed = components.map(c => c.id === 'S1' ? { ...c, props: { state: 'pressed' } } : c);
    engine.setCircuit(pressed, wires);
    engine.step(1e-3);
    snapshot = engine.step(1e-3);

    expect(snapshot.converged).toBe(true);
    expect(snapshot.componentPowered.K1_coil).toBe(true);
    expect(snapshot.componentPowered.K1_contact).toBe(true);
    expect(snapshot.componentPowered.M1).toBe(true);
    expect(snapshot.branchCurrents.M1).toBeGreaterThan(0.5);

    // Release pushbutton S1: coil de-energizes -> contactor opens -> motor stops
    engine.setCircuit(components, wires);
    engine.step(1e-3);
    snapshot = engine.step(1e-3);
    expect(snapshot.componentPowered.K1_coil).toBe(false);
    expect(snapshot.componentPowered.M1).toBe(false);
  });

  it('defines 3-phase contactor terminals with pins 0..2 as inputs (L1, L2, L3) and pins 3..5 as outputs (T1, T2, T3)', () => {
    const def = getDef('aux-contact-3phase');
    expect(def).toBeDefined();
    const terminalIds = def!.terminals.map(t => t.id);
    expect(terminalIds).toEqual(['l1', 'l2', 'l3', 't1', 't2', 't3']);
    // Pin 0 <-> Pin 3 (L1 <-> T1)
    expect(terminalIds[0]).toBe('l1');
    expect(terminalIds[3]).toBe('t1');
    // Pin 1 <-> Pin 4 (L2 <-> T2)
    expect(terminalIds[1]).toBe('l2');
    expect(terminalIds[4]).toBe('t2');
    // Pin 2 <-> Pin 5 (L3 <-> T3)
    expect(terminalIds[2]).toBe('l3');
    expect(terminalIds[5]).toBe('t3');
  });

  it('strictly maintains electrical isolation between poles and supports controlSourceId binding', () => {
    const components = [
      component('V_ctrl', 'dc-voltage', { voltage: 12 }),
      component('K1_coil', 'coil', { resistance: 100, activationThreshold: 5 }, 'K1'),
      component('GND', 'ground'),
      // Connect 10 V to pole 1 (L1) and measure current on T1, while L2/T2 and L3/T3 are unconnected
      component('V_test', 'dc-voltage', { voltage: 10 }),
      component('R_load1', 'resistor', { resistance: 1000 }),
      component('R_load2', 'resistor', { resistance: 1000 }),
      // Using controlSourceId instead of linkedTo
      component('K1_contact', 'aux-contact-3phase', { contactType: 'NO', controlSourceId: 'K1_coil' }),
    ];
    const wires = [
      // Coil powered directly
      wire('w1', 'V_ctrl', 'pos', 'K1_coil', 'pos'),
      wire('w2', 'K1_coil', 'neg', 'V_ctrl', 'neg'),
      wire('w3', 'V_ctrl', 'neg', 'GND', 'gnd'),
      // V_test to L1 only
      wire('wt1', 'V_test', 'pos', 'K1_contact', 'l1'),
      wire('wt2', 'V_test', 'neg', 'GND', 'gnd'),
      // Load 1 on T1
      wire('wl1', 'K1_contact', 't1', 'R_load1', 'a'),
      wire('wl2', 'R_load1', 'b', 'GND', 'gnd'),
      // Load 2 on L2 to verify L1 does NOT conduct into L2
      wire('wl3', 'K1_contact', 'l2', 'R_load2', 'a'),
      wire('wl4', 'R_load2', 'b', 'GND', 'gnd'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);
    const snapshot = engine.step(1e-3);

    // K1_contact is energized via controlSourceId
    expect(snapshot.componentPowered.K1_contact).toBe(true);
    // Pole 1 conducts current into R_load1 (~10 mA)
    expect(snapshot.branchCurrents.R_load1).toBeCloseTo(0.01, 3);
    // Pole 2 has NO connection to Pole 1, so R_load2 has ~0 current (strictly isolated)
    expect(Math.abs(snapshot.branchCurrents.R_load2 ?? 0)).toBeLessThan(1e-9);
  });
});


