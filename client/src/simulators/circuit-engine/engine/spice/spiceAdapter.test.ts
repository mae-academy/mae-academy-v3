import { describe, expect, it } from "vitest";

import type {
  CircuitComponent,
  CircuitWire,
} from "@/simulators/circuit-engine/models/circuitTypes";
import { generateNetlist } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import {
  convertToSpiceComponents,
  probeBranchKey,
  resolveCircuitNets,
  SpiceAdapterError,
} from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import type { SpiceComponent } from "@/simulators/circuit-engine/engine/spice/spiceTypes";

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

function find<K extends SpiceComponent["kind"]>(
  spice: SpiceComponent[],
  id: string,
  kind: K
): Extract<SpiceComponent, { kind: K }> {
  const match = spice.find(
    (item): item is Extract<SpiceComponent, { kind: K }> =>
      item.id === id && item.kind === kind
  );
  if (!match) throw new Error(`no ${kind} with id ${id}`);
  return match;
}

const ofKind = <K extends SpiceComponent["kind"]>(
  spice: SpiceComponent[],
  kind: K
): Extract<SpiceComponent, { kind: K }>[] =>
  spice.filter(
    (item): item is Extract<SpiceComponent, { kind: K }> => item.kind === kind
  );

const divider = () => ({
  components: [
    part("g", "ground"),
    part("v", "dc-voltage", { voltage: 10, internalR: 0 }, "V1"),
    part("r1", "resistor", { resistance: 1000 }, "R1"),
    part("r2", "resistor", { resistance: 1000 }, "R2"),
  ],
  wires: [
    wire("w1", "v", "pos", "r1", "a"),
    wire("w2", "r1", "b", "r2", "a"),
    wire("w3", "r2", "b", "g", "gnd"),
    wire("w4", "v", "neg", "g", "gnd"),
  ],
});

describe("resolveCircuitNets", () => {
  it("puts wired terminals on one net and ground on 0", () => {
    const { components, wires } = divider();
    const nets = resolveCircuitNets(components, wires);

    expect(nets.netFor("v", "pos")).toBe(nets.netFor("r1", "a"));
    expect(nets.netFor("r1", "b")).toBe(nets.netFor("r2", "a"));
    expect(nets.netFor("v", "neg")).toBe("0");
    expect(nets.netFor("r2", "b")).toBe("0");
  });
});

