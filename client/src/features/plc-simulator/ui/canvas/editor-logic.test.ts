import { describe, expect, it } from 'vitest';
import { validateNetworkLayout, type Branch, type LadNode, type Network } from '../../domain/ast';
import { S7_200_CPU224 } from '../../domain/hardware';
import { buildNetworkTree } from '../../engine/compiler';
import { ilToLad } from '../../transpiler';
import { PALETTE_CATEGORIES } from '../palette/catalog';
import { checkPlacement, createEditorReducer, createInitialState, type EditorAction, type EditorState } from './editor-reducer';
import { CELL_WIDTH, RAIL_X, boundaryX, cellFromPoint, rowY } from './geometry';
import { addLane, addParallelBranch, createEmptyNetwork, placeItem, removeNodes, resolveBranch } from './network-edit';
import { slotsOf, validateSlot, writeSlot } from './operand-slots';
import { planWiring } from './wiring';

const profile = S7_200_CPU224;
const limits = profile.limits;
const ctx = { usedInstances: new Set<string>() };

const at = (row: number, col: number, branchId: string | null = null, rowSpan = 1) => ({ row, col, rowSpan, colSpan: 1, branchId });
const contact = (id: string, operand: string, row: number, col: number, branchId: string | null = null): LadNode => ({
  id, type: 'contact', variant: 'NO', operand, layout: at(row, col, branchId),
});
const coil = (id: string, target: string, row: number, col: number, branchId: string | null = null): LadNode => ({
  id, type: 'coil', variant: 'OUT', target, layout: at(row, col, branchId),
});
const net = (nodes: LadNode[], branches: Branch[] = [], cols = 8): Network => ({
  id: 'n', grid: { rows: 4, cols }, nodes, branches,
});

const plan = (network: Network) => planWiring(network, buildNetworkTree(network));

describe('geometry', () => {
  it('keeps every coordinate an integer so 2px wires stay crisp', () => {
    for (let b = 0; b < 12; b++) expect(Number.isInteger(boundaryX(b))).toBe(true);
    for (let r = 0; r < 12; r++) expect(Number.isInteger(rowY(r))).toBe(true);
  });

  it('maps a point back to its cell', () => {
    expect(cellFromPoint(RAIL_X + CELL_WIDTH * 2 + 5, 20, 8, 4)).toEqual({ row: 0, col: 2 });
    expect(cellFromPoint(0, 0, 8, 4)).toBeNull();
  });
});

