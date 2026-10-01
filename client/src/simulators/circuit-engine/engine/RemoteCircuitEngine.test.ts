import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';
import { CircuitCache, serveSolve } from '../../../../../api/_lib/circuit/service';
import { CircuitEngineError, CircuitSession, type CircuitTransport } from '@/services/circuitClient';
import { RemoteCircuitEngine } from './RemoteCircuitEngine';
import { describeCircuit } from '@shared/circuit/nets';

const part = (id: string, type: string, props: Record<string, unknown> = {}, x = 0): CircuitComponent => ({ id, type, x, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const link = (id: string, a: string, at: string, b: string, bt: string, path: [number, number][] = [[0, 0], [10, 0]]): CircuitWire => ({ id, fromComp: a, fromTerm: at, toComp: b, toTerm: bt, path, routing: 'orthogonal' });

const rc = (resistance = 1000) => ({
  components: [part('V1', 'dc-voltage', { voltage: 5 }), part('R1', 'resistor', { resistance }), part('C1', 'capacitor', { capacitance: 1e-6 }), part('G', 'ground')],
  wires: [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'C1', 'a'), link('w3', 'C1', 'b', 'G', 'gnd'), link('w4', 'V1', 'neg', 'G', 'gnd')],
});

/** The real server, reached through a JSON round trip exactly like HTTP; records what crossed the wire. */
function loopback(cache = new CircuitCache()) {
  const bodies: Array<Record<string, any>> = [];
  const transport: CircuitTransport = async (body) => {
    const wire = JSON.parse(JSON.stringify(body));
    bodies.push(wire);
    const result = await serveSolve(wire, cache);
    if (result.status === 409) throw new CircuitEngineError('The engine needs the circuit', 409, undefined, 'need_circuit');
    if (result.status !== 200) throw new CircuitEngineError(String(result.body.error), result.status);
    return JSON.parse(JSON.stringify(result.body));
  };
  return { transport, bodies, cache };
}

const clock = () => { let t = 1000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run(engine: RemoteCircuitEngine, time: ReturnType<typeof clock>, frames: number, dt = 0.02) {
  for (let i = 0; i < frames; i += 1) { time.advance(100); engine.step(dt); await settle(); }
  time.advance(100);
  return engine.step(0);
}

/** Voltage across C1 (its `a` terminal; `b` is ground). */
const capVoltage = (snapshot: { terminalVoltages: Record<string, number> }) => snapshot.terminalVoltages['C1:a'] ?? 0;

describe('RemoteCircuitEngine', () => {
  it('answers every frame immediately and fills the snapshot from batched server results', async () => {
    const { transport, bodies } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    const first = engine.step(0.016);
    expect(first.converged).toBe(true); // never waits on the network
    await settle();
    const snapshot = await run(engine, time, 12, 0.03);
    expect(bodies.length).toBeGreaterThan(1);
    expect(snapshot.converged).toBe(true);
    expect(capVoltage(snapshot)).toBeGreaterThan(4.9); // RC = 1 ms: charged
    expect(snapshot.time).toBeGreaterThan(0.3);
  });

  it('hands out the same snapshot object until something new arrives (canvas effects re-read it after every render)', async () => {
    const { transport } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    const a = engine.getSnapshot();
    expect(engine.getSnapshot()).toBe(a);
    await run(engine, time, 3);
    const b = engine.getSnapshot();
    expect(b).not.toBe(a);
    expect(engine.getSnapshot()).toBe(b);
    expect(engine.getSnapshot()).toBe(b);
  });

  it('sends the electrical topology once, then only the hash and the carried state', async () => {
    const { transport, bodies } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    await run(engine, time, 5);
    expect(bodies[0].circuit).toBeTruthy();
    expect(bodies[0].h).toBeUndefined();
    for (const later of bodies.slice(1)) { expect(later.circuit).toBeUndefined(); expect(later.h).toMatch(/^[0-9a-f]{32}$/); }
    const wireText = JSON.stringify(bodies[0]);
    for (const layout of ['"x"', '"y"', 'rotation', 'flipH', 'path', 'routing']) expect(wireText).not.toContain(layout);
  });

  it('treats a layout-only edit as a no-op: no new request body, no state change', async () => {
    const { transport, bodies } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    await run(engine, time, 6);
    const before = capVoltage(engine.getSnapshot());
    const count = bodies.length;
    engine.setCircuit(components.map((c) => ({ ...c, x: c.x + 50, y: 30, rotation: 90 })), wires.map((w) => ({ ...w, path: [[0, 0], [99, 99]], routing: 'manual' as const })));
    const snapshot = await run(engine, time, 3);
    expect(bodies.slice(count).every((body) => body.circuit === undefined)).toBe(true); // still the registered circuit
    expect(capVoltage(snapshot)).toBeGreaterThanOrEqual(before - 1e-6);
  });

  it('keeps a capacitor charged through a value edit and starts a replaced circuit from rest', async () => {
    const { transport } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const original = rc();
    engine.setCircuit(original.components, original.wires);
    await run(engine, time, 8, 0.03);
    expect(capVoltage(engine.getSnapshot())).toBeGreaterThan(4.9);

    const edited = rc(2000);
    engine.setCircuit(edited.components, edited.wires); // R1: 1k → 2k, same parts, same wiring
    const afterEdit = await run(engine, time, 1, 0.001);
    expect(capVoltage(afterEdit)).toBeGreaterThan(4.5); // stored charge survived

    const other = {
      components: [part('V9', 'dc-voltage', { voltage: 5 }), part('R7', 'resistor', { resistance: 1000 }), part('R8', 'resistor', { resistance: 1000 }), part('C1', 'capacitor', { capacitance: 1e-6 }), part('G', 'ground')],
      wires: [link('a', 'V9', 'pos', 'R7', 'a'), link('b', 'R7', 'b', 'R8', 'a'), link('c', 'R8', 'b', 'C1', 'a'), link('d', 'C1', 'b', 'G', 'gnd'), link('e', 'V9', 'neg', 'G', 'gnd')],
    };
    engine.setCircuit(other.components, other.wires); // a different circuit that happens to reuse the id C1
    const fresh = await run(engine, time, 1, 0.001);
    expect(capVoltage(fresh)).toBeLessThan(2); // started from rest, not from the previous 5 V
  });

  it('reset() discharges, and a superseded in-flight result is discarded', async () => {
    const { transport } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    await run(engine, time, 8, 0.03);
    engine.reset();
    engine.setCircuit(components, wires);
    expect(engine.getSnapshot().time).toBe(0);
    const snapshot = await run(engine, time, 1, 0.001);
    expect(capVoltage(snapshot)).toBeLessThan(3.5); // ≈2.8 V after 1 ms of charging from rest (RC = 1 ms); a surviving charge would read ≈5 V
  });

  it('re-registers the circuit transparently when the server has dropped it (409)', async () => {
    const shared = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(shared.transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    await run(engine, time, 3);
    (shared.cache as unknown as { entries: Map<string, unknown> }).entries.clear(); // another isolate / eviction
    const snapshot = await run(engine, time, 3);
    expect(snapshot.converged).toBe(true);
    expect(shared.bodies.filter((body) => body.circuit !== undefined).length).toBe(2);
  });

  it('keeps the last good result on a transient failure and only warns after repeated ones', async () => {
    const time = clock();
    const good = loopback();
    let failing = false;
    const transport: CircuitTransport = async (body, signal) => { if (failing) throw new CircuitEngineError('Cannot reach the simulation engine'); return good.transport(body, signal); };
    const engine = new RemoteCircuitEngine(transport, time.now);
    const { components, wires } = rc();
    engine.setCircuit(components, wires);
    await run(engine, time, 4);
    failing = true;
    for (let i = 0; i < 12; i += 1) { time.advance(5000); engine.step(0.02); await settle(); }
    const snapshot = engine.getSnapshot();
    expect(snapshot.converged).toBe(false);
    expect(snapshot.warnings[0]).toMatchObject({ code: 'ENGINE_UNREACHABLE' });
    expect(capVoltage(snapshot)).toBeGreaterThan(4.9); // the canvas keeps its last values
    failing = false;
    time.advance(10_000); // past the back-off
    const recovered = await run(engine, time, 3);
    expect(recovered.converged).toBe(true);
  });

  it('extrapolates wire animation phases between responses so the flow stays smooth', async () => {
    const { transport } = loopback(); const time = clock();
    const engine = new RemoteCircuitEngine(transport, time.now);
    const components = [part('V1', 'dc-voltage', { voltage: 10 }), part('R1', 'resistor', { resistance: 100 }), part('G', 'ground')];
    const wires = [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'G', 'gnd'), link('w3', 'V1', 'neg', 'G', 'gnd')];
    engine.setCircuit(components, wires);
    await run(engine, time, 6, 0.03);
    const a = engine.step(0).wirePhases!.w1;
    const b = engine.step(0.01).wirePhases!.w1;
    const c = engine.step(0.01).wirePhases!.w1;
    expect(Math.abs(a)).toBeGreaterThan(0);
    expect(Math.abs(b - a)).toBeGreaterThan(0);
    expect(Math.sign(b - a)).toBe(Math.sign(c - b));
  });
});

describe('CircuitSession', () => {
  it('sends the circuit, learns the hash, then sends only the hash', async () => {
    const { transport, bodies } = loopback();
    const { components, wires } = rc();
    const session = new CircuitSession(describeCircuit(components, wires), transport);
    await session.send({ analysisType: 'dc' });
    await session.send({ analysisType: 'dc' });
    expect(bodies[0].circuit).toBeTruthy();
    expect(bodies[1].circuit).toBeUndefined();
    expect(bodies[1].h).toBe(bodies[1].h && (await session.send({ analysisType: 'dc' })).h);
  });
});
