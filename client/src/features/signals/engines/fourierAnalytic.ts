/**
 * MAE Academy / Signals & Systems — Tab D analytic Fourier transform pair engine.
 *
 * Forward  𝓕{x(t)} = X(jω): table pairs (δ, u, sgn, rect, tri, sinc, Sa, e^{−a|t|}, sinusoids → impulses)
 *   with the scaling/shift theorems, and causal/anti-causal exponential families via the Laplace
 *   engine (X(jω) = H(s)|_{s=jω} when every pole lies strictly left of the jω axis).
 * Inverse  𝓕⁻¹{X(jω)} = x(t): rational spectra in jω / ω → bilateral inverse Laplace with the strip on
 *   the jω axis, plus impulse lines δ(ω−ω₀) and ideal low-pass rect/sinc/Sa spectra.
 * Pure math: no React, DOM, or canvas.
 */
import { affineArgument, containsVariable, evaluateNode, nodeToLatex, type MathNode } from "./diracIntegral";
import {
  expandFraction,
  evaluateInverseLaplace,
  forwardLaplace,
  inverseLaplace,
  clusterPoles,
  polynomialRoots,
  type Complex,
  type InverseLaplaceResult,
  type TransferFunction,
} from "./laplaceEngine";
import { estimateSupport } from "@/lib/plotAutoScale";

/* ─────────────────────────── Shared helpers ─────────────────────────── */

