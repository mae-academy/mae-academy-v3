/**
 * Graph engine: Graph IR → parsed, typed, ordered and evaluated items (STEPS.md §4, §5, §6, ADR-9).
 *
 * - Items are parsed once per LaTeX string; the function names defined in the document decide whether `f(x)`
 *   is a call (normalization needs them, so parsing is two-pass when the set of functions changes).
 * - The dependency DAG orders evaluation; a parameter change re-evaluates only the items that depend on it.
 * - Every undefined symbol becomes a parameter with default values (STEPS.md §5.2, Q10).
 * - `evaluations` counts item evaluations, so "only dependents are updated" is measurable (Phase 2 exit).
 */
import type { Expr } from "../ast/expr";
import { calledFunctions, freeSymbols } from "../ast/expr";
import type { CompiledExpr, FunctionDef } from "../compile/compile";
import { compile } from "../compile/compile";
import { DEFAULT_PARAM, LINEARITY_PROBES, LINEARITY_RELATIVE_TOLERANCE, MAX_PARAMS, RESERVED_SYMBOLS } from "../constants";
import type { DagResult } from "../graph/dag";
import { buildDag, transitiveDependents } from "../graph/dag";
import type { InferredType, SystemSource } from "../infer/inferType";
import { inferType } from "../infer/inferType";
import type { ParseError, ParseResult, RawParser } from "../parse/parse";
import { parseLatex } from "../parse/parse";
import type { GraphIR, Item, Param } from "../ir/types";
import type { ImplicitSource } from "../implicit/source";

export interface ItemState {
  id: string;
  latex: string;
  parse: ParseResult;
  type: InferredType;
  defines: string[];
  uses: string[];
  /** Error shown at the item (parse, compile, cycle, conflicting definition). */
  errors: ParseError[];
  /** Non-blocking notes (a stored `kind` that disagrees with inference). */
  warnings: string[];
}

/** A compiled plottable item, ready to sample with the current parameter values. */
export type ItemRuntime =
  | { kind: "Explicit"; dependent: "y" | "x"; f: (v: number) => number }
  | { kind: "Polar"; r: (theta: number) => number }
  | { kind: "Parametric"; x: (t: number) => number; y: (t: number) => number }
  | { kind: "Point"; x: number; y: number }
  | { kind: "Implicit"; F: (x: number, y: number) => number; relation: "=" | "<" | "<=" | ">" | ">=" }
  | { kind: "ODE1"; F: (indep: number, dep: number) => number; dependent: string; independent: string }
  | { kind: "Value"; value: number }
  | { kind: "Matrix"; size: 2 | 3; values: number[][] }
  | { kind: "GaussSystem"; A: number[][]; b: number[]; unknowns: string[] };

const NUMERIC_KINDS = new Set(["Scalar", "Value"]);

export class GraphEngine {
  private graphDoc: GraphIR;
  private readonly parseCache = new Map<string, ParseResult>();
  /** Cache keys used by the current rebuild; the rest are dropped after it (one entry per keystroke otherwise). */
  private parseKeys = new Set<string>();
  /** Literal each scalar item had at the last rebuild: a changed literal moves its slider, an unchanged one does not. */
  private readonly lastLiteral = new Map<string, number>();
  /** Names used by some line at the last rebuild without parse errors (pruning removes only names dropped since). */
  private lastUsed = new Set<string>();
  private items: ItemState[] = [];
  private dag: DagResult = buildDag([]);
  private readonly values = new Map<string, number>();
  /** Values of named matrices (`M = [[…]]`), for systems written `M x = b`. */
  private readonly matrices = new Map<string, number[][]>();
  private functions = new Map<string, FunctionDef>();
  private readonly runtimes = new Map<string, ItemRuntime | null>();
  private envNames: string[] = [];
  private envValues = new Float64Array(0);
  /** Item evaluations since construction (STEPS.md §11 Phase 2 exit: evaluation count measured). */
  evaluations = 0;

  constructor(
    private readonly parser: RawParser,
    graph: GraphIR,
  ) {
    this.graphDoc = graph;
    this.rebuild();
  }

  get graph(): GraphIR {
    return this.graphDoc;
  }

  itemStates(): readonly ItemState[] {
    return this.items;
  }

  item(id: string): ItemState | undefined {
    return this.items.find((i) => i.id === id);
  }

  runtime(id: string): ItemRuntime | null {
    return this.runtimes.get(id) ?? null;
  }

