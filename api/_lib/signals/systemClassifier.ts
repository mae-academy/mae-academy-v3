/**
 * MAE Academy / Signals & Systems — Tab B pure System Classification core.
 * Source normalization, semantic classification, numerical evaluation, and
 * graph sample generation are deliberately separate from React and Canvas.
 */
import { evaluateDefiniteIntegral } from "../../../shared/signals/mathExpression";
import { PILLAR_OUTLINE } from "../../../shared/signals/pillarOutline";
import type { AffineTime, Coefficient, SignalKind, SystemTerm, SystemSemantic, ParsedSystem, Verdict, PillarId, Pillar, ClassificationReport, TestSample } from "../../../shared/signals/results";
export type { AffineTime, Coefficient, SignalKind, SystemTerm, SystemSemantic, ParsedSystem, Verdict, PillarId, Pillar, ClassificationReport, TestSample };


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
const outline = (id: PillarId) => PILLAR_OUTLINE.find((entry) => entry.id === id) ?? PILLAR_OUTLINE[0];

function formatAffineArg(slope: number, offset: number, varName = "t"): string {
  if (near(slope, 1) && near(offset)) return varName;
  if (near(slope, -1) && near(offset)) return `-${varName}`;
  if (near(offset)) {
    const s = near(slope, 1) ? "" : near(slope, -1) ? "-" : texNumber(slope);
    return `${s}${varName}`;
  }
  const s = near(slope, 1) ? "" : near(slope, -1) ? "-" : texNumber(slope);
  const sign = offset > 0 ? "+" : "-";
  return `${s}${varName} ${sign} ${texNumber(Math.abs(offset))}`;
}

function formatCoeff(coeff: Coefficient, varName = "t"): string {
  if (near(coeff.timeSlope)) {
    if (near(coeff.constant, 1)) return "";
    if (near(coeff.constant, -1)) return "-";
    return `${texNumber(coeff.constant)}`;
  }
  if (near(coeff.timeSlope, 1) && near(coeff.constant)) return `${varName}\\,`;
  if (near(coeff.timeSlope, -1) && near(coeff.constant)) return `-${varName}\\,`;
  if (near(coeff.constant)) return `${texNumber(coeff.timeSlope)}${varName}\\,`;
  return `\\left(${formatAffineArg(coeff.timeSlope, coeff.constant, varName)}\\right)`;
}

function formatInputSample(term: Extract<SystemTerm, { kind: "input-sample" }>, signalVar = "x", varName = "t"): string {
  const c = formatCoeff(term.coefficient, varName);
  const arg = formatAffineArg(term.argument.slope, term.argument.offset, varName);
  const pow = !near(term.power, 1) ? `^{${texNumber(term.power)}}` : "";
  return `${c}${signalVar}${pow}(${arg})`;
}

