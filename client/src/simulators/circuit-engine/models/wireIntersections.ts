/**
 * Wire Intersection Engine — Phase 2: Advanced SVG Rendering with Cross-Net Bridges and Junction Dots
 *
 * Decomposes all wires into orthogonal segments, detects crossing points,
 * and classifies each crossing as:
 *   - Same-net (or T/Cross-junctions) → junction dot (physical soldered joint, radius 3)
 *   - Cross-net → jump arc on the horizontal wire (radius 4 bridge, '... L cx-4 cy A 4 4 0 0 1 cx+4 cy L ...')
 *
 * Supports continuous SVG path generation from waypoints and graceful fallback
 * for legacy wires without waypoints.
 */

import type { CircuitWire } from '@shared/circuit/circuitTypes';
import type { Point } from '@/simulators/circuit-engine/models/wiring';
import { pointsToPath } from '@/simulators/circuit-engine/models/wiring';

// ---------------------------------------------------------------------------
// Types & Aliases
// ---------------------------------------------------------------------------

export type Wire = CircuitWire;
export type Waypoint = Point | { x: number; y: number };

export interface Segment {
  wireId: string;
  netId: string;
  /** true = horizontal (dy === 0), false = vertical (dx === 0) */
  isHorizontal: boolean;
  // Canonical ordering: x1 ≤ x2 for H-segs, y1 ≤ y2 for V-segs
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WireIntersection {
  /** World X of the crossing point */
  x: number;
  /** World Y of the crossing point */
  y: number;
  /** ID of the wire whose segment is horizontal at this crossing */
  hWireId: string;
  /** ID of the wire whose segment is vertical at this crossing */
  vWireId: string;
  /**
   * true  → both wires belong to the same electrical net → junction dot.
   * false → different nets → jump arc on the horizontal wire.
   */
  sameNet: boolean;
}

// ---------------------------------------------------------------------------
// Step 1: Waypoint-to-SVG Path Generator & Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a Waypoint (Point tuple [x, y] or object {x, y}) into a [number, number] tuple.
 */
export function waypointToCoord(wp: Waypoint): [number, number] {
  if (Array.isArray(wp)) {
    return [wp[0], wp[1]];
  }
  return [wp.x, wp.y];
}

/**
 * Maps an array of waypoints into a continuous SVG path string:
 * `M ${wp[0].x} ${wp[0].y} L ${wp[1].x} ${wp[1].y} L ${wp[2].x} ...`
 */
export function waypointsToPath(waypoints: Waypoint[]): string {
  if (!waypoints || waypoints.length === 0) return '';
  const coords = waypoints.map(waypointToCoord);
  const [first, ...rest] = coords;
  if (rest.length === 0) return `M ${first[0]} ${first[1]}`;
  return `M ${first[0]} ${first[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ');
}

/**
 * Retrieves the sequence of points representing a wire.
 * Falls back gracefully to straight lines for legacy wires without waypoints.
 */
export function getWirePoints(wire: CircuitWire): Point[] {
  if (wire.path && wire.path.length >= 2) {
    return wire.path.map(p => (Array.isArray(p) ? [p[0], p[1]] : [(p as any).x, (p as any).y]));
  }
  if (wire.waypoints && wire.waypoints.length >= 2) {
    return wire.waypoints.map(p => (Array.isArray(p) ? [p[0], p[1]] : [(p as any).x, (p as any).y]));
  }
  if (wire.path && wire.path.length > 0) {
    return wire.path.map(p => (Array.isArray(p) ? [p[0], p[1]] : [(p as any).x, (p as any).y]));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Step 2: Global Intersection Detection (The Sweep)
// ---------------------------------------------------------------------------

/**
 * Decomposes a wire's path into canonical axis-aligned segments.
 */
export function toSegments(wire: CircuitWire, netId: string): Segment[] {
  const segs: Segment[] = [];
  const pts = getWirePoints(wire);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];

    const dx = bx - ax;
    const dy = by - ay;

    // Skip zero-length degenerate segments
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) continue;

    const isHorizontal = Math.abs(dy) < Math.abs(dx) || Math.abs(dy) < 1e-4;

    if (isHorizontal) {
      // Canonical: x1 ≤ x2
      segs.push({
        wireId: wire.id,
        netId,
        isHorizontal: true,
        x1: Math.min(ax, bx),
        y1: ay,
        x2: Math.max(ax, bx),
        y2: ay,
      });
    } else {
      // Canonical: y1 ≤ y2
      segs.push({
        wireId: wire.id,
        netId,
        isHorizontal: false,
        x1: ax,
        y1: Math.min(ay, by),
        x2: ax,
        y2: Math.max(ay, by),
      });
    }
  }
  return segs;
}

/**
 * Calculates all intersections between horizontal and vertical wire segments.
 *
 * Checks every horizontal segment against every vertical segment to find intersection points (x, y).
 * For each intersection, determines if the colliding segments belong to the same net
 * (electrically connected) or different nets (isolated wires crossing over each other).
 *
 * @param allWires All placed CircuitWires in the circuit.
 * @param netOf    Optional callback to resolve a wire's electrical net ID.
 */
export function calculateWireIntersections(
  allWires: CircuitWire[],
  netOf?: (wire: CircuitWire) => string,
): WireIntersection[] {
  if (allWires.length < 1) return [];

  // Default net resolver: uses wire's explicit netId/net or terminal connection
  const getNet =
    netOf ??
    ((w: CircuitWire) =>
      (w as any).netId ?? (w as any).net ?? w.junctionWireId ?? `${w.fromComp}:${w.fromTerm}`);

  // Decompose every wire into canonical segments
  const hSegs: Segment[] = [];
  const vSegs: Segment[] = [];

  for (const wire of allWires) {
    const netId = getNet(wire);
    const segs = toSegments(wire, netId);
    for (const seg of segs) {
      if (seg.isHorizontal) hSegs.push(seg);
      else vSegs.push(seg);
    }
  }

  const intersections: WireIntersection[] = [];

  for (const h of hSegs) {
    for (const v of vSegs) {
      // H-segment: y = h.y1, x ∈ [h.x1, h.x2]
      // V-segment: x = v.x1, y ∈ [v.y1, v.y2]
      const cx = v.x1;
      const cy = h.y1;

      // Check if crossing point is within both bounding spans
      const onH = cx >= h.x1 && cx <= h.x2;
      const onV = cy >= v.y1 && cy <= v.y2;
      if (!onH || !onV) continue;

      // Same wire: skip internal 90° elbow corners
      if (h.wireId === v.wireId) {
        const isHEnd = Math.abs(cx - h.x1) < 1e-4 || Math.abs(cx - h.x2) < 1e-4;
        const isVEnd = Math.abs(cy - v.y1) < 1e-4 || Math.abs(cy - v.y2) < 1e-4;
        if (isHEnd && isVEnd) continue;
      }

      const sameNet = h.netId === v.netId;

      if (!sameNet) {
        // Cross-net: Horizontal segment must strictly cross over Vertical segment
        // (Interior of H-segment so the arc can cleanly jump over V-segment)
        if (cx > h.x1 && cx < h.x2 && cy >= v.y1 && cy <= v.y2) {
          intersections.push({
            x: cx,
            y: cy,
            hWireId: h.wireId,
            vWireId: v.wireId,
            sameNet: false,
          });
        }
      } else {
        // Same net: physical electrical connection (T-junction or Cross-junction)
        intersections.push({
          x: cx,
          y: cy,
          hWireId: h.wireId,
          vWireId: v.wireId,
          sameNet: true,
        });
      }
    }
  }

  return intersections;
}

// ---------------------------------------------------------------------------
// Step 3: Draw Cross-Net Bridges (Jump Arcs)
// ---------------------------------------------------------------------------

/**
 * Builds the SVG `d` attribute for a wire, splicing in jump-arc semicircles
 * at every crossing where this wire's segment is **horizontal** and
 * the crossing belongs to a **different net** (`sameNet === false`).
 *
 * Format: `... L ${cx - 4} ${cy} A 4 4 0 0 1 ${cx + 4} ${cy} L ...`
 * (Where 4 is the radius of the bridge).
 *
 * @param path           The wire's Point[] path.
 * @param intersections  Full intersection list from calculateWireIntersections.
 * @param wireId         The ID of the wire being rendered.
 * @param arcRadius      Bridge arc radius in px (default 4).
 */
export function buildJumpArcPath(
  path: Point[],
  intersections: WireIntersection[],
  wireId: string,
  arcRadius = 4,
): string {
  if (path.length < 2) return pointsToPath(path);

  // Collect all cross-net crossings where THIS wire is the horizontal one
  const myCrossings = intersections.filter(
    ix => ix.hWireId === wireId && !ix.sameNet,
  );

  if (myCrossings.length === 0) return pointsToPath(path);

  // Build the d-string segment by segment, injecting arcs where needed
  const parts: string[] = [`M ${path[0][0]} ${path[0][1]}`];

  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];

    // Only horizontal segments carry arcs
    const isH = Math.abs(ay - by) < 1e-4;

    if (!isH) {
      // Vertical (or diagonal) segment — emit straight
      parts.push(`L ${bx} ${by}`);
      continue;
    }

    // Find all crossings on this horizontal segment, sorted along draw direction
    const xMin = Math.min(ax, bx);
    const xMax = Math.max(ax, bx);
    const segCrossings = myCrossings
      .filter(ix => Math.abs(ix.y - ay) < 1e-4 && ix.x > xMin && ix.x < xMax)
      .sort((a, b) => (ax <= bx ? a.x - b.x : b.x - a.x));

    if (segCrossings.length === 0) {
      parts.push(`L ${bx} ${by}`);
      continue;
    }

    // Walk along the segment, breaking at each crossing to insert an arc
    for (const ix of segCrossings) {
      const r = arcRadius;
      const enterX = ix.x - r;
      const exitX = ix.x + r;

      if (ax <= bx) {
        // Left-to-right:
        // L ${cx - 4} ${cy} A 4 4 0 0 1 ${cx + 4} ${cy}
        parts.push(`L ${enterX} ${ay}`);
        parts.push(`A ${r} ${r} 0 0 1 ${exitX} ${ay}`);
      } else {
        // Right-to-left:
        // L ${cx + 4} ${cy} A 4 4 0 0 0 ${cx - 4} ${cy}
        parts.push(`L ${exitX} ${ay}`);
        parts.push(`A ${r} ${r} 0 0 0 ${enterX} ${ay}`);
      }
    }
    // Remainder of segment after the last arc
    parts.push(`L ${bx} ${by}`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Step 4: Draw Junction Dots (Physical Nodes)
// ---------------------------------------------------------------------------

/**
 * Returns the unique list of world-space coordinates that should receive a
 * junction dot (radius 3, physical node).
 *
 * A junction dot is drawn when:
 * 1. An intersection occurs between segments of the same net (`sameNet === true`).
 * 2. Three or four segments share the exact same coordinate (T-junctions / Cross-junctions).
 * 3. Wires explicitly terminate at a junction (`wire.junctionPoint` or `junc_` terminal).
 *
 * No bridges/arcs are drawn for same-net intersections.
 */
export function junctionDotPositions(
  intersections: WireIntersection[],
  wires?: CircuitWire[],
  netOf?: (wire: CircuitWire) => string,
): Point[] {
  const seen = new Set<string>();
  const result: Point[] = [];

  const addDot = (x: number, y: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const key = `${rx},${ry}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push([rx, ry]);
    }
  };

  // 1. All same-net intersections from the H×V sweep
  for (const ix of intersections) {
    if (ix.sameNet) {
      addDot(ix.x, ix.y);
    }
  }

  // 2. Explicit junction points and multi-wire shared coordinates
  if (wires) {
    for (const wire of wires) {
      if (wire.junctionPoint) {
        addDot(wire.junctionPoint[0], wire.junctionPoint[1]);
      }
      if (wire.toComp.startsWith('junc_') && wire.path && wire.path.length > 0) {
        const last = wire.path[wire.path.length - 1];
        addDot(last[0], last[1]);
      }
      if (wire.fromComp.startsWith('junc_') && wire.path && wire.path.length > 0) {
        const first = wire.path[0];
        addDot(first[0], first[1]);
      }
    }

    // 3. Any coordinate where 3 or more segments meet on the same net (T-junctions / Cross-junctions)
    const getNet =
      netOf ??
      ((w: CircuitWire) =>
        (w as any).netId ?? (w as any).net ?? w.junctionWireId ?? `${w.fromComp}:${w.fromTerm}`);

    const pointBranches = new Map<string, { x: number; y: number; count: number }>();

    for (const wire of wires) {
      const netId = getNet(wire);
      const pts = getWirePoints(wire);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        if (Math.abs(x1 - x2) < 1e-4 && Math.abs(y1 - y2) < 1e-4) continue;

        const k1 = `${netId}@${Math.round(x1)},${Math.round(y1)}`;
        const k2 = `${netId}@${Math.round(x2)},${Math.round(y2)}`;

        const b1 = pointBranches.get(k1) ?? { x: x1, y: y1, count: 0 };
        b1.count += 1;
        pointBranches.set(k1, b1);

        const b2 = pointBranches.get(k2) ?? { x: x2, y: y2, count: 0 };
        b2.count += 1;
        pointBranches.set(k2, b2);
      }
    }

    pointBranches.forEach(({ x, y, count }) => {
      if (count >= 3) {
        addDot(x, y);
      }
    });
  }

  return result;
}
