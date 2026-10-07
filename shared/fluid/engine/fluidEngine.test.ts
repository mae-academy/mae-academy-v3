import { describe, expect, it } from 'vitest';
import { FluidEngine, sensorId } from './FluidEngine';
import { buildNetGraph, solvePressures } from './graphSolver';
import { SPRING_PRELOAD_BAR, SPRING_RATE_BAR, resolveValvePosition, sensorLinksOf, springEquilibriumStroke, springPressure, stepCylinder } from './componentSolvers';
import type { EngineComponent, EngineNetwork, EngineSnapshot, EngineWire } from './types';
import { PILOT_LEFT, PILOT_RIGHT, VALVE_TABLES, envelopeForPosition, positionForEnvelope } from './valveTables';

const part = (id: string, type: string, props: Record<string, unknown> = {}): EngineComponent => ({ id, type, props });
/** pipe('src:out', 'v:p1') joins two ports. */
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};
const circuit = (components: EngineComponent[], pipes: Array<[string, string]> = []): EngineNetwork => ({ components, wires: pipes.map(([a, b]) => pipe(a, b)) });
const pressure = (snapshot: EngineSnapshot, node: string) => snapshot.portPressure[node];
const netOf = (snapshot: EngineSnapshot, node: string) => snapshot.nets.find(net => net.connectedPortIds.includes(node))!;

const PILOTED = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
const PUSHBUTTON_SPRING = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };

/** Source → piloted 5/2 → double-acting cylinder: 4 feeds the rear chamber, 2 the rod side. */
const cylinderCircuit = (extra: EngineComponent[] = [], pipes: Array<[string, string]> = [['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]) =>
  circuit([part('src', 'pressure-source'), part('v', 'valve-5-2', PILOTED), part('cyl', 'cylinder-double'), ...extra], [['src:out', 'v:p1'], ...pipes]);

/** A momentary pilot signal: pressurise the port for one tick, then vent it. */
const pulse = (engine: FluidEngine, componentId: string, portId: string) => {
  engine.injectPressure(componentId, portId, 6);
  engine.step();
  engine.injectPressure(componentId, portId, 0);
  return engine.step();
};

describe('valve tables', () => {
  it('maps engine positions to drawn envelopes and back', () => {
    for (const table of Object.values(VALVE_TABLES)) {
      const positions = table.positions === 3 ? [0, 1, 2] : [0, 1];
      for (const position of positions) expect(positionForEnvelope(table, envelopeForPosition(table, position))).toBe(position);
    }
    expect(envelopeForPosition(VALVE_TABLES['valve-5-3'], 2)).toBe(1);
  });
});

describe('logic gates', () => {
  it('shuttle valve (OR): P2 = max(P1L, P1R) and the ball seals the lower inlet', () => {
    const engine = new FluidEngine(circuit([part('or', 'shuttle-valve')]));
    const table: Array<[number, number, number, number]> = [
      // left, right, expected out, ball offset
      [0, 0, 0, 0],
      [6, 0, 6, 1],
      [0, 4, 4, -1],
      [6, 4, 6, 1],
      [6, 6, 6, 0],
      [0, 0, 0, 0],
    ];
    for (const [left, right, out, ball] of table) {
      engine.injectPressure('or', 'x', left);
      engine.injectPressure('or', 'y', right);
      const snapshot = engine.step();
      expect(pressure(snapshot, 'or:out')).toBeCloseTo(out);
      expect(snapshot.logic.or.offset).toBe(ball);
    }
  });

  it('dual-pressure valve (AND): P2 = min(P1L, P1R) only when both inlets exceed the threshold', () => {
    const engine = new FluidEngine(circuit([part('and', 'dual-pressure-valve')]));
    const table: Array<[number, number, number, number]> = [
      // left, right, expected out, spool offset
      [0, 0, 0, 0],
      [6, 0, 0, 1],
      [0, 6, 0, -1],
      [6, 6, 6, 0],
      [6, 4, 4, 0],
      [6, 0.3, 0, 1],
      [0, 0, 0, 0],
    ];
    for (const [left, right, out, spool] of table) {
      engine.injectPressure('and', 'x', left);
      engine.injectPressure('and', 'y', right);
      const snapshot = engine.step();
      expect(pressure(snapshot, 'and:out')).toBeCloseTo(out);
      expect(snapshot.logic.and.offset).toBe(spool);
    }
  });

  it('two-hand safety: an AND gate fed by two pushbutton valves extends the cylinder only while both are pressed', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('s1', 'valve-3-2-nc', PUSHBUTTON_SPRING), part('s2', 'valve-3-2-nc', PUSHBUTTON_SPRING), part('and', 'dual-pressure-valve'), part('cyl', 'cylinder-single')],
      [['src:out', 's1:p1'], ['src:out', 's2:p1'], ['s1:p2', 'and:x'], ['s2:p2', 'and:y'], ['and:out', 'cyl:a']],
    ));
    engine.setManual('s1', 'left', true);
    expect(engine.step(1).cylinders.cyl.stroke).toBe(0);
    engine.setManual('s2', 'left', true);
    expect(engine.step(2).cylinders.cyl.stroke).toBe(1);
    engine.setManual('s1', 'left', false);
    const released = engine.step(2);
    expect(pressure(released, 'and:out')).toBe(0);
    expect(released.cylinders.cyl.stroke).toBe(0);
  });
});

describe('non-return and quick exhaust valves', () => {
  const checked = (type: string, reversed = false) => new FluidEngine(circuit(
    [part('src', 'pressure-source'), part('chk', type), part('cyl', 'cylinder-single')],
    reversed ? [['src:out', 'chk:p2'], ['chk:p1', 'cyl:a']] : [['src:out', 'chk:p1'], ['chk:p2', 'cyl:a']],
  ));

  it('passes 1 → 2, minus the cracking pressure of a spring-loaded check', () => {
    expect(pressure(checked('check-valve').step(), 'cyl:a')).toBeCloseTo(6);
    const spring = checked('check-valve-spring').step();
    expect(pressure(spring, 'cyl:a')).toBeCloseTo(5.8);
    expect(spring.logic.chk.offset).toBe(1);
  });

  it('blocks 2 → 1', () => {
    const snapshot = checked('check-valve', true).step();
    expect(pressure(snapshot, 'cyl:a')).toBe(0);
    expect(snapshot.logic.chk.offset).toBe(0);
  });

  it('holds the downstream pressure when the inlet is vented', () => {
    const engine = new FluidEngine(circuit([part('chk', 'check-valve'), part('cyl', 'cylinder-single')], [['chk:p2', 'cyl:a']]));
    engine.injectPressure('chk', 'p1', 6);
    engine.step(1);
    engine.injectPressure('chk', 'p1', 0);
    const snapshot = engine.step(1);
    expect(pressure(snapshot, 'chk:p1')).toBe(0);
    expect(pressure(snapshot, 'cyl:a')).toBeCloseTo(6);
    expect(snapshot.cylinders.cyl.stroke).toBe(1);
    expect(snapshot.logic.chk.offset).toBe(0);
  });

  it('quick exhaust: feeds 2 from 1 and dumps 2 to atmosphere as soon as P1 < P2', () => {
    const engine = new FluidEngine(circuit([part('qe', 'quick-exhaust'), part('cyl', 'cylinder-single')], [['qe:p2', 'cyl:a']]));
    engine.injectPressure('qe', 'p1', 6);
    const fed = engine.step();
    expect(pressure(fed, 'qe:p2')).toBeCloseTo(6);
    expect(fed.logic.qe.offset).toBe(1);

    engine.injectPressure('qe', 'p1', 3);
    expect(pressure(engine.step(), 'qe:p2')).toBeCloseTo(3);

    engine.injectPressure('qe', 'p1', 0);
    const dumped = engine.step();
    expect(pressure(dumped, 'qe:p2')).toBe(0);
    expect(netOf(dumped, 'qe:p2').isExhaust).toBe(true);
    expect(dumped.logic.qe.offset).toBe(-1);
  });
});

