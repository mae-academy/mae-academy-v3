import { describe, expect, it } from 'vitest';
import { describeCircuit } from '../../../shared/circuit/nets';
import { CIRCUIT_PROTOCOL_VERSION, type CircuitDescription } from '../../../shared/circuit/protocol';
import type { CircuitComponent, CircuitWire } from '../../../shared/circuit/circuitTypes';
import { TabDSimulationEngine } from './engine/analogSimulation';
import { CircuitCache, serveSolve } from './service';
import { handleSolve } from './handler';
import { LIMITS } from '../../circuit/schema';

const part = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 10, y: 20, rotation: 90, flipH: true, flipV: false, label: id, props });
const link = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, path: [[0, 0], [40, 0], [40, 40]], routing: 'manual' });

const divider = () => {
  const components = [part('V1', 'dc-voltage', { voltage: 10 }), part('R1', 'resistor', { resistance: 1000 }), part('R2', 'resistor', { resistance: 2000 }), part('G', 'ground')];
  const wires = [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'R2', 'a'), link('w3', 'R2', 'b', 'G', 'gnd'), link('w4', 'V1', 'neg', 'G', 'gnd')];
  return { components, wires, circuit: describeCircuit(components, wires) };
};

const rc = () => {
  const components = [part('V1', 'dc-voltage', { voltage: 5 }), part('R1', 'resistor', { resistance: 1000 }), part('C1', 'capacitor', { capacitance: 1e-6 }), part('G', 'ground')];
  const wires = [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'C1', 'a'), link('w3', 'C1', 'b', 'G', 'gnd'), link('w4', 'V1', 'neg', 'G', 'gnd')];
  return { components, wires, circuit: describeCircuit(components, wires) };
};

const request = (body: Record<string, unknown>) => ({ v: CIRCUIT_PROTOCOL_VERSION, ...body });
const ok = async (body: Record<string, unknown>, cache = new CircuitCache()) => {
  const result = await serveSolve(request(body), cache);
  expect(result.status).toBe(200);
  return result.body as Record<string, any>;
};

describe('describeCircuit: only electrical topology leaves the browser', () => {
  it('carries parameters, wire connectivity and nets — no coordinates, rotation, routing or symbols', () => {
    const { circuit } = divider();
    const text = JSON.stringify(circuit);
    for (const forbidden of ['"x"', '"y"', 'rotation', 'flipH', 'path', 'routing', 'waypoints', 'color']) expect(text).not.toContain(forbidden);
    expect(circuit.wires[0]).toEqual(['w1', 'V1', 'pos', 'R1', 'a']);
    expect(circuit.nodes['0']).toEqual(expect.arrayContaining(['G:gnd', 'V1:neg', 'R2:b']));
    expect(circuit.nodes).not.toHaveProperty('n:unused'); // single-terminal nets are not sent
  });

  it('keeps NaN / Infinity visible as strings so the engine can diagnose them instead of defaulting', () => {
    const circuit = describeCircuit([part('R1', 'resistor', { resistance: Number.NaN })], []);
    expect(circuit.components[0].props.resistance).toBe('NaN');
  });
});

describe('POST /api/circuit/solve — DC operating point', () => {
  it('solves a divider and reports voltages, currents and the power balance', async () => {
    const body = await ok({ analysisType: 'dc', circuit: divider().circuit });
    expect(body.ok).toBe(true);
    const node = Object.entries(body.nodeVoltages as Record<string, number>).find(([, v]) => Math.abs(v - 20 / 3) < 1e-6);
    expect(node).toBeTruthy();
    expect(body.branchCurrents.R1).toBeCloseTo(10 / 3000, 9);
    expect(body.powerSummary.absorbed).toBeCloseTo(100 / 3000, 9);
    expect(body.powerSummary.delivered).toBeCloseTo(100 / 3000, 9);
    expect(body.diagnostics).toEqual([]);
  });

  it('answers a missing ground with a structured diagnostic, not an exception', async () => {
    const { components, wires } = divider();
    const noGround = describeCircuit(components.filter((c) => c.type !== 'ground'), wires.filter((w) => !w.toComp.startsWith('G')));
    const body = await ok({ analysisType: 'dc', circuit: noGround });
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0].code).toBe('NO_REFERENCE');
  });

  it('refuses a malformed resistance instead of silently solving a default circuit', async () => {
    const components = [part('V1', 'dc-voltage', { voltage: 5 }), part('R1', 'resistor', { resistance: Number.NaN }), part('G', 'ground')];
    const wires = [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'G', 'gnd'), link('w3', 'V1', 'neg', 'G', 'gnd')];
    const body = await ok({ analysisType: 'transient', timeStep: 0.001, steps: 2, circuit: describeCircuit(components, wires) });
    expect(body.converged).toBe(false);
    expect(body.diagnostics[0].message).toMatch(/finite number/);
  });
});

