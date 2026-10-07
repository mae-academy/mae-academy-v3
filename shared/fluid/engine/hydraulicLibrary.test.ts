import { describe, expect, it } from 'vitest';
import { FluidEngine } from './FluidEngine';
import type { EngineComponent, EngineSnapshot } from './types';

const part = (id: string, type: string, props: Record<string, unknown> = {}): EngineComponent => ({ id, type, props });
const wire = (from: string, to: string) => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};
const engineOf = (components: EngineComponent[], pipes: Array<[string, string]>) => new FluidEngine({ components, wires: pipes.map(([a, b]) => wire(a, b)) });
const bar = (snapshot: EngineSnapshot, node: string) => snapshot.portPressure[node];

const PUSH_BOTH = { actuationLeft: 'Pushbutton', actuationRight: 'Pushbutton' };

/** Pump P → valve P, valve T → tank, valve A / B → double-acting cylinder rear / rod side. */
const drive = (valveType: string, valveProps: Record<string, unknown> = PUSH_BOTH, extra: EngineComponent[] = [], extraPipes: Array<[string, string]> = []) => engineOf(
  [part('pump', 'hyd-pump'), part('relief', 'hyd-pressure-relief'), part('tank', 'hyd-tank'), part('v', valveType, valveProps), part('cyl', 'cylinder-double'), ...extra],
  [['pump:out', 'v:p1'], ['pump:out', 'relief:p1'], ['v:p3', 'tank:p'], ['relief:t', 'tank:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'], ...extraPipes],
);

