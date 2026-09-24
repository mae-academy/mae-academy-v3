/**
 * MAE Academy / Signals & Systems — Dirac calculus core.
 *
 * Owns a small LaTeX expression grammar (numbers, the integration variable,
 * elementary functions, \delta and its derivatives), symbolic differentiation,
 * domain-checked evaluation, and the four canonical Dirac integration rules.
 * Deliberately free of React, DOM, and Canvas concerns.
 */

export type FunctionName = "sin" | "cos" | "tan" | "exp" | "ln" | "log" | "sqrt" | "abs" | "u" | "r" | "sgn" | "rect" | "tri" | "sinc";
/** The default rate a bare \omega collapses to (1 Hz), matching the systemClassifier convention. */
export const DEFAULT_OMEGA = 6.28319;

export type MathNode =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; value: MathNode }
  | { kind: "add"; left: MathNode; right: MathNode }
  | { kind: "sub"; left: MathNode; right: MathNode }
  | { kind: "mul"; left: MathNode; right: MathNode }
  | { kind: "div"; left: MathNode; right: MathNode }
  | { kind: "pow"; base: MathNode; exponent: MathNode }
  | { kind: "call"; name: FunctionName; argument: MathNode }
  | { kind: "delta"; order: number; argument: MathNode }
  /** ∫₋∞ᵗ integrand(dummyVariable) d(dummyVariable) — an explicit running-integral wrapper typed
   *  directly into the equation. Its value is only known dynamically, at each sampled `t`. */
  | { kind: "runningIntegral"; integrand: MathNode; dummyVariable: string };

/** integrandText is deferred, un-parsed: a symbolic (running-integral) bound short-circuits before the
 *  integrand grammar has to resolve placeholder amplitudes like a generic x(τ). */
export type DefiniteIntegral = { lowerLatex: string; upperLatex: string; variable: string; integrandText: string };

export type IntegralEvaluation =
  | { kind: "value"; value: number; method: "dirac" | "numeric"; steps: string[] }
  | { kind: "undefined"; reason: string; steps: string[] }
  | { kind: "divergent"; steps: string[] }
  /** The bounds still contain a free symbol (the running integral ∫_{-∞}^{t}), so no number exists yet. */
  | { kind: "symbolic"; reason: string }
  | { kind: "error"; message: string };

/** Raised when an expression leaves its real domain (√ of a negative, ÷0, ln of ≤0). */
export class DomainError extends Error {
  constructor(public readonly reason: string) { super(reason); this.name = "DomainError"; }
}
class ParseError extends Error {}
/** Raised when a symbolic operator (derivative, running integral) hits a shape it cannot resolve in closed form. */
export class DifferentiationError extends Error {}

const NUMERIC_WINDOW = 400;
const num = (value: number): MathNode => ({ kind: "num", value });
const isZero = (node: MathNode) => node.kind === "num" && node.value === 0;
const isOne = (node: MathNode) => node.kind === "num" && node.value === 1;

/* ─────────────────────────── Lexer ─────────────────────────── */

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "command"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "^" | "_" | "(" | ")" | "{" | "}" | "[" | "]" | "|" | "," | "'" };

/** Flattens LaTeX spacing/decoration so the lexer only sees structural tokens. */
export function normalizeMathSource(source: string): string {
  return source
    .replaceAll("\\left", "").replaceAll("\\right", "").replaceAll("\\!", "")
    // Boundary markers, not deletion: "2\,3.14" must not glue into the single literal "23.14".
    .replaceAll("\\,", "\u0001").replaceAll("\\;", "\u0001").replaceAll("\\:", "\u0001").replaceAll("\\ ", "\u0001")
    .replaceAll("\\quad", "\u0001").replaceAll("\\qquad", "\u0001")
    .replaceAll("\\cdot", "*").replaceAll("\\times", "*").replaceAll("×", "*").replaceAll("·", "*")
    .replaceAll("−", "-").replaceAll("∞", "\\infty").replaceAll("π", "\\pi").replaceAll("τ", "\\tau")
    .replaceAll("δ", "\\delta").replaceAll("′", "'").replaceAll("″", "''").replaceAll("’", "'")
    // A boundary marker, not deletion: "\pi t" must not glue into the single command "\pit".
    .replace(/\s+/g, "\u0001");
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "\u0001") { index += 1; continue; } // whitespace boundary: skip, no token
    if (char === "\\") {
      const match = source.slice(index).match(/^\\([a-zA-Z]+)/);
      if (!match) throw new ParseError(`Unknown escape at “${source.slice(index, index + 6)}”.`);
      tokens.push({ type: "command", value: match[1] }); index += match[0].length; continue;
    }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? ""))) {
      const match = source.slice(index).match(/^\d*\.?\d+/)!;
      tokens.push({ type: "number", value: Number(match[0]) }); index += match[0].length; continue;
    }
    if (/[a-zA-Z]/.test(char)) { tokens.push({ type: "ident", value: char }); index += 1; continue; }
    if ("+-*/^_(){}[]|,'".includes(char)) { tokens.push({ type: "op", value: char as Extract<Token, { type: "op" }>["value"] }); index += 1; continue; }
    throw new ParseError(`The character “${char}” is outside the signal grammar.`);
  }
  return tokens;
}

/* ─────────────────────────── Parser ─────────────────────────── */

const FUNCTION_COMMANDS: Record<string, FunctionName> = {
  sin: "sin", cos: "cos", tan: "tan", exp: "exp", ln: "ln", log: "log", sqrt: "sqrt",
  operatorname: "sinc", text: "sinc", // resolved by the braced name that follows
};
const NAMED_FUNCTIONS: Record<string, FunctionName> = { sin: "sin", cos: "cos", tan: "tan", exp: "exp", ln: "ln", log: "log", sqrt: "sqrt", abs: "abs", u: "u", r: "r", sgn: "sgn", rect: "rect", tri: "tri", sinc: "sinc" };

