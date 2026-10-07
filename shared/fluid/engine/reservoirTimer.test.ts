import { describe, expect, it } from 'vitest';
import { FluidEngine } from './FluidEngine';
import { VOLUME_TIME_CONSTANT, chargeTime, stepVolume } from './componentSolvers';
import { DEFAULT_ENGINE_CONFIG, type EngineComponent, type EngineSnapshot } from './types';

const part = (id: string, type: string, props: Record<string, unknown> = {}): EngineComponent => ({ id, type, props });
const wire = (from: string, to: string) => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};
const network = (components: EngineComponent[], pipes: Array<[string, string]>) => ({ components, wires: pipes.map(([a, b]) => wire(a, b)) });
const bar = (snapshot: EngineSnapshot, node: string) => snapshot.portPressure[node];
const DT = DEFAULT_ENGINE_CONFIG.dt;
const THRESHOLD = DEFAULT_ENGINE_CONFIG.pilotThreshold;

/**
 * 3/2 supply valve (pushbutton) → throttle → air reservoir → pilot port 12 of a 3/2 NC valve that feeds a gauge.
 * Pressing the pushbutton applies 6 bar to the throttle; releasing it vents the line through the valve's port 3.
 */
const timerCircuit = (throttle: EngineComponent | null, reservoir: Record<string, unknown> = {}) => {
  const line: Array<[string, string]> = throttle
    ? [['v0:p2', 'fc:in'], ['fc:out', 'res:left']]
    : [['v0:p2', 'res:left']];
  return new FluidEngine(network(
    [
      part('src', 'pressure-source'),
      part('v0', 'valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }),
      ...(throttle ? [throttle] : []),
      part('res', 'air-reservoir', reservoir),
      part('v1', 'valve-3-2-nc', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' }),
      part('out', 'pressure-gauge'),
    ],
    [['src:out', 'v0:p1'], ...line, ['res:right', 'v1:pilotL'], ['src:out', 'v1:p1'], ['v1:p2', 'out:p']],
  ));
};

/** Runs until `done` or the limit, returning the elapsed time in seconds (null when it never happened). */
const timeUntil = (engine: FluidEngine, done: (snapshot: EngineSnapshot) => boolean, limit = 60): number | null => {
  for (let tick = 0; tick < limit / DT; tick += 1) {
    if (done(engine.step())) return engine.getSnapshot().time;
  }
  return null;
};

describe('air reservoir: transient charging', () => {
  it('climbs exponentially towards line pressure through a 20 % throttle', () => {
    const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: 20 }));
    engine.setManual('v0', 'left', true);
    const samples: number[] = [];
    for (let second = 0; second < 20; second += 1) {
      engine.step(1);
      samples.push(bar(engine.getSnapshot(), 'res:left'));
    }
    expect(samples[0]).toBeGreaterThan(0);
    expect(samples[0]).toBeLessThan(2);
    expect(samples.every((value, i) => i === 0 || value > samples[i - 1])).toBe(true);
    // P(t) = Ps · (1 − e^(−t/τ)) with τ = K · V / Cv = 1 s · 1 L / 0.2
    const tau = (VOLUME_TIME_CONSTANT * 1) / 0.2;
    samples.slice(0, 8).forEach((value, i) => expect(value).toBeCloseTo(6 * (1 - Math.exp(-(i + 1) / tau)), 1));
    expect(samples[19]).toBeGreaterThan(5.8);
    expect(samples[19]).toBeLessThanOrEqual(6);
  });

  it('a wider throttle charges faster, a larger vessel slower', () => {
    const reach = (opening: number, volume: number) => {
      const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: opening }), { volume });
      engine.setManual('v0', 'left', true);
      return timeUntil(engine, snapshot => bar(snapshot, 'res:left') >= 3)!;
    };
    expect(reach(100, 1000)).toBeLessThan(reach(20, 1000));
    expect(reach(20, 500)).toBeLessThan(reach(20, 1000));
    expect(reach(20, 1000) / reach(20, 500)).toBeCloseTo(2, 1);
  });

  it('fills instantly when nothing restricts the line', () => {
    const engine = timerCircuit(null);
    engine.setManual('v0', 'left', true);
    expect(bar(engine.step(), 'res:left')).toBe(6);
  });

  it('discharges instantly through the free-return check valve of a one-way flow control', () => {
    const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: 20 }));
    engine.setManual('v0', 'left', true);
    engine.step(30);
    expect(bar(engine.getSnapshot(), 'res:left')).toBeGreaterThan(5.9);
    engine.setManual('v0', 'left', false);
    const snapshot = engine.step();
    expect(bar(snapshot, 'res:left')).toBe(0);
    expect(snapshot.volumes.res.pressure).toBe(0);
  });

  it('a plain throttle empties the vessel as slowly as it fills it', () => {
    const engine = timerCircuit(part('fc', 'flow-control', { openingPercentage: 20 }));
    engine.setManual('v0', 'left', true);
    engine.step(30);
    engine.setManual('v0', 'left', false);
    engine.step(1);
    const after = bar(engine.getSnapshot(), 'res:left');
    expect(after).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(6 * Math.exp(-0.9 * 0.2));
    expect(engine.getSnapshot().volumes.res.rate).toBeLessThan(0);
  });

  it('reports the charge state, rate and vessel volume in the snapshot', () => {
    const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: 20 }), { volume: 2500 });
    engine.setManual('v0', 'left', true);
    const state = engine.step(0.5).volumes.res;
    expect(state.volumeCm3).toBe(2500);
    expect(state.rate).toBeGreaterThan(0);
    expect(state.pressure).toBeGreaterThan(0);
  });

  it('reset empties the vessel', () => {
    const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: 20 }));
    engine.setManual('v0', 'left', true);
    engine.step(5);
    engine.reset();
    expect(engine.getSnapshot().volumes.res.pressure).toBe(0);
  });
});

