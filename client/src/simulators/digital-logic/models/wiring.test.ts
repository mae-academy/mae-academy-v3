import { describe, expect, it } from 'vitest';
import {
  enforceOrthogonal,
  insertPointIntoWirePath,
  orthogonalPath,
  pointsToPath,
  projectPointOntoWire,
  reconnectPathEndpoints,
  routePath,
  routeTJunctionPath,
  simplifyOrthogonalPath,
  type Point,
} from '@/simulators/digital-logic/models/wiring';
import {
  dynamicRubberBandPath,
  moveTabDOrthogonalLane,
  tabDOrthogonalDraftPath,
  tabDTerminalOrthogonalPath,
} from '@/simulators/digital-logic/components/digitalLogicCanvasGeometry';

describe('Digital Logic Wire Routing & Canvas Engine Port', () => {
  describe('1. Minimal Bend Orthogonal Routing', () => {
    it('routes aligned horizontal terminals as a single straight line (zero bends)', () => {
      const from: Point = [50, 100];
      const to: Point = [250, 100];
      const path = orthogonalPath(from, to, 25);
      expect(path).toEqual([[50, 100], [250, 100]]);
      expect(path.length).toBe(2);
    });

    it('routes aligned vertical terminals as a single straight line (zero bends)', () => {
      const from: Point = [150, 50];
      const to: Point = [150, 300];
      const path = orthogonalPath(from, to, 25);
      expect(path).toEqual([[150, 50], [150, 300]]);
      expect(path.length).toBe(2);
    });

    it('routes offset terminals as an L-shape with exactly one 90-degree corner', () => {
      const from: Point = [50, 50];
      const to: Point = [200, 150];
      const pathH = orthogonalPath(from, to, 25, true);
      expect(pathH).toEqual([[50, 50], [200, 50], [200, 150]]);
      expect(pathH.length).toBe(3);

      const pathV = orthogonalPath(from, to, 25, false);
      expect(pathV).toEqual([[50, 50], [50, 150], [200, 150]]);
      expect(pathV.length).toBe(3);
    });
  });

  describe('2. Collinear Simplification & Orthogonal Invariants', () => {
    it('deduplicates consecutive identical points', () => {
      const input: Point[] = [[0, 0], [0, 0], [100, 0], [100, 100], [100, 100]];
      expect(simplifyOrthogonalPath(input)).toEqual([[0, 0], [100, 0], [100, 100]]);
    });

    it('collapses redundant collinear segments into a single segment', () => {
      const input: Point[] = [
        [0, 50],
        [50, 50],
        [100, 50],
        [200, 50],
        [200, 100],
      ];
      const simplified = simplifyOrthogonalPath(input);
      expect(simplified).toEqual([[0, 50], [200, 50], [200, 100]]);
      expect(simplified.length).toBe(3);
    });

    it('enforces 90-degree rectilinear segments across non-orthogonal inputs', () => {
      const diagonal: Point[] = [[0, 0], [100, 100]];
      const rectified = enforceOrthogonal(diagonal);
      expect(rectified).toEqual([[0, 0], [100, 0], [100, 100]]);
    });
  });

  describe('3. T-Junction Wire Snapping & Projection', () => {
    it('projects a point onto an orthogonal wire segment within snap threshold', () => {
      const wirePath: Point[] = [[100, 100], [300, 100]];
      const clickPoint: Point = [200, 104];
      const proj = projectPointOntoWire(clickPoint, wirePath, 25);
      expect(proj).not.toBeNull();
      expect(proj?.axis).toBe('horizontal');
      expect(proj?.distance).toBe(4);
      expect(proj?.point).toEqual([200, 100]);
    });

    it('routes a clean perpendicular T-junction path into a horizontal wire', () => {
      const from: Point = [200, 250];
      const junction: Point = [200, 100];
      const path = routeTJunctionPath(from, junction, 'horizontal');
      expect(path).toEqual([[200, 250], [200, 100]]);
    });

    it('routes an L-shaped T-junction path when offset from the junction', () => {
      const from: Point = [50, 250];
      const junction: Point = [200, 100];
      const path = routeTJunctionPath(from, junction, 'horizontal');
      expect(path.length).toBe(3);
      expect(path[0]).toEqual([50, 250]);
      expect(path[2]).toEqual([200, 100]);
      expect(path[1][0] === 200 || path[1][1] === 100).toBe(true);
    });

    it('inserts a point into a wire path at the correct segment', () => {
      const wirePath: Point[] = [[0, 0], [100, 0], [100, 100]];
      const newPath = insertPointIntoWirePath(wirePath, [50, 0], 0);
      expect(newPath).toEqual([[0, 0], [50, 0], [100, 0], [100, 100]]);
    });
  });

  describe('4. Dynamic Rubber-Banding & Lane Moving', () => {
    it('rubber-bands an orthogonal path when moving end is dragged', () => {
      const from: Point = [100, 100];
      const to: Point = [200, 200];
      const path = dynamicRubberBandPath(from, to, 'horizontal', 'horizontal', 'to');
      expect(path.length).toBe(3);
      expect(path[0]).toEqual(from);
      expect(path[2]).toEqual(to);
    });

    it('moves an orthogonal lane while maintaining 90-degree rectilinear invariance', () => {
      const path: Point[] = [[100, 100], [100, 200], [300, 200], [300, 300]];
      const moved = moveTabDOrthogonalLane(path, 1, [150, 250], 25);
      expect(moved[0]).toEqual([100, 100]);
      expect(moved[3]).toEqual([300, 300]);
      expect(moved[1]).toEqual([100, 250]);
      expect(moved[2]).toEqual([300, 250]);
    });
  });
});
