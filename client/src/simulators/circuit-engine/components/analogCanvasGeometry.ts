import { simplifyOrthogonalPath, snapPointToGrid, type Point } from '@/simulators/circuit-engine/models/wiring';
import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';
import { calculateOrthogonalPath } from '@/simulators/circuit-engine/models/wireRouter';

export type TabDTerminalAxis = 'horizontal' | 'vertical';

/** Unified semantic color palette for mesh loop canvas overlays. */
export const MESH_LOOP_COLORS = ['#2563eb', '#7c3aed', '#e11d48', '#d97706'] as const;

/** Semantic color palette for nodal analysis node badges. */
export const NODE_COLORS = ['#e11d48', '#2563eb', '#059669'] as const;



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
export function tabDOrthogonalDraftPath(from: Point, to: Point, lockedCorners: Point[] = [], fromAxis?: TabDTerminalAxis): Point[] {
  const anchor = lockedCorners.at(-1) ?? from;
  if (anchor[0] === to[0] || anchor[1] === to[1]) return [...lockedCorners.length ? [from, ...lockedCorners] : [from], to];

  let corner: Point;
  if (lockedCorners.length === 0 && fromAxis) {
    // Starting from a pin with known terminal exit direction
    corner = fromAxis === 'horizontal' ? [to[0], anchor[1]] : [anchor[0], to[1]];
  } else {
    // Starting in free space, junction, or after previous locked corners:
    // Follow the cursor pull direction (|dy| > |dx| -> vertical-first, else horizontal-first)
    corner = lockTabDWireCorner(anchor, to);
  }

  return [...lockedCorners.length ? [from, ...lockedCorners] : [from], corner, to];
}

export interface ObstacleBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function segmentHitsBox(p1: Point, p2: Point, box: ObstacleBox): boolean {
  const minX = Math.min(p1[0], p2[0]);
  const maxX = Math.max(p1[0], p2[0]);
  const minY = Math.min(p1[1], p2[1]);
  const maxY = Math.max(p1[1], p2[1]);

  if (p1[1] === p2[1]) {
    const y = p1[1];
    return y > box.yMin + 2 && y < box.yMax - 2 && maxX > box.xMin + 2 && minX < box.xMax - 2;
  }
  if (p1[0] === p2[0]) {
    const x = p1[0];
    return x > box.xMin + 2 && x < box.xMax - 2 && maxY > box.yMin + 2 && minY < box.yMax - 2;
  }
  return false;
}

/**
 * Dynamically recalculates a strict 2- or 3-point orthogonal path between two terminals
 * during live dragging of a component or terminal.
 *
 * ZERO-DIAGONAL INVARIANT:
 * - If x1 === x2 or y1 === y2: returns strictly 2 points [from, to] (zero bends).
 * - If dx !== 0 and dy !== 0: returns strictly 3 points [from, corner, to] (one 90° bend).
 *
 * Direction logic:
 * - If moving 'to', 'from' is stationary: respect exit axis of 'from' terminal.
 * - If moving 'from', 'to' is stationary: respect entrance axis of 'to' terminal.
 * - If neither/both: use fromAxis -> toAxis -> cursor pull direction (|dx| >= |dy|).
 */
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
    // 'from' is stationary, 'to' is tracking the dragged component.
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
    // 'from' is tracking the dragged component, 'to' is stationary.
    // Entering 'to' horizontally requires the last segment to be horizontal (x1, y2) -> (x2, y2),
    // which means first segment is vertical (x1, y1) -> (x1, y2) => preferHorizontal = false.
    // Entering 'to' vertically requires the last segment to be vertical (x2, y1) -> (x2, y2),
    // which means first segment is horizontal (x1, y1) -> (x2, y1) => preferHorizontal = true.
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

/**
 * Obstacle-avoiding orthogonal path between two terminals.
 *
 * When `lockedCorners` is empty (automatic routing):
 *   - Delegates to the A* router in wireRouter.ts which builds a cost grid
 *     from component bounding boxes and finds the shortest turn-penalised path.
 *   - Falls back to a single-elbow L-shape if A* finds no route.
 *
 * When `lockedCorners` is non-empty (user-driven manual routing):
 *   - The draft path is preserved exactly as the user placed it.
 *
 * The `components` + `gridSize` parameters are optional for backward
 * compatibility with call-sites that only supply from/to/axes.
 */
