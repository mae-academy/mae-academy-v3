import { describe, expect, it } from 'vitest';
import { MIN_STEP_COLUMNS, cycleView, displacementTrace, emptyTracker, readingsFromPositions, sensorMarks, signalLinks, trackSample as track, type CycleTracker } from './functionDiagram';

const trackSample = (tracker: CycleTracker, time: number, positions: Record<string, number>) => track(tracker, time, readingsFromPositions(positions));

type Positions = Record<string, number>;
const feed = (samples: Array<[number, Positions]>, from: CycleTracker = emptyTracker()) => samples.reduce((tracker, [time, positions]) => trackSample(tracker, time, positions), from);
const at = (a: number, b: number): Positions => ({ a, b });

/** 1A+ → 2A+ → 1A− → 2A−, each stroke taking 0.2 s, in 0.1 s snapshots. */
const SEQUENCE: Array<[number, Positions]> = [
  [0, at(0, 0)], [0.1, at(0.5, 0)], [0.2, at(1, 0)],
  [0.3, at(1, 0.5)], [0.4, at(1, 1)],
  [0.5, at(0.5, 1)], [0.6, at(0, 1)],
  [0.7, at(0, 0.5)], [0.8, at(0, 0)],
];
const names = (tracker: CycleTracker) => tracker.steps.map(step => step.moves.map(move => `${move.cylinderId}${move.direction === 1 ? '+' : '-'}`));

describe('sequence tracking', () => {
  it('tracks nothing until a piston leaves its end', () => {
    const tracker = feed([[0, at(0, 0)], [1, at(0, 0)]]);
    expect(tracker.steps).toEqual([]);
    expect(tracker.initial).toEqual({ a: 0, b: 0 });
    expect(cycleView(tracker).playhead).toBe(0);
    expect(cycleView(emptyTracker()).playhead).toBeNull();
  });

  it('reads 1A+ → 2A+ → 1A− → 2A− as four steps and closes the cycle when the circuit is back at its start', () => {
    const tracker = feed(SEQUENCE);
    expect(names(tracker)).toEqual([['a+'], ['b+'], ['a-'], ['b-']]);
    expect(tracker.cycleLength).toBe(4);
    const view = cycleView(tracker);
    expect([view.columns, view.complete, view.labels]).toEqual([4, true, [1, 2, 3, 4, 1]]);
    expect(view.playhead).toBe(4);
  });

  it('keeps the grid at four columns while the first cycle is still open, and draws the stroke in progress up to the piston', () => {
    const tracker = feed(SEQUENCE.slice(0, 4));
    const view = cycleView(tracker);
    expect([view.columns, view.complete, view.labels]).toEqual([MIN_STEP_COLUMNS, false, [1, 2, 3, 4, 1]]);
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [1.5, 1]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [1.5, 0.5]]);
    expect(view.playhead).toBeCloseTo(1.5);
  });

  it('draws straight ramps across one column and flat dwells, nothing curved', () => {
    const view = cycleView(feed(SEQUENCE));
    expect(displacementTrace(view, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 0], [4, 0]]);
    expect(displacementTrace(view, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 0]]);
  });

  it('marks the switch made at the end of every stroke', () => {
    expect(sensorMarks(cycleView(feed(SEQUENCE))).map(mark => [mark.cylinderId, mark.line, mark.end])).toEqual([['a', 1, 'extended'], ['b', 2, 'extended'], ['a', 3, 'retracted'], ['b', 4, 'retracted']]);
  });

  it('links the switch that trips at the end of a step to the stroke it starts', () => {
    expect(signalLinks(cycleView(feed(SEQUENCE)))).toEqual([
      { line: 1, from: { cylinderId: 'a', level: 1 }, to: { cylinderId: 'b', level: 0 } },
      { line: 2, from: { cylinderId: 'b', level: 1 }, to: { cylinderId: 'a', level: 1 } },
      { line: 3, from: { cylinderId: 'a', level: 0 }, to: { cylinderId: 'b', level: 1 } },
    ]);
  });

  it('finishes a stroke that arrives in the same snapshot in which another piston sets off', () => {
    // 2A+ arrives (0.9) in the very snapshot in which 1A− has left: 1A− opens step 3 before 2A+'s arrival is processed.
    const tracker = feed([
      [0, at(0, 0)], [0.1, at(0.5, 0)], [0.2, at(1, 0)], [0.3, at(1, 0.5)], [0.6, at(1, 0.8)],
      [0.9, at(0.8, 1)], [1.0, at(0.3, 1)], [1.1, at(0, 1)], [1.2, at(0, 0.5)], [1.3, at(0, 0)],
    ]);
    expect(names(tracker)).toEqual([['a+'], ['b+'], ['a-'], ['b-']]);
    expect(tracker.steps.every(step => step.moves.every(move => move.end !== null))).toBe(true);
    expect(tracker.cycleLength).toBe(4);
  });

  it('puts strokes that start together into one step', () => {
    const tracker = feed([[0, at(0, 0)], [0.1, at(0.5, 0.5)], [0.2, at(1, 1)], [0.3, at(0.5, 0.5)], [0.4, at(0, 0)]]);
    expect(names(tracker)).toEqual([['a+', 'b+'], ['a-', 'b-']]);
    expect(tracker.cycleLength).toBe(2);
  });

  it('counts a stroke that crossed its whole length between two snapshots', () => {
    const tracker = feed([[0, at(0, 0)], [1, at(1, 0)], [2, at(0, 0)]]);
    expect(names(tracker)).toEqual([['a+'], ['a-']]);
    expect(tracker.cycleLength).toBe(2);
  });

  it('forgets a piston that left its end and went back', () => {
    const tracker = feed([[0, at(0, 0)], [0.1, at(0.4, 0)], [0.2, at(0, 0)]]);
    expect(tracker.steps).toEqual([]);
    expect(tracker.stepNumber).toBe(0);
  });

  it('ignores a snapshot that is not newer than the last', () => {
    const tracker = feed(SEQUENCE.slice(0, 3));
    expect(trackSample(tracker, 0.2, at(0, 0))).toBe(tracker);
  });
});

