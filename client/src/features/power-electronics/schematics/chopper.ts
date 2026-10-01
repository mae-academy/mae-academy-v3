import { LEG_BOTTOM, LEG_TAP_Y, LEG_TOP, PART, loadElements, placeDcRails, placeHChain, placeLeg, placeShunt, placeVChain, type ChainElement, type LegOptions } from "./layout";
import { SchematicBuilder, type SchematicDocument } from "./netlist";

export type ChopperSchematicType = "buck" | "boost" | "buck-boost";
export type ChopperSchematicClass = "A" | "B" | "C" | "D" | "E";
export type ChopperSchematicLoad = "R" | "RL" | "RLE";

const RAIL_TOP = 160;
const RAIL_BOTTOM = 280;
const SOURCE_X = 60;

/** Single-quadrant converters share a Vs source on the left with its "+" on the top rail at y = 160. */
function placeSupply(b: SchematicBuilder) {
  b.place("dcSource", "Vs", SOURCE_X, 220, { label: "Vs" });
}

/** High-side series switch (collector on the source side) at (x, 160). */
function placeHighSideSwitch(b: SchematicBuilder, x: number, id = "Q1") {
  return b.place("igbt", id, x, RAIL_TOP, { rotation: 270});
}

const dropTo = (b: SchematicBuilder, x: number, fromY: number, toY: number) => {
  if (toY > fromY) b.wire([x, fromY], [x, toY]);
};

function finishRail(b: SchematicBuilder, returnY: number, rightX: number) {
  b.wire([SOURCE_X, RAIL_BOTTOM], [SOURCE_X, returnY], [rightX, returnY]);
  b.place("ground", "GND", SOURCE_X, returnY, { label: null });
}

/**
 * Class A–E DC chopper / converter schematics.
 *
 * Class A follows the selected converter `type` (buck / boost / buck-boost); classes B–E are
 * quadrant-driven drive circuits (the `type` has no effect, matching the simulation model).
 */
