/**
 * Interactive-parameter spec: strict validation of the model's ```json:interactive-params block, SI formatting, slider
 * mapping and plot sampling. Pure functions only; every formula goes through the safe expression engine.
 */
import { compileExpr, isValidVariableName } from "./safeExpr";

export const MAX_SPEC_BYTES = 12 * 1024;
export const MAX_PARAMETERS = 8;
export const MAX_OUTPUTS = 4;
export const MIN_PLOT_POINTS = 20;
export const MAX_PLOT_POINTS = 400;
export const DEFAULT_PLOT_POINTS = 200;
/** Ratio max/min from which a slider switches to logarithmic travel. */
export const LOG_RATIO = 1000;
/** Resolution of a logarithmic slider (number of keyboard steps across the whole range). */
export const LOG_STEPS = 1000;

export interface ParamDef {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit: string;
}

export interface OutputDef {
  label: string;
  unit: string;
  formula: string;
  run: (scope: Readonly<Record<string, number>>) => number;
}

export interface PlotDef {
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  xScale: "linear" | "log";
  points: number;
  expression: string;
  run: (scope: Readonly<Record<string, number>>) => number;
  markerRun: ((scope: Readonly<Record<string, number>>) => number) | null;
  markerFormula: string | null;
}

export interface ParamsSpec {
  title: string;
  parameters: ParamDef[];
  outputs: OutputDef[];
  plot: PlotDef | null;
}

/** An error code (translated by the card) plus values for interpolation. */
export interface SpecIssue {
  code:
    | "tooLarge" | "notJson" | "notObject" | "noParameters" | "tooManyParameters" | "badParameter" | "badName" | "duplicateName"
    | "badNumber" | "minMax" | "defaultRange" | "stepPositive" | "noFormula" | "tooManyOutputs" | "badFormula" | "unknownName" | "badPlot" | "plotRange" | "plotLog" | "badText";
  values?: Record<string, string | number>;
}

