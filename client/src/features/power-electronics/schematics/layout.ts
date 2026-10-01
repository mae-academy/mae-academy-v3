import type { Point } from "../../control/circuitPhase1";
import type { SchematicBuilder } from "./netlist";

/** Shared placement helpers. All coordinates are multiples of the 20 px grid; parts are 120 px long. */
export const PART = 120;
export const HALF = PART / 2;

export type ChainKind = "R" | "L" | "E";
export interface ChainElement { kind: ChainKind; id: string }

const KIND_TO_SYMBOL = { R: "resistor", L: "inductor", E: "battery" } as const;

export interface ChainResult {
  top: Point;
  bottom: Point;
  /** Node after each element (index 0 = after the first element). */
  nodes: Point[];
}

/**
 * Series chain running top-to-bottom at column `x`. The battery keeps its "+" plate on
 * the side `plusFirst` selects: true when current enters the "+" terminal (a sink / back-EMF).
 */
export function placeVChain(b: SchematicBuilder, x: number, top: number, elements: ChainElement[], plusFirst = true): ChainResult {
  const nodes: Point[] = [];
  elements.forEach((element, index) => {
    const centre = top + index * PART + HALF;
    if (element.kind === "E") b.place("battery", element.id, x, centre, { rotation: plusFirst ? 0 : 180 });
    else b.place(KIND_TO_SYMBOL[element.kind], element.id, x, centre, { rotation: 90 });
    nodes.push({ x, y: top + (index + 1) * PART });
  });
  return { top: { x, y: top }, bottom: { x, y: top + elements.length * PART }, nodes };
}

/** Series chain running left-to-right at row `y`. The battery's "+" leads when `plusFirst`. */
export function placeHChain(b: SchematicBuilder, left: number, y: number, elements: ChainElement[], plusFirst = true): ChainResult {
  const nodes: Point[] = [];
  elements.forEach((element, index) => {
    const centre = left + index * PART + HALF;
    if (element.kind === "E") b.place("battery", element.id, centre, y, { rotation: plusFirst ? 270 : 90 });
    else b.place(KIND_TO_SYMBOL[element.kind], element.id, centre, y);
    nodes.push({ x: left + (index + 1) * PART, y });
  });
  return { top: { x: left, y }, bottom: { x: left + elements.length * PART, y }, nodes };
}

/**
 * Vertical shunt branch (capacitor or free-wheeling diode) at column `x` between two rails.
 * The diode is oriented cathode-up, so it conducts when the load rail goes negative.
 */
export function placeShunt(b: SchematicBuilder, x: number, yTop: number, yBottom: number, kind: "capacitor" | "diode", id: string): void {
  const span = yBottom - yTop;
  if (span < PART || (span / 2) % 20 !== 0) throw new Error(`Shunt ${id} cannot span ${span}px on the grid`);
  const centre = yTop + span / 2;
  if (kind === "capacitor") b.place("capacitor", id, x, centre, { rotation: 90 });
  else b.place("diode", id, x, centre, { rotation: 270 });
  if (span > PART) {
    b.wire([x, yTop], [x, centre - HALF]);
    b.wire([x, centre + HALF], [x, yBottom]);
  }
}

export interface LegOptions {
  upper: { kind: "igbt" | "diode"; id: string; diodeId?: string };
  lower: { kind: "igbt" | "diode"; id: string; diodeId?: string };
}

export interface LegResult {
  /** Mid-point output tap (centre of the leg). */
  tap: Point;
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

export const LEG_TOP = 40;
export const LEG_BOTTOM = 400;
export const LEG_TAP_Y = 220;
const UPPER_CY = 100;
const LOWER_CY = 340;
const DIODE_OFFSET = 100;

/**
 * Half-bridge leg: upper element, lower element and a mid node.
 * A switch carries an optional antiparallel diode on its right; a bare diode element
 * conducts upwards (anode toward the lower rail).
 */
export function placeLeg(b: SchematicBuilder, x: number, options: LegOptions): LegResult {
  const place = (side: "upper" | "lower") => {
    const spec = options[side];
    const cy = side === "upper" ? UPPER_CY : LOWER_CY;
    if (spec.kind === "igbt") {
      b.place("igbt", spec.id, x, cy, {});
      if (spec.diodeId) b.place("diode", spec.diodeId, x + DIODE_OFFSET, cy, { rotation: 270 });
    } else {
      b.place("diode", spec.id, x, cy, { rotation: 270 });
    }
  };
  place("upper");
  place("lower");

  const hasUpperDiode = Boolean(options.upper.kind === "igbt" && options.upper.diodeId);
  const hasLowerDiode = Boolean(options.lower.kind === "igbt" && options.lower.diodeId);
  b.wire([x, 160], [x, 280]);
  if (hasUpperDiode) {
    b.wire([x, LEG_TOP], [x + DIODE_OFFSET, LEG_TOP]);
    b.wire([x, 160], [x + DIODE_OFFSET, 160]);
  }
  if (hasLowerDiode) {
    b.wire([x, 280], [x + DIODE_OFFSET, 280]);
    b.wire([x, LEG_BOTTOM], [x + DIODE_OFFSET, LEG_BOTTOM]);
  }
  return {
    tap: { x, y: LEG_TAP_Y },
    topLeft: { x, y: LEG_TOP },
    topRight: { x: hasUpperDiode ? x + DIODE_OFFSET : x, y: LEG_TOP },
    bottomLeft: { x, y: LEG_BOTTOM },
    bottomRight: { x: hasLowerDiode ? x + DIODE_OFFSET : x, y: LEG_BOTTOM },
  };
}

export const loadElements = (load: "R" | "RL" | "RLE", suffix = ""): ChainElement[] => {
  const base: ChainElement[] = [{ kind: "R", id: `R${suffix}` }];
  if (load !== "R") base.push({ kind: "L", id: `L${suffix}` });
  if (load === "RLE") base.push({ kind: "E", id: `E${suffix}` });
  return base;
};

/** DC supply on the left of a leg-based converter, tied to the top and bottom rails. */
export function placeDcRails(b: SchematicBuilder, label: string): void {
  b.place("dcSource", label, 60, LEG_TAP_Y, { label });
  b.wire([60, LEG_TAP_Y - HALF], [60, LEG_TOP]);
  b.wire([60, LEG_TAP_Y + HALF], [60, LEG_BOTTOM]);
}
