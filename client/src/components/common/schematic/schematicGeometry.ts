/* Canonical wire-pipeline geometry for every schematic studio. The pure helpers are
   re-exported from the reference implementation so both studios route, snap, split
   and render wires with byte-identical math. */
import {
  addWireCorner,
  getDotsOnPath,
  insertPointIntoWirePath,
  isNearTerminal,
  moveWireCorner,
  pathLength,
  pointsToPath,
  projectPointOntoWire,
  reconnectPathEndpoints,
  routePath,
  routeTJunctionPath,
  simplifyOrthogonalPath,
  snapPointToGrid,
  snapToGrid,
} from '@/simulators/circuit-engine/models/wiring';
import {
  buildJumpArcPath,
  calculateWireIntersections,
  getWirePoints,
  junctionDotPositions,
} from '@/simulators/circuit-engine/models/wireIntersections';
import type {
  SchematicBounds,
  SchematicComponent,
  SchematicComponentLibrary,
  SchematicPoint,
  SchematicWire,
  TerminalAxis,
  WireEndpoints,
} from '@/components/common/schematic/schematicTypes';

export {
  addWireCorner,
  buildJumpArcPath,
  calculateWireIntersections,
  getDotsOnPath,
  getWirePoints,
  insertPointIntoWirePath,
  isNearTerminal,
  junctionDotPositions,
  moveWireCorner,
  pathLength,
  pointsToPath,
  projectPointOntoWire,
  reconnectPathEndpoints,
  routePath,
  routeTJunctionPath,
  simplifyOrthogonalPath,
  snapPointToGrid,
  snapToGrid,
};

export const JUNCTION_PREFIX = 'junc_';

export function isJunctionId(id: string): boolean {
  return id.startsWith(JUNCTION_PREFIX) || id.startsWith('junction') || id === 'junc';
}

/** Terminal exit axis from its offset relative to the owning component's origin. */
export function terminalAxis(position: SchematicPoint, origin: SchematicPoint): TerminalAxis {
  return Math.abs(position[0] - origin[0]) >= Math.abs(position[1] - origin[1]) ? 'horizontal' : 'vertical';
}

/** Axis-locks the next manual corner to the dominant pointer direction. */
export function lockWireCorner(anchor: SchematicPoint, pointer: SchematicPoint): SchematicPoint {
  return Math.abs(pointer[0] - anchor[0]) >= Math.abs(pointer[1] - anchor[1])
    ? [pointer[0], anchor[1]]
    : [anchor[0], pointer[1]];
}

/** Manual draft path honouring user-locked corners; the final leg follows the cursor. */
export function orthogonalDraftPath(from: SchematicPoint, to: SchematicPoint, lockedCorners: SchematicPoint[] = [], fromAxis?: TerminalAxis): SchematicPoint[] {
  const head: SchematicPoint[] = lockedCorners.length ? [from, ...lockedCorners] : [from];
  const anchor = lockedCorners.at(-1) ?? from;
  if (anchor[0] === to[0] || anchor[1] === to[1]) return [...head, to];
  const corner: SchematicPoint = lockedCorners.length === 0 && fromAxis
    ? (fromAxis === 'horizontal' ? [to[0], anchor[1]] : [anchor[0], to[1]])
    : lockWireCorner(anchor, to);
  return [...head, corner, to];
}

/** Drags one interior wire corner by sliding the lane it belongs to (keeps 90° geometry). */
export function moveOrthogonalLane(path: SchematicPoint[], cornerIndex: number, requested: SchematicPoint, gridSize: number): SchematicPoint[] {
  if (cornerIndex < 1 || cornerIndex >= path.length - 1) return path;
  const snapped = snapPointToGrid(requested, gridSize);

  if (path.length === 3 && cornerIndex === 1) {
    const [from, corner, to] = path;
    const dx = Math.abs(snapped[0] - corner[0]);
    const dy = Math.abs(snapped[1] - corner[1]);
    if (from[1] === corner[1] && corner[0] === to[0]) {
      return dx >= dy
        ? [from, [snapped[0], from[1]], [snapped[0], to[1]], to]
        : [from, [from[0], snapped[1]], [to[0], snapped[1]], to];
    }
    if (from[0] === corner[0] && corner[1] === to[1]) {
      return dy >= dx
        ? [from, [from[0], snapped[1]], [to[0], snapped[1]], to]
        : [from, [snapped[0], from[1]], [snapped[0], to[1]], to];
    }
    return [from, snapped, to];
  }

  if (path.length === 4) {
    const [from, first, second, to] = path;
    if (from[1] === first[1] && first[0] === second[0] && second[1] === to[1]) {
      return [from, [snapped[0], from[1]], [snapped[0], to[1]], to];
    }
    if (from[0] === first[0] && first[1] === second[1] && second[0] === to[0]) {
      return [from, [from[0], snapped[1]], [to[0], snapped[1]], to];
    }
  }

  return path;
}

