import { describe, expect, it } from 'vitest';
import {
  calculateWireIntersections,
  buildJumpArcPath,
  junctionDotPositions,
} from '@/simulators/digital-logic/models/wireIntersections';
import type { CircuitWire } from '@shared/logic/circuitTypes';

describe('wireIntersections (Cross-Net Bridges & Junction Dots)', () => {
  it('detects cross-net orthogonal crossings and generates jump arcs', () => {
    // Wire 1: Horizontal from (0, 50) to (100, 50)
    const wire1: CircuitWire = {
      id: 'w1',
      from: { componentId: 'c1', terminalId: 'out' },
      to: { componentId: 'c2', terminalId: 'in' },
      path: [[0, 50], [100, 50]],
    };

    // Wire 2: Vertical from (50, 0) to (50, 100) (different net)
    const wire2: CircuitWire = {
      id: 'w2',
      from: { componentId: 'c3', terminalId: 'out' },
      to: { componentId: 'c4', terminalId: 'in' },
      path: [[50, 0], [50, 100]],
    };

    const intersections = calculateWireIntersections([wire1, wire2]);
    expect(intersections.length).toBe(1);
    expect(intersections[0]).toEqual({
      x: 50,
      y: 50,
      hWireId: 'w1',
      vWireId: 'w2',
      sameNet: false,
    });

    // Horizontal wire should get jump arc
    const arcPath = buildJumpArcPath([[0, 50], [100, 50]], intersections, 'w1', 4);
    expect(arcPath).toContain('A 4 4 0 0 1');
    expect(arcPath).toContain('46 50');
    expect(arcPath).toContain('54 50');

    // No junction dot should be created for cross-net
    const dots = junctionDotPositions(intersections, [wire1, wire2]);
    expect(dots.length).toBe(0);
  });

  it('detects same-net intersections and generates junction dots', () => {
    // Net 'netA' shared by two wires forming a T-junction at (50, 50)
    const wire1: CircuitWire = {
      id: 'w1',
      from: { componentId: 'c1', terminalId: 'out' },
      to: { componentId: 'c2', terminalId: 'in' },
      path: [[0, 50], [100, 50]],
    };

    const wire2: CircuitWire = {
      id: 'w2',
      from: { componentId: 'c1', terminalId: 'out' }, // same driver -> same net
      to: { componentId: 'c3', terminalId: 'in' },
      path: [[50, 50], [50, 100]],
    };

    const intersections = calculateWireIntersections([wire1, wire2]);
    expect(intersections.length).toBe(1);
    expect(intersections[0].sameNet).toBe(true);

    // Same net crossing should produce a junction dot at (50, 50)
    const dots = junctionDotPositions(intersections, [wire1, wire2]);
    expect(dots.length).toBe(1);
    expect(dots[0]).toEqual([50, 50]);

    // No jump arc should be inserted on same-net crossing
    const arcPath = buildJumpArcPath([[0, 50], [100, 50]], intersections, 'w1', 4);
    expect(arcPath).not.toContain('A 4 4');
  });
});
