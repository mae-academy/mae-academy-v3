import { describe, expect, it } from 'vitest';
import {
  EMPTY_LADDER_STATE, addParallel, addPath, addSeries, crossReferences, findElement, idleLadder, makeElement, newPath, removeElement, sanitizeLadder,
  setLoad, stepLadder, suggestTag, updateElement, type LadderCircuit, type LadderInputs, type LadderState,
} from './relayLadder';
import { startStopExample } from './ladderExamples';

const inputs = (pressed: string[] = [], sensors: string[] = []): LadderInputs => ({
  pressed: Object.fromEntries(pressed.map(tag => [tag.toLowerCase(), true])),
  sensors: Object.fromEntries(sensors.map(tag => [tag.toLowerCase(), true])),
});

/** Runs the circuit for `seconds` of simulated time with constant inputs, in 16 ms ticks. */
function run(circuit: LadderCircuit, input: LadderInputs, state: LadderState = EMPTY_LADDER_STATE, seconds = 0.016) {
  let result = stepLadder(circuit, input, state, 0.016);
  for (let t = 0.016; t < seconds; t += 0.016) result = stepLadder(circuit, input, result.state, 0.016);
  return result;
}

const single = (conditions: LadderCircuit['paths'][number]['conditions'], load: LadderCircuit['paths'][number]['load']): LadderCircuit => ({ paths: [{ ...newPath(), conditions, load }] });

describe('editing', () => {
  it('builds series (AND) and parallel (OR) conditions in front of one load per path', () => {
    let circuit = addPath({ paths: [] });
    const id = circuit.paths[0].id;
    circuit = addSeries(circuit, id, makeElement('pushbutton', 'S1'));
    circuit = addParallel(circuit, id, 0, makeElement('relayContact', 'K1'));
    circuit = addSeries(circuit, id, makeElement('sensor', '1B1'));
    circuit = setLoad(circuit, id, makeElement('relayCoil', 'K1'));
    expect(circuit.paths[0].conditions.map(group => group.map(element => element.tag))).toEqual([['S1', 'K1'], ['1B1']]);
    expect(circuit.paths[0].load?.tag).toBe('K1');
  });

  it('removes an element and prunes the group and the load it leaves empty', () => {
    const circuit = startStopExample();
    const [start, hold] = circuit.paths[0].conditions[0];
    const withoutStart = removeElement(circuit, start.id);
    expect(withoutStart.paths[0].conditions[0].map(element => element.id)).toEqual([hold.id]);
    expect(removeElement(withoutStart, hold.id).paths[0].conditions).toHaveLength(1);
    expect(removeElement(circuit, circuit.paths[1].load!.id).paths[1].load).toBeNull();
  });

  it('updates an element by id without touching the others', () => {
    const circuit = startStopExample();
    const coil = circuit.paths[0].load!;
    const next = updateElement(circuit, coil.id, { tag: 'K9' });
    expect(findElement(next, coil.id)?.tag).toBe('K9');
    expect(findElement(next, circuit.paths[1].load!.id)?.tag).toBe('1Y1');
  });

  it('gives timers a mode and delay, and contacts a form', () => {
    expect(makeElement('timerCoil', 'KT1')).toMatchObject({ mode: 'on', delay: 2 });
    expect(makeElement('sensor', '1B1').form).toBe('NO');
    expect(makeElement('solenoid', '1Y1').form).toBeUndefined();
  });

  it('suggests the next free designation of each kind', () => {
    let circuit: LadderCircuit = { paths: [] };
    expect(suggestTag(circuit, 'sensor')).toBe('1B1');
    expect(suggestTag(circuit, 'sensor', ['1B3', '1B4'])).toBe('1B3');
    expect(suggestTag(circuit, 'pushbutton')).toBe('S1');
    expect(suggestTag(circuit, 'relayCoil')).toBe('K1');
    expect(suggestTag(circuit, 'solenoid')).toBe('1Y1');
    expect(suggestTag(circuit, 'timerCoil')).toBe('KT1');
    circuit = startStopExample();
    expect(suggestTag(circuit, 'relayCoil')).toBe('K2');
    expect(suggestTag(circuit, 'solenoid')).toBe('1Y2');
    expect(suggestTag(circuit, 'relayContact')).toBe('K1');
    expect(suggestTag(circuit, 'sensor', ['1B2', '1B1'])).toBe('1B1');
  });
});

