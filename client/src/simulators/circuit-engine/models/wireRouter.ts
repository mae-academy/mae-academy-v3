/**
 * Orthogonal A* Wire Router
 *
 * Builds a virtual cost grid from placed component bounding boxes and runs
 * an A* search with a turn-direction penalty to produce clean L- or U-shaped
 * orthogonal paths that avoid component bodies.
 *
 * Design constraints (Phase 1):
 *  - Movement: strictly Up / Down / Left / Right  (no diagonals).
 *  - Heuristic: Manhattan distance.
 *  - Turn penalty: changing direction adds +1 extra cost per turn, forcing
 *    the router to prefer long straight runs over zig-zag staircases.
 *  - Terminal pins are never blocked — even when they sit inside a component's
 *    expanded bounding box.
 *  - Fallback: if A* finds no path (fully enclosed endpoints), the function
 *    returns a simple one-elbow L-shape so the wire always renders.
 */

import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';
import { getTerminalWorldPos, simplifyOrthogonalPath, type Point } from '@/simulators/circuit-engine/models/wiring';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box of a placed component (in canvas / world coords). */
export interface ComponentBBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  terminalPins: Point[];   // world-space terminal positions — never blocked
}

// ---------------------------------------------------------------------------
// Step 1 – Build component bounding boxes with terminal pins
// ---------------------------------------------------------------------------

/**
 * Compute the obstacle bounding box and exact terminal world positions for
 * every placed component.
 *
 * @param components  All placed CircuitComponents in the canvas document.
 * @param gridSize    The canvas snap grid (e.g. 25 px for Tab-D workspace).
 * @param excludeIds  Component IDs to skip (typically the two endpoints of the
 *                    wire being drawn so we can enter / exit them freely).
 */
export function buildComponentBBoxes(
  components: CircuitComponent[],
  gridSize: number,
  excludeIds: Set<string> = new Set(),
): ComponentBBox[] {
  const result: ComponentBBox[] = [];

  for (const comp of components) {
    if (excludeIds.has(comp.id)) continue;

    const def = getDef(comp.type);
    if (!def) continue;

    // Visual half-extents (unscaled — canvas uses world coords directly)
    const hw = def.width / 2;
    const hh = def.height / 2;

    // Expand by exactly one grid cell on every side so wires travel
    // outside the visual body rather than clipping through it.
    const pad = gridSize;
    const xMin = comp.x - hw - pad;
    const xMax = comp.x + hw + pad;
    const yMin = comp.y - hh - pad;
    const yMax = comp.y + hh + pad;

    // Collect world-space positions of every terminal so we can
    // whitelist them as pass-through cells even when they are inside the box.
    const terminalPins: Point[] = (def.terminals ?? []).map(t =>
      getTerminalWorldPos(comp.x, comp.y, t.x, t.y, comp.rotation, comp.flipH, comp.flipV),
    );

    result.push({ xMin, xMax, yMin, yMax, terminalPins });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2 – Grid cost matrix
// ---------------------------------------------------------------------------

/**
 * Represents the navigable grid used by A*.
 * `costs[row][col]` is the base traversal cost for that cell:
 *   - 1  → free
 *   - Infinity → obstacle (inside an expanded component bounding box)
 */
export interface RoutingGrid {
  costs: number[][];
  /** World X coordinate of column 0. */
  originX: number;
  /** World Y coordinate of row 0. */
  originY: number;
  /** Number of grid rows. */
  rows: number;
  /** Number of grid columns. */
  cols: number;
  /** Side length of each cell in world units. */
  gridSize: number;
}

/**
 * Build the routing cost grid bounded to the region the wire needs to
 * navigate.  The grid extends from startPt / endPt outward by `margin`
 * grid cells so the router has room to detour around components.
 */
export function buildRoutingGrid(
  startPt: Point,
  endPt: Point,
  bboxes: ComponentBBox[],
  gridSize: number,
  margin = 8,
): RoutingGrid {
  const margin_world = margin * gridSize;

  const rawXMin = Math.min(startPt[0], endPt[0]) - margin_world;
  const rawXMax = Math.max(startPt[0], endPt[0]) + margin_world;
  const rawYMin = Math.min(startPt[1], endPt[1]) - margin_world;
  const rawYMax = Math.max(startPt[1], endPt[1]) + margin_world;

  // Snap origin to grid so terminal positions map exactly onto cells.
  const originX = Math.floor(rawXMin / gridSize) * gridSize;
  const originY = Math.floor(rawYMin / gridSize) * gridSize;

  const cols = Math.ceil((rawXMax - originX) / gridSize) + 1;
  const rows = Math.ceil((rawYMax - originY) / gridSize) + 1;

  // Initialise every cell as free (cost 1).
  const costs: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(1));

  // Helper: world → grid index (clamped).
  const toCol = (wx: number) => Math.round((wx - originX) / gridSize);
  const toRow = (wy: number) => Math.round((wy - originY) / gridSize);

  // Mark obstacle cells.
  for (const bbox of bboxes) {
    // Build set of whitelisted (terminal-pin) cells.
    const pinCells = new Set<string>();
    for (const pin of bbox.terminalPins) {
      pinCells.add(`${toCol(pin[0])},${toRow(pin[1])}`);
    }

    const c0 = Math.max(0, toCol(bbox.xMin));
    const c1 = Math.min(cols - 1, toCol(bbox.xMax));
    const r0 = Math.max(0, toRow(bbox.yMin));
    const r1 = Math.min(rows - 1, toRow(bbox.yMax));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!pinCells.has(`${c},${r}`)) {
          costs[r][c] = Infinity;
        }
      }
    }
  }

  return { costs, originX, originY, rows, cols, gridSize };
}

