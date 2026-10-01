import { describe, expect, it } from "vitest";
import { GRID } from "../../control/circuitPhase1";
import {
  buildAcControllerCircuit,
  buildChopperCircuit,
  buildInverterCircuit,
  buildRectifierCircuit,
  fwdAllowedFor,
  netOf,
  validateSchematic,
  type SchematicDocument,
} from "./index";

const ids = (doc: SchematicDocument) => doc.components.map((component) => component.id);
const count = (doc: SchematicDocument, kind: string) => doc.components.filter((component) => component.kind === kind).length;

function expectClean(doc: SchematicDocument) {
  expect(validateSchematic(doc), doc.title).toEqual([]);
  doc.components.forEach((component) => Object.values(component.pins).forEach((pin) => {
    expect(pin.x % GRID, `${doc.title} ${component.id}`).toBe(0);
    expect(pin.y % GRID, `${doc.title} ${component.id}`).toBe(0);
  }));
}

const RECTIFIER_LOADS = ["R", "RL", "RC", "RLC", "RLE"] as const;
const RECTIFIER_SHAPES = [
  ["single", "half-wave"], ["single", "bridge"], ["single", "center-tapped"],
  ["three", "half-wave"], ["three", "bridge"],
] as const;

describe("rectifier schematics", () => {
  for (const [phase, shape] of RECTIFIER_SHAPES) {
    for (const load of RECTIFIER_LOADS) {
      for (const controlled of [false, true]) {
        for (const fwd of [false, true]) {
          it(`${phase} ${shape} ${load} controlled=${controlled} fwd=${fwd}`, () => {
            const doc = buildRectifierCircuit(phase, shape, load, fwd, controlled);
            expectClean(doc);
            // Strict FWD rule: only RL and RLE may ever carry one.
            expect(ids(doc).includes("FWD")).toBe(fwd && (load === "RL" || load === "RLE"));
            // controlled bridges contain thyristors only (plus the FWD diode); uncontrolled ones no thyristors
            const hasFwdDiode = ids(doc).includes("FWD");
            expect(count(doc, controlled ? "diode" : "thyristor")).toBe(controlled && hasFwdDiode ? 1 : 0);
          });
        }
      }
    }
  }

  it("exposes the FWD rule", () => {
    expect(RECTIFIER_LOADS.filter(fwdAllowedFor)).toEqual(["RL", "RLE"]);
  });

  it("uses the right device count per topology", () => {
    const devices = (phase: "single" | "three", shape: "half-wave" | "bridge" | "center-tapped", controlled: boolean) =>
      count(buildRectifierCircuit(phase, shape, "R", false, controlled), controlled ? "thyristor" : "diode");
    expect(devices("single", "half-wave", false)).toBe(1);
    expect(devices("single", "bridge", true)).toBe(4);
    expect(devices("single", "center-tapped", true)).toBe(2);
    expect(devices("three", "half-wave", false)).toBe(3);
    expect(devices("three", "bridge", true)).toBe(6);
  });

  it("gives every thyristor a gate terminal and diodes none", () => {
    const controlled = buildRectifierCircuit("single", "bridge", "R", false, true);
    expect(controlled.components.filter((c) => c.kind === "thyristor").every((c) => "g" in c.pins)).toBe(true);
    expect(controlled.components.flatMap((c) => c.labels).filter((l) => /^G\d$/.test(l.text))).toHaveLength(0);
    expect(buildRectifierCircuit("single", "bridge", "R", false, false).components.some((c) => c.kind === "thyristor")).toBe(false);
  });

  it("models the centre-tapped transformer with a centre tap on the return path", () => {
    const doc = buildRectifierCircuit("single", "center-tapped", "RL", true, false);
    expect(count(doc, "ctTransformer")).toBe(1);
    expect(netOf(doc, "TR.ct")).toBe("0");
    expect(netOf(doc, "TR.ct")).toBe(netOf(doc, "L.b"));
    expect(netOf(doc, "D1.k")).toBe(netOf(doc, "D2.k"));
    expect(netOf(doc, "D1.k")).toBe(netOf(doc, "R.a"));
  });

  it("wires a bridge so the load sees the rectified rails", () => {
    const doc = buildRectifierCircuit("single", "bridge", "R", false, false);
    expect(netOf(doc, "D1.k")).toBe(netOf(doc, "D3.k"));
    expect(netOf(doc, "D1.k")).toBe(netOf(doc, "R.a"));
    expect(netOf(doc, "D4.a")).toBe(netOf(doc, "D2.a"));
    expect(netOf(doc, "D4.a")).toBe(netOf(doc, "R.b"));
    expect(netOf(doc, "vs.p")).toBe(netOf(doc, "D1.a"));
    expect(netOf(doc, "vs.p")).toBe(netOf(doc, "D4.k"));
    expect(netOf(doc, "vs.n")).toBe(netOf(doc, "D3.a"));
    expect(netOf(doc, "vs.n")).toBe(netOf(doc, "D2.k"));
    expect(netOf(doc, "vs.p")).not.toBe(netOf(doc, "vs.n"));
  });

  it("places the free-wheeling diode across the load, cathode on the positive rail", () => {
    const doc = buildRectifierCircuit("single", "half-wave", "RLE", true, false);
    expect(netOf(doc, "FWD.k")).toBe(netOf(doc, "R.a"));
    expect(netOf(doc, "FWD.a")).toBe(netOf(doc, "E.n"));
    expect(netOf(doc, "FWD.a")).toBe("0");
  });

  it("puts the filter capacitor across R only for RLC (L stays in series)", () => {
    const doc = buildRectifierCircuit("single", "half-wave", "RLC", false, false);
    expect(netOf(doc, "C.a")).toBe(netOf(doc, "L.b"));
    expect(netOf(doc, "C.a")).toBe(netOf(doc, "R.a"));
    expect(netOf(doc, "C.b")).toBe(netOf(doc, "R.b"));
    expect(netOf(doc, "L.a")).toBe(netOf(doc, "D1.k"));
  });

  it("falls back to the bridge for an invalid three-phase centre-tapped request", () => {
    const doc = buildRectifierCircuit("three", "center-tapped", "R", false, false);
    expect(count(doc, "diode")).toBe(6);
  });
});