const isZero = (value: number) => Math.abs(value) < 1e-7;
const c = (re = 0, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex) => c(a.re + b.re, a.im + b.im);
const cSub = (a: Complex, b: Complex) => c(a.re - b.re, a.im - b.im);
const cMul = (a: Complex, b: Complex) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cDiv = (a: Complex, b: Complex) => { const d = b.re * b.re + b.im * b.im; return d < 1e-300 ? c(Number.NaN, Number.NaN) : c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cScale = (a: Complex, k: number) => c(a.re * k, a.im * k);
const cAbs = (a: Complex) => Math.hypot(a.re, a.im);
const cExpJ = (theta: number) => c(Math.cos(theta), Math.sin(theta));
const fmt = (value: number) => { const rounded = Number(value.toFixed(4)); return Object.is(rounded, -0) ? "0" : String(rounded); };

function smallFraction(value: number): { p: number; q: number } | null {
  const magnitude = Math.abs(value);
  if (Math.abs(magnitude - Math.round(magnitude)) < 1e-9) return null;
  for (let q = 2; q <= 12; q += 1) { const p = Math.round(magnitude * q); if (p > 0 && Math.abs(magnitude - p / q) < 1e-7) return { p, q }; }
  return null;
}
/** |value| as KaTeX: integer, \frac{p}{q}, or decimal. */
const magnitudeTex = (value: number) => { const fraction = smallFraction(value); return fraction ? `\\frac{${fraction.p}}{${fraction.q}}` : fmt(Math.abs(value)); };
/** Signed coefficient prefix for a body ("" for 1, "-" for −1). */
const coefficientPrefix = (value: number) => (isZero(Math.abs(value) - 1) ? (value < 0 ? "-" : "") : `${value < 0 ? "-" : ""}${magnitudeTex(value)}`);
/** Multiples of π written as π, 2π, π/2 …; otherwise a decimal. */
function piTex(value: number): string {
  const ratio = value / Math.PI;
  if (Number.isFinite(ratio) && (Math.abs(ratio - Math.round(ratio)) < 1e-7 || smallFraction(ratio))) {
    if (isZero(Math.abs(ratio) - 1)) return `${ratio < 0 ? "-" : ""}\\pi`;
    const fraction = smallFraction(ratio);
    if (fraction) return `${ratio < 0 ? "-" : ""}\\frac{${fraction.p === 1 ? "" : fraction.p}\\pi}{${fraction.q}}`;
    return `${fmt(ratio)}\\pi`;
  }
  return fmt(value);
}
const complexTex = (value: Complex) => {
  if (isZero(value.im)) return fmt(value.re);
  const imaginary = `j${isZero(Math.abs(value.im) - 1) ? "" : fmt(Math.abs(value.im))}`;
  if (isZero(value.re)) return `${value.im < 0 ? "-" : ""}${imaginary}`;
  return `\\left(${fmt(value.re)}${value.im < 0 ? "-" : "+"}${imaginary}\\right)`;
};
const joinSigned = (parts: string[]) => parts.filter(Boolean).map((part, index) => (index > 0 && !part.startsWith("-") ? `+${part}` : part)).join("") || "0";
/** "ω − ω₀" / "t − t₀" with clean signs. */
const shifted = (symbol: string, at: number) => (isZero(at) ? symbol : `${symbol}${at > 0 ? "-" : "+"}${fmt(Math.abs(at))}`);

/** Real polynomial (descending) evaluated at a complex point. */
const polyAt = (coefficients: number[], point: Complex) => coefficients.reduce((sum, coefficient) => cAdd(cMul(sum, point), c(coefficient)), c());

/** N(jω) or N(−jω) written as (real part in ω) + j(imag part in ω). */
function polyJOmegaTex(descending: number[], reflect: boolean): string {
  const real: string[] = []; const imag: string[] = [];
  // Ascending powers so spectra read like the textbook: 5 − ω² + j2ω.
  descending.slice().reverse().forEach((coefficient, power) => {
    if (isZero(coefficient)) return;
    // s^k → (±j)^k ω^k
    const sign = [1, 1, -1, -1][power % 4] * (reflect && power % 2 === 1 ? -1 : 1);
    const value = coefficient * sign; const omega = power === 0 ? "" : power === 1 ? "\\omega" : `\\omega^{${power}}`;
    const text = `${value < 0 ? "-" : "+"}${isZero(Math.abs(value) - 1) && omega ? "" : fmt(Math.abs(value))}${omega}`;
    (power % 2 === 0 ? real : imag).push(text);
  });
  const realText = real.join("").replace(/^\+/, "");
  const imagBody = imag.join("");
  if (!imagBody) return realText || "0";
  // j·(Σ bₖ ωᵏ): a single positive term reads jω / j2ω, otherwise j(…).
  const imagSingle = imag.length === 1 ? imagBody.replace(/^[+-]/, "") : `\\left(${imagBody.replace(/^\+/, "")}\\right)`;
  const imagNegative = imag.length === 1 && imagBody.startsWith("-");
  const imagText = `${imagNegative ? "-" : realText ? "+" : ""}j${imagSingle}`;
  return `${realText}${imagText}`;
}

/* ─────────────────────────── Spectral terms ─────────────────────────── */

export type Impulse = { omega: number; area: Complex };
export type PulseFamily = "rect" | "tri" | "sinc" | "Sa" | "sinc2" | "Sa2";
type PulseTerm = { kind: "pulse"; family: PulseFamily; coefficient: number; scale: number; delay: number };

type SpectralTerm =
  | { kind: "rational"; coefficient: number; numerator: number[]; denominator: number[]; reflect: boolean }
  | PulseTerm
  /** amplitude·p(t)·cos(ω₀t + φ) ↔ (amplitude/2)[e^{jφ}P(ω−ω₀) + e^{−jφ}P(ω+ω₀)] */
  | { kind: "modulated"; base: PulseTerm; omega0: number; phase: number; amplitude: number }
  /** coefficient·e^{−αt² + bt} ↔ coefficient·√(π/α)·e^{(b² − ω²)/4α}·e^{−jbω/2α} */
  | { kind: "gaussian"; coefficient: number; alpha: number; shift: number }
  | { kind: "delay"; coefficient: number; delay: number }
  | { kind: "evenExp"; coefficient: number; rate: number }
  | { kind: "step"; coefficient: number; delay: number; reverse: boolean }
  | { kind: "sgn"; coefficient: number }
  | { kind: "hilbert"; gain: number }
  | { kind: "impulses"; impulses: Impulse[] };

const sincValue = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const triValue = (x: number) => Math.max(0, 1 - Math.abs(x));
const cExpReal = (magnitude: number, theta: number) => c(magnitude * Math.cos(theta), magnitude * Math.sin(theta));

/** Unit-gain spectrum of p(at): base(ω/a) for each pulse family (normalized sinc; Sa = sin x / x). */
function pulseBase(family: PulseFamily, w: number): number {
  switch (family) {
    case "rect": return sincValue(w / (2 * Math.PI));
    case "tri": return sincValue(w / (2 * Math.PI)) ** 2;
    case "sinc": return Math.abs(w / (2 * Math.PI)) <= 0.5 ? 1 : 0;
    case "Sa": return Math.abs(w) <= 1 ? Math.PI : 0;
    case "sinc2": return triValue(w / (2 * Math.PI));
    case "Sa2": return Math.PI * triValue(w / 2);
  }
}
const pulseValue = (term: PulseTerm, omega: number): Complex => cScale(cExpJ(-omega * term.delay), (term.coefficient / Math.abs(term.scale)) * pulseBase(term.family, omega / term.scale));

/** Continuous part of one term at ω (impulse lines are reported separately). */
function termValue(term: SpectralTerm, omega: number): Complex {
  switch (term.kind) {
    case "rational": {
      const s = c(0, term.reflect ? -omega : omega);
      return cScale(cDiv(polyAt(term.numerator, s), polyAt(term.denominator, s)), term.coefficient);
    }
    case "pulse": return pulseValue(term, omega);
    case "modulated": {
      const upper = cMul(cExpJ(term.phase), pulseValue(term.base, omega - term.omega0)); const lower = cMul(cExpJ(-term.phase), pulseValue(term.base, omega + term.omega0));
      return cScale(cAdd(upper, lower), term.amplitude / 2);
    }
    case "gaussian": {
      const magnitude = term.coefficient * Math.sqrt(Math.PI / term.alpha) * Math.exp((term.shift ** 2 - omega ** 2) / (4 * term.alpha));
      return cExpReal(magnitude, (-term.shift * omega) / (2 * term.alpha));
    }
    case "delay": return cScale(cExpJ(-omega * term.delay), term.coefficient);
    case "evenExp": return c((term.coefficient * 2 * term.rate) / (term.rate ** 2 + omega ** 2));
    case "step": {
      if (Math.abs(omega) < 1e-12) return c();
      const gain = term.coefficient * (term.reverse ? -1 : 1);
      return cMul(cExpJ(-omega * term.delay), c(0, -gain / omega)); // gain·e^{−jωτ}/(jω)
    }
    case "sgn": return Math.abs(omega) < 1e-12 ? c() : c(0, (-2 * term.coefficient) / omega);
    case "hilbert": return Math.abs(omega) < 1e-12 ? c() : c(0, -term.gain * Math.sign(omega));
    case "impulses": return c();
  }
}

function termImpulses(term: SpectralTerm): Impulse[] {
  if (term.kind === "impulses") return term.impulses;
  if (term.kind === "step") return [{ omega: 0, area: c(Math.PI * term.coefficient) }];
  return [];
}

/** Sums impulse areas that share a frequency and drops lines that cancel (e.g. the πδ(ω) of u(t+1) − 2u(t) + u(t−1)). */
function mergeImpulses(impulses: Impulse[]): Impulse[] {
  const merged: Impulse[] = [];
  impulses.forEach((impulse) => { const existing = merged.find((item) => Math.abs(item.omega - impulse.omega) < 1e-9); if (existing) existing.area = cAdd(existing.area, impulse.area); else merged.push({ omega: impulse.omega, area: impulse.area }); });
  return merged.filter((impulse) => cAbs(impulse.area) > 1e-9);
}

function impulseGroupTex(impulses: Impulse[]): string[] {
  const merged: Impulse[] = [];
  impulses.forEach((impulse) => { const existing = merged.find((item) => Math.abs(item.omega - impulse.omega) < 1e-9); if (existing) existing.area = cAdd(existing.area, impulse.area); else merged.push({ omega: impulse.omega, area: impulse.area }); });
  const live = merged.filter((impulse) => cAbs(impulse.area) > 1e-9);
  const used = new Set<Impulse>(); const parts: string[] = [];
  const delta = (at: number) => `\\delta(${shifted("\\omega", at)})`;
  live.sort((left, right) => Math.abs(left.omega) - Math.abs(right.omega) || right.omega - left.omega).forEach((impulse) => {
    if (used.has(impulse)) return;
    const mirror = impulse.omega > 1e-9 ? live.find((item) => !used.has(item) && Math.abs(item.omega + impulse.omega) < 1e-9) : undefined;
    used.add(impulse);
    if (mirror) {
      used.add(mirror);
      const plus = impulse.area; const minus = mirror.area;
      if (isZero(plus.im) && isZero(minus.im) && isZero(plus.re - minus.re)) { parts.push(`${piTex(plus.re)}\\left[${delta(impulse.omega)}+${delta(-impulse.omega)}\\right]`); return; }
      if (isZero(plus.re) && isZero(minus.re) && isZero(plus.im + minus.im)) {
        // sin-type pair: −jB[δ(ω−ω₀) − δ(ω+ω₀)]
        const b = -plus.im; parts.push(`${b < 0 ? "" : "-"}j${piTex(Math.abs(b))}\\left[${delta(impulse.omega)}-${delta(-impulse.omega)}\\right]`); return;
      }
      parts.push(`${complexTex(plus)}${delta(impulse.omega)}`, `${complexTex(minus)}${delta(-impulse.omega)}`);
      return;
    }
    parts.push(isZero(impulse.area.im) ? `${piTex(impulse.area.re).replace(/^(-?)1$/, "$1")}${delta(impulse.omega)}` : `${complexTex(impulse.area)}${delta(impulse.omega)}`);
  });
  return parts;
}

/** Denominator written as Π(p + jω)^m when every pole is real, e.g. (2+jω)³; null otherwise. */
function factoredDenominatorTex(denominator: number[], reflect: boolean): string | null {
  if (denominator.length < 3) return null;
  const roots = polynomialRoots(denominator);
  if (roots.some((root) => Math.abs(root.im) > 1e-5)) return null;
  const groups = clusterPoles(roots).sort((left, right) => -left.pole.re - -right.pole.re);
  const sign = reflect ? "-" : "+";
  return groups.map(({ pole, multiplicity }) => {
    const p = -pole.re; const factor = isZero(p) ? "j\\omega" : `\\left(${fmt(p)}${sign}j\\omega\\right)`;
    return multiplicity > 1 ? `${isZero(p) ? `\\left(j\\omega\\right)` : factor}^{${multiplicity}}` : factor;
  }).join("");
}

const phaseTex = (delay: number, symbol: string) => {
  if (isZero(delay)) return "";
  const amount = isZero(Math.abs(delay) - 1) ? "" : fmt(Math.abs(delay)); const sign = delay > 0 ? "-" : "";
  return symbol === "\\omega" ? `e^{${sign}j${amount}\\omega}` : `e^{${sign}j${amount}\\left(${symbol}\\right)}`;
};
const overPi = (symbol: string, k: number) => `\\frac{${symbol}}{${isZero(k - 1) ? "" : fmt(k)}\\pi}`;

/** Unit-gain KaTeX for one pulse spectrum with ω replaced by `symbol` (gain handled by the caller). */
function pulseUnitTex(term: PulseTerm, symbol = "\\omega"): string {
  const a = Math.abs(term.scale); const phase = phaseTex(term.delay, symbol);
  const overTwoA = isZero(2 * a - 1) ? symbol : `\\frac{${symbol}}{${fmt(2 * a)}}`;
  switch (term.family) {
    case "rect": return `\\operatorname{sinc}\\!\\left(${overPi(symbol, 2 * a)}\\right)${phase}`;
    case "tri": return `\\operatorname{sinc}^{2}\\!\\left(${overPi(symbol, 2 * a)}\\right)${phase}`;
    case "sinc": return `\\operatorname{rect}\\!\\left(${overPi(symbol, 2 * a)}\\right)${phase}`;
    case "sinc2": return `\\operatorname{tri}\\!\\left(${overPi(symbol, 2 * a)}\\right)${phase}`;
    case "Sa": return `\\pi\\operatorname{rect}\\!\\left(${overTwoA}\\right)${phase}`;
    case "Sa2": return `\\pi\\operatorname{tri}\\!\\left(${overTwoA}\\right)${phase}`;
  }
}

function termTex(term: SpectralTerm): string {
  switch (term.kind) {
    case "rational": {
      const numerator = polyJOmegaTex(term.numerator, term.reflect); const plain = polyJOmegaTex(term.denominator, term.reflect);
      const denominator = factoredDenominatorTex(term.denominator, term.reflect) ?? plain;
      const magnitude = Math.abs(term.coefficient); const sign = term.coefficient < 0 ? "-" : "";
      const fraction = smallFraction(magnitude);
      const unit = isZero(magnitude - 1);
      const top = numerator === "1" ? (fraction ? String(fraction.p) : fmt(magnitude)) : unit ? numerator : `${magnitudeTex(magnitude)}${/[+-]/.test(numerator) ? `\\left(${numerator}\\right)` : numerator}`;
      const bottom = numerator === "1" && fraction ? `${fraction.q}\\left(${denominator}\\right)` : denominator;
      return bottom === "1" ? `${sign}${top}` : `${sign}\\frac{${top}}{${bottom}}`;
    }
    case "pulse": return `${coefficientPrefix(term.coefficient / Math.abs(term.scale))}${pulseUnitTex(term)}`;
    case "modulated": {
      const half = (term.amplitude / 2) * (term.base.coefficient / Math.abs(term.base.scale));
      const upper = pulseUnitTex(term.base, shifted("\\omega", term.omega0)); const lower = pulseUnitTex(term.base, shifted("\\omega", -term.omega0));
      if (isZero(term.phase)) return `${coefficientPrefix(half)}\\left[${upper}+${lower}\\right]`;
      if (isZero(term.phase + Math.PI / 2)) return `${half > 0 ? "-" : ""}j${coefficientPrefix(Math.abs(half)).replace(/^-/, "")}\\left[${upper}-${lower}\\right]`;
      return `${coefficientPrefix(half)}\\left[e^{j${piTex(term.phase)}}${upper}+e^{-j${piTex(term.phase)}}${lower}\\right]`;
    }
    case "gaussian": {
      const root = isZero(term.alpha - 1) ? "\\sqrt{\\pi}" : `\\sqrt{\\frac{\\pi}{${fmt(term.alpha)}}}`;
      const decay = `-\\frac{\\omega^{2}}{${fmt(4 * term.alpha)}}`;
      if (isZero(term.shift)) return `${coefficientPrefix(term.coefficient)}${root}e^{${decay}}`;
      return `${coefficientPrefix(term.coefficient)}${root}e^{\\frac{${fmt(term.shift ** 2)}}{${fmt(4 * term.alpha)}}${decay}-j\\frac{${fmt(term.shift)}\\omega}{${fmt(2 * term.alpha)}}}`;
    }
    case "delay": return isZero(term.delay) ? fmt(term.coefficient) : `${coefficientPrefix(term.coefficient)}${phaseTex(term.delay, "\\omega")}`;
    case "evenExp": {
      const numerator = term.coefficient * 2 * term.rate;
      return `${numerator < 0 ? "-" : ""}\\frac{${magnitudeTex(numerator)}}{${fmt(term.rate ** 2)}+\\omega^{2}}`;
    }
    case "step": return joinSigned([`${piTex(Math.PI * term.coefficient)}\\delta(\\omega)`, stepFractionTex(term)]);
    case "sgn": return `${term.coefficient < 0 ? "-" : ""}\\frac{${magnitudeTex(2 * term.coefficient)}}{j\\omega}`;
    case "hilbert": return `${term.gain < 0 ? "" : "-"}j${isZero(Math.abs(term.gain) - 1) ? "" : fmt(Math.abs(term.gain))}\\operatorname{sgn}(\\omega)`;
    case "impulses": return joinSigned(impulseGroupTex(term.impulses));
  }
}

/** The 1/(jω) part of u(t − τ): (±)gain·e^{−jωτ}/(jω). */
function stepFractionTex(term: Extract<SpectralTerm, { kind: "step" }>): string {
  const gain = term.coefficient * (term.reverse ? -1 : 1); const phase = phaseTex(term.delay, "\\omega");
  const top = `${isZero(Math.abs(gain) - 1) ? "" : magnitudeTex(gain)}${phase}` || "1";
  return `${gain < 0 ? "-" : ""}\\frac{${top}}{j\\omega}`;
}

/* ─────────────────────────── Forward transform ─────────────────────────── */

export type SpectrumModel = {
  /** Continuous part X_c(jω). */
  valueAt: (omega: number) => Complex;
  impulses: Impulse[];
  latex: string;
  pairs: Array<{ timeLatex: string; freqLatex: string }>;
};
export type ForwardFourierResult = { ok: true; spectrum: SpectrumModel; notes: string[] } | { ok: false; error: string };

class FourierTableError extends Error {}

const T = "t";
const constantOf = (node: MathNode): number | null => { if (containsVariable(node, T)) return null; try { const value = evaluateNode(node, T, 0); return Number.isFinite(value) ? value : null; } catch { return null; } };
const safeEval = (node: MathNode, at: number) => { try { return evaluateNode(node, T, at); } catch { return Number.NaN; } };
function affineOrThrow(node: MathNode) {
  const form = affineArgument(node, T);
  if (!form) throw new FourierTableError("Arguments must be affine in t, for example rect(2t−1) or cos(4t).");
  return form;
}
function leavesOf(node: MathNode, into: MathNode[] = []): MathNode[] {
  if (node.kind === "mul") { leavesOf(node.left, into); leavesOf(node.right, into); } else into.push(node);
  return into;
}

type Signed = { sign: number; node: MathNode };
/** Distributes products over sums and constant quotients: (1−|t|)·rect(t/2) → rect(t/2) − |t|·rect(t/2). */
function expandTerms(node: MathNode): Signed[] {
  const negate = (term: Signed): Signed => ({ sign: -term.sign, node: term.node });
  switch (node.kind) {
    case "add": return [...expandTerms(node.left), ...expandTerms(node.right)];
    case "sub": return [...expandTerms(node.left), ...expandTerms(node.right).map(negate)];
    case "neg": return expandTerms(node.value).map(negate);
    case "mul": {
      const left = expandTerms(node.left); const right = expandTerms(node.right);
      return left.flatMap((a) => right.map((b) => ({ sign: a.sign * b.sign, node: { kind: "mul", left: a.node, right: b.node } as MathNode })));
    }
    case "div": {
      const divisor = constantOf(node.right);
      if (divisor === null || Math.abs(divisor) < 1e-12) return [{ sign: 1, node }];
      return expandTerms(node.left).map((term) => ({ sign: term.sign, node: { kind: "mul", left: { kind: "num", value: 1 / divisor }, right: term.node } as MathNode }));
    }
    default: return [{ sign: 1, node }];
  }
}
/** t → −t, so anti-causal terms reuse the causal Laplace table (x(−t) ↔ X(−jω)). */
function reflectTime(node: MathNode): MathNode {
  switch (node.kind) {
    case "var": return node.name === T ? { kind: "neg", value: node } : node;
    case "num": return node;
    case "neg": return { kind: "neg", value: reflectTime(node.value) };
    case "add": case "sub": case "mul": case "div": return { kind: node.kind, left: reflectTime(node.left), right: reflectTime(node.right) };
    case "pow": return { kind: "pow", base: reflectTime(node.base), exponent: reflectTime(node.exponent) };
    case "call": return { kind: "call", name: node.name, argument: reflectTime(node.argument) };
    case "delta": return { kind: "delta", order: node.order, argument: reflectTime(node.argument) };
    case "input": return { kind: "input", order: node.order, argument: reflectTime(node.argument) };
    case "runningIntegral": return node;
  }
}

function laplaceTerm(node: MathNode, reflect: boolean): SpectralTerm {
  const source = reflect ? reflectTime(node) : node;
  const result = forwardLaplace(source, safeEval, nodeToLatex);
  if (!result.ok) throw new FourierTableError(result.error);
  const { numerator, denominator, poles } = result.system as TransferFunction;
  if (poles.some((pole) => pole.re > -1e-9)) throw new FourierTableError("This term is not absolutely integrable (a pole sits on or right of the jω axis), so its Fourier transform is not an ordinary function.");
  return { kind: "rational", coefficient: 1, numerator, denominator, reflect };
}

const polyMulReal = (left: number[], right: number[]) => { const out = new Array<number>(left.length + right.length - 1).fill(0); left.forEach((a, i) => right.forEach((b, j) => { out[i + j] += a * b; })); return out; };
const binomialPower = (a: number, n: number) => { let out = [1]; for (let i = 0; i < n; i += 1) out = polyMulReal(out, [1, a]); return out; };
const factorialOf = (n: number) => { let out = 1; for (let i = 2; i <= n; i += 1) out *= i; return out; };

/** e^{−a|t| + m}: the exponent is even in t, linear in |t|, and decaying. */
function evenAbsExponent(argument: MathNode): { rate: number; offset: number } | null {
  const at = (value: number) => safeEval(argument, value); const k = at(1) - at(0);
  const even = [1, 2, 3].every((n) => isZero(at(-n) - at(n)) && isZero(at(n) - at(0) - n * k));
  return even && k < -1e-9 ? { rate: -k, offset: at(0) } : null;
}
/** e^{−αt² + bt + m} with α > 0. */
function quadraticExponent(argument: MathNode): { alpha: number; shift: number; offset: number } | null {
  const at = (value: number) => safeEval(argument, value); const c0 = at(0);
  const A = (at(1) + at(-1) - 2 * c0) / 2; const B = (at(1) - at(-1)) / 2;
  const fits = [2, -2, 3].every((n) => Math.abs(at(n) - (c0 + B * n + A * n * n)) < 1e-9 * Math.max(1, Math.abs(at(n))));
  return fits && A < -1e-9 ? { alpha: -A, shift: B, offset: c0 } : null;
}

const isCall = (node: MathNode, ...names: string[]): node is Extract<MathNode, { kind: "call" }> => node.kind === "call" && names.includes(node.name);
const PULSES = ["rect", "tri", "sinc", "Sa"] as const;

/** Classifies one product term into spectral table entries (a two-sided ramp·exponential yields two). */
function transformTerm(node: MathNode, sign: number): SpectralTerm[] {
  const leaves = leavesOf(node); let coefficient = sign; const active: MathNode[] = [];
  leaves.forEach((leaf) => { const value = constantOf(leaf); if (value !== null && leaf.kind !== "delta") coefficient *= value; else active.push(leaf); });
  if (!active.length) return [{ kind: "impulses", impulses: [{ omega: 0, area: c(2 * Math.PI * coefficient) }] }]; // c ↔ 2πc δ(ω)

  // Causal / anti-causal families through the Laplace table: tⁿ e^{at} {1, sin, cos} u(±t).
  const steps = active.filter((leaf) => isCall(leaf, "u", "r"));
  if (steps.length) {
    const step = steps[0] as Extract<MathNode, { kind: "call" }>; const form = affineOrThrow(step.argument);
    if (isZero(form.slope)) throw new FourierTableError("A step needs a time-dependent argument.");
    if (active.length === 1 && step.name === "u") return [{ kind: "step", coefficient, delay: -form.intercept / form.slope, reverse: form.slope < 0 }]; // ±1/(jω) + πδ(ω)
    if (!isZero(form.intercept)) throw new FourierTableError("Shifted steps u(t − t₀) multiplying other factors are outside this table; shift the whole term instead.");
    return [{ ...laplaceTerm(node, form.slope < 0), coefficient: sign } as SpectralTerm];
  }

  // Gaussian and two-sided exponential families around a single exp(·) leaf.
  const exponentials = active.filter((leaf) => isCall(leaf, "exp")) as Array<Extract<MathNode, { kind: "call" }>>;
  if (exponentials.length === 1) {
    const exponential = exponentials[0]; const others = active.filter((leaf) => leaf !== exponential);
    const even = evenAbsExponent(exponential.argument);
    if (even) {
      let m = 0; let k = 0;
      others.forEach((leaf) => {
        const exponent = leaf.kind === "pow" ? constantOf(leaf.exponent) : null; const integer = exponent !== null && Number.isInteger(exponent) && exponent >= 0;
        if (leaf.kind === "var" && leaf.name === T) m += 1;
        else if (leaf.kind === "pow" && leaf.base.kind === "var" && integer) m += exponent as number;
        else if (isCall(leaf, "abs") && leaf.argument.kind === "var") k += 1;
        else if (leaf.kind === "pow" && isCall(leaf.base, "abs") && leaf.base.argument.kind === "var" && integer) k += exponent as number;
        else throw new FourierTableError("Two-sided exponentials may only be weighted by tⁿ and |t|ⁿ.");
      });
      const gain = coefficient * Math.exp(even.offset); const p = m + k;
      if (p === 0) return [{ kind: "evenExp", coefficient: gain, rate: even.rate }];
      // c·tᵐ|t|ᵏe^{−a|t|} = c·tᵖe^{−at}u(t) + c(−1)^{k}·tᵖe^{at}u(−t)
      const denominator = binomialPower(even.rate, p + 1);
      return [
        { kind: "rational", coefficient: 1, numerator: [gain * factorialOf(p)], denominator, reflect: false },
        { kind: "rational", coefficient: 1, numerator: [gain * (-1) ** (k + p) * factorialOf(p)], denominator, reflect: true },
      ];
    }
    const gaussian = quadraticExponent(exponential.argument);
    if (gaussian && !others.length) return [{ kind: "gaussian", coefficient: coefficient * Math.exp(gaussian.offset), alpha: gaussian.alpha, shift: gaussian.shift }];
    throw new FourierTableError("A bare exponential grows without bound on one side; multiply by u(t) or write e^{-a|t|}.");
  }

  // Modulation: pulse(t)·cos/sin(ω₀t + φ).
  if (active.length === 2) {
    const trig = active.find((leaf) => isCall(leaf, "cos", "sin")) as Extract<MathNode, { kind: "call" }> | undefined;
    const pulse = active.find((leaf) => isCall(leaf, ...PULSES)) as Extract<MathNode, { kind: "call" }> | undefined;
    if (trig && pulse) {
      const pulseForm = affineOrThrow(pulse.argument); const trigForm = affineOrThrow(trig.argument);
      if (isZero(pulseForm.slope) || isZero(trigForm.slope)) throw new FourierTableError("Modulation arguments need a time-dependent slope.");
      const omega0 = Math.abs(trigForm.slope); const phase = (trigForm.slope < 0 ? -trigForm.intercept : trigForm.intercept) - (trig.name === "sin" ? Math.PI / 2 : 0);
      const flip = trig.name === "sin" && trigForm.slope < 0 ? -1 : 1;
      const base: PulseTerm = { kind: "pulse", family: pulse.name as PulseFamily, coefficient: 1, scale: pulseForm.slope, delay: -pulseForm.intercept / pulseForm.slope };
      return [{ kind: "modulated", base, omega0, phase, amplitude: coefficient * flip }];
    }
    throw new FourierTableError("Products of time functions are outside the analytic table; the spectrum below is computed numerically.");
  }
  if (active.length !== 1) throw new FourierTableError("Products of several time functions are outside the analytic table; the spectrum below is computed numerically.");

  const leaf = active[0];
  if (leaf.kind === "delta") {
    const form = affineOrThrow(leaf.argument); if (isZero(form.slope)) throw new FourierTableError("δ needs a time-dependent argument.");
    if (leaf.order === 0) return [{ kind: "delay", coefficient: coefficient / Math.abs(form.slope), delay: -form.intercept / form.slope }];
    if (!isZero(form.intercept)) throw new FourierTableError("Shifted impulse derivatives δ⁽ⁿ⁾(t − t₀) are not plotted in this studio.");
    // δ⁽ⁿ⁾(at) = δ⁽ⁿ⁾(t)/(|a|aⁿ) ↔ (jω)ⁿ/(|a|aⁿ)
    return [{ kind: "rational", coefficient: coefficient / (Math.abs(form.slope) * form.slope ** leaf.order), numerator: [1, ...new Array<number>(leaf.order).fill(0)], denominator: [1], reflect: false }];
  }
  if (leaf.kind === "div") {
    const numerator = constantOf(leaf.left); const form = affineArgument(leaf.right, T);
    if (numerator !== null && form && isZero(form.intercept) && !isZero(form.slope)) return [{ kind: "hilbert", gain: (Math.PI * coefficient * numerator) / form.slope }]; // (L/kt) ↔ −jπ(L/k)sgn(ω)
    throw new FourierTableError("Only c/t (principal value) has a table entry among quotients in t.");
  }
  if (leaf.kind === "pow") {
    const exponent = constantOf(leaf.exponent);
    if (exponent === 2 && isCall(leaf.base, "sinc", "Sa")) {
      const form = affineOrThrow(leaf.base.argument);
      return [{ kind: "pulse", family: leaf.base.name === "sinc" ? "sinc2" : "Sa2", coefficient, scale: form.slope, delay: -form.intercept / form.slope }];
    }
    throw new FourierTableError("Polynomial time signals are not Fourier transformable as ordinary functions.");
  }
  if (leaf.kind !== "call") throw new FourierTableError("Polynomial time signals are not Fourier transformable as ordinary functions.");
  const form = affineOrThrow(leaf.argument);
  if (isZero(form.slope)) throw new FourierTableError("Constant-argument calls should be folded into the coefficient.");
  const delay = -form.intercept / form.slope;
  switch (leaf.name) {
    case "rect": case "tri": case "sinc": case "Sa": return [{ kind: "pulse", family: leaf.name, coefficient, scale: form.slope, delay }];
    case "sgn": return [{ kind: "sgn", coefficient: form.slope > 0 ? coefficient : -coefficient }];
    case "cos": case "sin": {
      // cos(ω₀t + φ) ↔ π[e^{jφ}δ(ω−ω₀) + e^{−jφ}δ(ω+ω₀)]; sin(θ) = cos(θ − π/2).
      const omega0 = Math.abs(form.slope); const phase = (form.slope < 0 ? -form.intercept : form.intercept) - (leaf.name === "sin" ? Math.PI / 2 : 0);
      const sinFlip = leaf.name === "sin" && form.slope < 0 ? -1 : 1;
      const area = Math.PI * coefficient * sinFlip;
      return [{ kind: "impulses", impulses: [{ omega: omega0, area: cScale(cExpJ(phase), area) }, { omega: -omega0, area: cScale(cExpJ(-phase), area) }].map((impulse) => ({ omega: impulse.omega, area: c(Number(impulse.area.re.toFixed(12)), Number(impulse.area.im.toFixed(12))) })) }];
    }
    default: throw new FourierTableError(`${leaf.name}(t) has no closed-form Fourier transform in this studio; the spectrum below is computed numerically.`);
  }
}

/**
 * Shape identification for finite-support signals that no table entry matches term-by-term
 * (e.g. (1 − |t|)·rect(t/2) = tri(t)): fits c·rect(a(t−τ)) or c·tri(a(t−τ)) and verifies it on a dense grid.
 */
function identifyPulse(node: MathNode): PulseTerm | null {
  const f = (time: number) => safeEval(node, time);
  const support = estimateSupport(f, 12, 0.01, 1e-9);
  if (support.unbounded || !(support.hi > support.lo)) return null;
  const refine = (inside: number, outside: number) => { let a = inside; let b = outside; for (let i = 0; i < 80; i += 1) { const mid = (a + b) / 2; if (Math.abs(f(mid)) > 1e-13) a = mid; else b = mid; } return a; };
  const lo = refine(support.lo, support.lo - 0.02); const hi = refine(support.hi, support.hi + 0.02);
  const center = (lo + hi) / 2; const half = (hi - lo) / 2; const peak = f(center);
  if (!Number.isFinite(peak) || Math.abs(peak) < 1e-9) return null;
  const grid = Array.from({ length: 199 }, (_, i) => lo + ((hi - lo) * (i + 1)) / 200);
  if (grid.every((time) => Math.abs(f(time) - peak) < 1e-7)) return { kind: "pulse", family: "rect", coefficient: peak, scale: 1 / (hi - lo), delay: center };
  if (grid.every((time) => Math.abs(f(time) - peak * triValue((time - center) / half)) < 1e-7)) return { kind: "pulse", family: "tri", coefficient: peak, scale: 1 / half, delay: center };
  return null;
}

type SolvedItem = { sign: number; node: MathNode; terms: SpectralTerm[] };

export function forwardFourier(node: MathNode): ForwardFourierResult {
  try {
    let solved: SolvedItem[];
    try { solved = expandTerms(node).map((item) => ({ ...item, terms: transformTerm(item.node, item.sign) })); }
    catch (error) {
      if (!(error instanceof FourierTableError)) throw error;
      const shape = identifyPulse(node);
      if (!shape) throw error;
      solved = [{ sign: 1, node, terms: [shape] }];
    }
    const terms = solved.flatMap((item) => item.terms);
    const pairs: SpectrumModel["pairs"] = solved.map((item) => ({ timeLatex: `${item.sign < 0 ? "-" : ""}${nodeToLatex(item.node)}`, freqLatex: joinSigned(item.terms.map(termTex)) }));
    const impulses = mergeImpulses(terms.flatMap(termImpulses));
    const continuous = terms.filter((term) => term.kind !== "impulses");
    const continuousTex = continuous.map((term) => (term.kind === "step" ? stepFractionTex(term) : termTex(term)));
    const spectrum: SpectrumModel = {
      valueAt: (omega) => terms.reduce((sum, term) => cAdd(sum, termValue(term, omega)), c()),
      impulses,
      latex: `X(j\\omega)=${joinSigned([...continuousTex, ...impulseGroupTex(impulses)])}`,
      pairs,
    };
    return { ok: true, spectrum, notes: [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No analytic transform exists for this signal." };
  }
}

/**
 * Convolution theorem: x₁(t) ∗ x₂(t) ↔ X₁(jω)·X₂(jω). At most one factor may carry impulse lines
 * (Aδ(ω−ω₀)·Y(jω) = A·Y(jω₀)·δ(ω−ω₀)); the product of two impulse trains is undefined.
 */
export function multiplySpectra(models: SpectrumModel[]): SpectrumModel {
  if (models.length === 0) throw new FourierTableError("Nothing to multiply.");
  if (models.filter((model) => model.impulses.length > 0).length > 1) throw new FourierTableError("The product of two impulse spectra is not defined.");
  const strip = (latex: string) => latex.replace(/^X\(j\\omega\)=/, "");
  const wrap = (latex: string) => (/[+-]/.test(latex.slice(1)) && !latex.startsWith("\\frac") ? `\\left(${latex}\\right)` : latex);
  const valueAt = (omega: number) => models.reduce<Complex>((product, model) => cMul(product, model.valueAt(omega)), c(1));
  const carrier = models.find((model) => model.impulses.length > 0);
  const others = models.filter((model) => model !== carrier);
  const impulses = carrier ? carrier.impulses.map((impulse) => ({ omega: impulse.omega, area: cMul(impulse.area, others.reduce<Complex>((product, model) => cMul(product, model.valueAt(impulse.omega)), c(1))) })) : [];
  return { valueAt, impulses, latex: `X(j\\omega)=${models.map((model) => wrap(strip(model.latex))).join("\\,")}`, pairs: [] };
}

/* ─────────────────────────── Inverse transform ─────────────────────────── */

export type InverseFourierResult =
  | { ok: true; latex: string; spectrum: SpectrumModel; valueAt: (time: number) => number; decayRate: number | null; notes: string[] }
  | { ok: false; error: string };

type CPoly = Complex[]; // ascending in ω
type CRational = { num: CPoly; den: CPoly };
type Token = { kind: "number"; value: number } | { kind: "omega" } | { kind: "j" } | { kind: "op"; value: string };

const trim = (poly: CPoly) => { const out = poly.slice(); while (out.length > 1 && cAbs(out[out.length - 1]) < 1e-12) out.pop(); return out; };
const pAdd = (a: CPoly, b: CPoly) => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => cAdd(a[i] ?? c(), b[i] ?? c())));
const pMul = (a: CPoly, b: CPoly) => { const out: CPoly = Array.from({ length: a.length + b.length - 1 }, () => c()); a.forEach((x, i) => b.forEach((y, k) => { out[i + k] = cAdd(out[i + k], cMul(x, y)); })); return trim(out); };
const pScale = (a: CPoly, k: Complex) => trim(a.map((x) => cMul(x, k)));
const rAdd = (a: CRational, b: CRational): CRational => ({ num: pAdd(pMul(a.num, b.den), pMul(b.num, a.den)), den: pMul(a.den, b.den) });
const rMul = (a: CRational, b: CRational): CRational => ({ num: pMul(a.num, b.num), den: pMul(a.den, b.den) });
const rDiv = (a: CRational, b: CRational): CRational => { if (trim(b.num).every((x) => cAbs(x) < 1e-14)) throw new FourierTableError("Division by zero in X(jω)."); return { num: pMul(a.num, b.den), den: pMul(a.den, b.num) }; };
const rNeg = (a: CRational): CRational => ({ num: pScale(a.num, c(-1)), den: a.den });
const rConst = (value: Complex): CRational => ({ num: [value], den: [c(1)] });
const isConstPoly = (poly: CPoly) => trim(poly).length === 1;

function tokenizeSpectrum(source: string): Token[] {
  const tokens: Token[] = [];
  for (let index = 0; index < source.length;) {
    const rest = source.slice(index);
    if (rest.startsWith("\\omega")) { tokens.push({ kind: "omega" }); index += 6; continue; }
    if (rest.startsWith("\\pi")) { tokens.push({ kind: "number", value: Math.PI }); index += 3; continue; }
    const char = source[index];
    if (/[0-9.]/.test(char)) { const match = rest.match(/^\d*\.?\d+/); if (!match) throw new FourierTableError("Invalid number in X(jω)."); tokens.push({ kind: "number", value: Number(match[0]) }); index += match[0].length; continue; }
    if (char === "j" || char === "i") { tokens.push({ kind: "j" }); index += 1; continue; }
    if (char === "w") { tokens.push({ kind: "omega" }); index += 1; continue; }
    if ("+-*/^()".includes(char)) { tokens.push({ kind: "op", value: char }); index += 1; continue; }
    throw new FourierTableError(`Unsupported symbol “${char === "\\" ? rest.slice(0, 8) : char}” in X(jω).`);
  }
  return tokens;
}

/** Recursive descent over + − × ÷ ^ with implicit products, complex coefficients (j), and ω. */
function parseComplexRational(source: string): CRational {
  const tokens = tokenizeSpectrum(source); let cursor = 0;
  const peek = () => tokens[cursor];
  const isOp = (value: string) => { const token = peek(); return token?.kind === "op" && token.value === value; };
  const expression = (): CRational => { let left = term(); for (;;) { if (isOp("+")) { cursor += 1; left = rAdd(left, term()); } else if (isOp("-")) { cursor += 1; left = rAdd(left, rNeg(term())); } else return left; } };
  const startsFactor = () => { const token = peek(); return token !== undefined && (token.kind !== "op" || token.value === "("); };
  const term = (): CRational => { let left = unary(); for (;;) { if (isOp("*")) { cursor += 1; left = rMul(left, unary()); } else if (isOp("/")) { cursor += 1; left = rDiv(left, unary()); } else if (startsFactor()) left = rMul(left, unary()); else return left; } };
  const unary = (): CRational => { if (isOp("-")) { cursor += 1; return rNeg(unary()); } if (isOp("+")) { cursor += 1; return unary(); } return power(); };
  const power = (): CRational => {
    const base = primary(); if (!isOp("^")) return base; cursor += 1;
    const exponent = primary();
    if (!isConstPoly(exponent.num) || !isConstPoly(exponent.den)) throw new FourierTableError("Exponents must be constant integers.");
    const value = cDiv(exponent.num[0], exponent.den[0]);
    if (!isZero(value.im) || !Number.isInteger(Math.round(value.re)) || Math.abs(value.re - Math.round(value.re)) > 1e-9) throw new FourierTableError("Exponents must be integers.");
    let result = rConst(c(1)); for (let i = 0; i < Math.abs(Math.round(value.re)); i += 1) result = rMul(result, base);
    return value.re < 0 ? rDiv(rConst(c(1)), result) : result;
  };
  const primary = (): CRational => {
    const token = peek(); if (!token) throw new FourierTableError("X(jω) ends unexpectedly."); cursor += 1;
    if (token.kind === "number") return rConst(c(token.value));
    if (token.kind === "j") return rConst(c(0, 1));
    if (token.kind === "omega") return { num: [c(), c(1)], den: [c(1)] };
    if (token.value === "(") { const inner = expression(); if (!isOp(")")) throw new FourierTableError("Expected “)” in X(jω)."); cursor += 1; return inner; }
    throw new FourierTableError(`Unexpected “${token.value}” in X(jω).`);
  };
  const result = expression();
  if (cursor < tokens.length) throw new FourierTableError("Trailing symbols remain in X(jω).");
  return result;
}

const normalizeSpectrumSource = (source: string) => expandFraction(source)
  .replace(/^\s*X\s*(?:\\left)?\(\s*j\s*\\omega\s*(?:\\right)?\)\s*=/, "")
  .replaceAll("\\left", "").replaceAll("\\right", "").replaceAll("\\cdot", "*").replaceAll("\\times", "*").replaceAll("\\div", "/")
  .replaceAll("\\,", "").replaceAll("\\!", "").replace(/\s+/g, "").replaceAll("{", "(").replaceAll("}", ")").replaceAll("−", "-")
  .replaceAll("[", "(").replaceAll("]", ")").replace(/\\(?:text|operatorname|mathrm)\(([A-Za-z]+)\)/g, "\\$1");

/** Splits a normalized source into signed top-level additive terms. */
function splitTerms(source: string): Array<{ sign: number; text: string }> {
  const parts: Array<{ sign: number; text: string }> = []; let depth = 0; let start = 0; let sign = 1;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1; else if (char === ")") depth -= 1;
    else if (depth === 0 && (char === "+" || char === "-") && index > start && !"*/^(".includes(source[index - 1])) { parts.push({ sign, text: source.slice(start, index) }); sign = char === "-" ? -1 : 1; start = index + 1; }
    else if (depth === 0 && (char === "+" || char === "-") && index === start) { sign *= char === "-" ? -1 : 1; start = index + 1; }
  }
  if (source.slice(start)) parts.push({ sign, text: source.slice(start) });
  return parts;
}

