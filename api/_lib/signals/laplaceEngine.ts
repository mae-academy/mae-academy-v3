/**
 * MAE Academy / Signals & Systems — Tab E pure transfer-function mathematics.
 * Parsing, complex arithmetic, roots, ROC, stability, slices, and landscapes are
 * deliberately decoupled from React, Canvas, Plotly, and DOM event lifecycles.
 */
import { containsVariable, type MathNode } from "../../../shared/signals/mathExpression";
import {
  Causality,
  Complex,
  EPSILON,
  ForwardLaplaceResult,
  InverseLaplaceOptions,
  InverseLaplaceResult,
  LaplacePair,
  PfeTerm,
  PlaneMode,
  Polynomial,
  RocKind,
  TransferFunction,
  abs,
  add,
  c,
  clean,
  complexLatex,
  div,
  formatPolynomial,
  formatTransferLatex,
  mul,
  polynomialValue,
  rocFor,
  sub,
} from "../../../shared/signals/transferFunction";
import type { DerivationStep, DerivationSymbols } from "../../../shared/signals/derivationTypes";


function group(source: string, start: number) { if (source[start] !== "{") return null; let depth = 0; for (let index = start; index < source.length; index += 1) { if (source[index] === "{") depth += 1; if (source[index] === "}" && --depth === 0) return { content: source.slice(start + 1, index), end: index + 1 }; } return null; }
export function expandFraction(source: string): string { const at = source.indexOf("\\frac"); if (at < 0) return source; const numerator = group(source, at + 5); const denominator = numerator ? group(source, numerator.end) : null; if (!numerator || !denominator) return source; return `${source.slice(0, at)}(${expandFraction(numerator.content)})/(${expandFraction(denominator.content)})${expandFraction(source.slice(denominator.end))}`; }
/* ─────────────── Rational-expression parser: products, integer powers, nested fractions ─────────────── */

/** Ascending-order real polynomial (index = power) used only while parsing. */
type AscendingPoly = number[];
type Rational = { num: AscendingPoly; den: AscendingPoly };
type RationalToken = { kind: "number"; value: number } | { kind: "variable" } | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" | "(" | ")" };

const trimPoly = (poly: AscendingPoly): AscendingPoly => { const out = poly.slice(); while (out.length > 1 && Math.abs(out[out.length - 1]) < 1e-12) out.pop(); return out; };
const polyAdd = (left: AscendingPoly, right: AscendingPoly) => trimPoly(Array.from({ length: Math.max(left.length, right.length) }, (_, index) => (left[index] ?? 0) + (right[index] ?? 0)));
const polyScale = (poly: AscendingPoly, factor: number) => trimPoly(poly.map((value) => value * factor));
const polyMul = (left: AscendingPoly, right: AscendingPoly) => { const out = new Array<number>(left.length + right.length - 1).fill(0); left.forEach((a, i) => right.forEach((b, j) => { out[i + j] += a * b; })); return trimPoly(out); };
const isConstant = (poly: AscendingPoly) => trimPoly(poly).length === 1;

const ratAdd = (left: Rational, right: Rational): Rational => ({ num: polyAdd(polyMul(left.num, right.den), polyMul(right.num, left.den)), den: polyMul(left.den, right.den) });
const ratNeg = (value: Rational): Rational => ({ num: polyScale(value.num, -1), den: value.den });
const ratMul = (left: Rational, right: Rational): Rational => ({ num: polyMul(left.num, right.num), den: polyMul(left.den, right.den) });
const ratDiv = (left: Rational, right: Rational): Rational => {
  if (trimPoly(right.num).every((value) => Math.abs(value) < 1e-12)) throw new Error("Division by zero in the transfer function.");
  return { num: polyMul(left.num, right.den), den: polyMul(left.den, right.num) };
};
const ratPow = (base: Rational, exponent: number): Rational => {
  let result: Rational = { num: [1], den: [1] };
  for (let index = 0; index < Math.abs(exponent); index += 1) result = ratMul(result, base);
  return exponent < 0 ? ratDiv({ num: [1], den: [1] }, result) : result;
};

function tokenizeRational(source: string, variable: PlaneMode): RationalToken[] {
  const tokens: RationalToken[] = [];
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (/[0-9.]/.test(char)) { const match = source.slice(index).match(/^\d*\.?\d+/); if (!match) throw new Error(`Invalid number near “${source.slice(index, index + 4)}”.`); tokens.push({ kind: "number", value: Number(match[0]) }); index += match[0].length; continue; }
    if (char === variable) { tokens.push({ kind: "variable" }); index += 1; continue; }
    if ("+-*/^()".includes(char)) { tokens.push({ kind: "op", value: char as Extract<RationalToken, { kind: "op" }>["value"] }); index += 1; continue; }
    throw new Error(`Unsupported symbol “${char}”. Use a real-coefficient rational function in ${variable}.`);
  }
  return tokens;
}

/** Recursive descent over + − × ÷ ^ with implicit products: (s+1)(s+3), 2s^2, (s+1)^{2}. */
function parseRational(source: string, variable: PlaneMode): Rational {
  const tokens = tokenizeRational(source, variable); let cursor = 0;
  const peek = () => tokens[cursor];
  const isOp = (value: string) => { const token = peek(); return token?.kind === "op" && token.value === value; };
  const expect = (value: string) => { if (!isOp(value)) throw new Error(`Expected “${value}” in the transfer function.`); cursor += 1; };
  const expression = (): Rational => { let left = term(); for (;;) { if (isOp("+")) { cursor += 1; left = ratAdd(left, term()); } else if (isOp("-")) { cursor += 1; left = ratAdd(left, ratNeg(term())); } else return left; } };
  const startsFactor = () => { const token = peek(); return token !== undefined && (token.kind !== "op" || token.value === "("); };
  const term = (): Rational => { let left = unary(); for (;;) { if (isOp("*")) { cursor += 1; left = ratMul(left, unary()); } else if (isOp("/")) { cursor += 1; left = ratDiv(left, unary()); } else if (startsFactor()) left = ratMul(left, unary()); else return left; } };
  const unary = (): Rational => { if (isOp("-")) { cursor += 1; return ratNeg(unary()); } if (isOp("+")) { cursor += 1; return unary(); } return power(); };
  const power = (): Rational => {
    const base = primary(); if (!isOp("^")) return base; cursor += 1;
    const exponent = isOp("-") ? (cursor += 1, ratNeg(primary())) : primary();
    if (!isConstant(exponent.num) || !isConstant(exponent.den)) throw new Error("Exponents must be constant integers.");
    const value = exponent.num[0] / exponent.den[0];
    if (!Number.isInteger(value)) throw new Error(`The exponent ${value} is not an integer; rational functions need integer powers.`);
    return ratPow(base, value);
  };
  const primary = (): Rational => {
    const token = peek(); if (!token) throw new Error("The transfer function ends unexpectedly.");
    cursor += 1;
    if (token.kind === "number") return { num: [token.value], den: [1] };
    if (token.kind === "variable") return { num: [0, 1], den: [1] };
    if (token.value === "(") { const inner = expression(); expect(")"); return inner; }
    throw new Error(`Unexpected “${token.value}” in the transfer function.`);
  };
  if (!tokens.length) return { num: [0], den: [1] };
  const result = expression();
  if (cursor < tokens.length) throw new Error("Trailing symbols remain after the transfer function.");
  return result;
}

const toDescending = (poly: AscendingPoly): Polynomial => trimPoly(poly).slice().reverse().map((value) => clean(value));
const rationalSource = (source: string) => source
  .replaceAll("\\left", "").replaceAll("\\right", "").replaceAll("\\cdot", "*").replaceAll("\\times", "*").replaceAll("\\div", "/")
  .replaceAll("\\,", "").replaceAll("\\!", "").replace(/\s+/g, "").replaceAll("{", "(").replaceAll("}", ")").replaceAll("−", "-").replaceAll("×", "*").replaceAll("÷", "/");

