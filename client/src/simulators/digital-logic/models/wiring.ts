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

/** Generate an orthogonal (Manhattan) path whose interior vertices live on the logical lattice. */
export function orthogonalPath(from: Point, to: Point, grid = 20): Point[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = snapToGrid((x1 + x2) / 2, grid);
  return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
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

/** Convert orthogonal points to SVG path */
export function pointsToPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  const [start, ...rest] = pts;
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

/** Build a path according to the selected routing mode. */
export function routePath(from: Point, to: Point, routing: 'orthogonal' | 'straight' | 'manual', grid = 20): Point[] {
  if (routing === 'straight') return [from, to];
  if (routing === 'manual') return [from, to];
  return orthogonalPath(from, to, grid);
}

/** Preserve manually placed corners while locking the endpoints to component terminals. */
export function reconnectPathEndpoints(
  existingPath: Point[],
  from: Point,
  to: Point,
  routing: 'orthogonal' | 'straight' | 'manual',
): Point[] {
  if (routing === 'manual' && existingPath.length > 2) {
    return [from, ...existingPath.slice(1, -1), to];
  }
  return routePath(from, to, routing);
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
