import { describe, expect, it } from "vitest";
import { defaultAcVoltageControllerParameters, simulateAcVoltageController } from "./acVoltageControllerMath";

describe("AC voltage controller power-engine audit", () => {
  it("degrades power factor with firing angle on a resistive load and flags it once it crosses 0.5", () => {
    const low = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "unidirectional", loadType: "R", firingAngle: 20 });
    const high = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "unidirectional", loadType: "R", firingAngle: 150 });

    expect(low.metrics.powerFactor).toBeGreaterThan(high.metrics.powerFactor);
    expect(low.warnings.some(warning => warning.code === "POOR_POWER_FACTOR")).toBe(false);
    expect(high.warnings.some(warning => warning.code === "POOR_POWER_FACTOR")).toBe(true);
  });

  it("caps bidirectional firing angle at 90° and flags conduction failure on a highly inductive RL load", () => {
    const capped = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "bidirectional", loadType: "R", firingAngle: 150 });
    expect(capped.metrics.firingAngle).toBeCloseTo(90, 5);
    expect(capped.warnings.some(warning => warning.code === "BIDIRECTIONAL_ASYMMETRY")).toBe(true);

    const blocked = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "unidirectional", loadType: "RL", firingAngle: 170, resistance: 2, inductanceMilliHenry: 500 });
    expect(blocked.warnings.some(warning => warning.code === "CONDUCTION_FAILURE")).toBe(true);
  });

  it("scales integral-cycle RMS output voltage with sqrt(duty) and reports the applied duty", () => {
    const result = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, controlMode: "integral-cycle", loadType: "R", onCycles: 2, offCycles: 3 });
    const duty = 2 / 5;

    expect(result.metrics.controlValue).toBeCloseTo(duty, 10);
    expect(result.metrics.sourceVoltageRms).toBeGreaterThan(0);
    expect(result.metrics.outputVoltageRms).toBeCloseTo(result.metrics.sourceVoltageRms * Math.sqrt(duty), 0);
  });
});