class Parser {
  private position = 0;
  /** >0 while parsing an ∫'s own integrand, so parseTerm knows to stop before consuming its "dτ". */
  private integralDepth = 0;
  constructor(private readonly tokens: Token[], private readonly variable: string) {}

  private peek(offset = 0): Token | undefined { return this.tokens[this.position + offset]; }
  private next(): Token | undefined { return this.tokens[this.position++]; }
  private eat(value: string): boolean { const token = this.peek(); if (token && token.type === "op" && token.value === value) { this.position += 1; return true; } return false; }
  private expect(value: string): void { if (!this.eat(value)) throw new ParseError(`Expected “${value}” in the expression.`); }
  atEnd(): boolean { return this.position >= this.tokens.length; }

  /** True when the upcoming tokens are a differential marker: "d" followed by a dummy-variable name. */
  private isDifferentialAhead(): boolean {
    const first = this.peek();
    if (!(first?.type === "ident" && first.value === "d")) return false;
    const second = this.peek(1);
    if (!second) return false;
    if (second.type === "command" && (second.value === "tau" || second.value === "sigma" || second.value === "theta")) return true;
    return second.type === "ident";
  }

  parseExpression(): MathNode {
    let left = this.parseTerm();
    for (;;) {
      if (this.eat("+")) left = { kind: "add", left, right: this.parseTerm() };
      else if (this.eat("-")) left = { kind: "sub", left, right: this.parseTerm() };
      else return left;
    }
  }

  private parseTerm(): MathNode {
    let left = this.parseUnary();
    for (;;) {
      if (this.eat("*")) { left = { kind: "mul", left, right: this.parseUnary() }; continue; }
      if (this.eat("/")) { left = { kind: "div", left, right: this.parseUnary() }; continue; }
      if (this.integralDepth > 0 && this.isDifferentialAhead()) return left; // stop before consuming the ∫'s own "dτ"
      if (this.startsPrimary()) { left = { kind: "mul", left, right: this.parseUnary() }; continue; } // implicit product: 2t, t^3\delta(t)
      return left;
    }
  }

