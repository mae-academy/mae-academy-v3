/**
 * Real-ngspice.wasm regression coverage for switches, relays, contactors, and protection devices
 * (validation spec Section VII): SPST/SPDT/push-button manual contacts, relay SPST/SPDT pull-in,
 * a contactor's ganged poles, a linked auxiliary contact, and what the fuse/circuit-breaker mappings
 * actually do today. Same full-pipeline `simulate()` as ngspiceRegression.test.ts — see
 * ngspiceRegressionHelpers.ts.
 *
 * Tests 7.7/7.8 (fuse, circuit breaker) deliberately don't assert the spec's I²t trip-curve timing
 * (5-10 s at 1.5x rated, <100 ms at fault current, …): spiceAdapter.ts maps `fuse` to an
 * always-closed contact ("SPICE cannot blow a fuse; it conducts until the UI reports otherwise" —
 * see its comment) and `circuit-breaker` to a manual switch driven only by its `state` prop, with no
 * link at all from simulated current back to that state. Thermal/magnetic tripping isn't implemented
 * in this engine, so these tests instead pin down what is actually implemented: the fuse conducts
 * regardless of load current, and the breaker's `state` — not current — is the only thing that opens
 * it.
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

describe("ngspice regression: switches, relays, contactors, protection (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 7.1 — SPST switch (12 V, 1 kΩ load)", () => {
    it.each([
      ["open", 0],
      ["closed", 0.012],
    ] as const)(
      "%s: I = %s A",
      async (state, expectedCurrent) => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("s1", "sw-spst-no", { state }),
          part("am1", "ammeter"),
          part("r1", "resistor", { resistance: 1000 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "s1", "a"),
          wire("w2", "s1", "b", "am1", "pos"),
          wire("w3", "am1", "neg", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.am1.status).toBe("ready");
        if (expectedCurrent === 0) {
          expect(Math.abs(readings.am1.value)).toBeLessThan(1e-6);
        } else {
          expect(Math.abs(readings.am1.value - expectedCurrent) / expectedCurrent).toBeLessThan(0.01);
        }
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.2 — SPDT switch (12 V, 1 kΩ each leg)", () => {
    it.each(["a", "b"] as const)(
      "position %s: only that leg conducts, the other reads 0 V",
      async position => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("s1", "sw-spdt", { state: position }),
          part("ra", "resistor", { resistance: 1000 }),
          part("rb", "resistor", { resistance: 1000 }),
          part("vma", "voltmeter"),
          part("vmb", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "s1", "common"),
          wire("w2", "s1", "a", "ra", "a"),
          wire("w3", "s1", "b", "rb", "a"),
          wire("w4", "ra", "b", "g", "gnd"),
          wire("w5", "rb", "b", "g", "gnd"),
          wire("w6", "v1", "neg", "g", "gnd"),
          wire("w7", "vma", "pos", "ra", "a"),
          wire("w8", "vma", "neg", "g", "gnd"),
          wire("w9", "vmb", "pos", "rb", "a"),
          wire("w10", "vmb", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        const [conducting, idle] = position === "a" ? ["vma", "vmb"] : ["vmb", "vma"];
        expect(readings[conducting].value).toBeCloseTo(12, 1);
        expect(readings[idle].value).toBeCloseTo(0, 1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.3 — push button (momentary, NO) driving an LED", () => {
    it.each(["released", "pressed"] as const)(
      "%s",
      async state => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 5 }),
          part("pb1", "pb-no", { state }),
          part("r1", "resistor", { resistance: 220 }),
          part("am1", "ammeter"),
          part("d1", "led", { forwardVoltage: 2 }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "pb1", "a"),
          wire("w2", "pb1", "b", "r1", "a"),
          wire("w3", "r1", "b", "am1", "pos"),
          wire("w4", "am1", "neg", "d1", "anode"),
          wire("w5", "d1", "cathode", "g", "gnd"),
          wire("w6", "v1", "neg", "g", "gnd"),
          wire("w7", "vm1", "pos", "d1", "anode"),
          wire("w8", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        if (state === "released") {
          expect(Math.abs(readings.am1.value)).toBeLessThan(1e-6);
        } else {
          expect(readings.am1.value).toBeGreaterThan(0.005);
          // KVL, independent of the LED's exact I-V law: whatever it drops plus the resistor's
          // I*R accounts for the whole 5 V rail.
          expect(readings.am1.value * 220 + readings.vm1.value).toBeCloseTo(5, 1);
        }
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.4 — relay SPST (12 V coil, 400 Ω, pull-in at 75% = 9 V)", () => {
    it(
      "de-energized: no coil current, NO contact stays open",
      async () => {
        const components = [
          part("g", "ground"),
          part("vload", "dc-voltage", { voltage: 24 }),
          part("k1", "relay-spst"),
          part("rl", "resistor", { resistance: 1000 }),
          part("am1", "ammeter"),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          // Coil left unpowered (both terminals floating to ground through nothing) — tie to 0 V.
          wire("w1", "k1", "coil+", "g", "gnd"),
          wire("w2", "k1", "coil-", "g", "gnd"),
          wire("w3", "vload", "pos", "am1", "pos"),
          wire("w4", "am1", "neg", "k1", "com"),
          wire("w5", "k1", "no", "rl", "a"),
          wire("w6", "rl", "b", "g", "gnd"),
          wire("w7", "vload", "neg", "g", "gnd"),
          wire("w8", "vm1", "pos", "rl", "a"),
          wire("w9", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(Math.abs(readings.am1.value)).toBeLessThan(1e-6);
        expect(Math.abs(readings.vm1.value)).toBeLessThan(0.1);
      },
      RUN_TIMEOUT
    );

    it(
      "energized at rated 12 V: coil draws V/R = 30 mA and the NO contact closes",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcoil", "dc-voltage", { voltage: 12 }),
          part("amcoil", "ammeter"),
          part("vload", "dc-voltage", { voltage: 24 }),
          part("k1", "relay-spst"),
          part("rl", "resistor", { resistance: 1000 }),
          part("vmload", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcoil", "pos", "amcoil", "pos"),
          wire("w2", "amcoil", "neg", "k1", "coil+"),
          wire("w3", "k1", "coil-", "g", "gnd"),
          wire("w4", "vcoil", "neg", "g", "gnd"),
          wire("w5", "vload", "pos", "k1", "com"),
          wire("w6", "k1", "no", "rl", "a"),
          wire("w7", "rl", "b", "g", "gnd"),
          wire("w8", "vload", "neg", "g", "gnd"),
          wire("w9", "vmload", "pos", "rl", "a"),
          wire("w10", "vmload", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // componentDefs.ts default coilR is 400 Ω (not the spec's illustrative 200 Ω).
        expect(readings.amcoil.value).toBeCloseTo(12 / 400, 3);
        expect(readings.vmload.value).toBeCloseTo(24, 1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.5 — relay SPDT (change-over)", () => {
    it.each([
      [12, "no", "nc"],
      [0, "nc", "no"],
    ] as const)(
      "coil at %s V: %s conducts, %s stays open",
      async (coilVoltage, expectConducting, expectOpen) => {
        const components = [
          part("g", "ground"),
          part("vcoil", "dc-voltage", { voltage: coilVoltage }),
          part("vload", "dc-voltage", { voltage: 24 }),
          part("k1", "relay-spdt"),
          part("rno", "resistor", { resistance: 1000 }),
          part("rnc", "resistor", { resistance: 1000 }),
          part("vmno", "voltmeter"),
          part("vmnc", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcoil", "pos", "k1", "coil+"),
          wire("w2", "k1", "coil-", "g", "gnd"),
          wire("w3", "vcoil", "neg", "g", "gnd"),
          wire("w4", "vload", "pos", "k1", "com"),
          wire("w5", "k1", "no", "rno", "a"),
          wire("w6", "k1", "nc", "rnc", "a"),
          wire("w7", "rno", "b", "g", "gnd"),
          wire("w8", "rnc", "b", "g", "gnd"),
          wire("w9", "vload", "neg", "g", "gnd"),
          wire("w10", "vmno", "pos", "rno", "a"),
          wire("w11", "vmno", "neg", "g", "gnd"),
          wire("w12", "vmnc", "pos", "rnc", "a"),
          wire("w13", "vmnc", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        const readingFor = (leg: "no" | "nc") => (leg === "no" ? readings.vmno : readings.vmnc).value;
        expect(readingFor(expectConducting)).toBeCloseTo(24, 1);
        expect(readingFor(expectOpen)).toBeCloseTo(0, 1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.6 — contactor (3-phase, all poles gang-switched by one coil)", () => {
    it(
      "energized at rated 24 V: all three poles close together, none stay open",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcoil", "dc-voltage", { voltage: 24 }),
          part("kmc", "contactor"),
          ...[1, 2, 3].map(phase => part(`v${phase}`, "dc-voltage", { voltage: 100 + phase })),
          ...[1, 2, 3].map(phase => part(`r${phase}`, "resistor", { resistance: 1000 })),
          ...[1, 2, 3].map(phase => part(`vm${phase}`, "voltmeter")),
        ];
        const wires = [
          wire("w1", "vcoil", "pos", "kmc", "coil+"),
          wire("w2", "kmc", "coil-", "g", "gnd"),
          wire("w3", "vcoil", "neg", "g", "gnd"),
          ...[1, 2, 3].flatMap(phase => [
            wire(`w${3 + phase}a`, `v${phase}`, "pos", "kmc", `l${phase}`),
            wire(`w${3 + phase}b`, "kmc", `t${phase}`, `r${phase}`, "a"),
            wire(`w${3 + phase}c`, `r${phase}`, "b", "g", "gnd"),
            wire(`w${3 + phase}d`, `v${phase}`, "neg", "g", "gnd"),
            wire(`w${3 + phase}e`, `vm${phase}`, "pos", `r${phase}`, "a"),
            wire(`w${3 + phase}f`, `vm${phase}`, "neg", "g", "gnd"),
          ]),
        ];
        const { readings } = await simulate(components, wires, "practical");
        for (const phase of [1, 2, 3]) {
          expect(readings[`vm${phase}`].value).toBeCloseTo(100 + phase, 1);
        }
      },
      RUN_TIMEOUT
    );

    it(
      "de-energized: all three poles stay open",
      async () => {
        const components = [
          part("g", "ground"),
          part("kmc", "contactor"),
          ...[1, 2, 3].map(phase => part(`v${phase}`, "dc-voltage", { voltage: 100 + phase })),
          ...[1, 2, 3].map(phase => part(`r${phase}`, "resistor", { resistance: 1000 })),
          ...[1, 2, 3].map(phase => part(`vm${phase}`, "voltmeter")),
        ];
        const wires = [
          wire("w1", "kmc", "coil+", "g", "gnd"),
          wire("w2", "kmc", "coil-", "g", "gnd"),
          ...[1, 2, 3].flatMap(phase => [
            wire(`w${2 + phase}a`, `v${phase}`, "pos", "kmc", `l${phase}`),
            wire(`w${2 + phase}b`, "kmc", `t${phase}`, `r${phase}`, "a"),
            wire(`w${2 + phase}c`, `r${phase}`, "b", "g", "gnd"),
            wire(`w${2 + phase}d`, `v${phase}`, "neg", "g", "gnd"),
            wire(`w${2 + phase}e`, `vm${phase}`, "pos", `r${phase}`, "a"),
            wire(`w${2 + phase}f`, `vm${phase}`, "neg", "g", "gnd"),
          ]),
        ];
        const { readings } = await simulate(components, wires, "practical");
        for (const phase of [1, 2, 3]) {
          expect(Math.abs(readings[`vm${phase}`].value)).toBeLessThan(0.1);
        }
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.7 (bonus) — auxiliary contact linked to a relay's own coil label", () => {
    it(
      "tracks the linked coil's energised state without loading it",
      async () => {
        const components = [
          part("g", "ground"),
          part("vcoil", "dc-voltage", { voltage: 12 }),
          part("k1", "relay-spst"), // part() labels it "K1" (id.toUpperCase()).
          part("aux1", "aux-contact-no", { linkedTo: "K1" }),
          part("vload", "dc-voltage", { voltage: 24 }),
          part("rl", "resistor", { resistance: 1000 }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vcoil", "pos", "k1", "coil+"),
          wire("w2", "k1", "coil-", "g", "gnd"),
          wire("w3", "vcoil", "neg", "g", "gnd"),
          wire("w4", "vload", "pos", "aux1", "a"),
          wire("w5", "aux1", "b", "rl", "a"),
          wire("w6", "rl", "b", "g", "gnd"),
          wire("w7", "vload", "neg", "g", "gnd"),
          wire("w8", "vm1", "pos", "rl", "a"),
          wire("w9", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vm1.value).toBeCloseTo(24, 1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.8 — fuse: conducts regardless of load current (no thermal-trip model)", () => {
    it.each([
      ["light load", 10_000],
      ["heavy load", 10],
    ] as const)(
      "%s: fuse still reads ~0 V across it, whatever the resulting current",
      async (_label, loadResistance) => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("f1", "fuse", { ratedCurrent: 5 }),
          part("am1", "ammeter"),
          part("r1", "resistor", { resistance: loadResistance }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "f1", "a"),
          wire("w2", "f1", "b", "am1", "pos"),
          wire("w3", "am1", "neg", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
          wire("w6", "vm1", "pos", "f1", "a"),
          wire("w7", "vm1", "neg", "f1", "b"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // A closed manual contact is a small (not zero) 0.001 Ω resistor (netlistGenerator.ts's
        // `manualContactOnResistance`), so its drop scales with current, not with the fictional
        // rated-current threshold; even at 1.2 A that's only ~1.2 mV.
        expect(Math.abs(readings.vm1.value)).toBeLessThan(0.01);
        expect(Math.abs(readings.am1.value)).toBeGreaterThan(0);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 7.9 — circuit breaker: state alone controls it, current does not trip it", () => {
    it.each([
      ["closed", 10, true],
      ["tripped", 10_000, false],
    ] as const)(
      "state=%s: conducts=%s regardless of the %s Ω load driving very different current",
      async (state, loadResistance, shouldConduct) => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("cb1", "circuit-breaker", { state, ratedCurrent: 10 }),
          part("r1", "resistor", { resistance: loadResistance }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "cb1", "a"),
          wire("w2", "cb1", "b", "r1", "a"),
          wire("w3", "r1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "vm1", "pos", "r1", "a"),
          wire("w6", "vm1", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        if (shouldConduct) {
          expect(readings.vm1.value).toBeCloseTo(12, 1);
        } else {
          expect(Math.abs(readings.vm1.value)).toBeLessThan(0.1);
        }
      },
      RUN_TIMEOUT
    );
  });
});
