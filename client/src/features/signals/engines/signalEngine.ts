/**
 * MAE Academy / Signals & Systems — Tab A mathematical core.
 *
 * Architectural boundary: parser → typed semantic AST → numerical/symbolic evaluator
 * → window/period controller → render segments. The module intentionally contains no
 * React state, DOM nodes, or canvas commands, so it can be deterministically tested.
 */

export type SignalNode =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: "t" | "pi" }
  | { kind: "unary"; operator: "+" | "-"; value: SignalNode }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: SignalNode; right: SignalNode }
  | { kind: "function"; name: SignalFunction; argument: SignalNode };

export type SignalFunction = "u" | "r" | "delta" | "rect" | "tri" | "sinc" | "Sa" | "sin" | "cos" | "tan" | "exp" | "ln" | "log" | "abs" | "sqrt" | "sgn" | "int" | "runint" | "derivative";
export type PeriodMode = "periodic" | "aperiodic";
export type Classification = "Energy" | "Power" | "Neither";
export type SignalWindow = { from: number; to: number };
export type ParsedSignal = { ok: true; ast: SignalNode; normalized: string } | { ok: false; error: string };
export type ImpulseMarker = { at: number; area: number; latex: string };
export type PlotPoint = { t: number; value: number };
export type PlotSegment = PlotPoint[];

export type LcmDerivation = {
  componentPeriods: number[];
  fundamentalPeriod?: number;
  steps: string[];
};

export type SignalAnalysis = {
  periodMode: PeriodMode;
  window: SignalWindow;
  detectedPeriod?: number;
  effectivePeriod?: number;
  energyEstimate: number;
  averagePower: number;
  classification: Classification;
  impulses: ImpulseMarker[];
  lcm: LcmDerivation;
  steps: string[];
};

type TokenKind = "number" | "identifier" | "operator" | "leftParen" | "rightParen" | "end";
type Token = { kind: TokenKind; value: string; index: number };
type LinearForm = { slope: number; offset: number };

const KNOWN_FUNCTIONS = new Set<SignalFunction>(["u", "r", "delta", "rect", "tri", "sinc", "Sa", "sin", "cos", "tan", "exp", "ln", "log", "abs", "sqrt", "sgn", "int", "runint", "derivative"]);
const EPSILON = 1e-9;
const DEFAULT_WINDOW: SignalWindow = { from: -6, to: 6 };

function modulo(value: number, modulus: number) { return ((value % modulus) + modulus) % modulus; }
function formatNumber(value: number, digits = 5) { return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "0"; }
function cloneWindow(window: SignalWindow): SignalWindow { return { from: Number(window.from), to: Number(window.to) }; }

export function isValidWindow(window: SignalWindow) { return Number.isFinite(window.from) && Number.isFinite(window.to) && window.to - window.from > EPSILON; }

function readGroup(source: string, openingBrace: number) {
  if (source[openingBrace] !== "{") return null;
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") { depth -= 1; if (depth === 0) return { value: source.slice(openingBrace + 1, index), end: index + 1 }; }
  }
  return null;
}

function expandLatexFractions(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("\\frac", index)) {
      const numerator = readGroup(source, index + 5);
      const denominator = numerator ? readGroup(source, numerator.end) : null;
      if (numerator && denominator) { output += `(${expandLatexFractions(numerator.value)})/(${expandLatexFractions(denominator.value)})`; index = denominator.end; continue; }
    }
    output += source[index]; index += 1;
  }
  return output;
}