describe('planWiring', () => {
  it('fills every gap between the last contact and the right rail', () => {
    const p = plan(net([contact('a', 'I0.0', 0, 1), coil('q', 'Q0.0', 0, 3)]));
    const row0 = p.hSegments.filter((s) => s.row === 0).map((s) => [s.from, s.to]);
    // rail -> a, a -> q, q -> right rail; nothing overlaps and nothing is left open.
    expect(row0).toEqual([[0, 1], [2, 3], [4, 8]]);
  });

  it('bridges a symbol seamlessly: segments end exactly where its cell begins', () => {
    const p = plan(net([contact('a', 'I0.0', 0, 2)]));
    const seg = p.hSegments.find((s) => s.to === 2);
    expect(seg).toBeDefined();
    expect(boundaryX(2)).toBe(RAIL_X + 2 * CELL_WIDTH);
  });

  it('routes a parallel group with split and merge rails and T-junction dots', () => {
    const branch: Branch = { id: 'b', parentId: null, splitCol: 0, mergeCol: 1, rowStart: 0, rowEnd: 1 };
    const p = plan(net(
      [contact('a', 'I0.0', 0, 0, 'b'), contact('c', 'I0.1', 1, 0, 'b'), coil('q', 'Q0.0', 0, 3)],
      [branch],
    ));
    expect(p.vSegments.map((v) => [v.boundary, v.fromRow, v.toRow])).toEqual([[0, 0, 1], [2, 0, 1]]);
    // Row 0 is a T at both rails; row 1 is a plain corner and gets no dot.
    expect(p.junctions.map((j) => [j.boundary, j.row])).toEqual([[0, 0], [2, 0]]);
    // The lower lane's second cell is wired out to the merge rail.
    expect(p.hSegments.some((s) => s.row === 1 && s.from === 1 && s.to === 2)).toBe(true);
    // And the gap between the merge rail and the coil on the main lane.
    expect(p.hSegments.some((s) => s.row === 0 && s.from === 2 && s.to === 3)).toBe(true);
  });

  it('runs parallel output lanes to the right rail without a merge rail', () => {
    const branch: Branch = { id: 'b', parentId: null, splitCol: 1, mergeCol: 1, rowStart: 0, rowEnd: 1 };
    const p = plan(net(
      [contact('a', 'I0.0', 0, 0), coil('q1', 'Q0.0', 0, 1, 'b'), coil('q2', 'Q0.1', 1, 1, 'b')],
      [branch],
    ));
    expect(p.vSegments).toHaveLength(1);
    expect(p.hSegments.some((s) => s.row === 1 && s.to === 8)).toBe(true);
    expect(p.hSegments.some((s) => s.row === 0 && s.to === 8)).toBe(true);
  });

  it('does not run a parent rail through the rows a nested group claims', () => {
    const outer: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 2, rowStart: 0, rowEnd: 2 };
    const inner: Branch = { id: 'b2', parentId: 'b1', splitCol: 1, mergeCol: 1, rowStart: 1, rowEnd: 2 };
    const p = plan(net(
      [
        contact('t', 'I0.0', 0, 0, 'b1'), contact('m', 'I0.1', 1, 0, 'b1'),
        contact('ia', 'I0.2', 1, 1, 'b2'), contact('ib', 'I0.3', 2, 1, 'b2'),
        coil('q', 'Q0.0', 0, 4),
      ],
      [outer, inner],
    ));
    const outerRail = p.vSegments.find((v) => v.boundary === 0);
    expect(outerRail).toMatchObject({ fromRow: 0, toRow: 1 });
    expect(p.vSegments.some((v) => v.boundary === 1 && v.fromRow === 1 && v.toRow === 2)).toBe(true);
  });

  it('wires a counter pin chain from the rail to the box and never draws over the box', () => {
    const counter: LadNode = {
      id: 'c', type: 'counter', fn: 'CTU', instance: 'C0',
      inputs: { CU: { kind: 'flow' }, R: { kind: 'flow' }, PV: { kind: 'constant', value: 5 } },
      outputs: {}, layout: at(0, 2, null, 2),
    };
    const p = plan(net([contact('cu', 'I0.0', 0, 0), contact('r', 'I0.1', 1, 0), counter]));
    expect(p.orphanIds.size).toBe(0);
    const leaf = p.leaves.find((l) => l.node.id === 'c');
    expect(leaf?.pinFlows).toHaveLength(2);
    // Row 1: rail -> contact, contact -> box left edge.
    expect(p.hSegments.filter((s) => s.row === 1).map((s) => [s.from, s.to])).toEqual([[1, 2]]);
    // No segment crosses the box's own column on either of its rows.
    for (const s of p.hSegments.filter((seg) => seg.row <= 1)) expect(s.from >= 3 || s.to <= 2).toBe(true);
  });

  it('flags unreachable nodes instead of silently wiring them', () => {
    const p = plan(net([contact('a', 'I0.0', 0, 0), contact('lost', 'I0.1', 2, 0)]));
    expect(Array.from(p.orphanIds)).toEqual(['lost']);
  });

  it('never emits overlapping segments on a row', () => {
    const branch: Branch = { id: 'b', parentId: null, splitCol: 1, mergeCol: 2, rowStart: 0, rowEnd: 1 };
    const p = plan(net(
      [contact('a', 'I0.0', 0, 0), contact('b1', 'I0.1', 0, 1, 'b'), contact('b2', 'I0.2', 1, 1, 'b'), coil('q', 'Q0.0', 0, 4)],
      [branch],
    ));
    for (let row = 0; row < 3; row++) {
      const spans = p.hSegments.filter((s) => s.row === row).sort((a, b) => a.from - b.from);
      spans.forEach((s, i) => {
        const next = spans[i + 1];
        if (next) expect(s.to).toBeLessThanOrEqual(next.from);
      });
    }
  });
});

