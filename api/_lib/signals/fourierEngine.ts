/**
 * MAE Academy / Signals & Systems — Tab D Fourier analysis core.
 * Pure numerical/symbolic math only: no React, Canvas, Plotly, or DOM references.
 */
import type { DerivationStep } from "../../../shared/signals/derivationTypes";
import { evaluateSignal, linearForm, toLatex, type SignalNode } from "../../../shared/signals/signalEngine";
import type { ComplexCoefficient, SpectrumPoint, FourierSeriesResult, FourierTransformResult } from "../../../shared/signals/results";
export type { ComplexCoefficient, SpectrumPoint, FourierSeriesResult, FourierTransformResult };


const EPSILON = 1e-10;
const format = (value: number, digits = 5) => Number(value.toFixed(digits)).toString();
const clampPositive = (value: number) => Math.max(0.05, Math.abs(value));
const canonicalRect = (node: SignalNode): boolean => node.kind === "function" && node.name === "rect" && node.argument.kind === "variable" && node.argument.name === "t";

function trapezoidComplex(sample: (time: number) => number, from: number, to: number, intervals: number, omega: number) {
  const step = (to - from) / intervals; let real = 0; let imaginary = 0;
  for (let index = 0; index <= intervals; index += 1) { const time = from + index * step; const weight = index === 0 || index === intervals ? 0.5 : 1; const value = sample(time); real += weight * value * Math.cos(omega * time); imaginary -= weight * value * Math.sin(omega * time); }
  return { real: real * step, imaginary: imaginary * step };
}

export function fourierSeries(node: SignalNode, period: number, harmonics = 18, intervals = 2400): FourierSeriesResult {
  const safePeriod = clampPositive(period); const omega0 = (2 * Math.PI) / safePeriod; const coefficients: ComplexCoefficient[] = [];
  // Sample x(t) once on the trapezoid grid; every coefficient reuses the same samples.
  const from = -safePeriod / 2; const step = safePeriod / intervals;
  const samples = Float64Array.from({ length: intervals + 1 }, (_, index) => evaluateSignal(node, from + index * step));
  const sampled = (time: number) => samples[Math.round((time - from) / step)];
  for (let harmonic = -harmonics; harmonic <= harmonics; harmonic += 1) { const result = trapezoidComplex(sampled, from, safePeriod / 2, intervals, harmonic * omega0); const real = result.real / safePeriod; const imaginary = result.imaginary / safePeriod; coefficients.push({ harmonic, real, imaginary, magnitude: Math.hypot(real, imaginary), phase: Math.hypot(real, imaginary) < EPSILON ? 0 : Math.atan2(imaginary, real) }); }
  const efsDef = `\\text{EFS: } x(t) = \\sum_{k=-\\infty}^{\\infty} c_k e^{jk\\omega_0 t}, \\quad c_k = \\frac{1}{T_0} \\int_{T_0} x(t) e^{-jk\\omega_0 t} dt`;
  const tfsDef = `\\text{TFS: } x(t) = a_0 + \\sum_{k=1}^{\\infty} \\left[ a_k \\cos(k\\omega_0 t) + b_k \\sin(k\\omega_0 t) \\right]`;
  const tfsCoeffs = `a_0 = c_0, \\quad a_k = \\frac{2}{T_0} \\int_{T_0} x(t) \\cos(k\\omega_0 t) dt, \\quad b_k = \\frac{2}{T_0} \\int_{T_0} x(t) \\sin(k\\omega_0 t) dt`;
  return { period: safePeriod, omega0, coefficients, derivation: [efsDef, tfsDef, tfsCoeffs, `T_0=${format(safePeriod)},\\qquad\\omega_0=${format(omega0)}`] };
}





