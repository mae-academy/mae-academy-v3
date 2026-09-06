export const GRID = 20;

export type ComponentType = "dc-rail" | "ground" | "resistor" | "potentiometer" | "dmm" | "oscilloscope";
export type WireStyle = "orthogonal" | "curved";
export type PortTerminal = "power" | "ground" | "passive" | "probe-red" | "probe-black" | "ch1" | "ch2" | "scope-ground";

export interface Point { x: number; y: number }
export interface Port { id: string; componentId: string; x: number; y: number; terminal: PortTerminal }
export interface Node extends Point { id: string; portIds: string[]; referenceVoltage?: 0 }
export interface CircuitComponent {
  id: string;
  type: ComponentType;
  name: string;
  value: number;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  reflected: boolean;
  /** Wiper travel in percent. Only applies to potentiometers. */
  wiper?: number;
  referenceVoltage?: 0;
  ports: Port[];
}
export interface Wire { id: string; from: string; to: string; fromPoint?: Point; toPoint?: Point; points: Point[]; style: WireStyle; jumps?: Point[] }
export interface CircuitObstacle { id: string; x1: number; y1: number; x2: number; y2: number }
export interface CircuitDocument { version: 1; components: CircuitComponent[]; wires: Wire[]; nodes?: Node[]; wireStyle: WireStyle }

export const TERMINAL_SNAP_RADIUS = GRID / 2;
export const snap = (value: number, grid = GRID) => Math.round(value / grid) * grid;
export const snapToGrid = (x: number, y: number, grid = GRID): Point => ({ x: snap(x, grid), y: snap(y, grid) });
export const point = (x: number, y: number): Point => snapToGrid(x, y);
const clampUnit = (value: number) => Math.min(100, Math.max(0, value));

export function componentLocalPortOffsets(component: Pick<CircuitComponent, "type" | "wiper">): Point[] {
  if (component.type === "dc-rail" || component.type === "ground") return [{ x: 0, y: 0 }];
  if (component.type === "potentiometer") {
    const wiperX = -36 + (72 * clampUnit(component.wiper ?? 50)) / 100;
    return [{ x: -60, y: 0 }, { x: 60, y: 0 }, { x: wiperX, y: -52 }];
  }
  if (component.type === "oscilloscope") return [{ x: -60, y: 0 }, { x: 0, y: 0 }, { x: 60, y: 0 }];
  return [{ x: -60, y: 0 }, { x: 60, y: 0 }];
}

export function transformLocalPoint(component: Pick<CircuitComponent, "x" | "y" | "rotation" | "reflected">, localPoint: Point): Point {
  const x = localPoint.x * (component.reflected ? -1 : 1);
  if (component.rotation === 90) return { x: component.x - localPoint.y, y: component.y + x };
  if (component.rotation === 180) return { x: component.x - x, y: component.y - localPoint.y };
  if (component.rotation === 270) return { x: component.x + localPoint.y, y: component.y - x };
  return { x: component.x + x, y: component.y + localPoint.y };
}

export function makeComponent(type: ComponentType, x: number, y: number, id = crypto.randomUUID()): CircuitComponent {
  const base = { id, type, x: snap(x), y: snap(y), rotation: 0 as const, reflected: false };
  if (type === "dc-rail") {
    return { ...base, name: "VDC", value: 24, ports: [{ id: `${id}:p`, componentId: id, x: base.x, y: base.y, terminal: "power" }] };
  }
  if (type === "ground") {
    return { ...base, name: "GND", value: 0, referenceVoltage: 0, ports: [{ id: `${id}:p`, componentId: id, x: base.x, y: base.y, terminal: "ground" }] };
  }
  if (type === "dmm") {
    return { ...base, name: "DMM1", value: 0, ports: [
      { id: `${id}:red`, componentId: id, x: base.x - 60, y: base.y, terminal: "probe-red" },
      { id: `${id}:black`, componentId: id, x: base.x + 60, y: base.y, terminal: "probe-black" },
    ] };
  }
  if (type === "oscilloscope") {
    return { ...base, name: "OSC1", value: 0, ports: [
      { id: `${id}:ch1`, componentId: id, x: base.x - 60, y: base.y, terminal: "ch1" },
      { id: `${id}:ch2`, componentId: id, x: base.x, y: base.y, terminal: "ch2" },
      { id: `${id}:gnd`, componentId: id, x: base.x + 60, y: base.y, terminal: "scope-ground" },
    ] };
  }
  const name = type === "resistor" ? "R1" : "RV1";
  const value = type === "resistor" ? 1000 : 5000;
  return {
    ...base,
    name,
    value,
    ...(type === "potentiometer" ? { wiper: 50 } : {}),
    ports: componentLocalPortOffsets({ type, wiper: type === "potentiometer" ? 50 : undefined }).map((offset, index) => ({ id: `${id}:${index === 0 ? "a" : index === 1 ? "b" : "w"}`, componentId: id, x: base.x + offset.x, y: base.y + offset.y, terminal: "passive" })),
  };
}

