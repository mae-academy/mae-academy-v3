import { expect, it, describe } from 'vitest';
import { getDef } from './componentDefs';
import {
  alignTabDTerminalToGrid,
  calculateTabDPlanarCavity,
  dynamicRubberBandPath,
  lockTabDWireCorner,
  moveTabDOrthogonalLane,
  resolveTabDNodeJunction,
  tabDComponentLabelAnchors,
  tabDGentleWheelZoomFactor,
  tabDOrthogonalDraftPath,
  tabDTerminalOrthogonalPath,
} from './tabDCanvasGeometry';
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { getTerminalWorldPos, reconnectPathEndpoints, simplifyOrthogonalPath, type Point } from './wiring';

const TAB_D_GRID = 25;
const TAB_D_SCALE = 1.5;

function terminal(component: { type: string; x: number; y: number; rotation?: number; flipH?: boolean; flipV?: boolean }, terminalId: string): Point {
  const item = getDef(component.type)!.terminals.find((candidate) => candidate.id === terminalId)!;
  return getTerminalWorldPos(
    component.x,
    component.y,
    item.x * TAB_D_SCALE,
    item.y * TAB_D_SCALE,
    component.rotation ?? 0,
    component.flipH ?? false,
    component.flipV ?? false,
  );
}

describe('Tab D canvas geometry', () => {
  it('limits a small wheel step to a deliberately modest zoom change', () => {
    expect(tabDGentleWheelZoomFactor(-8)).toBeCloseTo(1.0036, 4);
    expect(tabDGentleWheelZoomFactor(-1000)).toBeCloseTo(tabDGentleWheelZoomFactor(-80), 12);
    expect(tabDGentleWheelZoomFactor(1000)).toBeCloseTo(tabDGentleWheelZoomFactor(80), 12);
  });

  it('projects source, resistor, and ground terminals onto a shared 25px lattice and reconnects wire endpoints exactly', () => {
    const source = { type: 'dc-voltage', x: 325, y: 350 };
    const resistor = { type: 'resistor', x: 475, y: 300 };
    const ground = { type: 'ground', x: 475, y: 450 };
    const sourceNegative = alignTabDTerminalToGrid(terminal(source, 'neg'), TAB_D_GRID);
    const resistorA = alignTabDTerminalToGrid(terminal(resistor, 'a'), TAB_D_GRID);
    const resistorB = alignTabDTerminalToGrid(terminal(resistor, 'b'), TAB_D_GRID);
    const groundTerminal = alignTabDTerminalToGrid(terminal(ground, 'gnd'), TAB_D_GRID);

    for (const point of [sourceNegative, resistorA, resistorB, groundTerminal]) {
      expect(point[0] % TAB_D_GRID).toBe(0);
      expect(point[1] % TAB_D_GRID).toBe(0);
    }

    const refreshed = reconnectPathEndpoints([[0, 0], [250, 250]], sourceNegative, resistorA, 'orthogonal');
    expect(refreshed[0]).toEqual(sourceNegative);
    expect(refreshed.at(-1)).toEqual(resistorA);
  });

  it('projects documented resistor, variable-resistor, and equal-angle Star pins onto exact 25px lattice points before wire snapping', () => {
    const origin: Point = [325, 350];
    const toWorld = ([x, y]: Point): Point => [origin[0] + x * TAB_D_SCALE, origin[1] + y * TAB_D_SCALE];
    const documentedPins: Point[] = [
      [-(100 / 3), 0], [100 / 3, 0], [0, -(100 / 3)],
      [-(100 / 6), -(100 * Math.sqrt(3) / 6)], [-(100 / 6), 100 * Math.sqrt(3) / 6], [100 / 3, 0],
    ];
    const snappedWorldPins = documentedPins.map(toWorld).map((point) => alignTabDTerminalToGrid(point, TAB_D_GRID));
    expect(snappedWorldPins).toEqual([[275, 350], [375, 350], [325, 300], [300, 300], [300, 400], [375, 350]]);
    for (const point of snappedWorldPins) {
      expect(point[0] % TAB_D_GRID).toBe(0);
      expect(point[1] % TAB_D_GRID).toBe(0);
    }
  });

  it('registers documented op-amp terminals on the 25px lattice at the corrected triangle boundary leads', () => {
    const origin: Point = [325, 350];
    const toWorld = ([x, y]: Point): Point => [origin[0] + x * TAB_D_SCALE, origin[1] + y * TAB_D_SCALE];
    const opampPins: Point[] = [[-(100 / 3), -(100 / 6)], [-(100 / 3), 100 / 6], [100 / 3, 0], [0, -(100 / 3)], [0, 100 / 3]];
    expect(opampPins.map(toWorld)).toEqual([[275, 325], [275, 375], [375, 350], [325, 300], [325, 400]]);
  });

  it('gives the positive-only DC rail one centered visual terminal and projects it to the documented lattice', () => {
    const rail = { type: 'dc-rail', x: 325, y: 350 };
    expect(getDef('dc-rail')!.terminals.map((item) => item.id)).toEqual(['pos']);
    expect(terminal(rail, 'pos')).toEqual([325, 350]);
    expect(alignTabDTerminalToGrid(terminal(rail, 'pos'), TAB_D_GRID)).toEqual([325, 350]);
  });

  it('maps every dependent source, transistor, relay, contactor, and transformer terminal to a concrete symbol-edge endpoint', () => {
    const auditedTypes = ['vccs', 'vcvs', 'cccs', 'ccvs', 'bjt-npn', 'bjt-pnp', 'mosfet-n', 'mosfet-p', 'jfet-n', 'jfet-p', 'relay-spst', 'relay-spdt', 'relay-dpst', 'relay-dpdt', 'contactor', 'transformer', 'transformer-ct', 'autotransformer'];
    for (const type of auditedTypes) {
      const definition = getDef(type)!;
      for (const pin of definition.terminals) {
        const world = terminal({ type, x: 325, y: 350, rotation: 90, flipH: true }, pin.id);
        const snapped = alignTabDTerminalToGrid(world, TAB_D_GRID);
        expect(world.every(Number.isFinite), `${type}:${pin.id} raw`).toBe(true);
        expect(snapped[0] % TAB_D_GRID, `${type}:${pin.id} x`).toBe(0);
        expect(snapped[1] % TAB_D_GRID, `${type}:${pin.id} y`).toBe(0);
      }
    }
  });

  it('keeps a clicked turn immutable while the final orthogonal leg follows the cursor', () => {
    const from: Point = [0, 0];
    const locked = lockTabDWireCorner(from, [75, 25]);
    expect(locked).toEqual([75, 0]);
    expect(tabDOrthogonalDraftPath(from, [75, 100], [locked])).toEqual([[0, 0], [75, 0], [75, 100]]);
    expect(tabDOrthogonalDraftPath(from, [150, 100], [locked])).toEqual([[0, 0], [75, 0], [75, 100], [150, 100]]);
  });

  it('routes terminals with strict single-bend L-shape based on starting terminal axis, eliminating doglegs', () => {
    // Vertical start: exit vertically first [x1, y1] -> [x1, y2] -> [x2, y2]
    expect(tabDTerminalOrthogonalPath([325, 300], [450, 250], 'vertical', 'horizontal', TAB_D_GRID)).toEqual([[325, 300], [325, 250], [450, 250]]);
    // Horizontal start: exit horizontally first [x1, y1] -> [x2, y1] -> [x2, y2]
    const singleBend = tabDTerminalOrthogonalPath([0, 0], [100, 50], 'horizontal', 'horizontal', TAB_D_GRID);
    expect(singleBend).toEqual([[0, 0], [100, 0], [100, 50]]);
    // Strict L-shape even if obstacles are passed (no automated dogleg injection)
    const obstructed = tabDTerminalOrthogonalPath([0, 0], [100, 50], 'horizontal', 'horizontal', TAB_D_GRID, [], [{ xMin: 90, xMax: 110, yMin: -10, yMax: 10 }]);
    expect(obstructed).toEqual([[0, 0], [100, 0], [100, 50]]);
    const movedL = moveTabDOrthogonalLane(singleBend, 1, [0, 50], TAB_D_GRID);
    expect(simplifyOrthogonalPath(movedL)).toEqual([[0, 0], [0, 50], [100, 50]]);
  });

  it('determines inner cavity bounds, centroid, and clamped radius for Manhattan mesh loops', () => {
    // 200 x 200 wire loop: [100, 100] to [300, 300]
    const wireLoop: Point[] = [[100, 100], [300, 100], [300, 300], [100, 300]];
    const pureCavity = calculateTabDPlanarCavity(wireLoop);
    expect(pureCavity.innerBounds).toEqual({ xMin: 100, xMax: 300, yMin: 100, yMax: 300 });
    expect(pureCavity.center).toEqual([200, 200]);
    // clearance = min(100, 100) - 16 = 84 -> clamped to max 24
    expect(pureCavity.radius).toBe(24);

    // Small 50 x 50 loop to verify minimum radius clamp (12px)
    const smallLoop: Point[] = [[100, 100], [150, 100], [150, 150], [100, 150]];
    const smallCavity = calculateTabDPlanarCavity(smallLoop);
    // clearance = 25 - 14 = 11 -> clamped to min 12
    expect(smallCavity.radius).toBe(12);

    // Loop with a horizontal resistor on the top rail:
    // Top rail is at y = 100; resistor at (200, 100) has bottom label at y + 16px, body bottom at y + 15px.
    // Inner bottom edge of the top branch is shifted down to at least 124px.
    const topResistor: CircuitComponent = {
      id: 'r_top',
      type: 'resistor',
      x: 200,
      y: 100,
      rotation: 0,
      flipH: false,
      flipV: false,
      label: 'R1',
      props: {},
    };
    const cavityWithResistor = calculateTabDPlanarCavity(wireLoop, [topResistor], TAB_D_SCALE);
    expect(cavityWithResistor.innerBounds.yMin).toBeGreaterThanOrEqual(124);
    expect(cavityWithResistor.center[1]).toBe(200); // Exact vertical midpoint: (y_top_rail + y_bottom_rail) / 2
    // Top of the mesh loop indicator (cy - radius) must stay strictly below the top branch inner edge
    const topIndicatorEdge = cavityWithResistor.center[1] - cavityWithResistor.radius;
    expect(topIndicatorEdge).toBeGreaterThanOrEqual(cavityWithResistor.innerBounds.yMin);
  });

  it('anchors nodal voltage marker directly at true 3-way wire junction vertices (degree >= 3)', () => {
    // T-junction at (300, 200): 3 wire segments intersect on the 25px grid
    const segments: Array<{ from: Point; to: Point }> = [
      { from: [200, 200], to: [300, 200] },
      { from: [300, 200], to: [400, 200] },
      { from: [300, 200], to: [300, 300] },
    ];
    const junction = resolveTabDNodeJunction(segments);
    expect(junction.isJunction).toBe(true);
    expect(junction.degree).toBe(3);
    expect(junction.point).toEqual([300, 200]);

    // Perpendicular upward label offset sits at y - 14px
    const labelPos: Point = [junction.point[0], junction.point[1] - 14];
    expect(labelPos).toEqual([300, 186]);
  });

  it('anchors nodal marker at connecting wire midpoint for simple 2-terminal branches (degree < 3)', () => {
    // Simple 2-terminal wire between two components (no 3-way junction)
    const wireSeg: Array<{ from: Point; to: Point }> = [
      { from: [100, 200], to: [250, 200] },
    ];
    const connectingWire: CircuitWire = {
      id: 'w_series',
      fromComp: 'r1',
      fromTerm: 'b',
      toComp: 'r2',
      toTerm: 'a',
      path: [[100, 200], [250, 200]],
      routing: 'orthogonal',
    };
    const nonJunction = resolveTabDNodeJunction(wireSeg, [connectingWire]);
    expect(nonJunction.isJunction).toBe(false);
    expect(nonJunction.degree).toBe(2);
    expect(nonJunction.point).toEqual([175, 200]); // Wire midpoint, away from terminals 100 and 250
  });

  it('positions horizontal resistor labels with reference at y - 18px and value at y + 22px', () => {
    const anchors = tabDComponentLabelAnchors('resistor', true, 30, 10);
    expect(anchors.reference).toEqual([0, -18]);
    expect(anchors.value).toEqual([0, 22]);
  });

  it('positions vertical resistor labels with reference at (26, -6) and value at (26, 12)', () => {
    const anchors = tabDComponentLabelAnchors('resistor', false, 10, 30);
    expect(anchors.reference).toEqual([26, -6]);
    expect(anchors.value).toEqual([26, 12]);
  });

  it('positions horizontal and vertical voltage source labels with standard geometric clearances', () => {
    const horizontalSource = tabDComponentLabelAnchors('dc-voltage', true, 30, 30);
    expect(horizontalSource.reference).toEqual([0, -18]);
    expect(horizontalSource.value).toEqual([0, 22]);

    const verticalSource = tabDComponentLabelAnchors('dc-voltage', false, 30, 30);
    expect(verticalSource.reference).toEqual([26, -6]);
    expect(verticalSource.value).toEqual([26, 12]);
  });

  describe('Strict Dynamic Orthogonal Router & Rubber-Banding', () => {
    it('enforces Zero-Diagonal Invariant: every segment is strictly horizontal or vertical', () => {
      const from: Point = [100, 100];
      const positions: Point[] = [
        [200, 200], [50, 300], [300, 50], [100, 400], [400, 100], [-50, -50],
      ];
      for (const to of positions) {
        for (const movingEnd of ['to', 'from', 'none'] as const) {
          for (const fromAxis of ['horizontal', 'vertical', undefined] as const) {
            for (const toAxis of ['horizontal', 'vertical', undefined] as const) {
              const path = dynamicRubberBandPath(from, to, fromAxis, toAxis, movingEnd);
              // Zero diagonals: every segment has dx === 0 or dy === 0
              for (let i = 1; i < path.length; i++) {
                const dx = path[i][0] - path[i - 1][0];
                const dy = path[i][1] - path[i - 1][1];
                expect(dx === 0 || dy === 0, `Segment ${path[i - 1]}->${path[i]} must be orthogonal`).toBe(true);
              }
              if (from[0] === to[0] || from[1] === to[1]) {
                expect(path.length).toBe(2);
              } else {
                expect(path.length).toBe(3);
              }
            }
          }
        }
      }
    });

    it('dynamicRubberBandPath: moving "to" respects exit axis of stationary "from" terminal', () => {
      const from: Point = [125, 100];
      const to: Point = [250, 300];

      // Stationary terminal is horizontal -> Route Option H (Horizontal first): [x1, y1] -> [x2, y1] -> [x2, y2]
      const pathH = dynamicRubberBandPath(from, to, 'horizontal', 'vertical', 'to');
      expect(pathH).toEqual([[125, 100], [250, 100], [250, 300]]);

      // Stationary terminal is vertical -> Route Option V (Vertical first): [x1, y1] -> [x1, y2] -> [x2, y2]
      const pathV = dynamicRubberBandPath(from, to, 'vertical', 'horizontal', 'to');
      expect(pathV).toEqual([[125, 100], [125, 300], [250, 300]]);
    });

    it('dynamicRubberBandPath: moving "from" respects entrance axis of stationary "to" terminal', () => {
      const from: Point = [250, 300];
      const to: Point = [125, 100];

      // Stationary terminal "to" is horizontal -> enters horizontally -> Route Option V: [x1, y1] -> [x1, y2] -> [x2, y2]
      const pathV = dynamicRubberBandPath(from, to, 'vertical', 'horizontal', 'from');
      expect(pathV).toEqual([[250, 300], [250, 100], [125, 100]]);

      // Stationary terminal "to" is vertical -> enters vertically -> Route Option H: [x1, y1] -> [x2, y1] -> [x2, y2]
      const pathH = dynamicRubberBandPath(from, to, 'horizontal', 'vertical', 'from');
      expect(pathH).toEqual([[250, 300], [125, 300], [125, 100]]);
    });

    it('tabDOrthogonalDraftPath: follows terminal exit axis or free space pull direction', () => {
      const from: Point = [100, 100];

      // 1. Horizontal start terminal -> Horizontal-first
      const draftH = tabDOrthogonalDraftPath(from, [200, 250], [], 'horizontal');
      expect(draftH).toEqual([[100, 100], [200, 100], [200, 250]]);

      // 2. Vertical start terminal -> Vertical-first
      const draftV = tabDOrthogonalDraftPath(from, [200, 250], [], 'vertical');
      expect(draftV).toEqual([[100, 100], [100, 250], [200, 250]]);

      // 3. Free space pull: |dx| >= |dy| -> Horizontal-first
      const pullH = tabDOrthogonalDraftPath(from, [200, 130], []);
      expect(pullH).toEqual([[100, 100], [200, 100], [200, 130]]);

      // 4. Free space pull: |dy| > |dx| -> Vertical-first
      const pullV = tabDOrthogonalDraftPath(from, [130, 200], []);
      expect(pullV).toEqual([[100, 100], [100, 200], [130, 200]]);
    });
  });
});