/** Rotation/flip-aware point-in-box test in a component's local frame. */
export function pointInComponentBox(
  component: SchematicComponent,
  point: SchematicPoint,
  halfWidth: number,
  halfHeight: number,
  offsetY = 0,
  margin = 10,
  /** Centre of the box along the symbol's own x axis, for parts whose origin is not their middle. */
  offsetX = 0,
): boolean {
  const dx = point[0] - component.x;
  const dy = point[1] - component.y;
  const radians = (-component.rotation * Math.PI) / 180;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
  const x = component.flipH ? -localX : localX;
  const y = component.flipV ? -localY : localY;
  return Math.abs(x - offsetX) <= halfWidth + margin && Math.abs(y - offsetY) <= halfHeight + margin;
}

export function findTerminalPosition<C extends SchematicComponent>(
  library: SchematicComponentLibrary<C>,
  component: C,
  terminalId: string,
): SchematicPoint | null {
  return library.getTerminals(component).find(terminal => terminal.id === terminalId)?.position ?? null;
}

function junctionEndAxis(path: SchematicPoint[], atStart: boolean): TerminalAxis {
  if (path.length < 2) return 'horizontal';
  const [a, b] = atStart ? [path[0], path[1]] : [path[path.length - 1], path[path.length - 2]];
  return Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'horizontal' : 'vertical';
}

/** Live world endpoints of a wire resolved against the current component positions. */
export function resolveWireEndpoints<C extends SchematicComponent>(
  library: SchematicComponentLibrary<C>,
  wire: SchematicWire,
  components: C[],
): WireEndpoints | null {
  let from: SchematicPoint | null;
  let fromAxis: TerminalAxis = 'horizontal';
  if (isJunctionId(wire.fromComp)) {
    from = wire.path[0] ?? wire.junctionPoint ?? null;
    fromAxis = junctionEndAxis(wire.path, true);
  } else {
    const component = components.find(item => item.id === wire.fromComp);
    if (!component) return null;
    from = findTerminalPosition(library, component, wire.fromTerm);
    if (from) fromAxis = terminalAxis(from, [component.x, component.y]);
  }

  if (wire.junctionPoint) {
    return from ? { from, to: wire.junctionPoint, fromAxis, toAxis: fromAxis } : null;
  }

  let to: SchematicPoint | null;
  let toAxis: TerminalAxis = 'horizontal';
  if (isJunctionId(wire.toComp)) {
    to = wire.path[wire.path.length - 1] ?? null;
    toAxis = junctionEndAxis(wire.path, false);
  } else {
    const component = components.find(item => item.id === wire.toComp);
    if (!component) return null;
    to = findTerminalPosition(library, component, wire.toTerm);
    if (to) toAxis = terminalAxis(to, [component.x, component.y]);
  }

  return from && to ? { from, to, fromAxis, toAxis } : null;
}

function endpointsMatch(path: SchematicPoint[], endpoints: WireEndpoints, tolerance: number): boolean {
  if (path.length < 2) return false;
  const first = path[0];
  const last = path[path.length - 1];
  return Math.abs(first[0] - endpoints.from[0]) < tolerance
    && Math.abs(first[1] - endpoints.from[1]) < tolerance
    && Math.abs(last[0] - endpoints.to[0]) < tolerance
    && Math.abs(last[1] - endpoints.to[1]) < tolerance;
}

