import { describe, expect, it } from 'vitest';
import type { DesWireState } from '../../../shared/logic/desTypes';
import { handleLogic } from './handler';
import { DiscreteEventLogicEngine } from './desLogicCore';
import { serveLogic } from './service';

const comp = (id: string, type: string, props: Record<string, unknown> = {}) => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string) => ({ id, fromComp, fromTerm, toComp, toTerm });

// 2-bit ripple counter off a free-running clock, an AND decoder on its outputs, plus a RAM and a flip-flop
const components = [
  comp('clk', 'logic-clock', { clockPeriodMs: 100 }), comp('one', 'digital-input', { state: 'HIGH' }), comp('f0', 'logic-ff-t'), comp('f1', 'logic-ff-t'),
  comp('and', 'gate-and'), comp('out', 'digital-output'), comp('d', 'digital-input', { state: 'LOW' }), comp('dff', 'logic-ff-d'),
];
const wires = [
  wire('c0', 'clk', 'out', 'f0', 'clk'), wire('t0', 'one', 'out', 'f0', 't'), wire('t1', 'one', 'out', 'f1', 't'), wire('r', 'f0', 'qn', 'f1', 'clk'),
  wire('a', 'f0', 'q', 'and', 'a'), wire('b', 'f1', 'q', 'and', 'b'), wire('o', 'and', 'y', 'out', 'in'), wire('dd', 'd', 'out', 'dff', 'd'), wire('dc', 'clk', 'out', 'dff', 'clk'),
];
const des = (state: DesWireState | null, ops: unknown[]) => serveLogic({ op: 'des', components, wires, state, ops });
const stateOf = (r: { body: Record<string, unknown> }) => r.body.state as DesWireState;

describe('serveLogic · discrete-event ops', () => {
  it('is stateless: N one-step requests carrying state equal one request and equal the in-process engine', () => {
    const steps = Array.from({ length: 12 }, () => ({ t: 'step', dt: 0.03 }));
    let state: DesWireState | null = null;
    let last: ReturnType<typeof des> | null = null;
    for (const step of steps) { last = des(state, [step]); state = stateOf(last); }
    const whole = des(null, steps);
    expect(stateOf(whole)).toEqual(state);
    const direct = new DiscreteEventLogicEngine();
    direct.setCircuit(components.map(c => ({ ...c })), wires.map(w => ({ ...w, routing: 'orthogonal' as const, path: [[0, 0], [20, 0]] as [number, number][] })));
    steps.forEach(() => direct.step(0.03));
    expect((whole.body.snapshot as { terminalVoltages: unknown }).terminalVoltages).toEqual(direct.getSnapshot().terminalVoltages);
    expect(stateOf(whole).t).toBeGreaterThan(0);
  });

  it('toggle and drive ops update outputs; events report wire transitions in time order', () => {
    const first = des(null, []);
    const toggled = des(stateOf(first), [{ t: 'toggle', id: 'd' }]);
    expect((toggled.body.pins as Record<string, number>)['d:out']).toBe(1);
    const events = toggled.body.events as [string, unknown, number][];
    expect(events.length).toBeGreaterThan(0);
    events.forEach((e, i) => { if (i) expect(e[2]).toBeGreaterThanOrEqual(events[i - 1][2]); });
    const driven = des(stateOf(toggled), [{ t: 'drive', id: 'd', value: 0 }]);
    expect((driven.body.pins as Record<string, number>)['d:out']).toBe(0);
  });

  it('reports an oscillating ring without hanging', () => {
    const ring = [comp('n0', 'gate-not'), comp('n1', 'gate-not'), comp('n2', 'gate-not')];
    const res = serveLogic({ op: 'des', components: ring, wires: [wire('a', 'n0', 'y', 'n1', 'a'), wire('b', 'n1', 'y', 'n2', 'a'), wire('c', 'n2', 'y', 'n0', 'a')], state: null, ops: [] });
    expect((res.body.snapshot as { status: string }).status).toBe('oscillating');
  });

  it('rejects unknown input ids as a diagnostic, not a crash', () => {
    const res = des(null, [{ t: 'toggle', id: 'nope' }]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false });
  });
});

