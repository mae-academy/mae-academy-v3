/**
 * MAE Academy / Signals & Systems — Unified Signal Engine.
 *
 * Single canonical front end for every Signals & Systems studio: LaTeX canonicalization,
 * parsing (Dirac grammar), distributional differentiation, symbolic anti-differentiation with
 * a numeric running-integral fallback, explicit operator wrappers, and the bridge onto the
 * sampled SignalNode AST consumed by the convolution and Fourier engines.
 * Deliberately free of React, DOM, and Canvas concerns.
 */
import {
  add,
  affineArgument,
  containsVariable,
  differentiate,
  evaluateNode,
  factorize,
  flattenSum,
  mul,
  nodeToLatex,
  parseExpression,
  renameVariable,
  sub,
  type FunctionName,
  type MathNode,
} from "@/features/signals/engines/diracIntegral";
import type { ParsedSignal, SignalFunction, SignalNode } from "@/features/signals/engines/signalEngine";

export type { MathNode } from "@/features/signals/engines/diracIntegral";

/* ─────────────────────────── Token catalog ─────────────────────────── */

export type InsertMode = "after" | "placeholder";
/** `label` is KaTeX; `insert` is the MathLive LaTeX (`#?` marks a placeholder slot). */
export type SignalToken = { id: string; label: string; insert: string; mode: InsertMode; ariaLabel: string };

const tex = String.raw;

/** Strict insertion order mandated by the platform specification. */
export const SIGNAL_TOKENS: readonly SignalToken[] = [
  { id: "delta", label: tex`\delta(t)`, insert: tex`\delta(t)`, mode: "after", ariaLabel: "Dirac impulse" },
  { id: "u", label: tex`u(t)`, insert: tex`u(t)`, mode: "after", ariaLabel: "Unit step" },
  { id: "r", label: tex`r(t)`, insert: tex`r(t)`, mode: "after", ariaLabel: "Ramp" },
  { id: "rect", label: tex`\text{rect}(t)`, insert: tex`\text{rect}(t)`, mode: "after", ariaLabel: "Rectangular pulse" },
  { id: "tri", label: tex`\text{tri}(t)`, insert: tex`\text{tri}(t)`, mode: "after", ariaLabel: "Triangular pulse" },
  { id: "sinc", label: tex`\text{sinc}(t)`, insert: tex`\text{sinc}(t)`, mode: "after", ariaLabel: "Normalized sinc" },
  { id: "Sa", label: tex`\text{Sa}(t)`, insert: tex`\text{Sa}(t)`, mode: "after", ariaLabel: "Sampling function" },
  { id: "sin", label: tex`\sin(t)`, insert: tex`\sin(t)`, mode: "after", ariaLabel: "Sine" },
  { id: "cos", label: tex`\cos(t)`, insert: tex`\cos(t)`, mode: "after", ariaLabel: "Cosine" },
  { id: "t", label: tex`t`, insert: tex`t`, mode: "after", ariaLabel: "Time variable" },
  { id: "exp", label: tex`e^{t}`, insert: tex`e^{t}`, mode: "after", ariaLabel: "Exponential" },
];

export const OPERATOR_TOKENS: readonly SignalToken[] = [
  { id: "plus", label: "+", insert: "+", mode: "after", ariaLabel: "Plus" },
  { id: "minus", label: "-", insert: "-", mode: "after", ariaLabel: "Minus" },
  { id: "times", label: tex`\times`, insert: tex`\times`, mode: "after", ariaLabel: "Multiply" },
  { id: "divide", label: tex`\div`, insert: tex`\div`, mode: "after", ariaLabel: "Divide" },
  { id: "power", label: tex`x^{\square}`, insert: "^{#?}", mode: "placeholder", ariaLabel: "Power" },
  { id: "pi", label: tex`\pi`, insert: tex`\pi`, mode: "after", ariaLabel: "Pi" },
  { id: "e", label: tex`e`, insert: "e", mode: "after", ariaLabel: "Euler number" },
  { id: "ln", label: tex`\ln`, insert: tex`\ln\left(#?\right)`, mode: "placeholder", ariaLabel: "Natural logarithm" },
  { id: "log", label: tex`\log_{10}`, insert: tex`\log_{10}\left(#?\right)`, mode: "placeholder", ariaLabel: "Base-10 logarithm" },
];