export function tabDTerminalOrthogonalPath(
  from: Point,
  to: Point,
  fromAxis?: TabDTerminalAxis,
  toAxis?: TabDTerminalAxis,
  gridSize?: number,
  lockedCorners: Point[] = [],
  _obstacles: ObstacleBox[] = [],
  components: CircuitComponent[] = [],
  excludeIds: Set<string> = new Set(),
): Point[] {
  // Manual routing: user-placed corners are preserved as-is.
  if (lockedCorners.length) return tabDOrthogonalDraftPath(from, to, lockedCorners, fromAxis);

  // Automatic routing: use A* when we have component data and a grid size.
  if (components.length > 0 && gridSize) {
    return calculateOrthogonalPath(from, to, components, gridSize, excludeIds);
  }

  // Lightweight fallback (no component context, e.g. during rubber-band drag).
  return dynamicRubberBandPath(from, to, fromAxis, toAxis, 'none');
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

/** Ray-casting containment test; needed because a bounding-box midpoint can fall in the notch of a concave (e.g. L-shaped/staircase) face. */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Area-weighted polygon centroid, used only as the concave-face fallback anchor. */
function polygonCentroid(points: Point[]): Point {
  let doubleArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point[0] * next[1] - next[0] * point[1];
    doubleArea += cross;
    weightedX += (point[0] + next[0]) * cross;
    weightedY += (point[1] + next[1]) * cross;
  });
  if (Math.abs(doubleArea) <= 1e-6) {
    return [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, y]) => sum + y, 0) / points.length];
  }
  return [weightedX / (3 * doubleArea), weightedY / (3 * doubleArea)];
}

function pointToSegmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const denominator = dx * dx + dy * dy;
  if (denominator < 1e-6) return Math.hypot(point[0] - from[0], point[1] - from[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / denominator));
  return Math.hypot(point[0] - (from[0] + ratio * dx), point[1] - (from[1] + ratio * dy));
}

export interface TabDPlanarCavity {
  center: Point;
  radius: number;
  innerBounds: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
}

/**
 * Calculates the clear interior cavity of an independent planar Manhattan mesh face.
 * Inner bounds (xMin, xMax, yMin, yMax) account for boundary branch component bodies
 * and their external label placements (e.g. horizontal resistor value labels below at y + 16px),
 * placing (Cx, Cy) strictly at the cavity midpoint with dynamic clearance-based radius clamping.
 */
