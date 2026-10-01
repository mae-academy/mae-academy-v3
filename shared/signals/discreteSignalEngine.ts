/**
 * MAE Academy / Signals & Systems — discrete-time (x[n]) signal engine.
 *
 * Parses x[n] = … on the shared Dirac grammar with n as the variable and evaluates it with discrete
 * semantics: δ[n] is the Kronecker delta, u[n] = 1 for n ≥ 0, r[n] = n·u[n], rect_N[n] = u[n+N] − u[n−N−1].
 * Operations act on the integer index only: y[n] = A·x[−Mn − k] + B (shift → reversal → decimation),
 * or with interpolation y[n] = A·x[±n/L − k] + B for L | n and B elsewhere (zero insertion).
 * Pure math: no React, DOM, or canvas.
 */
import { evaluateNode, parseExpression, type MathNode } from "./mathExpression";

export type DiscreteParse = { ok: true; node: MathNode; latex: string } | { ok: false; error: string };
export type DiscreteSample = { n: number; value: number };
export type ScalingMode = "none" | "down" | "up";
export type DiscreteOperation = { shift: number; reverse: boolean; scaling: ScalingMode; factor: number; amplitude: number; bias: number };

export const IDENTITY_OPERATION: DiscreteOperation = { shift: 0, reverse: false, scaling: "none", factor: 2, amplitude: 1, bias: 0 };
const N = "n";
/** Samples are evaluated on this index range; support that reaches it is treated as unbounded. */
export const EVALUATION_RADIUS = 80;

/** Index of the delimiter closing the one at `open` ("(" or "["), honouring nesting of both kinds. */
function matching(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && --depth === 0) return index;
  }
  return -1;
}

