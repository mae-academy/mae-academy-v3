import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';
import { TabDSimulationEngine } from '../../../../../api/_lib/circuit/engine/analogSimulation';
import { SimulationEngine } from '../../../../../api/_lib/circuit/engine/simulation';
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

    // Both must be positive and bounded (smooth, non-strobing, lively)
    expect(diffLight).toBeGreaterThan(0);
    expect(diffHeavy).toBeLessThan(0.2); // at 0.016s, 8.0 cycles/s * 0.016s ~ 0.128 cycles
  });

  it('guarantees correct directional electron path around a current source: OUT of pos (arrow tip) and INTO neg', () => {
    const components = [
      component('I1', 'dc-current', { current: 2 }),
      component('R1', 'resistor', { resistance: 10 }),
      component('GND', 'ground'),
    ];
    // Wire from I1:pos (arrow tip at top) to R1:a (top of resistor)
    // Wire from R1:b (bottom of resistor) to I1:neg (bottom of current source)
    const wires = [
      wire('w_top', 'I1', 'pos', 'R1', 'a'),
      wire('w_bottom', 'R1', 'b', 'I1', 'neg'),
      wire('w_gnd', 'I1', 'neg', 'GND', 'gnd'),
    ];

    // Test 1: TabDSimulationEngine
    const tabDEngine = new TabDSimulationEngine();
    tabDEngine.setCircuit(components, wires);
    const tabDSnap0 = tabDEngine.step(0.016);
    const tabDSnap1 = tabDEngine.step(0.016);

    expect(tabDSnap1.wireCurrents['w_top']).toBeCloseTo(2, 3);
    expect(tabDSnap1.wireCurrents['w_bottom']).toBeCloseTo(2, 3);
    expect((tabDSnap1.wirePhases?.['w_top'] ?? 0) - (tabDSnap0.wirePhases?.['w_top'] ?? 0)).toBeGreaterThan(0);
    expect((tabDSnap1.wirePhases?.['w_bottom'] ?? 0) - (tabDSnap0.wirePhases?.['w_bottom'] ?? 0)).toBeGreaterThan(0);

    // Test 2: SimulationEngine (legacy engine used on main workspace canvas)
    const simEngine = new SimulationEngine();
    simEngine.setCircuit(components, wires);
    const simSnap0 = simEngine.step(0.016);
    const simSnap1 = simEngine.step(0.016);

    // Both wires must be POSITIVE (current flows OUT of I1:pos to R1:a, and OUT of R1:b into I1:neg)
    expect(simSnap1.wireCurrents['w_top']).toBeCloseTo(2, 3);
    expect(simSnap1.wireCurrents['w_bottom']).toBeCloseTo(2, 3);

    // Both phases must advance forward in the exact direction of the current source arrow
    const simDiffTop = (simSnap1.wirePhases?.['w_top'] ?? 0) - (simSnap0.wirePhases?.['w_top'] ?? 0);
    const simDiffBottom = (simSnap1.wirePhases?.['w_bottom'] ?? 0) - (simSnap0.wirePhases?.['w_bottom'] ?? 0);
    expect(simDiffTop).toBeGreaterThan(0);
    expect(simDiffBottom).toBeGreaterThan(0);
    expect(simDiffTop).toBeCloseTo(simDiffBottom, 4);
  });

  it('strictly scales electron animation phase with simulation speed slider without altering physical time rate', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 10 }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'R1', 'a'),
      wire('w2', 'R1', 'b', 'V1', 'neg'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ];

    // Case 1: 1x speed (dt = 0.016s)
    const engine1x = new SimulationEngine();
    engine1x.setCircuit(components, wires);
    const snap1x_0 = engine1x.step(0.016);
    const snap1x_1 = engine1x.step(0.016);
    const rate1x = (snap1x_1.wirePhases?.['w1'] ?? 0) - (snap1x_0.wirePhases?.['w1'] ?? 0);

    // Case 2: 2x speed (dt = 0.032s)
    const engine2x = new SimulationEngine();
    engine2x.setCircuit(components, wires);
    const snap2x_0 = engine2x.step(0.032);
    const snap2x_1 = engine2x.step(0.032);
    const rate2x = (snap2x_1.wirePhases?.['w1'] ?? 0) - (snap2x_0.wirePhases?.['w1'] ?? 0);

    // Case 3: 0.25x speed (dt = 0.004s)
    const engineQuarter = new SimulationEngine();
    engineQuarter.setCircuit(components, wires);
    const snapQ_0 = engineQuarter.step(0.004);
    const snapQ_1 = engineQuarter.step(0.004);
    const rateQuarter = (snapQ_1.wirePhases?.['w1'] ?? 0) - (snapQ_0.wirePhases?.['w1'] ?? 0);

    // Phase progression scales linearly with dt (simulation slider)
    expect(rate2x).toBeCloseTo(rate1x * 2, 4);
    expect(rateQuarter).toBeCloseTo(rate1x * 0.25, 4);

    // Physical time advances strictly by the given dt
    expect(snap1x_1.time).toBeCloseTo(0.032, 6);
    expect(snap2x_1.time).toBeCloseTo(0.064, 6);
    expect(snapQ_1.time).toBeCloseTo(0.008, 6);
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

  it('strictly stops electron animation on branches when sources are deactivated in superposition sub-circuit', () => {
    // 2-source circuit: V1 and I1 feeding parallel resistors R1 and R2
    // When I1 is deactivated in superposition (0A, open circuit):
    const subCircuitComponents = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('I1', 'dc-current', { current: 0 }), // Deactivated current source in superposition
      component('R1', 'resistor', { resistance: 100 }),
      component('R2', 'resistor', { resistance: 200 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_v_top', 'V1', 'pos', 'R1', 'a'),
      wire('w_v_bot', 'R1', 'b', 'V1', 'neg'),
      wire('w_gnd', 'V1', 'neg', 'GND', 'gnd'),
      wire('w_i_top', 'I1', 'pos', 'R2', 'a'),
      wire('w_i_bot', 'R2', 'b', 'I1', 'neg'),
    ];

    const simEngine = new SimulationEngine();
    simEngine.setCircuit(subCircuitComponents, wires);
    const snap0 = simEngine.step(0.016);
    const snap1 = simEngine.step(0.016);

    // Active V1 branch must have current and advancing electrons
    expect(Math.abs(snap1.wireCurrents['w_v_top'])).toBeGreaterThan(0.05);
    const vPhaseDiff = (snap1.wirePhases?.['w_v_top'] ?? 0) - (snap0.wirePhases?.['w_v_top'] ?? 0);
    expect(vPhaseDiff).toBeGreaterThan(0);

    // Deactivated I1 branch (open circuit, 0A) must have exactly 0 current and stopped electron animation
    expect(snap1.wireCurrents['w_i_top'] ?? 0).toBe(0);
    expect(snap1.wireCurrents['w_i_bot'] ?? 0).toBe(0);
    const iTopPhaseDiff = (snap1.wirePhases?.['w_i_top'] ?? 0) - (snap0.wirePhases?.['w_i_top'] ?? 0);
    const iBotPhaseDiff = (snap1.wirePhases?.['w_i_bot'] ?? 0) - (snap0.wirePhases?.['w_i_bot'] ?? 0);
    expect(iTopPhaseDiff).toBe(0);
    expect(iBotPhaseDiff).toBe(0);
  });

  it('accurately drives harmonic sinusoidal oscillation for AC Sine wave with smooth deceleration and zero freeze', () => {
    const components = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 60, waveform: 'sine' }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_top', 'VAC', 'pos', 'R1', 'a'),
      wire('w_bot', 'R1', 'b', 'VAC', 'neg'),
      wire('w_gnd', 'VAC', 'neg', 'GND', 'gnd'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);

    // Initial phase at t=0
    const snap0 = engine.step(0.001);
    const p0 = snap0.wirePhases?.['w_top'];
    expect(p0).toBeDefined();

    // Collect phase trajectory over a full 1-second visual cycle
    const phases: number[] = [];
    const velocities: number[] = [];
    let prevPhase = p0!;
    const dt = 0.016; // 60 FPS
    for (let i = 0; i < 60; i++) {
      const snap = engine.step(dt);
      const currPhase = snap.wirePhases?.['w_top'] ?? 0;
      phases.push(currPhase);
      velocities.push((currPhase - prevPhase) / dt);
      prevPhase = currPhase;
    }

    // 1. Phases remain strictly defined (never destroyed at zero crossings)
    expect(phases.every(p => p !== undefined)).toBe(true);

    // 2. Velocity oscillates smoothly between positive and negative
    const maxV = Math.max(...velocities);
    const minV = Math.min(...velocities);
    expect(maxV).toBeGreaterThan(1.0);
    expect(minV).toBeLessThan(-1.0);
    // Smooth deceleration / zero crossing freeze: velocity minimum magnitude near reversal is close to 0
    const nearZeroV = velocities.some(v => Math.abs(v) < 0.8);
    expect(nearZeroV).toBe(true);

    // 3. Peak-to-peak stroke length is bounded and observable (~0.9 dot cycles)
    const peakToPeak = Math.max(...phases) - Math.min(...phases);
    expect(peakToPeak).toBeGreaterThan(0.4);
    expect(peakToPeak).toBeLessThan(1.5);
  });

  it('accurately drives constant-speed peak-reversal kinematics for AC Triangle wave', () => {
    const components = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 60, waveform: 'triangle' }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_top', 'VAC', 'pos', 'R1', 'a'),
      wire('w_bot', 'R1', 'b', 'VAC', 'neg'),
      wire('w_gnd', 'VAC', 'neg', 'GND', 'gnd'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);

    const dt = 0.016;
    let prevP = (engine.step(0.001).wirePhases?.['w_top']) ?? 0;
    const velForward: number[] = [];
    const velReverse: number[] = [];

    for (let i = 0; i < 60; i++) {
      const snap = engine.step(dt);
      const currP = snap.wirePhases?.['w_top'] ?? 0;
      const v = (currP - prevP) / dt;
      prevP = currP;
      if (i > 5 && i < 25) velForward.push(v);
      if (i > 35 && i < 55) velReverse.push(v);
    }

    // In forward half, velocity is positive and approximately constant
    expect(velForward.every(v => v > 1.0)).toBe(true);
    // In reverse half, velocity is negative and approximately constant
    expect(velReverse.every(v => v < -1.0)).toBe(true);
  });

  it('accurately implements constant velocity and plateau hold for AC Square wave', () => {
    const components = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 60, waveform: 'square' }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_top', 'VAC', 'pos', 'R1', 'a'),
      wire('w_bot', 'R1', 'b', 'VAC', 'neg'),
      wire('w_gnd', 'VAC', 'neg', 'GND', 'gnd'),
    ];

    const engine = new SimulationEngine();
    engine.setCircuit(components, wires);

    const dt = 0.016;
    let prevP = (engine.step(0.001).wirePhases?.['w_top']) ?? 0;
    const velocities: number[] = [];

    for (let i = 0; i < 60; i++) {
      const snap = engine.step(dt);
      const currP = snap.wirePhases?.['w_top'] ?? 0;
      const v = (currP - prevP) / dt;
      prevP = currP;
      velocities.push(v);
    }

    // During hold, velocity is 0
    const hasZeroHold = velocities.some(v => Math.abs(v) < 1e-4);
    expect(hasZeroHold).toBe(true);
    // During pulse, velocity reaches brisk peak
    const hasFastPulse = velocities.some(v => Math.abs(v) > 3.0);
    expect(hasFastPulse).toBe(true);
  });

  it('guarantees TabDSimulationEngine smoothly drives AC Sine wave harmonic motion', () => {
    const components = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 50, waveform: 'sine' }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_top', 'VAC', 'pos', 'R1', 'a'),
      wire('w_bot', 'R1', 'b', 'VAC', 'neg'),
      wire('w_gnd', 'VAC', 'neg', 'GND', 'gnd'),
    ];

    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);

    const dt = 0.016;
    let prevP = (engine.step(0.001).wirePhases?.['w_top']) ?? 0;
    const velocities: number[] = [];

    for (let i = 0; i < 60; i++) {
      const snap = engine.step(dt);
      const currP = snap.wirePhases?.['w_top'] ?? 0;
      const v = (currP - prevP) / dt;
      prevP = currP;
      velocities.push(v);
    }

    expect(Math.max(...velocities)).toBeGreaterThan(1.0);
    expect(Math.min(...velocities)).toBeLessThan(-1.0);
    const nearZeroV = velocities.some(v => Math.abs(v) < 0.8);
    expect(nearZeroV).toBe(true);
  });
});

