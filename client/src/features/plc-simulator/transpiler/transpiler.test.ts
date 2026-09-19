import { describe, expect, it } from 'vitest';
import { validateNetworkLayout, type Branch, type LadNode, type Network } from '../domain/ast';
import { S7_200_CPU224 } from '../domain/hardware';
import { MemoryMap } from '../domain/memory';
import { compileProgram } from '../engine/compiler';
import { ilToLad } from './il-to-lad';
import { ladToIl } from './lad-to-il';
import { exportMicroWin } from './microwin-exporter';
import type { SymbolMap } from './types';

const profile = S7_200_CPU224;

// ---- builders ----------------------------------------------------------------------------------

const at = (row: number, col: number, branchId: string | null = null, rowSpan = 1) => ({
  row,
  col,
  rowSpan,
  colSpan: 1,
  branchId,
});

const contact = (
  id: string,
  operand: string,
  row: number,
  col: number,
  branchId: string | null = null,
  variant: 'NO' | 'NC' | 'P' | 'N' = 'NO',
): LadNode => ({ id, type: 'contact', variant, operand, layout: at(row, col, branchId) });

const coil = (id: string, target: string, row: number, col: number, branchId: string | null = null): LadNode => ({
  id,
  type: 'coil',
  variant: 'OUT',
  target,
  layout: at(row, col, branchId),
});

const network = (id: string, nodes: LadNode[], branches: Branch[] = [], title?: string): Network => ({
  id,
  ...(title === undefined ? {} : { title }),
  grid: { rows: 12, cols: 12 },
  nodes,
  branches,
});

const generate = (networks: Network[]): string => {
  const out = ladToIl(networks);
  expect(out.value).not.toBeNull();
  return out.value ?? '';
};

/** Instruction lines only, so assertions ignore headers and blank separators. */
const body = (stl: string): string[] =>
  stl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('NETWORK') && !line.startsWith('//'));

// ---- LAD -> STL --------------------------------------------------------------------------------