  /** True when the upcoming token can open a factor, which makes juxtaposition a product. */
  private startsPrimary(): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.type === "number" || token.type === "ident") return true;
    if (token.type === "command") return token.value !== "right";
    return token.type === "op" && (token.value === "(" || token.value === "|");
  }

  private parseUnary(): MathNode {
    if (this.eat("-")) return { kind: "neg", value: this.parseUnary() };
    if (this.eat("+")) return this.parseUnary();
    return this.parsePower();
  }

  private parsePower(): MathNode {
    const base = this.parsePrimary();
    if (this.eat("^")) return { kind: "pow", base, exponent: this.parseUnary() };
    return base;
  }

  private parseGroup(): MathNode {
    if (this.eat("{")) { const inner = this.parseExpression(); this.expect("}"); return inner; }
    if (this.eat("(")) { const inner = this.parseExpression(); this.expect(")"); return inner; }
    return this.parsePrimary();
  }

  /** Like parseGroup, but also accepts \left[...\right] — the explicit-wrapper bracket syntax. */
  private parseBracketGroup(): MathNode {
    if (this.eat("[")) { const inner = this.parseExpression(); this.expect("]"); return inner; }
    return this.parseGroup();
  }

  /** Non-consuming lookahead for `frac{d}{dt}`: numerator "d", denominator "d" + one variable letter. */
  private isDerivativeFracAhead(): boolean {
    const at = (offset: number, type: string, value?: string) => {
      const token = this.peek(offset);
      if (!token || token.type !== type) return false;
      return value === undefined || (token as { value: unknown }).value === value;
    };
    return at(0, "op", "{") && at(1, "ident", "d") && at(2, "op", "}") && at(3, "op", "{") && at(4, "ident", "d") && at(5, "ident") && at(6, "op", "}");
  }

  /** Parses `\int_{lower}^{upper} integrand d(dummy)`, folding a numeric-bounds integral to a constant
   *  and leaving a running integral (upper bound === this.variable) as a dynamic runningIntegral node. */
  /** The optional [...] wrapper (the explicit-syntax pill's own notation) is just a grouping
   *  convenience — with or without it, the integrand still extends up to the differential marker. */
  private parseIntegrand(): MathNode {
    if (this.eat("[")) { const inner = this.parseExpression(); this.expect("]"); return inner; }
    return this.parseExpression();
  }

  private parseIntegral(): MathNode {
    const lowerBound = this.eat("_") ? this.parseGroup() : null;
    const upperBound = this.eat("^") ? this.parseGroup() : null;
    if (!lowerBound || !upperBound) throw new ParseError("The integral needs both a lower and an upper bound, for example \\int_{-\\infty}^{t}.");
    const isRunning = upperBound.kind === "var" && upperBound.name === this.variable;

    this.integralDepth += 1;
    const integrand = this.parseIntegrand();
    this.integralDepth -= 1;

    if (!this.isDifferentialAhead()) throw new ParseError("The integral must end with its differential, for example d\\tau or dt.");
    this.next(); // "d"
    const dummyToken = this.next() as { type: "command" | "ident"; value: string };
    const dummyVariable = dummyToken.value;

    if (isRunning) return { kind: "runningIntegral", integrand, dummyVariable };

    const lowerValue = evaluateBoundNode(lowerBound);
    const upperValue = evaluateBoundNode(upperBound);
    if (lowerValue === "symbolic" || upperValue === "symbolic") {
      throw new ParseError(`This integral's bounds must be either fully numeric or an upper bound of the bare variable ${this.variable} (a running integral).`);
    }
    const outcome = evaluateIntegralNode(integrand, dummyVariable, lowerValue, upperValue);
    if (outcome.kind === "value") return num(outcome.value);
    if (outcome.kind === "undefined") throw new ParseError(outcome.reason);
    if (outcome.kind === "divergent") throw new ParseError("This definite integral diverges.");
    if (outcome.kind === "error") throw new ParseError(outcome.message);
    throw new ParseError("This integral could not be resolved to a number.");
  }

  /** Reads the braced literal name used by \operatorname{…} and \text{…}. */
  private readBracedName(): string {
    this.expect("{");
    let name = "";
    for (;;) {
      const token = this.next();
      if (!token) throw new ParseError("Unterminated operator name.");
      if (token.type === "op" && token.value === "}") return name;
      if (token.type === "ident") name += token.value;
      else if (token.type === "number") name += String(token.value);
      else throw new ParseError("Unsupported operator name.");
    }
  }

  /** Counts primes and \delta^{(n)} superscripts into a derivative order. */
  private readDeltaOrder(): number {
    let order = 0;
    while (this.peek()?.type === "op" && (this.peek() as { value: string }).value === "'") { this.position += 1; order += 1; }
    if (this.peek()?.type === "op" && (this.peek() as { value: string }).value === "^") {
      const save = this.position;
      this.position += 1;
      const braced = this.eat("{");
      const parenthesized = this.eat("(");
      let read = 0; let sawPrime = false;
      while (this.peek()?.type === "op" && (this.peek() as { value: string }).value === "'") { this.position += 1; read += 1; sawPrime = true; }
      if (!sawPrime && this.peek()?.type === "number") { read = (this.next() as { value: number }).value; }
      else if (!sawPrime) { this.position = save; return order; }
      if (parenthesized) this.expect(")");
      if (braced) this.expect("}");
      order += read;
    }
    return order;
  }

  private parsePrimary(): MathNode {
    const token = this.next();
    if (!token) throw new ParseError("The expression ends unexpectedly.");
    if (token.type === "number") return num(token.value);
    if (token.type === "op") {
      if (token.value === "(") { const inner = this.parseExpression(); this.expect(")"); return inner; }
      if (token.value === "{") { const inner = this.parseExpression(); this.expect("}"); return inner; }
      if (token.value === "|") { const inner = this.parseExpression(); this.expect("|"); return { kind: "call", name: "abs", argument: inner }; }
      throw new ParseError(`Unexpected “${token.value}”.`);
    }
    if (token.type === "ident") {
      if (token.value === "e") { if (this.eat("^")) return { kind: "call", name: "exp", argument: this.parseGroup() }; return num(Math.E); }
      const functional = NAMED_FUNCTIONS[token.value];
      const calledLikeFunction = this.peek()?.type === "op" && (this.peek() as { value: string }).value === "(";
      if (functional && calledLikeFunction) return { kind: "call", name: functional, argument: this.parseGroup() };
      if (calledLikeFunction) throw new ParseError(`“${token.value}(…)” is not a recognized signal function.`);
      return { kind: "var", name: token.value };
    }
    // LaTeX command
    if (token.value === "infty") return num(Number.POSITIVE_INFINITY);
    if (token.value === "pi") return num(Math.PI);
    // \omega collapses to a concrete 1 Hz rate, matching the systemClassifier convention.
    if (token.value === "omega") return num(DEFAULT_OMEGA);
    if (token.value === "tau" || token.value === "theta") return { kind: "var", name: token.value };
    if (token.value === "delta") { const order = this.readDeltaOrder(); return { kind: "delta", order, argument: this.parseGroup() }; }
    if (token.value === "Lambda") return { kind: "call", name: "tri", argument: this.parseGroup() };
    if (token.value === "int") return this.parseIntegral();
    if (token.value === "frac") {
      if (this.isDerivativeFracAhead()) {
        this.expect("{"); this.next(); this.expect("}"); // consume "d"
        this.expect("{"); this.next(); const diffVarToken = this.next() as { value: string }; this.expect("}"); // consume "d" + var
        const inner = this.parseBracketGroup();
        try { return differentiate(inner, diffVarToken.value); }
        catch (error) { throw new ParseError(error instanceof Error ? error.message : "That expression could not be differentiated."); }
      }
      const numerator = this.parseGroup(); const denominator = this.parseGroup(); return { kind: "div", left: numerator, right: denominator };
    }
    if (token.value === "sqrt") { if (this.eat("[")) throw new ParseError("Only square roots are supported."); return { kind: "call", name: "sqrt", argument: this.parseGroup() }; }
    if (token.value === "operatorname" || token.value === "text" || token.value === "mathrm") {
      const name = this.readBracedName();
      const resolved = NAMED_FUNCTIONS[name];
      if (!resolved) throw new ParseError(`The operator “${name}” is outside the signal grammar.`);
      return { kind: "call", name: resolved, argument: this.parseGroup() };
    }
    const command = FUNCTION_COMMANDS[token.value];
    if (command && token.value !== "operatorname" && token.value !== "text") return { kind: "call", name: command, argument: this.parseGroup() };
    throw new ParseError(`The command “\\${token.value}” is outside the signal grammar.`);
  }

  variableName(): string { return this.variable; }
}

export function parseExpression(source: string, variable = "t"): MathNode {
  const parser = new Parser(tokenize(normalizeMathSource(source)), variable);
  const node = parser.parseExpression();
  if (!parser.atEnd()) throw new ParseError("Trailing symbols remain after the expression.");
  return node;
}

/* ─────────────────────── Evaluation ─────────────────────── */

