import { describe, expect, it } from "vitest";
import {
  analyzeSequence, applyOperation, detectPeriod, discreteWindow, discreteYDomain, evaluateDiscrete, IDENTITY_OPERATION, operationLatex, parseDiscreteSignal,
  sampleSequence, sequenceArrayLatex, sequenceEnergy, sequenceSupport, type DiscreteOperation,
} from "./discreteSignalEngine";

const seq = (source: string) => { const parsed = parseDiscreteSignal(source); if (!parsed.ok) throw new Error(parsed.error); return parsed.node; };
const values = (source: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => evaluateDiscrete(seq(source), from + i));
const x = (source: string) => { const node = seq(source); return (n: number) => evaluateDiscrete(node, n); };
const op = (patch: Partial<DiscreteOperation>): DiscreteOperation => ({ ...IDENTITY_OPERATION, ...patch });
const window = (samples: ReturnType<typeof applyOperation>, from: number, to: number) => samples.filter((s) => s.n >= from && s.n <= to).map((s) => s.value);

describe("discrete signal parsing & canonical generators", () => {
  it("u[n] − u[n−5] is 1 on n = 0…4 and 0 elsewhere", () => { expect(values("u[n]-u[n-5]", -2, 6)).toEqual([0, 0, 1, 1, 1, 1, 1, 0, 0]); });
  it("accepts MathLive bracket spellings and an x[n]= prefix", () => {
    expect(values("x\\left\\lbrack n\\right\\rbrack=u\\left\\lbrack n-1\\right\\rbrack", -1, 2)).toEqual([0, 0, 1, 1]);
    expect(values("u\\left[n\\right]", -1, 1)).toEqual([0, 1, 1]);
  });
  it("Kronecker delta, ramp, rect_N, exponentials and sinusoids", () => {
    expect(values("\\delta[n]+2\\delta[n-1]-\\delta[n-2]", -1, 3)).toEqual([0, 1, 2, -1, 0]);
    expect(values("r[n]", -2, 3)).toEqual([0, 0, 0, 1, 2, 3]);
    expect(values("\\text{rect}_{2}[n]", -3, 3)).toEqual([0, 1, 1, 1, 1, 1, 0]);
    expect(values("0.5^{n}u[n]", -1, 3)).toEqual([0, 1, 0.5, 0.25, 0.125]);
    expect(values("e^{-n}u[n]", 0, 1)[1]).toBeCloseTo(Math.exp(-1), 12);
    expect(values("\\cos\\left(\\frac{\\pi}{2}n\\right)", 0, 3).map((v) => Math.round(v) + 0)).toEqual([1, 0, -1, 0]);
  });
  it("fails gracefully", () => { expect(parseDiscreteSignal("").ok).toBe(false); expect(parseDiscreteSignal("u[n").ok).toBe(false); });
});

describe("discrete operations (integer index only)", () => {
  const box = x("u[n]-u[n-5]");
  it("shift x[n−2] moves the stems right by 2", () => { expect(window(applyOperation(box, op({ shift: 2 })), 0, 8)).toEqual([0, 0, 1, 1, 1, 1, 1, 0, 0]); });
  it("reversal x[−n] mirrors about n = 0", () => { expect(window(applyOperation(box, op({ reverse: true })), -6, 1)).toEqual([0, 0, 1, 1, 1, 1, 1, 0]); });
  it("decimation x[2n] keeps every second sample", () => {
    const ramp = x("n\\,u[n]");
    expect(window(applyOperation(ramp, op({ scaling: "down", factor: 2 })), 0, 3)).toEqual([0, 2, 4, 6]);
  });
  it("interpolation x[n/3] inserts two zeros between samples", () => {
    const ramp = x("n\\,u[n]");
    expect(window(applyOperation(ramp, op({ scaling: "up", factor: 3 })), 0, 7)).toEqual([0, 0, 0, 1, 0, 0, 2, 0]);
  });
  it("amplitude and bias: 2x[n] − 1", () => { expect(window(applyOperation(box, op({ amplitude: 2, bias: -1 })), -1, 5)).toEqual([-1, 1, 1, 1, 1, 1, -1]); });
  it("combined pipeline y[n] = x[−2n − 1] matches the stated formula", () => {
    const ramp = x("n\\,u[n]");
    const out = applyOperation(ramp, op({ shift: 1, reverse: true, scaling: "down", factor: 2 }));
    [-5, -3, -1, 0, 2].forEach((n) => expect(out.find((s) => s.n === n)!.value).toBe(ramp(-2 * n - 1) + 0));
    expect(operationLatex(op({ shift: 1, reverse: true, scaling: "down", factor: 2 }))).toBe("y[n]=x\\!\\left[-2n-1\\right]");
  });
  it("operation LaTeX", () => {
    expect(operationLatex(op({ shift: 2 }))).toBe("y[n]=x\\!\\left[n-2\\right]");
    expect(operationLatex(op({ reverse: true }))).toBe("y[n]=x\\!\\left[-n\\right]");
    expect(operationLatex(op({ amplitude: 2, bias: -1 }))).toBe("y[n]=2\\,x\\!\\left[n\\right]-1");
  });
});

