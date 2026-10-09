/**
 * Comprehensive industrial audit of the fluid-power engine (pneumatics, electro-pneumatics, hydraulics, electro-hydraulics).
 *
 * Every test drives the real engine (FluidEngine ticks, the 24 V relay ladder, the displacement-step tracker) and asserts
 * physics: pressures in bar, forces F = p·A, stroke times, limit-switch windows, valve memory, locking and venting.
 * Test ids T001…T400 are unique across this file and the symbol / catalog / DOM parity tests in
 * client/src/simulators/fluid-engine/components/InspectorParity.test.tsx; `section()` fails the file at collection time
 * if a block registers more or fewer tests than its id range, so a silent drop cannot hide.
 *
 *   T001–T100  pneumatics            T101–T200  electro-pneumatics
 *   T201–T300  hydraulics            T301–T400  electro-hydraulics
 */
import { describe, expect, it } from 'vitest';
import { FluidEngine, sensorId } from './FluidEngine';
import { DEFAULT_ENGINE_CONFIG, type EngineComponent, type EngineSnapshot, type EngineWire } from './types';
import { chargeTime, stepVolume, springEquilibriumStroke, springPressure, SPRING_PRELOAD_BAR, SPRING_RATE_BAR, cylinderGeometry, cylinderMetaOf, sensorLinksOf } from './componentSolvers';
import { VALVE_TABLES, envelopeForPosition } from './valveTables';
import { EMPTY_LADDER_STATE, idleLadder, makeElement, newPath, sanitizeLadder, stepLadder, crossReferences, type LadderCircuit, type LadderState } from '@/simulators/fluid-engine/models/relayLadder';
import { startStopExample } from '@/simulators/fluid-engine/models/ladderExamples';
import { sensorSignals, solenoidDrive, solenoidTargets } from '@/simulators/fluid-engine/models/ladderCoupling';
import { listSensorOptions } from '@/simulators/fluid-engine/models/sensorCoupling';
import { assignSignalTags } from '@/simulators/fluid-engine/models/signalTags';
import { cycleView, displacementTrace, emptyTracker, sensorMarks, signalLinks, trackSample, type CycleTracker, type CylinderReading } from '@/simulators/fluid-engine/models/functionDiagram';

/* ───────────────────────── helpers ───────────────────────── */

const DT = DEFAULT_ENGINE_CONFIG.dt;
const pad = (n: number) => String(n).padStart(3, '0');

/** Registers `last - first + 1` tests named T<id>; `done()` throws if the block registered a different number. */
function section(first: number, last: number) {
  let next = first;
  const add = (name: string, fn: () => void) => {
    if (next > last) throw new Error(`section T${pad(first)}–T${pad(last)} overflowed with "${name}"`);
    it(`T${pad(next)} ${name}`, fn);
    next += 1;
  };
  add.done = () => {
    if (next !== last + 1) throw new Error(`section T${pad(first)}–T${pad(last)} registered ${next - first} of ${last - first + 1} tests`);
  };
  return add;
}

const part = (id: string, type: string, props: Record<string, unknown> = {}): EngineComponent => ({ id, type, props });
const wire = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};
type Pipes = Array<[string, string]>;
const network = (components: EngineComponent[], pipes: Pipes) => ({ components, wires: pipes.map(([a, b]) => wire(a, b)) });
const engineOf = (components: EngineComponent[], pipes: Pipes = []) => new FluidEngine(network(components, pipes));
const bar = (snapshot: EngineSnapshot, node: string) => snapshot.portPressure[node];
const stroke = (engine: FluidEngine, id = 'cyl') => engine.getSnapshot().cylinders[id].stroke;
const velocity = (engine: FluidEngine, id = 'cyl') => engine.getSnapshot().cylinders[id].velocity;

const PUSH = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
const PILOT2 = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
const SOL_SPRING = { actuationLeft: 'Solenoid', actuationRight: 'Spring Return' };
const SOL2 = { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' };
const roller = (sensor: string, extra: Record<string, unknown> = {}) => ({ actuationLeft: 'Roller', actuationRight: 'Spring Return', leftSensor: sensor, ...extra });
const idleRoller = (sensor: string, triggerDirection: 'EXTEND_ONLY' | 'RETRACT_ONLY') => ({ actuationLeft: 'Idle-Return Roller', actuationRight: 'Spring Return', leftSensor: sensor, triggerDirection });
const AREA = (boreMm: number) => (Math.PI / 4) * (boreMm / 1000) ** 2;
const ANNULUS = (boreMm: number) => AREA(boreMm) * (1 - 0.4 ** 2);

/** Source → 3/2 pushbutton → single-acting cylinder. */
const singleCircuit = (supply = 6, cylinder: Record<string, unknown> = {}) =>
  engineOf([part('src', 'pressure-source', { pressure: supply }), part('v', 'valve-3-2-nc', PUSH), part('cyl', 'cylinder-single', cylinder)], [['src:out', 'v:p1'], ['v:p2', 'cyl:a']]);
/** Source → 5/2 pushbutton → double-acting cylinder: port 4 feeds the rear chamber, port 2 the rod side. */
const doubleCircuit = (cylinder: Record<string, unknown> = {}, valve: Record<string, unknown> = PUSH, supply = 6) =>
  engineOf([part('src', 'pressure-source', { pressure: supply }), part('v', 'valve-5-2', valve), part('cyl', 'cylinder-double', cylinder)], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);

/** Cylinder readings the way the app's diagram hook builds them. */
function readingsOf(snapshot: EngineSnapshot, ids: string[]): Record<string, CylinderReading> {
  const readings: Record<string, CylinderReading> = {};
  for (const id of ids) {
    const retracted = Boolean(snapshot.sensors[sensorId(id, 'S1')]);
    const extended = Boolean(snapshot.sensors[sensorId(id, 'S2')]);
    readings[id] = { position: snapshot.cylinders[id]?.stroke ?? 0, end: retracted ? 0 : extended ? 1 : null };
  }
  return readings;
}
/** Runs the engine tick by tick for `seconds`, feeding the displacement-step tracker; `each` sees every snapshot. */
function track(engine: FluidEngine, ids: string[], seconds: number, tracker: CycleTracker = emptyTracker(), each?: (snapshot: EngineSnapshot) => void): CycleTracker {
  let current = tracker;
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    const snapshot = engine.step(DT);
    each?.(snapshot);
    current = trackSample(current, snapshot.time, readingsOf(snapshot, ids));
  }
  return current;
}
const movesOf = (tracker: CycleTracker) => cycleView(tracker).steps.map(step => step.moves.map(move => `${move.cylinderId}${move.direction === 1 ? '+' : '-'}`).sort());
const startPulse = (engine: FluidEngine, id = 'start', side: 'left' | 'right' = 'left') => {
  engine.setManual(id, side, true);
  engine.step(0.1);
  engine.setManual(id, side, false);
};
/** Seconds until `done` first holds, or null. */
function timeUntil(engine: FluidEngine, done: (snapshot: EngineSnapshot) => boolean, limit = 60): number | null {
  for (let tick = 0; tick < limit / DT; tick += 1) if (done(engine.step(DT))) return engine.getSnapshot().time;
  return null;
}

/* ───────────────────────── electro-fluid rig (ladder + engine, wired exactly like FluidSimulatorApp) ───────────────────────── */

interface RigPart { id: string; type: string; label: string; props: Record<string, unknown> }
const rigPart = (id: string, type: string, label: string, props: Record<string, unknown> = {}): RigPart => ({ id, type, label, props });

/**
 * One scan per tick: limit switches → ladder sensor contacts (by tag) → relays / solenoids → valve ends (by tag) → engine tick → tracker.
 * `stuck` overrides a sensor tag (true = stuck made, false = stuck open) to inject sensor faults.
 */
class Rig {
  readonly engine: FluidEngine;
  readonly parts: RigPart[];
  readonly pipes: Pipes;
  readonly tags: ReturnType<typeof assignSignalTags>;
  readonly options: ReturnType<typeof listSensorOptions>;
  readonly targets: ReturnType<typeof solenoidTargets>;
  readonly pressed: Record<string, boolean> = {};
  readonly stuck: Record<string, boolean> = {};
  readonly cylinders: string[];
  ladder: LadderState = EMPTY_LADDER_STATE;
  tracker: CycleTracker = emptyTracker();
  energised: Record<string, boolean> = {};
  circuit: LadderCircuit;

  constructor(parts: RigPart[], pipes: Pipes, circuit: LadderCircuit) {
    this.parts = parts;
    this.pipes = pipes;
    this.circuit = circuit;
    this.engine = new FluidEngine(network(parts.map(({ id, type, props }) => ({ id, type, props })), pipes));
    this.tags = assignSignalTags(parts);
    this.options = listSensorOptions(parts, this.tags.sensors);
    this.targets = solenoidTargets(parts, this.tags, this.options);
    this.cylinders = parts.filter(candidate => cylinderMetaOf({ id: candidate.id, type: candidate.type, props: candidate.props })).map(candidate => candidate.id);
  }

  press(tag: string, on = true) { this.pressed[tag.toLowerCase()] = on; }
  get snapshot() { return this.engine.getSnapshot(); }

  tick(dt = DT): EngineSnapshot {
    const sensors = sensorSignals(this.options, this.snapshot.sensors);
    for (const [tag, level] of Object.entries(this.stuck)) sensors[tag.toLowerCase()] = level;
    const result = stepLadder(this.circuit, { sensors, pressed: this.pressed }, this.ladder, dt);
    this.ladder = result.state;
    this.energised = result.solenoids;
    const drive = solenoidDrive(this.targets, result.solenoids);
    for (const target of this.targets) this.engine.setManual(target.componentId, target.side, drive[target.key]);
    const snapshot = this.engine.step(dt);
    this.tracker = trackSample(this.tracker, snapshot.time, readingsOf(snapshot, this.cylinders));
    return snapshot;
  }
  run(seconds: number, each?: (snapshot: EngineSnapshot) => void): void {
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) { const snapshot = this.tick(); each?.(snapshot); }
  }
  /** Momentary pushbutton. */
  push(tag: string, seconds = 0.2) { this.press(tag); this.run(seconds); this.press(tag, false); }
  sensor(id: string, end: 'S1' | 'S2') { return Boolean(this.snapshot.sensors[sensorId(id, end)]); }
}

/* ═════════════════════════ PARTITION 1 — PURE PNEUMATICS (T001–T100) ═════════════════════════ */

describe('P1.1 single and double acting cylinders (T001–T012; T013–T020 are the open-triangle symbol tests)', () => {
  const t = section(1, 12);

  t('single-acting cylinder: 6 bar through a pushbutton 3/2 drives the rod to the front cap', () => {
    const engine = singleCircuit();
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(6);
  });

  t('single-acting cylinder: the return spring drives the rod home and the chamber vents when the valve is released', () => {
    const engine = singleCircuit();
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    engine.step(0.05);
    expect(velocity(engine)).toBeLessThan(0);
    engine.step(2);
    expect(stroke(engine)).toBe(0);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(0);
  });

  t('single-acting cylinder: spring kinetics, 2.5 bar balances the spring at half stroke (p = 1 + 3x)', () => {
    const engine = singleCircuit(2.5);
    engine.setManual('v', 'left', true);
    engine.step(6);
    expect(springEquilibriumStroke(2.5)).toBeCloseTo(0.5, 9);
    expect(stroke(engine)).toBeCloseTo(0.5, 3);
    expect(springPressure(stroke(engine))).toBeCloseTo(2.5, 2);
    expect(velocity(engine)).toBe(0);
  });

  t('single-acting cylinder: at the spring preload (1 bar) the rod does not leave its rear cap', () => {
    const engine = singleCircuit(SPRING_PRELOAD_BAR);
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(SPRING_PRELOAD_BAR + SPRING_RATE_BAR).toBe(4);
  });

  t('double-acting cylinder: 5/2 pushbutton pressurises the rear chamber, rod reaches the cap and stays clamped there under continuing pressure', () => {
    const engine = doubleCircuit();
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    expect(velocity(engine)).toBe(0);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(6);
    expect(bar(engine.getSnapshot(), 'cyl:b')).toBe(0);
  });

  t('double-acting cylinder: releasing the 5/2 reverses the supply and retracts to the rear stop (stroke limit 0)', () => {
    const engine = doubleCircuit();
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    engine.step(0.1);
    expect(velocity(engine)).toBeLessThan(0);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(bar(engine.getSnapshot(), 'cyl:b')).toBe(6);
  });

  for (const bore of [16, 25, 40, 63]) {
    t(`force F = p·A on extension: Ø${bore} mm bore at 6 bar gives ${(6e5 * AREA(bore)).toFixed(0)} N`, () => {
      const engine = doubleCircuit({ bore });
      engine.setManual('v', 'left', true);
      engine.step(0.1);
      expect(engine.getSnapshot().cylinders.cyl.force / (6e5 * AREA(bore))).toBeCloseTo(1, 4);
    });
  }

  t('force on retraction acts on the annulus (rod ratio 0.4): F = p·A·(1 − 0.16)', () => {
    const engine = doubleCircuit({ bore: 40 });
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    engine.step(0.1);
    const force = engine.getSnapshot().cylinders.cyl.force;
    expect(force).toBeLessThan(0);
    expect(-force / (6e5 * ANNULUS(40))).toBeCloseTo(1, 4);
    expect(-force).toBeLessThan(6e5 * AREA(40));
  });

  t('air consumption: the volume drawn through the rear port over one stroke equals A·L (0.0491 L for Ø25 × 100 mm)', () => {
    const engine = doubleCircuit({ bore: 25, stroke: 100 });
    engine.setManual('v', 'left', true);
    let litres = 0;
    for (let tick = 0; tick < 200; tick += 1) {
      const snapshot = engine.step(DT);
      litres += snapshot.nets.find(net => net.connectedPortIds.includes('cyl:a'))!.flowRate * DT / 60;
    }
    expect(stroke(engine)).toBe(1);
    expect(litres).toBeCloseTo(AREA(25) * 0.1 * 1000, 3);
    expect(cylinderGeometry(part('c', 'cylinder-double', { bore: 25, stroke: 100 }), cylinderMetaOf(part('c', 'cylinder-double'))!).length).toBeCloseTo(0.1, 9);
  });

  t.done();
});

describe('P1.2 pneumatic logic gates (T021–T040)', () => {
  const t = section(21, 40);
  /** Two pushbutton 3/2 valves feed X and Y of a gate that drives a single-acting cylinder. */
  const gated = (gate: 'shuttle-valve' | 'dual-pressure-valve') => engineOf(
    [part('src', 'pressure-source'), part('s1', 'valve-3-2-nc', PUSH), part('s2', 'valve-3-2-nc', PUSH), part('g', gate), part('cyl', 'cylinder-single')],
    [['src:out', 's1:p1'], ['src:out', 's2:p1'], ['s1:p2', 'g:x'], ['s2:p2', 'g:y'], ['g:out', 'cyl:a']],
  );
  const bare = (gate: 'shuttle-valve' | 'dual-pressure-valve', x: number, y: number) => {
    const engine = engineOf([part('g', gate)]);
    engine.injectPressure('g', 'x', x);
    engine.injectPressure('g', 'y', y);
    return engine.step();
  };

  t('shuttle (OR), single-point feeding on X: out = 6 bar, ball pushed onto the Y seat (+1), cylinder extends', () => {
    const engine = gated('shuttle-valve');
    engine.setManual('s1', 'left', true);
    const snapshot = engine.step(2);
    expect(bar(snapshot, 'g:out')).toBe(6);
    expect(snapshot.logic.g.offset).toBe(1);
    expect(stroke(engine)).toBe(1);
  });
  t('shuttle (OR), single-point feeding on Y: out = 6 bar, ball on the X seat (−1)', () => {
    const engine = gated('shuttle-valve');
    engine.setManual('s2', 'left', true);
    const snapshot = engine.step(2);
    expect(bar(snapshot, 'g:out')).toBe(6);
    expect(snapshot.logic.g.offset).toBe(-1);
    expect(stroke(engine)).toBe(1);
  });
  t('shuttle (OR), dual-point feeding: both inlets at 6 bar centre the ball and the output stays 6 bar', () => {
    const engine = gated('shuttle-valve');
    engine.setManual('s1', 'left', true);
    engine.setManual('s2', 'left', true);
    const snapshot = engine.step(2);
    expect(bar(snapshot, 'g:out')).toBe(6);
    expect(snapshot.logic.g.offset).toBe(0);
  });
  t('shuttle (OR), zero-point feeding: no inlet signal gives zero output and the rod stays retracted', () => {
    const engine = gated('shuttle-valve');
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'g:out')).toBe(0);
    expect(snapshot.logic.g.offset).toBe(0);
    expect(stroke(engine)).toBe(0);
  });
  t('shuttle (OR) leaks nothing back: the unfed inlet line stays at 0 bar while the other inlet supplies the load', () => {
    const engine = gated('shuttle-valve');
    engine.setManual('s1', 'left', true);
    const snapshot = engine.step(1);
    expect(bar(snapshot, 's2:p2')).toBe(0);
    expect(bar(snapshot, 'g:y')).toBe(0);
    expect(bar(snapshot, 'cyl:a')).toBe(6);
  });
  t('shuttle (OR) with 6 bar on X and 3 bar on Y passes the higher pressure', () => {
    const snapshot = bare('shuttle-valve', 6, 3);
    expect(bar(snapshot, 'g:out')).toBe(6);
    expect(snapshot.logic.g.offset).toBe(1);
  });
  t('shuttle (OR) with 2 bar on X and 5 bar on Y passes 5 bar and seats the ball on X', () => {
    const snapshot = bare('shuttle-valve', 2, 5);
    expect(bar(snapshot, 'g:out')).toBe(5);
    expect(snapshot.logic.g.offset).toBe(-1);
  });
  t('shuttle (OR): releasing one valve while the other is held keeps the cylinder extended', () => {
    const engine = gated('shuttle-valve');
    engine.setManual('s1', 'left', true);
    engine.setManual('s2', 'left', true);
    engine.step(2);
    engine.setManual('s1', 'left', false);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'g:out')).toBe(6);
  });
  t('shuttle (OR): releasing both valves vents the cylinder through the valve exhausts and the spring returns it', () => {
    const engine = gated('shuttle-valve');
    engine.setManual('s1', 'left', true);
    engine.step(2);
    engine.setManual('s1', 'left', false);
    engine.step(3);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(0);
    expect(stroke(engine)).toBe(0);
  });
  t('shuttle (OR) has no switching threshold: even 0.3 bar on one inlet is passed on', () => {
    const snapshot = bare('shuttle-valve', 0.3, 0);
    expect(bar(snapshot, 'g:out')).toBeCloseTo(0.3, 9);
  });

  t('dual-pressure (AND), X alone: output stays 0 and the spool is pushed to the Y side (+1)', () => {
    const snapshot = bare('dual-pressure-valve', 6, 0);
    expect(bar(snapshot, 'g:out')).toBe(0);
    expect(snapshot.logic.g.offset).toBe(1);
  });
  t('dual-pressure (AND), Y alone: output stays 0 and the spool moves the other way (−1)', () => {
    const snapshot = bare('dual-pressure-valve', 0, 6);
    expect(bar(snapshot, 'g:out')).toBe(0);
    expect(snapshot.logic.g.offset).toBe(-1);
  });
  t('dual-pressure (AND), both inlets at 6 bar: output 6 bar with the spool centred', () => {
    const snapshot = bare('dual-pressure-valve', 6, 6);
    expect(bar(snapshot, 'g:out')).toBe(6);
    expect(snapshot.logic.g.offset).toBe(0);
  });
  t('dual-pressure (AND), asymmetric 6 / 4 bar: output follows the lower inlet (4 bar)', () => {
    expect(bar(bare('dual-pressure-valve', 6, 4), 'g:out')).toBe(4);
  });
  t('dual-pressure (AND), asymmetric 2 / 6 bar: output follows the lower inlet (2 bar)', () => {
    expect(bar(bare('dual-pressure-valve', 2, 6), 'g:out')).toBe(2);
  });
  t('dual-pressure (AND), 6 bar against 0.3 bar (below the 0.5 bar gate threshold): output 0', () => {
    const snapshot = bare('dual-pressure-valve', 6, 0.3);
    expect(bar(snapshot, 'g:out')).toBe(0);
    expect(snapshot.logic.g.offset).toBe(1);
  });
  t('two-hand safety: the cylinder extends only after both pushbuttons are pressed', () => {
    const engine = gated('dual-pressure-valve');
    engine.setManual('s1', 'left', true);
    engine.setManual('s2', 'left', true);
    expect(engine.step(2).cylinders.cyl.stroke).toBe(1);
    expect(bar(engine.getSnapshot(), 'g:out')).toBe(6);
  });
  t('two-hand safety: tying one button down permanently never extends the cylinder', () => {
    const engine = gated('dual-pressure-valve');
    engine.setManual('s1', 'left', true);
    engine.step(10);
    expect(stroke(engine)).toBe(0);
    expect(bar(engine.getSnapshot(), 'g:out')).toBe(0);
  });
  t('two-hand safety: releasing either hand drops the output and the cylinder returns', () => {
    const engine = gated('dual-pressure-valve');
    engine.setManual('s1', 'left', true);
    engine.setManual('s2', 'left', true);
    engine.step(2);
    engine.setManual('s2', 'left', false);
    const released = engine.step(3);
    expect(bar(released, 'g:out')).toBe(0);
    expect(released.cylinders.cyl.stroke).toBe(0);
  });
  t('two-hand safety: pressing the hands one after the other starts the stroke only when the second one is made', () => {
    const engine = gated('dual-pressure-valve');
    engine.setManual('s1', 'left', true);
    engine.step(1);
    expect(stroke(engine)).toBe(0);
    engine.setManual('s2', 'left', true);
    engine.step(0.3);
    expect(stroke(engine)).toBeGreaterThan(0);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
  });

  t.done();
});