function generateLinearityProof(
  system: SystemSemantic,
  nonlinearTerm: Extract<SystemTerm, { kind: "input-sample" }> | undefined,
  constantOffset: boolean,
  signalTerm: Extract<SystemTerm, { kind: "signal" }> | undefined,
  derivativeTex: string,
): string[] {
  if (nonlinearTerm) {
    const p = nonlinearTerm.power;
    const pTex = texNumber(p);
    const arg = formatAffineArg(nonlinearTerm.argument.slope, nonlinearTerm.argument.offset, "t");
    const coeff = formatCoeff(nonlinearTerm.coefficient, "t");
    if (near(p, 2)) {
      return [
        `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = ${coeff}\\left(a\\,x_1(${arg}) + b\\,x_2(${arg})\\right)^2`,
        `= ${coeff}\\left(a^2 x_1^2(${arg}) + 2ab\\,x_1(${arg})x_2(${arg}) + b^2 x_2^2(${arg})\\right)`,
        `a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} = ${coeff}\\left(a\\,x_1^2(${arg}) + b\\,x_2^2(${arg})\\right)`,
        `T\\{a\\,x_1(t) + b\\,x_2(t)\\} \\ne a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} \\quad (\\text{cross-term } 2ab\\,x_1 x_2 \\ne 0)`,
        `\\therefore \\text{The system is Non-Linear}`,
      ];
    }
    return [
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = ${coeff}\\left(a\\,x_1(${arg}) + b\\,x_2(${arg})\\right)^{${pTex}}`,
      `a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} = ${coeff}\\left(a\\,x_1^{${pTex}}(${arg}) + b\\,x_2^{${pTex}}(${arg})\\right)`,
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} \\ne a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}`,
      `\\therefore \\text{The system is Non-Linear}`,
    ];
  }

  if (constantOffset) {
    const constTerm = system.terms.find((t): t is Extract<SystemTerm, { kind: "constant" }> => t.kind === "constant");
    const val = constTerm?.value ?? 5;
    const cTex = texNumber(val);
    const sampled = inputTerms(system)[0];
    const sTerm1 = sampled ? formatInputSample(sampled, "x_1", "t") : "x_1(t)";
    const sTerm2 = sampled ? formatInputSample(sampled, "x_2", "t") : "x_2(t)";
    return [
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,${sTerm1} + b\\,${sTerm2} + ${cTex}`,
      `a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} = a\\left(${sTerm1} + ${cTex}\\right) + b\\left(${sTerm2} + ${cTex}\\right) = a\\,${sTerm1} + b\\,${sTerm2} + ${cTex}a + ${cTex}b`,
      `\\text{Since } ${cTex} \\ne ${cTex}a + ${cTex}b \\text{ for general } a, b \\implies T\\{a x_1 + b x_2\\} \\ne a T\\{x_1\\} + b T\\{x_2\\}`,
      `\\therefore \\text{The system is Non-Linear}`,
    ];
  }

  if (signalTerm) {
    return [
      `T\\{0\\} = ${signalTex(signalTerm)} \\ne 0 \\quad (\\text{Zero-input response is non-zero})`,
      `\\text{An independent source violates additivity: } T\\{a\\,x_1(t) + b\\,x_2(t)\\} \\ne a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}`,
      `\\therefore \\text{The system is Non-Linear}`,
    ];
  }

  if (system.terms.some((t) => t.kind === "integral")) {
    return [
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = \\int_{-\\infty}^{t} \\left(a\\,x_1(\\tau) + b\\,x_2(\\tau)\\right) d\\tau = a \\int_{-\\infty}^{t} x_1(\\tau)\\,d\\tau + b \\int_{-\\infty}^{t} x_2(\\tau)\\,d\\tau`,
      `a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} = a \\int_{-\\infty}^{t} x_1(\\tau)\\,d\\tau + b \\int_{-\\infty}^{t} x_2(\\tau)\\,d\\tau`,
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}`,
      `\\therefore \\text{The system is Linear}`,
    ];
  }

  if (system.terms.some((t) => t.kind === "derivative")) {
    const d1 = derivativeTex.replace("x(t)", "x_1(t)");
    const d2 = derivativeTex.replace("x(t)", "x_2(t)");
    return [
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = \\frac{d}{dt}\\left(a\\,x_1(t) + b\\,x_2(t)\\right) = a\\,${d1} + b\\,${d2}`,
      `a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} = a\\,${d1} + b\\,${d2}`,
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}`,
      `\\therefore \\text{The system is Linear}`,
    ];
  }

  const sampled = inputTerms(system);
  if (sampled.length > 0) {
    const s1 = sampled.map((t) => formatInputSample(t, "x_1", "t")).join(" + ");
    const s2 = sampled.map((t) => formatInputSample(t, "x_2", "t")).join(" + ");
    return [
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,${s1} + b\\,${s2}`,
      `a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\} = a\\,y_1(t) + b\\,y_2(t) = a\\,${s1} + b\\,${s2}`,
      `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}`,
      `\\therefore \\text{The system is Linear}`,
    ];
  }

  return [
    `T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}`,
    `\\therefore \\text{The system is Linear}`,
  ];
}