/** Pulls `\name(arg)` out of a term, returning the constant coefficient and the raw argument. */
function extractCall(text: string, names: string[]): { name: string; coefficient: Complex; argument: CRational } | null {
  for (const name of names) {
    const at = text.indexOf(`\\${name}(`); if (at < 0) continue;
    let depth = 0; let close = -1;
    for (let index = at + name.length + 1; index < text.length; index += 1) { if (text[index] === "(") depth += 1; else if (text[index] === ")" && --depth === 0) { close = index; break; } }
    if (close < 0) throw new FourierTableError(`Unbalanced parentheses after \\${name}.`);
    const argument = parseComplexRational(text.slice(at + name.length + 2, close));
    const rest = `${text.slice(0, at)}(1)${text.slice(close + 1)}`;
    const coefficient = parseComplexRational(rest);
    if (!isConstPoly(coefficient.num) || !isConstPoly(coefficient.den)) throw new FourierTableError(`Multiply \\${name}(…) only by constants in X(jω).`);
    return { name, coefficient: cDiv(coefficient.num[0], coefficient.den[0]), argument };
  }
  return null;
}
/** a·ω + b from a parsed argument (real coefficients required). */
function affineOmega(argument: CRational): { a: number; b: number } {
  if (!isConstPoly(argument.den)) throw new FourierTableError("Function arguments must be affine in ω.");
  const den = argument.den[0]; const num = trim(argument.num);
  if (num.length > 2) throw new FourierTableError("Function arguments must be affine in ω.");
  const b = cDiv(num[0] ?? c(), den); const a = cDiv(num[1] ?? c(), den);
  if (!isZero(a.im) || !isZero(b.im)) throw new FourierTableError("Function arguments must be real in ω.");
  return { a: a.re, b: b.re };
}

