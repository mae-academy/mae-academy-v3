/**
 * Fixed grid geometry shared by every SVG piece. All coordinates are integers so 2 px strokes land
 * exactly on pixel boundaries and `shape-rendering: crispEdges` never has to guess.
 *
 * Column *boundaries* (0 = left power rail, `cols` = right neutral rail) are the unit wires and rails
 * are expressed in; a node at column `c` spans boundaries `c .. c + colSpan`.
 */

export const CELL_WIDTH = 100;
export const CELL_HEIGHT = 80;

/** X of the left power rail. */
export const RAIL_X = 40;
export const MARGIN_TOP = 16;
export const MARGIN_BOTTOM = 16;
/** Space right of the neutral rail. */
export const MARGIN_RIGHT = 40;

export const WIRE_WIDTH = 2;
export const JUNCTION_RADIUS = 3;

export const boundaryX = (boundary: number): number => RAIL_X + boundary * CELL_WIDTH;
export const cellTop = (row: number): number => MARGIN_TOP + row * CELL_HEIGHT;
/** Y of the wire running through `row`. */
export const rowY = (row: number): number => cellTop(row) + CELL_HEIGHT / 2;

export interface RungSize {
  readonly width: number;
  readonly height: number;
}

export const rungSize = (cols: number, rows: number): RungSize => ({
  width: RAIL_X + cols * CELL_WIDTH + MARGIN_RIGHT,
  height: MARGIN_TOP + rows * CELL_HEIGHT + MARGIN_BOTTOM,
});

export interface Cell {
  readonly row: number;
  readonly col: number;
}

/** Maps an SVG-space point to the grid cell under it, or null outside the grid. */
export function cellFromPoint(x: number, y: number, cols: number, rows: number): Cell | null {
  const col = Math.floor((x - RAIL_X) / CELL_WIDTH);
  const row = Math.floor((y - MARGIN_TOP) / CELL_HEIGHT);
  return col < 0 || row < 0 || col >= cols || row >= rows ? null : { row, col };
}
