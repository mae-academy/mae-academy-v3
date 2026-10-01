import { GRID, findOrthogonalJumps, transformLocalPoint, type Point, type Wire } from "../../control/circuitPhase1";
import { labelWidth, placeLabels } from "./labelPlacement";
import { SYMBOLS, type SymbolKind } from "./symbols";

export type Rotation = 0 | 90 | 180 | 270;
export type LabelAnchor = "start" | "middle" | "end";

export interface SchematicLabel { text: string; x: number; y: number; anchor: LabelAnchor }

export interface SchematicComponent {
  id: string;
  kind: SymbolKind;
  x: number;
  y: number;
  rotation: Rotation;
  reflected: boolean;
  /** Absolute (grid-snapped) pin positions keyed by pin name. */
  pins: Record<string, Point>;
  labels: SchematicLabel[];
}

export interface SchematicNet {
  /** "0" for the ground-referenced net, otherwise "n1", "n2", ... */
  id: string;
  /** Pin references in `componentId.pin` form. */
  pins: string[];
}

export interface SchematicDocument {
  title: string;
  components: SchematicComponent[];
  wires: Wire[];
  /** T-connections / multi-way joins that are drawn as dots. */
  junctions: Point[];
  nets: SchematicNet[];
  texts: SchematicLabel[];
  bounds: { x1: number; y1: number; x2: number; y2: number };
}

export interface PlaceOptions {
  rotation?: Rotation;
  reflected?: boolean;
  /** Defaults to the component id. `null` hides the label. */
  label?: string | null;
  /** Label offset from the component origin; defaults depend on orientation. */
  labelAt?: readonly [number, number];
  labelAnchor?: LabelAnchor;
}

type XY = readonly [number, number];

const onGrid = (value: number) => Math.abs(value / GRID - Math.round(value / GRID)) < 1e-9;
const key = (p: Point) => `${p.x}:${p.y}`;
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function segmentsOf(points: Point[]) {
  return points.slice(1).map((end, index) => ({ start: points[index], end }));
}

function pointOnSegment(p: Point, start: Point, end: Point) {
  return p.x >= Math.min(start.x, end.x) && p.x <= Math.max(start.x, end.x) && p.y >= Math.min(start.y, end.y) && p.y <= Math.max(start.y, end.y);
}

function pointOnPolyline(p: Point, points: Point[]) {
  return segmentsOf(points).some(({ start, end }) => pointOnSegment(p, start, end));
}

export class SchematicBuilder {
  private readonly components: SchematicComponent[] = [];
  private readonly wires: Wire[] = [];
  private readonly texts: SchematicLabel[] = [];
  private readonly ids = new Set<string>();

  /** Places a symbol on the grid and returns its absolute pin positions. */
  place(kind: SymbolKind, id: string, x: number, y: number, options: PlaceOptions = {}): Record<string, Point> {
    if (this.ids.has(id)) throw new Error(`Duplicate component id "${id}"`);
    if (!onGrid(x) || !onGrid(y)) throw new Error(`Component "${id}" is off the ${GRID}px grid at (${x}, ${y})`);
    this.ids.add(id);
    const def = SYMBOLS[kind];
    const rotation = options.rotation ?? 0;
    const reflected = options.reflected ?? false;
    const frame = { x, y, rotation, reflected };
    const pins: Record<string, Point> = {};
    for (const [name, local] of Object.entries(def.pins)) {
      const absolute = transformLocalPoint(frame, local);
      if (!onGrid(absolute.x) || !onGrid(absolute.y)) throw new Error(`Pin ${id}.${name} is off the grid`);
      pins[name] = absolute;
    }

    const labels: SchematicLabel[] = [];
    const text = options.label === undefined ? id : options.label;
    if (text) {
      const quarterTurn = rotation === 90 || rotation === 270;
      const horizontal = (def.native === "h") !== quarterTurn;
      const [dx, dy] = options.labelAt ?? (horizontal ? [0, -30] : [26, 5]);
      labels.push({ text, x: x + dx, y: y + dy, anchor: options.labelAnchor ?? (options.labelAt ? "middle" : horizontal ? "middle" : "start") });
    }
    this.components.push({ id, kind, x, y, rotation, reflected, pins, labels });
    return pins;
  }

