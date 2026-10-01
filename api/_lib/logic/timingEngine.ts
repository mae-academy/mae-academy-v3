/** Timing Waveforms — pure tick-based Boolean timing and hazard analysis. */
import { evaluateAst, parseBooleanExpression } from '../../../shared/logic/logicEngine';
import { clockRisingEdges, type TimingEvaluation, type TimingEvaluationOptions, type TimingHazard, type Waveform, type WaveformValue } from '../../../shared/logic/timingTypes';

const isKnown = (value: WaveformValue): value is 0 | 1 => value === 0 || value === 1;
const allKnown = (context: Record<string, WaveformValue>) => Object.values(context).every(isKnown);
const booleanContext = (context: Record<string, WaveformValue>): Record<string, boolean> => Object.fromEntries(Object.entries(context).map(([name, value]) => [name, value === 1]));

const contextAt = (inputTracks: readonly Waveform[], tick: number): Record<string, WaveformValue> => Object.fromEntries(inputTracks.map(track => [track.name, track.data[Math.min(tick, track.data.length - 1)] ?? 'X']));
const evaluateAt = (ast: ReturnType<typeof parseBooleanExpression>['ast'], context: Record<string, WaveformValue>): WaveformValue => allKnown(context) ? evaluateAst(ast, booleanContext(context)) ? 1 : 0 : 'X';

const detectHazards = (ast: ReturnType<typeof parseBooleanExpression>['ast'], inputTracks: readonly Waveform[], tickCount: number, rawOutput: readonly WaveformValue[]): TimingHazard[] => {
  const hazards: TimingHazard[] = [];
  for (let tick = 1; tick < tickCount; tick += 1) {
    const previous = contextAt(inputTracks, tick - 1);
    const current = contextAt(inputTracks, tick);
    const changed = inputTracks.filter(track => previous[track.name] !== current[track.name]);
    if (changed.length < 2 || !allKnown(previous) || !allKnown(current)) continue;
    const transientValues: Array<0 | 1> = [rawOutput[tick - 1] as 0 | 1];
    const transitional = { ...previous };
    changed.sort((left, right) => left.name.localeCompare(right.name)).forEach(track => {
      transitional[track.name] = current[track.name];
      const value = evaluateAt(ast, transitional);
      if (isKnown(value) && value !== transientValues[transientValues.length - 1]) transientValues.push(value);
    });
    if (transientValues.length > 2 || (rawOutput[tick - 1] === rawOutput[tick] && transientValues.length > 1)) {
      hazards.push({ tick, kind: rawOutput[tick - 1] === rawOutput[tick] ? 'static' : 'dynamic', transientValues });
    }
  }
  return hazards;
};

export const evaluateTimingWaveforms = (expression: string, inputTracks: readonly Waveform[], clock: Waveform, options: TimingEvaluationOptions = {}): TimingEvaluation => {
  const parsed = parseBooleanExpression(expression);
  const delayTicks = Math.max(0, Math.floor(options.delayTicks ?? 1));
  const tickCount = Math.max(clock.data.length, ...inputTracks.map(track => track.data.length));
  if (inputTracks.some(track => track.type !== 'input')) throw new Error('Timing input tracks must have type input.');
  const available = new Set(inputTracks.map(track => track.name));
  const missing = parsed.variables.find(variable => !available.has(variable));
  if (missing) throw new Error(`Missing timing input waveform for variable ${missing}.`);
  const rawData = Array.from({ length: tickCount }, (_, tick) => evaluateAt(parsed.ast, contextAt(inputTracks, tick)));
  const delayedData = rawData.map((_, tick) => rawData[Math.max(0, tick - delayTicks)]);
  return {
    expressionLatex: parsed.latex,
    rawOutput: { name: options.outputName ?? 'F', type: 'output', data: rawData },
    output: { name: options.outputName ?? 'F', type: 'output', data: delayedData },
    risingEdges: clockRisingEdges(clock),
    hazards: detectHazards(parsed.ast, inputTracks, tickCount, rawData),
  };
};