/** Extracts pure-delay factors e^{−jωτ} from a term, returning the remaining text and the total delay τ. */
function extractDelay(text: string): { text: string; delay: number } {
  let delay = 0; let rest = text;
  for (;;) {
    const match = /e\^\(([^()]*\\omega[^()]*)\)/.exec(rest);
    if (!match) break;
    const exponent = parseComplexRational(match[1]);
    const numerator = trim(exponent.num);
    if (!isConstPoly(exponent.den) || numerator.length !== 2 || cAbs(numerator[0]) > 1e-12) throw new FourierTableError("Only pure delay factors e^{−jωτ} are supported in X(jω).");
    const coefficient = cDiv(numerator[1], exponent.den[0]);
    if (Math.abs(coefficient.re) > 1e-12) throw new FourierTableError("Real exponentials of ω (e^{−aω}) are outside this table; use e^{−jωτ} for a delay.");
    delay -= coefficient.im; // e^{−jωτ} has coefficient −jτ
    rest = `${rest.slice(0, match.index)}(1)${rest.slice(match.index + match[0].length)}`;
  }
  return { text: rest, delay };
}

/** x(t) → x(t − d) for the LaTeX produced by inverseLaplace: `(t)` becomes `(t−d)`, a bare t becomes (t−d). */
function shiftTimeLatex(latex: string, delay: number): string {
  if (isZero(delay)) return latex;
  const shift = delay > 0 ? `t-${fmt(delay)}` : `t+${fmt(-delay)}`;
  return latex.replace(/\(t\)|(?<![A-Za-z\\])t(?=e\^|[^A-Za-z]|$)/g, (match) => (match === "(t)" ? `(${shift})` : `\\left(${shift}\\right)`));
}