/** Normalizes visual MathLive LaTeX to the deliberately small, typed signal grammar. */
function normalizeSource(source: string) {
  // MathLive emits named signals as \text{rect}, \mathrm{u}, \Lambda(t) (triangle); fold them onto the plain grammar.
  const prepared = source
    .replace(/\\(?:text|mathrm|operatorname)\{(rect|tri|sinc|sgn|u|r|Sa)\}/g, "$1")
    .replaceAll("\\Lambda", "tri")
    .replaceAll("\\frac{\\mathrm{d}}{\\mathrm{d}t}", "derivative")
    .replaceAll("\\frac{d}{dt}", "derivative")
    .replaceAll("\\operatorname{rect}", "rect")
    .replaceAll("\\operatorname{tri}", "tri")
    .replaceAll("\\operatorname{sinc}", "sinc")
    .replaceAll("\\operatorname{sgn}", "sgn");
  const compact = prepared.replaceAll(/\s+/g, "");
  const calculusReady = compact.replace(/\\int_\{0\}\^\{t\}([\s\S]*?)(?:\\,)?(?:\\mathrm\{d\}|d)\\tau/g, "int($1)");
  const fractions = expandLatexFractions(calculusReady);
  return fractions
    .replaceAll("\\left", "")
    .replaceAll("\\right", "")
    .replaceAll("\\!", "")
    .replaceAll("\\,", "")
    .replaceAll("\\ ", "")
    .replaceAll("\\delta", "delta")
    .replaceAll("\\times", "*")
    .replaceAll("\\cdot", "*")
    .replaceAll("\\div", "/")
    .replaceAll("\\wedge", "^")
    .replaceAll("\\exp", "exp")
    .replaceAll("\\sin", "sin")
    .replaceAll("\\cos", "cos")
    .replaceAll("\\pi", "(pi)")
    .replaceAll("∫", "int")
    .replaceAll("\\int", "int")
    .replaceAll("d/dt", "derivative")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("π", "(pi)")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    // MathLive emits the natural exponential as e^{...}; the grammar models it as exp(...).
    .replace(/(?<![A-Za-z])e\^(?=\()/g, "exp")
    .trim();
}

function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    if (/\d|\./.test(current)) {
      const start = index; while (index < source.length && /\d|\./.test(source[index])) index += 1;
      const value = source.slice(start, index); if (Number.isNaN(Number(value))) throw new Error(`Invalid numeric literal at position ${start + 1}.`);
      tokens.push({ kind: "number", value, index: start }); continue;
    }
    if (/[A-Za-z_]/.test(current)) {
      const start = index; while (index < source.length && /[A-Za-z_]/.test(source[index])) index += 1;
      tokens.push({ kind: "identifier", value: source.slice(start, index), index: start }); continue;
    }
    if ("+-*/^".includes(current)) { tokens.push({ kind: "operator", value: current, index }); index += 1; continue; }
    if (current === "(") { tokens.push({ kind: "leftParen", value: current, index }); index += 1; continue; }
    if (current === ")") { tokens.push({ kind: "rightParen", value: current, index }); index += 1; continue; }
    throw new Error(`Unsupported character “${current}” at position ${index + 1}.`);
  }
  return addImplicitMultiplication(tokens).concat({ kind: "end", value: "", index: source.length });
}

function isLeftOperand(token: Token) { return token.kind === "number" || token.kind === "rightParen" || token.kind === "identifier"; }
function isRightOperand(token: Token) { return token.kind === "number" || token.kind === "leftParen" || token.kind === "identifier"; }
function isFunctionCall(left: Token, right: Token) { return left.kind === "identifier" && KNOWN_FUNCTIONS.has(left.value as SignalFunction) && right.kind === "leftParen"; }
function addImplicitMultiplication(tokens: Token[]) {
  const output: Token[] = [];
  tokens.forEach((token, index) => { const previous = tokens[index - 1]; if (previous && isLeftOperand(previous) && isRightOperand(token) && !isFunctionCall(previous, token)) output.push({ kind: "operator", value: "*", index: token.index }); output.push(token); });
  return output;
}

