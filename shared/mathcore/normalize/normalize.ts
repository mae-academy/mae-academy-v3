/**
 * Normalization: raw MathJSON from Compute Engine 0.58.0 (`ce.parse(latex, { form: "raw" })`, owner decision Q1)
 * → the engine's core form (`ast/expr.ts`).
 *
 * Shapes this module relies on were recorded by running 0.58.0 (docs/mathcore/reports/a-1-measurements.md
 * and `mathjsonShapes.test.ts`). The rewrites:
 *  - `InvisibleOperator` → `Multiply`, or a function call when the symbol is a known or user-defined function.
 *  - `Delimiter` → its content, or `Tuple` for a comma list.
 *  - Leibniz `dy/dx`, `y'`, `\dot{x}` and `D(Equal(y, F), x)` → `Equal(["D", y, x], F)` (Q2).
 *  - `Matrix(rows, delimiter, columnSpec)` → `Matrix(rows)` (Q3).
 *  - `e` → `ExponentialE`, `e^x` → `Exp(x)`, `Lb` → `Log(x, 2)`, inverse-function notation → `Arcsin` etc.
 *  - `Sum`/`Product`/`Integrate(body, Tuple(v, a, b))` → `[head, body, v, a, b]`.
 *  - `f(x) = body` at statement level → `["Define", "f", ["List", "x"], body]`.
 * Anything else is reported as an error with the LaTeX fragment Compute Engine attached, never guessed.
 */
import type { Expr, FnExpr } from "../ast/expr";
import { isFn, isSym } from "../ast/expr";
import { RESERVED_SYMBOLS } from "../constants";
import type { ErrorKey, ErrorParams } from "../errors";

export interface NormalizeError {
  message: string;
  key?: ErrorKey;
  params?: ErrorParams;
  /** LaTeX fragment the error refers to, when Compute Engine supplied one. */
  fragment?: string;
}

export interface NormalizeContext {
  /** User-defined function names (from other items' `Define`); `f(x)` is a call only for these and built-ins. */
  functions?: ReadonlySet<string>;
}

export interface NormalizeResult {
  expr: Expr;
  errors: NormalizeError[];
}

/** Heads the compiler and type inference understand. */
export const CORE_HEADS: ReadonlySet<string> = new Set([
  "Add", "Subtract", "Negate", "Multiply", "Divide", "Power", "Sqrt", "Root", "Abs", "Exp", "Ln", "Log",
  "Sin", "Cos", "Tan", "Sec", "Csc", "Cot", "Arcsin", "Arccos", "Arctan", "Arcsec", "Arccsc", "Arccot",
  "Sinh", "Cosh", "Tanh", "Sech", "Csch", "Coth", "Arsinh", "Arcosh", "Artanh",
  "Floor", "Ceil", "Round", "Sign", "Factorial", "Gamma", "Erf", "Erfc", "Max", "Min", "Mod",
  "Equal", "NotEqual", "Less", "LessEqual", "Greater", "GreaterEqual", "When", "And", "Or", "Not",
  "Tuple", "List", "Matrix", "D", "Sum", "Product", "Integrate", "Apply", "Define",
  ...["Normal", "StudentT", "ChiSquared", "Binomial", "Poisson"],
]);

/** Distribution families (STEPS.md §8.6); their heads are values for `inferType`, not numbers. */
export const DISTRIBUTION_HEADS: ReadonlySet<string> = new Set(["Normal", "StudentT", "ChiSquared", "Binomial", "Poisson"]);

/** Function names typed as plain text or `\operatorname{…}` (they parse as symbols followed by a delimiter). */
const NAMED_FUNCTIONS: Readonly<Record<string, string>> = {
  sin: "Sin", cos: "Cos", tan: "Tan", sec: "Sec", csc: "Csc", cot: "Cot",
  arcsin: "Arcsin", arccos: "Arccos", arctan: "Arctan", arcsec: "Arcsec", arccsc: "Arccsc", arccot: "Arccot",
  sinh: "Sinh", cosh: "Cosh", tanh: "Tanh", sech: "Sech", csch: "Csch", coth: "Coth",
  arsinh: "Arsinh", arcosh: "Arcosh", artanh: "Artanh", arcsinh: "Arsinh", arccosh: "Arcosh", arctanh: "Artanh",
  exp: "Exp", ln: "Ln", log: "Log", sqrt: "Sqrt", abs: "Abs", floor: "Floor", ceil: "Ceil", round: "Round",
  sign: "Sign", sgn: "Sign", erf: "Erf", erfc: "Erfc", Gamma: "Gamma", gamma: "Gamma",
  max: "Max", min: "Min", mod: "Mod",
  Normal: "Normal", StudentT: "StudentT", T: "StudentT", ChiSquared: "ChiSquared", Binomial: "Binomial", Poisson: "Poisson",
};

