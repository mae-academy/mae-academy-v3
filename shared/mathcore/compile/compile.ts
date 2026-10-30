/**
 * Closure compiler (ADR-3, STEPS.md §7.1): core expression → a tree of closures over a slot array.
 * No `eval`, no `new Function`. Compile once, evaluate many; results are cached by expression hash.
 *
 * Real-number semantics (shared with the mpmath oracle in scripts/mathcore/oracle/evaluate.py):
 *  - x^(p/q) with a literal fraction p/q, q odd, is the real root for negative x (Desmos behaviour).
 *  - Root(x, n) for odd n is the real root; even roots of negatives are NaN.
 *  - Log(x) is base 10, Log(x, b) is base b; Arcsec/Arccsc/Arccot use 1/x (arccot(0) = π/2).
 *  - Round is half away from zero; Mod is floored (a − b·⌊a/b⌋); Factorial(x) = Γ(x + 1).
 *  - Comparisons give 1 or 0; `When(v, c)` is v where c holds, else NaN (domain restriction).
 */
import type { Expr } from "../ast/expr";
import { CONSTANTS, args, hashExpr, head, isFn, isNum, isSym } from "../ast/expr";
import { adaptiveSimpson } from "../calculus/integrate";
import { DERIVATIVE_STEP_SCALE, MAX_CALL_DEPTH, MAX_SUM_TERMS } from "../constants";
import { erf, erfc, gamma } from "../stats/special";

export class CompileError extends Error {}

type Slots = Float64Array;
type Node = (s: Slots) => number;

export interface FunctionDef {
  params: readonly string[];
  body: Expr;
}

export interface CompileOptions {
  /** Variable names in slot order: the caller passes values in this order. */
  variables: readonly string[];
  /** User functions available to `Apply`. */
  functions?: ReadonlyMap<string, FunctionDef>;
}

export interface CompiledExpr {
  /** Evaluates with values in `variables` order. Not reentrant across calls from inside itself. */
  evaluate(values: ArrayLike<number>): number;
  readonly variables: readonly string[];
  readonly hash: string;
}

let depth = 0;

/** Real power with the odd-denominator rule for literal fractional exponents. */
export function realPower(base: number, exp: number, oddDenominator: number | null, numerator: number | null): number {
  if (base < 0 && oddDenominator !== null && numerator !== null) {
    const mag = Math.pow(-base, Math.abs(numerator) / oddDenominator);
    const signed = numerator % 2 === 0 ? mag : -mag;
    return numerator < 0 ? 1 / signed : signed;
  }
  return Math.pow(base, exp);
}

export function realRoot(x: number, n: number): number {
  if (!Number.isInteger(n) || n === 0) return Math.pow(x, 1 / n);
  if (x < 0) return n % 2 !== 0 ? -realRoot(-x, n) : NaN;
  if (n === 2) return Math.sqrt(x);
  if (n === 3) return Math.cbrt(x);
  return Math.pow(x, 1 / n);
}

export function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

export function flooredMod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

const UNARY: Readonly<Record<string, (x: number) => number>> = {
  Negate: (x) => -x,
  Sqrt: Math.sqrt,
  Abs: Math.abs,
  Exp: Math.exp,
  Ln: Math.log,
  Sin: Math.sin,
  Cos: Math.cos,
  Tan: Math.tan,
  Sec: (x) => 1 / Math.cos(x),
  Csc: (x) => 1 / Math.sin(x),
  Cot: (x) => Math.cos(x) / Math.sin(x),
  Arcsin: Math.asin,
  Arccos: Math.acos,
  Arctan: Math.atan,
  Arcsec: (x) => Math.acos(1 / x),
  Arccsc: (x) => Math.asin(1 / x),
  Arccot: (x) => (x === 0 ? Math.PI / 2 : Math.atan(1 / x)),
  Sinh: Math.sinh,
  Cosh: Math.cosh,
  Tanh: Math.tanh,
  Sech: (x) => 1 / Math.cosh(x),
  Csch: (x) => 1 / Math.sinh(x),
  Coth: (x) => 1 / Math.tanh(x),
  Arsinh: Math.asinh,
  Arcosh: Math.acosh,
  Artanh: Math.atanh,
  Floor: Math.floor,
  Ceil: Math.ceil,
  Round: roundHalfAway,
  Sign: Math.sign,
  Gamma: gamma,
  Factorial: (x) => gamma(x + 1),
  Erf: erf,
  Erfc: erfc,
  Not: (x) => (Number.isNaN(x) ? NaN : x === 0 ? 1 : 0),
};

