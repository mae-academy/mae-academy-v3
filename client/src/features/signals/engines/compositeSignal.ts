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
  add,
  affineArgument,
  containsVariable,
  DomainError,
  evaluateNode,
  factorize,
  flattenSum,
  mul,
  normalizeMathSource,
  parseExpression,
  sub,
  type FunctionName,
  type MathNode,
} from "./diracIntegral";
import { evaluateSignal, type SignalNode } from "./signalEngine";
import { toSignalNode } from "@/lib/signals/unifiedSignalParser";

/** Raised when the ∫₋∞ᵗ quick action meets a term it cannot resolve to a closed-form antiderivative. */
export class SymbolicOperatorError extends Error {}

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
    const center = -affine.intercept / affine.slope || 0; // normalize -0 to 0 for clean display/equality
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
    if (current.kind === "pow") { walk(current.base); walk(current.exponent); return; }
    if (current.kind === "runningIntegral") {
      // Only a δ inside the integrand makes the accumulator actually jump; ordinary step-family
      // corners (rect, u, …) integrate into a continuous ramp and need no breakpoint here.
      for (const term of flattenSum(current.integrand)) {
        const factors = factorize(term.node);
        if (factors.delta && factors.delta.order === 0) {
          const affine = affineArgument(factors.delta.argument, current.dummyVariable);
          if (affine && Math.abs(affine.slope) > EPSILON) roots.push(-affine.intercept / affine.slope);
        }
      }
    }
  };
  walk(node);
  return roots.filter(Number.isFinite).sort((left, right) => left - right).filter((value, index, values) => !index || Math.abs(value - values[index - 1]) > EPSILON);
}

function containsRunningIntegral(node: MathNode): boolean {
  switch (node.kind) {
    case "runningIntegral": return true;
    case "neg": return containsRunningIntegral(node.value);
    case "add": case "sub": case "mul": case "div": return containsRunningIntegral(node.left) || containsRunningIntegral(node.right);
    case "pow": return containsRunningIntegral(node.base) || containsRunningIntegral(node.exponent);
    case "call": case "delta": return containsRunningIntegral(node.argument);
    default: return false;
  }
}

function bridgeOrNull(node: MathNode): SignalNode | null {
  try { return toSignalNode(node, VARIABLE); } catch { return null; }
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
  // Running integrals sample from a cached cumulative table (Δt = 0.005) instead of a per-sample quadrature.
  const sampled = ordinaryNode && containsRunningIntegral(ordinaryNode) ? bridgeOrNull(ordinaryNode) : null;
  const valueAt = (time: number): number => {
    if (!ordinaryNode) return 0;
    if (sampled) { const value = evaluateSignal(sampled, time); return Number.isFinite(value) ? value : Number.NaN; }
    try { const value = evaluateNode(ordinaryNode, VARIABLE, time); return Number.isFinite(value) ? value : Number.NaN; }
    catch { return Number.NaN; }
  };
  const breakpoints = collectBreakpoints(node);
  return { node, latex, impulses, breakpoints, valueAt };
}

export type CompositeSegment = Array<{ time: number; value: number }>;

/** Sub-pixel time offset used to straddle a jump discontinuity: t0⁻ and t0⁺ land on (near-)identical
 *  screen x-coordinates, so the two points draw as a crisp vertical wall rather than a slanted ramp. */
const WALL_EPSILON = 1e-6;

/**
 * Samples x(t) at up to Δt ≈ 1e-3 s (capped for render performance over wide windows), straddling
 * every structural breakpoint (step/rect/tri/sgn/ramp edges) with a t0⁻/t0⁺ pair kept in the same
 * continuous run, so the SVG path draws a sharp vertical edge at each discontinuity instead of a
 * diagonal or a broken gap. Runs only split where the signal itself is genuinely undefined (NaN).
 */