/**
 * Re-attaches wires to moved pins. Wires touching a moved component are re-routed
 * through the library router (manual wires keep their interior corners); every other
 * wire only has its endpoints reconnected when they drifted.
 */
export function refreshWireEndpoints<C extends SchematicComponent>(
  library: SchematicComponentLibrary<C>,
  wires: SchematicWire[],
  components: C[],
  gridSize: number,
  movedIds?: ReadonlySet<string>,
): SchematicWire[] {
  return wires.map(wire => {
    const endpoints = resolveWireEndpoints(library, wire, components);
    if (!endpoints) return wire;
    const touchesMoved = Boolean(movedIds && (movedIds.has(wire.fromComp) || movedIds.has(wire.toComp)));
    if (touchesMoved) {
      if (wire.routing === 'straight') {
        return { ...wire, path: [endpoints.from, endpoints.to], waypoints: undefined };
      }
      if (wire.routing === 'manual') {
        const path = reconnectPathEndpoints(wire.path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, gridSize, endpoints.fromAxis);
        return { ...wire, path, waypoints: path.length > 2 ? path.slice(1, -1) : wire.waypoints };
      }
      const exclude = new Set<string>([wire.fromComp, wire.toComp]);
      movedIds?.forEach(id => exclude.add(id));
      const path = library.route(endpoints.from, endpoints.to, components, exclude, endpoints.fromAxis, endpoints.toAxis);
      return { ...wire, routing: 'orthogonal' as const, path, waypoints: undefined };
    }
    if (endpointsMatch(wire.path, endpoints, 1e-3)) return wire;
    return { ...wire, path: reconnectPathEndpoints(wire.path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, gridSize, endpoints.fromAxis) };
  });
}

/** Render-time path: reconnects stale stored endpoints without mutating the document. */
export function resolveRenderPath<C extends SchematicComponent>(
  library: SchematicComponentLibrary<C>,
  wire: SchematicWire,
  components: C[],
  gridSize: number,
): SchematicPoint[] {
  const path = getWirePoints(wire);
  const endpoints = resolveWireEndpoints(library, wire, components);
  if (!endpoints || path.length < 2 || endpointsMatch(path, endpoints, 0.5)) return path;
  return reconnectPathEndpoints(path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, gridSize, endpoints.fromAxis);
}

/**
 * Terminal-level net resolver (union-find over wire endpoints, junctions included).
 * Returns a stable net key per wire so jump-arcs appear only across distinct nets.
 */
export function createWireNetResolver(wires: SchematicWire[]): (wire: SchematicWire) => string {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(key, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const key = (component: string, terminal: string) => (isJunctionId(component) ? component : `${component}:${terminal}`);
  for (const wire of wires) {
    const a = key(wire.fromComp, wire.fromTerm);
    const b = key(wire.toComp, wire.toTerm);
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    union(a, b);
  }
  return wire => find(key(wire.fromComp, wire.fromTerm));
}

/** Default fit bounds: component origins and text anchors padded by one component footprint. */
export function defaultContentBounds(components: SchematicComponent[], texts: { x: number; y: number }[]): SchematicBounds | null {
  const points = [...components.map(c => [c.x, c.y] as SchematicPoint), ...texts.map(t => [t.x, t.y] as SchematicPoint)];
  if (points.length === 0) return null;
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.min(...xs) - 60;
  const maxX = Math.max(...xs) + 60;
  const minY = Math.min(...ys) - 60;
  const maxY = Math.max(...ys) + 60;
  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}

/** Full obstacle-aware routing for freshly generated wires (only each wire's own endpoints are passable). */
export function routeWires<C extends SchematicComponent>(
  library: SchematicComponentLibrary<C>,
  wires: SchematicWire[],
  components: C[],
): SchematicWire[] {
  return wires.map(wire => {
    const endpoints = resolveWireEndpoints(library, wire, components);
    if (!endpoints) return wire;
    const path = library.route(endpoints.from, endpoints.to, components, new Set([wire.fromComp, wire.toComp]), endpoints.fromAxis, endpoints.toAxis);
    return { ...wire, routing: 'orthogonal' as const, path, waypoints: undefined };
  });
}
