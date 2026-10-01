/**
 * Regression tests for the nine root causes (RC-01 … RC-09) found by the industrial stress audit.
 * Each block reproduces the audit's minimal failing case and asserts the physical behaviour that replaced the defect.
 */
import { describe, expect, it } from 'vitest';
import { MNASolver, MNAError, type MNAElement } from './mnaSolver';
import { assembleMeshImpedance, buildMeshSystem, reconstructBranchCurrents, solveMeshCurrents } from './MeshSolver';
import { RESISTIVE_SWITCH_ON, TabDDocumentedMna, TabDMnaError, type TabDPrimitive } from './analogDocumentedMna';
import { pnjlim, shockleyCurrent, TabDNewtonMna, type TabDNonlinearDevice } from './analogNewtonMna';
import { NB } from './industrialAudit/ir';
import { makeEngine, primsToMna } from './industrialAudit/backends';
import { expandLinear } from './industrialAudit/ir';
import { buildPillar1 } from './industrialAudit/gen_p1';
import { NodalSolver } from './NodalSolver';
import { generateReducedNodalMatrix } from './reducedNodalMatrix';

const node = (snapshot: { nodeVoltages: Record<string, number> }, name: string) => snapshot.nodeVoltages[name] ?? Number.NaN;

describe('RC-01 · Newton-Raphson robustness', () => {
  it('limits a forward junction update instead of jumping to ~10⁸ V (pnjlim)', () => {
    // A zero start drives the first iterate to a huge junction voltage; the limited update is vold + Vt·ln(1 + Δ/Vt), ≈ 1.2 V here.
    const limited = pnjlim(1e8, 0.65, 0.02585, 0.6);
    expect(limited).toBeGreaterThan(0.65);
    expect(limited).toBeCloseTo(0.65 + 0.02585 * Math.log(1 + (1e8 - 0.65) / 0.02585), 9);
    expect(limited).toBeLessThan(2);
  });

  it('solves a 100 V → 0.1 Ω → diode stage (≈1 kA) that plain Newton from 0 V cannot', () => {
    const newton = new TabDNewtonMna();
    const diode: TabDNonlinearDevice = { id: 'D', positive: 'a', negative: '0', controls: ['a'], current: n => shockleyCurrent(n.a ?? 0, 1e-12) };
    const primitives: TabDPrimitive[] = [
      { kind: 'voltage', id: 'V', positive: 'in', negative: '0', voltage: 100 },
      { kind: 'resistor', id: 'R', positive: 'in', negative: 'a', resistance: 0.1 },
    ];
    const result = newton.solve(primitives, [diode]);
    const current = (100 - result.nodeVoltages.a) / 0.1;
    expect(result.nodeVoltages.a).toBeCloseTo(0.02585 * Math.log(current / 1e-12 + 1), 4);
    expect(current).toBeGreaterThan(990);
  });

  it('converges the ideal-tail BJT differential pair that previously ended in a false "Singular MNA matrix"', () => {
    const nb = new NB().V('vcc', '0', 12, 'Vcc').V('vee', '0', -12, 'Vee').V('i1', '0', 0.005, 'Vi1').V('i2', '0', -0.005, 'Vi2')
      .R('vcc', 'o1', 4e3, 'RC1').R('vcc', 'o2', 4e3, 'RC2').Q('npn', 'i1', 'o1', 'tail', 100, 'Q1').Q('npn', 'i2', 'o2', 'tail', 100, 'Q2').I('tail', 'vee', 1e-3, 'Itail');
    const snapshot = makeEngine(nb.els).engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    const ic1 = snapshot.branchCurrents.Q1; const ic2 = snapshot.branchCurrents.Q2;
    expect(ic1 + ic2).toBeCloseTo(1e-3 * 100 / 101, 6); // α·I_tail
    expect(ic1 / ic2).toBeCloseTo(Math.exp(0.01 / 0.02585), 2); // exponential split of the 10 mV differential input
  });

  it('converges a biased common-emitter stage and satisfies collector KCL', () => {
    const nb = new NB().V('vcc', '0', 12, 'Vcc').R('vcc', 'b1', 180e3, 'R1').R('b1', '0', 37e3, 'R2').R('vcc', 'c1', 9.6e3, 'RC').R('e1', '0', 2.4e3, 'RE').Q('npn', 'b1', 'c1', 'e1', 100, 'Q1');
    const handle = makeEngine(nb.els);
    const snapshot = handle.engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    const compiled = (handle.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { netForTerminal: (c: string, t: string) => string } }).compileDocumentedPrimitives(5e-4)!;
    const vc = snapshot.nodeVoltages[compiled.netForTerminal('Q1', 'collector')];
    const vb = snapshot.nodeVoltages[compiled.netForTerminal('Q1', 'base')];
    const ve = snapshot.nodeVoltages[compiled.netForTerminal('Q1', 'emitter')];
    expect(vb - ve).toBeGreaterThan(0.5); expect(vb - ve).toBeLessThan(0.8);
    expect((12 - vc) / 9.6e3).toBeCloseTo(snapshot.branchCurrents.Q1, 6);
    expect(ve / 2.4e3).toBeCloseTo(snapshot.branchCurrents.Q1 + snapshot.branchCurrents['Q1:be'] + snapshot.branchCurrents['Q1:bc'] * 0, 4);
  });
});

