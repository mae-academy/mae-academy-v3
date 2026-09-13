/**
 * Real-ngspice.wasm regression coverage for auxiliary-contact synchronization and contactor
 * interlocking (validation spec Section XI). Same full-pipeline `simulate()` as
 * ngspiceRegression.test.ts — see ngspiceRegressionHelpers.ts.
 *
 * Scope note: the spec's own Section XI is mostly about fuse/breaker *thermal and magnetic trip
 * timing* (I²t heating curves, 5-10s overload trips, <100ms fault trips) and fuse/breaker
 * *coordination*. None of that exists in this engine — `fuse` maps to an always-closed contact and
 * `circuit-breaker` to a manual switch driven only by its `state` prop, with no link from simulated
 * current back to that state (spiceAdapter.ts's own comment: "SPICE cannot blow a fuse; it conducts
 * until the UI reports otherwise"; already covered, honestly, by ngspiceRegression.switches.test.ts's
 * Tests 7.8/7.9). Implementing a real thermal trip model is out of scope here — see this session's
 * scoping discussion. What *is* real and covered below: auxiliary-contact/contactor synchronization
 * (the spec's own "CRITICAL" callout) and contactor interlocking, both already implemented in
 * spiceAdapter.ts's `auxContact()` and the shared coil-driven switch models in netlistGenerator.ts.
 *
 * A genuinely simultaneous "both start buttons pressed at once" interlock scenario is deliberately
 * NOT tested as a single static circuit: verified against ngspice.wasm, a symmetric cross-coupled
 * K1/K2-aux circuit with both inputs asserted at once is a real algebraic bistable (two distinct
 * self-consistent solutions exist — (K1 on, K2 off) and (K1 off, K2 on)), and the solver fails
 * outright on it ("SPICE rawfile is missing its Binary: marker") rather than picking one — an
 * accurate reflection of why real interlocked starters also need a *mechanical* interlock, not just
 * an electrical one. The tests below instead verify the mechanism deterministically: each direction
 * energizes correctly on its own, and forcing one contactor's state (via `manualState`, standing in
 * for "already running") proves its aux contact genuinely blocks the other coil's path.
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

describe("ngspice regression: protection & auxiliary-contact synchronization (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 11.1 — auxiliary contact (separate part, linked by coil label) tracks its parent exactly", () => {
    // relay-spst defaults: coilVoltage=12V, coilR=400Ω -> pull-in at 75% = 9V, drop-out at 45% = 5.4V.
    it.each([
      [0, "open"],
      [5, "open"], // Below drop-out and pull-in: released.
      [8.9, "open"], // Just under pull-in: still released.
      [9.1, "closed"], // Just over pull-in: pulled in.
      [12, "closed"], // Rated: pulled in.
    ] as const)(
      "coil at %s V: main NO contact and aux NO contact are both %s",
      async (coilVoltage, expected) => {
        const components = [
          part("g", "ground"),
          part("vc", "dc-voltage", { voltage: coilVoltage }),
          part("k1", "relay-spst"), // part() labels it "K1".
          part("aux1", "aux-contact-no", { linkedTo: "K1" }),
          part("vl", "dc-voltage", { voltage: 24 }),
          part("rmain", "resistor", { resistance: 1000 }),
          part("raux", "resistor", { resistance: 1000 }),
          part("vmmain", "voltmeter"),
          part("vmaux", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vc", "pos", "k1", "coil+"),
          wire("w2", "k1", "coil-", "g", "gnd"),
          wire("w3", "vc", "neg", "g", "gnd"),
          wire("w4", "vl", "pos", "k1", "com"),
          wire("w5", "k1", "no", "rmain", "a"),
          wire("w6", "rmain", "b", "g", "gnd"),
          wire("w7", "vl", "pos", "aux1", "a"),
          wire("w8", "aux1", "b", "raux", "a"),
          wire("w9", "raux", "b", "g", "gnd"),
          wire("w10", "vl", "neg", "g", "gnd"),
          wire("w11", "vmmain", "pos", "rmain", "a"),
          wire("w12", "vmmain", "neg", "g", "gnd"),
          wire("w13", "vmaux", "pos", "raux", "a"),
          wire("w14", "vmaux", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        const [expectMain, expectAux] =
          expected === "closed" ? [24, 24] : [0, 0];
        expect(readings.vmmain.value).toBeCloseTo(expectMain, 0);
        expect(readings.vmaux.value).toBeCloseTo(expectAux, 0);
        // Exact match, not just both-in-the-right-ballpark: this is the actual synchronization claim.
        expect(readings.vmmain.value).toBeCloseTo(readings.vmaux.value, 2);
      },
      RUN_TIMEOUT
    );

    it(
      "aux-contact-nc (opposite sense) is closed exactly when the coil is de-energized",
      async () => {
        const readingFor = async (coilVoltage: number) => {
          const components = [
            part("g", "ground"),
            part("vc", "dc-voltage", { voltage: coilVoltage }),
            part("k1", "relay-spst"),
            part("aux1", "aux-contact-nc", { linkedTo: "K1" }),
            part("vl", "dc-voltage", { voltage: 24 }),
            part("raux", "resistor", { resistance: 1000 }),
            part("vmaux", "voltmeter"),
          ];
          const wires = [
            wire("w1", "vc", "pos", "k1", "coil+"),
            wire("w2", "k1", "coil-", "g", "gnd"),
            wire("w3", "vc", "neg", "g", "gnd"),
            wire("w4", "vl", "pos", "aux1", "a"),
            wire("w5", "aux1", "b", "raux", "a"),
            wire("w6", "raux", "b", "g", "gnd"),
            wire("w7", "vl", "neg", "g", "gnd"),
            wire("w8", "vmaux", "pos", "raux", "a"),
            wire("w9", "vmaux", "neg", "g", "gnd"),
          ];
          const { readings } = await simulate(components, wires, "practical");
          return readings.vmaux.value;
        };
        expect(await readingFor(0)).toBeCloseTo(24, 0); // De-energized: NC contact conducts.
        expect(await readingFor(12)).toBeCloseTo(0, 0); // Energized: NC contact opens.
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 11.2 — a contactor's own built-in aux terminals track its main poles exactly", () => {
    it(
      "aux-no-a/aux-no-b conducts exactly when the main pole (l1->t1) does",
      async () => {
        const components = [
          part("g", "ground"),
          part("vc", "dc-voltage", { voltage: 24 }),
          part("kmc", "contactor"), // Default coilVoltage 24V.
          part("vl", "dc-voltage", { voltage: 100 }),
          part("rmain", "resistor", { resistance: 1000 }),
          part("raux", "resistor", { resistance: 1000 }),
          part("vmmain", "voltmeter"),
          part("vmaux", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vc", "pos", "kmc", "coil+"),
          wire("w2", "kmc", "coil-", "g", "gnd"),
          wire("w3", "vc", "neg", "g", "gnd"),
          wire("w4", "vl", "pos", "kmc", "l1"),
          wire("w5", "kmc", "t1", "rmain", "a"),
          wire("w6", "rmain", "b", "g", "gnd"),
          wire("w7", "vl", "pos", "kmc", "aux-no-a"),
          wire("w8", "kmc", "aux-no-b", "raux", "a"),
          wire("w9", "raux", "b", "g", "gnd"),
          wire("w10", "vl", "neg", "g", "gnd"),
          wire("w11", "vmmain", "pos", "rmain", "a"),
          wire("w12", "vmmain", "neg", "g", "gnd"),
          wire("w13", "vmaux", "pos", "raux", "a"),
          wire("w14", "vmaux", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vmmain.value).toBeCloseTo(100, 0);
        expect(readings.vmaux.value).toBeCloseTo(100, 0);
      },
      RUN_TIMEOUT
    );

    it(
      "de-energized: both the main pole and aux-no stay open",
      async () => {
        const components = [
          part("g", "ground"),
          part("kmc", "contactor"),
          part("vl", "dc-voltage", { voltage: 100 }),
          part("rmain", "resistor", { resistance: 1000 }),
          part("raux", "resistor", { resistance: 1000 }),
          part("vmmain", "voltmeter"),
          part("vmaux", "voltmeter"),
        ];
        const wires = [
          wire("w1", "kmc", "coil+", "g", "gnd"),
          wire("w2", "kmc", "coil-", "g", "gnd"),
          wire("w4", "vl", "pos", "kmc", "l1"),
          wire("w5", "kmc", "t1", "rmain", "a"),
          wire("w6", "rmain", "b", "g", "gnd"),
          wire("w7", "vl", "pos", "kmc", "aux-no-a"),
          wire("w8", "kmc", "aux-no-b", "raux", "a"),
          wire("w9", "raux", "b", "g", "gnd"),
          wire("w10", "vl", "neg", "g", "gnd"),
          wire("w11", "vmmain", "pos", "rmain", "a"),
          wire("w12", "vmmain", "neg", "g", "gnd"),
          wire("w13", "vmaux", "pos", "raux", "a"),
          wire("w14", "vmaux", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vmmain.value).toBeCloseTo(0, 0);
        expect(readings.vmaux.value).toBeCloseTo(0, 0);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 11.3 — transient timing: aux and main switch at the exact same simulated instant", () => {
    it(
      "a slowly-swept coil voltage crossing pull-in trips both contacts at the same sampled timestep",
      async () => {
        // A slow (2 Hz) sine gives a continuous ramp-like sweep through the 9 V pull-in threshold
        // once per half-cycle, at a rate the .tran step (0.2 ms) resolves finely.
        const components = [
          part("g", "ground"),
          part("vc", "ac-voltage", { amplitude: 15, frequency: 2, phase: -90, offset: 15 }),
          part("k1", "relay-spst"),
          part("aux1", "aux-contact-no", { linkedTo: "K1" }),
          part("vl", "dc-voltage", { voltage: 24 }),
          part("rmain", "resistor", { resistance: 1000 }),
          part("raux", "resistor", { resistance: 1000 }),
        ];
        const wires = [
          wire("w1", "vc", "pos", "k1", "coil+"),
          wire("w2", "k1", "coil-", "g", "gnd"),
          wire("w3", "vc", "neg", "g", "gnd"),
          wire("w4", "vl", "pos", "k1", "com"),
          wire("w5", "k1", "no", "rmain", "a"),
          wire("w6", "rmain", "b", "g", "gnd"),
          wire("w7", "vl", "pos", "aux1", "a"),
          wire("w8", "aux1", "b", "raux", "a"),
          wire("w9", "raux", "b", "g", "gnd"),
          wire("w10", "vl", "neg", "g", "gnd"),
        ];
        const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
          ".tran 0.0002 0.25",
        ]);
        const main = nodeVoltageSeries("rmain", "a");
        const aux = nodeVoltageSeries("raux", "a");
        const mainCrossingIndex = main.values.findIndex(v => v > 1);
        const auxCrossingIndex = aux.values.findIndex(v => v > 1);
        expect(mainCrossingIndex).toBeGreaterThan(0);
        expect(auxCrossingIndex).toBeGreaterThan(0);
        expect(main.time[mainCrossingIndex]).toBe(aux.time[auxCrossingIndex]);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 11.4 — reversing-contactor interlocking (K1 forward / K2 reverse)", () => {
    // K1's coil circuit is gated by K2's own aux-NC (and vice versa): each direction can only start
    // while the other is not already running.
    function interlockCircuit(s1State: "open" | "closed", s2State: "open" | "closed") {
      const components = [
        part("g", "ground"),
        part("vctl", "dc-voltage", { voltage: 24 }),
        part("s1", "sw-spst-no", { state: s1State }),
        part("s2", "sw-spst-no", { state: s2State }),
        part("k1", "relay-spst", { coilVoltage: 24, coilR: 500 }), // "K1"
        part("k2", "relay-spst", { coilVoltage: 24, coilR: 500 }), // "K2"
        part("aux_k1nc", "aux-contact-nc", { linkedTo: "K1" }),
        part("aux_k2nc", "aux-contact-nc", { linkedTo: "K2" }),
        part("vmk1", "voltmeter"),
        part("vmk2", "voltmeter"),
      ];
      const wires = [
        wire("w1", "vctl", "pos", "s1", "a"),
        wire("w2", "s1", "b", "aux_k2nc", "a"),
        wire("w3", "aux_k2nc", "b", "k1", "coil+"),
        wire("w4", "k1", "coil-", "g", "gnd"),
        wire("w5", "vctl", "pos", "s2", "a"),
        wire("w6", "s2", "b", "aux_k1nc", "a"),
        wire("w7", "aux_k1nc", "b", "k2", "coil+"),
        wire("w8", "k2", "coil-", "g", "gnd"),
        wire("w9", "vctl", "neg", "g", "gnd"),
        wire("w10", "vmk1", "pos", "k1", "coil+"),
        wire("w11", "vmk1", "neg", "k1", "coil-"),
        wire("w12", "vmk2", "pos", "k2", "coil+"),
        wire("w13", "vmk2", "neg", "k2", "coil-"),
      ];
      return { components, wires };
    }

    it(
      "S1 alone (forward): K1 energizes, K2 stays de-energized",
      async () => {
        const { components, wires } = interlockCircuit("closed", "open");
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vmk1.value).toBeCloseTo(24, 0);
        expect(readings.vmk2.value).toBeCloseTo(0, 0);
      },
      RUN_TIMEOUT
    );

    it(
      "S2 alone (reverse): K2 energizes, K1 stays de-energized",
      async () => {
        const { components, wires } = interlockCircuit("open", "closed");
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vmk1.value).toBeCloseTo(0, 0);
        expect(readings.vmk2.value).toBeCloseTo(24, 0);
      },
      RUN_TIMEOUT
    );

    it(
      "K1 already running (forced via manualState, standing in for 'already latched') blocks K2 even with S2 pressed",
      async () => {
        const components = [
          part("g", "ground"),
          part("vctl", "dc-voltage", { voltage: 24 }),
          part("s2", "sw-spst-no", { state: "closed" }),
          part("k1", "relay-spst", { coilVoltage: 24, coilR: 500, manualState: "closed" }),
          part("k2", "relay-spst", { coilVoltage: 24, coilR: 500 }),
          part("aux_k1nc", "aux-contact-nc", { linkedTo: "K1" }),
          part("vmk2", "voltmeter"),
        ];
        const wires = [
          wire("w5", "vctl", "pos", "s2", "a"),
          wire("w6", "s2", "b", "aux_k1nc", "a"),
          wire("w7", "aux_k1nc", "b", "k2", "coil+"),
          wire("w8", "k2", "coil-", "g", "gnd"),
          wire("w9", "vctl", "neg", "g", "gnd"),
          wire("w12", "vmk2", "pos", "k2", "coil+"),
          wire("w13", "vmk2", "neg", "k2", "coil-"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vmk2.value).toBeCloseTo(0, 0); // Blocked: K1's aux-NC is open.
      },
      RUN_TIMEOUT
    );
  });
});
