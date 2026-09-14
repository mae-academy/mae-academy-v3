/* Pure waveform statistics shared by OscilloscopeTracePanel and MeasurementTable. Vrms/frequency
   already come from the SPICE engine's InstrumentReading — only the two it doesn't compute live here. */
import type { SamplePoint } from '@/simulators/circuit-engine/models/circuitTypes';

/** DC component: the mean value over the sampled window. */
export function calculateVdc(samples: SamplePoint[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
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