describe('directional control valves', () => {
  it('3/2 NC: rest blocks 1 and vents 2 → 3; actuated connects 1 → 2', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('v', 'valve-3-2-nc', PUSHBUTTON_SPRING), part('cyl', 'cylinder-single')],
      [['src:out', 'v:p1'], ['v:p2', 'cyl:a']],
    ));
    const rest = engine.step();
    expect(rest.valves.v).toMatchObject({ position: 0, spoolOffset: 0, latched: false });
    expect(pressure(rest, 'v:p1')).toBeCloseTo(6);
    expect(pressure(rest, 'v:p2')).toBe(0);
    expect(netOf(rest, 'v:p2').isExhaust).toBe(true);

    engine.setManual('v', 'left', true);
    const actuated = engine.step();
    expect(actuated.valves.v).toMatchObject({ position: 1, spoolOffset: 1 });
    expect(pressure(actuated, 'v:p2')).toBeCloseTo(6);
    expect(netOf(actuated, 'v:p2').isExhaust).toBe(false);

    engine.setManual('v', 'left', false);
    expect(engine.step().valves.v.position).toBe(0);
  });

  it('5/2: position 0 connects 1 → 2 and vents 4; position 1 connects 1 → 4 and vents 2', () => {
    const engine = new FluidEngine(circuit([part('src', 'pressure-source'), part('v', 'valve-5-2', PILOTED)], [['src:out', 'v:p1']]));
    const rest = engine.step();
    expect(rest.valves.v.position).toBe(0);
    expect(pressure(rest, 'v:p2')).toBeCloseTo(6);
    expect(pressure(rest, 'v:p4')).toBe(0);

    const shifted = pulse(engine, 'v', PILOT_LEFT);
    expect(shifted.valves.v.position).toBe(1);
    expect(pressure(shifted, 'v:p4')).toBeCloseTo(6);
    expect(pressure(shifted, 'v:p2')).toBe(0);
  });

  it('bistable 5/2 keeps its position after the pilot pulse on port 14 drops to zero', () => {
    const engine = new FluidEngine(circuit([part('src', 'pressure-source'), part('v', 'valve-5-2', PILOTED)], [['src:out', 'v:p1']]));
    expect(engine.step().valves.v).toMatchObject({ position: 0, latched: true });

    engine.injectPressure('v', PILOT_LEFT, 6);
    expect(engine.step().valves.v.position).toBe(1);
    engine.injectPressure('v', PILOT_LEFT, 0);
    const after = engine.step(1);
    expect(pressure(after, `v:${PILOT_LEFT}`)).toBe(0);
    expect(after.valves.v).toMatchObject({ position: 1, spoolOffset: 1, latched: true });

    expect(pulse(engine, 'v', PILOT_RIGHT).valves.v.position).toBe(0);
    expect(engine.step(1).valves.v.position).toBe(0);
  });

  it('ignores a pilot signal below the pilot threshold, and holds when both pilots are on', () => {
    const engine = new FluidEngine(circuit([part('v', 'valve-5-2', PILOTED)]));
    engine.injectPressure('v', PILOT_LEFT, 0.5);
    expect(engine.step().valves.v.position).toBe(0);
    engine.injectPressure('v', PILOT_LEFT, 6);
    engine.injectPressure('v', PILOT_RIGHT, 6);
    expect(engine.step().valves.v.position).toBe(0);
  });

  it('a spring returns a pilot-operated valve; a spring on the left makes the left envelope the rest position', () => {
    const engine = new FluidEngine(circuit([part('v', 'valve-5-2', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' })]));
    engine.injectPressure('v', PILOT_LEFT, 6);
    expect(engine.step().valves.v).toMatchObject({ position: 1, latched: false });
    engine.injectPressure('v', PILOT_LEFT, 0);
    expect(engine.step().valves.v.position).toBe(0);

    const table = VALVE_TABLES['valve-5-2'];
    expect(resolveValvePosition(table, { actuationLeft: 'Spring Return', actuationRight: 'Pushbutton' }, false, false, 0)).toBe(1);
    expect(resolveValvePosition(table, { actuationLeft: 'Spring Return', actuationRight: 'Pushbutton' }, false, true, 1)).toBe(0);
  });

  it('5/3 closed centre: centres when released and locks the cylinder mid-stroke', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('v', 'valve-5-3', { actuationLeft: 'Pushbutton', actuationRight: 'Pushbutton' }), part('cyl', 'cylinder-double')],
      [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
    ));
    expect(engine.step().valves.v).toMatchObject({ position: 2, spoolOffset: 0 });

    engine.setManual('v', 'left', true);
    const moving = engine.step(0.25);
    expect(moving.valves.v).toMatchObject({ position: 1, spoolOffset: 1 });
    expect(moving.cylinders.cyl.stroke).toBeGreaterThan(0.2);
    expect(moving.cylinders.cyl.stroke).toBeLessThan(0.8);

    engine.setManual('v', 'left', false);
    const held = engine.step(1);
    expect(held.valves.v.position).toBe(2);
    expect(held.cylinders.cyl.stroke).toBeCloseTo(moving.cylinders.cyl.stroke, 2);
    expect(held.cylinders.cyl.velocity).toBe(0);
    expect(held.cylinders.cyl.chamberPressureA).toBeCloseTo(6);

    engine.setManual('v', 'right', true);
    const back = engine.step(2);
    expect(back.valves.v).toMatchObject({ position: 0, spoolOffset: -1 });
    expect(back.cylinders.cyl.stroke).toBe(0);
  });
});