export function updatePorts(component: CircuitComponent): CircuitComponent {
  const offsets = componentLocalPortOffsets(component);
  return { ...component, ports: component.ports.map((port, index) => ({ ...port, ...transformLocalPoint(component, offsets[index] ?? { x: 0, y: 0 }) })) };
}

export function componentObstacle(component: CircuitComponent, clearance = GRID): CircuitObstacle {
  const isVertical = component.rotation === 90 || component.rotation === 270;
  const isSingleTerminal = component.type === "dc-rail" || component.type === "ground";
  const isInstrument = component.type === "dmm" || component.type === "oscilloscope";
  const halfWidth = isSingleTerminal ? 40 : isInstrument ? isVertical ? 72 : 96 : isVertical ? 44 : 76;
  const halfHeight = isSingleTerminal ? 74 : isInstrument ? isVertical ? 96 : 72 : isVertical ? 76 : 44;
  return { id: component.id, x1: component.x - halfWidth - clearance, y1: component.y - halfHeight - clearance, x2: component.x + halfWidth + clearance, y2: component.y + halfHeight + clearance };
}

const between = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const dedupeRoute = (points: Point[]) => points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
const routeLength = (points: Point[]) => points.slice(1).reduce((total, point, index) => total + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
const segmentIntersectsObstacle = (start: Point, end: Point, obstacle: CircuitObstacle) => {
  if (start.x === end.x) return between(start.x, obstacle.x1, obstacle.x2) && Math.max(Math.min(start.y, end.y), obstacle.y1) < Math.min(Math.max(start.y, end.y), obstacle.y2);
  if (start.y === end.y) return between(start.y, obstacle.y1, obstacle.y2) && Math.max(Math.min(start.x, end.x), obstacle.x1) < Math.min(Math.max(start.x, end.x), obstacle.x2);
  return true;
};
const isClear = (points: Point[], obstacles: CircuitObstacle[]) => points.slice(1).every((end, index) => obstacles.every((obstacle) => !segmentIntersectsObstacle(points[index], end, obstacle)));

export function routeWire(a: Point, b: Point, style: WireStyle, obstacles: CircuitObstacle[] = []): Point[] {
  if (style === "curved") return [a, b];
  const direct = a.x === b.x || a.y === b.y ? [[a, b]] : [];
  const elbowX = [a, { x: b.x, y: a.y }, b];
  const elbowY = [a, { x: a.x, y: b.y }, b];
  const xLanes = Array.from(new Set([snap((a.x + b.x) / 2), ...obstacles.flatMap((obstacle) => [snap(obstacle.x1 - GRID), snap(obstacle.x2 + GRID)])]));
  const yLanes = Array.from(new Set([snap((a.y + b.y) / 2), ...obstacles.flatMap((obstacle) => [snap(obstacle.y1 - GRID), snap(obstacle.y2 + GRID)])]));
  const candidates = [...direct, elbowX, elbowY, ...xLanes.map((x) => [a, { x, y: a.y }, { x, y: b.y }, b]), ...yLanes.map((y) => [a, { x: a.x, y }, { x: b.x, y }, b])].map(dedupeRoute);
  const clear = candidates.filter((candidate) => isClear(candidate, obstacles));
  return (clear.length ? clear : candidates).sort((first, second) => routeLength(first) - routeLength(second))[0];
}

export function findOrthogonalJumps(points: Point[], previousWires: Wire[]): Point[] {
  const jumps: Point[] = [];
  const candidateSegments = points.slice(1).map((end, index) => ({ start: points[index], end }));
  const hasPoint = (value: Point, start: Point, end: Point) => value.x >= Math.min(start.x, end.x) && value.x <= Math.max(start.x, end.x) && value.y >= Math.min(start.y, end.y) && value.y <= Math.max(start.y, end.y);
  candidateSegments.forEach((candidate) => previousWires.forEach((wire) => wire.points.slice(1).forEach((end, index) => {
    const existing = { start: wire.points[index], end };
    const candidateHorizontal = candidate.start.y === candidate.end.y;
    const existingHorizontal = existing.start.y === existing.end.y;
    if (candidateHorizontal === existingHorizontal) return;
    const crossing = candidateHorizontal ? { x: existing.start.x, y: candidate.start.y } : { x: candidate.start.x, y: existing.start.y };
    const isEndpoint = [candidate.start, candidate.end, existing.start, existing.end].some((entry) => entry.x === crossing.x && entry.y === crossing.y);
    if (!isEndpoint && hasPoint(crossing, candidate.start, candidate.end) && hasPoint(crossing, existing.start, existing.end)) jumps.push(crossing);
  })));
  return jumps;
}

export function deriveTerminalNodes(ports: Port[], wires: Wire[] = [], radius = TERMINAL_SNAP_RADIUS): Node[] {
  const parent = new Map<string, string>();
  const portById = new Map(ports.map((port) => [port.id, port]));
  const find = (id: string): string => {
    const direct = parent.get(id) ?? id;
    if (direct === id) { parent.set(id, id); return id; }
    const root = find(direct); parent.set(id, root); return root;
  };
  const join = (a: string, b: string) => { const rootA = find(a); const rootB = find(b); if (rootA !== rootB) parent.set(rootB, rootA); };
  ports.forEach((port) => find(port.id));
  ports.forEach((port, index) => ports.slice(index + 1).forEach((candidate) => {
    if (Math.hypot(candidate.x - port.x, candidate.y - port.y) <= radius) join(port.id, candidate.id);
  }));
  wires.forEach((wire) => {
    const from = portById.has(wire.from) ? wire.from : `junction:${wire.fromPoint?.x ?? "x"}:${wire.fromPoint?.y ?? "y"}`;
    const to = portById.has(wire.to) ? wire.to : `junction:${wire.toPoint?.x ?? "x"}:${wire.toPoint?.y ?? "y"}`;
    join(from, to);
  });
  const groups = new Map<string, string[]>();
  ports.forEach((port) => { const root = find(port.id); groups.set(root, [...(groups.get(root) ?? []), port.id]); });
  const nodes: Node[] = [];
  groups.forEach((portIds) => {
    const cluster: Port[] = portIds.map((id: string) => portById.get(id)!);
    const isGroundReference = cluster.some((port) => port.terminal === "ground");
    if (cluster.length < 2 && !isGroundReference) return;
    const average = cluster.reduce((total: Point, port: Port) => ({ x: total.x + port.x, y: total.y + port.y }), { x: 0, y: 0 });
    const position = snapToGrid(average.x / cluster.length, average.y / cluster.length);
    nodes.push({ id: `node:${position.x}:${position.y}`, x: position.x, y: position.y, portIds: portIds.sort(), ...(isGroundReference ? { referenceVoltage: 0 as const } : {}) });
  });
  return nodes;
}

export function deriveWireJunctions(wires: Wire[]): Point[] {
  const candidates = new Map<string, { point: Point; endpointCount: number; intentionalCount: number }>();
  wires.forEach((wire) => {
    const endpoints = [
      { id: wire.from, point: wire.fromPoint ?? wire.points[0] },
      { id: wire.to, point: wire.toPoint ?? wire.points[wire.points.length - 1] },
    ];
    endpoints.forEach(({ id, point }) => {
      if (!point) return;
      const key = `${point.x}:${point.y}`;
      const current = candidates.get(key) ?? { point, endpointCount: 0, intentionalCount: 0 };
      current.endpointCount += 1;
      if (id.startsWith("junction:")) current.intentionalCount += 1;
      candidates.set(key, current);
    });
  });
  return Array.from(candidates.values()).filter((candidate) => candidate.endpointCount >= 3 || candidate.intentionalCount >= 2).map((candidate) => candidate.point);
}

export const RESISTOR_PATH = "M-60 0H-44L-36 -18L-22 18L-8 -18L6 18L20 -18L34 18L44 0H60";
export const POTENTIOMETER_ARROW_PATH = "M0 -52V-12M-8 -22L0 -12L8 -22";
export const potentiometerArrowPath = (wiper = 50) => { const x = -36 + (72 * clampUnit(wiper)) / 100; return `M${x} -52V-12M${x - 8} -22L${x} -12L${x + 8} -22`; };
export const DC_RAIL_PATH = "M0 0V-60M-30 -60H30";
export const GROUND_PATH = "M0 0V28M-30 28H30M-20 42H20M-10 56H10";
export const DMM_PATH = "M-64 -48H64V48H-64ZM-32 -24H32V4H-32ZM-40 26H40";
export const OSCILLOSCOPE_PATH = "M-70 -46H70V46H-70ZM-52 -26H52V20H-52M-44 0H-28L-18 -13L-4 13L10 -13L24 13L36 0H48";