describe('4/3 valve with the ports P, T, A, B wired to a pump, a tank and a double-acting cylinder', () => {
  it('extends and retracts with the two solenoid ends, and the tank line really is the exhaust', () => {
    const engine = drive('hvalve-4-3');
    engine.setManual('v', 'left', true);
    const extending = engine.step(0.4);
    expect(bar(extending, 'v:p1')).toBe(50);
    expect(bar(extending, 'v:p3')).toBe(0);
    expect(bar(extending, 'cyl:a')).toBe(50);
    expect(extending.cylinders.cyl.velocity).toBeGreaterThan(0);
    engine.step(3);
    expect(engine.getSnapshot().cylinders.cyl.stroke).toBe(1);

    engine.setManual('v', 'left', false);
    engine.setManual('v', 'right', true);
    expect(engine.step(0.3).cylinders.cyl.velocity).toBeLessThan(0);
    expect(bar(engine.getSnapshot(), 'cyl:b')).toBe(50);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(0);
    engine.step(3);
    expect(engine.getSnapshot().cylinders.cyl.stroke).toBe(0);
  });

  it('closed neutral blocks all four ports: the pump pressure is held and the cylinder locks', () => {
    const engine = drive('hvalve-4-3');
    engine.setManual('v', 'left', true);
    engine.step(0.4);
    engine.setManual('v', 'left', false);
    const held = engine.step(0.5);
    expect(held.valves.v.position).toBe(2);
    expect(bar(held, 'pump:out')).toBe(50);
    expect(held.cylinders.cyl.velocity).toBe(0);
    expect(bar(held, 'cyl:a')).toBe(50);
  });

  it('float neutral drains A and B to tank and blocks P', () => {
    const snapshot = drive('hvalve-4-3-float').step(0.2);
    expect(snapshot.valves.v.position).toBe(2);
    expect(bar(snapshot, 'v:p1')).toBe(50);
    expect(bar(snapshot, 'cyl:a')).toBe(0);
    expect(bar(snapshot, 'cyl:b')).toBe(0);
  });

  it('tandem (bypass) neutral unloads the pump to tank and blocks A and B', () => {
    const engine = drive('hvalve-4-3-tandem');
    engine.setManual('v', 'left', true);
    engine.step(0.4);
    engine.setManual('v', 'left', false);
    const snapshot = engine.step(0.4);
    expect(snapshot.valves.v.position).toBe(2);
    expect(bar(snapshot, 'pump:out')).toBe(0);
    expect(bar(snapshot, 'v:p1')).toBe(0);
    expect(snapshot.cylinders.cyl.velocity).toBe(0);
    // an operator still takes over from the tandem centre
    engine.setManual('v', 'left', true);
    expect(bar(engine.step(0.1), 'pump:out')).toBe(50);
  });

  it('an unpiped tank port still drains, like the old internal tank', () => {
    const engine = engineOf([part('pump', 'hyd-pump'), part('v', 'hvalve-4-3', PUSH_BOTH), part('cyl', 'cylinder-double')], [['pump:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    engine.setManual('v', 'left', true);
    expect(engine.step(0.4).cylinders.cyl.velocity).toBeGreaterThan(0);
  });
});

describe('hydraulic energy and return elements', () => {
  it('the pump is a 50 bar pressure source on its P port', () => {
    expect(bar(engineOf([part('pump', 'hyd-pump')], []).step(), 'pump:out')).toBe(50);
  });

  it('the tank takes every return line to 0 bar', () => {
    const engine = engineOf([part('pump', 'hyd-pump'), part('relief', 'hyd-pressure-relief', { crackingPressure: 30 }), part('tank', 'hyd-tank')], [['pump:out', 'relief:p1'], ['relief:t', 'tank:p']]);
    const snapshot = engine.step();
    expect(bar(snapshot, 'pump:out')).toBe(30);
    expect(bar(snapshot, 'relief:t')).toBe(0);
    expect(snapshot.reliefValves.relief.open).toBe(true);
  });

  it('the accumulator keeps its pressure behind a check valve when the line is dumped', () => {
    const engine = engineOf(
      [part('pump', 'hyd-pump'), part('v', 'hvalve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), part('chk', 'check-valve'), part('acc', 'hyd-accumulator'), part('gauge', 'pressure-gauge')],
      [['pump:out', 'v:p1'], ['v:p2', 'chk:p1'], ['chk:p2', 'acc:p'], ['acc:p', 'gauge:p']],
    );
    engine.setManual('v', 'left', true);
    const charged = engine.step(0.3);
    expect(bar(charged, 'acc:p')).toBe(50);
    expect(charged.volumes.acc.pressure).toBe(50);
    engine.setManual('v', 'left', false);
    const held = engine.step(1);
    expect(bar(held, 'v:p2')).toBe(0);
    expect(bar(held, 'acc:p')).toBe(50);
    expect(bar(held, 'gauge:p')).toBe(50);
  });

  it('the filter and the oil cooler pass the flow through', () => {
    const engine = engineOf([part('pump', 'hyd-pump'), part('f', 'hyd-filter'), part('c', 'hyd-cooler'), part('relief', 'hyd-pressure-relief')], [['pump:out', 'f:in'], ['f:out', 'c:in'], ['c:out', 'relief:p1']]);
    expect(bar(engine.step(), 'relief:p1')).toBe(50);
    expect(engine.getSnapshot().diagnostics.some(d => d.code === 'MISSING_RELIEF_VALVE')).toBe(false);
  });

  it('pressure reducing valves hold their outlet at the set pressure', () => {
    for (const type of ['hyd-reducing-valve', 'hyd-reducing-valve-3way']) {
      const engine = engineOf([part('pump', 'hyd-pump'), part('prv', type, { setpoint: 30 }), part('gauge', 'pressure-gauge')], [['pump:out', 'prv:p1'], ['prv:p2', 'gauge:p']]);
      const snapshot = engine.step();
      expect(bar(snapshot, 'prv:p1'), type).toBe(50);
      expect(bar(snapshot, 'gauge:p'), type).toBe(30);
    }
  });
});

describe('one-way flow control: meter-in and meter-out', () => {
  const metered = (where: 'in' | 'out') => {
    const fc = part('fc', 'flow-control-oneway', { openingPercentage: 25 });
    const pipes: Array<[string, string]> = where === 'in'
      ? [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']]
      : [['v:p4', 'cyl:a'], ['cyl:b', 'fc:in'], ['fc:out', 'v:p2']];
    const engine = engineOf(
      [part('pump', 'hyd-pump'), part('tank', 'hyd-tank'), part('v', 'hvalve-4-2', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), fc, part('cyl', 'cylinder-double')],
      [['pump:out', 'v:p1'], ['v:p3', 'tank:p'], ...pipes],
    );
    return engine;
  };
  const free = () => engineOf(
    [part('pump', 'hyd-pump'), part('tank', 'hyd-tank'), part('v', 'hvalve-4-2', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), part('cyl', 'cylinder-double')],
    [['pump:out', 'v:p1'], ['v:p3', 'tank:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
  );

  it('both ways of metering slow the stroke it is placed against, to the opening', () => {
    const reference = free();
    reference.setManual('v', 'left', true);
    const full = reference.step(0.3).cylinders.cyl.velocity;
    for (const where of ['in', 'out'] as const) {
      const engine = metered(where);
      engine.setManual('v', 'left', true);
      const speed = engine.step(0.3).cylinders.cyl.velocity;
      expect(speed / full, where).toBeCloseTo(0.25, 2);
    }
  });

  it('the return stroke goes through the check valve at full speed', () => {
    for (const where of ['in', 'out'] as const) {
      const engine = metered(where);
      engine.setManual('v', 'left', true);
      engine.step(20);
      engine.setManual('v', 'left', false);
      const back = engine.step(0.2).cylinders.cyl.velocity;
      const reference = free();
      reference.setManual('v', 'left', true);
      reference.step(5);
      reference.setManual('v', 'left', false);
      expect(back, where).toBeCloseTo(reference.step(0.2).cylinders.cyl.velocity, 6);
    }
  });
});
