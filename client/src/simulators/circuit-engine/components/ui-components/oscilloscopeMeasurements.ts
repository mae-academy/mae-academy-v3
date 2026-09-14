/* Pure waveform statistics shared by OscilloscopeTracePanel and MeasurementTable. Vrms/frequency
   already come from the SPICE engine's InstrumentReading — only the two it doesn't compute live here. */
import type { SamplePoint } from '@/simulators/circuit-engine/models/circuitTypes';
import { getVmean } from '@/simulators/circuit-engine/engine/spice/spiceParser';
import { OSCILLOSCOPE_TIME_DIV_PRESETS, OSCILLOSCOPE_VOLT_DIV_PRESETS } from '@/simulators/circuit-engine/models/componentDefs';

// Matches OscilloscopeTracePanel's own GRID_DIVS_X — not imported from there to avoid a circular
// import (that module imports calculateVdc/calculateVpp from this one).
const GRID_DIVS_X = 10;

/**
 * DC component: the time-weighted mean over whole periods, delegating to the same `getVmean` the
 * SPICE bridge uses for every other reading. ngspice's `.tran` timestep is adaptive — samples
 * cluster on fast edges — so a plain arithmetic mean over `samples` would be measurably biased
 * toward whatever the solver zoomed in on, not the waveform's actual DC level.
 */
export function calculateVdc(samples: SamplePoint[]): number {
  if (samples.length === 0) return 0;
  return getVmean(samples.map(sample => sample.value), samples.map(sample => sample.time));
}

/** Peak-to-peak: max minus min over the sampled window. */
export function calculateVpp(samples: SamplePoint[]): number {
  if (samples.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const sample of samples) {
    if (sample.value < min) min = sample.value;
    if (sample.value > max) max = sample.value;
  }
  return max - min;
}

export interface AutoscaleResult {
  offset: number;
  voltDiv: number;
  timeDiv: number;
  timeShift: number;
}

/**
 * Fits offset/Volt-Div/Time-Div to the channel's actual captured samples — using the real detected
 * `frequency` (from the SPICE reading) rather than guessing one from the capture duration, and
 * respecting the same "don't pick a Time/Div the capture can't back up" cap the manual stepper uses
 * (see maxFeasibleTimeDivIndex in OscilloscopeComponentPanel.tsx). Resets timeShift to 0 — autoscale
 * means "show me the whole thing," not "keep my current scroll position."
 */
export function calculateAutoscale(samples: SamplePoint[], frequencyHz: number): AutoscaleResult {
  if (samples.length < 2) {
    return { offset: 0, voltDiv: OSCILLOSCOPE_VOLT_DIV_PRESETS[4], timeDiv: OSCILLOSCOPE_TIME_DIV_PRESETS[6], timeShift: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const sample of samples) {
    if (sample.value < min) min = sample.value;
    if (sample.value > max) max = sample.value;
  }
  const peakToPeak = Math.max(max - min, 1e-9);
  const offset = (max + min) / 2;

  // Fit the swing within 6 of the 8 vertical divisions, leaving headroom top and bottom.
  const requiredVoltDiv = peakToPeak / 6;
  const voltDiv = OSCILLOSCOPE_VOLT_DIV_PRESETS.find(preset => preset >= requiredVoltDiv)
    ?? OSCILLOSCOPE_VOLT_DIV_PRESETS[OSCILLOSCOPE_VOLT_DIV_PRESETS.length - 1];

  const dataSpanSeconds = samples[samples.length - 1].time - samples[0].time;
  // ~3 periods on screen when a frequency was actually detected; the full capture otherwise (a DC
  // level, or a signal too quiet/short for getFrequency to find one).
  const desiredWindow = frequencyHz > 0 ? 3 / frequencyHz : dataSpanSeconds;
  const requiredTimeDiv = Math.max(desiredWindow / GRID_DIVS_X, 1e-9);
  const feasible = OSCILLOSCOPE_TIME_DIV_PRESETS.filter(preset => preset * GRID_DIVS_X <= dataSpanSeconds + 1e-12);
  const candidates = feasible.length > 0 ? feasible : [OSCILLOSCOPE_TIME_DIV_PRESETS[0]];
  const timeDiv = candidates.find(preset => preset >= requiredTimeDiv) ?? candidates[candidates.length - 1];

  // Calculate required Volt/Div and Time/Div, and strictly reset offset and timeShift to 0
  // placing physical sliders dead-center.
  return { offset: 0, voltDiv, timeDiv, timeShift: 0 };
}
