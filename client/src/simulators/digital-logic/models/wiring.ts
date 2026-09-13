/**
 * ElectroLab – Wire Routing Utilities
 */

export type Point = [number, number];

export function snapToGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}

export function snapPointToGrid(p: Point, grid: number): Point {
  return [snapToGrid(p[0], grid), snapToGrid(p[1], grid)];
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectIntersectsSegment(rect: Obstacle, from: Point, to: Point): boolean {
  const [rx, ry, rw, rh] = [rect.x, rect.y, rect.width, rect.height];
  const [x1, y1] = from;
  const [x2, y2] = to;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) return false;

  return true; // Since segments are orthogonal, overlap with bounding box is intersection
}

/**
 * Minimal Bend Orthogonal Routing (Fallback/Auto mode):
 * - If X1 = X2 or Y1 = Y2, route as a single straight line (zero bends).
 * - If both ΔX and ΔY ≠ 0, use a single-bend L-shape ([X1, Y1] → [X2, Y1] → [X2, Y2])
 *   instead of generating 3 segments (Z/S-bend).
 */
export function orthogonalPath(
  from: Point,
  to: Point,
  arg3?: number | 'horizontal' | 'vertical',
  arg4?: boolean,
): Point[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  // If already aligned, return a straight line.
  if (x1 === x2 || y1 === y2) {
    return [[x1, y1], [x2, y2]];
  }
  // Determine corner based on provided arguments.
  // Legacy signature: orthogonalPath(from, to, grid: number, preferHorizontalFirst?: boolean)
  if (typeof arg3 === 'number') {
    const preferHorizontalFirst = arg4 !== undefined ? arg4 : Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const corner: Point = preferHorizontalFirst ? [x2, y1] : [x1, y2];
    return [[x1, y1], corner, [x2, y2]];
  }
  // New signature: initialAxis is a string.
  const initialAxis = typeof arg3 === 'string' ? arg3 : undefined;
  let preferHorizontal: boolean;
  if (initialAxis === 'horizontal') {
    preferHorizontal = true;
  } else if (initialAxis === 'vertical') {
    preferHorizontal = false;
  } else {
    // If no initial axis given (e.g. free-space/junction), follow pull direction:
    // If user pulls vertically first (|dy| > |dx|), vertical first; otherwise horizontal first
    preferHorizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  }
  const corner: Point = preferHorizontal ? [x2, y1] : [x1, y2];
  return [[x1, y1], corner, [x2, y2]];
}

export function obstacleAwareOrthogonalPath(
  from: Point,
  to: Point,
  obstacles: Obstacle[],
  grid = 20,
  preferHorizontalFirst = true,
): Point[] {
  const checkCollision = (pts: Point[]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      for (const obs of obstacles) {
        if (rectIntersectsSegment(obs, pts[i], pts[i + 1])) return true;
      }
    }
    return false;
  };

  const path1 = orthogonalPath(from, to, grid, preferHorizontalFirst);
  if (!checkCollision(path1)) return path1;

  const path2 = orthogonalPath(from, to, grid, !preferHorizontalFirst);
  if (!checkCollision(path2)) return path2;

  // Zero-dogleg invariant: strictly return 1- or 2-segment L-path. Never inject 3-segment Z-bends.
  return path1;
}

/**
 * Enforces strict rectilinear invariant on a point array:
 * Every consecutive segment MUST be either purely horizontal (dy === 0)
 * or purely vertical (dx === 0). If any diagonal is detected, an
 * intermediate 90° elbow is inserted to split it into two orthogonal
 * segments.
 */
export function enforceOrthogonal(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    // Already aligned – no elbow needed
    if (prev[0] === curr[0] || prev[1] === curr[1]) {
      result.push(curr);
    } else {
      // Split diagonal into strictly 90° horizontal and vertical segments
      const elbow: Point = Math.abs(curr[0] - prev[0]) >= Math.abs(curr[1] - prev[1])
        ? [curr[0], prev[1]]
        : [prev[0], curr[1]];
      result.push(elbow);
      result.push(curr);
    }
  }
  return result;
}

/**
 * Collapses consecutive duplicates and collinear horizontal/vertical intermediate vertices
 * into the simplest clean orthogonal path.
 */
export function simplifyOrthogonalPath(points: Point[]): Point[] {
  if (points.length <= 2) return enforceOrthogonal(points);

  // 1. Remove consecutive duplicates
  const dedup: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = dedup[dedup.length - 1];
    const curr = points[i];
    if (curr[0] !== prev[0] || curr[1] !== prev[1]) {
      dedup.push(curr);
    }
  }

  if (dedup.length <= 2) return enforceOrthogonal(dedup);

  // 2. Remove collinear intermediate points
  const simplified: Point[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = dedup[i];
    const next = dedup[i + 1];

    const isCollinearH = prev[1] === curr[1] && curr[1] === next[1];
    const isCollinearV = prev[0] === curr[0] && curr[0] === next[0];

    if (!isCollinearH && !isCollinearV) {
      simplified.push(curr);
    }
  }
  simplified.push(dedup[dedup.length - 1]);

  // 3. Final safety: enforce orthogonal on the simplified result
  return enforceOrthogonal(simplified);
}

