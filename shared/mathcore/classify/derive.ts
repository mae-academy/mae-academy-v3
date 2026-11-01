/**
 * Calculus statements → the helper items the existing engine needs to draw them (Part D). The reader's lines are never
 * changed; the page appends these hidden items to the document it sends to the engine, using only what already exists:
 * user functions, `f'(x)` at a point, `\int_a^b` (Simpson / tanh-sinh), inequality shading with restrictions, and the
 * engine's automatic sliders for undefined symbols (`x_0`, `a`, `b`).
 *
 *  - Derivative  `f'(x)` or `\frac{d}{dx}f(x)`  → tangent line, point of tangency, slope and value at x_0. If `x_0` is
 *    not defined by the reader, the engine creates one slider named `x_0` (`x0` would parse as x·0).
 *  - Integral    `\int_a^b f(x)\,dx`           → value and shaded area. A missing bound is the symbol `a` or `b`, which
 *    the engine turns into a slider.
 */
import type { Item } from "../ir/types";

export type HelperRole = "tangent" | "tangentPoint" | "slope" | "value" | "area" | "integral";

export interface Helper {
  /** Item id of the reader's statement this belongs to. */
  parent: string;
  role: HelperRole;
  item: Item;
}

export interface CalculusStatement {
  kind: "derivative" | "integral";
  /** Derivative: function name. Integral: integrand LaTeX. */
  fn?: string;
  body?: string;
  variable?: string;
  lower?: string;
  upper?: string;
  /** True when a bound was missing and a symbol stands for it. */
  missingBounds?: boolean;
}

const FN = String.raw`([A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?)`;
const PRIME = new RegExp(String.raw`^\s*${FN}\s*'\s*\(\s*x\s*\)\s*$`);
const LEIBNIZ = new RegExp(String.raw`^\s*\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*x\s*\}\s*(?:\\,|\;|\s)*${FN}\s*\(\s*x\s*\)\s*$`);
const SCRIPT = String.raw`(?:\{([^{}]*)\}|([A-Za-z0-9]))`;
const INTEGRAL = new RegExp(String.raw`^\s*\\int\s*(?:_${SCRIPT})?\s*(?:\^${SCRIPT})?\s*(.+?)(?:\\,|\;|\\!|\s)*\s*(?:\\mathrm\{d\}|d)\s*([a-z])\s*$`);

export function parseCalculus(latex: string): CalculusStatement | null {
  const d = PRIME.exec(latex) ?? LEIBNIZ.exec(latex);
  if (d) return { kind: "derivative", fn: d[1] };
  const m = INTEGRAL.exec(latex);
  if (!m) return null;
  const lower = (m[1] ?? m[2])?.trim();
  const upper = (m[3] ?? m[4])?.trim();
  const body = m[5].trim();
  if (!body) return null;
  return { kind: "integral", body, variable: m[6], lower: lower || "a", upper: upper || "b", missingBounds: !lower || !upper };
}

/**
 * Helper symbol names: capital letters with an index (`Z_{2}`) that appear nowhere in the reader's lines, so a helper can
 * never collide with a definition of theirs (a collision would flag the reader's own line as defined twice).
 */
const HELPER_LETTERS = "ZYXWVUQPNMKJHGEDCB";
function freshLetters(items: readonly Item[], count: number): string[] {
  const text = items.map((i) => i.latex).join(" ");
  const free = HELPER_LETTERS.split("").filter((L) => !new RegExp(`${L}\\s*_`).test(text));
  return free.slice(0, count);
}

/** The tangent point: one slider for all derivative lines. */
export const TANGENT_POINT = "x_0";

/** `defaultColor(i)`: the style color the reader's line i gets by position, so its helpers are drawn in the same color. */
export function deriveHelpers(items: readonly Item[], defaultColor?: (index: number) => string): Helper[] {
  const out: Helper[] = [];
  const [LS, LV, LA] = freshLetters(items, 3);
  const SLOPE = (k: number) => `${LS}_{${k}}`;
  const VALUE = (k: number) => `${LV}_{${k}}`;
  const AREA = (k: number) => `${LA}_{${k}}`;
  items.forEach((it, i) => {
    const s = parseCalculus(it.latex);
    if (!s) return;
    const k = i + 1;
    const color = it.style?.color ?? defaultColor?.(i);
    const style = color ? { color } : undefined;
    const mk = (role: HelperRole, latex: string, suffix = ""): Helper => ({ parent: it.id, role, item: { id: `${it.id}~${role}${suffix}`, latex, style: { ...style, width: 1.5 } } });
    if (s.kind === "derivative" && s.fn) {
      const f = s.fn;
      out.push(
        mk("tangent", `y=${f}'\\left(${TANGENT_POINT}\\right)\\left(x-${TANGENT_POINT}\\right)+${f}\\left(${TANGENT_POINT}\\right)`),
        mk("tangentPoint", `\\left(${TANGENT_POINT},${f}\\left(${TANGENT_POINT}\\right)\\right)`),
        mk("slope", `${SLOPE(k)}=${f}'\\left(${TANGENT_POINT}\\right)+0`),
        mk("value", `${VALUE(k)}=${f}\\left(${TANGENT_POINT}\\right)`),
      );
    } else if (s.kind === "integral" && s.body) {
      const v = s.variable ?? "x";
      out.push(mk("integral", `${AREA(k)}=\\int_{${s.lower}}^{${s.upper}}${s.body}\\,d${v}`));
      // The area between the curve and the x-axis over [lower, upper]: (y − f)·y ≤ 0 with the bounds as a restriction.
      if (v === "x") out.push(mk("area", `\\left(y-\\left(${s.body}\\right)\\right)y\\le0\\left\\{${s.lower}\\le x\\le ${s.upper}\\right\\}`));
    }
  });
  return out;
}

/** The p/q with |v − p/q| < tol and the smallest q ≤ maxDen, or null. For showing 0.333… as 1/3, never for deciding. */
export function nearFraction(v: number, tol = 1e-9, maxDen = 1000): { p: number; q: number } | null {
  if (!Number.isFinite(v)) return null;
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.round(v * q);
    if (Math.abs(v - p / q) < tol) return { p, q };
  }
  return null;
}

export function fractionLatex(f: { p: number; q: number }): string {
  const sign = f.p < 0 ? "-" : "";
  return f.q === 1 ? String(f.p) : `${sign}\\frac{${Math.abs(f.p)}}{${f.q}}`;
}