export type SpecResult = { ok: true; spec: ParamsSpec } | { ok: false; issues: SpecIssue[] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Control characters, bidi overrides and `$` / backslash (labels are plain text; they never reach HTML or LaTeX). */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ")
    .replace(/[$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

/** Pulls the JSON out of an optional ```json fence wrapper some models add inside the block. */
export function extractSpecText(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[\w:-]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseParamsSpec(text: string): SpecResult {
  const body = extractSpecText(text);
  if (new TextEncoder().encode(body).length > MAX_SPEC_BYTES) return { ok: false, issues: [{ code: "tooLarge", values: { max: MAX_SPEC_BYTES / 1024 } }] };
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, issues: [{ code: "notJson" }] };
  }
  if (!isObject(raw)) return { ok: false, issues: [{ code: "notObject" }] };

  const issues: SpecIssue[] = [];
  const title = cleanText(raw.title, 120) ?? "";
  const rawParams = raw.parameters;
  if (!Array.isArray(rawParams) || rawParams.length === 0) return { ok: false, issues: [{ code: "noParameters" }] };
  if (rawParams.length > MAX_PARAMETERS) return { ok: false, issues: [{ code: "tooManyParameters", values: { max: MAX_PARAMETERS } }] };

  const parameters: ParamDef[] = [];
  const names = new Set<string>();
  rawParams.forEach((entry, index) => {
    if (!isObject(entry)) {
      issues.push({ code: "badParameter", values: { n: index + 1 } });
      return;
    }
    const name = typeof entry.name === "string" ? entry.name : "";
    if (!isValidVariableName(name)) {
      issues.push({ code: "badName", values: { name: name.slice(0, 24) || "?" } });
      return;
    }
    if (names.has(name)) {
      issues.push({ code: "duplicateName", values: { name } });
      return;
    }
    names.add(name);
    const label = cleanText(entry.label ?? name, 80) || name;
    const unit = cleanText(entry.unit ?? "", 12) ?? "";
    const { min, max, step } = entry;
    const def = entry.default;
    if (![min, max, def, step].every(isFiniteNumber)) {
      issues.push({ code: "badNumber", values: { name } });
      return;
    }
    const [lo, hi, d, s] = [min as number, max as number, def as number, step as number];
    if (lo >= hi) {
      issues.push({ code: "minMax", values: { name } });
      return;
    }
    if (d < lo || d > hi) {
      issues.push({ code: "defaultRange", values: { name } });
      return;
    }
    if (s <= 0) {
      issues.push({ code: "stepPositive", values: { name } });
      return;
    }
    parameters.push({ name, label, min: lo, max: hi, default: d, step: s, unit });
  });
  if (issues.length > 0) return { ok: false, issues };

  const variables = parameters.map((p) => p.name);
  const outputs: OutputDef[] = [];
  const compile = (formula: unknown, extra: readonly string[], where: string): ((scope: Readonly<Record<string, number>>) => number) | null => {
    if (typeof formula !== "string") {
      issues.push({ code: "badFormula", values: { where, message: "not text" } });
      return null;
    }
    const result = compileExpr(formula, [...variables, ...extra]);
    if (!result.ok) {
      const unknown = /^Unknown name "(.+)"$/.exec(result.message);
      issues.push(unknown ? { code: "unknownName", values: { where, name: unknown[1] } } : { code: "badFormula", values: { where, message: result.message } });
      return null;
    }
    return result.run;
  };

  if (typeof raw.formula === "string" && raw.formula.trim()) {
    const run = compile(raw.formula, [], "formula");
    if (run) outputs.push({ label: cleanText(raw.outputLabel, 80) || "Result", unit: cleanText(raw.outputUnit ?? "", 12) ?? "", formula: raw.formula, run });
  }
  if (raw.outputs !== undefined) {
    if (!Array.isArray(raw.outputs)) issues.push({ code: "badFormula", values: { where: "outputs", message: "not a list" } });
    else if (raw.outputs.length + outputs.length > MAX_OUTPUTS) issues.push({ code: "tooManyOutputs", values: { max: MAX_OUTPUTS } });
    else {
      raw.outputs.forEach((entry, index) => {
        if (!isObject(entry)) {
          issues.push({ code: "badFormula", values: { where: `outputs[${index}]`, message: "not an object" } });
          return;
        }
        const run = compile(entry.formula, [], `outputs[${index}]`);
        if (run) outputs.push({ label: cleanText(entry.label, 80) || `Result ${index + 1}`, unit: cleanText(entry.unit ?? "", 12) ?? "", formula: String(entry.formula), run });
      });
    }
  }
  if (outputs.length === 0 && !issues.some((i) => i.code === "badFormula" || i.code === "unknownName")) issues.push({ code: "noFormula" });

  let plot: PlotDef | null = null;
  if (raw.plot !== undefined && raw.plot !== null) {
    const p = raw.plot;
    if (!isObject(p)) issues.push({ code: "badPlot" });
    else {
      const xMin = p.xMin;
      const xMax = p.xMax;
      const scale = p.xScale === "log" ? "log" : "linear";
      if (!isFiniteNumber(xMin) || !isFiniteNumber(xMax) || xMin >= xMax) issues.push({ code: "plotRange" });
      else if (scale === "log" && xMin <= 0) issues.push({ code: "plotLog" });
      else {
        const run = compile(p.expression, ["x"], "plot.expression");
        let markerRun: PlotDef["markerRun"] = null;
        let markerFormula: string | null = null;
        if (typeof p.markerX === "string" && p.markerX.trim()) {
          markerRun = compile(p.markerX, [], "plot.markerX");
          markerFormula = p.markerX;
        }
        if (run && (markerRun || markerFormula === null)) {
          const points = isFiniteNumber(p.points) ? Math.min(MAX_PLOT_POINTS, Math.max(MIN_PLOT_POINTS, Math.round(p.points))) : DEFAULT_PLOT_POINTS;
          plot = {
            xLabel: cleanText(p.xLabel ?? "x", 80) || "x",
            yLabel: cleanText(p.yLabel ?? "y", 80) || "y",
            xMin,
            xMax,
            xScale: scale,
            points,
            expression: p.expression as string,
            run,
            markerRun,
            markerFormula,
          };
        }
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, spec: { title, parameters, outputs, plot } };
}

export function defaultValues(spec: ParamsSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((p) => [p.name, p.default]));
}

// ---------------------------------------------------------------- slider mapping

export function usesLog(p: Pick<ParamDef, "min" | "max">): boolean {
  // 1e-6 / 1e-9 is 999.9999999999999 in binary floating point: compare with a relative tolerance.
  return p.min > 0 && p.max / p.min >= LOG_RATIO * (1 - 1e-9);
}

/** Slider position range for the native input: the value itself for linear parameters, 0..LOG_STEPS for logarithmic ones. */
export function sliderBounds(p: ParamDef): { min: number; max: number; step: number } {
  return usesLog(p) ? { min: 0, max: LOG_STEPS, step: 1 } : { min: p.min, max: p.max, step: p.step };
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Trims binary-float noise (0.30000000000000004 -> 0.3) without losing meaningful digits. */
export function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

/** Snaps to the parameter's step grid (anchored at min) and clamps to the range. */
export function snapToStep(p: ParamDef, value: number): number {
  const steps = Math.round((value - p.min) / p.step);
  return clamp(tidy(p.min + steps * p.step), p.min, p.max);
}

export function valueToPosition(p: ParamDef, value: number): number {
  const v = clamp(value, p.min, p.max);
  if (!usesLog(p)) return v;
  return Math.round((Math.log(v / p.min) / Math.log(p.max / p.min)) * LOG_STEPS);
}

export function positionToValue(p: ParamDef, position: number): number {
  if (!usesLog(p)) return snapToStep(p, position);
  const t = clamp(position, 0, LOG_STEPS) / LOG_STEPS;
  const raw = p.min * Math.pow(p.max / p.min, t);
  if (t === 0) return p.min;
  if (t === 1) return p.max;
  // On a log scale snapping to a fixed step would make the low end jumpy; snap to the step only when the step is small
  // relative to the value, otherwise keep three significant digits.
  const snapped = raw >= p.step * 10 ? snapToStep(p, raw) : clamp(Number(raw.toPrecision(3)), p.min, p.max);
  return snapped;
}

// ---------------------------------------------------------------- SI formatting

const PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
];

const NO_PREFIX_UNITS = /^(?:|dB|dB\/dec|°|deg|%|ppm|V\/V|unitless|-|—|1)$/i;

/** 4 significant digits without trailing zeros: 159.1549 -> "159.2", 10 -> "10", 1.5 -> "1.5". */
function sig4(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

export interface SiParts {
  /** Number text including the SI prefix letter ("10k", "159.2", "100n"). */
  text: string;
  prefix: string;
}

export function siParts(value: number, allowPrefix = true): SiParts | null {
  if (!Number.isFinite(value)) return null;
  if (value === 0) return { text: "0", prefix: "" };
  const abs = Math.abs(value);
  if (allowPrefix && abs >= 0.9995e-12 && abs < 1e15) {
    let index = PREFIXES.findIndex(([factor]) => abs >= factor * 0.99995);
    if (index === -1) index = PREFIXES.length - 1;
    // 999.97 k rounds to 1000 k: promote to the next prefix.
    if (index > 0 && Math.abs(Number((value / PREFIXES[index][0]).toPrecision(4))) >= 1000) index -= 1;
    const [factor, prefix] = PREFIXES[index];
    return { text: `${sig4(value / factor)}${prefix}`, prefix };
  }
  const exponential = abs < 1e-3 || abs >= 1e6;
  return { text: exponential ? Number(value.toPrecision(4)).toExponential().replace("e+", "e") : sig4(value), prefix: "" };
}

/** Axis tick text: plain numbers in the everyday range, SI prefixes beyond it ("10k", "100k", "1M", "2µ"). */
export function tickLabel(value: number): string {
  const abs = Math.abs(value);
  if (value === 0 || (abs >= 1e-3 && abs < 1e3)) return sig4(value);
  return siParts(value, true)?.text ?? "";
}

/** Engineering notation with SI prefixes: formatSI(10000, "Ω") = "10 kΩ", formatSI(159.1549, "Hz") = "159.2 Hz". Non-finite -> "—". */
export function formatSI(value: number, unit = ""): string {
  const parts = siParts(value, !NO_PREFIX_UNITS.test(unit.trim()));
  if (!parts) return "—";
  if (!unit) return parts.text;
  return parts.prefix ? `${parts.text.slice(0, -parts.prefix.length)} ${parts.prefix}${unit}` : `${parts.text} ${unit}`;
}

const PREFIX_VALUE: Readonly<Record<string, number>> = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12 };

/** Reads what a person types into the exact-value field: "47n", "4.7k", "1e-6", "10 kΩ", "100 nF", "0,5". Null when it is not a number. */
export function parseNumericInput(text: string, unit = ""): number | null {
  let s = text.trim().replace(",", ".").replace(/\s+/g, "");
  if (!s) return null;
  const u = unit.trim();
  if (u && s.toLowerCase().endsWith(u.toLowerCase())) s = s.slice(0, s.length - u.length);
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([TGMkKmuµμnp]?)$/.exec(s);
  if (!m) return null;
  const value = Number(m[1]) * (m[2] ? PREFIX_VALUE[m[2]] : 1);
  return Number.isFinite(value) ? value : null;
}

/** The text a numeric field shows for a value: number with prefix and no unit ("10k", "100n", "47"). */
export function fieldText(value: number, unit: string): string {
  return siParts(value, !NO_PREFIX_UNITS.test(unit.trim()))?.text ?? "";
}

// ---------------------------------------------------------------- results and plot

export function computeOutputs(spec: ParamsSpec, values: Readonly<Record<string, number>>): Array<{ label: string; unit: string; value: number; text: string }> {
  return spec.outputs.map((o) => {
    const value = o.run(values);
    return { label: o.label, unit: o.unit, value, text: formatSI(value, o.unit) };
  });
}

export interface PlotGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Tick {
  value: number;
  label: string;
  major: boolean;
}

/** Sampled x positions (log or linear). */
export function sampleXs(plot: Pick<PlotDef, "xMin" | "xMax" | "xScale" | "points">): number[] {
  const xs: number[] = [];
  const n = plot.points;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    xs.push(plot.xScale === "log" ? plot.xMin * Math.pow(plot.xMax / plot.xMin, t) : plot.xMin + (plot.xMax - plot.xMin) * t);
  }
  return xs;
}

/** 1-2-5 "nice" ticks inside [lo, hi]. */
export function niceTicks(lo: number, hi: number, target = 6): number[] {
  if (!(hi > lo)) return [lo];
  const rough = (hi - lo) / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) ticks.push(tidy(v));
  return ticks;
}

export function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    const v = Math.pow(10, e);
    if (v >= lo * 0.9999 && v <= hi * 1.0001) ticks.push(v);
  }
  return ticks;
}