export function parsePolynomial(source: string, variable: "s" | "z"): Polynomial {
  const value = parseRational(rationalSource(source), variable);
  if (!isConstant(value.den)) throw new Error(`Expected a polynomial in ${variable}, not a rational function.`);
  return toDescending(polyScale(value.num, 1 / value.den[0]));
}


/** Durand–Kerner root finder for real-coefficient polynomials of arbitrary degree. */
export function polynomialRoots(coefficients: Polynomial): Complex[] { const first = coefficients.findIndex((value) => Math.abs(value) > EPSILON); const trimmed = first < 0 ? [0] : coefficients.slice(first); const degree = trimmed.length - 1; if (degree <= 0) return []; const normalizedCoefficients = trimmed.map((value) => value / trimmed[0]); const radius = 1 + Math.max(...normalizedCoefficients.slice(1).map(Math.abs)); let roots = Array.from({ length: degree }, (_, index) => { const angle = 2 * Math.PI * index / degree + 0.31; return c(radius * Math.cos(angle), radius * Math.sin(angle)); });
  for (let iteration = 0; iteration < 400; iteration += 1) { let change = 0; const next = roots.map((root, index) => { let denominator = c(1); roots.forEach((other, otherIndex) => { if (index !== otherIndex) denominator = mul(denominator, sub(root, other)); }); const value = polynomialValue(normalizedCoefficients, root); const square = denominator.re * denominator.re + denominator.im * denominator.im;
      // Repeated roots drive Π(rᵢ − rⱼ) → 0; a converged root is held in place instead of dividing by ~0 (NaN).
      if (abs(value) < 1e-15 || !(square > 0)) return root;
      const update = c((value.re * denominator.re + value.im * denominator.im) / square, (value.im * denominator.re - value.re * denominator.im) / square);
      if (!Number.isFinite(update.re) || !Number.isFinite(update.im)) return root;
      const candidate = sub(root, update); change = Math.max(change, abs(update)); return candidate; }); roots = next; if (change < 1e-10) break; }
  return roots.map((root) => c(clean(root.re, 7), clean(root.im, 7))).sort((left, right) => left.re - right.re || left.im - right.im);
}

export function parseTransferFunction(source: string, mode: PlaneMode): TransferFunction {
  const variable = mode;
  const body = expandFraction(source).replace(/(?:\\operatorname\{H\}|H)\s*(?:\\left)?\((?:\\right)?[sz](?:\\right)?\)/g, "").replaceAll("=", "");
  const value = parseRational(rationalSource(body), variable);
  const numerator = toDescending(value.num); const denominator = toDescending(value.den);
  if (denominator.every((coefficient) => Math.abs(coefficient) < EPSILON)) throw new Error("The denominator cannot be identically zero.");
  return { mode, numerator, denominator, zeros: polynomialRoots(numerator), poles: polynomialRoots(denominator), source };
}

/* ─────────────────────────── Inverse Laplace transform (PFE / Heaviside residues) ─────────────────────────── */

const conj = (value: Complex) => c(value.re, -value.im);
const scaleC = (value: Complex, factor: number) => c(value.re * factor, value.im * factor);
const factorial = (value: number) => { let result = 1; for (let index = 2; index <= value; index += 1) result *= index; return result; };
const fmt = (value: number) => { const rounded = Number(value.toFixed(4)); return Object.is(rounded, -0) ? "0" : String(rounded); };
/** Exact small fraction p/q (q ≤ 12) for a non-integer magnitude, e.g. 0.5 → {1, 2}; null keeps the decimal. */
function smallFraction(value: number): { p: number; q: number } | null {
  const magnitude = Math.abs(value);
  if (Math.abs(magnitude - Math.round(magnitude)) < 1e-9) return null;
  for (let q = 2; q <= 12; q += 1) { const p = Math.round(magnitude * q); if (p > 0 && Math.abs(magnitude - p / q) < 1e-7) return { p, q }; }
  return null;
}
/** Coefficient magnitude as KaTeX: \frac{1}{2} for exact small fractions, else a 4-digit decimal. */
const coefficientTex = (magnitude: number) => { const fraction = smallFraction(magnitude); return fraction ? `\\frac{${fraction.p}}{${fraction.q}}` : fmt(magnitude); };
const isZero = (value: number) => Math.abs(value) < 1e-7;

/** Long division N/D (descending), returning ascending quotient and descending remainder. */
function polynomialDivide(numerator: Polynomial, denominator: Polynomial): { quotient: number[]; remainder: Polynomial } {
  const remainder = numerator.slice(); const degree = denominator.length - 1; const quotient: number[] = [];
  while (remainder.length - 1 >= degree && remainder.length > 0) {
    const factor = remainder[0] / denominator[0]; quotient.unshift(factor);
    for (let index = 0; index <= degree; index += 1) remainder[index] -= factor * denominator[index];
    remainder.shift();
  }
  return { quotient, remainder: remainder.length ? remainder : [0] };
}

/** Taylor coefficients of r(p + x): [r(p), r′(p), r″(p)/2!, …] via repeated synthetic division. */
function taylorShift(coefficients: Polynomial, point: Complex): Complex[] {
  let current = coefficients.map((value) => c(value)); const out: Complex[] = [];
  while (current.length) {
    const next: Complex[] = []; let carry = c();
    current.forEach((value, index) => { carry = add(mul(carry, point), value); if (index < current.length - 1) next.push(carry); });
    out.push(carry); current = next;
  }
  return out;
}

/** Groups numerically repeated roots (Durand–Kerner spreads a multiple root slightly) into one pole. */
export function clusterPoles(poles: Complex[]): Array<{ pole: Complex; multiplicity: number }> {
  const groups: Array<{ members: Complex[] }> = [];
  poles.forEach((pole) => {
    const group = groups.find((candidate) => { const centre = candidate.members[0]; return abs(sub(centre, pole)) < 2e-3 * Math.max(1, abs(pole)); });
    if (group) group.members.push(pole); else groups.push({ members: [pole] });
  });
  return groups.map(({ members }) => {
    const mean = scaleC(members.reduce((sum, member) => add(sum, member), c()), 1 / members.length);
    return { pole: c(clean(mean.re, 6), Math.abs(mean.im) < 1e-6 ? 0 : clean(mean.im, 6)), multiplicity: members.length };
  });
}

function assignCausality(pole: Complex, kind: RocKind, lower: number, upper: number) {
  if (kind === "right") return true;
  if (kind === "left") return false;
  // Two-sided strip lower < Re(s) < upper: poles left of it are causal, poles right of it anti-causal.
  return pole.re < (lower + upper) / 2 || Math.abs(upper - lower) < EPSILON;
}

const expLatex = (rate: number) => (isZero(rate) ? "" : `e^{${isZero(rate - 1) ? "" : isZero(rate + 1) ? "-" : fmt(rate)}t}`);
const powerLatex = (power: number) => (power === 0 ? "" : power === 1 ? "t" : `t^{${power}}`);
const omegaLatex = (omega: number) => (isZero(omega - 1) ? "t" : `${fmt(omega)}t`);
const sMinus = (pole: Complex) => {
  let text = "s";
  if (!isZero(pole.re)) text += pole.re < 0 ? `+${fmt(-pole.re)}` : `-${fmt(pole.re)}`;
  if (!isZero(pole.im)) text += pole.im < 0 ? `+j${fmt(-pole.im)}` : `-j${fmt(pole.im)}`;
  return text;
};
const complexText = (value: Complex) => {
  if (isZero(value.im)) return fmt(value.re);
  const imaginary = `j${fmt(Math.abs(value.im))}`;
  if (isZero(value.re)) return `${value.im < 0 ? "-" : ""}${imaginary}`;
  return `${fmt(value.re)}${value.im < 0 ? "-" : "+"}${imaginary}`;
};

