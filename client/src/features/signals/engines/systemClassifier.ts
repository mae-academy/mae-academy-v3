/**
 * MAE Academy / Signals & Systems — Tab B pure System Classification core.
 * Source normalization, semantic classification, numerical evaluation, and
 * graph sample generation are deliberately separate from React and Canvas.
 */
import { evaluateDefiniteIntegral } from "./diracIntegral";

export type AffineTime = { slope: number; offset: number };
export type Coefficient = { constant: number; timeSlope: number };
/** Canonical independent test signals injectable from the SIGNAL ENGINE pills. */
export type SignalKind = "u" | "r" | "rect" | "tri" | "sinc" | "Sa" | "sgn" | "sin" | "cos" | "delta";
export type SystemTerm =
  | { kind: "input-sample"; coefficient: Coefficient; argument: AffineTime; power: number }
  | { kind: "signal"; signal: SignalKind; argument: AffineTime; scale: number }
  | { kind: "constant"; value: number }
  | { kind: "integral" }
  | { kind: "derivative"; order: number };
export type SystemSemantic = { source: string; normalized: string; rawRhs: string; terms: SystemTerm[] };
export type ParsedSystem = { ok: true; system: SystemSemantic } | { ok: false; error: string };
export type Verdict = "Linear" | "Non-Linear" | "Time-Invariant" | "Time-Variant" | "Causal" | "Non-Causal" | "Memoryless" | "Dynamic" | "BIBO Stable" | "Unstable";
export type PillarId = "linearity" | "time" | "causality" | "memory" | "stability";
export type Pillar = { id: PillarId; title: string; verdict: Verdict; passed: boolean; proof: string[]; visualLead: string };
export type ClassificationReport = { pillars: Pillar[] };
export type TestSample = { t: number; left: number; right: number; difference: number };

const EPSILON = 1e-8;
/** \omega collapses to a concrete rad/s rate so sin(\omega t) stays inside the affine grammar. */
const OMEGA = 6.28319;
const near = (value: number, target = 0) => Math.abs(value - target) < EPSILON;
const texNumber = (value: number) => Number(value.toFixed(5)).toString();