describe("inverter schematics", () => {
  const shapes = [["single", "half-bridge"], ["single", "full-bridge"], ["three", "full-bridge"]] as const;
  for (const [phase, topology] of shapes) {
    for (const load of ["R", "RL", "RLE"] as const) {
      it(`${phase} ${topology} ${load}`, () => {
        const doc = buildInverterCircuit(phase, topology, load);
        expectClean(doc);
        const switches = phase === "three" ? 6 : topology === "half-bridge" ? 2 : 4;
        expect(count(doc, "igbt")).toBe(switches);
        // every IGBT has an antiparallel feedback diode
        expect(count(doc, "diode")).toBe(switches);
        doc.components.filter((c) => c.kind === "igbt").forEach((q) => {
          const n = q.id.slice(1);
          expect(netOf(doc, `${q.id}.c`)).toBe(netOf(doc, `D${n}.k`));
          expect(netOf(doc, `${q.id}.e`)).toBe(netOf(doc, `D${n}.a`));
        });
      });
    }
  }

  it("builds a six-switch bridge with a star load", () => {
    const doc = buildInverterCircuit("three", "full-bridge", "RLE");
    expect(count(doc, "battery")).toBe(3);
    expect(netOf(doc, "Ea.n")).toBe(netOf(doc, "Eb.n"));
    expect(netOf(doc, "Ea.n")).toBe(netOf(doc, "Ec.n"));
    expect(netOf(doc, "Q1.e")).toBe(netOf(doc, "Q4.c"));
    expect(netOf(doc, "Q1.e")).toBe(netOf(doc, "Ra.a"));
    expect(netOf(doc, "Q1.c")).toBe(netOf(doc, "Q3.c"));
    expect(netOf(doc, "Q1.c")).toBe(netOf(doc, "Vdc.p"));
  });

  it("uses the split DC link for the half bridge", () => {
    const doc = buildInverterCircuit("single", "half-bridge", "RL");
    expect(count(doc, "capacitor")).toBe(2);
    expect(netOf(doc, "C1.b")).toBe(netOf(doc, "C2.a"));
    expect(netOf(doc, "C1.b")).toBe(netOf(doc, "L.b"));
  });
});