export function evaluateNode(node: MathNode, variable: string, at: number): number {
  switch (node.kind) {
    case "num": return node.value;
    case "var":
      if (node.name !== variable) throw new DomainError(`“${node.name}” is a free symbol, so the integral has no numeric value.`);
      return at;
    case "neg": return -evaluateNode(node.value, variable, at);
    case "add": return evaluateNode(node.left, variable, at) + evaluateNode(node.right, variable, at);
    case "sub": return evaluateNode(node.left, variable, at) - evaluateNode(node.right, variable, at);
    case "mul": return evaluateNode(node.left, variable, at) * evaluateNode(node.right, variable, at);
    case "div": {
      const denominator = evaluateNode(node.right, variable, at);
      if (Math.abs(denominator) < 1e-12) throw new DomainError("Division by zero leaves the expression undefined at that instant.");
      return evaluateNode(node.left, variable, at) / denominator;
    }
    case "pow": {
      const base = evaluateNode(node.base, variable, at); const exponent = evaluateNode(node.exponent, variable, at);
      if (base < 0 && !Number.isInteger(exponent)) throw new DomainError(`A negative base raised to the non-integer power ${exponent} leaves the real domain.`);
      return Math.pow(base, exponent);
    }
    case "call": return evaluateCall(node.name, evaluateNode(node.argument, variable, at));
    case "delta": throw new DomainError("A Dirac impulse has no pointwise value; it is only defined under an integral.");
    case "runningIntegral": {
      const outcome = evaluateIntegralNode(node.integrand, node.dummyVariable, Number.NEGATIVE_INFINITY, at);
      if (outcome.kind === "value") return outcome.value;
      if (outcome.kind === "undefined") throw new DomainError(outcome.reason);
      if (outcome.kind === "divergent") throw new DomainError("The running integral diverges at this instant.");
      throw new DomainError(outcome.kind === "error" ? outcome.message : "The running integral could not be evaluated at this instant.");
    }
  }
}

function evaluateCall(name: FunctionName, value: number): number {
  switch (name) {
    case "sin": return Math.sin(value);
    case "cos": return Math.cos(value);
    case "tan": {
      if (Math.abs(Math.cos(value)) < 1e-12) throw new DomainError("tan is singular at that instant.");
      return Math.tan(value);
    }
    case "exp": return Math.exp(value);
    case "ln": case "log": {
      if (value <= 0) throw new DomainError(`The logarithm needs a positive argument, but it evaluates to ${Number(value.toFixed(4))}.`);
      return name === "ln" ? Math.log(value) : Math.log10(value);
    }
    case "sqrt": {
      if (value < 0) throw new DomainError(`The square root needs a non-negative radicand, but it evaluates to ${Number(value.toFixed(4))}.`);
      return Math.sqrt(value);
    }
    case "abs": return Math.abs(value);
    case "u": return value >= 0 ? 1 : 0;
    case "r": return value >= 0 ? value : 0;
    case "sgn": return Math.sign(value);
    case "rect": return Math.abs(value) <= 0.5 ? 1 : 0;
    case "tri": return Math.max(0, 1 - Math.abs(value));
    case "sinc": return Math.abs(value) < 1e-12 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
  }
}

/* ─────────────────── Symbolic differentiation ─────────────────── */

// Constant folding keeps repeated differentiation exact: without it t^3 becomes t^{3-1-1…} and
// the general (f^g)' branch would introduce a spurious ln of a negative base.
/** Shared by differentiation, integration, and the composite-signal engine's own MathNode building. */
export const add = (left: MathNode, right: MathNode): MathNode =>
  left.kind === "num" && right.kind === "num" ? num(left.value + right.value) : isZero(left) ? right : isZero(right) ? left : { kind: "add", left, right };
export const sub = (left: MathNode, right: MathNode): MathNode =>
  left.kind === "num" && right.kind === "num" ? num(left.value - right.value) : isZero(right) ? left : { kind: "sub", left, right };
export const mul = (left: MathNode, right: MathNode): MathNode =>
  left.kind === "num" && right.kind === "num" ? num(left.value * right.value) : isZero(left) || isZero(right) ? num(0) : isOne(left) ? right : isOne(right) ? left : { kind: "mul", left, right };
const delta0 = (argument: MathNode): MathNode => ({ kind: "delta", order: 0, argument });
const call = (name: FunctionName, argument: MathNode): MathNode => ({ kind: "call", name, argument });

/** Exact derivative with respect to `variable`; the δ^(n) rule depends on it being symbolic, not numeric. */
export function differentiate(node: MathNode, variable: string): MathNode {
  switch (node.kind) {
    case "num": return num(0);
    case "var": return node.name === variable ? num(1) : num(0);
    case "neg": return { kind: "neg", value: differentiate(node.value, variable) };
    case "add": return add(differentiate(node.left, variable), differentiate(node.right, variable));
    case "sub": return sub(differentiate(node.left, variable), differentiate(node.right, variable));
    case "mul": return add(mul(differentiate(node.left, variable), node.right), mul(node.left, differentiate(node.right, variable)));
    case "div": return { kind: "div", left: { kind: "sub", left: mul(differentiate(node.left, variable), node.right), right: mul(node.left, differentiate(node.right, variable)) }, right: { kind: "pow", base: node.right, exponent: num(2) } };
    case "pow": {
      const exponentDerivative = differentiate(node.exponent, variable);
      const powerRule = mul(mul(node.exponent, { kind: "pow", base: node.base, exponent: sub(node.exponent, num(1)) }), differentiate(node.base, variable));
      if (isZero(exponentDerivative)) return powerRule;
      // General case: (f^g)' = f^g (g' ln f + g f'/f)
      return mul(node, add(mul(exponentDerivative, { kind: "call", name: "ln", argument: node.base }), { kind: "div", left: mul(node.exponent, differentiate(node.base, variable)), right: node.base }));
    }
    case "call": return mul(callDerivative(node.name, node.argument), differentiate(node.argument, variable));
    case "delta": throw new DifferentiationError("A Dirac impulse cannot appear inside the differentiated factor.");
    case "runningIntegral": throw new DifferentiationError("A running integral cannot itself be symbolically differentiated in this engine.");
  }
}