describe('RC-02 · MeshSolver fallback coupling sign', () => {
  const tPad = () => new NB().V('in', '0', 10, 'Vs').R('in', 'a', 50, 'Rs').R('a', 'x', 100, 'R1').R('x', 'b', 100, 'R2').R('x', '0', 300, 'R3').R('b', '0', 50, 'RL').els;

  it('couples two same-direction cycles through a shared resistor with +R, opposite-direction with −R', () => {
    const edges = [{ id: 'R', type: 'resistor' as const, value: 7, from: 'p', to: 'q' }];
    const same = assembleMeshImpedance([new Map([['R', 1]]), new Map([['R', 1]])], edges as never);
    const opposite = assembleMeshImpedance([new Map([['R', 1]]), new Map([['R', -1]])], edges as never);
    expect(same[0][1]).toBe(7);
    expect(opposite[0][1]).toBe(-7);
    expect(same[0][0]).toBe(7);
  });

  it('reproduces MNA branch currents for a T-pad on the topology-fallback path', () => {
    const mna = primsToMna(expandLinear(tPad(), 'dc'));
    const system = buildMeshSystem(mna);
    const currents = reconstructBranchCurrents(mna, system.cycles, solveMeshCurrents(system.impedance, system.source));
    const reference = new MNASolver(mna).solve().branchCurrents;
    for (const id of ['R1', 'R2', 'R3', 'RL', 'Rs']) expect(currents[id]).toBeCloseTo(reference[id], 12);
  });

  it('handles a current source shared by two same-direction meshes (supermesh KVL row)', () => {
    const els = new NB().V('a', '0', 10, 'V1').R('a', 'b', 100, 'R1').I('b', 'c', 0.02, 'I1').R('b', '0', 200, 'R2').R('c', '0', 300, 'R3').R('c', 'a', 400, 'R4').els;
    const mna = primsToMna(expandLinear(els, 'dc'));
    const system = buildMeshSystem(mna);
    const currents = reconstructBranchCurrents(mna, system.cycles, solveMeshCurrents(system.impedance, system.source));
    const reference = new MNASolver(mna).solve().branchCurrents;
    for (const id of ['R1', 'R2', 'R3', 'R4']) expect(currents[id]).toBeCloseTo(reference[id], 10);
  });
});

describe('RC-03 · mnaSolver pivoting and scale-aware certificate', () => {
  it('no longer refuses the instrumentation amplifier (1 TΩ leakage = 1e-12 S was skipped as "zero")', () => {
    const circuit = buildPillar1().find(item => item.id === 'P1/inamp-vcm0-vd0.01-mm0')!;
    const result = new MNASolver(primsToMna(expandLinear(circuit.els, 'dc'))).solve();
    expect(Number.isFinite(result.nodeVoltages.out)).toBe(true);
    expect(result.residualInfinity).toBeLessThan(1e-9);
  });

  it('keeps small stamps instead of flushing entries below 1e-12', () => {
    // 1 TΩ pull-down in parallel with a 1 TΩ source resistor: the node must sit at exactly half the source.
    const elements: MNAElement[] = [
      { type: 'voltage', id: 'V', positive: 'in', negative: '0', voltage: 8 },
      { type: 'resistor', id: 'R1', positive: 'in', negative: 'x', resistance: 1e12 },
      { type: 'resistor', id: 'R2', positive: 'x', negative: '0', resistance: 1e12 },
    ];
    expect(new MNASolver(elements).solve().nodeVoltages.x).toBeCloseTo(4, 12);
  });

  it('still reports a floating island as singular', () => {
    const elements: MNAElement[] = [
      { type: 'voltage', id: 'V', positive: 'a', negative: '0', voltage: 5 },
      { type: 'resistor', id: 'R1', positive: 'a', negative: '0', resistance: 1e3 },
      { type: 'resistor', id: 'R2', positive: 'x', negative: 'y', resistance: 1e3 },
      { type: 'resistor', id: 'R3', positive: 'y', negative: 'x', resistance: 2e3 },
    ];
    expect(() => new MNASolver(elements).solve()).toThrow(MNAError);
  });
});

