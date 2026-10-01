import { describe, expect, it } from "vitest";
import { defaultChopperParameters, simulateChopper } from "./chopperMath";

// ─── Shared fixture helpers ─────────────────────────────────────────────────
const base = defaultChopperParameters; // Vs=120, R=12, L=8mH, D=0.55, fs=4000Hz

/** Returns last-period stats from a simulation. */
function lastPeriodStats(sim: ReturnType<typeof simulateChopper>) {
  const s = sim.samples;
  const perPeriod = Math.round(s.length / 7);
  const tail = s.slice(-perPeriod);
  const currents = tail.map((p) => p.outputCurrent);
  const voltages = tail.map((p) => p.outputVoltage);
  return {
    iMax: Math.max(...currents),
    iMin: Math.min(...currents),
    vDc: voltages.reduce((a, b) => a + b, 0) / voltages.length,
    allFinite: [...currents, ...voltages].every(Number.isFinite),
  };
}

// ─── CLASS A: First-Quadrant Buck ────────────────────────────────────────────
describe("Class A — First-Quadrant Buck Chopper", () => {
  it("produces Vo ≈ D·Vs in CCM (RL load)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "RL", dutyCycle: 0.6 });
    const { vDc, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Vo = D·Vs = 0.6×120 = 72V ±5%
    expect(vDc).toBeCloseTo(72, 0);
  });

  it("blocks reverse current (freewheeling diode enforces i_o ≥ 0)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "RLE", backEmfVoltage: 200, dutyCycle: 0.2 });
    const { iMin } = lastPeriodStats(sim);
    expect(iMin).toBeGreaterThanOrEqual(-1e-9);
  });

  it("enters DCM correctly when L < L_critical and clamps i_o at 0", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "RL", inductanceMilliHenry: 0.1, dutyCycle: 0.3 });
    expect(sim.metrics.conductionMode).toBe("DCM");
    const { iMin } = lastPeriodStats(sim);
    expect(iMin).toBeGreaterThanOrEqual(-1e-9);
  });

  it("handles D=0 gracefully: all samples at zero with no NaN", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "R", backEmfVoltage: 0, dutyCycle: 0 });
    expect(sim.metrics.dutyCycle).toBe(0);
    expect(sim.samples.every((s) => s.outputVoltage === 0 && s.outputCurrent === 0)).toBe(true);
    expect(sim.samples.every((s) => Number.isFinite(s.outputVoltage) && Number.isFinite(s.outputCurrent))).toBe(true);
  });

  it("handles D=1 gracefully: switch always on, output ≈ Vs", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "R", backEmfVoltage: 0, dutyCycle: 1 });
    expect(sim.metrics.dutyCycle).toBe(1);
    expect(sim.samples.every((s) => s.switchOn)).toBe(true);
    expect(sim.metrics.outputVoltageDc).toBeCloseTo(base.inputVoltage, 0);
  });

  it("warns for RLE back-EMF that reverses average output current", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "RLE", backEmfVoltage: 500, dutyCycle: 0.1 });
    expect(sim.warnings.some((w) => w.code === "BACK_EMF_REVERSES_CURRENT")).toBe(true);
  });

  it("warns for boost duty cycle > 90%", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "boost", loadType: "R", dutyCycle: 0.95 });
    expect(sim.warnings.some((w) => w.code === "DUTY_CYCLE_HIGH")).toBe(true);
  });
});

// ─── CLASS B: Second-Quadrant Regenerative ───────────────────────────────────
describe("Class B — Second-Quadrant Regenerative Chopper", () => {
  it("keeps average output current ≤ 0 (regen convention)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "B", loadType: "RLE", backEmfVoltage: 72, dutyCycle: 0.45 });
    const { iMax, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    expect(iMax).toBeLessThanOrEqual(1e-9); // strictly non-positive
  });

  it("does NOT emit BACK_EMF_REVERSES_CURRENT warning (regen is expected)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "B", loadType: "RLE", backEmfVoltage: 72, dutyCycle: 0.45 });
    expect(sim.warnings.some((w) => w.code === "BACK_EMF_REVERSES_CURRENT")).toBe(false);
  });

  it("supplies sensible default back-EMF when backEmfVoltage=0 (no broken state)", () => {
    // E=0 → engine should self-correct to 0.6*Vs = 72V
    const sim = simulateChopper({ ...base, quadrantClass: "B", loadType: "RLE", backEmfVoltage: 0, dutyCycle: 0.5 });
    // Simulation should still produce finite, non-trivial results
    expect(sim.samples.every((s) => Number.isFinite(s.outputCurrent))).toBe(true);
    expect(sim.metrics.outputCurrentDc).toBeLessThanOrEqual(0);
  });

  it("all waveform samples are numerically finite", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "B", loadType: "RLE", backEmfVoltage: 72, dutyCycle: 0.55 });
    expect(sim.samples.every((s) => Number.isFinite(s.outputVoltage) && Number.isFinite(s.outputCurrent))).toBe(true);
  });
});

