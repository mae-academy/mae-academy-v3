/**
 * Real ngspice.wasm coverage for DC/AC current sources — `spiceAdapter.ts` used to reject both with
 * `{ unsupported: "current sources are not in the SPICE component set" }`, silently falling back to
 * the legacy engine for any circuit that placed one. SPICE's `I` element is a two-line addition once
 * `ac-voltage`'s DC/AC/SIN/PULSE machinery already exists (see spiceTypes.ts, netlistGenerator.ts,
 * spiceAdapter.ts) — this file is the same "known circuit, checked against real ngspice" rigor the
 * voltage-source waveform work got, not just a netlist-text assertion.
 */
import { describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

describe("DC/AC current sources (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "DC current source into a resistor: V = I×R (2A into 10Ω = 20V)",
    async () => {
      const components = [
        part("g", "ground"),
        part("i1", "dc-current", { current: 2 }),
        part("r1", "resistor", { resistance: 10 }),
      ];
      const wires = [
        wire("w1", "i1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "g", "gnd"),
        wire("w3", "i1", "neg", "g", "gnd"),
      ];
      const { nodeVoltage } = await simulate(components, wires, "practical");
      expect(nodeVoltage("r1", "a")).toBeCloseTo(20, 1);
    },
    RUN_TIMEOUT
  );

  it(
    "AC current source, phase 0, into a resistor: peaks at I×R and settles to that RMS",
    async () => {
      const components = [
        part("g", "ground"),
        part("i1", "ac-current", { amplitude: 2, frequency: 1000, offset: 0 }),
        part("r1", "resistor", { resistance: 10 }),
        part("vm1", "voltmeter", { mode: "AC" }),
      ];
      const wires = [
        wire("w1", "i1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "g", "gnd"),
        wire("w3", "i1", "neg", "g", "gnd"),
        wire("w4", "r1", "a", "vm1", "pos"),
        wire("w5", "vm1", "neg", "g", "gnd"),
      ];
      const { readings, nodeVoltageAt } = await simulate(components, wires, "practical", [
        ".tran 1e-6 0.003",
      ]);
      // 2A peak into 10Ω peaks at 20V; a moment after t=0 (phase 0, so starting near its rise)
      // should already be well above zero, distinct from a source that failed to drive anything.
      expect(nodeVoltageAt("r1", "a", 0.00025)).toBeGreaterThan(15);
      // True RMS over whole periods: 20V peak / √2.
      expect(readings.vm1.status).toBe("ready");
      expect(readings.vm1.value).toBeCloseTo(20 / Math.SQRT2, 0);
    },
    RUN_TIMEOUT
  );

  it(
    "AC current source respects its waveform selection (square, into a resistor, via an oscilloscope reading)",
    async () => {
      const components = [
        part("g", "ground"),
        part("i1", "ac-current", { waveform: "square", amplitude: 1, frequency: 500, offset: 0 }),
        part("r1", "resistor", { resistance: 5 }),
        part("osc1", "oscilloscope", { timeDiv_ch1: 2e-4, voltDiv_ch1: 1 }),
      ];
      const wires = [
        wire("w1", "i1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "g", "gnd"),
        wire("w3", "i1", "neg", "g", "gnd"),
        wire("w4", "osc1", "ch1", "r1", "a"),
        wire("w5", "osc1", "gnd", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical", [".tran 2e-6 0.004"]);
      const reading = readings["osc1:ch1"];
      expect(reading.status).toBe("ready");
      // 1A square wave into 5Ω: ±5V square, whose RMS equals its own peak amplitude (50% duty).
      expect(reading.value).toBeCloseTo(5, 0);
    },
    RUN_TIMEOUT
  );
});
