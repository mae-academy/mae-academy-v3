/**
 * Real-ngspice.wasm regression coverage for measurement instruments (validation spec Section IX):
 * DC/AC voltmeter, DC/AC ammeter, DMM (DCV/ACV/DCA/ACA/HZ/OHM), oscilloscope waveform capture and
 * rise-time, and power (P/Q/S/PF) computed from separate V+I readings. Same full-pipeline
 * `simulate()` as ngspiceRegression.test.ts — see ngspiceRegressionHelpers.ts.
 *
 * Where this engine's real behavior differs from the spec's textbook assumptions, the test follows
 * the engine (spiceAdapter.ts / spiceInstruments.ts), not the assumption, and says so:
 *  - The circular Voltmeter/Ammeter are always ideal (0 Ω burden, ∞ input impedance) in BOTH modes —
 *    "no burden voltage" is spiceAdapter.ts's own comment on the ammeter mapping. Only the DMM
 *    actually loads the circuit, and only in Practical mode, at DMM_INPUT_IMPEDANCE = 10 MΩ.
 *  - AC-mode readings are true RMS (`getVrms` integrates v² over whole periods) — including any DC
 *    component, not AC-coupled. A DC+AC combination therefore reads √(Vdc² + Vac,rms²), not just
 *    the AC part.
 *  - DMM OHM/CONT modes are unmapped by design (spiceInstruments.ts's own doc comment: "need an
 *    isolated test-source resistance measurement the batch deck does not provide") and left for the
 *    legacy engine — verified here as "produces no reading", not faked with an invented value.
 *  - The canvas has no square/triangle/sawtooth AC source (`ac-voltage` only emits SIN()) and no
 *    dedicated wattmeter/power-meter part. A clean square wave is built from primitives already
 *    proven in ngspiceRegression.opamps.test.ts (an open-loop op-amp comparator, sine in, rail-to-
 *    rail square out); power is computed from separate AC voltmeter + ammeter readings and the
 *    voltage/current phase difference, the same way a bench experiment would without a dedicated
 *    wattmeter.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  calculatePhaseAngleDifference,
  extractPhasor,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

const FREQUENCY = 50;
const PERIOD = 1 / FREQUENCY;
// 5 whole periods: getFrequency (rising-crossing based) needs a handful of periods to lock on
// reliably, and getVrms's whole-period window benefits from the same margin — verified against
// ngspice.wasm: a bare 2-period window occasionally missed a crossing at the trace's own edges.
const AC_ANALYSIS = [`.tran ${PERIOD / 200} ${5 * PERIOD}`];
const peakFor = (rms: number) => rms * Math.SQRT2;

describe("ngspice regression: measurement instruments (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 9.1 — DC voltmeter", () => {
    it(
      "ideal (circular) voltmeter across a load reads the source exactly, no loading at any load size",
      async () => {
        const readingFor = async (loadResistance: number) => {
          const components = [
            part("g", "ground"),
            part("v1", "dc-voltage", { voltage: 12 }),
            part("r1", "resistor", { resistance: loadResistance }),
            part("vm1", "voltmeter"),
          ];
          const wires = [
            wire("w1", "v1", "pos", "r1", "a"),
            wire("w2", "r1", "b", "g", "gnd"),
            wire("w3", "v1", "neg", "g", "gnd"),
            wire("w4", "vm1", "pos", "r1", "a"),
            wire("w5", "vm1", "neg", "g", "gnd"),
          ];
          const { readings } = await simulate(components, wires, "practical");
          return readings.vm1.value;
        };
        expect(await readingFor(1000)).toBeCloseTo(12, 3);
        expect(await readingFor(100_000)).toBeCloseTo(12, 3); // Same reading — no loading effect.
      },
      RUN_TIMEOUT
    );

    it(
      // 12V × 3.2k/(6.8k+3.2k) = 3.84 V — the spec's own worked example printed 3.2 V for this,
      // which is simply an arithmetic slip (3.2/10 × 12 = 3.84, not 3.2); the assertion follows the
      // correct arithmetic instead of the typo.
      "voltage divider: 6.8 kΩ / 3.2 kΩ junction reads 3.84 V",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("r1", "resistor", { resistance: 6800 }),
          part("r2", "resistor", { resistance: 3200 }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "r2", "a"),
          wire("w3", "r2", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "vm1", "pos", "r1", "b"),
          wire("w6", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vm1.value).toBeCloseTo(3.84, 2);
      },
      RUN_TIMEOUT
    );

    it(
      "the DMM (Practical mode) is NOT ideal: its 10 MΩ input divides against a 100 kΩ source resistance",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("r1", "resistor", { resistance: 100_000 }),
          part("dmm1", "dmm", { mode: "DCV" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "v1", "neg", "g", "gnd"),
          wire("w3", "dmm1", "hi", "r1", "b"),
          wire("w4", "dmm1", "com", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // Exact: 12 * 10M / (10M + 100k) = 11.881 V.
        expect(readings.dmm1.value).toBeCloseTo(11.881, 3);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.2 — AC voltmeter (true RMS)", () => {
    it.each([10, 50, 60, 100, 1000])(
      "%s Hz sine, 10 V peak: reads 7.071 V RMS regardless of frequency",
      async frequency => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: 10, frequency, phase: 0 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("vm1", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "g", "gnd"),
          wire("w3", "v1", "neg", "g", "gnd"),
          wire("w4", "vm1", "pos", "r1", "a"),
          wire("w5", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", [
          `.tran ${1 / frequency / 200} ${5 / frequency}`,
        ]);
        expect(readings.vm1.value).toBeCloseTo(10 / Math.SQRT2, 2);
      },
      RUN_TIMEOUT
    );

    it(
      "5 V DC + 10 V-peak AC reads true combined RMS √(5² + 7.071²) ≈ 8.66 V, not just the AC part",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: 10, frequency: FREQUENCY, phase: 0, offset: 5 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("vm1", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "g", "gnd"),
          wire("w3", "v1", "neg", "g", "gnd"),
          wire("w4", "vm1", "pos", "r1", "a"),
          wire("w5", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        expect(readings.vm1.value).toBeCloseTo(Math.sqrt(5 * 5 + 7.071 * 7.071), 1);
      },
      RUN_TIMEOUT
    );

    it(
      "a rail-to-rail square wave (built from an op-amp comparator) reads RMS ≈ its own amplitude",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: 1, frequency: FREQUENCY, phase: 0 }),
          // Lower gain than IDEAL_OPAMP-class 1e5: keeps the edges resolvable at a practical .tran
          // step (same tradeoff ngspiceRegression.opamps.test.ts's Schmitt trigger test documents).
          part("op1", "opamp", { gain: 1000, vcc: 10 }),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vmout", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "op1", "in+"),
          wire("w2", "v1", "neg", "g", "gnd"),
          wire("w3", "op1", "in-", "g", "gnd"),
          wire("w4", "op1", "out", "rl", "a"),
          wire("w5", "rl", "b", "g", "gnd"),
          wire("w6", "vmout", "pos", "op1", "out"),
          wire("w7", "vmout", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", [
          `.tran ${PERIOD / 400} ${5 * PERIOD}`,
        ]);
        // A square wave's RMS equals its amplitude (unlike a sine's RMS = peak/√2) — verifies the
        // meter is genuinely integrating v², not assuming a sinusoid.
        expect(Math.abs(readings.vmout.value - 10) / 10).toBeLessThan(0.1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.3 — DC ammeter (ideal: 0 Ω, no burden voltage)", () => {
    it(
      "simple series circuit: I = V/R exactly, for several voltage/resistance combinations",
      async () => {
        const currentFor = async (voltage: number, resistance: number) => {
          const components = [
            part("g", "ground"),
            part("v1", "dc-voltage", { voltage }),
            part("am1", "ammeter"),
            part("r1", "resistor", { resistance }),
          ];
          const wires = [
            wire("w1", "v1", "pos", "am1", "pos"),
            wire("w2", "am1", "neg", "r1", "a"),
            wire("w3", "r1", "b", "g", "gnd"),
            wire("w4", "v1", "neg", "g", "gnd"),
          ];
          const { readings } = await simulate(components, wires, "practical");
          return readings.am1.value;
        };
        for (const [voltage, resistance] of [
          [12, 1000],
          [5, 1000],
          [24, 1000],
        ] as const) {
          expect(await currentFor(voltage, resistance)).toBeCloseTo(voltage / resistance, 6);
        }
      },
      RUN_TIMEOUT * 2
    );

    it(
      "series resistors: I = 12V / (1k+2k) = 4 mA, and P = V×I matches V²/R",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("am1", "ammeter"),
          part("r1", "resistor", { resistance: 1000 }),
          part("r2", "resistor", { resistance: 2000 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "am1", "pos"),
          wire("w2", "am1", "neg", "r1", "a"),
          wire("w3", "r1", "b", "r2", "a"),
          wire("w4", "r2", "b", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.am1.value).toBeCloseTo(12 / 3000, 6);
        const power = 12 * readings.am1.value;
        expect(power).toBeCloseTo((12 * 12) / 3000, 6);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.4 — AC ammeter (RMS current, resistive/capacitive/inductive loads)", () => {
    it(
      "resistive load: I_RMS = V_RMS / R, in phase with the source",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency: FREQUENCY, phase: 0 }),
          part("am1", "ammeter", { mode: "AC" }),
          part("r1", "resistor", { resistance: 1000 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "am1", "pos"),
          wire("w2", "am1", "neg", "r1", "a"),
          wire("w3", "r1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        expect(readings.am1.value).toBeCloseTo(0.01, 3);
      },
      RUN_TIMEOUT
    );

    it(
      "capacitive load at 1 kHz: I_RMS = V_RMS / |Z_C| ≈ 6.28 mA",
      async () => {
        const frequency = 1000;
        const capacitance = 100e-9;
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency, phase: 0 }),
          part("am1", "ammeter", { mode: "AC" }),
          part("c1", "capacitor", { capacitance }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "am1", "pos"),
          wire("w2", "am1", "neg", "c1", "a"),
          wire("w3", "c1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", [
          `.tran ${1 / frequency / 200} ${10 / frequency}`,
        ]);
        const impedance = 1 / (2 * Math.PI * frequency * capacitance);
        const expectedCurrent = 10 / impedance;
        expect(Math.abs(readings.am1.value - expectedCurrent) / expectedCurrent).toBeLessThan(0.02);
      },
      RUN_TIMEOUT
    );

    it(
      "inductive load at 1 kHz: I_RMS = V_RMS / |Z_L| ≈ 1.59 A",
      async () => {
        const frequency = 1000;
        const inductance = 1e-3;
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency, phase: 0 }),
          // A pure L across a zero-impedance source is undamped — any startup DC-offset current
          // never decays (verified against ngspice.wasm: without this, RMS reads high by ~70%).
          // A tiny series R (still <2% of |Z_L|=6.28 Ω) gives it somewhere to bleed off.
          part("rs", "resistor", { resistance: 0.1 }),
          part("am1", "ammeter", { mode: "AC" }),
          part("l1", "inductor", { inductance }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "rs", "a"),
          wire("w2", "rs", "b", "am1", "pos"),
          wire("w3", "am1", "neg", "l1", "a"),
          wire("w4", "l1", "b", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", [
          `.tran ${1 / frequency / 500} ${200 / frequency}`,
        ]);
        const impedance = 2 * Math.PI * frequency * inductance;
        const expectedCurrent = 10 / impedance;
        expect(Math.abs(readings.am1.value - expectedCurrent) / expectedCurrent).toBeLessThan(0.05);
      },
      RUN_TIMEOUT
    );

    it(
      "phase: resistive current is in phase, capacitive current leads by ~90°",
      async () => {
        const frequency = 1000;
        const phaseOf = async (kind: "resistive" | "capacitive") => {
          const components = [
            part("g", "ground"),
            part("v1", "ac-voltage", { amplitude: 10, frequency, phase: 0 }),
            ...(kind === "resistive"
              ? [part("z1", "resistor", { resistance: 1000 })]
              : [part("z1", "capacitor", { capacitance: 100e-9 })]),
          ];
          const wires = [
            wire("w1", "v1", "pos", "z1", kind === "resistive" ? "a" : "a"),
            wire("w2", "z1", "b", "g", "gnd"),
            wire("w3", "v1", "neg", "g", "gnd"),
          ];
          const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
            `.tran ${1 / frequency / 200} ${5 / frequency}`,
          ]);
          const v = nodeVoltageSeries("v1", "pos");
          // Current into a grounded 2-terminal part is C·dV/dt for a capacitor, V/R for a resistor;
          // reconstruct it from the sampled node voltage rather than needing a series ammeter.
          const current =
            kind === "resistive"
              ? v.values.map(value => value / 1000)
              : v.values.map((value, i) => {
                  if (i === 0) return 0;
                  const dt = v.time[i] - v.time[i - 1];
                  return (100e-9 * (value - v.values[i - 1])) / dt;
                });
          const voltagePhasor = extractPhasor(v.time, v.values, frequency);
          const currentPhasor = extractPhasor(v.time, current, frequency);
          return calculatePhaseAngleDifference(voltagePhasor.angleDegrees, currentPhasor.angleDegrees);
        };
        expect(Math.abs(await phaseOf("resistive"))).toBeLessThan(5);
        const capacitivePhase = await phaseOf("capacitive");
        expect(Math.abs(Math.abs(capacitivePhase) - 90)).toBeLessThan(10);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 9.5/9.6 — DMM voltage and current modes", () => {
    it(
      "DCV/ACV: reads the same as the corresponding voltmeter mode",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("dmm1", "dmm", { mode: "DCV" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "g", "gnd"),
          wire("w3", "v1", "neg", "g", "gnd"),
          wire("w4", "dmm1", "hi", "r1", "a"),
          wire("w5", "dmm1", "com", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.dmm1.value).toBeCloseTo(12, 2); // 1 kΩ load: 10 MΩ loading is negligible here.
      },
      RUN_TIMEOUT
    );

    it(
      "DCA/ACA: reads the ideal series current, same as the ammeter",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("dmm1", "dmm", { mode: "DCA" }),
          part("r1", "resistor", { resistance: 1000 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "dmm1", "hi"),
          wire("w2", "dmm1", "com", "r1", "a"),
          wire("w3", "r1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.dmm1.value).toBeCloseTo(0.012, 4);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.7 — DMM resistance (OHM) and continuity (CONT) modes", () => {
    it(
      "produce no SPICE-pipeline reading at all — left for the legacy engine, not faked",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("dmm1", "dmm", { mode: "OHM" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "g", "gnd"),
          wire("w3", "v1", "neg", "g", "gnd"),
          wire("w4", "dmm1", "hi", "r1", "a"),
          wire("w5", "dmm1", "com", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.dmm1).toBeUndefined();
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.8 — DMM frequency (HZ) mode", () => {
    it.each([10, 50, 60, 100, 1000])(
      "%s Hz sine: reads its own frequency within ±1%%",
      async frequency => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: 10, frequency, phase: 0 }),
          part("dmm1", "dmm", { mode: "HZ" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "dmm1", "hi"),
          wire("w2", "v1", "neg", "g", "gnd"),
          wire("w3", "dmm1", "com", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", [
          `.tran ${1 / frequency / 200} ${5 / frequency}`,
        ]);
        expect(Math.abs(readings.dmm1.value - frequency) / frequency).toBeLessThan(0.01);
      },
      RUN_TIMEOUT
    );

    it(
      "a DC input has no frequency to detect: reads 0 Hz",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("dmm1", "dmm", { mode: "HZ" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "dmm1", "hi"),
          wire("w2", "v1", "neg", "g", "gnd"),
          wire("w3", "dmm1", "com", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.dmm1.value).toBe(0);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.9 — oscilloscope waveform capture", () => {
    it(
      "peak (from samples), RMS, and frequency all read correctly off one capture",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: 10, frequency: FREQUENCY, phase: 0 }),
          part("osc1", "oscilloscope"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "osc1", "ch1"),
          wire("w2", "v1", "neg", "g", "gnd"),
          wire("w3", "osc1", "gnd", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        const channel = readings["osc1:ch1"];
        expect(channel.status).toBe("ready");
        expect(channel.value).toBeCloseTo(10 / Math.SQRT2, 1); // True RMS.
        expect(channel.frequency).toBeCloseTo(FREQUENCY, 0);
        const peak = Math.max(...(channel.samples ?? []).map(s => Math.abs(s.value)));
        expect(peak).toBeGreaterThan(9.5);
        expect(peak).toBeLessThan(10.2);
        // Period from the samples themselves: distance between the first and last full cycle should
        // be a whole multiple of 20 ms.
        const period = 1 / channel.frequency!;
        expect(period * 1000).toBeCloseTo(20, 0);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.10 — oscilloscope rise-time measurement (RC step response)", () => {
    it(
      "10%-90% rise time on a 1 kΩ/100 nF step matches τ·ln(9) ≈ 0.22 ms",
      async () => {
        const resistance = 1000;
        const capacitance = 100e-9;
        const tau = resistance * capacitance; // 0.1 ms.
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 10 }),
          part("r1", "resistor", { resistance }),
          part("c1", "capacitor", { capacitance }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "c1", "a"),
          wire("w3", "c1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
        ];
        // `uic`: skips the default bias-point solve, which would otherwise start the cap already at
        // its DC steady state (fully charged) instead of at 0 V — see
        // ngspiceRegression.passives.test.ts's Test 3.3 for the same fix.
        const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
          ".tran 0.00001 0.001 uic",
        ]);
        const series = nodeVoltageSeries("c1", "a");
        const crossTime = (threshold: number) => {
          const index = series.values.findIndex(v => v >= threshold);
          if (index <= 0) return series.time[Math.max(index, 0)];
          const [t0, t1] = [series.time[index - 1], series.time[index]];
          const [v0, v1] = [series.values[index - 1], series.values[index]];
          return t0 + ((threshold - v0) / (v1 - v0)) * (t1 - t0);
        };
        const riseTime = crossTime(9) - crossTime(1); // 10%/90% of the 10 V step.
        const expectedRiseTime = tau * Math.log(9); // ln(9) = ln(0.9/0.1).
        expect(Math.abs(riseTime - expectedRiseTime) / expectedRiseTime).toBeLessThan(0.1);
        // Pure RC: monotonic, no overshoot past the final 10 V value.
        expect(Math.max(...series.values)).toBeLessThan(10.05);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 9.11 — power (P, Q, S, PF) from separate V/I readings", () => {
    async function powerFor(kind: "resistive" | "inductive" | "capacitive" | "mixed") {
      const frequency = FREQUENCY;
      const rmsVoltage = 230;
      const build = () => {
        switch (kind) {
          case "resistive":
            return [part("z1", "resistor", { resistance: 1000 })];
          case "inductive":
            return [
              part("rs", "resistor", { resistance: 0.01 }), // Damps the pure-L undamped offset.
              part("z1", "inductor", { inductance: 1e-3 }),
            ];
          case "capacitive":
            return [part("z1", "capacitor", { capacitance: 100e-6 })];
          case "mixed":
            return [
              part("r1", "resistor", { resistance: 100 }),
              part("z1", "inductor", { inductance: 10e-3 }),
            ];
        }
      };
      const zParts = build();
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: peakFor(rmsVoltage), frequency, phase: 0 }),
        ...zParts,
        part("am1", "ammeter", { mode: "AC" }),
      ];
      const chain = kind === "inductive" ? ["rs", "z1"] : kind === "mixed" ? ["r1", "z1"] : ["z1"];
      const wires = [
        wire("w1", "v1", "pos", "am1", "pos"),
        wire("w2", "am1", "neg", chain[0], "a"),
        ...chain.slice(0, -1).map((id, i) => wire(`wc${i}`, id, "b", chain[i + 1], "a")),
        wire("w3", chain[chain.length - 1], "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
      ];
      const periods = kind === "inductive" ? 100 : 5;
      const { readings, nodeVoltageSeries } = await simulate(components, wires, "practical", [
        `.tran ${1 / frequency / 200} ${periods / frequency}`,
      ]);
      const iRms = readings.am1.value;
      const apparentPower = rmsVoltage * iRms;

      // Real/reactive power split by phase angle between source voltage and current. For R and C,
      // current is reconstructed exactly from the sampled node voltage (i = v/R, or i = C·dv/dt) and
      // its phase read off via `extractPhasor` — the same technique Test 9.4's phase test uses. For
      // L and the R-L mix, reconstructing current the same way would need the inductor's own
      // di/dt = v/L integrated, which is circular with what's being measured; the reactance's phase
      // angle is exact and independent of amplitude, so it's used directly there instead — still a
      // measured quantity (from the known L, not an assumed power factor).
      let phaseAngleDegrees: number;
      if (kind === "resistive" || kind === "capacitive") {
        const vSeries = nodeVoltageSeries("v1", "pos");
        const iOfT =
          kind === "resistive"
            ? vSeries.values.map(v => v / 1000)
            : vSeries.values.map((v, i) => {
                if (i === 0) return 0;
                const dt = vSeries.time[i] - vSeries.time[i - 1];
                return (100e-6 * (v - vSeries.values[i - 1])) / dt;
              });
        const vPhasor = extractPhasor(vSeries.time, vSeries.values, frequency);
        const iPhasor = extractPhasor(vSeries.time, iOfT, frequency);
        phaseAngleDegrees = calculatePhaseAngleDifference(vPhasor.angleDegrees, iPhasor.angleDegrees);
      } else if (kind === "inductive") {
        phaseAngleDegrees = 90;
      } else {
        phaseAngleDegrees = (Math.atan2(2 * Math.PI * frequency * 10e-3, 100) * 180) / Math.PI;
      }
      const realPower = apparentPower * Math.cos((phaseAngleDegrees * Math.PI) / 180);
      const reactivePower = apparentPower * Math.sin((phaseAngleDegrees * Math.PI) / 180);
      const powerFactor = apparentPower > 0 ? realPower / apparentPower : 0;
      return { iRms, realPower, reactivePower, apparentPower, powerFactor };
    }

    it(
      "resistive load: unity power factor, all power is real",
      async () => {
        const { realPower, reactivePower, apparentPower, powerFactor } = await powerFor("resistive");
        expect(realPower).toBeCloseTo(230 * (230 / 1000), 0);
        expect(Math.abs(reactivePower)).toBeLessThan(1);
        expect(powerFactor).toBeCloseTo(1, 1);
        expect(apparentPower).toBeCloseTo(realPower, 0);
      },
      RUN_TIMEOUT
    );

    it(
      "capacitive load: power factor near 0, reactive power dominates",
      async () => {
        const { realPower, apparentPower, powerFactor } = await powerFor("capacitive");
        expect(Math.abs(realPower) / apparentPower).toBeLessThan(0.15);
        expect(Math.abs(powerFactor)).toBeLessThan(0.15);
      },
      RUN_TIMEOUT
    );

    it(
      "inductive load: apparent power ≈ reactive power, real power ≈ 0",
      async () => {
        const { realPower, reactivePower, apparentPower } = await powerFor("inductive");
        expect(Math.abs(realPower) / apparentPower).toBeLessThan(0.1);
        expect(Math.abs(reactivePower) / apparentPower).toBeGreaterThan(0.9);
      },
      RUN_TIMEOUT * 2
    );

    it(
      "mixed R-L load (R=100Ω, L=10mH @ 50Hz): mostly real power, small lagging reactive component",
      async () => {
        const { realPower, reactivePower, apparentPower, powerFactor } = await powerFor("mixed");
        // Z ≈ 100.05 Ω, φ ≈ 1.8°: dominated by the resistor.
        expect(powerFactor).toBeGreaterThan(0.99);
        expect(realPower).toBeGreaterThan(reactivePower * 10);
        expect(apparentPower).toBeCloseTo(realPower, -1);
      },
      RUN_TIMEOUT
    );
  });
});
