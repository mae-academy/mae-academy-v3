import { describe, expect, it } from "vitest";

import {
  buildSpiceNodeMap,
  generateNetlist,
  NetlistError,
} from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import type {
  SpiceComponent,
  SpiceGround,
  SpiceResistor,
} from "@/simulators/circuit-engine/engine/spice/spiceTypes";

// Canvas nets carry component UUIDs, which is exactly what the node mapper has to launder.
const GND = "n:0f8d3c1e-4a6b-4c2d-9e51-7b0a2f6d8c34:gnd";
const TOP = "n:2b7e4a90-11cd-4f3a-8e62-5c9d0a1b7e44:pos";
const MID = "n:9c1f5d22-83ab-4e70-bf19-6d2e4a80c5f7:a";

const ground: SpiceGround = { kind: "ground", id: "gnd-1", net: GND };

const resistor = (
  id: string,
  label: string,
  positive: string,
  negative: string,
  resistance: number
): SpiceResistor => ({
  kind: "resistor",
  id,
  label,
  positive,
  negative,
  resistance,
});

const divider: SpiceComponent[] = [
  ground,
  {
    kind: "dc-voltage",
    id: "v-1",
    label: "V1",
    positive: TOP,
    negative: GND,
    voltage: 10,
  },
  resistor("r-1", "R1", TOP, MID, 1000),
  resistor("r-2", "R2", MID, GND, 1000),
];

describe("buildSpiceNodeMap", () => {
  it("maps ground to 0 and renumbers the rest in first-encounter order", () => {
    const nodes = buildSpiceNodeMap(divider);

    expect(nodes.nameFor(GND)).toBe("0");
    expect(nodes.nameFor(TOP)).toBe("n1");
    expect(nodes.nameFor(MID)).toBe("n2");
    expect(nodes.entries).toEqual([
      { net: TOP, name: "n1" },
      { net: MID, name: "n2" },
    ]);
  });

  it("treats the literal 0 net as ground even with no ground component", () => {
    const nodes = buildSpiceNodeMap([resistor("r-1", "R1", TOP, "0", 1000)]);
    expect(nodes.nameFor("0")).toBe("0");
    expect(nodes.entries).toEqual([{ net: TOP, name: "n1" }]);
  });

  it("round-trips a name back to its net so results can be read onto the canvas", () => {
    const nodes = buildSpiceNodeMap(divider);
    expect(nodes.netFor("n2")).toBe(MID);
    expect(nodes.netFor("n9")).toBeUndefined();
  });

  it("is stable across calls, so a caller can rebuild it to interpret results", () => {
    expect(buildSpiceNodeMap(divider).entries).toEqual(
      buildSpiceNodeMap(divider).entries
    );
  });
});