describe('POST /api/circuit/solve — circuit registration', () => {
  it('registers the circuit once, then accepts its hash; an unknown hash is a 409', async () => {
    const cache = new CircuitCache();
    const first = await ok({ analysisType: 'dc', circuit: divider().circuit }, cache);
    expect(first.h).toMatch(/^[0-9a-f]{32}$/);
    const second = await serveSolve(request({ analysisType: 'dc', h: first.h }), cache);
    expect(second.status).toBe(200);
    expect(second.body.nodeVoltages).toEqual(first.nodeVoltages);
    const unknown = await serveSolve(request({ analysisType: 'dc', h: 'a'.repeat(32) }), cache);
    expect(unknown.status).toBe(409);
    expect(unknown.body.error).toBe('need_circuit');
  });

  it('keys the cache by the server-computed hash of the content, never by a client claim', async () => {
    const cache = new CircuitCache();
    const a = await ok({ analysisType: 'dc', circuit: divider().circuit }, cache);
    const edited = divider().circuit; edited.components[1].props.resistance = 4700;
    const b = await ok({ analysisType: 'dc', circuit: edited }, cache);
    expect(a.h).not.toBe(b.h);
  });
});

describe('POST /api/circuit/solve — validation', () => {
  it('rejects a version mismatch, a missing circuit, unknown fields of the wrong type and oversized collections', async () => {
    expect((await serveSolve({ v: 99, analysisType: 'dc' })).status).toBe(400);
    expect((await serveSolve(request({ analysisType: 'dc' }))).status).toBe(400);
    expect((await serveSolve(request({ analysisType: 'warp', circuit: divider().circuit }))).status).toBe(400);
    expect((await serveSolve(request({ analysisType: 'transient', timeStep: 'fast', steps: 1, circuit: divider().circuit }))).status).toBe(400);
    const huge: CircuitDescription = { components: Array.from({ length: LIMITS.maxComponents + 1 }, (_, i) => ({ id: `R${i}`, type: 'resistor', props: {} })), wires: [], nodes: {} };
    expect((await serveSolve(request({ analysisType: 'dc', circuit: huge }))).status).toBe(400);
  });

  it('bounds the simulated time of one transient request', async () => {
    const result = await serveSolve(request({ analysisType: 'transient', timeStep: 0.05, steps: 64, circuit: rc().circuit }));
    expect(result.status).toBe(400);
  });

  it('rejects an engine state that is not what exportState() produces', async () => {
    const result = await serveSolve(request({ analysisType: 'transient', timeStep: 0.001, steps: 1, circuit: rc().circuit, state: { mna: { capacitors: { C1: 'lots' } } } }));
    expect(result.status).toBe(400);
  });

  it('the HTTP handler returns JSON errors for bad bodies and wrong methods', async () => {
    const post = (body: string) => handleSolve(new Request('http://x/api/circuit/solve', { method: 'POST', body }));
    expect((await post('not json')).status).toBe(400);
    expect((await handleSolve(new Request('http://x/api/circuit/solve', { method: 'GET' }))).status).toBe(405);
    expect((await post('x'.repeat(800 * 1024))).status).toBe(413);
  });
});

