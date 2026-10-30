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
import { DEFAULT_PARAM, MAX_PARAMS, RESERVED_SYMBOLS } from "../constants";
import type { DagResult } from "../graph/dag";
import { buildDag, transitiveDependents } from "../graph/dag";
import type { InferredType } from "../infer/inferType";
import { inferType } from "../infer/inferType";
import type { ParseError, ParseResult, RawParser } from "../parse/parse";
import { parseLatex } from "../parse/parse";
import type { GraphIR, Item, Param } from "../ir/types";

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
  | { kind: "Matrix"; size: 2 | 3; values: number[][] };

const NUMERIC_KINDS = new Set(["Scalar", "Value"]);

export class GraphEngine {
  private graphDoc: GraphIR;
  private readonly parseCache = new Map<string, ParseResult>();
  private items: ItemState[] = [];
  private dag: DagResult = buildDag([]);
  private readonly values = new Map<string, number>();
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

  value(name: string): number | undefined {
    return this.values.get(name);
  }

  cycles(): string[][] {
    return this.dag.cycles;
  }

  /** Replaces the document (new link, undo, MAE AI output). */
  load(graph: GraphIR): void {
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
    for (let pass = 0; pass < 3; pass++) {
      const states = this.graphDoc.items.map((it) => this.analyze(it, fnNames));
      const next = new Set(states.filter((s) => s.type.kind === "FunctionDef").flatMap((s) => s.defines));
      this.items = states;
      if (next.size === fnNames.size && Array.from(next).every((n) => fnNames.has(n))) break;
      fnNames = next;
    }

    this.dag = buildDag(this.items);
    for (const cycle of this.dag.cycles) {
      for (const id of cycle) this.item(id)?.errors.push({ message: `Circular definition: ${cycle.join(" → ")} → ${cycle[0]}` });
    }
    for (const c of this.dag.conflicts) {
      for (const id of c.ids) this.item(id)?.errors.push({ message: `"${c.name}" is defined more than once` });
    }

    this.addAutoParams();
    this.functions = new Map();
    for (const it of this.items) {
      if (it.type.kind === "FunctionDef" && it.errors.length === 0) {
        this.functions.set(it.type.name, { params: it.type.params, body: it.type.body });
      }
    }
    this.values.clear();
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
    // Literal scalar items are sliders: they get a parameter entry holding the literal as its value.
    for (const it of this.items) {
      if (it.type.kind === "Scalar" && it.type.literal !== null && !params[it.type.name] && count < MAX_PARAMS) {
        const v = it.type.literal;
        params[it.type.name] = { ...DEFAULT_PARAM, value: v, min: Math.min(DEFAULT_PARAM.min, v), max: Math.max(DEFAULT_PARAM.max, v) };
        count++;
        changed = true;
      }
    }
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
          const values = t.rows.map((row) => row.map((cell) => this.compileWith(cell, []).evaluate(this.envValues)));
          this.runtimes.set(it.id, { kind: "Matrix", size: t.kind === "Matrix2" ? 2 : 3, values });
          break;
        }
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
