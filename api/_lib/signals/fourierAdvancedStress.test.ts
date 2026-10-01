/**
 * Advanced / exam-level benchmark suite for the Fourier dual-engine (analytic solver + numeric fallback).
 * Conventions: normalized sinc(x) = sin(πx)/(πx) and tri(x) = max(0, 1 − |x|) (support |x| < 1); Sa(x) = sin x / x.
 * Where an exam formula is stated in another convention it is restated here in ours and noted inline.
 */
import katex from "katex";
import { describe, expect, it } from "vitest";
import {
  forwardFourier,
  inverseFourier,
  multiplySpectra,
  sampleSpectrum,
  scaleSpectrum,
  spectrumBandwidth,
  type SpectrumModel,
} from "./fourierAnalytic";
import { fourierSeries, fourierTransform } from "./fourierEngine";
import { partialSum } from "../../../shared/signals/seriesSynthesis";
import { differentiateExpression, evaluateUnifiedSignal, integrateExpression, parseUnifiedSignal, parseUnifiedSignalNode, splitConvolution } from "../../../shared/signals/unifiedSignalParser";

/* ───────────── complex + numeric helpers ───────────── */

type C = { re: number; im: number };
const c = (re = 0, im = 0): C => ({ re, im });
const add = (a: C, b: C) => c(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C) => c(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C) => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const scale = (a: C, k: number) => c(a.re * k, a.im * k);
const expj = (theta: number) => c(Math.cos(theta), Math.sin(theta));
const abs = (a: C) => Math.hypot(a.re, a.im);
const pow = (a: C, n: number) => { let r = c(1); for (let i = 0; i < n; i += 1) r = mul(r, a); return r; };
const sinc = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const Sa = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x);
const rect = (x: number) => (Math.abs(x) <= 0.5 ? 1 : 0);
const tri = (x: number) => Math.max(0, 1 - Math.abs(x));
const OMEGAS = [0.3, 1, 2.5, 4, 7.5, 13, -0.7, -3, -9];

function simpson(fn: (x: number) => number, from: number, to: number, intervals = 4000) {
  const n = intervals % 2 ? intervals + 1 : intervals; const h = (to - from) / n; let total = fn(from) + fn(to);
  for (let i = 1; i < n; i += 1) total += (i % 2 ? 4 : 2) * fn(from + i * h);
  return (total * h) / 3;
}

const forward = (source: string): SpectrumModel => {
  const parsed = parseUnifiedSignal(source);
  if (!parsed.ok) throw new Error(`parse: ${parsed.error}`);
  const result = forwardFourier(parsed.node);
  if (!result.ok) throw new Error(`forward: ${result.error}`);
  return result.spectrum;
};
const inverse = (source: string) => { const result = inverseFourier(source); if (!result.ok) throw new Error(`inverse: ${result.error}`); return result; };
const near = (actual: C, expected: C, tolerance = 1e-9) => { expect(actual.re).toBeCloseTo(expected.re, -Math.log10(tolerance)); expect(actual.im).toBeCloseTo(expected.im, -Math.log10(tolerance)); };
const check = (source: string, reference: (omega: number) => C, tolerance = 1e-9, omegas = OMEGAS) => {
  const spectrum = forward(source);
  omegas.forEach((omega) => near(spectrum.valueAt(omega), reference(omega), tolerance));
  return spectrum;
};
const renders = (latex: string) => { const html = katex.renderToString(latex, { throwOnError: true, strict: "error" }); expect(html).not.toContain("katex-error"); };

/* ═════════════ Part 1 — forward CTFT ═════════════ */

