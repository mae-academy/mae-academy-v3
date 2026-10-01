import { describe, expect, it } from "vitest";

import type {
  CircuitComponent,
  CircuitWire,
} from "@shared/circuit/circuitTypes";
import {
  convertToSpiceComponents,
  probeBranchKey,
  resolveCircuitNets,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import { buildSpiceNodeMap } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import { parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";
import {
  buildSpiceInstrumentReadings,
  CURRENT_NOISE_FLOOR,
  VOLTAGE_NOISE_FLOOR,
} from "@/simulators/circuit-engine/engine/spice/spiceInstruments";

const part = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label: id.toUpperCase(),
  props,
});

const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({
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

/**
 * A DMM across a resistor, read back against hand-built result vectors, so each case pins down what
 * the reading layer does to a given solver output without depending on what ngspice returns.
 */
function readDmm(mode: string, vectorFor: (node: string) => Record<string, number[]>) {
  const components = [
    part("g", "ground"),
    part("r1", "resistor", { resistance: 1000 }),
    part("dmm1", "dmm", { mode }),
  ];
  const wires = [
    wire("w1", "r1", "b", "g", "gnd"),
    wire("w2", "dmm1", "hi", "r1", "a"),
    wire("w3", "dmm1", "com", "g", "gnd"),
  ];
  const nets = resolveCircuitNets(components, wires);
  const nodeMap = buildSpiceNodeMap(convertToSpiceComponents(components, wires, nets));
  const node = nodeMap.nameFor(nets.netFor("r1", "a"));
  const raw = vectorFor(node);
  const results = parseSpiceResults(raw, raw.time ?? []);
  return buildSpiceInstrumentReadings(components, nets, nodeMap, results).dmm1;
}

const TIME = Array.from({ length: 200 }, (_, i) => i * 1e-4);

describe("buildSpiceInstrumentReadings noise floor", () => {
  it("reads solver residue on an isolated node as exactly +0, whatever its sign", () => {
    for (const residue of [-1.5e-21, 2.5e-11, -(VOLTAGE_NOISE_FLOOR / 2), -0]) {
      const value = readDmm("DCV", node => ({ [`v(${node})`]: [residue] })).value;
      expect(Object.is(value, 0)).toBe(true);
    }
  });

  it("leaves any voltage at or above the solver's resolution untouched", () => {
    expect(readDmm("DCV", node => ({ [`v(${node})`]: [2e-6] })).value).toBe(2e-6);
    expect(readDmm("DCV", node => ({ [`v(${node})`]: [-VOLTAGE_NOISE_FLOOR] })).value).toBe(-VOLTAGE_NOISE_FLOOR);
    expect(readDmm("DCV", node => ({ [`v(${node})`]: [1.265] })).value).toBe(1.265);
  });

  it("clamps an AC reading's RMS of pure residue to 0", () => {
    const value = readDmm("ACV", node => ({
      time: TIME,
      [`v(${node})`]: TIME.map((_, i) => (i % 2 === 0 ? 3e-11 : -3e-11)),
    })).value;
    expect(value).toBe(0);
  });

  it("reports no frequency for a trace that is only residue, instead of counting noise crossings", () => {
    const value = readDmm("HZ", node => ({
      time: TIME,
      [`v(${node})`]: TIME.map(t => 2e-11 * Math.sin(2 * Math.PI * 1000 * t)),
    })).value;
    expect(value).toBe(0);
  });

  it("still measures the frequency of a real signal", () => {
    const value = readDmm("HZ", node => ({
      time: TIME,
      [`v(${node})`]: TIME.map(t => 5 * Math.sin(2 * Math.PI * 500 * t)),
    })).value;
    expect(value).toBeCloseTo(500, 0);
  });

  it("clamps branch-current residue below ngspice's ABSTOL but keeps a real current", () => {
    const current = (amps: number) =>
      readDmm("DCA", () => ({ [`i(${probeBranchKey("dmm1")})`]: [amps] })).value;
    expect(current(CURRENT_NOISE_FLOOR / 10)).toBe(0);
    expect(current(0.02)).toBe(0.02);
  });
});