describe('RC-03 (addendum) · nodal analysis of ideal-transformer cascades', () => {
  const cascade = () => new NB().V('s', '0', 24, 'Vs').R('s', 'p1', 50, 'R1').XF('p1', '0', 'q1', '0', 2, 'T1').R('q1', 'm', 100, 'R2').R('m', '0', 400, 'Rm').XF('m', '0', 'q2', '0', 1, 'T2').R('q2', '0', 200, 'RL').els;

  it('no longer rejects the cascade: the reduced matrix carries the CCCS coupling and reproduces MNA', () => {
    const mna = primsToMna(expandLinear(cascade(), 'dc'));
    const reduced = generateReducedNodalMatrix(mna);
    const reference = new MNASolver(mna).solve();
    const solved = solveMeshCurrents(reduced.conductance, reduced.rhs); // plain dense solve of G·V = z
    reduced.unknownNodes.forEach((name, index) => expect(solved[index]).toBeCloseTo(reference.nodeVoltages[name], 9));
    expect(new NodalSolver(mna).analyze().status).toBe('ready');
  });

  it('shows the transformer current as its node-voltage expression, not a placeholder', () => {
    const trace = new NodalSolver(primsToMna(expandLinear(cascade(), 'dc'))).analyze();
    const kcl = String(trace.steps?.find(step => String(step.title).startsWith('2'))?.math);
    expect(kcl).not.toContain('R_x');
    expect(kcl).toContain('0.01');
  });
});

describe('RC-04 · closed-switch conditioning', () => {
  it('uses a 10 µΩ on-resistance and solves two-capacitor charge sharing without a false singular matrix', () => {
    expect(RESISTIVE_SWITCH_ON).toBe(1e-5);
    const mna = new TabDDocumentedMna();
    mna.solve([
      { kind: 'voltage', id: 'S1', positive: 'a', negative: '0', voltage: 5 },
      { kind: 'capacitor', id: 'C1', positive: 'a', negative: '0', capacitance: 1e-6 },
      { kind: 'voltage', id: 'S2', positive: 'b', negative: '0', voltage: 0 },
      { kind: 'capacitor', id: 'C2', positive: 'b', negative: '0', capacitance: 2e-6 },
    ], 1e-9, true);
    const shared = new TabDDocumentedMna();
    // charge 1 µF to 5 V and 2 µF to 0 V, then close a switch between them
    shared.solve([{ kind: 'voltage', id: 'V1', positive: 'a', negative: '0', voltage: 5 }, { kind: 'capacitor', id: 'C1', positive: 'a', negative: '0', capacitance: 1e-6 }, { kind: 'capacitor', id: 'C2', positive: 'b', negative: '0', capacitance: 2e-6 }, { kind: 'resistor', id: 'Rb', positive: 'b', negative: '0', resistance: 1e12 }], 1e-3, true);
    const result = shared.solve([
      { kind: 'capacitor', id: 'C1', positive: 'a', negative: '0', capacitance: 1e-6 },
      { kind: 'capacitor', id: 'C2', positive: 'b', negative: '0', capacitance: 2e-6 },
      { kind: 'resistive-switch', id: 'SW', positive: 'a', negative: 'b', closed: true },
      { kind: 'resistor', id: 'Ra', positive: 'a', negative: '0', resistance: 1e12 },
      { kind: 'resistor', id: 'Rb', positive: 'b', negative: '0', resistance: 1e12 },
    ], 1e-4, true);
    expect(result.nodeVoltages.a).toBeCloseTo(5 * 1 / 3, 6);
    expect(result.nodeVoltages.b).toBeCloseTo(5 * 1 / 3, 6);
  });

  it('reports switch current as a solved branch unknown: KCL closes to rounding, not to 1e15·noise', () => {
    const result = new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'V', positive: 's', negative: '0', voltage: 24 },
      { kind: 'resistive-switch', id: 'SW', positive: 's', negative: 'x', closed: true },
      { kind: 'resistor', id: 'R', positive: 'x', negative: '0', resistance: 5 },
    ], 1e-3, false);
    expect(result.branchCurrents.SW).toBeCloseTo(24 / (5 + RESISTIVE_SWITCH_ON), 9);
    expect(result.branchCurrents.R).toBeCloseTo(result.branchCurrents.SW, 12);
  });

  it('turns an ideal-source dead short into a structured diagnostic instead of ~10¹⁶ A', () => {
    expect(() => new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'V', positive: 's', negative: '0', voltage: 12 },
      { kind: 'resistive-switch', id: 'SW', positive: 's', negative: '0', closed: true },
    ], 1e-3, true)).toThrow(/short circuit/i);
  });

  it('models a sub-milliohm resistor as a branch current, so zero-ohm style parts keep an exact current', () => {
    const result = new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'V', positive: 'in', negative: '0', voltage: 5 },
      { kind: 'resistor', id: 'Rtiny', positive: 'in', negative: 'x', resistance: 1e-6 },
      { kind: 'resistor', id: 'RL', positive: 'x', negative: '0', resistance: 1e6 },
    ], 1e-3, false);
    expect(result.branchCurrents.Rtiny).toBeCloseTo(5 / (1e6 + 1e-6), 12);
  });
});