/** Core heads that are not callable by name (`Mod(x, 3)` is a call; `Equal(…)` typed as text is not). */
const NOT_CALLABLE = new Set(["Equal", "NotEqual", "Less", "LessEqual", "Greater", "GreaterEqual", "When", "And", "Or", "Not",
  "Tuple", "List", "Matrix", "D", "Sum", "Product", "Integrate", "Apply", "Define"]);

/** Built-in head for a function written by name (`sin`, `\operatorname{erf}`, or a core head such as `Mod`). */
const builtinFor = (name: string): string | undefined =>
  NAMED_FUNCTIONS[name] ?? (CORE_HEADS.has(name) && !NOT_CALLABLE.has(name) ? name : undefined);

/** Text names that can be spelled letter by letter (`sin(x)` parses as `s·i·n·(x)`), longest first. */
const SPELLED = Object.keys(NAMED_FUNCTIONS)
  .filter((n) => /^[a-z]+$/.test(n) && n.length > 1)
  .sort((a, b) => b.length - a.length);

const INVERSE: Readonly<Record<string, string>> = {
  Sin: "Arcsin", Cos: "Arccos", Tan: "Arctan", Sec: "Arcsec", Csc: "Arccsc", Cot: "Arccot",
  Sinh: "Arsinh", Cosh: "Arcosh", Tanh: "Artanh",
};

const SYMBOL_ALIASES: Readonly<Record<string, string>> = { e: "ExponentialE", ExponentialE: "ExponentialE" };

/** Placeholder returned for a node that produced an error; the result is unusable when `errors` is non-empty. */
const INVALID: Expr = ["Error"];

type Raw = unknown;

const isStringLiteral = (s: string) => s.length >= 2 && s.startsWith("'") && s.endsWith("'");
const unquote = (s: string) => (isStringLiteral(s) ? s.slice(1, -1) : s);

class Normalizer {
  readonly errors: NormalizeError[] = [];
  constructor(private readonly functions: ReadonlySet<string>) {}

  fail(message: string, key?: ErrorKey, params?: ErrorParams, fragment?: string): Expr {
    this.errors.push({ message, ...(key ? { key, params: params ?? {} } : {}), ...(fragment === undefined ? {} : { fragment }) });
    return INVALID;
  }