describe("Part 1A — polynomial-weighted & higher-order exponentials", () => {
  it("01 t·e^{-at}u(t) ↔ 1/(a+jω)²", () => {
    const spectrum = check("t\\,e^{-2t}u(t)", (w) => div(c(1), pow(c(2, w), 2)));
    expect(spectrum.latex).toBe("X(j\\omega)=\\frac{1}{\\left(2+j\\omega\\right)^{2}}");
  });
  it("02 t²·e^{-at}u(t) ↔ 2/(a+jω)³", () => {
    const spectrum = check("t^{2}e^{-2t}u(t)", (w) => div(c(2), pow(c(2, w), 3)));
    expect(spectrum.latex).toBe("X(j\\omega)=\\frac{2}{\\left(2+j\\omega\\right)^{3}}");
  });
  it("03 general case t^{n−1}/(n−1)!·e^{-at}u(t) ↔ 1/(a+jω)ⁿ  (n = 1…5)", () => {
    for (let n = 1; n <= 5; n += 1) {
      const factorial = Array.from({ length: n - 1 }, (_, i) => i + 1).reduce((p, q) => p * q, 1);
      check(`\\frac{t^{${n - 1}}}{${factorial}}e^{-3t}u(t)`, (w) => div(c(1), pow(c(3, w), n)), 1e-9, [0.4, 2, -5]);
    }
  });
  it("04 |t|e^{-a|t|} ↔ 2(a²−ω²)/(a²+ω²)² (real, even)", () => {
    const a = 2;
    const spectrum = check("\\left|t\\right|e^{-2\\left|t\\right|}", (w) => c((2 * (a * a - w * w)) / (a * a + w * w) ** 2));
    OMEGAS.forEach((w) => expect(spectrum.valueAt(w).im).toBeCloseTo(0, 12));
  });
  it("05 t·e^{-a|t|} ↔ −j4aω/(a²+ω²)² (purely imaginary, odd)", () => {
    const a = 2;
    const spectrum = check("t\\,e^{-2\\left|t\\right|}", (w) => c(0, (-4 * a * w) / (a * a + w * w) ** 2));
    OMEGAS.forEach((w) => { expect(spectrum.valueAt(w).re).toBeCloseTo(0, 12); near(spectrum.valueAt(-w), scale(spectrum.valueAt(w), -1)); });
  });
});

describe("Part 1B — modulated, damped & windowed harmonics", () => {
  it("06 e^{-at}cos(ω₀t)u(t) ↔ (a+jω)/((a+jω)²+ω₀²)", () => {
    check("e^{-t}\\cos(3t)u(t)", (w) => div(c(1, w), add(pow(c(1, w), 2), c(9))));
  });
  it("07 e^{-at}sin(ω₀t)u(t) ↔ ω₀/((a+jω)²+ω₀²)", () => {
    check("e^{-t}\\sin(3t)u(t)", (w) => div(c(3), add(pow(c(1, w), 2), c(9))));
  });
  it("08 windowed RF tone rect(t/T)cos(ω₀t) ↔ (T/2)[sinc((ω−ω₀)T/2π)+sinc((ω+ω₀)T/2π)]", () => {
    const T = 2; const w0 = 6;
    check("\\text{rect}\\left(\\frac{t}{2}\\right)\\cos(6t)", (w) => c((T / 2) * (sinc(((w - w0) * T) / (2 * Math.PI)) + sinc(((w + w0) * T) / (2 * Math.PI)))));
  });
  it("09 rect(t−2)·sin(3t): combined delay + modulation, checked against direct quadrature", () => {
    const spectrum = forward("\\text{rect}(t-2)\\sin(3t)");
    const P = (w: number) => scale(expj(-2 * w), sinc(w / (2 * Math.PI)));
    [0.5, 1.3, 3, 5.2, -2].forEach((w) => {
      const closed = scale(mul(c(0, -1), sub(P(w - 3), P(w + 3))), 0.5); // (1/2j)[P(ω−3) − P(ω+3)]
      near(spectrum.valueAt(w), closed, 1e-9);
      const numeric = c(simpson((t) => Math.sin(3 * t) * Math.cos(w * t), 1.5, 2.5), -simpson((t) => Math.sin(3 * t) * Math.sin(w * t), 1.5, 2.5));
      near(spectrum.valueAt(w), numeric, 1e-7);
    });
  });
  it("10 Gaussian e^{-at²} ↔ √(π/a)e^{-ω²/4a} (real Gaussian spectrum)", () => {
    const a = 1.5;
    const spectrum = check("e^{-1.5t^{2}}", (w) => c(Math.sqrt(Math.PI / a) * Math.exp(-(w * w) / (4 * a))));
    expect(spectrum.latex).toBe("X(j\\omega)=\\sqrt{\\frac{\\pi}{1.5}}e^{-\\frac{\\omega^{2}}{6}}");
  });
  it("11 Gaussian eigenfunction: e^{-t²/2} ↔ √(2π)·e^{-ω²/2} (same shape)", () => {
    check("e^{-\\frac{t^{2}}{2}}", (w) => c(Math.sqrt(2 * Math.PI) * Math.exp(-(w * w) / 2)));
  });
});

