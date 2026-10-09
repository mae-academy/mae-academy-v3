/**
 * Auto-wiring for the 16x2 LCD: computes the jumper routes between the Uno headers and the LCD module header.
 * Pure geometry (board pixels, y grows downward), so the routing rules are unit-testable without rendering.
 *
 * Rules: every wire is orthogonal (vertical/horizontal runs only); signal wires rise straight from their header pad to a
 * private lane just under the LCD and then step sideways onto their LCD pin; power wires that cannot reach their LCD pin
 * directly detour around the board edge. Crossings are resolved at render time with hop-overs.
 */
import { I2C_PINS, LCD_HOLE_Y, LCD_PINS, i2cHoleX, lcdHoleX, type I2cPin, type LcdPin } from "./lcdGeometry";

export interface Pt {
  x: number;
  y: number;
}

export type HarnessNet = "5V" | "GND" | "signal";

export interface HarnessWire {
  /** Stable id, e.g. "RS-D12" or "VDD-5V". */
  id: string;
  /** LCD (or backpack) pin name. */
  pin: string;
  /** Arduino header the wire starts on, e.g. "D12", "5V", "GND". */
  from: string;
  net: HarnessNet;
  color: string;
  points: Pt[];
}

export interface HarnessInput {
  mode: "parallel" | "i2c";
  /** Parallel: [RS, E, D4, D5, D6, D7] Arduino pin numbers. */
  pins: number[];
  /** Top-left of the LCD PCB in board pixels. */
  origin: Pt;
  boardW: number;
  boardH: number;
  /** Pad position of a GPIO pin (0-19) on the Uno headers. */
  pinPoint: (pin: number) => Pt;
  gndTop: Pt;
  gndBottom: Pt;
  v5: Pt;
  sda: Pt;
  scl: Pt;
}

export const HARNESS_COLORS = {
  RS: "#F59E0B",
  E: "#A855F7",
  D4: "#3B82F6",
  D5: "#06B6D4",
  D6: "#22C55E",
  D7: "#EC4899",
  SDA: "#22C55E",
  SCL: "#F59E0B",
  "5V": "#DC2626",
  GND: "#1E293B",
} as const;

const LANE_PITCH = 5.5;
const LANE_START = 17;
const SIDE_PITCH = 8;

const pinLabel = (pin: number): string => (pin >= 14 ? `A${pin - 14}` : `D${pin}`);

/** Drops zero-length steps and merges collinear runs so every polyline vertex is a real corner. */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

