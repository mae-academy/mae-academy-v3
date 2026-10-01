/** Time-domain synthesis from returned Fourier-series coefficients (drawn at slider speed, so it stays beside the plots). */
import type { FourierSeriesResult } from "./results";

export function partialSum(series: FourierSeriesResult, time: number, harmonics: number) {
  return series.coefficients.filter((coefficient) => Math.abs(coefficient.harmonic) <= harmonics).reduce((sum, coefficient) => sum + coefficient.real * Math.cos(coefficient.harmonic * series.omega0 * time) - coefficient.imaginary * Math.sin(coefficient.harmonic * series.omega0 * time), 0);
}

export function partialSumCurve(series: FourierSeriesResult, harmonics: number, from = -3, to = 3, samples = 520) { return Array.from({ length: samples + 1 }, (_, index) => { const time = from + (to - from) * index / samples; return { time, value: partialSum(series, time, harmonics) }; }); }

export function waterfallHarmonics(series: FourierSeriesResult, maxHarmonics = 10, samples = 130) {
  return series.coefficients.filter((coefficient) => Math.abs(coefficient.harmonic) <= maxHarmonics).map((coefficient) => {
    const time = Array.from({ length: samples }, (_, index) => -series.period / 2 + series.period * index / (samples - 1));
    const amplitude = time.map((value) => coefficient.real * Math.cos(coefficient.harmonic * series.omega0 * value) - coefficient.imaginary * Math.sin(coefficient.harmonic * series.omega0 * value));
    return { harmonic: coefficient.harmonic, time, amplitude };
  });
}
