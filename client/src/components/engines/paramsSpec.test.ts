import { describe, expect, it } from "vitest";
import {
  LOG_STEPS, buildPlotModel, computeOutputs, defaultValues, fieldText, formatSI, logTicks, niceTicks, parseNumericInput, parseParamsSpec, positionToValue, sampleXs, sliderBounds,
  snapToStep, unitFromLabel, usesLog, valueToPosition, type ParamDef, type ParamsSpec, type PlotGeometry,
} from "./paramsSpec";

const RC = {
  title: "RC low-pass filter",
  parameters: [
    { name: "R", label: "Resistance (R)", min: 100, max: 100000, default: 10000, step: 100, unit: "Ω" },
    { name: "C", label: "Capacitance (C)", min: 1e-9, max: 1e-6, default: 100e-9, step: 1e-9, unit: "F" },
  ],
  formula: "1 / (2 * Math.PI * R * C)",
  outputLabel: "Cutoff Frequency (f_c)",
  outputUnit: "Hz",
  plot: { xLabel: "Frequency (Hz)", xMin: 1, xMax: 100000, xScale: "log", yLabel: "Gain (dB)", expression: "20*Math.log10(1/Math.sqrt(1+Math.pow(x/(1/(2*Math.PI*R*C)),2)))", markerX: "1/(2*Math.PI*R*C)", points: 200 },
};

function spec(value: unknown = RC): ParamsSpec {
  const result = parseParamsSpec(JSON.stringify(value));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}
const codes = (value: unknown) => {
  const result = parseParamsSpec(typeof value === "string" ? value : JSON.stringify(value));
  return result.ok ? [] : result.issues.map((i) => i.code);
};

describe("formatSI", () => {
  const table: Array<[number, string, string]> = [
    [10000, "Ω", "10 kΩ"],
    [100e-9, "F", "100 nF"],
    [1e-6, "F", "1 µF"],
    [47e-9, "F", "47 nF"],
    [159.1549, "Hz", "159.2 Hz"],
    [79.5775, "Hz", "79.58 Hz"],
    [4700, "Ω", "4.7 kΩ"],
    [1.5e6, "Hz", "1.5 MHz"],
    [0.001, "s", "1 ms"],
    [2.2e-12, "F", "2.2 pF"],
    [100, "Ω", "100 Ω"],
    [999.99, "Hz", "1 kHz"],
    [0, "V", "0 V"],
    [-3.0103, "dB", "-3.01 dB"],
    [0.7071, "", "0.7071"],
    [1500, "", "1500"],
    [0.0001581, "", "1.581e-4"],
    [31622.78, "rad/s", "31.62 krad/s"],
    [-2500, "V", "-2.5 kV"],
  ];
  for (const [value, unit, text] of table) it(`${value} ${unit} -> ${text}`, () => expect(formatSI(value, unit)).toBe(text));
  it("non-finite values show a dash", () => {
    for (const v of [NaN, Infinity, -Infinity]) expect(formatSI(v, "Hz")).toBe("—");
  });
  it("field text omits the unit", () => {
    expect(fieldText(10000, "Ω")).toBe("10k");
    expect(fieldText(100e-9, "F")).toBe("100n");
    expect(fieldText(0.5, "")).toBe("0.5");
  });
});

describe("parseNumericInput", () => {
  const ok: Array<[string, string, number]> = [
    ["10k", "Ω", 10000], ["47n", "F", 47e-9], ["4.7µ", "F", 4.7e-6], ["4.7u", "F", 4.7e-6], ["1e-6", "F", 1e-6], ["10 kΩ", "Ω", 10000],
    ["100 nF", "F", 100e-9], ["0,5", "", 0.5], ["2M", "Hz", 2e6], ["5m", "V", 0.005], ["  15  ", "V", 15], ["-3", "dB", -3], ["22 ohm", "ohm", 22],
  ];
  for (const [text, unit, value] of ok) it(`${JSON.stringify(text)} -> ${value}`, () => expect(parseNumericInput(text, unit)).toBeCloseTo(value, 12));
  for (const bad of ["", "abc", "1..2", "1k2", "alert(1)", "10 kΩΩ", "Infinity", "NaN", "1e999", "--1"]) {
    it(`rejects ${JSON.stringify(bad)}`, () => expect(parseNumericInput(bad, "Ω")).toBeNull());
  }
});