/**
 * Projects a point onto the nearest horizontal/vertical segment of an existing wire path.
 * Returns the exact snapped projection point on the segment and whether the segment is horizontal or vertical.
 */
export function projectPointOntoWire(
  point: Point,
  wirePath: Point[],
  gridSize = 25,
): { point: Point; segmentIndex: number; axis: 'horizontal' | 'vertical'; distance: number } | null {
  if (wirePath.length < 2) return null;

  let best: { point: Point; segmentIndex: number; axis: 'horizontal' | 'vertical'; distance: number } | null = null;
  const [px, py] = point;

  for (let i = 0; i < wirePath.length - 1; i++) {
    const a = wirePath[i];
    const b = wirePath[i + 1];

    const isHorizontal = Math.abs(a[1] - b[1]) <= 1e-4;
    const isVertical = Math.abs(a[0] - b[0]) <= 1e-4;

    if (isHorizontal) {
      const y = a[1];
      const minX = Math.min(a[0], b[0]);
      const maxX = Math.max(a[0], b[0]);
      const snappedX = snapToGrid(px, gridSize);
      const clampedX = Math.max(minX, Math.min(maxX, snappedX));
      const distSq = (px - clampedX) ** 2 + (py - y) ** 2;
      const distance = Math.sqrt(distSq);

      if (!best || distance < best.distance) {
        best = { point: [clampedX, y], segmentIndex: i, axis: 'horizontal', distance };
      }
    } else if (isVertical) {
      const x = a[0];
      const minY = Math.min(a[1], b[1]);
      const maxY = Math.max(a[1], b[1]);
      const snappedY = snapToGrid(py, gridSize);
      const clampedY = Math.max(minY, Math.min(maxY, snappedY));
      const distSq = (px - x) ** 2 + (py - clampedY) ** 2;
      const distance = Math.sqrt(distSq);

      if (!best || distance < best.distance) {
        best = { point: [x, clampedY], segmentIndex: i, axis: 'vertical', distance };
      }
    }
  }

  return best;
}

/**
 * Routes a new wire to meet an existing wire segment at a clean 90° T-junction.
 */
export function routeTJunctionPath(
  from: Point,
  junctionPoint: Point,
  targetAxis: 'horizontal' | 'vertical',
  lockedCorners: Point[] = [],
  fromAxis?: 'horizontal' | 'vertical',
): Point[] {
  const [jx, jy] = junctionPoint;
  const lastPoint = lockedCorners.length > 0 ? lockedCorners[lockedCorners.length - 1] : from;

  let approachCorner: Point;
  if (lockedCorners.length === 0 && fromAxis) {
    approachCorner = fromAxis === 'horizontal' ? [jx, lastPoint[1]] : [lastPoint[0], jy];
  } else {
    approachCorner = targetAxis === 'horizontal' ? [jx, lastPoint[1]] : [lastPoint[0], jy];
  }

  const rawPath: Point[] = [from, ...lockedCorners, approachCorner, junctionPoint];
  return simplifyOrthogonalPath(rawPath);
}

/**
 * Inserts a collinear junction point into an existing wire path at the specified segment index
 * without warping or bending the wire's straight trajectory.
 */
export function insertPointIntoWirePath(path: Point[], point: Point, segmentIndex: number): Point[] {
  if (segmentIndex < 0 || segmentIndex >= path.length - 1) return path;
  const a = path[segmentIndex];
  const b = path[segmentIndex + 1];

  if (Math.hypot(a[0] - point[0], a[1] - point[1]) <= 1e-3 || Math.hypot(b[0] - point[0], b[1] - point[1]) <= 1e-3) {
    return path;
  }

  return [
    ...path.slice(0, segmentIndex + 1),
    point,
    ...path.slice(segmentIndex + 1),
  ];
}

/** Generate curved path between two points */
export function curvedPath(from: Point, to: Point): Point[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = Math.abs(x2 - x1);
  const cp1x = x1 + dx * 0.5;
  const cp2x = x2 - dx * 0.5;
  return [[x1, y1], [cp1x, y1], [cp2x, y2], [x2, y2]];
}

