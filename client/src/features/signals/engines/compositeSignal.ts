/**
 * MAE Academy / Signals & Systems — Composite Signal Engine.
 *
 * Powers the SIGNAL ENGINE input in SignalOperationsLab: parses an arbitrary
 * x(t)=… expression (built on the diracIntegral grammar), samples it at high
 * resolution for the vector scope, extracts symbolic Dirac impulses structurally,
 * and classifies energy/power/periodicity via GCD/LCM of the sinusoidal terms.
 * Deliberately free of React, DOM, and Canvas concerns.
 */
import {
  affineArgument,
  containsVariable,
  DomainError,
  evaluateNode,
  factorize,
  flattenSum,
  normalizeMathSource,
  parseExpression,
  type MathNode,
} from "./diracIntegral";

export type CompositeParseResult = { ok: true; node: MathNode; latex: string } | { ok: false; error: string };

export type CompositeImpulse = { time: number; weight: number; latex: string };

export type CompositeClassification = "Energy Signal" | "Power Signal" | "Neither";

export type CompositeAnalysis = {
  classification: CompositeClassification;
  energy: number | null;
  power: number | null;
  autoPeriodic: boolean;
  /** null when no sinusoidal component (or components are not commensurate). */
  fundamentalAngularFrequency: number | null;
  fundamentalPeriod: number | null;
  hasNonPeriodicTerm: boolean;
  warnings: string[];
};

export type CompositeSignalModel = {
  node: MathNode;
  latex: string;
  impulses: CompositeImpulse[];
  breakpoints: number[];
  valueAt: (time: number) => number;
};

const EPSILON = 1e-9;
const VARIABLE = "t";
const num = (value: number): MathNode => ({ kind: "num", value });