describe("slider mapping", () => {
  const R = spec().parameters[0];
  const C = spec().parameters[1];
  const linear: ParamDef = { name: "K", label: "K", min: 0, max: 10, default: 2, step: 0.5, unit: "" };

  it("uses logarithmic travel only when max/min >= 1000", () => {
    expect(usesLog(R)).toBe(true);
    expect(usesLog(C)).toBe(true);
    expect(usesLog(linear)).toBe(false);
    expect(usesLog({ min: 1, max: 999 })).toBe(false);
    expect(usesLog({ min: 0, max: 1e6 })).toBe(false);
    expect(sliderBounds(R)).toEqual({ min: 0, max: LOG_STEPS, step: 1 });
    expect(sliderBounds(linear)).toEqual({ min: 0, max: 10, step: 0.5 });
  });
  it("round trips the default through the slider position", () => {
    expect(positionToValue(R, valueToPosition(R, 10000))).toBeCloseTo(10000, 6);
    expect(positionToValue(C, valueToPosition(C, 100e-9))).toBeCloseTo(100e-9, 12);
  });
  it("endpoints are exact and geometric midpoint is the geometric mean", () => {
    expect(positionToValue(R, 0)).toBe(100);
    expect(positionToValue(R, LOG_STEPS)).toBe(100000);
    expect(valueToPosition(R, 100)).toBe(0);
    expect(valueToPosition(R, 100000)).toBe(LOG_STEPS);
    expect(positionToValue(R, LOG_STEPS / 2)).toBeCloseTo(Math.sqrt(100 * 100000), -2);
  });
  it("is monotonic over the whole log range and stays inside it", () => {
    let last = 0;
    for (let p = 0; p <= LOG_STEPS; p += 7) {
      const v = positionToValue(C, p);
      expect(v).toBeGreaterThanOrEqual(1e-9);
      expect(v).toBeLessThanOrEqual(1e-6);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
  it("snaps to the step grid and clamps (linear)", () => {
    expect(positionToValue(linear, 2.3)).toBe(2.5);
    expect(positionToValue(linear, 99)).toBe(10);
    expect(snapToStep(linear, -4)).toBe(0);
    expect(snapToStep({ ...linear, step: 0.1 }, 0.30000000000000004)).toBe(0.3);
  });
  it("positions clamp out-of-range values", () => {
    expect(valueToPosition(R, 1)).toBe(0);
    expect(valueToPosition(R, 1e9)).toBe(LOG_STEPS);
    expect(valueToPosition(linear, 50)).toBe(10);
  });
});

describe("parseParamsSpec validation", () => {
  it("accepts the RC filter and computes the cutoff", () => {
    const s = spec();
    expect(s.parameters).toHaveLength(2);
    const [out] = computeOutputs(s, defaultValues(s));
    expect(out.value).toBeCloseTo(159.1549, 3);
    expect(out.text).toBe("159.2 Hz");
    expect(out.label).toBe("Cutoff Frequency (f_c)");
  });
  it("tolerates a json fence wrapper inside the block", () => {
    expect(parseParamsSpec("```json\n" + JSON.stringify(RC) + "\n```").ok).toBe(true);
  });
  it("supports several outputs", () => {
    const s = spec({ ...RC, outputs: [{ label: "Time constant", formula: "R*C", unit: "s" }] });
    const values = computeOutputs(s, defaultValues(s));
    expect(values).toHaveLength(2);
    expect(values[1].text).toBe("1 ms");
  });
  const mutate = (patch: (p: Record<string, unknown>[]) => void) => {
    const copy = JSON.parse(JSON.stringify(RC));
    patch(copy.parameters);
    return copy;
  };
  it("reports every kind of parameter error", () => {
    expect(codes(mutate((p) => (p[0].min = 100000)))).toContain("minMax");
    expect(codes(mutate((p) => (p[0].min = 200000)))).toContain("minMax");
    expect(codes(mutate((p) => (p[0].default = 5)))).toContain("defaultRange");
    expect(codes(mutate((p) => (p[0].step = 0)))).toContain("stepPositive");
    expect(codes(mutate((p) => (p[0].step = -1)))).toContain("stepPositive");
    expect(codes(mutate((p) => (p[1].name = "R")))).toContain("duplicateName");
    expect(codes(mutate((p) => (p[0].name = "constructor")))).toContain("badName");
    expect(codes(mutate((p) => (p[0].name = "Math")))).toContain("badName");
    expect(codes(mutate((p) => (p[0].name = "a b")))).toContain("badName");
    expect(codes(mutate((p) => (p[0].min = "100")))).toContain("badNumber");
    expect(codes(mutate((p) => (p[0].max = null)))).toContain("badNumber");
    expect(codes(mutate((p) => (p[0] = 5 as never)))).toContain("badParameter");
  });
  it("reports formula problems, including unknown names", () => {
    expect(codes({ ...RC, formula: "1/(2*PI*R*Q)" })).toContain("unknownName");
    expect(codes({ ...RC, formula: "R +" })).toContain("badFormula");
    expect(codes({ ...RC, formula: 'constructor.constructor("alert(1)")()' })).not.toEqual([]);
    expect(codes({ ...RC, formula: undefined, plot: undefined })).toContain("noFormula");
    expect(codes({ ...RC, plot: { ...RC.plot, expression: "x / Z" } })).toContain("unknownName");
    expect(codes({ ...RC, plot: { ...RC.plot, markerX: "evil()" } })).not.toEqual([]);
  });
  it("reports plot problems", () => {
    expect(codes({ ...RC, plot: { ...RC.plot, xMin: 10, xMax: 1 } })).toContain("plotRange");
    expect(codes({ ...RC, plot: { ...RC.plot, xMin: 0 } })).toContain("plotLog");
    expect(codes({ ...RC, plot: "no" })).toContain("badPlot");
  });
  it("enforces size and count caps", () => {
    expect(codes("x".repeat(13 * 1024))).toContain("tooLarge");
    const many = { ...RC, parameters: Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, min: 0, max: 1, default: 0.5, step: 0.1 })) };
    expect(codes({ ...many, formula: "p0" })).toContain("tooManyParameters");
    expect(codes({ ...RC, parameters: [] })).toContain("noParameters");
    expect(codes("{not json")).toContain("notJson");
    expect(codes("[1]")).toContain("notObject");
  });
  it("drops control characters, dollars and backslashes from labels", () => {
    const s = spec({ ...RC, title: "A‮B $\\frac$ <b>x</b>" });
    expect(s.title).not.toMatch(/[‮$\\]/);
  });
});

