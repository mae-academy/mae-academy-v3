import type { Point } from '@shared/logic/wiring';
import { snapPointToGrid } from '@shared/logic/wiring';
import { tabDGentleWheelZoomFactor } from '@/simulators/shared/workspace/workspaceCanvasMechanics';

export type TabDTerminalAxis = 'horizontal' | 'vertical';

export { tabDGentleWheelZoomFactor };

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
export function tabDOrthogonalDraftPath(from: Point, to: Point, lockedCorners: Point[] = [], fromAxis?: TabDTerminalAxis): Point[] {
  const anchor = lockedCorners.at(-1) ?? from;
  if (anchor[0] === to[0] || anchor[1] === to[1]) return [...lockedCorners.length ? [from, ...lockedCorners] : [from], to];

  let corner: Point;
  if (lockedCorners.length === 0 && fromAxis) {
    corner = fromAxis === 'horizontal' ? [to[0], anchor[1]] : [anchor[0], to[1]];
  } else {
    corner = lockTabDWireCorner(anchor, to);
  }

  return [...lockedCorners.length ? [from, ...lockedCorners] : [from], corner, to];
}

export function dynamicRubberBandPath(
  from: Point,
  to: Point,
  fromAxis?: TabDTerminalAxis,
  toAxis?: TabDTerminalAxis,
  movingEnd: 'from' | 'to' | 'none' = 'none'
): Point[] {
  const [x1, y1] = from;
  const [x2, y2] = to;

  if (x1 === x2 || y1 === y2) {
    return [[x1, y1], [x2, y2]];
  }

  let preferHorizontal: boolean;

  if (movingEnd === 'to') {
    if (fromAxis === 'horizontal') {
      preferHorizontal = true;
    } else if (fromAxis === 'vertical') {
      preferHorizontal = false;
    } else if (toAxis === 'vertical') {
      preferHorizontal = true;
    } else if (toAxis === 'horizontal') {
      preferHorizontal = false;
    } else {
      preferHorizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    }
  } else if (movingEnd === 'from') {
    if (toAxis === 'horizontal') {
      preferHorizontal = false;
    } else if (toAxis === 'vertical') {
      preferHorizontal = true;
    } else if (fromAxis === 'horizontal') {
      preferHorizontal = true;
    } else if (fromAxis === 'vertical') {
      preferHorizontal = false;
    } else {
      preferHorizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    }
  } else {
    if (fromAxis === 'horizontal') {
      preferHorizontal = true;
    } else if (fromAxis === 'vertical') {
      preferHorizontal = false;
    } else if (toAxis === 'vertical') {
      preferHorizontal = true;
    } else if (toAxis === 'horizontal') {
      preferHorizontal = false;
    } else {
      preferHorizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    }
  }

  const corner: Point = preferHorizontal ? [x2, y1] : [x1, y2];
  return [[x1, y1], corner, [x2, y2]];
}

/** Selects a clean terminal-aware route, avoiding an initial leg that doubles back into the receiving component. */
export function tabDTerminalOrthogonalPath(
  from: Point,
  to: Point,
  fromAxis?: TabDTerminalAxis,
  toAxis?: TabDTerminalAxis,
  gridSize = 25,
  lockedCorners: Point[] = [],
): Point[] {
  if (lockedCorners.length) return tabDOrthogonalDraftPath(from, to, lockedCorners, fromAxis);
  if (from[0] === to[0] || from[1] === to[1]) return [from, to];
  if (fromAxis === 'vertical' && toAxis === 'horizontal') return [from, [from[0], to[1]], to];
  if (fromAxis === 'horizontal' && toAxis === 'vertical') return [from, [to[0], from[1]], to];
  if (fromAxis === 'horizontal' && toAxis === 'horizontal') {
    const laneX = snapPointToGrid([(from[0] + to[0]) / 2, 0], gridSize)[0];
    return [from, [laneX, from[1]], [laneX, to[1]], to];
  }
  if (fromAxis === 'vertical' && toAxis === 'vertical') {
    const laneY = snapPointToGrid([0, (from[1] + to[1]) / 2], gridSize)[1];
    return [from, [from[0], laneY], [to[0], laneY], to];
  }

  const preferHorizontal = fromAxis === 'horizontal' || (fromAxis !== 'vertical' && Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]));
  const corner: Point = preferHorizontal ? [to[0], from[1]] : [from[0], to[1]];
  return [from, corner, to];
}

/** Moves the shared lane or corner of an orthogonal wire; all legs remain 90° and every handle stays on-grid. */
export function moveTabDOrthogonalLane(path: Point[], cornerIndex: number, requested: Point, gridSize: number): Point[] {
  if (cornerIndex < 1 || cornerIndex >= path.length - 1) return path;
  const snapped = snapPointToGrid(requested, gridSize);

  if (path.length === 3 && cornerIndex === 1) {
    const [from, corner, to] = path;
    if (from[1] === corner[1] && corner[0] === to[0]) {
      const dx = Math.abs(snapped[0] - corner[0]);
      const dy = Math.abs(snapped[1] - corner[1]);
      return dx >= dy
        ? [from, [snapped[0], from[1]], [snapped[0], to[1]], to]
        : [from, [from[0], snapped[1]], [to[0], snapped[1]], to];
    }
    if (from[0] === corner[0] && corner[1] === to[1]) {
      const dx = Math.abs(snapped[0] - corner[0]);
      const dy = Math.abs(snapped[1] - corner[1]);
      return dy >= dx
        ? [from, [from[0], snapped[1]], [to[0], snapped[1]], to]
        : [from, [snapped[0], from[1]], [snapped[0], to[1]], to];
    }
    return [from, snapped, to];
  }

  if (path.length === 4) {
    const [from, first, second, to] = path;
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
  }

  return path;
}