describe("convertToSpiceComponents", () => {
  it("maps a divider onto a deck with the canvas connectivity", () => {
    const { components, wires } = divider();
    const deck = generateNetlist(convertToSpiceComponents(components, wires), {
      title: "divider",
    });

    expect(deck.split("\n")).toEqual([
      "divider",
      "V1 n1 0 DC 10",
      "R1 n1 n2 1000",
      "R2 n2 0 1000",
      ".op",
      ".end",
      "",
    ]);
  });

  it("inserts a source's internal resistance in series", () => {
    const { components, wires } = divider();
    components[1] = part(
      "v",
      "dc-voltage",
      { voltage: 10, internalR: 0.5 },
      "V1"
    );
    const spice = convertToSpiceComponents(components, wires);

    const source = find(spice, "v", "dc-voltage");
    const internal = find(spice, "v:RINT", "resistor");
    expect(source.positive).toBe("internal:v:rint");
    expect(internal).toMatchObject({
      negative: "internal:v:rint",
      resistance: 0.5,
    });
    expect(internal.positive).toBe(find(spice, "r1", "resistor").positive);
  });

  it("references a DC rail to ground", () => {
    const spice = convertToSpiceComponents(
      [part("g", "ground"), part("rail", "dc-rail", { voltage: 24 })],
      []
    );
    expect(find(spice, "rail", "dc-voltage")).toMatchObject({
      negative: "0",
      voltage: 24,
    });
  });

  it("puts an inductor's winding resistance in series", () => {
    const spice = convertToSpiceComponents(
      [part("l", "inductor", { inductance: 0.01, dcr: 0.2 })],
      []
    );
    expect(find(spice, "l", "inductor").negative).toBe("internal:l:dcr");
    expect(find(spice, "l:DCR", "resistor")).toMatchObject({
      positive: "internal:l:dcr",
      resistance: 0.2,
    });
  });

  it("converts a rectangular AC phasor to amplitude and phase", () => {
    const spice = convertToSpiceComponents(
      [
        part("v", "ac-voltage", {
          format: "rectangular",
          real: 3,
          imag: 4,
          frequency: 50,
        }),
      ],
      []
    );
    const source = find(spice, "v", "ac-voltage");
    expect(source.amplitude).toBeCloseTo(5, 12);
    expect(source.phaseDegrees).toBeCloseTo(53.1301, 3);
    expect(source.frequency).toBe(50);
  });

  it("converts a polar phase given in radians to degrees", () => {
    const spice = convertToSpiceComponents(
      [
        part("v", "ac-voltage", {
          format: "polar",
          amplitude: 2,
          phase: Math.PI / 2,
          angleUnit: "radian",
        }),
      ],
      []
    );
    expect(find(spice, "v", "ac-voltage").phaseDegrees).toBeCloseTo(90, 12);
  });

  it("realises an inductive impedance at the circuit's AC frequency", () => {
    const spice = convertToSpiceComponents(
      [
        part("v", "ac-voltage", { frequency: 50 }),
        part("z", "impedance", { format: "rectangular", r: 3, x: 4 }),
      ],
      []
    );
    expect(find(spice, "z", "resistor")).toMatchObject({
      negative: "internal:z:z",
      resistance: 3,
    });
    const reactor = find(spice, "z:X", "inductor");
    expect(reactor.positive).toBe("internal:z:z");
    expect(reactor.inductance).toBeCloseTo(4 / (2 * Math.PI * 50), 12);
  });

  it("realises a capacitive impedance as a capacitor", () => {
    const spice = convertToSpiceComponents(
      [
        part("v", "ac-voltage", { frequency: 50 }),
        part("z", "impedance", { format: "rectangular", r: 0, x: -4 }),
      ],
      []
    );
    expect(ofKind(spice, "resistor")).toHaveLength(0);
    expect(find(spice, "z:X", "capacitor").capacitance).toBeCloseTo(
      1 / (2 * Math.PI * 50 * 4),
      12
    );
  });

  it("applies the legacy engines' switch conventions", () => {
    const closed = (type: string, state: string) =>
      find(
        convertToSpiceComponents([part("s", type, { state })], []),
        "s",
        "switch-spst"
      ).isClosed;

    expect(closed("sw-spst-no", "closed")).toBe(true);
    expect(closed("sw-spst-no", "open")).toBe(false);
    expect(closed("sw-spst-nc", "closed")).toBe(true);
    expect(closed("sw-spst-nc", "open")).toBe(false);
    expect(closed("pb-no", "released")).toBe(false);
    expect(closed("pb-no", "pressed")).toBe(true);
    expect(closed("pb-nc", "released")).toBe(true);
    expect(closed("pb-nc", "pressed")).toBe(false);
    expect(closed("circuit-breaker", "tripped")).toBe(false);
    expect(closed("fuse", "")).toBe(true);
  });

  it("maps an SPDT's open position and splits a DPDT into two throws", () => {
    const spdt = convertToSpiceComponents(
      [part("s", "sw-spdt", { state: "open" })],
      []
    );
    expect(find(spdt, "s", "switch-spdt").position).toBe("open");

    const dpdt = convertToSpiceComponents(
      [part("s", "sw-dpdt", { state: "b" })],
      []
    );
    expect(ofKind(dpdt, "switch-spdt").map(item => item.position)).toEqual([
      "b",
      "b",
    ]);
  });

  it("routes an NC-configured SPST relay's contact through normallyClosed", () => {
    const spice = convertToSpiceComponents(
      [
        part("k", "relay-spst", {
          coilVoltage: 12,
          coilR: 400,
          contactType: "NC",
        }),
      ],
      []
    );
    const relay = find(spice, "k", "relay");
    expect(relay.normallyOpen).toBeUndefined();
    expect(relay.normallyClosed).toBe(
      resolveCircuitNets([part("k", "relay-spst")], []).netFor("k", "no")
    );
    expect(relay).toMatchObject({
      coilResistance: 400,
      coilInductance: 4,
      pullInVoltage: 9,
    });
    expect(relay.dropOutVoltage).toBeCloseTo(5.4, 12);
  });

  it("replaces a forced relay's armature with manual contacts but keeps the coil load", () => {
    const spice = convertToSpiceComponents(
      [
        part("k", "relay-spdt", {
          coilVoltage: 12,
          coilR: 400,
          manualState: "closed",
        }),
      ],
      []
    );

    expect(ofKind(spice, "relay")).toHaveLength(0);
    expect(find(spice, "k:COILR", "resistor").resistance).toBe(400);
    expect(find(spice, "k:COILL", "inductor").inductance).toBe(4);
    expect(find(spice, "k:NO", "switch-spst").isClosed).toBe(true);
    expect(find(spice, "k:NC", "switch-spst").isClosed).toBe(false);
  });

  it("maps a contactor's three poles and both auxiliary contacts", () => {
    const spice = convertToSpiceComponents(
      [part("k", "contactor", { coilVoltage: 24 })],
      []
    );
    const contactor = find(spice, "k", "contactor");

    expect(contactor.poles).toHaveLength(3);
    expect(contactor.auxNormallyOpen).toBeDefined();
    expect(contactor.auxNormallyClosed).toBeDefined();
    expect(contactor.coilResistance).toBe(500);
    expect(contactor.pullInVoltage).toBe(18);
    expect(contactor.dropOutVoltage).toBeCloseTo(10.8, 12);
  });

  it("maps a two-pole relay onto a contactor sharing one coil", () => {
    const spice = convertToSpiceComponents(
      [part("k", "relay-dpst", { coilVoltage: 12 })],
      []
    );
    expect(find(spice, "k", "contactor").poles).toHaveLength(2);
  });

  it("drives a linked auxiliary contact from a non-loading coil across the relay's", () => {
    const components = [
      part("k", "relay-spdt", { coilVoltage: 12, coilR: 400 }, "K1"),
      part("aux", "aux-contact-no", { linkedTo: "K1" }),
    ];
    const spice = convertToSpiceComponents(components, []);
    const nets = resolveCircuitNets(components, []);
    const sense = find(spice, "aux", "relay");

    expect(sense.coilPositive).toBe(nets.netFor("k", "coil+"));
    expect(sense.coilNegative).toBe(nets.netFor("k", "coil-"));
    expect(sense.coilResistance).toBe(1e9);
    expect(sense.pullInVoltage).toBe(9);
    expect(sense.normallyOpen).toBe(nets.netFor("aux", "b"));
  });

  it("treats an unlinked auxiliary contact as seeing a released coil", () => {
    const no = convertToSpiceComponents(
      [part("a", "aux-contact-no", { linkedTo: "missing" })],
      []
    );
    const nc = convertToSpiceComponents(
      [part("a", "aux-contact-nc", { linkedTo: "missing" })],
      []
    );
    expect(find(no, "a", "switch-spst").isClosed).toBe(false);
    expect(find(nc, "a", "switch-spst").isClosed).toBe(true);
  });

  it("bleeds only a floating transformer winding to ground", () => {
    const components = [
      part("g", "ground"),
      part("t", "transformer", { turnRatio: 5 }),
    ];
    const spice = convertToSpiceComponents(components, [
      wire("w", "t", "p2", "g", "gnd"),
    ]);
    const bleeds = ofKind(spice, "resistor");

    expect(find(spice, "t", "transformer")).toMatchObject({
      turnsRatio: 5,
      primaryInductance: 10,
    });
    expect(bleeds).toHaveLength(1);
    expect(bleeds[0]).toMatchObject({
      positive: resolveCircuitNets(components, []).netFor("t", "s2"),
      negative: "0",
      resistance: 1e9,
    });
  });

  it("bonds an autotransformer's duplicated terminals as the legacy engine does", () => {
    const components = [part("t", "autotransformer", { turnRatio: 2 })];
    const spice = convertToSpiceComponents(components, []);
    const nets = resolveCircuitNets(components, []);

    expect(find(spice, "t", "autotransformer")).toMatchObject({
      input: nets.netFor("t", "in1"),
      tap: nets.netFor("t", "tap"),
      common: nets.netFor("t", "in2"),
    });
    expect(find(spice, "t:OUT1", "resistor")).toMatchObject({
      positive: nets.netFor("t", "in1"),
      negative: nets.netFor("t", "out1"),
      resistance: 1e-6,
    });
    expect(find(spice, "t:OUT2", "resistor").negative).toBe(
      nets.netFor("t", "out2")
    );
  });

  it("derives DC motor constants that draw rated current at the rated point", () => {
    const motor = find(
      convertToSpiceComponents(
        [part("m", "motor-dc", { nominalV: 12, nominalPower: 100 })],
        []
      ),
      "m",
      "dc-motor"
    );
    // Steady state: ia = V / (Ra + Ke·Kt / B).
    const current =
      12 /
      (motor.armatureResistance +
        (motor.backEmfConstant * motor.torqueConstant) / motor.viscousFriction);
    expect(current).toBeCloseTo(100 / 12, 9);
  });

  it("inserts an ammeter as a 0 V sense source found by its component id", () => {
    const spice = convertToSpiceComponents([part("am-1", "ammeter")], []);
    const probe = find(spice, "am-1", "dc-voltage");

    expect(probe).toMatchObject({ label: "VPROBE_am_1", voltage: 0 });
    expect(probeBranchKey("am-1")).toBe("vprobe_am_1");
  });

  it("inserts a DMM only in current modes", () => {
    expect(
      convertToSpiceComponents([part("d", "dmm", { mode: "DCV" })], [])
    ).toHaveLength(0);
    expect(
      find(
        convertToSpiceComponents([part("d", "dmm", { mode: "ACA" })], []),
        "d",
        "dc-voltage"
      ).voltage
    ).toBe(0);
  });

  it("emits nothing for ideal voltage-reading instruments", () => {
    expect(
      convertToSpiceComponents(
        [part("vm", "voltmeter"), part("o", "oscilloscope")],
        []
      )
    ).toHaveLength(0);
  });

  it("reports every unsupported part at once", () => {
    const attempt = () =>
      convertToSpiceComponents(
        [
          part("i", "dc-current", {}, "I1"),
          part("u", "opamp", {}, "U1"),
          part("v", "ac-voltage", { waveform: "square" }, "V1"),
          part("r", "resistor"),
        ],
        []
      );

    expect(attempt).toThrow(SpiceAdapterError);
    try {
      attempt();
    } catch (error) {
      expect(error).toBeInstanceOf(SpiceAdapterError);
      if (error instanceof SpiceAdapterError) {
        expect(error.unsupported.map(item => item.id)).toEqual(["i", "u", "v"]);
      }
    }
  });

  it("skips parts with no component definition", () => {
    expect(convertToSpiceComponents([part("x", "not-a-part")], [])).toEqual([]);
  });

  it("produces a deck the generator accepts for a mixed circuit", () => {
    const components = [
      part("g", "ground"),
      part("v", "ac-voltage", { amplitude: 10, frequency: 50 }, "V1"),
      part("t", "transformer", { turnRatio: 5 }, "T1"),
      part("d", "diode", {}, "D1"),
      part("c", "capacitor", { capacitance: 1e-4 }, "C1"),
      part("r", "resistor", { resistance: 100 }, "R1"),
      part("k", "relay-spdt", { coilVoltage: 12 }, "K1"),
      part("s", "sw-spst-no", { state: "closed" }, "S1"),
      part("am", "ammeter", {}, "AM1"),
    ];
    const wires = [
      wire("w1", "v", "neg", "g", "gnd"),
      wire("w2", "v", "pos", "t", "p1"),
      wire("w3", "t", "p2", "g", "gnd"),
      wire("w4", "t", "s1", "d", "anode"),
      wire("w5", "d", "cathode", "am", "pos"),
      wire("w6", "am", "neg", "c", "a"),
      wire("w7", "c", "b", "g", "gnd"),
      wire("w8", "c", "a", "r", "a"),
      wire("w9", "r", "b", "s", "a"),
      wire("w10", "s", "b", "g", "gnd"),
    ];

    const deck = generateNetlist(convertToSpiceComponents(components, wires), {
      analysis: [".tran 100u 60m"],
    });
    expect(deck).toContain("KT1 LT1P LT1S 0.999");
    expect(deck).toContain(".MODEL D_STD D");
    expect(deck).toContain("VPROBE_am ");
  });
});
