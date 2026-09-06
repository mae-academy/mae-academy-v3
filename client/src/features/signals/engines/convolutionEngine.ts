/**
 * MAE Academy / Signals & Systems — Tab C pure Convolution Engine.
 * No DOM or React state is permitted here. The solver owns numerical integration,
 * symbolic delta shortcuts, support-overlap estimates, and discrete table math.
 */
import { evaluateSignal, extractImpulseMarkers, toLatex, type SignalNode } from "./signalEngine";

export type Interval = { from: number; to: number };
export type ConvolutionConfig = { tauDomain: Interval; resolution: number };
export type ConvolutionPoint = { tau: number; x: number; shiftedH: number; product: number };
export type ContinuousConvolutionResult = { t: number; value: number; overlap: Interval; points: ConvolutionPoint[]; usedDeltaShortcut: boolean; overlapLatex: string };
export type DiscreteContribution = { xIndex: number; hIndex: number; value: number; active: boolean };
export type DiscreteConvolution = { values: number[]; contributions: DiscreteContribution[][] };

const EPSILON = 1e-9;
export const DEFAULT_CONVOLUTION_CONFIG: ConvolutionConfig = { tauDomain: { from: -6, to: 6 }, resolution: 0.01 };
const finite = (value: number) => Number.isFinite(value) && Math.abs(value) < 1e8;
const format = (value: number, digits = 3) => Number(value.toFixed(digits)).toString();

function intersect(left: Interval, right: Interval): Interval { return { from: Math.max(left.from, right.from), to: Math.min(left.to, right.to) }; }
function union(left: Interval, right: Interval): Interval { return { from: Math.min(left.from, right.from), to: Math.max(left.to, right.to) }; }
function unbounded(): Interval { return { from: Number.NEGATIVE_INFINITY, to: Number.POSITIVE_INFINITY }; }
function isEmpty(interval: Interval) { return interval.to < interval.from - EPSILON; }

function linear(node: SignalNode): { slope: number; offset: number } | null {
  if (node.kind === "number") return { slope: 0, offset: node.value };
  if (node.kind === "variable") return node.name === "t" ? { slope: 1, offset: 0 } : { slope: 0, offset: Math.PI };
  if (node.kind === "unary") { const value = linear(node.value); return value ? { slope: node.operator === "-" ? -value.slope : value.slope, offset: node.operator === "-" ? -value.offset : value.offset } : null; }
  if (node.kind !== "binary") return null;
  const left = linear(node.left); const right = linear(node.right); if (!left || !right) return null;
  if (node.operator === "+") return { slope: left.slope + right.slope, offset: left.offset + right.offset };
  if (node.operator === "-") return { slope: left.slope - right.slope, offset: left.offset - right.offset };
  if (node.operator === "*" && Math.abs(left.slope) < EPSILON) return { slope: left.offset * right.slope, offset: left.offset * right.offset };
  if (node.operator === "*" && Math.abs(right.slope) < EPSILON) return { slope: right.offset * left.slope, offset: right.offset * left.offset };
  if (node.operator === "/" && Math.abs(right.slope) < EPSILON && Math.abs(right.offset) > EPSILON) return { slope: left.slope / right.offset, offset: left.offset / right.offset };
  return null;
}

function transformRange(range: Interval, form: { slope: number; offset: number }): Interval {
  if (Math.abs(form.slope) < EPSILON) return finite(form.offset) ? { from: Number.NEGATIVE_INFINITY, to: Number.POSITIVE_INFINITY } : unbounded();
  const first = (range.from - form.offset) / form.slope; const second = (range.to - form.offset) / form.slope; return { from: Math.min(first, second), to: Math.max(first, second) };
}

/** Returns finite support only where the AST gives it exactly; null represents an unbounded/unknown signal. */
export function supportRange(node: SignalNode): Interval | null {
  if (node.kind === "number" || node.kind === "variable") return node.kind === "number" && Math.abs(node.value) < EPSILON ? { from: 0, to: 0 } : null;
  if (node.kind === "unary") return supportRange(node.value);
  if (node.kind === "binary") {
    const left = supportRange(node.left); const right = supportRange(node.right);
    if (node.operator === "*") { if (left && right) return intersect(left, right); return left ?? right; }
    if (node.operator === "+" || node.operator === "-") { if (left && right) return union(left, right); return null; }
    return null;
  }
  const form = linear(node.argument);
  if (!form) return null;
  if (node.name === "rect") return transformRange({ from: -0.5, to: 0.5 }, form);
  if (node.name === "tri") return transformRange({ from: -1, to: 1 }, form);
  if (node.name === "delta") return transformRange({ from: 0, to: 0 }, form);
  if (node.name === "u" || node.name === "r") { const root = -form.offset / form.slope; return form.slope > 0 ? { from: root, to: Number.POSITIVE_INFINITY } : { from: Number.NEGATIVE_INFINITY, to: root }; }
  return null;
}

