/**
 * ngspice.wasm coverage for the AC voltage source's non-sine waveforms (square/triangle/sawtooth),
 * added when spiceAdapter.ts stopped rejecting them as `unsupported`. Verifies the PULSE() parameter
 * derivation in netlistGenerator.ts's `pulseParameters` against real ngspice output at specific
 * instants within a period — not just netlist text — including phase alignment, since that's exactly
 * the kind of thing easy to get subtly wrong by reasoning alone (see its doc comment).
 */
import { describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

const AMPLITUDE = 10;
const FREQUENCY = 1000;
const PERIOD = 1 / FREQUENCY;

function sourceOnly(waveform: "square" | "triangle" | "sawtooth", phaseDegrees = 0) {
  const components = [
    part("g", "ground"),
    part("v1", "ac-voltage", {
      waveform,
      amplitude: AMPLITUDE,
      frequency: FREQUENCY,
      phase: phaseDegrees,
      offset: 0,
    }),
    part("r1", "resistor", { resistance: 1_000_000 }),
  ];
  const wires = [
    wire("w1", "v1", "pos", "r1", "a"),
    wire("w2", "r1", "b", "g", "gnd"),
    wire("w3", "v1", "neg", "g", "gnd"),
  ];
  return { components, wires };
}

describe("AC voltage source — non-sine waveforms (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "square, phase 0: starts at +peak, flips to -peak at the half-period mark",
    async () => {
      const { components, wires } = sourceOnly("square");
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${PERIOD / 1000} ${3 * PERIOD}`,
      ]);
      const v = (t: number) => nodeVoltageAt("v1", "pos", t);
      expect(v(PERIOD * 0.01)).toBeCloseTo(AMPLITUDE, 0);
      expect(v(PERIOD * 0.49)).toBeCloseTo(AMPLITUDE, 0);
      expect(v(PERIOD * 0.51)).toBeCloseTo(-AMPLITUDE, 0);
      expect(v(PERIOD * 0.99)).toBeCloseTo(-AMPLITUDE, 0);
      // Repeats identically into the next period — not just a one-off startup transient.
      expect(v(PERIOD * 1.01)).toBeCloseTo(AMPLITUDE, 0);
    },
    RUN_TIMEOUT
  );

  it(
    "square, phase 90°: the flip moves a quarter period earlier, same direction SIN()'s phase does",
    async () => {
      const { components, wires } = sourceOnly("square", 90);
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${PERIOD / 1000} ${2 * PERIOD}`,
      ]);
      const v = (t: number) => nodeVoltageAt("v1", "pos", t);
      expect(v(PERIOD * 0.01)).toBeCloseTo(AMPLITUDE, 0);
      expect(v(PERIOD * 0.24)).toBeCloseTo(AMPLITUDE, 0);
      expect(v(PERIOD * 0.26)).toBeCloseTo(-AMPLITUDE, 0);
    },
    RUN_TIMEOUT
  );

  it(
    "triangle, phase 0: trough at t=0 (its reset-edge reference), peak at T/2, back to trough by T",
    async () => {
      const { components, wires } = sourceOnly("triangle");
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${PERIOD / 1000} ${2 * PERIOD}`,
      ]);
      const v = (t: number) => nodeVoltageAt("v1", "pos", t);
      expect(v(0)).toBeCloseTo(-AMPLITUDE, 0);
      expect(v(PERIOD * 0.25)).toBeCloseTo(0, 0);
      expect(v(PERIOD * 0.5)).toBeCloseTo(AMPLITUDE, 0);
      expect(v(PERIOD * 0.99)).toBeCloseTo(-AMPLITUDE, 0);
    },
    RUN_TIMEOUT
  );

  it(
    "sawtooth, phase 0: trough at t=0 (its reset-edge reference, not sine's zero-crossing), ramping to +peak by T, then resetting",
    async () => {
      const { components, wires } = sourceOnly("sawtooth");
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${PERIOD / 1000} ${2 * PERIOD}`,
      ]);
      const v = (t: number) => nodeVoltageAt("v1", "pos", t);
      expect(v(0)).toBeCloseTo(-AMPLITUDE, 0);
      expect(v(PERIOD * 0.5)).toBeCloseTo(0, 0);
      expect(v(PERIOD * 0.98)).toBeGreaterThan(AMPLITUDE * 0.9);
      // Reset back down at the period boundary, not a continued climb.
      expect(v(PERIOD * 1.02)).toBeLessThan(-AMPLITUDE * 0.8);
    },
    RUN_TIMEOUT
  );

  it(
    "square, 50% duty: true RMS over whole periods equals the peak amplitude",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", {
          waveform: "square",
          amplitude: AMPLITUDE,
          frequency: FREQUENCY,
          offset: 0,
        }),
        part("vm1", "voltmeter", { mode: "AC" }),
        part("r1", "resistor", { resistance: 1_000_000 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "vm1", "pos"),
        wire("w2", "vm1", "neg", "g", "gnd"),
        wire("w3", "v1", "pos", "r1", "a"),
        wire("w4", "r1", "b", "g", "gnd"),
        wire("w5", "v1", "neg", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical", [
        `.tran ${PERIOD / 2000} ${5 * PERIOD}`,
      ]);
      expect(readings.vm1.status).toBe("ready");
      expect(readings.vm1.value).toBeCloseTo(AMPLITUDE, 0);
    },
    RUN_TIMEOUT
  );
});