class Parser {
  private cursor = 0;
  constructor(private readonly tokens: Token[]) {}
  private current() { return this.tokens[this.cursor]; }
  private advance() { const token = this.current(); this.cursor += 1; return token; }
  private match(kind: TokenKind, value?: string) { const token = this.current(); if (token.kind !== kind || (value !== undefined && token.value !== value)) return false; this.cursor += 1; return true; }
  private expect(kind: TokenKind, expectation: string) { const token = this.current(); if (token.kind !== kind) throw new Error(`Expected ${expectation} at position ${token.index + 1}.`); this.cursor += 1; return token; }
  parse() { const expression = this.expression(); if (this.current().kind !== "end") throw new Error(`Unexpected token “${this.current().value}” at position ${this.current().index + 1}.`); return expression; }
  private expression(): SignalNode { let left = this.term(); while (this.current().kind === "operator" && ["+", "-"].includes(this.current().value)) { const operator = this.advance().value as "+" | "-"; left = { kind: "binary", operator, left, right: this.term() }; } return left; }
  private term(): SignalNode { let left = this.power(); while (this.current().kind === "operator" && ["*", "/"].includes(this.current().value)) { const operator = this.advance().value as "*" | "/"; left = { kind: "binary", operator, left, right: this.power() }; } return left; }
  private power(): SignalNode { let left = this.unary(); if (this.match("operator", "^")) left = { kind: "binary", operator: "^", left, right: this.power() }; return left; }
  private unary(): SignalNode { if (this.match("operator", "+")) return { kind: "unary", operator: "+", value: this.unary() }; if (this.match("operator", "-")) return { kind: "unary", operator: "-", value: this.unary() }; return this.primary(); }
  private primary(): SignalNode {
    const token = this.current();
    if (token.kind === "number") { this.advance(); return { kind: "number", value: Number(token.value) }; }
    if (token.kind === "leftParen") { this.advance(); const value = this.expression(); this.expect("rightParen", "a closing parenthesis"); return value; }
    if (token.kind === "identifier") {
      this.advance(); if (token.value === "t" || token.value === "pi") return { kind: "variable", name: token.value };
      if (!KNOWN_FUNCTIONS.has(token.value as SignalFunction)) throw new Error(`Unknown signal “${token.value}”. Choose a basic signal from the library.`);
      this.expect("leftParen", `an opening parenthesis after ${token.value}`); const argument = this.expression(); this.expect("rightParen", "a closing parenthesis");
      return { kind: "function", name: token.value as SignalFunction, argument };
    }
    throw new Error(`Expected a signal, a number, or t at position ${token.index + 1}.`);
  }
}