function callDerivative(name: FunctionName, argument: MathNode): MathNode {
  switch (name) {
    case "sin": return { kind: "call", name: "cos", argument };
    case "cos": return { kind: "neg", value: { kind: "call", name: "sin", argument } };
    case "tan": return { kind: "div", left: num(1), right: { kind: "pow", base: { kind: "call", name: "cos", argument }, exponent: num(2) } };
    case "exp": return { kind: "call", name: "exp", argument };
    case "ln": return { kind: "div", left: num(1), right: argument };
    case "log": return { kind: "div", left: num(1), right: mul(argument, num(Math.LN10)) };
    case "sqrt": return { kind: "div", left: num(1), right: mul(num(2), { kind: "call", name: "sqrt", argument }) };
    case "abs": return { kind: "call", name: "sgn", argument };
    // Generalized (distributional) derivatives: a jump in value synthesizes a δ of that jump's height;
    // a jump only in slope (a corner) stays an ordinary, still-discontinuous function — no δ needed.
    case "u": return delta0(argument); // d/dt u(t) = δ(t)
    case "r": return call("u", argument); // d/dt r(t) = u(t): the ramp's kink, not a value jump
    case "sgn": return mul(num(2), delta0(argument)); // sgn = 2u-1, so its derivative is 2δ(t)
    case "rect": return sub(delta0(add(argument, num(0.5))), delta0(sub(argument, num(0.5)))); // rect = u(t+.5)-u(t-.5)
    case "tri": return sub(add(call("u", add(argument, num(1))), mul(num(-2), call("u", argument))), call("u", sub(argument, num(1)))); // corners only, no δ
    case "sinc": // sinc(t) = sin(πt)/(πt) ⇒ sinc'(t) = cos(πt)/t − sin(πt)/(πt²), via the quotient rule
      return sub(
        { kind: "div", left: { kind: "call", name: "cos", argument: mul(num(Math.PI), argument) }, right: argument },
        { kind: "div", left: { kind: "call", name: "sin", argument: mul(num(Math.PI), argument) }, right: mul(num(Math.PI), { kind: "pow", base: argument, exponent: num(2) }) },
      );
    default: throw new DifferentiationError(`${name} is not differentiable inside a δ⁽ⁿ⁾ integral; its derivative is itself a distribution.`);
  }
}

/* ─────────────────── AST → LaTeX ─────────────────── */

/** Round-trips a MathNode back into LaTeX the grammar can re-parse — used to display the result of
 *  a symbolic operator (derivative, running integral) back into the mathfield. */
export function nodeToLatex(node: MathNode): string {
  switch (node.kind) {
    case "num": return formatNumber(node.value);
    // A multi-letter name (τ parses to var("tau")) must round-trip as the LaTeX command, or the lexer
    // would split it back into separate single-letter idents and silently multiply them together.
    case "var": return node.name.length === 1 ? node.name : `\\${node.name}`;
    case "neg": return `-${wrapAddSub(node.value)}`;
    case "add": return `${nodeToLatex(node.left)}+${nodeToLatex(node.right)}`;
    case "sub": return `${nodeToLatex(node.left)}-${wrapAddSub(node.right)}`;
    case "mul":
      if (node.left.kind === "num" && node.left.value === -1) return `-${wrapAddSub(node.right)}`;
      return `${wrapAddSub(node.left)}\\,${wrapAddSub(node.right)}`;
    case "div": return `\\frac{${nodeToLatex(node.left)}}{${nodeToLatex(node.right)}}`;
    case "pow": return `${wrapPow(node.base)}^{${nodeToLatex(node.exponent)}}`;
    case "call": return callToLatex(node.name, node.argument);
    case "delta": return `\\delta${node.order > 0 ? `^{(${node.order})}` : ""}\\!\\left(${nodeToLatex(node.argument)}\\right)`;
    case "runningIntegral": return `\\int_{-\\infty}^{t}${nodeToLatex(node.integrand)}\\,d${node.dummyVariable.length === 1 ? node.dummyVariable : `\\${node.dummyVariable}`}`;
  }
}
function formatNumber(value: number): string { return Number(value.toFixed(6)).toString(); }
function wrapAddSub(node: MathNode): string { const text = nodeToLatex(node); return node.kind === "add" || node.kind === "sub" ? `\\left(${text}\\right)` : text; }
function wrapPow(node: MathNode): string { const text = nodeToLatex(node); return node.kind === "add" || node.kind === "sub" || node.kind === "mul" || node.kind === "div" || node.kind === "neg" ? `\\left(${text}\\right)` : text; }
/** Renames every free occurrence of `from` to `to` — used to turn a `t`-based expression into the
 *  dummy-variable form (τ) required inside an explicit running-integral wrapper. */
export function renameVariable(node: MathNode, from: string, to: string): MathNode {
  switch (node.kind) {
    case "num": return node;
    case "var": return node.name === from ? { kind: "var", name: to } : node;
    case "neg": return { kind: "neg", value: renameVariable(node.value, from, to) };
    case "add": return { kind: "add", left: renameVariable(node.left, from, to), right: renameVariable(node.right, from, to) };
    case "sub": return { kind: "sub", left: renameVariable(node.left, from, to), right: renameVariable(node.right, from, to) };
    case "mul": return { kind: "mul", left: renameVariable(node.left, from, to), right: renameVariable(node.right, from, to) };
    case "div": return { kind: "div", left: renameVariable(node.left, from, to), right: renameVariable(node.right, from, to) };
    case "pow": return { kind: "pow", base: renameVariable(node.base, from, to), exponent: renameVariable(node.exponent, from, to) };
    case "call": return { kind: "call", name: node.name, argument: renameVariable(node.argument, from, to) };
    case "delta": return { kind: "delta", order: node.order, argument: renameVariable(node.argument, from, to) };
    case "runningIntegral": return { kind: "runningIntegral", integrand: renameVariable(node.integrand, from, to), dummyVariable: node.dummyVariable };
  }
}

function callToLatex(name: FunctionName, argument: MathNode): string {
  const inner = nodeToLatex(argument);
  if (name === "sqrt") return `\\sqrt{${inner}}`;
  if (name === "abs") return `\\left|${inner}\\right|`;
  if (name === "sin" || name === "cos" || name === "tan" || name === "exp" || name === "ln" || name === "log") return `\\${name}\\!\\left(${inner}\\right)`;
  const label = name.length === 1 ? name : `\\text{${name}}`;
  return `${label}\\!\\left(${inner}\\right)`;
}

