/**
 * Type inference (STEPS.md §6.2). Pure and total: never throws; anything it cannot classify is `Unknown` with a reason.
 * Order matters: the ODE form is checked before the generic `Equal` cases.
 */
import type { Expr } from "../ast/expr";
import { CONSTANTS, args, containsSymbol, freeSymbols, head, isFn, isNum, isSym } from "../ast/expr";
import { RESERVED_SYMBOLS } from "../constants";
import { DISTRIBUTION_HEADS } from "../normalize/normalize";

export type InferredType =
  | { kind: "Scalar"; name: string; expr: Expr; literal: number | null }
  | { kind: "Value"; expr: Expr }
  | { kind: "Explicit"; dependent: "y" | "x"; independent: "x" | "y"; rhs: Expr }
  | { kind: "Polar"; rhs: Expr }
  | { kind: "Parametric"; x: Expr; y: Expr; parameter: "t" }
  | { kind: "Point"; x: Expr; y: Expr }
  | { kind: "Implicit"; F: Expr; relation: "=" | "<" | "<=" | ">" | ">="; strict: boolean }
  | { kind: "RiemannSum"; body: Expr; variable: string; a: Expr; b: Expr }
  | { kind: "Matrix2" | "Matrix3"; name: string | null; rows: Expr[][] }
  | { kind: "ODE1"; dependent: string; independent: string; F: Expr }
  | { kind: "Distribution"; family: string; args: Expr[] }
  | { kind: "FunctionDef"; name: string; params: string[]; body: Expr }
  | { kind: "Unknown"; reason: string };

const unknown = (reason: string): InferredType => ({ kind: "Unknown", reason });

/** Free symbols that are not reserved (the parameters an item depends on). */
export function parameterSymbols(e: Expr): string[] {
  return Array.from(freeSymbols(e)).filter((s) => !RESERVED_SYMBOLS.has(s)).sort();
}

const freeOf = (e: Expr, names: string[]) => names.every((n) => !containsSymbol(e, n));

/** Numeric literal value of a constant expression without symbols (`2`, `-3`, `1/2`), else null. */
export function numericValue(e: Expr): number | null {
  if (isNum(e)) return e;
  if (!isFn(e)) return null;
  const a = args(e).map(numericValue);
  if (a.some((v) => v === null)) return null;
  const v = a as number[];
  switch (head(e)) {
    case "Negate":
      return -v[0];
    case "Divide":
      return v[0] / v[1];
    case "Add":
      return v.reduce((s, x) => s + x, 0);
    case "Subtract":
      return v[0] - v[1];
    case "Multiply":
      return v.reduce((s, x) => s * x, 1);
    default:
      return null;
  }
}

const RELATIONS: Readonly<Record<string, "=" | "<" | "<=" | ">" | ">=">> = {
  Equal: "=", Less: "<", LessEqual: "<=", Greater: ">", GreaterEqual: ">=",
};

