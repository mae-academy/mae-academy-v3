/**
 * MAE Academy / Signals & Systems — Tab D Fourier analysis core.
 * Pure numerical/symbolic math only: no React, Canvas, Plotly, or DOM references.
 */
import { evaluateSignal, type SignalNode } from "./signalEngine";

export type ComplexCoefficient = { harmonic: number; real: number; imaginary: number; magnitude: number; phase: number };
export type SpectrumPoint = { omega: number; real: number; imaginary: number; magnitude: number; phase: number };
export type FourierSeriesResult = { period: number; omega0: number; coefficients: ComplexCoefficient[]; derivation: string[] };
export type FourierTransformResult = { scale: number; spectrum: SpectrumPoint[]; isStandardRect: boolean; derivation: string[] };

const EPSILON = 1e-10;
const format = (value: number, digits = 5) => Number(value.toFixed(digits)).toString();
const clampPositive = (value: number) => Math.max(0.05, Math.abs(value));
const canonicalRect = (node: SignalNode): boolean => node.kind === "function" && node.name === "rect" && node.argument.kind === "variable" && node.argument.name === "t";

function trapezoidComplex(sample: (time: number) => number, from: number, to: number, intervals: number, omega: number) {
  const step = (to - from) / intervals; let real = 0; let imaginary = 0;
  for (let index = 0; index <= intervals; index += 1) { const time = from + index * step; const weight = index === 0 || index === intervals ? 0.5 : 1; const value = sample(time); real += weight * value * Math.cos(omega * time); imaginary -= weight * value * Math.sin(omega * time); }
  return { real: real * step, imaginary: imaginary * step };
}

export function fourierSeries(node: SignalNode, period: number, harmonics = 18, intervals = 2400): FourierSeriesResult {
  const safePeriod = clampPositive(period); const omega0 = (2 * Math.PI) / safePeriod; const coefficients: ComplexCoefficient[] = [];
  for (let harmonic = -harmonics; harmonic <= harmonics; harmonic += 1) { const result = trapezoidComplex((time) => evaluateSignal(node, time), -safePeriod / 2, safePeriod / 2, intervals, harmonic * omega0); const real = result.real / safePeriod; const imaginary = result.imaginary / safePeriod; coefficients.push({ harmonic, real, imaginary, magnitude: Math.hypot(real, imaginary), phase: Math.hypot(real, imaginary) < EPSILON ? 0 : Math.atan2(imaginary, real) }); }
  return { period: safePeriod, omega0, coefficients, derivation: ["\\omega_0=\\frac{2\\pi}{T_0}", "c_k=\\frac{1}{T_0}\\int_{-T_0/2}^{T_0/2}x(t)e^{-jk\\omega_0t}\\,dt", `T_0=${format(safePeriod)},\\qquad\\omega_0=${format(omega0)}`] };
}

export function partialSum(series: FourierSeriesResult, time: number, harmonics: number) {
  return series.coefficients.filter((coefficient) => Math.abs(coefficient.harmonic) <= harmonics).reduce((sum, coefficient) => sum + coefficient.real * Math.cos(coefficient.harmonic * series.omega0 * time) - coefficient.imaginary * Math.sin(coefficient.harmonic * series.omega0 * time), 0);
}

export function partialSumCurve(series: FourierSeriesResult, harmonics: number, from = -3, to = 3, samples = 520) { return Array.from({ length: samples + 1 }, (_, index) => { const time = from + (to - from) * index / samples; return { time, value: partialSum(series, time, harmonics) }; }); }

export function fourierTransform(node: SignalNode, scale = 1, omegaRange = 16, samples = 320, timeWindow = 10, intervals = 3200): FourierTransformResult {
  const safeScale = clampPositive(scale); const spectrum: SpectrumPoint[] = []; const isStandardRect = canonicalRect(node);
  for (let index = 0; index <= samples; index += 1) { const omega = -omegaRange + (2 * omegaRange) * index / samples; let real: number; let imaginary: number;
    if (isStandardRect) { const argument = omega / (2 * Math.PI * safeScale); const amplitude = Math.abs(argument) < EPSILON ? 1 / safeScale : Math.sin(Math.PI * argument) / (Math.PI * argument) / safeScale; real = amplitude; imaginary = 0; }
    else { const result = trapezoidComplex((time) => evaluateSignal(node, safeScale * time), -timeWindow, timeWindow, intervals, omega); real = result.real; imaginary = result.imaginary; }
    const magnitude = Math.hypot(real, imaginary); spectrum.push({ omega, real, imaginary, magnitude, phase: magnitude < EPSILON ? 0 : Math.atan2(imaginary, real) }); }
  const derivation = isStandardRect ? [`x(at)=\\operatorname{rect}(at)`, `X_a(j\\omega)=\\frac{1}{|a|}\\operatorname{sinc}\\!\\left(\\frac{\\omega}{2\\pi a}\\right)`, `a=${format(safeScale)}`] : ["X(j\\omega)=\\int_{-\\infty}^{\\infty}x(t)e^{-j\\omega t}\\,dt", `X_a(j\\omega)=\\int x(${format(safeScale)}t)e^{-j\\omega t}\\,dt`];
  return { scale: safeScale, spectrum, isStandardRect, derivation };
}

export function waterfallHarmonics(series: FourierSeriesResult, maxHarmonics = 10, samples = 130) {
  return series.coefficients.filter((coefficient) => Math.abs(coefficient.harmonic) <= maxHarmonics).map((coefficient) => {
    const time = Array.from({ length: samples }, (_, index) => -series.period / 2 + series.period * index / (samples - 1));
    const amplitude = time.map((value) => coefficient.real * Math.cos(coefficient.harmonic * series.omega0 * value) - coefficient.imaginary * Math.sin(coefficient.harmonic * series.omega0 * value));
    return { harmonic: coefficient.harmonic, time, amplitude };
  });
}