function generateTimeInvarianceProof(
  system: SystemSemantic,
  variantTerm: Extract<SystemTerm, { kind: "input-sample" }> | undefined,
  signalTerm: Extract<SystemTerm, { kind: "signal" }> | undefined,
): string[] {
  if (variantTerm) {
    const isCoeffTimeVariant = !near(variantTerm.coefficient.timeSlope);
    if (isCoeffTimeVariant) {
      return [
        `y_{\\text{shifted}}(t) = T\\{x(t - t_0)\\} = t\\,x(t - t_0)`,
        `y(t - t_0) = (t - t_0)\\,x(t - t_0)`,
        `t\\,x(t - t_0) \\ne (t - t_0)\\,x(t - t_0) \\implies T\\{x(t - t_0)\\} \\ne y(t - t_0)`,
        `\\therefore \\text{The system is Time-Variant}`,
      ];
    }
    const alpha = variantTerm.argument.slope;
    const beta = variantTerm.argument.offset;
    const alphaTex = texNumber(alpha);
    const betaTex = beta ? (beta > 0 ? ` + ${texNumber(beta)}` : ` - ${texNumber(Math.abs(beta))}`) : "";
    const shiftArg = beta ? `${alphaTex}t - t_0${betaTex}` : `${alphaTex}t - t_0`;
    const outArg = beta ? `${alphaTex}t - ${alphaTex}t_0${betaTex}` : `${alphaTex}t - ${alphaTex}t_0`;
    return [
      `y_{\\text{shifted}}(t) = T\\{x(t - t_0)\\} = x\\left(${shiftArg}\\right)`,
      `y(t - t_0) = x\\left(${alphaTex}(t - t_0)${betaTex}\\right) = x\\left(${outArg}\\right)`,
      `x\\left(${shiftArg}\\right) \\ne x\\left(${outArg}\\right) \\implies T\\{x(t - t_0)\\} \\ne y(t - t_0)`,
      `\\therefore \\text{The system is Time-Variant}`,
    ];
  }

  if (signalTerm) {
    return [
      `T\\{x(t - t_0)\\} \\text{ keeps } ${signalTex(signalTerm)} \\text{ anchored at } t`,
      `y(t - t_0) \\text{ shifts the entire output including } ${SIGNAL_TEX[signalTerm.signal]}(t - t_0)`,
      `T\\{x(t - t_0)\\} \\ne y(t - t_0)`,
      `\\therefore \\text{The system is Time-Variant}`,
    ];
  }

  if (system.terms.some((t) => t.kind === "integral")) {
    return [
      `T\\{x(t - t_0)\\} = \\int_{-\\infty}^{t} x(\\tau - t_0)\\,d\\tau \\quad \\xrightarrow{\\lambda = \\tau - t_0} \\quad \\int_{-\\infty}^{t - t_0} x(\\lambda)\\,d\\lambda`,
      `y(t - t_0) = \\int_{-\\infty}^{t - t_0} x(\\tau)\\,d\\tau`,
      `T\\{x(t - t_0)\\} = y(t - t_0)`,
      `\\therefore \\text{The system is Time-Invariant}`,
    ];
  }

  if (system.terms.some((t) => t.kind === "derivative")) {
    return [
      `T\\{x(t - t_0)\\} = \\frac{d}{dt}x(t - t_0)`,
      `y(t - t_0) = \\left.\\frac{dx(\\tau)}{d\\tau}\\right|_{\\tau = t - t_0} = \\frac{d}{dt}x(t - t_0)`,
      `T\\{x(t - t_0)\\} = y(t - t_0)`,
      `\\therefore \\text{The system is Time-Invariant}`,
    ];
  }

  const sampled = inputTerms(system);
  if (sampled.length > 0) {
    const term = sampled[0];
    const offset = term.argument.offset;
    const pow = !near(term.power, 1) ? `^{${texNumber(term.power)}}` : "";
    const shiftArg = offset ? `t - t_0 ${offset > 0 ? "+" : "-"} ${texNumber(Math.abs(offset))}` : `t - t_0`;
    return [
      `y_{\\text{shifted}}(t) = T\\{x(t - t_0)\\} = x${pow}\\left(${shiftArg}\\right)`,
      `y(t - t_0) = x${pow}\\left(${shiftArg}\\right)`,
      `T\\{x(t - t_0)\\} = y(t - t_0)`,
      `\\therefore \\text{The system is Time-Invariant}`,
    ];
  }

  return [
    `T\\{x(t - t_0)\\} = y(t - t_0)`,
    `\\therefore \\text{The system is Time-Invariant}`,
  ];
}

