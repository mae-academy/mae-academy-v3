import { describe, expect, it } from "vitest";
import { forwardFourier, inverseFourier, spectrumBandwidth } from "./fourierAnalytic";
import { parseUnifiedSignal } from "../../../shared/signals/unifiedSignalParser";

const forward = (source: string) => {
  const parsed = parseUnifiedSignal(source);
  if (!parsed.ok) throw new Error(parsed.error);
  const result = forwardFourier(parsed.node);
  if (!result.ok) throw new Error(result.error);
  return result.spectrum;
};
const inverse = (source: string) => {
  const result = inverseFourier(source);
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe("forward Fourier transform (analytic table)", () => {
  it("e^{-2t}u(t) → 1/(2+jω)", () => {
    const spectrum = forward("e^{-2t}u(t)");
    expect(spectrum.latex).toBe("X(j\\omega)=\\frac{1}{2+j\\omega}");
    const at2 = spectrum.valueAt(2); expect(at2.re).toBeCloseTo(0.25, 9); expect(at2.im).toBeCloseTo(-0.25, 9);
  });
  it("rect(t) → sinc(ω/2π)", () => {
    const spectrum = forward("\\text{rect}(t)");
    expect(spectrum.latex).toBe("X(j\\omega)=\\operatorname{sinc}\\!\\left(\\frac{\\omega}{2\\pi}\\right)");
    expect(spectrum.valueAt(Math.PI).re).toBeCloseTo(2 / Math.PI, 9);
  });
  it("cos(4t) → π[δ(ω−4)+δ(ω+4)]", () => {
    const spectrum = forward("\\cos(4t)");
    expect(spectrum.latex).toBe("X(j\\omega)=\\pi\\left[\\delta(\\omega-4)+\\delta(\\omega+4)\\right]");
    expect(spectrum.impulses.map((impulse) => impulse.omega).sort()).toEqual([-4, 4]);
  });
  it("sin(2t) → −jπ[δ(ω−2)−δ(ω+2)]", () => {
    expect(forward("\\sin(2t)").latex).toBe("X(j\\omega)=-j\\pi\\left[\\delta(\\omega-2)-\\delta(\\omega+2)\\right]");
  });
  it("constants, δ, shifted pulses, and the two-sided exponential", () => {
    expect(forward("1").latex).toBe("X(j\\omega)=2\\pi\\delta(\\omega)");
    expect(forward("\\delta(t)").latex).toBe("X(j\\omega)=1");
    expect(forward("\\text{rect}(t-1)").latex).toBe("X(j\\omega)=\\operatorname{sinc}\\!\\left(\\frac{\\omega}{2\\pi}\\right)e^{-j\\omega}");
    expect(forward("e^{-3|t|}").latex).toBe("X(j\\omega)=\\frac{6}{9+\\omega^{2}}");
    expect(forward("u(t)").latex).toBe("X(j\\omega)=\\frac{1}{j\\omega}+\\pi\\delta(\\omega)");
  });
  it("damped oscillation uses the Laplace table on the jω axis", () => {
    expect(forward("e^{-t}\\cos(2t)u(t)").latex).toBe("X(j\\omega)=\\frac{1+j\\omega}{5-\\omega^{2}+j2\\omega}");
  });
  it("anti-causal exponential e^{2t}u(-t) → 1/(2−jω)", () => {
    expect(forward("e^{2t}u(-t)").latex).toBe("X(j\\omega)=\\frac{1}{2-j\\omega}");
  });
  it("rejects non-integrable growth instead of throwing", () => {
    const parsed = parseUnifiedSignal("e^{t}u(t)");
    expect(parsed.ok && forwardFourier(parsed.node).ok).toBe(false);
  });
});

describe("inverse Fourier transform", () => {
  it("1/(3+jω) → e^{-3t}u(t)", () => {
    const result = inverse("\\frac{1}{3+j\\omega}");
    expect(result.latex).toBe("x(t)=e^{-3t}\\,u(t)");
    expect(result.valueAt(1)).toBeCloseTo(Math.exp(-3), 9);
    expect(result.valueAt(-1)).toBe(0);
  });
  it("1/(4+jω) → e^{-4t}u(t)", () => { expect(inverse("\\frac{1}{4+j\\omega}").latex).toBe("x(t)=e^{-4t}\\,u(t)"); });
  it("2πδ(ω) → 1", () => {
    const result = inverse("2\\pi\\delta(\\omega)");
    expect(result.latex).toBe("x(t)=1");
    expect(result.valueAt(3.7)).toBeCloseTo(1, 12);
  });
  it("2a/(a²+ω²) → e^{-a|t|} (a = 2)", () => {
    const result = inverse("\\frac{4}{4+\\omega^2}");
    expect(result.latex).toBe("x(t)=e^{-2|t|}");
    expect(result.valueAt(-0.5)).toBeCloseTo(Math.exp(-1), 9);
  });
  it("π[δ(ω−4)+δ(ω+4)] → cos(4t)", () => { expect(inverse("\\pi\\delta(\\omega-4)+\\pi\\delta(\\omega+4)").latex).toBe("x(t)=\\cos(4t)"); });
  it("rect(ω/4) → (2/π)Sa(2t)", () => {
    const result = inverse("\\text{rect}\\left(\\frac{\\omega}{4}\\right)");
    expect(result.latex).toBe("x(t)=\\frac{2}{\\pi}\\operatorname{Sa}(2t)");
    expect(result.valueAt(0)).toBeCloseTo(2 / Math.PI, 9);
  });
  it("rejects spectra that are not conjugate-symmetric", () => { expect(inverseFourier("\\frac{1}{3+\\omega}").ok).toBe(false); });
  it("round-trips the forward transform", () => {
    const back = inverse("\\frac{1+j\\omega}{5-\\omega^{2}+j2\\omega}");
    expect(back.latex).toBe("x(t)=e^{-t}\\cos(2t)\\,u(t)");
  });
});

describe("spectrum auto-scale", () => {
  it("covers impulse lines with 20% headroom and floors at 4 rad/s", () => {
    expect(spectrumBandwidth(forward("\\cos(10t)"))).toBeCloseTo(12, 9);
    expect(spectrumBandwidth(forward("\\cos(t)"))).toBe(4);
  });
  it("frames a first-order spectrum around its 10% band", () => {
    expect(spectrumBandwidth(inverse("\\frac{1}{4+j\\omega}").spectrum)).toBeCloseTo(47.6, 0);
    expect(spectrumBandwidth(inverse("\\frac{4}{4+\\omega^{2}}").spectrum)).toBeCloseTo(7.2, 0);
  });
});
