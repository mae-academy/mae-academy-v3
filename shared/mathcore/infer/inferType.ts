/**
 * Type inference (STEPS.md §6.2). Pure and total: never throws; anything it cannot classify is `Unknown` with a reason.
 * Order matters: the ODE form is checked before the generic `Equal` cases.
 */
import type { Expr } from "../ast/expr";
import { CONSTANTS, args, containsSymbol, freeSymbols, head, isFn, isNum, isSym } from "../ast/expr";
import { RESERVED_SYMBOLS } from "../constants";
import { DISTRIBUTION_HEADS } from "../normalize/normalize";
import { isLinearIn } from "./linear";

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
  | { kind: "GaussSystem"; unknowns: string[]; source: SystemSource }
  | { kind: "ODE1"; dependent: string; independent: string; F: Expr }
  | { kind: "Distribution"; family: string; args: Expr[] }
  | { kind: "FunctionDef"; name: string; params: string[]; body: Expr }
  | { kind: "Unknown"; reason: string };

/**
 * A x = b (STEPS.md §6.1 GaussSystem): a literal or named n×n matrix times a column of unknowns equal to a column,
 * or n linear equations written with `cases` (unknowns x, y or x, y, z). Linearity of the equations is checked
 * numerically when the item is evaluated.
 */
export type SystemSource =
  | { form: "matrix"; A: Expr[][] | { name: string }; b: Expr[] }
  | { form: "equations"; F: Expr[] };

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

    // A x = b (or b = A x) with a literal or named matrix.
    if (head(lhs) === "Multiply" && args(lhs).length === 2 && head(args(lhs)[1]) === "Matrix") return matrixSystem(args(lhs)[0], args(lhs)[1], rhs);
    if (head(rhs) === "Multiply" && args(rhs).length === 2 && head(args(rhs)[1]) === "Matrix" && head(lhs) === "Matrix") {
      return matrixSystem(args(rhs)[0], args(rhs)[1], lhs);
    }

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
  // A system of equations: \begin{cases} … \end{cases} parses as a list of Equal.
  if (h === "List" && a.length > 0 && a.every((x) => head(x) === "Equal" && args(x).length === 2)) return equationSystem(a);
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

/** Rows of a matrix expression, or null when it is not a rectangular `Matrix(List(List …))`. */
function matrixRows(m: Expr): Expr[][] | null {
  const rowsList = args(m)[0];
  if (!isFn(rowsList) || rowsList[0] !== "List") return null;
  const rows = args(rowsList).map((r) => (isFn(r) && r[0] === "List" ? args(r) : null));
  if (rows.length === 0 || rows.some((r) => r === null || r.length !== (rows[0] as Expr[]).length)) return null;
  return rows as Expr[][];
}

function matrixSystem(A: Expr, x: Expr, b: Expr): InferredType {
  const xs = matrixRows(x);
  const bs = head(b) === "Matrix" ? matrixRows(b) : null;
  if (!xs || xs.some((r) => r.length !== 1)) return unknown("write the unknowns as a column, for example [x; y]");
  if (!bs || bs.some((r) => r.length !== 1)) return unknown("the right side of A x = b must be a column");
  const n = xs.length;
  if (n !== 2 && n !== 3) return unknown("only 2×2 and 3×3 systems are supported in v1");
  if (bs.length !== n) return unknown(`the right side needs ${n} entries, one per unknown`);
  const unknowns = xs.map((r) => r[0]);
  if (!unknowns.every((u): u is string => isSym(u) && !(u in CONSTANTS))) return unknown("the unknowns must be names, for example x, y");
  if (new Set(unknowns).size !== n) return unknown("each unknown may appear only once");
  const rhs = bs.map((r) => r[0]);
  if (rhs.some((v) => unknowns.some((u) => containsSymbol(v, u)))) return unknown("the right side cannot contain the unknowns");
  if (isSym(A)) return { kind: "GaussSystem", unknowns, source: { form: "matrix", A: { name: A }, b: rhs } };
  if (head(A) !== "Matrix") return unknown("A x = b needs a matrix A");
  const rows = matrixRows(A);
  if (!rows || rows.length !== n || rows.some((r) => r.length !== n)) return unknown(`A must be ${n}×${n} for ${n} unknowns`);
  if (rows.flat().some((v) => unknowns.some((u) => containsSymbol(v, u)))) return unknown("the matrix cannot contain the unknowns");
  return { kind: "GaussSystem", unknowns, source: { form: "matrix", A: rows, b: rhs } };
}

const SYSTEM_UNKNOWNS: Readonly<Record<number, string[]>> = { 2: ["x", "y"], 3: ["x", "y", "z"] };

function equationSystem(eqs: Expr[]): InferredType {
  const unknowns = SYSTEM_UNKNOWNS[eqs.length];
  if (!unknowns) return unknown("a system needs 2 equations in x, y or 3 equations in x, y, z");
  const F = eqs.map((eq): Expr => ["Subtract", args(eq)[0], args(eq)[1]]);
  const stray = F.flatMap((f) => Array.from(freeSymbols(f))).find((s) => RESERVED_SYMBOLS.has(s) && !unknowns.includes(s));
  if (stray) return unknown(`a system of ${eqs.length} equations uses only ${unknowns.join(", ")}; ${stray} is not allowed`);
  const bad = F.findIndex((f) => !isLinearIn(f, unknowns));
  if (bad >= 0) return unknown(`equation ${bad + 1} is not linear in ${unknowns.join(", ")}`);
  return { kind: "GaussSystem", unknowns, source: { form: "equations", F } };
}