/** Transfer-function palette (Laplace / Z studios) — replaces the time-domain signal row. */
export function transferTokens(variable: "s" | "z"): SignalToken[] {
  return [
    { id: `${variable}`, label: variable, insert: variable, mode: "after", ariaLabel: `Complex variable ${variable}` },
    { id: `${variable}2`, label: `${variable}^{2}`, insert: `${variable}^{2}`, mode: "after", ariaLabel: `${variable} squared` },
    { id: `${variable}n`, label: `${variable}^{\\square}`, insert: `${variable}^{#?}`, mode: "placeholder", ariaLabel: `${variable} to a power` },
    { id: "frac", label: tex`\frac{\square}{\square}`, insert: tex`\frac{#?}{#?}`, mode: "placeholder", ariaLabel: "Fraction" },
  ];
}

/** Spectrum palette (Fourier frequency-domain input) — replaces the time-domain signal row. */
export function spectrumTokens(): SignalToken[] {
  return [
    { id: "jw", label: tex`j\omega`, insert: tex`j\omega`, mode: "after", ariaLabel: "j omega" },
    { id: "w", label: tex`\omega`, insert: tex`\omega`, mode: "after", ariaLabel: "Omega" },
    { id: "w2", label: tex`\omega^{2}`, insert: tex`\omega^{2}`, mode: "after", ariaLabel: "Omega squared" },
    { id: "frac", label: tex`\frac{\square}{\square}`, insert: tex`\frac{#?}{#?}`, mode: "placeholder", ariaLabel: "Fraction" },
    { id: "deltaw", label: tex`\delta(\omega)`, insert: tex`\delta(\omega)`, mode: "after", ariaLabel: "Spectral impulse" },
    { id: "rectw", label: tex`\text{rect}(\omega)`, insert: tex`\text{rect}(\omega)`, mode: "after", ariaLabel: "Ideal pass-band" },
    { id: "sincw", label: tex`\text{sinc}(\omega)`, insert: tex`\text{sinc}(\omega)`, mode: "after", ariaLabel: "Sinc spectrum" },
    { id: "piw", label: tex`\pi`, insert: tex`\pi`, mode: "after", ariaLabel: "Pi" },
  ];
}

/** Discrete-time palette (x[n]): canonical sequences with the integer index n. */
export function discreteTokens(): SignalToken[] {
  return [
    { id: "dkron", label: tex`\delta[n]`, insert: tex`\delta[n]`, mode: "after", ariaLabel: "Kronecker delta" },
    { id: "du", label: tex`u[n]`, insert: tex`u[n]`, mode: "after", ariaLabel: "Discrete unit step" },
    { id: "dr", label: tex`r[n]`, insert: tex`r[n]`, mode: "after", ariaLabel: "Discrete ramp" },
    { id: "drect", label: tex`\text{rect}_{N}[n]`, insert: tex`\text{rect}_{#?}[n]`, mode: "placeholder", ariaLabel: "Discrete rectangular pulse" },
    { id: "dgeo", label: tex`a^{n}u[n]`, insert: tex`#?^{n}u[n]`, mode: "placeholder", ariaLabel: "Geometric sequence" },
    { id: "dexp", label: tex`e^{-\alpha n}u[n]`, insert: tex`e^{-#?n}u[n]`, mode: "placeholder", ariaLabel: "Discrete exponential" },
    { id: "dcos", label: tex`\cos(\omega_0 n)`, insert: tex`\cos\left(#?n\right)`, mode: "placeholder", ariaLabel: "Discrete cosine" },
    { id: "dsin", label: tex`\sin(\omega_0 n)`, insert: tex`\sin\left(#?n\right)`, mode: "placeholder", ariaLabel: "Discrete sine" },
    { id: "dn", label: tex`n`, insert: tex`n`, mode: "after", ariaLabel: "Sample index n" },
  ];
}

export const NUMPAD_ROWS: readonly (readonly string[])[] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["(", "0", ")"]];

/* ─────────────────────────── Canonicalization ─────────────────────────── */

