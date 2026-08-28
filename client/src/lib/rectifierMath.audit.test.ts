import { describe, expect, it } from "vitest";
import { defaultRectifierParameters, simulateControlledRectifier } from "./rectifierMath";

describe("Rectifier power-engine audit", () => {
  it("distinguishes high-inductance CCM from low-inductance DCM while retaining finite RMS and extinction metrics", () => {
    const ccm = simulateControlledRectifier({
      ...defaultRectifierParameters,
      loadType: "RL",
      freeWheelingDiode: true,
      firingAngle: 0,
      inductanceMilliHenry: 2_000,
    });
    const dcm = simulateControlledRectifier({
      ...defaultRectifierParameters,
      loadType: "RL",
      freeWheelingDiode: false,
      firingAngle: 65,
      inductanceMilliHenry: 0.02,
    });

    expect(ccm.metrics.conductionMode).toBe("CCM");
    expect(ccm.metrics.extinctionAngleDeg).toBeNull();
    expect(dcm.metrics.conductionMode).toBe("DCM");
    expect(dcm.metrics.extinctionAngleDeg).not.toBeNull();
    expect(dcm.metrics.extinctionAngleDeg).toBeGreaterThanOrEqual(0);
    expect(dcm.metrics.extinctionAngleDeg).toBeLessThanOrEqual(360);
    expect([ccm.metrics.voltageRms, dcm.metrics.voltageRms, ccm.metrics.currentRms, dcm.metrics.currentRms].every(Number.isFinite)).toBe(true);
  });
});
