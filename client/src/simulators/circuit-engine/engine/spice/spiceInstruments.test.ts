import { describe, expect, it } from "vitest";

import type {
  CircuitComponent,
  CircuitWire,
} from "@/simulators/circuit-engine/models/circuitTypes";
import {
  convertToSpiceComponents,
  probeBranchKey,
  resolveCircuitNets,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import { buildSpiceNodeMap } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";
import { buildSpiceInstrumentReadings } from "@/simulators/circuit-engine/engine/spice/spiceInstruments";

const part = (
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  label = id
): CircuitComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label,
  props,
});

const wire = (
  id: string,
  fromComp: string,
  fromTerm: string,
  toComp: string,
  toTerm: string
): CircuitWire => ({
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
});

/** V1(5V) -> R1(1k) -> ground, with a DMM probing across R1's hi terminal to the ground rail. */
function dmmAcrossResistor(dmmProps: Record<string, unknown>) {
  const components = [
    part("g", "ground"),
    part("v", "dc-voltage", { voltage: 5, internalR: 0 }, "V1"),
    part("r1", "resistor", { resistance: 1000 }, "R1"),
    part("dmm1", "dmm", dmmProps, "DMM1"),
  ];
  const wires = [
    wire("w1", "v", "pos", "r1", "a"),
    wire("w2", "r1", "b", "g", "gnd"),
    wire("w3", "v", "neg", "g", "gnd"),
    wire("w4", "dmm1", "hi", "r1", "a"),
    wire("w5", "dmm1", "com", "g", "gnd"),
  ];
  const nets = resolveCircuitNets(components, wires);
  const spiceComponents = convertToSpiceComponents(components, wires, nets);
  const nodeMap = buildSpiceNodeMap(spiceComponents);
  return { components, nets, nodeMap };
}

/** A uniform 0..1s axis with `count` samples, so a 10% tail spans the last `count / 10` points. */
function timeAxis(count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => i / count);
}

/** V1(5V) -> SW1 -> R1(1k) -> D1(LED) -> ground, with a DMM across the LED — the exact reported
 * "opens a switch, DMM reads ~1.276 V instead of 0 V" topology. */
function openSwitchLedCircuit(switchState: "open" | "closed") {
  const components = [
    part("g", "ground"),
    part("v", "dc-voltage", { voltage: 5, internalR: 0 }, "V1"),
    part("sw", "sw-spst-no", { state: switchState }, "SW1"),
    part("r1", "resistor", { resistance: 220 }, "R1"),
    part("d1", "led", { forwardVoltage: 2 }, "D1"),
    part("dmm1", "dmm", { mode: "DCV" }, "DMM1"),
    part("dmm2", "dmm", { mode: "DCV" }, "DMM2"),
  ];
  const wires = [
    wire("w1", "v", "pos", "sw", "a"),
    wire("w2", "sw", "b", "r1", "a"),
    wire("w3", "r1", "b", "d1", "anode"),
    wire("w4", "d1", "cathode", "g", "gnd"),
    wire("w5", "v", "neg", "g", "gnd"),
    // DMM1: across the LED — floats to a leakage potential when the switch is open.
    wire("w6", "dmm1", "hi", "d1", "anode"),
    wire("w7", "dmm1", "com", "g", "gnd"),
    // DMM2: directly across the source — must read 5 V regardless of the switch elsewhere.
    wire("w8", "dmm2", "hi", "v", "pos"),
    wire("w9", "dmm2", "com", "g", "gnd"),
  ];
  const nets = resolveCircuitNets(components, wires);
  const spiceComponents = convertToSpiceComponents(components, wires, nets);
  const nodeMap = buildSpiceNodeMap(spiceComponents);
  return { components, nets, nodeMap };
}

