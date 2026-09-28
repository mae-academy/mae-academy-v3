/**
 * MAE Academy / Signals & Systems — Tab E z-transform derivation engine.
 * Forward: H(z) = Σ h[n]z⁻ⁿ for sums of c·aⁿ·u[n−k], c·aⁿ·u[−n+L] and c·δ[n−k], via geometric series with the ROC of every term.
 * Inverse: partial fractions of H(z)/z (residues Aₖ = lim (z−pₖ)H(z)/z), multiplied back by z and matched to the ROC.
 * Pure math: no React, DOM, or canvas.
 */
import { affineArgument, containsVariable, evaluateNode, flattenSum, nodeToLatex, type MathNode } from "./diracIntegral";
import { parseDiscreteSignal } from "./discreteSignalEngine";
import type { DerivationStep } from "./derivationTypes";
import { clusterPoles, formatPolynomial, formatTransferLatex, inverseLaplace, polynomialRoots, rocFor, type Complex, type RocKind, type TransferFunction } from "./laplaceEngine";

const EPS = 1e-9;
const N = "n";
const isZero = (value: number) => Math.abs(value) < 1e-7;
const clean = (value: number) => (Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(8)));
const fmt = (value: number) => { const rounded = Number(value.toFixed(4)); return Object.is(rounded, -0) ? "0" : String(rounded); };
const paren = (value: number) => (value < 0 ? `\\left(${fmt(value)}\\right)` : fmt(value));
const lead = (value: number) => (isZero(value - 1) ? "" : isZero(value + 1) ? "-" : fmt(value));
const complexText = (value: Complex) => {
  if (isZero(value.im)) return fmt(value.re);
  const imaginary = `j${fmt(Math.abs(value.im))}`;
  if (isZero(value.re)) return `${value.im < 0 ? "-" : ""}${imaginary}`;
  return `${fmt(value.re)}${value.im < 0 ? "-" : "+"}${imaginary}`;
};
const zMinus = (pole: Complex) => {
  let text = "z";
  if (!isZero(pole.re)) text += pole.re < 0 ? `+${fmt(-pole.re)}` : `-${fmt(pole.re)}`;
  if (!isZero(pole.im)) text += pole.im < 0 ? `+j${fmt(-pole.im)}` : `-j${fmt(pole.im)}`;
  return text;
};

