import { expect, it, describe } from 'vitest';
import { getDef } from './componentDefs';
import { alignTabDTerminalToGrid, documentedTabDTerminalLocalPosition, lockTabDWireCorner, moveTabDOrthogonalLane, tabDGentleWheelZoomFactor, tabDOrthogonalDraftPath, tabDTerminalOrthogonalPath } from './tabDCanvasGeometry';
import { getTerminalWorldPos, reconnectPathEndpoints, type Point } from './wiring';

const TAB_D_GRID = 25;
const TAB_D_SCALE = 1.5;

function terminal(component: { type: string; x: number; y: number; rotation?: number; flipH?: boolean; flipV?: boolean }, terminalId: string): Point {
  const item = getDef(component.type)!.terminals.find((candidate) => candidate.id === terminalId)!;
  const local = documentedTabDTerminalLocalPosition(component.type, terminalId, [item.x, item.y]);
  return getTerminalWorldPos(
    component.x,
    component.y,
    local[0] * TAB_D_SCALE,
    local[1] * TAB_D_SCALE,
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
    expect(terminal(rail, 'pos')).toEqual([325, 312.5]);
    expect(alignTabDTerminalToGrid(terminal(rail, 'pos'), TAB_D_GRID)).toEqual([325, 325]);
  });

  it('maps every dependent source, transistor, relay, contactor, and transformer terminal to a concrete symbol-edge endpoint', () => {
    const auditedTypes = ['vccs', 'vcvs', 'cccs', 'ccvs', 'bjt-npn', 'bjt-pnp', 'mosfet-n', 'mosfet-p', 'jfet-n', 'jfet-p', 'relay-spst', 'relay-spdt', 'relay-dpst', 'relay-dpdt', 'contactor', 'transformer', 'transformer-ct', 'autotransformer'];
    for (const type of auditedTypes) {
      const definition = getDef(type)!;
      for (const pin of definition.terminals) {
        const local = documentedTabDTerminalLocalPosition(type, pin.id, [pin.x, pin.y]);
        expect(local.every(Number.isFinite), `${type}:${pin.id}`).toBe(true);
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

  it('routes vertical source terminals into horizontal resistor terminals without a hooked return and keeps dogleg handles grid aligned', () => {
    expect(tabDTerminalOrthogonalPath([325, 300], [450, 250], 'vertical', 'horizontal', TAB_D_GRID)).toEqual([[325, 300], [325, 250], [450, 250]]);
    const dogleg = tabDTerminalOrthogonalPath([0, 0], [100, 50], 'horizontal', 'horizontal', TAB_D_GRID);
    expect(dogleg).toEqual([[0, 0], [50, 0], [50, 50], [100, 50]]);
    expect(moveTabDOrthogonalLane(dogleg, 1, [73, 17], TAB_D_GRID)).toEqual([[0, 0], [75, 0], [75, 50], [100, 50]]);
  });
});
