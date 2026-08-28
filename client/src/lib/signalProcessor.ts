export interface TimeVoltageSample { t: number; v: number }

export class SignalProcessor {
  constructor(public readonly samples: TimeVoltageSample[]) {}

  dcAverage(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((total, sample) => total + sample.v, 0) / this.samples.length;
  }

  trueRms(): number {
    if (!this.samples.length) return 0;
    return Math.sqrt(this.samples.reduce((total, sample) => total + sample.v ** 2, 0) / this.samples.length);
  }

  acRms(): number {
    const average = this.dcAverage();
    if (!this.samples.length) return 0;
    return Math.sqrt(this.samples.reduce((total, sample) => total + (sample.v - average) ** 2, 0) / this.samples.length);
  }

  peakToPeak(): number {
    if (!this.samples.length) return 0;
    const values = this.samples.map((sample) => sample.v);
    return Math.max(...values) - Math.min(...values);
  }

  /** Average period between rising zero crossings, using linear interpolation for sub-sample accuracy. */
  frequency(): number {
    const crossings: number[] = [];
    for (let index = 1; index < this.samples.length; index += 1) {
      const previous = this.samples[index - 1];
      const current = this.samples[index];
      if (previous.v < 0 && current.v >= 0) {
        const ratio = (0 - previous.v) / (current.v - previous.v || 1);
        crossings.push(previous.t + ratio * (current.t - previous.t));
      }
    }
    if (crossings.length < 2) return 0;
    const periods = crossings.slice(1).map((crossing, index) => crossing - crossings[index]).filter((period) => period > 0);
    return periods.length ? 1 / (periods.reduce((sum, period) => sum + period, 0) / periods.length) : 0;
  }

  risingEdgeIndex(level = 0): number {
    for (let index = 1; index < this.samples.length; index += 1) {
      if (this.samples[index - 1].v < level && this.samples[index].v >= level) return index;
    }
    return 0;
  }
}

/** Deterministic source trace for the current DC-only topology engine: a settled DC step. */
export function createDcStepSamples(value: number, duration = 0.1, count = 1200): TimeVoltageSample[] {
  const stepAt = duration * 0.1;
  return Array.from({ length: count }, (_, index) => {
    const t = (index / Math.max(1, count - 1)) * duration;
    return { t, v: t < stepAt ? 0 : value };
  });
}

/** Constant source samples from the current DC topology model; suitable for exact DC metering. */
export function createDcSamples(value: number, duration = 0.1, count = 1200): TimeVoltageSample[] {
  return Array.from({ length: count }, (_, index) => ({ t: (index / Math.max(1, count - 1)) * duration, v: value }));
}
