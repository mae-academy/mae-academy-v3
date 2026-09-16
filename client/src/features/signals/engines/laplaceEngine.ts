/**
 * MAE Academy / Signals & Systems — Tab E pure transfer-function mathematics.
 * Parsing, complex arithmetic, roots, ROC, stability, slices, and landscapes are
 * deliberately decoupled from React, Canvas, Plotly, and DOM event lifecycles.
 */
export type PlaneMode = "s" | "z";
export type RocKind = "right" | "left" | "two-sided";
export type Complex = { re: number; im: number };
export type Polynomial = number[];
export type TransferFunction = { mode: PlaneMode; numerator: Polynomial; denominator: Polynomial; zeros: Complex[]; poles: Complex[]; source: string };
export type RocResult = { kind: RocKind; boundary: number; innerBoundary?: number; stable: boolean; description: string; latex: string };
export type FrequencyPoint = { omega: number; magnitude: number; phase: number; re: number; im: number };
export type Landscape = { x: number[]; y: number[]; z: number[][]; path: { x: number[]; y: number[]; z: number[] } };
const EPSILON = 1e-8;
const c = (re = 0, im = 0): Complex => ({ re, im });
const add = (left: Complex, right: Complex) => c(left.re + right.re, left.im + right.im);
const sub = (left: Complex, right: Complex) => c(left.re - right.re, left.im - right.im);
const mul = (left: Complex, right: Complex) => c(left.re * right.re - left.im * right.im, left.re * right.im + left.im * right.re);
const div = (left: Complex, right: Complex) => { const square = right.re * right.re + right.im * right.im; return square < EPSILON ? c(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY) : c((left.re * right.re + left.im * right.im) / square, (left.im * right.re - left.re * right.im) / square); };
const abs = (value: Complex) => Math.hypot(value.re, value.im);
const clean = (value: number, digits = 5) => Math.abs(value) < EPSILON ? 0 : Number(value.toFixed(digits));
const normalized = (source: string) => source.replaceAll("\\left", "").replaceAll("\\right", "").replaceAll("\\cdot", "*").replaceAll("\\,", "").replaceAll(" ", "").replaceAll("{", "(").replaceAll("}", ")").replaceAll("^(", "^").replaceAll("−", "-");

function group(source: string, start: number) { if (source[start] !== "{") return null; let depth = 0; for (let index = start; index < source.length; index += 1) { if (source[index] === "{") depth += 1; if (source[index] === "}" && --depth === 0) return { content: source.slice(start + 1, index), end: index + 1 }; } return null; }
function expandFraction(source: string): string { const at = source.indexOf("\\frac"); if (at < 0) return source; const numerator = group(source, at + 5); const denominator = numerator ? group(source, numerator.end) : null; if (!numerator || !denominator) return source; return `${source.slice(0, at)}(${expandFraction(numerator.content)})/(${expandFraction(denominator.content)})${source.slice(denominator.end)}`; }
function stripOuter(source: string) { let value = source; while (value.startsWith("(") && value.endsWith(")")) { let depth = 0; let wraps = true; for (let index = 0; index < value.length - 1; index += 1) { if (value[index] === "(") depth += 1; if (value[index] === ")") depth -= 1; if (depth === 0) { wraps = false; break; } } if (!wraps) return value; value = value.slice(1, -1); } return value; }
function splitTerms(source: string) { const terms: string[] = []; let depth = 0; let current = ""; for (let index = 0; index < source.length; index += 1) { const character = source[index]; if (character === "(") depth += 1; if (character === ")") depth -= 1; if (depth === 0 && index > 0 && (character === "+" || character === "-")) { terms.push(current); current = character; } else current += character; } if (current) terms.push(current); return terms; }

export function parsePolynomial(source: string, variable: "s" | "z"): Polynomial {
  const expression = stripOuter(source.replaceAll("*", "")); if (!expression) return [0]; const coefficients = new Map<number, number>();
  splitTerms(expression).forEach((raw) => { const term = stripOuter(raw); if (!term) return; const marker = term.indexOf(variable); let power = 0; let coefficient = 0;
    if (marker >= 0) { const rawCoefficient = term.slice(0, marker); coefficient = rawCoefficient === "" || rawCoefficient === "+" ? 1 : rawCoefficient === "-" ? -1 : Number(rawCoefficient); const powerPart = term.slice(marker + 1); power = powerPart.startsWith("^") ? Number(powerPart.slice(1)) : 1; }
    else { coefficient = Number(term); power = 0; }
    if (!Number.isFinite(coefficient) || !Number.isInteger(power) || power < 0) throw new Error(`Unsupported polynomial term “${raw}”. Use a real-coefficient polynomial in ${variable}.`); coefficients.set(power, (coefficients.get(power) ?? 0) + coefficient);
  });
  const degree = Math.max(...Array.from(coefficients.keys())); return Array.from({ length: degree + 1 }, (_, index) => clean(coefficients.get(degree - index) ?? 0));
}

