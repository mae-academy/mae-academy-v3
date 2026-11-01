/**
 * Golden corpus definition (STEPS.md §10, owner decision Q13): 300 real-valued expressions in x, generated from
 * fixed templates so the list is reproducible. Complex (D2) and 3D (D3) forms are excluded.
 */

export interface CorpusEntry {
  id: string;
  latex: string;
  /** Sample points; the oracle drops points where the function is ill-conditioned (see generate.py). */
  points: number[];
}

/** Fixed sample points: away from 0 and from the usual singularities, mixed signs. */
export const DEFAULT_POINTS = [-2.7, -1.3, -0.45, 0.35, 0.8, 1.25, 1.9, 2.6];
const POSITIVE_POINTS = [0.15, 0.4, 0.75, 1.2, 1.85, 2.5, 3.7, 6.1];
const UNIT_POINTS = [-0.93, -0.61, -0.27, -0.08, 0.13, 0.42, 0.66, 0.89];

/** Unary functions with their safe domain. */
const UNARY: Array<[string, number[]]> = [
  ["\\sin(X)", DEFAULT_POINTS],
  ["\\cos(X)", DEFAULT_POINTS],
  ["\\tan(X)", DEFAULT_POINTS],
  ["\\exp(X)", DEFAULT_POINTS],
  ["\\ln(X)", POSITIVE_POINTS],
  ["\\sqrt{X}", POSITIVE_POINTS],
  ["\\left|X\\right|", DEFAULT_POINTS],
  ["\\arctan(X)", DEFAULT_POINTS],
  ["\\sinh(X)", DEFAULT_POINTS],
  ["\\cosh(X)", DEFAULT_POINTS],
  ["\\tanh(X)", DEFAULT_POINTS],
  ["\\arcsin(X)", UNIT_POINTS],
  ["\\arccos(X)", UNIT_POINTS],
  ["\\operatorname{erf}(X)", DEFAULT_POINTS],
  ["\\Gamma(X)", POSITIVE_POINTS],
  ["\\log(X)", POSITIVE_POINTS],
  ["\\log_2(X)", POSITIVE_POINTS],
  ["\\sec(X)", DEFAULT_POINTS],
  ["\\csc(X)", DEFAULT_POINTS],
  ["\\cot(X)", DEFAULT_POINTS],
];

const sub = (template: string, inner: string) => template.split("X").join(inner);