export function parseSignalExpression(source: string): ParsedSignal {
  const normalized = normalizeSource(source); if (!normalized) return { ok: false, error: "Enter a signal from the mathematical keyboard." };
  try { return { ok: true, ast: new Parser(lex(normalized)).parse(), normalized }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The mathematical expression could not be parsed." }; }
}

export function integrateTrapezoidal(fn: (time: number) => number, from: number, to: number, intervals = 4096) {
  const safeIntervals = Math.max(2, Math.floor(intervals)); const step = (to - from) / safeIntervals; let sum = 0;
  for (let index = 0; index <= safeIntervals; index += 1) { const value = fn(from + index * step); if (!Number.isFinite(value)) continue; sum += (index === 0 || index === safeIntervals ? 0.5 : 1) * value; }
  return sum * step;
}

/** ∫₋∞ᵗ lookup: cumulative midpoint sum (Δt = 0.005) plus exact δ steps, built once per integrand node. */
const RUNNING_INTEGRAL_SPAN = { from: -40, to: 40, step: 0.005 } as const;
const runningIntegralTables = new WeakMap<SignalNode, { table: Float64Array; impulses: ImpulseMarker[] }>();
function runningIntegralAt(integrand: SignalNode, time: number): number {
  const { from, to, step } = RUNNING_INTEGRAL_SPAN;
  let cached = runningIntegralTables.get(integrand);
  if (!cached) {
    const count = Math.round((to - from) / step);
    const table = new Float64Array(count + 1);
    // Midpoint rule: exact across step-family jumps that fall on the grid (u, rect, tri edges).
    for (let index = 1; index <= count; index += 1) {
      const value = evaluateSignal(integrand, from + (index - 0.5) * step);
      table[index] = table[index - 1] + (Number.isFinite(value) ? value : 0) * step;
    }
    cached = { table, impulses: extractImpulseMarkers(integrand) };
    runningIntegralTables.set(integrand, cached);
  }
  const { table, impulses } = cached;
  const position = (Math.min(to, Math.max(from, time)) - from) / step; const lower = Math.floor(position); const upper = Math.min(table.length - 1, lower + 1);
  // δ areas are added as exact unit steps so the jump stays a vertical wall at any sampling density.
  const jumps = impulses.reduce((total, impulse) => (time >= impulse.at ? total + impulse.area : total), 0);
  return table[lower] + (table[upper] - table[lower]) * (position - lower) + jumps;
}

export function evaluateSignal(node: SignalNode, time: number): number {
  switch (node.kind) {
    case "number": return node.value;
    case "variable": return node.name === "t" ? time : Math.PI;
    case "unary": return node.operator === "-" ? -evaluateSignal(node.value, time) : evaluateSignal(node.value, time);
    case "binary": {
      const left = evaluateSignal(node.left, time); const right = evaluateSignal(node.right, time);
      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      if (node.operator === "/") return Math.abs(right) < EPSILON ? Number.NaN : left / right;
      return Math.pow(left, right);
    }
    case "function": {
      const value = evaluateSignal(node.argument, time);
      if (node.name === "u") return value >= 0 ? 1 : 0;
      if (node.name === "r") return Math.max(0, value);
      if (node.name === "delta") return 0;
      if (node.name === "rect") return Math.abs(value) <= 0.5 ? 1 : 0;
      if (node.name === "tri") return Math.max(0, 1 - Math.abs(value));
      if (node.name === "sinc") return Math.abs(value) < EPSILON ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
      if (node.name === "Sa") return Math.abs(value) < EPSILON ? 1 : Math.sin(value) / value;
      if (node.name === "sin") return Math.sin(value);
      if (node.name === "cos") return Math.cos(value);
      if (node.name === "exp") return Math.exp(value);
      if (node.name === "tan") return Math.tan(value);
      if (node.name === "ln") return value > 0 ? Math.log(value) : Number.NaN;
      if (node.name === "log") return value > 0 ? Math.log10(value) : Number.NaN;
      if (node.name === "abs") return Math.abs(value);
      if (node.name === "sqrt") return value >= 0 ? Math.sqrt(value) : Number.NaN;
      if (node.name === "runint") return runningIntegralAt(node.argument, time);
      if (node.name === "int") return integrateTrapezoidal((tau) => evaluateSignal(node.argument, tau), 0, time, 384);
      if (node.name === "derivative") { const step = Math.max(1e-5, Math.abs(time) * 1e-5); return (evaluateSignal(node.argument, time + step) - evaluateSignal(node.argument, time - step)) / (2 * step); }
      return Math.sign(value);
    }
  }
}

/** Applies the specified zero-padded finite window or periodic modulo extension. */
export function evaluateWindowedSignal(node: SignalNode, time: number, window: SignalWindow, periodMode: PeriodMode): number {
  if (!isValidWindow(window)) return Number.NaN;
  if (periodMode === "aperiodic") return time < window.from || time > window.to ? 0 : evaluateSignal(node, time);
  const period = window.to - window.from; const localTime = window.from + modulo(time - window.from, period);
  return evaluateSignal(node, localTime);
}

export function toLatex(node: SignalNode, timeSymbol = "t"): string {
  switch (node.kind) {
    case "number": return Number.isInteger(node.value) ? String(node.value) : node.value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    case "variable": return node.name === "pi" ? "\\pi" : timeSymbol;
    case "unary": return `${node.operator === "-" ? "-" : "+"}${toLatex(node.value, timeSymbol)}`;
    case "binary": {
      const left = toLatex(node.left, timeSymbol); const right = toLatex(node.right, timeSymbol);
      if (node.operator === "/") return `\\frac{${left}}{${right}}`;
      if (node.operator === "*") return `${left}\\,${right}`;
      if (node.operator === "^") return `{${left}}^{${right}}`;
      return `${left} ${node.operator} ${right}`;
    }
    case "function": {
      if (node.name === "int") return `\\int_{0}^{${timeSymbol}}\\!\\left(${toLatex(node.argument, "\\tau")}\\right)\\,d\\tau`;
      if (node.name === "runint") return `\\int_{-\\infty}^{${timeSymbol}}\\!\\left(${toLatex(node.argument, "\\tau")}\\right)\\,d\\tau`;
      if (node.name === "abs") return `\\left|${toLatex(node.argument, timeSymbol)}\\right|`;
      if (node.name === "sqrt") return `\\sqrt{${toLatex(node.argument, timeSymbol)}}`;
      if (node.name === "derivative") return `\\frac{d}{d${timeSymbol}}\\!\\left(${toLatex(node.argument, timeSymbol)}\\right)`;
      const argument = toLatex(node.argument, timeSymbol);
      if (node.name === "exp") return `e^{${argument}}`;
      const name = node.name === "delta" ? "\\delta" : node.name === "rect" ? "\\operatorname{rect}" : node.name === "tri" ? "\\operatorname{tri}" : node.name === "sinc" ? "\\operatorname{sinc}" : node.name === "sgn" ? "\\operatorname{sgn}" : node.name === "Sa" ? "\\operatorname{Sa}" : node.name === "sin" || node.name === "cos" || node.name === "tan" || node.name === "ln" ? `\\${node.name}` : node.name === "log" ? "\\log_{10}" : node.name;
      return `${name}\\!\\left(${argument}\\right)`;
    }
  }
}

function linearForm(node: SignalNode): LinearForm | null {
  if (node.kind === "number") return { slope: 0, offset: node.value };
  if (node.kind === "variable") return node.name === "t" ? { slope: 1, offset: 0 } : { slope: 0, offset: Math.PI };
  if (node.kind === "unary") { const value = linearForm(node.value); return value ? { slope: node.operator === "-" ? -value.slope : value.slope, offset: node.operator === "-" ? -value.offset : value.offset } : null; }
  if (node.kind !== "binary") return null;
  const left = linearForm(node.left); const right = linearForm(node.right); if (!left || !right) return null;
  if (node.operator === "+") return { slope: left.slope + right.slope, offset: left.offset + right.offset };
  if (node.operator === "-") return { slope: left.slope - right.slope, offset: left.offset - right.offset };
  if (node.operator === "*") { if (Math.abs(left.slope) < EPSILON) return { slope: left.offset * right.slope, offset: left.offset * right.offset }; if (Math.abs(right.slope) < EPSILON) return { slope: right.offset * left.slope, offset: right.offset * left.offset }; }
  if (node.operator === "/" && Math.abs(right.slope) < EPSILON && Math.abs(right.offset) > EPSILON) return { slope: left.slope / right.offset, offset: left.offset / right.offset };
  return null;
}

function flattenProduct(node: SignalNode): SignalNode[] { return node.kind === "binary" && node.operator === "*" ? [...flattenProduct(node.left), ...flattenProduct(node.right)] : [node]; }
function productFrom(nodes: SignalNode[]): SignalNode { return nodes.reduce<SignalNode>((left, right) => ({ kind: "binary", operator: "*", left, right }), { kind: "number", value: 1 }); }
function deltaLocation(node: SignalNode): { at: number; scale: number } | null { if (node.kind !== "function" || node.name !== "delta") return null; const form = linearForm(node.argument); return !form || Math.abs(form.slope) < EPSILON ? null : { at: -form.offset / form.slope, scale: 1 / Math.abs(form.slope) }; }

function impulseMarkersInternal(node: SignalNode): ImpulseMarker[] {
  if (node.kind === "binary" && (node.operator === "+" || node.operator === "-")) { const right = impulseMarkersInternal(node.right).map((marker) => node.operator === "-" ? { ...marker, area: -marker.area, latex: `-${marker.latex}` } : marker); return [...impulseMarkersInternal(node.left), ...right]; }
  const factors = flattenProduct(node); const deltaIndex = factors.findIndex((factor) => Boolean(deltaLocation(factor))); if (deltaIndex < 0) return [];
  const delta = deltaLocation(factors[deltaIndex]); if (!delta) return [];
  const sampledValue = evaluateSignal(productFrom(factors.filter((_, index) => index !== deltaIndex)), delta.at); const area = Number.isFinite(sampledValue) ? sampledValue * delta.scale : 0;
  const location = Math.abs(delta.at) < EPSILON ? "t" : `t${delta.at < 0 ? "+" : "-"}${formatNumber(Math.abs(delta.at))}`;
  return [{ at: delta.at, area, latex: `${formatNumber(area)}\\,\\delta\\!\\left(${location}\\right)` }];
}

export function extractImpulseMarkers(node: SignalNode) { return impulseMarkersInternal(node).filter((marker) => Number.isFinite(marker.area)); }

export function windowedImpulseMarkers(node: SignalNode, window: SignalWindow, periodMode: PeriodMode, visibleFrom: number, visibleTo: number): ImpulseMarker[] {
  const base = extractImpulseMarkers(node); if (!isValidWindow(window)) return [];
  if (periodMode === "aperiodic") return base.filter((marker) => marker.at >= window.from - EPSILON && marker.at <= window.to + EPSILON && marker.at >= visibleFrom - EPSILON && marker.at <= visibleTo + EPSILON);
  const period = window.to - window.from; const markers: ImpulseMarker[] = [];
  base.forEach((marker) => { for (let shift = Math.ceil((visibleFrom - marker.at) / period); marker.at + shift * period <= visibleTo + EPSILON; shift += 1) markers.push({ ...marker, at: marker.at + shift * period }); });
  return markers;
}

function collectBreakpoints(node: SignalNode, breaks: number[]) {
  if (node.kind === "function") {
    const form = linearForm(node.argument);
    if (form && Math.abs(form.slope) > EPSILON) { const root = -form.offset / form.slope; if (["u", "r", "sgn"].includes(node.name)) breaks.push(root); if (node.name === "rect") breaks.push((0.5 - form.offset) / form.slope, (-0.5 - form.offset) / form.slope); if (node.name === "tri") breaks.push((1 - form.offset) / form.slope, (-1 - form.offset) / form.slope); }
    collectBreakpoints(node.argument, breaks);
  } else if (node.kind === "binary") { collectBreakpoints(node.left, breaks); collectBreakpoints(node.right, breaks); }
  else if (node.kind === "unary") collectBreakpoints(node.value, breaks);
}

function uniqueSorted(values: number[]) { return values.filter(Number.isFinite).sort((left, right) => left - right).filter((value, index, array) => index === 0 || Math.abs(value - array[index - 1]) > 1e-7); }

export function plotWindowedSegments(node: SignalNode, window: SignalWindow, periodMode: PeriodMode, minimum: number, maximum: number, pointsPerSegment = 260): PlotSegment[] {
  if (!isValidWindow(window) || maximum <= minimum) return [];
  const baseBreaks: number[] = []; collectBreakpoints(node, baseBreaks);
  const boundaries = [minimum, maximum];
  if (periodMode === "aperiodic") boundaries.push(window.from, window.to, ...baseBreaks.filter((value) => value >= window.from && value <= window.to));
  else {
    const period = window.to - window.from;
    for (let cycle = Math.floor((minimum - window.to) / period) - 1; cycle <= Math.ceil((maximum - window.from) / period) + 1; cycle += 1) { boundaries.push(window.from + cycle * period, window.to + cycle * period); baseBreaks.forEach((breakpoint) => boundaries.push(breakpoint + cycle * period)); }
  }
  const ordered = uniqueSorted(boundaries.filter((value) => value >= minimum - EPSILON && value <= maximum + EPSILON)); const segments: PlotSegment[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index]; const end = ordered[index + 1]; const span = end - start; if (span < EPSILON) continue;
    const inset = Math.min(span * 0.002, 0.004); const left = index === 0 ? start : start + inset; const right = index === ordered.length - 2 ? end : end - inset; const segment: PlotSegment = [];
    for (let point = 0; point <= pointsPerSegment; point += 1) { const time = left + (right - left) * point / pointsPerSegment; const value = evaluateWindowedSignal(node, time, window, periodMode); if (Number.isFinite(value) && Math.abs(value) < 1e5) segment.push({ t: time, value }); }
    if (segment.length > 1) segments.push(segment);
  }
  return segments;
}