/** Strips an optional "x(t)=" / "y(t)=" prefix so the grammar sees a bare expression. */
export function parseCompositeSignal(source: string): CompositeParseResult {
  const flat = normalizeMathSource(source);
  const equality = flat.indexOf("=");
  const rhs = equality >= 0 ? flat.slice(equality + 1) : flat;
  if (!rhs) return { ok: false, error: "Enter a signal in terms of t, for example x(t)=\\sin(2\\pi t)." };
  try {
    const node = parseExpression(rhs, VARIABLE);
    return { ok: true, node, latex: rhs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The expression could not be parsed." };
  }
}

function foldMul(factors: MathNode[]): MathNode {
  return factors.reduce<MathNode>((acc, factor) => (acc.kind === "num" && acc.value === 1 ? factor : { kind: "mul", left: acc, right: factor }), num(1));
}

const texNumber = (value: number) => Number(value.toFixed(6)).toString();

/** Structurally collects every order-0 δ term into a drawable impulse; higher orders are reported as warnings. */
function collectImpulses(node: MathNode, warnings: string[]): CompositeImpulse[] {
  const impulses: CompositeImpulse[] = [];
  for (const term of flattenSum(node)) {
    const factors = factorize(term.node);
    if (!factors.delta) continue;
    if (factors.deltaCount > 1) { warnings.push("A product of two Dirac impulses is not drawable and was skipped."); continue; }
    if (factors.delta.order > 0) { warnings.push(`A δ${"'".repeat(factors.delta.order)} doublet is symbolic and is not rendered as an arrow.`); continue; }
    const affine = affineArgument(factors.delta.argument, VARIABLE);
    if (!affine || Math.abs(affine.slope) < EPSILON) { warnings.push("A Dirac term with a non-affine argument was skipped."); continue; }
    const center = -affine.intercept / affine.slope;
    try {
      const amplitude = evaluateNode(foldMul(factors.others), VARIABLE, center);
      const weight = term.sign * amplitude * (1 / Math.abs(affine.slope));
      if (!Number.isFinite(weight)) { warnings.push(`The impulse amplitude is undefined at t = ${texNumber(center)}.`); continue; }
      impulses.push({ time: center, weight, latex: `${texNumber(weight)}\\,\\delta\\!\\left(t${center <= 0 ? "+" : "-"}${texNumber(Math.abs(center))}\\right)` });
    } catch (error) {
      warnings.push(error instanceof DomainError ? error.reason : "An impulse amplitude could not be evaluated.");
    }
  }
  return impulses;
}

/** Known breakpoints (u, r, sgn: 0; rect: ±0.5; tri: ±1) mapped back through each call's affine argument. */
function collectBreakpoints(node: MathNode): number[] {
  const roots: number[] = [];
  const walk = (current: MathNode): void => {
    if (current.kind === "call") {
      const local = current.name === "u" || current.name === "r" || current.name === "sgn" ? [0] : current.name === "rect" ? [-0.5, 0.5] : current.name === "tri" ? [-1, 1] : [];
      if (local.length) {
        const affine = affineArgument(current.argument, VARIABLE);
        if (affine && Math.abs(affine.slope) > EPSILON) for (const root of local) roots.push((root - affine.intercept) / affine.slope);
      }
      walk(current.argument);
      return;
    }
    if (current.kind === "neg" || current.kind === "delta") { walk(current.kind === "neg" ? current.value : current.argument); return; }
    if (current.kind === "add" || current.kind === "sub" || current.kind === "mul" || current.kind === "div") { walk(current.left); walk(current.right); return; }
    if (current.kind === "pow") { walk(current.base); walk(current.exponent); }
  };
  walk(node);
  return roots.filter(Number.isFinite).sort((left, right) => left - right).filter((value, index, values) => !index || Math.abs(value - values[index - 1]) > EPSILON);
}

/** A δ-bearing term contributes no ordinary sample; it is drawn separately as an arrow. */
function termHasDelta(node: MathNode): boolean {
  return factorize(node).delta !== null;
}

export function createCompositeSignal(node: MathNode, latex: string): CompositeSignalModel {
  const warnings: string[] = [];
  const impulses = collectImpulses(node, warnings);
  const ordinaryTerms = flattenSum(node).filter((term) => !termHasDelta(term.node));
  const ordinaryNode = ordinaryTerms.reduce<MathNode | null>((acc, term) => {
    const signed = term.sign < 0 ? ({ kind: "neg", value: term.node } as MathNode) : term.node;
    return acc ? { kind: "add", left: acc, right: signed } : signed;
  }, null);
  const valueAt = (time: number): number => {
    if (!ordinaryNode) return 0;
    try { const value = evaluateNode(ordinaryNode, VARIABLE, time); return Number.isFinite(value) ? value : Number.NaN; }
    catch { return Number.NaN; }
  };
  const breakpoints = collectBreakpoints(node);
  return { node, latex, impulses, breakpoints, valueAt };
}

export type CompositeSegment = Array<{ time: number; value: number }>;

/**
 * Samples each region between breakpoints independently (so the vector path never bridges a
 * discontinuity) at up to Δt ≈ 1e-3 s, capped for render performance over wide windows.
 */
export function sampleCompositeSignal(model: CompositeSignalModel, minimum: number, maximum: number, maxSamples = 3000): CompositeSegment[] {
  if (!(maximum > minimum)) return [];
  const boundaries = [minimum, ...model.breakpoints.filter((point) => point > minimum + EPSILON && point < maximum - EPSILON), maximum];
  const totalSpan = maximum - minimum;
  const targetCount = Math.min(maxSamples, Math.max(400, Math.ceil(totalSpan / 0.001)));
  const result: CompositeSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index]; const to = boundaries[index + 1]; const span = to - from;
    if (span <= EPSILON) continue;
    const inset = Math.min(0.001, span * 0.001);
    const start = index === 0 ? from : from + inset;
    const end = index === boundaries.length - 2 ? to : to - inset;
    const count = Math.max(12, Math.round((targetCount * span) / totalSpan));
    const segment: CompositeSegment = [];
    for (let point = 0; point <= count; point += 1) {
      const time = start + ((end - start) * point) / count;
      const value = model.valueAt(time);
      if (Number.isFinite(value) && Math.abs(value) <= 1e6) segment.push({ time, value });
    }
    if (segment.length > 1) result.push(segment);
  }
  return result;
}

/** Trapezoid rule with domain-error samples skipped, matching the platform's other numeric integrators. */
function integrate(fn: (time: number) => number, from: number, to: number, intervals: number): number {
  const step = (to - from) / intervals;
  let total = 0;
  for (let index = 0; index <= intervals; index += 1) {
    const value = fn(from + index * step);
    if (!Number.isFinite(value)) continue;
    total += (index === 0 || index === intervals ? 0.5 : 1) * value;
  }
  return total * step;
}

