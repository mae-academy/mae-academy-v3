/**
 * Data model for the virtual LaTeX keyboard.
 *
 * Templates are authored with markers that the builder turns into MathLive `\placeholder{}` boxes:
 *   ⟦…⟧  the first parameter: the caret goes here after insertion, and a plain-text selection is moved into it
 *   ⟨…⟩  a further parameter: another empty box (its text is kept in `latex`, which the key face and the fallback chip show)
 *   ‸    an empty first parameter
 * A key with no marker (Greek letters, \infty, \partial …) is a "symbol": it is inserted as is, without boxes.
 */
export type MathTabId = "calculus" | "functions" | "algebra" | "greek";

export interface MathKey {
  id: string;
  /** The plain LaTeX of the key (markers stripped, parameters shown with their default text). */
  latex: string;
  /** The MathLive template: every parameter is an empty `\placeholder{}`; the first one receives the caret. */
  template: string;
  /** What the key face shows (defaults to `latex`; used where the raw template renders as an empty box). */
  face: string;
  /** Plain-words English name; the localized name comes from `mathKeyboard.keys.<id>` when present. */
  name: string;
}

export interface MathTab {
  id: MathTabId;
  keys: MathKey[];
}

const PLACEHOLDER = "\\placeholder{}";

function key(id: string, name: string, source: string, face?: string): MathKey {
  const latex = source.replace(/[⟦⟧⟨⟩‸]/g, "");
  const template = source.replace(/⟦[^⟧]*⟧|⟨[^⟩]*⟩|‸/g, PLACEHOLDER);
  return { id, latex, template, face: face ?? latex, name };
}

const symbol = (id: string, name: string, latex: string) => key(id, name, latex);

const GREEK_LOWER = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "lambda", "mu", "xi", "pi", "rho", "sigma", "tau", "phi", "omega"];
const GREEK_UPPER = ["Delta", "Gamma", "Theta", "Lambda", "Pi", "Sigma", "Phi", "Psi", "Omega"];

export const MATH_TABS: MathTab[] = [
  {
    id: "calculus",
    keys: [
      key("integral", "integral from a to b", "\\int_{⟦a⟧}^{⟨b⟩}"),
      key("derivative", "derivative with respect to x", "\\frac{⟦d⟧}{dx}"),
      key("limit", "limit as x approaches a", "\\lim_{⟦x⟧ \\to ⟨a⟩}"),
      key("sum", "sum from n equals 1 to infinity", "\\sum_{⟦n=1⟧}^{⟨\\infty⟩}"),
      symbol("partial", "partial derivative symbol", "\\partial"),
      key("product", "product from n equals 1 to N", "\\prod_{⟦n=1⟧}^{⟨N⟩}"),
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
      key("fraction", "fraction", "\\frac{⟦a⟧}{⟨b⟩}"),
      key("sqrt", "square root", "\\sqrt{‸}", "\\sqrt{x}"),
      key("nth-root", "nth root", "\\sqrt[⟦n⟧]{⟨⟩}", "\\sqrt[n]{x}"),
      key("power", "power, superscript", "x^{⟦2⟧}"),
      key("subscript", "subscript", "x_{⟦n⟧}"),
      key("matrix", "2 by 2 matrix", "\\begin{bmatrix} ⟦a⟧ & ⟨b⟩ \\\\ ⟨c⟩ & ⟨d⟩\\end{bmatrix}"),
      key("determinant", "2 by 2 determinant", "\\begin{vmatrix} ⟦a⟧ & ⟨b⟩ \\\\ ⟨c⟩ & ⟨d⟩\\end{vmatrix}"),
      key("binomial", "binomial coefficient", "\\binom{⟦n⟧}{⟨k⟩}"),
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