describe("auto-framing & summaries", () => {
  it("window is symmetric about n = 0: [−S, S] with S = max(10, extent + 2)", () => {
    const samples = sampleSequence(seq("u[n]-u[n-5]"));
    expect(sequenceSupport(samples)).toMatchObject({ lo: 0, hi: 4, unboundedLeft: false, unboundedRight: false });
    expect(discreteWindow([samples])).toEqual({ from: -10, to: 10 });
    const shifted = applyOperation(x("u[n]-u[n-5]"), op({ shift: 12 }));
    expect(discreteWindow([samples, shifted])).toEqual({ from: -18, to: 18 });
    expect(discreteWindow([sampleSequence(seq("u[n-60]-u[n-65]"))])).toEqual({ from: -40, to: 40 });
  });
  it("unbounded sides fill the default span", () => {
    expect(discreteWindow([sampleSequence(seq("u[n]"))])).toEqual({ from: -10, to: 10 });
    expect(discreteWindow([sampleSequence(seq("3n"))])).toEqual({ from: -10, to: 10 });
    expect(discreteWindow([sampleSequence(seq("\\delta[n]"))])).toEqual({ from: -10, to: 10 });
  });
  it("vertical bound is 1.2·max(|y|, 1), symmetric only with negative samples", () => {
    expect(discreteYDomain([sampleSequence(seq("u[n]-u[n-5]"))], { from: -10, to: 10 })).toEqual([-0.12, 1.2]);
    const d = discreteYDomain([sampleSequence(seq("3\\delta[n]-2\\delta[n-1]"))], { from: -10, to: 10 });
    expect(d[0]).toBeCloseTo(-3.6, 12); expect(d[1]).toBeCloseTo(3.6, 12);
    const ramp = discreteYDomain([sampleSequence(seq("3n"))], { from: -10, to: 10 });
    expect(ramp[1]).toBeCloseTo(36, 12); expect(ramp[0]).toBeCloseTo(-36, 12);
  });
  it("mini array underlines n = 0 (x[n] = 3n → {…,−6,−3,0̲,3,6,…})", () => {
    expect(sequenceArrayLatex("x", sampleSequence(seq("3n")))).toBe("x[n]=\\{\\dots,-6,\\,-3,\\,\\underline{0},\\,3,\\,6,\\dots\\}");
    expect(sequenceArrayLatex("x", sampleSequence(seq("\\delta[n+1]+2\\delta[n]-\\delta[n-1]")))).toBe("x[n]=\\{1,\\,\\underline{2},\\,-1\\}");
    expect(sequenceArrayLatex("x", sampleSequence(seq("u[n]")))).toBe("x[n]=\\{\\underline{1},\\,1,\\,1,\\dots\\}");
    expect(sequenceArrayLatex("x", sampleSequence(seq("r[n]-r[n-4]")))).toBe("x[n]=\\{\\underline{0},\\,1,\\,2,\\,3,\\,4,\\dots\\}"); // settles at 4
    expect(sequenceArrayLatex("x", sampleSequence(seq("\\text{rect}_{3}[n]")))).toBe("x[n]=\\{1,\\,1,\\,1,\\,\\underline{1},\\,1,\\,1,\\,1\\}");
  });
  it("energy Σ|x|² for finite sequences, flagged for unbounded ones", () => {
    expect(sequenceEnergy(sampleSequence(seq("u[n]-u[n-5]")))).toEqual({ energy: 5, bounded: true });
    expect(sequenceEnergy(sampleSequence(seq("u[n]"))).bounded).toBe(false);
  });
});

describe("academic analysis: energy / power, period, symmetry", () => {
  const analyze = (source: string) => analyzeSequence(x(source));
  it("finite pulses and decaying sequences are energy signals", () => {
    expect(analyze("u[n]-u[n-5]")).toMatchObject({ classification: "Energy Signal", energy: 5, power: 0, period: null });
    expect(analyze("0.8^{n}u[n]").energy).toBeCloseTo(1 / (1 - 0.64), 6);
    expect(analyze("\\delta[n]+2\\delta[n-1]-\\delta[n-2]")).toMatchObject({ classification: "Energy Signal", energy: 6 });
  });
  it("periodic sequences are power signals with the exact fundamental period", () => {
    const cosine = analyze("\\cos\\left(\\frac{\\pi}{4}n\\right)");
    expect(cosine).toMatchObject({ classification: "Power Signal", period: 8, energy: null });
    expect(cosine.power).toBeCloseTo(0.5, 12);
    expect(analyze("\\cos\\left(\\frac{2\\pi}{6}n\\right)+\\cos\\left(\\frac{2\\pi}{4}n\\right)").period).toBe(12);
    expect(analyze("1")).toMatchObject({ period: 1, power: 1 });
  });
  it("non-periodic power signals: steps and saturating ramps; growing ramps are neither", () => {
    const step = analyze("u[n]"); expect(step).toMatchObject({ classification: "Power Signal", period: null }); expect(step.power).toBeCloseTo(0.5, 9);
    const saturating = analyze("r[n]-r[n-4]"); expect(saturating.classification).toBe("Power Signal"); expect(saturating.power).toBeCloseTo(8, 9);
    expect(analyze("3n")).toMatchObject({ classification: "Neither", energy: null, power: null });
    expect(analyze("2^{n}u[n]").classification).toBe("Neither");
    expect(analyze("\\cos(n)").period).toBeNull(); // ω₀ = 1 is not a rational multiple of 2π
  });
  it("even / odd / neither", () => {
    expect(analyze("\\text{rect}_{3}[n]").symmetry).toBe("even");
    expect(analyze("3n").symmetry).toBe("odd");
    expect(analyze("u[n]").symmetry).toBe("neither");
    expect(analyze("\\cos\\left(\\frac{\\pi}{4}n\\right)").symmetry).toBe("even");
    expect(analyze("\\sin\\left(\\frac{\\pi}{4}n\\right)").symmetry).toBe("odd");
    expect(analyze("0")).toMatchObject({ classification: "Energy Signal", symmetry: "even and odd" });
  });
  it("detectPeriod returns null past N = 40", () => { expect(detectPeriod(x("\\cos\\left(\\frac{2\\pi}{41}n\\right)"))).toBeNull(); });
});
