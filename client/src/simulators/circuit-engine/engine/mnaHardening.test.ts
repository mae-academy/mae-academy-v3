import { describe, expect, it } from "vitest";

import type { CircuitComponent, CircuitWire } from "@/simulators/circuit-engine/models/circuitTypes";
import { getDef } from "@/simulators/circuit-engine/models/componentDefs";
import {
  convertToSpiceComponents,
  resolveCircuitNets,
  type SimulationMode,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import { generateNetlist } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import {
  DEFAULT_GMIN,
  SingularMatrixError,
  criticalVoltage,
  limitJunctionVoltage,
  luFactorize,
  luSolve,
  solveDcOperatingPoint,
  stampGmin,
  type HardenedElement,
} from "@/simulators/circuit-engine/engine/mnaHardening";

describe("stampGmin", () => {
  it("shunts every node row to ground and leaves branch-current rows alone", () => {
    const matrix = [
      [1, 0, 1],
      [0, 0, 0],
      [1, 0, 0],
    ];
    stampGmin(matrix, 2, 1e-12);
    expect(matrix).toEqual([
      [1 + 1e-12, 0, 1],
      [0, 1e-12, 0],
      [1, 0, 0],
    ]);
  });
});

describe("luFactorize / luSolve", () => {
  it("pivots through the zero diagonal of an MNA voltage-source row", () => {
    // 10 V source on node a, 1 kΩ to ground: unknowns [v(a), i(V1)].
    const system = luFactorize([
      [1e-3, 1],
      [1, 0],
    ]);
    const [va, iv] = luSolve(system, [0, 10]);
    expect(va).toBeCloseTo(10, 12);
    expect(iv).toBeCloseTo(-0.01, 12);
  });

  it("names the floating node when its row is empty", () => {
    const factor = () => luFactorize([[1e-3, 0], [0, 0]], { labels: ["n1", "n2"] });
    expect(factor).toThrow(SingularMatrixError);
    expect(factor).toThrow(/"n2" is undetermined/);
  });

  it("solves the same floating node to 0 V once GMIN is stamped", () => {
    const matrix = [[1e-3, 0], [0, 0]];
    stampGmin(matrix, 2, DEFAULT_GMIN);
    // The 1e-12 S shunt loads the driven node by one part in 1e9 — the price of a defined solution.
    expect(luSolve(luFactorize(matrix), [1e-3, 0])).toEqual([expect.closeTo(1, 8), 0]);
  });

  it("judges a GMIN-sized row on its own scale, not against kilosiemens elsewhere", () => {
    const matrix = [[1e3, -1e3, 0], [-1e3, 1e3 + 1e-3, 0], [0, 0, 1e-12]];
    expect(() => luFactorize(matrix)).not.toThrow();
  });

  it("reports the redundant branch of two ideal sources across one node pair", () => {
    // v(a) with branches i(V1), i(V2): KVL twice on the same pair is rank-deficient.
    const factor = () =>
      luFactorize(
        [
          [0, 1, 1],
          [1, 0, 0],
          [1, 0, 0],
        ],
        { labels: ["a", "i(V1)", "i(V2)"] }
      );
    expect(factor).toThrow(SingularMatrixError);
  });
});

describe("limitJunctionVoltage", () => {
  const nVt = 0.0258649;
  const vCrit = criticalVoltage(nVt, 1e-14);

  it("leaves reverse bias and small forward steps untouched", () => {
    expect(limitJunctionVoltage(-5, 0.6, nVt, vCrit)).toEqual({ voltage: -5, limited: false });
    expect(limitJunctionVoltage(0.62, 0.6, nVt, vCrit)).toEqual({ voltage: 0.62, limited: false });
  });

  it("turns a forward jump past vCrit into a logarithmic increment", () => {
    const { voltage, limited } = limitJunctionVoltage(5, 0.6, nVt, vCrit);
    expect(limited).toBe(true);
    expect(voltage).toBeCloseTo(0.6 + nVt * Math.log(1 + 4.4 / nVt), 12);
    expect(voltage).toBeLessThan(0.75);
  });
});

/* ------------------------------------------------------------------- Reference ballast loop --- */

const part = (id: string, type: string, overrides: Record<string, unknown> = {}, label = id): CircuitComponent => {
  const definition = getDef(type);
  const defaults = definition
    ? Object.fromEntries(Object.entries(definition.properties).map(([key, property]) => [key, property.value]))
    : {};
  return { id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label, props: { ...defaults, ...overrides } };
};
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({
  id, fromComp, fromTerm, toComp, toTerm, path: [[0, 0], [20, 0]], routing: "orthogonal",
});

/** `KEY=value` pairs of the `.MODEL` card whose name starts with `prefix`, as the generator emits it. */
function modelCard(netlist: string, prefix: string): Record<string, number> {
  const card = netlist.split("\n").find(line => line.startsWith(`.MODEL ${prefix}`));
  if (!card) throw new Error(`no ${prefix} model in:\n${netlist}`);
  return Object.fromEntries(
    Array.from(card.matchAll(/(\w+)=([-+\d.eE]+)/g), ([, key, value]) => [key.toUpperCase(), Number(value)])
  );
}

/**
 * The corrected topology — an explicit series ballast bounds the loop current:
 *
 *        RINT 10 mΩ   SW1 (closed)      R1 (ballast)
 *   V1 ─┬──/\/\──── n2 ──o  o── n3 ───/\/\/\─── n4 ──►|── gnd
 *   5 V │                                          D1 (red LED, Vf 2 V @ 20 mA)
 *      gnd
 *
 * The model parameters are read back from the netlist the real adapter/generator emit for each
 * mode, and every expected value was measured with the vendored ngspice-wasm at its default
 * tolerances (RELTOL = 1e-3):
 *
 *   mode       R1      V(n3)       V(n4) = LED       I(loop)
 *   Practical  220 Ω   4.999850 V  1.997673 V       13.64626 mA
 *   Practical  1 kΩ    4.999966 V  1.916803 V        3.083163 mA
 *   Academic   220 Ω   4.999774 V  0.03678965 V     22.55902 mA
 *   Academic   1 kΩ    4.999950 V  0.03483139 V      4.965119 mA
 *
 * Academic's LED is a near-ideal junction (N = 0.05 ⇒ N·Vt ≈ 1.3 mV), hence ≈ 37 mV rather than
 * a 0.7 V textbook drop. The hardened solver must land inside ngspice's own RELTOL band of these.
 */
function referenceLoop(mode: SimulationMode, ballast: number, closed = true): HardenedElement[] {
  const components = [
    part("g", "ground"),
    part("v", "dc-voltage", { voltage: 5 }, "V1"),
    part("sw", "sw-spst-no", { state: closed ? "closed" : "open" }, "SW1"),
    part("r1", "resistor", { resistance: ballast }, "R1"),
    part("d1", "led", { forwardVoltage: 2 }, "D1"),
  ];
  const wires = [
    wire("w1", "v", "pos", "sw", "a"),
    wire("w2", "sw", "b", "r1", "a"),
    wire("w3", "r1", "b", "d1", "anode"),
    wire("w4", "d1", "cathode", "g", "gnd"),
    wire("w5", "v", "neg", "g", "gnd"),
  ];
  const netlist = generateNetlist(
    convertToSpiceComponents(components, wires, resolveCircuitNets(components, wires), mode),
    { simulationMode: mode }
  );
  const led = modelCard(netlist, "D_LED");
  const contact = modelCard(netlist, "SW_MANUAL");
  const internalResistance = Number(getDef("dc-voltage")?.properties.internalR?.value);
  return [
    { kind: "voltage-source", id: "V1", positive: "n1", negative: "0", voltage: 5 },
    { kind: "resistor", id: "RINT", a: "n2", b: "n1", resistance: internalResistance },
    { kind: "switch", id: "SW1", a: "n2", b: "n3", closed, onResistance: contact.RON, offResistance: contact.ROFF },
    { kind: "resistor", id: "R1", a: "n3", b: "n4", resistance: ballast },
    { kind: "diode", id: "D1", anode: "n4", cathode: "0", saturationCurrent: led.IS, emission: led.N, seriesResistance: led.RS },
  ];
}

describe("solveDcOperatingPoint", () => {
  it("solves a resistive divider exactly", () => {
    const result = solveDcOperatingPoint([
      { kind: "voltage-source", id: "V1", positive: "a", negative: "0", voltage: 12 },
      { kind: "resistor", id: "R1", a: "a", b: "b", resistance: 1000 },
      { kind: "resistor", id: "R2", a: "b", b: "0", resistance: 2000 },
    ]);
    expect(result.converged).toBe(true);
    // Exact up to the 1e-12 S node shunts, which load each node by about one part in 1e9.
    expect(result.nodeVoltages.b).toBeCloseTo(8, 7);
    expect(result.branchCurrents.V1).toBeCloseTo(-0.004, 9);
  });

  it.each([
    ["practical", 220, 4.99985, 1.997673, 0.01364626, 3e-3],
    ["practical", 1000, 4.999966, 1.916803, 0.003083163, 3e-3],
    ["academic", 220, 4.999774, 0.03678965, 0.02255902, 5e-5],
    ["academic", 1000, 4.99995, 0.03483139, 0.004965119, 5e-5],
  ] as const)("reproduces ngspice on the ballasted LED loop: %s, %d Ω", (mode, ballast, vSwitch, vLed, current, tolerance) => {
    const result = solveDcOperatingPoint(referenceLoop(mode, ballast));

    expect(result.converged).toBe(true);
    expect(result.clampedJunctions).toEqual([]);
    expect(Math.abs(result.nodeVoltages.n3 - vSwitch)).toBeLessThan(1e-5);
    expect(Math.abs(result.nodeVoltages.n4 - vLed)).toBeLessThan(tolerance);
    expect(Math.abs(-result.branchCurrents.V1 - current)).toBeLessThan(1e-3 * current);
  });

  it("reproduces the open-switch leakage potential the instrument layer has to clamp", () => {
    // ROFF (1 GΩ) feeding the LED's exponential settles it near 1.27 V on ~3.7 nA — ngspice: 1.26555 V.
    const result = solveDcOperatingPoint(referenceLoop("practical", 220, false));
    expect(result.converged).toBe(true);
    expect(result.nodeVoltages.n4).toBeCloseTo(1.2656, 2);
    expect(-result.branchCurrents.V1).toBeLessThan(1e-8);
  });

  it("flags a junction whose current only the numerical clamp bounds", () => {
    // An ideal source straight across an Academic junction: no RINT, no contact, no ballast.
    const result = solveDcOperatingPoint([
      { kind: "voltage-source", id: "V1", positive: "a", negative: "0", voltage: 5 },
      { kind: "diode", id: "D1", anode: "a", cathode: "0", saturationCurrent: 1e-14, emission: 0.05 },
    ]);
    expect(result.clampedJunctions).toEqual(["D1"]);
    expect(Object.values(result.nodeVoltages).every(Number.isFinite)).toBe(true);
  });

  it("keeps an island an ideally-open switch cut loose at 0 V with GMIN, and names it without", () => {
    // f1–f2 touches nothing else: an ideal open contact leaves no element between it and V1.
    const island: HardenedElement[] = [
      { kind: "voltage-source", id: "V1", positive: "a", negative: "0", voltage: 5 },
      { kind: "resistor", id: "R1", a: "a", b: "0", resistance: 1000 },
      { kind: "resistor", id: "R2", a: "f1", b: "f2", resistance: 1000 },
    ];

    const shunted = solveDcOperatingPoint(island);
    expect(shunted.nodeVoltages.f1).toBe(0);
    expect(shunted.nodeVoltages.f2).toBe(0);
    expect(() => solveDcOperatingPoint(island, { gmin: 0 })).toThrow(/"f2" is undetermined/);
  });

  it("throws on a loop of ideal voltage sources instead of returning garbage", () => {
    expect(() =>
      solveDcOperatingPoint([
        { kind: "voltage-source", id: "V1", positive: "a", negative: "0", voltage: 5 },
        { kind: "voltage-source", id: "V2", positive: "a", negative: "0", voltage: 3 },
      ])
    ).toThrow(SingularMatrixError);
  });
});
