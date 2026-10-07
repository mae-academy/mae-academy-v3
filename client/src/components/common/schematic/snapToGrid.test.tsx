// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { pointInComponentBox, snapPointToGrid } from '@/components/common/schematic/schematicGeometry';
import { useSchematicCanvas } from '@/components/common/schematic/useSchematicCanvas';
import type { SchematicComponent, SchematicComponentLibrary, SchematicPoint } from '@/components/common/schematic/schematicTypes';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const GRID = 20;
const library: SchematicComponentLibrary<SchematicComponent> = {
  getTerminals: c => [{ id: 'a', position: [c.x - 60, c.y] as SchematicPoint }, { id: 'b', position: [c.x + 60, c.y] as SchematicPoint }],
  hitTest: (c, p) => pointInComponentBox(c, p, 60, 20),
  route: (from, to) => [from, [to[0], from[1]], to],
  createComponent: (type, [x, y], existing) => ({ id: `n${existing.length}`, type, x, y, rotation: 0, flipH: false, flipV: false, label: `P${existing.length + 1}`, props: {} }),
  nextLabel: (_type, existing) => `P${existing.length + 1}`,
};
const mount = () => renderHook(() => useSchematicCanvas<SchematicComponent>({ library, gridSize: GRID, isDark: false }));
const onGrid = (value: number) => Math.abs(value / GRID - Math.round(value / GRID)) < 1e-9;

describe('Snap to Grid', () => {
  it('is on by default and puts a dropped component exactly on 20 px grid nodes', () => {
    const { result } = mount();
    expect(result.current.snapEnabled).toBe(true);
    const placed = [[13, 27], [49, 51], [-31, 8], [100, 100], [9.9, 10.1]] as SchematicPoint[];
    for (const point of placed) {
      let component: SchematicComponent | null = null;
      act(() => { component = result.current.addComponent('part', point); });
      expect([onGrid(component!.x), onGrid(component!.y)], String(point)).toEqual([true, true]);
      expect(Math.abs(component!.x - point[0])).toBeLessThanOrEqual(GRID / 2);
      expect(Math.abs(component!.y - point[1])).toBeLessThanOrEqual(GRID / 2);
      // terminals are fixed offsets of 60 from the origin, so they land on grid nodes too
      for (const terminal of library.getTerminals(component!)) expect(terminal.position.map(onGrid), String(point)).toEqual([true, true]);
    }
  });

  it('when switched off leaves the drop point exactly where it was released', () => {
    const { result } = mount();
    act(() => result.current.setSnapEnabled(false));
    expect(result.current.snapEnabled).toBe(false);
    let component: SchematicComponent | null = null;
    act(() => { component = result.current.addComponent('part', [13, 27]); });
    expect([component!.x, component!.y]).toEqual([13, 27]);
    act(() => { component = result.current.addComponent('part', [49.5, 51.25]); });
    expect([component!.x, component!.y]).toEqual([49.5, 51.25]);
  });

  it('can be toggled back on and then snaps again', () => {
    const { result } = mount();
    act(() => result.current.setSnapEnabled(false));
    act(() => result.current.setSnapEnabled(true));
    let component: SchematicComponent | null = null;
    act(() => { component = result.current.addComponent('part', [13, 27]); });
    expect([component!.x, component!.y]).toEqual([20, 20]);
  });

  it('snaps wire points the same way', () => {
    expect(snapPointToGrid([13, 27], GRID)).toEqual([20, 20]);
    expect(snapPointToGrid([-9, 31], GRID)).toEqual([-0, 40]);
  });
});