/* ─────────────────── Integral front end ─────────────────── */

/** Splits `\int_{a}^{b} f d t` (or the ASCII form `int(a, b, f)`) into bounds, variable, and integrand. */
export function parseDefiniteIntegral(source: string): DefiniteIntegral {
  const flat = normalizeMathSource(source);
  const ascii = flat.match(/^int\((.*)\)$/);
  if (ascii) {
    const parts = splitTopLevel(ascii[1], ",");
    if (parts.length < 3) throw new ParseError("int(lower, upper, integrand) needs three arguments.");
    const variable = parts[3] ? parts[3].replace(/^d/, "") : "t";
    return { lowerLatex: parts[0], upperLatex: parts[1], variable, integrandText: parts[2] };
  }
  if (!flat.startsWith("\\int")) throw new ParseError("The expression is not a definite integral.");
  const skipBoundary = (at: number) => { let i = at; while (flat[i] === "\u0001") i += 1; return i; };
  let cursor = skipBoundary(4);
  const bounds: Record<"_" | "^", string> = { _: "", "^": "" };
  for (let pass = 0; pass < 2; pass += 1) {
    const marker = flat[cursor];
    if (marker !== "_" && marker !== "^") break;
    cursor = skipBoundary(cursor + 1);
    const group = readGroup(flat, cursor);
    bounds[marker] = group.text; cursor = skipBoundary(group.end);
  }
  if (!bounds._ || !bounds["^"]) throw new ParseError("The integral needs both a lower and an upper bound.");
  const body = flat.slice(cursor);
  const differential = body.match(/(?:d([a-zA-Z])|d\\([a-zA-Z]+))$/);
  if (!differential) throw new ParseError("The integral must end with its differential, for example dt or d\\tau.");
  const variable = differential[1] ?? differential[2];
  const integrandText = body.slice(0, body.length - differential[0].length);
  if (!integrandText) throw new ParseError("The integrand is empty.");
  return { lowerLatex: bounds._, upperLatex: bounds["^"], variable, integrandText };
}

/** Reads a braced group, or the single token that follows a bare `_`/`^`. */
function readGroup(source: string, start: number): { text: string; end: number } {
  if (source[start] !== "{") {
    if (source[start] === "\\") { const match = source.slice(start).match(/^\\[a-zA-Z]+/)!; return { text: match[0], end: start + match[0].length }; }
    if (source[start] === "-") { const inner = readGroup(source, start + 1); return { text: `-${inner.text}`, end: inner.end }; }
    return { text: source[start] ?? "", end: start + 1 };
  }
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") { depth -= 1; if (depth === 0) return { text: source.slice(start + 1, index), end: index + 1 }; }
  }
  throw new ParseError("Unbalanced braces in the integral bounds.");
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = []; let depth = 0; let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(" || char === "{") depth += 1;
    else if (char === ")" || char === "}") depth -= 1;
    else if (char === separator && depth === 0) { parts.push(value.slice(start, index)); start = index + 1; }
  }
  parts.push(value.slice(start));
  return parts.filter((part) => part.length > 0);
}

/* ─────────────────── Dirac integration rules ─────────────────── */

export type Factorization = { others: MathNode[]; delta: Extract<MathNode, { kind: "delta" }> | null; deltaCount: number };

/** Splits a ± sum into its signed additive terms; shared with the composite-signal engine. */
export function flattenSum(node: MathNode, sign = 1, into: Array<{ sign: number; node: MathNode }> = []): Array<{ sign: number; node: MathNode }> {
  if (node.kind === "add") { flattenSum(node.left, sign, into); flattenSum(node.right, sign, into); return into; }
  if (node.kind === "sub") { flattenSum(node.left, sign, into); flattenSum(node.right, -sign, into); return into; }
  if (node.kind === "neg") { flattenSum(node.value, -sign, into); return into; }
  into.push({ sign, node });
  return into;
}

/** Pulls the (at most one) δ⁽ⁿ⁾ factor out of a product term, leaving the amplitude factors. */
export function factorize(node: MathNode, into: Factorization = { others: [], delta: null, deltaCount: 0 }): Factorization {
  if (node.kind === "mul") { factorize(node.left, into); factorize(node.right, into); return into; }
  if (node.kind === "delta") { into.deltaCount += 1; into.delta = node; return into; }
  if (node.kind === "div" && node.right.kind !== "delta") {
    // Keep a quotient intact unless its numerator carries the impulse.
    const numerator = factorize(node.left, { others: [], delta: null, deltaCount: 0 });
    if (numerator.delta) { into.deltaCount += numerator.deltaCount; into.delta = numerator.delta; into.others.push({ kind: "div", left: numerator.others.reduce(mul, num(1)), right: node.right }); return into; }
  }
  into.others.push(node);
  return into;
}

/** Probes whether `node` is affine in `variable`; rejects anything nonlinear. Shared with periodicity detection. */
export function affineArgument(node: MathNode, variable: string): { slope: number; intercept: number } | null {
  try {
    const at0 = evaluateNode(node, variable, 0);
    const at1 = evaluateNode(node, variable, 1);
    const at2 = evaluateNode(node, variable, 2);
    const slope = at1 - at0;
    if (!Number.isFinite(slope) || Math.abs(at2 - (at0 + 2 * slope)) > 1e-9) return null;
    return { slope, intercept: at0 };
  } catch { return null; }
}

const texNumber = (value: number) => Number(value.toFixed(6)).toString();