function generateCausalityProof(
  system: SystemSemantic,
  futureTerm: Extract<SystemTerm, { kind: "input-sample" }> | undefined,
  derivativeTerm: Extract<SystemTerm, { kind: "derivative" }> | undefined,
  derivativeTex: string,
): string[] {
  if (futureTerm) {
    const alpha = futureTerm.argument.slope;
    const beta = futureTerm.argument.offset;
    let t1 = 1;
    if (alpha < 0) t1 = -1;
    else if (near(alpha, 1) && beta > 0) t1 = 0;
    const tau = alpha * t1 + beta;
    const alphaTex = texNumber(alpha);
    const betaStr = near(beta) ? "" : (beta > 0 ? ` + ${texNumber(beta)}` : ` - ${texNumber(Math.abs(beta))}`);
    const subStr = near(alpha, 1) ? `${t1}${betaStr}` : `${alphaTex} \\cdot (${t1})${betaStr}`;
    return [
      `\\text{Observation instant: } t_1 = ${t1}`,
      `y(${t1}) = x\\left(${subStr}\\right) = x(${texNumber(tau)})`,
      `\\text{Since required sampling instant } \\tau = ${texNumber(tau)} > t_1 = ${t1} \\text{ (future sample)}`,
      `\\therefore \\text{The system is Non-Causal}`,
    ];
  }

  if (derivativeTerm) {
    return [
      `y(t) = ${derivativeTex} = \\lim_{h \\to 0} \\frac{x(t + h) - x(t - h)}{2h}`,
      `\\text{Evaluating the limit requires future input samples } x(t + h) \\text{ where } t + h > t`,
      `\\therefore \\text{The system is Non-Causal in real time}`,
    ];
  }

  if (system.terms.some((t) => t.kind === "integral")) {
    return [
      `y(t_1) = \\int_{-\\infty}^{t_1} x(\\tau)\\,d\\tau`,
      `\\text{The integration range is } \\tau \\in (-\\infty, t_1] \\implies \\tau \\le t_1 \\text{ for all integration points}`,
      `\\text{The output depends strictly on past and present values of } x`,
      `\\therefore \\text{The system is Causal}`,
    ];
  }

  const sampled = inputTerms(system);
  if (sampled.length > 0) {
    const term = sampled[0];
    const offset = term.argument.offset;
    if (offset < 0) {
      return [
        `\\text{At observation instant } t_1: \\quad y(t_1) = x(t_1 - ${texNumber(Math.abs(offset))})`,
        `\\text{Input sampling point: } \\tau = t_1 - ${texNumber(Math.abs(offset))} < t_1 \\quad \\forall t_1 \\in \\mathbb{R}`,
        `\\therefore \\text{The system is Causal (Depends strictly on past input)}`,
      ];
    }
    return [
      `\\text{At observation instant } t_1: \\quad y(t_1) \\text{ depends solely on } x(t_1)`,
      `\\text{Input sampling instant: } \\tau = t_1 \\le t_1 \\quad \\forall t_1 \\in \\mathbb{R}`,
      `\\therefore \\text{The system is Causal}`,
    ];
  }

  return [
    `y(t_1) \\text{ depends only on } x(\\tau) \\text{ for } \\tau \\le t_1`,
    `\\therefore \\text{The system is Causal}`,
  ];
}