describe("generateNetlist", () => {
  it("emits a runnable deck for a voltage divider", () => {
    expect(generateNetlist(divider, { title: "Voltage divider" })).toBe(
      [
        "Voltage divider",
        "V1 n1 0 DC 10",
        "R1 n1 n2 1000",
        "R2 n2 0 1000",
        ".OPTIONS GMIN=1e-12 ABSTOL=1e-12 RELTOL=0.005 ITL1=100 ITL4=100",
        ".op",
        ".end",
        "",
      ].join("\n")
    );
  });

  it("always emits a title line, which SPICE discards", () => {
    const [title, first] = generateNetlist(divider).split("\n");
    expect(title).toBe("MAE Academy circuit");
    expect(first).toBe("V1 n1 0 DC 10");
  });

  it("emits capacitors and inductors, with optional initial conditions", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "capacitor",
        id: "c-1",
        label: "C1",
        positive: TOP,
        negative: GND,
        capacitance: 1e-6,
      },
      {
        kind: "capacitor",
        id: "c-2",
        label: "C2",
        positive: TOP,
        negative: GND,
        capacitance: 1e-9,
        initialVoltage: 2.5,
      },
      {
        kind: "inductor",
        id: "l-1",
        label: "L1",
        positive: TOP,
        negative: GND,
        inductance: 1e-3,
        initialCurrent: 0.01,
      },
    ]);

    expect(deck).toContain("C1 n1 0 0.000001");
    expect(deck).toContain("C2 n1 0 1e-9 IC=2.5");
    expect(deck).toContain("L1 n1 0 0.001 IC=0.01");
  });

  it("emits an AC source that stays valid for .op, .ac and .tran", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "ac-voltage",
        id: "v-1",
        label: "V1",
        positive: TOP,
        negative: GND,
        amplitude: 10,
        frequency: 60,
        phaseDegrees: 30,
        dcOffset: 1,
      },
    ]);

    expect(deck).toContain("V1 n1 0 DC 1 AC 10 30 SIN(1 10 60 0 0 30)");
  });

  it("omits the SIN() spec when the source has no frequency", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "ac-voltage",
        id: "v-1",
        label: "V1",
        positive: TOP,
        negative: GND,
        amplitude: 10,
        frequency: 0,
      },
    ]);

    expect(deck).toContain("V1 n1 0 DC 0 AC 10 0\n");
    expect(deck).not.toContain("SIN(");
  });

  it("forces the SPICE type letter onto a mislabelled component", () => {
    const deck = generateNetlist([
      ground,
      resistor("r-1", "Load", TOP, GND, 470),
    ]);
    expect(deck).toContain("RLoad n1 0 470");
  });

  it("strips characters SPICE cannot use in an element name", () => {
    const deck = generateNetlist([
      ground,
      resistor("r-1", "R load #2", TOP, GND, 470),
    ]);
    expect(deck).toContain("R_load__2 n1 0 470");
  });

  it("falls back to a positional name when the label is unusable", () => {
    const deck = generateNetlist([
      ground,
      resistor("r-1", "***", TOP, GND, 470),
    ]);
    expect(deck).toContain("R1 n1 0 470");
  });

  it("de-duplicates element names, which SPICE requires to be unique", () => {
    const deck = generateNetlist([
      ground,
      resistor("r-1", "R1", TOP, MID, 100),
      resistor("r-2", "R1", MID, GND, 200),
    ]);

    expect(deck).toContain("R1 n1 n2 100");
    expect(deck).toContain("R1_2 n2 0 200");
  });

  it("appends .op by default and honours an explicit analysis list", () => {
    expect(generateNetlist(divider)).toContain("\n.op\n.end\n");

    const swept = generateNetlist(divider, {
      analysis: [".tran 10u 5m", ".ac dec 10 1 100k"],
    });
    expect(swept).toContain("\n.tran 10u 5m\n.ac dec 10 1 100k\n.end\n");
    expect(swept).not.toContain(".op");
  });

  it("rejects a circuit with no components", () => {
    expect(() => generateNetlist([ground])).toThrow(NetlistError);
    expect(() => generateNetlist([])).toThrow(/no components/);
  });

  it("rejects a circuit with no ground reference", () => {
    expect(() =>
      generateNetlist([resistor("r-1", "R1", TOP, MID, 1000)])
    ).toThrow(/no ground reference/);
  });

  it("emits a diode with its generated model, injected above the elements", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "diode",
        id: "d-1",
        label: "D1",
        variant: "standard",
        anode: TOP,
        cathode: GND,
      },
    ]);

    expect(deck.split("\n")).toEqual([
      "MAE Academy circuit",
      ".MODEL D_STD D (IS=1e-14 RS=0 N=1)",
      "D1 n1 0 D_STD",
      ".OPTIONS GMIN=1e-12 ABSTOL=1e-12 RELTOL=0.005 ITL1=100 ITL4=100",
      ".op",
      ".end",
      "",
    ]);
  });

  it("emits one shared model card for many components of the same kind", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "diode",
        id: "d-1",
        label: "D1",
        variant: "standard",
        anode: TOP,
        cathode: MID,
      },
      {
        kind: "diode",
        id: "d-2",
        label: "D2",
        variant: "standard",
        anode: MID,
        cathode: GND,
      },
    ]);

    expect(deck.match(/\.MODEL D_STD/g)).toHaveLength(1);
    expect(deck).toContain("D1 n1 n2 D_STD");
    expect(deck).toContain("D2 n2 0 D_STD");
  });

  it("gives each distinct zener breakdown voltage its own model", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "diode",
        id: "d-1",
        label: "D1",
        variant: "zener",
        anode: GND,
        cathode: TOP,
        breakdownVoltage: 5.1,
      },
      {
        kind: "diode",
        id: "d-2",
        label: "D2",
        variant: "zener",
        anode: GND,
        cathode: MID,
        breakdownVoltage: 12,
      },
    ]);

    expect(deck).toContain(
      ".MODEL D_ZENER_5P1 D (IS=1e-14 N=1 BV=5.1 IBV=0.001)"
    );
    expect(deck).toContain(
      ".MODEL D_ZENER_12 D (IS=1e-14 N=1 BV=12 IBV=0.001)"
    );
    expect(deck).toContain("D1 0 n1 D_ZENER_5P1");
    expect(deck).toContain("D2 0 n2 D_ZENER_12");
  });

  it("fits an LED's saturation current to its forward voltage", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "diode",
        id: "d-1",
        label: "D1",
        variant: "led",
        anode: TOP,
        cathode: GND,
        forwardVoltage: 2,
      },
    ]);

    // N = 2 / (0.025852 * ln(0.02 / 1e-20))
    const expected = (2 / (0.025852 * Math.log(0.02 / 1e-20))).toFixed(4);
    expect(deck).toContain(`.MODEL D_LED_2 D (IS=1e-20 N=${expected} RS=1)`);
    expect(deck).toContain("D1 n1 0 D_LED_2");
  });

  it("reduces a photodiode to its junction", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "diode",
        id: "d-1",
        label: "D1",
        variant: "photodiode",
        anode: GND,
        cathode: TOP,
      },
    ]);

    expect(deck).toContain(".MODEL D_PHOTO D (IS=1e-9 RS=0 N=1)");
    expect(deck).toContain("D1 0 n1 D_PHOTO");
  });

  it("emits BJT nodes as collector, base, emitter", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "bjt",
        id: "q-1",
        label: "Q1",
        polarity: "npn",
        collector: TOP,
        base: MID,
        emitter: GND,
      },
    ]);

    expect(deck).toContain(".MODEL NPN_STD NPN (");
    expect(deck).toContain("Q1 n1 n2 0 NPN_STD");
  });

  it("selects the model card matching the BJT polarity", () => {
    const pnp = generateNetlist([
      ground,
      {
        kind: "bjt",
        id: "q-1",
        label: "Q1",
        polarity: "pnp",
        collector: GND,
        base: MID,
        emitter: TOP,
      },
    ]);

    expect(pnp).toContain(".MODEL PNP_STD PNP (");
    expect(pnp).not.toContain("NPN_STD");
    expect(pnp).toContain("Q1 0 n1 n2 PNP_STD");
  });

  it("ties an unspecified MOSFET bulk to its source", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "mosfet",
        id: "m-1",
        label: "M1",
        channel: "n",
        drain: TOP,
        gate: MID,
        source: GND,
      },
    ]);

    expect(deck).toContain(".MODEL NMOS_STD NMOS (LEVEL=1");
    expect(deck).toContain("M1 n1 n2 0 0 NMOS_STD");
  });

  it("honours an explicit MOSFET bulk node", () => {
    const BULK = "n:aaaa1111-2222-3333-4444-555566667777:bulk";
    const deck = generateNetlist([
      ground,
      {
        kind: "mosfet",
        id: "m-1",
        label: "M1",
        channel: "p",
        drain: TOP,
        gate: MID,
        source: GND,
        bulk: BULK,
      },
    ]);

    expect(deck).toContain(".MODEL PMOS_STD PMOS (LEVEL=1");
    expect(deck).toContain("M1 n1 n2 0 n3 PMOS_STD");
  });

  it("emits JFETs with three nodes and a channel-matched model", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "jfet",
        id: "j-1",
        label: "J1",
        channel: "n",
        drain: TOP,
        gate: MID,
        source: GND,
      },
    ]);

    expect(deck).toContain(
      ".MODEL NJF_STD NJF (VTO=-4 BETA=0.001 LAMBDA=0.01)"
    );
    expect(deck).toContain("J1 n1 n2 0 NJF_STD");
  });

  it("emits no model cards for a circuit with only passives", () => {
    expect(generateNetlist(divider)).not.toContain(".MODEL");
  });

  it("numbers nodes from every terminal, not just two-terminal ones", () => {
    const nodes = buildSpiceNodeMap([
      ground,
      {
        kind: "bjt",
        id: "q-1",
        label: "Q1",
        polarity: "npn",
        collector: TOP,
        base: MID,
        emitter: GND,
      },
    ]);

    // Collector first, then base: element order, not canvas terminal order.
    expect(nodes.entries).toEqual([
      { net: TOP, name: "n1" },
      { net: MID, name: "n2" },
    ]);
  });

  it("accepts a semiconductor as the circuit's only path to ground", () => {
    expect(() =>
      generateNetlist([
        {
          kind: "diode",
          id: "d-1",
          label: "D1",
          variant: "standard",
          anode: TOP,
          cathode: "0",
        },
      ])
    ).not.toThrow();
  });

  it("instantiates an SCR as an X reference to an injected subcircuit", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "scr",
        id: "x-1",
        label: "X1",
        anode: TOP,
        gate: MID,
        cathode: GND,
      },
    ]);

    expect(deck).toContain(".SUBCKT SCR_STD A G K");
    expect(deck).toContain(".ENDS SCR_STD");
    // Latch, gate shunt and anode shunt must all be present.
    expect(deck).toContain("Q1 G N1 A PNP_SCR");
    expect(deck).toContain("Q2 N1 G K NPN_SCR");
    expect(deck).toContain("RGK G K 1000");
    expect(deck).toContain("RAG A N1 10000");
    expect(deck).toContain("X1 n1 n2 0 SCR_STD");
    // Junction capacitance is what lets the transient solver resolve regeneration.
    expect(deck).toContain("CJE=1e-9");
  });

  it("emits the subcircuit before the element that references it", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "scr",
        id: "x-1",
        label: "X1",
        anode: TOP,
        gate: MID,
        cathode: GND,
      },
    ]);
    expect(deck.indexOf(".SUBCKT SCR_STD")).toBeLessThan(
      deck.indexOf("X1 n1 n2 0")
    );
  });

  it("shares one subcircuit across many SCRs", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "scr",
        id: "x-1",
        label: "X1",
        anode: TOP,
        gate: MID,
        cathode: GND,
      },
      {
        kind: "scr",
        id: "x-2",
        label: "X2",
        anode: MID,
        gate: TOP,
        cathode: GND,
      },
    ]);

    expect(deck.match(/\.SUBCKT SCR_STD/g)).toHaveLength(1);
    expect(deck).toContain("X1 n1 n2 0 SCR_STD");
    expect(deck).toContain("X2 n2 n1 0 SCR_STD");
  });

  it("gives each DIAC breakover voltage its own subcircuit, less the forward drop", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "diac",
        id: "x-1",
        label: "X1",
        a1: TOP,
        a2: GND,
        breakoverVoltage: 30,
      },
    ]);

    expect(deck).toContain(".SUBCKT DIAC_30 A1 A2");
    expect(deck).toContain("D1 NM A1 DMOD_30");
    expect(deck).toContain("D2 NM A2 DMOD_30");
    // The conducting diode's forward drop is subtracted so the pair breaks over at 30 V.
    expect(deck).toContain(".MODEL DMOD_30 D (IS=1e-14 N=1 BV=29.3 IBV=0.001)");
    expect(deck).toContain("X1 n1 0 DIAC_30");
  });

  it("emits a TRIAC as two anti-parallel latches sharing one gate", () => {
    const deck = generateNetlist([
      ground,
      { kind: "triac", id: "x-1", label: "X1", mt1: TOP, gate: MID, mt2: GND },
    ]);

    expect(deck).toContain(".SUBCKT TRIAC_STD MT1 G MT2");
    expect(deck).toContain("QA1 G NA MT2 PNP_TRIAC");
    expect(deck).toContain("QB1 G NB MT1 PNP_TRIAC");
    expect(deck).toContain("X1 n1 n2 0 TRIAC_STD");
  });

  it("emits a transformer as coupled inductors, not a subcircuit", () => {
    const SEC = "n:cccc1111-2222-3333-4444-555566667777:s1";
    const deck = generateNetlist([
      ground,
      {
        kind: "transformer",
        id: "t-1",
        label: "T1",
        primaryPositive: TOP,
        primaryNegative: GND,
        secondaryPositive: SEC,
        secondaryNegative: GND,
        turnsRatio: 5,
        primaryInductance: 10,
      },
    ]);

    expect(deck).not.toContain(".SUBCKT");
    // L scales with the square of the turns ratio: 10 / 25 = 0.4.
    expect(deck).toContain("LT1P n1 0 10");
    expect(deck).toContain("LT1S n2 0 0.4");
    expect(deck).toContain("KT1 LT1P LT1S 0.999");
  });

  it("honours an explicit coupling coefficient and rejects one outside (0, 1)", () => {
    const transformer = {
      kind: "transformer",
      id: "t-1",
      label: "T1",
      primaryPositive: TOP,
      primaryNegative: GND,
      secondaryPositive: MID,
      secondaryNegative: GND,
      turnsRatio: 2,
      primaryInductance: 1,
    } as const;

    expect(
      generateNetlist([ground, { ...transformer, couplingCoefficient: 0.9 }])
    ).toContain("KT1 LT1P LT1S 0.9");
    expect(() =>
      generateNetlist([ground, { ...transformer, couplingCoefficient: 1 }])
    ).toThrow(/coupling coefficient/);
  });

  it("splits a centre-tapped secondary into halves coupled pairwise", () => {
    const S1 = "n:dddd1111-2222-3333-4444-555566667777:s1";
    const S2 = "n:eeee1111-2222-3333-4444-555566667777:s2";
    const deck = generateNetlist([
      ground,
      {
        kind: "transformer-ct",
        id: "t-1",
        label: "T1",
        primaryPositive: TOP,
        primaryNegative: GND,
        secondaryPositive: S1,
        centerTap: GND,
        secondaryNegative: S2,
        turnsRatio: 5,
        primaryInductance: 10,
      },
    ]);

    // Each half sees twice the ratio: 10 / (5 * 2)^2 = 0.1.
    expect(deck).toContain("LT1A n2 0 0.1");
    expect(deck).toContain("LT1B 0 n3 0.1");
    // K couples exactly two inductors, so three windings need three directives.
    expect(deck).toContain("KT1PA LT1P LT1A 0.999");
    expect(deck).toContain("KT1PB LT1P LT1B 0.999");
    expect(deck).toContain("KT1AB LT1A LT1B 0.999");
  });

  it("splits an autotransformer winding at its tap", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "autotransformer",
        id: "t-1",
        label: "T1",
        input: TOP,
        tap: MID,
        common: GND,
        turnsRatio: 2,
        primaryInductance: 10,
      },
    ]);

    // n = 2 puts half the turns below the tap, so L splits 0.5^2 each way.
    expect(deck).toContain("LT1A n1 n2 2.5");
    expect(deck).toContain("LT1B n2 0 2.5");
    expect(deck).toContain("KT1 LT1A LT1B 0.999");
  });

  it("rejects an autotransformer ratio that leaves no series section", () => {
    expect(() =>
      generateNetlist([
        ground,
        {
          kind: "autotransformer",
          id: "t-1",
          label: "T1",
          input: TOP,
          tap: MID,
          common: GND,
          turnsRatio: 1,
          primaryInductance: 10,
        },
      ])
    ).toThrow(/turns ratio above 1/);
  });

  it("gives each DC motor its own subcircuit with a back-EMF source", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "dc-motor",
        id: "x-1",
        label: "X1",
        positive: TOP,
        negative: GND,
        armatureResistance: 1,
        armatureInductance: 0.001,
        backEmfConstant: 0.05,
        torqueConstant: 0.05,
        inertia: 1e-4,
        viscousFriction: 1e-4,
      },
    ]);

    expect(deck).toContain(".SUBCKT MOTOR_X1 P N");
    expect(deck).toContain("RA P NA 1");
    expect(deck).toContain("LA NA NB 0.001");
    // Back-EMF is proportional to the shaft-speed node.
    expect(deck).toContain("BEMF NC N V={0.05*V(SPD)}");
    // Mechanical analogue: torque as current, inertia as capacitance, friction as conductance.
    expect(deck).toContain("BTRQ 0 SPD I={0.05*I(VSENSE)-0}");
    expect(deck).toContain("CJ SPD 0 0.0001");
    expect(deck).toContain("RB SPD 0 10000");
    expect(deck).toContain("X1 n1 0 MOTOR_X1");
  });

  it("carries load torque into the mechanical balance", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "dc-motor",
        id: "x-1",
        label: "X1",
        positive: TOP,
        negative: GND,
        armatureResistance: 1,
        armatureInductance: 0.001,
        backEmfConstant: 0.05,
        torqueConstant: 0.05,
        inertia: 1e-4,
        viscousFriction: 1e-4,
        loadTorque: 0.5,
      },
    ]);

    expect(deck).toContain("BTRQ 0 SPD I={0.05*I(VSENSE)-0.5}");
  });

  it("floors a frictionless motor instead of emitting an infinite resistance", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "dc-motor",
        id: "x-1",
        label: "X1",
        positive: TOP,
        negative: GND,
        armatureResistance: 1,
        armatureInductance: 0.001,
        backEmfConstant: 0.05,
        torqueConstant: 0.05,
        inertia: 1e-4,
        viscousFriction: 0,
      },
    ]);

    expect(deck).toContain("RB SPD 0 1000000000000");
  });

  it("gives two motors with different parameters separate subcircuits", () => {
    const motor = {
      kind: "dc-motor",
      positive: TOP,
      negative: GND,
      armatureResistance: 1,
      armatureInductance: 0.001,
      backEmfConstant: 0.05,
      torqueConstant: 0.05,
      inertia: 1e-4,
      viscousFriction: 1e-4,
    } as const;
    const deck = generateNetlist([
      ground,
      { ...motor, id: "x-1", label: "X1" },
      { ...motor, id: "x-2", label: "X2", armatureResistance: 4 },
    ]);

    expect(deck).toContain(".SUBCKT MOTOR_X1 P N");
    expect(deck).toContain(".SUBCKT MOTOR_X2 P N");
    expect(deck).toContain("RA P NA 1");
    expect(deck).toContain("RA P NA 4");
  });

  it("drives a closed manual switch from a 1V dummy source", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "switch-spst",
        id: "s-1",
        label: "S1",
        a: TOP,
        b: GND,
        isClosed: true,
      },
    ]);

    // SW with VT/VH, not PSPICE's VSWITCH with VON/VOFF: ngspice cannot parse the latter.
    expect(deck).toContain(
      ".MODEL SW_MANUAL SW (VT=0.5 VH=0 RON=0.001 ROFF=1e9)"
    );
    expect(deck).toContain("VS1CTL S1CTL 0 DC 1");
    expect(deck).toContain("S1 n1 0 S1CTL 0 SW_MANUAL");
  });

  it("drives an open manual switch from a 0V dummy source", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "switch-spst",
        id: "s-1",
        label: "S1",
        a: TOP,
        b: GND,
        isClosed: false,
      },
    ]);

    expect(deck).toContain("VS1CTL S1CTL 0 DC 0");
    expect(deck).toContain("S1 n1 0 S1CTL 0 SW_MANUAL");
  });

  it("emits both SPDT throws so the netlist keeps its shape in every position", () => {
    const THROW = "n:9999aaaa-bbbb-cccc-dddd-eeeeffff0000:b";
    const forPosition = (position: "a" | "b" | "open") =>
      generateNetlist([
        ground,
        {
          kind: "switch-spdt",
          id: "s-1",
          label: "S1",
          common: TOP,
          a: MID,
          b: THROW,
          position,
        },
      ]);

    expect(forPosition("a")).toContain("VS1CTLA S1CTLA 0 DC 1");
    expect(forPosition("a")).toContain("VS1CTLB S1CTLB 0 DC 0");
    expect(forPosition("b")).toContain("VS1CTLA S1CTLA 0 DC 0");
    expect(forPosition("b")).toContain("VS1CTLB S1CTLB 0 DC 1");

    // Break-before-make: neither throw is driven, but both switches are still emitted.
    const open = forPosition("open");
    expect(open).toContain("VS1CTLA S1CTLA 0 DC 0");
    expect(open).toContain("VS1CTLB S1CTLB 0 DC 0");
    expect(open).toContain("S1A n1 n2 S1CTLA 0 SW_MANUAL");
    expect(open).toContain("S1B n1 n3 S1CTLB 0 SW_MANUAL");
  });

  it("shares one manual switch model across every manual contact", () => {
    const deck = generateNetlist([
      ground,
      {
        kind: "switch-spst",
        id: "s-1",
        label: "S1",
        a: TOP,
        b: MID,
        isClosed: true,
      },
      {
        kind: "switch-spst",
        id: "s-2",
        label: "S2",
        a: MID,
        b: GND,
        isClosed: false,
      },
    ]);

    expect(deck.match(/\.MODEL SW_MANUAL/g)).toHaveLength(1);
  });

  it("emits a relay as a series R-L coil driving its contacts", () => {
    const NO = "n:1111aaaa-bbbb-cccc-dddd-eeeeffff0000:no";
    const NC = "n:2222aaaa-bbbb-cccc-dddd-eeeeffff0000:nc";
    const deck = generateNetlist([
      ground,
      {
        kind: "relay",
        id: "k-1",
        label: "K1",
        coilPositive: TOP,
        coilNegative: GND,
        common: MID,
        normallyOpen: NO,
        normallyClosed: NC,
        coilResistance: 400,
        coilInductance: 0.5,
        pullInVoltage: 9,
      },
    ]);

    // Pull-in 9 V with the default drop-out of half that: VT is the midpoint, VH the half-gap.
    expect(deck).toContain(
      ".MODEL SW_COIL_6P75_2P25 SW (VT=6.75 VH=2.25 RON=0.001 ROFF=1e9)"
    );
    expect(deck).toContain(
      ".MODEL SW_COIL_6P75_2P25_NC SW (VT=-6.75 VH=2.25 RON=0.001 ROFF=1e9)"
    );
    expect(deck).toContain("RSK1COIL n1 SK1COIL 400");
    expect(deck).toContain("LSK1COIL SK1COIL 0 0.5");
    // Contacts sense the whole coil; the NC pair reverses the control nodes against a negated VT.
    expect(deck).toContain("SK1NO n2 n3 n1 0 SW_COIL_6P75_2P25");
    expect(deck).toContain("SK1NC n2 n4 0 n1 SW_COIL_6P75_2P25_NC");
  });

  it("derives hysteresis from an explicit drop-out voltage", () => {
    const NO = "n:1111aaaa-bbbb-cccc-dddd-eeeeffff0000:no";
    const deck = generateNetlist([
      ground,
      {
        kind: "relay",
        id: "k-1",
        label: "K1",
        coilPositive: TOP,
        coilNegative: GND,
        common: MID,
        normallyOpen: NO,
        coilResistance: 400,
        coilInductance: 0.5,
        pullInVoltage: 10,
        dropOutVoltage: 8,
      },
    ]);

    expect(deck).toContain(
      ".MODEL SW_COIL_9_1 SW (VT=9 VH=1 RON=0.001 ROFF=1e9)"
    );
  });

  it("rejects a drop-out voltage that is not below pull-in", () => {
    const relay = {
      kind: "relay",
      id: "k-1",
      label: "K1",
      coilPositive: TOP,
      coilNegative: GND,
      common: MID,
      normallyOpen: "n:1111aaaa-bbbb-cccc-dddd-eeeeffff0000:no",
      coilResistance: 400,
      coilInductance: 0.5,
      pullInVoltage: 9,
    } as const;

    expect(() =>
      generateNetlist([ground, { ...relay, dropOutVoltage: 9 }])
    ).toThrow(/drop-out voltage below/);
    expect(() =>
      generateNetlist([ground, { ...relay, pullInVoltage: 0 }])
    ).toThrow(/positive pull-in/);
  });

  it("rejects a relay with no contacts", () => {
    expect(() =>
      generateNetlist([
        ground,
        {
          kind: "relay",
          id: "k-1",
          label: "K1",
          coilPositive: TOP,
          coilNegative: GND,
          common: MID,
          coilResistance: 400,
          coilInductance: 0.5,
          pullInVoltage: 9,
        },
      ])
    ).toThrow(/no contacts/);
  });

  it("emits every contactor pole plus its auxiliary contacts", () => {
    const nets = (n: number) => `n:${n}333aaaa-bbbb-cccc-dddd-eeeeffff0000:x`;
    const deck = generateNetlist([
      ground,
      {
        kind: "contactor",
        id: "k-1",
        label: "K1",
        coilPositive: TOP,
        coilNegative: GND,
        poles: [
          { line: nets(1), load: nets(2) },
          { line: nets(3), load: nets(4) },
          { line: nets(5), load: nets(6) },
        ],
        auxNormallyOpen: { line: nets(7), load: nets(8) },
        auxNormallyClosed: { line: nets(9), load: MID },
        coilResistance: 200,
        coilInductance: 1,
        pullInVoltage: 18,
      },
    ]);

    expect(deck).toContain("SK1P1 n2 n3 n1 0 SW_COIL_13P5_4P5");
    expect(deck).toContain("SK1P2 n4 n5 n1 0 SW_COIL_13P5_4P5");
    expect(deck).toContain("SK1P3 n6 n7 n1 0 SW_COIL_13P5_4P5");
    expect(deck).toContain("SK1AUXNO n8 n9 n1 0 SW_COIL_13P5_4P5");
    // The auxiliary NC contact is the reversed-control variant.
    expect(deck).toContain("SK1AUXNC n10 n11 0 n1 SW_COIL_13P5_4P5_NC");
  });

  it("rejects a contactor with no poles", () => {
    expect(() =>
      generateNetlist([
        ground,
        {
          kind: "contactor",
          id: "k-1",
          label: "K1",
          coilPositive: TOP,
          coilNegative: GND,
          poles: [],
          coilResistance: 200,
          coilInductance: 1,
          pullInVoltage: 18,
        },
      ])
    ).toThrow(/no contacts/);
  });

  it("shares coil switch models between parts with matching thresholds", () => {
    const coil = {
      coilPositive: TOP,
      coilNegative: GND,
      coilResistance: 400,
      coilInductance: 0.5,
      pullInVoltage: 9,
    } as const;
    const deck = generateNetlist([
      ground,
      {
        ...coil,
        kind: "relay",
        id: "k-1",
        label: "K1",
        common: MID,
        normallyOpen: MID,
      },
      {
        ...coil,
        kind: "contactor",
        id: "k-2",
        label: "K2",
        poles: [{ line: TOP, load: MID }],
      },
    ]);

    expect(deck.match(/\.MODEL SW_COIL_6P75_2P25 /g)).toHaveLength(1);
  });

  it("rejects a non-finite value rather than emitting a broken deck", () => {
    expect(() =>
      generateNetlist([ground, resistor("r-1", "R1", TOP, GND, Number.NaN)])
    ).toThrow(/non-finite resistance/);
  });
});
