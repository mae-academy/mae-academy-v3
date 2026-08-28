import { describe, expect, it } from "vitest";
import { defaultChopperParameters, simulateChopper } from "./chopperMath";

describe("DC-DC chopper power-engine audit", () => {
  it("treats zero and full duty cycle as finite DC boundary states without remapping their requested duty", () => {
    const off = simulateChopper({
      ...defaultChopperParameters,
      topology: "buck",
      loadType: "R",
      backEmfVoltage: 0,
      dutyCycle: 0,
    });
    const on = simulateChopper({
      ...defaultChopperParameters,
      topology: "buck",
      loadType: "R",
      backEmfVoltage: 0,
      dutyCycle: 1,
    });

    expect(off.metrics.dutyCycle).toBe(0);
    expect(off.samples.every(sample => sample.switchOn === false && sample.outputVoltage === 0 && sample.outputCurrent === 0)).toBe(true);
    expect(on.metrics.dutyCycle).toBe(1);
    expect(on.samples.every(sample => sample.switchOn === true)).toBe(true);
    expect(on.metrics.outputVoltageDc).toBeCloseTo(on.samples[0].outputVoltage, 10);
    expect([off.metrics.outputVoltageRms, off.metrics.outputCurrentDc, on.metrics.outputVoltageRms, on.metrics.outputCurrentDc].every(Number.isFinite)).toBe(true);
  });
});