export function inferType(expr: Expr): InferredType {
  try {
    return infer(expr);
  } catch (err) {
    return unknown(`inference failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function infer(e: Expr): InferredType {
  if (isNum(e)) return { kind: "Value", expr: e };
  if (isSym(e)) {
    if (e === "x") return explicitFromBare(e);
    if (RESERVED_SYMBOLS.has(e)) return unknown(`${e} alone needs an equation`);
    return { kind: "Value", expr: e };
  }
  const h = head(e) as string;
  const a = args(e);

  if (h === "Define") {
    const [name, params, body] = a;
    if (!isSym(name) || !isFn(params) || params[0] !== "List" || body === undefined) return unknown("malformed function definition");
    const names = params.slice(1);
    if (!names.every(isSym)) return unknown("function parameters must be names");
    return { kind: "FunctionDef", name, params: names, body };
  }

  if (h === "Equal" && a.length === 2) {
    const [lhs, rhs] = a;
    // ODE first (§6.2): D(y, x) = F(x, y).
    if (head(lhs) === "D") {
      const [dep, ind] = args(lhs);
      if (isSym(dep) && isSym(ind) && dep === ind) return unknown("a variable cannot be differentiated with respect to itself");
      if (isSym(dep) && isSym(ind)) return { kind: "ODE1", dependent: dep, independent: ind, F: rhs };
      return unknown("only first-order ODEs dy/dx = F(x, y) are supported");
    }
    if (head(rhs) === "D") return unknown("write the derivative on the left: dy/dx = F(x, y)");

    // Named matrix: M = [[…]].
    if (isSym(lhs) && head(rhs) === "Matrix") return matrix(rhs, lhs);

    // Scalar definition: name = expression without reserved symbols.
    if (isSym(lhs) && !RESERVED_SYMBOLS.has(lhs) && !(lhs in CONSTANTS)) {
      const reserved = Array.from(freeSymbols(rhs)).filter((s) => RESERVED_SYMBOLS.has(s));
      if (reserved.length === 0 && !containsSymbol(rhs, lhs)) return { kind: "Scalar", name: lhs, expr: rhs, literal: numericValue(rhs) };
    }

    const explicit = explicitForm(lhs, rhs) ?? explicitForm(rhs, lhs);
    if (explicit) return explicit;
    if (lhs === "z" || rhs === "z") return unknown("z = f(x, y) surfaces need 3D (deferred by decision D3)");
    return implicit(lhs, rhs, "=");
  }

  if (RELATIONS[h] && a.length === 2) return implicit(a[0], a[1], RELATIONS[h]);
  if (RELATIONS[h]) return unknown("chained comparisons are only supported as restrictions {a < x < b}");

  if (h === "Tuple") {
    if (a.length !== 2) return a.length === 3 ? unknown("3D points need decision D3") : unknown("only (x, y) pairs are supported");
    const [x, y] = a;
    const usesT = containsSymbol(x, "t") || containsSymbol(y, "t");
    if (!freeOf(x, ["x", "y"]) || !freeOf(y, ["x", "y"])) return unknown("a pair cannot use x or y; use t for parametric curves");
    return usesT ? { kind: "Parametric", x, y, parameter: "t" } : { kind: "Point", x, y };
  }

  if (h === "Matrix") return matrix(e, null);
  // A definite integral is a teaching RiemannSum when it is a number; with x free it is a function of x (Explicit).
  if (h === "Integrate" && a.length === 4 && isSym(a[1]) && !freeSymbols(e).has("x")) {
    return { kind: "RiemannSum", body: a[0], variable: a[1], a: a[2], b: a[3] };
  }
  if (DISTRIBUTION_HEADS.has(h)) return { kind: "Distribution", family: h, args: a };

  const free = freeSymbols(e);
  if (free.has("z") && !free.has("x") && !free.has("y")) return unknown("w = f(z) complex maps are deferred by decision D2");
  if (free.has("y")) return unknown("an expression in y needs an equation, for example x = g(y) or F(x, y) = 0");
  return explicitFromBare(e);
}

/** A bare expression in x plots as y = f(x) (Desmos behaviour); without x it is a value. */
function explicitFromBare(e: Expr): InferredType {
  if (!containsSymbol(e, "x")) return { kind: "Value", expr: e };
  return { kind: "Explicit", dependent: "y", independent: "x", rhs: e };
}

function explicitForm(side: Expr, other: Expr): InferredType | null {
  if (side === "y" && !containsSymbol(other, "y")) return { kind: "Explicit", dependent: "y", independent: "x", rhs: other };
  if (side === "x" && !containsSymbol(other, "x") && !containsSymbol(other, "theta") && !containsSymbol(other, "r")) {
    return { kind: "Explicit", dependent: "x", independent: "y", rhs: other };
  }
  if (side === "r" && freeOf(other, ["r", "x", "y"])) return { kind: "Polar", rhs: other };
  return null;
}

function implicit(lhs: Expr, rhs: Expr, relation: "=" | "<" | "<=" | ">" | ">="): InferredType {
  const F: Expr = ["Subtract", lhs, rhs];
  const free = freeSymbols(F);
  if (free.has("z")) return unknown("equations in z need 3D or complex mode (decisions D2, D3)");
  if (!free.has("x") && !free.has("y")) return unknown("an equation needs x or y to plot");
  return { kind: "Implicit", F, relation, strict: relation === "<" || relation === ">" };
}

function matrix(m: Expr, name: string | null): InferredType {
  const rowsList = args(m)[0];
  if (!isFn(rowsList) || rowsList[0] !== "List") return unknown("malformed matrix");
  const rows = args(rowsList).map((r) => (isFn(r) && r[0] === "List" ? args(r) : null));
  if (rows.some((r) => r === null)) return unknown("malformed matrix row");
  const n = rows.length;
  if ((n !== 2 && n !== 3) || rows.some((r) => (r as Expr[]).length !== n)) return unknown("only 2×2 and 3×3 matrices are supported in v1");
  return { kind: n === 2 ? "Matrix2" : "Matrix3", name, rows: rows as Expr[][] };
}