describe('palette catalogue', () => {
  it('offers every instruction the brief lists', () => {
    const labels = PALETTE_CATEGORIES.flatMap((c) => c.items.map((i) => i.label));
    for (const expected of ['NO', 'NC', 'Coil', 'Set', 'Reset', 'TON', 'TOF', 'TONR', 'CTU', 'CTD', 'CTUD',
      '==', '<>', '>=', '<=', '>', '<', 'ADD', 'SUB', 'MUL', 'DIV', 'SQR', 'SIN', 'W-AND', 'W-OR']) {
      expect(labels).toContain(expected);
    }
  });

  it('creates nodes the engine compiler accepts, for every palette entry', () => {
    for (const category of PALETTE_CATEGORIES) {
      for (const item of category.items) {
        const network = createEmptyNetwork('n');
        const result = placeItem(network, { itemId: item.id, nodeId: 'x', row: 0, col: 1 }, ctx, limits);
        expect(result.ok, `${item.id} should place on an empty rung`).toBe(true);
        if (result.ok) {
          expect(validateNetworkLayout(result.network)).toEqual([]);
          expect(result.network.nodes[0]?.layout.rowSpan).toBe(item.rowSpan);
        }
      }
    }
  });

  it('picks unused timer instances from the right pool', () => {
    const taken = new Set(['T37', 'T38']);
    const result = placeItem(createEmptyNetwork('n'), { itemId: 'timer-ton', nodeId: 'x', row: 0, col: 0 }, { usedInstances: taken }, limits);
    expect(result.ok && result.network.nodes[0]?.type === 'timer' ? result.network.nodes[0].instance : '').toBe('T39');
  });
});

describe('network edits', () => {
  const start = (): Network => {
    const r = placeItem(createEmptyNetwork('n'), { itemId: 'contact-no', nodeId: 'a', row: 0, col: 0 }, ctx, limits);
    if (!r.ok) throw new Error(r.reason);
    return r.network;
  };

  it('refuses an occupied cell', () => {
    const r = placeItem(start(), { itemId: 'coil-out', nodeId: 'b', row: 0, col: 0 }, ctx, limits);
    expect(r).toMatchObject({ ok: false });
  });

  it('refuses a row the engine never evaluates, with a hint about branches', () => {
    const r = placeItem(start(), { itemId: 'contact-no', nodeId: 'b', row: 1, col: 3 }, ctx, limits);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('branch');
  });

  it('respects the CPU grid limit', () => {
    const r = placeItem(start(), { itemId: 'contact-no', nodeId: 'b', row: 0, col: limits.maxGridCols }, ctx, limits);
    expect(r.ok).toBe(false);
  });

  it('adds a parallel branch under an element and then accepts a contact in the new lane', () => {
    const withBranch = addParallelBranch(start(), 'a', limits, 'br');
    expect(withBranch.ok).toBe(true);
    if (!withBranch.ok) return;
    expect(withBranch.network.branches).toEqual([
      { id: 'br', parentId: null, splitCol: 0, mergeCol: 0, rowStart: 0, rowEnd: 1 },
    ]);
    expect(resolveBranch(withBranch.network, 1, 0)).toBe('br');

    const filled = placeItem(withBranch.network, { itemId: 'contact-nc', nodeId: 'b', row: 1, col: 0 }, ctx, limits);
    expect(filled.ok).toBe(true);
    if (filled.ok) {
      expect(filled.network.nodes.find((n) => n.id === 'b')?.layout.branchId).toBe('br');
      expect(validateNetworkLayout(filled.network)).toEqual([]);
    }
  });

  it('refuses a branch when the row below is occupied', () => {
    const base = start();
    const blocked: Network = { ...base, nodes: [...base.nodes, contact('x', 'I0.5', 1, 0, null)] };
    expect(addParallelBranch(blocked, 'a', limits, 'br').ok).toBe(false);
  });

  it('adds a lane to an existing branch', () => {
    const b = addParallelBranch(start(), 'a', limits, 'br');
    if (!b.ok) throw new Error(b.reason);
    const lane = addLane(b.network, 'br', limits);
    expect(lane.ok && lane.network.branches[0]?.rowEnd).toBe(2);
  });

  it('dissolves a branch when its extra lane is emptied', () => {
    const b = addParallelBranch(start(), 'a', limits, 'br');
    if (!b.ok) throw new Error(b.reason);
    const filled = placeItem(b.network, { itemId: 'contact-nc', nodeId: 'b', row: 1, col: 0 }, ctx, limits);
    if (!filled.ok) throw new Error(filled.reason);

    const after = removeNodes(filled.network, ['b']);
    expect(after.branches).toEqual([]);
    expect(after.nodes.map((n) => n.layout.branchId)).toEqual([null]);
    expect(after.grid.rows).toBe(1);
  });

  it('keeps the engine and the wire plan in agreement after edits', () => {
    const b = addParallelBranch(start(), 'a', limits, 'br');
    if (!b.ok) throw new Error(b.reason);
    const filled = placeItem(b.network, { itemId: 'contact-nc', nodeId: 'b', row: 1, col: 0 }, ctx, limits);
    if (!filled.ok) throw new Error(filled.reason);
    expect(plan(filled.network).orphanIds.size).toBe(0);
  });
});