  /**
   * What a strip Worker needs to rebuild an implicit item's F (STEPS.md §7.1 technique 4): the expression, the
   * variable order (x, y, then the environment), the current environment values and the user functions.
   */
  implicitSource(id: string): ImplicitSource | null {
    const it = this.item(id);
    if (!it || it.errors.length > 0 || it.type.kind !== "Implicit" || !this.runtimes.get(id)) return null;
    return {
      F: it.type.F,
      variables: ["x", "y", ...this.envNames],
      env: Array.from(this.envValues),
      functions: Array.from(this.functions.entries()),
    };
  }

  value(name: string): number | undefined {
    return this.values.get(name);
  }

  cycles(): string[][] {
    return this.dag.cycles;
  }

  /**
   * Replaces the document. Parse failures are dropped from the cache first: they may come from the parser being
   * unavailable or slow, and the caller brings fresh parses with each load. `fresh` marks an unrelated document (an
   * import or a link), so what the previous document's sliders remembered does not carry over.
   */
  load(graph: GraphIR, options: { fresh?: boolean } = {}): void {
    for (const [key, r] of Array.from(this.parseCache.entries())) if (!r.ok) this.parseCache.delete(key);
    if (options.fresh) {
      this.lastLiteral.clear();
      this.lastUsed = new Set();
    }
    this.graphDoc = graph;
    this.rebuild();
  }

  /** Edits one item's LaTeX. Everything is re-derived because definitions may change. */
  setLatex(id: string, latex: string): void {
    this.graphDoc = { ...this.graphDoc, items: this.graphDoc.items.map((it) => (it.id === id ? { ...it, latex } : it)) };
    this.rebuild();
  }

  setItems(items: Item[]): void {
    this.graphDoc = { ...this.graphDoc, items };
    this.rebuild();
  }

  /**
   * Slider change: updates one parameter and re-evaluates only the items that depend on it.
   * Returns the ids of the items that were re-evaluated.
   */
  setParam(name: string, value: number): string[] {
    const p = this.graphDoc.params[name];
    if (!p) return [];
    const v = Math.min(p.max, Math.max(p.min, value));
    this.graphDoc = { ...this.graphDoc, params: { ...this.graphDoc.params, [name]: { ...p, value: v } } };
    this.values.set(name, v);
    // A literal scalar item `a = 2` is itself the slider for `a`; its dependents are what change.
    const users = this.items.filter((it) => it.uses.includes(name) || (it.type.kind === "Scalar" && it.defines.includes(name)));
    const affected = new Set(users.map((u) => u.id));
    transitiveDependents(this.dag, affected).forEach((id) => affected.add(id));
    const ids = this.dag.order.filter((id) => affected.has(id));
    this.refreshEnv();
    for (const id of ids) this.evaluateItem(this.item(id) as ItemState);
    return ids;
  }

  private parse(latex: string, functions: ReadonlySet<string>): ParseResult {
    const key = `${Array.from(functions).sort().join(",")}|${latex}`;
    this.parseKeys.add(key);
    let r = this.parseCache.get(key);
    if (!r) {
      r = parseLatex(latex, this.parser, { functions });
      this.parseCache.set(key, r);
    }
    return r;
  }

  private rebuild(): void {
    // Pass 1 finds function definitions; pass 2 parses with them so `f(x)` is a call.
    let fnNames = new Set<string>();
    this.parseKeys = new Set();
    for (let pass = 0; pass < 3; pass++) {
      const states = this.graphDoc.items.map((it) => this.analyze(it, fnNames));
      const next = new Set(states.filter((s) => s.type.kind === "FunctionDef").flatMap((s) => s.defines));
      this.items = states;
      if (next.size === fnNames.size && Array.from(next).every((n) => fnNames.has(n))) break;
      fnNames = next;
    }

    for (const key of Array.from(this.parseCache.keys())) if (!this.parseKeys.has(key)) this.parseCache.delete(key);

    this.dag = buildDag(this.items);
    for (const cycle of this.dag.cycles) {
      for (const id of cycle) this.item(id)?.errors.push({ message: `Circular definition: ${cycle.join(" → ")} → ${cycle[0]}` });
    }
    for (const c of this.dag.conflicts) {
      for (const id of c.ids) this.item(id)?.errors.push({ message: `"${c.name}" is defined more than once` });
    }
    // Lines that use a name defined twice, or that sit downstream of a circular definition, say so instead of vanishing.
    const conflicted = new Set(this.dag.conflicts.map((c) => c.name));
    for (const it of this.items) {
      const bad = it.uses.find((n) => conflicted.has(n) && !it.defines.includes(n));
      if (bad !== undefined) it.errors.push({ message: `"${bad}" is defined more than once` });
    }
    const ordered = new Set(this.dag.order);
    for (const it of this.items) {
      if (it.errors.length === 0 && !ordered.has(it.id)) it.errors.push({ message: "Depends on a circular definition" });
    }

    this.addAutoParams();
    this.functions = new Map();
    for (const it of this.items) {
      if (it.type.kind === "FunctionDef" && it.errors.length === 0) {
        this.functions.set(it.type.name, { params: it.type.params, body: it.type.body });
      }
    }
    this.values.clear();
    this.matrices.clear();
    for (const [name, p] of Object.entries(this.graphDoc.params)) this.values.set(name, p.value);
    this.runtimes.clear();
    this.refreshEnv();
    for (const id of this.dag.order) this.evaluateItem(this.item(id) as ItemState);
  }