export function calculateTabDPlanarCavity(
  points: Point[],
  components: CircuitComponent[] = [],
  scale = 1,
): TabDPlanarCavity {
  if (!points.length) {
    return { center: [0, 0], radius: 14, innerBounds: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 } };
  }

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const [x, y] of points) {
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  // True interior geometric center of the bounding window. For a concave
  // face (e.g. an L-shaped/staircase loop) this midpoint can land in the
  // outer notch, outside the face's own perimeter — re-anchor to the area
  // centroid in that case, which is guaranteed inside for a simple polygon.
  let cx = (xMin + xMax) / 2;
  let cy = (yMin + yMax) / 2;
  let concaveFace = false;
  if (points.length >= 3 && !pointInPolygon([cx, cy], points)) {
    concaveFace = true;
    const centroid = polygonCentroid(points);
    if (pointInPolygon(centroid, points)) [cx, cy] = centroid;
  }

  // Inner bounds: shift inward to clear boundary component bodies and labels
  let innerXMin = xMin;
  let innerXMax = xMax;
  let innerYMin = yMin;
  let innerYMax = yMax;

  const edgeTolerance = 2;
  for (const comp of components) {
    const def = getDef(comp.type);
    if (!def) continue;
    const bodyHalfW = (def.width * scale) / 2;
    const bodyHalfH = (def.height * scale) / 2;
    const rotation = ((comp.rotation % 360) + 360) % 360;
    const terminalsAreHorizontal = rotation === 0 || rotation === 180;
    const anchors = tabDComponentLabelAnchors(comp.type, terminalsAreHorizontal, bodyHalfW, bodyHalfH);

    if (Math.abs(comp.y - yMin) <= edgeTolerance) {
      const intrusion = Math.max(bodyHalfH, Math.abs(anchors.value[1])) + 2;
      innerYMin = Math.max(innerYMin, yMin + intrusion);
    }
    if (Math.abs(comp.y - yMax) <= edgeTolerance) {
      const intrusion = Math.max(bodyHalfH, Math.abs(anchors.reference[1])) + 2;
      innerYMax = Math.min(innerYMax, yMax - intrusion);
    }
    if (Math.abs(comp.x - xMin) <= edgeTolerance) {
      const intrusion = Math.max(bodyHalfW, Math.abs(anchors.value[0])) + 2;
      innerXMin = Math.max(innerXMin, xMin + intrusion);
    }
    if (Math.abs(comp.x - xMax) <= edgeTolerance) {
      const intrusion = Math.max(bodyHalfW, Math.abs(anchors.reference[0])) + 2;
      innerXMax = Math.min(innerXMax, xMax - intrusion);
    }
  }

  // Safe clearance radius: R = clamp(12, min(halfW, halfH) - 14, 24)
  const halfW = (xMax - xMin) / 2;
  const halfH = (yMax - yMin) / 2;
  const clearance = Math.min(halfW, halfH) - 14;
  let radius = Math.max(12, Math.min(24, clearance));
  // The bbox-derived radius above only guarantees containment within the
  // rectangular window, not within a concave perimeter — re-clamp to the
  // re-anchored center's true distance to the nearest edge of the face.
  if (concaveFace) {
    const perimeterClearance = points.reduce((closest, point, index) => Math.min(closest, pointToSegmentDistance([cx, cy], point, points[(index + 1) % points.length])), Number.POSITIVE_INFINITY);
    radius = Math.max(8, Math.min(radius, perimeterClearance * 0.7));
  }

  return {
    center: [cx, cy],
    radius,
    innerBounds: { xMin: innerXMin, xMax: innerXMax, yMin: innerYMin, yMax: innerYMax },
  };
}

/**
 * Calculates the bounding-box midpoint and collision-proof safe radius for mesh current loops.
 * Avoids vertex averaging which skews heavily towards branches with higher node density.
 */
export function calculateMeshLoopBounds(meshNodes: Array<{ x: number; y: number } | [number, number]>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  R: number;
} {
  const normalized = meshNodes.map((n: any) => ({
    x: Array.isArray(n) ? n[0] : (typeof n?.x === 'number' ? n.x : 0),
    y: Array.isArray(n) ? n[1] : (typeof n?.y === 'number' ? n.y : 0),
  }));

  if (normalized.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0, width: 0, height: 0, R: 15 };
  }

  // Find the absolute limits of the specific mesh loop
  const minX = Math.min(...normalized.map(n => n.x));
  const maxX = Math.max(...normalized.map(n => n.x));
  const minY = Math.min(...normalized.map(n => n.y));
  const maxY = Math.max(...normalized.map(n => n.y));

  // The visual center is exactly in the middle of the extremes (Bounding Box Midpoint, NOT Average)
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Calculate a Collision-Proof Safe Radius:
  const width = maxX - minX;
  const height = maxY - minY;

  // Radius must be proportional to the empty space.
  // 25% of the shortest side guarantees it will never touch the boundary wires.
  // Clamp it between a readable minimum (15px) and a clean maximum (35px).
  const R = Math.max(15, Math.min(35, Math.min(width, height) * 0.25));

  return { minX, maxX, minY, maxY, cx, cy, width, height, R };
}

export interface TabDJunctionResult {
  point: Point;
  degree: number;
  isJunction: boolean;
}

const pointKey = ([x, y]: Point, eps = 1e-3) => `${Math.round(x / eps)}:${Math.round(y / eps)}`;

/**
 * Resolves the nodal voltage marker (V_k) anchor position.
 * For each resolved electrical node, identifies coordinate vertices on the 25px grid
 * where 3 or more wire/pin segments intersect (degree >= 3).
 * If no vertex has degree >= 3 (simple 2-terminal branch), anchors at the primary
 * connecting wire midpoint rather than touching the resistor body.
 */
