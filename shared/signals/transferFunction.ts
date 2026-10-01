/**
 * MAE Academy / Signals & Systems — transfer-function data model and plot-support math.
 * The structures the studios hold (complex numbers, polynomials, poles/zeros, ROC), their formatting, the
 * pointwise evaluation used to draw Bode curves and the |H| surface, and root dragging. Symbolic work
 * (parsing, root finding, inverse/forward transforms, derivations) lives on the server.
 */
import type { DerivationSymbols } from "./derivationTypes";

export type PlaneMode = "s" | "z";
export type RocKind = "right" | "left" | "two-sided";
export type Complex = { re: number; im: number };
export type Polynomial = number[];
export type TransferFunction = { mode: PlaneMode; numerator: Polynomial; denominator: Polynomial; zeros: Complex[]; poles: Complex[]; source: string };
export type RocResult = { kind: RocKind; boundary: number; innerBoundary?: number; stable: boolean; description: string; latex: string };
export type FrequencyPoint = { omega: number; magnitude: number; phase: number; re: number; im: number };
export type Landscape = { x: number[]; y: number[]; z: number[][]; path: { x: number[]; y: number[]; z: number[] } };
export const EPSILON = 1e-8;
export const c = (re = 0, im = 0): Complex => ({ re, im });
export const add = (left: Complex, right: Complex) => c(left.re + right.re, left.im + right.im);
export const sub = (left: Complex, right: Complex) => c(left.re - right.re, left.im - right.im);
export const mul = (left: Complex, right: Complex) => c(left.re * right.re - left.im * right.im, left.re * right.im + left.im * right.re);
export const div = (left: Complex, right: Complex) => { const square = right.re * right.re + right.im * right.im; return square < EPSILON ? c(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY) : c((left.re * right.re + left.im * right.im) / square, (left.im * right.re - left.re * right.im) / square); };
export const abs = (value: Complex) => Math.hypot(value.re, value.im);
export const clean = (value: number, digits = 5) => Math.abs(value) < EPSILON ? 0 : Number(value.toFixed(digits));
export function polynomialValue(coefficients: Polynomial, value: Complex): Complex { return coefficients.reduce((sum, coefficient) => add(mul(sum, value), c(coefficient)), c()); }
export function polynomialFromRoots(roots: Complex[]) { const coefficients: Complex[] = roots.reduce<Complex[]>((current, root) => { const next = Array.from({ length: current.length + 1 }, () => c()); current.forEach((coefficient, index) => { next[index] = add(next[index], coefficient); next[index + 1] = add(next[index + 1], mul(coefficient, c(-root.re, -root.im))); }); return next; }, [c(1)]); return coefficients.map((value) => { if (Math.abs(value.im) > 2e-4) throw new Error("Drag complex roots in conjugate pairs to retain a real-coefficient transfer function."); return clean(value.re); }); }
export function formatPolynomial(coefficients: Polynomial, variable: PlaneMode) { const degree = coefficients.length - 1; const terms = coefficients.flatMap((coefficient, index) => { const exponent = degree - index; if (Math.abs(coefficient) < EPSILON) return []; const magnitude = Math.abs(clean(coefficient)); const sign = coefficient < 0 ? "-" : "+"; const coefficientText = exponent > 0 && Math.abs(magnitude - 1) < EPSILON ? "" : String(magnitude); const variableText = exponent === 0 ? "" : exponent === 1 ? variable : `${variable}^{${exponent}}`; return [{ sign, text: `${coefficientText}${variableText}` || "1" }]; }); if (!terms.length) return "0"; return terms.map((term, index) => `${index === 0 ? (term.sign === "-" ? "-" : "") : ` ${term.sign} `}${term.text}`).join(""); }
export function formatTransferLatex(functionData: TransferFunction) { const numerator = formatPolynomial(functionData.numerator, functionData.mode); const denominator = formatPolynomial(functionData.denominator, functionData.mode); return `H(${functionData.mode})=\\frac{${numerator}}{${denominator}}`; }
export function complexLatex(value: Complex) { const re = clean(value.re, 4); const im = clean(value.im, 4); if (Math.abs(im) < EPSILON) return String(re); if (Math.abs(re) < EPSILON) return `${im === 1 ? "" : im === -1 ? "-" : im}j`; return `${re} ${im < 0 ? "-" : "+"} j${Math.abs(im)}`; }

export function moveRootWithConjugate(roots: Complex[], index: number, next: Complex) { const updated = roots.map((root) => ({ ...root })); updated[index] = c(clean(next.re, 4), Math.abs(next.im) < 0.08 ? 0 : clean(next.im, 4)); const original = roots[index]; if (Math.abs(original.im) > 0.08) { const partner = roots.findIndex((root, candidate) => candidate !== index && Math.abs(root.re - original.re) < 0.03 && Math.abs(root.im + original.im) < 0.08); if (partner >= 0) updated[partner] = c(updated[index].re, -updated[index].im); } return updated; }
export function withMovedRoot(functionData: TransferFunction, family: "poles" | "zeros", index: number, next: Complex): TransferFunction { const roots = moveRootWithConjugate(functionData[family], index, next); const coefficients = polynomialFromRoots(roots); const updated = family === "poles" ? { ...functionData, denominator: coefficients, poles: roots } : { ...functionData, numerator: coefficients, zeros: roots }; return { ...updated, source: formatTransferLatex(updated) }; }