/** Compatibility path for callers that need bare-expression segments. */
export function plotSegments(node: SignalNode, minimum: number, maximum: number, pointsPerSegment = 260) { return plotWindowedSegments(node, { from: minimum, to: maximum }, "aperiodic", minimum, maximum, pointsPerSegment); }

function collectPeriods(node: SignalNode, periods: number[]): boolean {
  if (node.kind === "number") return true;
  if (node.kind === "variable") return node.name === "pi";
  if (node.kind === "unary") return collectPeriods(node.value, periods);
  if (node.kind === "binary") return collectPeriods(node.left, periods) && collectPeriods(node.right, periods);
  if (node.name === "sin" || node.name === "cos") { const form = linearForm(node.argument); if (!form || Math.abs(form.slope) < EPSILON) return true; periods.push((2 * Math.PI) / Math.abs(form.slope)); return true; }
  return false;
}

export function gcd(first: number, second: number): number { let a = Math.abs(Math.round(first)); let b = Math.abs(Math.round(second)); while (b) [a, b] = [b, a % b]; return a || 1; }
export function lcm(first: number, second: number): number { return Math.abs(Math.round(first * second)) / gcd(first, second); }
function rationalApproximation(value: number, maxDenominator = 512) { let numerator = Math.round(value); let denominator = 1; let error = Math.abs(value - numerator); for (let candidate = 1; candidate <= maxDenominator; candidate += 1) { const candidateNumerator = Math.round(value * candidate); const candidateError = Math.abs(value - candidateNumerator / candidate); if (candidateError < error) { numerator = candidateNumerator; denominator = candidate; error = candidateError; } if (error < 1e-8) break; } return error < 1e-6 ? { numerator, denominator } : null; }

