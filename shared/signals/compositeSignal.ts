/**
 * MAE Academy / Signals & Systems — Composite Signal Engine.
 *
 * Powers the SIGNAL ENGINE input in SignalOperationsLab: parses an arbitrary
 * x(t)=… expression (built on the diracIntegral grammar), samples it at high
 * resolution for the vector scope, extracts symbolic Dirac impulses structurally,
 * and classifies energy/power/periodicity via GCD/LCM of the sinusoidal terms.
 * Deliberately free of React, DOM, and Canvas concerns.
 */
import { add, affineArgument, containsVariable, DomainError, evaluateNode, factorize, flattenSum, mul, normalizeMathSource, parseExpression, sub, type FunctionName, type MathNode } from "./mathExpression";
import { evaluateSignal, type SignalNode } from "./signalEngine";
import { toSignalNode } from "./unifiedSignalParser";
import type { CompositeImpulse, CompositeClassification, CompositeAnalysis, CompositeSegment } from "./results";
export type { CompositeImpulse, CompositeClassification, CompositeAnalysis, CompositeSegment };

/** Raised when the ∫₋∞ᵗ quick action meets a term it cannot resolve to a closed-form antiderivative. */
export class SymbolicOperatorError extends Error {}

export type CompositeParseResult = { ok: true; node: MathNode; latex: string } | { ok: false; error: string };




export type CompositeSignalModel = {
  node: MathNode;
  latex: string;
  impulses: CompositeImpulse[];
  breakpoints: number[];
  valueAt: (time: number) => number;
};

export const EPSILON = 1e-9;
export const VARIABLE = "t";
export const num = (value: number): MathNode => ({ kind: "num", value });

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

export function foldMul(factors: MathNode[]): MathNode {
  return factors.reduce<MathNode>((acc, factor) => (acc.kind === "num" && acc.value === 1 ? factor : { kind: "mul", left: acc, right: factor }), num(1));
}

export const texNumber = (value: number) => Number(value.toFixed(6)).toString();

/** Structurally collects every order-0 δ term into a drawable impulse; higher orders are reported as warnings. */
export function collectImpulses(node: MathNode, warnings: string[]): CompositeImpulse[] {
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
export function collectBreakpoints(node: MathNode): number[] {
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

export function containsRunningIntegral(node: MathNode): boolean {
  switch (node.kind) {
    case "runningIntegral": return true;
    case "neg": return containsRunningIntegral(node.value);
    case "add": case "sub": case "mul": case "div": return containsRunningIntegral(node.left) || containsRunningIntegral(node.right);
    case "pow": return containsRunningIntegral(node.base) || containsRunningIntegral(node.exponent);
    case "call": case "delta": return containsRunningIntegral(node.argument);
    default: return false;
  }
}

export function bridgeOrNull(node: MathNode): SignalNode | null {
  try { return toSignalNode(node, VARIABLE); } catch { return null; }
}

/** A δ-bearing term contributes no ordinary sample; it is drawn separately as an arrow. */
export function termHasDelta(node: MathNode): boolean {
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


/** Sub-pixel time offset used to straddle a jump discontinuity: t0⁻ and t0⁺ land on (near-)identical
 *  screen x-coordinates, so the two points draw as a crisp vertical wall rather than a slanted ramp. */
export const WALL_EPSILON = 1e-6;

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