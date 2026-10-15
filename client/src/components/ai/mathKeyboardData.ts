/**
 * Data model for the virtual LaTeX keyboard.
 *
 * Templates are authored with two markers that the builder strips:
 *   ⟦…⟧  the first parameter: selected after insertion (placeholder text) or replaced by the user's selection
 *   ‸    an empty first parameter: the caret sits here (the builder places it automatically between the
 *        first empty `{}` / `()` / `[]` when no marker is written)
 * A key with neither (Greek letters, \infty, \partial …) is a "symbol": the caret lands after it and it replaces any selection.
 */
export type MathTabId = "calculus" | "functions" | "algebra" | "greek";

export interface MathKey {
  id: string;
  /** The LaTeX that is inserted. */
  latex: string;
  /** What the key face shows (defaults to `latex`; used where the raw template renders as an empty box). */
  face: string;
  /** Plain-words English name; the localized name comes from `mathKeyboard.keys.<id>` when present. */
  name: string;
  /** First-parameter range inside `latex` (selection or caret). Absent for symbol keys. */
  selStart?: number;
  selEnd?: number;
}

export interface MathTab {
  id: MathTabId;
  keys: MathKey[];
}

const SELECT_OPEN = "⟦";
const SELECT_CLOSE = "⟧";
const CARET = "‸";

function key(id: string, name: string, source: string, face?: string): MathKey {
  const open = source.indexOf(SELECT_OPEN);
  const close = source.indexOf(SELECT_CLOSE);
  const caret = source.indexOf(CARET);
  let latex = source;
  let selStart: number | undefined;
  let selEnd: number | undefined;
  if (open !== -1 && close > open) {
    latex = source.replace(SELECT_OPEN, "").replace(SELECT_CLOSE, "");
    selStart = open;
    selEnd = close - 1;
  } else if (caret !== -1) {
    latex = source.replace(CARET, "");
    selStart = selEnd = caret;
  } else {
    const empties = ["{}", "()", "[]"].map((pair) => latex.indexOf(pair)).filter((i) => i !== -1);
    if (empties.length > 0) selStart = selEnd = Math.min(...empties) + 1;
  }
  return { id, latex, face: face ?? latex, name, selStart, selEnd };
}

const symbol = (id: string, name: string, latex: string) => key(id, name, latex);

const GREEK_LOWER = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "lambda", "mu", "xi", "pi", "rho", "sigma", "tau", "phi", "omega"];
const GREEK_UPPER = ["Delta", "Gamma", "Theta", "Lambda", "Pi", "Sigma", "Phi", "Psi", "Omega"];

export const MATH_TABS: MathTab[] = [
  {
    id: "calculus",
    keys: [
      key("integral", "integral from a to b", "\\int_{⟦a⟧}^{b}"),
      key("derivative", "derivative with respect to x", "\\frac{⟦d⟧}{dx}"),
      key("limit", "limit as x approaches a", "\\lim_{⟦x⟧ \\to a}"),
      key("sum", "sum from n equals 1 to infinity", "\\sum_{⟦n=1⟧}^{\\infty}"),
      symbol("partial", "partial derivative symbol", "\\partial"),
      key("product", "product from n equals 1 to N", "\\prod_{⟦n=1⟧}^{N}"),
      symbol("contour", "contour integral", "\\oint"),
      symbol("nabla", "nabla, gradient", "\\nabla"),
      symbol("double-integral", "double integral", "\\iint"),
      key("partial-derivative", "partial derivative with respect to x", "\\frac{⟦\\partial⟧}{\\partial x}"),
      key("prime", "f prime of x", "f'(⟦x⟧)"),
      key("dot", "time derivative of x", "\\dot{⟦x⟧}"),
    ],
  },
  {
    id: "functions",
    keys: [
      key("ln", "natural logarithm", "\\ln(‸)", "\\ln(x)"),
      key("log10", "logarithm base 10", "\\log_{10}(‸)", "\\log_{10}(x)"),
      key("exp-x", "e to the power x", "e^{⟦x⟧}"),
      key("sin", "sine", "\\sin(‸)", "\\sin(x)"),
      key("cos", "cosine", "\\cos(‸)", "\\cos(x)"),
      key("tan", "tangent", "\\tan(‸)", "\\tan(x)"),
      key("arcsin", "inverse sine", "\\arcsin(‸)", "\\arcsin(x)"),
      key("arctan", "inverse tangent", "\\arctan(‸)", "\\arctan(x)"),
      key("sinh", "hyperbolic sine", "\\sinh(‸)", "\\sinh(x)"),
      key("cosh", "hyperbolic cosine", "\\cosh(‸)", "\\cosh(x)"),
      key("exp", "exponential function", "\\exp(‸)", "\\exp(x)"),
      key("abs", "absolute value", "|⟦x⟧|"),
      key("max", "maximum", "\\max(‸)", "\\max(x)"),
      key("min", "minimum", "\\min(‸)", "\\min(x)"),
    ],
  },
  {
    id: "algebra",
    keys: [
      key("fraction", "fraction", "\\frac{⟦a⟧}{b}"),
      key("sqrt", "square root", "\\sqrt{‸}", "\\sqrt{x}"),
      key("nth-root", "nth root", "\\sqrt[⟦n⟧]{}", "\\sqrt[n]{x}"),
      key("power", "power, superscript", "x^{⟦2⟧}"),
      key("subscript", "subscript", "x_{⟦n⟧}"),
      key("matrix", "2 by 2 matrix", "\\begin{bmatrix} ⟦a⟧ & b \\\\ c & d \\end{bmatrix}"),
      key("determinant", "2 by 2 determinant", "\\begin{vmatrix} ⟦a⟧ & b \\\\ c & d \\end{vmatrix}"),
      key("binomial", "binomial coefficient", "\\binom{⟦n⟧}{k}"),
      key("overline", "overline", "\\overline{‸}", "\\overline{AB}"),
      key("bar", "x bar, mean", "\\bar{⟦x⟧}"),
      key("vector", "vector", "\\vec{⟦v⟧}"),
      symbol("plus-minus", "plus or minus", "\\pm"),
      symbol("cdot", "dot product, multiplication dot", "\\cdot"),
      symbol("times", "times", "\\times"),
      symbol("leq", "less than or equal", "\\leq"),
      symbol("geq", "greater than or equal", "\\geq"),
      symbol("neq", "not equal", "\\neq"),
      symbol("approx", "approximately equal", "\\approx"),
      symbol("rightarrow", "right arrow, implies", "\\rightarrow"),
    ],
  },
  {
    id: "greek",
    keys: [
      ...GREEK_LOWER.map((n) => symbol(n, n, `\\${n}`)),
      ...GREEK_UPPER.map((n) => symbol(n, `capital ${n}`, `\\${n}`)),
      symbol("infinity", "infinity", "\\infty"),
      symbol("hbar", "reduced Planck constant", "\\hbar"),
      symbol("varepsilon", "epsilon, variant form", "\\varepsilon"),
      symbol("imaginary-j", "imaginary unit j", "\\mathrm{j}"),
      symbol("ohm", "ohm, unit", "\\,\\Omega"),
      symbol("microfarad", "microfarad, unit", "\\mu\\text{F}"),
    ],
  },
];

export const ALL_MATH_KEYS: MathKey[] = MATH_TABS.flatMap((tab) => tab.keys);
