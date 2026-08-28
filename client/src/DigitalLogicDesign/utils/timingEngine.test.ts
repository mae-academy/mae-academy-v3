import { describe, expect, it } from 'vitest';
import { createClockWaveform, createInputWaveform, evaluateTimingWaveforms } from './timingEngine';

describe('timingEngine', () => {
  it('creates deterministic clock cycles and reports rising edges', () => {
    const clock = createClockWaveform(6);
    expect(clock.data).toEqual([0, 1, 0, 1, 0, 1]);
    expect(evaluateTimingWaveforms('A', [{ ...createInputWaveform('A', 6), data: [0, 0, 1, 1, 0, 0] }], clock).risingEdges).toEqual([1, 3, 5]);
  });

  it('delays the evaluated output by one tick without changing Boolean evaluation', () => {
    const result = evaluateTimingWaveforms('A*B', [
      { name: 'A', type: 'input', data: [0, 1, 1, 0] },
      { name: 'B', type: 'input', data: [0, 0, 1, 1] },
    ], createClockWaveform(4));
    expect(result.rawOutput.data).toEqual([0, 0, 1, 0]);
    expect(result.output.data).toEqual([0, 0, 0, 1]);
  });

  it('records a static hazard when two same-tick changes transiently toggle the output', () => {
    const result = evaluateTimingWaveforms('A^B', [
      { name: 'A', type: 'input', data: [0, 1, 0] },
      { name: 'B', type: 'input', data: [1, 0, 1] },
    ], createClockWaveform(3));
    expect(result.rawOutput.data).toEqual([1, 1, 1]);
    expect(result.hazards).toContainEqual({ tick: 1, kind: 'static', transientValues: [1, 0, 1] });
  });

  it('propagates unknown logic states and rejects missing input tracks', () => {
    expect(evaluateTimingWaveforms('A+B', [
      { name: 'A', type: 'input', data: [0, 'X'] },
      { name: 'B', type: 'input', data: [0, 0] },
    ], createClockWaveform(2), { delayTicks: 0 }).output.data).toEqual([0, 'X']);
    expect(() => evaluateTimingWaveforms('A+B', [createInputWaveform('A', 2)], createClockWaveform(2))).toThrow('Missing timing input waveform for variable B');
  });
});