type Piece = { coefficient: number; body: string };
function joinPieces(pieces: Piece[]): string {
  return pieces.map((piece, index) => {
    const magnitude = Math.abs(piece.coefficient);
    const coefficientText = isZero(magnitude - 1) && piece.body ? "" : coefficientTex(magnitude);
    const sign = piece.coefficient < 0 ? "-" : index === 0 ? "" : "+";
    return `${sign}${coefficientText}${piece.body}`;
  }).join("");
}
function stepGroup(pieces: Piece[], step: string): string {
  if (!pieces.length) return "";
  if (pieces.length === 1 && !pieces[0].body && isZero(Math.abs(pieces[0].coefficient) - 1)) return `${pieces[0].coefficient < 0 ? "-" : ""}${step}`;
  return pieces.length === 1 ? `${joinPieces(pieces)}\\,${step}` : `\\left[${joinPieces(pieces)}\\right]${step}`;
}

/**
 * h(t) = 𝓛⁻¹{H(s)} under the selected ROC. Poles are grouped by multiplicity m; the Heaviside cover-up
 * residue of order k is A_k = [x^{m−k}] r(p+x)/Q(p+x), with Q the monic denominator stripped of (s−p)^m.
 * Conjugate pairs combine into e^{σt}[2Re(A)cos ωt − 2Im(A)sin ωt]; a proper/improper part becomes δ-terms.
 */
export function inverseLaplace(functionData: TransferFunction, rocKind: RocKind, options: InverseLaplaceOptions = {}): InverseLaplaceResult {
  const warnings: string[] = [];
  const first = functionData.denominator.findIndex((value) => Math.abs(value) > EPSILON);
  const denominator = functionData.denominator.slice(first).map((value) => value / functionData.denominator[first]);
  const numeratorStart = functionData.numerator.findIndex((value) => Math.abs(value) > EPSILON);
  const numerator = numeratorStart < 0 ? [0] : functionData.numerator.slice(numeratorStart).map((value) => value / functionData.denominator[first]);
  const numeratorDegree = numeratorStart < 0 ? -1 : numerator.length - 1; const denominatorDegree = denominator.length - 1;
  const properness = numeratorDegree < denominatorDegree ? "strict" : numeratorDegree === denominatorDegree ? "proper" : "improper";
  const { quotient, remainder } = numeratorDegree >= denominatorDegree ? polynomialDivide(numerator, denominator) : { quotient: [] as number[], remainder: numerator };
  const direct = quotient.map((value) => clean(value, 8));
  if (properness === "improper") warnings.push("Improper H(s): deg N(s) > deg D(s), so h(t) contains derivatives of the Dirac impulse.");

  const groups = clusterPoles(polynomialRoots(denominator));
  const reals = groups.map((group) => group.pole.re); const lower = reals.length ? Math.min(...reals) : 0; const upper = reals.length ? Math.max(...reals) : 0;
  const stripAt = rocKind === "two-sided" ? options.stripAt : undefined;
  if (stripAt !== undefined) {
    if (groups.some((group) => Math.abs(group.pole.re - stripAt) < 1e-6)) warnings.push("A pole lies on the jω axis, so X(jω) is not absolutely integrable; its term is shown as causal (the distributional impulse part is omitted).");
  } else if (rocKind === "two-sided") {
    if (Math.abs(upper - lower) < EPSILON) warnings.push("All poles share one real part, so no two-sided strip exists; terms are shown as causal.");
    else if (groups.some((group) => group.pole.re > lower + EPSILON && group.pole.re < upper - EPSILON)) warnings.push("Poles lie inside the selected strip; each is assigned to the nearer side of the strip midpoint.");
  }

  const remainderIsZero = remainder.every((value) => isZero(value));
  const terms: PfeTerm[] = [];
  if (!remainderIsZero) groups.forEach((group, index) => {
    // Q(p + x) = Π_{other poles q} (x + p − q)^{μ_q}, ascending in x.
    let q: Complex[] = [c(1)];
    groups.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      const offset = sub(group.pole, other.pole);
      for (let repeat = 0; repeat < other.multiplicity; repeat += 1) q = Array.from({ length: q.length + 1 }, (_, power) => add(mul(q[power] ?? c(), offset), q[power - 1] ?? c()));
    });
    const r = taylorShift(remainder, group.pole); const m = group.multiplicity; const series: Complex[] = [];
    for (let n = 0; n < m; n += 1) {
      let value = r[n] ?? c();
      for (let i = 1; i <= n; i += 1) value = sub(value, mul(q[i] ?? c(), series[n - i]));
      series.push(div(value, q[0]));
    }
    const causal = stripAt !== undefined ? group.pole.re < stripAt + 1e-6 : assignCausality(group.pole, rocKind, lower, upper);
    for (let order = m; order >= 1; order -= 1) {
      const residue = series[m - order];
      terms.push({ pole: group.pole, multiplicity: m, order, residue: c(clean(residue.re, 8), clean(residue.im, 8)), causal });
    }
  });
  terms.sort((left, right) => right.pole.re - left.pole.re || Math.abs(left.pole.im) - Math.abs(right.pole.im) || right.pole.im - left.pole.im || left.order - right.order);

  // ── H(s) partial-fraction LaTeX ──
  const pfeParts: string[] = [];
  direct.forEach((value, power) => { if (!isZero(value)) pfeParts.push(`${value < 0 ? "-" : "+"}${isZero(Math.abs(value) - 1) && power ? "" : fmt(Math.abs(value))}${power === 0 ? "" : power === 1 ? "s" : `s^{${power}}`}`); });
  terms.forEach((term) => {
    if (isZero(term.residue.re) && isZero(term.residue.im)) return;
    const denominatorText = term.order === 1 ? sMinus(term.pole) : `\\left(${sMinus(term.pole)}\\right)^{${term.order}}`;
    if (isZero(term.residue.im)) {
      // Exact fractional residues read as 1/(2(s+1)) rather than 0.5/(s+1).
      const fraction = smallFraction(term.residue.re); const factor = term.order === 1 ? `\\left(${sMinus(term.pole)}\\right)` : denominatorText;
      pfeParts.push(`${term.residue.re < 0 ? "-" : "+"}${fraction ? `\\frac{${fraction.p}}{${fraction.q}${factor}}` : `\\frac{${fmt(Math.abs(term.residue.re))}}{${denominatorText}}`}`);
    }
    else pfeParts.push(`+\\frac{${complexText(term.residue)}}{${denominatorText}}`);
  });
  const pfeBody = pfeParts.join("").replace(/^\+/, "") || "0";

  // ── h(t) LaTeX ──
  const impulses: Piece[] = direct.map((value, order) => ({ coefficient: value, body: order === 0 ? "\\delta(t)" : order <= 2 ? `\\delta${"'".repeat(order)}(t)` : `\\delta^{(${order})}(t)` })).filter((piece) => !isZero(piece.coefficient));
  const causalPieces: Piece[] = []; const antiPieces: Piece[] = [];
  terms.forEach((term) => {
    if (term.pole.im < -EPSILON) return; // folded into its conjugate partner
    const sign = term.causal ? 1 : -1; const target = term.causal ? causalPieces : antiPieces;
    const scale = sign / factorial(term.order - 1); const tPart = powerLatex(term.order - 1);
    if (isZero(term.pole.im)) {
      target.push({ coefficient: term.residue.re * scale, body: `${tPart}${expLatex(term.pole.re)}` });
      return;
    }
    const omega = term.pole.im; const envelope = `${tPart}${expLatex(term.pole.re)}`;
    target.push({ coefficient: 2 * term.residue.re * scale, body: `${envelope}\\cos(${omegaLatex(omega)})` });
    target.push({ coefficient: -2 * term.residue.im * scale, body: `${envelope}\\sin(${omegaLatex(omega)})` });
  });
  const nonZero = (pieces: Piece[]) => pieces.filter((piece) => !isZero(piece.coefficient));
  // Even pairs: A·e^{−at}u(t) + A·e^{at}u(−t) = A·e^{−a|t|} (simple real poles mirrored about σ = 0).
  const evenPieces: Piece[] = [];
  const causalLeft = nonZero(causalPieces); const antiLeft = nonZero(antiPieces);
  terms.forEach((term) => {
    if (!term.causal || term.order !== 1 || term.multiplicity !== 1 || !isZero(term.pole.im) || !(term.pole.re < -1e-9)) return;
    const body = expLatex(term.pole.re); const mirrorBody = expLatex(-term.pole.re);
    const causalIndex = causalLeft.findIndex((piece) => piece.body === body && isZero(piece.coefficient - term.residue.re));
    const antiIndex = antiLeft.findIndex((piece) => piece.body === mirrorBody && isZero(piece.coefficient - term.residue.re));
    if (causalIndex < 0 || antiIndex < 0) return;
    causalLeft.splice(causalIndex, 1); antiLeft.splice(antiIndex, 1);
    evenPieces.push({ coefficient: term.residue.re, body: `e^{${isZero(term.pole.re + 1) ? "-" : fmt(term.pole.re)}|t|}` });
  });
  const segments = [impulses.length ? joinPieces(impulses) : "", evenPieces.length ? joinPieces(evenPieces) : "", stepGroup(causalLeft, "u(t)"), stepGroup(antiLeft, "u(-t)")].filter(Boolean);
  const timeBody = segments.map((segment, index) => (index > 0 && !segment.startsWith("-") ? `+${segment}` : segment)).join("") || "0";

  const causality: Causality = rocKind === "right" ? "causal" : rocKind === "left" ? "anti-causal" : "non-causal";
  return { direct, terms, properness, causality, pfeLatex: `H(s)=${pfeBody}`, timeLatex: `h(t)=${timeBody}`, warnings };
}

