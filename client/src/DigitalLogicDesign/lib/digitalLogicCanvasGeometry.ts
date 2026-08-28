import type { Point } from './wiring';
import { snapPointToGrid } from './wiring';

export type TabDTerminalAxis = 'horizontal' | 'vertical';

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