type LowPass = { family: "rect" | "sinc" | "Sa" | "tri"; coefficient: number; a: number; center: number };

/** Time-domain image of c·p(a(ω − ωc)) at ωc = 0 (before the e^{jωc t} shift): { gain, latex, value }. */
function lowPassTime(entry: LowPass, doubled: boolean): { latex: string; value: (time: number) => number } {
  const { family, coefficient, a } = entry; const factor = doubled ? 2 : 1; const W = 1 / (2 * a);
  const lead = (gain: number) => { const fraction = smallFraction(gain); const sign = gain < 0 ? "-" : ""; return fraction ? `${sign}\\frac{${fraction.p}}{${fraction.q}\\pi}` : `${sign}\\frac{${fmt(Math.abs(gain))}}{\\pi}`; };
  if (family === "rect") { const g = coefficient * W * factor; return { latex: `${lead(g)}\\operatorname{Sa}(${isZero(W - 1) ? "t" : `${fmt(W)}t`})`, value: (t) => (g / Math.PI) * (Math.abs(W * t) < 1e-12 ? 1 : Math.sin(W * t) / (W * t)) }; }
  if (family === "tri") { const k = coefficient * W * factor; return { latex: `${lead(k)}\\operatorname{Sa}^{2}\\!\\left(${isZero(W - 1) ? "t" : `${fmt(W)}t`}\\right)`, value: (t) => (k / Math.PI) * (Math.abs(W * t) < 1e-12 ? 1 : Math.sin(W * t) / (W * t)) ** 2 }; }
  const width = family === "sinc" ? 2 * Math.PI * a : 2 * a; const gain = (coefficient / width) * factor;
  return { latex: `${coefficientPrefix(gain)}\\operatorname{rect}\\!\\left(\\frac{t}{${family === "sinc" ? `${isZero(a - 0.5) ? "" : fmt(2 * a)}\\pi` : fmt(width)}}\\right)`, value: (t) => (Math.abs(t / width) <= 0.5 ? gain : 0) };
}
const lowPassSpectrum = (entry: LowPass, omega: number) => {
  const x = entry.a * (omega - entry.center);
  return entry.coefficient * (entry.family === "rect" ? (Math.abs(x) <= 0.5 ? 1 : 0) : entry.family === "sinc" ? sincValue(x) : entry.family === "tri" ? triValue(x) : Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x);
};