export function buildLcdHarness(input: HarnessInput): HarnessWire[] {
  const { mode, pins, origin, boardW, boardH, pinPoint, gndTop, gndBottom, v5 } = input;
  const holeY = origin.y + LCD_HOLE_Y;
  const lane = (i: number): number => holeY + LANE_START + i * LANE_PITCH;
  const hole = (pin: LcdPin): Pt => ({ x: origin.x + lcdHoleX(LCD_PINS.indexOf(pin)), y: holeY });
  const i2cHole = (pin: I2cPin): Pt => ({ x: origin.x + i2cHoleX(pin), y: holeY });

  interface Spec {
    pin: string;
    from: string;
    net: HarnessNet;
    color: string;
    src: Pt;
    dst: Pt;
    /** Where the wire leaves the Uno: "top" headers sit above the board, "bottom" headers below it. */
    side: "top" | "bottom";
    route?: "direct" | "left" | "right";
  }
  const specs: Spec[] = [];
  const signal = (pin: string, from: string, color: string, src: Pt, dst: Pt, side: "top" | "bottom" = "top"): void => {
    specs.push({ pin, from, net: "signal", color, src, dst, side, route: side === "bottom" ? "right" : "direct" });
  };

  if (mode === "parallel") {
    const names: LcdPin[] = ["RS", "E", "D4", "D5", "D6", "D7"];
    names.forEach((name, i) => {
      const pin = pins[i] ?? 0;
      signal(name, pinLabel(pin), HARNESS_COLORS[name as keyof typeof HARNESS_COLORS], pinPoint(pin), hole(name), pin >= 14 ? "bottom" : "top");
    });
    specs.push({ pin: "VSS", from: "GND", net: "GND", color: HARNESS_COLORS.GND, src: gndTop, dst: hole("VSS"), side: "top", route: "direct" });
    specs.push({ pin: "RW", from: "GND", net: "GND", color: HARNESS_COLORS.GND, src: gndTop, dst: hole("RW"), side: "top", route: "direct" });
    specs.push({ pin: "VDD", from: "5V", net: "5V", color: HARNESS_COLORS["5V"], src: v5, dst: hole("VDD"), side: "bottom", route: "left" });
    specs.push({ pin: "A", from: "5V", net: "5V", color: HARNESS_COLORS["5V"], src: v5, dst: hole("A"), side: "bottom", route: "right" });
    specs.push({ pin: "K", from: "GND", net: "GND", color: HARNESS_COLORS.GND, src: gndBottom, dst: hole("K"), side: "bottom", route: "right" });
  } else {
    specs.push({ pin: "GND", from: "GND", net: "GND", color: HARNESS_COLORS.GND, src: gndTop, dst: i2cHole("GND"), side: "top", route: "direct" });
    specs.push({ pin: "VCC", from: "5V", net: "5V", color: HARNESS_COLORS["5V"], src: v5, dst: i2cHole("VCC"), side: "bottom", route: "right" });
    specs.push({ pin: "SDA", from: "SDA", net: "signal", color: HARNESS_COLORS.SDA, src: input.sda, dst: i2cHole("SDA"), side: "top", route: "direct" });
    specs.push({ pin: "SCL", from: "SCL", net: "signal", color: HARNESS_COLORS.SCL, src: input.scl, dst: i2cHole("SCL"), side: "top", route: "direct" });
  }

  // Lanes (0 = nearest the LCD). Jogging wires nest so they never cross: leftmost pad first when stepping right, rightmost pad
  // first when stepping left. The two GND wires leaving the top-GND pad share one lane and read as a single bus.
  const jogs = specs.filter(s => s.route === "direct" && s.src.x !== s.dst.x);
  const rightJogs = jogs.filter(s => s.dst.x > s.src.x).sort((p, q) => p.src.x - q.src.x);
  const leftJogs = jogs.filter(s => s.dst.x < s.src.x).sort((p, q) => q.src.x - p.src.x);
  // Detours: the pin landing farthest out takes the outermost, deepest route and the lane nearest the LCD.
  const rightDetours = specs.filter(s => s.route === "right").sort((p, q) => q.dst.x - p.dst.x);
  const leftDetours = specs.filter(s => s.route === "left").sort((p, q) => p.dst.x - q.dst.x);
  const laneIndex = new Map<string, number>();
  const laneKey = (s: Spec): string => (s.net === "GND" && s.route === "direct" ? "gnd-bus" : s.pin);
  for (const s of [...rightJogs, ...leftJogs, ...rightDetours, ...leftDetours]) if (!laneIndex.has(laneKey(s))) laneIndex.set(laneKey(s), laneIndex.size);
  const depthBase = boardH + 12;

  return specs.map((s): HarnessWire => {
    const y = lane(laneIndex.get(laneKey(s)) ?? 0);
    let pts: Pt[];
    if (s.route === "direct") {
      pts = [s.src, { x: s.src.x, y }, { x: s.dst.x, y }, s.dst];
    } else {
      const group = s.route === "right" ? rightDetours : leftDetours;
      const k = group.indexOf(s);
      const outer = group.length - 1 - k;
      const riserX = s.route === "right" ? boardW + 14 + outer * SIDE_PITCH : -14 - outer * SIDE_PITCH;
      const depth = depthBase + outer * SIDE_PITCH;
      pts = [s.src, { x: s.src.x, y: depth }, { x: riserX, y: depth }, { x: riserX, y }, { x: s.dst.x, y }, s.dst];
    }
    return { id: `${s.pin}-${s.from}`, pin: s.pin, from: s.from, net: s.net, color: s.color, points: simplify(pts) };
  });
}

// ---------------------------------------------------------------------------
// Rendering geometry: rounded corners and hop-overs
// ---------------------------------------------------------------------------
/**
 * Hop-over positions keyed `${wire.id}:${segmentIndex}`: x coordinates where a horizontal run passes over another wire's
 * vertical run. Wires of the same power net merge instead of hopping; signal wires always hop each other.
 */