export function buildChopperCircuit(
  type: ChopperSchematicType,
  classification: ChopperSchematicClass,
  loadType: ChopperSchematicLoad,
): SchematicDocument {
  const b = new SchematicBuilder();
  const elements = loadElements(loadType);
  const count = elements.length;
  let heading: string;

  if (classification === "A" && type === "buck") {
    heading = "Buck Converter (Class A)";
    placeSupply(b);
    b.wire([SOURCE_X, RAIL_TOP], [140, RAIL_TOP]);
    const ch = placeHighSideSwitch(b, 200);
    b.wire(ch.e, [320, RAIL_TOP]);
    b.place("diode", "FWD", 320, 220, { rotation: 270 });
    let rightX: number;
    let returnY: number;
    if (loadType === "R") {
      // R load is fed through the LC output filter: series L, shunt C, then R
      rightX = 680;
      b.place("inductor", "L", 440, RAIL_TOP);
      b.wire([320, RAIL_TOP], [380, RAIL_TOP]);
      b.wire([500, RAIL_TOP], [rightX, RAIL_TOP]);
      placeShunt(b, 560, RAIL_TOP, RAIL_BOTTOM, "capacitor", "C");
      const chain = placeVChain(b, rightX, RAIL_TOP, elements);
      returnY = Math.max(chain.bottom.y, RAIL_BOTTOM);
    } else {
      rightX = 440;
      b.wire([320, RAIL_TOP], [rightX, RAIL_TOP]);
      const chain = placeVChain(b, rightX, RAIL_TOP, elements);
      returnY = Math.max(chain.bottom.y, RAIL_BOTTOM);
      dropTo(b, rightX, chain.bottom.y, returnY);
    }
    dropTo(b, 320, RAIL_BOTTOM, returnY);
    finishRail(b, returnY, rightX);
  } else if (classification === "A" && type === "boost") {
    heading = "Boost Converter (Class A)";
    placeSupply(b);
    b.place("inductor", "L1", 200, RAIL_TOP);
    b.wire([SOURCE_X, RAIL_TOP], [140, RAIL_TOP]);
    // low-side switch from the L/diode node to the return rail, series diode to the output
    b.place("igbt", "Q1", 320, 220, {});
    b.place("diode", "D1", 440, RAIL_TOP);
    b.wire([260, RAIL_TOP], [380, RAIL_TOP]);
    const loadX = 700;
    b.wire([500, RAIL_TOP], [loadX, RAIL_TOP]);
    const chain = placeVChain(b, loadX, RAIL_TOP, elements);
    const returnY = Math.max(chain.bottom.y, RAIL_BOTTOM);
    dropTo(b, loadX, chain.bottom.y, returnY);
    placeShunt(b, 580, RAIL_TOP, returnY, "capacitor", "C");
    dropTo(b, 320, RAIL_BOTTOM, returnY);
    finishRail(b, returnY, loadX);
  } else if (classification === "A") {
    heading = "Buck-Boost Converter (Class A)";
    placeSupply(b);
    b.wire([SOURCE_X, RAIL_TOP], [140, RAIL_TOP]);
    const ch = placeHighSideSwitch(b, 200);
    b.wire(ch.e, [320, RAIL_TOP]);
    // shunt inductor to the return rail; the diode points toward the inductor so the output is inverted
    b.place("inductor", "L1", 320, 220, { rotation: 90 });
    b.place("diode", "D1", 440, RAIL_TOP, { rotation: 180 });
    b.wire([320, RAIL_TOP], [380, RAIL_TOP]);
    const loadX = 580;
    b.wire([500, RAIL_TOP], [loadX, RAIL_TOP]);
    // load current runs upward, so the chain is listed top-down in reverse and E's "+" faces the return rail
    const reversed: ChainElement[] = [...elements].reverse();
    const chain = placeVChain(b, loadX, RAIL_TOP, reversed, false);
    const returnY = Math.max(chain.bottom.y, RAIL_BOTTOM);
    dropTo(b, loadX, chain.bottom.y, returnY);
    placeShunt(b, 660, RAIL_TOP, returnY, "capacitor", "C");
    b.wire([loadX, RAIL_TOP], [660, RAIL_TOP]);
    b.wire([loadX, returnY], [660, returnY]);
    dropTo(b, 320, RAIL_BOTTOM, returnY);
    finishRail(b, returnY, loadX);
  } else if (classification === "B") {
    heading = "Class B Chopper (Regenerative)";
    // load (R-L-E) on the left sources current upward; CH shorts it, D returns the energy to Vs
    const ofKind = (kind: ChainElement["kind"]) => elements.filter((element) => element.kind === kind);
    const chain = placeVChain(b, 200, RAIL_TOP, [...ofKind("L"), ...ofKind("R"), ...ofKind("E")]);
    const returnY = Math.max(chain.bottom.y, RAIL_BOTTOM);
    dropTo(b, 200, chain.bottom.y, returnY);
    b.place("igbt", "Q1", 320, 220, {});
    b.place("diode", "D1", 440, RAIL_TOP);
    b.place("dcSource", "Vs", 560, 220, { label: "Vs" });
    b.wire([200, RAIL_TOP], [380, RAIL_TOP]);
    b.wire([500, RAIL_TOP], [560, RAIL_TOP]);
    dropTo(b, 320, RAIL_BOTTOM, returnY);
    dropTo(b, 560, RAIL_BOTTOM, returnY);
    b.wire([200, returnY], [560, returnY]);
    b.place("ground", "GND", 200, returnY, { label: null });
  } else {
    // Classes C, D and E are leg-based; the DC supply feeds the rails and the load sits between taps
    placeDcRails(b, "Vs");
    const switchLeg = (x: number, upper: LegOptions["upper"], lower: LegOptions["lower"]) => placeLeg(b, x, { upper, lower });
    if (classification === "C") {
      heading = "Class C Chopper (Two-Quadrant, Current Reversible)";
      const leg = switchLeg(200,
        { kind: "igbt", id: "Q1", diodeId: "D1" },
        { kind: "igbt", id: "Q2", diodeId: "D2" });
      const chain = placeHChain(b, 300, LEG_TAP_Y, elements);
      b.wire([60, LEG_TOP], leg.topLeft);
      b.wire([60, LEG_BOTTOM], leg.bottomLeft);
      b.wire(leg.tap, chain.top);
      b.wire(leg.bottomRight, [chain.bottom.x, LEG_BOTTOM]);
      b.wire(chain.bottom, [chain.bottom.x, LEG_BOTTOM]);
    } else {
      const legBx = 340 + count * PART;
      const full = classification === "E";
      heading = full ? "Class E Chopper (Four-Quadrant H-Bridge)" : "Class D Chopper (Two-Quadrant, Voltage Reversible)";
      const a = switchLeg(200,
        { kind: "igbt", id: "Q1", ...(full ? { diodeId: "D1" } : {}) },
        full ? { kind: "igbt", id: "Q4", diodeId: "D4" } : { kind: "diode", id: "D1" });
      const c = switchLeg(legBx,
        full ? { kind: "igbt", id: "Q3", diodeId: "D3" } : { kind: "diode", id: "D2" },
        { kind: "igbt", id: "Q2", ...(full ? { diodeId: "D2" } : {}) });
      const chain = placeHChain(b, 300, LEG_TAP_Y, elements);
      b.wire([60, LEG_TOP], a.topLeft);
      b.wire(a.topRight, c.topLeft);
      b.wire([60, LEG_BOTTOM], a.bottomLeft);
      b.wire(a.bottomRight, c.bottomLeft);
      b.wire(a.tap, chain.top);
      b.wire(chain.bottom, c.tap);
    }
  }

  return b.build(`${heading} · ${loadType}`);
}