describe('RC-05 · malformed values are diagnosed, never substituted', () => {
  const solveWith = (primitive: TabDPrimitive) => new TabDDocumentedMna().solve([{ kind: 'voltage', id: 'V', positive: 'in', negative: '0', voltage: 5 }, primitive, { kind: 'resistor', id: 'RL', positive: 'x', negative: '0', resistance: 1e3 }]);

  it.each([
    ['NaN', Number.NaN], ['+Infinity', Number.POSITIVE_INFINITY], ['negative', -1e3], ['zero-ohm', 0], ['1e-30 Ω', 1e-30],
  ])('rejects a %s resistance with a TabDMnaError', (_label, resistance) => {
    expect(() => solveWith({ kind: 'resistor', id: 'R', positive: 'in', negative: 'x', resistance })).toThrow(TabDMnaError);
  });

  it('rejects a non-finite source value instead of propagating NaN through the solution vector', () => {
    expect(() => new TabDDocumentedMna().solve([{ kind: 'voltage', id: 'V', positive: 'in', negative: '0', voltage: Number.NaN }, { kind: 'resistor', id: 'R', positive: 'in', negative: '0', resistance: 1e3 }])).toThrow(/finite/);
  });

  it('engine: a resistor set to NaN is a diagnostic, not a silent 1 kΩ default', () => {
    const els = new NB().V('in', '0', 5, 'V1').R('in', 'x', Number.NaN, 'R1').R('x', '0', 1e3, 'R2').els;
    const snapshot = makeEngine(els).engine.step(1e-3);
    expect(snapshot.converged).toBe(false);
    expect(snapshot.warnings[0]?.message).toMatch(/finite number/);
  });

  it('engine: a negative resistance is a diagnostic, not a 1 nΩ short', () => {
    const els = new NB().V('in', '0', 5, 'V1').R('in', 'x', -1e3, 'R1').R('x', '0', 3e3, 'R2').els;
    const snapshot = makeEngine(els).engine.step(1e-3);
    expect(snapshot.converged).toBe(false);
    expect(snapshot.warnings[0]?.message).toMatch(/negative/);
  });

  it('engine: a property that was never set still takes the component default', () => {
    const els = new NB().V('in', '0', 5, 'V1').R('in', 'x', 1e3, 'R1').R('x', '0', 1e3, 'R2').els;
    const handle = makeEngine(els);
    delete handle.components.find(component => component.id === 'R1')!.props.resistance;
    handle.engine.setCircuit(handle.components, handle.wires);
    const snapshot = handle.engine.step(1e-3);
    expect(snapshot.converged).toBe(true); // default 1 kΩ
  });
});