function gcd(a: number, b: number): number { let x = Math.abs(a); let y = Math.abs(b); while (y > 1e-9) [x, y] = [y, x % y]; return x; }

type SinusoidTerm = { omega: number };

/**
 * Structural periodicity probe: an additive term is "sinusoidal" when it is
 * (t-independent coefficient) × sin|cos(affine-in-t). Any other non-constant,
 * non-delta term (rect, u, tri, sinc, sgn, ramp, …) forces the signal aperiodic.
 */
function classifyTerm(node: MathNode): { sinusoid: SinusoidTerm } | { constant: true } | { other: true } {
  const factors = factorize(node);
  if (factors.delta) return { other: true }; // handled separately as an impulse
  const sinusoidCalls = factors.others.filter((factor): factor is Extract<MathNode, { kind: "call" }> => factor.kind === "call" && (factor.name === "sin" || factor.name === "cos"));
  const remaining = factors.others.filter((factor) => !sinusoidCalls.includes(factor as Extract<MathNode, { kind: "call" }>));
  if (sinusoidCalls.length === 1 && remaining.every((factor) => !containsVariable(factor, VARIABLE))) {
    const affine = affineArgument(sinusoidCalls[0].argument, VARIABLE);
    if (affine && Math.abs(affine.slope) > EPSILON) return { sinusoid: { omega: Math.abs(affine.slope) } };
  }
  if (!containsVariable(node, VARIABLE)) return { constant: true };
  return { other: true };
}

export function analyzeCompositeSignal(
  model: CompositeSignalModel,
  options: { periodicOverride: "auto" | "periodic" | "aperiodic"; windowStart: number; windowEnd: number },
): CompositeAnalysis {
  const warnings: string[] = [...(model.impulses.length ? [] : [])];
  const terms = flattenSum(model.node).filter((term) => !termHasDelta(term.node));
  const omegas: number[] = [];
  let hasNonPeriodicTerm = false;
  for (const term of terms) {
    const outcome = classifyTerm(term.node);
    if ("sinusoid" in outcome) omegas.push(outcome.sinusoid.omega);
    else if ("other" in outcome) hasNonPeriodicTerm = true;
  }
  if (model.impulses.length > 0) hasNonPeriodicTerm = true;

  const autoPeriodic = omegas.length > 0 && !hasNonPeriodicTerm;
  const periodic = options.periodicOverride === "auto" ? autoPeriodic : options.periodicOverride === "periodic";

  let fundamentalAngularFrequency: number | null = null;
  let fundamentalPeriod: number | null = null;
  if (periodic && omegas.length > 0) {
    const omega0 = omegas.reduce((left, right) => gcd(left, right));
    if (omega0 > EPSILON) { fundamentalAngularFrequency = omega0; fundamentalPeriod = (2 * Math.PI) / omega0; }
  }

  if (periodic && fundamentalPeriod !== null) {
    const power = integrate((time) => { const value = model.valueAt(time); return value * value; }, 0, fundamentalPeriod, 2048) / fundamentalPeriod;
    return { classification: "Power Signal", energy: Number.POSITIVE_INFINITY, power, autoPeriodic, fundamentalAngularFrequency, fundamentalPeriod, hasNonPeriodicTerm, warnings };
  }

  const from = Math.min(options.windowStart, options.windowEnd);
  const to = Math.max(options.windowStart, options.windowEnd);
  const energy = to > from ? integrate((time) => { const value = model.valueAt(time); return Number.isFinite(value) ? value * value : 0; }, from, to, 4096) : 0;
  const impulseEnergy = model.impulses.some((impulse) => impulse.time >= from && impulse.time <= to);
  if (impulseEnergy) warnings.push("A Dirac impulse in the observation window carries infinite energy; the numeric integral only reflects the ordinary part of x(t).");
  const classification: CompositeClassification = impulseEnergy ? "Neither" : energy > EPSILON ? "Energy Signal" : "Neither";
  return { classification, energy: impulseEnergy ? Number.POSITIVE_INFINITY : energy, power: 0, autoPeriodic, fundamentalAngularFrequency: null, fundamentalPeriod: null, hasNonPeriodicTerm, warnings };
}
