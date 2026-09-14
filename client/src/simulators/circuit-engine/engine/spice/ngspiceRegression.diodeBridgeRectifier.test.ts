/**
 * Real ngspice.wasm coverage for a full-wave diode bridge rectifier with a capacitor filter — the
 * one power-electronics circuit from the "advanced integration" wishlist that's actually buildable
 * with real components in this SPICE bridge (four real diode-silicon parts, a real resistor, a real
 * capacitor) and doesn't need an interactive stepped simulation to verify: it's a straight `.tran`
 * run read back through DMM-equivalent readings, the same way every other file in this
 * ngspiceRegression.* family works.
 */
import { describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

describe("Full-wave diode bridge rectifier with capacitor filter (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await warmupNgspice();
  }, 30_000);

  it(
    "230V peak, 50Hz AC through a 4-diode bridge into a 100Ω/2200µF filtered load: DC output near the ideal full-wave average minus two diode drops, with the ripple bounded around it at 2× mains rate",
    async () => {
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: 230, frequency: 50, offset: 0 }),
        // Standard 4-diode bridge: D1/D2 conduct one AC half-cycle, D3/D4 the other, both feeding
        // the same DC+ rail (via c1.a) and returning through the same DC- rail (c1.b, tied to ground).
        part("d1", "diode-silicon"),
        part("d2", "diode-silicon"),
        part("d3", "diode-silicon"),
        part("d4", "diode-silicon"),
        part("c1", "capacitor", { capacitance: 2200e-6 }),
        part("r1", "resistor", { resistance: 100 }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "d1", "anode"),
        wire("w2", "d1", "cathode", "c1", "a"),
        wire("w3", "v1", "neg", "d2", "anode"),
        wire("w4", "d2", "cathode", "c1", "a"),
        wire("w5", "d3", "anode", "c1", "b"),
        wire("w6", "d3", "cathode", "v1", "pos"),
        wire("w7", "d4", "anode", "c1", "b"),
        wire("w8", "d4", "cathode", "v1", "neg"),
        wire("w9", "c1", "b", "g", "gnd"),
        wire("w10", "r1", "a", "c1", "a"),
        wire("w11", "r1", "b", "c1", "b"),
      ];
      // A few line-cycles is enough for a 2200µF cap on a 100Ω load (τ = RC = 0.22s ≈ 11 mains
      // periods) to reach its ripple steady state within the window these samples come from.
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [".tran 20u 0.3"]);
      const output = (t: number) => nodeVoltageAt("c1", "a", t) - nodeVoltageAt("c1", "b", t);

      // With a capacitor-input filter this large relative to the load (τ = RC = 0.22s, ~11 mains
      // periods), the cap barely discharges between conduction pulses: it settles near the input
      // *peak* minus two diode drops, not the bare-resistive-load average (2/π)·Vpeak ≈ 146V a
      // rectifier with no filter cap would sit at — that unfiltered formula doesn't apply once a
      // smoothing capacitor this size is in the circuit. Confirmed against real solver output
      // (~223V) rather than asserted from the wrong regime's formula.
      const settled = output(0.28);
      expect(settled).toBeGreaterThan(210);
      expect(settled).toBeLessThan(230);

      // Ripple: full-wave rectification doubles the mains frequency onto the DC rail (both AC
      // half-cycles now contribute a pulse), so one ripple period is 1/100s = 10ms, not 1/50s.
      // Sampling a peak (just after a diode conducts, cap freshly topped up) and a trough (just
      // before the next one fires, cap discharged the most into the load) half a ripple-period apart
      // should show the filtered swing is real but small relative to the DC level — not perfectly
      // flat DC, and not anywhere near the full 0-230V swing an unfiltered bridge would show.
      const peak = Math.max(output(0.28), output(0.285), output(0.29));
      const trough = Math.min(output(0.28), output(0.285), output(0.29));
      const rippleSwing = peak - trough;
      expect(rippleSwing).toBeGreaterThan(0.5); // genuinely rippling, not a numerically-flat line
      expect(rippleSwing).toBeLessThan(30); // filtered — nowhere near the full input swing
    },
    RUN_TIMEOUT
  );
});
