/**
 * Real-ngspice.wasm regression coverage for diodes (validation spec Section IV): forward/reverse
 * bias, half-wave rectification, Zener regulation, LED forward drop + current limiting, and
 * photodiode dark current. Same full-pipeline `simulate()` as ngspiceRegression.test.ts — see
 * ngspiceRegressionHelpers.ts. `diode`/`diode-ideal`/`diode-silicon`/`diode-germanium`/`diode-gaas`
 * all map onto the same D_STD SPICE model (spiceAdapter.ts) — the "material variant" is a Phase 3
 * modeling contract not yet implemented, so this file exercises `diode-silicon` as the representative
 * standard-junction case rather than asserting per-material behaviour that doesn't exist yet.
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

describe("ngspice regression: diodes (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 4.1 — forward bias (D_STD, practical mode)", () => {
    it(
      "drops a silicon-range Vf and satisfies KVL against the series resistor",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 5 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("am1", "ammeter"),
          part("d1", "diode-silicon"),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "am1", "pos"),
          wire("w3", "am1", "neg", "d1", "anode"),
          wire("w4", "d1", "cathode", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
          wire("w6", "vm1", "pos", "d1", "anode"),
          wire("w7", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.am1.status).toBe("ready");
        expect(readings.vm1.status).toBe("ready");
        const vf = readings.vm1.value;
        const current = readings.am1.value;
        // Silicon PN knee, not the fitted-Vf LED case.
        expect(vf).toBeGreaterThan(0.4);
        expect(vf).toBeLessThan(0.9);
        // KVL around the source loop: V = I*R + Vf, independent of the diode's own I-V law.
        expect(current * 1000 + vf).toBeCloseTo(5, 1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 4.2 — reverse bias", () => {
    it(
      "blocks conduction: leakage current is negligible and the diode holds the rail",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 5 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("am1", "ammeter"),
          part("d1", "diode-silicon"),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          // Diode reversed: cathode toward the source, anode toward ground through R.
          wire("w1", "v1", "pos", "d1", "cathode"),
          wire("w2", "d1", "anode", "am1", "pos"),
          wire("w3", "am1", "neg", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
          wire("w6", "vm1", "pos", "d1", "cathode"),
          wire("w7", "vm1", "neg", "d1", "anode"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.am1.status).toBe("ready");
        // IS=1e-14 A: even at ~5 V reverse bias, current stays in the pA range.
        expect(Math.abs(readings.am1.value)).toBeLessThan(1e-9);
        // Negligible drop across R means the diode holds essentially the whole rail.
        expect(readings.vm1.value).toBeGreaterThan(4.9);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 4.3 — Academic vs Practical junction model", () => {
    it(
      "Academic mode's ideal-switch junction (N=0.001) drops far less than Practical's silicon knee",
      async () => {
        const circuitFor = () => ({
          components: [
            part("g", "ground"),
            part("v1", "dc-voltage", { voltage: 5 }),
            part("r1", "resistor", { resistance: 1000 }),
            part("d1", "diode-silicon"),
            part("vm1", "voltmeter"),
          ],
          wires: [
            wire("w1", "v1", "pos", "r1", "a"),
            wire("w2", "r1", "b", "d1", "anode"),
            wire("w3", "d1", "cathode", "g", "gnd"),
            wire("w4", "v1", "neg", "g", "gnd"),
            wire("w5", "vm1", "pos", "d1", "anode"),
            wire("w6", "vm1", "neg", "g", "gnd"),
          ],
        });
        const academic = await simulate(
          circuitFor().components,
          circuitFor().wires,
          "academic"
        );
        const practical = await simulate(
          circuitFor().components,
          circuitFor().wires,
          "practical"
        );
        expect(academic.readings.vm1.value).toBeLessThan(0.05);
        expect(practical.readings.vm1.value).toBeGreaterThan(0.4);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 4.4 — half-wave rectification", () => {
    it(
      "clamps the negative half-cycle near 0 V and passes the positive half through minus Vf",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: 10, frequency: 50, phase: 0 }),
          part("d1", "diode-silicon"),
          part("r1", "resistor", { resistance: 1000 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "d1", "anode"),
          wire("w2", "d1", "cathode", "r1", "a"),
          wire("w3", "r1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
        ];
        // One 50 Hz period at fine enough resolution to resolve the peak.
        const { nodeVoltageAt } = await simulate(components, wires, "practical", [
          ".tran 0.00005 0.02",
        ]);
        const positivePeak = nodeVoltageAt("r1", "a", 0.005); // t = T/4: source peaks at +10 V.
        const negativeTrough = nodeVoltageAt("r1", "a", 0.015); // t = 3T/4: source troughs at -10 V.
        // Conducting half: within a silicon knee of the 10 V peak.
        expect(positivePeak).toBeGreaterThan(8.5);
        expect(positivePeak).toBeLessThan(9.6);
        // Blocked half: the diode holds off virtually all of the reverse swing, load stays near 0 V.
        expect(Math.abs(negativeTrough)).toBeLessThan(0.05);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 4.5 — Zener voltage regulation", () => {
    it(
      "holds ~5.1 V across the load as the load resistance varies (reverse-biased in breakdown)",
      async () => {
        const regulatedVoltage = async (loadResistance: number) => {
          const components = [
            part("g", "ground"),
            part("v1", "dc-voltage", { voltage: 12 }),
            part("rs", "resistor", { resistance: 470 }),
            part("dz", "zener", { breakdownVoltage: 5.1 }),
            part("rl", "resistor", { resistance: loadResistance }),
            part("vm1", "voltmeter"),
          ];
          const wires = [
            wire("w1", "v1", "pos", "rs", "a"),
            // Reverse-biased into breakdown: cathode toward the series resistor/source.
            wire("w2", "rs", "b", "dz", "cathode"),
            wire("w3", "dz", "anode", "g", "gnd"),
            wire("w4", "rs", "b", "rl", "a"),
            wire("w5", "rl", "b", "g", "gnd"),
            wire("w6", "v1", "neg", "g", "gnd"),
            wire("w7", "vm1", "pos", "dz", "cathode"),
            wire("w8", "vm1", "neg", "g", "gnd"),
          ];
          const { readings } = await simulate(components, wires, "practical");
          expect(readings.vm1.status).toBe("ready");
          return readings.vm1.value;
        };
        const lightLoad = await regulatedVoltage(10_000);
        const heavyLoad = await regulatedVoltage(1_000);
        expect(lightLoad).toBeGreaterThan(4.9);
        expect(lightLoad).toBeLessThan(5.3);
        expect(heavyLoad).toBeGreaterThan(4.9);
        expect(heavyLoad).toBeLessThan(5.3);
        // The whole point of the regulator: load swing barely moves the output.
        expect(Math.abs(lightLoad - heavyLoad)).toBeLessThan(0.1);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 4.6 — LED forward voltage and current limiting", () => {
    it(
      "sets its forward drop from the fitted Vf and the load current from the limiting resistor",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 9 }),
          part("r1", "resistor", { resistance: 330 }),
          part("am1", "ammeter"),
          part("d1", "led", { forwardVoltage: 2 }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "am1", "pos"),
          wire("w3", "am1", "neg", "d1", "anode"),
          wire("w4", "d1", "cathode", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
          wire("w6", "vm1", "pos", "d1", "anode"),
          wire("w7", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vm1.value).toBeCloseTo(2, 1);
        // I = (9 - Vf) / R, current-limited entirely by R1 — no thermal runaway.
        const expectedCurrent = (9 - readings.vm1.value) / 330;
        expect(readings.am1.value).toBeCloseTo(expectedCurrent, 3);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 4.7 — photodiode dark current", () => {
    it(
      "conducts only IS-scale leakage when reverse-biased with no illumination model",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 5 }),
          part("r1", "resistor", { resistance: 1_000_000 }),
          part("dp1", "photodiode"),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          // Reverse-biased: cathode toward the positive rail.
          wire("w2", "r1", "b", "dp1", "cathode"),
          wire("w3", "dp1", "anode", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "vm1", "pos", "dp1", "anode"),
          wire("w6", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // Dark current ~IS=1e-9 A through a 1 MΩ load drops microvolts — negligible vs the 5 V rail.
        expect(Math.abs(readings.vm1.value)).toBeLessThan(0.01);
      },
      RUN_TIMEOUT
    );
  });
});
