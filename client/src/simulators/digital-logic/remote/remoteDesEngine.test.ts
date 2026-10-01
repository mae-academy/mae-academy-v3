import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '@shared/logic/circuitTypes';
import { RemoteDesEngine } from './remoteDesEngine';
import { installInProcessLogicApi, uninstallInProcessLogicApi } from './test-utils';

beforeAll(installInProcessLogicApi);
afterAll(uninstallInProcessLogicApi);

const comp = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('RemoteDesEngine (browser end of the serverless discrete-event engine)', () => {
  it('builds the circuit remotely, answers toggles, and replays wire events to subscribers in order', async () => {
    const engine = new RemoteDesEngine({ batchMs: 0 });
    const seen: [unknown, number][] = [];
    engine.subscribeToWire('w2', (value, at) => seen.push([value, at]));
    engine.setCircuit([comp('a', 'digital-input', { state: 'LOW' }), comp('n', 'gate-not'), comp('o', 'digital-output')], [wire('w1', 'a', 'out', 'n', 'a'), wire('w2', 'n', 'y', 'o', 'in')]);
    await engine.idle();
    expect(engine.getLogicState('o', 'in')).toBe(1);
    expect(engine.getSnapshot().terminalVoltages['o:in']).toBe(1);
    engine.toggleDigitalInput('a');
    expect(engine.getSnapshot().terminalVoltages['a:out']).toBe(1); // optimistic, before the reply
    await engine.idle();
    expect(engine.getLogicState('o', 'in')).toBe(0);
    expect(engine.getWireLogicState('w2')).toBe(0);
    expect(seen.map(([v]) => v)).toContain(0);
    seen.forEach(([, at], i) => { if (i) expect(at).toBeGreaterThanOrEqual(seen[i - 1][1]); });
  });

  it('carries state between requests: a clocked T flip-flop divides the clock', async () => {
    const engine = new RemoteDesEngine({ batchMs: 0 });
    engine.setCircuit([comp('clk', 'logic-clock', { clockPeriodMs: 100 }), comp('one', 'digital-input', { state: 'HIGH' }), comp('f', 'logic-ff-t')], [wire('c', 'clk', 'out', 'f', 'clk'), wire('t', 'one', 'out', 'f', 't')]);
    await engine.idle();
    const levels: unknown[] = [];
    for (let i = 0; i < 8; i += 1) { engine.step(0.1); await engine.idle(); levels.push(engine.getLogicState('f', 'q')); }
    expect(levels).toEqual([1, 0, 1, 0, 1, 0, 1, 0]); // one rising edge per 100 ms step toggles Q; state survives every request
    expect(engine.getTime()).toBeCloseTo(0.8, 6);
  });

  it('discards the reply of a replaced circuit and reports the oscillating status', async () => {
    const engine = new RemoteDesEngine({ batchMs: 0 });
    engine.setCircuit([comp('x', 'digital-input', { state: 'HIGH' })], []);
    engine.setCircuit([comp('n0', 'gate-not'), comp('n1', 'gate-not'), comp('n2', 'gate-not')], [wire('a', 'n0', 'y', 'n1', 'a'), wire('b', 'n1', 'y', 'n2', 'a'), wire('c', 'n2', 'y', 'n0', 'a')]);
    await engine.idle();
    expect(engine.getSnapshot().status).toBe('oscillating');
    expect(engine.getLogicState('x', 'out')).toBe('X'); // the first circuit is gone
  });

  it('surfaces a transport failure instead of hanging', async () => {
    const { setLogicTransport } = await import('@/services/logicClient');
    setLogicTransport(async () => { throw new Error('offline'); });
    const errors: string[] = [];
    const engine = new RemoteDesEngine({ onError: m => errors.push(m) });
    engine.setCircuit([comp('x', 'digital-input')], []);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(errors).toEqual(['offline']);
    installInProcessLogicApi();
  });
});
