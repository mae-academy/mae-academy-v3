import { describe, expect, it } from 'vitest';
import { detectCoilConflicts, TabDSimulationEngine } from '@/simulators/circuit-engine/engine/analogSimulation';
import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { COMPONENT_DEFS } from '@/simulators/circuit-engine/models/componentDefs';

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
});

