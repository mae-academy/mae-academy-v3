// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Branch, LadNode, Network } from '../../domain/ast';
import { S7_200_CPU224 } from '../../domain/hardware';
import { LadderCanvas } from './LadderCanvas';
import { NodeInspector } from './NodeInspector';
import { usePlcEditorState, type PlcEditor as EditorHandle } from './usePlcEditorState';

const profile = S7_200_CPU224;

const at = (row: number, col: number, rowSpan = 1, branchId: string | null = null) => ({
  row,
  col,
  rowSpan,
  colSpan: 1,
  branchId,
});

const contact = (id: string, operand: string, row: number, col: number): LadNode => ({
  id,
  type: 'contact',
  variant: 'NO',
  operand,
  layout: at(row, col),
});

const timer = (id: string, row: number, col: number): LadNode => ({
  id,
  type: 'timer',
  fn: 'TON',
  instance: 'T37',
  timeBaseMs: 100,
  inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: 50 } },
  outputs: {},
  layout: at(row, col, 2),
});

afterEach(cleanup);

/** Both panels share one editor instance, exactly as `PlcEditorView` wires them in the real app. */
function Harness({ network, capture }: { network: Network; capture: (editor: EditorHandle) => void }) {
  const editor = usePlcEditorState(profile, [network]);
  capture(editor);
  return (
    <>
      <LadderCanvas editor={editor} profile={profile} />
      <NodeInspector editor={editor} profile={profile} />
    </>
  );
}

