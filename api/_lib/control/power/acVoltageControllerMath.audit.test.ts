import { describe, expect, it } from "vitest";
import { defaultAcVoltageControllerParameters, simulateAcVoltageController } from "./acVoltageControllerMath";

describe("AC voltage controller power-engine audit", () => {
  it("degrades power factor with firing angle on a heavily inductive load and flags it once it crosses 0.5", () => {
    const low = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "bidirectional", loadType: "RL", resistance: 2, inductanceMilliHenry: 500, firingAngle: 15 });
    const high = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "bidirectional", loadType: "RL", resistance: 2, inductanceMilliHenry: 500, firingAngle: 100 });

    expect(low.metrics.powerFactor).toBeGreaterThan(high.metrics.powerFactor);
    expect(low.warnings.some(warning => warning.code === "POOR_POWER_FACTOR")).toBe(false);
    expect(high.warnings.some(warning => warning.code === "POOR_POWER_FACTOR")).toBe(true);
  });

  it("keeps the diode half of a unidirectional (half-controlled) controller fully conducting regardless of alpha, giving it a non-zero DC offset per spec 2.1", () => {
    const result = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "unidirectional", loadType: "R", firingAngle: 150 });
    const negativeHalf = result.samples.filter((sample) => sample.sourceVoltage < -1);

    // v_o = v_s unconditionally for pi <= wt <= 2*pi (spec 2.1) — the diode is uncontrolled.
    expect(negativeHalf.length).toBeGreaterThan(0);
    expect(negativeHalf.every((sample) => Math.abs(sample.outputVoltage - sample.sourceVoltage) < 1e-6)).toBe(true);
    // A half-controlled converter has a non-zero average (DC) output, unlike the symmetric bidirectional case.
    expect(result.metrics.outputVoltageAvg).toBeLessThan(-1);
    // As alpha -> pi the SCR half contributes nothing and only the always-on diode half remains,
    // so PF settles at the diode-only floor of 1/sqrt(2), never collapsing toward zero.
    expect(result.metrics.powerFactor).toBeGreaterThan(0.65);
  });

  it("matches the closed-form RMS formula for a unidirectional (diode-SCR) resistive controller across firing angles", () => {
    const inputRms = defaultAcVoltageControllerParameters.inputVoltage;
    const vm = inputRms * Math.SQRT2;
    for (const alphaDeg of [0, 30, 60, 90, 120, 150]) {
      const alpha = (alphaDeg * Math.PI) / 180;
      const expectedRms = (vm / 2) * Math.sqrt((1 / Math.PI) * (Math.PI - alpha + Math.sin(2 * alpha) / 2) + 1);
      const result = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "unidirectional", loadType: "R", firingAngle: alphaDeg });
      expect(result.metrics.outputVoltageRms).toBeCloseTo(expectedRms, 0);
    }
  });

  it("runs the bidirectional controller over the full alpha in [0deg, 180deg] with zero average output, matching the closed-form RMS formula", () => {
    const inputRms = defaultAcVoltageControllerParameters.inputVoltage;
    for (const alphaDeg of [30, 60, 90, 120, 150]) {
      const alpha = (alphaDeg * Math.PI) / 180;
      const expectedRms = inputRms * Math.sqrt((1 / Math.PI) * (Math.PI - alpha + Math.sin(2 * alpha) / 2));
      const result = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "bidirectional", loadType: "R", firingAngle: alphaDeg });
      expect(result.metrics.firingAngle).toBeCloseTo(alphaDeg, 5);
      expect(result.metrics.outputVoltageRms).toBeCloseTo(expectedRms, 0);
      expect(result.metrics.outputVoltageAvg).toBeCloseTo(0, 0);
    }
    // Output continues to fall past 90deg, unlike the old (incorrect) 90deg-capped model.
    const at90 = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "bidirectional", loadType: "R", firingAngle: 90 });
    const at150 = simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, topology: "bidirectional", loadType: "R", firingAngle: 150 });
    expect(at150.metrics.outputVoltageRms).toBeLessThan(at90.metrics.outputVoltageRms);
  });

  it("flags conduction failure on a highly inductive RL load once firing angle plus load phase angle exceeds 180°", () => {
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

  describe("three-phase connection physics (spec 2.2)", () => {
    const threePhase = (overrides: Partial<Parameters<typeof simulateAcVoltageController>[0]>) =>
      simulateAcVoltageController({ ...defaultAcVoltageControllerParameters, phase: "three", topology: "bidirectional", loadType: "R", ...overrides });

    it("only reads threePhaseConnection when phase is three — star-4w and star-3w now diverge instead of being silently ignored", () => {
      const star4w = threePhase({ threePhaseConnection: "star-4w", firingAngle: 45 });
      const star3w = threePhase({ threePhaseConnection: "star-3w", firingAngle: 45 });
      expect(star3w.metrics.outputVoltageRms).not.toBeCloseTo(star4w.metrics.outputVoltageRms, 1);
    });

    it("star-4w (neutral-connected) behaves as three independent single-phase controllers, matching the single-phase RMS formula per line", () => {
      const star4w = threePhase({ threePhaseConnection: "star-4w", firingAngle: 45 });
      const inputRms = defaultAcVoltageControllerParameters.inputVoltage;
      const alpha = (45 * Math.PI) / 180;
      const expectedRms = inputRms * Math.sqrt((1 / Math.PI) * (Math.PI - alpha + Math.sin(2 * alpha) / 2));
      expect(star4w.metrics.outputVoltageRms).toBeCloseTo(expectedRms, 0);
    });

    it("isolated-neutral (star-3w) Mode 1 (alpha < 60°) always has 2 or 3 lines conducting, never fewer", () => {
      const result = threePhase({ threePhaseConnection: "star-3w", firingAngle: 45 });
      const analysis = result.samples.slice(-900);
      const conductingCounts = analysis.map((sample) => [sample.phaseAOutput, sample.phaseBOutput, sample.phaseCOutput].filter((value) => Math.abs(value) > 0.5).length);
      expect(Math.min(...conductingCounts)).toBeGreaterThanOrEqual(2);
    });

    it("isolated-neutral (star-3w) output collapses to zero at a high firing angle (discontinuous operation, spec 2.2 mode 3+)", () => {
      const result = threePhase({ threePhaseConnection: "star-3w", firingAngle: 130 });
      expect(result.metrics.outputVoltageRms).toBeCloseTo(0, 5);
    });

    it("delta drives each branch off the line-to-line voltage (√3× phase amplitude, 30° leading) and derives line current via KCL", () => {
      const result = threePhase({ threePhaseConnection: "delta", firingAngle: 45 });
      const inputPeak = defaultAcVoltageControllerParameters.inputVoltage * Math.SQRT2;
      const analysis = result.samples.slice(-900);
      const branchPeak = Math.max(...analysis.map((sample) => Math.abs(sample.phaseAOutput)));
      expect(branchPeak).toBeGreaterThan(inputPeak); // line voltage exceeds phase voltage in magnitude
      expect(branchPeak).toBeLessThanOrEqual(inputPeak * Math.sqrt(3) + 1);
      expect(result.metrics.outputCurrentRms).toBeGreaterThan(0);
    });
  });
});
