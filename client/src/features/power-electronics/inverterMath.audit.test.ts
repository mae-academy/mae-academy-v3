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
});