export function polynomialValue(coefficients: Polynomial, value: Complex): Complex { return coefficients.reduce((sum, coefficient) => add(mul(sum, value), c(coefficient)), c()); }
export function polynomialFromRoots(roots: Complex[]) { const coefficients: Complex[] = roots.reduce<Complex[]>((current, root) => { const next = Array.from({ length: current.length + 1 }, () => c()); current.forEach((coefficient, index) => { next[index] = add(next[index], coefficient); next[index + 1] = add(next[index + 1], mul(coefficient, c(-root.re, -root.im))); }); return next; }, [c(1)]); return coefficients.map((value) => { if (Math.abs(value.im) > 2e-4) throw new Error("Drag complex roots in conjugate pairs to retain a real-coefficient transfer function."); return clean(value.re); }); }

/** Durand–Kerner root finder for real-coefficient polynomials of arbitrary degree. */
export function polynomialRoots(coefficients: Polynomial): Complex[] { const first = coefficients.findIndex((value) => Math.abs(value) > EPSILON); const trimmed = first < 0 ? [0] : coefficients.slice(first); const degree = trimmed.length - 1; if (degree <= 0) return []; const normalizedCoefficients = trimmed.map((value) => value / trimmed[0]); const radius = 1 + Math.max(...normalizedCoefficients.slice(1).map(Math.abs)); let roots = Array.from({ length: degree }, (_, index) => { const angle = 2 * Math.PI * index / degree + 0.31; return c(radius * Math.cos(angle), radius * Math.sin(angle)); });
  for (let iteration = 0; iteration < 180; iteration += 1) { let change = 0; const next = roots.map((root, index) => { let denominator = c(1); roots.forEach((other, otherIndex) => { if (index !== otherIndex) denominator = mul(denominator, sub(root, other)); }); const update = div(polynomialValue(normalizedCoefficients, root), denominator); const candidate = sub(root, update); change = Math.max(change, abs(update)); return candidate; }); roots = next; if (change < 1e-10) break; }
  return roots.map((root) => c(clean(root.re, 7), clean(root.im, 7))).sort((left, right) => left.re - right.re || left.im - right.im);
}

export function parseTransferFunction(source: string, mode: PlaneMode): TransferFunction {
  const variable = mode; const expanded = expandFraction(source).replace(/(?:\\operatorname\{H\}|H)\s*\([sz]\)/g, "").replaceAll("=", ""); const compact = normalized(expanded); const slash = compact.indexOf("/"); const numeratorSource = slash >= 0 ? compact.slice(0, slash) : compact; const denominatorSource = slash >= 0 ? compact.slice(slash + 1) : "1"; const numerator = parsePolynomial(numeratorSource || "1", variable); const denominator = parsePolynomial(denominatorSource || "1", variable); if (denominator.every((coefficient) => Math.abs(coefficient) < EPSILON)) throw new Error("The denominator cannot be identically zero."); return { mode, numerator, denominator, zeros: polynomialRoots(numerator), poles: polynomialRoots(denominator), source };
}

export function formatPolynomial(coefficients: Polynomial, variable: PlaneMode) { const degree = coefficients.length - 1; const terms = coefficients.flatMap((coefficient, index) => { const exponent = degree - index; if (Math.abs(coefficient) < EPSILON) return []; const magnitude = Math.abs(clean(coefficient)); const sign = coefficient < 0 ? "-" : "+"; const coefficientText = exponent > 0 && Math.abs(magnitude - 1) < EPSILON ? "" : String(magnitude); const variableText = exponent === 0 ? "" : exponent === 1 ? variable : `${variable}^{${exponent}}`; return [{ sign, text: `${coefficientText}${variableText}` || "1" }]; }); if (!terms.length) return "0"; return terms.map((term, index) => `${index === 0 ? (term.sign === "-" ? "-" : "") : ` ${term.sign} `}${term.text}`).join(""); }
export function formatTransferLatex(functionData: TransferFunction) { const numerator = formatPolynomial(functionData.numerator, functionData.mode); const denominator = formatPolynomial(functionData.denominator, functionData.mode); return `H(${functionData.mode})=\\frac{${numerator}}{${denominator}}`; }
export function complexLatex(value: Complex) { const re = clean(value.re, 4); const im = clean(value.im, 4); if (Math.abs(im) < EPSILON) return String(re); if (Math.abs(re) < EPSILON) return `${im === 1 ? "" : im === -1 ? "-" : im}j`; return `${re} ${im < 0 ? "-" : "+"} j${Math.abs(im)}`; }

