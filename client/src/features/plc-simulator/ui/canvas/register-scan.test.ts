import { describe, expect, it } from 'vitest';
import type { LadNode, Network } from '../../domain/ast';
import { S7_200_CPU224 } from '../../domain/hardware';
import { collectReferencedRegisters } from './register-scan';

const profile = S7_200_CPU224;
const at = (row: number, col: number, rowSpan = 1) => ({ row, col, rowSpan, colSpan: 1, branchId: null });

describe('collectReferencedRegisters', () => {
  it('extracts VW/VD operands from math and timer/counter instances, skipping bits and constants', () => {
    const nodes: LadNode[] = [
      { id: 'a', type: 'contact', variant: 'NO', operand: 'I0.0', layout: at(0, 0) },
      { id: 'q', type: 'coil', variant: 'OUT', target: 'Q0.0', layout: at(0, 6) },
      {
        id: 'add',
        type: 'math',
        fn: 'ADD',
        dataType: 'INT',
        in1: { kind: 'address', address: 'VW10' },
        in2: { kind: 'constant', value: 5 }, // a literal: must not appear as a register
        out: 'VW10',
        layout: at(0, 1, 2),
      },
      {
        id: 'cos',
        type: 'math',
        fn: 'COS',
        dataType: 'REAL',
        in: { kind: 'address', address: 'VD100' },
        out: 'VD104',
        layout: at(0, 2, 2),
      },
      {
        id: 'ton',
        type: 'timer',
        fn: 'TON',
        instance: 'T37',
        timeBaseMs: 100,
        inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: 50 } },
        outputs: {},
        layout: at(0, 3, 2),
      },
      {
        id: 'ctu',
        type: 'counter',
        fn: 'CTU',
        instance: 'C1',
        inputs: { CU: { kind: 'flow' }, R: { kind: 'flow' }, PV: { kind: 'constant', value: 10 } },
        outputs: {},
        layout: at(0, 4, 2),
      },
    ];
    const network: Network = { id: 'n1', grid: { rows: 3, cols: 8 }, nodes, branches: [] };

    const registers = collectReferencedRegisters([network], profile);
    const addresses = registers.map((r) => r.address);

    expect(addresses).toContain('VW10');
    expect(addresses).toContain('VD100');
    expect(addresses).toContain('VD104');
    expect(addresses).toContain('T37');
    expect(addresses).toContain('C1');

    // Bit addresses (contacts/coils) are already live on the canvas, so they are excluded here.
    expect(addresses).not.toContain('I0.0');
    expect(addresses).not.toContain('Q0.0');
    // Constant operands (5, PT=50, PV=10) are not addresses at all.
    expect(registers.some((r) => r.address === '5')).toBe(false);

    const vw10 = registers.find((r) => r.address === 'VW10');
    expect(vw10?.width).toBe('word');
    const t37 = registers.find((r) => r.address === 'T37');
    expect(t37?.kind).toBe('timer');
  });

  it('deduplicates an address referenced by more than one node', () => {
    const nodes: LadNode[] = [
      {
        id: 'add',
        type: 'math',
        fn: 'ADD',
        dataType: 'INT',
        in1: { kind: 'address', address: 'VW0' },
        in2: { kind: 'constant', value: 1 },
        out: 'VW0',
        layout: at(0, 0, 2),
      },
      {
        id: 'sub',
        type: 'math',
        fn: 'SUB',
        dataType: 'INT',
        in1: { kind: 'address', address: 'VW0' },
        in2: { kind: 'constant', value: 1 },
        out: 'VW0',
        layout: at(0, 2, 2),
      },
    ];
    const network: Network = { id: 'n1', grid: { rows: 2, cols: 8 }, nodes, branches: [] };

    const registers = collectReferencedRegisters([network], profile);
    expect(registers.filter((r) => r.address === 'VW0')).toHaveLength(1);
  });

  it('returns an empty list for a program with no byte/word/dword operands', () => {
    const network: Network = {
      id: 'n1',
      grid: { rows: 2, cols: 8 },
      nodes: [
        { id: 'a', type: 'contact', variant: 'NO', operand: 'I0.0', layout: at(0, 0) },
        { id: 'q', type: 'coil', variant: 'OUT', target: 'Q0.0', layout: at(0, 1) },
      ],
      branches: [],
    };
    expect(collectReferencedRegisters([network], profile)).toEqual([]);
  });
});
