/**
 * Core expression form: the engine's normalized MathJSON subset.
 *
 *   Expr = number | symbol | [head, ...args]
 *
 * Symbols are plain strings (`"x"`, `"Pi"`, `"theta"`). String literals never survive normalization.
 * Only `shared/mathcore/normalize/` produces this form; everything downstream reads it.
 */

export type Expr = number | string | FnExpr;
export type FnExpr = [string, ...Expr[]];

export const isNum = (e: Expr): e is number => typeof e === "number";
export const isSym = (e: Expr): e is string => typeof e === "string";
export const isFn = (e: Expr): e is FnExpr => Array.isArray(e);
export const head = (e: Expr): string | null => (isFn(e) ? e[0] : null);
export const args = (e: Expr): Expr[] => (isFn(e) ? (e.slice(1)) : []);

/** Named constants the compiler knows. Anything else that is a symbol is a variable or parameter. */
export const CONSTANTS: Readonly<Record<string, number>> = {
  Pi: Math.PI,
  ExponentialE: Math.E,
  PositiveInfinity: Infinity,
  NegativeInfinity: -Infinity,
  NaN: NaN,
};

export function nodeCount(e: Expr): number {
  if (!isFn(e)) return 1;
  let n = 1;
  for (let i = 1; i < e.length; i++) n += nodeCount(e[i]);
  return n;
}

/** Heads whose first argument after the body is a bound variable (`Sum(body, n, a, b)`). */
const BINDERS = new Set(["Sum", "Product", "Integrate"]);

/** Free symbols, excluding constants, bound variables, function names and the given extra names. */
export function freeSymbols(e: Expr, out: Set<string> = new Set(), bound: ReadonlySet<string> = new Set()): Set<string> {
  if (isSym(e)) {
    if (!(e in CONSTANTS) && !bound.has(e)) out.add(e);
  } else if (isFn(e)) {
    const [h, ...rest] = e;
    if (BINDERS.has(h) && rest.length >= 2 && isSym(rest[1])) {
      const inner = new Set(bound).add(rest[1]);
      freeSymbols(rest[0], out, inner);
      for (const a of rest.slice(2)) freeSymbols(a, out, bound);
    } else if (h === "Apply") {
      for (const a of rest.slice(1)) freeSymbols(a, out, bound);
    } else if (h === "D") {
      for (const a of rest) freeSymbols(a, out, bound);
    } else {
      for (const a of rest) freeSymbols(a, out, bound);
    }
  }
  return out;
}

/** Names of user functions called with `Apply`. */
export function calledFunctions(e: Expr, out: Set<string> = new Set()): Set<string> {
  if (isFn(e)) {
    if (e[0] === "Apply" && isSym(e[1])) out.add(e[1]);
    for (let i = 1; i < e.length; i++) calledFunctions(e[i], out);
  }
  return out;
}

export function containsSymbol(e: Expr, name: string): boolean {
  if (isSym(e)) return e === name;
  if (isFn(e)) for (let i = 1; i < e.length; i++) if (containsSymbol(e[i], name)) return true;
  return false;
}

/** Deterministic text of an expression; equal trees give equal strings. */
export function stableKey(e: Expr): string {
  return JSON.stringify(e);
}

/** 32-bit FNV-1a hash of the stable key, as 8 hex digits (STEPS.md §7.1: closures cached by MathJSON hash). */
export function hashExpr(e: Expr): string {
  const s = stableKey(e);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
