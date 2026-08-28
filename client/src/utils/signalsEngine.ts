/**
 * MAE Academy / Signals & Systems — Piecewise Signal Engine.
 *
 * Architectural boundary: this module owns signal semantics, symbolic impulses,
 * transformation rules, sampling boundaries, and numerical/analytic properties.
 * It deliberately contains no React, DOM, Canvas, or SVG concerns.
 */

export type BasicSignalKind = "step" | "ramp" | "rect" | "tri" | "sinc" | "sa" | "signum" | "sine" | "cosine" | "dirac";
export type SignalClassification = "Energy Signal" | "Power Signal" | "Neither" | "Symbolic Distribution";

export type SignalSelection = {
  kind: BasicSignalKind;
  frequencyHz?: number;
  phaseRad?: number;
};

export type SignalTransform = {
  amplitude: number;
  timeScale: number;
  timeShift: number;
};

export type SignalOperation = {
  primary: SignalSelection;
  secondary?: SignalSelection;
  transform: SignalTransform;
};

export type SymbolicImpulse = {
  time: number;
  weight: number;
  latex: string;
  label: string;
};

export type SignalSample = { time: number; value: number };
export type SignalSegment = SignalSample[];

export type SignalAnalysis = {
  classification: SignalClassification;
  energy: number | null;
  power: number | null;
  fundamentalFrequencyHz: number | null;
  fundamentalPeriodSeconds: number | null;
  method: "analytic" | "period-average" | "bounded-numeric" | "symbolic";
  warnings: string[];
};

export type PiecewiseSignalModel = {
  operation: SignalOperation;
  equationLatex: string;
  impulses: SymbolicImpulse[];
  breakpoints: number[];
  analysis: SignalAnalysis;
  valueAt: (time: number) => number;
};

const EPSILON = 1e-9;
const FINITE_ENERGY_KINDS = new Set<BasicSignalKind>(["rect", "tri", "sinc", "sa"]);
const PERIODIC_KINDS = new Set<BasicSignalKind>(["sine", "cosine"]);

export const SIGNAL_DICTIONARY: Record<BasicSignalKind, { label: string; latex: string; description: string }> = {
  step: { label: "Unit step", latex: "u(t)", description: "0 for t < 0; 1 for t ≥ 0" },
  ramp: { label: "Ramp", latex: "r(t)", description: "0 for t < 0; t for t ≥ 0" },
  rect: { label: "Rectangular pulse", latex: "\\operatorname{rect}(t)", description: "1 on [−0.5, 0.5]" },
  tri: { label: "Triangular pulse", latex: "\\operatorname{tri}(t)", description: "1 − |t| on [−1, 1]" },
  sinc: { label: "Normalized sinc", latex: "\\operatorname{sinc}(t)", description: "sin(πt)/(πt)" },
  sa: { label: "Sa", latex: "\\operatorname{Sa}(t)", description: "sin(t)/t" },
  signum: { label: "Signum", latex: "\\operatorname{sgn}(t)", description: "−1, 0, or 1" },
  sine: { label: "Sine", latex: "\\sin(2\\pi f t)", description: "Sinusoid with frequency f" },
  cosine: { label: "Cosine", latex: "\\cos(2\\pi f t)", description: "Cosinusoid with frequency f" },
  dirac: { label: "Dirac impulse", latex: "\\delta(t)", description: "Symbolic area, rendered as an arrow" },
};

function finite(value: number, fallback: number) { return Number.isFinite(value) ? value : fallback; }
function format(value: number, digits = 4) { return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "\\infty"; }
function modulo(value: number, divisor: number) { return ((value % divisor) + divisor) % divisor; }

function frequency(selection: SignalSelection) { return Math.abs(finite(selection.frequencyHz ?? 1, 1)); }
function phase(selection: SignalSelection) { return finite(selection.phaseRad ?? 0, 0); }

