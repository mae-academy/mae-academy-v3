/**
 * MAE Academy / Signals & Systems — Tab B pure System Classification core.
 * Source normalization, semantic classification, numerical evaluation, and
 * graph sample generation are deliberately separate from React and Canvas.
 */

export type AffineTime = { slope: number; offset: number };
export type Coefficient = { constant: number; timeSlope: number };
export type SystemTerm =
  | { kind: "input-sample"; coefficient: Coefficient; argument: AffineTime; power: number }
  | { kind: "constant"; value: number }
  | { kind: "integral" }
  | { kind: "derivative" };
export type SystemSemantic = { source: string; normalized: string; rawRhs: string; terms: SystemTerm[] };
export type ParsedSystem = { ok: true; system: SystemSemantic } | { ok: false; error: string };
export type Verdict = "Linear" | "Non-Linear" | "Time-Invariant" | "Time-Variant" | "Causal" | "Non-Causal" | "Memoryless" | "Dynamic" | "BIBO Stable" | "Unstable";
export type PillarId = "linearity" | "time" | "causality" | "memory" | "stability";
export type Pillar = { id: PillarId; title: string; verdict: Verdict; passed: boolean; proof: string[]; visualLead: string };
export type ClassificationReport = { pillars: Pillar[] };
export type TestSample = { t: number; left: number; right: number; difference: number };

const EPSILON = 1e-8;
const near = (value: number, target = 0) => Math.abs(value - target) < EPSILON;
const texNumber = (value: number) => Number(value.toFixed(5)).toString();

