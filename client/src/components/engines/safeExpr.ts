/**
 * Safe arithmetic expression engine for model-written formulas (interactive sliders and their plots).
 *
 * Nothing here ever calls eval, new Function or a model-controlled property lookup: the text is tokenised, parsed by a
 * hand-written recursive-descent parser into an AST made of a closed set of node types, and evaluated by a switch over
 * those node types. Functions come from a fixed table; identifiers must be a declared variable or a constant.
 *
 * Grammar (lowest to highest precedence):
 *   sum    := term (('+' | '-') term)*
 *   term   := unary (('*' | '/' | '%') unary)*
 *   unary  := ('+' | '-') unary | power
 *   power  := atom (('^' | '**') unary)?        right-associative; the exponent may carry a sign (2^-3)
 *   atom   := number | name | name '(' args ')' | 'Math.' name | '(' sum ')'
 * Hence -2^2 = -4 and 2^3^2 = 512. `^` is POWER here (not XOR), documented to the model.
 */

export const MAX_EXPR_LENGTH = 400;
export const MAX_EXPR_DEPTH = 40;
export const MAX_EXPR_NODES = 300;

export class ExprError extends Error {
  constructor(message: string, readonly position: number) {
    super(message);
    this.name = "ExprError";
  }
}

type Fn = (...args: number[]) => number;

const sign = (x: number) => (Number.isNaN(x) ? NaN : x > 0 ? 1 : x < 0 ? -1 : 0);

/** The whitelist: name -> [function, minArgs, maxArgs]. Math.max/min accept 1..8 arguments. */
const FUNCTIONS: ReadonlyMap<string, readonly [Fn, number, number]> = new Map<string, readonly [Fn, number, number]>([
  ["sqrt", [Math.sqrt, 1, 1]],
  ["cbrt", [Math.cbrt, 1, 1]],
  ["pow", [Math.pow, 2, 2]],
  ["log", [Math.log, 1, 1]],
  ["ln", [Math.log, 1, 1]],
  ["log10", [Math.log10, 1, 1]],
  ["log2", [Math.log2, 1, 1]],
  ["exp", [Math.exp, 1, 1]],
  ["sin", [Math.sin, 1, 1]],
  ["cos", [Math.cos, 1, 1]],
  ["tan", [Math.tan, 1, 1]],
  ["asin", [Math.asin, 1, 1]],
  ["acos", [Math.acos, 1, 1]],
  ["atan", [Math.atan, 1, 1]],
  ["atan2", [Math.atan2, 2, 2]],
  ["sinh", [Math.sinh, 1, 1]],
  ["cosh", [Math.cosh, 1, 1]],
  ["tanh", [Math.tanh, 1, 1]],
  ["abs", [Math.abs, 1, 1]],
  ["min", [Math.min, 1, 8]],
  ["max", [Math.max, 1, 8]],
  ["floor", [Math.floor, 1, 1]],
  ["ceil", [Math.ceil, 1, 1]],
  ["round", [Math.round, 1, 1]],
  ["hypot", [Math.hypot, 1, 8]],
  ["sign", [sign, 1, 1]],
]);

export const SAFE_FUNCTION_NAMES: readonly string[] = Array.from(FUNCTIONS.keys()).filter((name) => name !== "ln");

const CONSTANTS: ReadonlyMap<string, number> = new Map([
  ["PI", Math.PI],
  ["E", Math.E],
]);

/** Identifiers that can never be variables, whatever the spec says (keeps prototype-ish names out of every lookup). */
const RESERVED = new Set(["Math", "this", "window", "globalThis", "self", "constructor", "prototype", "__proto__", "Function", "eval", "document", "true", "false", "null", "undefined", "NaN", "Infinity", "PI", "E"]);
for (const name of Array.from(FUNCTIONS.keys())) RESERVED.add(name);