describe('RC-06 · op-amp supply rails and Schmitt hysteresis', () => {
  const output = (handle: ReturnType<typeof makeEngine>, name: string) => {
    const snapshot = handle.engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    const compiled = (handle.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { netForTerminal: (c: string, t: string) => string } }).compileDocumentedPrimitives(5e-4)!;
    return snapshot.nodeVoltages[compiled.netForTerminal(name, 'out')];
  };

  it('clamps a gain −1000 stage driven past the ±15 V rails', () => {
    const els = new NB().V('in', '0', 0.5, 'Vin').R('in', 'n', 1e3, 'R1').R('n', 'out', 1e6, 'Rf').OA('0', 'n', 'out', 1e6, 'U1').R('out', '0', 1e4, 'RL').els;
    const handle = makeEngine(els);
    const vout = output(handle, 'U1');
    expect(Math.abs(vout)).toBeLessThanOrEqual(15 + 1e-9);
    expect(vout).toBeLessThan(-14);
  });

  it('honours a lower declared supply (vcc = 5 V)', () => {
    const els = new NB().V('in', '0', 1, 'Vin').R('in', 'n', 1e3, 'R1').R('n', 'out', 1e5, 'Rf').OA('0', 'n', 'out', 1e6, 'U1', 5).R('out', '0', 1e4, 'RL').els;
    const vout = output(makeEngine(els), 'U1');
    expect(Math.abs(vout)).toBeLessThanOrEqual(5 + 1e-9);
    expect(vout).toBeLessThan(-4.5);
  });

  it('leaves a linear-region closed loop exactly as before (gain −10, finite-A error (1 + Rf/R1)/A)', () => {
    const els = new NB().V('in', '0', 0.5, 'Vin').R('in', 'n', 1e3, 'R1').R('n', 'out', 1e4, 'Rf').OA('0', 'n', 'out', 1e6, 'U1').R('out', '0', 1e4, 'RL').els;
    const ideal = -5 / (1 + 11 / 1e6);
    expect(output(makeEngine(els), 'U1')).toBeCloseTo(ideal, 5);
  });

  it('latches a Schmitt trigger to a rail at power-up and keeps it through the hysteresis window', () => {
    const build = (vin: number) => new NB().V('in', '0', vin, 'Vin').R('out', 'p', 9e3, 'R1').R('p', '0', 1e3, 'R2').OA('p', 'in', 'out', 1e6, 'U1').els; // β = 0.1, window ±1.5 V
    const handle = makeEngine(build(0.2));
    const swap = (vin: number) => {
      const next = makeEngine(build(vin));
      handle.engine.setCircuit(next.components, next.wires);
    };
    const inWindowFirst = output(handle, 'U1');
    expect(Math.abs(inWindowFirst)).toBeGreaterThan(14); // saturated, not the unstable Vin/β equilibrium
    swap(5); expect(output(handle, 'U1')).toBeLessThan(-14);
    swap(0.2); expect(output(handle, 'U1')).toBeLessThan(-14); // hysteresis: stays low inside the window
    swap(-5); expect(output(handle, 'U1')).toBeGreaterThan(14);
    swap(0.2); expect(output(handle, 'U1')).toBeGreaterThan(14); // stays high
  });
});

describe('RC-07 · BJT saturation', () => {
  it('holds V_CE of a hard-driven NPN switch near V_CE(sat) instead of running hundreds of volts negative', () => {
    const els = new NB().V('vcc', '0', 12, 'Vcc').V('drive', '0', 5, 'Vb').R('drive', 'b', 1e3, 'Rb').R('vcc', 'c', 100, 'Rc').Q('npn', 'b', 'c', '0', 100, 'Q1').els;
    const handle = makeEngine(els);
    const snapshot = handle.engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    const compiled = (handle.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { netForTerminal: (c: string, t: string) => string } }).compileDocumentedPrimitives(5e-4)!;
    const vce = snapshot.nodeVoltages[compiled.netForTerminal('Q1', 'collector')] - 0;
    expect(vce).toBeGreaterThan(0.02);
    expect(vce).toBeLessThan(0.4);
  });

  it('stays in forward-active operation (Ic = β·Ib) when the collector has headroom', () => {
    const els = new NB().V('vcc', '0', 12, 'Vcc').V('drive', '0', 1.7, 'Vb').R('drive', 'b', 100e3, 'Rb').R('vcc', 'c', 1e3, 'Rc').Q('npn', 'b', 'c', '0', 100, 'Q1').els;
    const handle = makeEngine(els);
    const snapshot = handle.engine.step(1e-3);
    expect(snapshot.converged).toBe(true);
    const ib = snapshot.branchCurrents['Q1:be'] ?? 0;
    const ic = snapshot.branchCurrents.Q1 ?? 0;
    expect(ic / ib).toBeCloseTo(100, 1);
  });
});