/** Evaluates regular sampled values only. Dirac impulses are intentionally zero-valued here. */
export function evaluateBasicSignal(selection: SignalSelection, time: number): number {
  if (!Number.isFinite(time)) return Number.NaN;
  switch (selection.kind) {
    case "step": return time >= 0 ? 1 : 0;
    case "ramp": return time >= 0 ? time : 0;
    case "rect": return Math.abs(time) <= 0.5 ? 1 : 0;
    case "tri": return Math.abs(time) <= 1 ? 1 - Math.abs(time) : 0;
    case "sinc": return Math.abs(time) < EPSILON ? 1 : Math.sin(Math.PI * time) / (Math.PI * time);
    case "sa": return Math.abs(time) < EPSILON ? 1 : Math.sin(time) / time;
    case "signum": return time === 0 ? 0 : Math.sign(time);
    case "sine": return Math.sin(2 * Math.PI * frequency(selection) * time + phase(selection));
    case "cosine": return Math.cos(2 * Math.PI * frequency(selection) * time + phase(selection));
    case "dirac": return 0;
  }
}

function selectionLatex(selection: SignalSelection, argument: string) {
  if (selection.kind === "sine") return `\\sin\\!\\left(2\\pi\\,${format(frequency(selection))}\\left(${argument}\\right)${phase(selection) ? `${phase(selection) >= 0 ? "+" : ""}${format(phase(selection))}` : ""}\\right)`;
  if (selection.kind === "cosine") return `\\cos\\!\\left(2\\pi\\,${format(frequency(selection))}\\left(${argument}\\right)${phase(selection) ? `${phase(selection) >= 0 ? "+" : ""}${format(phase(selection))}` : ""}\\right)`;
  const name = selection.kind === "step" ? "u" : selection.kind === "ramp" ? "r" : selection.kind === "dirac" ? "\\delta" : selection.kind === "rect" ? "\\operatorname{rect}" : selection.kind === "tri" ? "\\operatorname{tri}" : selection.kind === "sinc" ? "\\operatorname{sinc}" : selection.kind === "sa" ? "\\operatorname{Sa}" : "\\operatorname{sgn}";
  return `${name}\\!\\left(${argument}\\right)`;
}

function argumentLatex(transform: SignalTransform) {
  const a = finite(transform.timeScale, 1); const b = finite(transform.timeShift, 0);
  const left = Math.abs(a - 1) < EPSILON ? "t" : Math.abs(a + 1) < EPSILON ? "-t" : `${format(a)}t`;
  if (Math.abs(b) < EPSILON) return left;
  return `${left}${b > 0 ? "-" : "+"}${format(Math.abs(b))}`;
}

function transformBreakpoints(selection: SignalSelection, transform: SignalTransform, primary: boolean) {
  const roots = selection.kind === "step" || selection.kind === "ramp" || selection.kind === "signum" ? [0] : selection.kind === "rect" ? [-0.5, 0.5] : selection.kind === "tri" ? [-1, 1] : [];
  if (!primary) return roots;
  const a = finite(transform.timeScale, 1); const b = finite(transform.timeShift, 0);
  if (Math.abs(a) < EPSILON) return [];
  return roots.map(root => (root + b) / a);
}

function symbolicImpulses(operation: SignalOperation, warnings: string[]): SymbolicImpulse[] {
  const result: SymbolicImpulse[] = [];
  const a = finite(operation.transform.timeScale, 1); const b = finite(operation.transform.timeShift, 0); const A = finite(operation.transform.amplitude, 1);
  if (operation.primary.kind === "dirac") {
    if (Math.abs(a) < EPSILON) warnings.push("A zero time-scale leaves the Dirac argument degenerate, so no drawable impulse was emitted.");
    else {
      const time = b / a; const weight = A / Math.abs(a);
      result.push({ time, weight, latex: `${format(weight)}\\,\\delta\\!\\left(t${time < 0 ? "+" : "-"}${format(Math.abs(time))}\\right)`, label: `Area = ${format(weight)}` });
    }
  }
  if (operation.secondary?.kind === "dirac") result.push({ time: 0, weight: 1, latex: "\\delta(t)", label: "Area = 1" });
  return result;
}

