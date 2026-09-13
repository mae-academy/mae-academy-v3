/**
 * Real-ngspice.wasm regression coverage for transistors (validation spec Section V): BJT NPN/PNP
 * (cutoff/active/saturation), MOSFET N/P-channel (cutoff/triode/saturation), and JFET N/P-channel
 * pinch-off. Same full-pipeline `simulate()` as ngspiceRegression.test.ts — see
 * ngspiceRegressionHelpers.ts. Model constants are the ones netlistGenerator.ts actually emits
 * (NPN_STD/PNP_STD: BF=100; NMOS_STD/PMOS_STD: VTO=±2; NJF_STD/PJF_STD: VTO=-4) — assertions are
 * built from those, not independently guessed numbers.
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

describe("ngspice regression: transistors (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 5.1 — BJT NPN (2N2222-class, NPN_STD)", () => {
    it(
      "cutoff: base tied to ground holds the collector at the rail (Ic ≈ 0)",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcc", "dc-voltage", { voltage: 12 }),
          part("rc", "resistor", { resistance: 1000 }),
          part("q1", "bjt-npn"),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcc", "pos", "rc", "a"),
          wire("w2", "rc", "b", "q1", "collector"),
          wire("w3", "q1", "base", "g", "gnd"),
          wire("w4", "q1", "emitter", "g", "gnd"),
          wire("w5", "vcc", "neg", "g", "gnd"),
          wire("w6", "vm1", "pos", "q1", "collector"),
          wire("w7", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // No base drive: no Rc drop, collector sits at (near) the rail.
        expect(readings.vm1.value).toBeGreaterThan(11.5);
      },
      RUN_TIMEOUT
    );

    it(
      "active region: Vbe sits at the silicon knee and Ic tracks BF·Ib",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcc", "dc-voltage", { voltage: 12 }),
          part("vbb", "dc-voltage", { voltage: 5 }),
          part("rb", "resistor", { resistance: 100_000 }), // Ib ≈ (5-0.7)/100k ≈ 43 µA.
          part("rc", "resistor", { resistance: 1000 }), // Rc small enough to stay out of saturation.
          part("q1", "bjt-npn"),
          part("vbe", "voltmeter"),
          part("vc", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcc", "pos", "rc", "a"),
          wire("w2", "rc", "b", "q1", "collector"),
          wire("w3", "vbb", "pos", "rb", "a"),
          wire("w4", "rb", "b", "q1", "base"),
          wire("w5", "q1", "emitter", "g", "gnd"),
          wire("w6", "vcc", "neg", "g", "gnd"),
          wire("w7", "vbb", "neg", "g", "gnd"),
          wire("w8", "vbe", "pos", "q1", "base"),
          wire("w9", "vbe", "neg", "g", "gnd"),
          wire("w10", "vc", "pos", "q1", "collector"),
          wire("w11", "vc", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vbe.value).toBeGreaterThan(0.55);
        expect(readings.vbe.value).toBeLessThan(0.85);
        // Active, not saturated: collector sits well above Vce(sat) and below the rail.
        expect(readings.vc.value).toBeGreaterThan(1);
        expect(readings.vc.value).toBeLessThan(11);
        const ib = (5 - readings.vbe.value) / 100_000;
        const ic = (12 - readings.vc.value) / 1000;
        // BF=100: Ic/Ib should land near 100, loosely (RB/RC/RE in the model shave the exact figure).
        expect(ic / ib).toBeGreaterThan(60);
        expect(ic / ib).toBeLessThan(120);
      },
      RUN_TIMEOUT
    );

    it(
      "saturation: heavy base drive with a large Rc pulls Vce down near 0.2 V",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcc", "dc-voltage", { voltage: 12 }),
          part("vbb", "dc-voltage", { voltage: 5 }),
          part("rb", "resistor", { resistance: 1000 }), // Ib ≈ 4.3 mA — far more than Rc can sink at BF.
          part("rc", "resistor", { resistance: 1000 }),
          part("q1", "bjt-npn"),
          part("vc", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcc", "pos", "rc", "a"),
          wire("w2", "rc", "b", "q1", "collector"),
          wire("w3", "vbb", "pos", "rb", "a"),
          wire("w4", "rb", "b", "q1", "base"),
          wire("w5", "q1", "emitter", "g", "gnd"),
          wire("w6", "vcc", "neg", "g", "gnd"),
          wire("w7", "vbb", "neg", "g", "gnd"),
          wire("w8", "vc", "pos", "q1", "collector"),
          wire("w9", "vc", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vc.value).toBeLessThan(0.5);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 5.2 — BJT PNP (inverse-logic bias)", () => {
    it(
      "active region: current flows out of the collector, Veb sits at the same silicon knee",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcc", "dc-voltage", { voltage: 12 }), // Emitter rail.
          part("vbb", "dc-voltage", { voltage: 7 }), // Base pulled below the emitter rail.
          part("rb", "resistor", { resistance: 100_000 }),
          part("rc", "resistor", { resistance: 1000 }),
          part("q1", "bjt-pnp"),
          part("veb", "voltmeter"),
          part("vc", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcc", "pos", "q1", "emitter"),
          wire("w2", "q1", "collector", "rc", "a"),
          wire("w3", "rc", "b", "g", "gnd"),
          wire("w4", "q1", "base", "rb", "a"),
          wire("w5", "rb", "b", "vbb", "pos"),
          wire("w6", "vbb", "neg", "g", "gnd"),
          wire("w7", "vcc", "neg", "g", "gnd"),
          wire("w8", "veb", "pos", "q1", "emitter"),
          wire("w9", "veb", "neg", "q1", "base"),
          wire("w10", "vc", "pos", "q1", "collector"),
          wire("w11", "vc", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.veb.value).toBeGreaterThan(0.55);
        expect(readings.veb.value).toBeLessThan(0.85);
        // Conducting: collector sits above ground by the Ic·Rc drop, not floating at 0.
        expect(readings.vc.value).toBeGreaterThan(0.2);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 5.3 — MOSFET N-channel (NMOS_STD, VTO=2 V)", () => {
    it(
      "cutoff below Vth: Vgs=1 V draws no drain current, Vds sits at the rail",
      async () => {
        const components = [
          part("g", "ground"),
          part("vdd", "dc-voltage", { voltage: 10 }),
          part("vgs", "dc-voltage", { voltage: 1 }),
          part("rd", "resistor", { resistance: 1000 }),
          part("m1", "mosfet-n"),
          part("vd", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vdd", "pos", "rd", "a"),
          wire("w2", "rd", "b", "m1", "drain"),
          wire("w3", "m1", "source", "g", "gnd"),
          wire("w4", "vgs", "pos", "m1", "gate"),
          wire("w5", "vgs", "neg", "g", "gnd"),
          wire("w6", "vdd", "neg", "g", "gnd"),
          wire("w7", "vd", "pos", "m1", "drain"),
          wire("w8", "vd", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vd.value).toBeGreaterThan(9.9);
      },
      RUN_TIMEOUT
    );

    it(
      "triode vs saturation: above Vth, Id rises with Vgs and the channel conducts",
      async () => {
        const drainCurrentFor = async (vgs: number, vdd: number) => {
          const components = [
            part("g", "ground"),
            part("vdd", "dc-voltage", { voltage: vdd }),
            part("vgs", "dc-voltage", { voltage: vgs }),
            part("rd", "resistor", { resistance: 1000 }),
            part("am1", "ammeter"),
            part("m1", "mosfet-n"),
          ];
          const wires = [
            wire("w1", "vdd", "pos", "rd", "a"),
            wire("w2", "rd", "b", "am1", "pos"),
            wire("w3", "am1", "neg", "m1", "drain"),
            wire("w4", "m1", "source", "g", "gnd"),
            wire("w5", "vgs", "pos", "m1", "gate"),
            wire("w6", "vgs", "neg", "g", "gnd"),
            wire("w7", "vdd", "neg", "g", "gnd"),
          ];
          const { readings } = await simulate(components, wires, "practical");
          return readings.am1.value;
        };
        // Above VTO=2 V: raising Vgs raises Id (KP·(Vgs-Vth) drive).
        const idLowVgs = await drainCurrentFor(3, 10);
        const idHighVgs = await drainCurrentFor(5, 10);
        expect(idHighVgs).toBeGreaterThan(idLowVgs);
        expect(idLowVgs).toBeGreaterThan(0);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 5.4 — MOSFET P-channel (PMOS_STD, VTO=-2 V)", () => {
    it(
      "conducts when the gate is pulled below the source by more than |Vth|",
      async () => {
        const components = [
          part("g", "ground"),
          part("vdd", "dc-voltage", { voltage: 10 }), // Source rail.
          part("vgs", "dc-voltage", { voltage: 5 }), // Gate pulled to 10-5=5 V, i.e. Vgs=-5 V.
          // KP=2e-5 (a deliberately low, un-fitted textbook transconductance): a 1 kΩ drain resistor
          // would only show a ~0.1 V drop at this overdrive, so Rd is sized up to make conduction
          // unambiguous against the 10 V rail while staying well inside saturation (Vds > Vgs-Vth=3V).
          part("rd", "resistor", { resistance: 47_000 }),
          part("m1", "mosfet-p"),
          part("vd", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vdd", "pos", "m1", "source"),
          wire("w2", "m1", "drain", "rd", "a"),
          wire("w3", "rd", "b", "g", "gnd"),
          // vgs.pos on the source rail, vgs.neg on the gate: V(gate) = V(source) - 5, i.e. Vgs = -5 V.
          wire("w4", "vgs", "pos", "vdd", "pos"),
          wire("w5", "vgs", "neg", "m1", "gate"),
          wire("w6", "vdd", "neg", "g", "gnd"),
          wire("w7", "vd", "pos", "m1", "drain"),
          wire("w8", "vd", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // Conducting: drain node lifted off ground by current through Rd.
        expect(readings.vd.value).toBeGreaterThan(0.5);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 5.5 — JFET N-channel (NJF_STD, VTO=-4 V)", () => {
    it(
      "Vgs=0 conducts (depletion-mode: JFETs are ON at zero gate bias)",
      async () => {
        const components = [
          part("g", "ground"),
          part("vdd", "dc-voltage", { voltage: 10 }),
          part("rd", "resistor", { resistance: 1000 }),
          part("j1", "jfet-n"),
          part("vd", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vdd", "pos", "rd", "a"),
          wire("w2", "rd", "b", "j1", "drain"),
          wire("w3", "j1", "source", "g", "gnd"),
          wire("w4", "j1", "gate", "g", "gnd"), // Vgs = 0.
          wire("w5", "vdd", "neg", "g", "gnd"),
          wire("w6", "vd", "pos", "j1", "drain"),
          wire("w7", "vd", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // Conducting channel drops the drain well below the rail.
        expect(readings.vd.value).toBeLessThan(9.5);
      },
      RUN_TIMEOUT
    );

    it(
      "pinches off beyond Vgs=VTO=-4 V: drain current collapses toward 0",
      async () => {
        const components = [
          part("g", "ground"),
          part("vdd", "dc-voltage", { voltage: 10 }),
          part("vgs", "dc-voltage", { voltage: 6 }), // Gate driven to -6 V, past pinch-off.
          part("rd", "resistor", { resistance: 1000 }),
          part("j1", "jfet-n"),
          part("vd", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vdd", "pos", "rd", "a"),
          wire("w2", "rd", "b", "j1", "drain"),
          wire("w3", "j1", "source", "g", "gnd"),
          // vgs.pos on ground, vgs.neg on the gate: V(gate) = 0 - 6 = -6 V, i.e. Vgs = -6 V.
          wire("w4", "vgs", "pos", "g", "gnd"),
          wire("w5", "vgs", "neg", "j1", "gate"),
          wire("w6", "vdd", "neg", "g", "gnd"),
          wire("w7", "vd", "pos", "j1", "drain"),
          wire("w8", "vd", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // Pinched off: negligible Rd drop, drain sits near the rail again.
        expect(readings.vd.value).toBeGreaterThan(9.5);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 5.6 — JFET P-channel (PJF_STD, VTO=-4 V modeled, P-type channel sign)", () => {
    it(
      "Vgs=0 conducts (depletion-mode P-channel is also ON at zero gate bias)",
      async () => {
        const components = [
          part("g", "ground"),
          part("vdd", "dc-voltage", { voltage: 10 }), // Source rail.
          part("rd", "resistor", { resistance: 1000 }),
          part("j1", "jfet-p"),
          part("vd", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vdd", "pos", "j1", "source"),
          wire("w2", "j1", "drain", "rd", "a"),
          wire("w3", "rd", "b", "g", "gnd"),
          wire("w4", "j1", "gate", "vdd", "pos"), // Vgs = 0.
          wire("w5", "vdd", "neg", "g", "gnd"),
          wire("w6", "vd", "pos", "j1", "drain"),
          wire("w7", "vd", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // Conducting: drain lifted off ground by current through Rd.
        expect(readings.vd.value).toBeGreaterThan(0.5);
      },
      RUN_TIMEOUT
    );
  });
});