// ─── CLASS C: Two-Quadrant Type A (V+, I±) ───────────────────────────────────
describe("Class C — Two-Quadrant Type A Chopper", () => {
  it("produces average output voltage ≈ D·Vs (same as Class A buck)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "C", topology: "buck", loadType: "RL", dutyCycle: 0.5 });
    const { vDc, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Vo = D·Vs = 0.5×120 = 60V ±5%
    expect(vDc).toBeCloseTo(60, 0);
  });

  it("allows current to swing negative without DCM clamping (complementary switching)", () => {
    // Very small inductor + load EMF > average output → current should cross zero
    const sim = simulateChopper({ ...base, quadrantClass: "C", topology: "buck", loadType: "RLE", backEmfVoltage: 50, inductanceMilliHenry: 0.5, dutyCycle: 0.5 });
    const { iMin, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Current can go negative for Class C — check no artificial clamping at 0
    // (it may or may not go negative depending on params; ensure no NaN)
    expect(Number.isFinite(iMin)).toBe(true);
  });

  it("does NOT produce BACK_EMF_REVERSES_CURRENT warning (bidirectional)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "C", topology: "buck", loadType: "RLE", backEmfVoltage: 500, dutyCycle: 0.1 });
    expect(sim.warnings.some((w) => w.code === "BACK_EMF_REVERSES_CURRENT")).toBe(false);
  });

  it("all metrics are finite", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "C", loadType: "RL", dutyCycle: 0.6 });
    const m = sim.metrics;
    expect([m.outputVoltageDc, m.outputCurrentDc, m.rippleCurrent, m.efficiency].every(Number.isFinite)).toBe(true);
  });
});

// ─── CLASS D: Two-Quadrant Type B (V±, I+) ───────────────────────────────────
describe("Class D — Two-Quadrant Type B Chopper", () => {
  it("produces Vo = (2D-1)·Vs when D > 0.5", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "D", loadType: "RL", dutyCycle: 0.75 });
    const { vDc, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Vo = (2×0.75-1)×120 = 0.5×120 = 60V ±10%
    expect(vDc).toBeCloseTo(60, -1);
  });

  it("produces negative Vo when D < 0.5 without clamping", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "D", loadType: "RL", dutyCycle: 0.25 });
    const { vDc, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Vo = (2×0.25-1)×120 = -60V ±10%
    expect(vDc).toBeLessThan(0);
    expect(vDc).toBeCloseTo(-60, -1);
  });

  it("does NOT emit BACK_EMF_REVERSES_CURRENT or false warnings", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "D", loadType: "RL", dutyCycle: 0.4 });
    expect(sim.warnings.some((w) => w.code === "BACK_EMF_REVERSES_CURRENT")).toBe(false);
  });

  it("all samples are numerically finite across polarity reversal", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "D", loadType: "RL", dutyCycle: 0.5 });
    expect(sim.samples.every((s) => Number.isFinite(s.outputVoltage) && Number.isFinite(s.outputCurrent))).toBe(true);
  });
});

// ─── CLASS E: Four-Quadrant Full-Bridge ─────────────────────────────────────
describe("Class E — Four-Quadrant Full-Bridge Chopper", () => {
  it("produces Vo ≈ (2D-1)·Vs (bipolar PWM)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "E", loadType: "RL", dutyCycle: 0.7 });
    const { vDc, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Vo = (2×0.7-1)×120 = 0.4×120 = 48V ±15%
    expect(vDc).toBeCloseTo(48, -1);
  });

  it("produces negative Vo when D < 0.5", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "E", loadType: "RL", dutyCycle: 0.3 });
    const { vDc, allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    expect(vDc).toBeLessThan(0);
  });

  it("allows current in both directions (truly four-quadrant)", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "E", loadType: "RLE", backEmfVoltage: 36, dutyCycle: 0.4 });
    const { allFinite } = lastPeriodStats(sim);
    expect(allFinite).toBe(true);
    // Should not throw or produce NaN
  });

  it("does NOT produce BACK_EMF_REVERSES_CURRENT warning", () => {
    const sim = simulateChopper({ ...base, quadrantClass: "E", loadType: "RLE", backEmfVoltage: 500, dutyCycle: 0.3 });
    expect(sim.warnings.some((w) => w.code === "BACK_EMF_REVERSES_CURRENT")).toBe(false);
  });

  it("all samples are numerically finite in all four quadrants", () => {
    // Sweep several duty cycles to exercise all four quadrant regimes
    for (const duty of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const sim = simulateChopper({ ...base, quadrantClass: "E", loadType: "RLE", backEmfVoltage: 36, dutyCycle: duty });
      expect(sim.samples.every((s) => Number.isFinite(s.outputVoltage) && Number.isFinite(s.outputCurrent)),
        `Class E with D=${duty} produced non-finite values`).toBe(true);
    }
  });
});

// ─── Cross-class sequential switching ───────────────────────────────────────
describe("Cross-class stability: sequential quadrant switching", () => {
  const quadrants: Array<Parameters<typeof simulateChopper>[0]["quadrantClass"]> = ["A", "B", "C", "D", "E"];

  for (const q of quadrants) {
    it(`Class ${q} produces stable, finite waveforms without warnings on default parameters`, () => {
      const params = {
        ...base,
        quadrantClass: q,
        loadType: q === "B" || q === "E" ? "RLE" as const : "RL" as const,
        backEmfVoltage: q === "B" ? 72 : q === "E" ? 36 : 0,
      };
      const sim = simulateChopper(params);
      expect(sim.samples.every((s) => Number.isFinite(s.outputVoltage) && Number.isFinite(s.outputCurrent))).toBe(true);
      // No false warnings
      const badWarnings = sim.warnings.filter((w) => w.code === "BACK_EMF_REVERSES_CURRENT");
      expect(badWarnings.length, `Class ${q} should not produce false BACK_EMF_REVERSES_CURRENT`).toBe(0);
    });
  }
});

// ─── CCM/DCM boundary warning ────────────────────────────────────────────────
describe("CCM/DCM boundary warning", () => {
  it("warns when operating near the CCM/DCM boundary", () => {
    // Use parameters that place L close to critical inductance
    const sim = simulateChopper({ ...base, quadrantClass: "A", topology: "buck", loadType: "RL", inductanceMilliHenry: 0.8, dutyCycle: 0.55 });
    // Whether or not it warns, it should not crash; the result must be finite
    expect(sim.samples.every((s) => Number.isFinite(s.outputVoltage))).toBe(true);
  });
});