export function moveRootWithConjugate(roots: Complex[], index: number, next: Complex) { const updated = roots.map((root) => ({ ...root })); updated[index] = c(clean(next.re, 4), Math.abs(next.im) < 0.08 ? 0 : clean(next.im, 4)); const original = roots[index]; if (Math.abs(original.im) > 0.08) { const partner = roots.findIndex((root, candidate) => candidate !== index && Math.abs(root.re - original.re) < 0.03 && Math.abs(root.im + original.im) < 0.08); if (partner >= 0) updated[partner] = c(updated[index].re, -updated[index].im); } return updated; }
export function withMovedRoot(functionData: TransferFunction, family: "poles" | "zeros", index: number, next: Complex): TransferFunction { const roots = moveRootWithConjugate(functionData[family], index, next); const coefficients = polynomialFromRoots(roots); const updated = family === "poles" ? { ...functionData, denominator: coefficients, poles: roots } : { ...functionData, numerator: coefficients, zeros: roots }; return { ...updated, source: formatTransferLatex(updated) }; }

export function evaluateTransfer(functionData: TransferFunction, point: Complex) { return div(polynomialValue(functionData.numerator, point), polynomialValue(functionData.denominator, point)); }
function derivativeValue(coefficients: Polynomial, point: Complex) { const degree = coefficients.length - 1; return coefficients.slice(0, -1).reduce((sum, coefficient, index) => add(mul(sum, point), c(coefficient * (degree - index))), c()); }
function complexExponential(value: Complex, time: number) { const amplitude = Math.exp(value.re * time); return c(amplitude * Math.cos(value.im * time), amplitude * Math.sin(value.im * time)); }

/** Inverse Laplace modal reconstruction for strictly proper, simple-pole H(s). */
export function impulseResponse(functionData: TransferFunction, duration = 6, samples = 260) {
  if (functionData.mode !== "s" || functionData.numerator.length >= functionData.denominator.length) return [];
  const residues = functionData.poles.map((pole) => div(polynomialValue(functionData.numerator, pole), derivativeValue(functionData.denominator, pole)));
  if (residues.some((residue) => !Number.isFinite(residue.re) || !Number.isFinite(residue.im))) return [];
  return Array.from({ length: samples + 1 }, (_, index) => { const time = duration * index / samples; const value = residues.reduce((sum, residue, poleIndex) => add(sum, mul(residue, complexExponential(functionData.poles[poleIndex], time))), c()); return { time, value: clean(value.re, 8) }; });
}
export function rocFor(functionData: TransferFunction, kind: RocKind): RocResult { const values = functionData.mode === "s" ? functionData.poles.map((pole) => pole.re) : functionData.poles.map(abs); const outer = values.length ? Math.max(...values) : 0; const inner = values.length ? Math.min(...values) : 0; const stable = functionData.mode === "s" ? kind === "right" ? 0 > outer : kind === "left" ? 0 < inner : 0 > inner && 0 < outer : kind === "right" ? 1 > outer : kind === "left" ? 1 < inner : 1 > inner && 1 < outer; const variable = functionData.mode === "s" ? "\\Re\\{s\\}" : "|z|"; const slice = functionData.mode === "s" ? "j\\omega" : "|z|=1"; const boundary = clean(outer, 4); const innerBoundary = clean(inner, 4); const latex = kind === "right" ? `\\mathrm{ROC}: ${variable}>${boundary}` : kind === "left" ? `\\mathrm{ROC}: ${variable}<${innerBoundary}` : `\\mathrm{ROC}: ${innerBoundary}<${variable}<${boundary}`; return { kind, boundary, innerBoundary: kind === "two-sided" ? innerBoundary : undefined, stable, latex, description: stable ? `The ROC includes ${slice}; the system is BIBO stable.` : `The ROC excludes ${slice}; the system is BIBO unstable.` }; }
export function frequencyResponse(functionData: TransferFunction, points = 260): FrequencyPoint[] { const span = functionData.mode === "s" ? 14 : Math.PI; return Array.from({ length: points + 1 }, (_, index) => { const omega = -span + (2 * span * index) / points; const point = functionData.mode === "s" ? c(0, omega) : c(Math.cos(omega), Math.sin(omega)); const response = evaluateTransfer(functionData, point); const magnitude = Math.min(abs(response), 1e4); return { omega, magnitude, phase: magnitude < EPSILON ? 0 : Math.atan2(response.im, response.re), re: response.re, im: response.im }; }); }
export function magnitudeLandscape(functionData: TransferFunction, resolution = 42, span = 4, ceiling = 14): Landscape { const x = Array.from({ length: resolution }, (_, index) => -span + (2 * span * index) / (resolution - 1)); const y = Array.from({ length: resolution }, (_, index) => -span + (2 * span * index) / (resolution - 1)); const z = y.map((imaginary) => x.map((real) => Math.min(ceiling, abs(evaluateTransfer(functionData, c(real, imaginary)))))); const slice = frequencyResponse(functionData, 150); return { x, y, z, path: { x: slice.map((item) => functionData.mode === "s" ? 0 : Math.cos(item.omega)), y: slice.map((item) => functionData.mode === "s" ? item.omega : Math.sin(item.omega)), z: slice.map((item) => Math.min(ceiling, item.magnitude)) } }; }