export function resolveTabDNodeJunction(
  wireSegments: Array<{ from: Point; to: Point }>,
  connectingWires: CircuitWire[] = [],
  fallbackTerminals: Point[] = [],
): TabDJunctionResult {
  const degreeMap = new Map<string, { point: Point; count: number }>();

  for (const segment of wireSegments) {
    for (const pt of [segment.from, segment.to]) {
      const key = pointKey(pt);
      const entry = degreeMap.get(key) ?? { point: pt, count: 0 };
      entry.count += 1;
      degreeMap.set(key, entry);
    }
  }

  const junctionCandidates = Array.from(degreeMap.values()).filter((item) => item.count >= 3);

  if (junctionCandidates.length > 0) {
    // Sort: highest degree first, then deterministic spatial ordering
    junctionCandidates.sort((a, b) => b.count - a.count || a.point[0] - b.point[0] || a.point[1] - b.point[1]);
    return {
      point: junctionCandidates[0].point,
      degree: junctionCandidates[0].count,
      isJunction: true,
    };
  }

  // Fallback for simple 2-terminal branch (degree < 3): anchor at primary connecting wire midpoint
  if (connectingWires.length > 0) {
    // Select the primary (longest) connecting wire on this net
    const sortedWires = [...connectingWires].sort((a, b) => {
      const lenA = a.path.reduce((acc, p, i) => i === 0 ? 0 : acc + Math.hypot(p[0] - a.path[i - 1][0], p[1] - a.path[i - 1][1]), 0);
      const lenB = b.path.reduce((acc, p, i) => i === 0 ? 0 : acc + Math.hypot(p[0] - b.path[i - 1][0], p[1] - b.path[i - 1][1]), 0);
      return lenB - lenA;
    });

    const primaryWire = sortedWires[0];
    if (primaryWire.path.length >= 2) {
      // Find midpoint along wire polyline
      const totalLen = primaryWire.path.reduce((acc, p, i) => i === 0 ? 0 : acc + Math.hypot(p[0] - primaryWire.path[i - 1][0], p[1] - primaryWire.path[i - 1][1]), 0);
      const targetDist = totalLen / 2;
      let accumulated = 0;

      for (let i = 1; i < primaryWire.path.length; i += 1) {
        const segLen = Math.hypot(primaryWire.path[i][0] - primaryWire.path[i - 1][0], primaryWire.path[i][1] - primaryWire.path[i - 1][1]);
        if (accumulated + segLen >= targetDist || i === primaryWire.path.length - 1) {
          const t = segLen > 0 ? (targetDist - accumulated) / segLen : 0.5;
          const midX = primaryWire.path[i - 1][0] + t * (primaryWire.path[i][0] - primaryWire.path[i - 1][0]);
          const midY = primaryWire.path[i - 1][1] + t * (primaryWire.path[i][1] - primaryWire.path[i - 1][1]);
          return {
            point: [Math.round(midX), Math.round(midY)],
            degree: 2,
            isJunction: false,
          };
        }
        accumulated += segLen;
      }
    }
  }

  if (fallbackTerminals.length >= 2) {
    const midX = (fallbackTerminals[0][0] + fallbackTerminals[1][0]) / 2;
    const midY = (fallbackTerminals[0][1] + fallbackTerminals[1][1]) / 2;
    return {
      point: [Math.round(midX), Math.round(midY)],
      degree: 2,
      isJunction: false,
    };
  }

  if (fallbackTerminals.length === 1) {
    return { point: fallbackTerminals[0], degree: 1, isJunction: false };
  }

  return { point: [0, 0], degree: 0, isJunction: false };
}

