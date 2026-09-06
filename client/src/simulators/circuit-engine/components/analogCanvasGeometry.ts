import { simplifyOrthogonalPath, snapPointToGrid, type Point } from '@/simulators/circuit-engine/models/wiring';
import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';

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
 * Strict Single-Bend Orthogonal Path:
 * - When connecting two points (x1, y1) and (x2, y2) where Δx ≠ 0 and Δy ≠ 0:
 *   * Default strictly to an L-shape with exactly one 90° corner:
 *     - Route Option H (Horizontal first): [x1, y1] → [x2, y1] → [x2, y2]
 *     - Route Option V (Vertical first): [x1, y1] → [x1, y2] → [x2, y2]
 *   * Choose between Route Option H and Route Option V based strictly on terminal exit orientation
 *     or pull direction. Zero diagonal segments.
 */
export function tabDTerminalOrthogonalPath(
  from: Point,
  to: Point,
  fromAxis?: TabDTerminalAxis,
  toAxis?: TabDTerminalAxis,
  _gridSize?: number,
  lockedCorners: Point[] = [],
  _obstacles: ObstacleBox[] = [],
): Point[] {
  if (lockedCorners.length) return tabDOrthogonalDraftPath(from, to, lockedCorners, fromAxis);
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

  // True interior geometric center of the bounding window
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;

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
  const radius = Math.max(12, Math.min(24, clearance));

  return {
    center: [cx, cy],
    radius,
    innerBounds: { xMin: innerXMin, xMax: innerXMax, yMin: innerYMin, yMax: innerYMax },
  };
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

/**
 * Resolves component label positions with exact distance verification.
 * For horizontal elements: Reference at (0, -18), Value at (0, 22) with text-anchor="middle".
 * For vertical elements: Reference at (26, -6), Value at (26, 12) with text-anchor="start".
 */
export function tabDComponentLabelAnchors(
  componentType: string,
  terminalsAreHorizontal: boolean,
  halfWidth: number,
  halfHeight: number,
): { reference: Point; value: Point } {
  if (componentType === 'dc-rail') {
    return { reference: [0, -22], value: [32, -10] };
  }
  if (componentType === 'three-phase-source') {
    return { reference: [0, -39], value: [0, 39] };
  }
  if (componentType === 'dmm') {
    return { reference: [0, -65], value: [0, 65] };
  }
  if (componentType === 'three-phase-rail') {
    return { reference: [0, -57], value: [0, 57] };
  }
  if (componentType === 'potentiometer') {
    return { reference: [14, -24], value: [0, 18] };
  }
  if (componentType === 'opamp') {
    return { reference: [0, -35], value: [0, 35] };
  }
  if (['bjt-npn', 'bjt-pnp', 'mosfet-n', 'mosfet-p', 'jfet-n', 'jfet-p'].includes(componentType)) {
    return { reference: [0, -32], value: [0, 36] };
  }
  if (terminalsAreHorizontal) {
    return { reference: [0, -18], value: [0, 22] };
  }
  return { reference: [26, -6], value: [26, 12] };
}

/**
 * Exact logical terminal connection anchors for CAD-designed analog components.
 * Guarantees zero offset with visual port extremities.
 */
export const EXACT_ANALOG_TERMINAL_OFFSETS: Record<string, Record<string, Point>> = {
  'opamp': {
    'in+': [-35, -20],
    'in-': [-35, 20],
    'out': [35, 0],
  },
  'three-phase-source': {
    'n': [-36, 0],
    'l1': [31, -25],
    'l2': [30, 0],
    'l3': [31, 25],
  },
  'bjt-npn': {
    'base': [-25, 0],
    'collector': [20, -26],
    'emitter': [20, 26],
  },
  'bjt-pnp': {
    'base': [-25, 0],
    'collector': [20, -26],
    'emitter': [20, 26],
  },
  'mosfet-n': {
    'gate': [-22, 0],
    'drain': [25, -22],
    'source': [25, 20],
  },
  'mosfet-p': {
    'gate': [-22, 0],
    'drain': [25, -22],
    'source': [25, 20],
  },
  'jfet-n': {
    'gate': [-25, 0],
    'drain': [20, -22],
    'source': [20, 20],
  },
  'jfet-p': {
    'gate': [-25, 0],
    'drain': [20, -22],
    'source': [20, 20],
  },
};

export const EXACT_CAD_COMPONENTS = new Set<string>([
  'dmm',
  'opamp',
  'three-phase-source',
  'bjt-npn',
  'bjt-pnp',
  'mosfet-n',
  'mosfet-p',
  'jfet-n',
  'jfet-p',
]);

export function isExactCadComponent(type: string): boolean {
  return EXACT_CAD_COMPONENTS.has(type);
}

export function getExactTerminalOffset(componentType: string, terminalId: string): Point | null {
  return EXACT_ANALOG_TERMINAL_OFFSETS[componentType]?.[terminalId] ?? null;
}