export function fourierTransform(node: SignalNode, scale = 1, omegaRange = 16, samples = 320, timeWindow = 10, intervals = 3200): FourierTransformResult {
  const safeScale = clampPositive(scale); const spectrum: SpectrumPoint[] = []; const isStandardRect = canonicalRect(node);
  for (let index = 0; index <= samples; index += 1) { const omega = -omegaRange + (2 * omegaRange) * index / samples; let real: number; let imaginary: number;
    if (isStandardRect) { const argument = omega / (2 * Math.PI * safeScale); const amplitude = Math.abs(argument) < EPSILON ? 1 / safeScale : Math.sin(Math.PI * argument) / (Math.PI * argument) / safeScale; real = amplitude; imaginary = 0; }
    else { const result = trapezoidComplex((time) => evaluateSignal(node, safeScale * time), -timeWindow, timeWindow, intervals, omega); real = result.real; imaginary = result.imaginary; }
    const magnitude = Math.hypot(real, imaginary); spectrum.push({ omega, real, imaginary, magnitude, phase: magnitude < EPSILON ? 0 : Math.atan2(imaginary, real) }); }
  const derivation = isStandardRect ? [`x(at)=\\operatorname{rect}(at)`, `X_a(j\\omega)=\\frac{1}{|a|}\\operatorname{sinc}\\!\\left(\\frac{\\omega}{2\\pi a}\\right)`, `a=${format(safeScale)}`] : ["X(j\\omega)=\\int_{-\\infty}^{\\infty}x(t)e^{-j\\omega t}\\,dt", `X_a(j\\omega)=\\int x(${format(safeScale)}t)e^{-j\\omega t}\\,dt`];
  return { scale: safeScale, spectrum, isStandardRect, derivation };
}



/* ─────────────────────────── Step-by-step Fourier series derivation ─────────────────────────── */


const isConstantSignalNode = (node: SignalNode): boolean => {
  switch (node.kind) {
    case "number": return true;
    case "variable": return node.name === "pi";
    case "unary": return isConstantSignalNode(node.value);
    case "binary": return isConstantSignalNode(node.left) && isConstantSignalNode(node.right);
    case "function": return false;
  }
};

function peelCoefficient(node: SignalNode): { coefficient: number; core: SignalNode } {
  if (node.kind === "unary" && node.operator === "-") { const inner = peelCoefficient(node.value); return { coefficient: -inner.coefficient, core: inner.core }; }
  if (node.kind === "binary" && node.operator === "*") {
    if (isConstantSignalNode(node.left) && !isConstantSignalNode(node.right)) { const inner = peelCoefficient(node.right); return { coefficient: evaluateSignal(node.left, 0) * inner.coefficient, core: inner.core }; }
    if (isConstantSignalNode(node.right) && !isConstantSignalNode(node.left)) { const inner = peelCoefficient(node.left); return { coefficient: evaluateSignal(node.right, 0) * inner.coefficient, core: inner.core }; }
  }
  return { coefficient: 1, core: node };
}

function additiveTerms(node: SignalNode): Array<{ sign: number; node: SignalNode }> {
  if (node.kind === "binary" && (node.operator === "+" || node.operator === "-")) {
    const right = additiveTerms(node.right).map((term) => ({ sign: node.operator === "-" ? -term.sign : term.sign, node: term.node }));
    return [...additiveTerms(node.left), ...right];
  }
  if (node.kind === "unary" && node.operator === "-") return additiveTerms(node.value).map((term) => ({ sign: -term.sign, node: term.node }));
  return [{ sign: 1, node }];
}

const signedNode = (sign: number, node: SignalNode): SignalNode => (sign < 0 ? { kind: "unary", operator: "-", value: node } : node);

type PulseHit = { kind: "pulse"; family: "rect" | "tri"; coefficient: number; t0: number; halfSpan: number };
type TrigHit = { kind: "trig"; coefficient: number; omega1: number; phase: number; isSine: boolean };
type DcHit = { kind: "dc"; value: number };
type TermHit = PulseHit | TrigHit | DcHit | { kind: "unsupported" };