describe('cylinders', () => {
  it('a 5/2 valve drives a double-acting cylinder from 0 to 1 and back to 0 when reversed', () => {
    const engine = new FluidEngine(cylinderCircuit());
    const rest = engine.step(0.5);
    expect(rest.cylinders.cyl.stroke).toBe(0);
    expect(rest.sensors[sensorId('cyl', 'S1')]).toBe(true);
    expect(rest.sensors[sensorId('cyl', 'S2')]).toBe(false);

    pulse(engine, 'v', PILOT_LEFT);
    const extending = engine.step(0.2);
    expect(extending.cylinders.cyl.stroke).toBeGreaterThan(0);
    expect(extending.cylinders.cyl.stroke).toBeLessThan(1);
    expect(extending.cylinders.cyl.velocity).toBeCloseTo(0.2);
    expect(extending.cylinders.cyl.force).toBeGreaterThan(0);
    expect(extending.cylinders.cyl).toMatchObject({ chamberPressureA: 6, chamberPressureB: 0 });
    expect(netOf(extending, 'cyl:a').flowRate).toBeGreaterThan(0);

    const extended = engine.step(2);
    expect(extended.cylinders.cyl.stroke).toBe(1);
    expect(extended.cylinders.cyl.velocity).toBe(0);
    expect(extended.sensors[sensorId('cyl', 'S2')]).toBe(true);
    expect(extended.sensors[sensorId('cyl', 'S1')]).toBe(false);

    pulse(engine, 'v', PILOT_RIGHT);
    const retracting = engine.step(0.2);
    expect(retracting.cylinders.cyl.velocity).toBeLessThan(0);
    expect(retracting.cylinders.cyl.force).toBeLessThan(0);

    const retracted = engine.step(2);
    expect(retracted.cylinders.cyl.stroke).toBe(0);
    expect(retracted.sensors[sensorId('cyl', 'S1')]).toBe(true);
  });

  it('a single-acting cylinder extends under pressure and returns on its spring when vented', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('v', 'valve-3-2-nc', PUSHBUTTON_SPRING), part('cyl', 'cylinder-single')],
      [['src:out', 'v:p1'], ['v:p2', 'cyl:a']],
    ));
    engine.setManual('v', 'left', true);
    expect(engine.step(2).cylinders.cyl.stroke).toBe(1);
    engine.setManual('v', 'left', false);
    const returning = engine.step(0.1);
    expect(returning.cylinders.cyl.velocity).toBeLessThan(0);
    expect(engine.step(3).cylinders.cyl.stroke).toBe(0);
  });

  it('a one-way flow control throttles the exhausting chamber (meter-out) and leaves the return stroke free', () => {
    // Rod-side line: valve port 2 → throttle outlet, throttle inlet → cylinder. Leaving the cylinder is the choked direction.
    const engine = new FluidEngine(cylinderCircuit(
      [part('fc', 'flow-control-oneway', { openingPercentage: 20 })],
      [['v:p4', 'cyl:a'], ['v:p2', 'fc:out'], ['fc:in', 'cyl:b']],
    ));
    pulse(engine, 'v', PILOT_LEFT);
    const extending = engine.step(0.5);
    expect(extending.cylinders.cyl.velocity).toBeCloseTo(0.2 * 0.2);
    expect(extending.cylinders.cyl.stroke).toBeLessThan(0.5);
    expect(engine.step(5).cylinders.cyl.stroke).toBe(1);

    pulse(engine, 'v', PILOT_RIGHT);
    expect(engine.step(0.2).cylinders.cyl.velocity).toBeCloseTo(-0.2);
  });

  it('a plain throttle chokes both directions, and the factor is clamped to (0.01, 1)', () => {
    const throttled = (openingPercentage: number) => new FluidEngine(cylinderCircuit(
      [part('fc', 'flow-control', { openingPercentage })],
      [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']],
    ));
    const engine = throttled(10);
    pulse(engine, 'v', PILOT_LEFT);
    const extending = engine.step(2);
    expect(extending.cylinders.cyl.velocity).toBeCloseTo(0.2 * 0.1);
    expect(extending.cylinders.cyl.stroke).toBeGreaterThan(0.3);
    expect(extending.cylinders.cyl.stroke).toBeLessThan(0.5);
    pulse(engine, 'v', PILOT_RIGHT);
    expect(engine.step(0.2).cylinders.cyl.velocity).toBeCloseTo(-0.2 * 0.1);

    const closed = throttled(0);
    pulse(closed, 'v', PILOT_LEFT);
    expect(closed.step(0.2).cylinders.cyl.velocity).toBeCloseTo(0.2 * 0.01, 4);
  });

  it('damps the piston inside the last 10% of the stroke', () => {
    const geometry = { areaA: 5e-4, areaB: 4e-4, length: 0.1 };
    const meta = { rear: 'a', front: 'b' };
    const drive = { pressureA: 6, pressureB: 0, canDischargeA: true, canDischargeB: true, throttleExtend: 1, throttleRetract: 1 };
    const at = (stroke: number, cushioned: boolean) =>
      stepCylinder({ stroke, velocity: 0, force: 0, chamberPressureA: 0, chamberPressureB: 0 }, geometry, meta, drive, { idealVelocity: 0.2, cushionZone: 0.1, cushioned }, 0.016).velocity;
    expect(at(0.5, false)).toBeCloseTo(0.2);
    expect(at(0.95, false)).toBeLessThan(at(0.5, false));
    expect(at(0.99, false)).toBeLessThan(at(0.95, false));
    expect(at(0.95, true)).toBeLessThan(at(0.95, false));
    // Leaving an end position is not damped.
    expect(at(0.02, false)).toBeCloseTo(0.2);
  });

  it('does not move a piston whose exhausting chamber is trapped', () => {
    const geometry = { areaA: 5e-4, areaB: 4e-4, length: 0.1 };
    const drive = { pressureA: 6, pressureB: 0, canDischargeA: true, canDischargeB: false, throttleExtend: 1, throttleRetract: 1 };
    const next = stepCylinder({ stroke: 0.3, velocity: 0, force: 0, chamberPressureA: 0, chamberPressureB: 0 }, geometry, { rear: 'a', front: 'b' }, drive, { idealVelocity: 0.2, cushionZone: 0.1, cushioned: false }, 0.016);
    expect(next.stroke).toBe(0.3);
    expect(next.velocity).toBe(0);
    expect(next.force).toBeCloseTo(6e5 * 5e-4);
  });
});

