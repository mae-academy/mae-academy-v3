import { snapPointToGrid, type Point } from './wiring';

export type TabDTerminalAxis = 'horizontal' | 'vertical';

/**
 * Exact local endpoints of the documented Tab D SVG drawings. Components not
 * listed here already share their catalog terminal coordinates with their
 * symbol endpoints. The canvas scales this local point, then projects it onto
 * the 25 px lattice and draws a visual lead only when the two positions differ.
 */
const DOCUMENTED_TERMINAL_LOCAL_POSITIONS: Readonly<Record<string, Readonly<Record<string, Point>>>> = {
  'dc-rail': { pos: [0, -25] },
  resistor: { a: [-(100 / 3), 0], b: [100 / 3, 0] },
  potentiometer: { a: [-(100 / 3), 0], b: [100 / 3, 0], wiper: [0, -(100 / 3)] },
  'three-phase-source': { l1: [40, -18], l2: [40, 0], l3: [40, 18], n: [-40, 0] },
  'star-resistor-pack': { a: [-(100 / 6), -(100 * Math.sqrt(3) / 6)], b: [-(100 / 6), 100 * Math.sqrt(3) / 6], c: [100 / 3, 0] },
  'delta-resistor-pack': { a: [0, -(100 * Math.sqrt(3) / 9)], b: [-(100 / 6), 100 * Math.sqrt(3) / 18], c: [100 / 6, 100 * Math.sqrt(3) / 18] },
  opamp: { 'in-': [-(100 / 3), -(100 / 6)], 'in+': [-(100 / 3), 100 / 6], out: [100 / 3, 0], vcc: [0, -(100 / 3)], vee: [0, 100 / 3] },
  'relay-spst': { 'coil+': [-30, -25], 'coil-': [30, -25], com: [-30, 35], no: [30, 35] },
  'relay-spdt': { 'coil+': [-30, -25], 'coil-': [30, -25], com: [-30, 20], no: [30, 10], nc: [30, 30] },
  'relay-dpst': { 'coil+': [-30, -40], 'coil-': [30, -40], c1: [-30, 10], no1: [30, 10], c2: [-30, 35], no2: [30, 35] },
  'relay-dpdt': { 'coil+': [-30, -45], 'coil-': [30, -45], c1: [-35, 5], no1: [35, -5], nc1: [35, 15], c2: [-35, 35], no2: [35, 25], nc2: [35, 45] },
  contactor: { 'coil+': [-40, -50], 'coil-': [40, -50], l1: [-40, 0], t1: [40, 0], l2: [-40, 20], t2: [40, 20], l3: [-40, 40], t3: [40, 40], 'aux-no-a': [-40, 50], 'aux-no-b': [40, 50], 'aux-nc-a': [-40, 65], 'aux-nc-b': [40, 65] },
};

/** Returns the visual symbol endpoint that corresponds to one catalog terminal. */
export function documentedTabDTerminalLocalPosition(componentType: string, terminalId: string, catalogPosition: Point): Point {
  const documented = DOCUMENTED_TERMINAL_LOCAL_POSITIONS[componentType]?.[terminalId];
  return documented ? [documented[0], documented[1]] : [catalogPosition[0], catalogPosition[1]];
}

/** A deliberately gentle, pixel-normalized wheel response for the documented CAD workspace. */
export function tabDGentleWheelZoomFactor(deltaY: number): number {
  const normalizedDelta = Math.max(-80, Math.min(80, deltaY));
  return Math.exp(-normalizedDelta * 0.00045);
}

/** Projects a visual terminal onto the same lattice used by Tab D components and wires. */
export function alignTabDTerminalToGrid(point: Point, gridSize: number): Point {
  return snapPointToGrid(point, gridSize);
}

/** Lock a draft corner onto the current horizontal or vertical leg, never onto a diagonal point. */
export function lockTabDWireCorner(anchor: Point, pointer: Point): Point {
  return Math.abs(pointer[0] - anchor[0]) >= Math.abs(pointer[1] - anchor[1])
    ? [pointer[0], anchor[1]]
    : [anchor[0], pointer[1]];
}

/** Render only the final provisional turn; every previously clicked corner remains immutable. */
export function tabDOrthogonalDraftPath(from: Point, to: Point, lockedCorners: Point[] = []): Point[] {
  const anchor = lockedCorners.at(-1) ?? from;
  if (anchor[0] === to[0] || anchor[1] === to[1]) return [...lockedCorners.length ? [from, ...lockedCorners] : [from], to];
  const corner = lockTabDWireCorner(anchor, to);
  return [...lockedCorners.length ? [from, ...lockedCorners] : [from], corner, to];
}

/** Selects a clean terminal-aware route, avoiding an initial leg that doubles back into the receiving component. */
export function tabDTerminalOrthogonalPath(
  from: Point,
  to: Point,
  fromAxis: TabDTerminalAxis,
  toAxis: TabDTerminalAxis,
  gridSize: number,
  lockedCorners: Point[] = [],
): Point[] {
  if (lockedCorners.length) return tabDOrthogonalDraftPath(from, to, lockedCorners);
  if (from[0] === to[0] || from[1] === to[1]) return [from, to];
  if (fromAxis === 'vertical' && toAxis === 'horizontal') return [from, [from[0], to[1]], to];
  if (fromAxis === 'horizontal' && toAxis === 'vertical') return [from, [to[0], from[1]], to];
  if (fromAxis === 'horizontal') {
    const laneX = snapPointToGrid([(from[0] + to[0]) / 2, 0], gridSize)[0];
    return [from, [laneX, from[1]], [laneX, to[1]], to];
  }
  const laneY = snapPointToGrid([0, (from[1] + to[1]) / 2], gridSize)[1];
  return [from, [from[0], laneY], [to[0], laneY], to];
}

/** Moves the shared lane of a four-point dogleg; all legs remain 90° and every handle stays on-grid. */
export function moveTabDOrthogonalLane(path: Point[], cornerIndex: number, requested: Point, gridSize: number): Point[] {
  if (path.length !== 4 || cornerIndex < 1 || cornerIndex > 2) return path;
  const [from, first, second, to] = path;
  const snapped = snapPointToGrid(requested, gridSize);
  const horizontalVerticalHorizontal = from[1] === first[1] && first[0] === second[0] && second[1] === to[1];
  if (horizontalVerticalHorizontal) {
    const laneX = snapped[0];
    return [from, [laneX, from[1]], [laneX, to[1]], to];
  }
  const verticalHorizontalVertical = from[0] === first[0] && first[1] === second[1] && second[0] === to[0];
  if (verticalHorizontalVertical) {
    const laneY = snapped[1];
    return [from, [from[0], laneY], [to[0], laneY], to];
  }
  return path;
}