/** Pointwise h(t) from the PFE terms (δ-terms excluded): Σ A·t^{k−1}/(k−1)!·e^{pt}·[u(t) or −u(−t)], real part. */
export function evaluateInverseLaplace(result: InverseLaplaceResult, time: number): number {
  return result.terms.reduce((total, term) => {
    const active = term.causal ? time >= 0 : time < 0; if (!active) return total;
    const envelope = Math.pow(time, term.order - 1) / factorial(term.order - 1) * Math.exp(term.pole.re * time);
    const value = envelope * (term.residue.re * Math.cos(term.pole.im * time) - term.residue.im * Math.sin(term.pole.im * time));
    return total + (term.causal ? value : -value);
  }, 0);
}


/* ─────────────────────────── Forward (unilateral) Laplace transform ─────────────────────────── */


/** One additive term of h(t) with its transform, for the term-by-term derivation list. */

class LaplaceTableError extends Error {}

const ratConst = (value: number): Rational => ({ num: [value], den: [1] });
const polyDerivative = (poly: AscendingPoly): AscendingPoly => (poly.length <= 1 ? [0] : trimPoly(poly.slice(1).map((value, index) => value * (index + 1))));
/** d/ds of N/D = (N′D − ND′)/D². */
const ratDerivative = (value: Rational): Rational => ({ num: polyAdd(polyMul(polyDerivative(value.num), value.den), polyScale(polyMul(value.num, polyDerivative(value.den)), -1)), den: polyMul(value.den, value.den) });
/** P(s − a): frequency shift e^{at}h(t) ↔ H(s − a). */
function polyShift(poly: AscendingPoly, a: number): AscendingPoly {
  let result: AscendingPoly = [0]; let power: AscendingPoly = [1];
  poly.forEach((coefficient) => { result = polyAdd(result, polyScale(power, coefficient)); power = polyMul(power, [-a, 1]); });
  return result;
}
const ratShift = (value: Rational, a: number): Rational => ({ num: polyShift(value.num, a), den: polyShift(value.den, a) });

/** Euclidean GCD with a relative tolerance, used to cancel common factors (e.g. 1/(s+1) + 1/(s+1)). */
function polyGcd(left: AscendingPoly, right: AscendingPoly): AscendingPoly {
  let a = trimPoly(left); let b = trimPoly(right);
  const scale = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
  while (!(b.length === 1 && Math.abs(b[0]) < 1e-9 * scale)) {
    const remainder = a.slice();
    while (remainder.length >= b.length && !(remainder.length === 1 && Math.abs(remainder[0]) < 1e-12)) {
      const factor = remainder[remainder.length - 1] / b[b.length - 1]; const shift = remainder.length - b.length;
      b.forEach((value, index) => { remainder[index + shift] -= factor * value; });
      remainder.pop();
      if (!remainder.length) { remainder.push(0); break; }
    }
    const cleaned = trimPoly(remainder.map((value) => (Math.abs(value) < 1e-9 * scale ? 0 : value)));
    a = b; b = cleaned;
  }
  return a;
}
function polyExactDivide(numerator: AscendingPoly, divisor: AscendingPoly): AscendingPoly {
  const remainder = numerator.slice(); const quotient = new Array<number>(Math.max(1, numerator.length - divisor.length + 1)).fill(0);
  for (let shift = numerator.length - divisor.length; shift >= 0; shift -= 1) {
    const factor = remainder[shift + divisor.length - 1] / divisor[divisor.length - 1]; quotient[shift] = factor;
    divisor.forEach((value, index) => { remainder[index + shift] -= factor * value; });
  }
  return trimPoly(quotient);
}
/** Cancels common factors and makes the denominator monic. */
function reduceRational(value: Rational): Rational {
  const gcd = polyGcd(value.num, value.den);
  const reduced = gcd.length > 1 ? { num: polyExactDivide(value.num, gcd), den: polyExactDivide(value.den, gcd) } : value;
  const lead = reduced.den[reduced.den.length - 1];
  return { num: polyScale(reduced.num, 1 / lead).map((coefficient) => clean(coefficient, 8)), den: polyScale(reduced.den, 1 / lead).map((coefficient) => clean(coefficient, 8)) };
}

const rationalLatex = (value: Rational, variable: PlaneMode = "s") => {
  const numerator = formatPolynomial(toDescending(value.num), variable); const denominator = formatPolynomial(toDescending(value.den), variable);
  return denominator === "1" ? numerator : `\\frac{${numerator}}{${denominator}}`;
};

type TermFactors = { coefficient: number; tPower: number; expRate: number; oscillator: { kind: "sin" | "cos"; omega: number } | null; step: boolean; deltaOrder: number | null };

/** Affine probe a·t + b of a numeric-only subtree (t is the sole variable). */
function affineOf(node: MathNode, evaluate: (node: MathNode, at: number) => number): { slope: number; intercept: number } {
  const at0 = evaluate(node, 0); const at1 = evaluate(node, 1); const at2 = evaluate(node, 2);
  if (![at0, at1, at2].every(Number.isFinite) || Math.abs(at2 - 2 * at1 + at0) > 1e-9) throw new LaplaceTableError("Arguments must be affine in t (for example e^{-3t} or \\sin(2t)).");
  return { slope: at1 - at0, intercept: at0 };
}