function classifyFourierSeriesTerm(node: SignalNode): TermHit {
  const { coefficient, core } = peelCoefficient(node);
  if (core.kind === "number" || (core.kind === "variable" && core.name === "pi")) return { kind: "dc", value: coefficient * evaluateSignal(core, 0) };
  if (core.kind === "function" && (core.name === "rect" || core.name === "tri")) {
    const form = linearForm(core.argument); if (!form || Math.abs(form.slope) < 1e-9) return { kind: "unsupported" };
    return { kind: "pulse", family: core.name, coefficient, t0: -form.offset / form.slope, halfSpan: (core.name === "rect" ? 0.5 : 1) / Math.abs(form.slope) };
  }
  if (core.kind === "function" && (core.name === "cos" || core.name === "sin")) {
    const form = linearForm(core.argument); if (!form || Math.abs(form.slope) < 1e-9) return { kind: "unsupported" };
    return { kind: "trig", coefficient: core.name === "sin" && form.slope < 0 ? -coefficient : coefficient, omega1: Math.abs(form.slope), phase: form.slope < 0 ? -form.offset : form.offset, isSine: core.name === "sin" };
  }
  return { kind: "unsupported" };
}

/** Sa-kernel of a periodic pulse train: rect → Sa(kω₀d/2), tri → Sa²(kω₀h/2) (h = half-span). */
const saKernel = (family: "rect" | "tri", halfSpan: number) => (family === "rect"
  ? `\\operatorname{Sa}\\!\\left(\\frac{k\\omega_0\\,${format(2 * halfSpan)}}{2}\\right)`
  : `\\operatorname{Sa}^{2}\\!\\left(\\frac{k\\omega_0\\,${format(halfSpan)}}{2}\\right)`);
const delayFactor = (t0: number) => (Math.abs(t0) < 1e-9 ? "" : `\\,e^{-jk\\omega_0(${format(t0)})}`);
const periodLine = (period: number, omega0: number) => `T_0=${format(period)}\\ \\text{s},\\qquad\\omega_0=\\frac{2\\pi}{T_0}=${format(omega0)}\\ \\text{rad/s}`;

/**
 * Authentic exponential Fourier series c_k derivation (periodic signals only — no Fourier-transform artifacts):
 * DC term, harmonic integral setup with the antiderivative, Euler expansion to the real Sa function, and the compact
 * final form with parity evaluation and lim_{k→0} c_k = c₀. Covers {rect, tri, sin, cos, constants} and sums.
 */