describe("Part 1C — piecewise geometric & singular combinations", () => {
  it("12 (1−|t|)·rect(t/2) = tri(t) ↔ sinc²(ω/2π) = 4sin²(ω/2)/ω²", () => {
    const spectrum = check("\\left(1-\\left|t\\right|\\right)\\text{rect}\\left(\\frac{t}{2}\\right)", (w) => c((4 * Math.sin(w / 2) ** 2) / (w * w)));
    near(spectrum.valueAt(0), c(1));
  });
  it("13 trapezoid = rect(t/2) ∗ rect(t) ↔ 2·sinc(ω/π)·sinc(ω/2π)", () => {
    const parts = splitConvolution("\\text{rect}\\left(\\frac{t}{2}\\right)\\ast\\text{rect}(t)");
    expect(parts).toHaveLength(2);
    const product = multiplySpectra(parts.map(forward));
    OMEGAS.forEach((w) => near(product.valueAt(w), c(2 * sinc(w / Math.PI) * sinc(w / (2 * Math.PI)))));
    // The time-domain shape: trapezoid with plateau |t| ≤ 0.5, feet at |t| = 1.5, height 1.
    const trapezoid = (t: number) => simpson((tau) => rect(tau / 2) * rect(t - tau), -3, 3, 6000);
    expect(trapezoid(0)).toBeCloseTo(1, 2); expect(trapezoid(1)).toBeCloseTo(0.5, 2); expect(trapezoid(1.6)).toBeCloseTo(0, 2);
  });
  it("14 sinc(Wt) ↔ (1/W)rect(ω/2πW)   [normalized sinc]", () => {
    const W = 2; const spectrum = forward("\\text{sinc}(2t)");
    [0.5, 3, 6.2, -6.2].forEach((w) => near(spectrum.valueAt(w), c(1 / W)));
    [6.4, 9, -8].forEach((w) => near(spectrum.valueAt(w), c(0)));
  });
  it("15 Sa(Wt) ↔ (π/W)rect(ω/2W)   [= the exam's 'sinc(Wt)' with sin(Wt)/(Wt)]", () => {
    const W = 3; const spectrum = forward("\\text{Sa}(3t)");
    [0.5, 2.9, -2.9].forEach((w) => near(spectrum.valueAt(w), c(Math.PI / W)));
    [3.1, 8, -5].forEach((w) => near(spectrum.valueAt(w), c(0)));
  });
  it("16 sinc²(Wt) ↔ (1/W)tri(ω/2πW) and Sa²(Wt) ↔ (π/W)tri(ω/2W)", () => {
    const W = 2;
    const normalized = forward("\\text{sinc}(2t)^{2}");
    const unnormalized = forward("\\text{Sa}(2t)^{2}");
    [0, 1, 3, 5, -4, 7].forEach((w) => {
      near(normalized.valueAt(w), c(tri(w / (2 * Math.PI * W)) / W));
      near(unnormalized.valueAt(w), c((Math.PI / W) * tri(w / (2 * W))));
    });
  });
  it("17 Hilbert kernel 1/(πt) ↔ −j·sgn(ω)", () => {
    const spectrum = forward("\\frac{1}{\\pi t}");
    [0.5, 4, 30].forEach((w) => { near(spectrum.valueAt(w), c(0, -1)); near(spectrum.valueAt(-w), c(0, 1)); });
    near(spectrum.valueAt(0), c(0)); // finite, no singular explosion
  });
  it("18 doublet δ′(t) ↔ jω and δ″(t) ↔ −ω²", () => {
    check("\\delta'(t)", (w) => c(0, w));
    check("\\delta''(t)", (w) => c(-w * w));
    expect(forward("\\delta'(t)").latex).toBe("X(j\\omega)=j\\omega");
    expect(forward("\\delta''(t)").latex).toBe("X(j\\omega)=-\\omega^{2}");
  });
});

/* ═════════════ Part 2 — inverse CTFT ═════════════ */

