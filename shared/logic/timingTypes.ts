/** Waveform data model and track helpers (pure data; the evaluation lives on the server). */
export type WaveformValue = 0 | 1 | 'X' | 'Z';
export type WaveformType = 'input' | 'output' | 'clock';

export interface Waveform {
  name: string;
  type: WaveformType;
  data: WaveformValue[];
}

export interface TimingHazard {
  tick: number;
  kind: 'static' | 'dynamic';
  transientValues: Array<0 | 1>;
}

export interface TimingEvaluation {
  expressionLatex: string;
  rawOutput: Waveform;
  output: Waveform;
  risingEdges: number[];
  hazards: TimingHazard[];
}

export interface TimingEvaluationOptions {
  delayTicks?: number;
  outputName?: string;
}

export const createClockWaveform = (ticks: number, name = 'CLK'): Waveform => ({
  name,
  type: 'clock',
  data: Array.from({ length: Math.max(1, ticks) }, (_, tick) => tick % 2 as 0 | 1),
});

export const createInputWaveform = (name: string, ticks: number, initialValue: 0 | 1 = 0): Waveform => ({
  name,
  type: 'input',
  data: Array(Math.max(1, ticks)).fill(initialValue),
});

export const clockRisingEdges = (clock: Waveform): number[] => clock.data.flatMap((value, tick) => tick > 0 && clock.data[tick - 1] === 0 && value === 1 ? [tick] : []);

export const extendWaveform = (waveform: Waveform, cycles = 1): Waveform => ({
  ...waveform,
  data: [...waveform.data, ...Array(Math.max(1, cycles)).fill(waveform.data.at(-1) ?? 0)],
});