describe('sensor coupling', () => {
  it('a roller-lever valve at the extended end sends the cylinder back automatically (A+ A−)', () => {
    const engine = new FluidEngine(circuit(
      [
        part('src', 'pressure-source'),
        part('start', 'valve-3-2-nc', PUSHBUTTON_SPRING),
        part('roller', 'valve-3-2-nc', { actuationLeft: 'Roller', actuationRight: 'Spring Return', leftSensor: sensorId('cyl', 'S2') }),
        part('v', 'valve-5-2', PILOTED),
        part('cyl', 'cylinder-double'),
      ],
      [['src:out', 'start:p1'], ['src:out', 'roller:p1'], ['src:out', 'v:p1'], ['start:p2', `v:${PILOT_LEFT}`], ['roller:p2', `v:${PILOT_RIGHT}`], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
    ));
    engine.setManual('start', 'left', true);
    engine.step(0.05);
    engine.setManual('start', 'left', false);

    let peak = 0;
    let rollerTripped = false;
    for (let tick = 0; tick < 250; tick += 1) {
      const snapshot = engine.step();
      peak = Math.max(peak, snapshot.cylinders.cyl.stroke);
      rollerTripped = rollerTripped || snapshot.valves.roller.position === 1;
    }
    const final = engine.getSnapshot();
    // The switch is made within 3 mm of the end (3 % of the default 100 mm stroke), where the roller reverses the cylinder.
    expect(peak).toBeGreaterThanOrEqual(0.97);
    expect(rollerTripped).toBe(true);
    expect(final.cylinders.cyl.stroke).toBe(0);
    expect(final.valves.v.position).toBe(0);
    expect(final.valves.roller.position).toBe(0);
  });

  it('a limit switch linked to a pilot-operated end pressurises that pilot line (reed switch)', () => {
    const valve = part('v', 'valve-5-2', { ...PILOTED, leftSensor: sensorId('cyl', 'S1'), rightSensor: sensorId('cyl', 'S2') });
    expect(sensorLinksOf(valve)).toEqual([
      { sensorId: 'cyl:S1', componentId: 'v', portId: PILOT_LEFT },
      { sensorId: 'cyl:S2', componentId: 'v', portId: PILOT_RIGHT },
    ]);
    // A link on an end that is not pilot-operated is a mechanical coupling, not a reed switch.
    expect(sensorLinksOf(part('r', 'valve-3-2-nc', { actuationLeft: 'Roller', leftSensor: 'cyl:S2' }))).toEqual([]);

    const engine = new FluidEngine(circuit([part('src', 'pressure-source'), valve, part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]));
    const start = engine.step();
    expect(pressure(start, `v:${PILOT_LEFT}`)).toBe(6);
    expect(pressure(start, `v:${PILOT_RIGHT}`)).toBe(0);
    expect(start.valves.v.position).toBe(1);

    let reversals = 0;
    let last = 1;
    for (let tick = 0; tick < 400; tick += 1) {
      const position = engine.step().valves.v.position;
      if (position !== last) { reversals += 1; last = position; }
    }
    expect(reversals).toBeGreaterThanOrEqual(4);
  });

  it('reed switches wired to the pilot ports make the cylinder oscillate', () => {
    const engine = new FluidEngine(cylinderCircuit(), {
      sensorLinks: [
        { sensorId: sensorId('cyl', 'S1'), componentId: 'v', portId: PILOT_LEFT },
        { sensorId: sensorId('cyl', 'S2'), componentId: 'v', portId: PILOT_RIGHT },
      ],
    });
    let reversals = 0;
    let lastPosition = engine.getSnapshot().valves.v.position;
    for (let tick = 0; tick < 400; tick += 1) {
      const position = engine.step().valves.v.position;
      if (position !== lastPosition) { reversals += 1; lastPosition = position; }
    }
    expect(reversals).toBeGreaterThanOrEqual(4);
  });
});

describe('pressure control and supply', () => {
  it('a regulator limits its outlet to the set pressure', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source', { pressure: 8 }), part('reg', 'regulator-nr', { setpoint: 4 }), part('gauge', 'pressure-gauge')],
      [['src:out', 'reg:p1'], ['reg:p2', 'gauge:p']],
    ));
    const snapshot = engine.step();
    expect(pressure(snapshot, 'reg:p1')).toBeCloseTo(8);
    expect(pressure(snapshot, 'gauge:p')).toBeCloseTo(4);
  });

  it('the main service unit supplies its own regulated pressure while the shut-off is ON, and blocks and vents the line when OFF', () => {
    const build = (shutoff: string) => new FluidEngine(circuit(
      [part('su', 'service-unit', { pressure: 8, setpoint: 5, shutoff }), part('gauge', 'pressure-gauge')],
      [['su:out', 'gauge:p']],
    )).step(1);
    expect(pressure(build('ON'), 'gauge:p')).toBeCloseTo(5);
    expect(pressure(build('OFF'), 'gauge:p')).toBeCloseTo(0);
  });

  it('uses the nominal pressure of the medium when a source does not specify one', () => {
    expect(pressure(new FluidEngine(circuit([part('src', 'pressure-source')])).step(), 'src:out')).toBe(6);
    expect(pressure(new FluidEngine(circuit([part('pump', 'hyd-pump')])).step(), 'pump:out')).toBe(50);
  });

  it('a sequence valve opens once its external pilot reaches the set pressure', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('seq', 'sequence-ext', { switchingPressure: 4 }), part('gauge', 'pressure-gauge')],
      [['src:out', 'seq:p1'], ['seq:p2', 'gauge:p']],
    ));
    engine.injectPressure('seq', 'z12', 3);
    expect(pressure(engine.step(), 'gauge:p')).toBe(0);
    engine.injectPressure('seq', 'z12', 5);
    expect(pressure(engine.step(0.1), 'gauge:p')).toBeCloseTo(6);
  });
});

describe('hydraulics', () => {
  const hydraulic = (extra: EngineComponent[] = [], pipes: Array<[string, string]> = []) => circuit(
    [part('pump', 'hyd-pump'), part('v', 'hvalve-4-3', { actuationLeft: 'Pushbutton', actuationRight: 'Pushbutton' }), part('cyl', 'cylinder-double'), ...extra],
    [['pump:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'], ...pipes],
  );

  it('detects oil, supplies 50 bar and returns through the tank ports of the valve', () => {
    const engine = new FluidEngine(hydraulic());
    const centred = engine.step();
    expect(centred.medium).toBe('OIL');
    expect(centred.nets.every(net => net.medium === 'OIL')).toBe(true);
    expect(pressure(centred, 'v:p1')).toBe(50);
    expect(pressure(centred, 'cyl:a')).toBe(0);

    engine.setManual('v', 'left', true);
    const extending = engine.step(0.3);
    expect(extending.cylinders.cyl.chamberPressureA).toBe(50);
    expect(netOf(extending, 'cyl:b').isExhaust).toBe(true);
    expect(extending.cylinders.cyl.velocity).toBeCloseTo(0.1);
    expect(engine.step(3).cylinders.cyl.stroke).toBe(1);
  });

  it('a pressure relief valve caps the pump line', () => {
    const engine = new FluidEngine(hydraulic([part('prv', 'hyd-pressure-relief', { crackingPressure: 30 })], [['pump:out', 'prv:p1']]));
    expect(pressure(engine.step(), 'v:p1')).toBe(30);
  });

  it('treats an unconnected port as plugged in oil, but as open to atmosphere in air', () => {
    const direct = (source: string) => circuit([part('src', source), part('cyl', 'cylinder-double')], [['src:out', 'cyl:a']]);
    expect(new FluidEngine(direct('hyd-pump')).step(2).cylinders.cyl.stroke).toBe(0);
    expect(new FluidEngine(direct('pressure-source')).step(2).cylinders.cyl.stroke).toBe(1);
  });
});

describe('engine housekeeping', () => {
  it('groups wired ports into one net', () => {
    const graph = buildNetGraph(['a:1', 'b:1', 'c:1'], [pipe('a:1', 'b:1')]);
    expect(graph.members).toEqual([['a:1', 'b:1'], ['c:1']]);
    const solution = solvePressures({ graph, connections: [], sources: [{ node: 'a:1', pressure: 6 }], exhausts: [], caps: [], previous: () => 0, openPortsVent: true });
    expect(solution.pressure).toEqual([6, 0]);
    expect(solution.firm).toEqual([true, false]);
    expect(solution.vented).toEqual([false, true]);
  });

  it('treats a T-junction on a pipe as one net', () => {
    // The canvas splits a tapped pipe into three wires meeting at a junction pseudo-node.
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('g1', 'pressure-gauge'), part('g2', 'pressure-gauge')],
      [['src:out', 'junc_1:p'], ['junc_1:p', 'g1:p'], ['g2:p', 'junc_1:p']],
    ));
    const snapshot = engine.step();
    expect(pressure(snapshot, 'g1:p')).toBe(6);
    expect(pressure(snapshot, 'g2:p')).toBe(6);
    expect(pressure(snapshot, 'junc_1:p')).toBe(6);
    expect(netOf(snapshot, 'src:out').connectedPortIds).toHaveLength(4);
  });

  it('advances in fixed 16 ms ticks', () => {
    const engine = new FluidEngine(cylinderCircuit());
    expect(engine.step().time).toBeCloseTo(0.016);
    expect(engine.step(0.1).time).toBeCloseTo(0.116);
    expect(engine.step(0).time).toBeCloseTo(0.116);
  });

  it('keeps component state across a network edit and clears it on reset', () => {
    const network = cylinderCircuit();
    const engine = new FluidEngine(network);
    pulse(engine, 'v', PILOT_LEFT);
    engine.step(2);
    engine.setNetwork({ components: [...network.components, part('gauge', 'pressure-gauge')], wires: [...network.wires, pipe('v:p4', 'gauge:p')] });
    const edited = engine.step();
    expect(edited.cylinders.cyl.stroke).toBe(1);
    expect(edited.valves.v.position).toBe(1);
    expect(pressure(edited, 'gauge:p')).toBeCloseTo(6);

    engine.reset();
    const fresh = engine.getSnapshot();
    expect(fresh.time).toBe(0);
    expect(fresh.cylinders.cyl.stroke).toBe(0);
    expect(fresh.valves.v.position).toBe(0);
    expect(pressure(fresh, 'gauge:p')).toBe(0);
  });

  it('ignores unknown component types', () => {
    const engine = new FluidEngine(circuit([part('src', 'pressure-source'), part('mystery', 'not-a-part')], [['src:out', 'mystery:in']]));
    expect(pressure(engine.step(), 'mystery:in')).toBe(6);
  });
});