export function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,23}$/.test(name) && !RESERVED.has(name) && !name.startsWith("__");
}

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "id"; value: string; pos: number }
  | { kind: "op"; value: string; pos: number }
  | { kind: "end"; pos: number };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || (c === "." && source[i + 1] >= "0" && source[i + 1] <= "9")) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      if (!m) throw new ExprError("Bad number", i);
      const value = Number(m[0]);
      tokens.push({ kind: "num", value, pos: i });
      i += m[0].length;
      // "2x" / "3R" implicit multiplication is not supported: make that a clear error instead of a silent misparse.
      if (/[A-Za-z_]/.test(source[i] ?? "")) throw new ExprError("Missing operator after number", i);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!;
      tokens.push({ kind: "id", value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === "*" && source[i + 1] === "*") {
      tokens.push({ kind: "op", value: "^", pos: i });
      i += 2;
      continue;
    }
    if ("+-*/%^(),.".includes(c)) {
      tokens.push({ kind: "op", value: c, pos: i });
      i++;
      continue;
    }
    // Everything else (quotes, backticks, brackets, braces, `=`, `;`, `$`, `\`, non-ASCII look-alikes, ...) is rejected.
    throw new ExprError(`Unexpected character ${JSON.stringify(c)}`, i);
  }
  tokens.push({ kind: "end", pos: source.length });
  return tokens;
}

export type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; a: Node; b: Node }
  | { t: "call"; fn: Fn; args: Node[] };

export interface ParsedExpr {
  readonly ast: Node;
  /** Variables the expression reads (declared names only). */
  readonly variables: readonly string[];
}

export interface ParseOptions {
  /** Names of the variables that may appear (parameters, `x`). */
  variables: readonly string[];
}

export function parseExpr(source: string, options: ParseOptions): ParsedExpr {
  if (typeof source !== "string") throw new ExprError("Expression must be text", 0);
  if (source.length === 0 || source.trim() === "") throw new ExprError("Empty expression", 0);
  if (source.length > MAX_EXPR_LENGTH) throw new ExprError(`Expression is longer than ${MAX_EXPR_LENGTH} characters`, MAX_EXPR_LENGTH);
  const allowed = new Set(options.variables.filter(isValidVariableName));
  const tokens = tokenize(source);
  const used = new Set<string>();
  let index = 0;
  let nodes = 0;
  let depth = 0;

  const peek = () => tokens[index];
  const next = () => tokens[index++];
  const isOp = (token: Token, value: string) => token.kind === "op" && token.value === value;
  const count = (): void => {
    if (++nodes > MAX_EXPR_NODES) throw new ExprError(`Expression is too complex (more than ${MAX_EXPR_NODES} elements)`, peek().pos);
  };
  const enter = (): void => {
    if (++depth > MAX_EXPR_DEPTH) throw new ExprError("Expression is nested too deeply", peek().pos);
  };

  function parseSum(): Node {
    enter();
    let left = parseTerm();
    while (isOp(peek(), "+") || isOp(peek(), "-")) {
      const op = (next() as { value: "+" | "-" }).value;
      const right = parseTerm();
      count();
      left = { t: "bin", op, a: left, b: right };
    }
    depth--;
    return left;
  }
  function parseTerm(): Node {
    let left = parseUnary();
    while (isOp(peek(), "*") || isOp(peek(), "/") || isOp(peek(), "%")) {
      const op = (next() as { value: "*" | "/" | "%" }).value;
      const right = parseUnary();
      count();
      left = { t: "bin", op, a: left, b: right };
    }
    return left;
  }
  function parseUnary(): Node {
    const token = peek();
    if (isOp(token, "-") || isOp(token, "+")) {
      next();
      enter();
      const operand = parseUnary();
      depth--;
      count();
      return token.kind === "op" && token.value === "-" ? { t: "neg", a: operand } : operand;
    }
    return parsePower();
  }
  function parsePower(): Node {
    const base = parseAtom();
    if (isOp(peek(), "^")) {
      next();
      enter();
      const exponent = parseUnary(); // right-associative, and allows 2^-3
      depth--;
      count();
      return { t: "bin", op: "^", a: base, b: exponent };
    }
    return base;
  }
  function parseCall(name: string, pos: number): Node {
    const entry = FUNCTIONS.get(name);
    if (!entry) throw new ExprError(`Function "${name}" is not allowed`, pos);
    next(); // (
    const args: Node[] = [];
    if (!isOp(peek(), ")")) {
      for (;;) {
        args.push(parseSum());
        if (isOp(peek(), ",")) {
          next();
          continue;
        }
        break;
      }
    }
    if (!isOp(peek(), ")")) throw new ExprError("Missing )", peek().pos);
    next();
    if (args.length < entry[1] || args.length > entry[2]) throw new ExprError(`"${name}" takes ${entry[1] === entry[2] ? entry[1] : `${entry[1]} to ${entry[2]}`} argument(s)`, pos);
    count();
    return { t: "call", fn: entry[0], args };
  }
  function parseAtom(): Node {
    const token = next();
    if (token.kind === "num") {
      count();
      return { t: "num", v: token.value };
    }
    if (token.kind === "id") {
      let name = token.value;
      let pos = token.pos;
      if (name === "Math") {
        if (!isOp(peek(), ".")) throw new ExprError('"Math" must be followed by .name', token.pos);
        next();
        const member = next();
        if (member.kind !== "id") throw new ExprError("Expected a name after Math.", member.pos);
        name = member.value;
        pos = member.pos;
        if (name === "PI" || name === "E") {
          count();
          return { t: "num", v: CONSTANTS.get(name)! };
        }
        if (!FUNCTIONS.has(name) || !isOp(peek(), "(")) throw new ExprError(`Math.${name} is not allowed`, pos);
        return parseCall(name, pos);
      }
      if (isOp(peek(), "(")) return parseCall(name, pos);
      if (isOp(peek(), ".")) throw new ExprError("Property access is not allowed", peek().pos);
      if (CONSTANTS.has(name)) {
        count();
        return { t: "num", v: CONSTANTS.get(name)! };
      }
      if (!allowed.has(name)) throw new ExprError(`Unknown name "${name}"`, token.pos);
      used.add(name);
      count();
      return { t: "var", name };
    }
    if (isOp(token, "(")) {
      const inner = parseSum();
      if (!isOp(peek(), ")")) throw new ExprError("Missing )", peek().pos);
      next();
      return inner;
    }
    if (token.kind === "end") throw new ExprError("Unexpected end of expression", token.pos);
    throw new ExprError(`Unexpected "${token.value}"`, token.pos);
  }

  const ast = parseSum();
  const rest = peek();
  if (rest.kind !== "end") throw new ExprError(isOp(rest, ")") ? "Unmatched )" : `Unexpected "${rest.kind === "op" || rest.kind === "id" ? rest.value : "number"}"`, rest.pos);
  return { ast, variables: Array.from(used) };
}