function generateMemoryProof(
  system: SystemSemantic,
  delayedTerm: Extract<SystemTerm, { kind: "input-sample" }> | undefined,
  hasIntegral: boolean,
  hasDerivative: boolean,
  derivativeTex: string,
): string[] {
  if (delayedTerm) {
    const alpha = delayedTerm.argument.slope;
    const beta = delayedTerm.argument.offset;
    let t = 2;
    if (near(alpha, 1) && !near(beta)) t = 1;
    const tau = alpha * t + beta;
    return [
      `\\text{A system is memoryless iff } y(t) \\text{ depends solely on } x(t) \\text{ at the same instant } \\tau = t`,
      `\\text{At } t = ${t}: \\quad y(${t}) = x(${texNumber(tau)}) \\ne x(${t})`,
      `\\text{Output requires input at time } \\tau = ${texNumber(tau)} \\ne ${t}`,
      `\\therefore \\text{The system is Dynamic (Has Memory)}`,
    ];
  }

  if (hasIntegral) {
    return [
      `\\text{A system is memoryless iff } y(t) \\text{ depends solely on } x(t) \\text{ at the identical instant } t`,
      `y(t) = \\int_{-\\infty}^{t} x(\\tau)\\,d\\tau`,
      `\\text{Output accumulates the past continuum of inputs } x(\\tau) \\text{ for } \\tau < t`,
      `\\therefore \\text{The system is Dynamic (Has Memory)}`,
    ];
  }

  if (hasDerivative) {
    return [
      `\\text{A system is memoryless iff } y(t) \\text{ depends solely on } x(t) \\text{ at the identical instant } t`,
      `y(t) = ${derivativeTex}`,
      `\\text{Evaluating the instantaneous slope requires values of } x(\\tau) \\text{ in a neighborhood of } t`,
      `\\therefore \\text{The system is Dynamic (Has Memory)}`,
    ];
  }

  return [
    `\\text{A system is memoryless iff } y(t) \\text{ depends solely on } x(t) \\text{ at the identical instant } t`,
    `y(t) \\text{ depends solely on the current input sample } x(t) \\text{ at identical instant } \\tau = t`,
    `\\text{No values of } x \\text{ from the past or future are required to determine } y(t)`,
    `\\therefore \\text{The system is Memoryless}`,
  ];
}

