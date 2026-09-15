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

  it("matches textbook rectification efficiency and power factor for R loads, and keeps the free-wheeling diode inert for RLC", () => {
    const halfWaveR = simulateControlledRectifier({ ...defaultRectifierParameters, phase: "single", rectifierType: "half", loadType: "R", firingAngle: 0 });
    const fullWaveR = simulateControlledRectifier({ ...defaultRectifierParameters, phase: "single", rectifierType: "full", fullWaveSubtype: "bridge", loadType: "R", firingAngle: 0 });

    expect(halfWaveR.metrics.efficiency).toBeCloseTo(40.5, 0);
    expect(halfWaveR.metrics.powerFactor).toBeCloseTo(0.637, 2);
    expect(fullWaveR.metrics.efficiency).toBeCloseTo(81.2, 0);
    expect(fullWaveR.metrics.powerFactor).toBeCloseTo(0.9, 2);

    const rlcFwdOn = simulateControlledRectifier({ ...defaultRectifierParameters, loadType: "RLC", freeWheelingDiode: true, firingAngle: 30 });
    const rlcFwdOff = simulateControlledRectifier({ ...defaultRectifierParameters, loadType: "RLC", freeWheelingDiode: false, firingAngle: 30 });
    expect(rlcFwdOn.metrics.voltageDc).toBeCloseTo(rlcFwdOff.metrics.voltageDc, 6);
    expect(rlcFwdOn.metrics.currentRms).toBeCloseTo(rlcFwdOff.metrics.currentRms, 6);
    expect(rlcFwdOn.warnings.some(warning => warning.code === "FWD_INERT_FOR_LOAD")).toBe(true);

    const rlWithFwd = simulateControlledRectifier({ ...defaultRectifierParameters, loadType: "RL", freeWheelingDiode: true });
    expect(rlWithFwd.warnings.some(warning => warning.code === "FWD_INERT_FOR_LOAD")).toBe(false);
  });

  it("doubles ripple frequency when a three-phase bridge is switched from 6- to 12-pulse", () => {
    const sixPulse = simulateControlledRectifier({ ...defaultRectifierParameters, phase: "three", rectifierType: "full", loadType: "R", pulseCount: 6, firingAngle: 0 });
    const twelvePulse = simulateControlledRectifier({ ...defaultRectifierParameters, phase: "three", rectifierType: "full", loadType: "R", pulseCount: 12, firingAngle: 0 });

    expect(twelvePulse.metrics.outputFrequency).toBeCloseTo(sixPulse.metrics.outputFrequency * 2, 6);
    expect(twelvePulse.metrics.rippleFactor).toBeLessThan(sixPulse.metrics.rippleFactor);
    expect(twelvePulse.metrics.voltageDc).toBeCloseTo(sixPulse.metrics.voltageDc, 0);
  });
});
