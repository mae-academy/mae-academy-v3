import { describe, expect, it } from 'vitest';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { EngineWire } from '@shared/fluid/engine/types';
import { defaultFluidProps, getFluidDefinition } from '../models/fluidCatalog';
import { listSensorOptions } from './sensorCoupling';
import { assignSignalTags } from './signalTags';
import { knownSensorTags, knownSolenoidTags, sensorSignals, solenoidDrive, solenoidTargets } from './ladderCoupling';
import { startStopExample } from './ladderExamples';
import { EMPTY_LADDER_STATE, stepLadder, tagKey, type LadderState } from './relayLadder';

const part = (id: string, type: string, label: string, props: Record<string, unknown> = {}) => ({
  id, type, label, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props },
});
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};

/** The textbook cylinder 1A1 on a solenoid-operated, spring-returned 5/2 valve 1V1. */
const COMPONENTS = [
  part('src', 'pressure-source', '0Z1'),
  part('v', 'valve-5-2', '1V1', { actuationLeft: 'Solenoid', actuationRight: 'Spring Return' }),
  part('cyl', 'cylinder-double', '1A1'),
];
const WIRES = [pipe('src:out', 'v:p1'), pipe('v:p4', 'cyl:a'), pipe('v:p2', 'cyl:b')];

const tags = assignSignalTags(COMPONENTS);
const options = listSensorOptions(COMPONENTS, tags.sensors);
const targets = solenoidTargets(COMPONENTS, tags, options);

describe('ladder / schematic coupling', () => {
  it('reads the limit switches of every cylinder as sensor signals by tag', () => {
    expect(knownSensorTags(options)).toEqual(['1B1', '1B2']);
    expect(sensorSignals(options, { 'cyl:S1': true, 'cyl:S2': false })).toEqual({ '1b1': true, '1b2': false });
  });

  it('finds the solenoid ends of the valves, tagged by the schematic', () => {
    expect(targets).toEqual([{ componentId: 'v', side: 'left', tag: '1Y1', key: 'v:left' }]);
    expect(knownSolenoidTags(targets)).toEqual(['1Y1']);
  });

  it('ignores valve ends that are not solenoids', () => {
    const push = [part('v', 'valve-5-2', '1V1', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' })];
    expect(solenoidTargets(push, assignSignalTags(push), [])).toEqual([]);
  });

  it('drives a valve end only while its solenoid tag is energised, whatever the case of the tag', () => {
    expect(solenoidDrive(targets, { '1y1': true })).toEqual({ 'v:left': true });
    expect(solenoidDrive(targets, {})).toEqual({ 'v:left': false });
    expect(solenoidDrive(targets, { [tagKey('$1Y1$')]: true })).toEqual({ 'v:left': true });
  });
});

describe('electro-pneumatic co-simulation (ladder + FluidEngine)', () => {
  /** Same loop the studio runs: engine tick, sensors into the ladder, solenoids back into the engine. */
  function simulate(seconds: number, pressed: (time: number) => string[]) {
    const circuit = startStopExample();
    const engine = new FluidEngine({ components: COMPONENTS.map(({ id, type, props }) => ({ id, type, props })), wires: WIRES });
    engine.reset();
    let state: LadderState = EMPTY_LADDER_STATE;
    const trace: Array<{ time: number; stroke: number; k1: boolean; y1: boolean; b1: boolean; b2: boolean }> = [];
    let snapshot = engine.getSnapshot();
    for (let time = 0; time < seconds; time += 0.016) {
      snapshot = engine.step(0.016);
      const result = stepLadder(
        circuit,
        { sensors: sensorSignals(options, snapshot.sensors), pressed: Object.fromEntries(pressed(time).map(tag => [tagKey(tag), true])) },
        state,
        0.016,
      );
      state = result.state;
      const drive = solenoidDrive(targets, result.solenoids);
      for (const target of targets) engine.setManual(target.componentId, target.side, drive[target.key]);
      trace.push({ time, stroke: snapshot.cylinders.cyl.stroke, k1: Boolean(state.relays.k1), y1: Boolean(result.solenoids['1y1']), b1: snapshot.sensors['cyl:S1'], b2: snapshot.sensors['cyl:S2'] });
    }
    return trace;
  }

  it('pressing S5 latches K1, energises 1Y1, shifts 1V1 and extends 1A1; reaching 1B2 releases K1 and the spring returns the valve', () => {
    const trace = simulate(12, time => (time >= 0.5 && time < 0.7 ? ['S5'] : []));

    // before the press: everything at rest, the retracted limit switch 1B1 is made
    const rest = trace.find(sample => sample.time > 0.3)!;
    expect(rest).toMatchObject({ stroke: 0, k1: false, y1: false, b1: true, b2: false });

    // pressing S5 latched K1 and energised the solenoid, which was still on after S5 was released
    const afterRelease = trace.find(sample => sample.time > 0.9)!;
    expect(afterRelease.k1).toBe(true);
    expect(afterRelease.y1).toBe(true);
    expect(afterRelease.stroke).toBeGreaterThan(0);
    expect(afterRelease.b1).toBe(false);

    // the piston arriving at the end of its stroke (within the switch's ±3 mm window) makes 1B2, which breaks the holding circuit
    const end = trace.find(sample => sample.b2)!;
    expect(end.stroke).toBeGreaterThan(0.95);
    const dropped = trace.find(sample => sample.time > end.time + 0.05)!;
    expect(dropped.k1).toBe(false);
    expect(dropped.y1).toBe(false);

    // the valve spring returns it and the cylinder retracts to 1B1; the circuit stays off until START is pressed again
    const last = trace[trace.length - 1];
    expect(last).toMatchObject({ stroke: 0, k1: false, y1: false, b1: true });
  });

  it('never energises the solenoid without S5', () => {
    expect(simulate(2, () => []).some(sample => sample.y1 || sample.stroke > 0)).toBe(false);
  });
});