/**
 * 𝓕⁻¹ for X(jω) = Σ rational(jω)·e^{−jωτ} + Σ Aₖδ(ω−ωₖ) + ideal pass-bands rect/sinc/Sa/tri at any centre.
 * Rational part: ω = −js maps X to H(s) (real coefficients required), inverted with the strip on σ = 0.
 */
export function inverseFourier(source: string): InverseFourierResult {
  try {
    const normalized = normalizeSpectrumSource(source);
    if (!normalized) return { ok: false, error: "Enter a spectrum, for example \\frac{1}{3+j\\omega}." };
    const groups = new Map<string, { delay: number; rational: CRational }>(); const impulses: Impulse[] = []; const lowPass: LowPass[] = [];
    const timeParts: string[] = []; const notes: string[] = []; const pairs: SpectrumModel["pairs"] = [];
    for (const part of splitTerms(normalized)) {
      const { text, delay } = extractDelay(part.text);
      const call = extractCall(text, ["delta", "rect", "sinc", "Sa", "tri"]);
      if (!call) {
        const parsedTerm = parseComplexRational(text); const value = part.sign < 0 ? rNeg(parsedTerm) : parsedTerm; const key = delay.toFixed(9);
        const existing = groups.get(key); groups.set(key, { delay, rational: existing ? rAdd(existing.rational, value) : value });
        continue;
      }
      if (!isZero(delay)) throw new FourierTableError("A delay factor multiplying δ or a pass-band is outside this table.");
      const coefficient = cScale(call.coefficient, part.sign); const { a, b } = affineOmega(call.argument);
      if (isZero(a)) throw new FourierTableError(`\\${call.name} needs an ω-dependent argument.`);
      if (call.name === "delta") { impulses.push({ omega: -b / a, area: cScale(coefficient, 1 / Math.abs(a)) }); continue; }
      if (!isZero(coefficient.im)) throw new FourierTableError("Pass-band gains must be real.");
      lowPass.push({ family: call.name as LowPass["family"], coefficient: coefficient.re, a: Math.abs(a), center: -b / a });
    }

    // Rational groups (one per delay) → H(s) with ω = −js, inverted with the strip on σ = 0.
    const valueParts: Array<(time: number) => number> = []; const rationalSpectra: Array<(omega: number) => Complex> = []; let decayRate: number | null = null;
    groups.forEach(({ delay, rational }) => {
      const toS = (poly: CPoly) => poly.map((coefficient, power) => cMul(coefficient, [c(1), c(0, -1), c(-1), c(0, 1)][power % 4]));
      const num = toS(trim(rational.num)); const den = toS(trim(rational.den)); const lead = den[den.length - 1];
      const numS = num.map((value) => cDiv(value, lead)); const denS = den.map((value) => cDiv(value, lead));
      if ([...numS, ...denS].some((value) => Math.abs(value.im) > 1e-9 * Math.max(1, cAbs(value)))) throw new FourierTableError("X(jω) must be conjugate-symmetric (write jω for odd powers of ω) so that x(t) is real.");
      const numerator = numS.map((value) => value.re).reverse(); const denominator = denS.map((value) => value.re).reverse();
      if (numerator.every((value) => isZero(value))) return;
      const system: TransferFunction = { mode: "s", numerator, denominator, zeros: polynomialRoots(numerator), poles: polynomialRoots(denominator), source: "" };
      const inverse = inverseLaplace(system, "two-sided", { stripAt: 0 });
      notes.push(...inverse.warnings);
      const body = shiftTimeLatex(inverse.timeLatex.replace(/^h\(t\)=/, ""), delay);
      if (body !== "0") timeParts.push(body);
      const rates = system.poles.map((pole) => Math.abs(pole.re)).filter((value) => value > 1e-9);
      if (rates.length) decayRate = Math.min(decayRate ?? Infinity, ...rates);
      valueParts.push((time) => evaluateInverseLaplace(inverse, time - delay));
      const evalPoly = (poly: CPoly, omega: number) => poly.reduceRight((sum, k) => cAdd(cMul(sum, c(omega)), k), c());
      rationalSpectra.push((omega) => cMul(cExpJ(-omega * delay), cDiv(evalPoly(rational.num, omega), evalPoly(rational.den, omega))));
      pairs.push({ timeLatex: body, freqLatex: "\\text{rational part}" });
    });

    // Impulse lines: Aₖδ(ω−ωₖ) ↔ (Aₖ/2π)e^{jωₖt}; mirrored pairs fold into cos/sin.
    const lines: Impulse[] = [];
    impulses.forEach((impulse) => { const existing = lines.find((item) => Math.abs(item.omega - impulse.omega) < 1e-9); if (existing) existing.area = cAdd(existing.area, impulse.area); else lines.push({ ...impulse }); });
    const used = new Set<Impulse>();
    lines.sort((left, right) => Math.abs(left.omega) - Math.abs(right.omega) || right.omega - left.omega).forEach((line) => {
      if (used.has(line)) return; used.add(line);
      const scale = 1 / (2 * Math.PI);
      if (isZero(line.omega)) {
        const value = cScale(line.area, scale);
        if (!isZero(value.im)) notes.push("A complex DC line gives a complex-valued x(t); only the real part is plotted.");
        timeParts.push(isZero(value.re - 1) ? "1" : fmt(value.re)); valueParts.push(() => value.re); return;
      }
      const mirror = line.omega > 0 ? lines.find((item) => !used.has(item) && Math.abs(item.omega + line.omega) < 1e-9) : undefined;
      const w0 = Math.abs(line.omega); const plus = line.omega > 0 ? line.area : c(); const minus = line.omega > 0 ? (mirror?.area ?? c()) : line.area;
      if (mirror) used.add(mirror);
      // (1/2π)[A₊e^{jω₀t} + A₋e^{−jω₀t}] = α cos ω₀t + β sin ω₀t with α = (A₊+A₋)/2π, β = j(A₊−A₋)/2π.
      const alpha = cScale(cAdd(plus, minus), scale); const beta = cMul(c(0, 1), cScale(cSub(plus, minus), scale));
      if (!isZero(alpha.im) || !isZero(beta.im)) notes.push("Asymmetric impulse lines give a complex-valued x(t); only the real part is plotted.");
      const arg = isZero(w0 - 1) ? "t" : `${fmt(w0)}t`;
      if (!isZero(alpha.re)) timeParts.push(`${coefficientPrefix(alpha.re)}\\cos(${arg})`);
      if (!isZero(beta.re)) timeParts.push(`${coefficientPrefix(beta.re)}\\sin(${arg})`);
      valueParts.push((time) => alpha.re * Math.cos(w0 * time) + beta.re * Math.sin(w0 * time));
    });

    // Pass-bands: a mirrored pair at ±ωc merges into 2·p(t)·cos(ωc t); a lone off-centre band keeps its real part.
    const pendingBands = lowPass.slice(); const takenBands = new Set<LowPass>();
    pendingBands.forEach((entry) => {
      if (takenBands.has(entry)) return; takenBands.add(entry);
      if (isZero(entry.center)) { const image = lowPassTime(entry, false); timeParts.push(image.latex); valueParts.push(image.value); return; }
      const mirror = entry.center > 0 ? pendingBands.find((other) => !takenBands.has(other) && other.family === entry.family && isZero(other.a - entry.a) && isZero(other.coefficient - entry.coefficient) && isZero(other.center + entry.center)) : undefined;
      const wc = Math.abs(entry.center); const carrier = `\\cos(${isZero(wc - 1) ? "t" : `${fmt(wc)}t`})`;
      if (mirror) { takenBands.add(mirror); const image = lowPassTime(entry, true); timeParts.push(`${image.latex}${carrier}`); valueParts.push((time) => image.value(time) * Math.cos(wc * time)); return; }
      notes.push("A single off-centre pass-band gives a complex-valued x(t); only the real part is plotted.");
      const image = lowPassTime(entry, false); timeParts.push(`${image.latex}\\cos(${fmt(entry.center)}t)`); valueParts.push((time) => image.value(time) * Math.cos(entry.center * time));
    });

    const spectrum: SpectrumModel = {
      valueAt: (omega) => lowPass.reduce<Complex>((total, entry) => cAdd(total, c(lowPassSpectrum(entry, omega))), rationalSpectra.reduce<Complex>((total, fn) => cAdd(total, fn(omega)), c())),
      impulses,
      latex: "",
      pairs,
    };
    const valueAt = (time: number) => valueParts.reduce((sum, fn) => sum + fn(time), 0);
    return { ok: true, latex: `x(t)=${joinSigned(timeParts)}`, spectrum, valueAt, decayRate, notes: Array.from(new Set(notes)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The spectrum could not be inverted." };
  }
}

/* ─────────────────────────── Auto-scaling ─────────────────────────── */

/**
 * Symmetric ω window: the band where |X_c| exceeds 10% of its peak (slow 1/ω tails would otherwise
 * flatten the plot), every impulse line,
 * plus 20% headroom; floored at 4 rad/s and capped at 200 rad/s.
 */
export function spectrumBandwidth(model: Pick<SpectrumModel, "valueAt" | "impulses">): number {
  let peak = 0; let edge = 0; const probe: Array<[number, number]> = [];
  for (let index = 0; index <= 1600; index += 1) { const omega = (200 * index) / 1600; const magnitude = cAbs(model.valueAt(omega)); if (Number.isFinite(magnitude)) { probe.push([omega, magnitude]); peak = Math.max(peak, magnitude); } }
  probe.forEach(([omega, magnitude]) => { if (magnitude > 0.1 * peak) edge = Math.max(edge, omega); });
  model.impulses.forEach((impulse) => { edge = Math.max(edge, Math.abs(impulse.omega)); });
  return Math.min(200, Math.max(4, 1.2 * edge));
}

/** Samples a spectrum model on [−W, W] for the magnitude/phase canvases. */
export function sampleSpectrum(model: SpectrumModel, bandwidth: number, samples = 480) {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const omega = -bandwidth + (2 * bandwidth * index) / samples; const value = model.valueAt(omega); const magnitude = cAbs(value);
    return { omega, real: value.re, imaginary: value.im, magnitude: Number.isFinite(magnitude) ? magnitude : 0, phase: magnitude < 1e-9 || !Number.isFinite(magnitude) ? 0 : Math.atan2(value.im, value.re) };
  });
}


/** Scaling theorem x(at) ↔ (1/|a|)X(jω/a): continuous part rescaled, impulse lines move to aω₀ with unchanged area. */
export function scaleSpectrum(model: SpectrumModel, scale: number): SpectrumModel {
  if (Math.abs(scale - 1) < 1e-12) return model;
  const a = Math.abs(scale);
  return { ...model, valueAt: (omega) => cScale(model.valueAt(omega / scale), 1 / a), impulses: model.impulses.map((impulse) => ({ omega: impulse.omega * scale, area: impulse.area })) };
}