describe("buildSpiceInstrumentReadings", () => {
  it("DCV reads the settled tail mean, not a ringing/artifact last sample", () => {
    const { components, nets, nodeMap } = dmmAcrossResistor({ mode: "DCV" });
    const hiNode = nodeMap.nameFor(nets.netFor("dmm1", "hi"));

    const time = timeAxis(100);
    // Settled at 5 V for the whole tail window except one artifact spike on the very last sample —
    // the kind of single-point Newton-Raphson/edge artifact a plain `vector.at(-1)` would report.
    const voltage = time.map((_, i) => (i === time.length - 1 ? 8 : 5));
    const results = parseSpiceResults({ time, [`v(${hiNode})`]: voltage }, time);

    const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

    expect(readings.dmm1.status).toBe("ready");
    expect(readings.dmm1.value).toBeGreaterThan(4.9);
    expect(readings.dmm1.value).toBeLessThan(6); // nowhere near the 8 V last-sample artifact
  });

  it("DCA rounds a sub-noise-floor leakage current to exactly 0", () => {
    const { components, nets, nodeMap } = dmmAcrossResistor({ mode: "DCA" });
    const branchKey = probeBranchKey("dmm1");

    const time = timeAxis(20);
    const leakage = time.map(() => 4e-13); // below the 1e-12 A noise floor
    const results = parseSpiceResults({ time, [`i(${branchKey})`]: leakage }, time);

    const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

    expect(readings.dmm1.status).toBe("ready");
    expect(readings.dmm1.value).toBe(0);
  });

  it("DCA reports a genuine steady current unrounded", () => {
    const { components, nets, nodeMap } = dmmAcrossResistor({ mode: "DCA" });
    const branchKey = probeBranchKey("dmm1");

    const time = timeAxis(20);
    const current = time.map(() => 0.005);
    const results = parseSpiceResults({ time, [`i(${branchKey})`]: current }, time);

    const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

    expect(readings.dmm1.value).toBeCloseTo(0.005, 9);
  });

  it("reads 'open' when the DMM's probes are not both wired", () => {
    const components = [
      part("g", "ground"),
      part("dmm1", "dmm", { mode: "DCV" }, "DMM1"),
    ];
    const wires: CircuitWire[] = [];
    const nets = resolveCircuitNets(components, wires);
    const spiceComponents = convertToSpiceComponents(components, wires, nets);
    const nodeMap = buildSpiceNodeMap(spiceComponents);
    const results = parseSpiceResults({}, []);

    const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

    expect(readings.dmm1.status).toBe("open");
  });

  it("leaves OHM and CONT keys unset so the legacy engine's own measurement keeps serving them", () => {
    const { components, nets, nodeMap } = dmmAcrossResistor({ mode: "OHM" });
    const results = parseSpiceResults({}, []);

    const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

    expect(readings.dmm1).toBeUndefined();

    const contReadings = buildSpiceInstrumentReadings(
      [...components.filter(c => c.id !== "dmm1"), part("dmm1", "dmm", { mode: "CONT" }, "DMM1")],
      nets,
      nodeMap,
      results
    );
    expect(contReadings.dmm1).toBeUndefined();
  });

  describe("floating-node clamp", () => {
    it("clamps a DMM across a load fed only through an open switch's ROFF leakage to exactly 0 V", () => {
      const { components, nets, nodeMap } = openSwitchLedCircuit("open");
      const anodeNode = nodeMap.nameFor(nets.netFor("d1", "anode"));

      const time = timeAxis(50);
      // The reported artifact: the LED settles at a deceptively large ~1.276 V on a leakage current
      // of a few nA through the switch's mandatory (netlistGenerator's ROFF) open-contact resistance.
      const voltage = time.map(() => 1.276);
      const results = parseSpiceResults({ time, [`v(${anodeNode})`]: voltage }, time);

      const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

      expect(readings.dmm1.status).toBe("ready");
      expect(readings.dmm1.value).toBe(0);
    });

    it("does not clamp a DMM directly across the source, even while another branch is open", () => {
      const { components, nets, nodeMap } = openSwitchLedCircuit("open");
      const anodeNode = nodeMap.nameFor(nets.netFor("d1", "anode"));
      const sourceNode = nodeMap.nameFor(nets.netFor("v", "pos"));

      const time = timeAxis(50);
      const results = parseSpiceResults(
        {
          time,
          [`v(${anodeNode})`]: time.map(() => 1.276),
          [`v(${sourceNode})`]: time.map(() => 5),
        },
        time
      );

      const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

      expect(readings.dmm1.value).toBe(0); // across the LED: floating, clamped
      expect(readings.dmm2.value).toBeCloseTo(5, 9); // across the source: authoritative, untouched
    });

    it("does not clamp the same LED reading once the switch is closed and current genuinely flows", () => {
      const { components, nets, nodeMap } = openSwitchLedCircuit("closed");
      const anodeNode = nodeMap.nameFor(nets.netFor("d1", "anode"));

      const time = timeAxis(50);
      // A real forward-conduction drop, reachable from the source through the now-closed switch.
      const results = parseSpiceResults({ time, [`v(${anodeNode})`]: time.map(() => 2.0) }, time);

      const readings = buildSpiceInstrumentReadings(components, nets, nodeMap, results);

      expect(readings.dmm1.value).toBeCloseTo(2.0, 9);
    });
  });
});