/**
 * 𝓛{h(t)} for sums of c·tⁿ·e^{at}·{1, sin ωt, cos ωt}·u(t) and c·δ⁽ⁿ⁾(t), built from the table pairs
 * 𝓛{u} = 1/s, 𝓛{sin ωt} = ω/(s²+ω²), 𝓛{cos ωt} = s/(s²+ω²), with the frequency shift e^{at} ↔ H(s−a)
 * and tⁿ ↔ (−1)ⁿ dⁿH/dsⁿ. Unilateral: terms without u(t) are read for t ≥ 0⁻.
 */
export function forwardLaplace(node: MathNode, evaluate: (node: MathNode, at: number) => number, toLatex: (node: MathNode) => string): ForwardLaplaceResult {
  const pairs: LaplacePair[] = []; const notes = new Set<string>();
  // Structural (not sampled) constancy: u(t−2) vanishes at any probe set near 0 yet is not the constant 0.
  const constantValue = (value: MathNode) => { if (containsVariable(value, "t")) return null; const result = evaluate(value, 0); return Number.isFinite(result) ? result : null; };

  const collect = (value: MathNode, factors: TermFactors) => {
    const constant = constantValue(value);
    if (constant !== null && value.kind !== "delta") { factors.coefficient *= constant; return; }
    switch (value.kind) {
      case "neg": factors.coefficient *= -1; collect(value.value, factors); return;
      case "mul": collect(value.left, factors); collect(value.right, factors); return;
      case "div": {
        const divisor = constantValue(value.right);
        if (divisor === null || Math.abs(divisor) < 1e-12) throw new LaplaceTableError("Only division by a nonzero constant is supported.");
        factors.coefficient /= divisor; collect(value.left, factors); return;
      }
      case "var": factors.tPower += 1; return;
      case "pow": {
        const exponent = constantValue(value.exponent);
        if (value.base.kind === "var" && exponent !== null && Number.isInteger(exponent) && exponent >= 0) { factors.tPower += exponent; return; }
        if (value.base.kind === "num" && Math.abs(value.base.value - Math.E) < 1e-12) { const form = affineOf(value.exponent, evaluate); factors.expRate += form.slope; factors.coefficient *= Math.exp(form.intercept); return; }
        throw new LaplaceTableError("Powers must be tⁿ with a non-negative integer n.");
      }
      case "delta": {
        const form = affineOf(value.argument, evaluate);
        if (Math.abs(form.intercept) > 1e-12 || Math.abs(Math.abs(form.slope) - 1) > 1e-12) throw new LaplaceTableError("Only δ(t) and its derivatives at t = 0 have rational transforms; δ(t − t₀) gives e^{−st₀}.");
        if (factors.deltaOrder !== null) throw new LaplaceTableError("A product of two impulses is not defined.");
        factors.deltaOrder = value.order; if (form.slope < 0 && value.order % 2 === 1) factors.coefficient *= -1; return;
      }
      case "call": {
        const form = affineOf(value.argument, evaluate);
        if (value.name === "exp") { factors.expRate += form.slope; factors.coefficient *= Math.exp(form.intercept); return; }
        if (value.name === "u" || value.name === "r") {
          if (Math.abs(form.intercept) > 1e-12 || form.slope <= 0) throw new LaplaceTableError(`Time-shifted or reflected steps such as ${value.name}(t − t₀) transform to e^{−st₀}, which is not rational.`);
          factors.step = true; if (value.name === "r") { factors.tPower += 1; factors.coefficient *= form.slope; }
          return;
        }
        if (value.name === "sin" || value.name === "cos") {
          if (factors.oscillator) throw new LaplaceTableError("Products of two sinusoids are outside the transform table; expand them into sums first.");
          if (Math.abs(form.intercept) > 1e-12) throw new LaplaceTableError("Phase-shifted sinusoids must be expanded (sin(ωt+φ) = sin φ cos ωt + cos φ sin ωt).");
          if (value.name === "sin" && form.slope < 0) factors.coefficient *= -1;
          factors.oscillator = { kind: value.name, omega: Math.abs(form.slope) }; return;
        }
        throw new LaplaceTableError(`${value.name}(t) has no rational Laplace transform in this studio.`);
      }
      case "runningIntegral": throw new LaplaceTableError("Resolve the ∫ wrapper first (Integrate Expression) before transforming.");
      default: throw new LaplaceTableError("This term is outside the Laplace transform table.");
    }
  };

  const flatten = (value: MathNode, sign: number, into: Array<{ sign: number; node: MathNode }>) => {
    if (value.kind === "add") { flatten(value.left, sign, into); flatten(value.right, sign, into); return into; }
    if (value.kind === "sub") { flatten(value.left, sign, into); flatten(value.right, -sign, into); return into; }
    if (value.kind === "neg") { flatten(value.value, -sign, into); return into; }
    into.push({ sign, node: value }); return into;
  };

  try {
    let total: Rational = ratConst(0);
    for (const term of flatten(node, 1, [])) {
      const factors: TermFactors = { coefficient: term.sign, tPower: 0, expRate: 0, oscillator: null, step: false, deltaOrder: null };
      collect(term.node, factors);
      if (Math.abs(factors.coefficient) < 1e-14) continue;
      let transform: Rational;
      if (factors.deltaOrder !== null) {
        if (factors.tPower || factors.oscillator || factors.step) throw new LaplaceTableError("Multiply δ(t) only by constants: f(t)δ(t) collapses to f(0)δ(t) first.");
        // Sifting: e^{at}δ(t) = δ(t); δ⁽ⁿ⁾ ↔ sⁿ.
        transform = { num: Array.from({ length: factors.deltaOrder + 1 }, (_, index) => (index === factors.deltaOrder ? 1 : 0)), den: [1] };
      } else {
        if (!factors.step) notes.add("Unilateral transform: terms without u(t) are taken for t ≥ 0⁻.");
        transform = factors.oscillator === null ? { num: [1], den: [0, 1] } : factors.oscillator.kind === "sin"
          ? { num: [factors.oscillator.omega], den: [factors.oscillator.omega ** 2, 0, 1] }
          : { num: [0, 1], den: [factors.oscillator.omega ** 2, 0, 1] };
        for (let order = 0; order < factors.tPower; order += 1) transform = ratNeg(ratDerivative(transform));
        if (Math.abs(factors.expRate) > 1e-12) transform = ratShift(transform, factors.expRate);
      }
      transform = reduceRational(ratMul(ratConst(factors.coefficient), transform));
      pairs.push({ timeLatex: `${term.sign < 0 ? "-" : ""}${toLatex(term.node)}`, sLatex: rationalLatex(transform) });
      total = ratAdd(total, transform);
    }
    const reduced = reduceRational(total);
    const numerator = toDescending(reduced.num); const denominator = toDescending(reduced.den);
    const system: TransferFunction = { mode: "s", numerator, denominator, zeros: polynomialRoots(numerator), poles: polynomialRoots(denominator), source: "" };
    system.source = formatTransferLatex(system);
    return { ok: true, system, transformLatex: `H(s)=${rationalLatex(reduced)}`, pairs, notes: Array.from(notes) };
  } catch (error) {
    if (error instanceof LaplaceTableError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : "The signal could not be transformed." };
  }
}

/* ─────────────────────────── Step-by-step Laplace derivations (forward bilateral + inverse PFE) ─────────────────────────── */

const DEFAULT_SYMBOLS: DerivationSymbols = { time: "x", freq: "X" };

/** s − r written as s, s+a or s−a. */
const shiftedS = (rate: number) => (isZero(rate) ? "s" : rate < 0 ? `s+${fmt(-rate)}` : `s-${fmt(rate)}`);
const leadCoefficient = (value: number) => (isZero(value - 1) ? "" : isZero(value + 1) ? "-" : fmt(value));
const polyReflect = (poly: AscendingPoly): AscendingPoly => poly.map((coefficient, power) => (power % 2 === 0 ? coefficient : -coefficient));