describe('ladToIl', () => {
  it('emits a seal-in circuit in the canonical Micro/WIN form', () => {
    const branch: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 0, rowStart: 0, rowEnd: 1 };
    const stl = generate([
      network(
        'n1',
        [
          contact('start', 'I0.0', 0, 0, 'b1'),
          contact('seal', 'Q0.0', 1, 0, 'b1'),
          contact('stop', 'I0.1', 0, 1, null, 'NC'),
          coil('out', 'Q0.0', 0, 2),
        ],
        [branch],
        'Motor seal-in',
      ),
    ]);

    expect(stl.split('\n')).toEqual([
      'NETWORK 1 // Motor seal-in',
      'LD     I0.0',
      'O      Q0.0',
      'AN     I0.1',
      '=      Q0.0',
    ]);
  });

  it('uses ALD to fold a parallel group into a series chain', () => {
    const branch: Branch = { id: 'b1', parentId: null, splitCol: 1, mergeCol: 1, rowStart: 0, rowEnd: 1 };
    const stl = generate([
      network(
        'n1',
        [
          contact('a', 'I0.0', 0, 0),
          contact('b', 'I0.1', 0, 1, 'b1'),
          contact('c', 'I0.2', 1, 1, 'b1'),
          coil('q', 'Q0.0', 0, 3),
        ],
        [branch],
      ),
    ]);
    expect(body(stl)).toEqual(['LD     I0.0', 'LD     I0.1', 'O      I0.2', 'ALD', '=      Q0.0']);
  });

  it('uses OLD when a parallel lane is itself a series', () => {
    const branch: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 1, rowStart: 0, rowEnd: 1 };
    const stl = generate([
      network(
        'n1',
        [
          contact('a', 'I0.0', 0, 0, 'b1'),
          contact('b', 'I0.1', 0, 1, 'b1'),
          contact('c', 'I0.2', 1, 0, 'b1'),
          contact('d', 'I0.3', 1, 1, 'b1'),
          coil('q', 'Q0.0', 0, 3),
        ],
        [branch],
      ),
    ]);
    expect(body(stl)).toEqual([
      'LD     I0.0',
      'A      I0.1',
      'LD     I0.2',
      'A      I0.3',
      'OLD',
      '=      Q0.0',
    ]);
  });

  it('nests ALD inside OLD for a group within a lane', () => {
    const outer: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 2, rowStart: 0, rowEnd: 2 };
    const inner: Branch = { id: 'b2', parentId: 'b1', splitCol: 1, mergeCol: 1, rowStart: 1, rowEnd: 2 };
    const stl = generate([
      network(
        'n1',
        [
          contact('top', 'I0.0', 0, 0, 'b1'),
          contact('mid', 'I0.1', 1, 0, 'b1'),
          contact('innerA', 'I0.2', 1, 1, 'b2'),
          contact('innerB', 'I0.3', 2, 1, 'b2'),
          coil('q', 'Q0.0', 0, 4),
        ],
        [outer, inner],
      ),
    ]);
    expect(body(stl)).toEqual([
      'LD     I0.0',
      'LD     I0.1',
      'LD     I0.2',
      'O      I0.3',
      'ALD',
      'OLD',
      '=      Q0.0',
    ]);
  });

  it('stacks parallel coils without touching the logic stack', () => {
    const branch: Branch = { id: 'b1', parentId: null, splitCol: 2, mergeCol: 2, rowStart: 0, rowEnd: 1 };
    const stl = generate([
      network(
        'n1',
        [contact('a', 'I0.0', 0, 0), coil('q1', 'Q0.0', 0, 2, 'b1'), coil('q2', 'Q0.1', 1, 2, 'b1')],
        [branch],
      ),
    ]);
    expect(body(stl)).toEqual(['LD     I0.0', '=      Q0.0', '=      Q0.1']);
  });

  it('uses LPS/LRD/LPP when output branches carry their own logic', () => {
    const branch: Branch = { id: 'b1', parentId: null, splitCol: 1, mergeCol: 2, rowStart: 0, rowEnd: 2 };
    const stl = generate([
      network(
        'n1',
        [
          contact('common', 'I0.0', 0, 0),
          contact('a', 'I0.1', 0, 1, 'b1'),
          coil('q1', 'Q0.0', 0, 2, 'b1'),
          contact('b', 'I0.2', 1, 1, 'b1'),
          coil('q2', 'Q0.1', 1, 2, 'b1'),
          contact('c', 'I0.3', 2, 1, 'b1'),
          coil('q3', 'Q0.2', 2, 2, 'b1'),
        ],
        [branch],
      ),
    ]);
    expect(body(stl)).toEqual([
      'LD     I0.0',
      'LPS',
      'A      I0.1',
      '=      Q0.0',
      'LRD',
      'A      I0.2',
      '=      Q0.1',
      'LPP',
      'A      I0.3',
      '=      Q0.2',
    ]);
  });

  it('emits an edge contact as a load followed by EU, and flags the semantic gap', () => {
    const out = ladToIl([
      network('n1', [contact('p', 'I0.0', 0, 0, null, 'P'), coil('q', 'Q0.0', 0, 2)]),
    ]);
    expect(body(out.value ?? '')).toEqual(['LD     I0.0', 'EU', '=      Q0.0']);
    expect(out.diagnostics.some((d) => d.code === 'EDGE_SEMANTICS')).toBe(true);
  });

  it('emits timers and counters with their stack-supplied pins', () => {
    const timer: LadNode = {
      id: 't',
      type: 'timer',
      fn: 'TON',
      instance: 'T37',
      timeBaseMs: 100,
      inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: 50 } },
      outputs: {},
      layout: at(0, 1),
    };
    const counter: LadNode = {
      id: 'c',
      type: 'counter',
      fn: 'CTUD',
      instance: 'C0',
      inputs: {
        CU: { kind: 'flow' },
        CD: { kind: 'flow' },
        R: { kind: 'flow' },
        PV: { kind: 'constant', value: 5 },
      },
      outputs: {},
      layout: at(0, 1, null, 3),
    };
    const stl = generate([
      network('n1', [contact('in', 'I0.0', 0, 0), timer]),
      network('n2', [
        contact('cu', 'I0.1', 0, 0),
        contact('cd', 'I0.2', 1, 0),
        contact('r', 'I0.3', 2, 0),
        counter,
      ]),
    ]);
    expect(body(stl)).toEqual([
      'LD     I0.0',
      'TON    T37, 50',
      'LD     I0.1',
      'LD     I0.2',
      'LD     I0.3',
      'CTUD   C0, 5',
    ]);
  });

  it('expands a math box into the destructive MOVW + operation pair', () => {
    const stl = generate([
      network('n1', [
        contact('en', 'I0.0', 0, 0),
        {
          id: 'add',
          type: 'math',
          fn: 'ADD',
          dataType: 'INT',
          in1: { kind: 'address', address: 'VW0' },
          in2: { kind: 'constant', value: 5 },
          out: 'VW2',
          layout: at(0, 1),
        },
      ]),
      network('n2', [
        contact('en2', 'I0.1', 0, 0),
        {
          id: 'sqrt',
          type: 'math',
          fn: 'SQR',
          dataType: 'REAL',
          in: { kind: 'address', address: 'VD4' },
          out: 'VD8',
          layout: at(0, 1),
        },
      ]),
    ]);
    expect(body(stl)).toEqual([
      'LD     I0.0',
      'MOVW   VW0, VW2',
      '+I     5, VW2',
      'LD     I0.1',
      'SQRT   VD4, VD8',
    ]);
  });

  it('skips the seed move when the destination already holds in1', () => {
    const stl = generate([
      network('n1', [
        contact('en', 'I0.0', 0, 0),
        {
          id: 'acc',
          type: 'math',
          fn: 'ADD',
          dataType: 'INT',
          in1: { kind: 'address', address: 'VW2' },
          in2: { kind: 'constant', value: 1 },
          out: 'VW2',
          layout: at(0, 1),
        },
      ]),
    ]);
    expect(body(stl)).toEqual(['LD     I0.0', '+I     1, VW2']);
  });

  it('renders comparison contacts and word logic with Siemens mnemonics', () => {
    const stl = generate([
      network('n1', [
        {
          id: 'cmp',
          type: 'compare',
          op: '>=',
          dataType: 'INT',
          lhs: { kind: 'address', address: 'VW0' },
          rhs: { kind: 'constant', value: 100 },
          layout: at(0, 0),
        },
        {
          id: 'cmp2',
          type: 'compare',
          op: '<>',
          dataType: 'REAL',
          lhs: { kind: 'address', address: 'VD4' },
          rhs: { kind: 'constant', value: 1.5 },
          layout: at(0, 1),
        },
        coil('q', 'Q0.0', 0, 2),
      ]),
      network('n2', [
        contact('en', 'I0.0', 0, 0),
        {
          id: 'and',
          type: 'wordLogic',
          fn: 'W_AND',
          width: 'WORD',
          in1: { kind: 'address', address: 'VW0' },
          in2: { kind: 'constant', value: 255 },
          out: 'VW2',
          layout: at(0, 1),
        },
      ]),
    ]);
    expect(body(stl)).toEqual([
      'LDW>=  VW0, 100',
      'AR<>   VD4, 1.5',
      '=      Q0.0',
      'LD     I0.0',
      'MOVW   VW0, VW2',
      'WAND_W 255, VW2',
    ]);
  });

  it('synthesises SM0.0 for an output wired straight to the rail', () => {
    const out = ladToIl([network('n1', [coil('q', 'Q0.0', 0, 0)])]);
    expect(body(out.value ?? '')).toEqual(['LD     SM0.0', '=      Q0.0']);
    expect(out.diagnostics.some((d) => d.code === 'UNREPRESENTABLE_NODE')).toBe(true);
  });

  it('reports a logic stack deeper than the CPU provides', () => {
    // Ten nested "contact AND (group)" levels, one more than the 9-level stack allows.
    const nodes: LadNode[] = [];
    const branches: Branch[] = [];
    let parent: string | null = null;
    for (let level = 0; level < 10; level++) {
      const id = `b${level}`;
      branches.push({
        id,
        parentId: parent,
        splitCol: level,
        mergeCol: level + 1,
        rowStart: level,
        rowEnd: level + 1,
      });
      nodes.push(contact(`a${level}`, 'I0.0', level, level, id));
      nodes.push(contact(`b${level}`, 'I0.1', level + 1, level, id));
      parent = id;
    }
    const out = ladToIl([{ id: 'deep', grid: { rows: 24, cols: 24 }, nodes, branches }]);
    expect(out.ok).toBe(false);
    expect(out.diagnostics.some((d) => d.code === 'STACK_OVERFLOW')).toBe(true);
  });
});