describe("Part 2 — advanced inverse CTFT", () => {
  const times = [-3.7, -1, -0.2, 0, 0.4, 1.3, 2.9, 5];
  it("19 bandpass brick-wall → (2W/π)Sa(Wt)cos(ω₀t)   [W = 2, ω₀ = 5]", () => {
    const result = inverse("\\text{rect}\\left(\\frac{\\omega-5}{4}\\right)+\\text{rect}\\left(\\frac{\\omega+5}{4}\\right)");
    times.forEach((t) => expect(result.valueAt(t)).toBeCloseTo(((2 * 2) / Math.PI) * Sa(2 * t) * Math.cos(5 * t), 9));
    expect(result.latex).toBe("x(t)=\\frac{4}{\\pi}\\operatorname{Sa}(2t)\\cos(5t)");
  });
  it("20 highpass 1 − rect(ω/2W) → δ(t) − (W/π)Sa(Wt)   [W = 2]", () => {
    const result = inverse("1-\\text{rect}\\left(\\frac{\\omega}{4}\\right)");
    expect(result.latex).toBe("x(t)=\\delta(t)-\\frac{2}{\\pi}\\operatorname{Sa}(2t)");
    times.forEach((t) => expect(result.valueAt(t)).toBeCloseTo(-(2 / Math.PI) * Sa(2 * t), 9)); // regular part
  });
  it("21 triangular spectrum tri(ω/W) → (W/2π)sinc²(Wt/2π)   [exam's tri(ω/2W) uses a half-width-1/2 tri]", () => {
    const W = 4; const result = inverse("\\text{tri}\\left(\\frac{\\omega}{4}\\right)");
    times.forEach((t) => expect(result.valueAt(t)).toBeCloseTo((W / (2 * Math.PI)) * sinc((W * t) / (2 * Math.PI)) ** 2, 9));
    expect(result.valueAt(0)).toBeCloseTo(W / (2 * Math.PI), 12);
  });
  it("22 complex-pole resonator 1/((jω+1)²+4) → ½e^{-t}sin(2t)u(t)", () => {
    const result = inverse("\\frac{1}{(j\\omega+1)^{2}+4}");
    times.forEach((t) => expect(result.valueAt(t)).toBeCloseTo(t >= 0 ? 0.5 * Math.exp(-t) * Math.sin(2 * t) : 0, 9));
    expect(result.latex).toBe("x(t)=\\frac{1}{2}e^{-t}\\sin(2t)\\,u(t)");
  });
  it("23 improper rational (jω+5)/(jω+2) → δ(t) + 3e^{-2t}u(t)", () => {
    const result = inverse("\\frac{j\\omega+5}{j\\omega+2}");
    expect(result.latex).toBe("x(t)=\\delta(t)+3e^{-2t}\\,u(t)");
    times.forEach((t) => expect(result.valueAt(t)).toBeCloseTo(t >= 0 ? 3 * Math.exp(-2 * t) : 0, 9));
  });
  it("24 delay with dispersion e^{-j4ω}/(jω+3)² → (t−4)e^{-3(t−4)}u(t−4)", () => {
    const result = inverse("\\frac{e^{-j4\\omega}}{(j\\omega+3)^{2}}");
    times.forEach((t) => expect(result.valueAt(t)).toBeCloseTo(t >= 4 ? (t - 4) * Math.exp(-3 * (t - 4)) : 0, 9));
    expect(result.latex).toBe("x(t)=\\left(t-4\\right)e^{-3\\left(t-4\\right)}\\,u(t-4)");
    OMEGAS.forEach((w) => near(result.spectrum.valueAt(w), mul(expj(-4 * w), div(c(1), pow(c(3, w), 2)))));
  });
  it("25 inverse examples from the spec: 1/(3+jω), 2πδ(ω), 2a/(a²+ω²)", () => {
    expect(inverse("\\frac{1}{3+j\\omega}").latex).toBe("x(t)=e^{-3t}\\,u(t)");
    expect(inverse("2\\pi\\delta(\\omega)").latex).toBe("x(t)=1");
    expect(inverse("\\frac{2\\cdot 3}{9+\\omega^{2}}").latex).toBe("x(t)=e^{-3|t|}");
  });
  it("26 1/(jω+2)² → t·e^{-2t}u(t) and rect(ω/4) → (2/π)Sa(2t)", () => {
    const repeated = inverse("\\frac{1}{(j\\omega+2)^{2}}");
    times.forEach((t) => expect(repeated.valueAt(t)).toBeCloseTo(t >= 0 ? t * Math.exp(-2 * t) : 0, 9));
    const lowpass = inverse("\\text{rect}\\left(\\frac{\\omega}{4}\\right)");
    times.forEach((t) => expect(lowpass.valueAt(t)).toBeCloseTo((2 / Math.PI) * Sa(2 * t), 9));
  });
});

/* ═════════════ Part 3 — theorems & invariants ═════════════ */

