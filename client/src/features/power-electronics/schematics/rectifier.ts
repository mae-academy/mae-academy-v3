import { PART, placeShunt, placeVChain, type ChainElement } from "./layout";
import { SchematicBuilder, type SchematicDocument } from "./netlist";

export type RectifierSchematicPhase = "single" | "three";
export type RectifierSchematicTopology = "half-wave" | "bridge" | "center-tapped";
export type RectifierSchematicLoad = "R" | "RL" | "RC" | "RLC" | "RLE";

/** Free-wheeling diodes only make sense across an inductive (RL / RLE) load. */
export const fwdAllowedFor = (loadType: RectifierSchematicLoad) => loadType === "RL" || loadType === "RLE";

/** A centre-tapped transformer rectifier has no three-phase form in this suite; it falls back to the bridge. */
export const normalizeRectifierTopology = (phase: RectifierSchematicPhase, topology: RectifierSchematicTopology): RectifierSchematicTopology =>
  phase === "three" && topology === "center-tapped" ? "bridge" : topology;

const loadElements = (load: RectifierSchematicLoad): ChainElement[] => {
  const R: ChainElement = { kind: "R", id: "R" };
  const L: ChainElement = { kind: "L", id: "L" };
  const E: ChainElement = { kind: "E", id: "E" };
  switch (load) {
    case "R":
    case "RC": return [R];
    case "RL": return [R, L];
    case "RLE": return [R, L, E];
    // RLC: series L, shunt C, feeding R (matches the rectifier math model)
    case "RLC": return [L, R];
  }
};

/**
 * Load section: vertical series chain at column `x` plus an optional shunt column
 * (smoothing capacitor, or free-wheeling diode) at `x + 120`.
 * Returns the y of the return rail the load bottom was extended to.
 */
function placeLoad(b: SchematicBuilder, x: number, top: number, load: RectifierSchematicLoad, fwd: boolean, minReturn: number): number {
  const elements = loadElements(load);
  const chain = placeVChain(b, x, top, elements);
  const returnY = Math.max(chain.bottom.y, minReturn);
  if (returnY > chain.bottom.y) b.wire(chain.bottom, [x, returnY]);
  const column = x + PART;
  if (load === "RC" || load === "RLC") {
    const shuntTop = load === "RLC" ? chain.nodes[0].y : top;
    placeShunt(b, column, shuntTop, returnY, "capacitor", "C");
    b.wire([x, shuntTop], [column, shuntTop]);
    b.wire([x, returnY], [column, returnY]);
  }
  if (fwd) {
    placeShunt(b, column, top, returnY, "diode", "FWD");
    b.wire([x, top], [column, top]);
    b.wire([x, returnY], [column, returnY]);
  }
  return returnY;
}

