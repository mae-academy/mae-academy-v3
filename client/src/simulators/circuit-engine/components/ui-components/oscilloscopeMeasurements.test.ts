/**
 * Cross-checks the oscilloscope's own measurement math (calculateVdc/calculateVpp/calculateAutoscale)
 * against independent, naive reference implementations — the "SPICE solves the physics, we just
 * verify the oscilloscope's arithmetic is correct" split, applied where it actually belongs: as fast
 * unit tests on synthetic sample data, not another real ngspice run. The circuit-response test files
 * (ngspiceRegression.filterAndStepResponse.test.ts and siblings) already prove the physics is right;
 * this file only asks "given some samples, did the reduction to Vdc/Vpp/Autoscale come out right,"
 * which needs full control over sample spacing, not a real solver.
 *
 * That control is the point: a naive, evenly-weighted mean and the real (time-weighted) calculateVdc
 * are expected to *agree* on evenly-spaced samples and to *disagree* on unevenly-spaced ones — exactly
 * ngspice's adaptive `.tran` timestep — which is precisely why calculateVdc delegates to spiceParser's
 * time-weighted getVmean instead of a plain average (see its own doc comment). Asserting they'd always
 * match, the way a looser "naive vs sophisticated" cross-check might, would paper over that and pass
 * for the wrong reason.
 */
import { describe, expect, it } from "vitest";

import type { SamplePoint } from "@/simulators/circuit-engine/models/circuitTypes";
import { calculateAutoscale, calculateVdc, calculateVpp } from "@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements";
import { OSCILLOSCOPE_TIME_DIV_PRESETS, OSCILLOSCOPE_VOLT_DIV_PRESETS } from "@/simulators/circuit-engine/models/componentDefs";

function naiveMean(samples: SamplePoint[]): number {
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
}

function naivePeakToPeak(samples: SamplePoint[]): number {
  const values = samples.map(sample => sample.value);
  return Math.max(...values) - Math.min(...values);
}

/** A clean sine, sampled evenly — the case a naive reduction has no reason to get wrong. */
function evenSine(periods: number, samplesPerPeriod: number, amplitude: number, offset: number): SamplePoint[] {
  const total = periods * samplesPerPeriod;
  return Array.from({ length: total }, (_, i) => {
    const t = i / samplesPerPeriod;
    return { time: t, value: offset + amplitude * Math.sin(2 * Math.PI * t) };
  });
}

/** Same sine, same duration, but with samples deliberately clustered on the rising edge of each
 * period and sparse everywhere else — mimicking what an adaptive-timestep `.tran` run actually
 * produces around a fast transition. A plain arithmetic mean over these points is measurably biased
 * toward whatever value the cluster sits near; a time-weighted one is not. */
function unevenlySampledSine(periods: number, amplitude: number, offset: number): SamplePoint[] {
  const samples: SamplePoint[] = [];
  for (let period = 0; period < periods; period++) {
    const base = period;
    // Dense cluster in [0, 0.1) of the period (the "fast edge"), sparse across the rest.
    for (let i = 0; i < 40; i++) samples.push({ time: base + (i / 40) * 0.1, value: 0 });
    for (let i = 0; i < 5; i++) samples.push({ time: base + 0.1 + (i / 5) * 0.9, value: 0 });
  }
  // De-duplicate/sort, then fill in the real sine values at those exact times.
  const times = Array.from(new Set(samples.map(s => s.time))).sort((a, b) => a - b);
  return times.map(t => ({ time: t, value: offset + amplitude * Math.sin(2 * Math.PI * t) }));
}

describe("calculateVpp — no time-weighting concern, so it should just match a naive max-min", () => {
  it("matches a naive max-min on evenly-sampled data", () => {
    const samples = evenSine(3, 200, 5, 0);
    expect(calculateVpp(samples)).toBeCloseTo(naivePeakToPeak(samples), 6);
  });

  it("matches a naive max-min on unevenly-sampled data too — extrema don't care about spacing", () => {
    const samples = unevenlySampledSine(3, 5, 2);
    expect(calculateVpp(samples)).toBeCloseTo(naivePeakToPeak(samples), 6);
  });

  it("is exactly 2×amplitude for a clean sine, independent of sample count", () => {
    const samples = evenSine(2, 37, 3, -1); // deliberately odd, non-round sample count
    expect(calculateVpp(samples)).toBeCloseTo(6, 1);
  });
});