  /** Adds an orthogonal wire through the given grid points. */
  wire(...input: Array<XY | Point>): void {
    const raw: Point[] = input.map((entry) => (Array.isArray(entry) ? { x: entry[0], y: entry[1] } : (entry as Point)));
    const points = raw.filter((p, index) => index === 0 || !samePoint(p, raw[index - 1]));
    if (points.length < 2) return; // zero-length: the endpoints already coincide
    points.forEach((p, index) => {
      if (!onGrid(p.x) || !onGrid(p.y)) throw new Error(`Wire point (${p.x}, ${p.y}) is off the ${GRID}px grid`);
      if (index > 0 && points[index - 1].x !== p.x && points[index - 1].y !== p.y) {
        throw new Error(`Diagonal wire segment (${points[index - 1].x}, ${points[index - 1].y}) -> (${p.x}, ${p.y})`);
      }
    });
    this.wires.push({ id: `w${this.wires.length + 1}`, from: "", to: "", points, style: "orthogonal" });
  }

  text(text: string, x: number, y: number, anchor: LabelAnchor = "middle"): void {
    this.texts.push({ text, x, y, anchor });
  }

  build(title: string): SchematicDocument {
    assertUniqueLabels(this.components, title);
    const pinAt = new Map<string, string[]>();
    this.components.forEach((component) => Object.entries(component.pins).forEach(([name, p]) => {
      pinAt.set(key(p), [...(pinAt.get(key(p)) ?? []), `${component.id}.${name}`]);
    }));
    const wires: Wire[] = this.wires.map((wire) => {
      const first = wire.points[0];
      const last = wire.points[wire.points.length - 1];
      return {
        ...wire,
        from: pinAt.get(key(first))?.[0] ?? `junction:${first.x}:${first.y}`,
        to: pinAt.get(key(last))?.[0] ?? `junction:${last.x}:${last.y}`,
        fromPoint: first,
        toPoint: last,
      };
    });
    assignHops(wires);
    const junctions = deriveJunctions(wires, pinAt);
    placeLabels(this.components, wires, junctions);
    const nets = extractNets(this.components, wires);
    return { title, components: this.components, wires, junctions, nets, texts: this.texts, bounds: computeBounds(this.components, wires, this.texts) };
  }
}

/** Every visible tag (component names and gate terminals) must be unique on a schematic. */
export function assertUniqueLabels(components: SchematicComponent[], title = "schematic"): void {
  const seen = new Set<string>();
  for (const component of components) {
    for (const label of component.labels) {
      if (seen.has(label.text)) throw new Error(`Duplicate schematic component label detected: ${label.text} (${title})`);
      seen.add(label.text);
    }
  }
}

/** Crossing wires are drawn with a hop over the horizontal run, never as a connection. */
function assignHops(wires: Wire[]) {
  wires.forEach((wire, index) => {
    const crossings = findOrthogonalJumps(wire.points, wires.slice(0, index));
    crossings.forEach((crossing) => {
      const horizontalOwner = [wire, ...wires.slice(0, index)].find((candidate) => segmentsOf(candidate.points).some(({ start, end }) => (
        start.y === end.y && start.y === crossing.y && crossing.x > Math.min(start.x, end.x) && crossing.x < Math.max(start.x, end.x)
      )));
      if (horizontalOwner && !horizontalOwner.jumps?.some((jump) => samePoint(jump, crossing))) {
        horizontalOwner.jumps = [...(horizontalOwner.jumps ?? []), crossing];
      }
    });
  });
}

function deriveJunctions(wires: Wire[], pinAt: Map<string, string[]>): Point[] {
  const candidates = new Map<string, Point>();
  wires.forEach((wire) => {
    const ends = [wire.points[0], wire.points[wire.points.length - 1]];
    ends.forEach((p) => candidates.set(key(p), p));
  });
  pinAt.forEach((_pins, pointKey) => {
    const [x, y] = pointKey.split(":").map(Number);
    candidates.set(pointKey, { x, y });
  });
  const result: Point[] = [];
  candidates.forEach((p) => {
    let degree = pinAt.get(key(p))?.length ?? 0;
    wires.forEach((wire) => {
      const last = wire.points.length - 1;
      wire.points.forEach((vertex, index) => {
        if (!samePoint(vertex, p)) return;
        degree += index === 0 || index === last ? 1 : 2;
      });
      segmentsOf(wire.points).forEach(({ start, end }) => {
        const strictlyInside = pointOnSegment(p, start, end) && !samePoint(p, start) && !samePoint(p, end);
        if (strictlyInside) degree += 2;
      });
    });
    if (degree >= 3) result.push(p);
  });
  return result;
}

