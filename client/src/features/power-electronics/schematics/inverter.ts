import { LEG_BOTTOM, LEG_TAP_Y, LEG_TOP, PART, loadElements, placeDcRails, placeHChain, placeLeg } from "./layout";
import { SchematicBuilder, type SchematicDocument } from "./netlist";

export type InverterSchematicPhase = "single" | "three";
export type InverterSchematicTopology = "half-bridge" | "full-bridge";
export type InverterSchematicLoad = "R" | "RL" | "RLE";

const DC_X = 60;
const FIRST_LEG_X = 200;
const LOAD_LEFT = 300;

/** Switch ids of the first leg (the leg the shoot-through fault highlights). */
export const inverterFaultLegIds = (phase: InverterSchematicPhase, topology: InverterSchematicTopology): string[] =>
  phase === "single" && topology === "half-bridge" ? ["Q1", "Q2"] : ["Q1", "Q4"];

/**
 * Voltage-source inverter schematic: DC source left, switching legs in the centre, load right.
 * Every switch is an IGBT with an antiparallel feedback diode. Three-phase loads are
 * star-connected per-phase R / RL / RLE branches (RLE = machine back-EMF equivalent).
 */
export function buildInverterCircuit(
  phase: InverterSchematicPhase,
  topology: InverterSchematicTopology,
  loadType: InverterSchematicLoad,
): SchematicDocument {
  const b = new SchematicBuilder();
  placeDcRails(b, "Vdc");
  const count = loadElements(loadType).length;
  const switchLeg = (x: number, upper: number, lower: number) => placeLeg(b, x, {
    upper: { kind: "igbt", id: `Q${upper}`, diodeId: `D${upper}` },
    lower: { kind: "igbt", id: `Q${lower}`, diodeId: `D${lower}` },
  });

  if (phase === "single" && topology === "half-bridge") {
    const leg = switchLeg(FIRST_LEG_X, 1, 2);
    const chain = placeHChain(b, LOAD_LEFT, LEG_TAP_Y, loadElements(loadType));
    const capX = LOAD_LEFT + count * PART + 60;
    // split DC link: two equal capacitors create the mid-point O the load returns to
    b.place("capacitor", "C1", capX, 100, { rotation: 90 });
    b.place("capacitor", "C2", capX, 340, { rotation: 90 });
    b.wire([capX, 160], [capX, 280]);
    b.wire([DC_X, LEG_TOP], leg.topLeft);
    b.wire(leg.topRight, [capX, LEG_TOP]);
    b.wire([DC_X, LEG_BOTTOM], leg.bottomLeft);
    b.wire(leg.bottomRight, [capX, LEG_BOTTOM]);
    b.wire(leg.tap, chain.top);
    b.wire(chain.bottom, [capX, LEG_TAP_Y]);
  } else if (phase === "single") {
    const legB = FIRST_LEG_X + 140 + count * PART;
    const a = switchLeg(FIRST_LEG_X, 1, 4);
    const c = switchLeg(legB, 3, 2);
    const chain = placeHChain(b, LOAD_LEFT, LEG_TAP_Y, loadElements(loadType));
    b.wire([DC_X, LEG_TOP], a.topLeft);
    b.wire(a.topRight, c.topLeft);
    b.wire([DC_X, LEG_BOTTOM], a.bottomLeft);
    b.wire(a.bottomRight, c.bottomLeft);
    b.wire(a.tap, chain.top);
    b.wire(chain.bottom, c.tap);
  } else {
    // three-phase six-switch bridge; the mid-node taps leave at different heights and hop over the other legs
    const xs = [200, 440, 680];
    const legs = [switchLeg(xs[0], 1, 4), switchLeg(xs[1], 3, 6), switchLeg(xs[2], 5, 2)];
    b.wire([DC_X, LEG_TOP], legs[0].topLeft);
    b.wire(legs[0].topRight, legs[1].topLeft);
    b.wire(legs[1].topRight, legs[2].topLeft);
    b.wire([DC_X, LEG_BOTTOM], legs[0].bottomLeft);
    b.wire(legs[0].bottomRight, legs[1].bottomLeft);
    b.wire(legs[1].bottomRight, legs[2].bottomLeft);

    const tapY = [260, 220, 180]; // phase a leaves lowest so it crosses the fewest legs upward
    const rowY = [340, 220, 100];
    const jogX = 820;
    const chainLeft = 860;
    const starX = chainLeft + count * PART + 40;
    ["a", "b", "c"].forEach((name, index) => {
      const chain = placeHChain(b, chainLeft, rowY[index], loadElements(loadType, name));
      const start = { x: xs[index], y: tapY[index] };
      b.wire(start, [jogX, tapY[index]], [jogX, rowY[index]], chain.top);
      b.wire(chain.bottom, [starX, rowY[index]]);
    });
    b.wire([starX, rowY[2]], [starX, rowY[0]]);
  }

  const shape = phase === "three" ? "Three-Phase Six-Switch" : topology === "half-bridge" ? "Half-Bridge" : "Full-Bridge";
  return b.build(`${shape} Inverter · ${loadType}`);
}
