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

  it("keeps boost efficiency physically bounded because the source stays connected through both switch states", () => {
    const boost = simulateChopper({ ...defaultChopperParameters, topology: "boost", loadType: "RL", dutyCycle: 0.5, quadrantClass: "C" });
    expect(boost.metrics.efficiency).toBeLessThanOrEqual(100);
    expect(boost.metrics.efficiency).toBeGreaterThan(50);
  });

  it("blocks reverse current for Class A and forward current for Class B on an RLE load", () => {
    const classA = simulateChopper({ ...defaultChopperParameters, topology: "buck", loadType: "RLE", quadrantClass: "A", backEmfVoltage: 200, dutyCycle: 0.2 });
    const classB = simulateChopper({ ...defaultChopperParameters, topology: "buck", loadType: "RLE", quadrantClass: "B", dutyCycle: 0.9 });

    expect(classA.metrics.currentMin).toBeGreaterThanOrEqual(0);
    expect(classB.metrics.currentMax).toBeLessThanOrEqual(1e-9);
  });

  it("flags an excessive boost duty cycle and a back-EMF that reverses RLE current", () => {
    const highDuty = simulateChopper({ ...defaultChopperParameters, topology: "boost", loadType: "R", dutyCycle: 0.95 });
    expect(highDuty.warnings.some(warning => warning.code === "DUTY_CYCLE_HIGH")).toBe(true);

    const reversedByBackEmf = simulateChopper({ ...defaultChopperParameters, topology: "buck", loadType: "RLE", quadrantClass: "E", backEmfVoltage: 500, dutyCycle: 0.1 });
    expect(reversedByBackEmf.warnings.some(warning => warning.code === "BACK_EMF_REVERSES_CURRENT")).toBe(true);
  });
});