export function lcmDerivation(node: SignalNode): LcmDerivation {
  const periods: number[] = []; if (!collectPeriods(node, periods) || periods.length === 0) return { componentPeriods: [], steps: ["\\text{No independent commensurate component periods were inferred from the expression.}"] };
  const base = Math.min(...periods); const fractions = periods.map((period) => rationalApproximation(period / base));
  if (fractions.some((fraction) => !fraction)) return { componentPeriods: periods, steps: ["\\text{The component periods are not commensurate within the configured numerical tolerance.}"] };
  const numeratorLcm = fractions.reduce((total, fraction) => lcm(total, fraction!.numerator), 1); const denominatorGcd = fractions.reduce((total, fraction) => gcd(total, fraction!.denominator), fractions[0]!.denominator);
  const fundamentalPeriod = base * numeratorLcm / denominatorGcd;
  const labels = periods.map((period, index) => `T_{${index + 1}}=${formatNumber(period)}`).join(",\\quad");
  const lcmInputs = periods.map((_, index) => `T_{${index + 1}}`).join(",");
  return { componentPeriods: periods, fundamentalPeriod, steps: [labels, `T_{\\mathrm{LCM}}=\\operatorname{LCM}\\!\\left(${lcmInputs}\\right)`, `T_{\\mathrm{LCM}}=${formatNumber(fundamentalPeriod)}`] };
}

