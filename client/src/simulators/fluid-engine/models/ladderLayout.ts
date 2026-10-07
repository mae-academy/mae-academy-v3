/**
 * Geometry of the current-path diagram. Current paths are vertical columns between the +24 V rail (top) and the 0 V rail
 * (bottom). Conditions stack from the top; every load sits on one common line just above the 0 V rail, and the cross-reference
 * table hangs under it. Pure, so the arrangement is unit-tested without a DOM.
 */
import type { LadderCircuit, LadderElement } from './relayLadder';

/** Horizontal room of one element inside a parallel group. */
export const ELEMENT_PITCH = 72;
/** Free strip at the right of a column, where the "add parallel" site and the next column's clearance live. */
export const COLUMN_MARGIN = 28;
export const ROW_HEIGHT = 76;
/** Half the height of a symbol: its terminals sit at ±TERMINAL_REACH from its centre. */
export const TERMINAL_REACH = 24;
/** Where parallel branches join: just beyond the terminals. */
export const BUS_REACH = 32;
/** Radius of the rounded corners where a parallel branch leaves and rejoins the conductor. */
export const JUNCTION_RADIUS = 6;
/** The rails always span at least this much of the workspace, however few paths there are. */
export const MIN_RAIL_WIDTH = 760;
export const LEFT_GUTTER = 72;
export const RIGHT_GUTTER = 28;
export const RAIL_Y = 44;
const FIRST_ROW_OFFSET = 36;
const LOAD_GAP = 52;
const LOAD_TO_RAIL = 52;
const TABLE_GAP = 14;
export const TABLE_HEIGHT = 44;
const BOTTOM_PAD = 16;

export interface PlacedElement { element: LadderElement; x: number; y: number }
export interface PlacedGroup {
  index: number;
  y: number;
  elements: PlacedElement[];
  /** Left and right ends of the horizontal busbars of a parallel group (equal to the spine for a single element). */
  busLeft: number;
  busRight: number;
  /** Where the "add in parallel" site sits. */
  parallelSite: { x: number; y: number };
}
export interface PlacedColumn {
  pathId: string;
  /** 1-based current-path number printed on the +24 V rail. */
  number: number;
  left: number;
  width: number;
  /** x of the vertical conductor. */
  spine: number;
  groups: PlacedGroup[];
  load: { x: number; y: number; element: LadderElement } | null;
  /** Where the next condition would be added in series, and where a missing load would go. */
  seriesSite: { x: number; y: number };
  loadSite: { x: number; y: number };
}

export interface LadderLayout {
  width: number;
  height: number;
  /** Left and right ends of both rails. */
  railLeft: number;
  railRight: number;
  topRailY: number;
  bottomRailY: number;
  loadY: number;
  /** Top of the cross-reference table. */
  tableY: number;
  columns: PlacedColumn[];
  /** Where a new path is added: one empty column to the right. */
  newPathSite: { x: number; y: number };
}

export function layoutLadder(circuit: LadderCircuit): LadderLayout {
  const longest = Math.max(0, ...circuit.paths.map(path => path.conditions.length));
  // Always one free row under the last condition, for the add-in-series site.
  const rows = Math.max(2, longest + 1);
  const rowY = (index: number) => RAIL_Y + FIRST_ROW_OFFSET + index * ROW_HEIGHT;
  const loadY = rowY(rows - 1) + LOAD_GAP;
  const bottomRailY = loadY + LOAD_TO_RAIL;

  let cursor = LEFT_GUTTER;
  const columns = circuit.paths.map((path, pathIndex): PlacedColumn => {
    const widest = Math.max(1, ...path.conditions.map(group => group.length));
    const width = widest * ELEMENT_PITCH + COLUMN_MARGIN;
    const left = cursor;
    cursor += width;
    const spine = left + (widest * ELEMENT_PITCH) / 2;
    const groups = path.conditions.map((members, index): PlacedGroup => {
      const y = rowY(index);
      const elements = members.map((element, member) => ({ element, x: spine + (member - (members.length - 1) / 2) * ELEMENT_PITCH, y }));
      const first = elements[0].x;
      const last = elements[elements.length - 1].x;
      return { index, y, elements, busLeft: first, busRight: last, parallelSite: { x: last + ELEMENT_PITCH / 2 + 4, y } };
    });
    return {
      pathId: path.id,
      number: pathIndex + 1,
      left,
      width,
      spine,
      groups,
      load: path.load ? { x: spine, y: loadY, element: path.load } : null,
      seriesSite: { x: spine, y: rowY(path.conditions.length) },
      loadSite: { x: spine, y: loadY },
    };
  });

  const railRight = Math.max(cursor + RIGHT_GUTTER + ELEMENT_PITCH, MIN_RAIL_WIDTH);
  const tableY = bottomRailY + TABLE_GAP;
  return {
    width: railRight + RIGHT_GUTTER,
    height: tableY + TABLE_HEIGHT + BOTTOM_PAD,
    railLeft: LEFT_GUTTER - 24,
    railRight,
    topRailY: RAIL_Y,
    bottomRailY,
    loadY,
    tableY,
    columns,
    newPathSite: { x: cursor + ELEMENT_PITCH / 2, y: loadY },
  };
}
