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
} from '@/simulators/circuit-engine/models/wiring';

describe('ElectroLab Wire Routing & Waypoint Stability', () => {
  describe('1. Minimal Bend Orthogonal Routing (Fallback/Auto mode)', () => {
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

    it('routes offset terminals as a single-bend L-shape instead of a 3-segment Z/S-curve', () => {
      const from: Point = [50, 50];
      const to: Point = [200, 150];
      const pathH = orthogonalPath(from, to, 25, true);
      // Horizontal first: [x1, y1] -> [x2, y1] -> [x2, y2]
      expect(pathH).toEqual([[50, 50], [200, 50], [200, 150]]);
      expect(pathH.length).toBe(3);

      const pathV = orthogonalPath(from, to, 25, false);
      // Vertical first: [x1, y1] -> [x1, y2] -> [x2, y2]
      expect(pathV).toEqual([[50, 50], [50, 150], [200, 150]]);
      expect(pathV.length).toBe(3);
    });
  });

  describe('2. Collinear Simplification', () => {
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
        [200, 150],
      ];
      expect(simplifyOrthogonalPath(input)).toEqual([
        [0, 50],
        [200, 50],
        [200, 150],
      ]);
    });
  });

  describe('3. Waypoint Preservation', () => {
    it('preserves explicit user waypoints during endpoint refresh (orthogonal enforcement inserts elbows)', () => {
      const userWaypoints: Point[] = [[50, 0], [50, 200], [150, 200]];
      const existingPath: Point[] = [[0, 0], ...userWaypoints, [150, 300]];

      // Terminal moved slightly from [0, 0] to [0, 25]
      const refreshed = reconnectPathEndpoints(
        existingPath,
        [0, 25],
        [150, 300],
        'manual',
        [],
        userWaypoints,
      );

      // [0,25] -> [50,0] is diagonal, so enforceOrthogonal inserts an elbow
      // The key invariant: every segment is strictly H or V
      expect(refreshed[0]).toEqual([0, 25]);
      expect(refreshed.at(-1)).toEqual([150, 300]);
      // Verify strict orthogonal invariant: every segment is H or V
      for (let i = 1; i < refreshed.length; i++) {
        const dx = refreshed[i][0] - refreshed[i - 1][0];
        const dy = refreshed[i][1] - refreshed[i - 1][1];
        expect(dx === 0 || dy === 0, `segment ${i - 1}→${i} is diagonal: [${refreshed[i - 1]}]→[${refreshed[i]}]`).toBe(true);
      }
    });

    it('does not overwrite manual corner points with auto-router', () => {
      const manualPath: Point[] = [[0, 0], [50, 0], [50, 100], [100, 100]];
      const refreshed = reconnectPathEndpoints(
        manualPath,
        [0, 0],
        [100, 100],
        'manual',
      );
      expect(refreshed).toEqual(manualPath);
    });
  });

  describe('4. Wire Splitting & T-Junction Alignment', () => {
    it('projects points onto horizontal and vertical wire segments accurately', () => {
      const wirePath: Point[] = [[0, 100], [200, 100], [200, 300]];

      // Click near horizontal segment at [103, 108]
      const hitH = projectPointOntoWire([103, 108], wirePath, 25);
      expect(hitH).not.toBeNull();
      expect(hitH?.point).toEqual([100, 100]);
      expect(hitH?.axis).toBe('horizontal');
      expect(hitH?.segmentIndex).toBe(0);

      // Click near vertical segment at [197, 248]
      const hitV = projectPointOntoWire([197, 248], wirePath, 25);
      expect(hitV).not.toBeNull();
      expect(hitV?.point).toEqual([200, 250]);
      expect(hitV?.axis).toBe('vertical');
      expect(hitV?.segmentIndex).toBe(1);
    });

    it('inserts collinear junction point into existing wire path without warping trajectory', () => {
      const originalPath: Point[] = [[0, 100], [200, 100]];
      const junctionPoint: Point = [75, 100];
      const updatedPath = insertPointIntoWirePath(originalPath, junctionPoint, 0);

      expect(updatedPath).toEqual([[0, 100], [75, 100], [200, 100]]);
      // The wire remains strictly along Y = 100
      expect(updatedPath.every(p => p[1] === 100)).toBe(true);
    });

    it('routes incoming wire perpendicularly into horizontal wire creating 90° T-junction', () => {
      // Incoming wire from [50, 200] connecting to horizontal wire at [100, 100]
      const from: Point = [50, 200];
      const junction: Point = [100, 100];
      const path = routeTJunctionPath(from, junction, 'horizontal');

      expect(path).toEqual([[50, 200], [100, 200], [100, 100]]);
      // Final leg [100, 200] -> [100, 100] is vertical (X=100), strictly perpendicular to horizontal wire (Y=100)
      const lastSegStart = path[path.length - 2];
      const lastSegEnd = path[path.length - 1];
      expect(lastSegStart[0]).toBe(lastSegEnd[0]); // Vertical arrival
    });

    it('routes incoming wire perpendicularly into vertical wire creating 90° T-junction', () => {
      // Incoming wire from [50, 50] connecting to vertical wire at [150, 150]
      const from: Point = [50, 50];
      const junction: Point = [150, 150];
      const path = routeTJunctionPath(from, junction, 'vertical');

      expect(path).toEqual([[50, 50], [50, 150], [150, 150]]);
      // Final leg [50, 150] -> [150, 150] is horizontal (Y=150), strictly perpendicular to vertical wire (X=150)
      const lastSegStart = path[path.length - 2];
      const lastSegEnd = path[path.length - 1];
      expect(lastSegStart[1]).toBe(lastSegEnd[1]); // Horizontal arrival
    });

    it('preserves user locked corners and finishes with 90° entry into target wire', () => {
      const from: Point = [0, 0];
      const lockedCorners: Point[] = [[50, 0], [50, 120]];
      const junction: Point = [150, 50]; // On horizontal wire at Y = 50
      const path = routeTJunctionPath(from, junction, 'horizontal', lockedCorners);

      expect(path).toEqual([
        [0, 0],
        [50, 0],
        [50, 120],
        [150, 120],
        [150, 50],
      ]);
      // Final leg is [150, 120] -> [150, 50] which is vertical into horizontal wire
      expect(path[path.length - 2][0]).toBe(150);
      expect(path[path.length - 1]).toEqual([150, 50]);
    });
  });

  describe('5. Path Stability on Unmoved Endpoints', () => {
    it('returns existing path verbatim when endpoints have not moved', () => {
      const customPath: Point[] = [[0, 0], [100, 0], [100, 100]];
      const result = reconnectPathEndpoints(customPath, [0, 0], [100, 100], 'orthogonal');
      expect(result).toBe(customPath);
    });
  });

  describe('6. Strict Zero-Diagonal Enforcer', () => {
    it('passes through already-orthogonal paths unchanged', () => {
      const path: Point[] = [[0, 0], [100, 0], [100, 100]];
      expect(enforceOrthogonal(path)).toEqual([[0, 0], [100, 0], [100, 100]]);
    });

    it('inserts elbow for a single diagonal segment', () => {
      const path: Point[] = [[0, 0], [100, 50]];
      const result = enforceOrthogonal(path);
      // Must have 3 points with an elbow
      expect(result.length).toBe(3);
      // Every segment must be orthogonal
      for (let i = 1; i < result.length; i++) {
        const dx = result[i][0] - result[i - 1][0];
        const dy = result[i][1] - result[i - 1][1];
        expect(dx === 0 || dy === 0).toBe(true);
      }
      expect(result[0]).toEqual([0, 0]);
      expect(result[result.length - 1]).toEqual([100, 50]);
    });

    it('fixes multiple diagonal segments in a path', () => {
      const path: Point[] = [[0, 0], [50, 80], [200, 150]];
      const result = enforceOrthogonal(path);
      // Every segment must be orthogonal
      for (let i = 1; i < result.length; i++) {
        const dx = result[i][0] - result[i - 1][0];
        const dy = result[i][1] - result[i - 1][1];
        expect(dx === 0 || dy === 0, `segment ${i - 1}\u2192${i} is diagonal`).toBe(true);
      }
      expect(result[0]).toEqual([0, 0]);
      expect(result[result.length - 1]).toEqual([200, 150]);
    });

    it('simplifyOrthogonalPath never produces diagonals even with misaligned waypoints', () => {
      // Simulate a waypoint splice where from and first waypoint are diagonal
      const path: Point[] = [[10, 25], [50, 0], [50, 200], [150, 200], [150, 300]];
      const result = simplifyOrthogonalPath(path);
      for (let i = 1; i < result.length; i++) {
        const dx = result[i][0] - result[i - 1][0];
        const dy = result[i][1] - result[i - 1][1];
        expect(dx === 0 || dy === 0, `segment ${i - 1}\u2192${i} is diagonal: [${result[i - 1]}]\u2192[${result[i]}]`).toBe(true);
      }
    });

    it('reconnectPathEndpoints never returns diagonal segments during component drag', () => {
      // Simulate: L-bend path, component dragged so endpoint shifts diagonally
      const existing: Point[] = [[100, 200], [200, 200], [200, 300]];
      const newFrom: Point = [125, 225]; // Component moved
      const newTo: Point = [200, 300];
      const result = reconnectPathEndpoints(existing, newFrom, newTo, 'orthogonal');
      for (let i = 1; i < result.length; i++) {
        const dx = result[i][0] - result[i - 1][0];
        const dy = result[i][1] - result[i - 1][1];
        expect(dx === 0 || dy === 0, `segment ${i - 1}→${i} is diagonal: [${result[i - 1]}]→[${result[i]}]`).toBe(true);
      }
      expect(result[0]).toEqual(newFrom);
      expect(result[result.length - 1]).toEqual(newTo);
    });

    it('orthogonalPath follows initialAxis when specified', () => {
      const from: Point = [100, 100];
      const to: Point = [200, 300];

      // Route Option H (Horizontal first): [x1, y1] -> [x2, y1] -> [x2, y2]
      expect(orthogonalPath(from, to, 'horizontal')).toEqual([[100, 100], [200, 100], [200, 300]]);

      // Route Option V (Vertical first): [x1, y1] -> [x1, y2] -> [x2, y2]
      expect(orthogonalPath(from, to, 'vertical')).toEqual([[100, 100], [100, 300], [200, 300]]);
    });

    it('orthogonalPath follows dominant pull direction when initialAxis is undefined', () => {
      const from: Point = [100, 100];

      // |dx| = 100 >= |dy| = 30 -> Route Option H (Horizontal first)
      expect(orthogonalPath(from, [200, 130])).toEqual([[100, 100], [200, 100], [200, 130]]);

      // |dy| = 100 > |dx| = 30 -> Route Option V (Vertical first)
      expect(orthogonalPath(from, [130, 200])).toEqual([[100, 100], [100, 200], [130, 200]]);
    });

    it('pointsToPath NEVER emits diagonal L segments even for diagonal input points', () => {
      const diagonalInput: Point[] = [[10, 20], [80, 90], [150, 200]];
      const svgPath = pointsToPath(diagonalInput);

      // Parse commands
      const commands = svgPath.trim().split(/\s+(?=[ML])/);
      expect(commands[0].startsWith('M')).toBe(true);

      // Verify every L segment is either purely horizontal or purely vertical
      let currentX = parseFloat(commands[0].replace('M ', '').split(',')[0]);
      let currentY = parseFloat(commands[0].replace('M ', '').split(',')[1]);

      for (let i = 1; i < commands.length; i++) {
        const [nextXStr, nextYStr] = commands[i].replace('L ', '').split(',');
        const nextX = parseFloat(nextXStr);
        const nextY = parseFloat(nextYStr);

        const dx = Math.abs(nextX - currentX);
        const dy = Math.abs(nextY - currentY);
        expect(dx === 0 || dy === 0, `SVG path segment from (${currentX}, ${currentY}) to (${nextX}, ${nextY}) must be orthogonal`).toBe(true);

        currentX = nextX;
        currentY = nextY;
      }
    });

    it('routePath returns strict 2 or 3 point orthogonal paths with zero diagonals', () => {
      // Aligned
      expect(routePath([0, 50], [100, 50], 'orthogonal').length).toBe(2);
      expect(routePath([50, 0], [50, 100], 'orthogonal').length).toBe(2);

      // Unaligned
      const pathH = routePath([0, 0], [100, 80], 'orthogonal', [], 20, 'horizontal');
      expect(pathH).toEqual([[0, 0], [100, 0], [100, 80]]);
      expect(pathH.length).toBe(3);

      const pathV = routePath([0, 0], [100, 80], 'orthogonal', [], 20, 'vertical');
      expect(pathV).toEqual([[0, 0], [0, 80], [100, 80]]);
      expect(pathV.length).toBe(3);
    });
  });
});
