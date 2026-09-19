import { describe, expect, it } from 'vitest';
import { LOGO_0BA8 } from '../../domain/hardware';
import { compileFbd } from './compile';
import { createDemoDiagram } from './demo-diagram';
import { GRID, addBlock, connect, markerIndices, removeBlock, snap, timerInstances, moveBlock, KINDS, type FbdGraph } from './model';
import { routeLink } from './routing';
import { parseFbd, serializeFbd } from './serialize';

describe('FBD model edits', () => {
  it('snaps blocks to the grid and hands out free terminals', () => {
    let g: FbdGraph = { blocks: [], links: [] };
    g = addBlock(g, 'input', 33, 47, 'a');
    g = addBlock(g, 'input', 0, 0, 'b');
    expect(g.blocks.map((b) => [b.x % GRID, b.y % GRID, b.index])).toEqual([[0, 0, 0], [0, 0, 1]]);
    expect(snap(29)).toBe(20);
    expect(moveBlock(g, 'a', -50, 91).blocks[0]).toMatchObject({ x: 0, y: 100 });
  });

  it('replaces the wire on an occupied pin and rejects impossible links', () => {
    let g: FbdGraph = { blocks: [], links: [] };
    g = addBlock(addBlock(addBlock(g, 'input', 0, 0, 'i1'), 'input', 0, 80, 'i2'), 'not', 200, 0, 'n');
    g = addBlock(g, 'output', 400, 0, 'q');
    const first = connect(g, 'i1', 'n', 0, 'l1');
    if (!first.ok) throw new Error(first.reason);
    const second = connect(first.graph, 'i2', 'n', 0, 'l2');
    if (!second.ok) throw new Error(second.reason);
    expect(second.graph.links.map((l) => l.id)).toEqual(['l2']);
    expect(connect(g, 'q', 'n', 0, 'x').ok).toBe(false); // outputs drive nothing
    expect(connect(g, 'i1', 'n', 3, 'x').ok).toBe(false); // NOT has one pin
    expect(connect(g, 'n', 'n', 0, 'x').ok).toBe(false);
  });

  it('drops a block\'s wires with it', () => {
    const demo = createDemoDiagram();
    const trimmed = removeBlock(demo, 'b3');
    expect(trimmed.links.some((l) => l.from === 'b3' || l.to === 'b3')).toBe(false);
    expect(trimmed.blocks).toHaveLength(demo.blocks.length - 1);
  });

  it('numbers timers from T37 and latches from M0.0 in block order', () => {
    const demo = createDemoDiagram();
    expect([...timerInstances(demo).values()]).toEqual(['T37']);
    expect([...markerIndices(demo).values()]).toEqual([0]);
  });

  it('gives every kind a symbol pin count that matches its inputs', () => {
    expect(KINDS.and.pins).toHaveLength(4);
    expect(KINDS.xor.pins).toHaveLength(2);
    expect(KINDS.input.pins).toHaveLength(0);
  });
});

describe('the demo diagram', () => {
  it('compiles cleanly for the LOGO! 0BA8', () => {
    const result = compileFbd(createDemoDiagram(), LOGO_0BA8);
    expect(result.diagnostics).toEqual([]);
    // stateful blocks first (latch set, latch reset, timer), then the outputs that read them
    expect(result.networks.map((n) => n.title)).toEqual(['M0.0 set', 'M0.0 reset', 'T37 TON', 'Q1', 'Q2']);
  });
});

describe('link routing', () => {
  it('is a straight run on one row and a three-segment step otherwise', () => {
    expect(routeLink({ x: 100, y: 30 }, { x: 300, y: 30 })).toBe('M 100 30 H 300');
    expect(routeLink({ x: 100, y: 30 }, { x: 300, y: 90 })).toBe('M 100 30 H 200 V 90 H 300');
  });

  it('doubles back around the block when the target is to the left', () => {
    const d = routeLink({ x: 300, y: 30 }, { x: 100, y: 90 });
    expect(d).toBe('M 300 30 H 320 V 60 H 80 V 90 H 100');
  });

  it('only ever emits whole-pixel orthogonal segments', () => {
    for (const [a, b] of [[{ x: 120, y: 50 }, { x: 260, y: 110 }], [{ x: 260, y: 110 }, { x: 120, y: 50 }], [{ x: 100, y: 70 }, { x: 100, y: 70 }]] as const) {
      const d = routeLink(a, b);
      expect(d).toMatch(/^M [\d ]+( [HV] \d+)+$/);
      for (const n of d.match(/\d+/g) ?? []) expect(Number.isInteger(Number(n))).toBe(true);
    }
  });
});

describe('diagram files', () => {
  it('round-trips a diagram exactly', () => {
    const demo = createDemoDiagram();
    const parsed = parseFbd(serializeFbd(demo));
    expect(parsed).toEqual({ ok: true, graph: demo });
  });

  it.each([
    ['not json', '{'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1, graph: { blocks: [], links: [] } })],
    ['wrong version', JSON.stringify({ format: 'mae-logo-fbd', version: 9, graph: { blocks: [], links: [] } })],
    ['unknown block kind', JSON.stringify({ format: 'mae-logo-fbd', version: 1, graph: { blocks: [{ id: 'a', kind: 'lad', x: 0, y: 0 }], links: [] } })],
    ['dangling link', JSON.stringify({ format: 'mae-logo-fbd', version: 1, graph: { blocks: [{ id: 'a', kind: 'input', x: 0, y: 0 }], links: [{ id: 'l', from: 'a', to: 'zz', pin: 0 }] } })],
  ])('rejects %s', (_name, text) => {
    expect(parseFbd(text).ok).toBe(false);
  });
});
