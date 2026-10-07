// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createWireNetResolver,
  moveOrthogonalLane,
  orthogonalDraftPath,
  pointInComponentBox,
  refreshWireEndpoints,
  resolveWireEndpoints,
} from '@/components/common/schematic/schematicGeometry';
import { fitViewToBounds, screenToWorld, zoomViewAt } from '@/components/common/schematic/useSchematicViewport';
import { resolveSchematicShortcut } from '@/components/common/schematic/useSchematicShortcuts';
import { collectSelection, instantiateClipboard, removeFromDocument } from '@/components/common/schematic/useSchematicClipboard';
import { filterLibrary } from '@/components/common/schematic/BaseSchematicCanvas';
import type { SchematicComponent, SchematicComponentLibrary, SchematicPoint, SchematicWire } from '@/components/common/schematic/schematicTypes';
import { DigitalLogicSimulatorHome } from '@/simulators/digital-logic/components/pages/Home';
import { V3Home } from '@/simulators/circuit-engine/components/pages/Home';
import { RemoteCircuitEngine } from '@/simulators/circuit-engine/engine/RemoteCircuitEngine';

const part = (id: string, x: number, y: number, rotation = 0): SchematicComponent => ({ id, type: 'two-pin', x, y, rotation, flipH: false, flipV: false, label: id, props: { value: 1 } });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string, path: SchematicPoint[]): SchematicWire => ({ id, fromComp, fromTerm, toComp, toTerm, path, routing: 'orthogonal' });

/** Minimal two-pin library: pins at ±50 on the local x axis. */
const library: SchematicComponentLibrary<SchematicComponent> = {
  getTerminals: c => {
    const r = (c.rotation * Math.PI) / 180;
    return [['a', -50], ['b', 50]].map(([id, dx]) => ({ id: id as string, position: [c.x + Math.round((dx as number) * Math.cos(r)), c.y + Math.round((dx as number) * Math.sin(r))] as SchematicPoint }));
  },
  hitTest: (c, p) => pointInComponentBox(c, p, 40, 15),
  route: (from, to) => [from, [to[0], from[1]], to],
  createComponent: (type, [x, y], existing) => ({ id: `n${existing.length}`, type, x, y, rotation: 0, flipH: false, flipV: false, label: `R${existing.length + 1}`, props: {} }),
  nextLabel: (_type, existing) => `R${existing.length + 1}`,
};

describe('shared schematic geometry', () => {
  it('resolves live wire endpoints and axes from the library pins', () => {
    const endpoints = resolveWireEndpoints(library, wire('w', 'r1', 'b', 'r2', 'a', []), [part('r1', 0, 0), part('r2', 200, 100, 90)]);
    expect(endpoints).toEqual({ from: [50, 0], to: [200, 100 - 50], fromAxis: 'horizontal', toAxis: 'vertical' });
  });

  it('re-routes only wires attached to moved parts and reconnects drifted endpoints of the rest', () => {
    const components = [part('r1', 0, 0), part('r2', 300, 0), part('r3', 600, 0)];
    const wires = [wire('w12', 'r1', 'b', 'r2', 'a', [[50, 0], [250, 0]]), wire('w23', 'r2', 'b', 'r3', 'a', [[350, 0], [550, 0]])];
    const moved = components.map(c => (c.id === 'r1' ? { ...c, y: 100 } : c));
    const [w12, w23] = refreshWireEndpoints(library, wires, moved, 25, new Set(['r1']));
    expect(w12.path).toEqual([[50, 100], [250, 100], [250, 0]]);
    expect(w23).toBe(wires[1]);
  });

  it('merges junction-split wires into one net and keeps unrelated wires apart', () => {
    const netOf = createWireNetResolver([
      wire('head', 'r1', 'b', 'junc_1', 'p', []),
      wire('tail', 'junc_1', 'p', 'r2', 'a', []),
      wire('other', 'r3', 'a', 'r4', 'b', []),
    ]);
    expect(netOf(wire('head', 'r1', 'b', 'junc_1', 'p', []))).toBe(netOf(wire('tail', 'junc_1', 'p', 'r2', 'a', [])));
    expect(netOf(wire('head', 'r1', 'b', 'junc_1', 'p', []))).not.toBe(netOf(wire('other', 'r3', 'a', 'r4', 'b', [])));
  });

  it('keeps 90° geometry when drafting and when sliding a corner lane', () => {
    expect(orthogonalDraftPath([0, 0], [100, 50], [], 'horizontal')).toEqual([[0, 0], [100, 0], [100, 50]]);
    expect(moveOrthogonalLane([[0, 0], [100, 0], [100, 100]], 1, [60, 10], 25)).toEqual([[0, 0], [50, 0], [50, 100], [100, 100]]);
  });

  it('hit-tests bodies in the rotated local frame', () => {
    expect(pointInComponentBox(part('r', 0, 0, 90), [0, 35], 40, 15, 0, 0)).toBe(true);
    expect(pointInComponentBox(part('r', 0, 0, 90), [35, 0], 40, 15, 0, 0)).toBe(false);
  });
});