export function tabDComponentLabelAnchors(
  componentType: string,
  terminalsAreHorizontal: boolean,
  halfWidth: number,
  halfHeight: number,
): { reference: Point; value: Point; refTextAnchor?: 'start' | 'middle' | 'end'; valTextAnchor?: 'start' | 'middle' | 'end' } {
  const CIRCULAR_SOURCES = new Set(['dc-voltage', 'ac-voltage', 'dc-current', 'ac-current', 'voltmeter', 'ammeter', 'lamp', 'motor-dc', 'motor-3phase', 'three-phase-source']);
  const CONTROLLED_SOURCES = new Set(['vccs', 'vcvs', 'cccs', 'ccvs']);

  const PASSIVE_SLIM = new Set(['resistor', 'potentiometer', 'inductor', 'impedance']);
  const DIODE_FAMILY = new Set(['diode', 'diode-ideal', 'diode-silicon', 'diode-germanium', 'diode-gaas', 'zener', 'led', 'photodiode']);

  if (componentType === 'ground') {
    return { reference: [0, 30], value: [0, 42], refTextAnchor: 'middle', valTextAnchor: 'middle' };
  }

  if (componentType === 'three-phase-rail') {
    return { reference: [60, -12], value: [60, 8], refTextAnchor: 'start', valTextAnchor: 'start' };
  }

  let bodyHalfW = Math.max(10, halfWidth);
  let bodyHalfH = Math.max(10, halfHeight);
  let padding = 6;
  let yShift = 0;

  // Hardcode actual visual boundaries to ignore long wire extensions
  if (CIRCULAR_SOURCES.has(componentType)) {
    bodyHalfW = 33; bodyHalfH = 33; padding = 4;
  } else if (CONTROLLED_SOURCES.has(componentType)) {
    bodyHalfW = 18; bodyHalfH = 18; padding = 4;
  } else if (PASSIVE_SLIM.has(componentType)) {
    bodyHalfW = terminalsAreHorizontal ? Math.max(10, halfWidth) : 11;
    bodyHalfH = 10;
    padding = terminalsAreHorizontal ? 6 : 5;
  } else if (componentType === 'capacitor') {
    bodyHalfW = terminalsAreHorizontal ? Math.max(10, halfWidth) : 15;
    bodyHalfH = 15;
    padding = terminalsAreHorizontal ? 6 : 5;
  } else if (DIODE_FAMILY.has(componentType)) {
    bodyHalfW = terminalsAreHorizontal ? Math.max(10, halfWidth) : 12;
    bodyHalfH = 9;
    padding = 5;
  } else if (componentType.startsWith('transformer') || componentType === 'autotransformer') {
    bodyHalfW = 20; bodyHalfH = 50; padding = 6; // Connectors reach ±50, labels sit cleanly outside
  } else if (['relay-spst', 'relay-spdt', 'relay-dpst'].includes(componentType)) {
    bodyHalfW = 35; bodyHalfH = 35; padding = 6; // Tight to dashed box
  } else if (componentType === 'contactor') {
    bodyHalfW = 35; bodyHalfH = 75; padding = 4;
    yShift = 12.5; // Centers around rect [-35, -60, 70, 145] which spans y from -60 to +85 (center = +12.5)
  } else if (['fuse-3phase', 'circuit-breaker-3phase', 'aux-contact-3phase'].includes(componentType)) {
    bodyHalfW = 20; bodyHalfH = 35; padding = 4; // Tight to 3-phase lines
  } else if (componentType === 'sw-dpst') {
    bodyHalfW = 25; bodyHalfH = 25; padding = 12; // Retain user-approved spacing
  } else if (['sw-spst-no', 'sw-spst-nc', 'pb-no', 'pb-nc', 'fuse', 'circuit-breaker', 'aux-contact-no', 'aux-contact-nc'].includes(componentType)) {
    bodyHalfW = 20; bodyHalfH = 12; padding = 4;
  } else if (['sw-spdt', 'sw-dpdt'].includes(componentType)) {
    bodyHalfW = 25; bodyHalfH = componentType === 'sw-spdt' ? 12.5 : 37.5; padding = 6;
    yShift = 12.5; // Offset to match the shifted asymmetrical center
  } else if (componentType === 'opamp') {
    bodyHalfW = 25; bodyHalfH = 25;
  } else if (componentType === 'scr') {
    bodyHalfW = 16; bodyHalfH = 20; padding = 6;
  }

  if (CIRCULAR_SOURCES.has(componentType) || CONTROLLED_SOURCES.has(componentType)) {
    if (!terminalsAreHorizontal) {
      const offsetX = Math.round(bodyHalfW + padding);
      return { reference: [-offsetX, yShift], value: [offsetX, yShift], refTextAnchor: 'end', valTextAnchor: 'start' };
    } else {
      const offsetY = Math.round(bodyHalfH + padding);
      return { reference: [0, -offsetY + yShift], value: [0, offsetY + yShift], refTextAnchor: 'middle', valTextAnchor: 'middle' };
    }
  }

  if (terminalsAreHorizontal) {
    const offsetY = Math.round(bodyHalfH + padding);
    return { reference: [0, -offsetY + yShift], value: [0, offsetY + yShift], refTextAnchor: 'middle', valTextAnchor: 'middle' };
  }

  const offsetX = Math.round(bodyHalfW + padding);
  return { reference: [offsetX, -6 + yShift], value: [offsetX, 10 + yShift], refTextAnchor: 'start', valTextAnchor: 'start' };
}