describe("calculateVdc — time-weighted, so it should diverge from a naive mean exactly when spacing is uneven", () => {
  it("agrees closely with a naive mean on evenly-spaced samples", () => {
    const samples = evenSine(4, 400, 10, 3); // pure sine averages to its offset over whole periods
    const naive = naiveMean(samples);
    const weighted = calculateVdc(samples);
    expect(weighted).toBeCloseTo(3, 1);
    expect(Math.abs(weighted - naive)).toBeLessThan(0.05);
  });

  it("diverges from a naive mean on unevenly-spaced samples — this is the whole reason calculateVdc exists", () => {
    const samples = unevenlySampledSine(6, 5, 2);
    const naive = naiveMean(samples);
    const weighted = calculateVdc(samples);
    // Both should still land near the true DC level (2)...
    expect(weighted).toBeCloseTo(2, 0);
    // ...but the naive mean is measurably pulled toward the densely-sampled region (the sine's
    // near-zero rising edge each period), while the time-weighted one isn't.
    expect(Math.abs(naive - 2)).toBeGreaterThan(Math.abs(weighted - 2));
  });

  it("returns 0 for an empty sample set rather than NaN", () => {
    expect(calculateVdc([])).toBe(0);
  });
});

describe("calculateAutoscale — fits the real signal, not a guess", () => {
  it("resets offset to 0 and picks Volt/Div to fit ~6 divisions", () => {
    const samples = evenSine(3, 100, 4, 1); // swings from -3 to 5, midpoint 1, peak-to-peak 8
    const result = calculateAutoscale(samples, 60);
    expect(result.offset).toBe(0);
    // 8V peak-to-peak / 6 divisions ≈ 1.33 required V/div — smallest preset ≥ that.
    const requiredVoltDiv = 8 / 6;
    const expectedVoltDiv = OSCILLOSCOPE_VOLT_DIV_PRESETS.find(preset => preset >= requiredVoltDiv);
    expect(result.voltDiv).toBe(expectedVoltDiv);
    expect(result.timeShift).toBe(0);
  });

  it("picks a Time/Div that fits ~3 periods of the detected frequency across the screen", () => {
    // 8 periods of a 1s-period signal (~8s captured) — comfortably more than the 3s window this
    // should ask for, so the "don't pick more than we captured" cap (tested separately below)
    // doesn't also constrain this particular assertion.
    const samples = evenSine(8, 100, 1, 0);
    const result = calculateAutoscale(samples, 1); // frequencyHz = 1 (matches the synthetic period)
    // desiredWindow = 3/1 = 3s across 10 divisions -> required Time/Div = 0.3s -> smallest preset ≥ that.
    const expectedTimeDiv = OSCILLOSCOPE_TIME_DIV_PRESETS.find(preset => preset >= 0.3);
    expect(result.timeDiv).toBe(expectedTimeDiv);
  });

  it("never picks a Time/Div the sample set can't back up, even when the frequency estimate would ask for more", () => {
    const samples = evenSine(1, 50, 1, 0); // only 1 second of data
    const result = calculateAutoscale(samples, 0.01); // a (deliberately wrong) very low frequency estimate
    const dataSpan = samples[samples.length - 1].time - samples[0].time;
    expect(result.timeDiv * 10).toBeLessThanOrEqual(dataSpan + 1e-9);
  });

  it("falls back to the full capture span when no frequency was detected (frequencyHz = 0)", () => {
    const samples = evenSine(2, 50, 1, 0);
    const dataSpan = samples[samples.length - 1].time - samples[0].time;
    const result = calculateAutoscale(samples, 0);
    expect(result.timeDiv * 10).toBeLessThanOrEqual(dataSpan + 1e-9);
  });

  it("returns sane defaults for fewer than 2 samples instead of dividing by zero", () => {
    const result = calculateAutoscale([{ time: 0, value: 5 }], 0);
    expect(Number.isFinite(result.offset)).toBe(true);
    expect(Number.isFinite(result.voltDiv)).toBe(true);
    expect(Number.isFinite(result.timeDiv)).toBe(true);
  });
});
