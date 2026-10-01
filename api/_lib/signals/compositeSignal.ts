/**
 * MAE Academy / Signals & Systems — Composite Signal Engine.
 *
 * Powers the SIGNAL ENGINE input in SignalOperationsLab: parses an arbitrary
 * x(t)=… expression (built on the diracIntegral grammar), samples it at high
 * resolution for the vector scope, extracts symbolic Dirac impulses structurally,
 * and classifies energy/power/periodicity via GCD/LCM of the sinusoidal terms.
 * Deliberately free of React, DOM, and Canvas concerns.
 */
import { add, affineArgument, containsVariable, DomainError, evaluateNode, factorize, flattenSum, mul, normalizeMathSource, parseExpression, sub, type FunctionName, type MathNode } from "../../../shared/signals/mathExpression";
import { evaluateSignal, type SignalNode } from "../../../shared/signals/signalEngine";
import { toSignalNode } from "../../../shared/signals/unifiedSignalParser";
import type { CompositeImpulse, CompositeClassification, CompositeAnalysis, CompositeSegment } from "../../../shared/signals/results";
export type { CompositeImpulse, CompositeClassification, CompositeAnalysis, CompositeSegment };
import {
  CompositeSignalModel,
  EPSILON,
  SymbolicOperatorError,
  VARIABLE,
  num,
  termHasDelta,
} from "../../../shared/signals/compositeSignal";
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
  const components = omegas.map((omega) => ({
    omega,
    period: (2 * Math.PI) / omega,
  }));
  if (periodic && omegas.length > 0) {
    const omega0 = omegas.reduce((left, right) => gcd(left, right));
    if (omega0 > EPSILON) { fundamentalAngularFrequency = omega0; fundamentalPeriod = (2 * Math.PI) / omega0; }
  }

  if (periodic && fundamentalPeriod !== null) {
    const power = integrate((time) => { const value = model.valueAt(time); return value * value; }, 0, fundamentalPeriod, 2048) / fundamentalPeriod;
    return { classification: "Power Signal", energy: Number.POSITIVE_INFINITY, power, autoPeriodic, fundamentalAngularFrequency, fundamentalPeriod, components, hasNonPeriodicTerm, warnings };
  }

  const from = Math.min(options.windowStart, options.windowEnd);
  const to = Math.max(options.windowStart, options.windowEnd);
  const energy = to > from ? integrate((time) => { const value = model.valueAt(time); return Number.isFinite(value) ? value * value : 0; }, from, to, 4096) : 0;
  const impulseEnergy = model.impulses.some((impulse) => impulse.time >= from && impulse.time <= to);
  if (impulseEnergy) warnings.push("A Dirac impulse in the observation window carries infinite energy; the numeric integral only reflects the ordinary part of x(t).");
  const classification: CompositeClassification = impulseEnergy ? "Neither" : energy > EPSILON ? "Energy Signal" : "Neither";
  return { classification, energy: impulseEnergy ? Number.POSITIVE_INFINITY : energy, power: 0, autoPeriodic, fundamentalAngularFrequency: null, fundamentalPeriod: null, components, hasNonPeriodicTerm, warnings };
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
