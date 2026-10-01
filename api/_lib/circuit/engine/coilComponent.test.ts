import { describe, expect, it } from 'vitest';
import { detectCoilConflicts, TabDSimulationEngine } from './analogSimulation';
import type { CircuitComponent, CircuitWire } from '../../../../shared/circuit/circuitTypes';
import { COMPONENT_DEFS } from '../../../../shared/circuit/componentDefs';

const makeComponent = (id: string, type: string, props: Record<string, unknown> = {}, label?: string): CircuitComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label: label ?? id,
  props,
});

const makeWire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({
  id,
  fromComp,
  fromTerm,
  toComp,
  toTerm,
  routing: 'orthogonal',
  path: [[0, 0], [20, 0]],
});

describe('Coil Component and Conflict Detection', () => {
  it('detects no conflicts when coil labels are unique', () => {
    const components: CircuitComponent[] = [
      makeComponent('coil-1', 'coil', {}, 'K1'),
      makeComponent('coil-2', 'coil', {}, 'K2'),
    ];

    const report = detectCoilConflicts(components);
    expect(report.hasConflicts).toBe(false);
    expect(report.conflicts).toHaveLength(0);
  });

  it('detects conflict and identifies primary component when labels collide', () => {
    const components: CircuitComponent[] = [
      makeComponent('coil-primary', 'coil', {}, 'K1'),
      makeComponent('coil-duplicate', 'coil', {}, 'K1'),
    ];

    const report = detectCoilConflicts(components);
    expect(report.hasConflicts).toBe(true);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].name).toBe('K1');
    expect(report.conflicts[0].primaryId).toBe('coil-primary');
    expect(report.conflicts[0].count).toBe(2);
  });

  it('verifies definition parameters and terminal layout', () => {
    const def = COMPONENT_DEFS['coil'];
    expect(def).toBeDefined();
    expect(def.category).toBe('Classic Control');
    expect(def.properties.resistance.value).toBe(100);
    expect(def.properties.inductance.value).toBe(1.0);
    expect(def.properties.pullInCurrent.value).toBe(0.05);
    expect(def.properties.holdCurrent.value).toBe(0.03);
    expect(def.terminals).toHaveLength(2);
    expect(def.terminals.find(t => t.id === 'pos')).toMatchObject({ x: -50, y: 0, type: 'input' });
    expect(def.terminals.find(t => t.id === 'neg')).toMatchObject({ x: 50, y: 0, type: 'input' });
  });

  it('energizes coil when DC input provides current exceeding pull-in threshold (10V -> 100mA >= 50mA)', () => {
    const components = [
      makeComponent('V1', 'dc-voltage', { voltage: 10 }),
      makeComponent('K1', 'coil', { resistance: 100, inductance: 1.0, pullInCurrent: 0.05, holdCurrent: 0.03 }),
      makeComponent('GND', 'ground'),
    ];
    const wires = [
      makeWire('w1', 'V1', 'pos', 'K1', 'pos'),
      makeWire('w2', 'K1', 'neg', 'V1', 'neg'),
      makeWire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Step across multiple time constants (τ = 1H / 100Ω = 10ms = 0.01s)
    let snapshot = engine.step(0.05);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.componentPowered['K1']).toBe(true);
    expect(Math.abs(snapshot.branchCurrents['K1'])).toBeCloseTo(0.1, 2);
  });

  it('remains de-energized if current stays below pull-in threshold (4V -> 40mA < 50mA)', () => {
    const components = [
      makeComponent('V1', 'dc-voltage', { voltage: 4 }),
      makeComponent('K1', 'coil', { resistance: 100, inductance: 1.0, pullInCurrent: 0.05, holdCurrent: 0.03 }),
      makeComponent('GND', 'ground'),
    ];
    const wires = [
      makeWire('w1', 'V1', 'pos', 'K1', 'pos'),
      makeWire('w2', 'K1', 'neg', 'V1', 'neg'),
      makeWire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    const snapshot = engine.step(0.05);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.componentPowered['K1']).toBe(false);
  });

  it('exhibits hysteresis: stays energized when current drops between pull-in and hold (35mA)', () => {
    const vSource = makeComponent('V1', 'dc-voltage', { voltage: 10 });
    const coil = makeComponent('K1', 'coil', { resistance: 100, inductance: 1.0, pullInCurrent: 0.05, holdCurrent: 0.03 });
    const gnd = makeComponent('GND', 'ground');

    const components = [vSource, coil, gnd];
    const wires = [
      makeWire('w1', 'V1', 'pos', 'K1', 'pos'),
      makeWire('w2', 'K1', 'neg', 'V1', 'neg'),
      makeWire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Step 1: 10V -> energize
    let snapshot = engine.step(0.05);
    expect(snapshot.componentPowered['K1']).toBe(true);

    // Step 2: reduce voltage to 3.5V (35mA: above 30mA hold, below 50mA pull-in)
    vSource.props.voltage = 3.5;
    const internalV1 = (engine as any).tabDComponents.find((c: any) => c.id === 'V1');
    if (internalV1) internalV1.props.voltage = 3.5;
    // Step without re-calling setCircuit to preserve coil state
    for (let i = 0; i < 50; i++) {
      snapshot = engine.step(0.001);
    }
    expect(snapshot.componentPowered['K1']).toBe(true);

    // Step 3: reduce voltage to 2.0V (20mA: below 30mA hold -> drops out)
    vSource.props.voltage = 2.0;
    if (internalV1) internalV1.props.voltage = 2.0;
    for (let i = 0; i < 50; i++) {
      snapshot = engine.step(0.001);
    }
    expect(snapshot.componentPowered['K1']).toBe(false);
  });

  it('synchronously switches aux-contact-no and aux-contact-nc linked to the coil', () => {
    const vCoil = makeComponent('V_COIL', 'dc-voltage', { voltage: 10 });
    const coil = makeComponent('K1', 'coil', { resistance: 100, inductance: 1.0, pullInCurrent: 0.05, holdCurrent: 0.03 }, 'K1');
    const contactNo = makeComponent('AUX_NO', 'aux-contact-no', { linkedTo: 'K1' });
    const contactNc = makeComponent('AUX_NC', 'aux-contact-nc', { linkedTo: 'K1' });
    const vSig = makeComponent('V_SIG', 'dc-voltage', { voltage: 12 });
    const rNo = makeComponent('R_NO', 'resistor', { resistance: 100 });
    const rNc = makeComponent('R_NC', 'resistor', { resistance: 100 });
    const gnd = makeComponent('GND', 'ground');

    const components = [vCoil, coil, contactNo, contactNc, vSig, rNo, rNc, gnd];
    const wires = [
      // Coil circuit
      makeWire('w1', 'V_COIL', 'pos', 'K1', 'pos'),
      makeWire('w2', 'K1', 'neg', 'V_COIL', 'neg'),
      makeWire('w3', 'V_COIL', 'neg', 'GND', 'gnd'),
      // Signal source to GND
      makeWire('w4', 'V_SIG', 'neg', 'GND', 'gnd'),
      // NO contact circuit
      makeWire('w5', 'V_SIG', 'pos', 'AUX_NO', 'a'),
      makeWire('w6', 'AUX_NO', 'b', 'R_NO', 'a'),
      makeWire('w7', 'R_NO', 'b', 'GND', 'gnd'),
      // NC contact circuit
      makeWire('w8', 'V_SIG', 'pos', 'AUX_NC', 'a'),
      makeWire('w9', 'AUX_NC', 'b', 'R_NC', 'a'),
      makeWire('w10', 'R_NC', 'b', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Initial step with 10V energizing the coil
    let snapshot = engine.step(0.05);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.componentPowered['K1']).toBe(true);

    // Because coil is energized:
    // NO contact should be closed -> R_NO conducts ~12V / 100Ω = 0.12A
    expect(Math.abs(snapshot.branchCurrents['R_NO'])).toBeCloseTo(0.12, 2);
    // NC contact should be open -> R_NC current ≈ 0
    expect(Math.abs(snapshot.branchCurrents['R_NC'])).toBeLessThan(1e-4);

    // De-energize coil: set V_COIL to 0
    vCoil.props.voltage = 0;
    const internalVCoil = (engine as any).tabDComponents.find((c: any) => c.id === 'V_COIL');
    if (internalVCoil) internalVCoil.props.voltage = 0;
    for (let i = 0; i < 50; i++) {
      snapshot = engine.step(0.001);
    }
    expect(snapshot.componentPowered['K1']).toBe(false);

    // Because coil is now de-energized:
    // NO contact opens -> R_NO current ≈ 0
    expect(Math.abs(snapshot.branchCurrents['R_NO'])).toBeLessThan(1e-4);
    // NC contact closes -> R_NC conducts ~12V / 100Ω = 0.12A
    expect(Math.abs(snapshot.branchCurrents['R_NC'])).toBeCloseTo(0.12, 2);
  });

  it('supports contactType NO and NC on consolidated 1-phase aux contact', () => {
    const vCoil = makeComponent('V_COIL', 'dc-voltage', { voltage: 10 });
    const coil = makeComponent('K1', 'coil', { resistance: 100, inductance: 1.0, pullInCurrent: 0.05, holdCurrent: 0.03 }, 'K1');
    const contactNo = makeComponent('AUX_1P_NO', 'aux-contact-no', { contactType: 'NO', linkedTo: 'K1' });
    const contactNc = makeComponent('AUX_1P_NC', 'aux-contact-no', { contactType: 'NC', linkedTo: 'K1' });
    const vSig = makeComponent('V_SIG', 'dc-voltage', { voltage: 12 });
    const rNo = makeComponent('R_NO', 'resistor', { resistance: 100 });
    const rNc = makeComponent('R_NC', 'resistor', { resistance: 100 });
    const gnd = makeComponent('GND', 'ground');

    const components = [vCoil, coil, contactNo, contactNc, vSig, rNo, rNc, gnd];
    const wires = [
      makeWire('w1', 'V_COIL', 'pos', 'K1', 'pos'),
      makeWire('w2', 'K1', 'neg', 'V_COIL', 'neg'),
      makeWire('w3', 'V_COIL', 'neg', 'GND', 'gnd'),
      makeWire('w4', 'V_SIG', 'neg', 'GND', 'gnd'),
      // NO
      makeWire('w5', 'V_SIG', 'pos', 'AUX_1P_NO', 'a'),
      makeWire('w6', 'AUX_1P_NO', 'b', 'R_NO', 'a'),
      makeWire('w7', 'R_NO', 'b', 'GND', 'gnd'),
      // NC
      makeWire('w8', 'V_SIG', 'pos', 'AUX_1P_NC', 'a'),
      makeWire('w9', 'AUX_1P_NC', 'b', 'R_NC', 'a'),
      makeWire('w10', 'R_NC', 'b', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Coil energized
    let snapshot = engine.step(0.05);
    expect(snapshot.converged).toBe(true);
    expect(Math.abs(snapshot.branchCurrents['R_NO'])).toBeCloseTo(0.12, 2);
    expect(Math.abs(snapshot.branchCurrents['R_NC'])).toBeLessThan(1e-4);

    // De-energize coil
    const internalVCoil = (engine as any).tabDComponents.find((c: any) => c.id === 'V_COIL');
    if (internalVCoil) internalVCoil.props.voltage = 0;
    for (let i = 0; i < 50; i++) {
      snapshot = engine.step(0.001);
    }
    expect(Math.abs(snapshot.branchCurrents['R_NO'])).toBeLessThan(1e-4);
    expect(Math.abs(snapshot.branchCurrents['R_NC'])).toBeCloseTo(0.12, 2);
  });

  it('synchronously switches all 3 poles of 3-Phase Auxiliary Contact while maintaining phase isolation', () => {
    const vCoil = makeComponent('V_COIL', 'dc-voltage', { voltage: 10 });
    const coil = makeComponent('K1', 'coil', { resistance: 100, inductance: 1.0, pullInCurrent: 0.05, holdCurrent: 0.03 }, 'K1');
    const contact3P = makeComponent('KM1', 'aux-contact-3phase', { contactType: 'NO', linkedTo: 'K1' });

    // 3 separate DC sources on 3 lines: 10V, 20V, 30V
    const v1 = makeComponent('V1', 'dc-voltage', { voltage: 10 });
    const v2 = makeComponent('V2', 'dc-voltage', { voltage: 20 });
    const v3 = makeComponent('V3', 'dc-voltage', { voltage: 30 });

    const r1 = makeComponent('R1', 'resistor', { resistance: 100 });
    const r2 = makeComponent('R2', 'resistor', { resistance: 100 });
    const r3 = makeComponent('R3', 'resistor', { resistance: 100 });
    const gnd = makeComponent('GND', 'ground');

    const components = [vCoil, coil, contact3P, v1, v2, v3, r1, r2, r3, gnd];
    const wires = [
      // Coil
      makeWire('wc1', 'V_COIL', 'pos', 'K1', 'pos'),
      makeWire('wc2', 'K1', 'neg', 'V_COIL', 'neg'),
      makeWire('wc3', 'V_COIL', 'neg', 'GND', 'gnd'),

      // Sources negative to ground
      makeWire('wg1', 'V1', 'neg', 'GND', 'gnd'),
      makeWire('wg2', 'V2', 'neg', 'GND', 'gnd'),
      makeWire('wg3', 'V3', 'neg', 'GND', 'gnd'),

      // Loads to ground
      makeWire('wr1', 'R1', 'b', 'GND', 'gnd'),
      makeWire('wr2', 'R2', 'b', 'GND', 'gnd'),
      makeWire('wr3', 'R3', 'b', 'GND', 'gnd'),

      // Phase 1 through L1 -> T1
      makeWire('wp1_in', 'V1', 'pos', 'KM1', 'l1'),
      makeWire('wp1_out', 'KM1', 't1', 'R1', 'a'),

      // Phase 2 through L2 -> T2
      makeWire('wp2_in', 'V2', 'pos', 'KM1', 'l2'),
      makeWire('wp2_out', 'KM1', 't2', 'R2', 'a'),

      // Phase 3 through L3 -> T3
      makeWire('wp3_in', 'V3', 'pos', 'KM1', 'l3'),
      makeWire('wp3_out', 'KM1', 't3', 'R3', 'a'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    // Initial step: coil energized
    let snapshot = engine.step(0.05);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.componentPowered['K1']).toBe(true);

    // All 3 poles conduct independently with their respective voltages:
    // I1 = 10V / 100Ω = 0.10A
    // I2 = 20V / 100Ω = 0.20A
    // I3 = 30V / 100Ω = 0.30A
    expect(Math.abs(snapshot.branchCurrents['R1'])).toBeCloseTo(0.10, 2);
    expect(Math.abs(snapshot.branchCurrents['R2'])).toBeCloseTo(0.20, 2);
    expect(Math.abs(snapshot.branchCurrents['R3'])).toBeCloseTo(0.30, 2);

    // De-energize coil: set V_COIL to 0
    const internalVCoil = (engine as any).tabDComponents.find((c: any) => c.id === 'V_COIL');
    if (internalVCoil) internalVCoil.props.voltage = 0;
    for (let i = 0; i < 50; i++) {
      snapshot = engine.step(0.001);
    }
    expect(snapshot.componentPowered['K1']).toBe(false);

    // All 3 poles open simultaneously:
    expect(Math.abs(snapshot.branchCurrents['R1'])).toBeLessThan(1e-4);
    expect(Math.abs(snapshot.branchCurrents['R2'])).toBeLessThan(1e-4);
    expect(Math.abs(snapshot.branchCurrents['R3'])).toBeLessThan(1e-4);
  });

  it('defaults aux contact label to K? and supports label synchronization to linked coil', async () => {
    const { nextComponentLabel } = await import('../../../../shared/circuit/circuitTypes');
    expect(nextComponentLabel('aux-contact-no', [])).toBe('K?');
    expect(nextComponentLabel('aux-contact-nc', [])).toBe('K?');
    expect(nextComponentLabel('aux-contact-3phase', [])).toBe('K?');
    expect(nextComponentLabel('coil', [])).toBe('K1');
  });
});