/**
 * Folds every legacy / free-typed spelling onto the canonical grammar:
 * Λ(t) → \text{tri}(t), \operatorname{X} → \text{X}, bare rect(…) → \text{rect}(…),
 * \log_{10} → \log, MathLive placeholders dropped.
 */
export function canonicalizeSignalLatex(source: string): string {
  return source
    .replaceAll("\\Lambda", "\\text{tri}")
    .replaceAll("Λ", "\\text{tri}")
    .replace(/\\(?:operatorname|mathrm)\{(rect|tri|sinc|Sa|sgn)\}/g, "\\text{$1}")
    .replace(/(?<![\\A-Za-z{])(rect|tri|sinc|Sa|sgn)(?=\s*(?:\\left)?\()/g, "\\text{$1}")
    .replace(/(?<![\\A-Za-z{])(sin|cos|tan|ln|log|exp)(?=\s*(?:\\left)?\()/g, "\\$1")
    .replace(/\\log_\{?10\}?/g, "\\log")
    .replace(/\\mathrm\{d\}/g, "d")
    .replace(/\\placeholder(?:\[[^\]]*\])?\{\}/g, "")
    .replace(/\\exponentialE/g, "e")
    // |x| juxtaposed with other factors (e^{-3|t|}) is ambiguous for the bar-delimited grammar; name it.
    .replace(/\\left\|([^|]+?)\\right\||\|([^|]+?)\|/g, (_match, inner: string | undefined, bare: string | undefined) => `\\operatorname{abs}(${inner ?? bare})`)
    .trim();
}

/** Display-only: KaTeX-safe rendering of the live editor value (placeholders become □). */
export function displaySignalLatex(source: string): string {
  const shown = source.replace(/\\placeholder(?:\[[^\]]*\])?\{\}/g, "\\square").replaceAll("\\Lambda", "\\text{tri}").replace(/\\(?:operatorname|mathrm)\{(rect|tri|sinc|Sa|sgn)\}/g, "\\text{$1}");
  return shown.trim() ? shown : "\\square";
}

/** Splits an optional left-hand side such as x(t)=, y(t)=, h(t)=, H(s)=. */
export function splitSignalEquation(source: string): { lhs: string | null; rhs: string } {
  const match = source.match(/^\s*((?:\\operatorname\{)?[A-Za-z](?:\})?(?:\\left)?\(\s*(?:\\tau|[A-Za-z])\s*(?:\\right)?\))\s*=\s*/);
  return match ? { lhs: match[1], rhs: source.slice(match[0].length) } : { lhs: null, rhs: source };
}

/** Splits x₁ ∗ x₂ ∗ … at top-level \ast (or \star) so each operand can be transformed separately (convolution theorem). */
export function splitConvolution(source: string): string[] {
  const rhs = splitSignalEquation(source).rhs; const parts: string[] = []; let depth = 0; let start = 0;
  for (let index = 0; index < rhs.length; index += 1) {
    const char = rhs[index];
    if (char === "{" || char === "(" || char === "[") depth += 1; else if (char === "}" || char === ")" || char === "]") depth -= 1;
    else if (depth === 0 && char === "\\") {
      const command = /^\\(?:ast|star)(?![A-Za-z])/.exec(rhs.slice(index));
      if (command) { parts.push(rhs.slice(start, index).trim()); index += command[0].length - 1; start = index + 1; }
    }
  }
  parts.push(rhs.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

/* ─────────────────────────── Parsing ─────────────────────────── */

export type UnifiedParseResult = { ok: true; node: MathNode; latex: string } | { ok: false; error: string };

/** Locates the delimiter closing the "(" or "[" at `open`, honouring nesting. */
function matchingBracket(source: string, open: number): number {
  const opener = source[open]; const closer = opener === "(" ? ")" : "]";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === opener) depth += 1;
    else if (source[index] === closer && --depth === 0) return index;
  }
  return -1;
}

const DERIVATIVE_WRAPPER = /\\frac\{d\}\{d([a-z])\}\s*(?:\\left)?[[(]/;

/**
 * Resolves explicit \frac{d}{dt}[…] wrappers with the distributional differentiator (innermost first),
 * so wrappers around δ, u, or ∫₋∞ᵗ terms evaluate instead of failing inside the grammar's classical rule.
 */
function resolveDerivativeWrappers(source: string, variable: string): string {
  const match = DERIVATIVE_WRAPPER.exec(source);
  if (!match || match[1] !== variable) return source;
  const open = match.index + match[0].length - 1;
  const close = matchingBracket(source, open);
  if (close < 0) return source;
  const innerEnd = source.slice(0, close).endsWith("\\right") ? close - 6 : close;
  const inner = resolveDerivativeWrappers(source.slice(open + 1, innerEnd), variable);
  let replacement: string;
  try { replacement = `\\left(${nodeToLatex(siftSimplify(differentiateSignal(parseExpression(inner, variable), variable), variable))}\\right)`; }
  catch { return source; }
  return resolveDerivativeWrappers(`${source.slice(0, match.index)}${replacement}${source.slice(close + 1)}`, variable);
}

export function parseUnifiedSignal(source: string, variable = "t"): UnifiedParseResult {
  const rhs = canonicalizeSignalLatex(splitSignalEquation(source).rhs);
  if (!rhs) return { ok: false, error: "Enter a signal from the keypad, for example \\sin(2\\pi t)." };
  try { return { ok: true, node: parseExpression(resolveDerivativeWrappers(rhs, variable), variable), latex: rhs }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The expression could not be parsed." }; }
}

/** Safe pointwise evaluation: distributions and domain errors map to NaN instead of throwing. */
export function evaluateUnifiedSignal(node: MathNode, time: number, variable = "t"): number {
  try { const value = evaluateNode(node, variable, time); return Number.isFinite(value) ? value : Number.NaN; }
  catch { return Number.NaN; }
}

/* ─────────────────────────── Symbolic helpers ─────────────────────────── */

const EPSILON = 1e-9;
const num = (value: number): MathNode => ({ kind: "num", value });
const call = (name: FunctionName, argument: MathNode): MathNode => ({ kind: "call", name, argument });
const div = (left: MathNode, right: MathNode): MathNode => (right.kind === "num" && right.value === 1 ? left : left.kind === "num" && right.kind === "num" && right.value !== 0 ? num(left.value / right.value) : { kind: "div", left, right });
const pow = (base: MathNode, exponent: number): MathNode => (exponent === 1 ? base : { kind: "pow", base, exponent: num(exponent) });
const neg = (value: MathNode): MathNode => (value.kind === "num" ? num(-value.value) : { kind: "neg", value });
const PLACEHOLDER = "\u0002";

/** Replaces every occurrence of `name` with `replacement`. */
function substitute(node: MathNode, name: string, replacement: MathNode): MathNode {
  switch (node.kind) {
    case "num": return node;
    case "var": return node.name === name ? replacement : node;
    case "neg": return { kind: "neg", value: substitute(node.value, name, replacement) };
    case "add": case "sub": case "mul": case "div": return { kind: node.kind, left: substitute(node.left, name, replacement), right: substitute(node.right, name, replacement) };
    case "pow": return { kind: "pow", base: substitute(node.base, name, replacement), exponent: substitute(node.exponent, name, replacement) };
    case "call": return { kind: "call", name: node.name, argument: substitute(node.argument, name, replacement) };
    case "delta": return { kind: "delta", order: node.order, argument: substitute(node.argument, name, replacement) };
    case "input": return { kind: "input", order: node.order, argument: substitute(node.argument, name, replacement) };
    case "runningIntegral": return node.dummyVariable === name ? node : { kind: "runningIntegral", integrand: substitute(node.integrand, name, replacement), dummyVariable: node.dummyVariable };
  }
}

/** Rebuilds a signed sum from flattenSum terms. */
function fromTerms(terms: Array<{ sign: number; node: MathNode }>): MathNode {
  return terms.reduce<MathNode>((total, term) => (term.sign < 0 ? sub(total, term.node) : add(total, term.node)), num(0));
}

/** Sifting simplification: f(t)·δ(at+b) → f(t₀)/1·δ(at+b); zero-weight impulses are dropped. */
function siftSimplify(node: MathNode, variable: string): MathNode {
  const terms = flattenSum(node).flatMap((term) => {
    const factors = factorize(term.node);
    if (!factors.delta || factors.deltaCount > 1 || factors.delta.order > 0 || factors.others.length === 0) return [term];
    const affine = affineArgument(factors.delta.argument, variable);
    if (!affine || Math.abs(affine.slope) < EPSILON) return [term];
    const amplitude = factors.others.reduce(mul, num(1));
    if (!containsVariable(amplitude, variable)) return [term];
    const weight = evaluateUnifiedSignal(amplitude, -affine.intercept / affine.slope, variable);
    if (!Number.isFinite(weight)) return [term];
    if (Math.abs(weight) < EPSILON) return [];
    return [{ sign: term.sign, node: mul(num(Number(weight.toFixed(9))), factors.delta) }];
  });
  return terms.length ? fromTerms(terms) : num(0);
}

/* ─────────────────────────── Differentiation ─────────────────────────── */

/** Generalized (distributional) derivative: δ⁽ⁿ⁾ gains an order, ∫₋∞ᵗ collapses by the fundamental theorem. */
export function differentiateSignal(node: MathNode, variable = "t"): MathNode {
  const d = (value: MathNode) => differentiateSignal(value, variable);
  switch (node.kind) {
    case "num": return num(0);
    case "var": return num(node.name === variable ? 1 : 0);
    case "neg": return neg(d(node.value));
    case "add": return add(d(node.left), d(node.right));
    case "sub": return sub(d(node.left), d(node.right));
    case "mul": return add(mul(d(node.left), node.right), mul(node.left, d(node.right)));
    case "div": {
      if (!containsVariable(node.right, variable)) return div(d(node.left), node.right);
      return div(sub(mul(d(node.left), node.right), mul(node.left, d(node.right))), { kind: "pow", base: node.right, exponent: num(2) });
    }
    case "pow": {
      if (!containsVariable(node.exponent, variable)) {
        const exponent = evaluateUnifiedSignal(node.exponent, 0, variable);
        return mul(mul(num(exponent), pow(node.base, exponent - 1)), d(node.base));
      }
      return differentiate(node, variable);
    }
    case "call": {
      const outer = substitute(differentiate(call(node.name, { kind: "var", name: PLACEHOLDER }), PLACEHOLDER), PLACEHOLDER, node.argument);
      return mul(outer, d(node.argument));
    }
    case "delta": return mul({ kind: "delta", order: node.order + 1, argument: node.argument }, d(node.argument));
    case "input": return mul({ kind: "input", order: node.order + 1, argument: node.argument }, d(node.argument));
    case "runningIntegral": return renameVariable(node.integrand, node.dummyVariable, variable);
  }
}

/* ─────────────────────────── Integration ─────────────────────────── */

type Affine = { slope: number; intercept: number };
const affineNode = (form: Affine, variable: string): MathNode => {
  const linear = mul(num(form.slope), { kind: "var", name: variable });
  return form.intercept < 0 ? sub(linear, num(-form.intercept)) : add(linear, num(form.intercept));
};
/** ½·x²·u(x) — the antiderivative of r(x). */
const halfSquareStep = (argument: MathNode): MathNode => mul(div(pow(argument, 2), num(2)), call("u", argument));

/** Closed-form antiderivative of one additive term, or null when no table rule applies. */
function integrateTerm(node: MathNode, variable: string): MathNode | null {
  if (!containsVariable(node, variable)) return mul(node, { kind: "var", name: variable }); // ∫c dt = c·t
  const leaves: MathNode[] = [];
  const collect = (current: MathNode) => { if (current.kind === "mul") { collect(current.left); collect(current.right); } else leaves.push(current); };
  collect(node);
  const coefficient = leaves.filter((leaf) => !containsVariable(leaf, variable)).reduce(mul, num(1));
  const active = leaves.filter((leaf) => containsVariable(leaf, variable));

  // Polynomial monomial tⁿ (n ≠ −1) → tⁿ⁺¹/(n+1).
  if (active.length === 1) {
    const leaf = active[0];
    if (leaf.kind === "var") return mul(coefficient, div(pow(leaf, 2), num(2)));
    if (leaf.kind === "pow" && leaf.base.kind === "var" && leaf.base.name === variable && !containsVariable(leaf.exponent, variable)) {
      const exponent = evaluateUnifiedSignal(leaf.exponent, 0, variable);
      if (Math.abs(exponent + 1) < EPSILON) return mul(coefficient, call("ln", call("abs", leaf.base)));
      return mul(coefficient, div(pow(leaf.base, exponent + 1), num(exponent + 1)));
    }
  }

  // e^{kt+m}·u(at+b), k≠0, a>0 → (e^{kt+m} − e^{kt₀+m})/k · u(t−t₀) (causal exponential).
  if (active.length === 2) {
    const exponential = active.find((leaf) => leaf.kind === "call" && leaf.name === "exp") as Extract<MathNode, { kind: "call" }> | undefined;
    const step = active.find((leaf) => leaf.kind === "call" && leaf.name === "u") as Extract<MathNode, { kind: "call" }> | undefined;
    if (exponential && step) {
      const k = affineArgument(exponential.argument, variable); const s = affineArgument(step.argument, variable);
      if (k && s && Math.abs(k.slope) > EPSILON && s.slope > EPSILON) {
        const t0 = -s.intercept / s.slope;
        const anchor = Math.exp(k.slope * t0 + k.intercept);
        return mul(coefficient, mul(mul(num(1 / k.slope), sub(exponential, num(Number(anchor.toFixed(9))))), step));
      }
    }
    return null;
  }
  if (active.length !== 1) return null;

  const primitive = active[0];
  if (primitive.kind === "delta") {
    const form = affineArgument(primitive.argument, variable);
    if (!form || Math.abs(form.slope) < EPSILON) return null;
    // δ⁽ⁿ⁾(at+b) → δ⁽ⁿ⁻¹⁾(at+b)/a ; δ(at+b) → u(t−t₀)/|a|.
    if (primitive.order > 0) return mul(div(coefficient, num(form.slope)), { kind: "delta", order: primitive.order - 1, argument: primitive.argument });
    return mul(div(coefficient, num(Math.abs(form.slope))), call("u", affineNode({ slope: 1, intercept: form.intercept / form.slope }, variable)));
  }
  if (primitive.kind === "runningIntegral") return null;
  if (primitive.kind !== "call") return null;
  const form = affineArgument(primitive.argument, variable);
  if (!form || Math.abs(form.slope) < EPSILON) return null;
  const x = primitive.argument;
  const scale = div(coefficient, num(form.slope));
  switch (primitive.name) {
    case "sin": return mul(scale, neg(call("cos", x)));
    case "cos": return mul(scale, call("sin", x));
    case "exp": return mul(scale, call("exp", x));
    case "sgn": return mul(scale, call("abs", x));
    default: break;
  }
  // Step family: causal (a > 0) running integrals from −∞.
  if (form.slope < 0) return null;
  switch (primitive.name) {
    case "u": return mul(scale, call("r", x));
    case "r": return mul(scale, halfSquareStep(x));
    case "rect": return mul(scale, sub(call("r", add(x, num(0.5))), call("r", sub(x, num(0.5)))));
    case "tri": return mul(scale, add(sub(halfSquareStep(add(x, num(1))), mul(num(2), halfSquareStep(x))), halfSquareStep(sub(x, num(1)))));
    default: return null;
  }
}

export type IntegrationResult = { node: MathNode; exact: boolean };

/** Term-wise antiderivative; unresolved terms fall back to a numerically-evaluated ∫₋∞ᵗ wrapper. */
export function integrateSignal(node: MathNode, variable = "t"): IntegrationResult {
  let exact = true;
  const pieces = flattenSum(node).map((term) => {
    const closed = integrateTerm(term.node, variable);
    if (closed) return { sign: term.sign, node: closed };
    exact = false;
    return { sign: term.sign, node: { kind: "runningIntegral", integrand: renameVariable(term.node, variable, "tau"), dummyVariable: "tau" } as MathNode };
  });
  return { node: fromTerms(pieces), exact };
}

/* ─────────────────────────── Expression-level operators ─────────────────────────── */

/** Folds "a+-b" (a sum whose right operand is a negative product) into "a-b". */
const tidyLatex = (latex: string) => latex.replaceAll("+-", "-");

export type OperatorResult = { ok: true; latex: string; method: "symbolic" | "numeric" } | { ok: false; error: string };

export function differentiateExpression(source: string, variable = "t"): OperatorResult {
  const parsed = parseUnifiedSignal(source, variable);
  if (!parsed.ok) return parsed;
  try { return { ok: true, latex: tidyLatex(nodeToLatex(siftSimplify(differentiateSignal(parsed.node, variable), variable))), method: "symbolic" }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The expression could not be differentiated." }; }
}

export function integrateExpression(source: string, variable = "t"): OperatorResult {
  const parsed = parseUnifiedSignal(source, variable);
  if (!parsed.ok) return parsed;
  try { const result = integrateSignal(parsed.node, variable); return { ok: true, latex: tidyLatex(nodeToLatex(result.node)), method: result.exact ? "symbolic" : "numeric" }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The expression could not be integrated." }; }
}

/** Explicit operator syntax: the wrapper stays visible and is resolved on every reparse. */
export function wrapDerivativeLatex(source: string): string {
  const rhs = canonicalizeSignalLatex(splitSignalEquation(source).rhs) || "\\placeholder{}";
  return `\\frac{d}{dt}\\left(${rhs}\\right)`;
}

export function wrapIntegralLatex(source: string, variable = "t"): string {
  const parsed = parseUnifiedSignal(source, variable);
  const integrand = parsed.ok ? nodeToLatex(renameVariable(parsed.node, variable, "tau")) : "\\placeholder{}";
  return `\\int_{-\\infty}^{t}\\left(${integrand}\\right)\\,d\\tau`;
}

/* ─────────────────────────── SignalNode bridge ─────────────────────────── */

const BRIDGED_CALLS: Record<FunctionName, SignalFunction> = {
  sin: "sin", cos: "cos", tan: "tan", exp: "exp", ln: "ln", log: "log", sqrt: "sqrt", abs: "abs",
  u: "u", r: "r", sgn: "sgn", rect: "rect", tri: "tri", sinc: "sinc", Sa: "Sa",
};

/** Maps the Dirac-grammar AST onto the sampled SignalNode AST (convolution / Fourier engines). */
export function toSignalNode(node: MathNode, variable = "t"): SignalNode {
  switch (node.kind) {
    case "num": return Math.abs(node.value - Math.PI) < 1e-12 ? { kind: "variable", name: "pi" } : { kind: "number", value: node.value };
    case "var":
      if (node.name !== variable) throw new Error(`“${node.name}” is a free symbol; express the signal in terms of ${variable}.`);
      return { kind: "variable", name: "t" };
    case "neg": return { kind: "unary", operator: "-", value: toSignalNode(node.value, variable) };
    case "add": return { kind: "binary", operator: "+", left: toSignalNode(node.left, variable), right: toSignalNode(node.right, variable) };
    case "sub": return { kind: "binary", operator: "-", left: toSignalNode(node.left, variable), right: toSignalNode(node.right, variable) };
    case "mul": return { kind: "binary", operator: "*", left: toSignalNode(node.left, variable), right: toSignalNode(node.right, variable) };
    case "div": return { kind: "binary", operator: "/", left: toSignalNode(node.left, variable), right: toSignalNode(node.right, variable) };
    case "pow": return { kind: "binary", operator: "^", left: toSignalNode(node.base, variable), right: toSignalNode(node.exponent, variable) };
    case "call": return { kind: "function", name: BRIDGED_CALLS[node.name], argument: toSignalNode(node.argument, variable) };
    case "delta":
      if (node.order > 0) throw new Error("A Dirac doublet δ⁽ⁿ⁾ has no sampled representation in this studio.");
      return { kind: "function", name: "delta", argument: toSignalNode(node.argument, variable) };
    case "input": throw new Error("The system input x(t) has no sampled representation in this studio.");
    case "runningIntegral": return { kind: "function", name: "runint", argument: toSignalNode(renameVariable(node.integrand, node.dummyVariable, variable), variable) };
  }
}

/** Unified parse → SignalNode, shaped like the legacy ParsedSignal result. */
export function parseUnifiedSignalNode(source: string, variable = "t"): ParsedSignal {
  const parsed = parseUnifiedSignal(source, variable);
  if (!parsed.ok) return parsed;
  try { return { ok: true, ast: toSignalNode(parsed.node, variable), normalized: parsed.latex }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The signal could not be sampled." }; }
}
