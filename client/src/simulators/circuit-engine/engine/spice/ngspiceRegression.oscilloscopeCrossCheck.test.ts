/**
 * "SPICE solves the physics, the oscilloscope just reduces the samples it's given — verify that
 * reduction independently" — but through the *real* pipeline this time: an actual oscilloscope
 * component wired onto a real circuit, run through `simulate()` (convertToSpiceComponents ->
 * generateNetlist -> ngspice -> parseSpiceResults -> buildSpiceInstrumentReadings), so
 * `readings["osc1:ch1"].value`/`.frequency` are exactly what a student would see on the canvas
 * widget — not a synthetic array standing in for one.
 *
 * oscilloscopeMeasurements.test.ts already cross-checks calculateVdc/calculateVpp against naive
 * reference implementations on synthetic sample data, with full control over sample spacing to
 * demonstrate exactly when time-weighting matters. This file re-runs that same cross-check against
 * *real* ngspice.wasm output, to confirm the synthetic case (adaptive-timestep bias) actually shows
 * up on a genuine transient, not just a constructed example.
 */
import { describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { calculateVdc, calculateVpp } from "@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements";
import type { SamplePoint } from "@shared/circuit/circuitTypes";

/** Independent, naive references — deliberately not importing anything from spiceParser.ts or
 * oscilloscopeMeasurements.ts, so a bug shared between the production code and its own test
 * wouldn't hide here too. */
function naiveRms(samples: SamplePoint[]): number {
  const sumSquares = samples.reduce((sum, sample) => sum + sample.value * sample.value, 0);
  return Math.sqrt(sumSquares / samples.length);
}

function naiveMean(samples: SamplePoint[]): number {
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
}

function naivePeakToPeak(samples: SamplePoint[]): number {
  const values = samples.map(sample => sample.value);
  return Math.max(...values) - Math.min(...values);
}

/** Simple average-period zero-crossing frequency — no hysteresis, no fractional-sample
 * interpolation, unlike the production getFrequency it's being compared against. */
function naiveFrequency(samples: SamplePoint[], centerValue: number): number {
  const crossingTimes: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prevDiff = samples[i - 1].value - centerValue;
    const currDiff = samples[i].value - centerValue;
    if (prevDiff <= 0 && currDiff > 0) crossingTimes.push(samples[i].time);
  }
  if (crossingTimes.length < 2) return 0;
  const span = crossingTimes[crossingTimes.length - 1] - crossingTimes[0];
  return (crossingTimes.length - 1) / span;
}

describe("Oscilloscope measurement cross-check against real ngspice.wasm output", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, WASM_BOOT_TIMEOUT);

  it(
    "RC low-pass at fc, read through a real oscilloscope component: production Vrms/frequency agree with independent naive calculations on the same samples",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: 1, frequency: 1000, offset: 0 }),
        part("r1", "resistor", { resistance: 10_000 }),
        part("c1", "capacitor", { capacitance: 15.9e-9 }),
        part("osc1", "oscilloscope", { timeDiv_ch1: 1e-4, voltDiv_ch1: 0.2 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "c1", "a"),
        wire("w3", "c1", "b", "g", "gnd"),
        wire("w4", "v1", "neg", "g", "gnd"),
        wire("w5", "osc1", "ch1", "c1", "a"),
        wire("w6", "osc1", "gnd", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical", [".tran 2u 0.01"]);

      const reading = readings["osc1:ch1"];
      expect(reading.status).toBe("ready");
      const samples = reading.samples ?? [];
      expect(samples.length).toBeGreaterThan(1000);

      // Vrms: -3dB point, both methods should land near 0.5V for a 1V input at fc.
      const direct = naiveRms(samples);
      expect(reading.value).toBeCloseTo(0.5, 1);
      expect(direct).toBeCloseTo(0.5, 1);
      expect(Math.abs(reading.value - direct)).toBeLessThan(0.05);

      // Frequency: both methods should agree closely on a clean, densely-sampled sine.
      const directFreq = naiveFrequency(samples, 0);
      expect(reading.frequency).toBeCloseTo(1000, -1);
      expect(Math.abs((reading.frequency ?? 0) - directFreq)).toBeLessThan(15);

      // Vpp and Vdc computed by the oscilloscope's own display code (calculateVpp/calculateVdc),
      // run on the real samples this time, cross-checked against naive references.
      const vpp = calculateVpp(samples);
      const vdc = calculateVdc(samples);
      expect(Math.abs(vpp - naivePeakToPeak(samples))).toBeLessThan(1e-9); // same algorithm — exact
      expect(vdc).toBeCloseTo(0, 1); // no DC offset in this circuit
      expect(Math.abs(vdc - naiveMean(samples))).toBeLessThan(0.05); // steady dense sine: both agree
    },
    RUN_TIMEOUT
  );

  it(
    "RLC underdamped step, read through a real oscilloscope component: calculateVdc's time-weighting measurably diverges from a naive mean on real adaptive-timestep output",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "dc-voltage", { voltage: 10 }),
        part("r1", "resistor", { resistance: 6 }),
        part("l1", "inductor", { inductance: 10e-3 }),
        part("c1", "capacitor", { capacitance: 100e-6 }),
        part("osc1", "oscilloscope", { timeDiv_ch1: 0.005, voltDiv_ch1: 2 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "l1", "a"),
        wire("w3", "l1", "b", "c1", "a"),
        wire("w4", "c1", "b", "g", "gnd"),
        wire("w5", "v1", "neg", "g", "gnd"),
        wire("w6", "osc1", "ch1", "c1", "a"),
        wire("w7", "osc1", "gnd", "g", "gnd"),
      ];
      // `uic`: capacitor/inductor start at 0, so the already-10V DC source produces a genuine step.
      const { readings } = await simulate(components, wires, "practical", [".tran 0.00002 0.05 uic"]);

      const reading = readings["osc1:ch1"];
      expect(reading.status).toBe("ready");
      const samples = reading.samples ?? [];
      expect(samples.length).toBeGreaterThan(500);

      // Real ngspice output confirms the overshoot this circuit is chosen for (ζ≈0.3, R/2·√(C/L)).
      expect(Math.max(...samples.map(s => s.value))).toBeGreaterThan(12.5);

      const weighted = calculateVdc(samples);
      const naive = naiveMean(samples);
      // Both land in the neighborhood of the 10V final value...
      expect(weighted).toBeCloseTo(10, 0);
      // ...but ngspice's adaptive timestep clusters far more samples on the fast initial rise/ring
      // than on the long flat settle afterward, so the naive mean is measurably pulled away from 10V
      // while the time-weighted calculateVdc isn't — the same effect demonstrated with a constructed
      // sample set in oscilloscopeMeasurements.test.ts, now shown on genuine solver output.
      expect(Math.abs(naive - 10)).toBeGreaterThan(Math.abs(weighted - 10));
    },
    RUN_TIMEOUT
  );
});