/** Collapses every prime spelling (\prime, ′, ″, superscripted or bare) to repeated ASCII quotes. */
function normalizePrimes(value: string) {
  return value
    .replaceAll("\\prime", "'").replaceAll("′", "'").replaceAll("″", "''").replaceAll("’", "'")
    .replace(/\^\{('+)\}/g, "$1")
    .replace(/\^('+)/g, "$1");
}

function normalizeSystemSource(source: string) {
  return normalizePrimes(source)
    .replaceAll("\\left", "").replaceAll("\\right", "").replaceAll("\\!", "").replaceAll("\\,", "")
    // Canonical signal tokens are flattened to bare identifiers before term parsing.
    .replace(/\\(?:text|operatorname|mathrm)\{\s*(sinc|sgn|rect|tri|Sa)\s*\}/g, "$1")
    .replaceAll("\\Lambda", "tri").replaceAll("\\delta", "delta").replaceAll("\\sin", "sin").replaceAll("\\cos", "cos")
    .replaceAll("\\omega", `${OMEGA}`)
    .replaceAll("\\operatorname{", "").replaceAll("\\cdot", "*").replaceAll("\\times", "*")
    .replaceAll("\\infty", "infty").replaceAll("\\tau", "tau").replaceAll("\\pi", "pi")
    .replaceAll("−", "-").replaceAll("×", "*").replaceAll("τ", "tau").replaceAll(/\s+/g, "")
    .replace(/x\^\{(\d+(?:\.\d+)?)\}/g, "x^$1")
    .replace(/x\^\((\d+(?:\.\d+)?)\)/g, "x^$1");
}

function splitTopLevelSum(value: string) {
  const terms: Array<{ sign: number; text: string }> = []; let depth = 0; let start = 0; let sign = 1;
  for (let index = 0; index < value.length; index += 1) {
    const token = value[index]; if (token === "(" || token === "{") depth += 1; else if (token === ")" || token === "}") depth -= 1;
    if (depth === 0 && index > start && (token === "+" || token === "-")) { terms.push({ sign, text: value.slice(start, index) }); sign = token === "+" ? 1 : -1; start = index + 1; }
  }
  const tail = value.slice(start); if (tail) terms.push({ sign, text: tail }); return terms;
}

function affineTime(source: string): AffineTime | null {
  const value = source.replaceAll("*", "");
  if (value === "t") return { slope: 1, offset: 0 }; if (value === "-t") return { slope: -1, offset: 0 };
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return { slope: 0, offset: Number(value) };
  const match = value.match(/^([+-]?(?:(?:\d+(?:\.\d+)?)?))t(?:([+-]\d+(?:\.\d+)?))?$/); if (!match) return null;
  const token = match[1]; const slope = token === "" || token === "+" ? 1 : token === "-" ? -1 : Number(token);
  return { slope, offset: match[2] ? Number(match[2]) : 0 };
}

function coefficient(source: string): Coefficient | null { if (!source) return { constant: 1, timeSlope: 0 }; const form = affineTime(source); return form ? { constant: form.offset, timeSlope: form.slope } : null; }
function isIntegral(source: string) { return source.startsWith("\\int_") && source.includes("x(tau)") && source.includes("tau"); }
/** Leibniz (\frac{d^{n}}{dt^{n}}x(t)) and Lagrange (x'(t), x''(t)) notations share one derivative term. */
function derivativeOrder(source: string): number | null {
  if (source.startsWith("derivative")) return 1;
  const leibniz = source.match(/^\\frac\{d(?:\^\{?(\d+)\}?)?\}\{dt(?:\^\{?\d+\}?)?\}/);
  if (leibniz) return leibniz[1] ? Number(leibniz[1]) : 1;
  const lagrange = source.match(/^(?:[xy])('+)\((.+)\)$/);
  if (lagrange && affineTime(lagrange[2])) return lagrange[1].length;
  return null;
}

const SIGNAL_PATTERN = /^(\d+(?:\.\d+)?)?\*?(sinc|rect|tri|Sa|sgn|sin|cos|delta|u|r)\((.+)\)$/;
/** Independent canonical signals: bounded except the ramp, and never a function of x. */
const UNBOUNDED_SIGNALS: readonly SignalKind[] = ["r"];

export function evaluateCanonicalSignal(kind: SignalKind, time: number): number {
  switch (kind) {
    case "u": return time >= 0 ? 1 : 0;
    case "r": return time >= 0 ? time : 0;
    case "rect": return Math.abs(time) <= 0.5 ? 1 : 0;
    case "tri": return Math.max(0, 1 - Math.abs(time));
    case "sinc": return near(time) ? 1 : Math.sin(Math.PI * time) / (Math.PI * time);
    case "Sa": return near(time) ? 1 : Math.sin(time) / time;
    case "sgn": return time > 0 ? 1 : time < 0 ? -1 : 0;
    case "sin": return Math.sin(time);
    case "cos": return Math.cos(time);
    case "delta": return Math.abs(time) < 0.01 ? 50 : 0;
  }
}

/** A definite integral collapses to a number (Dirac rules included) and enters the system as a constant source. */
function parseDefiniteIntegralTerm(rawText: string | undefined, sign: number): SystemTerm | ParsedSystem | null {
  if (!rawText) return null;
  const evaluated = evaluateDefiniteIntegral(rawText);
  if (evaluated.kind === "value") return { kind: "constant", value: sign * evaluated.value };
  if (evaluated.kind === "undefined") return { ok: false, error: evaluated.reason };
  if (evaluated.kind === "divergent") return { ok: false, error: "That integral diverges, so the system has no finite constant term." };
  return null;
}

function parseTerm(source: string, sign: number, rawText?: string): SystemTerm | ParsedSystem | null {
  const text = source.startsWith("+") ? source.slice(1) : source; // Pill injections may carry a redundant leading plus.
  if (isIntegral(text)) return { kind: "integral" };
  if (text.startsWith("\\int")) return parseDefiniteIntegralTerm(rawText?.replace(/^\+/, ""), sign);
  const order = derivativeOrder(text);
  if (order !== null) return { kind: "derivative", order };
  if (/^\d+(?:\.\d+)?$/.test(text)) return { kind: "constant", value: sign * Number(text) };
  const signal = text.match(SIGNAL_PATTERN);
  if (signal) {
    const argument = affineTime(signal[3]); if (!argument) return null;
    return { kind: "signal", signal: signal[2] as SignalKind, argument, scale: sign * (signal[1] ? Number(signal[1]) : 1) };
  }
  const match = text.match(/^(.*?)(?:\*)?x(?:\^(\d+(?:\.\d+)?))?\((.+)\)$/); if (!match) return null;
  const factor = coefficient(match[1]); const argument = affineTime(match[3]); if (!factor || !argument) return null;
  return { kind: "input-sample", coefficient: { constant: sign * factor.constant, timeSlope: sign * factor.timeSlope }, argument, power: match[2] ? Number(match[2]) : 1 };
}

export function parseSystemExpression(source: string): ParsedSystem {
  const normalized = normalizeSystemSource(source); const equality = normalized.indexOf("=");
  if (equality < 0) return { ok: false, error: "Enter the system in the form y(t)=…" };
  if (normalized.slice(0, equality) !== "y(t)") return { ok: false, error: "The output must be written as y(t)=…" };
  const rhs = normalized.slice(equality + 1); if (!rhs) return { ok: false, error: "Complete the right-hand side of y(t)=…" };
  const terms: SystemTerm[] = [];
  // The raw split runs in parallel so definite integrals reach the Dirac core with their LaTeX intact.
  const rawParts = splitTopLevelSum(source.slice(source.indexOf("=") + 1));
  const normalizedParts = splitTopLevelSum(rhs);
  for (let index = 0; index < normalizedParts.length; index += 1) {
    const part = normalizedParts[index];
    const term = parseTerm(part.text, part.sign, rawParts.length === normalizedParts.length ? rawParts[index].text : undefined);
    if (!term) return { ok: false, error: `The term “${part.text}” is outside the current System Classification grammar.` };
    if ("ok" in term) return term;
    terms.push(term);
  }
  return { ok: true, system: { source, normalized, rawRhs: rhs, terms } };
}

const coefficientAt = (value: Coefficient, time: number) => value.constant + value.timeSlope * time;
export function evaluateSystem(system: SystemSemantic, input: (time: number) => number, time: number): number {
  return system.terms.reduce((total, term) => {
    if (term.kind === "constant") return total + term.value;
    if (term.kind === "signal") return total + term.scale * evaluateCanonicalSignal(term.signal, term.argument.slope * time + term.argument.offset);
    if (term.kind === "input-sample") return total + coefficientAt(term.coefficient, time) * Math.pow(input(term.argument.slope * time + term.argument.offset), term.power);
    if (term.kind === "integral") {
      const lower = -20; const intervals = 1200; const step = (time - lower) / intervals; let sum = 0;
      for (let index = 0; index <= intervals; index += 1) { const value = input(lower + index * step); sum += (index === 0 || index === intervals ? 0.5 : 1) * value; }
      return total + sum * step;
    }
    // Central differences: first order for x'(t), second order for x''(t), repeated beyond that.
    const step = 1e-3;
    let derivative = (at: number) => input(at);
    for (let order = 0; order < term.order; order += 1) { const previous = derivative; derivative = (at: number) => (previous(at + step) - previous(at - step)) / (2 * step); }
    return total + derivative(time);
  }, 0);
}

const SIGNAL_TEX: Record<SignalKind, string> = { u: "u", r: "r", rect: "\\text{rect}", tri: "\\text{tri}", sinc: "\\text{sinc}", Sa: "\\text{Sa}", sgn: "\\text{sgn}", sin: "\\sin", cos: "\\cos", delta: "\\delta" };
const signalTex = (term: Extract<SystemTerm, { kind: "signal" }>) => {
  const slope = near(term.argument.slope, 1) ? "" : near(term.argument.slope, -1) ? "-" : texNumber(term.argument.slope);
  const offset = near(term.argument.offset) ? "" : `${term.argument.offset > 0 ? "+" : ""}${texNumber(term.argument.offset)}`;
  return `${SIGNAL_TEX[term.signal]}\\!\\left(${slope}t${offset}\\right)`;
};
const inputTerms = (system: SystemSemantic) => system.terms.filter((term): term is Extract<SystemTerm, { kind: "input-sample" }> => term.kind === "input-sample");
const signedAffine = (term?: Extract<SystemTerm, { kind: "input-sample" }>) => `${texNumber(term?.argument.slope ?? 2)}t_1${(term?.argument.offset ?? 0) >= 0 ? "+" : ""}${texNumber(term?.argument.offset ?? 0)}`;

/** Static pillar shells so the proof section stays mounted while the equation is invalid. */
export const PILLAR_OUTLINE: ReadonlyArray<{ id: PillarId; title: string; visualLead: string }> = [
  { id: "linearity", title: "Linearity — Additivity & Homogeneity", visualLead: "Compare T{a x₁+b x₂} with aT{x₁}+bT{x₂}." },
  { id: "time", title: "Time Invariance — Shift Test", visualLead: "Compare T{x(t−t₀)} with y(t−t₀)." },
  { id: "causality", title: "Causality — Present vs Future Input", visualLead: "Locate the input sample required at the selected output instant." },
  { id: "memory", title: "Memory — Instantaneous vs Dynamic", visualLead: "Inspect whether the output needs an input value away from t." },
  { id: "stability", title: "BIBO Stability — Bounded Input, Bounded Output", visualLead: "Apply a bounded unit-step input and inspect the output envelope." },
];
const outline = (id: PillarId) => PILLAR_OUTLINE.find((entry) => entry.id === id) ?? PILLAR_OUTLINE[0];

export function classifySystem(system: SystemSemantic): ClassificationReport {
  const sampled = inputTerms(system); const hasIntegral = system.terms.some((term) => term.kind === "integral"); const hasDerivative = system.terms.some((term) => term.kind === "derivative");
  const constantOffset = system.terms.some((term) => term.kind === "constant" && !near(term.value));
  const derivativeTerm = system.terms.find((term): term is Extract<SystemTerm, { kind: "derivative" }> => term.kind === "derivative");
  const derivativeTex = derivativeTerm && derivativeTerm.order > 1 ? `\\frac{d^{${derivativeTerm.order}}x(t)}{dt^{${derivativeTerm.order}}}` : "\\frac{dx(t)}{dt}";
  const signalTerms = system.terms.filter((term): term is Extract<SystemTerm, { kind: "signal" }> => term.kind === "signal");
  const signalTerm = signalTerms[0];
  const unboundedSignal = signalTerms.some((term) => UNBOUNDED_SIGNALS.includes(term.signal));
  const nonlinearTerm = sampled.find((term) => !near(term.power, 1));
  const variantTerm = sampled.find((term) => !near(term.coefficient.timeSlope) || !near(term.argument.slope, 1));
  const futureTerm = sampled.find((term) => !near(term.argument.slope, 1) || term.argument.offset > EPSILON);
  const delayedTerm = sampled.find((term) => !near(term.argument.slope, 1) || !near(term.argument.offset));
  const unboundedGain = sampled.find((term) => !near(term.coefficient.timeSlope));
  const linear = !constantOffset && !nonlinearTerm && !signalTerm;
  const timeInvariant = !variantTerm && !signalTerm;
  const causal = !hasDerivative && !futureTerm;
  const memoryless = !hasIntegral && !hasDerivative && !delayedTerm;
  const stable = !hasIntegral && !hasDerivative && !unboundedGain && !unboundedSignal;

  const pillars: Pillar[] = [
    { id: "linearity", title: outline("linearity").title, verdict: linear ? "Linear" : "Non-Linear", passed: linear, visualLead: outline("linearity").visualLead, proof: linear ? ["T\\!\\left\\{a x_1(t)+b x_2(t)\\right\\}=aT\\!\\left\\{x_1(t)\\right\\}+bT\\!\\left\\{x_2(t)\\right\\}", "\\therefore\\ \\text{the system is linear}"] : signalTerm ? [`T\\!\\left\\{0\\right\\}=${signalTex(signalTerm)}\\ne 0`, "\\text{a source independent of }x\\text{ breaks homogeneity}", "\\therefore\\ \\text{the system is nonlinear}"] : constantOffset ? ["T\\!\\left\\{a x_1+b x_2\\right\\}=a x_1+b x_2+5", "aT\\!\\left\\{x_1\\right\\}+bT\\!\\left\\{x_2\\right\\}=a x_1+b x_2+5a+5b", "\\therefore\\ T\\{a x_1+b x_2\\}\\ne aT\\{x_1\\}+bT\\{x_2\\}"] : [`T\\!\\left\\{a x_1+b x_2\\right\\}=\\left(a x_1+b x_2\\right)^{${texNumber(nonlinearTerm?.power ?? 2)}}`, "\\left(a x_1+b x_2\\right)^2\\ne a x_1^2+b x_2^2", "\\therefore\\ \\text{the system is nonlinear}"] },
    { id: "time", title: outline("time").title, verdict: timeInvariant ? "Time-Invariant" : "Time-Variant", passed: timeInvariant, visualLead: outline("time").visualLead, proof: timeInvariant ? ["T\\!\\left\\{x(t-t_0)\\right\\}=y(t-t_0)", "\\therefore\\ \\text{the system is time-invariant}"] : !variantTerm && signalTerm ? [`T\\!\\left\\{x(t-t_0)\\right\\}\\ \\text{keeps}\\ ${signalTex(signalTerm)}\\ \\text{anchored at}\\ t`, `y(t-t_0)\\ \\text{shifts it to}\\ ${SIGNAL_TEX[signalTerm.signal]}\\!\\left(t-t_0\\right)`, "\\therefore\\ T\\{x(t-t_0)\\}\\ne y(t-t_0)\\quad\\text{(time-variant)}"] : !near(variantTerm?.coefficient.timeSlope ?? 0) ? ["T\\!\\left\\{x(t-t_0)\\right\\}=t\\,x(t-t_0)", "y(t-t_0)=(t-t_0)\\,x(t-t_0)", "\\therefore\\ T\\{x(t-t_0)\\}\\ne y(t-t_0)\\quad\\text{(time-variant)}"] : [`T\\!\\left\\{x(t-t_0)\\right\\}=x\\!\\left(${texNumber(variantTerm?.argument.slope ?? 2)}t-t_0\\right)`, `y(t-t_0)=x\\!\\left(${texNumber(variantTerm?.argument.slope ?? 2)}t-${texNumber(variantTerm?.argument.slope ?? 2)}t_0\\right)`, "\\therefore\\ T\\{x(t-t_0)\\}\\ne y(t-t_0)\\quad\\text{(time-variant)}"] },
    { id: "causality", title: outline("causality").title, verdict: causal ? "Causal" : "Non-Causal", passed: causal, visualLead: outline("causality").visualLead, proof: causal ? ["y(t_1)\\ \\text{depends only on}\\ x(\\tau),\\quad\\tau\\le t_1", "\\therefore\\ \\text{the system is causal}"] : !futureTerm && derivativeTerm ? [`y(t)=${derivativeTex}=\\lim_{h\\to 0}\\frac{x(t+h)-x(t-h)}{2h}`, "\\text{the limit samples}\\ x(t+h)\\ \\text{with}\\ t+h>t", "\\therefore\\ \\text{the system is non-causal in real time}"] : [`y(t_1)\\ \\text{requires}\\ x\\!\\left(${signedAffine(futureTerm)}\\right)`, `${signedAffine(futureTerm)}>t_1\\quad\\text{for a valid counterexample}`, "\\therefore\\ \\text{the system is non-causal}"] },
    { id: "memory", title: outline("memory").title, verdict: memoryless ? "Memoryless" : "Dynamic", passed: memoryless, visualLead: outline("memory").visualLead, proof: memoryless ? ["y(t)\\ \\text{depends only on}\\ x(t)", "\\therefore\\ \\text{the system is memoryless}"] : hasIntegral ? ["y(t)=\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau", "y(t)\\ \\text{depends on the input history}\\ x(\\tau),\\ \tau<t", "\\therefore\\ \\text{the system is dynamic}"] : !delayedTerm && derivativeTerm ? [`y(t)=${derivativeTex}`, "\\text{the rate needs input values in a neighbourhood of}\\ t", "\\therefore\\ \\text{the system is dynamic}"] : [`y(t)\\ \\text{uses}\\ x\\!\\left(${signedAffine(delayedTerm).replace("_1", "")}\\right)`, "\\therefore\\ \\text{the system is dynamic}"] },
    { id: "stability", title: outline("stability").title, verdict: stable ? "BIBO Stable" : "Unstable", passed: stable, visualLead: outline("stability").visualLead, proof: stable ? ["\\left|x(t)\\right|\\le M\\ \Longrightarrow\\ \\left|y(t)\\right|\\le C(M)<\\infty", "\\therefore\\ \\text{the system is BIBO stable}"] : unboundedSignal && !hasIntegral && !hasDerivative ? ["x(t)=u(t)\\ \\text{is bounded, yet}\\ r(t)=t\\,u(t)\\ \\text{is not}", "\\lim_{t\\to\\infty}\\left|y(t)\\right|=\\infty", "\\therefore\\ \\text{the system is unstable}"] : hasIntegral ? ["x(t)=u(t),\\qquad y(t)=\\int_{-\\infty}^{t}u(\\tau)\\,d\\tau=t\\,u(t)", "\\lim_{t\\to\\infty}\\left|y(t)\\right|=\\infty", "\\therefore\\ \\text{the system is unstable}"] : derivativeTerm ? [`x(t)=u(t)\\ \\text{is bounded, yet}\\ ${derivativeTex}=\\delta(t)`, "\\text{the impulse response is unbounded at}\\ t=0", "\\therefore\\ \\text{the system is unstable}"] : ["x(t)=u(t),\\qquad y(t)=t\\,u(t)", "\\lim_{t\\to\\infty}\\left|t\\,u(t)\\right|=\\infty", "\\therefore\\ \\text{the system is unstable}"] },
  ];
  return { pillars };
}

export const x1 = (time: number) => Math.abs(time + 0.75) <= 0.45 ? 1 : 0;
export const x2 = (time: number) => Math.max(0, 1 - Math.abs(time - 0.65) / 0.75);
export const unitStep = (time: number) => time >= 0 ? 1 : 0;

export function superpositionSamples(system: SystemSemantic, a: number, b: number, from = -3, to = 3, count = 480): TestSample[] {
  const values: TestSample[] = [];
  for (let index = 0; index <= count; index += 1) { const t = from + (to - from) * index / count; const combined = (time: number) => a * x1(time) + b * x2(time); const left = evaluateSystem(system, combined, t); const right = a * evaluateSystem(system, x1, t) + b * evaluateSystem(system, x2, t); values.push({ t, left, right, difference: left - right }); }
  return values;
}

export function shiftTestSamples(system: SystemSemantic, t0: number, from = -3, to = 3, count = 480): TestSample[] {
  const base = (time: number) => Math.max(0, 1 - Math.abs(time + 0.2) / 0.8); const values: TestSample[] = [];
  for (let index = 0; index <= count; index += 1) { const t = from + (to - from) * index / count; const left = evaluateSystem(system, (time) => base(time - t0), t); const right = evaluateSystem(system, base, t - t0); values.push({ t, left, right, difference: left - right }); }
  return values;
}

export function stabilitySamples(system: SystemSemantic, from = -2, to = 8, count = 520): Array<{ t: number; input: number; output: number }> {
  const values: Array<{ t: number; input: number; output: number }> = [];
  for (let index = 0; index <= count; index += 1) { const t = from + (to - from) * index / count; values.push({ t, input: unitStep(t), output: evaluateSystem(system, unitStep, t) }); }
  return values;
}