export function evaluateTransfer(functionData: TransferFunction, point: Complex) { return div(polynomialValue(functionData.numerator, point), polynomialValue(functionData.denominator, point)); }
export function derivativeValue(coefficients: Polynomial, point: Complex) { const degree = coefficients.length - 1; return coefficients.slice(0, -1).reduce((sum, coefficient, index) => add(mul(sum, point), c(coefficient * (degree - index))), c()); }
export function complexExponential(value: Complex, time: number) { const amplitude = Math.exp(value.re * time); return c(amplitude * Math.cos(value.im * time), amplitude * Math.sin(value.im * time)); }

/** Inverse Laplace modal reconstruction for strictly proper, simple-pole H(s). */
export function impulseResponse(functionData: TransferFunction, duration = 6, samples = 260) {
  if (functionData.mode !== "s" || functionData.numerator.length >= functionData.denominator.length) return [];
  const residues = functionData.poles.map((pole) => div(polynomialValue(functionData.numerator, pole), derivativeValue(functionData.denominator, pole)));
  if (residues.some((residue) => !Number.isFinite(residue.re) || !Number.isFinite(residue.im))) return [];
  return Array.from({ length: samples + 1 }, (_, index) => { const time = duration * index / samples; const value = residues.reduce((sum, residue, poleIndex) => add(sum, mul(residue, complexExponential(functionData.poles[poleIndex], time))), c()); return { time, value: clean(value.re, 8) }; });
}
export function rocFor(functionData: TransferFunction, kind: RocKind): RocResult { const values = functionData.mode === "s" ? functionData.poles.map((pole) => pole.re) : functionData.poles.map(abs); const outer = values.length ? Math.max(...values) : 0; const inner = values.length ? Math.min(...values) : 0; const stable = functionData.mode === "s" ? kind === "right" ? 0 > outer : kind === "left" ? 0 < inner : 0 > inner && 0 < outer : kind === "right" ? 1 > outer : kind === "left" ? 1 < inner : 1 > inner && 1 < outer; const variable = functionData.mode === "s" ? "\\Re\\{s\\}" : "|z|"; const slice = functionData.mode === "s" ? "j\\omega" : "|z|=1"; const boundary = clean(outer, 4); const innerBoundary = clean(inner, 4); const latex = kind === "right" ? `\\mathrm{ROC}: ${variable}>${boundary}` : kind === "left" ? `\\mathrm{ROC}: ${variable}<${innerBoundary}` : `\\mathrm{ROC}: ${innerBoundary}<${variable}<${boundary}`; return { kind, boundary, innerBoundary: kind === "two-sided" ? innerBoundary : undefined, stable, latex, description: stable ? `The ROC includes ${slice}; the system is BIBO stable.` : `The ROC excludes ${slice}; the system is BIBO unstable.` }; }
export function frequencyResponse(functionData: TransferFunction, points = 260, spanOverride?: number): FrequencyPoint[] { const span = spanOverride ?? (functionData.mode === "s" ? 14 : Math.PI); return Array.from({ length: points + 1 }, (_, index) => { const omega = -span + (2 * span * index) / points; const point = functionData.mode === "s" ? c(0, omega) : c(Math.cos(omega), Math.sin(omega)); const response = evaluateTransfer(functionData, point); const magnitude = Math.min(abs(response), 1e4); return { omega, magnitude, phase: magnitude < EPSILON ? 0 : Math.atan2(response.im, response.re), re: response.re, im: response.im }; }); }
export function magnitudeLandscape(functionData: TransferFunction, resolution = 42, span = 4, ceiling = 14): Landscape { const x = Array.from({ length: resolution }, (_, index) => -span + (2 * span * index) / (resolution - 1)); const y = Array.from({ length: resolution }, (_, index) => -span + (2 * span * index) / (resolution - 1)); const z = y.map((imaginary) => x.map((real) => Math.min(ceiling, abs(evaluateTransfer(functionData, c(real, imaginary)))))); const slice = frequencyResponse(functionData, 150); return { x, y, z, path: { x: slice.map((item) => functionData.mode === "s" ? 0 : Math.cos(item.omega)), y: slice.map((item) => functionData.mode === "s" ? item.omega : Math.sin(item.omega)), z: slice.map((item) => Math.min(ceiling, item.magnitude)) } }; }

export type Causality = "causal" | "anti-causal" | "non-causal";
/** A_{k,order} / (s − p)^{order}; `causal` selects e^{pt}u(t) vs −e^{pt}u(−t). */
export type PfeTerm = { pole: Complex; multiplicity: number; order: number; residue: Complex; causal: boolean };
export type InverseLaplaceResult = {
  /** Polynomial-quotient coefficients, ascending: q₀δ(t) + q₁δ′(t) + … */
  direct: number[];
  terms: PfeTerm[];
  properness: "strict" | "proper" | "improper";
  causality: Causality;
  pfeLatex: string;
  timeLatex: string;
  warnings: string[];
};

export type InverseLaplaceOptions = {
  /** Two-sided only: fixes the strip at Re(s) = stripAt (0 ⇒ the Fourier inverse, ROC ∋ jω axis). */
  stripAt?: number;
};

export type LaplacePair = { timeLatex: string; sLatex: string };
export type ForwardLaplaceResult =
  | { ok: true; system: TransferFunction; transformLatex: string; pairs: LaplacePair[]; notes: string[] }
  | { ok: false; error: string };