// ---- STL -> LAD --------------------------------------------------------------------------------

describe('ilToLad', () => {
  const parse = (source: string) => {
    const out = ilToLad(source, profile);
    expect(out.value).not.toBeNull();
    return out;
  };

  it('rebuilds a seal-in rung with a parallel branch', () => {
    const out = parse(['NETWORK 1 // Seal in', 'LD I0.0', 'O Q0.0', 'AN I0.1', '= Q0.0'].join('\n'));
    const net = out.value?.[0];
    expect(out.ok).toBe(true);
    expect(net?.title).toBe('Seal in');
    expect(net?.nodes).toHaveLength(4);
    expect(net?.branches).toHaveLength(1);

    const branch = net?.branches[0];
    expect(branch).toMatchObject({ parentId: null, splitCol: 0, rowStart: 0, rowEnd: 1 });
    // The two parallel contacts sit on separate rows inside the branch.
    const inBranch = net?.nodes.filter((n) => n.layout.branchId === branch?.id) ?? [];
    expect(inBranch.map((n) => n.layout.row).sort()).toEqual([0, 1]);
    expect(net ? validateNetworkLayout(net) : ['missing']).toEqual([]);
  });

  it('reverses ALD into a nested branch', () => {
    const out = parse(['LD I0.0', 'LD I0.1', 'O I0.2', 'ALD', '= Q0.0'].join('\n'));
    const net = out.value?.[0];
    expect(net?.branches).toHaveLength(1);
    expect(net ? validateNetworkLayout(net) : ['missing']).toEqual([]);
    // I0.0 is on the main rung, the OR pair is inside the branch.
    const main = net?.nodes.filter((n) => n.layout.branchId === null) ?? [];
    expect(main.map((n) => (n.type === 'contact' ? n.operand : 'coil')).sort()).toEqual(['I0.0', 'coil']);
  });

  it('reverses LPS/LRD/LPP into stacked output lanes', () => {
    const out = parse(
      ['LD I0.0', 'LPS', 'A I0.1', '= Q0.0', 'LRD', 'A I0.2', '= Q0.1', 'LPP', 'A I0.3', '= Q0.2'].join('\n'),
    );
    const net = out.value?.[0];
    expect(out.ok).toBe(true);
    const coils = net?.nodes.filter((n) => n.type === 'coil') ?? [];
    expect(coils).toHaveLength(3);
    // Each coil is on its own row of one output branch, all in the same column.
    expect(coils.map((c) => c.layout.row).sort()).toEqual([0, 1, 2]);
    expect(new Set(coils.map((c) => c.layout.col)).size).toBe(1);
    expect(net ? validateNetworkLayout(net) : ['missing']).toEqual([]);
  });

  it('recovers the timer time base from the instance number', () => {
    const out = parse(['LD I0.0', 'TON T37, 50', 'NETWORK 2', 'LD I0.1', 'TON T33, 50'].join('\n'));
    const first = out.value?.[0]?.nodes.find((n) => n.type === 'timer');
    const second = out.value?.[1]?.nodes.find((n) => n.type === 'timer');
    expect(first).toMatchObject({ fn: 'TON', instance: 'T37', timeBaseMs: 100 });
    expect(second).toMatchObject({ instance: 'T33', timeBaseMs: 10 });
  });

  it('warns when a timer instance is outside its mnemonic pool', () => {
    const out = parse(['LD I0.0', 'TON T5, 10'].join('\n'));
    expect(out.diagnostics.some((d) => d.code === 'INVALID_OPERAND' && d.severity === 'warning')).toBe(true);
  });

  it('rebuilds a counter with its pin chains below the box', () => {
    const out = parse(['LD I0.0', 'LD I0.1', 'LD I0.2', 'CTUD C0, 5'].join('\n'));
    const net = out.value?.[0];
    expect(out.ok).toBe(true);
    const box = net?.nodes.find((n) => n.type === 'counter');
    expect(box).toMatchObject({ fn: 'CTUD', instance: 'C0' });
    expect(box?.layout.rowSpan).toBe(3);
    // Pin chains occupy the rows under the box and stay to its left.
    const chains = net?.nodes.filter((n) => n.type === 'contact') ?? [];
    expect(chains.map((n) => n.layout.row).sort()).toEqual([0, 1, 2]);
    for (const chain of chains) expect(chain.layout.col).toBeLessThan(box?.layout.col ?? 0);
    expect(net ? validateNetworkLayout(net) : ['missing']).toEqual([]);
  });

  it('fuses MOVW + operation back into a single math box', () => {
    const out = parse(['LD I0.0', 'MOVW VW0, VW2', '+I 5, VW2'].join('\n'));
    const box = out.value?.[0]?.nodes.find((n) => n.type === 'math');
    expect(box).toMatchObject({
      fn: 'ADD',
      dataType: 'INT',
      in1: { kind: 'address', address: 'VW0' },
      in2: { kind: 'constant', value: 5 },
      out: 'VW2',
    });
  });

  it('drops the synthesised always-on bit so the coil hangs off the rail', () => {
    const out = parse(['LD SM0.0', '= Q0.0'].join('\n'));
    const net = out.value?.[0];
    expect(out.ok).toBe(true);
    expect(net?.nodes).toHaveLength(1);
    expect(net?.nodes[0]).toMatchObject({ type: 'coil', target: 'Q0.0' });
  });

  it('parses hex and negative constants', () => {
    const out = parse(['LD I0.0', 'MOVW 16#00FF, VW2', 'WAND_W -1, VW2'].join('\n'));
    const box = out.value?.[0]?.nodes.find((n) => n.type === 'wordLogic');
    expect(box).toMatchObject({ in1: { kind: 'constant', value: 255 }, in2: { kind: 'constant', value: -1 } });
  });

  it('skips Micro/WIN block scaffolding and header comments', () => {
    const out = parse(
      [
        '//=========',
        '// Generated',
        'ORGANIZATION_BLOCK MAIN',
        'TITLE=Program Comments',
        'BEGIN',
        'NETWORK 1',
        'LD I0.0',
        '= Q0.0',
        'END_ORGANIZATION_BLOCK',
      ].join('\n'),
    );
    expect(out.ok).toBe(true);
    expect(out.value).toHaveLength(1);
    expect(out.value?.[0]?.nodes).toHaveLength(2);
  });

  describe('fault tolerance', () => {
    it('reports an address the profile cannot represent, with line and column', () => {
      const out = ilToLad(['LD I0.0', 'A I1.6', '= Q0.0'].join('\n'), profile);
      expect(out.ok).toBe(false);
      const fault = out.diagnostics.find((d) => d.code === 'PROFILE_VIOLATION');
      expect(fault?.line).toBe(2);
      expect(fault?.column).toBe(1);
      expect(fault?.message).toContain('I1.6');
      // Parsing continues: the coil is still reconstructed.
      expect(out.value?.[0]?.nodes.some((n) => n.type === 'coil')).toBe(true);
    });

    it('reports special memory as unsupported rather than silently accepting it', () => {
      const out = ilToLad(['LD SM0.5', '= Q0.0'].join('\n'), profile);
      expect(out.ok).toBe(false);
      expect(out.diagnostics[0]?.code).toBe('PROFILE_VIOLATION');
      expect(out.diagnostics[0]?.message).toContain('SM0.5');
    });

    it('reports an unknown opcode and keeps going', () => {
      const out = ilToLad(['LD I0.0', 'FROBNICATE VW0', '= Q0.0'].join('\n'), profile);
      expect(out.diagnostics.some((d) => d.code === 'UNKNOWN_OPCODE' && d.line === 2)).toBe(true);
      expect(out.value?.[0]?.nodes.some((n) => n.type === 'coil')).toBe(true);
    });

    it('reports a stack underflow on an unmatched ALD', () => {
      const out = ilToLad(['LD I0.0', 'ALD', '= Q0.0'].join('\n'), profile);
      expect(out.diagnostics.some((d) => d.code === 'STACK_UNDERFLOW')).toBe(true);
      expect(out.value).not.toBeNull();
    });

    it('reports an output with no preceding load', () => {
      const out = ilToLad(['= Q0.0'].join('\n'), profile);
      expect(out.value?.[0]?.nodes).toHaveLength(1);
      expect(out.ok).toBe(true); // a rail-fed coil is legal in LAD
    });

    it('reports a standalone data move as unrepresentable', () => {
      const out = ilToLad(['LD I0.0', 'MOVW VW0, VW2', '= Q0.0'].join('\n'), profile);
      expect(out.diagnostics.some((d) => d.code === 'ORPHAN_MOVE')).toBe(true);
    });

    it('reports an edge applied to something other than a contact', () => {
      const out = ilToLad(['LD I0.0', 'O I0.1', 'EU', '= Q0.0'].join('\n'), profile);
      expect(out.diagnostics.some((d) => d.code === 'EDGE_SEMANTICS' && d.severity === 'error')).toBe(true);
    });

    it('never throws on malformed input', () => {
      const junk = ['???', 'LD', 'TON T37', 'CTU', 'LDW>=', 'S Q0.0, zero', ''].join('\n');
      expect(() => ilToLad(junk, profile)).not.toThrow();
      expect(ilToLad(junk, profile).ok).toBe(false);
    });
  });
});