function evalNode(node: Node, scope: Readonly<Record<string, number>>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var": {
      // Own-property check: the scope is a plain object built by the caller, but never trust the prototype chain.
      const value = Object.prototype.hasOwnProperty.call(scope, node.name) ? scope[node.name] : NaN;
      return typeof value === "number" ? value : NaN;
    }
    case "neg":
      return -evalNode(node.a, scope);
    case "call":
      return node.fn(...node.args.map((arg) => evalNode(arg, scope)));
    case "bin": {
      const a = evalNode(node.a, scope);
      const b = evalNode(node.b, scope);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "^": return Math.pow(a, b);
      }
    }
  }
}

/** Evaluates a parsed expression. Never throws; a non-finite or invalid result is NaN, ±Infinity (callers show "—"). */
export function evaluate(parsed: ParsedExpr, scope: Readonly<Record<string, number>>): number {
  return evalNode(parsed.ast, scope);
}

export type CompileResult = { ok: true; expr: ParsedExpr; run: (scope: Readonly<Record<string, number>>) => number } | { ok: false; message: string; position: number };

export function compileExpr(source: string, variables: readonly string[]): CompileResult {
  try {
    const expr = parseExpr(source, { variables });
    return { ok: true, expr, run: (scope) => evaluate(expr, scope) };
  } catch (error) {
    if (error instanceof ExprError) return { ok: false, message: error.message, position: error.position };
    return { ok: false, message: "Invalid expression", position: 0 };
  }
}