function shiftReversalRange(range: Interval | null, t: number): Interval | null { return range ? { from: t - range.to, to: t - range.from } : null; }
export function overlapBounds(x: SignalNode, h: SignalNode, t: number, domain: Interval = DEFAULT_CONVOLUTION_CONFIG.tauDomain): Interval {
  const xRange = supportRange(x); const shiftedH = shiftReversalRange(supportRange(h), t); let overlap = domain;
  if (xRange) overlap = intersect(overlap, xRange); if (shiftedH) overlap = intersect(overlap, shiftedH); return overlap;
}

function pureDeltaShortcut(node: SignalNode) {
  const impulses = extractImpulseMarkers(node); if (impulses.length !== 1) return null;
  const checks = [-1.37, -0.23, 0.41, 1.17];
  return checks.every((time) => Math.abs(evaluateSignal(node, time)) < EPSILON) ? impulses[0] : null;
}

export function continuousConvolutionAt(x: SignalNode, h: SignalNode, t: number, config: ConvolutionConfig = DEFAULT_CONVOLUTION_CONFIG): ContinuousConvolutionResult {
  const delta = pureDeltaShortcut(h); const overlap = overlapBounds(x, h, t, config.tauDomain);
  if (delta) {
    const value = delta.area * evaluateSignal(x, t - delta.at);
    return { t, value: finite(value) ? value : 0, overlap, points: [], usedDeltaShortcut: true, overlapLatex: `x(t)\\ast ${delta.latex}=x\\!\\left(t-${format(delta.at)}\\right)` };
  }
  if (isEmpty(overlap)) return { t, value: 0, overlap, points: [], usedDeltaShortcut: false, overlapLatex: "\\int_{\\varnothing}x(\\tau)h(t-\\tau)\\,d\\tau=0" };
  const resolution = Math.min(0.01, Math.max(0.001, config.resolution)); const count = Math.max(2, Math.ceil((overlap.to - overlap.from) / resolution)); const step = (overlap.to - overlap.from) / count;
  let integral = 0; const points: ConvolutionPoint[] = [];
  for (let index = 0; index <= count; index += 1) { const tau = overlap.from + index * step; const xValue = evaluateSignal(x, tau); const hValue = evaluateSignal(h, t - tau); const product = finite(xValue) && finite(hValue) ? xValue * hValue : 0; points.push({ tau, x: finite(xValue) ? xValue : 0, shiftedH: finite(hValue) ? hValue : 0, product }); integral += (index === 0 || index === count ? 0.5 : 1) * product; }
  const overlapLatex = `y(${format(t)})=\\int_{${format(overlap.from)}}^{${format(overlap.to)}}\\!\\left(${toLatex(x, "\\tau")}\\right)\\left(${toLatex(h, ` ${format(t)}-\\tau`)}\\right)\\,d\\tau\\approx${format(integral * step)}`;
  return { t, value: integral * step, overlap, points, usedDeltaShortcut: false, overlapLatex };
}

export function convolutionCurve(x: SignalNode, h: SignalNode, range: Interval, samples = 320, config: ConvolutionConfig = DEFAULT_CONVOLUTION_CONFIG) {
  const result: Array<{ t: number; value: number }> = []; for (let index = 0; index <= samples; index += 1) { const t = range.from + (range.to - range.from) * index / samples; result.push({ t, value: continuousConvolutionAt(x, h, t, config).value }); } return result;
}

export function discreteConvolution(x: number[], h: number[]): DiscreteConvolution {
  const values = Array.from({ length: x.length + h.length - 1 }, () => 0); const contributions: DiscreteContribution[][] = values.map(() => []);
  x.forEach((xValue, xIndex) => h.forEach((hValue, hIndex) => { const n = xIndex + hIndex; const value = xValue * hValue; values[n] += value; contributions[n].push({ xIndex, hIndex, value, active: true }); }));
  return { values, contributions };
}

export function discreteIndexRange(x: number[], h: number[]) { return Array.from({ length: x.length + h.length - 1 }, (_, index) => index); }