describe("AC voltage controller schematics", () => {
  for (const mode of ["unidirectional", "bidirectional"] as const) {
    for (const load of ["R", "RL"] as const) {
      it(`single-phase ${mode} ${load}`, () => {
        const doc = buildAcControllerCircuit("single", mode, load);
        expectClean(doc);
        if (mode === "unidirectional") {
          expect(count(doc, "thyristor")).toBe(1);
          expect(count(doc, "diode")).toBe(1);
          // antiparallel: SCR anode joins the diode cathode
          expect(netOf(doc, "T1.a")).toBe(netOf(doc, "D1.k"));
          expect(netOf(doc, "T1.k")).toBe(netOf(doc, "D1.a"));
        } else {
          expect(count(doc, "thyristor")).toBe(2);
          expect(count(doc, "triac")).toBe(0);
          expect(netOf(doc, "T1.a")).toBe(netOf(doc, "T2.k"));
        }
      });
      for (const connection of ["star-3w", "star-4w", "delta"] as const) {
        for (const device of ["triac", "thyristor-pair"] as const) {
          it(`three-phase ${connection} ${mode} ${load} ${device}`, () => {
            const doc = buildAcControllerCircuit("three", mode, load, connection, device);
            expectClean(doc);
            expect(count(doc, "resistor")).toBe(3);
            expect(count(doc, "inductor")).toBe(load === "RL" ? 3 : 0);
          });
        }
      }
    }
  }

  it("builds inverse-parallel thyristors when requested", () => {
    const doc = buildAcControllerCircuit("single", "bidirectional", "R", "star-3w", "thyristor-pair");
    expect(count(doc, "thyristor")).toBe(2);
    expect(netOf(doc, "T1.a")).toBe(netOf(doc, "T2.k"));
    expect(netOf(doc, "T1.k")).toBe(netOf(doc, "T2.a"));
  });

  it("distinguishes star neutral wiring", () => {
    const four = buildAcControllerCircuit("three", "bidirectional", "R", "star-4w");
    const three = buildAcControllerCircuit("three", "bidirectional", "R", "star-3w");
    expect(netOf(four, "Ra.b")).toBe("0");
    expect(netOf(three, "Ra.b")).not.toBe("0");
  });

  it("connects delta loads line to line", () => {
    const doc = buildAcControllerCircuit("three", "bidirectional", "R", "delta");
    expect(netOf(doc, "Rab.a")).toBe(netOf(doc, "Rca.a"));
    expect(netOf(doc, "Rab.b")).toBe(netOf(doc, "Rbc.a"));
    expect(netOf(doc, "Rbc.b")).toBe(netOf(doc, "Rca.b"));
  });
});