/* ───────────────────────── Engine completion: flow, pressure control, rollers, motors, diagnostics ───────────────────────── */

/** Ticks a piloted cylinder circuit needs to travel a full stroke after the given pilot pulse. */
const strokeTime = (engine: FluidEngine, pilot: string, target: number, limit = 4000) => {
  pulse(engine, 'v', pilot);
  let ticks = 0;
  while (engine.getSnapshot().cylinders.cyl.stroke !== target && ticks < limit) { engine.step(); ticks += 1; }
  return ticks;
};

describe('flow control and actuator timing', () => {
  /** Throttle in the rear chamber line: it meters the air entering on extension. */
  const metered = (type: string, openingPercentage?: number) => new FluidEngine(cylinderCircuit(
    [part('fc', type, openingPercentage === undefined ? {} : { openingPercentage })],
    [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']],
  ));

  it('a throttle is fully open by default', () => {
    expect(strokeTime(metered('flow-control'), PILOT_LEFT, 1)).toBe(strokeTime(new FluidEngine(cylinderCircuit()), PILOT_LEFT, 1));
  });

  it('extension takes about 5× longer at 20% opening and 10× longer at 10% than at 100%', () => {
    const full = strokeTime(metered('flow-control', 100), PILOT_LEFT, 1);
    expect(strokeTime(metered('flow-control', 20), PILOT_LEFT, 1) / full).toBeCloseTo(5, 0);
    expect(strokeTime(metered('flow-control', 10), PILOT_LEFT, 1) / full).toBeCloseTo(10, 0);
  });

  it('scales the piston speed directly: v = v_ideal · Cv, with Cv never below 0.01', () => {
    for (const [opening, cv] of [[100, 1], [50, 0.5], [20, 0.2], [0, 0.01], [250, 1]]) {
      const engine = metered('flow-control', opening);
      pulse(engine, 'v', PILOT_LEFT);
      expect(engine.step(0.1).cylinders.cyl.velocity).toBeCloseTo(0.2 * cv, 4);
    }
  });

  it('a one-way flow control is choked in → out only; the return bypasses through the check at Cv = 1', () => {
    const engine = metered('flow-control-oneway', 20);
    const out = strokeTime(engine, PILOT_LEFT, 1);
    const back = strokeTime(engine, PILOT_RIGHT, 0);
    const free = strokeTime(new FluidEngine(cylinderCircuit()), PILOT_LEFT, 1);
    expect(out / free).toBeCloseTo(5, 0);
    expect(back).toBeLessThanOrEqual(free + 2);
  });

  it('a restrictor works wherever it sits in the line: supply side, or on a valve exhaust port', () => {
    // Supply line: both strokes are fed through it.
    const supply = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('fc', 'flow-control', { openingPercentage: 25 }), part('v', 'valve-5-2', PILOTED), part('cyl', 'cylinder-double')],
      [['src:out', 'fc:in'], ['fc:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
    ));
    pulse(supply, 'v', PILOT_LEFT);
    expect(supply.step(0.1).cylinders.cyl.velocity).toBeCloseTo(0.2 * 0.25, 4);

    // Exhaust restrictor on port 3: only the stroke that exhausts through 3 (extension, 2 → 3) is slowed.
    const exhaust = new FluidEngine(cylinderCircuit(
      [part('fc', 'flow-control', { openingPercentage: 25 }), part('sil', 'silencer')],
      [['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'], ['v:p3', 'fc:in'], ['fc:out', 'sil:p']],
    ));
    pulse(exhaust, 'v', PILOT_LEFT);
    expect(exhaust.step(0.1).cylinders.cyl.velocity).toBeCloseTo(0.2 * 0.25, 4);
    exhaust.step(5);
    pulse(exhaust, 'v', PILOT_RIGHT);
    expect(exhaust.step(0.1).cylinders.cyl.velocity).toBeCloseTo(-0.2, 4);
  });

  it('an exhaust port piped into a dead end no longer vents', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('v', 'valve-3-2-nc', PUSHBUTTON_SPRING), part('cyl', 'cylinder-single'), part('plug', 'pressure-gauge')],
      [['src:out', 'v:p1'], ['v:p2', 'cyl:a'], ['v:p3', 'plug:p']],
    ));
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    const held = engine.step(2);
    expect(held.cylinders.cyl.stroke).toBe(1);
    expect(pressure(held, 'cyl:a')).toBeCloseTo(6);
  });
});

describe('sequence valves', () => {
  const external = (props: Record<string, unknown> = {}) => new FluidEngine(circuit(
    [part('src', 'pressure-source'), part('seq', 'sequence-ext', props), part('gauge', 'pressure-gauge')],
    [['src:out', 'seq:p1'], ['seq:p2', 'gauge:p']],
  ));

  it('external pilot: port 2 stays at 0 bar until the pilot reaches 4.5 bar, then snaps to line pressure', () => {
    const engine = external();
    for (const [pilot, expected] of [[0, 0], [3, 0], [4.4, 0], [4.5, 6], [4.6, 6], [8, 6]]) {
      engine.injectPressure('seq', 'z12', pilot);
      expect(pressure(engine.step(), 'gauge:p')).toBeCloseTo(expected);
    }
  });

  it('vents port 2 again when the pilot falls back below the switching pressure', () => {
    const engine = external();
    engine.injectPressure('seq', 'z12', 6);
    expect(pressure(engine.step(), 'gauge:p')).toBeCloseTo(6);
    engine.injectPressure('seq', 'z12', 4);
    const closed = engine.step();
    expect(pressure(closed, 'gauge:p')).toBe(0);
    expect(netOf(closed, 'gauge:p').isExhaust).toBe(true);
  });

  it('honours an adjusted switching pressure', () => {
    const engine = external({ switchingPressure: 2 });
    engine.injectPressure('seq', 'z12', 1.9);
    expect(pressure(engine.step(), 'gauge:p')).toBe(0);
    engine.injectPressure('seq', 'z12', 2.1);
    expect(pressure(engine.step(), 'gauge:p')).toBeCloseTo(6);
  });

  it('in-line: switches on its own inlet pressure, and lets the return flow bypass through the check', () => {
    const engine = new FluidEngine(circuit([part('seq', 'sequence-combo'), part('gauge', 'pressure-gauge')], [['seq:p2', 'gauge:p']]));
    engine.injectPressure('seq', 'p1', 4);
    expect(pressure(engine.step(), 'gauge:p')).toBe(0);
    engine.injectPressure('seq', 'p1', 5);
    expect(pressure(engine.step(), 'gauge:p')).toBeCloseTo(5);

    const reverse = new FluidEngine(circuit([part('seq', 'sequence-combo'), part('gauge', 'pressure-gauge')], [['seq:p1', 'gauge:p']]));
    reverse.injectPressure('seq', 'p2', 3);
    expect(pressure(reverse.step(), 'gauge:p')).toBeCloseTo(3);
  });
});