function normalizeSystemSource(source: string) {
  return source
    .replaceAll("\\left", "").replaceAll("\\right", "").replaceAll("\\!", "").replaceAll("\\,", "")
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
function isDerivative(source: string) { return source.startsWith("\\frac{d}{dt}") || source.startsWith("derivative"); }

function parseTerm(text: string, sign: number): SystemTerm | null {
  if (isIntegral(text)) return { kind: "integral" };
  if (isDerivative(text)) return { kind: "derivative" };
  if (/^\d+(?:\.\d+)?$/.test(text)) return { kind: "constant", value: sign * Number(text) };
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
  for (const part of splitTopLevelSum(rhs)) { const term = parseTerm(part.text, part.sign); if (!term) return { ok: false, error: `The term “${part.text}” is outside the current System Classification grammar.` }; terms.push(term); }
  return { ok: true, system: { source, normalized, rawRhs: rhs, terms } };
}

const coefficientAt = (value: Coefficient, time: number) => value.constant + value.timeSlope * time;
export function evaluateSystem(system: SystemSemantic, input: (time: number) => number, time: number): number {
  return system.terms.reduce((total, term) => {
    if (term.kind === "constant") return total + term.value;
    if (term.kind === "input-sample") return total + coefficientAt(term.coefficient, time) * Math.pow(input(term.argument.slope * time + term.argument.offset), term.power);
    if (term.kind === "integral") {
      const lower = -20; const intervals = 1200; const step = (time - lower) / intervals; let sum = 0;
      for (let index = 0; index <= intervals; index += 1) { const value = input(lower + index * step); sum += (index === 0 || index === intervals ? 0.5 : 1) * value; }
      return total + sum * step;
    }
    const step = 1e-3; return total + (input(time + step) - input(time - step)) / (2 * step);
  }, 0);
}

const inputTerms = (system: SystemSemantic) => system.terms.filter((term): term is Extract<SystemTerm, { kind: "input-sample" }> => term.kind === "input-sample");
const signedAffine = (term?: Extract<SystemTerm, { kind: "input-sample" }>) => `${texNumber(term?.argument.slope ?? 2)}t_1${(term?.argument.offset ?? 0) >= 0 ? "+" : ""}${texNumber(term?.argument.offset ?? 0)}`;

export function classifySystem(system: SystemSemantic): ClassificationReport {
  const sampled = inputTerms(system); const hasIntegral = system.terms.some((term) => term.kind === "integral"); const hasDerivative = system.terms.some((term) => term.kind === "derivative");
  const constantOffset = system.terms.some((term) => term.kind === "constant" && !near(term.value));
  const nonlinearTerm = sampled.find((term) => !near(term.power, 1));
  const variantTerm = sampled.find((term) => !near(term.coefficient.timeSlope) || !near(term.argument.slope, 1));
  const futureTerm = sampled.find((term) => !near(term.argument.slope, 1) || term.argument.offset > EPSILON);
  const delayedTerm = sampled.find((term) => !near(term.argument.slope, 1) || !near(term.argument.offset));
  const unboundedGain = sampled.find((term) => !near(term.coefficient.timeSlope));
  const linear = !constantOffset && !nonlinearTerm;
  const timeInvariant = !variantTerm;
  const causal = !hasDerivative && !futureTerm;
  const memoryless = !hasIntegral && !hasDerivative && !delayedTerm;
  const stable = !hasIntegral && !hasDerivative && !unboundedGain;

  const pillars: Pillar[] = [
    { id: "linearity", title: "Linearity — Additivity & Homogeneity", verdict: linear ? "Linear" : "Non-Linear", passed: linear, visualLead: "Compare T{a x₁+b x₂} with aT{x₁}+bT{x₂}.", proof: linear ? ["T\\!\\left\\{a x_1(t)+b x_2(t)\\right\\}=aT\\!\\left\\{x_1(t)\\right\\}+bT\\!\\left\\{x_2(t)\\right\\}", "\\therefore\\ \\text{the system is linear}"] : constantOffset ? ["T\\!\\left\\{a x_1+b x_2\\right\\}=a x_1+b x_2+5", "aT\\!\\left\\{x_1\\right\\}+bT\\!\\left\\{x_2\\right\\}=a x_1+b x_2+5a+5b", "\\therefore\\ T\\{a x_1+b x_2\\}\\ne aT\\{x_1\\}+bT\\{x_2\\}"] : [`T\\!\\left\\{a x_1+b x_2\\right\\}=\\left(a x_1+b x_2\\right)^{${texNumber(nonlinearTerm?.power ?? 2)}}`, "\\left(a x_1+b x_2\\right)^2\\ne a x_1^2+b x_2^2", "\\therefore\\ \\text{the system is nonlinear}"] },
    { id: "time", title: "Time Invariance — Shift Test", verdict: timeInvariant ? "Time-Invariant" : "Time-Variant", passed: timeInvariant, visualLead: "Compare T{x(t−t₀)} with y(t−t₀).", proof: timeInvariant ? ["T\\!\\left\\{x(t-t_0)\\right\\}=y(t-t_0)", "\\therefore\\ \\text{the system is time-invariant}"] : !near(variantTerm?.coefficient.timeSlope ?? 0) ? ["T\\!\\left\\{x(t-t_0)\\right\\}=t\\,x(t-t_0)", "y(t-t_0)=(t-t_0)\\,x(t-t_0)", "\\therefore\\ T\\{x(t-t_0)\\}\\ne y(t-t_0)\\quad\\text{(time-variant)}"] : [`T\\!\\left\\{x(t-t_0)\\right\\}=x\\!\\left(${texNumber(variantTerm?.argument.slope ?? 2)}t-t_0\\right)`, `y(t-t_0)=x\\!\\left(${texNumber(variantTerm?.argument.slope ?? 2)}t-${texNumber(variantTerm?.argument.slope ?? 2)}t_0\\right)`, "\\therefore\\ T\\{x(t-t_0)\\}\\ne y(t-t_0)\\quad\\text{(time-variant)}"] },
    { id: "causality", title: "Causality — Present vs Future Input", verdict: causal ? "Causal" : "Non-Causal", passed: causal, visualLead: "Locate the input sample required at the selected output instant.", proof: causal ? ["y(t_1)\\ \\text{depends only on}\\ x(\\tau),\\quad\\tau\\le t_1", "\\therefore\\ \\text{the system is causal}"] : [`y(t_1)\\ \\text{requires}\\ x\\!\\left(${signedAffine(futureTerm)}\\right)`, `${signedAffine(futureTerm)}>t_1\\quad\\text{for a valid counterexample}`, "\\therefore\\ \\text{the system is non-causal}"] },
    { id: "memory", title: "Memory — Instantaneous vs Dynamic", verdict: memoryless ? "Memoryless" : "Dynamic", passed: memoryless, visualLead: "Inspect whether the output needs an input value away from t.", proof: memoryless ? ["y(t)\\ \\text{depends only on}\\ x(t)", "\\therefore\\ \\text{the system is memoryless}"] : hasIntegral ? ["y(t)=\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau", "y(t)\\ \\text{depends on the input history}\\ x(\\tau),\\ \tau<t", "\\therefore\\ \\text{the system is dynamic}"] : [`y(t)\\ \\text{uses}\\ x\\!\\left(${signedAffine(delayedTerm).replace("_1", "")}\\right)`, "\\therefore\\ \\text{the system is dynamic}"] },
    { id: "stability", title: "BIBO Stability — Bounded Input, Bounded Output", verdict: stable ? "BIBO Stable" : "Unstable", passed: stable, visualLead: "Apply a bounded unit-step input and inspect the output envelope.", proof: stable ? ["\\left|x(t)\\right|\\le M\\ \Longrightarrow\\ \\left|y(t)\\right|\\le C(M)<\\infty", "\\therefore\\ \\text{the system is BIBO stable}"] : hasIntegral ? ["x(t)=u(t),\\qquad y(t)=\\int_{-\\infty}^{t}u(\\tau)\\,d\\tau=t\\,u(t)", "\\lim_{t\\to\\infty}\\left|y(t)\\right|=\\infty", "\\therefore\\ \\text{the system is unstable}"] : ["x(t)=u(t),\\qquad y(t)=t\\,u(t)", "\\lim_{t\\to\\infty}\\left|t\\,u(t)\\right|=\\infty", "\\therefore\\ \\text{the system is unstable}"] },
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