  private analyze(it: Item, fnNames: ReadonlySet<string>): ItemState {
    const parse = this.parse(it.latex, fnNames);
    const state: ItemState = {
      id: it.id,
      latex: it.latex,
      parse,
      type: { kind: "Unknown", reason: "not parsed" },
      defines: [],
      uses: [],
      errors: parse.ok ? [] : parse.errors.slice(),
      warnings: [],
    };
    if (!parse.ok) return state;
    const t = inferType(parse.expr);
    state.type = t;
    if (t.kind === "Unknown") state.errors.push({ message: t.reason });
    let bodyForUses: Expr = parse.expr;
    const bound = new Set<string>();
    if (t.kind === "Scalar") {
      state.defines = [t.name];
      bodyForUses = t.expr;
    } else if (t.kind === "FunctionDef") {
      state.defines = [t.name];
      bodyForUses = t.body;
      t.params.forEach((p) => bound.add(p));
    } else if ((t.kind === "Matrix2" || t.kind === "Matrix3") && t.name) {
      state.defines = [t.name];
      bodyForUses = ["List", ...t.rows.flat()];
    } else if (t.kind === "GaussSystem") {
      // The unknowns are bound by the system; a named matrix is a use (so the system follows the matrix in the DAG).
      t.unknowns.forEach((u) => bound.add(u));
      const src = t.source;
      bodyForUses =
        src.form === "equations"
          ? ["List", ...src.F]
          : ["List", ...(Array.isArray(src.A) ? src.A.flat() : [src.A.name]), ...src.b];
    }
    const free = Array.from(freeSymbols(bodyForUses)).filter((s) => !bound.has(s) && !RESERVED_SYMBOLS.has(s));
    state.uses = free.concat(Array.from(calledFunctions(bodyForUses)));
    if (it.kind && it.kind !== t.kind && !(it.kind === "Matrix" && (t.kind === "Matrix2" || t.kind === "Matrix3"))) {
      state.warnings.push(`Stored kind ${it.kind} differs from the inferred ${t.kind}; ${t.kind} is used`);
    }
    return state;
  }