describe('hydraulic pressure relief valve', () => {
  const pumpLine = (pumpPressure: number, relief: Record<string, unknown> = {}, extra: EngineComponent[] = [], pipes: Array<[string, string]> = [['pump:out', 'prv:p1']]) =>
    new FluidEngine(circuit([part('pump', 'hyd-pump', { pressure: pumpPressure }), part('prv', 'hyd-pressure-relief', relief), part('gauge', 'pressure-gauge'), ...extra], [['pump:out', 'gauge:p'], ...pipes]));

  it('clamps the line strictly at the cracking pressure (60 bar by default) and reports the valve open', () => {
    const snapshot = pumpLine(100).step();
    expect(pressure(snapshot, 'pump:out')).toBe(60);
    expect(pressure(snapshot, 'gauge:p')).toBe(60);
    expect(snapshot.reliefValves.prv.open).toBe(true);
  });

  it('stays shut while the line is below the cracking pressure', () => {
    const snapshot = pumpLine(50).step();
    expect(pressure(snapshot, 'gauge:p')).toBe(50);
    expect(snapshot.reliefValves.prv.open).toBe(false);
  });

  it('follows an adjusted cracking pressure', () => {
    expect(pressure(pumpLine(100, { crackingPressure: 35 }).step(), 'gauge:p')).toBe(35);
  });

  it('protects everything in free communication with it, including the pump side of a filter', () => {
    const snapshot = pumpLine(100, {}, [part('filter', 'flow-indicator')], [['pump:out', 'filter:in'], ['filter:out', 'prv:p1']]).step();
    expect(pressure(snapshot, 'prv:p1')).toBe(60);
    expect(pressure(snapshot, 'pump:out')).toBe(60);
    expect(pressure(snapshot, 'gauge:p')).toBe(60);
  });
});

describe('idle-return roller', () => {
  /** A piloted cylinder plus a 3/2 valve whose one-way trip roller sits on the extended-end switch. */
  const rollerCircuit = (operator: string, extra: Record<string, unknown> = {}) => new FluidEngine(circuit(
    [
      part('src', 'pressure-source'),
      part('v', 'valve-5-2', PILOTED),
      part('cyl', 'cylinder-double'),
      part('ir', 'valve-3-2-nc', { actuationLeft: operator, actuationRight: 'Spring Return', leftSensor: sensorId('cyl', 'S2'), ...extra }),
      part('signal', 'pressure-gauge'),
    ],
    [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'], ['src:out', 'ir:p1'], ['ir:p2', 'signal:p']],
  ));
  /** Ticks during which the roller valve gave a signal over the next `seconds`. */
  const signalTicks = (engine: FluidEngine, seconds: number) => {
    let ticks = 0;
    for (let i = 0; i < Math.round(seconds / 0.016); i += 1) {
      const snapshot = engine.step();
      if (snapshot.valves.ir.position === 1) {
        ticks += 1;
        expect(pressure(snapshot, 'signal:p')).toBeCloseTo(6);
      }
    }
    return ticks;
  };

  it('pulses for about 120 ms as the cylinder runs onto the switch while extending, then releases', () => {
    const engine = rollerCircuit('Idle-Return Roller');
    pulse(engine, 'v', PILOT_LEFT);
    const ticks = signalTicks(engine, 3);
    expect(engine.getSnapshot().cylinders.cyl.stroke).toBe(1);
    expect(engine.getSnapshot().sensors[sensorId('cyl', 'S2')]).toBe(true);
    expect(ticks * 0.016).toBeGreaterThanOrEqual(0.11);
    expect(ticks * 0.016).toBeLessThanOrEqual(0.13);
    expect(engine.getSnapshot().valves.ir.position).toBe(0);
  });

  it('stays strictly dormant while the cylinder passes the switch on the way back', () => {
    const engine = rollerCircuit('Idle-Return Roller');
    pulse(engine, 'v', PILOT_LEFT);
    engine.step(3);
    pulse(engine, 'v', PILOT_RIGHT);
    expect(signalTicks(engine, 3)).toBe(0);
    expect(engine.getSnapshot().cylinders.cyl.stroke).toBe(0);
  });

  it('with RETRACT_ONLY it ignores the extension and pulses on the return pass instead', () => {
    const engine = rollerCircuit('Idle-Return Roller', { triggerDirection: 'RETRACT_ONLY' });
    pulse(engine, 'v', PILOT_LEFT);
    expect(signalTicks(engine, 3)).toBe(0);
    pulse(engine, 'v', PILOT_RIGHT);
    const ticks = signalTicks(engine, 3);
    expect(ticks * 0.016).toBeGreaterThanOrEqual(0.11);
    expect(ticks * 0.016).toBeLessThanOrEqual(0.13);
  });

  it('a plain roller, by contrast, is held for as long as the cylinder rests on it', () => {
    const engine = rollerCircuit('Roller');
    pulse(engine, 'v', PILOT_LEFT);
    engine.step(3);
    expect(signalTicks(engine, 1)).toBe(Math.round(1 / 0.016));
  });

  it('can still be pushed by hand', () => {
    const engine = rollerCircuit('Idle-Return Roller');
    engine.setManual('ir', 'left', true);
    expect(engine.step().valves.ir.position).toBe(1);
  });
});

describe('air motors and rotary actuators', () => {
  const motorOn = (motor: EngineComponent, sourcePressure = 6, extra: EngineComponent[] = [], pipes: Array<[string, string]> = [['src:out', 'm:in']]) =>
    new FluidEngine(circuit([part('src', 'pressure-source', { pressure: sourcePressure }), motor, ...extra], pipes));

  it('fixed motor: RPM = (P_in − P_out) / P_nominal × rated speed', () => {
    expect(motorOn(part('m', 'air-motor-fixed', { speed: 3000 })).step().motors.m.rpm).toBeCloseTo(3000);
    expect(motorOn(part('m', 'air-motor-fixed', { speed: 3000 }), 3).step().motors.m.rpm).toBeCloseTo(1500);
    expect(new FluidEngine(circuit([part('m', 'air-motor-fixed', { speed: 3000 })])).step().motors.m.rpm).toBe(0);
  });

  it('variable motor scales with its capacity ratio', () => {
    expect(motorOn(part('m', 'air-motor-variable', { speed: 3000, capacityRatio: 0.5 })).step().motors.m.rpm).toBeCloseTo(1500);
    expect(motorOn(part('m', 'air-motor-variable', { speed: 3000, capacityRatio: 0 })).step().motors.m.rpm).toBe(0);
  });

  it('a bidirectional motor reverses with the pressure difference; a single-direction one does not run backwards', () => {
    const driven = (directions: string) => new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('v', 'valve-5-2', PILOTED), part('m', 'air-motor-variable', { speed: 3000, directions })],
      [['src:out', 'v:p1'], ['v:p4', 'm:in'], ['v:p2', 'm:out']],
    ));
    const both = driven('Both directions');
    expect(both.step().motors.m.rpm).toBeCloseTo(-3000); // rest position feeds port 2 → the outlet side
    expect(pulse(both, 'v', PILOT_LEFT).motors.m.rpm).toBeCloseTo(3000);

    const single = driven('Single direction');
    expect(single.step().motors.m.rpm).toBe(0);
    expect(pulse(single, 'v', PILOT_LEFT).motors.m.rpm).toBeCloseTo(3000);
  });

  it('does not turn against a blocked outlet, and slows down behind a throttle', () => {
    const blocked = motorOn(part('m', 'air-motor-variable', { speed: 3000 }), 6, [part('plug', 'pressure-gauge')], [['src:out', 'm:in'], ['m:out', 'plug:p']]);
    expect(blocked.step().motors.m.rpm).toBe(0);
    const throttled = motorOn(part('m', 'air-motor-fixed', { speed: 3000 }), 6, [part('fc', 'flow-control', { openingPercentage: 40 })], [['src:out', 'fc:in'], ['fc:out', 'm:in']]);
    expect(throttled.step().motors.m.rpm).toBeCloseTo(1200);
  });

  it('integrates the shaft angle for the tachometer / animation', () => {
    const engine = motorOn(part('m', 'air-motor-fixed', { speed: 30 })); // 30 rpm = 180°/s
    expect(engine.step(0.5).motors.m.angle).toBeCloseTo(90, 0);
    expect(engine.step(2).motors.m.angle).toBeCloseTo(90, 0); // one more full turn
  });

  it('hydraulic motor reaches its rated speed at the nominal 50 bar', () => {
    const engine = new FluidEngine(circuit([part('pump', 'hyd-pump'), part('m', 'hyd-motor', { speed: 1500 }), part('tank', 'hyd-tank')], [['pump:out', 'm:in'], ['m:out', 'tank:p']]));
    expect(engine.step().motors.m.rpm).toBeCloseTo(1500);
  });

  it('a semi-rotary actuator swivels to its end angle and back, and stops there', () => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source'), part('v', 'valve-5-2', PILOTED), part('m', 'semi-rotary', { angle: 180 })],
      [['src:out', 'v:p1'], ['v:p4', 'm:a'], ['v:p2', 'm:b']],
    ));
    expect(engine.step(0.5).motors.m.angle).toBe(0);
    pulse(engine, 'v', PILOT_LEFT);
    const turning = engine.step(0.4);
    expect(turning.motors.m.rpm).toBeCloseTo(30); // 180° in 1 s
    expect(turning.motors.m.angle).toBeGreaterThan(40);
    const end = engine.step(2);
    expect(end.motors.m).toEqual({ angle: 180, rpm: 0 });
    pulse(engine, 'v', PILOT_RIGHT);
    expect(engine.step(2).motors.m).toEqual({ angle: 0, rpm: 0 });
  });
});