// ---------------------------------------------------------------------------
// Step 3 – A* with turn penalty
// ---------------------------------------------------------------------------

type Dir = 0 | 1 | 2 | 3; // 0=right 1=down 2=left 3=up

const DX: number[] = [1, 0, -1, 0];
const DY: number[] = [0, 1, 0, -1];

interface AStarNode {
  col: number;
  row: number;
  dir: Dir | -1;   // -1 = start (no direction yet)
  g: number;       // cost from start
  h: number;       // heuristic to end
  f: number;       // g + h
  parent: AStarNode | null;
}

const TURN_PENALTY = 25;   // heavily penalize direction changes to enforce minimal-bend straight runs

/** Manhattan distance heuristic (admissible — never overestimates). */
function heuristic(ac: number, ar: number, bc: number, br: number): number {
  return Math.abs(ac - bc) + Math.abs(ar - br);
}

/**
 * Run orthogonal A* on a RoutingGrid.
 * Returns the path as an array of world-space Points, or `null` if blocked.
 */
function aStarSearch(
  grid: RoutingGrid,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  fromAxis?: 'horizontal' | 'vertical',
  toAxis?: 'horizontal' | 'vertical',
): Point[] | null {
  const { costs, rows, cols, gridSize, originX, originY } = grid;

  const gBest = new Map<string, number>();
  const key = (c: number, r: number, d: number) => `${c},${r},${d}`;

  const open: AStarNode[] = [];

  const startH = heuristic(startCol, startRow, endCol, endRow);
  const startNode: AStarNode = {
    col: startCol, row: startRow, dir: -1,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
  };
  open.push(startNode);
  gBest.set(key(startCol, startRow, -1), 0);

  while (open.length > 0) {
    // Pop node with lowest f, tie-breaking on smaller h to prefer straight lines toward the goal.
    open.sort((a, b) => (a.f !== b.f ? a.f - b.f : a.h - b.h));
    const current = open.shift()!;

    if (current.col === endCol && current.row === endRow) {
      // Reconstruct path.
      const pts: Point[] = [];
      let n: AStarNode | null = current;
      while (n) {
        pts.push([originX + n.col * gridSize, originY + n.row * gridSize]);
        n = n.parent;
      }
      pts.reverse();
      return pts;
    }

    for (let d = 0; d < 4; d++) {
      const nc = current.col + DX[d];
      const nr = current.row + DY[d];

      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (costs[nr][nc] === Infinity) continue;

      let extraCost = 0;
      if (current.dir !== -1) {
        if (current.dir !== d) {
          extraCost += TURN_PENALTY;
        }
      } else if (fromAxis) {
        // Leaving initial terminal against its preferred axis incurs turn penalty
        if (fromAxis === 'horizontal' && (d === 1 || d === 3)) extraCost += TURN_PENALTY;
        if (fromAxis === 'vertical' && (d === 0 || d === 2)) extraCost += TURN_PENALTY;
      }

      // Entering target terminal against its preferred axis incurs turn penalty
      if (nc === endCol && nr === endRow && toAxis) {
        if (toAxis === 'horizontal' && (d === 1 || d === 3)) extraCost += TURN_PENALTY;
        if (toAxis === 'vertical' && (d === 0 || d === 2)) extraCost += TURN_PENALTY;
      }

      const moveCost = costs[nr][nc] + extraCost;
      const ng = current.g + moveCost;
      const nk = key(nc, nr, d);

      if ((gBest.get(nk) ?? Infinity) <= ng) continue;

      const nh = heuristic(nc, nr, endCol, endRow);
      gBest.set(nk, ng);
      open.push({
        col: nc, row: nr, dir: d as Dir,
        g: ng,
        h: nh,
        f: ng + nh,
        parent: current,
      });
    }
  }

  return null; // no path
}