  /** Unwraps the object forms `{num}`, `{sym}`, `{fn}`, `{str}` into the compact forms. */
  compact(node: Raw): Raw {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      const o = node as Record<string, unknown>;
      if (typeof o.num === "string") return Number(o.num.replace(/^\+/, ""));
      if (typeof o.sym === "string") return o.sym;
      if (Array.isArray(o.fn)) return o.fn;
      if (typeof o.str === "string") return `'${o.str}'`;
    }
    return node;
  }

  norm(input: Raw): Expr {
    const node = this.compact(input);
    if (typeof node === "number") return node;
    if (typeof node === "string") return this.symbol(node);
    if (!Array.isArray(node) || node.length === 0) return this.fail("Unrecognized expression", "unrecognized");
    const rawHead = this.compact(node[0]);
    const rest = node.slice(1) as Raw[];
    if (typeof rawHead !== "string") return this.applyExpression(rawHead, rest);
    return this.call(rawHead, rest);
  }

  symbol(s: string): Expr {
    if (isStringLiteral(s)) return this.fail(`Unexpected text "${unquote(s)}"`, "unexpectedText", { text: unquote(s) });
    if (s === "ImaginaryUnit") return this.fail("Complex numbers are not available yet (decision D2)", "complexNumbers");
    return SYMBOL_ALIASES[s] ?? s;
  }

  /** `["Apply", ["InverseFunction", "Sin"], x]` and similar heads that are expressions. */
  applyExpression(h: Raw, rest: Raw[]): Expr {
    if (Array.isArray(h) && h[0] === "InverseFunction" && typeof h[1] === "string" && INVERSE[h[1]] && rest.length === 1) {
      return [INVERSE[h[1]], this.norm(rest[0])];
    }
    return this.fail("Unsupported function form", "unsupportedForm");
  }

  call(h: string, rest: Raw[]): Expr {
    switch (h) {
      case "Error":
        return this.error(rest);
      case "Sequence":
        if (rest.length === 0) return this.fail("Empty expression", "emptyExpression");
        if (rest.length === 1) return this.norm(rest[0]);
        return this.tuple(rest);
      case "Delimiter":
        return this.delimiter(rest);
      case "InvisibleOperator":
        return this.invisible(rest);
      case "Apply":
        if (Array.isArray(rest[0])) return this.applyExpression(rest[0], rest.slice(1));
        if (typeof rest[0] === "string") return this.callNamed(rest[0], rest.slice(1));
        return this.fail("Unsupported function form", "unsupportedForm");
      case "Divide":
        return this.leibniz(rest) ?? this.simple("Divide", rest, 2);
      case "Power":
        return this.power(rest);
      case "Prime":
        return this.prime(rest);
      case "D":
        return this.derivative(rest);
      case "Matrix":
        return this.matrix(rest);
      case "Lb":
        return ["Log", this.norm(rest[0]), 2];
      case "Lg":
        return ["Log", this.norm(rest[0]), 10];
      case "Log":
        return rest.length === 2 ? ["Log", this.norm(rest[0]), this.norm(rest[1])] : this.simple("Log", rest, 1);
      case "Sum":
      case "Product":
      case "Integrate":
        return this.binder(h, rest);
      case "List":
        return ["List", ...rest.map((r) => this.norm(r))];
      case "Tuple":
        return ["Tuple", ...rest.map((r) => this.norm(r))];
      case "Square":
        return ["Power", this.norm(rest[0]), 2];
      default:
        if (CORE_HEADS.has(h)) return [h, ...rest.map((r) => this.norm(r))] as FnExpr;
        // A plain symbol as head (`f'(x)` gives ["f", "x"]) is a user function call.
        if (/^[A-Za-z][A-Za-z0-9_]*$/.test(h) && !/^[A-Z]/.test(h)) return ["Apply", h, ...rest.map((r) => this.norm(r))];
        return this.fail(`Unsupported operation: ${h}`, "unsupportedOperation", { name: h });
    }
  }

  simple(h: string, rest: Raw[], arity: number): Expr {
    if (rest.length !== arity) return this.fail(`${h} expects ${arity} argument(s)`, "arity", { fn: h, count: arity });
    return [h, ...rest.map((r) => this.norm(r))] as FnExpr;
  }

  error(rest: Raw[]): Expr {
    const code = typeof rest[0] === "string" ? unquote(rest[0]) : "syntax-error";
    let fragment: string | undefined;
    const where = rest[1];
    if (Array.isArray(where) && where[0] === "LatexString" && typeof where[1] === "string") fragment = unquote(where[1]).trim();
    return this.fail(code.replace(/-/g, " "), undefined, undefined, fragment);
  }

  tuple(items: Raw[]): Expr {
    return ["Tuple", ...items.map((r) => this.norm(r))];
  }

  delimiter(rest: Raw[]): Expr {
    const content = this.compact(rest[0]);
    if (content === undefined) return this.fail("Empty parentheses", "emptyParens");
    if (Array.isArray(content) && content[0] === "Sequence") {
      const items = content.slice(1) as Raw[];
      if (items.length === 0) return this.fail("Empty parentheses", "emptyParens");
      if (items.length === 1) return this.norm(items[0]);
      return this.tuple(items);
    }
    return this.norm(content);
  }

  /** Arguments of a call written as `f(…)`: a delimiter with one item or a comma list. */
  callArgs(d: Raw): Expr[] {
    const node = this.compact(d);
    if (Array.isArray(node) && node[0] === "Delimiter") {
      const content = this.compact(node[1]);
      if (Array.isArray(content) && content[0] === "Sequence") return (content.slice(1) as Raw[]).map((r) => this.norm(r));
      if (content === undefined) return [];
      return [this.norm(content)];
    }
    return [this.norm(node)];
  }

  isDelimiter(n: Raw): boolean {
    const c = this.compact(n);
    return Array.isArray(c) && c[0] === "Delimiter";
  }

  callNamed(name: string, argNodes: Raw[]): Expr {
    const args = argNodes.length === 1 && this.isDelimiter(argNodes[0]) ? this.callArgs(argNodes[0]) : argNodes.map((r) => this.norm(r));
    const builtin = builtinFor(name);
    if (builtin) return this.builtinCall(builtin, args);
    return ["Apply", name, ...args];
  }

  builtinCall(h: string, args: Expr[]): Expr {
    if (h === "Log" && args.length === 2) return ["Log", args[0], args[1]];
    if (DISTRIBUTION_HEADS.has(h)) return [h, ...args] as FnExpr;
    const variadic = h === "Max" || h === "Min";
    const binary = h === "Mod";
    if (variadic ? args.length < 1 : binary ? args.length !== 2 : args.length !== 1) {
      return this.fail(`${h} has the wrong number of arguments`, "wrongArgCount", { fn: h });
    }
    return [h, ...args] as FnExpr;
  }

  /** Implicit multiplication and function application: `2x`, `ab`, `f(x)`, `sin(x)` typed as letters. */
  invisible(rest: Raw[]): Expr {
    const items = rest.map((r) => this.compact(r));
    const factors: Expr[] = [];
    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      const next = items[i + 1];
      if (typeof cur === "string" && !isStringLiteral(cur) && next !== undefined && this.isDelimiter(next)) {
        if (builtinFor(cur) || this.functions.has(cur)) {
          factors.push(this.callNamed(cur, [next]));
          i++;
          continue;
        }
        // Letters spelling a function name: s·i·n·(x) → sin(x), and 2·a·s·i·n·(x) → 2·a·sin(x).
        let start = i;
        while (start > 0 && typeof items[start - 1] === "string" && (items[start - 1] as string).length === 1) start--;
        const run = (items.slice(start, i + 1) as string[]).join("");
        const name = SPELLED.find((n) => run.endsWith(n));
        if (name && run.length >= name.length) {
          const first = i + 1 - name.length;
          if (first >= start && items.slice(first, i + 1).every((s) => typeof s === "string" && s.length === 1)) {
            // The letters before `cur` were already pushed as factors; replace them with the call.
            factors.splice(factors.length - (i - first));
            factors.push(this.callNamed(name, [next]));
            i++;
            continue;
          }
        }
      }
      factors.push(this.norm(cur));
    }
    if (factors.length === 0) return this.fail("Empty expression", "emptyExpression");
    return factors.length === 1 ? factors[0] : ["Multiply", ...factors];
  }

  /** `\frac{dy}{dx}` and `\frac{d^2y}{dx^2}` (raw: Divide of InvisibleOperator(d, y) by InvisibleOperator(d, x)). */
  leibniz(rest: Raw[]): Expr | null {
    if (rest.length !== 2) return null;
    const num = this.compact(rest[0]);
    const den = this.compact(rest[1]);
    const pair = (n: Raw): [Raw, Raw] | null =>
      Array.isArray(n) && n[0] === "InvisibleOperator" && n.length === 3 ? [this.compact(n[1]), this.compact(n[2])] : null;
    const pn = pair(num);
    const pd = pair(den);
    if (!pn || !pd) return null;
    const [dn, y] = pn;
    const [dd, x] = pd;
    if (dn === "d" && dd === "d" && typeof y === "string" && typeof x === "string" && !isStringLiteral(y) && !isStringLiteral(x)) {
      return ["D", y, x];
    }
    // Second order: d^2 y / d x^2
    const isD2 = (n: Raw) => Array.isArray(n) && n[0] === "Power" && n[1] === "d" && n[2] === 2;
    const isX2 = (n: Raw) => Array.isArray(n) && n[0] === "Power" && typeof n[1] === "string" && n[2] === 2;
    if (isD2(dn) && dd === "d" && typeof y === "string" && isX2(x)) {
      const v = (x as unknown[])[1] as string;
      return ["D", ["D", y, v], v];
    }
    return null;
  }

  power(rest: Raw[]): Expr {
    if (rest.length !== 2) return this.fail("Power expects 2 arguments", "powerArity");
    const base = this.norm(rest[0]);
    const exp = this.norm(rest[1]);
    if (base === "ExponentialE") return ["Exp", exp];
    return ["Power", base, exp];
  }

  /** `y'` → D(y, x); `f'(x)` arrives as `D(["f","x"], "x")` and is handled by `derivative`. */
  prime(rest: Raw[]): Expr {
    const target = this.norm(rest[0]);
    const order = typeof rest[1] === "number" ? rest[1] : 1;
    if (!isSym(target)) return this.fail("Prime notation needs a variable name", "primeNeedsName");
    // y' is d/dx; x' is d/dt (a prime on x means time, as in x' = y for a 2D system).
    const independent = target === "x" ? "t" : "x";
    let e: Expr = target;
    for (let k = 0; k < order; k++) e = ["D", e, independent];
    return e;
  }

  derivative(rest: Raw[]): Expr {
    if (rest.length < 2) return this.fail("Derivative needs a variable", "derivativeNeedsVariable");
    const body = this.compact(rest[0]);
    const vars = rest.slice(1).map((v) => this.compact(v));
    if (!vars.every((v) => typeof v === "string" && !isStringLiteral(v))) return this.fail("Derivative variable must be a name", "derivativeVariableName");
    // `\frac{d}{dx} y = F` parses as D(Equal(y, F), x): move D onto the left side (Q2).
    if (Array.isArray(body) && body[0] === "Equal" && body.length === 3) {
      let lhs = this.norm(body[1]);
      for (const v of vars as string[]) lhs = ["D", lhs, v];
      return ["Equal", lhs, this.norm(body[2])];
    }
    let e = this.norm(body);
    for (const v of vars as string[]) e = ["D", e, v];
    return e;
  }

  matrix(rest: Raw[]): Expr {
    const rows = this.compact(rest[0]);
    if (!Array.isArray(rows) || rows[0] !== "List") return this.fail("Matrix rows are missing", "matrixRowsMissing");
    const out: Expr[] = [];
    for (const row of rows.slice(1) as Raw[]) {
      const r = this.compact(row);
      if (!Array.isArray(r) || r[0] !== "List") return this.fail("Matrix row is not a list", "matrixRowNotList");
      out.push(["List", ...(r.slice(1) as Raw[]).map((c) => this.norm(c))]);
    }
    return ["Matrix", ["List", ...out]];
  }

  binder(h: string, rest: Raw[]): Expr {
    const body = this.norm(rest[0]);
    const lim = this.compact(rest[1]);
    if (Array.isArray(lim) && (lim[0] === "Tuple" || lim[0] === "Limits") && lim.length === 4 && typeof lim[1] === "string") {
      return [h, body, lim[1], this.norm(lim[2]), this.norm(lim[3])];
    }
    return this.fail(h === "Integrate" ? "Only definite integrals with both limits are supported" : `${h} needs an index and both limits`, h === "Integrate" ? "integralLimits" : "needsIndexLimits", { name: h });
  }
}

