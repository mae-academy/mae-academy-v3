/**
 * MAE K-Map Geometry — pure Gray-code topology and SVG overlay mathematics.
 * Rendering components consume these coordinates; no DOM, React, or animation is present here.
 */
import type { KMapVariableCount } from './kmapSolver';

export interface KMapCellCoordinate {
  minterm: number;
  map: number;
  row: number;
  column: number;
}

export interface KMapTopology {
  variableCount: KMapVariableCount;
  rowBits: number;
  columnBits: number;
  mapBits: number;
  rows: number;
  columns: number;
  maps: number;
  rowGrayCodes: string[];
  columnGrayCodes: string[];
  cells: KMapCellCoordinate[];
}

export interface KMapOverlayMetrics {
  cellWidth: number;
  cellHeight: number;
  mapGap?: number;
  cornerRadius?: number;
}

export interface KMapOverlayRect {
  map: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** SVG path with cubic Bézier corner arcs, ready for a `<path d>` overlay. */
  path: string;
}

export interface KMapBridge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** A dashed bridge marks one implicant continuing through the fifth-variable plane boundary. */
  dashed: true;
}

export interface KMapGroupGeometry {
  id: string;
  groupSize: number;
  zIndex: number;
  inset: number;
  rects: KMapOverlayRect[];
  bridges: KMapBridge[];
}

export interface KMapGeometryGroup {
  id: string;
  coveredMinterms: readonly number[];
}

const GRAY_1 = ['0', '1'];
const GRAY_2 = ['00', '01', '11', '10'];

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const uniqueNumbers = (values: readonly number[]) => Array.from(new Set(values)).sort((left, right) => left - right);
const positionKey = (map: number, row: number, column: number) => `${map}:${row}:${column}`;

/** Gray ordering uses the canonical 00, 01, 11, 10 sequence required by K-Map adjacency. */
export const grayCodeForBits = (bitCount: 1 | 2): string[] => bitCount === 1 ? [...GRAY_1] : [...GRAY_2];

export const createKMapTopology = (variableCount: KMapVariableCount): KMapTopology => {
  const rowBits = variableCount === 2 ? 1 : 2;
  const columnBits = variableCount === 2 ? 1 : 2;
  const mapBits = variableCount === 5 ? 1 : 0;
  const rows = 2 ** rowBits;
  const columns = 2 ** columnBits;
  const maps = 2 ** mapBits;
  const rowGrayCodes = grayCodeForBits(rowBits as 1 | 2);
  const columnGrayCodes = grayCodeForBits(columnBits as 1 | 2);
  const cells: KMapCellCoordinate[] = [];

  for (let map = 0; map < maps; map += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        // In a 5-variable map, the extra plane bit is the fifth variable.
        const binary = `${rowGrayCodes[row]}${columnGrayCodes[column]}${mapBits ? map.toString(2) : ''}`;
        cells.push({ minterm: Number.parseInt(binary, 2), map, row, column });
      }
    }
  }
  return { variableCount, rowBits, columnBits, mapBits, rows, columns, maps, rowGrayCodes, columnGrayCodes, cells };
};

const findCell = (topology: KMapTopology, minterm: number) => {
  const cell = topology.cells.find(candidate => candidate.minterm === minterm);
  if (!cell) throw new Error(`Minterm ${minterm} does not belong to this K-Map topology.`);
  return cell;
};

const consecutiveRuns = (values: readonly number[], limit: number) => {
  const selected = new Set(values);
  if (selected.size === limit) return [{ start: 0, length: limit }];
  const starts = Array.from(selected).filter(value => !selected.has((value - 1 + limit) % limit)).sort((left, right) => left - right);
  return starts.map(start => {
    let length = 1;
    while (length < limit && selected.has((start + length) % limit)) length += 1;
    return { start, length };
  });
};