export function deriveFourierSeriesSteps(node: SignalNode, period: number): DerivationStep[] {
  const safePeriod = clampPositive(period); const omega0 = (2 * Math.PI) / safePeriod;
  const dcLines: string[] = []; const setupLines: string[] = []; const eulerLines: string[] = []; const finalParts: string[] = []; const parityLines: string[] = [];
  let dc = 0; let pulseDc = 0; let hasUnsupported = false; let pulseCount = 0; const singleRef: { value: { family: "rect" | "tri"; halfSpan: number; t0: number } | null } = { value: null }; let termCount = 0;

  additiveTerms(node).forEach(({ sign, node: termNode }) => {
    termCount += 1;
    const label = toLatex(signedNode(sign, termNode)); const hit = classifyFourierSeriesTerm(termNode);
    if (hit.kind === "dc") { const value = sign * hit.value; dc += value; dcLines.push(`${label}:\\quad\\frac{1}{T_0}\\int_{\\langle T_0\\rangle}${format(value)}\\,dt=${format(value)}`); return; }
    if (hit.kind === "unsupported") { hasUnsupported = true; setupLines.push(`${label}:\\quad\\text{outside the closed-form table; folded numerically into the coefficients}`); return; }
    const coefficient = sign * hit.coefficient;

    if (hit.kind === "pulse") {
      const { family, t0, halfSpan } = hit; const lower = t0 - halfSpan; const upper = t0 + halfSpan; const span = 2 * halfSpan;
      pulseCount += 1; singleRef.value = { family, halfSpan, t0 };
      const gain = (coefficient * (family === "rect" ? span : halfSpan)) / safePeriod;
      const weight = family === "tri" ? `\\left(1-\\frac{|t-${format(t0)}|}{${format(halfSpan)}}\\right)` : "";
      dcLines.push(`c_0=\\frac{1}{T_0}\\int_{${format(lower)}}^{${format(upper)}}${format(coefficient)}${weight}\\,dt=\\frac{${format(coefficient * (family === "rect" ? span : halfSpan))}}{T_0}=${format(gain)}`);
      setupLines.push(`${label}:\\quad ${family === "rect" ? `\\operatorname{rect}\\text{ is nonzero on }t\\in[${format(lower)},\\,${format(upper)}]` : `\\operatorname{tri}\\text{ ramps }0\\to1\\text{ on }[${format(lower)},\\,${format(t0)}]\\text{ and }1\\to0\\text{ on }[${format(t0)},\\,${format(upper)}]`}`);
      if (family === "rect") {
        setupLines.push(`c_k=\\frac{${format(coefficient)}}{T_0}\\int_{${format(lower)}}^{${format(upper)}}e^{-jk\\omega_0t}\\,dt=\\frac{${format(coefficient)}}{-jk\\omega_0T_0}\\left[e^{-jk\\omega_0(${format(upper)})}-e^{-jk\\omega_0(${format(lower)})}\\right]`);
        eulerLines.push(`c_k=\\frac{${format(coefficient)}\\left(e^{jk\\omega_0\\cdot${format(halfSpan)}}-e^{-jk\\omega_0\\cdot${format(halfSpan)}}\\right)}{jk\\omega_0T_0}${delayFactor(t0)}=\\frac{${format(2 * coefficient)}\\sin(k\\omega_0\\cdot${format(halfSpan)})}{k\\omega_0T_0}${delayFactor(t0)}=${format(gain)}\\,${saKernel(family, halfSpan)}${delayFactor(t0)}`);
      } else {
        setupLines.push(`c_k=\\frac{${format(coefficient)}}{T_0}\\left(\\int_{${format(lower)}}^{${format(t0)}}\\!\\!\\left(1+\\tfrac{t-${format(t0)}}{${format(halfSpan)}}\\right)e^{-jk\\omega_0t}dt+\\int_{${format(t0)}}^{${format(upper)}}\\!\\!\\left(1-\\tfrac{t-${format(t0)}}{${format(halfSpan)}}\\right)e^{-jk\\omega_0t}dt\\right)`);
        setupLines.push(`\\int t\\,e^{-jk\\omega_0t}\\,dt=\\frac{t\\,e^{-jk\\omega_0t}}{-jk\\omega_0}-\\int\\frac{e^{-jk\\omega_0t}}{-jk\\omega_0}\\,dt\\quad(\\text{by parts on each ramp})`);
        eulerLines.push(`c_k=\\frac{${format(coefficient)}\\left(2-2\\cos(k\\omega_0\\cdot${format(halfSpan)})\\right)}{${format(halfSpan)}\\,k^{2}\\omega_0^{2}\\,T_0}${delayFactor(t0)}=${format(gain)}\\,${saKernel(family, halfSpan)}${delayFactor(t0)}`);
      }
      finalParts.push(`${format(gain)}\\,${saKernel(family, halfSpan)}${delayFactor(t0)}`); dc += gain; pulseDc += gain;
      return;
    }

    const { omega1, phase, isSine } = hit; const m = Math.round(omega1 / omega0);
    if (m <= 0 || Math.abs(omega1 - m * omega0) > 1e-6 * Math.max(1, omega0)) { hasUnsupported = true; setupLines.push(`${label}:\\quad\\omega_1=${format(omega1)}\\text{ is not an integer multiple of }\\omega_0=${format(omega0)}\\text{; folded numerically into the coefficients}`); return; }
    setupLines.push(`${label}:\\quad\\omega_1=${format(omega1)}=${m}\\,\\omega_0\\ \\Rightarrow\\ \\text{contributes only to }k=\\pm${m}`);
    eulerLines.push(isSine
      ? `${format(coefficient)}\\sin(\\omega_1t+\\varphi)=\\frac{${format(coefficient)}}{2j}e^{j(\\omega_1t+\\varphi)}-\\frac{${format(coefficient)}}{2j}e^{-j(\\omega_1t+\\varphi)}`
      : `${format(coefficient)}\\cos(\\omega_1t+\\varphi)=\\frac{${format(coefficient)}}{2}e^{j(\\omega_1t+\\varphi)}+\\frac{${format(coefficient)}}{2}e^{-j(\\omega_1t+\\varphi)}`);
    const half = coefficient / 2; const positive = `e^{j${format(phase)}}`; const negative = `e^{-j${format(phase)}}`;
    eulerLines.push(isSine ? `c_{${m}}=-j\\,${format(half)}\\,${positive},\\qquad c_{-${m}}=j\\,${format(half)}\\,${negative}` : `c_{${m}}=${format(half)}\\,${positive},\\qquad c_{-${m}}=${format(half)}\\,${negative}`);
    finalParts.push(`\\begin{cases}${isSine ? "-j" : ""}${format(half)}${positive}&k=${m}\\\\${isSine ? "j" : ""}${format(half)}${negative}&k=-${m}\\\\0&\\text{otherwise}\\end{cases}`);
  });

  if (pulseCount > 0) parityLines.push(`\\lim_{k\\to0}\\operatorname{Sa}(\\cdot)=1\\ \\Rightarrow\\ \\lim_{k\\to0}c_k=${format(pulseDc)}=c_0\\ \\text{(pulse part)}`);
  const alone = termCount === 1 ? singleRef.value : null;
  if (alone && Math.abs(alone.t0) < 1e-9) {
    const span = alone.family === "rect" ? 2 * alone.halfSpan : alone.halfSpan; const duty = span / safePeriod;
    parityLines.push("x(-t)=x(t)\\ \\Rightarrow\\ c_k\\in\\mathbb{R},\\quad c_{-k}=c_k");
    if (alone.family === "rect" && Math.abs(duty - 0.5) < 1e-9) parityLines.push("d=\\tfrac{T_0}{2}:\\quad c_{k}=0\\ \\text{for even }k\\ne0,\\qquad c_k=\\frac{\\sin(k\\pi/2)}{k\\pi}=\\frac{(-1)^{(k-1)/2}}{k\\pi}\\ \\text{for odd }k");
    else { const inverse = 1 / duty; parityLines.push(Math.abs(inverse - Math.round(inverse)) < 1e-9 && inverse >= 2 ? `\\frac{${alone.family === "rect" ? "d" : "h"}}{T_0}=\\frac{1}{${Math.round(inverse)}}:\\quad c_k=0\\ \\text{for every }k=${Math.round(inverse)}m,\\ m\\ne0` : `c_k=0\\ \\text{only when }k\\,\\frac{${alone.family === "rect" ? "d" : "h"}}{T_0}\\in\\mathbb{Z}\\setminus\\{0\\}`); }
  }
  const closed = finalParts.length ? finalParts.join("\\ +\\ ") : "0";
  return [
    { title: "Step 1 — DC Component c₀", lines: ["c_0=\\frac{1}{T_0}\\int_{\\langle T_0\\rangle}x(t)\\,dt", periodLine(safePeriod, omega0), ...dcLines, `c_0=${format(dc)}`] },
    { title: "Step 2 — Harmonic Integral Setup", lines: ["c_k=\\frac{1}{T_0}\\int_{\\langle T_0\\rangle}x(t)\\,e^{-jk\\omega_0t}\\,dt", ...(setupLines.length ? setupLines : ["\\text{Every term is constant: }c_k=0\\ (k\\ne0)."])] },
    { title: "Step 3 — Euler Expansion & Sa Function", lines: eulerLines.length ? eulerLines : ["\\text{No pulse or trigonometric term required simplification.}"] },
    { title: "Step 4 — Final Compact Form & Parity", lines: [`c_k=${closed}${hasUnsupported ? "\\ +\\ \\text{(numeric remainder)}" : ""}\\quad(k\\ne0),\\qquad c_0=${format(dc)}`, ...parityLines] },
  ];
}

