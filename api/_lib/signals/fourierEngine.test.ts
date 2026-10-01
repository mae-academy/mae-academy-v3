import { describe, expect, it } from "vitest";
import { fourierSeries, fourierTransform } from "./fourierEngine";
import { partialSum, waterfallHarmonics } from "../../../shared/signals/seriesSynthesis";
import { parseSignalExpression } from "../../../shared/signals/signalEngine";

function signal(source: string) { const parsed = parseSignalExpression(source); if (!parsed.ok) throw new Error(parsed.error); return parsed.ast; }

describe("Fourier analysis engine", () => {
  it("computes the rectangular pulse DC Fourier-series coefficient over T₀=2", () => {
    const series = fourierSeries(signal("rect(t)"), 2, 4); const dc = series.coefficients.find((item) => item.harmonic === 0)!;
    expect(dc.real).toBeCloseTo(0.5, 3); expect(series.omega0).toBeCloseTo(Math.PI, 6);
  });
  it("computes the expected first cosine coefficient for the periodic rectangular pulse", () => {
    const coefficient = fourierSeries(signal("rect(t)"), 2, 4).coefficients.find((item) => item.harmonic === 1)!;
    expect(coefficient.real).toBeCloseTo(1 / Math.PI, 3); expect(coefficient.imaginary).toBeCloseTo(0, 3);
  });
  it("constructs a real-valued partial sum and harmonic waterfall traces", () => {
    const series = fourierSeries(signal("rect(t)"), 2, 6); expect(partialSum(series, 0, 6)).toBeGreaterThan(0.8); expect(waterfallHarmonics(series, 4)).toHaveLength(9);
  });
  it("uses the rectangular-pulse transform shortcut and preserves time-scaling duality", () => {
    const transform = fourierTransform(signal("rect(t)"), 2, 1, 2); expect(transform.isStandardRect).toBe(true); expect(transform.spectrum[1].magnitude).toBeCloseTo(0.5, 6); expect(transform.derivation[1]).toContain("\\frac{1}{|a|}");
  });
});