export interface PlotModel {
  xTicks: Tick[];
  yTicks: Tick[];
  /** SVG path data, drawn in the viewBox coordinates. Segments break at non-finite samples. */
  path: string;
  marker: { x: number; value: number; label: string } | null;
  yMin: number;
  yMax: number;
  finitePoints: number;
}

export function unitFromLabel(label: string): string {
  const m = /\(([^()]{1,12})\)\s*$/.exec(label);
  return m ? m[1] : "";
}

/** Maps the spec's curve for the current parameter values into pixel space. Pure; used by the SVG chart and by the tests. */
export function buildPlotModel(plot: PlotDef, values: Readonly<Record<string, number>>, g: PlotGeometry): PlotModel {
  const xs = sampleXs(plot);
  const ys = xs.map((x) => plot.run({ ...values, x }));
  const finite = ys.filter(Number.isFinite);
  let yMin = finite.length ? Math.min(...finite) : 0;
  let yMax = finite.length ? Math.max(...finite) : 1;
  if (yMax - yMin < 1e-12 * Math.max(1, Math.abs(yMax))) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.06;
  const yTicks = niceTicks(yMin - pad, yMax + pad, 6);
  if (yTicks.length >= 2) {
    yMin = Math.min(yMin - pad, yTicks[0]);
    yMax = Math.max(yMax + pad, yTicks[yTicks.length - 1]);
  } else {
    yMin -= pad;
    yMax += pad;
  }
  const w = g.width - g.left - g.right;
  const h = g.height - g.top - g.bottom;
  const px = (x: number) => g.left + (plot.xScale === "log" ? Math.log(x / plot.xMin) / Math.log(plot.xMax / plot.xMin) : (x - plot.xMin) / (plot.xMax - plot.xMin)) * w;
  const py = (y: number) => g.top + (1 - (y - yMin) / (yMax - yMin)) * h;
  let path = "";
  let pen = false;
  xs.forEach((x, i) => {
    const y = ys[i];
    if (!Number.isFinite(y)) {
      pen = false;
      return;
    }
    path += `${pen ? "L" : "M"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
    pen = true;
  });
  const xUnit = unitFromLabel(plot.xLabel);
  const xTickValues = plot.xScale === "log" ? logTicks(plot.xMin, plot.xMax) : niceTicks(plot.xMin, plot.xMax, 6);
  const xTicks = xTickValues.map((value) => ({ value, label: tickLabel(value), major: true }));
  const yTicksOut = yTicks.filter((v) => v >= yMin - 1e-12 && v <= yMax + 1e-12).map((value) => ({ value, label: tickLabel(value), major: true }));
  let marker: PlotModel["marker"] = null;
  if (plot.markerRun) {
    const mx = plot.markerRun(values);
    if (Number.isFinite(mx) && mx >= plot.xMin && mx <= plot.xMax && (plot.xScale !== "log" || mx > 0)) marker = { x: px(mx), value: mx, label: formatSI(mx, xUnit) };
  }
  return { xTicks, yTicks: yTicksOut, path, marker, yMin, yMax, finitePoints: finite.length };
}

/** Pixel x of a value for tick placement (shares the mapping with buildPlotModel). */
export function tickX(plot: Pick<PlotDef, "xMin" | "xMax" | "xScale">, g: PlotGeometry, x: number): number {
  const w = g.width - g.left - g.right;
  return g.left + (plot.xScale === "log" ? Math.log(x / plot.xMin) / Math.log(plot.xMax / plot.xMin) : (x - plot.xMin) / (plot.xMax - plot.xMin)) * w;
}
