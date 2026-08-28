import { describe, expect, it } from "vitest";
import { createDcStepSamples, SignalProcessor } from "./signalProcessor";

describe("SignalProcessor", () => {
  it("calculates DC average, RMS, and peak-to-peak from discrete samples", () => {
    const processor = new SignalProcessor([{ t: 0, v: -2 }, { t: 1, v: 0 }, { t: 2, v: 2 }]);
    expect(processor.dcAverage()).toBe(0);
    expect(processor.trueRms()).toBeCloseTo(Math.sqrt(8 / 3), 10);
    expect(processor.peakToPeak()).toBe(4);
  });

  it("detects rising zero crossings and derives frequency from their period", () => {
    const processor = new SignalProcessor([
      { t: 0, v: -1 }, { t: .25, v: 1 }, { t: .5, v: -1 }, { t: .75, v: 1 }, { t: 1, v: -1 },
    ]);
    expect(processor.risingEdgeIndex()).toBe(1);
    expect(processor.frequency()).toBeCloseTo(2, 10);
  });

  it("builds a deterministic settled DC step for measurement instruments", () => {
    const samples = createDcStepSamples(12, .1, 11);
    expect(samples).toHaveLength(11);
    expect(samples[0].v).toBe(0);
    expect(samples.at(-1)?.v).toBe(12);
  });
});
