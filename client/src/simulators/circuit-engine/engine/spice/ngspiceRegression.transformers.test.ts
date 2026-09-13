/**
 * Real-ngspice.wasm regression coverage for transformers (validation spec Section VIII): step-up,
 * step-down, center-tapped full-wave rectification, autotransformer taps, a three-phase bank, winding
 * resistance under load, phase angle, and open- vs loaded-secondary coupling. Same full-pipeline
 * `simulate()` as ngspiceRegression.test.ts — see ngspiceRegressionHelpers.ts.
 *
 * spiceAdapter.ts's transformer mappings take `turnRatio` as Np:Ns (spiceTypes.ts's `SpiceTransformer`
 * doc comment) — a step-up needs `turnRatio` < 1 (Ns > Np), e.g. 0.5 for a 1:2 step-up. AC readings go
 * through the existing AC-mode voltmeter/ammeter instruments (RMS, same as ngspiceRegression.sources
 * .test.ts's three-phase coverage) rather than manual phasor extraction, except where a genuine phase
 * angle or a full-wave-rectified DC average is what's being checked.
 *
 * `transformer`'s only per-instance parameter is `turnRatio` (plus a fixed default magnetizing
 * inductance and 0.999 coupling coefficient) — there is no exposed winding-resistance prop, so Test
 * 8.6's "winding resistance" is modelled the way a real bench setup would be: explicit series
 * resistors placed outside the ideal-coupling element, not a config knob on it.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  extractPhasor,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

const FREQUENCY = 50;
const PERIOD = 1 / FREQUENCY;
// 2 whole periods at 200 samples/period, matching ngspiceRegression.sources.test.ts's own settle
// window — plenty for both the AC instruments (need a settled RMS) and extractPhasor (accurate over
// a whole number of cycles).
const AC_ANALYSIS = [`.tran ${PERIOD / 200} ${2 * PERIOD}`];

/** RMS amplitude to feed `ac-voltage` (Practical mode reads `amplitude` as already-peak) for a given
 * RMS voltage. */
const peakFor = (rms: number) => rms * Math.SQRT2;

