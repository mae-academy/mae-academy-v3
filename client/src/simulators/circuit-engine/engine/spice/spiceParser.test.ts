import { describe, expect, it } from "vitest";

import {
  getDifferential,
  getFrequency,
  getVmean,
  getVpeak,
  getVrms,
  parseSpiceResults,
} from "@/simulators/circuit-engine/engine/spice/spiceParser";

/** Uniform time axis covering `periods` cycles of `frequency` at `perPeriod` samples each. */
const axis = (
  frequency: number,
  periods: number,
  perPeriod: number
): number[] => {
  const count = Math.round(periods * perPeriod);
  return Array.from(
    { length: count + 1 },
    (_, i) => (i * periods) / (frequency * count)
  );
};

const sine = (
  time: number[],
  frequency: number,
  amplitude = 1,
  offset = 0
): number[] =>
  time.map(t => offset + amplitude * Math.sin(2 * Math.PI * frequency * t));

describe("parseSpiceResults", () => {
  it("splits node voltages from branch currents and drops axes and AC suffixes", () => {
    const time = [0, 1e-3, 2e-3];
    const results = parseSpiceResults(
      {
        time,
        "v(n1)": [1, 2, 3],
        "V(N2)": [4, 5, 6],
        "v(x1.spd)": [7, 8, 9],
        "i(v1)": [0.1, 0.2, 0.3],
        "i(l.x1.la)": [1, 1, 1],
        "v(v-sweep)": [0, 1, 2],
        "v(n3):phase": [0, 0, 0],
        "frequency:real": [50, 50, 50],
      },
      time
    );

    expect(Object.keys(results.nodeVoltages).sort()).toEqual([
      "n1",
      "n2",
      "x1.spd",
    ]);
    expect(Object.keys(results.branchCurrents).sort()).toEqual([
      "l.x1.la",
      "v1",
    ]);
    expect(results.isTransient).toBe(true);
    expect(results.time).toBe(time);
  });

  it("reports an operating point as single-sample stats with no time axis", () => {
    const results = parseSpiceResults({ "v(n1)": [5], "i(v1)": [-0.005] }, []);

    expect(results.isTransient).toBe(false);
    expect(results.time).toEqual([]);
    expect(results.nodeStats.n1).toEqual({
      mean: 5,
      rms: 5,
      peak: 5,
      peakToPeak: 0,
      frequency: 0,
    });
    expect(results.branchStats.v1.peak).toBeCloseTo(0.005, 12);
  });

  it("derives transient stats from the time axis", () => {
    const time = axis(50, 3, 1000);
    const results = parseSpiceResults({ "v(n1)": sine(time, 50, 10) }, time);

    expect(results.nodeStats.n1.rms).toBeCloseTo(10 / Math.SQRT2, 3);
    expect(results.nodeStats.n1.frequency).toBeCloseTo(50, 3);
    expect(results.nodeStats.n1.peakToPeak).toBeCloseTo(20, 3);
  });
});

describe("getDifferential", () => {
  it("subtracts node traces and treats ground as 0 V", () => {
    const results = parseSpiceResults(
      { "v(n1)": [5, 6], "v(n2)": [1, 1] },
      [0, 1]
    );

    expect(getDifferential(results, "n1", "n2")).toEqual([4, 5]);
    expect(getDifferential(results, "N1", "0")).toEqual([5, 6]);
    expect(getDifferential(results, "0", "n2")).toEqual([-1, -1]);
  });
});

describe("multimeter helpers", () => {
  it("averages samples arithmetically when no time axis is given", () => {
    expect(getVmean([1, 2, 3, 6])).toBe(3);
    expect(getVrms([3, -3, 3, -3])).toBe(3);
    expect(getVpeak([1, -7, 4])).toBe(7);
  });

  it("returns zeros for an empty vector", () => {
    expect(getVmean([])).toBe(0);
    expect(getVrms([])).toBe(0);
    expect(getVpeak([])).toBe(0);
  });

  it("weights by time, so clustered samples do not bias the reading", () => {
    // 100 base points per period plus a dense cluster around every peak, as an adaptive step might give.
    const frequency = 50;
    const period = 1 / frequency;
    const times = new Set(axis(frequency, 3, 100));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const peakPhase of [0.25, 0.75]) {
        for (let k = -100; k <= 100; k += 1) {
          times.add((cycle + peakPhase + k * 0.0005) * period);
        }
      }
    }
    const time = Array.from(times).sort((a, b) => a - b);
    const vector = sine(time, frequency);

    // A plain sample RMS is dragged towards the peak value by the cluster.
    expect(getVrms(vector)).toBeGreaterThan(0.8);
    expect(getVrms(vector, time)).toBeCloseTo(1 / Math.SQRT2, 3);
  });

  it("clips to whole periods, so a partial cycle does not skew RMS or mean", () => {
    // 2.1 cycles: integrating the full record would read ~0.694 and a biased mean.
    const time = axis(50, 2.1, 1000);
    const vector = sine(time, 50, 1, 2);

    expect(getVrms(sine(time, 50), time)).toBeCloseTo(1 / Math.SQRT2, 3);
    expect(getVmean(vector, time)).toBeCloseTo(2, 3);
  });

  it("measures the frequency of an offset sine from its mid-level crossings", () => {
    const time = axis(60, 5, 400);
    expect(getFrequency(sine(time, 60, 3, 12), time)).toBeCloseTo(60, 3);
  });

  it("measures the frequency of a square wave", () => {
    const time = axis(1000, 4, 100);
    const square = time.map(t =>
      Math.sin(2 * Math.PI * 1000 * t) >= 0 ? 5 : 0
    );
    expect(getFrequency(square, time)).toBeCloseTo(1000, 1);
  });

  it("reports 0 Hz for DC and for less than one full cycle", () => {
    const time = axis(50, 3, 100);
    expect(
      getFrequency(
        time.map(() => 4),
        time
      )
    ).toBe(0);
    expect(getFrequency(sine(axis(50, 0.8, 100), 50), axis(50, 0.8, 100))).toBe(
      0
    );
  });

  it("falls back to the full record when fewer than two crossings exist", () => {
    const time = [0, 1, 2, 3];
    expect(getVmean([2, 2, 2, 2], time)).toBe(2);
    expect(getVrms([2, 2, 2, 2], time)).toBe(2);
  });
});