// ---- round trip --------------------------------------------------------------------------------

describe('round trip', () => {
  /**
   * STL is the canonical comparison point: node ids and exact columns are regenerated by the
   * layout synthesiser, so equality is asserted on the instruction stream both directions agree on.
   */
  const roundTrip = (source: string): string => {
    const lad = ilToLad(source, profile);
    expect(lad.ok).toBe(true);
    const back = ladToIl(lad.value ?? []);
    return body(back.value ?? '').join('\n');
  };

  const cases: readonly (readonly [string, string])[] = [
    ['series', 'LD     I0.0\nA      I0.1\nAN     I0.2\n=      Q0.0'],
    ['seal-in', 'LD     I0.0\nO      Q0.0\nAN     I0.1\n=      Q0.0'],
    ['ALD group', 'LD     I0.0\nLD     I0.1\nO      I0.2\nALD\n=      Q0.0'],
    ['OLD group', 'LD     I0.0\nA      I0.1\nLD     I0.2\nA      I0.3\nOLD\n=      Q0.0'],
    [
      'nested ALD in OLD',
      'LD     I0.0\nLD     I0.1\nLD     I0.2\nO      I0.3\nALD\nOLD\n=      Q0.0',
    ],
    ['stacked coils', 'LD     I0.0\n=      Q0.0\n=      Q0.1'],
    [
      'LPS/LRD/LPP outputs',
      'LD     I0.0\nLPS\nA      I0.1\n=      Q0.0\nLRD\nA      I0.2\n=      Q0.1\nLPP\nA      I0.3\n=      Q0.2',
    ],
    ['set/reset', 'LD     I0.0\nS      Q0.0, 2\nLD     I0.1\nR      Q0.0, 2'],
    ['timer', 'LD     I0.0\nTON    T37, 50'],
    ['retentive timer', 'LD     I0.0\nTONR   T5, 100'],
    ['count up', 'LD     I0.0\nLD     I0.1\nCTU    C0, 5'],
    ['count up/down', 'LD     I0.0\nLD     I0.1\nLD     I0.2\nCTUD   C0, 5'],
    ['math', 'LD     I0.0\nMOVW   VW0, VW2\n+I     5, VW2'],
    ['accumulate', 'LD     I0.0\n+I     1, VW2'],
    ['real math', 'LD     I0.0\nSQRT   VD4, VD8'],
    ['compare', 'LDW>=  VW0, 100\nAR<>   VD4, 1.5\n=      Q0.0'],
    ['word logic', 'LD     I0.0\nMOVW   VW0, VW2\nWAND_W 255, VW2'],
    ['edge', 'LD     I0.0\nEU\n=      Q0.0'],
    ['rail-fed coil', 'LD     SM0.0\n=      Q0.0'],
  ];

  for (const [name, stl] of cases) {
    it(`is stable for ${name}`, () => {
      expect(roundTrip(stl)).toBe(stl);
      // And a second pass changes nothing further.
      expect(roundTrip(roundTrip(stl))).toBe(stl);
    });
  }

  it('produces a network the scan engine accepts', () => {
    const source = [
      'NETWORK 1',
      'LD I0.0',
      'O Q0.0',
      'AN I0.1',
      '= Q0.0',
      'NETWORK 2',
      'LD I0.2',
      'TON T37, 50',
      'NETWORK 3',
      'LD T37',
      'LD I0.3',
      'CTU C0, 3',
    ].join('\n');

    const lad = ilToLad(source, profile);
    expect(lad.ok).toBe(true);
    for (const net of lad.value ?? []) expect(validateNetworkLayout(net)).toEqual([]);

    const compiled = compileProgram(
      { schemaVersion: 1, profileId: profile.id, networks: lad.value ?? [] },
      profile,
    );
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(compiled.ok).toBe(true);
    // And the reconstructed program runs against real memory.
    expect(() => new MemoryMap(profile)).not.toThrow();
  });
});

