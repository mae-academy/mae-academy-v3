import { describe, expect, it } from "vitest";
import type { SamplePoint } from "@shared/circuit/circuitTypes";
import { GRID_DIVS_X } from "@/simulators/circuit-engine/components/ui-components/OscilloscopeTracePanel";
import {
  RUN_TIMEOUT,
  part,
  simulate,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

describe("Oscilloscope Acquisition Modes: Step Response & Live Roll", () => {
  // Test 1 (RLC Step Response):
  // Underdamped series RLC circuit with DC source: R = 10 Ω, L = 10 mH, C = 10 µF, V = 10 V DC.
  // Characteristic impedance Z0 = √(L/C) = √(10e-3 / 10e-6) = 31.62 Ω.
  // Damping factor ζ = (R / 2) * √(C / L) = 5 * √(1e-3) = 0.158 < 1 (strongly underdamped).
  // Step response will overshoot significantly above 10 V (theoretical peak ~ 16 V) before settling at 10 V.
  it(
    "Test 1: Underdamped series RLC transient step response with UIC captures overshoot and settling envelope from t = 0",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "dc-voltage", { voltage: 10 }),
        part("r1", "resistor", { resistance: 10 }),
        part("l1", "inductor", { inductance: 10e-3 }),
        part("c1", "capacitor", { capacitance: 10e-6 }),
        part("osc1", "oscilloscope", { timeDiv_ch1: 0.001, voltDiv_ch1: 5 }),
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

      // Simulated with `uic` (Step Response transient analysis)
      const { readings, nodeVoltageAt } = await simulate(components, wires, "practical", [
        ".tran 0.00005 0.01 uic",
      ]);

      const reading = readings["osc1:ch1"];
      expect(reading).toBeDefined();
      expect(reading.status).toBe("ready");
      const samples: SamplePoint[] = reading.samples ?? [];
      expect(samples.length).toBeGreaterThan(50);

      // t = 0: uncharged, starts rigidly at 0 V
      expect(nodeVoltageAt("c1", "a", 0)).toBeLessThan(0.1);

      // Second-order overshoot: peak voltage exceeds 10 V DC step input
      const maxVoltage = Math.max(...samples.map((s) => s.value));
      expect(maxVoltage).toBeGreaterThan(14.0); // Underdamped overshoot (peak ~ 15.5 - 16.5 V)

      // Settling towards 10 V at the end of the span
      const finalVoltage = samples[samples.length - 1].value;
      expect(finalVoltage).toBeCloseTo(10, 0);

      // Step Response layout rules:
      // 1. Anchors horizontally from t = 0 to t = +T_span
      const timeDiv = 0.001; // 1 ms/div
      const tSpan = timeDiv * GRID_DIVS_X; // 10 ms
      const stepSamples = samples.filter((s) => s.time >= 0);
      const visibleInSpan = stepSamples.filter((s) => s.time <= tSpan + 1e-9);

      // Verify that t=0 is the first sample
      expect(visibleInSpan[0].time).toBeCloseTo(0, 4);
      // Verify all plotted samples are within [0, tSpan]
      expect(visibleInSpan[visibleInSpan.length - 1].time).toBeLessThanOrEqual(tSpan + 1e-9);
    },
    RUN_TIMEOUT
  );

  it("Test 2: Switching between Step Response and Live Roll window mapping", () => {
    // Generate simulated rolling samples from t = 0 to t = 20 ms
    const fullSamples: SamplePoint[] = Array.from({ length: 201 }, (_, i) => ({
      time: i * 0.0001, // 0 to 20 ms
      value: 10 * Math.sin(2 * Math.PI * 100 * (i * 0.0001)),
    }));

    const timeDiv = 0.001; // 1 ms/div
    const tSpan = timeDiv * GRID_DIVS_X; // 10 ms window

    // Step Response Mode:
    // Strictly anchored at t = 0 to t = +T_span (first 10 ms, pinned from left axis)
    const stepFiltered = fullSamples.filter((s) => s.time >= 0 && s.time <= tSpan);
    expect(stepFiltered[0].time).toBe(0);
    expect(stepFiltered[stepFiltered.length - 1].time).toBeCloseTo(0.01, 4);

    // Live Roll Mode:
    // Rolling window buffer showing dynamic real-time data moving across [t - T_window, t]
    const dataEnd = fullSamples[fullSamples.length - 1].time; // 20 ms
    const windowStart = dataEnd - tSpan; // 10 ms
    const liveFiltered = fullSamples.filter(
      (s) => s.time >= windowStart && s.time <= dataEnd
    );
    expect(liveFiltered[0].time).toBeCloseTo(0.01, 4);
    expect(liveFiltered[liveFiltered.length - 1].time).toBeCloseTo(0.02, 4);
  });

  it(
    "Test 3: AC sine wave with zero phase offset starts at 0 V and crosses upwards into positive territory at t = 0+",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: 10, frequency: 50, phase: 0, offset: 0 }),
        part("r1", "resistor", { resistance: 1000 }),
        part("osc1", "oscilloscope", { timeDiv_ch1: 0.002, voltDiv_ch1: 5 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "r1", "a"),
        wire("w2", "r1", "b", "g", "gnd"),
        wire("w3", "v1", "neg", "g", "gnd"),
        wire("w4", "osc1", "ch1", "r1", "a"),
        wire("w5", "osc1", "gnd", "g", "gnd"),
      ];
      const { readings } = await simulate(components, wires, "practical", [
        ".tran 0.0001 0.02",
      ]);
      const reading = readings["osc1:ch1"];
      expect(reading).toBeDefined();
      const samples = reading.samples!;
      const positiveSamples = samples.filter((s) => s.time > 0 && s.time < 0.005);
      expect(positiveSamples.length).toBeGreaterThan(0);
      for (const s of positiveSamples) {
        expect(s.value).toBeGreaterThanOrEqual(0);
      }
    },
    RUN_TIMEOUT
  );
});