describe("chopper schematics", () => {
  for (const type of ["buck", "boost", "buck-boost"] as const) {
    for (const klass of ["A", "B", "C", "D", "E"] as const) {
      for (const load of ["R", "RL", "RLE"] as const) {
        it(`${type} class ${klass} ${load}`, () => {
          const doc = buildChopperCircuit(type, klass, load);
          expectClean(doc);
          expect(count(doc, "igbt")).toBeGreaterThanOrEqual(1);
        });
      }
    }
  }

  it("buck has a high-side switch, FWD and LC filter", () => {
    const doc = buildChopperCircuit("buck", "A", "R");
    expect(netOf(doc, "Q1.c")).toBe(netOf(doc, "Vs.p"));
    expect(netOf(doc, "Q1.e")).toBe(netOf(doc, "FWD.k"));
    expect(netOf(doc, "FWD.a")).toBe("0");
    expect(netOf(doc, "Q1.e")).toBe(netOf(doc, "L.a"));
    expect(netOf(doc, "L.b")).toBe(netOf(doc, "C.a"));
    expect(netOf(doc, "C.b")).toBe("0");
  });

  it("boost has an input inductor, low-side switch and series diode", () => {
    const doc = buildChopperCircuit("boost", "A", "RL");
    expect(netOf(doc, "Vs.p")).toBe(netOf(doc, "L1.a"));
    expect(netOf(doc, "L1.b")).toBe(netOf(doc, "Q1.c"));
    expect(netOf(doc, "L1.b")).toBe(netOf(doc, "D1.a"));
    expect(netOf(doc, "Q1.e")).toBe("0");
    expect(netOf(doc, "D1.k")).toBe(netOf(doc, "C.a"));
  });

  it("buck-boost inverts: the diode points toward the shunt inductor", () => {
    const doc = buildChopperCircuit("buck-boost", "A", "R");
    expect(netOf(doc, "Q1.e")).toBe(netOf(doc, "L1.a"));
    expect(netOf(doc, "L1.a")).toBe(netOf(doc, "D1.k"));
    expect(netOf(doc, "L1.b")).toBe("0");
  });

  it("class B sources the load through CH and returns energy through D", () => {
    const doc = buildChopperCircuit("buck", "B", "RLE");
    expect(netOf(doc, "L.a")).toBe(netOf(doc, "Q1.c"));
    expect(netOf(doc, "L.a")).toBe(netOf(doc, "D1.a"));
    expect(netOf(doc, "D1.k")).toBe(netOf(doc, "Vs.p"));
    expect(netOf(doc, "E.n")).toBe("0");
  });

  it("class C pairs each switch with an antiparallel diode", () => {
    const doc = buildChopperCircuit("buck", "C", "RLE");
    expect(count(doc, "igbt")).toBe(2);
    expect(count(doc, "diode")).toBe(2);
    expect(netOf(doc, "Q1.e")).toBe(netOf(doc, "Q2.c"));
  });

  it("class D uses two switches and two diodes, class E a full H-bridge", () => {
    const d = buildChopperCircuit("buck", "D", "RL");
    expect([count(d, "igbt"), count(d, "diode")]).toEqual([2, 2]);
    const e = buildChopperCircuit("buck", "E", "RL");
    expect([count(e, "igbt"), count(e, "diode")]).toEqual([4, 4]);
  });

  it("ignores the converter type for classes B-E", () => {
    const first = buildChopperCircuit("buck", "E", "RL");
    const second = buildChopperCircuit("boost", "E", "RL");
    expect(second.components.map((c) => [c.id, c.x, c.y])).toEqual(first.components.map((c) => [c.id, c.x, c.y]));
  });
});

describe("determinism", () => {
  it("returns identical documents for identical input", () => {
    expect(buildRectifierCircuit("three", "bridge", "RLE", true, true)).toEqual(buildRectifierCircuit("three", "bridge", "RLE", true, true));
  });
});

import { labelToTex } from "./labels";
describe("label typography", () => {
  it("maps schematic labels to LaTeX", () => {
    expect(labelToTex("vs")).toBe("v_{s}");
    expect(labelToTex("Vdc")).toBe("V_{\\mathrm{dc}}");
    expect(labelToTex("Ra")).toBe("R_{a}");
    expect(labelToTex("Rab")).toBe("R_{\\mathrm{ab}}");
    expect(labelToTex("G1")).toBe("G_{1}");
    expect(labelToTex("L1")).toBe("L_{1}");
    expect(labelToTex("CH1")).toBe("\\mathrm{CH}_{1}");
    expect(labelToTex("FWD")).toBe("D_{\\mathrm{FWD}}");
    expect(labelToTex("R")).toBe("R");
  });
});