describe('looping the cycle', () => {
  const loop = (offset: number): Array<[number, Positions]> => SEQUENCE.slice(1).map(([time, positions]) => [time + offset, positions]);

  it('freezes the first cycle: the next loop only moves the playhead and never adds steps or columns', () => {
    const first = feed(SEQUENCE);
    const frozen = cycleView(first);
    const midway = feed(loop(1).slice(0, 1), first);
    expect(midway.steps).toBe(first.steps);
    expect(midway.cycleLength).toBe(4);
    const view = cycleView(midway);
    expect(view.columns).toBe(4);
    expect(view.steps).toEqual(frozen.steps);
    expect(view.cycleNumber).toBe(2);
    expect(view.playhead).toBeCloseTo(0.5); // 1A+ again, halfway: the playhead wrapped back into step 1
  });

  it('carries the playhead across the steps of every loop and wraps at the cycle length', () => {
    let tracker = feed(SEQUENCE);
    const heads: number[] = [];
    for (const [time, positions] of loop(1)) {
      tracker = trackSample(tracker, time, positions);
      heads.push(cycleView(tracker).playhead as number);
    }
    expect(heads.every(head => head >= 0 && head <= 4)).toBe(true);
    expect(heads[heads.length - 1]).toBe(4);
    expect(heads.slice(0, 2).every(head => head <= 1)).toBe(true);
    expect(cycleView(tracker).cycleNumber).toBe(2);
    // a third loop leaves the diagram exactly as it was
    const third = feed(loop(3), tracker);
    expect(cycleView(third).steps).toEqual(cycleView(feed(SEQUENCE)).steps);
    expect(cycleView(third).cycleNumber).toBe(3);
    expect(third.stepNumber).toBe(12);
  });
});