export function buildRectifierCircuit(
  phase: RectifierSchematicPhase,
  topology: RectifierSchematicTopology,
  loadType: RectifierSchematicLoad,
  hasFwd: boolean,
  controlled: boolean,
): SchematicDocument {
  const shape = normalizeRectifierTopology(phase, topology);
  const fwd = hasFwd && fwdAllowedFor(loadType);
  const b = new SchematicBuilder();
  const deviceKind = controlled ? "thyristor" : "diode";
  const prefix = controlled ? "T" : "D";
  const device = (index: number, x: number, y: number, rotation: 0 | 270 = 0) => b.place(deviceKind, `${prefix}${index}`, x, y, {
    rotation,
  });

  if (phase === "single" && shape === "half-wave") {
    const top = 160;
    const loadX = 380;
    b.place("acSource", "vs", 60, 220, { label: "vs" });
    const t1 = device(1, 200, top);
    b.wire([60, top], t1.a);
    b.wire(t1.k, [loadX, top]);
    const returnY = placeLoad(b, loadX, top, loadType, fwd, 280);
    b.wire([60, 280], [60, returnY], [loadX, returnY]);
    b.place("ground", "GND", 60, returnY, { label: null });
  } else if (phase === "single" && shape === "bridge") {
    const top = 40;
    const loadX = 560;
    const returnY = Math.max(top + loadElements(loadType).length * PART, 360);
    b.place("acSource", "vs", 60, 200, { label: "vs" });
    // Leg A (x = 200) and leg B (x = 360): upper device feeds +, lower device returns to -
    device(1, 200, 100, 270);
    device(4, 200, 300, 270);
    device(3, 360, 100, 270);
    device(2, 360, 300, 270);
    b.wire([200, 160], [200, 240]);
    b.wire([360, 160], [360, 240]);
    b.wire([60, 140], [140, 140], [140, 200], [200, 200]);
    b.wire([200, top], [loadX, top]);
    b.wire([200, 360], [200, returnY], [loadX, returnY]);
    if (returnY > 360) b.wire([360, 360], [360, returnY]);
    placeLoad(b, loadX, top, loadType, fwd, returnY);
    // Source return to leg B passes under the bridge and hops over the - rail
    const loopY = returnY + 60;
    b.wire([60, 260], [60, loopY], [480, loopY], [480, 200], [360, 200]);
    b.place("ground", "GND", 60, loopY, { label: null });
  } else if (phase === "single") {
    // centre-tapped transformer, two devices to a common cathode bus
    const top = 140;
    const loadX = 640;
    const returnY = Math.max(top + loadElements(loadType).length * PART, 380);
    b.place("acSource", "vs", 60, 200, { label: "vs" });
    const tf = b.place("ctTransformer", "TR", 200, 200, { label: "TR", labelAt: [0, -86] });
    b.wire([60, 140], tf.p1);
    b.wire([60, 260], tf.p2);
    const d1 = device(1, 420, 140);
    const d2 = device(2, 420, 260);
    b.wire(tf.s1, d1.a);
    b.wire(tf.s2, d2.a);
    b.wire(d1.k, [540, 140]);
    b.wire(d2.k, [540, 260]);
    b.wire([540, 140], [540, 260]);
    b.wire([540, top], [loadX, top]);
    b.wire(tf.ct, [320, 200], [320, returnY], [loadX, returnY]);
    placeLoad(b, loadX, top, loadType, fwd, returnY);
    b.place("ground", "GND", 320, returnY, { label: null });
  } else if (shape === "half-wave") {
    // three-phase, 3-pulse: three sources star-connected, one device per phase
    const rows = [160, 280, 400];
    const top = rows[0];
    const loadX = 520;
    const returnY = Math.max(top + loadElements(loadType).length * PART, 520);
    rows.forEach((y, index) => {
      const name = ["va", "vb", "vc"][index];
      b.place("acSource", name, 100, y, { rotation: 90, label: name });
      const dev = device(index + 1, 300, y);
      b.wire([160, y], dev.a);
      b.wire(dev.k, [420, y]);
    });
    b.wire([420, rows[0]], [420, rows[2]]);
    b.wire([420, top], [loadX, top]);
    b.wire([40, rows[0]], [40, returnY], [loadX, returnY]);
    placeLoad(b, loadX, top, loadType, fwd, returnY);
    b.place("ground", "GND", 40, returnY, { label: null });
  } else {
    // three-phase, 6-pulse bridge: three legs, phase lines tap the leg mid-nodes (hopping over legs)
    const top = 40;
    const loadX = 760;
    const returnY = Math.max(top + loadElements(loadType).length * PART, 400);
    const legs = [
      { x: 320, upper: 1, lower: 4 },
      { x: 440, upper: 3, lower: 6 },
      { x: 560, upper: 5, lower: 2 },
    ];
    legs.forEach((leg) => {
      device(leg.upper, leg.x, 100, 270);
      device(leg.lower, leg.x, 340, 270);
      b.wire([leg.x, 160], [leg.x, 280]);
    });
    [180, 300, 420].forEach((y, index) => {
      const name = ["va", "vb", "vc"][index];
      b.place("acSource", name, 100, y, { rotation: 90, label: name });
    });
    b.wire([160, 180], [320, 180]);
    b.wire([160, 300], [200, 300], [200, 220], [440, 220]);
    b.wire([160, 420], [240, 420], [240, 260], [560, 260]);
    b.wire([40, 180], [40, 420]);
    b.place("ground", "GND", 40, 420, { label: null });
    b.wire([320, top], [loadX, top]);
    b.wire([320, returnY], [loadX, returnY]);
    placeLoad(b, loadX, top, loadType, fwd, returnY);
  }

  const phaseLabel = phase === "single" ? "1-Φ" : "3-Φ";
  const shapeLabel = shape === "half-wave" ? "Half-Wave" : shape === "bridge" ? "Bridge" : "Center-Tapped";
  const title = `${phaseLabel} ${shapeLabel} ${controlled ? "Controlled" : "Uncontrolled"} Rectifier · ${loadType}${fwd ? " + FWD" : ""}`;
  return b.build(title);
}