describe('hydraulic diagnostics', () => {
  const codes = (snapshot: EngineSnapshot) => snapshot.diagnostics.map(diagnostic => diagnostic.code);
  const rig = (withRelief: boolean) => new FluidEngine(circuit(
    [
      part('pump', 'hyd-pump'),
      part('v', 'hvalve-4-3', { actuationLeft: 'Pushbutton', actuationRight: 'Pushbutton' }),
      part('cyl', 'cylinder-double'),
      ...(withRelief ? [part('prv', 'hyd-pressure-relief')] : []),
    ],
    [['pump:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'], ...(withRelief ? [['pump:out', 'prv:p1'] as [string, string]] : [])],
  ));

  it('warns when no relief valve protects the pump line', () => {
    const snapshot = rig(false).step();
    expect(snapshot.diagnostics[0]).toEqual({
      code: 'MISSING_RELIEF_VALVE',
      severity: 'warning',
      componentId: 'pump',
      message: 'Warning: Missing Pressure Relief Valve on hydraulic pump line',
    });
  });

  it('raises an overpressure overload when the unprotected pump is deadheaded', () => {
    const engine = rig(false);
    // Closed centre: every working port blocked, nowhere for the pump flow to go.
    expect(codes(engine.step())).toEqual(['MISSING_RELIEF_VALVE', 'DEADHEAD_OVERPRESSURE']);
    expect(engine.getSnapshot().diagnostics[1].severity).toBe('error');

    // While the cylinder takes the flow there is no overload…
    engine.setManual('v', 'left', true);
    expect(codes(engine.step(0.2))).toEqual(['MISSING_RELIEF_VALVE']);
    // …until it reaches its end stop.
    expect(codes(engine.step(3))).toEqual(['MISSING_RELIEF_VALVE', 'DEADHEAD_OVERPRESSURE']);
  });

  it('is silent once a relief valve is on the pump line', () => {
    const engine = rig(true);
    expect(engine.step().diagnostics).toEqual([]);
    engine.setManual('v', 'left', true);
    expect(engine.step(3).diagnostics).toEqual([]);
  });

  it('does not call a pump circulating to tank deadheaded, and never diagnoses pneumatic circuits', () => {
    const circulating = new FluidEngine(circuit([part('pump', 'hyd-pump'), part('tank', 'hyd-tank')], [['pump:out', 'tank:p']]));
    expect(codes(circulating.step())).toEqual(['MISSING_RELIEF_VALVE']);
    expect(new FluidEngine(cylinderCircuit()).step(1).diagnostics).toEqual([]);
  });
});


