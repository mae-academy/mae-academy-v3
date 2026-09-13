/**
 * Real-ngspice.wasm regression coverage for passive components (validation spec Section III):
 * resistor Ohm's law, potentiometer wiper sweep, capacitor DC charging and AC impedance, inductor DC
 * rise and AC reactance, and RLC series resonance. Same full-pipeline `simulate()` as
 * ngspiceRegression.test.ts — see ngspiceRegressionHelpers.ts.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

describe("ngspice regression: passives (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  it(
    "Test 3.1 — 470 Ω resistor at 10 V DC draws 21.276 mA within 2% (Ohm's law)",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "dc-voltage", { voltage: 10 }),
        part("am1", "ammeter"),
        part("r1", "resistor", { resistance: 470 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "am1", "pos"),
        wire("w2", "am1", "neg", "r1", "a"),
        wire("w3", "r1", "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical");
      const expectedCurrent = 10 / 470;
      expect(readings.am1.status).toBe("ready");
      expect(readings.am1.value).toBeCloseTo(expectedCurrent, 4);
      expect(
        Math.abs(readings.am1.value - expectedCurrent) / expectedCurrent
      ).toBeLessThan(0.02);
    },
    RUN_TIMEOUT
  );

  describe("Test 3.2 — 10 kΩ potentiometer wiper sweep under 12 V is linear", () => {
    it.each([
      [0, 0],
      [0.25, 3],
      [0.5, 6],
      [0.75, 9],
      [1, 12],
    ])("wiper at %s%% reads %s V", async (wiper, expectedVoltage) => {
      const components = [
        part("g", "ground"),
        part("v1", "dc-voltage", { voltage: 12 }),
        // t1's slice grows with `wiper`, so t1 is the 0 V reference and t2 the 12 V rail: at
        // wiper=0 the wiper sits at t1 (0 V), at wiper=1 it sits at t2 (12 V) — matching "Position%".
        part("pot1", "potentiometer", { resistance: 10_000, wiper }),
        part("vm1", "voltmeter"),
      ];
      const wires = [
        wire("w1", "v1", "pos", "pot1", "t2"),
        wire("w2", "pot1", "t1", "g", "gnd"),
        wire("w3", "v1", "neg", "g", "gnd"),
        wire("w4", "vm1", "pos", "pot1", "wiper"),
        wire("w5", "vm1", "neg", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical");
      expect(readings.vm1.status).toBe("ready");
      expect(readings.vm1.value).toBeCloseTo(expectedVoltage, 2);
    }, RUN_TIMEOUT);
  });

  it(
    "Test 3.3 — 10 µF capacitor charging through 1 kΩ (τ = 10 ms) follows V(1 - e^-t/τ)",
    async () => {
      // Fine enough to resolve the 10 ms time constant out to 5τ = 50 ms.
      const components = [
        part("g", "ground"),
        part("v1", "dc-voltage", { voltage: 12 }),
        part("r1", "resistor", { resistance: 1000 }),
        part("c1", "capacitor", { capacitance: 10e-6 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "c1", "a"),
        wire("w3", "c1", "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
      ];
      // `uic` skips the default bias-point solve, which would otherwise start the cap already at
      // its DC steady state (fully charged, since a constant source "has always been on").
      const { nodeVoltageAt } = await simulate(
        components,
        wires,
        "practical",
        [".tran 0.0001 0.05 uic"]
      );
      const vCapAt = (t: number) => nodeVoltageAt("c1", "a", t);
      // t = 0: still uncharged.
      expect(vCapAt(0)).toBeLessThan(0.5);
      // t = τ = 10 ms: 12(1 - 1/e) = 7.59 V.
      expect(vCapAt(0.01)).toBeCloseTo(7.59, 1);
      // t = 5τ = 50 ms: ~99.3% settled, ~11.9 V.
      expect(vCapAt(0.05)).toBeGreaterThan(11.8);
      expect(vCapAt(0.05)).toBeLessThanOrEqual(12);
    },
    RUN_TIMEOUT
  );

  it(
    "Test 3.4 — 100 nF capacitor at 1 kHz, 10 V RMS draws 6.28 mA RMS through |Zc| = 1591 Ω",
    async () => {
      const components = [
        part("g", "ground"),
        // A single-point .ac analysis is a linear ratio: quoting the source's magnitude directly
        // in RMS (rather than peak, as .tran's SIN() would need) yields the current's RMS magnitude
        // straight from ngspice — no cycles to settle, no true-RMS windowing involved.
        part("v1", "ac-voltage", { amplitude: 10, frequency: 1000 }),
        part("am1", "ammeter", { mode: "AC" }),
        part("c1", "capacitor", { capacitance: 100e-9 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "am1", "pos"),
        wire("w2", "am1", "neg", "c1", "a"),
        wire("w3", "c1", "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical", [
        ".ac lin 1 1000 1000",
      ]);
      expect(readings.am1.status).toBe("ready");
      expect(readings.am1.value).toBeCloseTo(0.00628, 4);
    },
    RUN_TIMEOUT
  );

  it(
    "Test 3.5 — 1 mH inductor in series with 1 kΩ (τ = 1 µs) rises to 99% of 12 mA by 5τ",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "dc-voltage", { voltage: 12 }),
        part("r1", "resistor", { resistance: 1000 }),
        part("l1", "inductor", { inductance: 1e-3 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "l1", "a"),
        wire("w3", "l1", "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
      ];
      // `uic` again: without it, the bias-point solve finds the inductor already carrying its
      // steady-state 12 mA, since a constant source has no "before t=0" as far as .op is concerned.
      const { nodeVoltageAt } = await simulate(
        components,
        wires,
        "practical",
        [".tran 1e-8 6e-6 uic"]
      );
      // Series loop: I(t) = (V - V_L(t)) / R, since V_L(t) is the voltage across the inductor
      // (its far terminal is grounded).
      const currentAt = (t: number) => (12 - nodeVoltageAt("l1", "a", t)) / 1000;
      // t = 0+: the inductor opposes the step, so current is still near zero.
      expect(currentAt(0)).toBeLessThan(0.001);
      // t = τ = 1 µs: 12m(1 - 1/e) = 7.59 mA.
      expect(currentAt(1e-6)).toBeCloseTo(0.00759, 3);
      // t = 5τ = 5 µs: 12m(1 - e^-5) = 11.92 mA, >99% settled.
      expect(currentAt(5e-6)).toBeGreaterThan(0.0119);
    },
    RUN_TIMEOUT
  );

  it(
    "Test 3.6 — 1 mH inductor at 1 kHz, 10 V RMS draws 1.592 A RMS through X_L = 6.28 Ω",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: 10, frequency: 1000 }),
        part("am1", "ammeter", { mode: "AC" }),
        part("l1", "inductor", { inductance: 1e-3 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "am1", "pos"),
        wire("w2", "am1", "neg", "l1", "a"),
        wire("w3", "l1", "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical", [
        ".ac lin 1 1000 1000",
      ]);
      expect(readings.am1.status).toBe("ready");
      expect(readings.am1.value).toBeCloseTo(1.592, 2);
    },
    RUN_TIMEOUT
  );

  // NOTE on the source spec: it quotes f0=159.15kHz and Q≈100 for R=100Ω/L=100µH/C=100nF, but
  // f0 = 1/(2π√LC) for those values is actually ≈50.33kHz, and Q = (1/R)√(L/C) ≈0.32, not ~100 —
  // an arithmetic slip in the spec (that L/C ratio gives a heavily *underdamped* series RLC, not a
  // sharp filter). f0/Q here is computed from the real formula, and the half-power points are found
  // by an exact numeric solve rather than the spec's f0±BW/2 approximation, which is only valid for
  // Q≫1 and yields a negative frequency for this R/L/C.
  describe("Test 3.7 — RLC series resonance (R=100Ω, L=100µH, C=100nF)", () => {
    const R = 100;
    const L = 100e-6;
    const C = 100e-9;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));

    /** |Z(f)| for the series R-L-C loop. */
    function impedanceMagnitude(frequency: number): number {
      const omega = 2 * Math.PI * frequency;
      const reactance = omega * L - 1 / (omega * C);
      return Math.hypot(R, reactance);
    }

    /**
     * Exact frequency where a monotonic function crosses `target`, by bisection. |Z(f)| is unimodal
     * around f0 (minimum = R there), so it is strictly decreasing on (0, f0) and strictly increasing
     * on (f0, ∞) — each branch brackets exactly one root of |Z(f)| = R√2.
     */
    function bisect(
      low: number,
      high: number,
      increasing: boolean,
      target: number
    ): number {
      for (let i = 0; i < 80; i += 1) {
        const mid = (low + high) / 2;
        const belowTarget = impedanceMagnitude(mid) < target;
        if (increasing === belowTarget) low = mid;
        else high = mid;
      }
      return (low + high) / 2;
    }
    const halfPower = R * Math.SQRT2;
    const halfPowerLow = () => bisect(f0 / 1000, f0, false, halfPower);
    const halfPowerHigh = () => bisect(f0, f0 * 1000, true, halfPower);

    function rlcCircuit(frequency: number) {
      const components = [
        part("g", "ground"),
        // Single-point .ac: quoting amplitude directly in RMS gives an RMS current reading (see
        // Test 3.4/3.6), with none of the settling or damping concerns a .tran sweep would carry.
        part("v1", "ac-voltage", { amplitude: 10, frequency }),
        part("am1", "ammeter", { mode: "AC" }),
        part("r1", "resistor", { resistance: R }),
        part("l1", "inductor", { inductance: L }),
        part("c1", "capacitor", { capacitance: C }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "am1", "pos"),
        wire("w2", "am1", "neg", "r1", "a"),
        wire("w3", "r1", "b", "l1", "a"),
        wire("w4", "l1", "b", "c1", "a"),
        wire("w5", "c1", "b", "g", "gnd"),
        wire("w6", "v1", "neg", "g", "gnd"),
      ];
      return simulate(components, wires, "practical", [
        `.ac lin 1 ${frequency} ${frequency}`,
      ]);
    }

    it(
      "at f0, impedance is purely resistive and current peaks at 10V/100Ω = 100 mA RMS",
      async () => {
        const { readings } = await rlcCircuit(f0);
        expect(readings.am1.status).toBe("ready");
        expect(readings.am1.value).toBeCloseTo(0.1, 3);
      },
      RUN_TIMEOUT
    );

    it(
      "at the exact half-power points, |Z| = R√2 so current drops to I_max/√2 ≈ 70.7 mA RMS",
      async () => {
        const fLow = halfPowerLow();
        const fHigh = halfPowerHigh();
        const [below, above] = await Promise.all([
          rlcCircuit(fLow),
          rlcCircuit(fHigh),
        ]);
        const expected = 0.1 / Math.SQRT2;
        expect(below.readings.am1.value).toBeCloseTo(expected, 3);
        expect(above.readings.am1.value).toBeCloseTo(expected, 3);
      },
      RUN_TIMEOUT * 2
    );
  });
});