/** Geometric connectivity: wire endpoints/pins that touch a wire join its net; pure crossings do not. */
export function extractNets(components: SchematicComponent[], wires: Wire[]): SchematicNet[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const direct = parent.get(id);
    if (direct === undefined || direct === id) { parent.set(id, id); return id; }
    const root = find(direct);
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };

  const pins = components.flatMap((component) => Object.entries(component.pins).map(([name, p]) => ({ ref: `${component.id}.${name}`, p })));
  pins.forEach(({ ref }) => find(ref));
  wires.forEach((wire) => find(wire.id));
  pins.forEach(({ ref, p }, index) => {
    wires.forEach((wire) => { if (pointOnPolyline(p, wire.points)) join(ref, wire.id); });
    pins.slice(index + 1).forEach((other) => { if (samePoint(p, other.p)) join(ref, other.ref); });
  });
  wires.forEach((wire, index) => {
    const ends = [wire.points[0], wire.points[wire.points.length - 1]];
    wires.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      if (ends.some((end) => pointOnPolyline(end, other.points))) join(wire.id, other.id);
    });
  });

  const groups = new Map<string, string[]>();
  pins.forEach(({ ref }) => { const root = find(ref); groups.set(root, [...(groups.get(root) ?? []), ref]); });
  const groundRefs = new Set(components.filter((component) => component.kind === "ground").map((component) => `${component.id}.p`));
  let counter = 0;
  return Array.from(groups.values()).map((refs) => ({ id: refs.some((ref) => groundRefs.has(ref)) ? "0" : `n${++counter}`, pins: refs }));
}

export const netOf = (document: SchematicDocument, pinRef: string): string | undefined => document.nets.find((net) => net.pins.includes(pinRef))?.id;

function computeBounds(components: SchematicComponent[], wires: Wire[], texts: SchematicLabel[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => { xs.push(x); ys.push(y); };
  components.forEach((component) => {
    Object.values(component.pins).forEach((p) => add(p.x, p.y));
    // keep the full body (a rotated symbol can extend past its pins, e.g. the ground symbol)
    add(component.x - 40, component.y - 40);
    add(component.x + 40, component.y + 40);
    if (component.kind === "ground") add(component.pins.p.x, component.pins.p.y + 60);
  });
  wires.forEach((wire) => wire.points.forEach((p) => add(p.x, p.y)));
  [...components.flatMap((component) => component.labels), ...texts].forEach((label) => {
    const width = labelWidth(label.text);
    const left = label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - width : label.x - width / 2;
    add(left - 4, label.y - 18);
    add(left + width + 4, label.y + 10);
  });
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** Structural audit used by tests: grid snapping, Manhattan routing, no overlapping runs. */
export function validateSchematic(document: SchematicDocument): string[] {
  const issues: string[] = [];
  document.wires.forEach((wire) => wire.points.forEach((p, index) => {
    if (!onGrid(p.x) || !onGrid(p.y)) issues.push(`${wire.id}: point (${p.x}, ${p.y}) off grid`);
    if (index > 0 && wire.points[index - 1].x !== p.x && wire.points[index - 1].y !== p.y) issues.push(`${wire.id}: diagonal segment`);
  }));
  const segments = document.wires.flatMap((wire) => segmentsOf(wire.points).map((segment) => ({ wire: wire.id, ...segment })));
  segments.forEach((a, i) => segments.slice(i + 1).forEach((b) => {
    if (a.wire === b.wire) return;
    const horizontal = a.start.y === a.end.y && b.start.y === b.end.y && a.start.y === b.start.y;
    const vertical = a.start.x === a.end.x && b.start.x === b.end.x && a.start.x === b.start.x;
    if (!horizontal && !vertical) return;
    const [lo, hi] = horizontal
      ? [Math.max(Math.min(a.start.x, a.end.x), Math.min(b.start.x, b.end.x)), Math.min(Math.max(a.start.x, a.end.x), Math.max(b.start.x, b.end.x))]
      : [Math.max(Math.min(a.start.y, a.end.y), Math.min(b.start.y, b.end.y)), Math.min(Math.max(a.start.y, a.end.y), Math.max(b.start.y, b.end.y))];
    if (hi > lo) issues.push(`${a.wire} overlaps ${b.wire}`);
  }));
  document.components.forEach((component) => {
    const control = SYMBOLS[component.kind].controlPins;
    Object.keys(component.pins).forEach((name) => {
      if (control.includes(name)) return;
      const ref = `${component.id}.${name}`;
      const net = document.nets.find((candidate) => candidate.pins.includes(ref));
      if (!net || net.pins.length < 2) issues.push(`${ref}: floating pin`);
    });
  });
  document.junctions.forEach((junction) => {
    if (document.wires.some((wire) => (wire.jumps ?? []).some((jump) => samePoint(jump, junction)))) issues.push(`junction on hop at (${junction.x}, ${junction.y})`);
  });
  return issues;
}