describe("Part 3 — Fourier transform theorems", () => {
  const derivative = (f: (w: number) => C, w: number, h = 1e-5) => scale(sub(f(w + h), f(w - h)), 1 / (2 * h));
  it("27 frequency differentiation: F{t·x(t)} = j·dX/dω and F{t²x(t)} = −d²X/dω²", () => {
    const X = forward("e^{-2t}u(t)"); const tX = forward("t\\,e^{-2t}u(t)"); const ttX = forward("t^{2}e^{-2t}u(t)");
    OMEGAS.forEach((w) => {
      near(tX.valueAt(w), mul(c(0, 1), derivative(X.valueAt, w)), 1e-7);
      const second = scale(sub(add(X.valueAt(w + 1e-3), X.valueAt(w - 1e-3)), scale(X.valueAt(w), 2)), 1e6);
      near(ttX.valueAt(w), scale(second, -1), 1e-5);
    });
  });
  it("28 time differentiation: tri′ = u(t+1) − 2u(t) + u(t−1) (rectangular segments) and F = jω·X", () => {
    const derived = differentiateExpression("\\text{tri}(t)");
    expect(derived.ok).toBe(true); if (!derived.ok) return;
    const derivedNode = parseUnifiedSignal(derived.latex); if (!derivedNode.ok) throw new Error(derivedNode.error);
    [-1.5, -0.5, 0.5, 1.5].forEach((t) => expect(evaluateUnifiedSignal(derivedNode.node, t)).toBeCloseTo(t < 0 && t > -1 ? 1 : t > 0 && t < 1 ? -1 : 0, 9));
    const spectrum = forward(derived.latex); const X = forward("\\text{tri}(t)");
    OMEGAS.forEach((w) => near(spectrum.valueAt(w), mul(c(0, w), X.valueAt(w)), 1e-9));
    expect(spectrum.impulses).toHaveLength(0); // the three πδ(ω) contributions cancel exactly
  });
  it("29 time differentiation across a jump: (e^{-2t}u)′ = δ(t) − 2e^{-2t}u ↔ jω/(2+jω)", () => {
    const derived = differentiateExpression("e^{-2t}u(t)");
    expect(derived.ok).toBe(true); if (!derived.ok) return;
    check(derived.latex, (w) => div(c(0, w), c(2, w)));
  });
  it("30 time integration: ∫x ↔ X/(jω) + πX(0)δ(ω)  [x = e^{-t}u(t), X(0) = 1]", () => {
    const integral = integrateExpression("e^{-t}u(t)");
    expect(integral.ok).toBe(true); if (!integral.ok) return;
    const spectrum = forward(integral.latex); const X = forward("e^{-t}u(t)");
    OMEGAS.forEach((w) => near(spectrum.valueAt(w), div(X.valueAt(w), c(0, w)), 1e-9));
    expect(spectrum.impulses).toHaveLength(1);
    expect(spectrum.impulses[0].omega).toBe(0);
    expect(spectrum.impulses[0].area.re).toBeCloseTo(Math.PI * X.valueAt(0).re, 12);
  });
  it("31 time integration of rect(t): plateau equals X(0) = 1 (the DC-impulse weight πX(0)); non-integrable ramp is rejected gracefully", () => {
    const integral = integrateExpression("\\text{rect}(t)");
    expect(integral.ok).toBe(true); if (!integral.ok) return;
    const parsed = parseUnifiedSignal(integral.latex); if (!parsed.ok) throw new Error(parsed.error);
    expect(evaluateUnifiedSignal(parsed.node, 50)).toBeCloseTo(forward("\\text{rect}(t)").valueAt(0).re, 12); // y(+∞) = X(0)
    expect(evaluateUnifiedSignal(parsed.node, -50)).toBe(0);
    expect(() => forwardFourier(parsed.node)).not.toThrow();
  });
  it("32 duality: rect ↔ sinc and sinc ↔ rect   (X(jt) ↔ 2π·x(−ω))", () => {
    const rectToSinc = forward("\\text{rect}(t)");
    const dual = forward("\\text{sinc}\\left(\\frac{t}{2\\pi}\\right)");
    [0.1, 0.4, 0.49].forEach((w) => near(dual.valueAt(w), c(2 * Math.PI * rect(w))));
    [0.6, 2, -3].forEach((w) => near(dual.valueAt(w), c(0)));
    OMEGAS.forEach((w) => near(rectToSinc.valueAt(w), c(sinc(w / (2 * Math.PI)))));
    const sincToRect = forward("\\text{sinc}(t)"); const dualRect = forward("\\text{rect}\\left(\\frac{t}{2\\pi}\\right)");
    [0.2, 1, 2.9].forEach((w) => near(sincToRect.valueAt(w), c(1)));
    OMEGAS.forEach((w) => near(dualRect.valueAt(w), c(2 * Math.PI * sinc(w))));
  });
  it("33 reciprocal spreading: x(at) ↔ (1/|a|)X(jω/a); first null at 2πa, X(0) = 1/a, area = 2π·x(0) conserved", () => {
    const base = forward("\\text{rect}(t)");
    [0.5, 1, 2, 4].forEach((a) => {
      const direct = forward(`\\text{rect}(${a}t)`); const scaled = scaleSpectrum(base, a);
      OMEGAS.forEach((w) => { near(direct.valueAt(w), scaled.valueAt(w)); near(direct.valueAt(w), scale(base.valueAt(w / a), 1 / a)); });
      near(direct.valueAt(0), c(1 / a));
      expect(abs(direct.valueAt(2 * Math.PI * a))).toBeLessThan(1e-9);
      const span = 400 * a;
      expect(simpson((w) => direct.valueAt(w).re, -span, span, 200000)).toBeCloseTo(2 * Math.PI, 1);
    });
  });
  it("34 Parseval on x = e^{-t}u − 2e^{-3t}u: ∫|x|²dt = (1/2π)∫|X|²dω  (< 0.1%)", () => {
    const energyTime = 1 / 2 - 4 / 4 + 4 / 6; // analytic
    const X = forward("e^{-t}u(t)-2e^{-3t}u(t)");
    // ω = tan θ maps the infinite range onto a finite one, so the 1/ω² tail is integrated exactly.
    const energyFreq = simpson((theta) => { const w = Math.tan(theta); return (abs(X.valueAt(w)) ** 2) / Math.cos(theta) ** 2; }, -Math.PI / 2 + 1e-7, Math.PI / 2 - 1e-7, 40000) / (2 * Math.PI);
    expect(Math.abs(energyFreq - energyTime) / energyTime).toBeLessThan(1e-3);
    const parsed = parseUnifiedSignal("e^{-t}u(t)-2e^{-3t}u(t)"); if (!parsed.ok) throw new Error(parsed.error);
    expect(simpson((t) => evaluateUnifiedSignal(parsed.node, t) ** 2, 0, 40, 40000)).toBeCloseTo(energyTime, 6);
  });
  it("35 Parseval on a bandlimited signal via the inverse engine: ∫|x|² = (1/2π)∫|X|² for X = rect(ω/4)", () => {
    const result = inverse("\\text{rect}\\left(\\frac{\\omega}{4}\\right)");
    const energyFreq = simpson((w) => abs(result.spectrum.valueAt(w)) ** 2, -2, 2, 2000) / (2 * Math.PI);
    const energyTime = simpson((t) => result.valueAt(t) ** 2, -400, 400, 400000);
    expect(Math.abs(energyTime - energyFreq) / energyFreq).toBeLessThan(1e-3);
  });
  it("36 numeric fallback agrees with the analytic table (tri, e^{-2t}u)", () => {
    const cases: Array<[string, SpectrumModel]> = [["\\text{tri}(t)", forward("\\text{tri}(t)")], ["e^{-2t}u(t)", forward("e^{-2t}u(t)")]];
    cases.forEach(([source, analytic]) => {
      const node = parseUnifiedSignalNode(source); if (!node.ok) throw new Error(node.error);
      const numeric = fourierTransform(node.ast, 1, 12, 48, 12, 6000).spectrum;
      numeric.filter((point) => Math.abs(point.omega) < 10).forEach((point) => near(c(point.real, point.imaginary), analytic.valueAt(point.omega), 5e-3));
    });
  });
});

