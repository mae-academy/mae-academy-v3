/**
 * Digital Logic Orthogonal A* Wire Router
 *
 * Builds a virtual cost grid from placed component bounding boxes and runs
 * an A* search with a turn-direction penalty to produce clean L- or U-shaped
 * orthogonal paths that avoid component bodies.
 *
 * Parity with Analog wireRouter with dynamic digital logic terminal support.
 */

import type { CircuitComponent } from '@/simulators/digital-logic/models/circuitTypes';
import { getDef } from '@/simulators/digital-logic/models/componentDefs';
import { getTerminalWorldPos, simplifyOrthogonalPath, type Point } from '@/simulators/digital-logic/models/wiring';
import { getLogicComponentTerminals } from '@/simulators/digital-logic/models/logicGateContract';

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
 * every placed digital logic component.
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

    // Visual half-extents
    const hw = def.width / 2;
    const hh = def.height / 2;

    // Expand by one grid cell so wires route around the component body
    const pad = gridSize;
    const xMin = comp.x - hw - pad;
    const xMax = comp.x + hw + pad;
    const yMin = comp.y - hh - pad;
    const yMax = comp.y + hh + pad;

    // Support dynamic digital terminals
    const terminals = getLogicComponentTerminals(comp, def) ?? def.terminals ?? [];
    const terminalPins: Point[] = terminals.map(t =>
      getTerminalWorldPos(comp.x, comp.y, t.x, t.y, comp.rotation, comp.flipH, comp.flipV),
    );

    result.push({ xMin, xMax, yMin, yMax, terminalPins });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2 – Grid cost matrix
// ---------------------------------------------------------------------------

export interface RoutingGrid {
  costs: number[][];
  originX: number;
  originY: number;
  rows: number;
  cols: number;
  gridSize: number;
}

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

  const originX = Math.floor(rawXMin / gridSize) * gridSize;
  const originY = Math.floor(rawYMin / gridSize) * gridSize;

  const cols = Math.ceil((rawXMax - originX) / gridSize) + 1;
  const rows = Math.ceil((rawYMax - originY) / gridSize) + 1;

  const costs: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(1));

  const toCol = (wx: number) => Math.round((wx - originX) / gridSize);
  const toRow = (wy: number) => Math.round((wy - originY) / gridSize);

  for (const bbox of bboxes) {
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
  dir: Dir | -1;
  g: number;
  f: number;
  parent: AStarNode | null;
}

const TURN_PENALTY = 2;

function heuristic(ac: number, ar: number, bc: number, br: number): number {
  return Math.abs(ac - bc) + Math.abs(ar - br);
}

function aStarSearch(
  grid: RoutingGrid,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
): Point[] | null {
  const { costs, rows, cols, gridSize, originX, originY } = grid;

  const gBest = new Map<string, number>();
  const key = (c: number, r: number, d: number) => `${c},${r},${d}`;

  const open: AStarNode[] = [];

  const startNode: AStarNode = {
    col: startCol,
    row: startRow,
    dir: -1,
    g: 0,
    f: heuristic(startCol, startRow, endCol, endRow),
    parent: null,
  };
  open.push(startNode);
  gBest.set(key(startCol, startRow, -1), 0);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;

    if (current.col === endCol && current.row === endRow) {
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

      const isTurn = current.dir !== -1 && current.dir !== d;
      const moveCost = costs[nr][nc] + (isTurn ? TURN_PENALTY : 0);
      const ng = current.g + moveCost;
      const nk = key(nc, nr, d);

      if ((gBest.get(nk) ?? Infinity) <= ng) continue;

      gBest.set(nk, ng);
      open.push({
        col: nc,
        row: nr,
        dir: d as Dir,
        g: ng,
        f: ng + heuristic(nc, nr, endCol, endRow),
        parent: current,
      });
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 4 – Public entry point
// ---------------------------------------------------------------------------

/**
 * Calculate an obstacle-avoiding strictly orthogonal path between two world-
 * space points for digital logic wiring.
 */
export function calculateOrthogonalPath(
  startPt: Point,
  endPt: Point,
  components: CircuitComponent[],
  gridSize: number,
  excludeIds: Set<string> = new Set(),
): Point[] {
  if (startPt[0] === endPt[0] || startPt[1] === endPt[1]) {
    return [startPt, endPt];
  }

  const bboxes = buildComponentBBoxes(components, gridSize, excludeIds);

  if (bboxes.length === 0) {
    return [startPt, [endPt[0], startPt[1]], endPt];
  }

  const grid = buildRoutingGrid(startPt, endPt, bboxes, gridSize);

  const startCol = Math.round((startPt[0] - grid.originX) / gridSize);
  const startRow = Math.round((startPt[1] - grid.originY) / gridSize);
  const endCol = Math.round((endPt[0] - grid.originX) / gridSize);
  const endRow = Math.round((endPt[1] - grid.originY) / gridSize);

  const raw = aStarSearch(grid, startCol, startRow, endCol, endRow);

  if (raw && raw.length >= 2) {
    return simplifyOrthogonalPath(raw);
  }

  return simplifyOrthogonalPath([startPt, [endPt[0], startPt[1]], endPt]);
}