/** Normalizes one raw MathJSON expression. */
export function normalize(raw: unknown, ctx: NormalizeContext = {}): NormalizeResult {
  const n = new Normalizer(ctx.functions ?? new Set());
  const expr = n.norm(raw);
  return { expr, errors: n.errors };
}

/**
 * Normalizes one expression-list line. In addition to `normalize`, a top-level `f(x, …) = body` whose name is not
 * reserved becomes `["Define", f, ["List", params…], body]`.
 */
export function normalizeStatement(raw: unknown, ctx: NormalizeContext = {}): NormalizeResult {
  const def = functionDefinition(raw);
  if (def) {
    const n = new Normalizer(new Set(Array.from(ctx.functions ?? []).concat(def.name)));
    const body = n.norm(def.body);
    return { expr: ["Define", def.name, ["List", ...def.params], body], errors: n.errors };
  }
  return normalize(raw, ctx);
}

function functionDefinition(raw: unknown): { name: string; params: string[]; body: unknown } | null {
  if (!Array.isArray(raw) || raw[0] !== "Equal" || raw.length !== 3) return null;
  const lhs: unknown = raw[1];
  if (!Array.isArray(lhs) || lhs[0] !== "InvisibleOperator" || lhs.length !== 3) return null;
  const name: unknown = lhs[1];
  const delim: unknown = lhs[2];
  if (typeof name !== "string" || isStringLiteral(name) || RESERVED_SYMBOLS.has(name) || NAMED_FUNCTIONS[name]) return null;
  if (!/^[A-Za-z](_[A-Za-z0-9]+)?$/.test(name)) return null;
  if (!Array.isArray(delim) || delim[0] !== "Delimiter") return null;
  const content: unknown = delim[1];
  const params = Array.isArray(content) && content[0] === "Sequence" ? content.slice(1) : [content];
  if (params.length === 0 || !params.every((p) => typeof p === "string" && !isStringLiteral(p))) return null;
  if (new Set(params).size !== params.length) return null;
  return { name, params: params as string[], body: raw[2] };
}

/** True when the expression still carries an error placeholder. */
export function hasInvalid(e: Expr): boolean {
  if (!isFn(e)) return false;
  if (e[0] === "Error") return true;
  for (let i = 1; i < e.length; i++) if (hasInvalid(e[i])) return true;
  return false;
}