describe('RC-08 · reactive state continuity across setCircuit', () => {
  it('keeps a winding current across a switch toggle (no 24 A → 0 A reset)', () => {
    const closed = new NB().V('vs', '0', 24, 'Vs').SW('vs', 'A', true, 'Q1').R('A', 'm', 1, 'Rm').L('m', '0', 5e-3, { id: 'Lm' }).R('A', '0', 1e3, 'Rsnub').els;
    const handle = makeEngine(closed);
    let snapshot = handle.engine.getSnapshot();
    for (let i = 0; i < 40; i += 1) snapshot = handle.engine.step(5e-4);
    const before = snapshot.branchCurrents.Lm;
    expect(before).toBeGreaterThan(10);
    const toggled = handle.components.map(component => component.type === 'sw-spst-no' ? { ...component, props: { ...component.props, state: 'open' } } : component);
    handle.engine.setCircuit(toggled, handle.wires);
    snapshot = handle.engine.step(5e-4);
    expect(snapshot.converged).toBe(true);
    const after = snapshot.branchCurrents.Lm;
    // Backward Euler through the snubber: i⁺ = (L/Δt)·i⁻ / (L/Δt + R_loop). A reset winding (i⁻ = 0) would give exactly 0 A.
    const expected = (5e-3 / 5e-4) * before / (5e-3 / 5e-4 + 1 + 1e3);
    expect(after).toBeGreaterThan(0.1);
    expect(after / expected).toBeCloseTo(1, 3);
  });

  it('keeps a capacitor voltage across a component edit, and reset() still discharges', () => {
    const rc = new NB().V('vs', '0', 10, 'Vs').R('vs', 'x', 1e3, 'R1').C('x', '0', 100e-6, undefined, 'C1').els;
    const handle = makeEngine(rc);
    let snapshot = handle.engine.getSnapshot();
    for (let i = 0; i < 400; i += 1) snapshot = handle.engine.step(5e-4);
    const compiledNet = (handle.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { netForTerminal: (c: string, t: string) => string } }).compileDocumentedPrimitives(5e-4)!.netForTerminal('C1', 'a');
    const charged = snapshot.nodeVoltages[compiledNet];
    expect(charged).toBeGreaterThan(5);
    const edited = handle.components.map(component => component.id === 'R1' ? { ...component, props: { ...component.props, resistance: 2e3 } } : component);
    handle.engine.setCircuit(edited, handle.wires);
    snapshot = handle.engine.step(5e-4);
    expect(snapshot.nodeVoltages[compiledNet]).toBeGreaterThan(0.9 * charged);
    handle.engine.reset();
    handle.engine.setCircuit(edited, handle.wires);
    snapshot = handle.engine.step(5e-4);
    expect(snapshot.nodeVoltages[compiledNet]).toBeLessThan(0.1 * charged);
  });
});

describe('RC-08 · loading a different circuit does not inherit stored energy', () => {
  it('starts a re-wired circuit that reuses the id C1 from rest', () => {
    const first = makeEngine(new NB().V('vs', '0', 10, 'Vs').R('vs', 'x', 1e3, 'R1').C('x', '0', 100e-6, undefined, 'C1').els);
    for (let i = 0; i < 400; i += 1) first.engine.step(5e-4);
    const second = makeEngine(new NB().V('v2', '0', 10, 'V9').R('v2', 'a', 1e3, 'R7').R('a', 'b', 1e3, 'R8').C('b', '0', 100e-6, undefined, 'C1').R('a', '0', 5e3, 'R9').els);
    first.engine.setCircuit(second.components, second.wires);
    const snapshot = first.engine.step(5e-4);
    const net = (first.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { netForTerminal: (c: string, t: string) => string } }).compileDocumentedPrimitives(5e-4)!.netForTerminal('C1', 'a');
    expect(snapshot.nodeVoltages[net]).toBeLessThan(1); // a charged C1 (≈10 V) would show here if state leaked across circuits
  });
});

describe('RC-09 · mesh micro-currents keep double precision', () => {
  it('reports 5 V across 1e30 Ω as 5e-30 A, not 0', () => {
    expect(solveMeshCurrents([[1e30]], [5])[0]).toBeCloseTo(5e-30, 40);
    expect(solveMeshCurrents([[1e30]], [5])[0]).not.toBe(0);
  });

  it('resolves nano- and pico-ampere loops next to an ampere-level loop', () => {
    const solved = solveMeshCurrents([[1, 0], [0, 1e10]], [1, 5e-3]);
    expect(solved[0]).toBeCloseTo(1, 14);
    expect(solved[1]).toBeCloseTo(5e-13, 25);
  });
});