describe('serveLogic · analysis ops', () => {
  it('kmap returns the minimal cover', () => {
    const res = serveLogic({ op: 'kmap', variables: ['A', 'B', 'C', 'D'], minterms: [0, 1, 2, 3, 8, 9, 10, 11] });
    expect((res.body.solution as { expression: string }).expression).toBe("B'");
  });
  it('synthesis, truth-table, fsm and timing answer; bad expressions come back as diagnostics', () => {
    expect(serveLogic({ op: 'synthesis', expression: 'A*B + C*D', mode: 'NAND' }).body).toMatchObject({ ok: true });
    expect(serveLogic({ op: 'synthesis', expression: 'A*(B+C)', mode: 'NAND' }).body).toMatchObject({ ok: false });
    const tt = serveLogic({ op: 'truth-table', expression: 'A ^ B' });
    expect(tt.body.minterms).toEqual([1, 2]);
    const fsm = serveLogic({
      op: 'fsm', encoding: 'Binary', flipFlop: 'D', hdl: true,
      machine: { kind: 'Moore', inputName: 'A', outputName: 'Y', states: [{ id: 'S0', name: 'S0', output: '0', x: 0, y: 0 }, { id: 'S1', name: 'S1', output: '1', x: 1, y: 1 }], transitions: [{ id: 't', from: 'S0', to: 'S1', input: '1' }] },
    });
    expect(fsm.body).toMatchObject({ ok: true });
    expect(String(fsm.body.verilog)).toContain('endmodule');
    const timing = serveLogic({ op: 'timing', expression: 'A ^ B', clock: { name: 'CLK', type: 'clock', data: [0, 1, 0, 1] }, inputTracks: [{ name: 'A', type: 'input', data: [0, 1, 1, 0] }, { name: 'B', type: 'input', data: [0, 0, 1, 1] }] });
    expect(timing.body).toMatchObject({ ok: true });
  });
  it('mixed: gate macromodel on MNA, and a driver tie yields the contention diagnostic', () => {
    const base = [comp('A', 'digital-input', { state: 'HIGH', highVoltage: 5 }), comp('G', 'gate-not', { delay: 0 }), comp('GND', 'ground')];
    const gw = [wire('a0', 'A', 'gnd', 'GND', 'gnd'), wire('g0', 'G', 'gnd', 'GND', 'gnd'), wire('a1', 'A', 'out', 'G', 'a')];
    expect((serveLogic({ op: 'mixed', engine: 'tab-d', components: base, wires: gw }).body.snapshot as { converged: boolean }).converged).toBe(true);
    const tied = serveLogic({ op: 'mixed', engine: 'tab-d', components: [...base, comp('G2', 'gate-not', { delay: 0 })], wires: [...gw, wire('g2', 'G2', 'gnd', 'GND', 'gnd'), wire('a2', 'A', 'out', 'G2', 'a'), wire('y', 'G', 'y', 'G2', 'y')] });
    expect((tied.body.snapshot as { warnings: { code: string }[] }).warnings[0].code).toBe('LOGIC_OUTPUT_CONTENTION');
  });
});

describe('request validation and the HTTP handler', () => {
  const post = (text: string) => handleLogic(new Request('http://x/api/logic/solve', { method: 'POST', body: text }));
  it('rejects malformed requests with 400', () => {
    expect(serveLogic({ op: 'nope' }).status).toBe(400);
    expect(serveLogic({ op: 'kmap', variables: ['A'], minterms: [] }).status).toBe(400);
    expect(serveLogic({ op: 'kmap', variables: ['A', 'B'], minterms: [99] }).status).toBe(400);
    expect(serveLogic({ op: 'synthesis', expression: 'x'.repeat(300), mode: 'NAND' }).status).toBe(400);
    expect(des(null, Array.from({ length: 17 }, () => ({ t: 'step', dt: 0.01 }))).status).toBe(400);
    expect(serveLogic({ op: 'des', components: [comp('x', 'digital-input', { nested: { a: 1 } })], wires: [], state: null, ops: [] }).status).toBe(400);
    expect(serveLogic({ op: 'timing', expression: 'A', clock: { name: 'CLK', type: 'clock', data: Array(300).fill(0) }, inputTracks: [] }).status).toBe(400);
  });
  it('rejects non-POST, bad JSON and oversized bodies; reports server time', async () => {
    expect((await handleLogic(new Request('http://x/', { method: 'GET' }))).status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post('x'.repeat(400 * 1024))).status).toBe(413);
    const ok = await post(JSON.stringify({ op: 'truth-table', expression: 'A+B' }));
    expect(typeof (await ok.json()).ms).toBe('number');
  });
});
