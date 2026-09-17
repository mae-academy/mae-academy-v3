import { describe, expect, it } from 'vitest';
import { calculateOrthogonalPath, buildComponentBBoxes } from '@/simulators/digital-logic/models/wireRouter';
import type { CircuitComponent } from '@/simulators/digital-logic/models/circuitTypes';

describe('wireRouter (Digital Logic Orthogonal Routing)', () => {
  it('routes a straight horizontal wire directly', () => {
    const from: [number, number] = [0, 0];
    const to: [number, number] = [100, 0];
    const path = calculateOrthogonalPath(from, to, [], 20);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // All points should have y = 0
    path.forEach(p => expect(p[1]).toBe(0));
  });

  it('routes a straight vertical wire directly', () => {
    const from: [number, number] = [40, 20];
    const to: [number, number] = [40, 120];
    const path = calculateOrthogonalPath(from, to, [], 20);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // All points should have x = 40
    path.forEach(p => expect(p[0]).toBe(40));
  });

  it('routes strictly orthogonally (only 90 degree bends)', () => {
    const from: [number, number] = [20, 20];
    const to: [number, number] = [100, 80];
    const path = calculateOrthogonalPath(from, to, [], 20);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);

    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const isOrthogonal = x1 === x2 || y1 === y2;
      expect(isOrthogonal).toBe(true);
    }
  });

  it('routes around an obstacle component when present', () => {
    const from: [number, number] = [0, 60];
    const to: [number, number] = [160, 60];
    const obstacle: CircuitComponent = {
      id: 'gate1',
      type: 'gate-and',
      x: 80,
      y: 60,
      rotation: 0,
      label: 'AND1',
      props: {},
    };
    const bboxes = buildComponentBBoxes([obstacle], 20);
    expect(bboxes.length).toBe(1);

    const path = calculateOrthogonalPath(from, to, [obstacle], 20);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);

    // Obstacle bounding box occupies x in [50, 110], y in [40, 80]
    // The path should not contain any point directly inside the inner obstacle
    const penetratesObstacle = path.some(([x, y]) => x > 65 && x < 95 && y > 50 && y < 70);
    expect(penetratesObstacle).toBe(false);
  });
});