  /** Every used name that no item defines and that is not reserved becomes a parameter (STEPS.md §5.2). */
  private addAutoParams(): void {
    const defined = new Set(this.items.flatMap((i) => i.defines));
    const params: Record<string, Param> = { ...this.graphDoc.params };
    let count = Object.keys(params).length;
    let changed = false;
    // Literal scalar items are sliders: they get a parameter entry holding the literal as its value, and retyping
    // the literal (a = 2 → a = 5) moves the slider; leaving it alone keeps wherever the slider was dragged to.
    const conflicted = new Set(this.dag.conflicts.map((c) => c.name));
    for (const it of this.items) {
      if (it.type.kind !== "Scalar" || it.type.literal === null || conflicted.has(it.type.name) || it.errors.length > 0) continue;
      const name = it.type.name;
      const v = it.type.literal;
      const existing = params[name];
      if (!existing) {
        if (count >= MAX_PARAMS) continue;
        params[name] = { ...DEFAULT_PARAM, value: v, min: Math.min(DEFAULT_PARAM.min, v), max: Math.max(DEFAULT_PARAM.max, v) };
        count++;
        changed = true;
      } else if (this.lastLiteral.has(name) && this.lastLiteral.get(name) !== v) {
        params[name] = { ...existing, value: v, min: Math.min(existing.min, v), max: Math.max(existing.max, v) };
        changed = true;
      }
      this.lastLiteral.set(name, v);
    }
    // The literal is remembered as long as its slider exists, so retyping through an empty or invalid line
    // (a = 5 → a = → a = 7) still moves the slider; it is forgotten with the slider (below).
    for (const it of this.items) {
      for (const name of it.uses) {
        if (defined.has(name) || params[name] || RESERVED_SYMBOLS.has(name)) continue;
        if (it.type.kind === "FunctionDef" && it.type.params.includes(name)) continue;
        if (count >= MAX_PARAMS) {
          it.errors.push({ message: `Too many parameters (limit ${MAX_PARAMS}); "${name}" is undefined` });
          continue;
        }
        params[name] = { ...DEFAULT_PARAM };
        count++;
        changed = true;
      }
    }
    // A slider whose last use was deleted goes away with it (and stops counting toward the limit). While any line has
    // a parse error (mid-typing: y = a\sin( ), nothing is pruned, so the slider keeps its range and value; a parameter
    // that came with the document and was never used is kept too.
    // An empty line is not a line being typed: it does not stop pruning. While typing, names used now are added to
    // what is remembered, so a slider that appears and disappears mid-typing is still pruned later.
    const used = new Set(this.items.flatMap((i) => i.uses));
    const typing = this.items.some((i) => !i.parse.ok && i.latex.trim() !== "");
    if (!typing) {
      for (const name of Object.keys(params)) {
        if (this.lastUsed.has(name) && !used.has(name) && !defined.has(name)) {
          delete params[name];
          changed = true;
        }
      }
      this.lastUsed = used;
    } else {
      used.forEach((n) => this.lastUsed.add(n));
    }
    for (const name of Array.from(this.lastLiteral.keys())) if (!params[name]) this.lastLiteral.delete(name);
    if (changed) this.graphDoc = { ...this.graphDoc, params };
  }

  /** Names and values every compiled closure sees, in a fixed order. */
  private refreshEnv(): void {
    const names = Array.from(this.values.keys()).sort();
    if (names.join(",") !== this.envNames.join(",")) {
      this.envNames = names;
      this.envValues = new Float64Array(names.length);
    }
    names.forEach((n, i) => (this.envValues[i] = this.values.get(n) as number));
  }

  private compileWith(expr: Expr, leading: string[]): CompiledExpr {
    return compile(expr, { variables: [...leading, ...this.envNames], functions: this.functions });
  }

  /** Binds the leading variables and the current environment into a fast closure. */
  private bind1(c: CompiledExpr): (v: number) => number {
    const buf = new Float64Array(1 + this.envValues.length);
    buf.set(this.envValues, 1);
    return (v) => {
      buf[0] = v;
      return c.evaluate(buf);
    };
  }

  private bind2(c: CompiledExpr): (a: number, b: number) => number {
    const buf = new Float64Array(2 + this.envValues.length);
    buf.set(this.envValues, 2);
    return (a, b) => {
      buf[0] = a;
      buf[1] = b;
      return c.evaluate(buf);
    };
  }

  /** A constant entry (matrix cell, right side); a non-finite value is an error at the item. */
  private constant(e: Expr): number {
    const v = this.compileWith(e, []).evaluate(this.envValues);
    if (!Number.isFinite(v)) throw new Error("A matrix or right-side entry is not a finite number");
    return v;
  }