describe('POST /api/circuit/solve — stateless transient', () => {
  it('reproduces an in-process run exactly when the state is echoed through JSON between calls', async () => {
    const { components, wires, circuit } = rc();
    const local = new TabDSimulationEngine();
    local.setCircuit(components, wires);
    let reference = local.getSnapshot();
    for (let i = 0; i < 30; i += 1) reference = local.step(0.002);

    const cache = new CircuitCache();
    let state: unknown; let hash: string | undefined; let last: Record<string, any> = {};
    for (let i = 0; i < 30; i += 1) {
      const body = await ok({ analysisType: 'transient', timeStep: 0.002, steps: 1, ...(hash ? { h: hash } : { circuit }), ...(state ? { state } : {}) }, cache);
      state = JSON.parse(JSON.stringify(body.state)); hash = body.h; last = body;
    }
    expect(last.converged).toBe(true);
    const cap = Object.entries(last.nodeVoltages as Record<string, number>).filter(([k]) => k !== '0').map(([, v]) => v).sort((a, b) => a - b)[0];
    const expected = Object.entries(reference.nodeVoltages).filter(([k]) => k !== '0').map(([, v]) => v).sort((a, b) => a - b)[0];
    expect(cap).toBeCloseTo(expected, 8);
    expect(last.time).toBeCloseTo(reference.time, 9);
    // the capacitor is charging toward 5 V: RC = 1 ms, 60 ms elapsed
    expect(Math.max(...Object.values(last.nodeVoltages as Record<string, number>))).toBeGreaterThan(4.99);
  });

  it('echoes wire currents and phases keyed by the wire ids the browser supplied', async () => {
    const body = await ok({ analysisType: 'transient', timeStep: 0.002, steps: 3, circuit: divider().circuit });
    expect(Object.keys(body.wireCurrents).sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(Math.abs(body.wireCurrents.w2)).toBeGreaterThan(1e-3);
    expect(Object.keys(body.wirePhases).length).toBeGreaterThan(0);
  });

  it('accepts carried state whose open-circuit ohmmeter reading came back from JSON as null (was +Infinity)', async () => {
    const cache = new CircuitCache();
    const first = await ok({ analysisType: 'transient', timeStep: 0.002, steps: 1, circuit: divider().circuit }, cache);
    const state = JSON.parse(JSON.stringify(first.state));
    state.disp = { M1: { value: null, unit: 'Ω', status: 'open' } };
    await ok({ analysisType: 'transient', timeStep: 0.002, steps: 1, h: first.h, state }, cache);
  });

  it('keeps a Schmitt trigger latched across stateless calls (hysteresis lives in the carried state)', async () => {
    const build = (vin: number) => {
      const components = [part('Vin', 'dc-voltage', { voltage: vin }), part('R1', 'resistor', { resistance: 9000 }), part('R2', 'resistor', { resistance: 1000 }), part('U1', 'opamp', { gain: 1e6 }), part('G', 'ground')];
      const wires = [
        link('w1', 'Vin', 'neg', 'G', 'gnd'), link('w2', 'Vin', 'pos', 'U1', 'in-'), link('w3', 'U1', 'out', 'R1', 'a'), link('w4', 'R1', 'b', 'U1', 'in+'),
        link('w5', 'U1', 'in+', 'R2', 'a'), link('w6', 'R2', 'b', 'G', 'gnd'),
      ];
      return describeCircuit(components, wires);
    };
    const outputOf = (body: Record<string, any>, circuit: CircuitDescription) => {
      const net = circuit.components.length && Object.entries(circuit.nodes).find(([, terminals]) => terminals.includes('U1:out'))![0];
      return body.nodeVoltages[net as string] as number;
    };
    const step = async (vin: number, state: unknown, retain?: string[]) => {
      const circuit = build(vin);
      const body = await ok({ analysisType: 'transient', timeStep: 0.001, steps: 2, circuit, ...(state ? { state } : {}), ...(retain ? { retain } : {}) });
      return { body, out: outputOf(body, circuit) };
    };
    const ids = ['Vin', 'R1', 'R2', 'U1', 'G'];
    let run = await step(0.2, undefined);
    expect(Math.abs(run.out)).toBeGreaterThan(14); // power-up inside the window: a rail, not the unstable linear equilibrium
    const power = run.out;
    run = await step(5, run.body.state, ids); expect(run.out).toBeLessThan(-14);
    run = await step(0.2, run.body.state, ids); expect(run.out).toBeLessThan(-14); // back inside the window: stays low
    run = await step(-5, run.body.state, ids); expect(run.out).toBeGreaterThan(14);
    run = await step(0.2, run.body.state, ids); expect(run.out).toBeGreaterThan(14);
    expect(Math.sign(power)).not.toBe(0);
  });
});

describe('POST /api/circuit/solve — academic analysis', () => {
  it('returns the derivation and the netlist it was derived from', async () => {
    const body = await ok({ analysisType: 'analysis', method: 'nodal', circuit: divider().circuit });
    expect(body.trace.status).toBe('ready');
    expect(body.trace.steps.length).toBeGreaterThan(0);
    expect(body.elements.map((e: { id: string }) => e.id).sort()).toEqual(['R1', 'R2', 'V1']);
  });

  it.each(['mesh', 'superposition', 'thevenin'] as const)('answers %s for a resistive circuit', async (method) => {
    const body = await ok({ analysisType: 'analysis', method, circuit: divider().circuit, ...(method === 'superposition' || method === 'thevenin' ? { targetResistor: 'R2' } : {}) });
    expect(['ready', 'unsupported']).toContain(body.trace.status);
    expect(body.elements.length).toBe(3);
  });
});