/**
 * Exact logical terminal connection anchors for CAD-designed analog components.
 * Guarantees zero offset with visual port extremities.
 */
export const EXACT_ANALOG_TERMINAL_OFFSETS: Record<string, Record<string, Point>> = {
  'opamp': { 'in-': [-50, -25], 'in+': [-50, 25], 'out': [50, 0] },
  'op-amp': { 'in-': [-50, -25], 'in+': [-50, 25], 'out': [50, 0] },
  'scr': { 'anode': [0, -25], 'cathode': [0, 25], 'gate': [-25, 25] },
  'diac': { 'a1': [0, -25], 'a2': [0, 25] },
  'triac': { 't1': [0, -25], 't2': [0, 25], 'gate': [-25, 25] },
  'bjt-npn': { 'base': [-25, 0], 'collector': [25, -25], 'emitter': [25, 25] },
  'bjt-pnp': { 'base': [-25, 0], 'collector': [25, -25], 'emitter': [25, 25] },
  'mosfet-n': { 'gate': [-25, 0], 'drain': [25, -25], 'source': [25, 25] },
  'mosfet-p': { 'gate': [-25, 0], 'drain': [25, -25], 'source': [25, 25] },
  'jfet-n': { 'gate': [-25, 0], 'drain': [25, -25], 'source': [25, 25] },
  'jfet-p': { 'gate': [-25, 0], 'drain': [25, -25], 'source': [25, 25] },
  // Universal Circular Components (All mapped to precise grid extremities)
  'dc-voltage': { 'pos': [0, -50], 'neg': [0, 50] },
  'ac-voltage': { 'pos': [0, -50], 'neg': [0, 50] },
  'dc-current': { 'pos': [0, -50], 'neg': [0, 50] },
  'ac-current': { 'pos': [0, -50], 'neg': [0, 50] },
  'voltmeter': { 'pos': [-50, 0], 'neg': [50, 0] },
  'ammeter': { 'pos': [-50, 0], 'neg': [50, 0] },
  'lamp': { 'a': [-50, 0], 'b': [50, 0] },
  'motor-dc': { 'pos': [-50, 0], 'neg': [50, 0] },
  'motor-3phase': { 'u': [-50, -25], 'v': [-50, 0], 'w': [-50, 25], 'pe': [50, 0] },
  // Transformers
  'transformer': { 'p1': [-50, -50], 'p2': [-50, 50], 's1': [50, -50], 's2': [50, 50] },
  'transformer-ct': { 'p1': [-50, -50], 'p2': [-50, 50], 's1': [50, -50], 'ct': [50, 0], 's2': [50, 50] },
  'autotransformer': { 'in1': [-50, -50], 'in2': [-50, 50], 'tap': [50, 0], 'out1': [50, -50], 'out2': [50, 50] },
  'oscilloscope': { 'ch1': [-75, -50], 'ch2': [-75, -25], 'ch3': [-75, 0], 'ch4': [-75, 25], 'gnd': [75, 25] },
  'dmm': { 'hi': [-25, 50], 'com': [25, 50] },
  'three-phase-source': { 'l1': [50, -25], 'l2': [50, 0], 'l3': [50, 25], 'n': [-50, 0] },
  'three-phase-rail': { 'l1': [50, -100 / 3], 'l2': [50, -50 / 3], 'l3': [50, 0], 'n': [50, 50 / 3] },
  // Universal Switches & Relays
  'sw-spst-no': { 'a': [-25, 0], 'b': [25, 0] },
  'sw-spst-nc': { 'a': [-25, 0], 'b': [25, 0] },
  'aux-contact-no': { 'a': [-25, 0], 'b': [25, 0] },
  'aux-contact-nc': { 'a': [-25, 0], 'b': [25, 0] },
  'aux-contact-3phase': { 'l1': [-50, -25], 't1': [50, -25], 'l2': [-50, 0], 't2': [50, 0], 'l3': [-50, 25], 't3': [50, 25] },
  'pb-no': { 'a': [-25, 0], 'b': [25, 0] },
  'pb-nc': { 'a': [-25, 0], 'b': [25, 0] },
  'sw-spdt': { 'common': [-25, 0], 'a': [25, 0], 'b': [25, 25] },
  'sw-dpst': { 'a1': [-25, -25], 'b1': [25, -25], 'a2': [-25, 0], 'b2': [25, 0] },
  'sw-dpdt': { 'c1': [-25, -25], 'a1': [25, -25], 'b1': [25, 0], 'c2': [-25, 25], 'a2': [25, 25], 'b2': [25, 50] },
  // Universal Protection & Classic Control
  'coil': { 'pos': [-50, 0], 'neg': [50, 0] },
  'fuse': { 'a': [-50, 0], 'b': [50, 0] },
  'fuse-3phase': { 'l1': [-50, -25], 't1': [50, -25], 'l2': [-50, 0], 't2': [50, 0], 'l3': [-50, 25], 't3': [50, 25] },
  'circuit-breaker': { 'a': [-50, 0], 'b': [50, 0] },
  'circuit-breaker-3phase': { 'l1': [-50, -25], 't1': [50, -25], 'l2': [-50, 0], 't2': [50, 0], 'l3': [-50, 25], 't3': [50, 25] },
  'relay-spst': { 'coil+': [-50, -25], 'coil-': [50, -25], 'com': [-50, 25], 'no': [50, 25] },
  'relay-spdt': { 'coil+': [-50, -25], 'coil-': [50, -25], 'com': [-50, 0], 'nc': [50, 0], 'no': [50, 25] },
  'relay-dpst': { 'coil+': [-50, -25], 'coil-': [50, -25], 'c1': [-50, 0], 'no1': [50, 0], 'c2': [-50, 25], 'no2': [50, 25] },
  'contactor': {
    'coil+': [-50, -50], 'coil-': [50, -50],
    'l1': [-50, -25], 't1': [50, -25],
    'l2': [-50, 0], 't2': [50, 0],
    'l3': [-50, 25], 't3': [50, 25],
    'aux-no-a': [-50, 50], 'aux-no-b': [50, 50],
    'aux-nc-a': [-50, 75], 'aux-nc-b': [50, 75]
  },
};