const roundedPath = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  const k = 0.5522847498;
  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `C ${x + width - r + r * k} ${y} ${x + width} ${y + r - r * k} ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `C ${x + width} ${y + height - r + r * k} ${x + width - r + r * k} ${y + height} ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `C ${x + r - r * k} ${y + height} ${x} ${y + height - r + r * k} ${x} ${y + height - r}`,
    `V ${y + r}`,
    `C ${x} ${y + r - r * k} ${x + r - r * k} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
};

const mapOriginX = (map: number, topology: KMapTopology, metrics: KMapOverlayMetrics) => map * (topology.columns * metrics.cellWidth + (metrics.mapGap ?? 24));

const splitRun = (start: number, length: number, limit: number) => start + length <= limit
  ? [{ start, length }]
  : [{ start, length: limit - start }, { start: 0, length: start + length - limit }];

/**
 * Splits a toroidal group into only the visual fragments that belong at each map edge.
 * No rectangle crosses through the map center when a group wraps around an axis.
 */
export const groupToOverlayRects = (
  minterms: readonly number[],
  topology: KMapTopology,
  metrics: KMapOverlayMetrics,
  inset = 0,
): KMapOverlayRect[] => {
  const byMap = new Map<number, KMapCellCoordinate[]>();
  uniqueNumbers(minterms).forEach(minterm => {
    const cell = findCell(topology, minterm);
    byMap.set(cell.map, [...(byMap.get(cell.map) ?? []), cell]);
  });
  const radius = metrics.cornerRadius ?? 15;
  const rects: KMapOverlayRect[] = [];

  byMap.forEach((cells, map) => {
    const rows = uniqueNumbers(cells.map(cell => cell.row));
    const columns = uniqueNumbers(cells.map(cell => cell.column));
    const rowRuns = consecutiveRuns(rows, topology.rows).flatMap(run => splitRun(run.start, run.length, topology.rows));
    const columnRuns = consecutiveRuns(columns, topology.columns).flatMap(run => splitRun(run.start, run.length, topology.columns));

    rowRuns.forEach(rowRun => columnRuns.forEach(columnRun => {
      const x = mapOriginX(map, topology, metrics) + columnRun.start * metrics.cellWidth + inset;
      const y = rowRun.start * metrics.cellHeight + inset;
      const width = columnRun.length * metrics.cellWidth - inset * 2;
      const height = rowRun.length * metrics.cellHeight - inset * 2;
      if (width <= 0 || height <= 0) return;
      rects.push({ map, x, y, width, height, path: roundedPath(x, y, width, height, radius) });
    }));
  });
  return rects;
};

/** Provides dashed visual bridges for 5-variable implicants spanning both 4×4 planes. */
export const groupToPlaneBridges = (
  minterms: readonly number[],
  topology: KMapTopology,
  metrics: KMapOverlayMetrics,
  inset = 0,
): KMapBridge[] => {
  if (topology.maps !== 2) return [];
  const cells = uniqueNumbers(minterms).map(minterm => findCell(topology, minterm));
  const firstPlane = new Set(cells.filter(cell => cell.map === 0).map(cell => positionKey(0, cell.row, cell.column)));
  const bridges: KMapBridge[] = [];
  cells.filter(cell => cell.map === 1).forEach(cell => {
    if (!firstPlane.has(positionKey(0, cell.row, cell.column))) return;
    const y = cell.row * metrics.cellHeight + metrics.cellHeight / 2;
    bridges.push({
      from: { x: mapOriginX(0, topology, metrics) + topology.columns * metrics.cellWidth - inset, y },
      to: { x: mapOriginX(1, topology, metrics) + inset, y },
      dashed: true,
    });
  });
  return bridges;
};

const includesAll = (container: readonly number[], candidate: readonly number[]) => {
  const values = new Set(container);
  return candidate.every(value => values.has(value));
};

/**
 * Large groups are emitted first with lower SVG z-indices. Nested smaller groups receive
 * a 4 px offset per containing group so their outlines remain individually legible.
 */
export const layoutKMapGroups = (
  groups: readonly KMapGeometryGroup[],
  topology: KMapTopology,
  metrics: KMapOverlayMetrics,
  baseInset = 3,
  nestedOffset = 4,
): KMapGroupGeometry[] => {
  const ordered = [...groups].sort((left, right) => right.coveredMinterms.length - left.coveredMinterms.length || left.id.localeCompare(right.id));
  return ordered.map((group, index) => {
    const containers = ordered.slice(0, index).filter(candidate => candidate.coveredMinterms.length > group.coveredMinterms.length && includesAll(candidate.coveredMinterms, group.coveredMinterms));
    const inset = baseInset + containers.length * nestedOffset;
    return {
      id: group.id,
      groupSize: group.coveredMinterms.length,
      zIndex: index,
      inset,
      rects: groupToOverlayRects(group.coveredMinterms, topology, metrics, inset),
      bridges: groupToPlaneBridges(group.coveredMinterms, topology, metrics, inset),
    };
  });
};