describe('relay solver', () => {
  const example = startStopExample();

  it('is dead until the START pushbutton is pressed', () => {
    const result = run(example, inputs());
    expect(result.state.relays.k1).toBeFalsy();
    expect(result.solenoids['1y1']).toBeFalsy();
    expect(result.paths[example.paths[0].id].energised).toBe(false);
    // +24 V still reaches the first contacts, which is what the live lines show
    expect(result.elements[example.paths[0].conditions[0][0].id]).toEqual({ live: true, closed: false });
  });

  it('S5 latches K1, which closes its contact and energises 1Y1 in the same tick', () => {
    const pressed = run(example, inputs(['S5']));
    expect(pressed.state.relays.k1).toBe(true);
    expect(pressed.solenoids['1y1']).toBe(true);

    // released: K1 holds itself through its own contact
    const released = run(example, inputs(), pressed.state, 1);
    expect(released.state.relays.k1).toBe(true);
    expect(released.solenoids['1y1']).toBe(true);
    const [start, hold] = example.paths[0].conditions[0];
    expect(released.elements[start.id].closed).toBe(false);
    expect(released.elements[hold.id].closed).toBe(true);
  });

  it('the break contact of 1B2 drops the holding circuit when the cylinder reaches its end', () => {
    const holding = run(example, inputs(['S5'])).state;
    const dropped = run(example, inputs([], ['1B2']), holding);
    expect(dropped.state.relays.k1).toBe(false);
    expect(dropped.solenoids['1y1']).toBe(false);
    // and it stays dropped once 1B2 releases, until START is pressed again
    expect(run(example, inputs(), dropped.state, 0.5).state.relays.k1).toBeFalsy();
  });

  it('a normally-closed pushbutton conducts until pressed', () => {
    const circuit = single([[makeElement('pushbutton', 'S0', { form: 'NC' })]], makeElement('solenoid', '1Y1'));
    expect(run(circuit, inputs()).solenoids['1y1']).toBe(true);
    expect(run(circuit, inputs(['S0'])).solenoids['1y1']).toBe(false);
  });

  it('series conditions are AND and parallel branches are OR', () => {
    const circuit = single([[makeElement('sensor', '1B1'), makeElement('sensor', '1B2')], [makeElement('pushbutton', 'S1')]], makeElement('solenoid', '1Y1'));
    expect(run(circuit, inputs(['S1'])).solenoids['1y1']).toBe(false);
    expect(run(circuit, inputs(['S1'], ['1B1'])).solenoids['1y1']).toBe(true);
    expect(run(circuit, inputs(['S1'], ['1B2'])).solenoids['1y1']).toBe(true);
    expect(run(circuit, inputs([], ['1B1', '1B2'])).solenoids['1y1']).toBe(false);
  });

  it('marks how far the current reaches down a path that is interrupted', () => {
    const circuit = single([[makeElement('sensor', '1B1')], [makeElement('sensor', '1B2')], [makeElement('sensor', '1B3')]], makeElement('solenoid', '1Y1'));
    const result = run(circuit, inputs([], ['1B1']));
    expect(result.paths[circuit.paths[0].id]).toEqual({ groupLive: [true, true, false], groupClosed: [true, false, false], energised: false });
  });

  it('tags are matched case-insensitively and ignore KaTeX delimiters', () => {
    const circuit = single([[makeElement('sensor', '$1b1$')]], makeElement('solenoid', ' 1y1 '));
    expect(run(circuit, inputs([], ['1B1'])).solenoids['1y1']).toBe(true);
  });

  it('chains relays within a tick: K1 to K2 to the solenoid', () => {
    const circuit: LadderCircuit = {
      paths: [
        ...single([[makeElement('pushbutton', 'S1')]], makeElement('relayCoil', 'K1')).paths,
        ...single([[makeElement('relayContact', 'K1')]], makeElement('relayCoil', 'K2')).paths,
        ...single([[makeElement('relayContact', 'K2')]], makeElement('solenoid', '1Y1')).paths,
      ],
    };
    const result = stepLadder(circuit, inputs(['S1']), EMPTY_LADDER_STATE, 0.016);
    expect(result.state.relays).toEqual({ k1: true, k2: true });
    expect(result.solenoids['1y1']).toBe(true);
  });

  it('a relay that opens its own coil never loops forever: one pass per tick', () => {
    const buzzer = single([[makeElement('relayContact', 'K1', { form: 'NC' })]], makeElement('relayCoil', 'K1'));
    const first = stepLadder(buzzer, inputs(), EMPTY_LADDER_STATE, 0.016);
    expect(first.state.relays.k1).toBe(true);
    expect(stepLadder(buzzer, inputs(), first.state, 0.016).state.relays.k1).toBe(false);
  });

  it('a tag shared by two coils is energised when either path conducts', () => {
    const circuit: LadderCircuit = {
      paths: [
        ...single([[makeElement('sensor', '1B1')]], makeElement('solenoid', '1Y1')).paths,
        ...single([[makeElement('sensor', '1B2')]], makeElement('solenoid', '1Y1')).paths,
      ],
    };
    expect(run(circuit, inputs([], ['1B2'])).solenoids['1y1']).toBe(true);
    expect(run(circuit, inputs()).solenoids['1y1']).toBe(false);
  });

  it('idleLadder reports an unpowered circuit', () => {
    const result = idleLadder(example);
    expect(result.state.relays).toEqual({ k1: false });
    expect(Object.values(result.solenoids)).toEqual([false]);
  });
});