import { findLabelCollisions } from "./labelPlacement";
describe("label collisions", () => {
  const docs: SchematicDocument[] = [];
  for (const [phase, shape] of RECTIFIER_SHAPES) for (const load of RECTIFIER_LOADS) docs.push(buildRectifierCircuit(phase, shape, load, true, true));
  for (const [phase, topology] of [["single", "half-bridge"], ["single", "full-bridge"], ["three", "full-bridge"]] as const) for (const load of ["R", "RL", "RLE"] as const) docs.push(buildInverterCircuit(phase, topology, load));
  for (const mode of ["unidirectional", "bidirectional"] as const) for (const load of ["R", "RL"] as const) {
    docs.push(buildAcControllerCircuit("single", mode, load));
    for (const connection of ["star-3w", "star-4w", "delta"] as const) docs.push(buildAcControllerCircuit("three", mode, load, connection));
  }
  for (const type of ["buck", "boost", "buck-boost"] as const) for (const klass of ["A", "B", "C", "D", "E"] as const) for (const load of ["R", "RL", "RLE"] as const) docs.push(buildChopperCircuit(type, klass, load));

  it("leaves no label touching a wire, symbol, dot or another label", () => {
    const bad = docs.map((doc) => [doc.title, findLabelCollisions(doc.components, doc.wires, doc.junctions)] as const).filter(([, c]) => c.length);
    expect(bad).toEqual([]);
  });
});

describe("canonical naming", () => {
  const at = (doc: SchematicDocument, id: string) => doc.components.find((component) => component.id === id)!;
  it("single-phase bridge: T1 top-left, T2 bottom-right, T3 top-right, T4 bottom-left", () => {
    const doc = buildRectifierCircuit("single", "bridge", "R", false, true);
    expect(at(doc, "T1").x).toBeLessThan(at(doc, "T3").x);
    expect(at(doc, "T1").y).toBeLessThan(at(doc, "T4").y);
    expect(at(doc, "T2").x).toBe(at(doc, "T3").x);
    expect(at(doc, "T2").y).toBe(at(doc, "T4").y);
    expect(at(doc, "T4").x).toBe(at(doc, "T1").x);
    expect(ids(doc).filter((id) => /^T\d$/.test(id)).sort()).toEqual(["T1", "T2", "T3", "T4"]);
  });
  it("three-phase bridge: uppers 1,3,5 and lowers 4,6,2 left to right", () => {
    const doc = buildRectifierCircuit("three", "bridge", "R", false, true);
    expect(["T1", "T3", "T5"].map((id) => at(doc, id).x)).toEqual([320, 440, 560]);
    expect(["T4", "T6", "T2"].map((id) => at(doc, id).x)).toEqual([320, 440, 560]);
    expect(ids(doc).filter((id) => /^T\d$/.test(id)).sort()).toEqual(["T1", "T2", "T3", "T4", "T5", "T6"]);
  });
  it("inverters and choppers use Q_i switches with D_i diodes", () => {
    const inv = buildInverterCircuit("three", "full-bridge", "R");
    expect(ids(inv).filter((id) => /^Q\d$/.test(id)).sort()).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
    expect(ids(buildChopperCircuit("buck", "E", "R")).filter((id) => /^Q\d$/.test(id)).sort()).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(ids(buildChopperCircuit("buck", "A", "R"))).toContain("FWD");
  });
  it("the builder refuses duplicate tags", async () => {
    const { SchematicBuilder } = await import("./netlist");
    const b = new SchematicBuilder();
    b.place("diode", "D1", 100, 100);
    b.place("diode", "Dx", 100, 200, { label: "D1" });
    expect(() => b.build("dup")).toThrow(/Duplicate schematic component label detected: D1/);
  });
});

describe("bidirectional matches unidirectional geometry", () => {
  it("uses the same branch layout, pins and routing", () => {
    const uni = buildAcControllerCircuit("single", "unidirectional", "R");
    const bi = buildAcControllerCircuit("single", "bidirectional", "R");
    const pos = (doc: SchematicDocument, id: string) => { const c = doc.components.find((x) => x.id === id)!; return [c.x, c.y, c.rotation]; };
    expect(pos(bi, "T1")).toEqual(pos(uni, "T1"));
    expect(pos(bi, "T2")).toEqual(pos(uni, "D1"));
    expect(bi.wires.map((w) => w.points)).toEqual(uni.wires.map((w) => w.points));
    expect(bi.bounds.x2).toBe(uni.bounds.x2); // same width; only the extra gate terminal adds height on top
  });
  it("still offers a TRIAC with no enclosing box", () => {
    const doc = buildAcControllerCircuit("single", "bidirectional", "R", "star-3w", "triac");
    expect(count(doc, "triac")).toBe(1);
  });
});
