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
  arg4?: boolean
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
  preferHorizontalFirst = true
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
 * or purely vertical (dx === 0).  If any diagonal is detected, an
 * intermediate 90° elbow is inserted to split it into two orthogonal
 * segments.  The elbow extends the first point's X then bends to the
 * second point's Y (vertical-first), preserving the overall route.
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
 * Removes consecutive duplicate points within floating-point tolerance.
 */
function removeDuplicates(pts: Point[]): Point[] {
  if (pts.length <= 1) return pts;
  const result: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    if (Math.abs(curr[0] - prev[0]) > 1e-4 || Math.abs(curr[1] - prev[1]) > 1e-4) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Removes intermediate vertices when three consecutive points share the same X or Y axis.
 * Also eliminates 180° backtracks along the same straight line.
 */
function removeCollinear(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const result: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const isCollinearH = Math.abs(prev[1] - curr[1]) < 1e-4 && Math.abs(curr[1] - next[1]) < 1e-4;
    const isCollinearV = Math.abs(prev[0] - curr[0]) < 1e-4 && Math.abs(curr[0] - next[0]) < 1e-4;

    if (!isCollinearH && !isCollinearV) {
      result.push(curr);
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/**
 * Collapses 3-segment U-turns (bracket/hairpin detours A -> B -> C -> D)
 * where segments AB and CD are parallel and opposite, eliminating redundant loops.
 */
function collapseUTurns(pts: Point[]): { changed: boolean; points: Point[] } {
  if (pts.length < 4) return { changed: false, points: pts };

  for (let i = 0; i < pts.length - 3; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const c = pts[i + 2];
    const d = pts[i + 3];

    // Case 1: Horizontal -> Vertical -> Horizontal
    const abH = Math.abs(a[1] - b[1]) < 1e-4;
    const bcV = Math.abs(b[0] - c[0]) < 1e-4;
    const cdH = Math.abs(c[1] - d[1]) < 1e-4;

    if (abH && bcV && cdH) {
      const dxAB = b[0] - a[0];
      const dxCD = d[0] - c[0];
      if (dxAB * dxCD < -1e-4) {
        const minAB = Math.min(a[0], b[0]);
        const maxAB = Math.max(a[0], b[0]);

        if (d[0] >= minAB - 1e-4 && d[0] <= maxAB + 1e-4) {
          const newCorner: Point = [d[0], a[1]];
          const newPts = [...pts.slice(0, i + 1), newCorner, ...pts.slice(i + 3)];
          return { changed: true, points: newPts };
        }

        const minCD = Math.min(c[0], d[0]);
        const maxCD = Math.max(c[0], d[0]);
        if (a[0] >= minCD - 1e-4 && a[0] <= maxCD + 1e-4) {
          const newCorner: Point = [a[0], c[1]];
          const newPts = [...pts.slice(0, i + 1), newCorner, ...pts.slice(i + 3)];
          return { changed: true, points: newPts };
        }
      }
    }

    // Case 2: Vertical -> Horizontal -> Vertical
    const abV = Math.abs(a[0] - b[0]) < 1e-4;
    const bcH = Math.abs(b[1] - c[1]) < 1e-4;
    const cdV = Math.abs(c[0] - d[0]) < 1e-4;

    if (abV && bcH && cdV) {
      const dyAB = b[1] - a[1];
      const dyCD = d[1] - c[1];
      if (dyAB * dyCD < -1e-4) {
        const minAB = Math.min(a[1], b[1]);
        const maxAB = Math.max(a[1], b[1]);

        if (d[1] >= minAB - 1e-4 && d[1] <= maxAB + 1e-4) {
          const newCorner: Point = [a[0], d[1]];
          const newPts = [...pts.slice(0, i + 1), newCorner, ...pts.slice(i + 3)];
          return { changed: true, points: newPts };
        }

        const minCD = Math.min(c[1], d[1]);
        const maxCD = Math.max(c[1], d[1]);
        if (a[1] >= minCD - 1e-4 && a[1] <= maxCD + 1e-4) {
          const newCorner: Point = [c[0], a[1]];
          const newPts = [...pts.slice(0, i + 1), newCorner, ...pts.slice(i + 3)];
          return { changed: true, points: newPts };
        }
      }
    }
  }

  return { changed: false, points: pts };
}

/**
 * Detects and snips interior self-intersecting loops in an orthogonal path.
 */
function removeSelfIntersections(pts: Point[]): { changed: boolean; points: Point[] } {
  if (pts.length < 4) return { changed: false, points: pts };

  for (let i = 0; i < pts.length - 2; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const seg1H = Math.abs(p1[1] - p2[1]) < 1e-4;
    const seg1V = Math.abs(p1[0] - p2[0]) < 1e-4;

    for (let j = i + 2; j < pts.length - 1; j++) {
      const p3 = pts[j];
      const p4 = pts[j + 1];
      const seg2H = Math.abs(p3[1] - p4[1]) < 1e-4;
      const seg2V = Math.abs(p3[0] - p4[0]) < 1e-4;

      if (seg1H && seg2V) {
        const hY = p1[1];
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);

        const vX = p3[0];
        const minY = Math.min(p3[1], p4[1]);
        const maxY = Math.max(p3[1], p4[1]);

        if (vX > minX + 1e-4 && vX < maxX - 1e-4 && hY > minY + 1e-4 && hY < maxY - 1e-4) {
          const inter: Point = [vX, hY];
          const newPts = [...pts.slice(0, i + 1), inter, ...pts.slice(j + 1)];
          return { changed: true, points: newPts };
        }
      } else if (seg1V && seg2H) {
        const vX = p1[0];
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);

        const hY = p3[1];
        const minX = Math.min(p3[0], p4[0]);
        const maxX = Math.max(p3[0], p4[0]);

        if (vX > minX + 1e-4 && vX < maxX - 1e-4 && hY > minY + 1e-4 && hY < maxY - 1e-4) {
          const inter: Point = [vX, hY];
          const newPts = [...pts.slice(0, i + 1), inter, ...pts.slice(j + 1)];
          return { changed: true, points: newPts };
        }
      }
    }
  }

  return { changed: false, points: pts };
}

export interface SimplifyOptions {
  preserveCorners?: boolean;
}

/**
 * Collapses consecutive duplicates, collinear horizontal/vertical intermediate vertices,
 * redundant 180° backtracks, U-turn detours, and self-intersections into the cleanest minimal
 * orthogonal path. After simplification, enforces strict rectilinear geometry.
 * When `preserveCorners` is true, explicit user corners/waypoints are not collapsed by U-turn reduction.
 */
export function simplifyOrthogonalPath(points: Point[], options?: SimplifyOptions): Point[] {
  if (points.length <= 2) return enforceOrthogonal(points);

  let current = enforceOrthogonal(points);
  const preserveCorners = options?.preserveCorners ?? false;

  // Run iterative reduction until convergence (max 10 iterations to prevent infinite loops)
  for (let iter = 0; iter < 10; iter++) {
    const prevLen = current.length;

    // 1. Remove consecutive duplicates
    current = removeDuplicates(current);
    if (current.length <= 2) break;

    // 2. Remove collinear intermediate points and straight 180° backtracks
    current = removeCollinear(current);
    if (current.length <= 2) break;

    if (!preserveCorners) {
      // 3. Collapse U-turns (bracket detours)
      const uTurnResult = collapseUTurns(current);
      if (uTurnResult.changed) {
        current = uTurnResult.points;
        continue;
      }

      // 4. Remove self-intersecting loops
      const loopResult = removeSelfIntersections(current);
      if (loopResult.changed) {
        current = loopResult.points;
        continue;
      }
    }

    if (current.length === prevLen) {
      break;
    }
  }

  return enforceOrthogonal(current);
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
 * If target segment is horizontal, arrival direction is perpendicular (vertical).
 * If target segment is vertical, arrival direction is perpendicular (horizontal).
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
  return simplifyOrthogonalPath(rawPath, { preserveCorners: lockedCorners.length > 0 });
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
  // Returns control points for a cubic bezier
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = Math.abs(x2 - x1);
  const cp1x = x1 + dx * 0.5;
  const cp2x = x2 - dx * 0.5;
  // We'll render as SVG cubic bezier
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

/** Convert orthogonal points to SVG path.  Enforces the rectilinear invariant
 *  so that a diagonal segment can NEVER appear in the rendered SVG. */
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
  // Compute total length
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
  // Each unit of offset shifts the dot pattern by exactly one dot interval (spacing),
  // guaranteeing uniform physical velocity across wires of arbitrary lengths.
  for (let d = 0; d < numDots; d++) {
    let targetDist = ((d * spacing + offset * spacing) % totalLen + totalLen) % totalLen;
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

/** Build a path according to the selected routing mode.
 *  INVARIANT: the returned path is ALWAYS strictly orthogonal. */
export function routePath(from: Point, to: Point, routing: 'orthogonal' | 'straight' | 'manual', obstacles: Obstacle[] = [], grid = 20, fromAxis?: 'horizontal' | 'vertical'): Point[] {
  if (routing === 'straight') return enforceOrthogonal([from, to]);
  if (routing === 'manual') return enforceOrthogonal([from, to]);
  // Use strict orthogonal routing respecting the initial axis of the source terminal.
  const initialAxis = fromAxis ? fromAxis : undefined;
  return orthogonalPath(from, to, initialAxis);
}

/** Preserve manually placed corners and waypoints while locking the endpoints to component terminals.
 *  INVARIANT: The returned path is ALWAYS strictly orthogonal (no diagonal segments). */
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
    return simplifyOrthogonalPath([from, ...waypoints, to], { preserveCorners: true });
  }
  if (routing === 'manual' && existingPath.length > 2) {
    return simplifyOrthogonalPath([from, ...existingPath.slice(1, -1), to], { preserveCorners: true });
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