describe("plot model", () => {
  const G: PlotGeometry = { width: 640, height: 320, left: 58, right: 18, top: 16, bottom: 50 };
  const s = spec();
  const plot = s.plot!;
  it("samples a log axis geometrically and linear axes evenly", () => {
    const xs = sampleXs(plot);
    expect(xs).toHaveLength(200);
    expect(xs[0]).toBeCloseTo(1, 9);
    expect(xs[199]).toBeCloseTo(100000, 3);
    expect(xs[100] / xs[99]).toBeCloseTo(xs[50] / xs[49], 9);
    const lin = sampleXs({ xMin: 0, xMax: 10, xScale: "linear", points: 11 });
    expect(lin[5]).toBe(5);
  });
  it("places the marker at the cutoff and moves it when R doubles", () => {
    const a = buildPlotModel(plot, { R: 10000, C: 100e-9 }, G);
    const b = buildPlotModel(plot, { R: 20000, C: 100e-9 }, G);
    expect(a.marker?.label).toBe("159.2 Hz");
    expect(b.marker?.label).toBe("79.58 Hz");
    expect(b.marker!.x).toBeLessThan(a.marker!.x);
    // two-to-one frequency is log10(2) decades of 5 decades across the plot width
    const decade = (G.width - G.left - G.right) / 5;
    expect(a.marker!.x - b.marker!.x).toBeCloseTo(Math.log10(2) * decade, 1);
  });
  it("draws a single connected path, flat near 0 dB and falling past the cutoff", () => {
    const m = buildPlotModel(plot, { R: 10000, C: 100e-9 }, G);
    expect(m.path.startsWith("M")).toBe(true);
    expect(m.path.match(/M/g)).toHaveLength(1);
    expect(m.finitePoints).toBe(200);
    expect(m.yMax).toBeGreaterThan(0);
    expect(m.yMin).toBeLessThan(-50);
  });
  it("breaks the path at non-finite samples and survives an all-NaN curve", () => {
    const bad = spec({ ...RC, plot: { ...RC.plot, expression: "sqrt(x - 1000)", markerX: undefined } }).plot!;
    const m = buildPlotModel(bad, { R: 1, C: 1 }, G);
    expect(m.finitePoints).toBeGreaterThan(0);
    expect(m.finitePoints).toBeLessThan(200);
    const none = spec({ ...RC, plot: { ...RC.plot, expression: "sqrt(-1 - x)", markerX: undefined } }).plot!;
    expect(buildPlotModel(none, { R: 1, C: 1 }, G).path).toBe("");
  });
  it("hides the marker outside the axis and for non-finite values", () => {
    expect(buildPlotModel(plot, { R: 100, C: 1e-9 }, G).marker).toBeNull(); // 1.59 MHz is beyond 100 kHz
  });
  it("ticks", () => {
    expect(logTicks(1, 100000)).toEqual([1, 10, 100, 1000, 10000, 100000]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-60, 5, 6).every((t) => t >= -60 && t <= 5)).toBe(true);
    expect(buildPlotModel(plot, { R: 10000, C: 100e-9 }, G).xTicks.map((t) => t.label)).toEqual(["1", "10", "100", "1k", "10k", "100k"]);
    expect(unitFromLabel("Frequency (Hz)")).toBe("Hz");
    expect(unitFromLabel("Gain")).toBe("");
  });
});