describe('NodeInspector shift controls', () => {
  it('shifts a selected contact right and left, updating the shared editor state', () => {
    let captured: EditorHandle | null = null;
    const network: Network = {
      id: 'n1',
      grid: { rows: 2, cols: 8 },
      nodes: [contact('a', 'I0.0', 0, 0), { id: 'q', type: 'coil', variant: 'OUT', target: 'Q0.0', layout: at(0, 7) }],
      branches: [],
    };
    const { container } = render(<Harness network={network} capture={(e) => (captured = e)} />);
    const colOf = () => (captured as EditorHandle | null)?.networks[0]?.nodes.find((n) => n.id === 'a')?.layout.col;

    fireEvent.click(container.querySelector('[data-node-id="a"]') as Element);
    expect(colOf()).toBe(0);
    expect((screen.getByLabelText('Shift element left') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Shift element right'));
    expect(colOf()).toBe(1);
    expect((screen.getByLabelText('Shift element left') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByLabelText('Shift element left'));
    expect(colOf()).toBe(0);
  });

  it('shows rail-anchored elements (coil/timer/counter) as anchored instead of offering shift buttons', () => {
    let captured: EditorHandle | null = null;
    const network: Network = {
      id: 'n1',
      grid: { rows: 3, cols: 8 },
      nodes: [contact('a', 'I0.0', 0, 0), timer('ton', 0, 7)],
      branches: [],
    };
    const { container } = render(<Harness network={network} capture={(e) => (captured = e)} />);
    void captured;

    fireEvent.click(container.querySelector('[data-node-id="ton"]') as Element);
    expect(screen.getByText('Anchored to output rail')).toBeDefined();
    expect(screen.queryByLabelText('Shift element right')).toBeNull();
    expect(screen.queryByLabelText('Shift element left')).toBeNull();
  });
});

describe('parallel branch handle on multi-row boxes', () => {
  it('places the "add branch" handle below the timer\'s full two-row height, not inside its body', () => {
    let captured: EditorHandle | null = null;
    const network: Network = {
      id: 'n1',
      grid: { rows: 4, cols: 8 },
      nodes: [contact('a', 'I0.0', 0, 0), timer('ton', 0, 1)],
      branches: [],
    };
    const { container } = render(<Harness network={network} capture={(e) => (captured = e)} />);
    void captured;

    fireEvent.click(container.querySelector('[data-node-id="ton"]') as Element);
    const handle = container.querySelector('[data-handle="Add parallel branch"]') as SVGGElement;
    expect(handle).not.toBeNull();

    const transform = handle.getAttribute('transform') ?? '';
    const y = Number(transform.match(/translate\([\d.-]+ ([\d.-]+)\)/)?.[1]);
    // Row 1 (the timer's second row) starts at MARGIN_TOP(16) + 1*CELL_HEIGHT(80) = 96. Before the
    // fix the handle was pinned to the box's *first* row (y = 80, inside row 0, near the EN pin);
    // it must now sit within the box's *last* row instead.
    expect(y).toBeGreaterThanOrEqual(96);
    expect(y).toBeLessThan(176); // still within the box's own two-row height, not off past it
  });

  it('adding a parallel branch under a TON timer succeeds', () => {
    let captured: EditorHandle | null = null;
    const network: Network = {
      id: 'n1',
      grid: { rows: 4, cols: 8 },
      nodes: [contact('a', 'I0.0', 0, 0), timer('ton', 0, 1)],
      branches: [],
    };
    render(<Harness network={network} capture={(e) => (captured = e)} />);
    if (!captured) throw new Error('editor not captured');

    act(() => (captured as EditorHandle).actions.addBranch('n1', 'ton'));

    const after = (captured as EditorHandle).networks[0];
    expect(after?.branches).toHaveLength(1);
    const branch = after?.branches[0] as Branch;
    expect(branch.rowStart).toBe(0);
    expect(branch.rowEnd).toBe(2); // one row past the timer's own two rows: the new parallel lane
  });
});

describe('NodeInspector Replace button and network + rung', () => {
  it('opens replace menu and allows replacing a contact retaining address and symbol', () => {
    let captured: EditorHandle | null = null;
    const network: Network = {
      id: 'n1',
      grid: { rows: 2, cols: 8 },
      nodes: [{ ...contact('c1', 'I0.7', 0, 0), symbol: 'Pump_Run' }],
      branches: [],
    };
    const { container } = render(<Harness network={network} capture={(e) => (captured = e)} />);

    // Select node
    fireEvent.click(container.querySelector('[data-node-id="c1"]') as Element);

    // Verify Replace button is present
    const replaceBtn = screen.getByTitle('Replace selected component with compatible instruction');
    expect(replaceBtn).toBeDefined();

    // Click Replace button to open popover
    fireEvent.click(replaceBtn);

    // Look for replacement options in popover
    expect(screen.getByText('Normally closed contact')).toBeDefined();
    expect(screen.getByText('Positive edge contact')).toBeDefined();

    // Click NC replacement
    fireEvent.click(screen.getByText('Normally closed contact'));

    // Check that editor state replaced the node
    const updated = (captured as EditorHandle | null)?.networks[0]?.nodes.find((n) => n.id === 'c1');
    expect(updated).toBeDefined();
    expect(updated?.type).toBe('contact');
    if (updated?.type === 'contact') {
      expect(updated.variant).toBe('NC');
      expect(updated.operand).toBe('I0.7');
      expect(updated.symbol).toBe('Pump_Run');
      expect(updated.layout.row).toBe(0);
      expect(updated.layout.col).toBe(0);
    }
  });

  it('clicking + rung in the network header increments rowCount and creates a new rung', () => {
    let captured: EditorHandle | null = null;
    const network: Network = {
      id: 'n1',
      grid: { rows: 1, cols: 8 },
      nodes: [contact('c1', 'I0.0', 0, 0)],
      branches: [],
    };
    render(<Harness network={network} capture={(e) => (captured = e)} />);

    const addRungBtn = screen.getByRole('button', { name: 'Add a rung inside network 1' });
    expect(addRungBtn).toBeDefined();

    fireEvent.click(addRungBtn);

    const netAfter = (captured as EditorHandle | null)?.networks[0];
    expect(netAfter?.grid.rows).toBe(2);
  });
});

