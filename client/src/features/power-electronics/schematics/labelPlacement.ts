import type { Point } from "../../control/circuitPhase1";
import { transformLocalPoint } from "../../control/circuitPhase1";
import type { SchematicComponent, SchematicLabel } from "./netlist";
import { SYMBOLS } from "./symbols";
import type { Wire } from "../../control/circuitPhase1";

interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Rendered KaTeX footprint (viewBox units, 16 px font): upright abbreviations are wider than a symbol + subscript. */
export function labelWidth(text: string): number {
  if (/^[A-Z]{2,}\d*$/.test(text)) return text.replace(/\d+$/, "").length * 13 + (/\d$/.test(text) ? 9 : 0) + 6;
  const rest = Math.max(0, text.length - 1);
  return 13 + rest * 9 + (rest > 0 ? 3 : 0);
}

const rectOf = (label: SchematicLabel): Rect => {
  const w = labelWidth(label.text);
  const x1 = label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - w : label.x - w / 2;
  return { x1, x2: x1 + w, y1: label.y - 16, y2: label.y + 8 };
};

const overlap = (a: Rect, b: Rect) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

function bodyRects(component: SchematicComponent): Rect[] {
  const def = SYMBOLS[component.kind];
  const frame = { x: component.x, y: component.y, rotation: component.rotation, reflected: component.reflected };
  if (component.kind === "ground") return [{ x1: component.x - 30, x2: component.x + 30, y1: component.y, y2: component.y + 58 }];
  const horizontal = def.native === "h";
  const main = Object.entries(def.pins).filter(([name]) => !def.controlPins.includes(name)).map(([, p]) => p);
  const xs = main.map((p) => p.x);
  const ys = main.map((p) => p.y);
  // pad across the main axis so zig-zags, plates and triangles are covered
  const local: Point[] = [
    { x: Math.min(...xs) - (horizontal ? 0 : 24), y: Math.min(...ys) - (horizontal ? 24 : 0) },
    { x: Math.max(...xs) + (horizontal ? 0 : 24), y: Math.max(...ys) + (horizontal ? 24 : 0) },
  ];
  const toRect = (p: Point, q: Point): Rect => {
    const a = transformLocalPoint(frame, p);
    const b = transformLocalPoint(frame, q);
    return { x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) };
  };
  const rects = [toRect(local[0], local[1])];
  // control (gate) lead: a thin strip from the body to the terminal
  def.controlPins.forEach((name) => {
    const g = def.pins[name];
    const along = g.x === 0 || Math.abs(g.y) > Math.abs(g.x) ? { x: 3, y: 0 } : { x: 0, y: 3 };
    const from = def.controlDir ? { x: g.x - def.controlDir.x * 40, y: g.y - def.controlDir.y * 40 } : { x: 0, y: 0 };
    rects.push(toRect({ x: Math.min(from.x, g.x) - along.x, y: Math.min(from.y, g.y) - along.y }, { x: Math.max(from.x, g.x) + along.x, y: Math.max(from.y, g.y) + along.y }));
  });
  return rects;
}

function obstaclesOf(components: SchematicComponent[], wires: Wire[], junctions: Point[]): Rect[] {
  const bodies = components.flatMap((component) => bodyRects(component));
  const segments: Rect[] = wires.flatMap((wire) => wire.points.slice(1).map((end, i) => {
    const start = wire.points[i];
    return { x1: Math.min(start.x, end.x) - 2, x2: Math.max(start.x, end.x) + 2, y1: Math.min(start.y, end.y) - 2, y2: Math.max(start.y, end.y) + 2 };
  }));
  const dot = (p: Point): Rect => ({ x1: p.x - 5, x2: p.x + 5, y1: p.y - 5, y2: p.y + 5 });
  const gates = components.flatMap((component) => SYMBOLS[component.kind].controlPins.map((name) => component.pins[name]));
  return [...bodies, ...segments, ...junctions.map(dot), ...gates.map(dot)];
}

/** Labels whose box still touches a wire, symbol, dot or another label (empty when the layout is clean). */
export function findLabelCollisions(components: SchematicComponent[], wires: Wire[], junctions: Point[]): string[] {
  const obstacles = obstaclesOf(components, wires, junctions);
  const all = components.flatMap((component) => component.labels);
  return all.filter((label, i) => {
    const rect = rectOf(label);
    return obstacles.some((o) => overlap(rect, o)) || all.some((other, j) => j !== i && overlap(rect, rectOf(other)));
  }).map((label) => label.text);
}

/**
 * Moves each label to the nearest spot (ring search around its default) where its KaTeX box
 * touches no wire, symbol body, junction dot or already-placed label.
 */
export function placeLabels(components: SchematicComponent[], wires: Wire[], junctions: Point[]): void {
  const obstacles = obstaclesOf(components, wires, junctions);
  const placed: Rect[] = [];
  const offsets: Array<[number, number]> = [[0, 0]];
  for (const radius of [8, 14, 20, 28, 36, 46, 58, 72]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]) offsets.push([dx * radius, dy * radius]);
  }
  components.forEach((component) => {
    component.labels.forEach((label) => {
      const free = (candidate: SchematicLabel) => {
        const rect = rectOf(candidate);
        return !obstacles.some((o) => overlap(rect, o)) && !placed.some((o) => overlap(rect, o));
      };
      const found = offsets.map(([dx, dy]) => ({ ...label, x: label.x + dx, y: label.y + dy })).find(free);
      if (found) { label.x = found.x; label.y = found.y; }
      placed.push(rectOf(label));
    });
  });
}