describe('timers', () => {
  const timerCircuit = (mode: 'on' | 'off', delay = 1): LadderCircuit => ({
    paths: [
      ...single([[makeElement('pushbutton', 'S1')]], makeElement('timerCoil', 'KT1', { mode, delay })).paths,
      ...single([[makeElement('timerContact', 'KT1')]], makeElement('solenoid', '1Y1')).paths,
    ],
  });

  it('on-delay: the timed contact closes only after the delay and opens at once on release', () => {
    const circuit = timerCircuit('on');
    const early = run(circuit, inputs(['S1']), EMPTY_LADDER_STATE, 0.5);
    expect(early.solenoids['1y1']).toBe(false);
    const late = run(circuit, inputs(['S1']), early.state, 0.6);
    expect(late.solenoids['1y1']).toBe(true);
    expect(run(circuit, inputs(), late.state, 0.016).solenoids['1y1']).toBe(false);
  });

  it('on-delay: releasing before the delay resets the count', () => {
    const circuit = timerCircuit('on');
    const partial = run(circuit, inputs(['S1']), EMPTY_LADDER_STATE, 0.8);
    const reset = run(circuit, inputs(), partial.state, 0.032);
    expect(reset.state.timers.kt1.elapsed).toBe(0);
    expect(run(circuit, inputs(['S1']), reset.state, 0.5).solenoids['1y1']).toBe(false);
  });

  it('off-delay: the contact closes at once and opens after the delay once the coil drops', () => {
    const circuit = timerCircuit('off');
    const on = run(circuit, inputs(['S1']), EMPTY_LADDER_STATE, 0.032);
    expect(on.solenoids['1y1']).toBe(true);
    const during = run(circuit, inputs(), on.state, 0.5);
    expect(during.solenoids['1y1']).toBe(true);
    const after = run(circuit, inputs(), during.state, 0.6);
    expect(after.solenoids['1y1']).toBe(false);
  });
});

describe('cross references', () => {
  it('lists the paths that use the make and break contacts of each relay', () => {
    const circuit = startStopExample();
    const extra = addSeries(circuit, circuit.paths[1].id, makeElement('relayContact', 'K1', { form: 'NC' }));
    expect(crossReferences(extra)).toEqual([{ pathNumber: 1, tag: 'K1', no: [1, 2], nc: [2] }]);
  });

  it('only lists relay and timer coils, not solenoids', () => {
    expect(crossReferences(startStopExample()).map(reference => reference.tag)).toEqual(['K1']);
  });
});

describe('persistence', () => {
  it('round-trips a circuit through JSON', () => {
    const circuit = startStopExample();
    expect(sanitizeLadder(JSON.parse(JSON.stringify(circuit)))).toEqual(circuit);
  });

  it('drops malformed paths, groups and elements instead of throwing', () => {
    const cleaned = sanitizeLadder({
      paths: [
        { id: 'p1', conditions: [[{ id: 'e1', kind: 'sensor', tag: '1B1', form: 'XX' }, { id: 'e2', kind: 'bogus', tag: 'x' }], [], 'nope'], load: { id: 'l', kind: 'sensor', tag: 'wrong-kind' } },
        { nope: true },
      ],
    });
    expect(cleaned.paths).toEqual([{ id: 'p1', conditions: [[{ id: 'e1', kind: 'sensor', tag: '1B1' }]], load: null }]);
    expect(sanitizeLadder(undefined).paths).toEqual([]);
    expect(sanitizeLadder({ paths: 5 }).paths).toEqual([]);
  });
});
