import { GROUND_PATH, RESISTOR_PATH, type Point } from "../../control/circuitPhase1";

/**
 * Power-electronics symbol library for the schematic generator.
 *
 * Every symbol is defined in local coordinates around its origin. Pin offsets are
 * multiples of the circuit grid (20 px) so a placed symbol always lands on the grid;
 * two-terminal parts span 120 px pin-to-pin, matching the engine's resistor symbol.
 * Rotation/reflection use the engine's `transformLocalPoint`.
 */
export type SymbolKind =
  | "acSource"
  | "dcSource"
  | "battery"
  | "diode"
  | "thyristor"
  | "triac"
  | "igbt"
  | "resistor"
  | "inductor"
  | "capacitor"
  | "ground"
  | "ctTransformer";

/**
 * `lead` primitives are terminal extensions and are drawn exactly like wires (same width and colour),
 * so a wire meets a pin with no visible splice; `body` primitives are the symbol itself.
 */
export type SymbolRole = "lead" | "body";
export type SymbolPrimitive =
  | { type: "path"; d: string; role: SymbolRole; solid?: boolean; /** counter-rotated so glyphs (sine wave) stay upright */ upright?: boolean }
  | { type: "circle"; cx: number; cy: number; r: number; role: SymbolRole };

export interface SymbolDef {
  /** Native drawing orientation of the main current path. */
  native: "h" | "v";
  pins: Record<string, Point>;
  /** Pins that are control terminals (gate) and may legitimately stay unwired. */
  controlPins: string[];
  /** Unit vector (local) pointing from the body out to the control terminal. */
  controlDir?: Point;
  draw: SymbolPrimitive[];
}

const lead = (d: string): SymbolPrimitive => ({ type: "path", d, role: "lead" });
const body = (d: string, solid = false, upright = false): SymbolPrimitive => ({ type: "path", d, role: "body", solid, upright });
const bumps = (count: number, arc: string) => arc.repeat(count);

const DIODE_LEADS = "M-60 0H-14M14 0H60";
const DIODE_BODY = "M-14 -16L14 0L-14 16ZM14 -16V16";

export const SYMBOLS: Record<SymbolKind, SymbolDef> = {
  resistor: {
    native: "h",
    pins: { a: { x: -60, y: 0 }, b: { x: 60, y: 0 } },
    controlPins: [],
    draw: [lead("M-60 0H-44M44 0H60"), body(RESISTOR_PATH.replace("M-60 0H-44", "M-44 0").replace("H60", ""))],
  },
  inductor: {
    native: "h",
    pins: { a: { x: -60, y: 0 }, b: { x: 60, y: 0 } },
    controlPins: [],
    draw: [lead("M-60 0H-40M40 0H60"), body(`M-40 0${bumps(4, "a10 10 0 0 1 20 0")}`)],
  },
  capacitor: {
    native: "h",
    pins: { a: { x: -60, y: 0 }, b: { x: 60, y: 0 } },
    controlPins: [],
    draw: [lead("M-60 0H-8M8 0H60"), body("M-8 -22V22M8 -22V22")],
  },
  diode: {
    native: "h",
    pins: { a: { x: -60, y: 0 }, k: { x: 60, y: 0 } },
    controlPins: [],
    draw: [lead(DIODE_LEADS), body(DIODE_BODY)],
  },
  thyristor: {
    native: "h",
    pins: { a: { x: -60, y: 0 }, k: { x: 60, y: 0 }, g: { x: 20, y: 60 } },
    controlPins: ["g"],
    controlDir: { x: 0, y: 1 },
    draw: [lead(DIODE_LEADS), body(DIODE_BODY), lead("M14 8L20 20V60"), { type: "circle", cx: 20, cy: 60, r: 3, role: "lead" }],
  },
  triac: {
    native: "h",
    pins: { a: { x: -60, y: 0 }, b: { x: 60, y: 0 }, g: { x: 0, y: 60 } },
    controlPins: ["g"],
    controlDir: { x: 0, y: 1 },
    // IEEE TRIAC: two opposed triangles overlapping between end bars (a bowtie), gate on the lower edge
    draw: [
      lead("M-60 0H-14M14 0H60M0 60V8"),
      body("M-14 -16V16M14 -16V16"),
      body("M-14 -16L14 0L-14 16ZM14 -16L-14 0L14 16Z"),
      { type: "circle", cx: 0, cy: 60, r: 3, role: "lead" },
    ],
  },
  igbt: {
    native: "v",
    pins: { c: { x: 0, y: -60 }, e: { x: 0, y: 60 }, g: { x: -60, y: 0 } },
    controlPins: ["g"],
    controlDir: { x: -1, y: 0 },
    draw: [
      lead("M-60 0H-22M0 -60V-22M0 22V60"),
      body("M-22 -16V16M-12 -18V18M-12 -11L0 -22M-12 11L0 22"),
      body("M0 22L-9.4 19L-4 13Z", true),
      { type: "circle", cx: -60, cy: 0, r: 3, role: "lead" },
    ],
  },
  acSource: {
    native: "v",
    pins: { p: { x: 0, y: -60 }, n: { x: 0, y: 60 } },
    controlPins: [],
    draw: [lead("M0 -60V-24M0 24V60"), body("M-12 0C-8 -12 -4 -12 0 0S8 12 12 0", false, true), { type: "circle", cx: 0, cy: 0, r: 24, role: "body" }],
  },
  dcSource: {
    native: "v",
    pins: { p: { x: 0, y: -60 }, n: { x: 0, y: 60 } },
    controlPins: [],
    draw: [lead("M0 -60V-8M0 8V60"), body("M-18 -8H18M-10 8H10M-32 -26H-22M-27 -31V-21")],
  },
  battery: {
    native: "v",
    pins: { p: { x: 0, y: -60 }, n: { x: 0, y: 60 } },
    controlPins: [],
    draw: [lead("M0 -60V-20M0 16V60"), body("M-18 -20H18M-10 -8H10M-18 4H18M-10 16H10M-32 -34H-22M-27 -39V-29")],
  },
  ground: {
    native: "v",
    pins: { p: { x: 0, y: 0 } },
    controlPins: [],
    draw: [lead("M0 0V28"), body(GROUND_PATH.replace("M0 0V28", ""))],
  },
  ctTransformer: {
    native: "h",
    pins: {
      p1: { x: -80, y: -60 },
      p2: { x: -80, y: 60 },
      s1: { x: 80, y: -60 },
      ct: { x: 80, y: 0 },
      s2: { x: 80, y: 60 },
    },
    controlPins: [],
    draw: [
      lead("M-80 -60H-30M-30 60H-80M80 -60H30M30 60H80M30 0H80"),
      body(`M-30 -60${bumps(6, "a10 10 0 0 0 0 20")}`),
      body(`M30 -60${bumps(6, "a10 10 0 0 1 0 20")}`),
      body("M-6 -60V60M6 -60V60"),
    ],
  },
};
