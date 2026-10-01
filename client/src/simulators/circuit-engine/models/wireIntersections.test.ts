import { describe, expect, it } from 'vitest';
import type { CircuitWire } from '@shared/circuit/circuitTypes';
import {
  buildJumpArcPath,
  calculateWireIntersections,
  getWirePoints,
  junctionDotPositions,
  toSegments,
  waypointsToPath,
} from '@/simulators/circuit-engine/models/wireIntersections';

describe('Phase 2: Orthogonal Wiring Engine — SVG Rendering, Jump Arcs & Junction Dots', () => {
  // ---------------------------------------------------------------------------
  // Step 1: Waypoint-to-SVG Path Generator
  // ---------------------------------------------------------------------------
  describe('Step 1: Waypoint-to-SVG Path Generator & Legacy Fallback', () => {
    it('maps waypoints into a continuous SVG path string', () => {
      const waypoints: [number, number][] = [
        [100, 100],
        [200, 100],
        [200, 300],
      ];
      const d = waypointsToPath(waypoints);
      expect(d).toBe('M 100 100 L 200 100 L 200 300');
    });

    it('handles waypoints defined as objects with {x, y}', () => {
      const waypoints = [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 250 },
      ];
      const d = waypointsToPath(waypoints);
      expect(d).toBe('M 50 50 L 150 50 L 150 250');
    });

    it('gracefully falls back to straight lines for legacy wires without waypoints', () => {
      const legacyWire: CircuitWire = {
        id: 'w-legacy',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [
          [100, 100],
          [300, 100],
        ],
        routing: 'straight',
      };
      const pts = getWirePoints(legacyWire);
      expect(pts).toEqual([
        [100, 100],
        [300, 100],
      ]);
      const d = waypointsToPath(pts);
      expect(d).toBe('M 100 100 L 300 100');
    });

    it('extracts points from wire.waypoints if path is not provided', () => {
      const wireWithWpOnly: CircuitWire = {
        id: 'w-wp',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [],
        waypoints: [
          [10, 20],
          [100, 20],
          [100, 80],
        ],
        routing: 'orthogonal',
      };
      const pts = getWirePoints(wireWithWpOnly);
      expect(pts).toEqual([
        [10, 20],
        [100, 20],
        [100, 80],
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 2: Global Intersection Detection (The Sweep)
  // ---------------------------------------------------------------------------
  describe('Step 2: Global Intersection Detection', () => {
    it('deconstructs wires into canonical horizontal and vertical segments', () => {
      const wire: CircuitWire = {
        id: 'w1',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [
          [100, 50],
          [200, 50],
          [200, 150],
        ],
        routing: 'orthogonal',
      };
      const segs = toSegments(wire, 'net-1');
      expect(segs).toHaveLength(2);
      expect(segs[0]).toEqual({
        wireId: 'w1',
        netId: 'net-1',
        isHorizontal: true,
        x1: 100,
        y1: 50,
        x2: 200,
        y2: 50,
      });
      expect(segs[1]).toEqual({
        wireId: 'w1',
        netId: 'net-1',
        isHorizontal: false,
        x1: 200,
        y1: 50,
        x2: 200,
        y2: 150,
      });
    });

    it('detects cross-net intersections and marks sameNet as false', () => {
      // Horizontal wire on net A: (50, 100) -> (250, 100)
      const wH: CircuitWire = {
        id: 'w-h',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [
          [50, 100],
          [250, 100],
        ],
        routing: 'orthogonal',
      };
      // Vertical wire on net B: (150, 20) -> (150, 200)
      const wV: CircuitWire = {
        id: 'w-v',
        fromComp: 'c3',
        fromTerm: 't1',
        toComp: 'c4',
        toTerm: 't2',
        path: [
          [150, 20],
          [150, 200],
        ],
        routing: 'orthogonal',
      };

      const intersections = calculateWireIntersections([wH, wV], w =>
        w.id === 'w-h' ? 'net-A' : 'net-B',
      );

      expect(intersections).toHaveLength(1);
      expect(intersections[0]).toEqual({
        x: 150,
        y: 100,
        hWireId: 'w-h',
        vWireId: 'w-v',
        sameNet: false,
      });
    });

    it('detects same-net intersections and marks sameNet as true', () => {
      const wH: CircuitWire = {
        id: 'w-h',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [
          [50, 100],
          [250, 100],
        ],
        routing: 'orthogonal',
      };
      const wV: CircuitWire = {
        id: 'w-v',
        fromComp: 'c1',
        fromTerm: 't2',
        toComp: 'c3',
        toTerm: 't1',
        path: [
          [150, 20],
          [150, 200],
        ],
        routing: 'orthogonal',
      };

      const intersections = calculateWireIntersections([wH, wV], () => 'net-common');

      expect(intersections).toHaveLength(1);
      expect(intersections[0]).toEqual({
        x: 150,
        y: 100,
        hWireId: 'w-h',
        vWireId: 'w-v',
        sameNet: true,
      });
    });

    it('does not register internal 90° elbow corners of the same wire as intersections', () => {
      const singleWire: CircuitWire = {
        id: 'w-elbow',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [
          [50, 100],
          [150, 100],
          [150, 200],
        ],
        routing: 'orthogonal',
      };
      const intersections = calculateWireIntersections([singleWire]);
      expect(intersections).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3: Draw Cross-Net Bridges (Jump Arcs)
  // ---------------------------------------------------------------------------
  describe('Step 3: Cross-Net Bridges (Jump Arcs)', () => {
    it('splices a radius 4 jump arc into horizontal segment at a cross-net crossing (left-to-right)', () => {
      const path: [number, number][] = [
        [50, 100],
        [250, 100],
      ];
      const intersections = [
        {
          x: 150,
          y: 100,
          hWireId: 'w-h',
          vWireId: 'w-v',
          sameNet: false,
        },
      ];

      const svgPath = buildJumpArcPath(path, intersections, 'w-h', 4);
      // Format: ... L ${cx - 4} ${cy} A 4 4 0 0 1 ${cx + 4} ${cy} L ...
      // cx = 150, cy = 100 -> L 146 100 A 4 4 0 0 1 154 100 L 250 100
      expect(svgPath).toBe('M 50 100 L 146 100 A 4 4 0 0 1 154 100 L 250 100');
    });

    it('splices a jump arc correctly when horizontal segment is drawn right-to-left', () => {
      const path: [number, number][] = [
        [250, 100],
        [50, 100],
      ];
      const intersections = [
        {
          x: 150,
          y: 100,
          hWireId: 'w-h',
          vWireId: 'w-v',
          sameNet: false,
        },
      ];

      const svgPath = buildJumpArcPath(path, intersections, 'w-h', 4);
      // Drawing right-to-left: approaches cx from right, enters at 154 100, exits at 146 100
      expect(svgPath).toBe('M 250 100 L 154 100 A 4 4 0 0 0 146 100 L 50 100');
    });

    it('handles multiple jump arcs along the same horizontal segment', () => {
      const path: [number, number][] = [
        [0, 100],
        [300, 100],
      ];
      const intersections = [
        { x: 100, y: 100, hWireId: 'w-h', vWireId: 'v1', sameNet: false },
        { x: 200, y: 100, hWireId: 'w-h', vWireId: 'v2', sameNet: false },
      ];

      const svgPath = buildJumpArcPath(path, intersections, 'w-h', 4);
      expect(svgPath).toBe(
        'M 0 100 L 96 100 A 4 4 0 0 1 104 100 L 196 100 A 4 4 0 0 1 204 100 L 300 100',
      );
    });

    it('does NOT draw jump arcs for same-net intersections', () => {
      const path: [number, number][] = [
        [50, 100],
        [250, 100],
      ];
      const intersections = [
        {
          x: 150,
          y: 100,
          hWireId: 'w-h',
          vWireId: 'w-v',
          sameNet: true, // Same net!
        },
      ];

      const svgPath = buildJumpArcPath(path, intersections, 'w-h', 4);
      // No arc should be spliced: plain line
      expect(svgPath).toBe('M 50,100 L 250,100');
    });
  });

  // ---------------------------------------------------------------------------
  // Step 4: Draw Junction Dots (Physical Nodes)
  // ---------------------------------------------------------------------------
  describe('Step 4: Junction Dots (Physical Nodes)', () => {
    it('identifies same-net crossing coordinates as junction dots', () => {
      const intersections = [
        { x: 150, y: 100, hWireId: 'w1', vWireId: 'w2', sameNet: true },
        { x: 250, y: 100, hWireId: 'w1', vWireId: 'w3', sameNet: false }, // Cross-net: no dot
      ];

      const dots = junctionDotPositions(intersections);
      expect(dots).toEqual([[150, 100]]);
    });

    it('detects T-junctions formed by three segments meeting at a point', () => {
      // Horizontal wire running (0, 100) -> (200, 100)
      const w1: CircuitWire = {
        id: 'w1',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c2',
        toTerm: 't2',
        path: [
          [0, 100],
          [200, 100],
        ],
        routing: 'orthogonal',
      };
      // Vertical wire tapping in at (100, 100) -> (100, 200)
      const w2: CircuitWire = {
        id: 'w2',
        fromComp: 'c1',
        fromTerm: 't1',
        toComp: 'c3',
        toTerm: 't1',
        path: [
          [100, 100],
          [100, 200],
        ],
        routing: 'orthogonal',
      };

      const intersections = calculateWireIntersections([w1, w2], () => 'net-1');
      const dots = junctionDotPositions(intersections, [w1, w2], () => 'net-1');

      expect(dots).toContainEqual([100, 100]);
    });

    it('never emits junction dots for cross-net crossings', () => {
      const intersections = [
        { x: 150, y: 100, hWireId: 'w1', vWireId: 'w2', sameNet: false },
      ];
      const dots = junctionDotPositions(intersections);
      expect(dots).toHaveLength(0);
    });

    it('deduplicates coordinates so multiple wire junctions at the same point emit exactly one dot', () => {
      const intersections = [
        { x: 100, y: 100, hWireId: 'w1', vWireId: 'w2', sameNet: true },
        { x: 100, y: 100, hWireId: 'w3', vWireId: 'w2', sameNet: true },
      ];
      const dots = junctionDotPositions(intersections);
      expect(dots).toHaveLength(1);
      expect(dots[0]).toEqual([100, 100]);
    });
  });
});