describe('single-acting cylinder: spring force balance and flow control', () => {
  /** Source (at `bar`) → 3/2 valve held open by its pushbutton → optional flow control in line → single-acting cylinder. */
  const singleCircuit = (bar: number, extra: EngineComponent[] = [], pipes: Array<[string, string]> = [['v:p2', 'cyl:a']]) => {
    const engine = new FluidEngine(circuit(
      [part('src', 'pressure-source', { pressure: bar }), part('v', 'valve-3-2-nc', PUSHBUTTON_SPRING), part('cyl', 'cylinder-single'), ...extra],
      [['src:out', 'v:p1'], ...pipes],
    ));
    engine.setManual('v', 'left', true);
    return engine;
  };
  /** Seconds until the piston first reaches `target`, stepping one tick at a time; null if it never does. */
  const timeTo = (engine: FluidEngine, target: number, limit = 60) => {
    for (let tick = 1; tick <= limit / 0.016; tick += 1) {
      if (engine.step().cylinders.cyl.stroke >= target) return tick * 0.016;
    }
    return null;
  };

  it('models the spring as F0 + k·x and balances it against p·A', () => {
    expect(springPressure(0)).toBe(SPRING_PRELOAD_BAR);
    expect(springPressure(1)).toBe(SPRING_PRELOAD_BAR + SPRING_RATE_BAR);
    expect(springPressure(7)).toBe(springPressure(1));
    expect(springEquilibriumStroke(0)).toBe(0);
    expect(springEquilibriumStroke(SPRING_PRELOAD_BAR)).toBe(0);
    expect(springEquilibriumStroke(1.5)).toBeCloseTo(0.5 / SPRING_RATE_BAR);
    expect(springEquilibriumStroke(SPRING_PRELOAD_BAR + SPRING_RATE_BAR)).toBe(1);
    expect(springEquilibriumStroke(6)).toBe(1);
    for (const bar of [1.2, 1.5, 2, 2.5, 3, 3.5]) expect(springPressure(springEquilibriumStroke(bar)), `${bar} bar`).toBeCloseTo(bar);
  });

  it('6 bar drives the full stroke, and the spring is compressed solid at the end', () => {
    const engine = singleCircuit(6);
    const done = engine.step(3).cylinders.cyl;
    expect(done.stroke).toBe(1);
    expect(done.velocity).toBe(0);
    expect(done.force).toBeGreaterThan(0); // air still wins against the fully compressed spring
  });

  it('1.5 bar stops part-way, exactly where p·A equals the spring force', () => {
    const engine = singleCircuit(1.5);
    const resting = engine.step(5).cylinders.cyl;
    expect(resting.stroke).toBeGreaterThan(0);
    expect(resting.stroke).toBeLessThan(1);
    expect(resting.stroke).toBeCloseTo(springEquilibriumStroke(1.5), 6);
    expect(resting.velocity).toBe(0);
    expect(Math.abs(resting.force)).toBeLessThan(1e-9);
    // and it stays there
    expect(engine.step(5).cylinders.cyl.stroke).toBe(resting.stroke);
  });

  it('every pressure between preload and solid ends up at its own equilibrium, never beyond it', () => {
    const rest = (bar: number) => singleCircuit(bar).step(8).cylinders.cyl.stroke;
    expect(rest(0.8)).toBe(0); // below the preload nothing moves
    const strokes = [1.5, 2, 2.5, 3, 3.5].map(rest);
    strokes.forEach((stroke, i) => expect(stroke).toBeCloseTo(springEquilibriumStroke([1.5, 2, 2.5, 3, 3.5][i]), 6));
    expect([...strokes].sort((a, b) => a - b)).toEqual(strokes); // more pressure, further out
    expect(rest(5)).toBe(1);
  });

  it('retreats along the spring as the pressure falls and returns fully at 0 bar', () => {
    const engine = singleCircuit(6);
    expect(engine.step(3).cylinders.cyl.stroke).toBe(1);
    // trapped pressure cannot push the piston back: venting is what lets the spring act
    engine.setManual('v', 'left', false);
    expect(engine.step(0.1).cylinders.cyl.velocity).toBeLessThan(0);
    expect(engine.step(4).cylinders.cyl.stroke).toBe(0);
    expect(engine.step(1).cylinders.cyl.velocity).toBe(0);
  });

  it('a 20 % throttle in the supply line only slows the stroke: 5× longer, still 100 %', () => {
    const baseline = timeTo(singleCircuit(6), 1)!;
    const throttled = timeTo(singleCircuit(6, [part('fc', 'flow-control-oneway', { openingPercentage: 20 })], [['v:p2', 'fc:in'], ['fc:out', 'cyl:a']]), 1)!;
    expect(baseline).not.toBeNull();
    expect(throttled).not.toBeNull();
    expect(throttled / baseline).toBeGreaterThan(4.9);
    expect(throttled / baseline).toBeLessThan(5.1);
    // the throttled piston really reaches 100 %, not just "nearly"
    const engine = singleCircuit(6, [part('fc', 'flow-control-oneway', { openingPercentage: 20 })], [['v:p2', 'fc:in'], ['fc:out', 'cyl:a']]);
    expect(engine.step(20).cylinders.cyl.stroke).toBe(1);
  });

  it('even a 1 % throttle completes the stroke (just very slowly), and the speed scales with the opening', () => {
    const at = (percent: number) => {
      const engine = singleCircuit(6, [part('fc', 'flow-control', { openingPercentage: percent })], [['v:p2', 'fc:in'], ['fc:out', 'cyl:a']]);
      return engine.step(0.2).cylinders.cyl.velocity;
    };
    expect(at(50) / at(100)).toBeCloseTo(0.5, 2);
    expect(at(20) / at(100)).toBeCloseTo(0.2, 2);
    expect(timeTo(singleCircuit(6, [part('fc', 'flow-control', { openingPercentage: 1 })], [['v:p2', 'fc:in'], ['fc:out', 'cyl:a']]), 1, 200)).not.toBeNull();
  });

  it('a throttle check valve meters the way in and lets the spring return at full speed', () => {
    const wiring: Array<[string, string]> = [['v:p2', 'fc:in'], ['fc:out', 'cyl:a']];
    const engine = singleCircuit(6, [part('fc', 'flow-control-oneway', { openingPercentage: 20 })], wiring);
    const out = engine.step(0.3).cylinders.cyl;
    const free = singleCircuit(6).step(0.3).cylinders.cyl;
    expect(out.velocity / free.velocity).toBeCloseTo(0.2, 2);
    engine.step(20);
    engine.setManual('v', 'left', false);
    const back = engine.step(0.1).cylinders.cyl;
    // the return flows through the check valve (Cv 1): unchoked, same speed as without a throttle
    const unthrottled = singleCircuit(6);
    unthrottled.step(3);
    unthrottled.setManual('v', 'left', false);
    expect(back.velocity).toBeCloseTo(unthrottled.step(0.1).cylinders.cyl.velocity, 6);
  });

  it('a short stroke or a large step never overshoots the equilibrium', () => {
    const geometry = { areaA: 5e-4, areaB: 0, length: 0.002 };
    const state = { stroke: 0, velocity: 0, force: 0, chamberPressureA: 0, chamberPressureB: 0 };
    const drive = { pressureA: 2, pressureB: 0, canDischargeA: true, canDischargeB: true, throttleExtend: 1, throttleRetract: 1 };
    const next = stepCylinder(state, geometry, { rear: 'a', spring: true }, drive, { idealVelocity: 0.2, cushionZone: 0.1, cushioned: false }, 0.5);
    expect(next.stroke).toBeCloseTo(springEquilibriumStroke(2), 9);
  });
});

describe('position sensors: ±3 mm window', () => {
  type Internals = { cylinders: Map<string, { stroke: number }>; refreshSensors: () => void; sensors: Record<string, boolean> };
  /** Sensor states of a cylinder whose piston has been placed `mm` from the retracted end. */
  const sensorsAt = (strokeMm: number, mm: number) => {
    const engine = new FluidEngine({ components: [{ id: 'cyl', type: 'cylinder-double', props: { stroke: strokeMm } }], wires: [] });
    const internals = engine as unknown as Internals;
    internals.cylinders.set('cyl', { ...internals.cylinders.get('cyl')!, stroke: mm / strokeMm });
    internals.refreshSensors();
    return { s1: internals.sensors['cyl:S1'], s2: internals.sensors['cyl:S2'] };
  };

  it('rests retracted with only the 1B1 end made', () => {
    expect(new FluidEngine({ components: [{ id: 'cyl', type: 'cylinder-double', props: {} }], wires: [] }).getSnapshot().sensors).toMatchObject({ 'cyl:S1': true, 'cyl:S2': false });
  });

  it('makes each end within 3 mm of it, whatever the stroke length', () => {
    for (const strokeMm of [100, 500]) {
      expect(sensorsAt(strokeMm, 2.9), `${strokeMm} mm stroke at 2.9 mm`).toEqual({ s1: true, s2: false });
      expect(sensorsAt(strokeMm, 3.5), `${strokeMm} mm stroke at 3.5 mm`).toEqual({ s1: false, s2: false });
      expect(sensorsAt(strokeMm, strokeMm - 3.5), `${strokeMm} mm stroke 3.5 mm short of the end`).toEqual({ s1: false, s2: false });
      expect(sensorsAt(strokeMm, strokeMm - 2.9), `${strokeMm} mm stroke 2.9 mm short of the end`).toEqual({ s1: false, s2: true });
    }
  });
});
