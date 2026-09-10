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
});
