/**
 * End-to-end regression suite against the real ngspice.wasm binary — not the netlist text, the
 * actual solver spiceWorker.ts ships in production. Each case runs the full production pipeline
 * (convertToSpiceComponents -> generateNetlist -> ngspice -> parseSpiceResults ->
 * buildSpiceInstrumentReadings) so a regression in any one stage is caught, not just a netlist-text
 * diff. Guards the open-circuit ghost reading (an open switch must read exactly like a removed one,
 * in both modes and on unloaded probes), isolated-subnet handling, and Academic mode's
 * non-convergence on the direct diode and the thyristor macros.
 */

import { beforeAll, describe, expect, it } from "vitest";

import type {
  CircuitComponent,
  CircuitWire,
} from "@/simulators/circuit-engine/models/circuitTypes";
import {
  convertToSpiceComponents,
  resolveCircuitNets,
  type SimulationMode,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import {
  buildSpiceNodeMap,
  generateNetlist,
} from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import { LED_FORWARD_VOLTAGES } from "@/simulators/circuit-engine/models/componentDefs";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";
import { buildSpiceInstrumentReadings } from "@/simulators/circuit-engine/engine/spice/spiceInstruments";
import {
  runNgspice,
  runNgspiceWithLog,
} from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";

// Every run boots a fresh ngspice instance (see ngspiceTestHarness); the first also has to load and
// parse the 7 MB JS glue, so only that warm-up needs the extra slack.
const WASM_BOOT_TIMEOUT = 30_000;
const RUN_TIMEOUT = 15_000;
// Short enough to run fast, long enough that these DC/latch circuits (no reactive elements besides
// the thyristor macros' picofarad junction capacitances) are fully settled by the last sample.
const SETTLE_ANALYSIS = [".tran 0.00005 0.002"];

function part(
  id: string,
  type: string,
  props: Record<string, unknown> = {}
): CircuitComponent {
  return {
    id,
    type,
    x: 0,
    y: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    label: id.toUpperCase(),
    props,
  };
}

function wire(
  id: string,
  fromComp: string,
  fromTerm: string,
  toComp: string,
  toTerm: string
): CircuitWire {
  return {
    id,
    fromComp,
    fromTerm,
    toComp,
    toTerm,
    path: [
      [0, 0],
      [20, 0],
    ],
    routing: "orthogonal",
  };
}

/** Runs one circuit through the full production pipeline and returns its instrument readings. */
async function simulate(
  components: CircuitComponent[],
  wires: CircuitWire[],
  mode: SimulationMode
) {
  const nets = resolveCircuitNets(components, wires);
  const spiceComponents = convertToSpiceComponents(components, wires, nets, mode);
  const nodeMap = buildSpiceNodeMap(spiceComponents);
  const netlist = generateNetlist(spiceComponents, {
    analysis: SETTLE_ANALYSIS,
    simulationMode: mode,
  });
  const { vectors, log } = await runNgspiceWithLog(netlist);
  const results = parseSpiceResults(vectors, vectors.time ?? []);
  return {
    readings: buildSpiceInstrumentReadings(components, nets, nodeMap, results),
    nodeVoltage: (componentId: string, terminal: string) => {
      const node = nodeMap.nameFor(nets.netFor(componentId, terminal));
      return results.nodeVoltages[node.toLowerCase()]?.at(-1) ?? 0;
    },
    log,
  };
}

/**
 * 5 V -> switch -> 220 Ω -> LED -> ground — the reported defect — with a DCV DMM (loaded at 10 MΩ in
 * Practical mode) and an oscilloscope (an unloaded probe in both modes) across the LED. `removed`
 * deletes the switch and its two wires outright: the baseline an open switch must match exactly.
 */
function ledCircuit(switchState: "open" | "closed" | "removed"): {
  components: CircuitComponent[];
  wires: CircuitWire[];
} {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage: 5 }),
    ...(switchState === "removed" ? [] : [part("s1", "sw-spst-no", { state: switchState })]),
    part("r1", "resistor", { resistance: 220 }),
    part("d1", "led", { forwardVoltage: 2 }),
    part("dmm1", "dmm", { mode: "DCV" }),
    part("osc1", "oscilloscope"),
  ];
  const wires = [
    ...(switchState === "removed"
      ? []
      : [wire("w1", "v1", "pos", "s1", "a"), wire("w2", "s1", "b", "r1", "a")]),
    wire("w3", "r1", "b", "d1", "anode"),
    wire("w4", "d1", "cathode", "g", "gnd"),
    wire("w5", "v1", "neg", "g", "gnd"),
    wire("w6", "dmm1", "hi", "d1", "anode"),
    wire("w7", "dmm1", "com", "g", "gnd"),
    wire("w8", "osc1", "ch1", "d1", "anode"),
    wire("w9", "osc1", "gnd", "g", "gnd"),
  ];
  return { components, wires };
}

