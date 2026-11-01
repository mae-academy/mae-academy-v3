/** Numbers in LaTeX for reports and step-by-step elimination (STEPS.md §8.2). */
import { DISPLAY_DIGITS } from "../constants";

/** LaTeX of a double with DISPLAY_DIGITS significant digits: `2.5`, `-1.41421`, `3.2 \times 10^{-7}` (never `3.2e-7`). */
export function numberLatex(x: number): string {
  if (Number.isNaN(x)) return "\\text{undefined}";
  if (!Number.isFinite(x)) return x > 0 ? "\\infty" : "-\\infty";
  const r = Number(x.toPrecision(DISPLAY_DIGITS));
  if (r === 0) return "0";
  if (Math.abs(r) >= 1e6 || Math.abs(r) < 1e-4) {
    const [m, e] = r.toExponential(DISPLAY_DIGITS - 1).split("e");
    return `${String(Number(m))} \\times 10^{${Number(e)}}`;
  }
  return String(r);
}

/** Plain text of a double with DISPLAY_DIGITS significant digits (canvas labels, spoken descriptions). */
export function numberText(x: number): string {
  return String(Number(x.toPrecision(DISPLAY_DIGITS)));
}