describe('operand slots', () => {
  const nodeOf = (id: Parameters<typeof placeItem>[1]['itemId']): LadNode => {
    const r = placeItem(createEmptyNetwork('n'), { itemId: id, nodeId: 'x', row: 0, col: 0 }, ctx, limits);
    if (!r.ok || !r.network.nodes[0]) throw new Error('setup');
    return r.network.nodes[0];
  };

  it('validates addresses against the active profile', () => {
    const c = nodeOf('contact-no');
    expect(validateSlot(c, 'operand', 'I0.7', profile)).toBeNull();
    expect(validateSlot(c, 'operand', 'I1.6', profile)).toContain('exceeds');
    expect(validateSlot(c, 'operand', 'VW0', profile)).toContain('bit');
    expect(validateSlot(c, 'operand', '', profile)).toContain('required');
    expect(validateSlot(c, 'operand', 'I0.0', { ...profile, allowedPrefixes: ['Q'] })).not.toBeNull();
  });

  it('accepts constants only where a constant is legal', () => {
    const timer = nodeOf('timer-ton');
    expect(validateSlot(timer, 'PT', '50', profile)).toBeNull();
    expect(validateSlot(timer, 'PT', '99999', profile)).toContain('range');
    expect(validateSlot(timer, 'instance', '5', profile)).not.toBeNull();
    expect(validateSlot(timer, 'instance', 'C3', profile)).toContain('T instance');
  });

  it('requires the operand width the data type demands', () => {
    const add = nodeOf('math-add');
    expect(validateSlot(add, 'in1', 'VW4', profile)).toBeNull();
    expect(validateSlot(add, 'in1', 'VD4', profile)).toContain('word');
    expect(validateSlot(add, 'out', '7', profile)).toContain('address');
  });

  it('writes a validated slot back into the node', () => {
    const c = nodeOf('contact-no');
    expect(writeSlot(c, 'operand', ' i0.3 ')).toMatchObject({ operand: 'I0.3' });
    const add = nodeOf('math-add');
    expect(writeSlot(add, 'in2', '16#FF')).toMatchObject({ in2: { kind: 'constant', value: 255 } });
    expect(slotsOf(add).map((s) => s.key)).toEqual(['in1', 'in2', 'out']);
  });
});

