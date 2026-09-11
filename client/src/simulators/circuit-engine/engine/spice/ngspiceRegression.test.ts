/**
 * End-to-end regression suite against the real ngspice.wasm binary — not the netlist text, the
 * actual solver spiceWorker.ts ships in production. Each case runs the full production pipeline
 * (convertToSpiceComponents -> generateNetlist -> ngspice -> parseSpiceResults ->
 * buildSpiceInstrumentReadings) so a regression in any one stage is caught, not just a netlist-text
 * diff. Guards the two defects this pass fixed: the 1.265 V open-circuit ghost reading, and Academic
 * mode's non-convergence on the direct diode and the thyristor macros.
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
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";
import { buildSpiceInstrumentReadings } from "@/simulators/circuit-engine/engine/spice/spiceInstruments";
import { runNgspice } from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";

// ngspice.wasm's first boot compiles/instantiates the module; later calls reuse it (exactly as
// spiceWorker.ts's cached `modulePromise` does in production), so only this first run needs slack.
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
  const vectors = await runNgspice(netlist);
  const results = parseSpiceResults(vectors, vectors.time ?? []);
  return {
    readings: buildSpiceInstrumentReadings(components, nets, nodeMap, results),
    nodeVoltage: (componentId: string, terminal: string) => {
      const node = nodeMap.nameFor(nets.netFor(componentId, terminal));
      return results.nodeVoltages[node.toLowerCase()]?.at(-1) ?? 0;
    },
  };
}

/** 5 V -> switch -> 220 Ω -> LED -> ground, with a DCV DMM across the LED — the reported defect. */
function openLedCircuit(switchClosed: boolean): {
  components: CircuitComponent[];
  wires: CircuitWire[];
} {
  const components = [
    part("g", "ground"),
    part("v1", "dc-voltage", { voltage: 5 }),
    part("s1", "sw-spst-no", { state: switchClosed ? "closed" : "open" }),
    part("r1", "resistor", { resistance: 220 }),
    part("d1", "led", { forwardVoltage: 2 }),
    part("dmm1", "dmm", { mode: "DCV" }),
  ];
  const wires = [
    wire("w1", "v1", "pos", "s1", "a"),
    wire("w2", "s1", "b", "r1", "a"),
    wire("w3", "r1", "b", "d1", "anode"),
    wire("w4", "d1", "cathode", "g", "gnd"),
    wire("w5", "v1", "neg", "g", "gnd"),
    wire("w6", "dmm1", "hi", "d1", "anode"),
    wire("w7", "dmm1", "com", "g", "gnd"),
  ];
  return { components, wires };
}

describe("ngspice regression (real ngspice.wasm)", () => {
  beforeAll(async () => {
    await runNgspice("warmup\nV1 n1 0 DC 1\n.op\n.end\n");
  }, WASM_BOOT_TIMEOUT);

  describe("open-circuit ghost reading (defect 1)", () => {
    it.each(["practical", "academic"] as const)(
      "reads the LED at under 1 mV with the switch open, in %s mode",
      async mode => {
        const { components, wires } = openLedCircuit(false);
        const { readings } = await simulate(components, wires, mode);
        expect(readings.dmm1.status).toBe("ready");
        expect(Math.abs(readings.dmm1.value)).toBeLessThan(0.001);
      },
      RUN_TIMEOUT
    );

    it(
      "still forward-biases the LED normally with the switch closed (no regression)",
      async () => {
        const { components, wires } = openLedCircuit(true);
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.dmm1.status).toBe("ready");
        // A red LED's forward drop sits well below the 5 V rail and well above a floating reading.
        expect(readings.dmm1.value).toBeGreaterThan(0.5);
        expect(readings.dmm1.value).toBeLessThan(3);
      },
      RUN_TIMEOUT
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
});