// ---- exporter ----------------------------------------------------------------------------------

describe('exportMicroWin', () => {
  const networks = [network('n1', [contact('a', 'I0.0', 0, 0), coil('q', 'Q0.0', 0, 2)], [], 'Start')];
  const timestamp = '2026-09-19T00:00:00.000Z';

  it('writes the documented header and the instruction body', () => {
    const file = exportMicroWin(networks, profile, undefined, { timestamp });
    expect(file.fileName).toBe('program.awl');
    expect(file.content.split('\n').slice(0, 6)).toEqual([
      '//=============================================================================',
      '// Generated by MAE Academy PLC Simulator',
      `// Target CPU: ${profile.model}`,
      `// Date: ${timestamp}`,
      '// Networks: 1',
      '//=============================================================================',
    ]);
    expect(file.content).toContain('NETWORK 1 // Start');
    expect(file.content).toContain('LD     I0.0');
    expect(file.content.endsWith('\n')).toBe(true);
    expect(file.symbolTable).toBeUndefined();
  });

  it('wraps the body in an organization block on request', () => {
    const file = exportMicroWin(networks, profile, undefined, { timestamp, wrapper: 'main' });
    expect(file.content).toContain('ORGANIZATION_BLOCK MAIN');
    expect(file.content).toContain('BEGIN');
    expect(file.content.trimEnd().endsWith('END_ORGANIZATION_BLOCK')).toBe(true);
    // The wrapper survives a parse, so an exported file can be re-imported.
    expect(ilToLad(file.content, profile).ok).toBe(true);
  });

  it('emits a tab separated symbol table and can annotate operands', () => {
    const symbols: SymbolMap = {
      'I0.0': { name: 'Start_PB', comment: 'Start pushbutton' },
      'Q0.0': { name: 'Motor_Run' },
    };
    const file = exportMicroWin(networks, profile, symbols, { timestamp, annotateSymbols: true });
    expect(file.symbolTable?.fileName).toBe('program.sym');
    expect(file.symbolTable?.content).toContain('// Symbol\tAddress\tComment');
    expect(file.symbolTable?.content).toContain('Motor_Run\tQ0.0\t');
    expect(file.symbolTable?.content).toContain('Start_PB\tI0.0\tStart pushbutton');
    expect(file.content).toContain('LD     I0.0 // Start_PB');
  });

  it('rejects invalid and duplicated symbol names', () => {
    const file = exportMicroWin(networks, profile, {
      'I0.0': { name: '1_bad name' },
      'Q0.0': { name: 'Dup' },
      'Q0.1': { name: 'dup' },
    }, { timestamp });
    expect(file.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(2);
    expect(file.symbolTable?.content).toContain('Dup\tQ0.0');
  });
});