describe('editor reducer', () => {
  const reduce = createEditorReducer(profile);
  const run = (state: EditorState, ...actions: EditorAction[]): EditorState => actions.reduce(reduce, state);
  const fresh = (): EditorState => createInitialState([], profile);
  const netId = (s: EditorState): string => s.present[0]?.id ?? '';

  it('places, selects and supports undo / redo', () => {
    let s = fresh();
    s = run(s, { type: 'placeItem', networkId: netId(s), itemId: 'contact-no', row: 0, col: 0 });
    expect(s.present[0]?.nodes).toHaveLength(1);
    expect(s.selection.nodeId).not.toBeNull();

    s = run(s, { type: 'undo' });
    expect(s.present[0]?.nodes).toHaveLength(0);
    s = run(s, { type: 'redo' });
    expect(s.present[0]?.nodes).toHaveLength(1);
  });

  it('records why an edit was refused without touching history', () => {
    let s = fresh();
    s = run(s, { type: 'placeItem', networkId: netId(s), itemId: 'contact-no', row: 3, col: 0 });
    expect(s.notice).not.toBeNull();
    expect(s.past).toHaveLength(0);
  });

  it('deletes the selected element', () => {
    let s = fresh();
    s = run(s, { type: 'placeItem', networkId: netId(s), itemId: 'coil-out', row: 0, col: 2 }, { type: 'deleteSelection' });
    expect(s.present[0]?.nodes).toHaveLength(0);
    expect(s.past).toHaveLength(2);
  });

  it('caps history depth', () => {
    let s = fresh();
    for (let i = 0; i < 130; i++) s = run(s, { type: 'renameNetwork', networkId: netId(s), title: `t${i}` });
    expect(s.past.length).toBe(100);
  });

  it('refuses to delete the last network', () => {
    const s = run(fresh(), { type: 'deleteNetwork', networkId: 'net_1' });
    expect(s.present).toHaveLength(1);
    expect(s.notice).toContain('at least one');
  });

  it('never mints a node id that is already in use', () => {
    const loaded = ilToLad('LD I0.0\n= Q0.0', profile).value ?? [];
    let s = createInitialState(loaded, profile);
    s = run(s, { type: 'placeItem', networkId: netId(s), itemId: 'contact-no', row: 0, col: 3 });
    const ids = s.present[0]?.nodes.map((n) => n.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('checks a placement without committing it', () => {
    const s = fresh();
    expect(checkPlacement(s.present, netId(s), 'contact-no', 0, 0, profile)).toBeNull();
    expect(checkPlacement(s.present, netId(s), 'contact-no', 2, 0, profile)).not.toBeNull();
    expect(s.present[0]?.nodes).toHaveLength(0);
  });

  describe('LAD <-> STL', () => {
    it('regenerates STL from the ladder when entering the STL view', () => {
      let s = fresh();
      s = run(s,
        { type: 'placeItem', networkId: netId(s), itemId: 'contact-no', row: 0, col: 0 },
        { type: 'placeItem', networkId: netId(s), itemId: 'coil-out', row: 0, col: 2 },
        { type: 'enterStl' },
      );
      expect(s.view).toBe('STL');
      expect(s.stl.draft).toContain('LD     I0.0');
      expect(s.stl.draft).toContain('=      Q0.0');
    });

    it('rebuilds the ladder from edited STL on return', () => {
      let s = run(fresh(), { type: 'enterStl' });
      s = run(s, { type: 'stlChange', text: 'NETWORK 1 // Seal\nLD I0.0\nO Q0.0\nAN I0.1\n= Q0.0' }, { type: 'leaveStl' });
      expect(s.view).toBe('LAD');
      const network = s.present[0];
      expect(network?.title).toBe('Seal');
      expect(network?.nodes).toHaveLength(4);
      expect(network?.branches).toHaveLength(1);
      // The import is one undo step.
      expect(run(s, { type: 'undo' }).present[0]?.nodes).toHaveLength(0);
    });

    it('stays in STL, keeping the text, when the source has errors', () => {
      let s = run(fresh(), { type: 'enterStl' });
      s = run(s, { type: 'stlChange', text: 'LD I0.0\nA I1.6\n= Q0.0' }, { type: 'leaveStl' });
      expect(s.view).toBe('STL');
      expect(s.stl.draft).toContain('I1.6');
      expect(s.stl.diagnostics.some((d) => d.severity === 'error')).toBe(true);
      expect(s.notice).not.toBeNull();
    });

    it('lets the user abandon an invalid draft', () => {
      let s = run(fresh(), { type: 'enterStl' }, { type: 'stlChange', text: '???' }, { type: 'discardStl' });
      expect(s.view).toBe('LAD');
      expect(s.present).toHaveLength(1);
    });

    it('leaves the ladder untouched when STL was viewed but not edited', () => {
      let s = fresh();
      s = run(s, { type: 'placeItem', networkId: netId(s), itemId: 'coil-out', row: 0, col: 0 });
      const before = s.present;
      s = run(s, { type: 'enterStl' }, { type: 'leaveStl' });
      expect(s.present).toBe(before);
    });

    it('round-trips a branch built on the canvas through STL and back', () => {
      let s = fresh();
      const id = netId(s);
      s = run(s, { type: 'placeItem', networkId: id, itemId: 'contact-no', row: 0, col: 0 });
      s = run(s, { type: 'addBranch', networkId: id, nodeId: s.present[0]?.nodes[0]?.id ?? '' });
      s = run(s, { type: 'placeItem', networkId: id, itemId: 'contact-nc', row: 1, col: 0 });
      s = run(s, { type: 'placeItem', networkId: id, itemId: 'coil-out', row: 0, col: 2 });
      expect(s.present[0]?.branches).toHaveLength(1);

      s = run(s, { type: 'enterStl' });
      expect(s.stl.draft).toContain('LD     I0.0');
      expect(s.stl.draft).toContain('ON     I0.0');

      // Touch the text so the return trip really rebuilds from STL.
      s = run(s, { type: 'stlChange', text: `${s.stl.draft}\n` }, { type: 'leaveStl' });
      expect(s.view).toBe('LAD');
      expect(s.present[0]?.branches).toHaveLength(1);
      expect(s.present[0]?.nodes.map((n) => n.type).sort()).toEqual(['coil', 'contact', 'contact']);
    });
  });
});