  /**
   * A and b of a system. Equations are reduced to coefficients numerically: c₀ = F(0), cⱼ = F(eⱼ) − c₀, then the
   * affine model is checked at LINEARITY_PROBES so x² or xy is reported instead of being linearized.
   */
  private system(unknowns: string[], src: SystemSource): { A: number[][]; b: number[] } {
    if (src.form === "matrix") {
      let A: number[][];
      if (Array.isArray(src.A)) A = src.A.map((row) => row.map((cell) => this.constant(cell)));
      else {
        const m = this.matrices.get(src.A.name);
        if (!m) throw new Error(`"${src.A.name}" is not a matrix defined in this graph`);
        if (m.length !== unknowns.length) throw new Error(`"${src.A.name}" is ${m.length}×${m.length} but there are ${unknowns.length} unknowns`);
        A = m.map((r) => r.slice());
      }
      return { A, b: src.b.map((v) => this.constant(v)) };
    }
    const n = unknowns.length;
    const A: number[][] = [];
    const b: number[] = [];
    src.F.forEach((f, i) => {
      const c = this.compileWith(f, unknowns);
      const buf = new Float64Array(n + this.envValues.length);
      buf.set(this.envValues, n);
      const at = (p: readonly number[]) => {
        for (let j = 0; j < n; j++) buf[j] = p[j];
        return c.evaluate(buf);
      };
      const c0 = at(new Array<number>(n).fill(0));
      const row = unknowns.map((_, j) => at(unknowns.map((__, k) => (k === j ? 1 : 0))) - c0);
      if (!Number.isFinite(c0) || row.some((v) => !Number.isFinite(v))) throw new Error(`Equation ${i + 1} is not defined at 0`);
      for (const probe of LINEARITY_PROBES) {
        const p = probe.slice(0, n);
        const model = c0 + row.reduce((s, v, j) => s + v * p[j], 0);
        const actual = at(p);
        const scale = Math.abs(c0) + row.reduce((s, v, j) => s + Math.abs(v * p[j]), 0) + Math.abs(actual);
        if (!(Math.abs(actual - model) <= LINEARITY_RELATIVE_TOLERANCE * Math.max(scale, Number.MIN_VALUE))) {
          throw new Error(`Equation ${i + 1} is not linear in ${unknowns.join(", ")}`);
        }
      }
      A.push(row);
      // 0 − c₀ rather than −c₀, so an empty right side is +0 (no "-0" in the report).
      b.push(0 - c0);
    });
    return { A, b };
  }

  private evaluateItem(it: ItemState): void {
    this.evaluations++;
    if (it.errors.length > 0 || !it.parse.ok) {
      this.runtimes.set(it.id, null);
      return;
    }
    const t = it.type;
    try {
      switch (t.kind) {
        case "Scalar": {
          const fromParam = this.graphDoc.params[t.name];
          const v = t.literal !== null && fromParam ? fromParam.value : this.compileWith(t.expr, []).evaluate(this.envValues);
          this.values.set(t.name, v);
          this.refreshEnv();
          this.runtimes.set(it.id, { kind: "Value", value: v });
          break;
        }
        case "Value":
          this.runtimes.set(it.id, { kind: "Value", value: this.compileWith(t.expr, []).evaluate(this.envValues) });
          break;
        case "Explicit":
          this.runtimes.set(it.id, { kind: "Explicit", dependent: t.dependent, f: this.bind1(this.compileWith(t.rhs, [t.independent])) });
          break;
        case "Polar":
          this.runtimes.set(it.id, { kind: "Polar", r: this.bind1(this.compileWith(t.rhs, ["theta"])) });
          break;
        case "Parametric":
          this.runtimes.set(it.id, {
            kind: "Parametric",
            x: this.bind1(this.compileWith(t.x, ["t"])),
            y: this.bind1(this.compileWith(t.y, ["t"])),
          });
          break;
        case "Point":
          this.runtimes.set(it.id, {
            kind: "Point",
            x: this.compileWith(t.x, []).evaluate(this.envValues),
            y: this.compileWith(t.y, []).evaluate(this.envValues),
          });
          break;
        case "Implicit":
          this.runtimes.set(it.id, { kind: "Implicit", F: this.bind2(this.compileWith(t.F, ["x", "y"])), relation: t.relation });
          break;
        case "ODE1":
          this.runtimes.set(it.id, {
            kind: "ODE1",
            F: this.bind2(this.compileWith(t.F, [t.independent, t.dependent])),
            dependent: t.dependent,
            independent: t.independent,
          });
          break;
        case "Matrix2":
        case "Matrix3": {
          const values = t.rows.map((row) => row.map((cell) => this.constant(cell)));
          if (t.name) this.matrices.set(t.name, values);
          this.runtimes.set(it.id, { kind: "Matrix", size: t.kind === "Matrix2" ? 2 : 3, values });
          break;
        }
        case "GaussSystem":
          this.runtimes.set(it.id, { kind: "GaussSystem", unknowns: t.unknowns, ...this.system(t.unknowns, t.source) });
          break;
        default:
          this.runtimes.set(it.id, null);
      }
    } catch (err) {
      it.errors.push({ message: err instanceof Error ? err.message : String(err) });
      this.runtimes.set(it.id, null);
    }
  }
}

/** True for item types whose value is a number (sliders and computed values). */
export function isNumericKind(kind: string): boolean {
  return NUMERIC_KINDS.has(kind);
}