export function buildCorpus(): CorpusEntry[] {
  const out: CorpusEntry[] = [];
  const add = (latex: string, points: number[] = DEFAULT_POINTS) => {
    out.push({ id: `g${String(out.length + 1).padStart(3, "0")}`, latex, points });
  };

  // 1. Plain unary functions (20).
  for (const [f, pts] of UNARY) add(sub(f, "x"), pts);

  // 2. Affine arguments f(a x + b) (40).
  const affine = ["2x+1", "0.5x-0.25", "3x", "-x+0.7"];
  const affineSafe: Array<[string, number[]]> = [
    ["\\sin(X)", DEFAULT_POINTS], ["\\cos(X)", DEFAULT_POINTS], ["\\exp(X)", DEFAULT_POINTS], ["\\arctan(X)", DEFAULT_POINTS],
    ["\\sinh(X)", DEFAULT_POINTS], ["\\tanh(X)", DEFAULT_POINTS], ["\\operatorname{erf}(X)", DEFAULT_POINTS],
    ["\\sqrt{(X)^2+1}", DEFAULT_POINTS], ["\\ln((X)^2+1)", DEFAULT_POINTS], ["\\cosh(X)", DEFAULT_POINTS],
  ];
  for (const [f, pts] of affineSafe) for (const a of affine) add(sub(f, a), pts);

  // 3. Products of two functions (45).
  const factors = ["\\sin(x)", "\\cos(x)", "e^{x}", "x^2", "\\arctan(x)", "\\sqrt{x^2+1}", "\\tanh(x)", "x", "\\cosh(x)", "(x+3)"];
  for (let i = 0; i < factors.length; i++) for (let j = i + 1; j < factors.length; j++) add(`${factors[i]}\\cdot ${factors[j]}`);

  // 4. Quotients (30).
  const nums = ["\\sin(x)", "e^{-x^2}", "x^3-2x", "\\arctan(x)", "\\cos(x)+2", "x"];
  const dens = ["x^2+1", "\\cosh(x)", "2+\\sin(x)", "e^{x}+1", "x^4+3"];
  for (const n of nums) for (const d of dens) add(`\\frac{${n}}{${d}}`);

  // 5. Polynomials and rational powers (40).
  const polys = [
    "x^2-3x+2", "x^3-x", "2x^4-x^2+0.5", "(x-1)(x+2)(x-0.5)", "x^5-4x^3+x", "\\frac{1}{3}x^3-x", "(x^2+1)^3", "1-x+x^2-x^3",
    "x^{6}+1", "(2x-1)^2",
  ];
  for (const p of polys) add(p);
  const roots: Array<[string, number[]]> = [
    ["x^{1/3}", DEFAULT_POINTS], ["x^{2/3}", DEFAULT_POINTS], ["\\sqrt[3]{x}", DEFAULT_POINTS], ["x^{-1/3}", DEFAULT_POINTS],
    ["\\sqrt[5]{x^2+x}", DEFAULT_POINTS], ["x^{3/5}", DEFAULT_POINTS], ["x^{0.5}", POSITIVE_POINTS], ["x^{x}", POSITIVE_POINTS],
    ["x^{\\pi}", POSITIVE_POINTS], ["2^{x}", DEFAULT_POINTS], ["10^{-x}", DEFAULT_POINTS], ["x^{-2}", DEFAULT_POINTS],
    ["\\sqrt{x}^{3}", POSITIVE_POINTS], ["(x^2+1)^{1/2}", DEFAULT_POINTS], ["(x^2+2)^{-3/2}", DEFAULT_POINTS],
    ["e^{-x}", DEFAULT_POINTS], ["\\sqrt{1-x^2}", UNIT_POINTS], ["\\frac{1}{\\sqrt{x}}", POSITIVE_POINTS],
    ["x^{7/3}", DEFAULT_POINTS], ["(-x)^{1/3}", DEFAULT_POINTS], ["\\sqrt[4]{x}", POSITIVE_POINTS], ["x^{-0.75}", POSITIVE_POINTS],
    ["3^{x}-2^{x}", DEFAULT_POINTS], ["e^{\\sin(x)}", DEFAULT_POINTS], ["x^{2}e^{-x}", DEFAULT_POINTS], ["x^{1/2}+x^{1/3}", POSITIVE_POINTS],
    ["\\left|x\\right|^{1.5}", DEFAULT_POINTS], ["(1+x^2)^{x}", DEFAULT_POINTS], ["\\sqrt{\\left|x\\right|}", DEFAULT_POINTS],
    ["x^{-5/3}", DEFAULT_POINTS],
  ];
  for (const [r, pts] of roots) add(r, pts);

  // 6. Compositions f(g(x)) (40).
  const outer = ["\\sin(X)", "\\exp(X)", "\\arctan(X)", "\\sqrt{(X)^2+1}", "\\cos(X)"];
  const inner = ["x^2", "\\sin(x)", "e^{-x}", "\\tanh(x)", "\\frac{1}{x^2+1}", "x^3-x", "\\cos(2x)", "\\ln(x^2+1)"];
  for (const o of outer) for (const i of inner) add(sub(o, i));

  // 7. Special functions, piecewise and named operations (30).
  const special: Array<[string, number[]]> = [
    ["\\Gamma(x+3)", DEFAULT_POINTS], ["x!", POSITIVE_POINTS], ["\\Gamma(x)", [-2.7, -1.3, -0.45, 0.35, 0.8, 1.25, 1.9, 2.6]],
    ["\\operatorname{erf}(x)\\cdot e^{x^2}", [-1.3, -0.45, 0.35, 0.8, 1.25, 1.9, -2.1, 2.2]], ["\\operatorname{erfc}(x)", DEFAULT_POINTS],
    ["\\max(\\sin(x), \\cos(x))", DEFAULT_POINTS], ["\\min(x^2, 2-x)", DEFAULT_POINTS], ["x \\bmod 1.5", DEFAULT_POINTS],
    ["\\lfloor x\\rfloor + 0.5x", DEFAULT_POINTS], ["\\lceil 2x\\rceil - x", DEFAULT_POINTS], ["\\operatorname{sign}(x)\\cdot x^2", DEFAULT_POINTS],
    ["\\log_{2}(x^2+1)", DEFAULT_POINTS], ["\\ln\\left|x\\right|", DEFAULT_POINTS], ["\\arcsin(x/3)", DEFAULT_POINTS],
    ["\\arccos(x/3)", DEFAULT_POINTS], ["\\operatorname{arsinh}(x)", DEFAULT_POINTS], ["\\operatorname{artanh}(x/3)", DEFAULT_POINTS],
    ["\\operatorname{arcosh}(x^2+1)", DEFAULT_POINTS], ["\\sum_{n=1}^{10} \\frac{x^n}{n}", UNIT_POINTS],
    ["\\sum_{k=0}^{12} \\frac{(-1)^k x^{2k}}{(2k)!}", DEFAULT_POINTS], ["\\prod_{k=1}^{4} (x+k)", DEFAULT_POINTS],
    ["\\int_{0}^{x} e^{-t^2} dt", DEFAULT_POINTS], ["\\int_{0}^{1} \\sin(x t) dt", DEFAULT_POINTS], ["\\int_{1}^{2} t^{x} dt", DEFAULT_POINTS],
    ["\\sinh(x)\\cosh(x)-\\frac{1}{2}\\sinh(2x)+x", DEFAULT_POINTS], ["\\frac{\\sin(x)}{x}", DEFAULT_POINTS],
    ["\\frac{e^{x}-e^{-x}}{2}", DEFAULT_POINTS], ["\\cos(x)^2+\\sin(x)^2+x", DEFAULT_POINTS], ["\\pi x^2", DEFAULT_POINTS],
    ["\\frac{1}{1+e^{-x}}", DEFAULT_POINTS],
  ];
  for (const [s, pts] of special) add(s, pts);

  // 8. Parameterised families with fixed constants and three-term sums (55).
  for (let k = 1; k <= 11; k++) {
    add(`${k}\\sin(${k}x)+\\cos(x/${k})`);
    add(`e^{-x^2/${k}}\\cos(${k}x)`);
    add(`\\frac{x^2-${k}}{x^2+${k}}`);
    add(`\\arctan(${k}x)-\\frac{x}{${k}}`);
    add(`\\sqrt{x^2+${k}}\\tanh(x/${k})`);
  }
  return out;
}