/** True when `node` structurally references `variable` anywhere in its tree. */
export function containsVariable(node: MathNode, variable: string): boolean {
  switch (node.kind) {
    case "num": return false;
    case "var": return node.name === variable;
    case "neg": return containsVariable(node.value, variable);
    case "add": case "sub": case "mul": case "div": return containsVariable(node.left, variable) || containsVariable(node.right, variable);
    case "pow": return containsVariable(node.base, variable) || containsVariable(node.exponent, variable);
    case "call": return containsVariable(node.argument, variable);
    case "delta": return containsVariable(node.argument, variable);
    // A running integral is, by construction, evaluated dynamically at the outer variable — always t-dependent.
    case "runningIntegral": return true;
  }
}

/**
 * Evaluates ∫ₐᵇ x(t)·δ⁽ⁿ⁾(At+C) dt with the canonical rules:
 * scaling (1/|A|), the δ⁽ⁿ⁾ scaling factor 1/Aⁿ, and sifting (−1)ⁿ x⁽ⁿ⁾(t₀).
 */
function evaluateDeltaTerm(factors: Factorization, variable: string, lower: number, upper: number, steps: string[]): { value: number } | { undefinedReason: string } | { error: string } {
  const delta = factors.delta!;
  const affine = affineArgument(delta.argument, variable);
  if (!affine || Math.abs(affine.slope) < 1e-12) return { error: "The Dirac argument must be affine in the integration variable, for example δ(2t-4)." };
  const root = -affine.intercept / affine.slope;
  const order = delta.order;
  const weight = (1 / Math.abs(affine.slope)) * (1 / Math.pow(affine.slope, order)) * Math.pow(-1, order);
  steps.push(`\\delta^{(${order})}\\!\\left(${texNumber(affine.slope)}${variable}${affine.intercept >= 0 ? "+" : ""}${texNumber(affine.intercept)}\\right)\\ \\Rightarrow\\ t_0=${texNumber(root)}`);
  if (root < Math.min(lower, upper) - 1e-12 || root > Math.max(lower, upper) + 1e-12) {
    steps.push(`t_0\\notin\\left[${texNumber(lower)},\\ ${texNumber(upper)}\\right]\\ \\Rightarrow\\ 0`);
    return { value: 0 };
  }
  const amplitude = factors.others.reduce(mul, num(1));
  let derivative = amplitude;
  try { for (let step = 0; step < order; step += 1) derivative = differentiate(derivative, variable); }
  catch (error) { return { error: error instanceof Error ? error.message : "The amplitude is not differentiable." }; }
  try {
    const sampled = evaluateNode(derivative, variable, root);
    if (!Number.isFinite(sampled)) return { undefinedReason: `The amplitude is not finite at t_0 = ${texNumber(root)}.` };
    steps.push(order === 0
      ? `\\int x(t)\\,\\delta(t-t_0)\\,dt = x(t_0) = ${texNumber(sampled)}`
      : `\\int x(t)\\,\\delta^{(${order})}(t-t_0)\\,dt = (-1)^{${order}}x^{(${order})}(t_0) = ${texNumber(Math.pow(-1, order) * sampled)}`);
    steps.push(`\\text{scaling factor } \\frac{1}{|A|}\\cdot\\frac{1}{A^{${order}}} = ${texNumber((1 / Math.abs(affine.slope)) * (1 / Math.pow(affine.slope, order)))}`);
    return { value: weight * sampled };
  } catch (error) {
    if (error instanceof DomainError) return { undefinedReason: `${error.reason} The impulse is centred at t_0 = ${texNumber(root)}, where the amplitude leaves its domain.` };
    return { error: error instanceof Error ? error.message : "The amplitude could not be evaluated." };
  }
}

/** Structural jump points of the step-family primitives, mapped through an affine argument. */
const STEP_LIKE_BREAKPOINTS: Partial<Record<FunctionName, number[]>> = { u: [0], r: [0], sgn: [0], rect: [-0.5, 0.5], tri: [-1, 1] };

/** Finds every structural discontinuity of `node` in `variable`, so quadrature never straddles one. */
function collectStepBreakpoints(node: MathNode, variable: string, into: number[] = []): number[] {
  switch (node.kind) {
    case "call": {
      const marks = STEP_LIKE_BREAKPOINTS[node.name];
      if (marks) {
        const affine = affineArgument(node.argument, variable);
        if (affine && Math.abs(affine.slope) > 1e-12) for (const mark of marks) into.push((mark - affine.intercept) / affine.slope);
      }
      collectStepBreakpoints(node.argument, variable, into);
      return into;
    }
    case "neg": return collectStepBreakpoints(node.value, variable, into);
    case "add": case "sub": case "mul": case "div":
      collectStepBreakpoints(node.left, variable, into); collectStepBreakpoints(node.right, variable, into); return into;
    case "pow": collectStepBreakpoints(node.base, variable, into); collectStepBreakpoints(node.exponent, variable, into); return into;
    default: return into; // num, var, delta (sifted exactly, not by quadrature), runningIntegral (opaque here)
  }
}

function simpsonSlice(node: MathNode, variable: string, from: number, to: number, intervals: number): number {
  const step = (to - from) / intervals;
  let total = 0;
  for (let index = 0; index <= intervals; index += 1) {
    let value: number;
    try { value = evaluateNode(node, variable, from + index * step); } catch { value = 0; }
    if (!Number.isFinite(value)) continue;
    const simpson = index === 0 || index === intervals ? 1 : index % 2 === 0 ? 2 : 4;
    total += simpson * value;
  }
  return (total * step) / 3;
}

/**
 * Simpson's rule, split at every structural breakpoint (u/r/rect/tri/sgn edges) so quadrature never
 * straddles a jump — a single-grid Simpson pass at a discontinuity has an error that depends on the
 * grid's step size, which made two differently-sized windows disagree enough to look "divergent".
 */