type LaplaceSide = "right" | "left";
type LaplaceHit =
  | { kind: "exp"; side: LaplaceSide; coefficient: number; tPower: number; rate: number; oscillator: { kind: "sin" | "cos"; omega: number } | null }
  | { kind: "pulse"; family: "rect" | "tri"; coefficient: number; t0: number; halfSpan: number }
  | { kind: "delta"; coefficient: number };

/** Classifies one additive term as c·tⁿ·e^{rt}·{1,sin,cos}·u(±t), a finite pulse, or c·δ(t); throws LaplaceTableError otherwise. */
function classifyLaplaceTerm(node: MathNode, evaluate: (node: MathNode, at: number) => number): LaplaceHit {
  const state = { coefficient: 1, tPower: 0, rate: 0, oscillator: null as { kind: "sin" | "cos"; omega: number } | null, side: null as LaplaceSide | null, pulse: null as { family: "rect" | "tri"; t0: number; halfSpan: number } | null, delta: false };
  const constantValue = (value: MathNode) => { if (containsVariable(value, "t")) return null; const result = evaluate(value, 0); return Number.isFinite(result) ? result : null; };
  const collect = (value: MathNode) => {
    const constant = constantValue(value);
    if (constant !== null && value.kind !== "delta") { state.coefficient *= constant; return; }
    switch (value.kind) {
      case "neg": state.coefficient *= -1; collect(value.value); return;
      case "mul": collect(value.left); collect(value.right); return;
      case "div": { const divisor = constantValue(value.right); if (divisor === null || Math.abs(divisor) < 1e-12) throw new LaplaceTableError("Only division by a nonzero constant is supported."); state.coefficient /= divisor; collect(value.left); return; }
      case "var": state.tPower += 1; return;
      case "pow": {
        const exponent = constantValue(value.exponent);
        if (value.base.kind === "var" && exponent !== null && Number.isInteger(exponent) && exponent >= 0) { state.tPower += exponent; return; }
        if (value.base.kind === "num" && Math.abs(value.base.value - Math.E) < 1e-12) { const form = affineOf(value.exponent, evaluate); state.rate += form.slope; state.coefficient *= Math.exp(form.intercept); return; }
        throw new LaplaceTableError("Powers must be tⁿ with a non-negative integer n.");
      }
      case "delta": {
        const form = affineOf(value.argument, evaluate);
        if (value.order !== 0 || Math.abs(form.intercept) > 1e-12 || Math.abs(Math.abs(form.slope) - 1) > 1e-12) throw new LaplaceTableError("Only δ(t) is derived step by step.");
        state.delta = true; return;
      }
      case "call": {
        const form = affineOf(value.argument, evaluate);
        if (value.name === "exp") { state.rate += form.slope; state.coefficient *= Math.exp(form.intercept); return; }
        if (value.name === "u") {
          if (Math.abs(form.intercept) > 1e-12 || Math.abs(form.slope) < 1e-12) throw new LaplaceTableError("Shifted steps are outside this table.");
          if (state.side) throw new LaplaceTableError("A product of two steps is outside this table.");
          state.side = form.slope > 0 ? "right" : "left"; return;
        }
        if (value.name === "rect" || value.name === "tri") {
          if (Math.abs(form.slope) < 1e-12 || state.pulse) throw new LaplaceTableError("Pulse arguments must be affine in t.");
          state.pulse = { family: value.name, t0: -form.intercept / form.slope, halfSpan: (value.name === "rect" ? 0.5 : 1) / Math.abs(form.slope) }; return;
        }
        if (value.name === "sin" || value.name === "cos") {
          if (state.oscillator) throw new LaplaceTableError("Products of two sinusoids are outside the transform table.");
          if (Math.abs(form.intercept) > 1e-12) throw new LaplaceTableError("Phase-shifted sinusoids must be expanded first.");
          if (value.name === "sin" && form.slope < 0) state.coefficient *= -1;
          state.oscillator = { kind: value.name, omega: Math.abs(form.slope) }; return;
        }
        throw new LaplaceTableError(`${value.name}(t) is outside the Laplace transform table.`);
      }
      default: throw new LaplaceTableError("This term is outside the Laplace transform table.");
    }
  };
  collect(node);
  if (state.delta) { if (state.tPower || state.oscillator || state.side || state.pulse) throw new LaplaceTableError("Multiply δ(t) only by constants."); return { kind: "delta", coefficient: state.coefficient }; }
  if (state.pulse) { if (state.tPower || state.oscillator || state.side || Math.abs(state.rate) > 1e-12) throw new LaplaceTableError("A pulse multiplied by other factors is outside this table."); return { kind: "pulse", coefficient: state.coefficient, ...state.pulse }; }
  return { kind: "exp", side: state.side ?? "right", coefficient: state.coefficient, tPower: state.tPower, rate: state.rate, oscillator: state.oscillator };
}

/** Rational transform of c·tⁿe^{rt}{1,sin,cos}: right-sided directly, left-sided through x(t) = g(−t) ⇒ X(s) = G(−s). */
function expTransform(hit: Extract<LaplaceHit, { kind: "exp" }>): Rational {
  const reflected = hit.side === "left";
  // c·tⁿe^{rt}u(−t) = g(−t) with g(t) = c(−1)ⁿ tⁿ e^{−rt}u(t) (and sin flips sign under t → −t).
  const rate = reflected ? -hit.rate : hit.rate;
  const oscillatorSign = reflected && hit.oscillator?.kind === "sin" ? -1 : 1;
  const coefficient = hit.coefficient * (reflected ? (-1) ** hit.tPower : 1) * oscillatorSign;
  let transform: Rational = hit.oscillator === null ? { num: [1], den: [0, 1] } : hit.oscillator.kind === "sin"
    ? { num: [hit.oscillator.omega], den: [hit.oscillator.omega ** 2, 0, 1] }
    : { num: [0, 1], den: [hit.oscillator.omega ** 2, 0, 1] };
  for (let order = 0; order < hit.tPower; order += 1) transform = ratNeg(ratDerivative(transform));
  if (Math.abs(rate) > 1e-12) transform = ratShift(transform, rate);
  transform = ratMul(ratConst(coefficient), transform);
  if (reflected) transform = { num: polyReflect(transform.num), den: polyReflect(transform.den) };
  return reduceRational(transform);
}

/**
 * Step-by-step bilateral X(s) = ∫x(t)e^{−st}dt with its ROC: definition, support splitting, antiderivative with
 * the convergence limit, ROC formalization, and the algebraic result. Covers c·tⁿe^{rt}{1,sin,cos}u(±t),
 * finite rect/tri pulses and δ(t); other terms are flagged and left out of the closed form.
 */
