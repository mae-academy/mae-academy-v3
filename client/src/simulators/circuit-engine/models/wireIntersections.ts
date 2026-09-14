/**
 * Wire Intersection Engine — Phase 2
 *
 * Decomposes all wires into orthogonal segments, detects crossing points,
 * and classifies each crossing as same-net (→ junction dot) or cross-net
 * (→ jump arc on the horizontal wire).
 *
 * All coordinates are assumed to lie on the canvas snap grid, so integer
 * arithmetic is used throughout with no floating-point tolerance.
 */

import type { CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import type { Point } from '@/simulators/circuit-engine/models/wiring';
import { pointsToPath } from '@/simulators/circuit-engine/models/wiring';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Segment {
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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
// Step 1: decompose wire paths into canonical axis-aligned segments
// ---------------------------------------------------------------------------

function toSegments(wire: CircuitWire, netId: string): Segment[] {
  const segs: Segment[] = [];
  const pts = wire.path;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];

    const dx = bx - ax;
    const dy = by - ay;

    // Skip zero-length degenerate segments
    if (dx === 0 && dy === 0) continue;

    const isHorizontal = Math.abs(dy) < Math.abs(dx) || dy === 0;

    if (isHorizontal) {
      // Canonical: x1 ≤ x2
      segs.push({
        wireId: wire.id, netId, isHorizontal: true,
        x1: Math.min(ax, bx), y1: ay,
        x2: Math.max(ax, bx), y2: ay,
      });
    } else {
      // Canonical: y1 ≤ y2
      segs.push({
        wireId: wire.id, netId, isHorizontal: false,
        x1: ax, y1: Math.min(ay, by),
        x2: ax, y2: Math.max(ay, by),
      });
    }
  }
  return segs;
}

// ---------------------------------------------------------------------------
// Step 2: sweep H × V pairs for strict interior crossings
// ---------------------------------------------------------------------------

/**
 * Returns all crossing points between horizontal and vertical segments
 * that are strict interior crossings (not at shared endpoints).
 *
 * @param wires    All placed CircuitWires in the document.
 * @param netOf    Callback that maps a wire to its electrical net ID string.
 */
export function calculateWireIntersections(
  wires: CircuitWire[],
  netOf: (wire: CircuitWire) => string,
): WireIntersection[] {
  if (wires.length < 2) return [];

  // Decompose every wire into canonical segments
  const hSegs: Segment[] = [];
  const vSegs: Segment[] = [];

  for (const wire of wires) {
    const netId = netOf(wire);
    const segs = toSegments(wire, netId);
    for (const seg of segs) {
      if (seg.isHorizontal) hSegs.push(seg);
      else vSegs.push(seg);
    }
  }

  const intersections: WireIntersection[] = [];

  for (const h of hSegs) {
    for (const v of vSegs) {
      // A wire cannot cross itself
      if (h.wireId === v.wireId) continue;

      // H-segment:  y = h.y1,  x ∈ [h.x1, h.x2]
      // V-segment:  x = v.x1,  y ∈ [v.y1, v.y2]
      const cx = v.x1;
      const cy = h.y1;

      // Strict interior: crossing point must be INSIDE both segments
      // (not at either endpoint — endpoint meets are handled as junction dots
      //  by the existing junc_ mechanism).
      if (
        cx > h.x1 && cx < h.x2 &&   // strictly inside H-seg (not at H endpoints)
        cy > v.y1 && cy < v.y2       // strictly inside V-seg (not at V endpoints)
      ) {
        intersections.push({
          x: cx,
          y: cy,
          hWireId: h.wireId,
          vWireId: v.wireId,
          sameNet: h.netId === v.netId,
        });
      }
    }
  }

  return intersections;
}

// ---------------------------------------------------------------------------
// Step 3: build jump-arc SVG path for a single wire
// ---------------------------------------------------------------------------

/**
 * Builds the SVG `d` attribute for a wire, splicing in jump-arc semicircles
 * at every interior crossing where this wire's segment is **horizontal** and
 * the crossing belongs to a **different net** (`sameNet === false`).
 *
 * @param path           The wire's Point[] path.
 * @param intersections  Full intersection list from calculateWireIntersections.
 * @param wireId         The ID of the wire being rendered.
 * @param arcRadius      Semicircle radius in world-space px (default 5).
 */
export function buildJumpArcPath(
  path: Point[],
  intersections: WireIntersection[],
  wireId: string,
  arcRadius = 5,
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

    // Only horizontal segments can carry arcs
    const isH = ay === by;

    if (!isH) {
      // Vertical (or zero-length) segment — emit straight
      parts.push(`L ${bx} ${by}`);
      continue;
    }

    // Find all crossings on this horizontal segment, sorted left-to-right
    const xMin = Math.min(ax, bx);
    const xMax = Math.max(ax, bx);
    const segCrossings = myCrossings
      .filter(ix => ix.y === ay && ix.x > xMin && ix.x < xMax)
      .sort((a, b) => (ax <= bx ? a.x - b.x : b.x - a.x)); // preserve draw direction

    if (segCrossings.length === 0) {
      parts.push(`L ${bx} ${by}`);
      continue;
    }

    // Walk along the segment, breaking at each crossing to insert an arc
    let curX = ax;
    for (const ix of segCrossings) {
      const r = arcRadius;
      const enterX = ix.x - r;
      const exitX = ix.x + r;

      // Straight line to the left edge of the arc
      if (ax <= bx) {
        parts.push(`L ${enterX} ${ay}`);
        // Anticlockwise arc (sweep-flag=0) arcs upward (y decreases) over the crossing
        parts.push(`A ${r} ${r} 0 0 1 ${exitX} ${ay}`);
      } else {
        // Drawing right-to-left: mirror the arc
        parts.push(`L ${exitX} ${ay}`);
        parts.push(`A ${r} ${r} 0 0 0 ${enterX} ${ay}`);
      }
      curX = exitX;
    }
    // Remainder of segment after the last arc
    parts.push(`L ${bx} ${by}`);
    void curX; // used for conceptual clarity; SVG path cursor tracks automatically
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Step 4: deduplicate junction-dot positions
// ---------------------------------------------------------------------------

/**
 * Returns the unique list of world-space coordinates that should receive a
 * junction dot.  A junction dot is drawn at every interior crossing where
 * both wires belong to the **same net** (`sameNet === true`).
 *
 * Duplicates (e.g. a 4-way cross seen from 2 pairs) are collapsed to one dot.
 */
export function junctionDotPositions(intersections: WireIntersection[]): Point[] {
  const seen = new Set<string>();
  const result: Point[] = [];
  for (const ix of intersections) {
    if (!ix.sameNet) continue;
    const key = `${ix.x},${ix.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push([ix.x, ix.y]);
    }
  }
  return result;
}
