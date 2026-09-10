import { describe, expect, it } from "vitest";

import type {
  CircuitComponent,
  CircuitWire,
} from "@/simulators/circuit-engine/models/circuitTypes";
import { getDef } from "@/simulators/circuit-engine/models/componentDefs";
import {
  convertToSpiceComponents,
  resolveCircuitNets,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import {
  MIN_BALLAST_RESISTANCE,
  runPreflightDrc,
} from "@/simulators/circuit-engine/engine/spice/preflightDrc";

/** Canvas part carrying the catalog's defaults — a DC source keeps its 10 mΩ internal resistance, as placed in the app. */
const part = (
  id: string,
  type: string,
  overrides: Record<string, unknown> = {},
  label = id
): CircuitComponent => {
  const definition = getDef(type);
  const defaults = definition
    ? Object.fromEntries(Object.entries(definition.properties).map(([key, property]) => [key, property.value]))
    : {};
  return { id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label, props: { ...defaults, ...overrides } };
};

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

function drc(components: CircuitComponent[], wires: CircuitWire[]) {
  const nets = resolveCircuitNets(components, wires);
  const labels = new Map(components.map(component => [component.id, component.label]));
  return runPreflightDrc(convertToSpiceComponents(components, wires, nets), {
    labelOf: id => labels.get(id) ?? id,
  });
}

interface LedLoopOptions {
  switchState?: "open" | "closed";
  ballast?: number | null;
  reversed?: boolean;
  source?: Record<string, unknown> & { type?: "dc-voltage" | "ac-voltage" };
}

/** Source → SW1 → [R1] → D1 (2 V LED) → ground. */
function ledLoop({ switchState = "closed", ballast = null, reversed = false, source = {} }: LedLoopOptions = {}) {
  const { type = "dc-voltage", ...sourceProps } = source;
  const components = [
    part("g", "ground"),
    part("v", type, type === "dc-voltage" ? { voltage: 5, ...sourceProps } : sourceProps, "V1"),
    part("sw", "sw-spst-no", { state: switchState }, "SW1"),
    part("d1", "led", { forwardVoltage: 2 }, "D1"),
    ...(ballast === null ? [] : [part("r1", "resistor", { resistance: ballast }, "R1")]),
  ];
  const [nearSwitch, nearGround] = reversed ? ["cathode", "anode"] : ["anode", "cathode"];
  const wires = [
    wire("w1", "v", "pos", "sw", "a"),
    ...(ballast === null
      ? [wire("w2", "sw", "b", "d1", nearSwitch)]
      : [wire("w2", "sw", "b", "r1", "a"), wire("w3", "r1", "b", "d1", nearSwitch)]),
    wire("w4", "d1", nearGround, "g", "gnd"),
    wire("w5", "v", "neg", "g", "gnd"),
  ];
  return drc(components, wires);
}

describe("runPreflightDrc", () => {
  it("flags the reported topology: 5 V → closed switch → LED with no ballast", () => {
    const [violation, ...rest] = ledLoop();

    expect(rest).toEqual([]);
    expect(violation.rule).toBe("unballasted-junction");
    expect(violation.sourceId).toBe("v");
    expect(violation.pathIds).toEqual(["sw", "d1"]);
    expect(violation.loopResistance).toBeCloseTo(0.01, 12); // only V1's default internal resistance
    expect(violation.suggestedBallast).toBe(150); // (5 V − 2 V) / 20 mA
    expect(violation.message).toMatch(/D1 is forward-biased by V1 through SW1 → D1/);
  });

  it.each([220, 1000])("passes the corrected topology with a %d Ω ballast", ballast => {
    expect(ledLoop({ ballast })).toEqual([]);
  });

  it("passes an open switch: no loop, nothing to bound", () => {
    expect(ledLoop({ switchState: "open" })).toEqual([]);
  });

  it("passes a reverse-biased LED on a DC source", () => {
    expect(ledLoop({ reversed: true })).toEqual([]);
  });

  it("flags a reverse-biased LED on an AC source: the negative half-cycle forward-biases it", () => {
    const [violation] = ledLoop({ reversed: true, source: { type: "ac-voltage" } });

    expect(violation.rule).toBe("unballasted-junction");
    expect(violation.pathIds).toEqual(["d1", "sw"]);
  });

  it("counts a source's own internal resistance as ballast once it reaches the threshold", () => {
    expect(ledLoop({ source: { internalR: MIN_BALLAST_RESISTANCE } })).toEqual([]);
    expect(ledLoop({ source: { internalR: MIN_BALLAST_RESISTANCE / 2 } })).toHaveLength(1);
  });

  it("flags an ammeter wired straight across the supply as a short circuit", () => {
    const components = [
      part("g", "ground"),
      part("v", "dc-voltage", { voltage: 12 }, "V1"),
      part("am", "ammeter", {}, "A1"),
    ];
    const wires = [
      wire("w1", "v", "pos", "am", "pos"),
      wire("w2", "am", "neg", "g", "gnd"),
      wire("w3", "v", "neg", "g", "gnd"),
    ];

    const [violation] = drc(components, wires);

    expect(violation.rule).toBe("source-short");
    expect(violation.pathIds).toEqual(["am"]);
    expect(violation.message).toMatch(/V1 is short-circuited through A1/);
  });

  it("flags a zener driven past breakdown with no ballast, and passes one held below it", () => {
    const zenerAcross = (volts: number) =>
      drc(
        [
          part("g", "ground"),
          part("v", "dc-voltage", { voltage: volts }, "V1"),
          part("dz", "zener", { breakdownVoltage: 5.1 }, "DZ1"),
        ],
        [
          wire("w1", "v", "pos", "dz", "cathode"),
          wire("w2", "dz", "anode", "g", "gnd"),
          wire("w3", "v", "neg", "g", "gnd"),
        ]
      );

    expect(zenerAcross(3)).toEqual([]);
    const [violation] = zenerAcross(12);
    expect(violation.rule).toBe("unballasted-junction");
    expect(violation.suggestedBallast).toBeUndefined();
    expect(violation.message).toMatch(/220 Ω–1 kΩ/);
  });

  it("treats an inductor as a DC short but not as an AC one", () => {
    const acrossInductor = (source: CircuitComponent) =>
      drc(
        [part("g", "ground"), source, part("l1", "inductor", { dcr: 0 }, "L1")],
        [
          wire("w1", "v", "pos", "l1", "a"),
          wire("w2", "l1", "b", "g", "gnd"),
          wire("w3", "v", "neg", "g", "gnd"),
        ]
      );

    expect(acrossInductor(part("v", "dc-voltage", { voltage: 5 }, "V1"))[0]?.rule).toBe("source-short");
    expect(acrossInductor(part("v", "ac-voltage", {}, "V1"))).toEqual([]);
  });

  it("leaves paralleled supplies to the solver rather than reporting them", () => {
    const components = [
      part("g", "ground"),
      part("v", "dc-voltage", { voltage: 12 }, "V1"),
      part("v2", "dc-voltage", { voltage: 12 }, "V2"),
      part("r1", "resistor", { resistance: 100 }, "R1"),
    ];
    const wires = [
      wire("w1", "v", "pos", "v2", "pos"),
      wire("w2", "v2", "pos", "r1", "a"),
      wire("w3", "r1", "b", "g", "gnd"),
      wire("w4", "v", "neg", "g", "gnd"),
      wire("w5", "v2", "neg", "g", "gnd"),
    ];

    expect(drc(components, wires)).toEqual([]);
  });
});