describe('P1.3 speed regulation and quick exhaust (T041–T060)', () => {
  const t = section(41, 60);
  /** 5/2 pushbutton with a one-way flow control either feeding (meter-in) or draining (meter-out) one chamber. */
  type Where = 'extend-in' | 'extend-out' | 'retract-in' | 'retract-out';
  const metered = (where: Where, opening: number) => {
    const fc = part('fc', 'flow-control-oneway', { openingPercentage: opening });
    const pipes: Record<Where, Pipes> = {
      'extend-in': [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']],
      'extend-out': [['v:p4', 'cyl:a'], ['cyl:b', 'fc:in'], ['fc:out', 'v:p2']],
      'retract-in': [['v:p4', 'cyl:a'], ['v:p2', 'fc:in'], ['fc:out', 'cyl:b']],
      'retract-out': [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']].map(([a, b]) => [a, b]) as Pipes,
    };
    // retract-out: the rear chamber drains through the valve, so the check sits the other way round
    if (where === 'retract-out') pipes[where] = [['cyl:a', 'fc:in'], ['fc:out', 'v:p4'], ['v:p2', 'cyl:b']];
    return engineOf([part('src', 'pressure-source'), part('v', 'valve-5-2', PUSH), fc, part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ...pipes[where]]);
  };
  const FULL = DEFAULT_ENGINE_CONFIG.idealVelocity.AIR;
  const extendSpeed = (where: Where, opening: number) => {
    const engine = metered(where, opening);
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    return velocity(engine);
  };
  const retractSpeed = (where: Where, opening: number) => {
    const engine = metered(where, opening);
    engine.setManual('v', 'left', true);
    engine.step(8);
    engine.setManual('v', 'left', false);
    engine.step(0.3);
    return velocity(engine);
  };

  for (const opening of [10, 25, 50, 75]) {
    t(`meter-in on extension at ${opening} %: the stroke runs at ${opening} % of full speed`, () => {
      expect(extendSpeed('extend-in', opening) / FULL).toBeCloseTo(opening / 100, 3);
    });
  }
  for (const opening of [10, 25, 50, 75]) {
    t(`meter-out on extension at ${opening} %: the exhaust restriction limits the stroke to ${opening} % of full speed`, () => {
      expect(extendSpeed('extend-out', opening) / FULL).toBeCloseTo(opening / 100, 3);
    });
  }
  t('meter-in on the rear port leaves the return stroke untouched: the check valve passes the exhaust freely', () => {
    expect(-retractSpeed('extend-in', 25) / FULL).toBeCloseTo(1, 3);
  });
  t('meter-out on the rod-side port leaves the return stroke untouched: the supply passes the check valve freely', () => {
    expect(-retractSpeed('extend-out', 25) / FULL).toBeCloseTo(1, 3);
  });
  t('meter-in on the rod-side port throttles the return stroke to 25 %', () => {
    expect(-retractSpeed('retract-in', 25) / FULL).toBeCloseTo(0.25, 3);
  });
  t('meter-in on the rod-side port leaves the extension at full speed (exhaust through the check valve)', () => {
    expect(extendSpeed('retract-in', 25) / FULL).toBeCloseTo(1, 3);
  });
  t('meter-out of the rear chamber throttles the return stroke independently of the extension (30 % / 60 %)', () => {
    const slowReturn = -retractSpeed('retract-out', 30) / FULL;
    expect(slowReturn).toBeCloseTo(0.3, 3);
    expect(extendSpeed('retract-out', 60) / FULL).toBeCloseTo(1, 3);
  });
  t('a plain throttle valve restricts both directions of travel (40 % in each)', () => {
    const engine = engineOf(
      [part('src', 'pressure-source'), part('v', 'valve-5-2', PUSH), part('fc', 'flow-control', { openingPercentage: 40 }), part('cyl', 'cylinder-double')],
      [['src:out', 'v:p1'], ['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']],
    );
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    expect(velocity(engine) / FULL).toBeCloseTo(0.4, 3);
    engine.step(10);
    engine.setManual('v', 'left', false);
    engine.step(0.3);
    expect(-velocity(engine) / FULL).toBeCloseTo(0.4, 3);
  });
  t('a throttle opening of 0 % is held at the 1 % floor: the rod still creeps instead of locking', () => {
    const speed = extendSpeed('extend-in', 0);
    expect(speed / FULL).toBeCloseTo(0.01, 4);
    expect(speed).toBeGreaterThan(0);
  });

  /** Single-acting cylinder behind a 3/2: a choked line between valve and cylinder, optionally with a quick-exhaust valve at the cylinder. */
  const returnSpeed = (withQuickExhaust: boolean) => {
    const components = [part('src', 'pressure-source'), part('v', 'valve-3-2-nc', PUSH), part('fc', 'flow-control', { openingPercentage: 20 }), part('cyl', 'cylinder-single')];
    const pipes: Pipes = [['src:out', 'v:p1']];
    if (withQuickExhaust) {
      components.push(part('qe', 'quick-exhaust'));
      pipes.push(['v:p2', 'fc:in'], ['fc:out', 'qe:p1'], ['qe:p2', 'cyl:a']);
    } else pipes.push(['v:p2', 'fc:in'], ['fc:out', 'cyl:a']);
    const engine = engineOf(components, pipes);
    engine.setManual('v', 'left', true);
    engine.step(15);
    engine.setManual('v', 'left', false);
    engine.step(0.2);
    return { engine, speed: -velocity(engine) };
  };
  t('quick exhaust dumps the cylinder straight to atmosphere: the return stroke is 5× faster than through the 20 % throttle', () => {
    const choked = returnSpeed(false).speed;
    const quick = returnSpeed(true).speed;
    expect(choked / FULL).toBeCloseTo(0.2, 3);
    expect(quick / choked).toBeCloseTo(5, 2);
  });
  t('quick exhaust: while the valve is released the cylinder chamber is at 0 bar and the seal opens the exhaust path (−1)', () => {
    const { engine } = returnSpeed(true);
    const snapshot = engine.getSnapshot();
    expect(bar(snapshot, 'cyl:a')).toBe(0);
    expect(snapshot.logic.qe.offset).toBe(-1);
  });
  t('quick exhaust passes the supply 1 → 2 without loss and seals the exhaust seat (+1) while fed', () => {
    const engine = engineOf([part('qe', 'quick-exhaust')]);
    engine.injectPressure('qe', 'p1', 6);
    const snapshot = engine.step();
    expect(bar(snapshot, 'qe:p2')).toBe(6);
    expect(snapshot.logic.qe.offset).toBe(1);
  });
  t('quick exhaust: removing the 6 bar supply drops the working line to atmospheric pressure at once', () => {
    const engine = engineOf([part('qe', 'quick-exhaust')]);
    engine.injectPressure('qe', 'p1', 6);
    engine.step();
    engine.injectPressure('qe', 'p1', 0);
    const snapshot = engine.step();
    expect(bar(snapshot, 'qe:p2')).toBe(0);
    expect(snapshot.logic.qe.offset).toBe(-1);
  });
  t('quick exhaust port 3 never builds back-pressure: its pressure is 0 bar in both states', () => {
    const engine = engineOf([part('qe', 'quick-exhaust')]);
    engine.injectPressure('qe', 'p1', 6);
    expect(bar(engine.step(), 'qe:p3')).toBe(0);
    engine.injectPressure('qe', 'p1', 0);
    expect(bar(engine.step(), 'qe:p3')).toBe(0);
  });

  t.done();
});

describe('P1.4 mechanical feedback and auto-reciprocation (T061–T080)', () => {
  const t = section(61, 80);
  /** A spring-return cylinder fed so that its rod settles at the equilibrium stroke x: p = 1 + 3x. */
  const settledAt = (x: number, strokeMm: number) => {
    const engine = singleCircuit(SPRING_PRELOAD_BAR + SPRING_RATE_BAR * x, { stroke: strokeMm });
    engine.setManual('v', 'left', true);
    engine.step(40); // the piston approaches its spring equilibrium asymptotically (damped near the cap)
    return engine;
  };
  const switches = (engine: FluidEngine) => ({ s1: engine.getSnapshot().sensors['cyl:S1'], s2: engine.getSnapshot().sensors['cyl:S2'] });

  t('limit switches at rest: 1B1 (retracted) is made, 1B2 (extended) is open', () => {
    expect(switches(singleCircuit())).toEqual({ s1: true, s2: false });
  });
  t('limit switches at 100 % stroke: 1B2 is made, 1B1 has released', () => {
    const engine = singleCircuit();
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(switches(engine)).toEqual({ s1: false, s2: true });
  });
  t('limit switches mid-stroke (50 %): neither switch is made', () => {
    expect(switches(settledAt(0.5, 100))).toEqual({ s1: false, s2: false });
  });
  for (const length of [50, 100, 200, 400]) {
    const window = 3 / length;
    t(`1B2 closes inside the ±3 mm window of a ${length} mm stroke (rod at ${((1 - window / 2) * 100).toFixed(2)} %)`, () => {
      expect(stroke(settledAt(1 - window / 2, length))).toBeCloseTo(1 - window / 2, 3);
      expect(switches(settledAt(1 - window / 2, length))).toEqual({ s1: false, s2: true });
    });
  }
  for (const length of [50, 100, 200, 400]) {
    const window = 3 / length;
    t(`1B2 stays open 2 windows short of the end of a ${length} mm stroke (rod at ${((1 - 2 * window) * 100).toFixed(2)} %)`, () => {
      expect(switches(settledAt(1 - 2 * window, length)).s2).toBe(false);
    });
  }
  t('1B1 is still made 2 % into the stroke of a 100 mm cylinder (inside the 3 mm window)', () => {
    expect(switches(settledAt(0.02, 100))).toEqual({ s1: true, s2: false });
  });
  t('1B1 has released 6 % into the stroke of a 100 mm cylinder', () => {
    expect(switches(settledAt(0.06, 100))).toEqual({ s1: false, s2: false });
  });

  /** 5/2 pushbutton drives cylinder `cyl`; a roller 3/2 coupled to one of its switches feeds a gauge. */
  const sensed = (rollerProps: Record<string, unknown>) => engineOf(
    [part('src', 'pressure-source'), part('v', 'valve-5-2', PUSH), part('cyl', 'cylinder-double'), part('r', 'valve-3-2-nc', rollerProps), part('g', 'pressure-gauge')],
    [['src:out', 'v:p1'], ['src:out', 'r:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'], ['r:p2', 'g:p']],
  );
  t('a roller lever on the extended switch passes air only while the rod sits at the front cap', () => {
    const engine = sensed(roller('cyl:S2'));
    expect(bar(engine.step(0.1), 'g:p')).toBe(0);
    engine.setManual('v', 'left', true);
    expect(bar(engine.step(2), 'g:p')).toBe(6);
    engine.setManual('v', 'left', false);
    expect(bar(engine.step(3), 'g:p')).toBe(0);
  });
  t('a roller lever on the retracted switch is held down at rest and lifts as soon as the rod leaves the rear cap', () => {
    const engine = sensed(roller('cyl:S1'));
    expect(bar(engine.step(0.1), 'g:p')).toBe(6);
    engine.setManual('v', 'left', true);
    expect(bar(engine.step(0.5), 'g:p')).toBe(0);
  });
  t('an idle-return roller (extend only) gives a ≈0.12 s pulse as the cam runs over it, then folds away although the rod stays out', () => {
    const engine = sensed(idleRoller('cyl:S2', 'EXTEND_ONLY'));
    engine.setManual('v', 'left', true);
    let high = 0;
    let first = -1;
    let last = -1;
    for (let tick = 0; tick < 200; tick += 1) {
      const snapshot = engine.step(DT);
      if (bar(snapshot, 'g:p') > 0) { high += 1; if (first < 0) first = snapshot.time; last = snapshot.time; }
    }
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'g:p')).toBe(0);
    expect(high * DT).toBeGreaterThan(0.08);
    expect(high * DT).toBeLessThan(0.2);
    expect(last - first).toBeLessThan(0.2);
  });
  t('an idle-return roller set to retract-only stays silent on the way out and pulses on the way back', () => {
    const engine = sensed(idleRoller('cyl:S1', 'RETRACT_ONLY'));
    engine.setManual('v', 'left', true);
    let outPulses = 0;
    for (let tick = 0; tick < 150; tick += 1) if (bar(engine.step(DT), 'g:p') > 0) outPulses += 1;
    expect(outPulses).toBe(0);
    engine.setManual('v', 'left', false);
    let backPulses = 0;
    for (let tick = 0; tick < 250; tick += 1) if (bar(engine.step(DT), 'g:p') > 0) backPulses += 1;
    expect(backPulses).toBeGreaterThan(3);
  });

  /** Pure pneumatic auto-reciprocation: enable valve → rollers 1B1 / 1B2 pilot a double-pilot 5/2. */
  const reciprocating = () => engineOf(
    [
      part('src', 'pressure-source'), part('en', 'valve-3-2-nc', PUSH),
      part('main', 'valve-5-2', PILOT2),
      part('r1', 'valve-3-2-nc', roller('cyl:S1')), part('r2', 'valve-3-2-nc', roller('cyl:S2')),
      part('cyl', 'cylinder-double'),
    ],
    [['src:out', 'en:p1'], ['en:p2', 'main:p1'], ['en:p2', 'r1:p1'], ['en:p2', 'r2:p1'], ['r1:p2', 'main:pilotL'], ['r2:p2', 'main:pilotR'], ['main:p4', 'cyl:a'], ['main:p2', 'cyl:b']],
  );
  const extendEdges = (engine: FluidEngine, seconds: number): number[] => {
    const times: number[] = [];
    let was = false;
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
      const now = Boolean(engine.step(DT).sensors['cyl:S2']);
      if (now && !was) times.push(engine.getSnapshot().time);
      was = now;
    }
    return times;
  };
  t('auto-reciprocation: with the enable valve pressed the cylinder cycles on its own without any further input', () => {
    const engine = reciprocating();
    engine.setManual('en', 'left', true);
    const edges = extendEdges(engine, 12);
    expect(edges.length).toBeGreaterThanOrEqual(6);
  });
  t('auto-reciprocation: the cycle period is constant (all cycles within 3 % of one another)', () => {
    const engine = reciprocating();
    engine.setManual('en', 'left', true);
    const edges = extendEdges(engine, 12);
    const periods = edges.slice(1).map((time, index) => time - edges[index]);
    expect(periods.length).toBeGreaterThanOrEqual(5);
    for (const period of periods) expect(period / periods[0]).toBeCloseTo(1, 1);
    expect(Math.max(...periods) - Math.min(...periods)).toBeLessThan(0.03 * periods[0]);
    expect(periods[0]).toBeGreaterThan(0.8);
  });
  t('auto-reciprocation: releasing the enable valve stops the cylinder, pressing it again resumes the cycling', () => {
    const engine = reciprocating();
    engine.setManual('en', 'left', true);
    extendEdges(engine, 5);
    engine.setManual('en', 'left', false);
    engine.step(1);
    const frozen = stroke(engine, 'cyl');
    engine.step(6);
    expect(stroke(engine, 'cyl')).toBeCloseTo(frozen, 6);
    engine.setManual('en', 'left', true);
    expect(extendEdges(engine, 5).length).toBeGreaterThanOrEqual(2);
  });

  t.done();
});

describe('P1.5 time delay valves and sequential cascades (T081–T100)', () => {
  const t = section(81, 100);

  /** src → pushbutton → timer valve pilot; the timer's output feeds a gauge. */
  const timer = (opening: number, volume: number) => engineOf(
    [part('src', 'pressure-source'), part('v0', 'valve-3-2-nc', PUSH), part('tv', 'time-delay-valve', { openingPercentage: opening, volume }), part('g', 'pressure-gauge')],
    [['src:out', 'v0:p1'], ['src:out', 'tv:p1'], ['v0:p2', 'tv:z12'], ['tv:p2', 'g:p']],
  );
  /** Volume (cm³) that gives a delay of `seconds` to the 3 bar switching level behind a 50 % throttle at 6 bar. */
  const volumeFor = (seconds: number, opening = 50) => (seconds * (opening / 100) * 1000) / Math.log(6 / 3);
  for (const target of [0.5, 1, 2, 5, 10]) {
    t(`on-delay timer (NC) calibrated for ${target} s: output appears after ${target} s ± 0.1 s`, () => {
      const engine = timer(50, volumeFor(target));
      engine.setManual('v0', 'left', true);
      const delay = timeUntil(engine, snapshot => bar(snapshot, 'g:p') > 5.9, 30)!;
      expect(delay).not.toBeNull();
      expect(Math.abs(delay - target)).toBeLessThan(0.1 + 0.01 * target);
      expect(chargeTime(6, 0, DEFAULT_ENGINE_CONFIG.pilotThreshold, 50, volumeFor(target))).toBeCloseTo(target, 6);
    });
  }

  /** Off-delay style (NO) timer: throttled reservoir pilots a 3/2 normally-open valve whose output is on at rest. */
  const normallyOpenTimer = (seconds: number) => engineOf(
    [
      part('src', 'pressure-source'), part('v0', 'valve-3-2-nc', PUSH), part('fc', 'flow-control-oneway', { openingPercentage: 50 }),
      part('res', 'air-reservoir', { volume: volumeFor(seconds) }), part('no', 'valve-3-2-no', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' }), part('g', 'pressure-gauge'),
    ],
    [['src:out', 'v0:p1'], ['v0:p2', 'fc:in'], ['fc:out', 'res:left'], ['res:right', 'no:pilotL'], ['src:out', 'no:p1'], ['no:p2', 'g:p']],
  );
  for (const target of [1, 3, 6]) {
    t(`NO timer calibrated for ${target} s: the output is on at rest and drops after ${target} s ± 0.1 s`, () => {
      const engine = normallyOpenTimer(target);
      expect(bar(engine.step(0.1), 'g:p')).toBe(6);
      engine.setManual('v0', 'left', true);
      const delay = timeUntil(engine, snapshot => bar(snapshot, 'g:p') < 0.1, 30)! - 0.1;
      expect(Math.abs(delay - target)).toBeLessThan(0.1 + 0.01 * target);
    });
  }
  t('timer reset: releasing the start valve vents the chamber through the check valve and the output falls back within 0.1 s', () => {
    const engine = timer(50, volumeFor(1));
    engine.setManual('v0', 'left', true);
    engine.step(2);
    expect(bar(engine.getSnapshot(), 'g:p')).toBe(6);
    engine.setManual('v0', 'left', false);
    const reset = timeUntil(engine, snapshot => bar(snapshot, 'g:p') === 0, 5)!;
    expect(reset - 2).toBeLessThan(0.1);
  });
  t('timer calibration: halving the throttle opening (50 % → 25 %) doubles the delay', () => {
    const delayAt = (opening: number) => {
      const engine = timer(opening, 800);
      engine.setManual('v0', 'left', true);
      return timeUntil(engine, snapshot => bar(snapshot, 'g:p') > 5.9, 60)!;
    };
    expect(delayAt(25) / delayAt(50)).toBeCloseTo(2, 1);
  });
  t('timer calibration: doubling the reservoir volume (400 → 800 cm³) doubles the delay', () => {
    const delayAt = (volume: number) => {
      const engine = timer(50, volume);
      engine.setManual('v0', 'left', true);
      return timeUntil(engine, snapshot => bar(snapshot, 'g:p') > 5.9, 60)!;
    };
    expect(delayAt(800) / delayAt(400)).toBeCloseTo(2, 1);
  });
  t('stepVolume integrated at the engine tick reaches the 3 bar level in chargeTime() seconds (20 %, 500 cm³: ≈ 1.73 s)', () => {
    let pressure = 0;
    let time = 0;
    while (pressure < 3 && time < 30) {
      pressure = stepVolume(pressure, [{ pressure: 6, cvIn: 0.2, timedIn: true, cvOut: 1, timedOut: false }], 0.5, DT);
      time += DT;
    }
    const analytic = chargeTime(6, 0, 3, 20, 500);
    expect(analytic).toBeCloseTo(1.7329, 3);
    expect(time).toBeCloseTo(analytic, 1);
    expect(Math.abs(time - analytic)).toBeLessThan(DT + 1e-9);
  });

  /* Mechanically interlocked sequences. */
  const SIX = ['a', 'b'];
  const sequenceBase = [part('src', 'pressure-source'), part('start', 'valve-3-2-nc', PUSH), part('mainA', 'valve-5-2', PILOT2), part('mainB', 'valve-5-2', PILOT2), part('a', 'cylinder-double'), part('b', 'cylinder-double')];
  const sequencePipes: Pipes = [['src:out', 'start:p1'], ['src:out', 'mainA:p1'], ['src:out', 'mainB:p1'], ['mainA:p4', 'a:a'], ['mainA:p2', 'a:b'], ['mainB:p4', 'b:a'], ['mainB:p2', 'b:b']];
  const withRollers = (rollers: Array<[string, Record<string, unknown>]>, links: Pipes) => engineOf(
    [...sequenceBase, ...rollers.map(([id, props]) => part(id, 'valve-3-2-nc', props))],
    [...sequencePipes, ...rollers.map(([id]) => [`src:out`, `${id}:p1`] as [string, string]), ...links],
  );
  /** A+ B+ A− B−: plain rollers, 1B2 → B+, 2B2 → A−, 1B1 → B−. */
  const abab = () => withRollers([['r1b2', roller('a:S2')], ['r2b2', roller('b:S2')], ['r1b1', roller('a:S1')]], [['start:p2', 'mainA:pilotL'], ['r2b2:p2', 'mainA:pilotR'], ['r1b2:p2', 'mainB:pilotL'], ['r1b1:p2', 'mainB:pilotR']]);
  /** A+ B+ B− A−: idle-return rollers pulse once, so the pilots never oppose each other. */
  const abba = () => withRollers([['r1b2', idleRoller('a:S2', 'EXTEND_ONLY')], ['r2b2', idleRoller('b:S2', 'EXTEND_ONLY')], ['r2b1', idleRoller('b:S1', 'RETRACT_ONLY')]], [['start:p2', 'mainA:pilotL'], ['r2b1:p2', 'mainA:pilotR'], ['r1b2:p2', 'mainB:pilotL'], ['r2b2:p2', 'mainB:pilotR']]);
  /** A+ A− B+ B−: 1B2 returns A, the return stroke of A fires B+, 2B2 returns B. */
  const aabb = () => withRollers([['r1b2', roller('a:S2')], ['r1b1', idleRoller('a:S1', 'RETRACT_ONLY')], ['r2b2', roller('b:S2')]], [['start:p2', 'mainA:pilotL'], ['r1b2:p2', 'mainA:pilotR'], ['r1b1:p2', 'mainB:pilotL'], ['r2b2:p2', 'mainB:pilotR']]);
  const cycle = (engine: FluidEngine, tracker: CycleTracker = emptyTracker()) => {
    let current = track(engine, SIX, 0.2, tracker);
    startPulse(engine);
    current = track(engine, SIX, 8, current);
    return current;
  };

  t('A+ B+ A− B−: the mechanical roller chain produces the four steps in order', () => {
    const view = cycleView(cycle(abab()));
    expect(view.complete).toBe(true);
    expect(movesOf(cycle(abab()))).toEqual([['a+'], ['b+'], ['a-'], ['b-']]);
    expect(view.labels).toEqual([1, 2, 3, 4, 1]);
  });
  t('A+ B+ A− B−: displacement-step curves are the textbook ramps (A: 0-1-1-0-0, B: 0-0-1-1-0)', () => {
    const view = cycleView(cycle(abab()));
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 0], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 0]]);
  });
  t('A+ B+ B− A−: idle-return rollers sequence the four steps without pilot conflicts', () => {
    const tracker = cycle(abba());
    expect(cycleView(tracker).complete).toBe(true);
    expect(movesOf(tracker)).toEqual([['a+'], ['b+'], ['b-'], ['a-']]);
  });
  t('A+ B+ B− A−: displacement-step curves (A: 0-1-1-1-0, B: 0-0-1-0-0)', () => {
    const view = cycleView(cycle(abba()));
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 0], [4, 0]]);
  });
  t('A+ A− B+ B−: the return stroke of A triggers B, steps in order', () => {
    const tracker = cycle(aabb());
    expect(cycleView(tracker).complete).toBe(true);
    expect(movesOf(tracker)).toEqual([['a+'], ['a-'], ['b+'], ['b-']]);
  });
  t('A+ A− B+ B−: displacement-step curves (A: 0-1-0-0-0, B: 0-0-0-1-0)', () => {
    const view = cycleView(cycle(aabb()));
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 0], [3, 0], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 0], [3, 1], [4, 0]]);
  });
  t('mechanical interlock: B+ is never started before A has reached its front limit switch (and each step starts after the last one ended)', () => {
    const tracker = cycle(abab());
    const [aPlus, bPlus, aMinus, bMinus] = tracker.steps.map(step => step.moves[0]);
    expect(bPlus.start).toBeGreaterThanOrEqual(aPlus.end!);
    expect(aMinus.start).toBeGreaterThanOrEqual(bPlus.end!);
    expect(bMinus.start).toBeGreaterThanOrEqual(aMinus.end!);
    expect(signalLinks(cycleView(tracker)).length).toBeGreaterThanOrEqual(3);
    expect(sensorMarks(cycleView(tracker)).map(mark => `${mark.cylinderId}:${mark.end}`)).toEqual(['a:extended', 'b:extended', 'a:retracted', 'b:retracted']);
  });
  t('cycle repetition: a second start press repeats the identical four steps and only advances the playhead (cycle 2, step count 8)', () => {
    const engine = abab();
    const first = cycle(engine);
    const second = cycle(engine, first);
    const view = cycleView(second);
    expect(second.cycleLength).toBe(4);
    expect(view.steps).toEqual(cycleView(first).steps);
    expect(view.cycleNumber).toBe(2);
    expect(second.stepNumber).toBe(8);
  });

  t.done();
});