function commonFrequency(values: number[]) {
  const scaled = values.filter(value => value > EPSILON && Number.isFinite(value)).map(value => Math.round(value * 1_000_000));
  if (!scaled.length) return null;
  const divisor = scaled.reduce((left, right) => { let a = Math.abs(left); let b = Math.abs(right); while (b) [a, b] = [b, a % b]; return a || 1; });
  return divisor / 1_000_000;
}

function periodicFrequency(operation: SignalOperation) {
  const selections = [operation.primary, ...(operation.secondary ? [operation.secondary] : [])];
  if (!selections.every(selection => PERIODIC_KINDS.has(selection.kind))) return null;
  const transformedPrimary = frequency(operation.primary) * Math.abs(finite(operation.transform.timeScale, 1));
  const frequencies = [transformedPrimary, ...(operation.secondary ? [frequency(operation.secondary)] : [])];
  return commonFrequency(frequencies);
}

function integrate(fn: (time: number) => number, from: number, to: number, intervals = 8192) {
  const count = Math.max(64, Math.floor(intervals)); const step = (to - from) / count; let total = 0;
  for (let index = 0; index <= count; index += 1) {
    const value = fn(from + index * step);
    if (!Number.isFinite(value)) continue;
    total += (index === 0 || index === count ? 0.5 : 1) * value;
  }
  return total * step;
}

function singleEnergy(selection: SignalSelection) {
  if (selection.kind === "rect" || selection.kind === "sinc") return 1;
  if (selection.kind === "tri") return 2 / 3;
  if (selection.kind === "sa") return Math.PI;
  return null;
}

function singlePower(selection: SignalSelection) {
  if (selection.kind === "sine" || selection.kind === "cosine") return 0.5;
  if (selection.kind === "step") return 0.5;
  if (selection.kind === "signum") return 1;
  return null;
}

function analyze(operation: SignalOperation, valueAt: (time: number) => number, impulses: SymbolicImpulse[], warnings: string[]): SignalAnalysis {
  if (impulses.length) return { classification: "Symbolic Distribution", energy: null, power: null, fundamentalFrequencyHz: null, fundamentalPeriodSeconds: null, method: "symbolic", warnings };
  const a = finite(operation.transform.timeScale, 1); const A = finite(operation.transform.amplitude, 1); const periodic = periodicFrequency(operation);
  if (periodic && periodic > EPSILON) {
    const period = 1 / periodic; const power = integrate(time => { const value = valueAt(time); return value * value; }, 0, period) / period;
    return { classification: "Power Signal", energy: Number.POSITIVE_INFINITY, power, fundamentalFrequencyHz: periodic, fundamentalPeriodSeconds: period, method: "period-average", warnings };
  }
  if (!operation.secondary && FINITE_ENERGY_KINDS.has(operation.primary.kind) && Math.abs(a) > EPSILON) {
    const energy = singleEnergy(operation.primary)! * A * A / Math.abs(a);
    return { classification: "Energy Signal", energy, power: 0, fundamentalFrequencyHz: null, fundamentalPeriodSeconds: null, method: "analytic", warnings };
  }
  if (!operation.secondary && Math.abs(a) > EPSILON) {
    const power = singlePower(operation.primary);
    if (power !== null) return { classification: "Power Signal", energy: Number.POSITIVE_INFINITY, power: A * A * power, fundamentalFrequencyHz: null, fundamentalPeriodSeconds: null, method: "analytic", warnings };
    if (operation.primary.kind === "ramp") return { classification: "Neither", energy: Number.POSITIVE_INFINITY, power: Number.POSITIVE_INFINITY, fundamentalFrequencyHz: null, fundamentalPeriodSeconds: null, method: "analytic", warnings };
  }
  const energy = integrate(time => { const value = valueAt(time); return value * value; }, -128, 128, 16_384);
  const edge = Math.max(Math.abs(valueAt(-128)), Math.abs(valueAt(128)));
  if (edge < 1e-4 && Number.isFinite(energy)) return { classification: "Energy Signal", energy, power: 0, fundamentalFrequencyHz: null, fundamentalPeriodSeconds: null, method: "bounded-numeric", warnings };
  warnings.push("The result has no closed-form classification in the current dictionary; its displayed energy estimate is bounded to the analysis horizon.");
  return { classification: "Neither", energy, power: null, fundamentalFrequencyHz: null, fundamentalPeriodSeconds: null, method: "bounded-numeric", warnings };
}