/* ═════════════ Part 4 — Fourier series ═════════════ */

describe("Part 4 — CTFS & harmonic expansion", () => {
  const series = (source: string, period: number, harmonics = 24, intervals = 6000) => { const node = parseUnifiedSignalNode(source); if (!node.ok) throw new Error(node.error); return fourierSeries(node.ast, period, harmonics, intervals); };
  const coefficient = (result: ReturnType<typeof series>, n: number) => result.coefficients.find((item) => item.harmonic === n)!;
  it("37 duty-cycle square wave: c_n = D·sinc(nD), c₀ = D", () => {
    [0.2, 0.35, 0.6].forEach((D) => {
      const result = series(`\\text{rect}\\left(\\frac{t}{${D}}\\right)`, 1);
      expect(coefficient(result, 0).real).toBeCloseTo(D, 3);
      for (let n = 1; n <= 8; n += 1) { expect(coefficient(result, n).real).toBeCloseTo(D * sinc(n * D), 3); expect(Math.abs(coefficient(result, n).imaginary)).toBeLessThan(1e-3); }
    });
  });
  it("38 50% duty cycle: every even harmonic vanishes, c₀ = ½", () => {
    const result = series("\\text{rect}(2t)", 1);
    expect(coefficient(result, 0).real).toBeCloseTo(0.5, 3);
    [2, 4, 6, 8, 10].forEach((n) => expect(coefficient(result, n).magnitude).toBeLessThan(1e-3));
    [1, 3, 5].forEach((n) => expect(coefficient(result, n).magnitude).toBeGreaterThan(0.03));
  });
  it("39 half-wave rectified sine: DC = 1/π, |c_{±1}| = 1/4, odd harmonics > 1 vanish", () => {
    const result = series("\\sin(t)u(\\sin(t))", 2 * Math.PI);
    expect(coefficient(result, 0).real).toBeCloseTo(1 / Math.PI, 3);
    expect(coefficient(result, 1).magnitude).toBeCloseTo(0.25, 3);
    [3, 5, 7].forEach((n) => expect(coefficient(result, n).magnitude).toBeLessThan(1e-3));
    expect(coefficient(result, 2).magnitude).toBeCloseTo(1 / (3 * Math.PI), 3);
  });
  it("40 full-wave rectified sine: period π (fundamental 2ω₀), DC = 2/π, only even multiples of ω₀", () => {
    const halved = series("\\left|\\sin(t)\\right|", Math.PI);
    expect(halved.omega0).toBeCloseTo(2, 12);
    expect(coefficient(halved, 0).real).toBeCloseTo(2 / Math.PI, 3);
    expect(coefficient(halved, 1).magnitude).toBeCloseTo(2 / (3 * Math.PI), 3);
    const full = series("\\left|\\sin(t)\\right|", 2 * Math.PI);
    [1, 3, 5, 7].forEach((n) => expect(full.coefficients.find((item) => item.harmonic === n)!.magnitude).toBeLessThan(1e-3));
    expect(coefficient(full, 2).magnitude).toBeCloseTo(2 / (3 * Math.PI), 3);
  });
  it("41 sawtooth: |c_n| = 1/(2π|n|) — decay ∝ 1/n", () => {
    const result = series("t\\,\\text{rect}(t)", 1, 30);
    for (let n = 1; n <= 12; n += 1) expect(n * coefficient(result, n).magnitude).toBeCloseTo(1 / (2 * Math.PI), 3);
  });
  it("42 symmetric triangle wave: c_n = 2/(π²n²) for odd n (= ½sinc²(n/2)) — decay ∝ 1/n², even harmonics vanish", () => {
    const result = series("\\text{tri}(2t)", 1, 30);
    [1, 3, 5, 7, 9].forEach((n) => { expect(n * n * coefficient(result, n).real).toBeCloseTo(2 / (Math.PI * Math.PI), 4); expect(coefficient(result, n).real).toBeCloseTo(0.5 * sinc(n / 2) ** 2, 4); });
    [2, 4, 6].forEach((n) => expect(coefficient(result, n).magnitude).toBeLessThan(1e-4));
  });
  it("43 Gibbs: square-wave partial sums hit the midpoint at the jump, overshoot ≈ 9% of the jump and stay bounded", () => {
    const result = series("\\text{rect}(2t)", 1, 40, 40000);
    [5, 15, 40].forEach((N) => expect(partialSum(result, 0.25, N)).toBeCloseTo(0.5, 2)); // (x(t⁺)+x(t⁻))/2
    let peak = 0; for (let t = 0; t <= 0.25; t += 0.0005) peak = Math.max(peak, partialSum(result, t, 40));
    expect(peak).toBeGreaterThan(1.05); expect(peak).toBeLessThan(1.12); // 1 + 0.0895
  });
  it("44 Gibbs on the sawtooth: partial sums converge to 0 at the ±½ jump; the triangle wave never overshoots", () => {
    const saw = series("t\\,\\text{rect}(t)", 1, 40);
    [10, 40].forEach((N) => expect(Math.abs(partialSum(saw, 0.5, N))).toBeLessThan(1e-3));
    const triangle = series("\\text{tri}(2t)", 1, 130);
    let peak = 0; for (let t = -0.5; t <= 0.5; t += 0.001) peak = Math.max(peak, partialSum(triangle, t, 120));
    expect(peak).toBeLessThan(1.001); // continuous waveform: no overshoot
    expect(partialSum(triangle, 0, 120)).toBeCloseTo(1, 2);
  });
});