/* ═════════════════════════ PARTITION 2 — ELECTRO-PNEUMATICS (T101–T200) ═════════════════════════ */

/* Ladder construction shorthands. */
const sensorC = (tag: string, form: 'NO' | 'NC' = 'NO') => makeElement('sensor', tag, { form });
const buttonC = (tag: string, form: 'NO' | 'NC' = 'NO') => makeElement('pushbutton', tag, { form });
const relayC = (tag: string, form: 'NO' | 'NC' = 'NO') => makeElement('relayContact', tag, { form });
const timerC = (tag: string, form: 'NO' | 'NC' = 'NO') => makeElement('timerContact', tag, { form });
const coil = (tag: string) => makeElement('relayCoil', tag);
const solenoid = (tag: string) => makeElement('solenoid', tag);
const timerCoil = (tag: string, delay: number, mode: 'on' | 'off' = 'on') => makeElement('timerCoil', tag, { delay, mode });
/** One rung: groups in series, each group a parallel set of contacts. */
const rung = (conditions: Array<ReturnType<typeof sensorC> | Array<ReturnType<typeof sensorC>>>, load: ReturnType<typeof coil>) =>
  ({ ...newPath(), conditions: conditions.map(group => (Array.isArray(group) ? group : [group])), load });
const ladderOf = (...paths: ReturnType<typeof rung>[]): LadderCircuit => ({ paths });
/** A bare scan loop for ladder-only tests. */
const scanner = (circuit: LadderCircuit) => {
  let state: LadderState = EMPTY_LADDER_STATE;
  return (sensors: Record<string, boolean> = {}, pressed: Record<string, boolean> = {}, dt = 0.05) => {
    const result = stepLadder(circuit, { sensors, pressed }, state, dt);
    state = result.state;
    return result;
  };
};