describe('stepVolume', () => {
  it('is unconditionally stable and never overshoots its target', () => {
    const feeds = [{ pressure: 6, cvIn: 0.2, timedIn: true, cvOut: 1, timedOut: false }];
    expect(stepVolume(0, feeds, 1, 1000)).toBeCloseTo(6, 6);
    expect(stepVolume(0, feeds, 1, 0.016)).toBeGreaterThan(0);
  });

  it('chargeTime inverts the exponential', () => {
    const t = chargeTime(6, 0, 3, 20, 1000);
    expect(t).toBeCloseTo(-5 * Math.log(0.5), 9);
    expect(chargeTime(6, 0, 6, 20, 1000)).toBe(Infinity);
  });
});

describe('pneumatic pilot cracking pressure', () => {
  const piloted = () => new FluidEngine(network(
    [part('src', 'pressure-source'), part('v', 'valve-3-2-nc', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' }), part('out', 'pressure-gauge')],
    [['src:out', 'v:p1'], ['v:p2', 'out:p']],
  ));

  it('does not switch on any positive pressure, only from the cracking pressure up', () => {
    const engine = piloted();
    engine.injectPressure('v', 'pilotL', 2);
    expect(engine.step().valves.v.position).toBe(0);
    engine.injectPressure('v', 'pilotL', THRESHOLD - 0.01);
    expect(engine.step().valves.v.position).toBe(0);
    engine.injectPressure('v', 'pilotL', THRESHOLD);
    expect(engine.step().valves.v.position).toBe(1);
  });

  it('cracks between 2.5 and 3 bar like a real valve', () => {
    expect(THRESHOLD).toBeGreaterThanOrEqual(2.5);
    expect(THRESHOLD).toBeLessThanOrEqual(3);
  });
});

describe('discrete on-delay timer: throttle 20 % + reservoir + 3/2 pilot valve', () => {
  it('applying 6 bar delays the switch by Δt > 0, and cutting the supply resets it at once', () => {
    const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: 20 }));
    expect(bar(engine.step(), 'out:p')).toBe(0);
    engine.setManual('v0', 'left', true);

    const delay = timeUntil(engine, snapshot => snapshot.valves.v1.position === 1)!;
    expect(delay).toBeGreaterThan(0);
    // P = Ps(1 − e^(−t/τ)) crosses the 3 bar cracking pressure at chargeTime(); the engine agrees to within a tick
    expect(delay).toBeCloseTo(chargeTime(6, 0, THRESHOLD, 20, 1000), 1);
    expect(delay).toBeGreaterThan(2);
    expect(bar(engine.getSnapshot(), 'out:p')).toBe(6);

    engine.setManual('v0', 'left', false);
    const reset = engine.step();
    expect(reset.valves.v1.position).toBe(0);
    expect(bar(reset, 'out:p')).toBe(0);
  });

  it('stays off while the signal is shorter than the delay', () => {
    const engine = timerCircuit(part('fc', 'flow-control-oneway', { openingPercentage: 20 }));
    engine.setManual('v0', 'left', true);
    engine.step(1.5);
    engine.setManual('v0', 'left', false);
    for (let tick = 0; tick < 200; tick += 1) expect(engine.step().valves.v1.position).toBe(0);
  });
});