export function createPiecewiseSignal(operation: SignalOperation): PiecewiseSignalModel {
  const warnings: string[] = [];
  const transform: SignalTransform = { amplitude: finite(operation.transform.amplitude, 1), timeScale: finite(operation.transform.timeScale, 1), timeShift: finite(operation.transform.timeShift, 0) };
  const normalized: SignalOperation = { primary: operation.primary, secondary: operation.secondary, transform };
  if (Math.abs(transform.timeScale) < EPSILON && operation.primary.kind !== "dirac") warnings.push("Zero time-scale collapses the primary term to a constant sample.");
  const valueAt = (time: number) => {
    const primary = transform.amplitude * evaluateBasicSignal(normalized.primary, transform.timeScale * time - transform.timeShift);
    const secondary = normalized.secondary ? evaluateBasicSignal(normalized.secondary, time) : 0;
    const value = primary + secondary;
    return Number.isFinite(value) ? value : Number.NaN;
  };
  const impulses = symbolicImpulses(normalized, warnings);
  const equationLatex = `y(t)=${format(transform.amplitude)}\\,${selectionLatex(normalized.primary, argumentLatex(transform))}${normalized.secondary ? `+${selectionLatex(normalized.secondary, "t")}` : ""}`;
  const breakpoints = [...transformBreakpoints(normalized.primary, transform, true), ...(normalized.secondary ? transformBreakpoints(normalized.secondary, transform, false) : [])].filter(Number.isFinite).sort((left, right) => left - right).filter((value, index, values) => !index || Math.abs(value - values[index - 1]) > EPSILON);
  const analysis = analyze(normalized, valueAt, impulses, warnings);
  return { operation: normalized, equationLatex, impulses, breakpoints, analysis, valueAt };
}

/** Samples each region independently so Canvas never joins a discontinuity with a false line. */
export function samplePiecewiseSignal(model: PiecewiseSignalModel, minimum: number, maximum: number, samples = 900): SignalSegment[] {
  if (!(maximum > minimum)) return [];
  const boundaries = [minimum, ...model.breakpoints.filter(point => point > minimum + EPSILON && point < maximum - EPSILON), maximum];
  const result: SignalSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index]; const to = boundaries[index + 1]; const span = to - from; if (span <= EPSILON) continue;
    const inset = Math.min(0.001, span * 0.001); const start = index === 0 ? from : from + inset; const end = index === boundaries.length - 2 ? to : to - inset;
    const count = Math.max(12, Math.floor(samples * span / (maximum - minimum))); const segment: SignalSegment = [];
    for (let point = 0; point <= count; point += 1) {
      const time = start + (end - start) * point / count; const value = model.valueAt(time);
      if (Number.isFinite(value) && Math.abs(value) <= 1e6) segment.push({ time, value });
    }
    if (segment.length > 1) result.push(segment);
  }
  return result;
}

export function estimateVisibleAmplitude(model: PiecewiseSignalModel, from: number, to: number) {
  const segments = samplePiecewiseSignal(model, from, to, 640);
  const max = Math.max(1, ...segments.flatMap(segment => segment.map(point => Math.abs(point.value))), ...model.impulses.map(impulse => Math.abs(impulse.weight)));
  return max;
}

export function periodicPreviewTime(time: number, period: number) { return period > EPSILON ? modulo(time, period) : time; }