export function sampleCompositeSignal(model: CompositeSignalModel, minimum: number, maximum: number, maxSamples = 3000): CompositeSegment[] {
  if (!(maximum > minimum)) return [];
  const totalSpan = maximum - minimum;
  const targetCount = Math.min(Math.max(maxSamples, 1000), Math.max(1000, Math.ceil(totalSpan / 0.0005)));
  const interiorBreakpoints = model.breakpoints.filter((point) => point > minimum + EPSILON && point < maximum - EPSILON).sort((left, right) => left - right);

  const runs: Array<[number, number]> = [];
  let cursor = minimum;
  for (const breakpoint of interiorBreakpoints) { runs.push([cursor, breakpoint - WALL_EPSILON]); cursor = breakpoint + WALL_EPSILON; }
  runs.push([cursor, maximum]);

  const result: CompositeSegment[] = [];
  let current: CompositeSegment = [];
  for (const [start, end] of runs) {
    const span = end - start;
    if (span <= 0) continue;
    const count = Math.max(8, Math.round((targetCount * span) / totalSpan));
    for (let point = 0; point <= count; point += 1) {
      const time = start + (span * point) / count;
      const value = model.valueAt(time);
      if (Number.isFinite(value) && Math.abs(value) <= 1e6) current.push({ time, value });
      else { if (current.length > 1) result.push(current); current = []; }
    }
  }
  if (current.length > 1) result.push(current);
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

/* ─────────────────── Running integral (∫₋∞ᵗ) quick action ─────────────────── */

const STEP_FAMILY = new Set<FunctionName>(["u", "r", "rect"]);

/** Collects every multiplicative leaf under `node`, flattening nested `mul` nodes. */
function multiplicativeLeaves(node: MathNode, into: MathNode[] = []): MathNode[] {
  if (node.kind === "mul") { multiplicativeLeaves(node.left, into); multiplicativeLeaves(node.right, into); return into; }
  into.push(node);
  return into;
}

/**
 * ∫₋∞ᵗ of one additive term, restricted to our canonical step-family vocabulary
 * (δ, u, r, rect — each shifted by a constant, not time-scaled or reflected):
 *   ∫δ(t−t₀)      = u(t−t₀)
 *   ∫u(t−t₀)      = r(t−t₀)
 *   ∫r(t−t₀)      = ½(t−t₀)²·u(t−t₀)
 *   ∫rect(t−t₀)   = r(t−t₀+0.5) − r(t−t₀−0.5)
 * Anything else (sinusoids, tri, sgn, a nonzero DC term, a time-scaled or reflected argument)
 * has no convergent or supported closed form here, and is reported rather than guessed.
 */
function integrateTermFromMinusInfinity(node: MathNode): MathNode {
  type StepPrimitive = Extract<MathNode, { kind: "call" }> | Extract<MathNode, { kind: "delta" }>;
  const isStepPrimitive = (leaf: MathNode): leaf is StepPrimitive =>
    (leaf.kind === "call" && STEP_FAMILY.has(leaf.name)) || (leaf.kind === "delta" && leaf.order === 0);
  const leaves = multiplicativeLeaves(node);
  const primitives = leaves.filter(isStepPrimitive);
  if (primitives.length === 0) {
    if (!containsVariable(node, VARIABLE)) {
      if (Math.abs(evaluateNode(node, VARIABLE, 0)) < EPSILON) return num(0);
      throw new SymbolicOperatorError("A nonzero constant term has no convergent running integral from t=−∞.");
    }
    throw new SymbolicOperatorError("This term has no closed-form running integral in this quick action; only shifted δ, u, r, and rect terms are supported.");
  }
  if (primitives.length > 1) throw new SymbolicOperatorError("A product of two step-family signals is outside this quick action's closed-form table.");
  const primitive = primitives[0];
  const coefficient = leaves.filter((leaf) => leaf !== primitive).reduce(mul, num(1));
  if (containsVariable(coefficient, VARIABLE)) throw new SymbolicOperatorError("The coefficient multiplying the step-family term must not depend on t.");

  const argument = primitive.argument;
  const affine = affineArgument(argument, VARIABLE);
  if (!affine) throw new SymbolicOperatorError("The step-family argument must be affine in t.");
  if (Math.abs(affine.slope - 1) > 1e-9) throw new SymbolicOperatorError("Only a unit-slope shift (e.g. u(t−2), not u(2t) or u(−t)) is supported by this quick action.");
  // slope is exactly 1, so `argument` already equals (t − t0) — reuse it directly as the substituted argument.

  if (primitive.kind === "delta") return mul(coefficient, { kind: "call", name: "u", argument });
  switch (primitive.name) {
    case "u": return mul(coefficient, { kind: "call", name: "r", argument });
    case "r": return mul(coefficient, mul({ kind: "div", left: { kind: "pow", base: argument, exponent: num(2) }, right: num(2) }, { kind: "call", name: "u", argument }));
    case "rect": return mul(coefficient, sub({ kind: "call", name: "r", argument: add(argument, num(0.5)) }, { kind: "call", name: "r", argument: sub(argument, num(0.5)) }));
    default: throw new SymbolicOperatorError(`The running integral of ${primitive.name}(t) is not in this quick action's closed-form table yet.`);
  }
}

/** Builds the symbolic MathNode for ∫₋∞ᵗ x(τ) dτ, term by term over the additive expansion of `node`. */
export function integrateFromMinusInfinity(node: MathNode): MathNode {
  const terms = flattenSum(node);
  let result: MathNode = num(0);
  for (const term of terms) {
    const piece = integrateTermFromMinusInfinity(term.node);
    result = term.sign < 0 ? sub(result, piece) : add(result, piece);
  }
  return result;
}