describe('time delay valve (integrated, normally closed)', () => {
  const timer = (props: Record<string, unknown> = {}) => new FluidEngine(network(
    [
      part('src', 'pressure-source'),
      part('v0', 'valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }),
      part('td', 'time-delay-valve', { openingPercentage: 20, volume: 500, ...props }),
      part('out', 'pressure-gauge'),
    ],
    [['src:out', 'v0:p1'], ['src:out', 'td:p1'], ['v0:p2', 'td:z12'], ['td:p2', 'out:p']],
  ));

  it('keeps 1 blocked and 2 vented during the delay, then connects 1 → 2', () => {
    const engine = timer();
    expect(bar(engine.step(), 'out:p')).toBe(0);
    engine.setManual('v0', 'left', true);
    const before = engine.step(0.3);
    expect(before.volumes.td.pressure).toBeGreaterThan(0);
    expect(before.volumes.td.pressure).toBeLessThan(THRESHOLD);
    expect(bar(before, 'out:p')).toBe(0);

    const delay = timeUntil(engine, snapshot => bar(snapshot, 'out:p') > 0)!;
    expect(delay).toBeGreaterThan(0.3);
    expect(delay).toBeCloseTo(chargeTime(6, 0, THRESHOLD, 20, 500), 1);
    expect(bar(engine.getSnapshot(), 'out:p')).toBe(6);
    expect(engine.getSnapshot().volumes.td.pressure).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('delay follows the throttle opening and the reservoir volume', () => {
    const switchTime = (props: Record<string, unknown>) => {
      const engine = timer(props);
      engine.setManual('v0', 'left', true);
      return timeUntil(engine, snapshot => bar(snapshot, 'out:p') > 0)!;
    };
    expect(switchTime({ openingPercentage: 100 })).toBeLessThan(switchTime({ openingPercentage: 20 }));
    expect(switchTime({ volume: 250 })).toBeLessThan(switchTime({ volume: 500 }));
  });

  it('resets in a single tick when the signal is removed, venting 2 through 3', () => {
    const engine = timer();
    engine.setManual('v0', 'left', true);
    engine.step(10);
    expect(bar(engine.getSnapshot(), 'out:p')).toBe(6);
    engine.setManual('v0', 'left', false);
    const reset = engine.step();
    expect(reset.volumes.td.pressure).toBe(0);
    expect(bar(reset, 'out:p')).toBe(0);
  });

  it('exposes the four ISO ports 1, 2, 3 and the pilot 12', () => {
    const engine = timer();
    const ports = Object.keys(engine.getSnapshot().portPressure).filter(node => node.startsWith('td:'));
    expect(ports).toEqual(expect.arrayContaining(['td:p1', 'td:p2', 'td:p3', 'td:z12']));
  });
});

describe('air service unit (FRL)', () => {
  it.each(['frl-detailed', 'frl-simplified'])('%s regulates its outlet to the set pressure', type => {
    const engine = new FluidEngine(network(
      [part('src', 'pressure-source'), part('frl', type, { setpoint: 4 }), part('out', 'pressure-gauge')],
      [['src:out', 'frl:in'], ['frl:out', 'out:p']],
    ));
    const snapshot = engine.step();
    expect(bar(snapshot, 'src:out')).toBe(6);
    expect(bar(snapshot, 'out:p')).toBe(4);
  });
});