export function detectedFundamentalPeriod(node: SignalNode) { return lcmDerivation(node).fundamentalPeriod; }

export function analyzeWindowedSignal(node: SignalNode, window: SignalWindow, periodMode: PeriodMode): SignalAnalysis {
  const safeWindow = cloneWindow(window); const lcm = lcmDerivation(node); if (!isValidWindow(safeWindow)) return { periodMode, window: safeWindow, energyEstimate: 0, averagePower: 0, classification: "Neither", impulses: [], lcm, steps: ["\\text{Set }t_2>t_1\\text{ to define a valid analysis window.}"] };
  const width = safeWindow.to - safeWindow.from; const impulses = windowedImpulseMarkers(node, safeWindow, periodMode, safeWindow.from, safeWindow.to);
  if (periodMode === "periodic") {
    const averagePower = integrateTrapezoidal((time) => { const value = evaluateSignal(node, time); return value * value; }, safeWindow.from, safeWindow.to) / width;
    return { periodMode, window: safeWindow, detectedPeriod: lcm.fundamentalPeriod, effectivePeriod: width, energyEstimate: Number.POSITIVE_INFINITY, averagePower, classification: "Power", impulses, lcm, steps: [
      `T_0=t_2-t_1=${formatNumber(safeWindow.to)}-${formatNumber(safeWindow.from)}=${formatNumber(width)}`,
      `P=\\frac{1}{T_0}\\int_{t_1}^{t_2}\\left|x(t)\\right|^2\\,dt`,
      `P=\\frac{1}{${formatNumber(width)}}\\int_{${formatNumber(safeWindow.from)}}^{${formatNumber(safeWindow.to)}}\\left|${toLatex(node)}\\right|^2\\,dt=${formatNumber(averagePower)}`,
      "\\mathrm{Classification}:\\ \\text{Power signal}",
    ] };
  }
  const energyEstimate = integrateTrapezoidal((time) => { const value = evaluateSignal(node, time); return value * value; }, safeWindow.from, safeWindow.to);
  const classification: Classification = energyEstimate > EPSILON ? "Energy" : "Neither";
  return { periodMode, window: safeWindow, detectedPeriod: lcm.fundamentalPeriod, energyEstimate, averagePower: 0, classification, impulses, lcm, steps: [
    `E=\\int_{t_1}^{t_2}\\left|x(t)\\right|^2\\,dt`,
    `E=\\int_{${formatNumber(safeWindow.from)}}^{${formatNumber(safeWindow.to)}}\\left|${toLatex(node)}\\right|^2\\,dt=${formatNumber(energyEstimate)}`,
    `\\mathrm{Classification}:\\ \\text{${classification === "Energy" ? "Energy signal" : "Neither"}}`,
  ] };
}

/** Legacy signature retained for imported modules; new Tab A calls analyzeWindowedSignal directly. */
export function analyzeSignal(node: SignalNode, periodMode: PeriodMode, manualPeriod?: number) { const period = manualPeriod && manualPeriod > EPSILON ? manualPeriod : detectedFundamentalPeriod(node) ?? 2 * Math.PI; return analyzeWindowedSignal(node, periodMode === "periodic" ? { from: 0, to: period } : DEFAULT_WINDOW, periodMode); }

export function evenComponent(node: SignalNode, time: number) { return (evaluateSignal(node, time) + evaluateSignal(node, -time)) / 2; }
export function oddComponent(node: SignalNode, time: number) { return (evaluateSignal(node, time) - evaluateSignal(node, -time)) / 2; }