const COMPARE: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  Equal: (a, b) => a === b,
  NotEqual: (a, b) => a !== b,
  Less: (a, b) => a < b,
  LessEqual: (a, b) => a <= b,
  Greater: (a, b) => a > b,
  GreaterEqual: (a, b) => a >= b,
};

/** Literal p/q (or -p/q) exponent: returns [p, q] for integer p, q. */
function literalFraction(e: Expr): [number, number] | null {
  let sign = 1;
  let x = e;
  if (isFn(x) && x[0] === "Negate") {
    sign = -1;
    x = x[1];
  }
  if (isFn(x) && x[0] === "Divide" && isNum(x[1]) && isNum(x[2])) {
    const p = x[1];
    const q = x[2];
    if (Number.isInteger(p) && Number.isInteger(q) && q !== 0) return [sign * p, q];
  }
  return null;
}

class Compiler {
  private readonly slotOf = new Map<string, number>();
  slotCount = 0;
  constructor(
    variables: readonly string[],
    private readonly functions: ReadonlyMap<string, FunctionDef>,
  ) {
    for (const v of variables) this.slot(v);
  }

  private slot(name: string): number {
    let i = this.slotOf.get(name);
    if (i === undefined) {
      i = this.slotCount++;
      this.slotOf.set(name, i);
    }
    return i;
  }

  /** Temporarily binds `name` to a fresh slot (for Σ, Π, ∫ variables) while compiling `body`. */
  private withBound<T>(name: string, fn: (slot: number) => T): T {
    const prev = this.slotOf.get(name);
    const s = this.slotCount++;
    this.slotOf.set(name, s);
    try {
      return fn(s);
    } finally {
      if (prev === undefined) this.slotOf.delete(name);
      else this.slotOf.set(name, prev);
    }
  }

  compile(e: Expr): Node {
    if (isNum(e)) return () => e;
    if (isSym(e)) {
      if (e in CONSTANTS) {
        const c = CONSTANTS[e];
        return () => c;
      }
      const i = this.slotOf.get(e);
      if (i === undefined) throw new CompileError(`Undefined symbol: ${e}`);
      return (s) => s[i];
    }
    const h = head(e) as string;
    const a = args(e);
    const un = UNARY[h];
    if (un && a.length === 1) {
      const x = this.compile(a[0]);
      return (s) => un(x(s));
    }
    const cmp = COMPARE[h];
    if (cmp) return this.comparison(cmp, a);
    switch (h) {
      case "Add":
        return this.fold(a, (x, y) => x + y, 0);
      case "Multiply":
        return this.fold(a, (x, y) => x * y, 1);
      case "Subtract": {
        this.arity(h, a, 2);
        const [x, y] = a.map((n) => this.compile(n));
        return (s) => x(s) - y(s);
      }
      case "Divide": {
        this.arity(h, a, 2);
        const [x, y] = a.map((n) => this.compile(n));
        return (s) => x(s) / y(s);
      }
      case "Power":
        return this.power(a);
      case "Root": {
        this.arity(h, a, 2);
        const [x, n] = a.map((n0) => this.compile(n0));
        return (s) => realRoot(x(s), n(s));
      }
      case "Log": {
        if (a.length === 1) {
          const x = this.compile(a[0]);
          return (s) => Math.log10(x(s));
        }
        this.arity(h, a, 2);
        const [x, b] = a.map((n) => this.compile(n));
        return (s) => {
          const base = b(s);
          if (base === 2) return Math.log2(x(s));
          if (base === 10) return Math.log10(x(s));
          return Math.log(x(s)) / Math.log(base);
        };
      }
      case "Mod": {
        this.arity(h, a, 2);
        const [x, y] = a.map((n) => this.compile(n));
        return (s) => flooredMod(x(s), y(s));
      }
      case "Max":
      case "Min": {
        if (a.length === 0) throw new CompileError(`${h} needs arguments`);
        const xs = a.map((n) => this.compile(n));
        const pick = h === "Max" ? Math.max : Math.min;
        return (s) => {
          let r = xs[0](s);
          for (let i = 1; i < xs.length; i++) r = pick(r, xs[i](s));
          return r;
        };
      }
      case "And":
      case "Or": {
        const xs = a.map((n) => this.compile(n));
        const isAnd = h === "And";
        return (s) => {
          for (const x of xs) {
            const v = x(s);
            if (Number.isNaN(v)) return NaN;
            if (isAnd ? v === 0 : v !== 0) return isAnd ? 0 : 1;
          }
          return isAnd ? 1 : 0;
        };
      }
      case "When": {
        this.arity(h, a, 2);
        const [v, c] = a.map((n) => this.compile(n));
        return (s) => {
          const cond = c(s);
          return cond !== 0 && !Number.isNaN(cond) ? v(s) : NaN;
        };
      }
      case "D":
        return this.derivative(a);
      case "Sum":
      case "Product":
        return this.series(h, a);
      case "Integrate":
        return this.integral(a);
      case "Apply":
        return this.apply(a);
      default:
        throw new CompileError(`Cannot evaluate ${h} as a number`);
    }
  }