export function findHops(wires: HarnessWire[]): Map<string, number[]> {
  const hops = new Map<string, number[]>();
  const margin = 7;
  wires.forEach((h, hw) => {
    h.points.slice(1).forEach((hb, si) => {
      const ha = h.points[si];
      if (ha.y !== hb.y) return;
      const lo = Math.min(ha.x, hb.x);
      const hi = Math.max(ha.x, hb.x);
      wires.forEach((v, vw) => {
        if (vw === hw || (v.net === h.net && h.net !== "signal")) return;
        v.points.slice(1).forEach((vb, vi) => {
          const va = v.points[vi];
          if (va.x !== vb.x) return;
          const crosses = va.x > lo + margin && va.x < hi - margin && ha.y > Math.min(va.y, vb.y) + 1 && ha.y < Math.max(va.y, vb.y) - 1;
          if (crosses) hops.set(`${h.id}:${si}`, [...(hops.get(`${h.id}:${si}`) ?? []), va.x]);
        });
      });
    });
  });
  return hops;
}

export const HOP_R = 4.2;
const CORNER_R = 5;

/** SVG path for one wire: rounded corners, semicircular hops over crossing vertical runs. */
export function wirePath(points: Pt[], hops: Map<string, number[]>, id: string): string {
  const n = points.length;
  if (n < 2) return "";
  const fmt = (v: number): string => (Math.round(v * 100) / 100).toString();
  const len = (a: Pt, b: Pt): number => Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const dir = (a: Pt, b: Pt): Pt => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });
  let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < n; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dv = dir(a, b);
    const inR = i > 1 ? Math.min(CORNER_R, len(points[i - 2], a) / 2, len(a, b) / 2) : 0;
    const outR = i < n - 1 ? Math.min(CORNER_R, len(a, b) / 2, len(b, points[i + 1]) / 2) : 0;
    const start: Pt = { x: a.x + dv.x * inR, y: a.y + dv.y * inR };
    const end: Pt = { x: b.x - dv.x * outR, y: b.y - dv.y * outR };
    if (inR > 0) d += ` L${fmt(start.x)} ${fmt(start.y)}`;
    const xs = (hops.get(`${id}:${i - 1}`) ?? []).slice().sort((p, q) => (dv.x > 0 ? p - q : q - p));
    for (const hx of xs) {
      if (hx - HOP_R <= Math.min(start.x, end.x) || hx + HOP_R >= Math.max(start.x, end.x)) continue;
      d += ` L${fmt(hx - dv.x * HOP_R)} ${fmt(a.y)} A${HOP_R} ${HOP_R} 0 0 ${dv.x > 0 ? 1 : 0} ${fmt(hx + dv.x * HOP_R)} ${fmt(a.y)}`;
    }
    d += ` L${fmt(end.x)} ${fmt(end.y)}`;
    if (outR > 0) {
      const nd = dir(b, points[i + 1]);
      d += ` Q${fmt(b.x)} ${fmt(b.y)} ${fmt(b.x + nd.x * outR)} ${fmt(b.y + nd.y * outR)}`;
    }
  }
  return d;
}

export interface HopArc {
  key: string;
  color: string;
  net: HarnessNet;
  d: string;
}

/**
 * One arc per crossing, drawn in a layer above every wire. The hopping wire always runs over the wire it crosses,
 * regardless of which one was painted first, so the stacking order is never ambiguous.
 */
export function hopArcs(wires: HarnessWire[], hops: Map<string, number[]>): HopArc[] {
  return wires.flatMap(w =>
    w.points.slice(1).flatMap((b, si) => {
      const a = w.points[si];
      return (hops.get(`${w.id}:${si}`) ?? []).map((x, i): HopArc => {
        const dir = Math.sign(b.x - a.x);
        return { key: `${w.id}:${si}:${i}`, color: w.color, net: w.net, d: `M${x - dir * HOP_R} ${a.y} A${HOP_R} ${HOP_R} 0 0 ${dir > 0 ? 1 : 0} ${x + dir * HOP_R} ${a.y}` };
      });
    }),
  );
}
