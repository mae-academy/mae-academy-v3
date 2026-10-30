/**
 * Graph IR validation (STEPS.md §5.2). Hand-written so errors name the exact path and the engine chunk stays small.
 * Structural rules only (Q12): node counts, cycles and link size are checked by parse, dag and codec.
 * Unknown keys are rejected (Q8). `validateGraph` returns a fully defaulted document on success.
 */
import {
  MAX_ID_LENGTH, MAX_ITEMS, MAX_LATEX_LENGTH, MAX_PARAMS, MAX_PERIOD_S, MIN_PERIOD_S, RESERVED_SYMBOLS,
} from "../constants";
import type { Animation, GraphIR, Item, ItemStyle, Param, View, Viewport } from "./types";
import { DEFAULT_VIEW, ITEM_KINDS, SUPPORTED_IR_VERSIONS } from "./types";

export interface IssueDetail {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; graph: GraphIR } | { ok: false; issues: IssueDetail[] };

/** Q11: link-safe ids. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Q10: a letter, optionally with a subscript (`a`, `a_1`, `k_{max}` stored as `k_max`), or a Greek name. */
const PARAM_NAME = /^(?:[A-Za-z]|alpha|beta|gamma|delta|epsilon|lambda|mu|nu|sigma|tau|phi|psi|omega|rho|kappa|eta|zeta|xi|chi)(?:_[A-Za-z0-9]+)?$/;
/** Q7: `#RRGGBB` or a design-token name. */
const COLOR_PATTERN = /^(?:#[0-9A-Fa-f]{6}|[a-z][a-z0-9-]*)$/;
const MAX_STYLE_WIDTH = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

class Checker {
  readonly issues: IssueDetail[] = [];
  issue(path: string, message: string) {
    this.issues.push({ path, message });
  }

  keys(o: Obj, path: string, allowed: readonly string[], required: readonly string[]) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.issue(`${path}.${k}`, "unknown key");
    for (const k of required) if (!(k in o)) this.issue(`${path}.${k}`, "required");
  }

  num(o: Obj, key: string, path: string): number {
    const v = o[key];
    if (!isFiniteNum(v)) {
      if (key in o) this.issue(`${path}.${key}`, "must be a finite number");
      return NaN;
    }
    return v;
  }

  viewport(v: unknown): Viewport | null {
    if (!isObj(v)) return this.issue("viewport", "must be an object"), null;
    this.keys(v, "viewport", ["xmin", "xmax", "ymin", "ymax", "aspect"], ["xmin", "xmax", "ymin", "ymax"]);
    const [xmin, xmax, ymin, ymax] = (["xmin", "xmax", "ymin", "ymax"] as const).map((k) => this.num(v, k, "viewport"));
    if (xmin >= xmax) this.issue("viewport", "xmin must be less than xmax");
    if (ymin >= ymax) this.issue("viewport", "ymin must be less than ymax");
    const aspect = v.aspect ?? "equal";
    if (aspect !== "equal" && aspect !== "free") this.issue("viewport.aspect", 'must be "equal" or "free"');
    return { xmin, xmax, ymin, ymax, aspect: aspect as Viewport["aspect"] };
  }

  animation(a: unknown, path: string, min: number, max: number): Animation | undefined {
    if (!isObj(a)) return this.issue(path, "must be an object"), undefined;
    this.keys(a, path, ["from", "to", "period_s", "loop"], ["from", "to", "period_s"]);
    const from = this.num(a, "from", path);
    const to = this.num(a, "to", path);
    const period = this.num(a, "period_s", path);
    if (from < min || from > max || to < min || to > max) this.issue(path, "from and to must lie within [min, max]");
    if (!(period >= MIN_PERIOD_S && period <= MAX_PERIOD_S)) this.issue(`${path}.period_s`, `must be between ${MIN_PERIOD_S} and ${MAX_PERIOD_S}`);
    const loop = a.loop ?? true;
    if (typeof loop !== "boolean") this.issue(`${path}.loop`, "must be a boolean");
    return { from, to, period_s: period, loop: loop as boolean };
  }

  params(p: unknown): Record<string, Param> {
    const out: Record<string, Param> = {};
    if (p === undefined) return out;
    if (!isObj(p)) return this.issue("params", "must be an object"), out;
    const names = Object.keys(p);
    if (names.length > MAX_PARAMS) this.issue("params", `at most ${MAX_PARAMS} parameters`);
    for (const name of names) {
      const path = `params.${name}`;
      if (!PARAM_NAME.test(name)) this.issue(path, "invalid parameter name");
      if (RESERVED_SYMBOLS.has(name)) this.issue(path, "reserved symbol cannot be a parameter");
      const v = p[name];
      if (!isObj(v)) {
        this.issue(path, "must be an object");
        continue;
      }
      this.keys(v, path, ["value", "min", "max", "step", "animate"], ["value", "min", "max", "step"]);
      const value = this.num(v, "value", path);
      const min = this.num(v, "min", path);
      const max = this.num(v, "max", path);
      const step = this.num(v, "step", path);
      if (!(min < max)) this.issue(path, "min must be less than max");
      if (value < min || value > max) this.issue(`${path}.value`, "must lie within [min, max]");
      if (!(step > 0)) this.issue(`${path}.step`, "must be positive");
      const param: Param = { value, min, max, step };
      if (v.animate !== undefined) param.animate = this.animation(v.animate, `${path}.animate`, min, max);
      out[name] = param;
    }
    return out;
  }

  style(s: unknown, path: string): ItemStyle | undefined {
    if (s === undefined) return undefined;
    if (!isObj(s)) return this.issue(path, "must be an object"), undefined;
    this.keys(s, path, ["color", "width", "fill", "hidden", "dash"], []);
    const out: ItemStyle = {};
    if (s.color !== undefined) {
      if (typeof s.color !== "string" || !COLOR_PATTERN.test(s.color)) this.issue(`${path}.color`, "must be #RRGGBB or a design-token name");
      else out.color = s.color;
    }
    if (s.width !== undefined) {
      if (!isFiniteNum(s.width) || s.width <= 0 || s.width > MAX_STYLE_WIDTH) this.issue(`${path}.width`, `must be in (0, ${MAX_STYLE_WIDTH}]`);
      else out.width = s.width;
    }
    for (const k of ["fill", "hidden"] as const) {
      if (s[k] !== undefined) {
        if (typeof s[k] !== "boolean") this.issue(`${path}.${k}`, "must be a boolean");
        else out[k] = s[k];
      }
    }
    if (s.dash !== undefined) {
      if (s.dash !== "solid" && s.dash !== "dashed" && s.dash !== "dotted") this.issue(`${path}.dash`, "must be solid, dashed or dotted");
      else out.dash = s.dash;
    }
    return out;
  }

  items(list: unknown): Item[] {
    if (!Array.isArray(list)) return this.issue("items", "must be an array"), [];
    if (list.length > MAX_ITEMS) this.issue("items", `at most ${MAX_ITEMS} items`);
    const seen = new Set<string>();
    const out: Item[] = [];
    list.forEach((it, i) => {
      const path = `items[${i}]`;
      if (!isObj(it)) return this.issue(path, "must be an object");
      this.keys(it, path, ["id", "latex", "kind", "style"], ["id", "latex"]);
      const id = it.id;
      if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) {
        this.issue(`${path}.id`, `must be 1–${MAX_ID_LENGTH} characters of A–Z, a–z, 0–9, _ or -`);
      } else if (seen.has(id)) this.issue(`${path}.id`, `duplicate id "${id}"`);
      else seen.add(id);
      const latex = it.latex;
      if (typeof latex !== "string") this.issue(`${path}.latex`, "must be a string");
      else if (latex.length > MAX_LATEX_LENGTH) this.issue(`${path}.latex`, `at most ${MAX_LATEX_LENGTH} characters`);
      if (it.kind !== undefined && !(ITEM_KINDS as readonly unknown[]).includes(it.kind)) this.issue(`${path}.kind`, "unknown kind");
      const item: Item = { id: String(id), latex: String(latex) };
      if (it.kind !== undefined) item.kind = it.kind as Item["kind"];
      const style = this.style(it.style, `${path}.style`);
      if (style) item.style = style;
      out.push(item);
    });
    return out;
  }

  view(v: unknown): View {
    if (v === undefined) return { ...DEFAULT_VIEW };
    if (!isObj(v)) return this.issue("view", "must be an object"), { ...DEFAULT_VIEW };
    this.keys(v, "view", ["mode", "grid", "showSteps", "locale"], []);
    const mode = v.mode ?? DEFAULT_VIEW.mode;
    if (mode === "3d") this.issue("view.mode", "3D is deferred by decision D3");
    else if (mode !== "2d") this.issue("view.mode", 'must be "2d"');
    const grid = v.grid ?? DEFAULT_VIEW.grid;
    const showSteps = v.showSteps ?? DEFAULT_VIEW.showSteps;
    if (typeof grid !== "boolean") this.issue("view.grid", "must be a boolean");
    if (typeof showSteps !== "boolean") this.issue("view.showSteps", "must be a boolean");
    const locale = v.locale ?? DEFAULT_VIEW.locale;
    if (locale !== "ar" && locale !== "en" && locale !== "es") this.issue("view.locale", "must be ar, en or es");
    return { mode: "2d", grid: grid as boolean, showSteps: showSteps as boolean, locale: locale as View["locale"] };
  }
}

export function validateGraph(input: unknown): ValidationResult {
  const c = new Checker();
  if (!isObj(input)) return { ok: false, issues: [{ path: "", message: "must be an object" }] };
  c.keys(input, "", ["version", "viewport", "params", "items", "view"], ["version", "viewport", "items"]);
  if (typeof input.version !== "string" || !SUPPORTED_IR_VERSIONS.includes(input.version)) {
    c.issue("version", `unsupported version ${JSON.stringify(input.version)}; supported: ${SUPPORTED_IR_VERSIONS.join(", ")}`);
  }
  const viewport = c.viewport(input.viewport);
  const params = c.params(input.params);
  const items = c.items(input.items);
  const view = c.view(input.view);
  // Paths are reported without the leading dot of the root object.
  const issues = c.issues.map((i) => ({ ...i, path: i.path.replace(/^\./, "") }));
  if (issues.length > 0 || !viewport) return { ok: false, issues };
  return { ok: true, graph: { version: input.version as string, viewport, params, items, view } };
}