  private arity(h: string, a: Expr[], n: number) {
    if (a.length !== n) throw new CompileError(`${h} expects ${n} argument(s)`);
  }

  private fold(a: Expr[], op: (x: number, y: number) => number, unit: number): Node {
    const xs = a.map((n) => this.compile(n));
    if (xs.length === 0) return () => unit;
    if (xs.length === 1) return xs[0];
    if (xs.length === 2) {
      const [x, y] = xs;
      return (s) => op(x(s), y(s));
    }
    return (s) => {
      let r = xs[0](s);
      for (let i = 1; i < xs.length; i++) r = op(r, xs[i](s));
      return r;
    };
  }

  private comparison(cmp: (a: number, b: number) => boolean, a: Expr[]): Node {
    if (a.length < 2) throw new CompileError("A comparison needs two sides");
    const xs = a.map((n) => this.compile(n));
    return (s) => {
      let prev = xs[0](s);
      for (let i = 1; i < xs.length; i++) {
        const cur = xs[i](s);
        if (Number.isNaN(prev) || Number.isNaN(cur)) return NaN;
        if (!cmp(prev, cur)) return 0;
        prev = cur;
      }
      return 1;
    };
  }

  private power(a: Expr[]): Node {
    this.arity("Power", a, 2);
    const base = this.compile(a[0]);
    const frac = literalFraction(a[1]);
    if (frac && Math.abs(frac[1]) % 2 === 1) {
      const [p, q] = frac[1] < 0 ? [-frac[0], -frac[1]] : frac;
      const e = p / q;
      return (s) => realPower(base(s), e, q, p);
    }
    if (isNum(a[1])) {
      const n = a[1];
      if (n === 2) return (s) => {
        const b = base(s);
        return b * b;
      };
      return (s) => Math.pow(base(s), n);
    }
    const exp = this.compile(a[1]);
    return (s) => Math.pow(base(s), exp(s));
  }

  /** Numerical derivative d/dv of an expression by central differences, h = √ε · max(1, |v|) (STEPS.md §7.3). */
  private derivative(a: Expr[]): Node {
    this.arity("D", a, 2);
    const v = a[1];
    if (!isSym(v)) throw new CompileError("Derivative variable must be a name");
    const i = this.slotOf.get(v);
    if (i === undefined) throw new CompileError(`Derivative variable ${v} is not defined here`);
    const body = this.compile(a[0]);
    return (s) => {
      const x = s[i];
      const h = DERIVATIVE_STEP_SCALE * Math.max(1, Math.abs(x));
      s[i] = x + h;
      const up = body(s);
      s[i] = x - h;
      const down = body(s);
      s[i] = x;
      return (up - down) / (2 * h);
    };
  }

