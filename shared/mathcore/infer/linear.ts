/**
 * Structural linearity (Phase 4 systems): the degree of an expression in a set of unknowns, read from its tree. A
 * system's equations must have degree ≤ 1; |x|, x², xy, sin x, x / y and user functions of the unknowns are rejected
 * whatever the parameter values are, so the decision never depends on where F happens to be sampled.
 */
import type { Expr } from "../ast/expr";
import { args, containsSymbol, head, isFn, isNum, isSym } from "../ast/expr";

const NONLINEAR = Infinity;

export function degreeIn(e: Expr, unknowns: readonly string[]): number {
  if (isNum(e)) return 0;
  if (isSym(e)) return unknowns.includes(e) ? 1 : 0;
  if (!isFn(e)) return 0;
  const depends = (x: Expr) => unknowns.some((u) => containsSymbol(x, u));
  if (!depends(e)) return 0;
  const a = args(e);
  switch (head(e)) {
    case "Add":
    case "Subtract":
    case "Negate":
      return Math.max(...a.map((x) => degreeIn(x, unknowns)));
    case "Multiply":
      return a.reduce<number>((s, x) => s + degreeIn(x, unknowns), 0);
    case "Divide":
      return depends(a[1]) ? NONLINEAR : degreeIn(a[0], unknowns);
    case "Power":
      // x¹ only; a constant base with an unknown exponent (2^x) is not polynomial.
      return !depends(a[1]) && a[1] === 1 ? degreeIn(a[0], unknowns) : NONLINEAR;
    default:
      // Any other function of an unknown (Abs, Sin, Sqrt, a user function, …).
      return NONLINEAR;
  }
}

export const isLinearIn = (e: Expr, unknowns: readonly string[]): boolean => degreeIn(e, unknowns) <= 1;