export function deriveForwardLaplaceSteps(node: MathNode, evaluate: (node: MathNode, at: number) => number, toLatex: (node: MathNode) => string, symbols: DerivationSymbols = DEFAULT_SYMBOLS): DerivationStep[] {
  const X = symbols.freq; const x = symbols.time;
  const support: string[] = []; const limits: string[] = []; const rocLines: string[] = []; const pieces: string[] = [];
  let total: Rational = ratConst(0); let rational = true; let unsupported = false; let lower = Number.NEGATIVE_INFINITY; let upper = Number.POSITIVE_INFINITY;

  const flatten = (value: MathNode, sign: number, into: Array<{ sign: number; node: MathNode }>) => {
    if (value.kind === "add") { flatten(value.left, sign, into); flatten(value.right, sign, into); return into; }
    if (value.kind === "sub") { flatten(value.left, sign, into); flatten(value.right, -sign, into); return into; }
    if (value.kind === "neg") { flatten(value.value, -sign, into); return into; }
    into.push({ sign, node: value }); return into;
  };

  const terms = flatten(node, 1, []); const multi = terms.length > 1; let allRight = true;
  terms.forEach(({ sign, node: termNode }, index) => {
    const sub = multi ? `_{${index + 1}}` : "";
    const label = `${sign < 0 ? "-" : ""}${toLatex(termNode)}`;
    let hit: LaplaceHit;
    try { hit = classifyLaplaceTerm(termNode, evaluate); }
    catch { unsupported = true; support.push(`${label}:\\quad\\text{outside the closed-form table; omitted from the result}`); return; }
    const coefficient = sign * hit.coefficient;

    if (hit.kind === "delta") {
      support.push(`${label}:\\quad ${X}${sub}(s)=\\int_{-\\infty}^{\\infty}${fmt(coefficient)}\\delta(t)e^{-st}dt`);
      limits.push(`\\int f(t)\\delta(t)\\,dt=f(0)\\ \\Rightarrow\\ ${X}${sub}(s)=${fmt(coefficient)}`);
      rocLines.push(`\\text{ROC}${sub}:\\ \\text{entire }s\\text{-plane (no convergence condition)}`);
      total = ratAdd(total, ratConst(coefficient)); pieces.push(fmt(coefficient)); return;
    }

    if (hit.kind === "pulse") {
      const { family, t0, halfSpan } = hit; const lo = t0 - halfSpan; const hi = t0 + halfSpan; const span = 2 * halfSpan;
      const weight = family === "tri" ? `\\left(1-\\frac{|t-${fmt(t0)}|}{${fmt(halfSpan)}}\\right)` : "";
      support.push(`${label}:\\quad \\operatorname{${family}}\\text{ is nonzero on }[${fmt(lo)},\\,${fmt(hi)}]\\ \\Rightarrow\\ ${X}${sub}(s)=\\int_{${fmt(lo)}}^{${fmt(hi)}}${leadCoefficient(coefficient)}${weight}e^{-st}dt`);
      limits.push(family === "rect"
        ? `${X}${sub}(s)=${leadCoefficient(coefficient)}\\left[\\frac{e^{-st}}{-s}\\right]_{${fmt(lo)}}^{${fmt(hi)}}=${leadCoefficient(coefficient)}\\frac{e^{${fmt(halfSpan)}s}-e^{-${fmt(halfSpan)}s}}{s}${isZero(t0) ? "" : `e^{-(${fmt(t0)})s}`}`
        : `\\int t\\,e^{-st}dt=\\frac{t\\,e^{-st}}{-s}-\\int\\frac{e^{-st}}{-s}dt\\quad(\\text{by parts on each ramp})`);
      const kernel = family === "rect" ? `${leadCoefficient(coefficient * span)}\\frac{\\sinh(${fmt(halfSpan)}s)}{${fmt(halfSpan)}s}` : `${leadCoefficient(coefficient * halfSpan)}\\left[\\frac{\\sinh(${fmt(halfSpan / 2)}s)}{${fmt(halfSpan / 2)}s}\\right]^{2}`;
      rocLines.push(`\\text{ROC}${sub}:\\ \\text{finite support}\\ \\Rightarrow\\ \\text{the integral converges for every }s\\ \\Rightarrow\\ \\text{entire }s\\text{-plane}`);
      const piece = `${kernel}${isZero(t0) ? "" : `e^{-(${fmt(t0)})s}`}`;
      rational = false; pieces.push(piece); return;
    }

    const { side, tPower, rate, oscillator } = hit; const right = side === "right"; const p = shiftedS(rate);
    const bounds = right ? "0}^{\\infty" : "-\\infty}^{0";
    const oscillation = oscillator ? `\\${oscillator.kind}(${fmt(oscillator.omega)}t)` : "";
    const power = tPower ? (tPower === 1 ? "t" : `t^{${tPower}}`) : "";
    const growth = isZero(rate) ? "" : `e^{${isZero(rate - 1) ? "" : isZero(rate + 1) ? "-" : fmt(rate)}t}`;
    support.push(`${label}:\\quad u(${right ? "" : "-"}t)\\ \\Rightarrow\\ ${X}${sub}(s)=\\int_{${bounds}}${leadCoefficient(coefficient)}${power}${growth}${oscillation}\\,e^{-st}dt`);
    if (!right && (tPower || oscillator)) limits.push(`${x}(t)=g(-t)\\ \\Rightarrow\\ ${X}(s)=G(-s)\\quad(\\text{transform the reflected right-sided signal, then } s\\to-s)`);
    if (oscillator) {
      const w = fmt(oscillator.omega);
      limits.push(oscillator.kind === "cos"
        ? `\\cos(${w}t)=\\tfrac12\\left(e^{j${w}t}+e^{-j${w}t}\\right)\\ \\Rightarrow\\ \\text{poles at }s=${fmt(rate)}\\pm j${w}`
        : `\\sin(${w}t)=\\tfrac{1}{2j}\\left(e^{j${w}t}-e^{-j${w}t}\\right)\\ \\Rightarrow\\ \\text{poles at }s=${fmt(rate)}\\pm j${w}`);
    }
    if (tPower) limits.push(`\\int_{0}^{\\infty}t^{${tPower}}e^{-pt}dt=\\frac{${tPower}!}{p^{${tPower + 1}}},\\quad p=${p}${oscillator ? `\\mp j${fmt(oscillator.omega)}` : ""}\\quad(\\operatorname{Re}\\{p\\}>0\\ \\Rightarrow\\ \\sigma${right ? ">" : "<"}${fmt(rate)})`);
    else {
      const pole = oscillator ? `${p}\\mp j${fmt(oscillator.omega)}` : p;
      limits.push(right
        ? `${X}${sub}(s)=${leadCoefficient(coefficient)}\\lim_{T\\to\\infty}\\left[\\frac{e^{-(${pole})t}}{-(${pole})}\\right]_{0}^{T}\\quad\\text{requires}\\quad\\operatorname{Re}\\{${p}\\}>0\\ \\Rightarrow\\ \\sigma>${fmt(rate)}`
        : `${X}${sub}(s)=${leadCoefficient(coefficient)}\\lim_{T\\to\\infty}\\left[\\frac{e^{-(${pole})t}}{-(${pole})}\\right]_{-T}^{0}\\quad\\text{requires}\\quad\\operatorname{Re}\\{${p}\\}<0\\ \\Rightarrow\\ \\sigma<${fmt(rate)}`);
    }
    rocLines.push(right ? `\\text{ROC}${sub}:\\ \\operatorname{Re}\\{s\\}>${fmt(rate)}\\quad(\\text{right-sided})` : `\\text{ROC}${sub}:\\ \\operatorname{Re}\\{s\\}<${fmt(rate)}\\quad(\\text{left-sided})`);
    if (right) lower = Math.max(lower, rate); else { upper = Math.min(upper, rate); allRight = false; }
    const transform = expTransform({ ...hit, coefficient });
    total = ratAdd(total, transform); pieces.push(rationalLatex(transform));
  });

  const reduced = reduceRational(total);
  const closed = rational ? (pieces.length ? rationalLatex(reduced) : "0") : pieces.map((piece, index) => (index > 0 && !piece.startsWith("-") ? `+${piece}` : piece)).join("");
  const rocFinal = lower < upper
    ? Number.isFinite(lower) && Number.isFinite(upper) ? `${fmt(lower)}<\\operatorname{Re}\\{s\\}<${fmt(upper)}` : Number.isFinite(lower) ? `\\operatorname{Re}\\{s\\}>${fmt(lower)}` : Number.isFinite(upper) ? `\\operatorname{Re}\\{s\\}<${fmt(upper)}` : "\\text{entire }s\\text{-plane}"
    : "\\varnothing\\ \\text{(the bilateral transform does not converge)}";
  return [
    { title: "Step 1 — Bilateral Laplace Definition", lines: [`${X}(s)=\\mathcal{L}\\{${x}(t)\\}=\\int_{-\\infty}^{\\infty}${x}(t)\\,e^{-st}\\,dt,\\qquad s=\\sigma+j\\omega`, ...(allRight && terms.length ? [`${x}(t)=0\\ (t<0)\\ \\Rightarrow\\ ${X}(s)=\\int_{0}^{\\infty}${x}(t)\\,e^{-st}\\,dt`] : [])] },
    { title: "Step 2 — Support Boundaries & Causal / Anti-Causal Splitting", lines: support.length ? support : [`\\text{No additive terms were found in }${x}(t).`] },
    { title: "Step 3 — Antiderivative & Convergence Condition", lines: limits.length ? limits : ["\\text{No antiderivative is required for the remaining terms.}"] },
    { title: "Step 4 — Region of Convergence (ROC) Formalization", lines: multi ? [...rocLines, `\\text{ROC}:\\ ${rocFinal}\\quad\\left(\\text{intersection of the term ROCs}\\right)`] : [...rocLines, `\\text{ROC}:\\ ${rocFinal}`] },
    { title: "Step 5 — Final Algebraic Transfer Function", lines: [`${X}(s)=${closed},\\qquad ${lower < upper ? `\\text{ROC}:\\ ${rocFinal}` : "\\text{ROC}=\\varnothing"}${unsupported ? "\\quad(\\text{partial: some terms omitted})" : ""}`] },
  ];
}