describe('P2.1 solenoid-operated directional valves (T101–T120; T121–T125 are the solenoid symbol tests)', () => {
  const t = section(101, 120);
  /** Source → valve (solenoid left, spring right) → gauge on port 2. */
  const gauged = (type: string, props: Record<string, unknown> = SOL_SPRING) =>
    engineOf([part('src', 'pressure-source'), part('v', type, props), part('g', 'pressure-gauge')], [['src:out', 'v:p1'], ['v:p2', 'g:p']]);
  const energised = (engine: FluidEngine, on: boolean, side: 'left' | 'right' = 'left') => { engine.setManual('v', side, on); return engine.step(0.1); };

  t('3/2 NC single solenoid: energised, 1 → 2 opens and the outlet carries 6 bar', () => {
    const engine = gauged('valve-3-2-nc');
    expect(bar(energised(engine, false), 'g:p')).toBe(0);
    expect(bar(energised(engine, true), 'g:p')).toBe(6);
    expect(engine.getSnapshot().valves.v.position).toBe(1);
  });
  t('3/2 NC single solenoid: de-energised, the spring returns the spool and the outlet vents through 3', () => {
    const engine = gauged('valve-3-2-nc');
    energised(engine, true);
    const snapshot = energised(engine, false);
    expect(bar(snapshot, 'g:p')).toBe(0);
    expect(snapshot.valves.v.position).toBe(0);
    expect(bar(snapshot, 'v:p3')).toBe(0);
  });
  t('3/2 NO single solenoid: passes 6 bar at rest and vents the outlet when energised', () => {
    const engine = gauged('valve-3-2-no');
    expect(bar(energised(engine, false), 'g:p')).toBe(6);
    expect(bar(energised(engine, true), 'g:p')).toBe(0);
  });
  t('2/2 NC solenoid valve: shut at rest, open while energised', () => {
    const engine = gauged('valve-2-2-nc');
    expect(bar(energised(engine, false), 'g:p')).toBe(0);
    expect(bar(energised(engine, true), 'g:p')).toBe(6);
  });
  t('2/2 NO solenoid valve: open at rest, shut while energised (the closed port isolates the outlet and traps its 6 bar)', () => {
    const engine = gauged('valve-2-2-no');
    expect(bar(energised(engine, false), 'g:p')).toBe(6);
    const closed = energised(engine, true);
    expect(closed.valves.v.position).toBe(1);
    // isolated: a supply drop upstream no longer reaches the trapped outlet line ...
    const lowered = engineOf([part('src', 'pressure-source', { pressure: 2 }), part('v', 'valve-2-2-no', SOL_SPRING), part('g', 'pressure-gauge')], [['src:out', 'v:p1'], ['v:p2', 'g:p']]);
    lowered.setManual('v', 'left', true);
    expect(bar(lowered.step(0.1), 'g:p')).toBe(0);
    expect(bar(closed, 'g:p')).toBe(6);
    // ... and de-energising reconnects it
    expect(bar(energised(engine, false), 'g:p')).toBe(6);
  });
  t('3/2 solenoid + single-acting cylinder: energising extends the rod against the spring', () => {
    const engine = engineOf([part('src', 'pressure-source'), part('v', 'valve-3-2-nc', SOL_SPRING), part('cyl', 'cylinder-single')], [['src:out', 'v:p1'], ['v:p2', 'cyl:a']]);
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
  });
  t('3/2 solenoid + single-acting cylinder: dropping the coil retracts the rod (monostable spring return)', () => {
    const engine = engineOf([part('src', 'pressure-source'), part('v', 'valve-3-2-nc', SOL_SPRING), part('cyl', 'cylinder-single')], [['src:out', 'v:p1'], ['v:p2', 'cyl:a']]);
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    engine.step(2);
    expect(stroke(engine)).toBe(0);
  });
  t('5/2 single solenoid: energised, 1 → 4 pressurises the rear chamber and 2 → 3 exhausts the rod side', () => {
    const engine = doubleCircuit({}, SOL_SPRING);
    engine.setManual('v', 'left', true);
    const snapshot = engine.step(2);
    expect(bar(snapshot, 'cyl:a')).toBe(6);
    expect(bar(snapshot, 'cyl:b')).toBe(0);
    expect(stroke(engine)).toBe(1);
  });
  t('5/2 single solenoid: de-energised, 1 → 2 reverses the flow and the cylinder retracts', () => {
    const engine = doubleCircuit({}, SOL_SPRING);
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'cyl:b')).toBe(6);
    expect(bar(snapshot, 'cyl:a')).toBe(0);
    expect(stroke(engine)).toBe(0);
  });
  t('a spring-return solenoid valve is monostable: its state carries no memory flag', () => {
    expect(doubleCircuit({}, SOL_SPRING).getSnapshot().valves.v.latched).toBe(false);
  });
  t('a double-solenoid valve is bistable: its state carries the memory flag', () => {
    expect(doubleCircuit({}, SOL2).getSnapshot().valves.v.latched).toBe(true);
  });
  t('double solenoid 5/2 memory: a short pulse on 1Y1 extends the cylinder and the position persists after the coil drops', () => {
    const engine = doubleCircuit({}, SOL2);
    startPulse(engine, 'v', 'left');
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    expect(engine.getSnapshot().valves.v.position).toBe(1);
    engine.step(5);
    expect(stroke(engine)).toBe(1);
  });
  t('double solenoid 5/2 memory: a pulse on 1Y2 reverses it and that position persists too', () => {
    const engine = doubleCircuit({}, SOL2);
    startPulse(engine, 'v', 'left');
    engine.step(2);
    startPulse(engine, 'v', 'right');
    engine.step(3);
    expect(engine.getSnapshot().valves.v.position).toBe(0);
    expect(stroke(engine)).toBe(0);
  });
  t('double solenoid 5/2 with both coils energised keeps its last position (no switching on a signal overlap)', () => {
    const engine = doubleCircuit({}, SOL2);
    startPulse(engine, 'v', 'left');
    engine.step(2);
    engine.setManual('v', 'left', true);
    engine.setManual('v', 'right', true);
    engine.step(2);
    expect(engine.getSnapshot().valves.v.position).toBe(1);
    expect(stroke(engine)).toBe(1);
  });
  t('valve initial state "Actuated position": a bistable valve starts and stays on the solenoid side, a spring-return one falls back to its spring on the first tick', () => {
    const build = (props: Record<string, unknown>) => engineOf([part('src', 'pressure-source'), part('v', 'valve-5-2', { ...props, initialState: 'Actuated position' }), part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    const bistable = build(SOL2);
    expect(bistable.getSnapshot().valves.v.position).toBe(1);
    expect(bistable.step(2).cylinders.cyl.stroke).toBe(1);
    const spring = build(SOL_SPRING);
    expect(spring.getSnapshot().valves.v.position).toBe(1);
    expect(spring.step(0.1).valves.v.position).toBe(0);
    expect(spring.step(2).cylinders.cyl.stroke).toBe(0);
  });
  t('4/2 solenoid valve routes P → B at rest and P → A when energised', () => {
    const engine = engineOf([part('src', 'pressure-source'), part('v', 'valve-4-2', SOL_SPRING)], [['src:out', 'v:p1']]);
    const rest = engine.step(0.1);
    expect([bar(rest, 'v:p2'), bar(rest, 'v:p4')]).toEqual([6, 0]);
    engine.setManual('v', 'left', true);
    const active = engine.step(0.1);
    expect([bar(active, 'v:p2'), bar(active, 'v:p4')]).toEqual([0, 6]);
  });
  t('5/3 closed-centre solenoid valve: de-energised mid-stroke, the cylinder locks (both chambers trapped)', () => {
    const engine = doubleCircuit({}, SOL2);
    const swap = engineOf([part('src', 'pressure-source'), part('v', 'valve-5-3', SOL2), part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    expect(engine.getSnapshot().valves.v.latched).toBe(true);
    swap.setManual('v', 'left', true);
    swap.step(0.2);
    const midway = stroke(swap);
    expect(midway).toBeGreaterThan(0.1);
    expect(midway).toBeLessThan(0.9);
    swap.setManual('v', 'left', false);
    swap.step(5);
    expect(swap.getSnapshot().valves.v.position).toBe(2);
    expect(stroke(swap)).toBeCloseTo(midway, 2);
    expect(swap.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('5/3 solenoid valve: 1Y1 alone drives the cylinder out to the cap', () => {
    const engine = engineOf([part('src', 'pressure-source'), part('v', 'valve-5-3', SOL2), part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    expect(engine.getSnapshot().valves.v.position).toBe(1);
  });
  t('5/3 solenoid valve: 1Y2 alone drives it back, and with the coil released it centres again', () => {
    const engine = engineOf([part('src', 'pressure-source'), part('v', 'valve-5-3', SOL2), part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    engine.setManual('v', 'left', true);
    engine.step(2);
    engine.setManual('v', 'left', false);
    engine.setManual('v', 'right', true);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(engine.getSnapshot().valves.v.position).toBe(0);
    engine.setManual('v', 'right', false);
    engine.step(0.1);
    expect(engine.getSnapshot().valves.v.position).toBe(2);
  });
  t('5/3 solenoid valve with both coils energised returns to the closed centre (opposing operators cancel)', () => {
    const engine = engineOf([part('src', 'pressure-source'), part('v', 'valve-5-3', SOL2), part('cyl', 'cylinder-double')], [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    engine.setManual('v', 'left', true);
    engine.setManual('v', 'right', true);
    const snapshot = engine.step(1);
    expect(snapshot.valves.v.position).toBe(2);
    expect(snapshot.cylinders.cyl.stroke).toBe(0);
  });

  t.done();
});

describe('P2.2 relay control and self-holding logic (T126–T150)', () => {
  const t = section(126, 150);
  const holding = startStopExample();

  t('self-holding: S5 energises K1 and 1Y1, and both stay on after S5 is released', () => {
    const scan = scanner(holding);
    expect(scan({}, {}).solenoids['1y1']).toBeFalsy();
    const pressed = scan({}, { s5: true });
    expect(pressed.state.relays.k1).toBe(true);
    expect(pressed.solenoids['1y1']).toBe(true);
    const released = scan({}, {});
    expect(released.state.relays.k1).toBe(true);
    expect(released.solenoids['1y1']).toBe(true);
  });
  t('self-holding: the break contact of 1B2 drops K1 and the solenoid, and nothing re-energises them afterwards', () => {
    const scan = scanner(holding);
    scan({}, { s5: true });
    scan({}, {});
    const tripped = scan({ '1b2': true }, {});
    expect(tripped.state.relays.k1).toBe(false);
    expect(tripped.solenoids['1y1']).toBe(false);
    const after = scan({ '1b2': false }, {});
    expect(after.state.relays.k1).toBeFalsy();
    expect(after.solenoids['1y1']).toBeFalsy();
  });
  t('self-holding: the solenoid output equals the relay state on every scan of a start / stop / start sequence', () => {
    const scan = scanner(holding);
    const inputs: Array<[Record<string, boolean>, Record<string, boolean>]> = [[{}, {}], [{}, { s5: true }], [{}, {}], [{ '1b2': true }, {}], [{}, {}], [{}, { s5: true }], [{}, {}]];
    const seen = inputs.map(([sensors, pressed]) => { const r = scan(sensors, pressed); return [Boolean(r.state.relays.k1), Boolean(r.solenoids['1y1'])]; });
    for (const [relay, valve] of seen) expect(valve).toBe(relay);
    expect(seen.map(([relay]) => relay)).toEqual([false, true, true, false, false, true, true]);
  });
  t('dominant OFF: with START and STOP pressed together the holding relay stays released', () => {
    const circuit = ladderOf(rung([[buttonC('S1'), relayC('K1')], buttonC('S0', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, { s1: true }).state.relays.k1).toBe(true);
    expect(scan({}, { s1: true, s0: true }).state.relays.k1).toBe(false);
    expect(scan({}, {}).state.relays.k1).toBe(false);
  });
  t('dominant ON: with START and STOP pressed together the relay is on; once START is released STOP wins', () => {
    const circuit = ladderOf(rung([buttonC('S1')], coil('K1')), rung([relayC('K1'), buttonC('S0', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, { s1: true, s0: true }).solenoids['1y1']).toBe(true);
    expect(scan({}, { s0: true }).solenoids['1y1']).toBeFalsy();
    expect(scan({}, {}).solenoids['1y1']).toBeFalsy();
    scan({}, { s1: true });
    expect(scan({}, {}).solenoids['1y1']).toBe(true); // holds through the second path
  });
  t('E-stop (NC) in the holding circuit drops K1 and the solenoid in the very scan it is pressed', () => {
    const circuit = ladderOf(rung([[buttonC('S5'), relayC('K1')], buttonC('ES', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    scan({}, { s5: true });
    expect(scan({}, {}).solenoids['1y1']).toBe(true);
    const stopped = scan({}, { es: true });
    expect(stopped.state.relays.k1).toBe(false);
    expect(stopped.solenoids['1y1']).toBe(false);
    expect(scan({}, {}).solenoids['1y1']).toBeFalsy(); // releasing the E-stop does not restart the machine
  });

  /** Single-acting cylinder behind a 3/2 solenoid valve (1V1 → tag 1Y1), E-stop in the holding circuit. */
  const monostableRig = () => new Rig(
    [rigPart('src', 'pressure-source', '0Z1'), rigPart('v', 'valve-3-2-nc', '1V1', SOL_SPRING), rigPart('cyl', 'cylinder-single', '1A1')],
    [['src:out', 'v:p1'], ['v:p2', 'cyl:a']],
    ladderOf(rung([[buttonC('S5'), relayC('K1')], buttonC('ES', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1'))),
  );
  t('E-stop on a spring-return solenoid valve: the cylinder extends on START and retracts at once when the E-stop is pressed', () => {
    const rig = monostableRig();
    rig.push('S5', 0.1);
    rig.run(2);
    expect(rig.snapshot.cylinders.cyl.stroke).toBe(1);
    rig.press('ES');
    rig.run(0.2);
    expect(rig.snapshot.cylinders.cyl.velocity).toBeLessThan(0);
    rig.run(2);
    expect(rig.snapshot.cylinders.cyl.stroke).toBe(0);
  });
  t('E-stop on a double-solenoid valve: the coil drops but the bistable valve keeps its position, the rod stays out', () => {
    const rig = new Rig(
      [rigPart('src', 'pressure-source', '0Z1'), rigPart('v', 'valve-5-2', '1V1', SOL2), rigPart('cyl', 'cylinder-double', '1A1')],
      [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
      ladderOf(rung([[buttonC('S5'), relayC('K1')], buttonC('ES', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1'))),
    );
    rig.push('S5', 0.1);
    rig.run(2);
    rig.press('ES');
    rig.run(4);
    expect(rig.energised['1y1']).toBeFalsy();
    expect(rig.snapshot.cylinders.cyl.stroke).toBe(1);
  });
  t('E-stop on a 5/3 closed-centre valve freezes the cylinder mid-stroke with both chambers trapped', () => {
    const rig = new Rig(
      [rigPart('src', 'pressure-source', '0Z1'), rigPart('v', 'valve-5-3', '1V1', SOL2), rigPart('cyl', 'cylinder-double', '1A1')],
      [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
      ladderOf(rung([[buttonC('S5'), relayC('K1')], buttonC('ES', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1'))),
    );
    rig.push('S5', 0.1);
    rig.run(0.2);
    rig.press('ES');
    rig.run(0.1);
    const frozen = rig.snapshot.cylinders.cyl.stroke;
    expect(frozen).toBeGreaterThan(0.1);
    expect(frozen).toBeLessThan(0.9);
    rig.run(5);
    expect(rig.snapshot.cylinders.cyl.stroke).toBeCloseTo(frozen, 3);
    expect(rig.snapshot.valves.v.position).toBe(2);
  });

  t('on-delay timer: the contact closes exactly after the 2 s delay (open at 1.9 s, closed at 2.0 s)', () => {
    const circuit = ladderOf(rung([buttonC('S1')], timerCoil('KT1', 2)), rung([timerC('KT1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    let valve = false;
    for (let step = 1; step <= 19; step += 1) valve = Boolean(scan({}, { s1: true }, 0.1).solenoids['1y1']);
    expect(valve).toBe(false);
    expect(scan({}, { s1: true }, 0.1).solenoids['1y1']).toBe(true);
  });
  t('on-delay timer: releasing the input before the delay resets the count', () => {
    const circuit = ladderOf(rung([buttonC('S1')], timerCoil('KT1', 2)), rung([timerC('KT1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    for (let step = 0; step < 15; step += 1) scan({}, { s1: true }, 0.1);
    scan({}, {}, 0.1);
    for (let step = 0; step < 15; step += 1) expect(scan({}, { s1: true }, 0.1).solenoids['1y1']).toBeFalsy();
    expect(scan({}, { s1: true }, 0.6).solenoids['1y1']).toBe(true);
  });
  t('off-delay timer: the contact stays closed for 3 s after the input is released, then opens', () => {
    const circuit = ladderOf(rung([buttonC('S1')], timerCoil('KT1', 3, 'off')), rung([timerC('KT1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, { s1: true }, 0.1).solenoids['1y1']).toBe(true);
    for (let step = 0; step < 29; step += 1) expect(scan({}, {}, 0.1).solenoids['1y1']).toBe(true);
    expect(scan({}, {}, 0.2).solenoids['1y1']).toBe(false);
  });
  t('timer-controlled dwell: the NC timer contact switches the solenoid off 5 s after the cycle started', () => {
    const circuit = ladderOf(rung([relayC('K1')], timerCoil('KT1', 5)), rung([relayC('K1'), timerC('KT1', 'NC')], solenoid('1Y1')), rung([buttonC('S1')], coil('K1')));
    const scan = scanner(circuit);
    let on = 0;
    for (let step = 0; step < 80; step += 1) if (scan({}, { s1: true }, 0.1).solenoids['1y1']) on += 1;
    expect(on * 0.1).toBeCloseTo(5, 0);
  });

  t('relay chain: K1 energises K2 through its make contact and K2 drives the solenoid', () => {
    const circuit = ladderOf(rung([buttonC('S1')], coil('K1')), rung([relayC('K1')], coil('K2')), rung([relayC('K2')], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, {}).solenoids['1y1']).toBeFalsy();
    const on = scan({}, { s1: true });
    expect([on.state.relays.k1, on.state.relays.k2, on.solenoids['1y1']]).toEqual([true, true, true]);
  });
  t('relay break contact (NC): the solenoid is on while K1 is released and off while it is energised', () => {
    const circuit = ladderOf(rung([buttonC('S1')], coil('K1')), rung([relayC('K1', 'NC')], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, {}).solenoids['1y1']).toBe(true);
    expect(scan({}, { s1: true }).solenoids['1y1']).toBe(false);
  });
  t('parallel contacts act as OR: either pushbutton energises the solenoid', () => {
    const circuit = ladderOf(rung([[buttonC('S1'), buttonC('S2')]], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, { s1: true }).solenoids['1y1']).toBe(true);
    expect(scan({}, { s2: true }).solenoids['1y1']).toBe(true);
    expect(scan({}, {}).solenoids['1y1']).toBeFalsy();
  });
  t('series contacts act as AND: both limit switches must be made', () => {
    const circuit = ladderOf(rung([sensorC('1B2'), sensorC('2B2')], solenoid('2Y1')));
    const scan = scanner(circuit);
    expect(scan({ '1b2': true }).solenoids['2y1']).toBeFalsy();
    expect(scan({ '2b2': true }).solenoids['2y1']).toBeFalsy();
    expect(scan({ '1b2': true, '2b2': true }).solenoids['2y1']).toBe(true);
  });
  t('two rungs sharing one solenoid tag OR together', () => {
    const circuit = ladderOf(rung([buttonC('S1')], solenoid('1Y1')), rung([sensorC('1B2')], solenoid('1Y1')));
    const scan = scanner(circuit);
    expect(scan({}, { s1: true }).solenoids['1y1']).toBe(true);
    expect(scan({ '1b2': true }, {}).solenoids['1y1']).toBe(true);
    expect(scan({}, {}).solenoids['1y1']).toBeFalsy();
  });
  t('cross-reference table lists the paths using the make and break contacts of K1', () => {
    const circuit = ladderOf(rung([[buttonC('S5'), relayC('K1')], sensorC('1B2', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1')), rung([relayC('K1', 'NC')], solenoid('1Y2')));
    expect(crossReferences(circuit)).toEqual([{ pathNumber: 1, tag: 'K1', no: [1, 2], nc: [3] }]);
  });
  t('a saved ladder is sanitised: a malformed file gives an empty circuit and bad elements are dropped, valid ones kept', () => {
    expect(sanitizeLadder('nonsense').paths).toEqual([]);
    expect(sanitizeLadder({ paths: 7 }).paths).toEqual([]);
    const good = makeElement('sensor', '1B2');
    const cleaned = sanitizeLadder({ paths: [{ id: 'p1', conditions: [[good, { kind: 'solenoid', id: 'x', tag: '1Y1' }, { nope: true }]], load: { id: 'l', kind: 'solenoid', tag: '1Y1' } }, { conditions: [] }] });
    expect(cleaned.paths).toHaveLength(1);
    expect(cleaned.paths[0].conditions).toEqual([[good]]);
    expect(cleaned.paths[0].load?.tag).toBe('1Y1');
  });
  t('a relay that interrupts its own coil (buzzer) cannot hang the scan: one state change per scan, no exception', () => {
    const circuit = ladderOf(rung([relayC('K1', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    const states = Array.from({ length: 6 }, () => Boolean(scan().state.relays.k1));
    expect(states.some(Boolean)).toBe(true);
    expect(states.some(state => !state)).toBe(true);
  });
  t('idle ladder: with every input open no relay, timer or solenoid is energised', () => {
    const idle = idleLadder(holding);
    expect(idle.solenoids['1y1']).toBeFalsy();
    expect(Object.values(idle.state.relays).every(on => !on)).toBe(true);
    expect(idleLadder(ladderOf(rung([sensorC('1B1')], solenoid('1Y1'))), { sensors: { '1b1': true }, pressed: {} }).solenoids['1y1']).toBe(true);
  });
  t('a contact whose relay has no coil anywhere never closes', () => {
    const circuit = ladderOf(rung([relayC('K9')], solenoid('1Y1')), rung([relayC('K9', 'NC')], solenoid('1Y2')));
    const scan = scanner(circuit);
    const result = scan({}, { k9: true });
    expect(result.solenoids['1y1']).toBeFalsy();
    expect(result.solenoids['1y2']).toBe(true);
  });
  t('solenoid-to-valve coupling matches tags case-insensitively and with $ decoration stripped', () => {
    const parts = [rigPart('v', 'valve-5-2', '1V1', SOL2)];
    const tags = assignSignalTags(parts);
    const targets = solenoidTargets(parts, tags, listSensorOptions(parts));
    expect(targets.map(target => [target.tag, target.side])).toEqual([['1Y1', 'left'], ['1Y2', 'right']]);
    expect(solenoidDrive(targets, { '1y1': true })).toEqual({ 'v:left': true, 'v:right': false });
    expect(solenoidDrive(targets, { '1y2': true })).toEqual({ 'v:left': false, 'v:right': true });
  });
  t('a zero-length scan counts no time: timers do not advance and the contact stays open', () => {
    const circuit = ladderOf(rung([buttonC('S1')], timerCoil('KT1', 1)), rung([timerC('KT1')], solenoid('1Y1')));
    const scan = scanner(circuit);
    for (let step = 0; step < 50; step += 1) expect(scan({}, { s1: true }, 0).solenoids['1y1']).toBeFalsy();
    expect(scan({}, { s1: true }, 1).solenoids['1y1']).toBe(true);
  });

  t.done();
});

describe('P2.3 electronic proximity and reed sensors (T151–T170)', () => {
  const t = section(151, 170);
  const settledAt = (x: number, strokeMm: number) => {
    const engine = singleCircuit(SPRING_PRELOAD_BAR + SPRING_RATE_BAR * x, { stroke: strokeMm });
    engine.setManual('v', 'left', true);
    engine.step(40);
    return engine;
  };
  const made = (engine: FluidEngine) => ({ s1: engine.getSnapshot().sensors['cyl:S1'], s2: engine.getSnapshot().sensors['cyl:S2'] });
  for (const length of [50, 100, 200, 400]) {
    const window = 3 / length;
    t(`reed switch 1B2 on a ${length} mm stroke closes within 3 mm of the front cap (window ${(window * 100).toFixed(2)} % of stroke)`, () => {
      expect(made(settledAt(1 - window * 0.6, length))).toEqual({ s1: false, s2: true });
    });
    t(`reed switch 1B2 on a ${length} mm stroke stays open 3 windows from the cap`, () => {
      expect(made(settledAt(1 - 3 * window, length)).s2).toBe(false);
    });
    t(`reed switch 1B1 on a ${length} mm stroke is made within 3 mm of the rear cap`, () => {
      expect(made(settledAt(window * 0.6, length))).toEqual({ s1: true, s2: false });
    });
    t(`reed switch 1B1 on a ${length} mm stroke has released 3 windows away`, () => {
      expect(made(settledAt(3 * window, length)).s1).toBe(false);
    });
  }
  t('limit-switch tags follow ISO naming: cylinder 1A1 owns 1B1 (retracted) and 1B2 (extended), 2A1 owns 2B1 / 2B2', () => {
    const parts = [rigPart('a', 'cylinder-double', '1A1'), rigPart('b', 'cylinder-double', '2A1')];
    const options = listSensorOptions(parts, assignSignalTags(parts).sensors);
    expect(options.map(option => [option.tag, option.value, option.end])).toEqual([['1B1', 'a:S1', 'retracted'], ['1B2', 'a:S2', 'extended'], ['2B1', 'b:S1', 'retracted'], ['2B2', 'b:S2', 'extended']]);
    const engine = engineOf([part('a', 'cylinder-double')]);
    expect(sensorSignals(options, { 'a:S1': true, 'a:S2': false, 'b:S1': false, 'b:S2': true })).toEqual({ '1b1': true, '1b2': false, '2b1': false, '2b2': true });
    expect(Object.keys(engine.getSnapshot().sensors)).toEqual(['a:S1', 'a:S2']);
  });
  t('reed switch on a pilot-operated valve end injects pilot pressure while the piston sits at the cap: the cylinder reverses by itself', () => {
    const engine = engineOf(
      [part('src', 'pressure-source'), part('v', 'valve-5-2', { actuationLeft: 'Pushbutton', actuationRight: 'Pneumatic Pilot', rightSensor: 'cyl:S2' }), part('cyl', 'cylinder-double')],
      [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
    );
    expect(sensorLinksOf(engine['network'].components[1])).toEqual([{ sensorId: 'cyl:S2', componentId: 'v', portId: 'pilotR' }]);
    startPulse(engine, 'v');
    let pilot = 0;
    for (let tick = 0; tick < 300; tick += 1) pilot = Math.max(pilot, bar(engine.step(DT), 'v:pilotR'));
    expect(pilot).toBe(6);
    expect(stroke(engine)).toBe(0);
    expect(engine.getSnapshot().sensors['cyl:S1']).toBe(true);
  });
  t('inductive proximity feeding a relay coil: K2 follows 1B2 while the rod is out and drops when it retracts', () => {
    const rig = new Rig(
      [rigPart('src', 'pressure-source', '0Z1'), rigPart('v', 'valve-5-2', '1V1', SOL_SPRING), rigPart('cyl', 'cylinder-double', '1A1')],
      [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
      ladderOf(rung([buttonC('S1')], solenoid('1Y1')), rung([sensorC('1B2')], coil('K2'))),
    );
    rig.run(0.5);
    expect(rig.ladder.relays.k2).toBeFalsy();
    rig.press('S1');
    rig.run(2);
    expect(rig.ladder.relays.k2).toBe(true);
    rig.press('S1', false);
    rig.run(2);
    expect(rig.ladder.relays.k2).toBe(false);
  });
  t('capacitive and inductive sensors on two cylinders in one parallel group: either one energises the relay', () => {
    const parts = [rigPart('src', 'pressure-source', '0Z1'), rigPart('va', 'valve-5-2', '1V1', SOL_SPRING), rigPart('vb', 'valve-5-2', '2V1', SOL_SPRING), rigPart('a', 'cylinder-double', '1A1'), rigPart('b', 'cylinder-double', '2A1')];
    const pipes: Pipes = [['src:out', 'va:p1'], ['src:out', 'vb:p1'], ['va:p4', 'a:a'], ['va:p2', 'a:b'], ['vb:p4', 'b:a'], ['vb:p2', 'b:b']];
    const circuit = ladderOf(rung([buttonC('S1')], solenoid('1Y1')), rung([buttonC('S2')], solenoid('2Y1')), rung([[sensorC('1B2'), sensorC('2B2')]], coil('K3')));
    const rig = new Rig(parts, pipes, circuit);
    rig.run(0.2);
    expect(rig.ladder.relays.k3).toBeFalsy();
    rig.press('S2');
    rig.run(2);
    expect(rig.ladder.relays.k3).toBe(true);
    rig.press('S2', false);
    rig.run(2);
    expect(rig.ladder.relays.k3).toBeFalsy();
    rig.press('S1');
    rig.run(2);
    expect(rig.ladder.relays.k3).toBe(true);
  });

  t.done();
});

describe('P2.4 automated multi-step industrial sequences (T171–T200)', () => {
  const t = section(171, 200);

  /** Two double-acting cylinders 1A1 / 2A1 on bistable 5/2 solenoid valves 1V1 (1Y1 out, 1Y2 in) and 2V1 (2Y1 out, 2Y2 in). */
  const epRig = (circuit: LadderCircuit, strokeA = 100, strokeB = 100) => new Rig(
    [
      rigPart('src', 'pressure-source', '0Z1'),
      rigPart('vA', 'valve-5-2', '1V1', SOL2), rigPart('vB', 'valve-5-2', '2V1', SOL2),
      rigPart('a', 'cylinder-double', '1A1', { stroke: strokeA }), rigPart('b', 'cylinder-double', '2A1', { stroke: strokeB }),
    ],
    [['src:out', 'vA:p1'], ['src:out', 'vB:p1'], ['vA:p4', 'a:a'], ['vA:p2', 'a:b'], ['vB:p4', 'b:a'], ['vB:p2', 'b:b']],
    circuit,
  );
  /** A+ B+ A− B−: 1Y1 = START·2B1, 2Y1 = 1B2, 1Y2 = 2B2, 2Y2 = 1B1. */
  const abab = ladderOf(
    rung([buttonC('S1'), sensorC('2B1')], solenoid('1Y1')), rung([sensorC('1B2')], solenoid('2Y1')),
    rung([sensorC('2B2')], solenoid('1Y2')), rung([sensorC('1B1')], solenoid('2Y2')),
  );
  /** A+ B+ B− A−: a relay K1 remembers that B has been out so B+ is not repeated; 1Y2 waits for B to be home again. */
  const abba = ladderOf(
    rung([buttonC('S1'), sensorC('1B1'), sensorC('2B1')], solenoid('1Y1')),
    rung([sensorC('1B2'), sensorC('2B1'), relayC('K1', 'NC')], solenoid('2Y1')),
    rung([sensorC('2B2')], solenoid('2Y2')),
    rung([relayC('K1'), sensorC('2B1')], solenoid('1Y2')),
    rung([sensorC('2B2')], coil('K1')), rung([relayC('K1'), sensorC('1B1', 'NC')], coil('K1')),
  );
  /** A+ A− B+ B−: K1 remembers that A has been out, so A+ is not repeated before B has run. */
  const aabb = ladderOf(
    rung([buttonC('S1'), sensorC('1B1'), sensorC('2B1'), relayC('K1', 'NC')], solenoid('1Y1')),
    rung([sensorC('1B2')], solenoid('1Y2')),
    rung([relayC('K1'), sensorC('1B1'), sensorC('2B1')], solenoid('2Y1')),
    rung([sensorC('2B2')], solenoid('2Y2')),
    rung([sensorC('1B2')], coil('K1')), rung([relayC('K1'), sensorC('2B2', 'NC')], coil('K1')),
  );
  const runCycle = (rig: Rig, seconds = 12) => { rig.run(0.3); rig.push('S1', 0.2); rig.run(seconds); return rig; };

  t('A+ B+ A− B− (relay cascade): the four steps run in order from a single START pulse', () => {
    const rig = runCycle(epRig(abab));
    expect(movesOf(rig.tracker)).toEqual([['a+'], ['b+'], ['a-'], ['b-']]);
    expect(rig.tracker.cycleLength).toBe(4);
    expect(rig.sensor('a', 'S1') && rig.sensor('b', 'S1')).toBe(true);
  });
  t('A+ B+ A− B−: the displacement-step diagram extracts the textbook ramps', () => {
    const view = cycleView(runCycle(epRig(abab)).tracker);
    expect(view.labels).toEqual([1, 2, 3, 4, 1]);
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 0], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 0]]);
  });
  t('A+ B+ A− B−: timing table, every stroke takes 0.45 – 1.0 s and each step starts when the previous one ends', () => {
    const { steps } = runCycle(epRig(abab)).tracker;
    expect(steps).toHaveLength(4);
    steps.forEach((step, index) => {
      const move = step.moves[0];
      expect(move.end! - move.start).toBeGreaterThan(0.45);
      expect(move.end! - move.start).toBeLessThan(1);
      if (index > 0) expect(step.start - steps[index - 1].moves[0].end!).toBeLessThan(0.1);
    });
  });
  t('A+ B+ A− B−: limit-switch marks and signal links read 1B2 → 2A+, 2B2 → 1A−, 1B1 → 2A−', () => {
    const view = cycleView(runCycle(epRig(abab)).tracker);
    expect(sensorMarks(view).map(mark => `${mark.cylinderId}:${mark.end}`)).toEqual(['a:extended', 'b:extended', 'a:retracted', 'b:retracted']);
    expect(signalLinks(view).map(link => `${link.from.cylinderId}${link.from.level}>${link.to.cylinderId}`)).toEqual(['a1>b', 'b1>a', 'a0>b']);
  });
  t('A+ B+ B− A− (relay memory): the four steps run in order', () => {
    const rig = runCycle(epRig(abba));
    expect(movesOf(rig.tracker)).toEqual([['a+'], ['b+'], ['b-'], ['a-']]);
    expect(rig.tracker.cycleLength).toBe(4);
  });
  t('A+ B+ B− A−: displacement-step ramps (A out for steps 2 – 3, B out for step 2 only)', () => {
    const view = cycleView(runCycle(epRig(abba)).tracker);
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 0], [4, 0]]);
  });
  t('A+ B+ B− A−: timing table, strictly increasing step starts and B+ begins only after A has arrived', () => {
    const { steps } = runCycle(epRig(abba)).tracker;
    const starts = steps.map(step => step.start);
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);
    expect(steps[1].moves[0].start).toBeGreaterThanOrEqual(steps[0].moves[0].end!);
    expect(steps[3].moves[0].start).toBeGreaterThanOrEqual(steps[2].moves[0].end!);
  });
  t('A+ B+ B− A−: limit-switch marks (A extended, B extended, B retracted, A retracted)', () => {
    expect(sensorMarks(cycleView(runCycle(epRig(abba)).tracker)).map(mark => `${mark.cylinderId}:${mark.end}`)).toEqual(['a:extended', 'b:extended', 'b:retracted', 'a:retracted']);
  });
  t('A+ A− B+ B− (relay memory): the four steps run in order even though the circuit passes through its starting state after step 2', () => {
    const rig = runCycle(epRig(aabb));
    expect(movesOf(rig.tracker)).toEqual([['a+'], ['a-'], ['b+'], ['b-']]);
    expect(rig.tracker.cycleLength).toBe(4);
  });
  t('A+ A− B+ B−: displacement-step ramps (A out for step 1 only, B out for step 3 only)', () => {
    const view = cycleView(runCycle(epRig(aabb)).tracker);
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 0], [3, 0], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 0], [3, 1], [4, 0]]);
  });
  t('A+ A− B+ B−: timing table, A returns the moment it arrives and B waits for A to be home', () => {
    const { steps } = runCycle(epRig(aabb)).tracker;
    expect(steps[1].moves[0].start - steps[0].moves[0].end!).toBeLessThan(0.1);
    expect(steps[2].moves[0].start).toBeGreaterThanOrEqual(steps[1].moves[0].end!);
    expect(steps[3].moves[0].start).toBeGreaterThanOrEqual(steps[2].moves[0].end!);
  });
  t('A+ A− B+ B−: limit-switch marks (A extended, A retracted, B extended, B retracted)', () => {
    expect(sensorMarks(cycleView(runCycle(epRig(aabb)).tracker)).map(mark => `${mark.cylinderId}:${mark.end}`)).toEqual(['a:extended', 'a:retracted', 'b:extended', 'b:retracted']);
  });
  t('all three sequences close their first cycle at exactly four steps with four columns', () => {
    for (const circuit of [abab, abba, aabb]) {
      const view = cycleView(runCycle(epRig(circuit)).tracker);
      expect([view.complete, view.columns, view.steps.length]).toEqual([true, 4, 4]);
    }
  });
  t('continuous operation: holding START repeats the cycle; every later loop reproduces the frozen first cycle', () => {
    const rig = epRig(abab);
    rig.run(0.3);
    rig.press('S1');
    rig.run(14);
    const view = cycleView(rig.tracker);
    expect(view.cycleNumber).toBeGreaterThanOrEqual(3);
    expect(view.steps).toHaveLength(4);
    expect(rig.tracker.cycleLength).toBe(4);
    expect(displacementTrace(view, 'a').slice(0, 5)).toEqual([[0, 0], [1, 1], [2, 1], [3, 0], [4, 0]]);
  });
  t('cycle repetition limit: START released during the 3rd cycle finishes exactly 3 cycles (12 steps) and stops', () => {
    const rig = epRig(abab);
    rig.run(0.3);
    rig.press('S1');
    while (rig.tracker.stepNumber < 9 && rig.snapshot.time < 60) rig.tick();
    rig.press('S1', false);
    rig.run(10);
    expect(rig.tracker.stepNumber).toBe(12);
    expect(cycleView(rig.tracker).cycleNumber).toBe(3);
    const frozen = rig.snapshot.cylinders.a.stroke + rig.snapshot.cylinders.b.stroke;
    rig.run(5);
    expect(rig.tracker.stepNumber).toBe(12);
    expect(frozen).toBe(0);
  });
  /** Holds START for `seconds` and records the simulation time at which each running step number was first seen. */
  const stepClock = (rig: Rig, seconds: number) => {
    const seen = new Map<number, number>();
    rig.run(0.3);
    rig.press('S1');
    rig.run(seconds, snapshot => { if (!seen.has(rig.tracker.stepNumber)) seen.set(rig.tracker.stepNumber, snapshot.time); });
    return seen;
  };
  t('step counter: the running count advances one step at a time, 1, 2, 3 … with no skips, and passes 12 in a 25 s continuous run', () => {
    const seen = stepClock(epRig(abab), 25);
    const numbers = Array.from(seen.keys()).filter(number => number > 0);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(12);
  });
  t('no START, no motion: five idle seconds leave both cylinders home and the diagram empty', () => {
    const rig = epRig(abab);
    rig.run(5);
    expect(rig.tracker.steps).toEqual([]);
    expect([rig.snapshot.cylinders.a.stroke, rig.snapshot.cylinders.b.stroke]).toEqual([0, 0]);
    expect(rig.energised['1y1']).toBeFalsy();
  });
  t('E-stop mid-sequence halts the cascade: the move in progress finishes, no further step is started', () => {
    const guarded = ladderOf(
      rung([buttonC('S1'), sensorC('2B1')], solenoid('1Y1')), rung([sensorC('1B2'), buttonC('ES', 'NC')], solenoid('2Y1')),
      rung([sensorC('2B2'), buttonC('ES', 'NC')], solenoid('1Y2')), rung([sensorC('1B1'), buttonC('ES', 'NC')], solenoid('2Y2')),
    );
    const rig = epRig(guarded);
    rig.run(0.3);
    rig.press('S1');
    rig.run(0.2);
    rig.press('ES');
    rig.press('S1', false);
    rig.run(8);
    expect(movesOf(rig.tracker)).toEqual([['a+']]);
    expect(rig.snapshot.cylinders.a.stroke).toBe(1);
    expect(rig.snapshot.cylinders.b.stroke).toBe(0);
  });
  t('power loss on bistable valves: with every coil dropped the cylinders hold their last position (A stays extended)', () => {
    const rig = epRig(abab);
    rig.run(0.3);
    rig.press('S1');
    rig.run(0.3);
    rig.circuit = ladderOf();
    rig.press('S1', false);
    rig.run(6);
    expect(rig.snapshot.cylinders.a.stroke).toBe(1);
    expect(rig.snapshot.cylinders.b.stroke).toBe(0);
  });
  for (const dwell of [1, 2, 4]) {
    t(`dwell timer: A+ holds at the cap for ${dwell} s (on-delay timer KT1) before A−`, () => {
      const circuit = ladderOf(
        rung([buttonC('S1'), sensorC('1B1')], solenoid('1Y1')), rung([sensorC('1B2')], timerCoil('KT1', dwell)), rung([timerC('KT1')], solenoid('1Y2')),
      );
      const rig = new Rig(
        [rigPart('src', 'pressure-source', '0Z1'), rigPart('vA', 'valve-5-2', '1V1', SOL2), rigPart('a', 'cylinder-double', '1A1')],
        [['src:out', 'vA:p1'], ['vA:p4', 'a:a'], ['vA:p2', 'a:b']],
        circuit,
      );
      rig.run(0.3);
      rig.push('S1', 0.2);
      rig.run(dwell + 4);
      const [out, back] = rig.tracker.steps.map(step => step.moves[0]);
      expect(back.start - out.end!).toBeGreaterThan(dwell - 0.1);
      expect(back.start - out.end!).toBeLessThan(dwell + 0.2);
    });
  }
  t('simultaneous motion: A+ and B+ start together (one step with two moves), A− and B− follow together', () => {
    const circuit = ladderOf(
      rung([buttonC('S1'), sensorC('1B1'), sensorC('2B1')], solenoid('1Y1')), rung([buttonC('S1'), sensorC('1B1'), sensorC('2B1')], solenoid('2Y1')),
      rung([sensorC('1B2'), sensorC('2B2')], solenoid('1Y2')), rung([sensorC('1B2'), sensorC('2B2')], solenoid('2Y2')),
    );
    const rig = runCycle(epRig(circuit, 100, 150));
    expect(movesOf(rig.tracker)).toEqual([['a+', 'b+'], ['a-', 'b-']]);
    expect(rig.tracker.cycleLength).toBe(2);
    expect(cycleView(rig.tracker).labels).toEqual([1, 2, 1]);
  });
  t('electrical interlock: across three continuous cycles no valve ever has both its coils energised in the same scan', () => {
    for (const circuit of [abab, abba, aabb]) {
      const rig = epRig(circuit);
      rig.run(0.3);
      rig.press('S1');
      let overlaps = 0;
      let steps = 0;
      rig.run(20, () => {
        steps += 1;
        if ((rig.energised['1y1'] && rig.energised['1y2']) || (rig.energised['2y1'] && rig.energised['2y2'])) overlaps += 1;
      });
      expect(steps).toBeGreaterThan(1000);
      expect(overlaps).toBe(0);
      expect(rig.tracker.stepNumber).toBeGreaterThanOrEqual(8);
    }
  });
  t('sensor failure, 1B2 stuck open: the sequence stalls after A+ although the rod is at the cap, B never starts', () => {
    const rig = epRig(abab);
    rig.stuck['1B2'] = false;
    rig.run(0.3);
    rig.push('S1', 0.2);
    rig.run(8);
    expect(rig.snapshot.cylinders.a.stroke).toBe(1);
    expect(rig.snapshot.sensors['a:S2']).toBe(true);
    expect(rig.snapshot.cylinders.b.stroke).toBe(0);
    expect(movesOf(rig.tracker)).toEqual([['a+']]);
  });
  t('sensor failure, 2B2 stuck made: 1Y1 and 1Y2 overlap, the valve keeps its position and the machine never starts', () => {
    const rig = epRig(abab);
    rig.stuck['2B2'] = true;
    rig.run(0.3);
    rig.push('S1', 0.2);
    rig.run(5);
    expect(rig.energised['1y1']).toBe(false); // 2B1 is not stuck, START was released
    expect(rig.snapshot.cylinders.a.stroke).toBe(0);
    expect(rig.snapshot.valves.vA.position).toBe(0);
    const held = epRig(abab);
    held.stuck['2B2'] = true;
    held.run(0.3);
    held.press('S1');
    held.run(5);
    expect(held.energised['1y1'] && held.energised['1y2']).toBe(true);
    expect(held.snapshot.cylinders.a.stroke).toBe(0);
  });
  t('solenoid tag mismatch: a ladder that drives 9Y9 instead of 1Y1 couples to no valve and nothing moves', () => {
    const rig = epRig(ladderOf(rung([buttonC('S1')], solenoid('9Y9'))));
    rig.run(0.3);
    rig.press('S1');
    rig.run(4);
    expect(rig.energised['9y9']).toBe(true);
    expect(rig.snapshot.cylinders.a.stroke).toBe(0);
    expect(rig.snapshot.valves.vA.position).toBe(0);
  });
  t('reset: the engine returns both cylinders home and a fresh tracker records the identical cycle again', () => {
    const rig = epRig(abab);
    runCycle(rig);
    const first = cycleView(rig.tracker).steps;
    rig.press('S1', false);
    rig.engine.reset();
    rig.ladder = EMPTY_LADDER_STATE;
    rig.tracker = emptyTracker();
    expect(rig.engine.getSnapshot().cylinders.a.stroke).toBe(0);
    expect(rig.engine.getSnapshot().time).toBe(0);
    runCycle(rig);
    expect(cycleView(rig.tracker).steps.map(step => step.moves.map(move => [move.cylinderId, move.direction]))).toEqual(first.map(step => step.moves.map(move => [move.cylinderId, move.direction])));
    expect(rig.tracker.cycleLength).toBe(4);
  });
  t('cycle time is reproducible: loops 1, 2 and 3 of a continuous run (steps 1, 5, 9) have the same period (±3 %)', () => {
    const seen = stepClock(epRig(abab), 25);
    const [s1, s5, s9, s13] = [1, 5, 9, 13].map(step => seen.get(step)!);
    expect([s1, s5, s9, s13].every(Number.isFinite)).toBe(true);
    const first = s5 - s1;
    for (const period of [s9 - s5, s13 - s9]) expect(Math.abs(period - first)).toBeLessThan(0.03 * first);
    expect(first).toBeGreaterThan(2);
  });
  t('stroke length sets the motion time: a 200 mm cylinder needs twice as long for A+ as a 100 mm one (±10 %)', () => {
    const duration = (strokeA: number) => {
      const rig = runCycle(epRig(abab, strokeA), 20);
      const move = rig.tracker.steps[0].moves[0];
      return move.end! - move.start;
    };
    expect(duration(200) / duration(100)).toBeGreaterThan(1.8);
    expect(duration(200) / duration(100)).toBeLessThan(2.2);
  });

  t.done();
});

/* ═════════════════════════ PARTITION 3 — PURE HYDRAULICS (T201–T300) ═════════════════════════ */

interface HydOptions {
  valve?: string;
  valveProps?: Record<string, unknown>;
  pump?: number;
  /** Relief set pressure, or null for a circuit without relief valve. */
  relief?: number | null;
  cylinder?: string;
  cylinderProps?: Record<string, unknown>;
  extra?: EngineComponent[];
  /** Replaces the default A / B lines (valve 4 → cylinder a, valve 2 → cylinder b). */
  lines?: Pipes;
  pipes?: Pipes;
}
/** Pump P → valve P (and relief), valve T / relief T → tank, valve A (4) → cylinder rear, valve B (2) → cylinder rod side. */
const hydraulic = ({ valve = 'hvalve-4-2', valveProps = PUSH, pump = 50, relief = 60, cylinder = 'cylinder-double', cylinderProps = {}, extra = [], lines, pipes = [] }: HydOptions = {}) => engineOf(
  [part('pump', 'hyd-pump', { pressure: pump }), ...(relief === null ? [] : [part('relief', 'hyd-pressure-relief', { crackingPressure: relief })]), part('tank', 'hyd-tank'), part('v', valve, valveProps), part('cyl', cylinder, cylinderProps), ...extra],
  [['pump:out', 'v:p1'], ...(relief === null ? [] : [['pump:out', 'relief:p1'], ['relief:t', 'tank:p']] as Pipes), ['v:p3', 'tank:p'], ...(lines ?? [['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]), ...pipes],
);
const OIL_FULL = DEFAULT_ENGINE_CONFIG.idealVelocity.OIL;

describe('P3.1 hydraulic power unit and tank circuit (T201–T225)', () => {
  const t = section(201, 225);
  const pumpOnly = (props: Record<string, unknown> = {}) => engineOf([part('pump', 'hyd-pump', props)]);
  const withRelief = (pump: number, relief: number) => engineOf(
    [part('pump', 'hyd-pump', { pressure: pump }), part('relief', 'hyd-pressure-relief', { crackingPressure: relief }), part('tank', 'hyd-tank')],
    [['pump:out', 'relief:p1'], ['relief:t', 'tank:p']],
  );
  const unit = (props: Record<string, unknown>, load = true) => engineOf(
    [part('hpu', 'hyd-power-unit', props), part('g', 'pressure-gauge'), ...(load ? [part('v', 'hvalve-4-2', PUSH), part('tank', 'hyd-tank'), part('cyl', 'cylinder-double')] : [])],
    [['hpu:out', 'g:p'], ...(load ? [['hpu:out', 'v:p1'], ['v:p3', 'tank:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']] as Pipes : [])],
  );

  t('hydraulic pump: delivers its default 50 bar at port P', () => {
    expect(bar(pumpOnly().step(), 'pump:out')).toBe(50);
  });
  for (const pressure of [30, 80, 120, 200]) {
    t(`hydraulic pump set to ${pressure} bar: port P reads ${pressure} bar without a relief valve (and flags the missing relief)`, () => {
      const snapshot = pumpOnly({ pressure }).step();
      expect(bar(snapshot, 'pump:out')).toBe(pressure);
      expect(snapshot.diagnostics.map(diagnostic => diagnostic.code)).toContain('MISSING_RELIEF_VALVE');
    });
  }
  for (const setting of [30, 60, 90]) {
    t(`pressure relief valve cracking at ${setting} bar: a 120 bar pump is held at ${setting} bar and the valve reports open`, () => {
      const snapshot = withRelief(120, setting).step();
      expect(bar(snapshot, 'pump:out')).toBe(setting);
      expect(snapshot.reliefValves.relief.open).toBe(true);
    });
  }
  t('pressure relief valve stays closed while the load pressure is below the setting (50 bar pump, 100 bar valve)', () => {
    const snapshot = withRelief(50, 100).step();
    expect(bar(snapshot, 'pump:out')).toBe(50);
    expect(snapshot.reliefValves.relief.open).toBe(false);
  });
  t('full relief bypass to tank: the T port of the valve and the tank sit at 0 bar while the pump line is at the setting', () => {
    const snapshot = withRelief(120, 60).step();
    expect(bar(snapshot, 'relief:t')).toBe(0);
    expect(bar(snapshot, 'tank:p')).toBe(0);
    expect(bar(snapshot, 'relief:p1')).toBe(60);
  });
  t('cracking pressure edge: a 59 bar pump does not open a 60 bar valve, a 61 bar pump does (and is clamped to 60)', () => {
    const below = withRelief(59, 60).step();
    expect([bar(below, 'pump:out'), below.reliefValves.relief.open]).toEqual([59, false]);
    const above = withRelief(61, 60).step();
    expect([bar(above, 'pump:out'), above.reliefValves.relief.open]).toEqual([60, true]);
  });
  t('a pump line without relief valve raises the MISSING_RELIEF_VALVE warning against that pump', () => {
    const [warning] = pumpOnly().step().diagnostics;
    expect(warning).toMatchObject({ code: 'MISSING_RELIEF_VALVE', severity: 'warning', componentId: 'pump' });
  });
  t('a pump line with a relief valve raises no diagnostics at all', () => {
    expect(withRelief(50, 60).step().diagnostics).toEqual([]);
  });
  t('a deadheaded pump with no relief and no consumer raises the DEADHEAD_OVERPRESSURE error on top of the warning', () => {
    const codes = engineOf([part('pump', 'hyd-pump'), part('v', 'hvalve-4-3', PUSH), part('cyl', 'cylinder-double')], [['pump:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]).step().diagnostics.map(diagnostic => diagnostic.code);
    expect(codes).toEqual(['MISSING_RELIEF_VALVE', 'DEADHEAD_OVERPRESSURE']);
  });
  t('system pressure stabilises at the relief setting under load: against the end stop the line holds 60 bar on every tick', () => {
    const engine = hydraulic({ pump: 120, relief: 60 });
    engine.setManual('v', 'left', true);
    engine.step(3);
    const samples = Array.from({ length: 30 }, () => bar(engine.step(DT), 'pump:out'));
    expect(stroke(engine)).toBe(1);
    expect(new Set(samples)).toEqual(new Set([60]));
    expect(engine.getSnapshot().reliefValves.relief.open).toBe(true);
    expect(engine.getSnapshot().diagnostics).toEqual([]);
  });
  t('power unit 0Z1 with the isolator cock ON passes 50 bar to its outlet', () => {
    expect(bar(unit({}, false).step(), 'g:p')).toBe(50);
  });
  t('power unit 0Z1 with the isolator cock OFF delivers 0 bar and drains the outlet line to tank', () => {
    const snapshot = unit({ shutoff: 'OFF' }, false).step();
    expect(bar(snapshot, 'g:p')).toBe(0);
    expect(snapshot.nets.find(net => net.connectedPortIds.includes('g:p'))!.isExhaust).toBe(true);
  });
  t('power unit 0Z1 isolator toggled ON → OFF → ON follows instantly: 50, 0, 50 bar', () => {
    const engine = unit({}, false);
    const reading = () => bar(engine.step(DT), 'g:p');
    const states = [reading()];
    for (const shutoff of ['OFF', 'ON']) {
      engine.setNetwork({ components: [part('hpu', 'hyd-power-unit', { shutoff }), part('g', 'pressure-gauge')], wires: [wire('hpu:out', 'g:p')] });
      states.push(reading());
    }
    expect(states).toEqual([50, 0, 50]);
  });
  t('power unit 0Z1 internal relief: an 80 bar pump behind a 60 bar relief setting delivers 60 bar and the relief reports open', () => {
    const engine = unit({ pressure: 80, crackingPressure: 60 }, false);
    const snapshot = engine.step();
    expect(bar(snapshot, 'g:p')).toBe(60);
    expect(snapshot.reliefValves.hpu.open).toBe(true);
  });
  t('power unit 0Z1 internal relief stays closed when the pump delivers less than the setting (50 bar < 60 bar)', () => {
    expect(unit({}, false).step().reliefValves.hpu.open).toBe(false);
  });
  t('isolator OFF isolates the actuator: with the downstream valve operated the cylinder gets no pressure and does not move', () => {
    const engine = unit({ shutoff: 'OFF' });
    engine.setManual('v', 'left', true);
    const snapshot = engine.step(2);
    expect(bar(snapshot, 'cyl:a')).toBe(0);
    expect(snapshot.cylinders.cyl.stroke).toBe(0);
  });
  t('isolator ON restores the supply: the same operated valve now drives the cylinder to the cap', () => {
    const engine = unit({ shutoff: 'ON' });
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(50);
  });
  t('closing the isolator mid-stroke stops the cylinder where it is (no pressure, no runaway)', () => {
    const engine = unit({});
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    const midway = stroke(engine);
    expect(midway).toBeGreaterThan(0.1);
    expect(midway).toBeLessThan(0.95);
    engine.setNetwork({ components: [part('hpu', 'hyd-power-unit', { shutoff: 'OFF' }), part('g', 'pressure-gauge'), part('v', 'hvalve-4-2', PUSH), part('tank', 'hyd-tank'), part('cyl', 'cylinder-double')], wires: [wire('hpu:out', 'g:p'), wire('hpu:out', 'v:p1'), wire('v:p3', 'tank:p'), wire('v:p4', 'cyl:a'), wire('v:p2', 'cyl:b')] });
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBeCloseTo(midway, 6);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('the gauge on the power-unit outlet reads the same 60 bar as the relief setting when the unit is overdriven', () => {
    const engine = unit({ pressure: 100, crackingPressure: 60 });
    expect(bar(engine.step(), 'g:p')).toBe(60);
    expect(bar(engine.getSnapshot(), 'hpu:out')).toBe(60);
  });
  t('tank circuit: a pump piped straight to tank pumps round at 0 bar (positive-displacement units only build pressure against resistance)', () => {
    const engine = engineOf([part('pump', 'hyd-pump'), part('tank', 'hyd-tank')], [['pump:out', 'tank:p']]);
    const snapshot = engine.step();
    expect(bar(snapshot, 'pump:out')).toBe(0);
    expect(snapshot.diagnostics.map(diagnostic => diagnostic.code)).not.toContain('DEADHEAD_OVERPRESSURE');
  });

  t.done();
});

describe('P3.2 hydraulic cylinders and motors (T236–T250; T226–T235 are the solid-triangle symbol tests)', () => {
  const t = section(236, 250);
  const motorRig = (motor: Record<string, unknown>, supply = 50, extra: EngineComponent[] = [], pipes: Pipes = [['pump:out', 'm:in'], ['m:out', 'tank:p']]) =>
    engineOf([part('pump', 'hyd-pressure-source', { pressure: supply }), part('m', 'hyd-motor', { speed: 1500, ...motor }), part('tank', 'hyd-tank'), ...extra], pipes);

  t('single-acting hydraulic cylinder: 50 bar through a 3/2 valve pushes the rod against the return spring to the cap', () => {
    const engine = hydraulic({ valve: 'hvalve-3-2-nc', cylinder: 'cylinder-single', lines: [['v:p2', 'cyl:a']] });
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
    engine.setManual('v', 'left', false);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
  });
  t('double-acting hydraulic cylinder: extension force F = p·A = 50 bar × Ø25 mm piston = 2.45 kN', () => {
    const engine = hydraulic();
    engine.setManual('v', 'left', true);
    engine.step(0.1);
    expect(engine.getSnapshot().cylinders.cyl.force).toBeCloseTo(50e5 * AREA(25), 3);
    expect(engine.getSnapshot().cylinders.cyl.force).toBeGreaterThan(2450);
    expect(engine.getSnapshot().cylinders.cyl.force).toBeLessThan(2460);
  });
  t('double-acting hydraulic cylinder: retraction force acts on the annulus, 50 bar × Ø25 mm annulus = 2.06 kN', () => {
    const engine = hydraulic();
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(0.1);
    expect(-engine.getSnapshot().cylinders.cyl.force).toBeCloseTo(50e5 * ANNULUS(25), 3);
  });
  t('through-rod cylinder: both chambers have the annulus area, so extension and retraction force are equal', () => {
    const engine = hydraulic({ cylinder: 'cylinder-double-rod' });
    engine.setManual('v', 'left', true);
    engine.step(0.1);
    const out = engine.getSnapshot().cylinders.cyl.force;
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(0.1);
    const back = engine.getSnapshot().cylinders.cyl.force;
    expect(out).toBeCloseTo(50e5 * ANNULUS(25), 3);
    expect(-back).toBeCloseTo(out, 3);
    const rod = cylinderGeometry(part('c', 'cylinder-double-rod'), cylinderMetaOf(part('c', 'cylinder-double-rod'))!);
    const single = cylinderGeometry(part('c', 'cylinder-double'), cylinderMetaOf(part('c', 'cylinder-double'))!);
    expect(rod.areaA).toBe(rod.areaB);
    expect(single.areaA).toBeGreaterThan(single.areaB);
  });
  t('through-rod cylinder: rod speed is the same in both directions of travel', () => {
    const engine = hydraulic({ cylinder: 'cylinder-double-rod' });
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    const out = velocity(engine);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(0.3);
    expect(-velocity(engine)).toBeCloseTo(out, 6);
    expect(out).toBeCloseTo(OIL_FULL, 6);
  });
  t('hydraulic motor, single direction: 50 bar at A and tank at B run it at its rated 1500 rpm', () => {
    const snapshot = motorRig({}).step(1);
    expect(snapshot.motors.m.rpm).toBeCloseTo(1500, 6);
    expect(bar(snapshot, 'm:out')).toBe(0);
  });
  t('hydraulic motor, single direction: pressure on the other port never runs it backwards', () => {
    const engine = motorRig({}, 50, [], [['pump:out', 'm:out'], ['m:in', 'tank:p']]);
    expect(engine.step(1).motors.m.rpm).toBe(0);
  });
  t('hydraulic motor, both directions: pressure on B reverses it to −1500 rpm', () => {
    const engine = motorRig({ directions: 'Both directions' }, 50, [], [['pump:out', 'm:out'], ['m:in', 'tank:p']]);
    expect(engine.step(1).motors.m.rpm).toBeCloseTo(-1500, 6);
  });
  for (const supply of [10, 25, 50]) {
    t(`motor torque proxy: ${supply} bar differential gives ${(supply / 50) * 1500} rpm (speed ∝ Δp / 50 bar)`, () => {
      expect(motorRig({}, supply).step(1).motors.m.rpm).toBeCloseTo((supply / 50) * 1500, 6);
    });
  }
  t('hydraulic motor with a blocked return (no tank line) cannot discharge and does not turn', () => {
    const engine = engineOf([part('pump', 'hyd-pressure-source'), part('m', 'hyd-motor', { speed: 1500 })], [['pump:out', 'm:in']]);
    expect(engine.step(1).motors.m.rpm).toBe(0);
  });
  t('hydraulic motor shaft angle advances by rpm·6·dt every tick and wraps inside 0 – 360°', () => {
    const engine = motorRig({});
    let angle = engine.step(DT).motors.m.angle;
    for (let tick = 0; tick < 20; tick += 1) {
      const next = engine.step(DT).motors.m.angle;
      expect((((next - angle) % 360) + 360) % 360).toBeCloseTo((1500 * 6 * DT) % 360, 6);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(360);
      angle = next;
    }
  });
  t('hydraulic motor behind a 50 % one-way flow control runs at half speed (750 rpm)', () => {
    const engine = motorRig({}, 50, [part('fc', 'flow-control-oneway', { openingPercentage: 50 })], [['pump:out', 'fc:in'], ['fc:out', 'm:in'], ['m:out', 'tank:p']]);
    expect(engine.step(1).motors.m.rpm).toBeCloseTo(750, 6);
  });
  t('hydraulic motor between 50 bar and a 20 bar back-pressure turns at the differential: (50 − 20)/50 × 1500 = 900 rpm', () => {
    const engine = motorRig({}, 50, [part('back', 'hyd-pressure-source', { pressure: 20 })], [['pump:out', 'm:in'], ['m:out', 'back:out']]);
    const snapshot = engine.step(1);
    expect(bar(snapshot, 'm:out')).toBe(20);
    expect(snapshot.motors.m.rpm).toBeCloseTo(900, 6);
  });

  t.done();
});

describe('P3.3 directional control valves and centre conditions (T251–T269; T270–T275 are the dissection cutaway tests)', () => {
  const t = section(251, 269);
  const SOL4 = { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' };
  const lines = (engine: FluidEngine) => ({ p: bar(engine.getSnapshot(), 'v:p1'), a: bar(engine.getSnapshot(), 'v:p4'), b: bar(engine.getSnapshot(), 'v:p2'), t: bar(engine.getSnapshot(), 'v:p3') });

  t('4/2 valve at rest: P → B (50 bar on port 2) while A drains to tank', () => {
    const engine = hydraulic({ valveProps: SOL_SPRING, relief: null });
    engine.step(0.1);
    expect(lines(engine)).toEqual({ p: 50, a: 0, b: 50, t: 0 });
  });
  t('4/2 valve actuated: P → A (50 bar on port 4) while B drains to tank', () => {
    const engine = hydraulic({ valveProps: SOL_SPRING, relief: null });
    engine.setManual('v', 'left', true);
    engine.step(0.1);
    expect(lines(engine)).toEqual({ p: 50, a: 50, b: 0, t: 0 });
  });
  t('4/2 valve actuated: the cylinder extends to the cap and the rod-side oil goes to tank', () => {
    const engine = hydraulic({ valveProps: SOL_SPRING });
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'cyl:b')).toBe(0);
  });
  t('4/2 valve released: the spring flips the flow paths and the cylinder retracts under B-side pressure', () => {
    const engine = hydraulic({ valveProps: SOL_SPRING });
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(bar(engine.getSnapshot(), 'cyl:b')).toBe(50);
  });
  t('4/3 float neutral: ports A and B are open to tank (0 bar) while P stays blocked at the pump pressure', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3-float', valveProps: SOL4, relief: null });
    engine.step(0.1);
    expect(lines(engine)).toEqual({ p: 50, a: 0, b: 0, t: 0 });
    expect(engine.getSnapshot().valves.v.position).toBe(2);
  });
  t('4/3 float neutral: a cylinder left mid-stroke floats with both chambers at 0 bar, no force and no motion', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3-float', valveProps: SOL4 });
    engine.setManual('v', 'left', true);
    engine.step(0.2);
    const midway = stroke(engine);
    engine.setManual('v', 'left', false);
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'cyl:a')).toBe(0);
    expect(bar(snapshot, 'cyl:b')).toBe(0);
    expect(snapshot.cylinders.cyl.force).toBeCloseTo(0, 6);
    expect(stroke(engine)).toBeCloseTo(midway, 6);
  });
  t('4/3 closed neutral: P, A and B are blocked, and the oil in A and B is trapped (trapped 50 bar behind a closed valve)', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4, relief: null });
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(0.1);
    expect(lines(engine)).toEqual({ p: 50, a: 50, b: 0, t: 0 });
    expect(engine.getSnapshot().valves.v.position).toBe(2);
  });
  t('4/3 closed neutral: the cylinder is hydraulically locked mid-stroke (stroke does not creep over 60 s)', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4 });
    engine.setManual('v', 'left', true);
    engine.step(0.2);
    const midway = stroke(engine);
    engine.setManual('v', 'left', false);
    engine.step(60);
    expect(stroke(engine)).toBeCloseTo(midway, 6);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('4/3 closed neutral: the locked cylinder chamber keeps its pressure for the whole minute', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4 });
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(60);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(50);
  });
  t('4/3 valve with hydraulic pilot ends: pilot pressure on 14 extends, on 12 retracts, and releasing both centres it', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: PILOT2 });
    engine.injectPressure('v', 'pilotL', 10);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
    expect(engine.getSnapshot().valves.v.position).toBe(1);
    engine.injectPressure('v', 'pilotL', 0);
    engine.injectPressure('v', 'pilotR', 10);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    engine.injectPressure('v', 'pilotR', 0);
    engine.step(0.1);
    expect(engine.getSnapshot().valves.v.position).toBe(2);
  });
  t('4/3 centre state: position 2, middle envelope, spool offset 0', () => {
    const { v } = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4 }).getSnapshot().valves;
    expect([v.position, v.envelope, v.spoolOffset]).toEqual([2, 1, 0]);
  });
  t('4/3 spool travel: the left operator slides the strip to offset +1 and the right operator to −1', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4 });
    engine.setManual('v', 'left', true);
    expect(engine.step(0.1).valves.v).toMatchObject({ position: 1, envelope: 0, spoolOffset: 1 });
    engine.setManual('v', 'left', false);
    engine.setManual('v', 'right', true);
    expect(engine.step(0.1).valves.v).toMatchObject({ position: 0, envelope: 2, spoolOffset: -1 });
  });
  t('closed neutral with a 120 bar pump: the relief valve holds the blocked P line at its 60 bar setting', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4, pump: 120, relief: 60 });
    const snapshot = engine.step(0.5);
    expect(bar(snapshot, 'v:p1')).toBe(60);
    expect(snapshot.reliefValves.relief.open).toBe(true);
  });
  t('float neutral with a 120 bar pump: the relief valve holds the blocked P line at its 60 bar setting too', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3-float', valveProps: SOL4, pump: 120, relief: 60 });
    const snapshot = engine.step(0.5);
    expect(bar(snapshot, 'v:p1')).toBe(60);
    expect(snapshot.reliefValves.relief.open).toBe(true);
  });
  t('3/2 hydraulic valve (NC): rest vents the outlet to tank with P blocked, operated it passes 50 bar', () => {
    const engine = engineOf([part('pump', 'hyd-pump'), part('relief', 'hyd-pressure-relief', { crackingPressure: 60 }), part('tank', 'hyd-tank'), part('v', 'hvalve-3-2-nc', SOL_SPRING), part('g', 'pressure-gauge')], [['pump:out', 'v:p1'], ['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ['v:p3', 'tank:p'], ['v:p2', 'g:p']]);
    expect(bar(engine.step(0.1), 'g:p')).toBe(0);
    engine.setManual('v', 'left', true);
    expect(bar(engine.step(0.1), 'g:p')).toBe(50);
    expect(bar(engine.getSnapshot(), 'v:p3')).toBe(0);
  });
  t('tank line T of a 4/3 valve is at 0 bar in all three positions', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL4 });
    const tank: number[] = [bar(engine.step(0.1), 'v:p3')];
    engine.setManual('v', 'left', true);
    tank.push(bar(engine.step(0.1), 'v:p3'));
    engine.setManual('v', 'left', false);
    engine.setManual('v', 'right', true);
    tank.push(bar(engine.step(0.1), 'v:p3'));
    expect(tank).toEqual([0, 0, 0]);
  });
  t('float neutral dumps trapped cylinder oil: pressure in A falls from 50 bar to 0 as soon as the valve centres', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3-float', valveProps: SOL4 });
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(50);
    engine.setManual('v', 'left', false);
    expect(bar(engine.step(0.1), 'cyl:a')).toBe(0);
  });
  t('valve tables: closed and float 4/3 differ only in the centre envelope (closed: no paths, float: 2 → 3 and 4 → 3 with P blocked)', () => {
    const closed = VALVE_TABLES['hvalve-4-3'];
    const float = VALVE_TABLES['hvalve-4-3-float'];
    expect(float.envelopes[0]).toEqual(closed.envelopes[0]);
    expect(float.envelopes[2]).toEqual(closed.envelopes[2]);
    expect(closed.envelopes[1].flows).toEqual([]);
    expect(float.envelopes[1].flows).toEqual([['2', '3'], ['4', '3']]);
    expect(float.envelopes[1].blocks).toEqual(['1']);
  });
  t('three-position valves map engine positions to drawn envelopes: pilot-14 → left envelope, centre → middle, pilot-12 → right', () => {
    const table = VALVE_TABLES['hvalve-4-3'];
    expect([1, 2, 0].map(position => envelopeForPosition(table, position))).toEqual([0, 1, 2]);
    expect(envelopeForPosition(VALVE_TABLES['hvalve-4-2'], 1)).toBe(0);
    expect(envelopeForPosition(VALVE_TABLES['hvalve-4-2'], 0)).toBe(1);
  });

  t.done();
});

describe('P3.4 hydraulic flow, check and counterbalance circuits (T276–T300)', () => {
  const t = section(276, 300);
  /** A-line check valve: oil may enter the rear chamber but cannot leave it. */
  const clamped = (extra: Record<string, unknown> = {}) => hydraulic({ valveProps: SOL_SPRING, extra: [part('chk', 'check-valve')], lines: [['v:p4', 'chk:p1'], ['chk:p2', 'cyl:a'], ['v:p2', 'cyl:b']], ...extra });

  t('check valve in the A line: the cylinder still extends through it at full speed', () => {
    const engine = clamped();
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    expect(velocity(engine)).toBeCloseTo(OIL_FULL, 6);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
  });
  t('leak-free clamping: with the valve released the check blocks the rear chamber and the extended cylinder does not retract (30 s)', () => {
    const engine = clamped();
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(30);
    expect(stroke(engine)).toBe(1);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('leak-free clamping: the clamped chamber keeps its full 50 bar', () => {
    const engine = clamped();
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(30);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(50);
  });
  t('leak-free clamping: the line on the valve side of the check drains to 0 bar while the chamber stays at 50 bar', () => {
    const engine = clamped();
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    const snapshot = engine.step(1);
    expect(bar(snapshot, 'chk:p1')).toBe(0);
    expect(bar(snapshot, 'chk:p2')).toBe(50);
    expect(snapshot.logic.chk.offset).toBe(0);
  });
  t('spring-loaded check valve costs its cracking pressure: 50 bar in, 49.8 bar out at the default 0.2 bar', () => {
    const engine = engineOf([part('src', 'hyd-pressure-source'), part('chk', 'check-valve-spring'), part('g', 'pressure-gauge')], [['src:out', 'chk:p1'], ['chk:p2', 'g:p']]);
    expect(bar(engine.step(), 'g:p')).toBeCloseTo(49.8, 9);
  });
  t('spring-loaded check valve with a 5 bar spring passes 45 bar and lifts its ball (offset +1)', () => {
    const engine = engineOf([part('src', 'hyd-pressure-source'), part('chk', 'check-valve-spring', { crackingPressure: 5 }), part('g', 'pressure-gauge')], [['src:out', 'chk:p1'], ['chk:p2', 'g:p']]);
    const snapshot = engine.step();
    expect(bar(snapshot, 'g:p')).toBeCloseTo(45, 9);
    expect(snapshot.logic.chk.offset).toBe(1);
  });

  /**
   * Counterbalance (brake) circuit built from catalogue parts: the rod-side oil leaves through a sequence valve (outlet to tank) whose pilot is the
   * rear-chamber line, and returns through a parallel check valve, so the exhaust only opens once the drive pressure reaches the setting.
   */
  const counterbalanced = (pump: number, setting: number) => hydraulic({
    pump, relief: null, valveProps: SOL_SPRING,
    extra: [part('seq', 'sequence-ext', { switchingPressure: setting }), part('bypass', 'check-valve')],
    lines: [['v:p4', 'cyl:a'], ['v:p4', 'seq:z12'], ['cyl:b', 'seq:p1'], ['seq:p2', 'tank:p'], ['v:p2', 'bypass:p1'], ['bypass:p2', 'cyl:b']],
  });
  t('counterbalance: with drive pressure (15 bar) below the 20 bar setting the exhaust stays shut and the cylinder is held', () => {
    const engine = counterbalanced(15, 20);
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('counterbalance: with drive pressure (50 bar) above the 20 bar setting the exhaust opens and the cylinder extends', () => {
    const engine = counterbalanced(50, 20);
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
  });
  for (const setting of [10, 20, 30, 40]) {
    t(`counterbalance setting ${setting} bar against 25 bar of drive pressure: the cylinder ${setting <= 25 ? 'moves' : 'is held'}`, () => {
      const engine = counterbalanced(25, setting);
      engine.setManual('v', 'left', true);
      engine.step(3);
      expect(stroke(engine) > 0).toBe(setting <= 25);
    });
  }
  t('counterbalance: the return stroke passes the bypass check valve freely, at full speed', () => {
    const engine = counterbalanced(50, 20);
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(0.3);
    expect(-velocity(engine)).toBeCloseTo(OIL_FULL, 6);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
  });
  t('brake action: when the drive pressure collapses mid-stroke the sequence valve shuts the exhaust and the cylinder stops dead', () => {
    const engine = counterbalanced(50, 20);
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    const midway = stroke(engine);
    expect(midway).toBeGreaterThan(0.1);
    expect(midway).toBeLessThan(0.95);
    engine.setNetwork({ ...network([part('pump', 'hyd-pump', { pressure: 5 }), part('tank', 'hyd-tank'), part('v', 'hvalve-4-2', SOL_SPRING), part('cyl', 'cylinder-double'), part('seq', 'sequence-ext', { switchingPressure: 20 }), part('bypass', 'check-valve')], []), wires: [wire('pump:out', 'v:p1'), wire('v:p3', 'tank:p'), wire('v:p4', 'cyl:a'), wire('v:p4', 'seq:z12'), wire('cyl:b', 'seq:p1'), wire('seq:p2', 'tank:p'), wire('v:p2', 'bypass:p1'), wire('bypass:p2', 'cyl:b')] });
    engine.step(3);
    expect(stroke(engine)).toBeCloseTo(midway, 6);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });

  /** Hydraulic one-way flow control on the rear (meter-in) or rod-side (meter-out) line of a 4/2 driven cylinder. */
  const metered = (where: 'in' | 'out', opening: number) => hydraulic({
    valveProps: SOL_SPRING, extra: [part('fc', 'flow-control-oneway', { openingPercentage: opening })],
    lines: where === 'in' ? [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']] : [['v:p4', 'cyl:a'], ['cyl:b', 'fc:in'], ['fc:out', 'v:p2']],
  });
  for (const opening of [10, 20, 40, 80]) {
    t(`hydraulic meter-in at ${opening} %: the extension speed is ${opening} % of the full ${OIL_FULL} m/s whatever the 50 bar supply`, () => {
      const engine = metered('in', opening);
      engine.setManual('v', 'left', true);
      engine.step(0.3);
      expect(velocity(engine) / OIL_FULL).toBeCloseTo(opening / 100, 4);
    });
  }
  for (const opening of [10, 20, 40, 80]) {
    t(`hydraulic meter-out at ${opening} %: the exhaust throttle holds the extension to ${opening} % of full speed (oil is incompressible, no overrun)`, () => {
      const engine = metered('out', opening);
      engine.setManual('v', 'left', true);
      engine.step(0.3);
      expect(velocity(engine) / OIL_FULL).toBeCloseTo(opening / 100, 4);
      expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(50);
    });
  }
  t('a plain hydraulic throttle in the rear line slows both extension and retraction to its 30 % opening', () => {
    const engine = hydraulic({ valveProps: SOL_SPRING, extra: [part('fc', 'flow-control', { openingPercentage: 30 })], lines: [['v:p4', 'fc:in'], ['fc:out', 'cyl:a'], ['v:p2', 'cyl:b']] });
    engine.setManual('v', 'left', true);
    engine.step(0.3);
    expect(velocity(engine) / OIL_FULL).toBeCloseTo(0.3, 4);
    engine.step(20);
    engine.setManual('v', 'left', false);
    engine.step(0.3);
    expect(-velocity(engine) / OIL_FULL).toBeCloseTo(0.3, 4);
  });
  t('hydraulic logic: the shuttle valve passes the higher of 50 and 20 bar, the dual-pressure valve the lower', () => {
    const run = (type: string) => {
      const engine = engineOf([part('hi', 'hyd-pressure-source', { pressure: 50 }), part('lo', 'hyd-pressure-source', { pressure: 20 }), part('g', type), part('out', 'pressure-gauge')], [['hi:out', 'g:x'], ['lo:out', 'g:y'], ['g:out', 'out:p']]);
      return bar(engine.step(), 'out:p');
    };
    expect(run('shuttle-valve')).toBe(50);
    expect(run('dual-pressure-valve')).toBe(20);
  });
  t('oil regime: with a free path the stroke speed is set by the flow restriction, not by supply pressure (30, 100 and 200 bar run equally fast)', () => {
    const speeds = [30, 100, 200].map(pump => {
      const engine = hydraulic({ pump, relief: null, valveProps: SOL_SPRING });
      engine.setManual('v', 'left', true);
      engine.step(0.3);
      return velocity(engine);
    });
    expect(speeds[0]).toBeCloseTo(OIL_FULL, 6);
    expect(speeds[1]).toBeCloseTo(speeds[0], 9);
    expect(speeds[2]).toBeCloseTo(speeds[0], 9);
  });

  t.done();
});

/* ═════════════════════════ PARTITION 4 — ELECTRO-HYDRAULICS (T301–T400) ═════════════════════════ */

/** Hydraulic rig: pump, relief and tank, plus the given valves / cylinders; labels give the ISO tags used by the ladder coupling. */
const ehRig = (circuit: LadderCircuit, options: { pump?: number; relief?: number; strokeA?: number; strokeB?: number; boreA?: number; boreB?: number; valve?: string } = {}) => {
  const { pump = 50, relief = 60, strokeA = 100, strokeB = 100, boreA = 25, boreB = 25, valve = 'hvalve-4-2' } = options;
  return new Rig(
    [
      rigPart('pump', 'hyd-pump', '0P1', { pressure: pump }), rigPart('relief', 'hyd-pressure-relief', '0V1', { crackingPressure: relief }), rigPart('tank', 'hyd-tank', '0Z1'),
      rigPart('vA', valve, '1V1', SOL2), rigPart('vB', valve, '2V1', SOL2),
      rigPart('a', 'cylinder-double', '1A1', { stroke: strokeA, bore: boreA }), rigPart('b', 'cylinder-double', '2A1', { stroke: strokeB, bore: boreB }),
    ],
    [['pump:out', 'vA:p1'], ['pump:out', 'vB:p1'], ['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ['vA:p3', 'tank:p'], ['vB:p3', 'tank:p'], ['vA:p4', 'a:a'], ['vA:p2', 'a:b'], ['vB:p4', 'b:a'], ['vB:p2', 'b:b']],
    circuit,
  );
};

describe('P4.1 electro-hydraulic solenoid valves (T301–T325)', () => {
  const t = section(301, 325);
  const SOL4 = SOL2;
  const wiredDrive = (valve: string, props: Record<string, unknown>, options: HydOptions = {}) => hydraulic({ valve, valveProps: props, ...options });
  const TYPES: Array<[string, Record<string, unknown>, number]> = [['hvalve-4-2', SOL_SPRING, 0], ['hvalve-4-3', SOL4, 2], ['hvalve-4-3-float', SOL4, 2]];

  t('solenoid 4/2: energised, P → A pushes the cylinder out and the rod-side oil returns to tank', () => {
    const engine = wiredDrive('hvalve-4-2', SOL_SPRING);
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
    expect([bar(engine.getSnapshot(), 'cyl:a'), bar(engine.getSnapshot(), 'cyl:b')]).toEqual([50, 0]);
  });
  t('solenoid 4/2: de-energised, the return spring routes P → B and the cylinder retracts', () => {
    const engine = wiredDrive('hvalve-4-2', SOL_SPRING);
    engine.setManual('v', 'left', true);
    engine.step(3);
    engine.setManual('v', 'left', false);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect([bar(engine.getSnapshot(), 'cyl:a'), bar(engine.getSnapshot(), 'cyl:b')]).toEqual([0, 50]);
  });
  t('tank drain line: the T port of an operated solenoid valve returns oil at 0 bar', () => {
    const engine = wiredDrive('hvalve-4-2', SOL_SPRING);
    engine.setManual('v', 'left', true);
    engine.step(0.2);
    expect(bar(engine.getSnapshot(), 'v:p3')).toBe(0);
    expect(engine.getSnapshot().nets.find(net => net.connectedPortIds.includes('v:p3'))!.isExhaust).toBe(true);
  });
  t('tank drain line: an unpiped T port still drains, so the valve works without an explicit return line', () => {
    const engine = engineOf([part('pump', 'hyd-pump'), part('v', 'hvalve-4-2', SOL_SPRING), part('cyl', 'cylinder-double')], [['pump:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
  });
  t('tank drain line isolation: a T port piped into a dead end (no tank) cannot discharge, the cylinder is hydraulically locked', () => {
    const engine = engineOf(
      [part('pump', 'hyd-pump'), part('v', 'hvalve-4-2', SOL_SPRING), part('cyl', 'cylinder-double'), part('dead', 'pressure-gauge')],
      [['pump:out', 'v:p1'], ['v:p3', 'dead:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
    );
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('tank drain line restored: re-piping T to the tank immediately frees the locked cylinder', () => {
    const open = (tankLine: boolean) => ({ components: [part('pump', 'hyd-pump'), part('v', 'hvalve-4-2', SOL_SPRING), part('cyl', 'cylinder-double'), part('dead', 'pressure-gauge'), part('tank', 'hyd-tank')], wires: [wire('pump:out', 'v:p1'), wire('v:p3', tankLine ? 'tank:p' : 'dead:p'), wire('v:p4', 'cyl:a'), wire('v:p2', 'cyl:b')] });
    const engine = new FluidEngine(open(false));
    engine.setManual('v', 'left', true);
    engine.step(2);
    expect(stroke(engine)).toBe(0);
    engine.setNetwork(open(true));
    engine.step(3);
    expect(stroke(engine)).toBe(1);
  });
  for (const [type, props] of TYPES) {
    t(`${type}: energising the solenoid shifts the spool within the first tick and the cylinder moves within 2 ticks`, () => {
      const engine = wiredDrive(type, props);
      engine.setManual('v', 'left', true);
      expect(engine.step(DT).valves.v.position).toBe(1);
      engine.step(DT);
      expect(velocity(engine)).toBeGreaterThan(0);
      expect(engine.getSnapshot().time).toBeCloseTo(2 * DT, 9);
    });
  }
  for (const [type, props, rest] of TYPES) {
    t(`${type}: de-energising returns the spool to its ${rest === 2 ? 'centre' : 'spring'} position in the first tick`, () => {
      const engine = wiredDrive(type, props);
      engine.setManual('v', 'left', true);
      engine.step(0.2);
      engine.setManual('v', 'left', false);
      expect(engine.step(DT).valves.v.position).toBe(rest);
    });
  }

  /** Two-stage valve: a solenoid 3/2 (pilot stage) feeds the hydraulic pilot port 14 of the main 4/3 spool. */
  const twoStage = (pilotSupply: EngineComponent[] = [], pilotLine: Pipes = [['pump:out', 'pv:p1']]) => engineOf(
    [part('pump', 'hyd-pump'), part('relief', 'hyd-pressure-relief', { crackingPressure: 60 }), part('tank', 'hyd-tank'), part('pv', 'hvalve-3-2-nc', SOL_SPRING), part('main', 'hvalve-4-3', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'None' }), part('cyl', 'cylinder-double'), ...pilotSupply],
    [['pump:out', 'main:p1'], ['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ['pv:p3', 'tank:p'], ['main:p3', 'tank:p'], ['pv:p2', 'main:pilotL'], ['main:p4', 'cyl:a'], ['main:p2', 'cyl:b'], ...pilotLine],
  );
  t('two-stage valve: energising the pilot stage puts 50 bar on pilot port 14, the main spool shifts and the cylinder extends', () => {
    const engine = twoStage();
    engine.setManual('pv', 'left', true);
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'main:pilotL')).toBe(50);
    expect(snapshot.valves.main.position).toBe(1);
    expect(stroke(engine)).toBe(1);
  });
  t('two-stage valve: de-energising the pilot stage drains the pilot line to tank and the main spool centres', () => {
    const engine = twoStage();
    engine.setManual('pv', 'left', true);
    engine.step(1);
    engine.setManual('pv', 'left', false);
    const snapshot = engine.step(0.1);
    expect(bar(snapshot, 'main:pilotL')).toBe(0);
    expect(snapshot.valves.main.position).toBe(2);
  });
  t('two-stage valve: a pilot pressure below the 3 bar cracking level (2 bar from a reducing valve) does not move the main spool', () => {
    const engine = twoStage([part('prv', 'hyd-reducing-valve', { setpoint: 2 })], [['pump:out', 'prv:p1'], ['prv:p2', 'pv:p1']]);
    engine.setManual('pv', 'left', true);
    const snapshot = engine.step(1);
    expect(bar(snapshot, 'main:pilotL')).toBe(2);
    expect(snapshot.valves.main.position).toBe(2);
    expect(stroke(engine)).toBe(0);
  });
  t('two-stage valve: a pilot pressure of 4 bar, just above the cracking level, shifts the main spool', () => {
    const engine = twoStage([part('prv', 'hyd-reducing-valve', { setpoint: 4 })], [['pump:out', 'prv:p1'], ['prv:p2', 'pv:p1']]);
    engine.setManual('pv', 'left', true);
    const snapshot = engine.step(1);
    expect(bar(snapshot, 'main:pilotL')).toBe(4);
    expect(snapshot.valves.main.position).toBe(1);
  });
  t('two-stage valve: the pilot stage is a separate net, so the main valve ports and the pilot line never mix pressures', () => {
    const engine = twoStage([part('prv', 'hyd-reducing-valve', { setpoint: 10 })], [['pump:out', 'prv:p1'], ['prv:p2', 'pv:p1']]);
    engine.setManual('pv', 'left', true);
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'main:pilotL')).toBe(10);
    expect(bar(snapshot, 'main:p1')).toBe(50);
    expect(bar(snapshot, 'cyl:a')).toBe(50);
  });
  t('isolated supply: with the power-unit isolator OFF an energised solenoid valve moves nothing', () => {
    const engine = engineOf([part('hpu', 'hyd-power-unit', { shutoff: 'OFF' }), part('tank', 'hyd-tank'), part('v', 'hvalve-4-2', SOL_SPRING), part('cyl', 'cylinder-double')], [['hpu:out', 'v:p1'], ['v:p3', 'tank:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']]);
    engine.setManual('v', 'left', true);
    engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect(bar(engine.getSnapshot(), 'v:p1')).toBe(0);
  });
  t('reversed plumbing: with A and B swapped the energised valve pressurises the rod side of an unextended cylinder, which cannot move', () => {
    const engine = hydraulic({ valveProps: SOL_SPRING, lines: [['v:p4', 'cyl:b'], ['v:p2', 'cyl:a']] });
    engine.setManual('v', 'left', true);
    const snapshot = engine.step(3);
    expect(stroke(engine)).toBe(0);
    expect([bar(snapshot, 'cyl:b'), bar(snapshot, 'cyl:a')]).toEqual([50, 0]);
    engine.setManual('v', 'left', false);
    engine.step(3);
    expect(stroke(engine)).toBe(1);
  });
  t('ladder start / stop on a solenoid 4/2: START extends, the 1B2 break contact drops K1 and 1Y1 and the spring returns the rod (steps 1A+ then 1A−)', () => {
    const rig = new Rig(
      [rigPart('pump', 'hyd-pump', '0P1'), rigPart('relief', 'hyd-pressure-relief', '0V1', { crackingPressure: 60 }), rigPart('tank', 'hyd-tank', '0Z1'), rigPart('v', 'hvalve-4-2', '1V1', SOL_SPRING), rigPart('cyl', 'cylinder-double', '1A1')],
      [['pump:out', 'v:p1'], ['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ['v:p3', 'tank:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
      startStopExample(),
    );
    rig.run(0.3);
    rig.push('S5', 0.2);
    rig.run(8);
    expect(movesOf(rig.tracker)).toEqual([['cyl+'], ['cyl-']]);
    expect(rig.tracker.cycleLength).toBe(2);
    expect(rig.snapshot.cylinders.cyl.stroke).toBe(0);
  });
  t('double-solenoid 4/2 memory: one pulse extends the cylinder and 50 bar stays on the rear chamber for 20 s without current', () => {
    const engine = wiredDrive('hvalve-4-2', SOL2);
    startPulse(engine, 'v', 'left');
    engine.step(20);
    expect(engine.getSnapshot().valves.v.latched).toBe(true);
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(50);
  });
  t('over-pressure on a solenoid circuit: with a 120 bar pump the extended cylinder chamber is held at the 60 bar relief setting', () => {
    const engine = wiredDrive('hvalve-4-2', SOL_SPRING, { pump: 120, relief: 60 });
    engine.setManual('v', 'left', true);
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'cyl:a')).toBe(60);
    expect(snapshot.reliefValves.relief.open).toBe(true);
  });
  t('4/3 solenoid valve: 1Y1 extends, 1Y2 retracts, no coil centres, both coils centre', () => {
    const engine = wiredDrive('hvalve-4-3', SOL4);
    const positions: number[] = [];
    engine.setManual('v', 'left', true);
    engine.step(3);
    positions.push(engine.getSnapshot().valves.v.position);
    const out = stroke(engine);
    engine.setManual('v', 'left', false);
    positions.push(engine.step(0.1).valves.v.position);
    engine.setManual('v', 'right', true);
    engine.step(3);
    positions.push(engine.getSnapshot().valves.v.position);
    const back = stroke(engine);
    engine.setManual('v', 'left', true);
    positions.push(engine.step(0.1).valves.v.position);
    expect([out, back]).toEqual([1, 0]);
    expect(positions).toEqual([1, 2, 0, 2]);
  });
  t('4/3 float solenoid valve with the energised coil released vents both chambers; closed centre keeps them blocked and pressurised', () => {
    const run = (type: string) => {
      const engine = wiredDrive(type, SOL4);
      engine.setManual('v', 'left', true);
      engine.step(3);
      engine.setManual('v', 'left', false);
      engine.step(0.1);
      return bar(engine.getSnapshot(), 'cyl:a');
    };
    expect(run('hvalve-4-3-float')).toBe(0);
    expect(run('hvalve-4-3')).toBe(50);
  });
  t('solenoid valve response is independent of pressure: 30, 100 and 200 bar supplies all shift the spool in the first tick', () => {
    for (const pump of [30, 100, 200]) {
      const engine = wiredDrive('hvalve-4-2', SOL_SPRING, { pump, relief: null });
      engine.setManual('v', 'left', true);
      expect(engine.step(DT).valves.v.position).toBe(1);
    }
  });

  t.done();
});

describe('P4.2 pump unloading and pressure staging (T326–T350)', () => {
  const t = section(326, 350);
  /**
   * Pump P → relief; solenoid 3/2 `un` unloads the line to tank; a check valve keeps the actuator side pressurised
   * while the pump idles; 4/2 solenoid valve (bistable) → cylinder.
   */
  const unloading = (relief: number | null = 60) => engineOf(
    [
      part('pump', 'hyd-pump'), ...(relief === null ? [] : [part('relief', 'hyd-pressure-relief', { crackingPressure: relief })]), part('tank', 'hyd-tank'),
      part('un', 'hvalve-3-2-nc', SOL_SPRING), part('chk', 'check-valve'), part('v', 'hvalve-4-2', SOL2), part('cyl', 'cylinder-double'),
    ],
    [
      ['pump:out', 'un:p1'], ['un:p2', 'tank:p'], ['un:p3', 'tank:p'], ['pump:out', 'chk:p1'], ['chk:p2', 'v:p1'], ['v:p3', 'tank:p'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b'],
      ...(relief === null ? [] : [['pump:out', 'relief:p1'], ['relief:t', 'tank:p']] as Pipes),
    ],
  );
  const clamped = () => {
    const engine = unloading();
    startPulse(engine, 'v', 'left');
    engine.step(3);
    return engine;
  };

  t('electrically vented line: the unloading solenoid, energised, dumps the pump line to tank (0 bar)', () => {
    const engine = unloading();
    engine.setManual('un', 'left', true);
    expect(bar(engine.step(0.1), 'pump:out')).toBe(0);
  });
  t('electrically vented line: de-energised, the unloader is blocked and the pump line builds its 50 bar', () => {
    const snapshot = unloading().step(0.1);
    expect(bar(snapshot, 'pump:out')).toBe(50);
    expect(snapshot.reliefValves.relief.open).toBe(false);
  });
  t('unloading happens through the solenoid valve, not the relief valve: the relief stays closed and the tank port stays at 0 bar', () => {
    const engine = unloading();
    engine.setManual('un', 'left', true);
    const snapshot = engine.step(0.5);
    expect(snapshot.reliefValves.relief.open).toBe(false);
    expect(bar(snapshot, 'tank:p')).toBe(0);
    expect(bar(snapshot, 'un:p2')).toBe(0);
  });
  t('unloading is repeatable: 50, 0, 50, 0, 50, 0 bar over three load / unload cycles', () => {
    const engine = unloading();
    const readings: number[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      engine.setManual('un', 'left', false);
      readings.push(bar(engine.step(0.2), 'pump:out'));
      engine.setManual('un', 'left', true);
      readings.push(bar(engine.step(0.2), 'pump:out'));
    }
    expect(readings).toEqual([50, 0, 50, 0, 50, 0]);
  });
  t('clamp holds through the idle interval: with the pump unloaded the clamped chamber keeps its 50 bar behind the check valve', () => {
    const engine = clamped();
    engine.setManual('un', 'left', true);
    const snapshot = engine.step(5);
    expect(bar(snapshot, 'pump:out')).toBe(0);
    expect(bar(snapshot, 'cyl:a')).toBe(50);
    expect(snapshot.logic.chk.offset).toBe(0);
  });
  t('clamp holds through the idle interval: the piston stays at the cap and does not move while the pump idles', () => {
    const engine = clamped();
    engine.setManual('un', 'left', true);
    engine.step(20);
    expect(stroke(engine)).toBe(1);
    expect(engine.getSnapshot().cylinders.cyl.velocity).toBe(0);
  });
  t('re-pressurising: releasing the unloader brings the pump line back to 50 bar and the check valve reopens', () => {
    const engine = clamped();
    engine.setManual('un', 'left', true);
    engine.step(2);
    engine.setManual('un', 'left', false);
    const snapshot = engine.step(0.3);
    expect(bar(snapshot, 'pump:out')).toBe(50);
    expect(bar(snapshot, 'v:p1')).toBe(50);
  });
  t('an unloaded pump is not a deadhead: no DEADHEAD_OVERPRESSURE while the unloader is energised (only the missing-relief warning remains)', () => {
    const engine = unloading(null);
    engine.setManual('un', 'left', true);
    expect(engine.step(0.5).diagnostics.map(diagnostic => diagnostic.code)).toEqual(['MISSING_RELIEF_VALVE']);
  });
  t('without relief and unloader a blocked pump line is flagged: MISSING_RELIEF_VALVE and DEADHEAD_OVERPRESSURE', () => {
    const codes = unloading(null).step(0.5).diagnostics.map(diagnostic => diagnostic.code);
    expect(codes).toEqual(['MISSING_RELIEF_VALVE', 'DEADHEAD_OVERPRESSURE']);
  });
  t('the unloader\'s own T port also drains at 0 bar in both positions', () => {
    const engine = unloading();
    const readings = [bar(engine.step(0.1), 'un:p3')];
    engine.setManual('un', 'left', true);
    readings.push(bar(engine.step(0.1), 'un:p3'));
    expect(readings).toEqual([0, 0]);
  });
  const dwellRig = (delay: number) => new Rig(
    [
      rigPart('pump', 'hyd-pump', '0P1'), rigPart('relief', 'hyd-pressure-relief', '0V1', { crackingPressure: 60 }), rigPart('tank', 'hyd-tank', '0Z1'),
      rigPart('vC', 'hvalve-4-2', '1V1', SOL2), rigPart('un', 'hvalve-3-2-nc', '2V1', SOL_SPRING), rigPart('chk', 'check-valve', '0V2'), rigPart('a', 'cylinder-double', '1A1'),
    ],
    [['pump:out', 'un:p1'], ['un:p2', 'tank:p'], ['un:p3', 'tank:p'], ['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ['pump:out', 'chk:p1'], ['chk:p2', 'vC:p1'], ['vC:p3', 'tank:p'], ['vC:p4', 'a:a'], ['vC:p2', 'a:b']],
    ladderOf(rung([buttonC('S1'), sensorC('1B1')], solenoid('1Y1')), rung([sensorC('1B2')], timerCoil('KT1', delay)), rung([timerC('KT1')], solenoid('2Y1'))),
  );
  t('dwell-controlled unloading (ladder timer): the pump line is at 50 bar during the 3 s clamp dwell and drops to 0 bar afterwards, the clamp stays at 50', () => {
    const rig = dwellRig(3);
    rig.run(0.3);
    rig.push('S1', 0.2);
    let during = 0;
    let unloadedAt = -1;
    let clampAfter = -1;
    let arrivedAt = -1;
    rig.run(8, snapshot => {
      if (arrivedAt < 0 && snapshot.sensors['a:S2']) arrivedAt = snapshot.time;
      const line = snapshot.portPressure['pump:out'];
      if (arrivedAt >= 0 && snapshot.time < arrivedAt + 2.9) during = Math.max(during, 1) * (line === 50 ? 1 : 0);
      if (unloadedAt < 0 && arrivedAt >= 0 && line === 0) unloadedAt = snapshot.time;
      if (unloadedAt >= 0) clampAfter = snapshot.portPressure['a:a'];
    });
    expect(during).toBe(1);
    expect(clampAfter).toBe(50);
    expect(unloadedAt).toBeGreaterThan(0);
  });
  t('dwell-controlled unloading: the unload instant follows the clamp-confirmed switch 1B2 by the timer delay (3 s ± 0.1 s)', () => {
    const rig = dwellRig(3);
    rig.run(0.3);
    rig.push('S1', 0.2);
    let arrivedAt = -1;
    let unloadedAt = -1;
    rig.run(8, snapshot => {
      if (arrivedAt < 0 && snapshot.sensors['a:S2']) arrivedAt = snapshot.time;
      if (unloadedAt < 0 && arrivedAt >= 0 && snapshot.portPressure['pump:out'] === 0) unloadedAt = snapshot.time;
    });
    expect(unloadedAt - arrivedAt).toBeGreaterThan(2.9);
    expect(unloadedAt - arrivedAt).toBeLessThan(3.2);
  });

  /** Pump → pressure reducing valve (low-pressure branch) → single-acting cylinder, so the chamber settles at the branch pressure. */
  const branch = (setting: number | null) => {
    const engine = engineOf(
      [part('pump', 'hyd-pump', { pressure: 50 }), part('relief', 'hyd-pressure-relief', { crackingPressure: 60 }), part('tank', 'hyd-tank'), ...(setting === null ? [] : [part('prv', 'hyd-reducing-valve', { setpoint: setting })]), part('cyl', 'cylinder-single')],
      [['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ...(setting === null ? [['pump:out', 'cyl:a']] : [['pump:out', 'prv:p1'], ['prv:p2', 'cyl:a']]) as Pipes],
    );
    return engine.step(3);
  };
  for (const setting of [10, 20, 30]) {
    t(`low-pressure traverse: a reducing valve set to ${setting} bar holds the actuator chamber at ${setting} bar while the pump line stays at 50 bar`, () => {
      const snapshot = branch(setting);
      expect(bar(snapshot, 'cyl:a')).toBe(setting);
      expect(bar(snapshot, 'pump:out')).toBe(50);
    });
  }
  t('high-pressure clamping: the same cylinder without the reducing valve sees the full 50 bar', () => {
    expect(bar(branch(null), 'cyl:a')).toBe(50);
  });
  t('force follows the stage: net force at the cap is (p − spring) · A, so 50 bar clamps with 46/16 = 2.875× the force of the 20 bar traverse', () => {
    const net = (snapshot: EngineSnapshot, pressure: number) => snapshot.cylinders.cyl.force / (AREA(25) * 1e5) + springPressure(1) - pressure;
    const clamp = branch(null);
    const traverse = branch(20);
    expect(net(clamp, 50)).toBeCloseTo(0, 6);
    expect(net(traverse, 20)).toBeCloseTo(0, 6);
    expect(clamp.cylinders.cyl.force / traverse.cylinders.cyl.force).toBeCloseTo((50 - 4) / (20 - 4), 6);
  });

  /** Two stages into one cylinder through a shuttle valve: reducing valve (20 bar) on X, solenoid-selected full pressure on Y. */
  const staged = () => engineOf(
    [
      part('pump', 'hyd-pump'), part('relief', 'hyd-pressure-relief', { crackingPressure: 60 }), part('tank', 'hyd-tank'), part('prv', 'hyd-reducing-valve', { setpoint: 20 }),
      part('hp', 'hvalve-3-2-nc', SOL_SPRING), part('sh', 'shuttle-valve'), part('cyl', 'cylinder-single'),
    ],
    [['pump:out', 'relief:p1'], ['relief:t', 'tank:p'], ['pump:out', 'prv:p1'], ['prv:p2', 'sh:x'], ['pump:out', 'hp:p1'], ['hp:p3', 'tank:p'], ['hp:p2', 'sh:y'], ['sh:out', 'cyl:a']],
  );
  t('two-stage pressure: with the high-pressure solenoid released the shuttle valve passes only the 20 bar branch', () => {
    const snapshot = staged().step(3);
    expect(bar(snapshot, 'cyl:a')).toBe(20);
    expect(snapshot.logic.sh.offset).toBe(1); // ball driven onto the dead Y seat by the 20 bar on X
  });
  t('two-stage pressure: energising the high-pressure solenoid makes the shuttle valve pass the higher 50 bar branch', () => {
    const engine = staged();
    engine.setManual('hp', 'left', true);
    const snapshot = engine.step(3);
    expect(bar(snapshot, 'cyl:a')).toBe(50);
    expect(snapshot.logic.sh.offset).toBe(-1); // 50 bar on Y now drives the ball onto the X seat
  });
  t('a 3-way reducing valve relieves to tank when its outlet is driven above the setting: a 40 bar back-drive is held at 30 bar', () => {
    const engine = engineOf(
      [part('pump', 'hyd-pump'), part('prv', 'hyd-reducing-valve-3way', { setpoint: 30 }), part('load', 'hyd-pressure-source', { pressure: 40 }), part('tank', 'hyd-tank')],
      [['pump:out', 'prv:p1'], ['prv:p2', 'load:out'], ['prv:t', 'tank:p']],
    );
    const snapshot = engine.step(0.5);
    expect(bar(snapshot, 'prv:p2')).toBe(30);
    expect(bar(snapshot, 'prv:t')).toBe(0);
  });
  t('rapid traverse then clamp: a single-acting cylinder runs out under 20 bar, then the 50 bar stage raises the clamp pressure at the cap', () => {
    const engine = staged();
    engine.step(3);
    expect(stroke(engine)).toBe(1);
    expect(bar(engine.getSnapshot(), 'cyl:a')).toBe(20);
    engine.setManual('hp', 'left', true);
    const snapshot = engine.step(0.5);
    expect(bar(snapshot, 'cyl:a')).toBe(50);
    expect(snapshot.cylinders.cyl.stroke).toBe(1);
  });

  /** Staged relief: a 60 bar relief valve always on the line, a 20 bar relief valve connected through a solenoid 3/2. */
  const stagedRelief = () => engineOf(
    [part('pump', 'hyd-pump', { pressure: 120 }), part('high', 'hyd-pressure-relief', { crackingPressure: 60 }), part('low', 'hyd-pressure-relief', { crackingPressure: 20 }), part('sel', 'hvalve-3-2-nc', SOL_SPRING), part('tank', 'hyd-tank')],
    [['pump:out', 'high:p1'], ['high:t', 'tank:p'], ['pump:out', 'sel:p1'], ['sel:p2', 'low:p1'], ['low:t', 'tank:p'], ['sel:p3', 'tank:p']],
  );
  t('staged relief, high stage: with the selector released the line is capped at 60 bar', () => {
    const snapshot = stagedRelief().step(0.5);
    expect(bar(snapshot, 'pump:out')).toBe(60);
    expect(snapshot.reliefValves.high.open).toBe(true);
  });
  t('staged relief, low stage: energising the selector connects the 20 bar valve and the line falls to 20 bar', () => {
    const engine = stagedRelief();
    engine.setManual('sel', 'left', true);
    expect(bar(engine.step(0.5), 'pump:out')).toBe(20);
  });
  t('staged relief: the low-stage valve reports open while energised, and releasing the selector raises the line back to 60 bar', () => {
    const engine = stagedRelief();
    engine.setManual('sel', 'left', true);
    const low = engine.step(0.5);
    expect(low.reliefValves.low.open).toBe(true);
    expect(low.reliefValves.high.open).toBe(false);
    engine.setManual('sel', 'left', false);
    const high = engine.step(0.5);
    expect([bar(high, 'pump:out'), high.reliefValves.low.open]).toEqual([60, false]);
  });
  t('staged relief: the line toggles 60 → 20 → 60 → 20 bar with the selector, never exceeding the active stage', () => {
    const engine = stagedRelief();
    const readings: number[] = [];
    for (const on of [false, true, false, true]) {
      engine.setManual('sel', 'left', on);
      readings.push(bar(engine.step(0.3), 'pump:out'));
    }
    expect(readings).toEqual([60, 20, 60, 20]);
  });

  t.done();
});

describe('P4.3 heavy-duty automated sequences and safety (T351–T375)', () => {
  const t = section(351, 375);

  /**
   * Clamp (1A1) → Press (2A1) → Retract press → Unclamp, i.e. A+ B+ B− A− with hydraulic cylinders on bistable 4/2 solenoid valves.
   * K1 remembers that the press has been down, so the press is not started twice and the clamp only opens once the press is home.
   */
  const pressCycle = (extra: ReturnType<typeof rung>[] = [], guard: Array<ReturnType<typeof buttonC>> = []) => ladderOf(
    rung([buttonC('S1'), sensorC('1B1'), sensorC('2B1'), ...guard], solenoid('1Y1')),
    rung([sensorC('1B2'), sensorC('2B1'), relayC('K1', 'NC'), ...guard], solenoid('2Y1')),
    rung([sensorC('2B2')], solenoid('2Y2')),
    rung([relayC('K1'), sensorC('2B1')], solenoid('1Y2')),
    rung([sensorC('2B2')], coil('K1')), rung([relayC('K1'), sensorC('1B1', 'NC')], coil('K1')),
    ...extra,
  );
  const cycleOnce = (rig: Rig, seconds = 14) => { rig.run(0.3); rig.push('S1', 0.2); rig.run(seconds); return rig; };
  const stepsOf = (rig: Rig) => rig.tracker.steps.map(step => step.moves[0]);

  t('coordinated sequence: Clamp → Press → Retract → Unclamp runs in order from one START pulse', () => {
    const rig = cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 }));
    expect(movesOf(rig.tracker)).toEqual([['a+'], ['b+'], ['b-'], ['a-']]);
    expect(rig.tracker.cycleLength).toBe(4);
  });
  t('displacement-step extraction: clamp out for steps 2 – 4, press out for step 3 only', () => {
    const view = cycleView(cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 })).tracker);
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 0], [4, 0]]);
  });
  t('timing table: the 200 mm press stroke takes four times as long as the 50 mm clamp stroke (±15 %)', () => {
    const [clamp, press] = stepsOf(cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 })));
    const ratio = (press.end! - press.start) / (clamp.end! - clamp.start);
    expect(ratio).toBeGreaterThan(3.4);
    expect(ratio).toBeLessThan(4.6);
  });
  t('interlock: the press does not start before the clamp has reached its confirm switch 1B2', () => {
    const [clamp, press] = stepsOf(cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 })));
    expect(press.start).toBeGreaterThanOrEqual(clamp.end!);
    expect(press.start - clamp.end!).toBeLessThan(0.1);
  });
  t('interlock: the clamp does not open before the press is fully home (2B1) again', () => {
    const [, , retract, unclamp] = stepsOf(cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 })));
    expect(unclamp.start).toBeGreaterThanOrEqual(retract.end!);
  });
  t('the first cycle closes at four steps with the labels 1 · 2 · 3 · 4 · 1', () => {
    const view = cycleView(cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 })).tracker);
    expect([view.complete, view.columns, view.labels]).toEqual([true, 4, [1, 2, 3, 4, 1]]);
  });
  t('a second START repeats the identical cycle: frozen steps, cycle number 2, twelve steps after three starts', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200 });
    cycleOnce(rig);
    const first = cycleView(rig.tracker).steps;
    cycleOnce(rig);
    expect(cycleView(rig.tracker).steps).toEqual(first);
    expect(cycleView(rig.tracker).cycleNumber).toBe(2);
    cycleOnce(rig);
    expect(rig.tracker.stepNumber).toBe(12);
  });
  t('clamp pressure is held while pressing: the clamp chamber never falls below 49.9 bar between clamp arrival and unclamp', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    let low = Infinity;
    let armed = false;
    rig.run(14, snapshot => {
      if (snapshot.sensors['a:S2']) armed = true;
      if (snapshot.cylinders.a.velocity < 0) armed = false;
      if (armed) low = Math.min(low, snapshot.portPressure['a:a']);
    });
    expect(low).toBeGreaterThan(49.9);
  });
  t('press force: 50 bar on a Ø63 mm press piston gives 15.6 kN while it moves', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200, boreA: 40, boreB: 63 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    let force = 0;
    rig.run(10, snapshot => { if (snapshot.cylinders.b.velocity > 0) force = snapshot.cylinders.b.force; });
    expect(force).toBeCloseTo(50e5 * AREA(63), 3);
    expect(force).toBeGreaterThan(15500);
  });
  t('clamp force: 50 bar on a Ø40 mm clamp piston gives 6.28 kN while it moves', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200, boreA: 40, boreB: 63 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    let force = 0;
    rig.run(3, snapshot => { if (snapshot.cylinders.a.velocity > 0) force = snapshot.cylinders.a.force; });
    expect(force).toBeCloseTo(50e5 * AREA(40), 3);
  });
  t('over-pressure protection: with a 120 bar pump and a 60 bar relief valve no line of the cycle ever exceeds 60 bar, and the relief opens at the end stops', () => {
    const rig = ehRig(pressCycle(), { pump: 120, relief: 60, strokeA: 50, strokeB: 100 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    let peak = 0;
    let opened = false;
    rig.run(10, snapshot => {
      peak = Math.max(peak, ...Object.values(snapshot.portPressure));
      opened ||= snapshot.reliefValves.relief.open;
    });
    expect(peak).toBe(60);
    expect(opened).toBe(true);
  });
  t('positioning curve: the press stroke rises linearly with time at the rated 0.1 m/s (±3 % residual) from 10 % to 90 %', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    const curve: Array<[number, number]> = [];
    rig.run(10, snapshot => { if (snapshot.cylinders.b.velocity > 0) curve.push([snapshot.time, snapshot.cylinders.b.stroke]); });
    const middle = curve.filter(([, position]) => position > 0.1 && position < 0.9);
    const slope = (middle[middle.length - 1][1] - middle[0][1]) / (middle[middle.length - 1][0] - middle[0][0]);
    expect(slope).toBeCloseTo(0.1 / 0.2, 2);
    for (const [time, position] of middle) expect(Math.abs(position - (middle[0][1] + slope * (time - middle[0][0])))).toBeLessThan(0.03);
    // 2B2 trips 3 mm (1.5 % of 200 mm) before the cap and the press reverses from there
    expect(curve[curve.length - 1][1]).toBeGreaterThanOrEqual(1 - 3 / 200 - 1e-9);
    expect(curve[curve.length - 1][1]).toBeLessThanOrEqual(1);
  });
  t('end of cycle: both cylinders are home, no coil is energised and no relay is held', () => {
    const rig = cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 }));
    expect([rig.snapshot.cylinders.a.stroke, rig.snapshot.cylinders.b.stroke]).toEqual([0, 0]);
    expect(Object.values(rig.energised).some(Boolean)).toBe(false);
    expect(Object.values(rig.ladder.relays).some(Boolean)).toBe(false);
  });
  t('cycle time budget: the whole cycle takes the sum of its four strokes plus under 0.4 s of switching dead time', () => {
    const steps = stepsOf(cycleOnce(ehRig(pressCycle(), { strokeA: 50, strokeB: 200 })));
    const moving = steps.reduce((sum, move) => sum + (move.end! - move.start), 0);
    const total = steps[3].end! - steps[0].start;
    expect(total - moving).toBeGreaterThanOrEqual(0);
    expect(total - moving).toBeLessThan(0.4);
  });
  t('a 50 bar pump behind a 60 bar relief valve never lifts the relief during a normal cycle', () => {
    const rig = ehRig(pressCycle(), { pump: 50, relief: 60, strokeA: 50, strokeB: 100 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    let opened = false;
    rig.run(10, snapshot => { opened ||= snapshot.reliefValves.relief.open; });
    expect(opened).toBe(false);
    expect(rig.tracker.cycleLength).toBe(4);
  });

  /* Fault injection. */
  const clampHolding = () => {
    const rig = ehRig(pressCycle([], [sensorC('2B1')]), { strokeA: 50, strokeB: 200 });
    rig.run(0.3);
    rig.push('S1', 0.2);
    rig.run(0.3);
    return rig;
  };
  t('pipe rupture on a trapped clamp chamber: its line opens to atmosphere, the 50 bar collapses to 0 and the clamp force is lost', () => {
    const rig = ehRig(ladderOf(rung([buttonC('S1')], solenoid('1Y1'))), { strokeA: 50 });
    rig.run(0.2);
    rig.push('S1', 0.1);
    rig.run(2);
    // the bistable valve now holds P → A; cutting the supply isolates the chamber behind the check of a closed line
    expect(rig.snapshot.portPressure['a:a']).toBe(50);
    rig.engine.setNetwork({ components: rig.parts.map(({ id, type, props }) => ({ id, type, props })), wires: rig.pipes.filter(([a, b]) => !(a === 'pump:out' && b === 'vA:p1')).map(([a, b]) => wire(a, b)) });
    rig.engine.injectPressure('a', 'a', 0);
    const snapshot = rig.engine.step(0.2);
    expect(snapshot.portPressure['a:a']).toBe(0);
    expect(Math.abs(snapshot.cylinders.a.force)).toBeLessThan(1e-6);
  });
  t('pipe rupture on the pump line: the pump line collapses to 0 bar and a cylinder under way stops with its stroke frozen', () => {
    const rig = ehRig(ladderOf(rung([buttonC('S1')], solenoid('1Y1'))), { strokeA: 200 });
    rig.run(0.2);
    rig.press('S1');
    rig.run(0.5);
    const midway = rig.snapshot.cylinders.a.stroke;
    expect(midway).toBeGreaterThan(0.1);
    expect(midway).toBeLessThan(0.9);
    rig.engine.injectPressure('vA', 'p1', 0);
    rig.run(0.2);
    expect(rig.snapshot.portPressure['vA:p1']).toBe(0);
    const frozen = rig.snapshot.cylinders.a.stroke;
    rig.run(3);
    expect(rig.snapshot.cylinders.a.stroke).toBeCloseTo(frozen, 6);
    expect(rig.snapshot.cylinders.a.velocity).toBe(0);
  });
  t('the ruptured line is repaired: releasing the injected opening lets the cylinder finish its stroke', () => {
    const rig = ehRig(ladderOf(rung([buttonC('S1')], solenoid('1Y1'))), { strokeA: 200 });
    rig.run(0.2);
    rig.press('S1');
    rig.run(0.5);
    rig.engine.injectPressure('vA', 'p1', 0);
    rig.run(1);
    const stalled = rig.snapshot.cylinders.a.stroke;
    rig.engine.injectPressure('vA', 'p1', null);
    rig.run(4);
    expect(stalled).toBeLessThan(0.9);
    expect(rig.snapshot.cylinders.a.stroke).toBe(1);
  });
  t('excessive pressure trip: a 200 bar pump behind a 60 bar relief valve is clamped to 60 bar, never 200', () => {
    const rig = ehRig(ladderOf(rung([buttonC('S1')], solenoid('1Y1'))), { pump: 200, relief: 60 });
    rig.run(0.2);
    rig.press('S1');
    let peak = 0;
    rig.run(4, snapshot => { peak = Math.max(peak, ...Object.values(snapshot.portPressure)); });
    expect(peak).toBe(60);
    expect(rig.snapshot.reliefValves.relief.open).toBe(true);
  });
  t('a healthy relief-protected circuit raises no diagnostics even at the end stop', () => {
    const rig = ehRig(ladderOf(rung([buttonC('S1')], solenoid('1Y1'))), { pump: 200, relief: 60 });
    rig.run(0.2);
    rig.press('S1');
    rig.run(4);
    expect(rig.snapshot.diagnostics).toEqual([]);
  });
  t('missing relief valve on a closed-centre circuit is flagged as a deadhead overpressure error', () => {
    const engine = hydraulic({ valve: 'hvalve-4-3', valveProps: SOL2, pump: 200, relief: null });
    const codes = engine.step(0.5).diagnostics.map(diagnostic => diagnostic.code);
    expect(codes).toEqual(['MISSING_RELIEF_VALVE', 'DEADHEAD_OVERPRESSURE']);
    expect(bar(engine.getSnapshot(), 'pump:out')).toBe(200);
  });
  t('sensor failure, clamp switch 1B2 stuck open: the press never starts and the clamp stays pressurised at 50 bar', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200 });
    rig.stuck['1B2'] = false;
    rig.run(0.3);
    rig.push('S1', 0.2);
    rig.run(8);
    expect(rig.snapshot.cylinders.a.stroke).toBe(1);
    expect(rig.snapshot.cylinders.b.stroke).toBe(0);
    expect(rig.snapshot.portPressure['a:a']).toBe(50);
    expect(movesOf(rig.tracker)).toEqual([['a+']]);
  });
  t('fault recovery: once the stuck-open 1B2 is repaired the stalled sequence carries on and completes all four steps', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200 });
    rig.stuck['1B2'] = false;
    rig.run(0.3);
    rig.push('S1', 0.2);
    rig.run(4);
    expect(movesOf(rig.tracker)).toEqual([['a+']]);
    delete rig.stuck['1B2'];
    rig.run(14);
    expect(movesOf(rig.tracker)).toEqual([['a+'], ['b+'], ['b-'], ['a-']]);
    expect(rig.tracker.cycleLength).toBe(4);
  });
  t('sensor failure, clamp switch 1B2 stuck made: the press runs at power-on with the clamp still open, the clamp-confirm interlock is defeated', () => {
    const rig = ehRig(pressCycle(), { strokeA: 50, strokeB: 200 });
    rig.stuck['1B2'] = true;
    rig.run(0.5);
    expect(rig.snapshot.cylinders.b.stroke).toBeGreaterThan(0.1);
    expect(rig.snapshot.cylinders.a.stroke).toBe(0);
    expect(rig.snapshot.sensors['a:S1']).toBe(true);
    expect(movesOf(rig.tracker)[0]).toEqual(['b+']);
  });
  t('E-stop on closed-centre 4/3 valves freezes the press mid-stroke with the oil trapped and the valve centred', () => {
    // 4/3 valves centre when their coil drops, so each stroke is carried by a sealed-in run relay (K1 clamp, K2 press)
    const guarded = ladderOf(
      rung([buttonC('S1'), sensorC('1B1'), sensorC('2B1'), buttonC('ES', 'NC')], coil('K1')), rung([relayC('K1'), sensorC('1B2', 'NC'), buttonC('ES', 'NC')], coil('K1')), rung([relayC('K1')], solenoid('1Y1')),
      rung([sensorC('1B2'), sensorC('2B1'), buttonC('ES', 'NC')], coil('K2')), rung([relayC('K2'), sensorC('2B2', 'NC'), buttonC('ES', 'NC')], coil('K2')), rung([relayC('K2')], solenoid('2Y1')),
    );
    const rig = ehRig(guarded, { strokeA: 50, strokeB: 200, valve: 'hvalve-4-3' });
    rig.run(0.3);
    rig.push('S1', 0.2);
    rig.run(1.5);
    expect(rig.snapshot.cylinders.b.velocity).toBeGreaterThan(0);
    const running = rig.snapshot.cylinders.b.stroke;
    rig.press('ES');
    rig.run(0.1);
    const frozen = rig.snapshot.cylinders.b.stroke;
    expect(frozen).toBeGreaterThanOrEqual(running);
    expect(frozen).toBeGreaterThan(0.1);
    expect(frozen).toBeLessThan(0.95);
    rig.run(10);
    expect(rig.snapshot.cylinders.b.stroke).toBeCloseTo(frozen, 6);
    expect(rig.snapshot.cylinders.b.velocity).toBe(0);
    expect(rig.snapshot.valves.vB.position).toBe(2);
    expect(rig.snapshot.portPressure['b:a']).toBe(50);
  });

  t.done();
});
