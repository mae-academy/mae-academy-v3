// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LadNode, Network } from '../../domain/ast';
import { S7_200_CPU224 } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { RegisterMonitor } from './RegisterMonitor';

const profile = S7_200_CPU224;
const at = (row: number, col: number, rowSpan = 1) => ({ row, col, rowSpan, colSpan: 1, branchId: null });

afterEach(cleanup);

const network: Network = {
  id: 'n1',
  grid: { rows: 2, cols: 8 },
  nodes: [
    { id: 'a', type: 'contact', variant: 'NO', operand: 'I0.0', layout: at(0, 0) },
    {
      id: 'add',
      type: 'math',
      fn: 'ADD',
      dataType: 'INT',
      in1: { kind: 'address', address: 'VW10' },
      in2: { kind: 'constant', value: 1 },
      out: 'VW10',
      layout: at(0, 1, 2),
    } as LadNode,
  ],
  branches: [],
};

describe('RegisterMonitor', () => {
  it('lists a referenced register with live dual-radix values', () => {
    const memory = new MemoryMap(profile);
    memory.write('VW10', 1250);
    render(<RegisterMonitor networks={[network]} profile={profile} memory={memory} />);

    expect(screen.getByText('VW10')).toBeDefined();
    expect(screen.getByText('Dec: 1250')).toBeDefined();
    expect(screen.getByText('Hex: 0x04E2')).toBeDefined();
  });

  it('updates live when the runtime writes to memory', () => {
    const memory = new MemoryMap(profile);
    render(<RegisterMonitor networks={[network]} profile={profile} memory={memory} />);

    expect(screen.getByText('Dec: 0')).toBeDefined();
    act(() => memory.write('VW10', 77));
    expect(screen.getByText('Dec: 77')).toBeDefined();
  });

  it('forces a value in place, writing straight into the shared VM memory', () => {
    const memory = new MemoryMap(profile);
    render(<RegisterMonitor networks={[network]} profile={profile} memory={memory} />);

    fireEvent.click(screen.getByTitle('Click to force a value'));
    const input = screen.getByPlaceholderText('dec or 0x..');
    fireEvent.change(input, { target: { value: '0x2A' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(memory.readSigned('VW10')).toBe(42);
    expect(screen.getByText('Dec: 42')).toBeDefined();
  });

  it('shows a placeholder when the program has no byte/word/dword operands', () => {
    const memory = new MemoryMap(profile);
    const empty: Network = { id: 'n2', grid: { rows: 1, cols: 8 }, nodes: [], branches: [] };
    render(<RegisterMonitor networks={[empty]} profile={profile} memory={memory} />);
    expect(screen.getByText(/No VW\/VD\/VB/)).toBeDefined();
  });
});