function generateStabilityProof(
  system: SystemSemantic,
  unboundedGain: Extract<SystemTerm, { kind: "input-sample" }> | undefined,
  unboundedSignal: boolean,
  hasIntegral: boolean,
  hasDerivative: boolean,
  derivativeTex: string,
): string[] {
  if (unboundedGain) {
    return [
      `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
      `|y(t)| = |t\\,x(t)| = |t|\\,|x(t)| \\le |t|\\,M_x`,
      `\\lim_{t \\to \\infty} |y(t)| = \\lim_{t \\to \\infty} |t|\\,M_x = \\infty \\quad (\\text{Output grows without bound})`,
      `\\therefore \\text{The system is Unstable}`,
    ];
  }

  if (hasIntegral) {
    return [
      `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
      `\\text{Apply the bounded unit step input } x(t) = u(t) \\quad (|u(t)| \\le 1):`,
      `y(t) = \\int_{-\\infty}^{t} u(\\tau)\\,d\\tau = t\\,u(t) \\implies \\lim_{t \\to \\infty} |y(t)| = \\infty`,
      `\\therefore \\text{The system is Unstable}`,
    ];
  }

  if (hasDerivative) {
    return [
      `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
      `\\text{Apply the bounded unit step input } x(t) = u(t) \\quad (|u(t)| \\le 1):`,
      `y(t) = \\frac{d}{dt}u(t) = \\delta(t) \\implies \\delta(0) \\to \\infty`,
      `\\text{The impulse response is unbounded at } t = 0`,
      `\\therefore \\text{The system is Unstable}`,
    ];
  }

  if (unboundedSignal) {
    return [
      `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
      `\\text{The system contains an unbounded internal signal term } r(t) = t\\,u(t)`,
      `\\lim_{t \\to \\infty} |y(t)| = \\infty`,
      `\\therefore \\text{The system is Unstable}`,
    ];
  }

  const sampled = inputTerms(system);
  if (sampled.length > 0) {
    const term = sampled[0];
    const pow = !near(term.power, 1) ? `^{${texNumber(term.power)}}` : "";
    const arg = formatAffineArg(term.argument.slope, term.argument.offset, "t");
    if (!near(term.power, 1)) {
      return [
        `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
        `|y(t)| = |x(${arg})|${pow} \\le M_x${pow} < \\infty \\quad \\forall t`,
        `\\text{Raising a finite bounded signal to a finite power preserves boundedness}`,
        `\\therefore \\text{The system is BIBO Stable}`,
      ];
    }
    return [
      `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
      `|y(t)| = |x(${arg})| \\le M_x < \\infty \\quad \\forall t`,
      `\\text{Affine argument transformations } (${arg}) \\text{ do not alter the amplitude bound}`,
      `\\therefore \\text{The system is BIBO Stable}`,
    ];
  }

  const constTerm = system.terms.find((t): t is Extract<SystemTerm, { kind: "constant" }> => t.kind === "constant");
  if (constTerm) {
    const cTex = texNumber(Math.abs(constTerm.value));
    return [
      `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
      `|y(t)| \\le |x(t)| + ${cTex} \\le M_x + ${cTex} < \\infty \\quad \\forall t`,
      `\\text{Adding a finite constant preserves output boundedness}`,
      `\\therefore \\text{The system is BIBO Stable}`,
    ];
  }

  return [
    `\\text{Premise: Let } |x(t)| \\le M_x < \\infty \\quad \\forall t`,
    `|y(t)| \\le M_y < \\infty \\quad \\forall t`,
    `\\therefore \\text{The system is BIBO Stable}`,
  ];
}

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
    {
      id: "linearity",
      title: outline("linearity").title,
      verdict: linear ? "Linear" : "Non-Linear",
      passed: linear,
      visualLead: outline("linearity").visualLead,
      proof: generateLinearityProof(system, nonlinearTerm, constantOffset, signalTerm, derivativeTex),
    },
    {
      id: "time",
      title: outline("time").title,
      verdict: timeInvariant ? "Time-Invariant" : "Time-Variant",
      passed: timeInvariant,
      visualLead: outline("time").visualLead,
      proof: generateTimeInvarianceProof(system, variantTerm, signalTerm),
    },
    {
      id: "causality",
      title: outline("causality").title,
      verdict: causal ? "Causal" : "Non-Causal",
      passed: causal,
      visualLead: outline("causality").visualLead,
      proof: generateCausalityProof(system, futureTerm, derivativeTerm, derivativeTex),
    },
    {
      id: "memory",
      title: outline("memory").title,
      verdict: memoryless ? "Memoryless" : "Dynamic",
      passed: memoryless,
      visualLead: outline("memory").visualLead,
      proof: generateMemoryProof(system, delayedTerm, hasIntegral, hasDerivative, derivativeTex),
    },
    {
      id: "stability",
      title: outline("stability").title,
      verdict: stable ? "BIBO Stable" : "Unstable",
      passed: stable,
      visualLead: outline("stability").visualLead,
      proof: generateStabilityProof(system, unboundedGain, unboundedSignal, hasIntegral, hasDerivative, derivativeTex),
    },
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