/* ─────────────────────────── Descending real polynomials ─────────────────────────── */
type Poly = number[];
type Rat = { num: Poly; den: Poly };
const trimLead = (poly: Poly): Poly => { const out = poly.slice(); while (out.length > 1 && Math.abs(out[0]) < 1e-12) out.shift(); return out; };
const pAdd = (a: Poly, b: Poly): Poly => { const size = Math.max(a.length, b.length); const left = new Array<number>(size - a.length).fill(0).concat(a); const right = new Array<number>(size - b.length).fill(0).concat(b); return trimLead(left.map((value, index) => value + right[index])); };
const pMul = (a: Poly, b: Poly): Poly => { const out = new Array<number>(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return trimLead(out); };
const zeros = (count: number) => new Array<number>(Math.max(0, count)).fill(0);
const ratAdd = (a: Rat, b: Rat): Rat => ({ num: pAdd(pMul(a.num, b.den), pMul(b.num, a.den)), den: pMul(a.den, b.den) });

function toSystem(value: Rat): TransferFunction {
  const den = trimLead(value.den); const scale = den[0] || 1;
  const numerator = trimLead(value.num).map((entry) => clean(entry / scale)); const denominator = den.map((entry) => clean(entry / scale));
  const system: TransferFunction = { mode: "z", numerator, denominator, zeros: polynomialRoots(numerator), poles: polynomialRoots(denominator), source: "" };
  system.source = formatTransferLatex(system);
  return system;
}

/* ─────────────────────────── Forward z-transform ─────────────────────────── */

type ZHit =
  | { kind: "delta"; coefficient: number; shift: number }
  | { kind: "geometric"; side: "right" | "left"; coefficient: number; base: number; edge: number };

const constantOf = (node: MathNode): number | null => { if (containsVariable(node, N)) return null; try { const value = evaluateNode(node, N, 0); return Number.isFinite(value) ? value : null; } catch { return null; } };

/** c·aⁿ·u[n−k] / c·aⁿ·u[−n+L] / c·δ[n−k]; throws for anything else. */
function classifyZTerm(node: MathNode): ZHit {
  let coefficient = 1; let base = 1; let side: "right" | "left" | null = null; let edge = 0; let shift: number | null = null;
  const collect = (value: MathNode) => {
    const constant = constantOf(value);
    if (constant !== null && value.kind !== "delta") { coefficient *= constant; return; }
    switch (value.kind) {
      case "neg": coefficient *= -1; collect(value.value); return;
      case "mul": collect(value.left); collect(value.right); return;
      case "div": { const divisor = constantOf(value.right); if (divisor === null || Math.abs(divisor) < 1e-12) throw new Error("Only division by a constant is supported."); coefficient /= divisor; collect(value.left); return; }
      case "delta": {
        const form = affineArgument(value.argument, N);
        if (value.order !== 0 || !form || Math.abs(Math.abs(form.slope) - 1) > EPS) throw new Error("Only δ[n − k] is supported.");
        shift = -form.intercept / form.slope; return;
      }
      case "pow": {
        const a = constantOf(value.base); const form = affineArgument(value.exponent, N);
        if (a === null || !form || Math.abs(form.slope - 1) > EPS || Math.abs(a) < EPS || base !== 1) throw new Error("Powers must be aⁿ with a ≠ 0.");
        base = a; coefficient *= Math.pow(a, form.intercept); return;
      }
      case "call": {
        const form = affineArgument(value.argument, N);
        if (!form) throw new Error("Arguments must be affine in n.");
        if (value.name === "exp") { if (Math.abs(form.slope) < EPS || base !== 1) throw new Error("Exponentials must be e^{bn}."); base = Math.exp(form.slope); coefficient *= Math.exp(form.intercept); return; }
        if (value.name === "u") {
          if (Math.abs(Math.abs(form.slope) - 1) > EPS || side) throw new Error("Steps must be u[±n + k].");
          if (form.slope > 0) { side = "right"; edge = -form.intercept; } else { side = "left"; edge = form.intercept; }
          return;
        }
        throw new Error(`${value.name} has no closed-form z-transform in this table.`);
      }
      default: throw new Error("This term is outside the z-transform table.");
    }
  };
  collect(node);
  if (shift !== null) { if (side || base !== 1) throw new Error("Multiply δ[n] only by constants."); return { kind: "delta", coefficient, shift }; }
  if (!side) throw new Error("A two-sided aⁿ has no annulus of convergence; multiply by u[n] or u[−n−1].");
  return { kind: "geometric", side, coefficient, base, edge };
}

function termRational(hit: ZHit): Rat {
  if (hit.kind === "delta") return hit.shift >= 0 ? { num: [hit.coefficient], den: [1, ...zeros(hit.shift)] } : { num: [hit.coefficient, ...zeros(-hit.shift)], den: [1] };
  const { coefficient, base, edge } = hit;
  if (hit.side === "right") {
    // c·aᵏ·z^{1−k}/(z − a)
    const gain = coefficient * Math.pow(base, edge); const exponent = 1 - edge;
    return exponent >= 0 ? { num: [gain, ...zeros(exponent)], den: [1, -base] } : { num: [gain], den: [1, -base, ...zeros(-exponent)] };
  }
  // left: −c·a^{1−M}·z^{M}/(z − a) with M = −L
  const M = -edge; const gain = -coefficient * Math.pow(base, 1 - M);
  return M >= 0 ? { num: [gain, ...zeros(M)], den: [1, -base] } : { num: [gain], den: [1, -base, ...zeros(-M)] };
}

export type ForwardZAnalysis = { steps: DerivationStep[]; system: TransferFunction | null; rocKind: RocKind | null; error: string | null };

export function analyzeForwardZ(source: string): ForwardZAnalysis {
  const parsed = parseDiscreteSignal(source);
  if (!parsed.ok) return { steps: [], system: null, rocKind: null, error: parsed.error };
  const terms = flattenSum(parsed.node); const multi = terms.length > 1;
  const support: string[] = []; const sums: string[] = []; const rocLines: string[] = [];
  let total: Rat | null = null; let unsupported = false; let rightRadius = 0; let leftRadius = Number.POSITIVE_INFINITY; let hasRight = false; let hasLeft = false;

  terms.forEach(({ sign, node: termNode }, index) => {
    const sub = multi ? `_{${index + 1}}` : ""; const label = `${sign < 0 ? "-" : ""}${nodeToLatex(termNode)}`;
    let hit: ZHit;
    try { hit = classifyZTerm(termNode); } catch { unsupported = true; support.push(`${label}:\\quad\\text{outside the closed-form table; omitted from the result}`); return; }
    const c = sign * hit.coefficient;

    if (hit.kind === "delta") {
      support.push(`${label}:\\quad H${sub}(z)=\\sum_{n=-\\infty}^{\\infty}${lead(c)}\\delta[n${hit.shift === 0 ? "" : hit.shift > 0 ? `-${fmt(hit.shift)}` : `+${fmt(-hit.shift)}`}]\\,z^{-n}`);
      sums.push(`\\text{Sifting: }\\sum_{n}f[n]\\,\\delta[n-k]=f[k]\\ \\Rightarrow\\ H${sub}(z)=${lead(c) || "1"}\\,z^{${fmt(-hit.shift)}}`);
      rocLines.push(`\\text{ROC}${sub}:\\ \\text{all }z\\text{ except }${hit.shift > 0 ? "z=0" : hit.shift < 0 ? "z=\\infty" : "none (entire z-plane)"}`);
      const ratio = termRational({ ...hit, coefficient: c }); total = total ? ratAdd(total, ratio) : ratio; return;
    }

    const a = hit.base; const r = Math.abs(a); const ratio = `${isZero(a - 1) ? "" : `${paren(a)}`}z^{-1}`;
    if (hit.side === "right") {
      hasRight = true; rightRadius = Math.max(rightRadius, r);
      support.push(`${label}:\\quad H${sub}(z)=\\sum_{n=${fmt(hit.edge)}}^{\\infty}${lead(c)}${paren(a)}^{n}z^{-n}=${lead(c) || ""}\\sum_{n=${fmt(hit.edge)}}^{\\infty}\\left(${ratio}\\right)^{n}`);
      sums.push(`\\sum_{n=k}^{\\infty}q^{n}=\\frac{q^{k}}{1-q},\\quad|q|<1,\\quad q=${ratio}\\ \\Rightarrow\\ |${paren(a)}z^{-1}|<1\\ \\Rightarrow\\ |z|>${fmt(r)}`);
      sums.push(`H${sub}(z)=${lead(c)}\\frac{\\left(${ratio}\\right)^{${fmt(hit.edge)}}}{1-${ratio}}=\\frac{${fmt(c * Math.pow(a, hit.edge))}\\,z^{${fmt(1 - hit.edge)}}}{z-${paren(a)}}`);
      rocLines.push(`\\text{ROC}${sub}:\\ |z|>${fmt(r)}\\quad(\\text{exterior of the circle of radius }${fmt(r)})`);
    } else {
      hasLeft = true; leftRadius = Math.min(leftRadius, r); const M = -hit.edge;
      support.push(`${label}:\\quad H${sub}(z)=\\sum_{n=-\\infty}^{${fmt(hit.edge)}}${lead(c)}${paren(a)}^{n}z^{-n}=${lead(c) || ""}\\sum_{m=${fmt(M)}}^{\\infty}\\left(\\frac{z}{${paren(a)}}\\right)^{m}`);
      sums.push(`\\sum_{m=M}^{\\infty}q^{m}=\\frac{q^{M}}{1-q},\\quad|q|<1,\\quad q=\\frac{z}{${paren(a)}}\\ \\Rightarrow\\ |z|<${fmt(r)}`);
      sums.push(`H${sub}(z)=${lead(c)}\\frac{\\left(z/${paren(a)}\\right)^{${fmt(M)}}}{1-z/${paren(a)}}=\\frac{${fmt(-c * Math.pow(a, 1 - M))}\\,z^{${fmt(M)}}}{z-${paren(a)}}`);
      rocLines.push(`\\text{ROC}${sub}:\\ |z|<${fmt(r)}\\quad(\\text{interior of the circle of radius }${fmt(r)})`);
    }
    const value = termRational({ ...hit, coefficient: c }); total = total ? ratAdd(total, value) : value;
  });

  const empty = hasRight && hasLeft && rightRadius >= leftRadius - EPS;
  const rocFinal = empty ? "\\varnothing\\ \\text{(the two-sided sum does not converge)}"
    : hasRight && hasLeft ? `${fmt(rightRadius)}<|z|<${fmt(leftRadius)}` : hasRight ? `|z|>${fmt(rightRadius)}` : hasLeft ? `|z|<${fmt(leftRadius)}` : "\\text{entire }z\\text{-plane}";
  const system = total ? toSystem(total) : null;
  const rocKind: RocKind | null = hasRight && hasLeft ? "two-sided" : hasLeft ? "left" : total ? "right" : null;
  const closed = system ? `\\frac{${formatPolynomial(system.numerator, "z")}}{${formatPolynomial(system.denominator, "z")}}` : "0";
  const steps: DerivationStep[] = [
    { title: "Step 1 — Bilateral z-Transform Definition", lines: ["H(z)=\\mathcal{Z}\\{h[n]\\}=\\sum_{n=-\\infty}^{\\infty}h[n]\\,z^{-n}"] },
    { title: "Step 2 — Active Sequence Substitution", lines: support.length ? support : ["\\text{No additive terms were found in }h[n]."] },
    { title: "Step 3 — Geometric Series Summation & Convergence", lines: sums.length ? sums : ["\\text{No infinite series is required for the remaining terms.}"] },
    { title: "Step 4 — ROC Formalization", lines: [...rocLines, ...(multi ? [`\\text{ROC}:\\ ${rocFinal}\\quad\\left(\\text{intersection of the term ROCs}\\right)`] : [])] },
    { title: "Step 5 — Final Closed Form", lines: [`H(z)=${closed},\\qquad\\text{ROC}:\\ ${rocFinal}${unsupported ? "\\quad(\\text{partial: some terms omitted})" : ""}`] },
  ];
  return { steps, system: empty ? null : system, rocKind: empty ? null : rocKind, error: null };
}

/* ─────────────────────────── Inverse z-transform ─────────────────────────── */

export type ZPfeTerm = { pole: Complex; multiplicity: number; order: number; residue: Complex; causal: boolean };
export type InverseZResult = { direct: number[]; terms: ZPfeTerm[]; pfeLatex: string; timeLatex: string; value: (n: number) => number; warnings: string[] };

const binomial = (n: number, k: number) => { let out = 1; for (let i = 0; i < k; i += 1) out *= (n - i) / (i + 1); return out; };
const complexPower = (pole: Complex, exponent: number): Complex => { const radius = Math.hypot(pole.re, pole.im); const angle = Math.atan2(pole.im, pole.re); const magnitude = Math.pow(radius, exponent); return { re: magnitude * Math.cos(angle * exponent), im: magnitude * Math.sin(angle * exponent) }; };

export function inverseZ(system: TransferFunction, rocKind: RocKind): InverseZResult {
  const warnings: string[] = [];
  // H(z)/z = N(z) / (z·D(z)); reuse the Heaviside cover-up residues of the shared partial-fraction engine.
  const quotient: TransferFunction = { mode: "s", numerator: system.numerator, denominator: [...system.denominator, 0], zeros: [], poles: [], source: "" };
  const base = inverseLaplace(quotient, "right");
  const magnitudes = Array.from(new Set(base.terms.map((term) => Number(Math.hypot(term.pole.re, term.pole.im).toFixed(6))))).sort((a, b) => a - b);
  const split = magnitudes.length > 1 ? magnitudes[Math.floor((magnitudes.length - 1) / 2)] : Number.POSITIVE_INFINITY;
  const causalOf = (pole: Complex) => rocKind === "right" || (rocKind === "two-sided" && Math.hypot(pole.re, pole.im) <= split + EPS);
  if (rocKind === "two-sided" && magnitudes.length > 1) warnings.push("Two-sided ROC: poles inside the split radius are right-sided, the rest left-sided.");
  if (base.direct.some((value) => !isZero(value))) warnings.push("deg N(z) ≥ deg D(z): the polynomial part of H(z)/z becomes advanced impulses δ[n+k].");
  const terms: ZPfeTerm[] = base.terms.map((term) => ({ pole: term.pole, multiplicity: term.multiplicity, order: term.order, residue: term.residue, causal: causalOf(term.pole) }));

  const value = (n: number) => {
    let total = 0;
    base.direct.forEach((coefficient, index) => { if (n === -(index + 1)) total += coefficient; });
    terms.forEach((term) => {
      const k = term.order; const p = term.pole; const radius = Math.hypot(p.re, p.im);
      if (radius < 1e-9) { if (n === k - 1) total += term.residue.re; return; }
      const active = term.causal ? n >= 0 : n < 0; if (!active) return;
      const power = complexPower(p, n - k + 1); const weight = binomial(n, k - 1);
      const part = weight * (term.residue.re * power.re - term.residue.im * power.im);
      total += term.causal ? part : -part;
    });
    return total;
  };

  const pieces: Array<{ text: string; sign: number }> = [];
  base.direct.forEach((coefficient, index) => { if (!isZero(coefficient)) pieces.push({ sign: coefficient < 0 ? -1 : 1, text: `${lead(Math.abs(coefficient))}\\delta[n+${index + 1}]` }); });
  terms.forEach((term) => {
    if (term.pole.im < -EPS) return;
    const k = term.order; const p = term.pole; const radius = Math.hypot(p.re, p.im); const step = term.causal ? "u[n]" : "u[-n-1]"; const flip = term.causal ? 1 : -1;
    const exponent = k === 1 ? "n" : `n-${k - 1}`; const weight = k === 1 ? "" : `\\binom{n}{${k - 1}}`;
    if (radius < 1e-9) { const A = term.residue.re; if (!isZero(A)) pieces.push({ sign: A < 0 ? -1 : 1, text: `${lead(Math.abs(A))}\\delta[n${k === 1 ? "" : `-${k - 1}`}]` }); return; }
    if (isZero(p.im)) {
      const A = term.residue.re * flip; if (isZero(A)) return;
      pieces.push({ sign: A < 0 ? -1 : 1, text: `${lead(Math.abs(A))}${weight}${isZero(p.re - 1) ? "" : `${paren(p.re)}^{${exponent}}`}${step}` });
      return;
    }
    const magnitude = Math.hypot(term.residue.re, term.residue.im) * 2 * flip; const phase = Math.atan2(term.residue.im, term.residue.re); const theta = Math.atan2(p.im, p.re);
    pieces.push({ sign: magnitude < 0 ? -1 : 1, text: `${lead(Math.abs(magnitude))}${weight}${fmt(radius)}^{${exponent}}\\cos\\!\\left(${fmt(theta)}${k === 1 ? "n" : `(n-${k - 1})`}${phase < 0 ? "-" : "+"}${fmt(Math.abs(phase))}\\right)${step}` });
  });
  const timeBody = pieces.map((piece, index) => `${piece.sign < 0 ? "-" : index > 0 ? "+" : ""}${piece.text}`).join("") || "0";
  const pfeLatex = base.pfeLatex.replace(/^H\(s\)/, "\\frac{H(z)}{z}").replace(/(?<![A-Za-z\\])s(?![A-Za-z])/g, "z");
  return { direct: base.direct, terms, pfeLatex, timeLatex: `h[n]=${timeBody}`, value, warnings };
}

export function deriveInverseZSteps(system: TransferFunction, rocKind: RocKind): DerivationStep[] {
  const result = inverseZ(system, rocKind);
  const groups = clusterPoles(polynomialRoots([...system.denominator, 0]));
  const key = (pole: Complex) => groups.findIndex((group) => Math.hypot(group.pole.re - pole.re, group.pole.im - pole.im) < 1e-3) + 1;
  const ordered = result.terms.slice().sort((left, right) => key(left.pole) - key(right.pole) || left.order - right.order);
  const visible = ordered.filter((term) => term.pole.im >= -EPS);
  const roc = rocFor(system, rocKind);

  const setup = groups.length
    ? [`\\frac{H(z)}{z}=\\frac{N(z)}{z\\,D(z)}=\\frac{${formatPolynomial(system.numerator, "z")}}{z\\left(${formatPolynomial(system.denominator, "z")}\\right)}`,
      `\\frac{H(z)}{z}=${result.direct.some((value) => !isZero(value)) ? "Q(z)+" : ""}${groups.map((group, index) => Array.from({ length: group.multiplicity }, (_, order) => group.multiplicity > 1 ? `\\frac{A_{${index + 1},${order + 1}}}{${order === 0 ? `z-p_{${index + 1}}` : `\\left(z-p_{${index + 1}}\\right)^{${order + 1}}`}}` : `\\frac{A_{${index + 1}}}{z-p_{${index + 1}}}`).join("+")).join("+")}`,
      `\\left(\\text{poles: }${groups.map((group, index) => `p_{${index + 1}}=${complexText(group.pole)}${group.multiplicity > 1 ? `\\,(m=${group.multiplicity})` : ""}`).join(",\\ ")}\\right)`]
    : ["\\text{No finite poles: }H(z)\\text{ is a polynomial in }z."];

  const residues = ordered.map((term) => {
    const position = key(term.pole); const suffix = term.multiplicity > 1 ? `${position},${term.order}` : `${position}`; const derivative = term.multiplicity - term.order;
    const definition = term.multiplicity === 1
      ? `A_{${suffix}}=\\lim_{z\\to p_{${position}}}\\left(z-p_{${position}}\\right)\\frac{H(z)}{z}`
      : `A_{${suffix}}=\\frac{1}{${derivative}!}\\lim_{z\\to p_{${position}}}\\frac{d^{${derivative}}}{dz^{${derivative}}}\\left[\\left(z-p_{${position}}\\right)^{${term.multiplicity}}\\frac{H(z)}{z}\\right]`;
    return `${definition}=${complexText(term.residue)}`;
  });

  const multiplied = ordered.filter((term) => !isZero(term.residue.re) || !isZero(term.residue.im)).map((term) => `${term.residue.im === 0 || isZero(term.residue.im) ? complexText(term.residue) : `\\left(${complexText(term.residue)}\\right)`}\\frac{z}{${term.order === 1 ? zMinus(term.pole) : `\\left(${zMinus(term.pole)}\\right)^{${term.order}}`}}`);
  const matching: string[] = [roc.latex];
  visible.forEach((term) => {
    const position = key(term.pole); const radius = Math.hypot(term.pole.re, term.pole.im);
    if (radius < 1e-9) { matching.push(`p_{${position}}=0:\\ A\\,z^{1-k}\\ \\longleftrightarrow\\ A\\,\\delta[n-(k-1)]\\quad(\\text{independent of the ROC})`); return; }
    const weight = term.order > 1 ? `\\binom{n}{${term.order - 1}}` : "";
    matching.push(term.causal
      ? `|z|>|p_{${position}}|=${fmt(radius)}\\ \\Rightarrow\\ A_{${position}}${weight}\\,p_{${position}}^{\\,n}\\,u[n]`
      : `|z|<|p_{${position}}|=${fmt(radius)}\\ \\Rightarrow\\ -A_{${position}}${weight}\\,p_{${position}}^{\\,n}\\,u[-n-1]`);
  });
  if (visible.some((term) => !isZero(term.pole.im))) matching.push("A\\,p^{n}+A^{*}(p^{*})^{n}=2|A|\\,|p|^{n}\\cos(\\theta n+\\varphi)");

  return [
    { title: "Step 1 — Partial Fraction Expansion of H(z)/z", lines: setup },
    { title: "Step 2 — Residue Calculation", lines: residues.length ? residues : ["\\text{No residues remain.}"] },
    { title: "Step 3 — Multiply Back by z", lines: [`H(z)=\\sum_{k}A_k\\,\\frac{z}{z-p_k}`, ...(multiplied.length ? [`H(z)=${multiplied.join("+").replaceAll("+-", "-")}`] : [])] },
    { title: "Step 4 — ROC Matching & Inversion Lookup", lines: matching },
    { title: "Step 5 — Final Sequence", lines: [result.timeLatex, result.pfeLatex] },
  ];
}