/* ═════════════ Robustness — no throws, no NaN, KaTeX-valid, sane framing ═════════════ */

describe("Robustness & rendering", () => {
  const forwardCases = [
    "t\\,e^{-2t}u(t)", "t^{2}e^{-2t}u(t)", "\\left|t\\right|e^{-2\\left|t\\right|}", "t\\,e^{-2\\left|t\\right|}", "e^{-t}\\cos(3t)u(t)", "e^{-t}\\sin(3t)u(t)",
    "\\text{rect}\\left(\\frac{t}{2}\\right)\\cos(6t)", "\\text{rect}(t)\\cos(5t)", "\\text{rect}(t-2)\\sin(3t)", "e^{-1.5t^{2}}", "\\text{tri}(t)", "\\text{sinc}(2t)",
    "\\text{sinc}(2t)^{2}", "\\frac{1}{\\pi t}", "\\delta'(t)", "\\delta''(t)", "\\cos(4t)", "\\sin(2t)", "\\delta(t)+4e^{-t}u(t)", "u(t)", "e^{2t}u(-t)", "1",
  ];
  it("45 every forward case solves, is finite everywhere on a dense grid, and renders as valid KaTeX", () => {
    forwardCases.forEach((source) => {
      const spectrum = forward(source);
      renders(spectrum.latex);
      spectrum.pairs.forEach((pair) => { renders(pair.timeLatex); renders(pair.freqLatex); });
      for (let w = -60; w <= 60; w += 0.37) { const value = spectrum.valueAt(w); expect(Number.isFinite(value.re) && Number.isFinite(value.im), `${source} @ ω=${w}`).toBe(true); }
      const bandwidth = spectrumBandwidth(spectrum);
      expect(bandwidth).toBeGreaterThanOrEqual(4); expect(bandwidth).toBeLessThanOrEqual(200);
    });
  });
  it("46 every inverse case solves, renders, and stays finite", () => {
    const inverseCases = [
      "\\frac{1}{(j\\omega+2)^{2}}", "\\text{rect}\\left(\\frac{\\omega}{4}\\right)", "\\frac{1}{(j\\omega+1)^{2}+4}", "\\frac{j\\omega+5}{j\\omega+2}", "\\frac{e^{-j4\\omega}}{(j\\omega+3)^{2}}",
      "1-\\text{rect}\\left(\\frac{\\omega}{4}\\right)", "\\text{tri}\\left(\\frac{\\omega}{4}\\right)", "\\pi\\delta(\\omega-4)+\\pi\\delta(\\omega+4)", "\\frac{4}{4+\\omega^{2}}",
    ];
    inverseCases.forEach((source) => {
      const result = inverse(source); renders(result.latex);
      for (let t = -12; t <= 12; t += 0.13) expect(Number.isFinite(result.valueAt(t)), `${source} @ t=${t}`).toBe(true);
      const bandwidth = spectrumBandwidth(result.spectrum); expect(bandwidth).toBeGreaterThanOrEqual(4); expect(bandwidth).toBeLessThanOrEqual(200);
    });
  });
  it("47 invalid / unsupported input fails gracefully with a message and never throws", () => {
    ["", "foo(", "\\frac{1}{3+\\omega}", "\\frac{1}{j\\omega}\\cdot", "\\text{rect}(", "((", "1/0"].forEach((source) => {
      expect(() => inverseFourier(source)).not.toThrow();
      const result = inverseFourier(source); if (!result.ok) expect(result.error.length).toBeGreaterThan(3);
    });
    ["e^{t}u(t)", "t^{3}", "\\text{rect}(t)^{2}\\cos(t)^{2}", "\\ln(t)", "u(t-2)e^{-t}"].forEach((source) => {
      const parsed = parseUnifiedSignal(source);
      if (!parsed.ok) return;
      expect(() => forwardFourier(parsed.node)).not.toThrow();
    });
  });
  it("48 spectrum framing: auto bandwidth always contains the dominant band, and sampled magnitudes are finite", () => {
    ["e^{-2t}u(t)", "\\text{rect}(t)\\cos(5t)", "\\text{sinc}(2t)", "\\cos(10t)"].forEach((source) => {
      const spectrum = forward(source); const bandwidth = spectrumBandwidth(spectrum);
      const samples = sampleSpectrum(spectrum, bandwidth, 480);
      expect(samples.every((s) => Number.isFinite(s.magnitude) && Number.isFinite(s.phase))).toBe(true);
      const peak = Math.max(...samples.map((s) => s.magnitude));
      const edge = Math.max(...samples.filter((s) => s.magnitude > 0.1 * peak).map((s) => Math.abs(s.omega)));
      expect(bandwidth).toBeGreaterThanOrEqual(Math.min(edge * 1.15, 200));
      spectrum.impulses.forEach((impulse) => expect(Math.abs(impulse.omega)).toBeLessThanOrEqual(bandwidth));
    });
  });
});
