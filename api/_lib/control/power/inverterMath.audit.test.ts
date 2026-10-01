import { describe, expect, it } from "vitest";
import { defaultInverterParameters, simulateInverter } from "./inverterMath";

describe("Inverter power-engine audit", () => {
  it("contains an explicit same-leg shoot-through command as a short-circuit fault with a clear warning", () => {
    const result = simulateInverter({
      ...defaultInverterParameters,
      phase: "three",
      technique: "spwm",
      shootThroughFault: true,
    });

    expect(result.fault).toEqual(expect.objectContaining({ code: "SHOOT_THROUGH", message: expect.stringMatching(/short.?circuit|shoot-through/i) }));
    expect(result.warnings.some(warning => warning.code === "SHOOT_THROUGH")).toBe(true);
    expect(result.samples.every(sample => sample.outputVoltage === 0 && sample.outputCurrent === 0)).toBe(true);
  });

  it("flags overmodulation, Nyquist violation, and back-EMF exceeding the DC bus, and reports ideal 100% efficiency otherwise", () => {
    const overmodulated = simulateInverter({ ...defaultInverterParameters, technique: "spwm", modulationIndex: 1.15 });
    expect(overmodulated.warnings.some(warning => warning.code === "OVERMODULATION")).toBe(true);

    const aliased = simulateInverter({ ...defaultInverterParameters, technique: "spwm", modulationIndex: 0.8, fundamentalFrequency: 1000, carrierFrequency: 1800 });
    expect(aliased.warnings.some(warning => warning.code === "NYQUIST_VIOLATION")).toBe(true);

    const backEmfExceeded = simulateInverter({ ...defaultInverterParameters, loadType: "RLE", dcVoltage: 100, backEmfVoltage: 150 });
    expect(backEmfExceeded.warnings.some(warning => warning.code === "BACK_EMF_EXCEEDED")).toBe(true);

    const healthy = simulateInverter({ ...defaultInverterParameters, technique: "square", loadType: "R" });
    expect(healthy.warnings).toHaveLength(0);
    expect(healthy.metrics.efficiency).toBe(100);
    expect(healthy.metrics.inputPower).toBeCloseTo(healthy.metrics.outputPower, 6);
  });
});