  private series(h: string, a: Expr[]): Node {
    this.arity(h, a, 4);
    const v = a[1];
    if (!isSym(v)) throw new CompileError(`${h} index must be a name`);
    const lo = this.compile(a[2]);
    const hi = this.compile(a[3]);
    return this.withBound(v, (slot) => {
      const body = this.compile(a[0]);
      const isSum = h === "Sum";
      return (s) => {
        const from = Math.ceil(lo(s));
        const to = Math.floor(hi(s));
        if (!Number.isFinite(from) || !Number.isFinite(to)) return NaN;
        if (to - from + 1 > MAX_SUM_TERMS) return NaN;
        const saved = s[slot];
        let acc = isSum ? 0 : 1;
        for (let k = from; k <= to; k++) {
          s[slot] = k;
          acc = isSum ? acc + body(s) : acc * body(s);
        }
        s[slot] = saved;
        return acc;
      };
    });
  }

  private integral(a: Expr[]): Node {
    this.arity("Integrate", a, 4);
    const v = a[1];
    if (!isSym(v)) throw new CompileError("Integration variable must be a name");
    const lo = this.compile(a[2]);
    const hi = this.compile(a[3]);
    return this.withBound(v, (slot) => {
      const body = this.compile(a[0]);
      return (s) => {
        const saved = s[slot];
        const f = (x: number) => {
          s[slot] = x;
          return body(s);
        };
        const r = adaptiveSimpson(f, lo(s), hi(s));
        s[slot] = saved;
        return r.converged ? r.value : NaN;
      };
    });
  }

  private apply(a: Expr[]): Node {
    const [name, ...rest] = a;
    if (!isSym(name)) throw new CompileError("Function name must be a symbol");
    const def = this.functions.get(name);
    if (!def) throw new CompileError(`Undefined function: ${name}`);
    if (def.params.length !== rest.length) throw new CompileError(`${name} expects ${def.params.length} argument(s)`);
    if (depth >= MAX_CALL_DEPTH) throw new CompileError(`Function calls nest deeper than ${MAX_CALL_DEPTH} (recursive definition?)`);
    depth++;
    let inner: Compiler;
    let body: Node;
    try {
      inner = new Compiler(def.params, this.functions);
      body = inner.compile(def.body);
    } finally {
      depth--;
    }
    const argNodes = rest.map((r) => this.compile(r));
    const frame = new Float64Array(inner.slotCount);
    return (s) => {
      // A fresh frame per call keeps nested calls of the same function correct.
      const f = frame.slice();
      for (let i = 0; i < argNodes.length; i++) f[i] = argNodes[i](s);
      return body(f);
    };
  }
}

const cache = new Map<string, CompiledExpr>();
/** Cache entries kept; old entries are dropped first (Map keeps insertion order). */
const CACHE_LIMIT = 512;

function functionsKey(functions: ReadonlyMap<string, FunctionDef> | undefined): string {
  if (!functions || functions.size === 0) return "";
  return Array.from(functions.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([n, d]) => `${n}(${d.params.join(",")})=${hashExpr(d.body)}`)
    .join(";");
}

/** Compiles an expression; equal expressions with equal variables and functions share one cached closure. */
export function compile(expr: Expr, opts: CompileOptions): CompiledExpr {
  const hash = hashExpr(expr);
  const key = `${hash}|${JSON.stringify(expr)}|${opts.variables.join(",")}|${functionsKey(opts.functions)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = new Compiler(opts.variables, opts.functions ?? new Map());
  const root = c.compile(expr);
  const scratch = new Float64Array(c.slotCount);
  const n = opts.variables.length;
  const compiled: CompiledExpr = {
    evaluate(values) {
      for (let i = 0; i < n; i++) scratch[i] = values[i];
      return root(scratch);
    },
    variables: opts.variables,
    hash,
  };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, compiled);
  return compiled;
}

/** Number of cached closures (for tests and the compile-once benchmark). */
export function compileCacheSize(): number {
  return cache.size;
}

export function clearCompileCache(): void {
  cache.clear();
}

/** Convenience: compile a one-variable function f(v) with fixed parameter values. */
export function compileFunction1(
  expr: Expr,
  variable: string,
  params: Readonly<Record<string, number>> = {},
  functions?: ReadonlyMap<string, FunctionDef>,
): (x: number) => number {
  const names = Object.keys(params);
  const c = compile(expr, { variables: [variable, ...names], functions });
  const vals = new Float64Array(names.length + 1);
  names.forEach((k, i) => (vals[i + 1] = params[k]));
  return (x: number) => {
    vals[0] = x;
    return c.evaluate(vals);
  };
}