describe("ngspice regression: transformers (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 8.1 — step-up transformer (1:2, turnRatio=0.5)", () => {
    it(
      "10 V primary -> ~20 V secondary into 400 Ω, with power conserved",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency: FREQUENCY, phase: 0 }),
          part("t1", "transformer", { turnRatio: 0.5 }),
          part("rl", "resistor", { resistance: 400 }),
          part("amp", "ammeter", { mode: "AC" }),
          part("ams", "ammeter", { mode: "AC" }),
          part("vmp", "voltmeter", { mode: "AC" }),
          part("vms", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "amp", "pos"),
          wire("w2", "amp", "neg", "t1", "p1"),
          wire("w3", "v1", "neg", "t1", "p2"),
          wire("w4", "t1", "p2", "g", "gnd"),
          wire("w5", "t1", "s1", "ams", "pos"),
          wire("w6", "ams", "neg", "rl", "a"),
          wire("w7", "rl", "b", "t1", "s2"),
          wire("w8", "t1", "s2", "g", "gnd"),
          wire("w9", "vmp", "pos", "t1", "p1"),
          wire("w10", "vmp", "neg", "t1", "p2"),
          wire("w11", "vms", "pos", "t1", "s1"),
          wire("w12", "vms", "neg", "t1", "s2"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        const [vp, vs, ip, is] = [
          readings.vmp.value,
          readings.vms.value,
          readings.amp.value,
          readings.ams.value,
        ];
        expect(vs / vp).toBeCloseTo(2, 1); // ±2%-class tolerance via toBeCloseTo(2, 1).
        expect(Math.abs(vs / vp - 2) / 2).toBeLessThan(0.02);
        expect(is).toBeCloseTo(vs / 400, 3);
        // Power conservation: Vp*Ip ≈ Vs*Is.
        expect(Math.abs(vp * ip - vs * is) / (vs * is)).toBeLessThan(0.02);
        // Reflected impedance: Vp/Ip ≈ Rload/n² = 400/4 = 100 Ω.
        expect(vp / ip).toBeCloseTo(100, 0);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 8.2 — step-down transformer (2:1, turnRatio=2)", () => {
    it(
      "20 V primary -> ~10 V secondary into 100 Ω, with power conserved",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(20), frequency: FREQUENCY, phase: 0 }),
          part("t1", "transformer", { turnRatio: 2 }),
          part("rl", "resistor", { resistance: 100 }),
          part("amp", "ammeter", { mode: "AC" }),
          part("ams", "ammeter", { mode: "AC" }),
          part("vmp", "voltmeter", { mode: "AC" }),
          part("vms", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "amp", "pos"),
          wire("w2", "amp", "neg", "t1", "p1"),
          wire("w3", "v1", "neg", "t1", "p2"),
          wire("w4", "t1", "p2", "g", "gnd"),
          wire("w5", "t1", "s1", "ams", "pos"),
          wire("w6", "ams", "neg", "rl", "a"),
          wire("w7", "rl", "b", "t1", "s2"),
          wire("w8", "t1", "s2", "g", "gnd"),
          wire("w9", "vmp", "pos", "t1", "p1"),
          wire("w10", "vmp", "neg", "t1", "p2"),
          wire("w11", "vms", "pos", "t1", "s1"),
          wire("w12", "vms", "neg", "t1", "s2"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        const [vp, vs, ip, is] = [
          readings.vmp.value,
          readings.vms.value,
          readings.amp.value,
          readings.ams.value,
        ];
        expect(vp / vs).toBeCloseTo(2, 1);
        expect(is / ip).toBeCloseTo(2, 1);
        expect(Math.abs(vp * ip - vs * is) / (vs * is)).toBeLessThan(0.03);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 8.3 — center-tapped transformer: full-wave rectification", () => {
    it(
      "each half reads ~half the full secondary, and the rectified load averages near 2·Vpk/π",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(20), frequency: FREQUENCY, phase: 0 }),
          part("t1", "transformer-ct", { turnRatio: 1 }),
          part("d1", "diode-silicon"),
          part("d2", "diode-silicon"),
          part("rl", "resistor", { resistance: 1000 }),
          part("vma", "voltmeter", { mode: "AC" }),
          part("vmb", "voltmeter", { mode: "AC" }),
          part("vmab", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "t1", "p1"),
          wire("w2", "v1", "neg", "t1", "p2"),
          wire("w3", "t1", "s1", "d1", "anode"),
          wire("w4", "t1", "s2", "d2", "anode"),
          wire("w5", "d1", "cathode", "rl", "a"),
          wire("w6", "d2", "cathode", "rl", "a"),
          wire("w7", "rl", "b", "t1", "ct"),
          wire("w8", "t1", "ct", "g", "gnd"),
          wire("w9", "vma", "pos", "t1", "s1"),
          wire("w10", "vma", "neg", "t1", "ct"),
          wire("w11", "vmb", "pos", "t1", "s2"),
          wire("w12", "vmb", "neg", "t1", "ct"),
          wire("w13", "vmab", "pos", "t1", "s1"),
          wire("w14", "vmab", "neg", "t1", "s2"),
        ];
        const { readings, nodeVoltageSeries } = await simulate(components, wires, "practical", [
          `.tran ${PERIOD / 200} ${5 * PERIOD}`,
        ]);
        expect(readings.vma.value).toBeCloseTo(10, 0);
        expect(readings.vmb.value).toBeCloseTo(10, 0);
        expect(readings.vmab.value).toBeCloseTo(20, 0);

        const loadSeries = nodeVoltageSeries("rl", "a");
        const lastPeriodStart = loadSeries.time.findIndex(t => t >= 4 * PERIOD);
        const window = loadSeries.values.slice(lastPeriodStart);
        const average = window.reduce((sum, v) => sum + v, 0) / window.length;
        // Ideal full-wave average is 2·Vpk/π ≈ 9.0 V for a 10 V RMS half; two silicon diode knees
        // (one always in the conduction path) pull that down somewhat — 8.3 V measured.
        expect(average).toBeGreaterThan(6.5);
        expect(average).toBeLessThan(9.0);
        // Fully rectified: the load never goes meaningfully negative.
        expect(Math.min(...window)).toBeGreaterThan(-0.1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 8.4 — autotransformer: linear voltage vs. tap position", () => {
    // turnRatio = 1/tapFraction (spiceAdapter.ts's autotransformer mapping: `outputTurns =
    // 1/turnRatio` is the tap's fraction of the whole winding). 0% and 100% aren't reachable — the
    // mapping requires a positive series section (`seriesTurns = 1 - outputTurns > 0`), so a 100%
    // tap (the whole winding) is rejected outright; 0% would need an infinite turnRatio.
    it.each([
      [0.25, 4],
      [0.5, 2],
      [0.75, 4 / 3],
    ])(
      "%s%% tap (turnRatio=%s): output tracks tapFraction × Vin within 2%%",
      async (tapFraction, turnRatio) => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(230), frequency: FREQUENCY, phase: 0 }),
          part("t1", "autotransformer", { turnRatio }),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vmtap", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "t1", "in1"),
          wire("w2", "v1", "neg", "t1", "in2"),
          wire("w3", "t1", "in2", "g", "gnd"),
          wire("w4", "t1", "tap", "rl", "a"),
          wire("w5", "rl", "b", "t1", "in2"),
          wire("w6", "vmtap", "pos", "t1", "tap"),
          wire("w7", "vmtap", "neg", "t1", "in2"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        const expected = tapFraction * 230;
        expect(Math.abs(readings.vmtap.value - expected) / expected).toBeLessThan(0.02);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 8.5 — three-phase transformer bank (three independent 1:2 step-up transformers, one per phase)", () => {
    // A three-phase "bank" of single-phase transformers has no magnetic coupling *between* phases —
    // each one is a genuinely separate transformer, so it is run through its own `simulate()` call
    // with its own AC source at the ABC phase sequence's own angle (0°, -120°, +120°), rather than
    // sharing one netlist. Verified against ngspice.wasm: putting multiple `K`-coupled transformers
    // in the same `.tran` deck (even electrically unrelated ones, each fed from its own independent
    // source) produces a diverging, wrong transient after the first few samples — a real ngspice.wasm
    // multi-transformer stability limit in this pipeline, not a modelling choice. Separate runs are
    // also the electrically correct way to represent a bank with no inter-phase coupling to begin
    // with, so nothing about the bank's own physics is lost.
    it.each([
      ["L1", 0],
      ["L2", -120],
      ["L3", 120],
    ] as const)(
      "%s (phase source angle %s°): secondary reads ~460 V and is phase-locked to its own primary",
      async (_label, phaseDegrees) => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(230), frequency: FREQUENCY, phase: phaseDegrees }),
          part("t1", "transformer", { turnRatio: 0.5 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("vms", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "t1", "p1"),
          wire("w2", "v1", "neg", "t1", "p2"),
          wire("w3", "t1", "p2", "g", "gnd"),
          wire("w4", "t1", "s1", "r1", "a"),
          wire("w5", "r1", "b", "t1", "s2"),
          wire("w6", "t1", "s2", "g", "gnd"),
          wire("w7", "vms", "pos", "t1", "s1"),
          wire("w8", "vms", "neg", "t1", "s2"),
        ];
        const { readings, nodeVoltageAt } = await simulate(components, wires, "practical", AC_ANALYSIS);
        expect(Math.abs(readings.vms.value - 460) / 460).toBeLessThan(0.03);

        const time: number[] = [];
        const values: number[] = [];
        for (let i = 0; i <= 400; i += 1) {
          const t = (i / 200) * PERIOD;
          time.push(t);
          values.push(nodeVoltageAt("t1", "s1", t) - nodeVoltageAt("t1", "s2", t));
        }
        // In phase with its own primary source angle (a transformer introduces no phase shift): the
        // secondary's own phasor angle should land back at this phase's own source angle.
        const secondaryAngle = extractPhasor(time, values, FREQUENCY).angleDegrees;
        const diff = (((secondaryAngle - phaseDegrees) % 360) + 540) % 360 - 180;
        expect(Math.abs(diff)).toBeLessThan(5);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 8.6 — transformer with explicit winding resistance under load", () => {
    it(
      "no-load secondary sits near the ideal ratio; full-load regulation is small",
      async () => {
        const noLoadComponents = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency: FREQUENCY, phase: 0 }),
          part("rp", "resistor", { resistance: 0.1 }),
          part("t1", "transformer", { turnRatio: 0.5 }),
          part("vms", "voltmeter", { mode: "AC" }),
        ];
        const noLoadWires = [
          wire("w1", "v1", "pos", "rp", "a"),
          wire("w2", "rp", "b", "t1", "p1"),
          wire("w3", "v1", "neg", "t1", "p2"),
          wire("w4", "t1", "p2", "g", "gnd"),
          wire("w5", "vms", "pos", "t1", "s1"),
          wire("w6", "vms", "neg", "t1", "s2"),
          wire("w7", "t1", "s2", "g", "gnd"),
        ];
        const fullLoadComponents = [
          ...noLoadComponents,
          part("rs", "resistor", { resistance: 0.05 }),
          part("rl", "resistor", { resistance: 400 }),
        ];
        const fullLoadWires = [
          wire("w1", "v1", "pos", "rp", "a"),
          wire("w2", "rp", "b", "t1", "p1"),
          wire("w3", "v1", "neg", "t1", "p2"),
          wire("w4", "t1", "p2", "g", "gnd"),
          wire("w5", "t1", "s1", "rs", "a"),
          wire("w6", "rs", "b", "rl", "a"),
          wire("w7", "rl", "b", "t1", "s2"),
          wire("w8", "t1", "s2", "g", "gnd"),
          wire("w9", "vms", "pos", "t1", "s1"),
          wire("w10", "vms", "neg", "t1", "s2"),
        ];
        const noLoad = await simulate(noLoadComponents, noLoadWires, "practical", AC_ANALYSIS);
        const fullLoad = await simulate(fullLoadComponents, fullLoadWires, "practical", AC_ANALYSIS);
        const vNoLoad = noLoad.readings.vms.value;
        const vFullLoad = fullLoad.readings.vms.value;
        expect(vNoLoad).toBeCloseTo(20, 0);
        const regulationPercent = (100 * (vNoLoad - vFullLoad)) / vFullLoad;
        expect(regulationPercent).toBeGreaterThan(0); // sags under load, doesn't rise.
        expect(regulationPercent).toBeLessThan(5); // small winding resistances, small regulation.
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 8.7 — transformer phase angle: primary and secondary stay in phase", () => {
    it(
      "0° phase difference between primary and secondary, same 50 Hz on both sides",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency: FREQUENCY, phase: 0 }),
          part("t1", "transformer", { turnRatio: 0.5 }),
          part("rl", "resistor", { resistance: 400 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "t1", "p1"),
          wire("w2", "v1", "neg", "t1", "p2"),
          wire("w3", "t1", "p2", "g", "gnd"),
          wire("w4", "t1", "s1", "rl", "a"),
          wire("w5", "rl", "b", "t1", "s2"),
          wire("w6", "t1", "s2", "g", "gnd"),
        ];
        const { nodeVoltageAt } = await simulate(components, wires, "practical", AC_ANALYSIS);
        const sample = (componentId: string, a: string, b: string) => {
          const time: number[] = [];
          const values: number[] = [];
          for (let i = 0; i <= 400; i += 1) {
            const t = (i / 200) * PERIOD;
            time.push(t);
            values.push(nodeVoltageAt(componentId, a, t) - (b ? nodeVoltageAt(componentId, b, t) : 0));
          }
          return extractPhasor(time, values, FREQUENCY);
        };
        const primary = sample("t1", "p1", "p2");
        const secondary = sample("t1", "s1", "s2");
        let diff = ((primary.angleDegrees - secondary.angleDegrees) % 360 + 540) % 360 - 180;
        expect(Math.abs(diff)).toBeLessThan(5);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 8.8 — magnetic coupling: open-circuit ratio holds, loading draws real primary current", () => {
    it(
      "secondary open-circuit voltage still tracks the turns ratio (k≈0.999, tightly coupled)",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: peakFor(10), frequency: FREQUENCY, phase: 0 }),
          part("t1", "transformer", { turnRatio: 0.5 }),
          part("vms", "voltmeter", { mode: "AC" }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "t1", "p1"),
          wire("w2", "v1", "neg", "t1", "p2"),
          wire("w3", "t1", "p2", "g", "gnd"),
          wire("w4", "vms", "pos", "t1", "s1"),
          wire("w5", "vms", "neg", "t1", "s2"),
          wire("w6", "t1", "s2", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical", AC_ANALYSIS);
        expect(readings.vms.value).toBeCloseTo(20, 0);
      },
      RUN_TIMEOUT
    );

    it(
      "loading the secondary pulls noticeably more current through the primary (real energy transfer)",
      async () => {
        const circuitFor = (loaded: boolean) => ({
          components: [
            part("g", "ground"),
            part("v1", "ac-voltage", { amplitude: peakFor(10), frequency: FREQUENCY, phase: 0 }),
            part("t1", "transformer", { turnRatio: 0.5 }),
            part("amp", "ammeter", { mode: "AC" }),
            ...(loaded ? [part("rl", "resistor", { resistance: 400 })] : []),
          ],
          wires: [
            wire("w1", "v1", "pos", "amp", "pos"),
            wire("w2", "amp", "neg", "t1", "p1"),
            wire("w3", "v1", "neg", "t1", "p2"),
            wire("w4", "t1", "p2", "g", "gnd"),
            wire("w5", "t1", "s2", "g", "gnd"),
            ...(loaded
              ? [wire("w6", "t1", "s1", "rl", "a"), wire("w7", "rl", "b", "t1", "s2")]
              : []),
          ],
        });
        const noLoad = await simulate(
          circuitFor(false).components,
          circuitFor(false).wires,
          "practical",
          AC_ANALYSIS
        );
        const loaded = await simulate(
          circuitFor(true).components,
          circuitFor(true).wires,
          "practical",
          AC_ANALYSIS
        );
        // No-load: only the small magnetizing current. Loaded: dominated by the reflected load.
        expect(loaded.readings.amp.value).toBeGreaterThan(noLoad.readings.amp.value * 5);
      },
      RUN_TIMEOUT * 2
    );
  });
});