function numericIntegral(node: MathNode, variable: string, lower: number, upper: number): number {
  const from = Number.isFinite(lower) ? lower : -NUMERIC_WINDOW;
  const to = Number.isFinite(upper) ? upper : NUMERIC_WINDOW;
  if (!(to > from)) return 0;
  const breakpoints = collectStepBreakpoints(node, variable)
    .filter((point) => Number.isFinite(point) && point > from + 1e-9 && point < to - 1e-9)
    .sort((left, right) => left - right);
  // Inset each internal breakpoint by ε on both sides: Simpson's own endpoint sample must never land
  // exactly on a jump, or it silently picks up the post-jump value and adds a spurious step/3 sliver.
  const inset = 1e-7;
  const cuts = [from];
  for (const point of breakpoints) cuts.push(point - inset, point + inset);
  cuts.push(to);
  let total = 0;
  for (let index = 0; index < cuts.length; index += 2) {
    const start = cuts[index]; const end = cuts[index + 1];
    if (end > start) total += simpsonSlice(node, variable, start, end, 1024);
  }
  return total;
}

/** Bounds may be ±∞, numbers, or π-expressions; a free symbol keeps the integral symbolic. */
function evaluateBoundNode(node: MathNode): number | "symbolic" {
  try {
    const value = evaluateNode(node, "\u0000", 0);
    return Number.isNaN(value) ? "symbolic" : value;
  } catch { return "symbolic"; }
}
function evaluateBound(source: string): number | "symbolic" {
  try { return evaluateBoundNode(parseExpression(source, "\u0000")); }
  catch { return "symbolic"; }
}

/**
 * Core Dirac-aware numeric integration, shared by the text-driven `evaluateDefiniteIntegral` and the
 * dynamic per-sample evaluation of an explicit `runningIntegral` node.
 */
function evaluateIntegralNode(integrand: MathNode, variable: string, lower: number, upper: number): IntegralEvaluation {
  const steps: string[] = [];
  let total = 0;
  let sawDelta = false;
  for (const term of flattenSum(integrand)) {
    const factors = factorize(term.node);
    if (factors.deltaCount > 1) return { kind: "error", message: "A product of two Dirac impulses is not a defined distribution." };
    if (!factors.delta) {
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
        const inner = numericIntegral(term.node, variable, lower, upper);
        const wider = numericIntegral(term.node, variable, Number.isFinite(lower) ? lower : -2 * NUMERIC_WINDOW, Number.isFinite(upper) ? upper : 2 * NUMERIC_WINDOW);
        if (!Number.isFinite(inner) || Math.abs(wider - inner) > 1e-3 * Math.max(1, Math.abs(inner))) return { kind: "divergent", steps };
        total += term.sign * inner;
        continue;
      }
      total += term.sign * numericIntegral(term.node, variable, lower, upper);
      continue;
    }
    sawDelta = true;
    const outcome = evaluateDeltaTerm(factors, variable, lower, upper, steps);
    if ("error" in outcome) return { kind: "error", message: outcome.error };
    if ("undefinedReason" in outcome) return { kind: "undefined", reason: outcome.undefinedReason, steps };
    total += term.sign * outcome.value;
  }
  const value = Number(total.toFixed(9));
  return { kind: "value", value, method: sawDelta ? "dirac" : "numeric", steps };
}

/** Full pipeline: LaTeX definite integral → number, `undefined`, or an explained failure. */
export function evaluateDefiniteIntegral(source: string): IntegralEvaluation {
  let parsed: DefiniteIntegral;
  try { parsed = parseDefiniteIntegral(source); }
  catch (error) { return { kind: "error", message: error instanceof Error ? error.message : "The integral could not be parsed." }; }

  const lower = evaluateBound(parsed.lowerLatex);
  const upper = evaluateBound(parsed.upperLatex);
  if (lower === "symbolic" || upper === "symbolic") return { kind: "symbolic", reason: "A bound still depends on a free symbol, so this is a running integral rather than a number." };

  let integrand: MathNode;
  try { integrand = parseExpression(parsed.integrandText, parsed.variable); }
  catch (error) { return { kind: "error", message: error instanceof Error ? error.message : "The integrand could not be parsed." }; }

  const outcome = evaluateIntegralNode(integrand, parsed.variable, lower, upper);
  if (outcome.kind === "value") outcome.steps.push(`\\int_{${parsed.lowerLatex}}^{${parsed.upperLatex}}\\ \\Rightarrow\\ ${texNumber(outcome.value)}`);
  return outcome;
}

/**
 * Sifting in a product: x(t)·δ(At+C) collapses to x(t₀)·δ(At+C) with t₀ = −C/A.
 * Returns the collapsed weight so callers can render x(t₀) instead of x(t).
 */
export function siftProduct(source: string, variable = "t"): { center: number; weight: number; latex: string } | { undefinedReason: string } | { error: string } {
  let node: MathNode;
  try { node = parseExpression(source, variable); }
  catch (error) { return { error: error instanceof Error ? error.message : "The product could not be parsed." }; }
  const factors = factorize(node);
  if (!factors.delta) return { error: "The product contains no Dirac impulse." };
  if (factors.deltaCount > 1) return { error: "A product of two Dirac impulses is not a defined distribution." };
  if (factors.delta.order > 0) return { error: "The sifting product applies to δ(·), not to its derivatives." };
  const affine = affineArgument(factors.delta.argument, variable);
  if (!affine || Math.abs(affine.slope) < 1e-12) return { error: "The Dirac argument must be affine in the integration variable." };
  const center = -affine.intercept / affine.slope;
  try {
    const weight = evaluateNode(factors.others.reduce(mul, num(1)), variable, center);
    if (!Number.isFinite(weight)) return { undefinedReason: `The amplitude is not finite at t_0 = ${texNumber(center)}.` };
    return { center, weight, latex: `${texNumber(weight)}\\,\\delta\\!\\left(${variable}${center <= 0 ? "+" : "-"}${texNumber(Math.abs(center))}\\right)` };
  } catch (error) {
    if (error instanceof DomainError) return { undefinedReason: `${error.reason} The impulse is centred at t_0 = ${texNumber(center)}.` };
    return { error: error instanceof Error ? error.message : "The amplitude could not be evaluated." };
  }
}