describe('shared viewport math', () => {
  it('zooms about the anchor so the world point under the cursor stays fixed', () => {
    const view = { zoom: 1, pan: [10, 20] as SchematicPoint };
    const anchor: SchematicPoint = [300, 200];
    const before = screenToWorld(view, anchor);
    const after = screenToWorld(zoomViewAt(view, 1.5, anchor), anchor);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('clamps zoom and centres fit bounds', () => {
    expect(zoomViewAt({ zoom: 2.9, pan: [0, 0] }, 10, [0, 0]).zoom).toBe(3);
    const fit = fitViewToBounds({ centerX: 100, centerY: 50, width: 200, height: 100 }, 800, 600);
    expect(screenToWorld(fit, [400, 300])).toEqual([100, 50]);
    expect(fitViewToBounds(null, 800, 600)).toEqual({ zoom: 1, pan: [0, 0] });
  });
});

describe('shared shortcut map', () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
  it('maps the canonical editing keys identically for every studio', () => {
    expect(resolveSchematicShortcut(key('z', { ctrlKey: true }), 25)).toEqual({ type: 'undo' });
    expect(resolveSchematicShortcut(key('Z', { metaKey: true, shiftKey: true }), 25)).toEqual({ type: 'redo' });
    expect(resolveSchematicShortcut(key('c', { metaKey: true }), 25)).toEqual({ type: 'copy' });
    expect(resolveSchematicShortcut(key('v', { ctrlKey: true }), 25)).toEqual({ type: 'paste' });
    expect(resolveSchematicShortcut(key('v'), 25)).toEqual({ type: 'flip', axis: 'v' });
    expect(resolveSchematicShortcut(key('r'), 25)).toBeNull();
    expect(resolveSchematicShortcut(key(' '), 25)).toEqual({ type: 'rotate' });
    expect(resolveSchematicShortcut(key('Delete'), 25)).toEqual({ type: 'delete' });
    expect(resolveSchematicShortcut(key('ArrowLeft', { shiftKey: true }), 25)).toEqual({ type: 'nudge', dx: -125, dy: 0 });
    expect(resolveSchematicShortcut(key('1'), 25)).toBeNull();
  });
});

describe('shared clipboard', () => {
  it('pastes internal wires with fresh ids, remapped endpoints and junctions, translated by the offset', () => {
    const document = {
      components: [part('r1', 0, 0), part('r2', 200, 0)],
      wires: [wire('w1', 'r1', 'b', 'junc_x', 'p', [[50, 0], [100, 0]]), wire('w2', 'junc_x', 'p', 'r2', 'a', [[100, 0], [150, 0]])],
      texts: [],
    };
    const payload = collectSelection(document, null, ['r1', 'r2', 'w1', 'w2']);
    const pasted = instantiateClipboard(payload, document.components, 25, 50, library);
    expect(pasted.components.map(c => [c.x, c.y])).toEqual([[25, 50], [225, 50]]);
    const ids = new Set(pasted.components.map(c => c.id));
    expect(ids.has('r1')).toBe(false);
    expect(ids.has(pasted.wires[0].fromComp)).toBe(true);
    expect(pasted.wires[0].toComp).toBe(pasted.wires[1].fromComp);
    expect(pasted.wires[0].toComp).not.toBe('junc_x');
    expect(pasted.wires[0].path).toEqual([[75, 50], [125, 50]]);
  });

  it('drops wires attached to removed components', () => {
    const next = removeFromDocument({ components: [part('r1', 0, 0), part('r2', 200, 0)], wires: [wire('w', 'r1', 'b', 'r2', 'a', [])], texts: [] }, new Set(['r1']));
    expect(next.components.map(c => c.id)).toEqual(['r2']);
    expect(next.wires).toEqual([]);
  });

  it('filters the library by name or description', () => {
    const categories = { Gates: [{ id: 'and', name: 'AND Gate', description: 'conjunction' }, { id: 'or', name: 'OR Gate', description: 'disjunction' }] };
    expect(filterLibrary(categories, 'conj')).toEqual({ Gates: [categories.Gates[0]] });
    expect(filterLibrary(categories, 'zzz')).toEqual({});
  });
});

/** The Circuit studio reads its electron-flow preference from localStorage while rendering. */
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });

describe('studio parity on the shared canvas', () => {
  const sharedChrome = (markup: string) => [
    'title="Zoom out"', 'title="Zoom in"', 'title="Undo (Ctrl/Cmd+Z)"', 'title="Redo (Ctrl/Cmd+Shift+Z)"', 'title="Auto-scale / Center circuit"',
    'title="Cut (Ctrl/Cmd+X)"', 'title="Copy (Ctrl/Cmd+C)"', 'title="Paste (Ctrl/Cmd+V)"', 'title="Delete (Del/Backspace)"',
    'aria-label="Grid Style"', 'Add editable workspace text (T)', 'Rotate selected component 90° (R)', 'Flip X', 'Flip Y',
    'id="workspace-grid-dots"', 'id="circuit-elements-layer"', 'Canvas Ready', 'Workspace Shortcuts',
  ].filter(fragment => !markup.includes(fragment));

  it('renders identical canvas chrome for Digital Logic and Electrical Circuits', () => {
    const digital = renderToStaticMarkup(<DigitalLogicSimulatorHome />);
    const electrical = renderToStaticMarkup(<V3Home createSimulationEngine={() => new RemoteCircuitEngine(async () => { throw new Error('offline'); })} tabDUiRefinement />);
    expect(sharedChrome(digital)).toEqual([]);
    expect(sharedChrome(electrical)).toEqual([]);
    expect(digital).toContain('Interactive Digital Logic Canvas');
    expect(electrical).toContain('Interactive Circuit Schematic Canvas');
  });
});