/** rect_N[arg] → (u(arg+N) − u(arg−N−1)): the symmetric length-(2N+1) discrete pulse. */
function expandDiscreteRect(source: string): string {
  const pattern = /\\(?:text|operatorname|mathrm)\{rect\}_\{?(\d+)\}?\s*(?=[[(])/;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const open = match.index + match[0].length; const close = matching(source, open);
    if (close < 0) throw new Error("Unbalanced brackets after rect_N.");
    const argument = source.slice(open + 1, close); const width = Number(match[1]);
    source = `${source.slice(0, match.index)}\\left(u\\left(${argument}+${width}\\right)-u\\left(${argument}-${width + 1}\\right)\\right)${source.slice(close + 1)}`;
  }
  return source;
}

/** MathLive bracket spellings → plain brackets → parentheses, plus the x[n]= prefix stripped. */
export function normalizeDiscreteLatex(source: string): string {
  const unified = source
    .replace(/\\left\\lbrack|\\lbrack|\\left\[/g, "[").replace(/\\right\\rbrack|\\rbrack|\\right\]/g, "]")
    .replace(/^\s*[a-zA-Z]\s*\[\s*n\s*\]\s*=\s*/, "")
    .replace(/\\placeholder(?:\[[^\]]*\])?\{\}/g, "")
    .replace(/(?<![\\A-Za-z{])(rect|tri|sinc|sgn)(?=\s*[[(])/g, "\\text{$1}")
    .replace(/(?<![\\A-Za-z{])(sin|cos)(?=\s*[[(])/g, "\\$1");
  return expandDiscreteRect(unified).replaceAll("[", "(").replaceAll("]", ")").trim();
}

export function parseDiscreteSignal(source: string): DiscreteParse {
  let normalized: string;
  try { normalized = normalizeDiscreteLatex(source); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The sequence could not be parsed." }; }
  if (!normalized) return { ok: false, error: "Enter a sequence from the keypad, for example u[n]-u[n-5]." };
  try { return { ok: true, node: parseExpression(normalized, N), latex: normalized }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The sequence could not be parsed." }; }
}

/** Discrete semantics over the shared AST; any undefined sample is NaN (never throws). */
export function evaluateDiscrete(node: MathNode, n: number): number {
  switch (node.kind) {
    case "num": return node.value;
    case "var": return node.name === N ? n : Number.NaN;
    case "neg": return -evaluateDiscrete(node.value, n);
    case "add": return evaluateDiscrete(node.left, n) + evaluateDiscrete(node.right, n);
    case "sub": return evaluateDiscrete(node.left, n) - evaluateDiscrete(node.right, n);
    case "mul": return evaluateDiscrete(node.left, n) * evaluateDiscrete(node.right, n);
    case "div": { const denominator = evaluateDiscrete(node.right, n); return Math.abs(denominator) < 1e-12 ? Number.NaN : evaluateDiscrete(node.left, n) / denominator; }
    case "pow": return Math.pow(evaluateDiscrete(node.base, n), evaluateDiscrete(node.exponent, n));
    case "delta": {
      if (node.order > 0) return Number.NaN;
      const argument = evaluateDiscrete(node.argument, n);
      return Math.abs(argument) < 1e-9 ? 1 : 0; // Kronecker δ[m]
    }
    case "call": {
      const argument = evaluateDiscrete(node.argument, n);
      if (!Number.isFinite(argument)) return Number.NaN;
      if (node.name === "u") return argument >= -1e-9 ? 1 : 0;
      if (node.name === "r") return argument >= 0 ? argument : 0;
      try { return evaluateNode({ kind: "call", name: node.name, argument: { kind: "num", value: argument } }, N, 0); } catch { return Number.NaN; }
    }
    default: return Number.NaN; // running integrals / system inputs have no discrete meaning here
  }
}

export function sampleSequence(node: MathNode, radius = EVALUATION_RADIUS): DiscreteSample[] {
  return Array.from({ length: 2 * radius + 1 }, (_, index) => { const n = index - radius; const value = evaluateDiscrete(node, n); return { n, value: Number.isFinite(value) ? value + 0 : 0 }; }); // + 0 folds −0
}

/** Source index m for output index n under the pipeline, or null when the sample is an inserted zero. */
export function sourceIndex(operation: DiscreteOperation, n: number): number | null {
  const factor = Math.max(1, Math.round(operation.factor));
  let scaled: number;
  if (operation.scaling === "down") scaled = factor * n;
  else if (operation.scaling === "up") { if (n % factor !== 0) return null; scaled = n / factor; }
  else scaled = n;
  const reversed = operation.reverse ? -scaled : scaled;
  return reversed - Math.round(operation.shift);
}

/** y[n] = A·x[m(n)] + B, with interpolated (zero-inserted) samples equal to B. */
export function applyOperation(x: (n: number) => number, operation: DiscreteOperation, radius = EVALUATION_RADIUS): DiscreteSample[] {
  return Array.from({ length: 2 * radius + 1 }, (_, index) => {
    const n = index - radius; const m = sourceIndex(operation, n);
    const base = m === null ? 0 : x(m);
    const value = operation.amplitude * (Number.isFinite(base) ? base : 0) + operation.bias + 0;
    return { n, value };
  });
}

const fmt = (value: number) => { const rounded = Number(value.toFixed(4)); return Object.is(rounded, -0) ? "0" : String(rounded); };

/** KaTeX for the realized mapping, e.g. y[n] = 2\,x[-2n-3] + 1. */
export function operationLatex(operation: DiscreteOperation): string {
  const factor = Math.max(1, Math.round(operation.factor)); const k = Math.round(operation.shift); const sign = operation.reverse ? "-" : "";
  let index: string;
  if (operation.scaling === "down" && factor > 1) index = `${sign}${factor}n`;
  else if (operation.scaling === "up" && factor > 1) index = `${sign}\\frac{n}{${factor}}`;
  else index = `${sign}n`;
  if (k !== 0) index += k > 0 ? `-${k}` : `+${-k}`;
  const gain = operation.amplitude === 1 ? "" : operation.amplitude === -1 ? "-" : `${fmt(operation.amplitude)}\\,`;
  const bias = operation.bias === 0 ? "" : operation.bias > 0 ? `+${fmt(operation.bias)}` : `-${fmt(-operation.bias)}`;
  const zeros = operation.scaling === "up" && factor > 1 ? `\\quad(${factor}\\mid n;\\ ${bias ? fmt(operation.bias) : "0"}\\text{ otherwise})` : "";
  return `y[n]=${gain}x\\!\\left[${index}\\right]${bias}${zeros}`;
}

export type DiscreteSupport = { lo: number; hi: number; unboundedLeft: boolean; unboundedRight: boolean; empty: boolean };

/** Non-negligible support (|x| > 10⁻³·peak); ends touching the evaluation radius are flagged unbounded. */
export function sequenceSupport(samples: DiscreteSample[]): DiscreteSupport {
  const peak = Math.max(0, ...samples.map((sample) => Math.abs(sample.value)));
  if (peak < 1e-12) return { lo: 0, hi: 0, unboundedLeft: false, unboundedRight: false, empty: true };
  const live = samples.filter((sample) => Math.abs(sample.value) > 1e-3 * peak);
  const lo = live[0].n; const hi = live[live.length - 1].n; const edge = samples[samples.length - 1].n;
  return { lo, hi, unboundedLeft: lo <= -edge, unboundedRight: hi >= edge, empty: false };
}

/**
 * Symmetric integer window [−S, +S] centred on n = 0: S = max(10, extent + 2), where extent is the farthest
 * bounded support edge over all sequences (an unbounded side just fills the default span); S is capped at 40.
 */
export function discreteWindow(sequences: DiscreteSample[][]): { from: number; to: number } {
  const supports = sequences.map(sequenceSupport).filter((support) => !support.empty);
  const edges = supports.flatMap((support) => [support.unboundedLeft ? 0 : Math.abs(support.lo), support.unboundedRight ? 0 : Math.abs(support.hi)]);
  const span = Math.min(40, Math.max(10, Math.max(0, ...edges) + 2));
  return { from: -span, to: span };
}

/** Vertical bound 1.2·max(|y_min|, |y_max|, 1): symmetric when any sample is negative, else a small floor below 0. */
export function discreteYDomain(sequences: DiscreteSample[][], window: { from: number; to: number }): [number, number] {
  const visible = sequences.flatMap((samples) => samples.filter((sample) => sample.n >= window.from && sample.n <= window.to).map((sample) => sample.value));
  const peak = Math.max(1, ...visible.map(Math.abs)); const bound = 1.2 * peak;
  return visible.some((value) => value < -1e-9) ? [-bound, bound] : [-0.1 * bound, bound];
}

/**
 * Mini-array x[n] = {…, a, \underline{b}, c, …} over the support (always including n = 0),
 * with ellipses on unbounded sides or when more than `maxEntries` samples would be listed.
 */
export function sequenceArrayLatex(name: string, samples: DiscreteSample[], maxEntries = 13): string {
  const support = sequenceSupport(samples);
  if (support.empty) return `${name}[n]=\\{\\dots,0,\\underline{0},0,\\dots\\}`;
  const valueAt = (n: number) => samples.find((sample) => sample.n === n)?.value ?? 0;
  // An unbounded side lists 2 samples past n = 0 — or up to where the sequence settles to a constant (≤ 30 samples out).
  const settle = (direction: 1 | -1) => { let last = 0; for (let n = 0; Math.abs(n) <= 30; n += direction) if (valueAt(n) !== valueAt(n + direction)) last = Math.abs(n) + 1; return Math.abs(last) > 29 ? 2 : Math.max(2, last); };
  let from = Math.min(0, support.unboundedLeft ? -settle(-1) : support.lo); let to = Math.max(0, support.unboundedRight ? settle(1) : support.hi);
  let leftDots = support.unboundedLeft; let rightDots = support.unboundedRight;
  if (to - from + 1 > maxEntries) {
    // Keep n = 0 near the left so the underline stays visible: at most 3 entries before it.
    const nextFrom = Math.max(from, -3); const nextTo = Math.min(to, nextFrom + maxEntries - 1);
    leftDots ||= nextFrom > from; rightDots ||= nextTo < to; from = nextFrom; to = nextTo;
  }
  const entries: string[] = [];
  for (let n = from; n <= to; n += 1) entries.push(n === 0 ? `\\underline{${fmt(valueAt(n))}}` : fmt(valueAt(n)));
  return `${name}[n]=\\{${leftDots ? "\\dots," : ""}${entries.join(",\\,")}${rightDots ? ",\\dots" : ""}\\}`;
}

/** Energy Σ|x[n]|² over the evaluated range (flagged when the support is unbounded). */
export function sequenceEnergy(samples: DiscreteSample[]): { energy: number; bounded: boolean } {
  const support = sequenceSupport(samples);
  const energy = samples.reduce((total, sample) => total + sample.value * sample.value, 0);
  return { energy, bounded: support.empty || (!support.unboundedLeft && !support.unboundedRight) };
}


/* ─────────────────────────── Academic analysis ─────────────────────────── */

export type SequenceClassification = "Energy Signal" | "Power Signal" | "Neither";
export type SequenceSymmetry = "even" | "odd" | "even and odd" | "neither";
export type SequenceAnalysis = {
  classification: SequenceClassification;
  /** Σ|x[n]|²; null when infinite. */
  energy: number | null;
  /** lim (1/(2N+1)) Σ_{|n|≤N}|x[n]|²; null when unbounded. */
  power: number | null;
  /** Fundamental period N₀ ∈ ℤ⁺ (null for aperiodic sequences). */
  period: number | null;
  symmetry: SequenceSymmetry;
};

const CHECK = 60; const MAX_PERIOD = 40;
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * (1 + Math.max(Math.abs(a), Math.abs(b)));
const finiteOr0 = (value: number) => (Number.isFinite(value) ? value : 0);

/** Smallest N₀ ∈ 1…40 with x[n + N₀] = x[n] on the check range (the zero sequence reports 1). */
export function detectPeriod(x: (n: number) => number): number | null {
  for (let period = 1; period <= MAX_PERIOD; period += 1) {
    let periodic = true;
    for (let n = -CHECK; n <= CHECK && periodic; n += 1) periodic = same(finiteOr0(x(n + period)), finiteOr0(x(n)));
    if (periodic) return period;
  }
  return null;
}

/**
 * Energy/power classification, fundamental period, and even/odd symmetry of x[n]. Energy uses a tail test
 * (E₈₀ ≈ E₄₀); non-periodic power signals average x² over the far tails, P = (P₊ + P₋)/2.
 */
export function analyzeSequence(x: (n: number) => number): SequenceAnalysis {
  const value = (n: number) => finiteOr0(x(n));
  const energyOver = (radius: number) => { let total = 0; for (let n = -radius; n <= radius; n += 1) total += value(n) ** 2; return total; };
  const tailMean = (from: number, to: number) => { let total = 0; for (let n = from; n <= to; n += 1) total += value(n) ** 2; return total / (to - from + 1); };
  const e80 = energyOver(80); const e40 = energyOver(40);

  let even = true; let odd = true;
  for (let n = 1; n <= CHECK; n += 1) { even &&= same(value(-n), value(n)); odd &&= same(value(-n), -value(n)); }
  odd &&= same(value(0), 0);
  const symmetry: SequenceSymmetry = even && odd ? "even and odd" : even ? "even" : odd ? "odd" : "neither";

  if (e80 < 1e-18) return { classification: "Energy Signal", energy: 0, power: 0, period: 1, symmetry };
  const period = detectPeriod(value);
  if (period !== null) {
    let mean = 0; for (let n = 0; n < period; n += 1) mean += value(n) ** 2;
    return { classification: "Power Signal", energy: null, power: mean / period, period, symmetry };
  }
  if (Number.isFinite(e80) && e80 - e40 <= 1e-6 * Math.max(1, e80)) return { classification: "Energy Signal", energy: e80, power: 0, period: null, symmetry };
  const right = [tailMean(40, 60), tailMean(60, 80)]; const left = [tailMean(-60, -40), tailMean(-80, -60)];
  const steady = [right, left].every(([near, far]) => Number.isFinite(near) && Number.isFinite(far) && Math.abs(far - near) <= 0.1 * Math.max(far, near, 1e-12));
  if (steady) return { classification: "Power Signal", energy: null, power: (right[1] + left[1]) / 2, period: null, symmetry };
  return { classification: "Neither", energy: null, power: null, period: null, symmetry };
}