// ---------------------------------------------------------------------------
// Step 4 – Public entry point
// ---------------------------------------------------------------------------

/**
 * Calculate an obstacle-avoiding strictly orthogonal path between two world-
 * space points.
 *
 * @param startPt    Wire start position (world coords, should be on-grid).
 * @param endPt      Wire end position (world coords, should be on-grid).
 * @param components All placed CircuitComponents in the document.
 * @param gridSize   Canvas snap grid size in pixels (e.g. 25).
 * @param excludeIds IDs of components to ignore as obstacles (typically the
 *                   dragged and connected components, so their terminal areas
 *                   remain freely accessible).
 * @param fromAxis   Optional terminal exit axis preference ('horizontal' | 'vertical').
 * @param toAxis     Optional terminal entry axis preference ('horizontal' | 'vertical').
 * @returns          A simplified array of corner Points forming the routed
 *                   path, or a single-elbow L-shape fallback.
 */
export function calculateOrthogonalPath(
  startPt: Point,
  endPt: Point,
  components: CircuitComponent[],
  gridSize: number,
  excludeIds: Set<string> = new Set(),
  fromAxis?: 'horizontal' | 'vertical',
  toAxis?: 'horizontal' | 'vertical',
): Point[] {
  const bboxes = buildComponentBBoxes(components, gridSize, excludeIds);

  // Trivially aligned — check if there are any obstacles blocking the straight segment
  if (Math.abs(startPt[0] - endPt[0]) < 1e-4 || Math.abs(startPt[1] - endPt[1]) < 1e-4) {
    const isBlocked = bboxes.some(b => {
      if (Math.abs(startPt[0] - endPt[0]) < 1e-4) {
        // Vertical line at x = startPt[0]
        const minY = Math.min(startPt[1], endPt[1]);
        const maxY = Math.max(startPt[1], endPt[1]);
        return startPt[0] >= b.xMin && startPt[0] <= b.xMax && maxY >= b.yMin && minY <= b.yMax;
      } else {
        // Horizontal line at y = startPt[1]
        const minX = Math.min(startPt[0], endPt[0]);
        const maxX = Math.max(startPt[0], endPt[0]);
        return startPt[1] >= b.yMin && startPt[1] <= b.yMax && maxX >= b.xMin && minX <= b.xMax;
      }
    });
    if (!isBlocked) {
      return [startPt, endPt];
    }
  }

  // Quick check: if there are no obstacles at all, use a clean single-elbow L-shape
  if (bboxes.length === 0) {
    const preferH = fromAxis === 'horizontal' ? true : fromAxis === 'vertical' ? false : (Math.abs(endPt[0] - startPt[0]) >= Math.abs(endPt[1] - startPt[1]));
    const corner: Point = preferH ? [endPt[0], startPt[1]] : [startPt[0], endPt[1]];
    return simplifyOrthogonalPath([startPt, corner, endPt]);
  }

  const grid = buildRoutingGrid(startPt, endPt, bboxes, gridSize);

  const startCol = Math.round((startPt[0] - grid.originX) / gridSize);
  const startRow = Math.round((startPt[1] - grid.originY) / gridSize);
  const endCol   = Math.round((endPt[0]   - grid.originX) / gridSize);
  const endRow   = Math.round((endPt[1]   - grid.originY) / gridSize);

  const raw = aStarSearch(grid, startCol, startRow, endCol, endRow, fromAxis, toAxis);

  if (raw && raw.length >= 2) {
    raw[0] = startPt;
    raw[raw.length - 1] = endPt;
    return simplifyOrthogonalPath(raw);
  }

  // Fallback: simple single-elbow L-shape respecting axis preferences
  const preferH = fromAxis === 'horizontal' ? true : fromAxis === 'vertical' ? false : (Math.abs(endPt[0] - startPt[0]) >= Math.abs(endPt[1] - startPt[1]));
  const corner: Point = preferH ? [endPt[0], startPt[1]] : [startPt[0], endPt[1]];
  return simplifyOrthogonalPath([startPt, corner, endPt]);
}