/** 5 V -> open switch -> capacitor -> ground, DMM across the capacitor: a subnet with no DC path. */
function isolatedCapacitorCircuit(): {
  components: CircuitComponent[];
  wires: CircuitWire[];
} {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage: 5 }),
    part("s1", "sw-spst-no", { state: "open" }),
    part("c1", "capacitor", { capacitance: 1e-6 }),
    part("dmm1", "dmm", { mode: "DCV" }),
  ];
  const wires = [
    wire("w1", "v1", "pos", "s1", "a"),
    wire("w2", "s1", "b", "c1", "a"),
    wire("w3", "c1", "b", "g", "gnd"),
    wire("w4", "v1", "neg", "g", "gnd"),
    wire("w5", "dmm1", "hi", "c1", "a"),
    wire("w6", "dmm1", "com", "g", "gnd"),
  ];
  return { components, wires };
}

describe("ngspice regression (real ngspice.wasm)", () => {
  beforeAll(async () => {
    await runNgspice("warmup\nV1 n1 0 DC 1\n.op\n.end\n");
  }, WASM_BOOT_TIMEOUT);

  describe("open-circuit ghost reading (defect 1)", () => {
    it.each(["practical", "academic"] as const)(
      "reads an open switch exactly like a removed one — 0 V on the DMM and the scope, in %s mode",
      async mode => {
        const openCircuit = ledCircuit("open");
        const removedCircuit = ledCircuit("removed");
        const open = await simulate(openCircuit.components, openCircuit.wires, mode);
        const removed = await simulate(removedCircuit.components, removedCircuit.wires, mode);

        expect(removed.readings.dmm1).toMatchObject({ status: "ready", value: 0 });
        expect(open.readings.dmm1).toMatchObject({ status: "ready", value: 0 });
        // The unloaded probe is where any leftover DC path across the contact shows up: a 1e12 Ω
        // "open" contact still put ~0.93 V on it through the LED's log law in Practical mode.
        expect(removed.readings["osc1:ch1"].value).toBe(0);
        expect(open.readings["osc1:ch1"].value).toBe(0);
      },
      RUN_TIMEOUT
    );

    it(
      "still forward-biases the LED normally with the switch closed (no regression)",
      async () => {
        const { components, wires } = ledCircuit("closed");
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.dmm1.status).toBe("ready");
        // A red LED's forward drop sits well below the 5 V rail and well above a floating reading.
        expect(readings.dmm1.value).toBeGreaterThan(0.5);
        expect(readings.dmm1.value).toBeLessThan(3);
      },
      RUN_TIMEOUT
    );

    it.each(["practical", "academic"] as const)(
      "ties a subnet the open switch isolated to 0 V cleanly, with no singular matrix, in %s mode",
      async mode => {
        const { components, wires } = isolatedCapacitorCircuit();
        const { readings, log } = await simulate(components, wires, mode);
        expect(readings.dmm1).toMatchObject({ status: "ready", value: 0 });
        expect(log).not.toMatch(/singular matrix/i);
      },
      RUN_TIMEOUT
    );
  });

  describe("LED colour presets", () => {
    // The exact scenario from a report of massive overshoot on this fit ("5V source, ~20mA load"):
    // R is sized per colour so the nominal Vf implies ~20mA, the same current the model is fitted
    // at, from a 5V rail. Not reproduced against this code: every colour below actually measures
    // within ~25mV of nominal (RS=1 Ω contributes the last ~20mV of that at 20mA, deliberately).
    const ledCircuitFor = (color: string) => {
      const forwardVoltage = LED_FORWARD_VOLTAGES[color];
      const resistance = Math.max(1, (5 - forwardVoltage) / 0.02);
      return {
        forwardVoltage,
        components: [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 5 }),
          part("r1", "resistor", { resistance }),
          // Exactly what the inspector writes when a student picks the preset: colour plus its voltage.
          part("d1", "led", { color, forwardVoltage }),
          part("dmm1", "dmm", { mode: "DCV" }),
        ],
        wires: [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "d1", "anode"),
          wire("w3", "d1", "cathode", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "dmm1", "hi", "d1", "anode"),
          wire("w6", "dmm1", "com", "g", "gnd"),
        ],
      };
    };

    const ledDrop = async (color: string) => {
      const { components, wires } = ledCircuitFor(color);
      const { readings } = await simulate(components, wires, "practical");
      expect(readings.dmm1.status).toBe("ready");
      return readings.dmm1.value;
    };

    it.each(Object.keys(LED_FORWARD_VOLTAGES))(
      "drops within 50 mV of the %s preset's nominal Vf at its own ~20 mA bias",
      async color => {
        const nominal = LED_FORWARD_VOLTAGES[color];
        const measured = await ledDrop(color);
        expect(
          Math.abs(measured - nominal),
          `${color}: measured ${measured} V against a nominal ${nominal} V (not the reported ~1.6-2.0 V overshoot)`
        ).toBeLessThan(0.05);
      },
      RUN_TIMEOUT
    );

    it(
      "separates the colours, instead of every LED simulating alike",
      async () => {
        const [violet, red, white] = [await ledDrop("violet"), await ledDrop("red"), await ledDrop("white")];
        expect(red - violet).toBeGreaterThan(0.4);
        expect(white - red).toBeGreaterThan(1.5);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Academic-mode convergence (defect 3)", () => {
    it(
      "solves an ideal diode directly across a source with no series resistance",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 5 }),
          part("d1", "diode-ideal"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "d1", "anode"),
          wire("w2", "d1", "cathode", "g", "gnd"),
          wire("w3", "v1", "neg", "g", "gnd"),
        ];
        await expect(simulate(components, wires, "academic")).resolves.toBeDefined();
      },
      RUN_TIMEOUT
    );

    it(
      "latches an SCR on gate current and holds the anode down",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("rl", "resistor", { resistance: 100 }),
          part("vg", "dc-voltage", { voltage: 5 }),
          // Low enough that RGK (the macro's 1 kΩ gate-cathode shunt) doesn't starve the gate of
          // the current needed to regenerate the latch.
          part("rg", "resistor", { resistance: 470 }),
          part("scr1", "scr"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "rl", "a"),
          wire("w2", "rl", "b", "scr1", "anode"),
          wire("w3", "scr1", "cathode", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "vg", "pos", "rg", "a"),
          wire("w6", "rg", "b", "scr1", "gate"),
          wire("w7", "vg", "neg", "g", "gnd"),
        ];
        const { nodeVoltage } = await simulate(components, wires, "academic");
        // Latched: the anode collapses to near the cathode, not the 12 V rail.
        expect(nodeVoltage("scr1", "anode")).toBeLessThan(2);
      },
      RUN_TIMEOUT
    );

    it(
      "latches a TRIAC on gate current in either main-terminal direction",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("rl", "resistor", { resistance: 100 }),
          part("vg", "dc-voltage", { voltage: 5 }),
          part("rg", "resistor", { resistance: 10_000 }),
          part("tr1", "triac"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "rl", "a"),
          wire("w2", "rl", "b", "tr1", "t1"),
          wire("w3", "tr1", "t2", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "vg", "pos", "rg", "a"),
          wire("w6", "rg", "b", "tr1", "gate"),
          wire("w7", "vg", "neg", "g", "gnd"),
        ];
        const { nodeVoltage } = await simulate(components, wires, "academic");
        expect(nodeVoltage("tr1", "t1")).toBeLessThan(2);
      },
      RUN_TIMEOUT
    );
  });

  describe("ideal circular Voltmeter and Ammeter", () => {
    it(
      "reads the full open-circuit potential across an open switch without drawing current",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("s1", "sw-spst-no", { state: "open" }),
          part("r2", "resistor", { resistance: 1000 }),
          part("vm1", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "r1", "b", "s1", "a"),
          wire("w3", "s1", "b", "r2", "a"),
          wire("w4", "r2", "b", "g", "gnd"),
          wire("w5", "v1", "neg", "g", "gnd"),
          wire("w6", "vm1", "pos", "s1", "a"),
          wire("w7", "vm1", "neg", "s1", "b"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        // No current flows anywhere with the switch open, so R1 drops nothing: the ideal voltmeter
        // reads the full 12 V rail across the open contact, not a loaded-down fraction of it.
        expect(readings.vm1.status).toBe("ready");
        expect(readings.vm1.value).toBeCloseTo(12, 2);
      },
      RUN_TIMEOUT
    );

    it(
      "reads a high-impedance divider node without disturbing it, unlike the 10 MΩ-loaded DMM in the same spot",
      async () => {
        // Two otherwise-identical 1 MΩ/1 MΩ dividers, differing only in which meter reads the
        // midpoint — a shared circuit would have the DMM's own real loading shift what the
        // voltmeter reads too, so isolating each meter is what actually tests "no load of its own".
        const divider = (meter: CircuitComponent) => ({
          components: [
            part("g", "ground"),
            part("v1", "dc-voltage", { voltage: 10 }),
            part("r1", "resistor", { resistance: 1_000_000 }),
            part("r2", "resistor", { resistance: 1_000_000 }),
            meter,
          ],
          wires: [
            wire("w1", "v1", "pos", "r1", "a"),
            wire("w2", "r1", "b", "r2", "a"),
            wire("w3", "r2", "b", "g", "gnd"),
            wire("w4", "v1", "neg", "g", "gnd"),
            wire("w5", meter.id, meter.type === "dmm" ? "hi" : "pos", "r1", "b"),
            wire("w6", meter.id, meter.type === "dmm" ? "com" : "neg", "g", "gnd"),
          ],
        });
        const withVoltmeter = divider(part("vm1", "voltmeter"));
        const withDmm = divider(part("dmm1", "dmm", { mode: "DCV" }));
        const [voltmeterRun, dmmRun] = await Promise.all([
          simulate(withVoltmeter.components, withVoltmeter.wires, "practical"),
          simulate(withDmm.components, withDmm.wires, "practical"),
        ]);
        // Ideal: within a few mV of the exact, unloaded 5 V midpoint — the node's own impedance is
        // undisturbed by the voltmeter's presence.
        expect(voltmeterRun.readings.vm1.value).toBeCloseTo(5, 2);
        // The DMM's documented 10 MΩ load pulls the very same node meaningfully low when it is the
        // one doing the reading — the contrast that proves the voltmeter carries no load of its own.
        expect(dmmRun.readings.dmm1.value).toBeLessThan(4.8);
      },
      RUN_TIMEOUT
    );

    it(
      "carries the exact theoretical branch current in series with a resistor, with zero burden voltage",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 12 }),
          part("am1", "ammeter"),
          part("r1", "resistor", { resistance: 1000 }),
        ];
        const wires = [
          wire("w1", "v1", "pos", "am1", "pos"),
          wire("w2", "am1", "neg", "r1", "a"),
          wire("w3", "r1", "b", "g", "gnd"),
          wire("w4", "v1", "neg", "g", "gnd"),
        ];
        const { readings, nodeVoltage } = await simulate(components, wires, "practical");
        // I = V / R = 12 V / 1 kΩ = 12 mA, conventional current entering the ammeter's "pos" terminal.
        expect(readings.am1.status).toBe("ready");
        // Positive: conventional current genuinely enters "pos" here, not just matches in magnitude.
        expect(readings.am1.value).toBeCloseTo(0.012, 5);
        // Zero burden voltage: the ammeter's own two terminals sit at the same potential.
        expect(nodeVoltage("am1", "pos") - nodeVoltage("am1", "neg")).toBeCloseTo(0, 6);
      },
      RUN_TIMEOUT
    );
  });
});