export const EXACT_CAD_COMPONENTS = new Set<string>([
  'dmm', 'opamp', 'op-amp', 'diac', 'triac', 'scr', 'bjt-npn', 'bjt-pnp', 'mosfet-n', 'mosfet-p', 'jfet-n', 'jfet-p',
  'dc-voltage', 'ac-voltage', 'dc-current', 'ac-current',
  'voltmeter', 'ammeter', 'lamp', 'motor-dc', 'motor-3phase', 'three-phase-source', 'three-phase-rail',
  'sw-spst-no', 'sw-spst-nc', 'pb-no', 'pb-nc', 'sw-spdt', 'sw-dpst', 'sw-dpdt',
  'coil', 'aux-contact-no', 'aux-contact-nc', 'aux-contact-3phase',
  'fuse', 'fuse-3phase', 'circuit-breaker', 'circuit-breaker-3phase',
  'relay-spst', 'relay-spdt', 'relay-dpst', 'contactor',
  'transformer', 'transformer-ct', 'autotransformer', 'oscilloscope'
]);

export function isExactCadComponent(type: string): boolean {
  return EXACT_CAD_COMPONENTS.has(type);
}

export function getExactTerminalOffset(componentType: string, terminalId: string): Point | null {
  return EXACT_ANALOG_TERMINAL_OFFSETS[componentType]?.[terminalId] ?? null;
}

