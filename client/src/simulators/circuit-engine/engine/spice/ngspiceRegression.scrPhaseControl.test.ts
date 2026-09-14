/**
 * Real ngspice.wasm coverage for SCR (thyristor) half-wave phase control — the "advanced" wishlist
 * asked for this as an interactive gate-delay sweep with a live oscilloscope/DMM API that doesn't
 * exist here; what's real and buildable is the actual power-electronics behavior: a gate-triggered
 * SCR (real component, real subcircuit macro — see spiceAdapter.ts's "scr" case) firing at a chosen
 * delay angle within each AC half-cycle, driven by a periodic gate pulse train, verified against
 * real solver output rather than the textbook firing-angle formula alone.
 */
import { describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

const PEAK = 230;
const FREQUENCY = 50;
const PERIOD = 1 / FREQUENCY;

/** A gate-trigger voltage source, delayed by `delayFraction` of one period into each cycle — a
 * short pulse each period is enough: once it fires the SCR latches on for the rest of that
 * half-cycle and turns itself off at the next current zero-crossing, same as a real thyristor. */
function gateDrive(delayFraction: number): Record<string, unknown> {
  return {
    waveform: "square",
    amplitude: 1.5, // 0-3V pulse; well above the SCR's default 1.5V gate trigger voltage
    offset: 1.5,
    frequency: FREQUENCY,
    // The square-wave phase convention here (see netlistGenerator.ts's pulseParameters) makes
    // phase 0 start high; -delayFraction*360 pushes that "high" start later into the cycle instead.
    phase: -delayFraction * 360,
  };
}

function circuit(delayFraction: number) {
  const components = [
    part("g", "ground"),
    part("v1", "ac-voltage", { amplitude: PEAK, frequency: FREQUENCY, offset: 0 }),
    part("scr1", "scr"),
    part("r1", "resistor", { resistance: 100 }),
    part("vg1", "ac-voltage", gateDrive(delayFraction)),
  ];
  const wires = [
    wire("w1", "v1", "pos", "scr1", "anode"),
    wire("w2", "scr1", "cathode", "r1", "a"),
    wire("w3", "r1", "b", "g", "gnd"),
    wire("w4", "v1", "neg", "g", "gnd"),
    wire("w5", "vg1", "pos", "scr1", "gate"),
    wire("w6", "vg1", "neg", "scr1", "cathode"),
  ];
  return { components, wires };
}

describe("SCR half-wave phase control (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "fired near the start of the positive half-cycle (small delay): conducts for nearly the whole half-cycle",
    async () => {
      const { components, wires } = circuit(0.02); // fire 2% into the period — early in the half-cycle
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [`.tran 20e-6 ${5 * PERIOD}`]);
      const load = (t: number) => nodeVoltageAt("r1", "a", t);
      // Sampled at the sine's own peak (t = 0.25·T into a cycle starting at 4T), well after the
      // early firing point: the SCR should already be conducting and tracking the input, whose
      // instantaneous value there is its full 230V peak (not just "high" — the *maximum* possible).
      const cycleStart = 4 * PERIOD;
      expect(load(cycleStart + 0.25 * PERIOD)).toBeGreaterThan(200);
    },
    RUN_TIMEOUT
  );

  it(
    "fired mid-way through the positive half-cycle: blocks (0V) before firing, conducts after",
    async () => {
      const { components, wires } = circuit(0.25); // fire at the 90° point of the AC cycle
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [`.tran 20e-6 ${5 * PERIOD}`]);
      const load = (t: number) => nodeVoltageAt("r1", "a", t);
      const cycleStart = 4 * PERIOD;

      // Before the 90° firing point (e.g. at 10° in): input is positive but the SCR hasn't been
      // gated yet, so it blocks — load should read essentially 0V, not the source's own value.
      expect(Math.abs(load(cycleStart + PERIOD * (10 / 360)))).toBeLessThan(5);

      // Shortly after firing (e.g. at 150°, still within the same positive half-cycle): conducting.
      expect(load(cycleStart + PERIOD * (150 / 360))).toBeGreaterThan(100);
    },
    RUN_TIMEOUT
  );

  it(
    "later firing angle produces a lower time-averaged output than an earlier one — the whole point of phase control",
    async () => {
      const early = circuit(0.05); // ~18°
      const late = circuit(0.4); // ~144°
      const [earlyRun, lateRun] = await Promise.all([
        simulate(early.components, early.wires, "practical", [`.tran 20e-6 ${5 * PERIOD}`]),
        simulate(late.components, late.wires, "practical", [`.tran 20e-6 ${5 * PERIOD}`]),
      ]);
      // Average the load voltage over one full late cycle (window 4T to 5T) for both runs — coarse
      // sampling is enough since this only needs to show the ordering, not match an exact formula.
      const average = (nodeVoltageAt: (c: string, t: string, at: number) => number) => {
        const samples = Array.from({ length: 40 }, (_, i) => 4 * PERIOD + (i / 40) * PERIOD);
        const values = samples.map(t => nodeVoltageAt("r1", "a", t));
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      };
      const earlyAvg = average(earlyRun.nodeVoltageAt);
      const lateAvg = average(lateRun.nodeVoltageAt);
      expect(lateAvg).toBeLessThan(earlyAvg);
    },
    RUN_TIMEOUT
  );
});