type Parity = "even" | "odd" | "none";

/**
 * Authentic trigonometric Fourier series x(t) = a₀/2 + Σ[aₖcos kω₀t + bₖsin kω₀t]: DC term, cosine coefficients,
 * sine coefficients with the parity (symmetry) rule, and the compact form with cₖ = (aₖ − jbₖ)/2.
 */
export function deriveTrigSeriesSteps(node: SignalNode, period: number): DerivationStep[] {
  const safePeriod = clampPositive(period); const omega0 = (2 * Math.PI) / safePeriod;
  const dcLines: string[] = []; const cosineLines: string[] = []; const sineLines: string[] = [];
  const aParts: string[] = []; const bParts: string[] = []; let dc = 0; let hasUnsupported = false; const parities: Parity[] = [];

  additiveTerms(node).forEach(({ sign, node: termNode }) => {
    const label = toLatex(signedNode(sign, termNode)); const hit = classifyFourierSeriesTerm(termNode);
    if (hit.kind === "dc") { const value = sign * hit.value; dc += value; parities.push("even"); dcLines.push(`${label}:\\quad\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}${format(value)}\\,dt=${format(2 * value)}`); return; }
    if (hit.kind === "unsupported") { hasUnsupported = true; parities.push("none"); cosineLines.push(`${label}:\\quad\\text{outside the closed-form table; folded numerically into the coefficients}`); return; }
    const coefficient = sign * hit.coefficient;

    if (hit.kind === "pulse") {
      const { family, t0, halfSpan } = hit; const lower = t0 - halfSpan; const upper = t0 + halfSpan; const span = 2 * halfSpan; const centered = Math.abs(t0) < 1e-9;
      parities.push(centered ? "even" : "none");
      const gain = (coefficient * (family === "rect" ? span : halfSpan)) / safePeriod;
      const weight = family === "tri" ? `\\left(1-\\frac{|t-${format(t0)}|}{${format(halfSpan)}}\\right)` : "";
      dcLines.push(`a_0=\\frac{2}{T_0}\\int_{${format(lower)}}^{${format(upper)}}${format(coefficient)}${weight}\\,dt=\\frac{${format(2 * coefficient * (family === "rect" ? span : halfSpan))}}{T_0}=${format(2 * gain)}=2c_0`);
      cosineLines.push(`${label}:\\quad a_k=\\frac{2}{T_0}\\int_{${format(lower)}}^{${format(upper)}}${format(coefficient)}${weight}\\cos(k\\omega_0t)\\,dt`);
      if (family === "rect") {
        cosineLines.push(`a_k=\\frac{${format(2 * coefficient)}}{k\\omega_0T_0}\\left[\\sin(k\\omega_0(${format(upper)}))-\\sin(k\\omega_0(${format(lower)}))\\right]`);
        if (centered) cosineLines.push(`a_k=\\frac{${format(4 * coefficient)}\\sin(k\\omega_0\\cdot${format(halfSpan)})}{k\\omega_0T_0}=${format(2 * gain)}\\,${saKernel(family, halfSpan)}`);
        else cosineLines.push(`a_k=${format(2 * gain)}\\,${saKernel(family, halfSpan)}\\cos(k\\omega_0(${format(t0)}))`);
      } else {
        cosineLines.push(`\\int t\\cos(k\\omega_0t)\\,dt=\\frac{t\\sin(k\\omega_0t)}{k\\omega_0}+\\frac{\\cos(k\\omega_0t)}{k^{2}\\omega_0^{2}}\\quad(\\text{by parts on each ramp})`);
        cosineLines.push(`a_k=${format(2 * gain)}\\,${saKernel(family, halfSpan)}${centered ? "" : `\\cos(k\\omega_0(${format(t0)}))`}`);
      }
      aParts.push(`${format(2 * gain)}\\,${saKernel(family, halfSpan)}${centered ? "" : `\\cos(k\\omega_0(${format(t0)}))`}`);
      if (centered) sineLines.push(`${label}:\\quad x(-t)=x(t)\\ \\Rightarrow\\ x(t)\\sin(k\\omega_0t)\\text{ is odd}\\ \\Rightarrow\\ b_k=\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}x(t)\\sin(k\\omega_0t)\\,dt=0`);
      else { sineLines.push(`${label}:\\quad\\text{shifted by }t_0=${format(t0)}\\ \\Rightarrow\\ b_k=\\frac{2}{T_0}\\int_{${format(lower)}}^{${format(upper)}}${format(coefficient)}${weight}\\sin(k\\omega_0t)\\,dt=${format(2 * gain)}\\,${saKernel(family, halfSpan)}\\sin(k\\omega_0(${format(t0)}))`); bParts.push(`${format(2 * gain)}\\,${saKernel(family, halfSpan)}\\sin(k\\omega_0(${format(t0)}))`); }
      dc += gain;
      return;
    }

    const { omega1, phase, isSine } = hit; const m = Math.round(omega1 / omega0);
    if (m <= 0 || Math.abs(omega1 - m * omega0) > 1e-6 * Math.max(1, omega0)) { hasUnsupported = true; parities.push("none"); cosineLines.push(`${label}:\\quad\\omega_1=${format(omega1)}\\text{ is not an integer multiple of }\\omega_0=${format(omega0)}\\text{; folded numerically into the coefficients}`); return; }
    const noPhase = Math.abs(phase) < 1e-9; parities.push(noPhase ? (isSine ? "odd" : "even") : "none");
    cosineLines.push(`${label}:\\quad\\omega_1=${m}\\,\\omega_0,\\qquad\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}\\cos(m\\omega_0t)\\cos(k\\omega_0t)\\,dt=\\delta_{mk}`);
    const a = isSine ? coefficient * Math.sin(phase) : coefficient * Math.cos(phase); const b = isSine ? coefficient * Math.cos(phase) : -coefficient * Math.sin(phase);
    cosineLines.push(`a_{${m}}=${format(a)}`); sineLines.push(`${label}:\\quad\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}\\sin(m\\omega_0t)\\sin(k\\omega_0t)\\,dt=\\delta_{mk}\\ \\Rightarrow\\ b_{${m}}=${format(b)}${isSine && noPhase ? "\\ \\text{(odd signal: only sine terms)}" : ""}`);
    if (Math.abs(a) > 1e-9) aParts.push(`${format(a)}\\,\\delta_{k,${m}}`); if (Math.abs(b) > 1e-9) bParts.push(`${format(b)}\\,\\delta_{k,${m}}`);
  });

  const allEven = parities.length > 0 && parities.every((parity) => parity === "even"); const allOdd = parities.length > 0 && parities.every((parity) => parity === "odd");
  const symmetry = allEven ? ["x(-t)=x(t)\\ \\Rightarrow\\ b_k=0\\quad\\forall k\\ge1"] : allOdd ? ["x(-t)=-x(t)\\ \\Rightarrow\\ a_0=a_k=0,\\quad b_k=\\frac{4}{T_0}\\int_{0}^{T_0/2}x(t)\\sin(k\\omega_0t)\\,dt"] : ["x(-t)\\ne\\pm x(t)\\ \\Rightarrow\\ \\text{both }a_k\\text{ and }b_k\\text{ are evaluated}"];
  const join = (parts: string[]) => (parts.length ? parts.join("\\ +\\ ") : "0");
  return [
    { title: "Step 1 — DC Term a₀", lines: ["a_0=\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}x(t)\\,dt", periodLine(safePeriod, omega0), ...dcLines, `a_0=${format(2 * dc)}=2c_0`] },
    { title: "Step 2 — Cosine Coefficients aₖ", lines: ["a_k=\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}x(t)\\cos(k\\omega_0t)\\,dt", ...(cosineLines.length ? cosineLines : ["\\text{Every term is constant: }a_k=0\\ (k\\ge1)."])] },
    { title: "Step 3 — Sine Coefficients bₖ & Symmetry Rule", lines: ["b_k=\\frac{2}{T_0}\\int_{\\langle T_0\\rangle}x(t)\\sin(k\\omega_0t)\\,dt", ...symmetry, ...sineLines] },
    { title: "Step 4 — Final Compact Form", lines: [`a_k=${join(aParts)}${hasUnsupported ? "\\ +\\ \\text{(numeric remainder)}" : ""},\\qquad b_k=${allEven ? "0" : join(bParts)},\\qquad a_0=${format(2 * dc)}`, "c_k=\\frac{a_k-j\\,b_k}{2},\\qquad c_{-k}=\\frac{a_k+j\\,b_k}{2}"] },
  ];
}