/**
 * Step-by-step x(t) = 𝓛⁻¹{X(s)} by partial fractions: pole–zero factorization, PFE setup, residues A = lim (s−p)X(s)
 * (Heaviside cover-up, derivatives for repeated poles), ROC matching per term, and the synthesized time signal.
 */
export function deriveInverseLaplaceSteps(system: TransferFunction, rocKind: RocKind, options: InverseLaplaceOptions = {}, symbols: DerivationSymbols = DEFAULT_SYMBOLS): DerivationStep[] {
  const X = symbols.freq; const x = symbols.time;
  const result = inverseLaplace(system, rocKind, options);
  const groups = clusterPoles(system.poles);
  const numeratorLead = system.numerator.find((value) => Math.abs(value) > EPSILON) ?? 0; const denominatorLead = system.denominator.find((value) => Math.abs(value) > EPSILON) ?? 1;
  const gain = numeratorLead / denominatorLead;
  const zeroFactors = clusterPoles(system.zeros).map(({ pole, multiplicity }) => `\\left(${sMinus(pole)}\\right)${multiplicity > 1 ? `^{${multiplicity}}` : ""}`).join("");
  const poleFactors = groups.map(({ pole, multiplicity }) => `\\left(${sMinus(pole)}\\right)${multiplicity > 1 ? `^{${multiplicity}}` : ""}`).join("") || "1";
  const gainTex = isZero(gain - 1) ? "" : fmt(gain);
  const index = new Map<string, number>(); groups.forEach((group, position) => index.set(`${group.pole.re},${group.pole.im}`, position + 1));
  const rowKey = (pole: Complex) => index.get(`${clean(pole.re, 6)},${clean(pole.im, 6)}`) ?? 0;

  const factorization = [
    `${X}(s)=\\frac{N(s)}{D(s)}=\\frac{${formatPolynomial(system.numerator, "s")}}{${formatPolynomial(system.denominator, "s")}}`,
    `${X}(s)=${gainTex}\\frac{${zeroFactors || "1"}}{${poleFactors}}\\qquad\\left(\\text{poles: }${groups.map((group, position) => `p_{${position + 1}}=${complexLatex(group.pole)}${group.multiplicity > 1 ? `\\,(m=${group.multiplicity})` : ""}`).join(",\\ ") || "\\text{none}"}\\right)`,
    ...(result.properness !== "strict" ? [`\\deg N\\ge\\deg D\\ \\Rightarrow\\ \\text{polynomial division first: }X(s)=Q(s)+\\frac{R(s)}{D(s)}`] : []),
  ];

  const setup = groups.length ? [`${X}(s)=${result.direct.some((value) => !isZero(value)) ? "Q(s)+" : ""}${groups.map((group, position) => Array.from({ length: group.multiplicity }, (_, order) => group.multiplicity > 1 ? `\\frac{A_{${position + 1},${order + 1}}}{${order === 0 ? `s-p_{${position + 1}}` : `\\left(s-p_{${position + 1}}\\right)^{${order + 1}}`}}` : `\\frac{A_{${position + 1}}}{s-p_{${position + 1}}}`).join("+")).join("+")}`] : ["\\text{No finite poles: the transform is a polynomial in }s."];

  const residues: string[] = [];
  const ordered = result.terms.slice().sort((left, right) => rowKey(left.pole) - rowKey(right.pole) || left.order - right.order);
  const visible = ordered.filter((term) => term.pole.im >= -EPSILON);
  ordered.forEach((term) => {
    const position = rowKey(term.pole); const suffix = term.multiplicity > 1 ? `${position},${term.order}` : `${position}`;
    const derivativeOrder = term.multiplicity - term.order;
    const definition = term.multiplicity === 1
      ? `A_{${suffix}}=\\lim_{s\\to p_{${position}}}\\left(s-p_{${position}}\\right)${X}(s)`
      : `A_{${suffix}}=\\frac{1}{${derivativeOrder}!}\\lim_{s\\to p_{${position}}}\\frac{d^{${derivativeOrder}}}{ds^{${derivativeOrder}}}\\left[\\left(s-p_{${position}}\\right)^{${term.multiplicity}}${X}(s)\\right]`;
    residues.push(`${definition}=${complexText(term.residue)}`);
  });
  if (!residues.length) residues.push(result.direct.some((value) => !isZero(value)) ? "\\text{All of }X(s)\\text{ is the polynomial quotient }Q(s);\\ \\text{no residues remain.}" : "\\text{No residues: the numerator is zero.}");

  const rocInfo = rocFor(system, rocKind);
  const matching: string[] = [`${rocInfo.latex}`];
  visible.forEach((term) => {
    const position = rowKey(term.pole); const p = complexLatex(term.pole);
    matching.push(`p_{${position}}=${p}:\\ ${term.causal ? "\\text{pole left of the ROC (right-sided)}\\ \\Rightarrow\\ e^{p_{" + position + "}t}u(t)" : "\\text{pole right of the ROC (left-sided)}\\ \\Rightarrow\\ -e^{p_{" + position + "}t}u(-t)"}${term.order > 1 ? `,\\ \\text{with the factor }\\frac{t^{${term.order - 1}}}{${factorial(term.order - 1)}}` : ""}`);
  });
  if (visible.some((term) => !isZero(term.pole.im))) matching.push("A_k\\text{ and }A_k^{*}\\text{ of a conjugate pair combine: }2e^{\\sigma t}\\left[\\operatorname{Re}\\{A\\}\\cos\\omega t-\\operatorname{Im}\\{A\\}\\sin\\omega t\\right]");
  if (result.direct.some((value) => !isZero(value))) matching.push("Q(s)\\ \\Rightarrow\\ \\text{impulse terms }\\delta(t),\\,\\delta'(t),\\dots");

  return [
    { title: "Step 1 — Pole-Zero Factorization", lines: factorization },
    { title: "Step 2 — Partial Fraction Expansion Setup", lines: setup },
    { title: "Step 3 — Residue Calculation", lines: residues },
    { title: "Step 4 — ROC Matching & Inversion Lookup", lines: matching },
    { title: "Step 5 — Final Synthesized Time-Domain Signal", lines: [result.timeLatex.replace(/^h\(t\)/, x + "(t)"), result.pfeLatex.replace(/^H\(s\)/, `${X}(s)`)] },
  ];
}