/** Convert point array to SVG polyline points string */
export function pointsToPolyline(pts: Point[]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Convert control points to SVG cubic bezier path */
export function pointsToCubicPath(pts: Point[]): string {
  if (pts.length < 4) return '';
  const [p0, p1, p2, p3] = pts;
  return `M ${p0[0]},${p0[1]} C ${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;
}

/**
 * Convert orthogonal points to SVG path. Enforces the rectilinear invariant
 * so that a diagonal segment can NEVER appear in the rendered SVG.
 */
export function pointsToPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  const safe = enforceOrthogonal(pts);
  const [start, ...rest] = safe;
  return `M ${start[0]},${start[1]} ` + rest.map(([x, y]) => `L ${x},${y}`).join(' ');
}

/** Distance between two points */
export function dist(a: Point, b: Point): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** Get world position of a terminal given component transform */
export function getTerminalWorldPos(
  compX: number,
  compY: number,
  termX: number,
  termY: number,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): Point {
  let tx = flipH ? -termX : termX;
  let ty = flipV ? -termY : termY;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = tx * cos - ty * sin;
  const ry = tx * sin + ty * cos;
  return [compX + rx, compY + ry];
}

/** Check if a point is near a terminal (within threshold) */
export function isNearTerminal(px: number, py: number, tx: number, ty: number, threshold = 10): boolean {
  return dist([px, py], [tx, ty]) <= threshold;
}

/** Compute animated dot positions along a polyline path */
export function getDotsOnPath(pts: Point[], numDots: number, offset: number): Point[] {
  if (pts.length < 2) return [];
  let totalLen = 0;
  const segments: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    segments.push(d);
    totalLen += d;
  }
  if (totalLen === 0) return [];

  const spacing = totalLen / numDots;
  const dots: Point[] = [];
  for (let d = 0; d < numDots; d++) {
    let targetDist = ((d * spacing + offset * totalLen) % totalLen + totalLen) % totalLen;
    let accumulated = 0;
    for (let i = 0; i < segments.length; i++) {
      if (accumulated + segments[i] >= targetDist) {
        const t = (targetDist - accumulated) / segments[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        dots.push([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]);
        break;
      }
      accumulated += segments[i];
    }
  }
  return dots;
}

/** Return the total geometric length of a wire path. */
export function pathLength(pts: Point[]): number {
  return pts.slice(1).reduce((sum, point, index) => sum + dist(pts[index], point), 0);
}

/**
 * Build a path according to the selected routing mode.
 * INVARIANT: the returned path is ALWAYS strictly orthogonal.
 */
export function routePath(from: Point, to: Point, routing: 'orthogonal' | 'straight' | 'manual', obstacles: Obstacle[] = [], grid = 20, fromAxis?: 'horizontal' | 'vertical'): Point[] {
  if (routing === 'straight') return enforceOrthogonal([from, to]);
  if (routing === 'manual') return enforceOrthogonal([from, to]);
  const initialAxis = fromAxis ? fromAxis : undefined;
  return orthogonalPath(from, to, initialAxis);
}

/**
 * Preserve manually placed corners and waypoints while locking the endpoints to component terminals.
 * INVARIANT: The returned path is ALWAYS strictly orthogonal (no diagonal segments).
 */
export function reconnectPathEndpoints(
  existingPath: Point[],
  from: Point,
  to: Point,
  routing: 'orthogonal' | 'straight' | 'manual',
  obstacles: Obstacle[] = [],
  waypoints?: Point[],
  grid = 20,
  fromAxis?: 'horizontal' | 'vertical',
): Point[] {
  if (
    existingPath.length >= 2 &&
    Math.abs(existingPath[0][0] - from[0]) < 1e-3 &&
    Math.abs(existingPath[0][1] - from[1]) < 1e-3 &&
    Math.abs(existingPath[existingPath.length - 1][0] - to[0]) < 1e-3 &&
    Math.abs(existingPath[existingPath.length - 1][1] - to[1]) < 1e-3
  ) {
    return existingPath;
  }
  if (waypoints && waypoints.length > 0) {
    return simplifyOrthogonalPath([from, ...waypoints, to]);
  }
  if (routing === 'manual' && existingPath.length > 2) {
    return simplifyOrthogonalPath([from, ...existingPath.slice(1, -1), to]);
  }
  if (routing === 'straight') return enforceOrthogonal([from, to]);
  return routePath(from, to, routing, obstacles, grid, fromAxis);
}

/** Add a corner to a selected manual wire. */
export function addWireCorner(path: Point[], point: Point, segmentIndex?: number, grid = 20): Point[] {
  if (path.length < 2) return path;
  const insertion = segmentIndex === undefined
    ? Math.max(1, Math.floor(path.length / 2))
    : Math.max(1, Math.min(path.length - 1, segmentIndex + 1));
  return [...path.slice(0, insertion), snapPointToGrid(point, grid), ...path.slice(insertion)];
}

/** Replace an editable interior path point; endpoints are intentionally immutable. */
export function moveWireCorner(path: Point[], cornerIndex: number, point: Point, grid = 20): Point[] {
  if (cornerIndex <= 0 || cornerIndex >= path.length - 1) return path;
  return path.map((current, index) => (index === cornerIndex ? snapPointToGrid(point, grid) : current));
}

/** Find the nearest editable corner in world coordinates. */
export function nearestWireCorner(path: Point[], point: Point, threshold = 12): number | null {
  let nearest: number | null = null;
  let best = threshold;
  for (let index = 1; index < path.length - 1; index += 1) {
    const distance = dist(path[index], point);
    if (distance <= best) {
      nearest = index;
      best = distance;
    }
  }
  return nearest;
}

/** Reverse a path for rendering electron motion opposite to conventional current. */
export function reversedPath(path: Point[]): Point[] {
  return [...path].reverse();
}
