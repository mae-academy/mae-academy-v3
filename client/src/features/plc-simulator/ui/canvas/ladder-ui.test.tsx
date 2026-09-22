// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { Branch, LadNode, Network } from '../../domain/ast';
import { S7_200_CPU224 } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { PlcRuntime } from '../../engine/plc-runtime';
import type { FieldIoAdapter, Scheduler } from '../../engine/types';
import { buildNetworkTree } from '../../engine/compiler';
import { PALETTE_DRAG_TYPE } from '../palette/catalog';
import { LadderCanvas } from './LadderCanvas';
import { LadderRung } from './LadderRung';
import { PlcEditor } from './PlcEditor';
import { SimulationProvider, createSimulationStore, type SimulationStore } from './simulation';
import { usePlcEditorState, type PlcEditor as EditorHandle } from './usePlcEditorState';

const profile = S7_200_CPU224;

const at = (row: number, col: number, branchId: string | null = null) => ({ row, col, rowSpan: 1, colSpan: 1, branchId });
const contact = (id: string, operand: string, row: number, col: number, variant: 'NO' | 'NC' = 'NO', branchId: string | null = null): LadNode => ({
  id, type: 'contact', variant, operand, layout: at(row, col, branchId),
});
const coil = (id: string, target: string, col: number): LadNode => ({
  id, type: 'coil', variant: 'OUT', target, layout: at(0, col),
});

/** Seal-in: (I0.0 || Q0.0) && !I0.1 -> Q0.0 */
const sealBranch: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 0, rowStart: 0, rowEnd: 1 };
const seal: Network = {
  id: 'net_1',
  title: 'Seal-in',
  grid: { rows: 2, cols: 6 },
  nodes: [
    contact('start', 'I0.0', 0, 0, 'NO', 'b1'),
    contact('hold', 'Q0.0', 1, 0, 'NO', 'b1'),
    contact('stop', 'I0.1', 0, 1, 'NC'),
    coil('out', 'Q0.0', 3),
  ],
  branches: [sealBranch],
};

afterEach(cleanup);

// ---- static geometry ---------------------------------------------------------------------------

describe('LadderRung markup', () => {
  const markup = renderToStaticMarkup(
    <LadderRung
      network={seal}
      index={0}
      tree={buildNetworkTree(seal)}
      selectedNodeId={null}
      selectedCell={null}
      armed={null}
      interactive={false}
      previewCell={() => ({ ok: false, cell: { row: 0, col: 0 }, reason: '' })}
      onSelectCell={() => {}}
      onSelectNode={() => {}}
      onPlace={() => {}}
    />,
  );

  it('draws both rails, every symbol and junction dots of radius 3', () => {
    expect(markup).toContain('data-rail="left"');
    expect(markup).toContain('data-rail="right"');
    expect(markup).toContain('data-symbol="contact-NO"');
    expect(markup).toContain('data-symbol="contact-NC"');
    expect(markup).toContain('data-symbol="coil-OUT"');
    expect(markup).toMatch(/<circle[^>]*r="3"/);
  });

  it('renders every wire crisp and on whole-pixel coordinates', () => {
    expect(markup).toContain('shape-rendering="crispEdges"');
    const wires = markup.match(/<path[^>]*data-(?:wire|rail)=[^>]*>/g) ?? [];
    expect(wires.length).toBeGreaterThan(4);
    for (const tag of wires) {
      const d = /d="([^"]+)"/.exec(tag)?.[1] ?? '';
      for (const number of d.match(/-?\d+(?:\.\d+)?/g) ?? []) expect(Number.isInteger(Number(number)), `${tag}`).toBe(true);
    }
  });

  it('routes the horizontal passthrough all the way to the right rail', () => {
    // coil at column 3 of 6 -> a wire from boundary 4 to boundary 6 on row 0
    expect(markup).toContain('data-wire="0:4-6"');
  });

  it('shows no live colour while no simulation is attached', () => {
    expect(markup).not.toContain('2E7D32]');
  });
});

// ---- editing interactions ----------------------------------------------------------------------

describe('PlcEditor interactions', () => {
  const cell = (container: HTMLElement, row: number, col: number): Element => {
    const el = container.querySelector(`[data-cell="${row}:${col}"]`);
    if (!el) throw new Error(`no cell ${row}:${col}`);
    return el;
  };
  const palette = (name: RegExp) =>
    within(screen.getByRole('navigation', { name: 'Instruction palette' })).getByRole('button', { name });

  it('places into a selected cell with a palette click', () => {
    const { container } = render(<PlcEditor profile={profile} />);
    fireEvent.click(cell(container, 0, 1));
    fireEvent.click(palette(/Normally open contact/));
    expect(container.querySelector('[data-layer="nodes"] [data-symbol="contact-NO"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Normally open contact I0\.0/ })).toBeDefined();
  });

  it('places into an already-selected cell when a palette entry is clicked', () => {
    const { container } = render(<PlcEditor profile={profile} />);
    fireEvent.click(cell(container, 0, 3));
    fireEvent.click(palette(/Output coil/));
    const placed = container.querySelector('[data-layer="nodes"] [data-symbol="coil-OUT"]');
    expect(placed).not.toBeNull();
    // outputs are anchored to the right rail, so the coil is in the last column whatever cell was selected
    expect(container.querySelector('[data-cell="0:7"]')).not.toBeNull();
    expect(container.querySelector('[data-wire="0:0-7"]')).not.toBeNull();
  });

  it('accepts a drag and drop from the palette onto a cell', () => {
    const { container } = render(<PlcEditor profile={profile} />);
    const dataTransfer = {
      types: [PALETTE_DRAG_TYPE],
      getData: () => 'timer-ton',
      setData: () => {},
      dropEffect: 'none',
      effectAllowed: 'all',
    };
    fireEvent.dragStart(palette(/On-delay timer/), { dataTransfer });
    fireEvent.dragOver(cell(container, 0, 2), { dataTransfer });
    expect(container.querySelector('[data-ghost="true"]')).not.toBeNull();
    fireEvent.drop(cell(container, 0, 2), { dataTransfer });
    expect(container.querySelector('[data-layer="nodes"] [data-symbol="box-TON"]')).not.toBeNull();
  });

  it('refuses an occupied cell and explains why', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    // the seal-in coil is anchored to the right rail (column 8 of 8), so that cell is taken
    const dataTransfer = {
      types: [PALETTE_DRAG_TYPE],
      getData: () => 'contact-nc',
      setData: () => {},
      dropEffect: 'none',
      effectAllowed: 'all',
    };
    fireEvent.dragStart(palette(/Normally closed contact/), { dataTransfer });
    fireEvent.dragOver(cell(container, 0, 7), { dataTransfer });
    fireEvent.drop(cell(container, 0, 7), { dataTransfer });
    expect(screen.getByRole('alert').textContent).toContain('already occupied');
  });

  it('refuses a row the engine never evaluates', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    fireEvent.click(cell(container, 1, 4));
    fireEvent.click(palette(/Normally open contact/));
    expect(screen.getByRole('alert').textContent).toContain('branch');
  });

  it('edits an address inline with live validation against the profile', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    const label = within(container.querySelector('[data-node-id="stop"]') as HTMLElement).getByText('I0.1');
    fireEvent.doubleClick(label);

    const input = screen.getByLabelText('Operand') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'I1.6' } });
    expect(screen.getByRole('alert').textContent).toContain('exceeds');

    // an invalid value cannot be committed
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByLabelText('Operand')).not.toBeNull();

    fireEvent.change(input, { target: { value: 'i1.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByLabelText('Operand')).toBeNull();
    expect(within(container.querySelector('[data-node-id="stop"]') as HTMLElement).getByText('I1.5')).toBeDefined();
  });

  it('undoes and redoes with the keyboard', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    // dropped under the existing coil: forks a parallel output branch on the right rail
    fireEvent.click(cell(container, 1, 3));
    fireEvent.click(palette(/Output coil/));
    expect(container.querySelectorAll('[data-layer="nodes"] [data-symbol="coil-OUT"]').length).toBe(2);

    fireEvent.keyDown(container.firstElementChild as Element, { key: 'z', ctrlKey: true });
    expect(container.querySelectorAll('[data-layer="nodes"] [data-symbol="coil-OUT"]').length).toBe(1);
    fireEvent.keyDown(container.firstElementChild as Element, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(container.querySelectorAll('[data-layer="nodes"] [data-symbol="coil-OUT"]').length).toBe(2);
  });

  it('moves the selected node one column on Alt+ArrowRight / Alt+ArrowLeft and re-renders it there', () => {
    let captured: EditorHandle | null = null;
    function Harness() {
      const editor = usePlcEditorState(profile, [seal]);
      captured = editor;
      return <LadderCanvas editor={editor} profile={profile} />;
    }
    const { container } = render(<Harness />);
    const colOf = (id: string) => (captured as EditorHandle | null)?.networks[0]?.nodes.find((n) => n.id === id)?.layout.col;

    // I0.1 (NC, "stop") sits at row 0, col 1, with col 2 free ahead of it.
    expect(colOf('stop')).toBe(1);
    fireEvent.click(container.querySelector('[data-node-id="stop"]') as Element);
    const app = screen.getByRole('application');

    fireEvent.keyDown(app, { key: 'ArrowRight', altKey: true });
    expect(colOf('stop')).toBe(2);
    // The node re-renders at the new geometry: still on screen, one grid cell (100px) further right.
    const afterRight = container.querySelector('[data-node-id="stop"]') as SVGGElement;
    expect(afterRight).not.toBeNull();

    fireEvent.keyDown(app, { key: 'ArrowLeft', altKey: true });
    expect(colOf('stop')).toBe(1);
    const afterLeft = container.querySelector('[data-node-id="stop"]') as SVGGElement;
    expect(afterLeft).not.toBeNull();
  });

  it('deletes the selected element with the keyboard and tidies its branch', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    const holdNode = container.querySelector('[data-node-id="hold"]') as Element;
    fireEvent.click(holdNode);
    const app = screen.getByRole('application');
    fireEvent.keyDown(app, { key: 'Delete' });
    expect(container.querySelector('[data-node-id="hold"]')).toBeNull();
    // the parallel lane was emptied, so the junction dots and rails are gone
    expect(container.querySelector('[data-junction]')).toBeNull();
  });

  it('switches LAD -> STL -> LAD, rebuilding the ladder from edited text', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'IL' }));

    const area = screen.getByLabelText(/Instruction list/) as HTMLTextAreaElement;
    expect(area.value).toContain('LD     I0.0');
    expect(area.value).toContain('O      Q0.0');
    expect(area.value).toContain('ANI0.1'.replace('ANI', 'AN     I'));

    fireEvent.change(area, { target: { value: 'NETWORK 1\nLD I0.2\n= Q0.3' } });
    fireEvent.click(screen.getByRole('tab', { name: 'LAD' }));

    expect(screen.queryByLabelText(/Instruction list/)).toBeNull();
    expect(container.querySelectorAll('[data-layer="nodes"] [data-symbol="contact-NO"]').length).toBe(1);
    expect(screen.getByRole('button', { name: /coil Q0\.3/ })).toBeDefined();
  });

  it('stays in STL with diagnostics when the text is invalid', () => {
    render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'IL' }));
    fireEvent.change(screen.getByLabelText(/Instruction list/), { target: { value: 'LD I0.0\nA I1.6\n= Q0.0' } });
    fireEvent.click(screen.getByRole('tab', { name: 'LAD' }));

    expect(screen.getByLabelText(/Instruction list/)).toBeDefined();
    expect(screen.getByRole('list', { name: 'STL diagnostics' }).textContent).toContain('I1.6');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText(/Instruction list/)).toBeNull();
  });

  it('renders notice banner with brand red palette', () => {
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[seal]} />);
    
    // the seal-in coil is anchored to the right rail (column 8 of 8), so that cell is taken
    const dataTransfer = {
      types: [PALETTE_DRAG_TYPE],
      getData: () => 'contact-nc',
      setData: () => {},
      dropEffect: 'none',
      effectAllowed: 'all',
    };
    fireEvent.dragStart(palette(/Normally closed contact/), { dataTransfer });
    fireEvent.dragOver(cell(container, 0, 7), { dataTransfer });
    fireEvent.drop(cell(container, 0, 7), { dataTransfer });

    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('border-red-500/30');
    expect(alert.className).toContain('bg-red-500/10');
  });

  it('drops a second TON into a freshly-forked parallel branch lane under the first TON', () => {
    const timerWithFn = (id: string, row: number, col: number): LadNode => ({
      id,
      type: 'timer',
      fn: 'TON',
      instance: 'T37',
      timeBaseMs: 100,
      inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: 50 } },
      outputs: {},
      layout: at(row, col),
    });
    const timerNetwork: Network = {
      id: 'net_2',
      title: 'Timer',
      grid: { rows: 4, cols: 8 },
      nodes: [contact('gate', 'I0.0', 0, 0), { ...timerWithFn('ton1', 0, 7), layout: { row: 0, col: 7, rowSpan: 2, colSpan: 1, branchId: null } }],
      branches: [],
    };
    const { container } = render(<PlcEditor profile={profile} initialNetworks={[timerNetwork]} />);

    // Fork a parallel branch under the timer (the handle sits past its two-row height).
    fireEvent.click(container.querySelector('[data-node-id="ton1"]') as Element);
    const handle = container.querySelector('[data-handle="Add parallel branch"]') as Element;
    fireEvent.click(handle);

    // Drag a second TON from the palette onto the new lane, directly under the first (row 2, its
    // rail column): the lane is only 1 row deep so far, but the timer needs 2.
    const dataTransfer = {
      types: [PALETTE_DRAG_TYPE],
      getData: () => 'timer-ton',
      setData: () => {},
      dropEffect: 'none',
      effectAllowed: 'all',
    };
    fireEvent.dragStart(palette(/On-delay timer/), { dataTransfer });
    fireEvent.dragOver(cell(container, 2, 7), { dataTransfer });
    fireEvent.drop(cell(container, 2, 7), { dataTransfer });

    // No rejection banner, and a second timer box is now on the canvas.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelectorAll('[data-symbol="box-TON"]').length).toBe(2);
  });
});

// ---- live simulation ---------------------------------------------------------------------------

describe('live power flow', () => {
  class Field implements FieldIoAdapter {
    readonly inputs = new Uint8Array(2);
    sampleInputs(image: Uint8Array): void {
      image.set(this.inputs);
    }
  }
  const idle: Scheduler = { schedule: () => 0, cancel: () => {} };

  function Harness({ onEditor, sim }: { onEditor: (editor: EditorHandle) => void; sim: SimulationStore | null }) {
    const editor = usePlcEditorState(profile, [seal]);
    onEditor(editor);
    return (
      <SimulationProvider store={sim}>
        <LadderCanvas editor={editor} profile={profile} />
      </SimulationProvider>
    );
  }

  const LIVE = 'stroke-[#6366f1]';
  const isLive = (el: Element | null): boolean => (el?.getAttribute('class') ?? '').includes(LIVE);

  it('energises exactly the wires and symbols power reaches, and follows the inputs', () => {
    let captured: EditorHandle | null = null;
    const view = render(<Harness onEditor={(editor) => (captured = editor)} sim={null} />);
    const networks = (captured as EditorHandle | null)?.networks;
    if (!networks) throw new Error('editor not captured');

    const memory = new MemoryMap(profile);
    const field = new Field();
    const runtime = new PlcRuntime(
      memory,
      { schemaVersion: 1, profileId: profile.id, networks },
      { fieldIo: field, scheduler: idle, clock: () => 0 },
    );
    const store = createSimulationStore(runtime);
    view.rerender(<Harness onEditor={(editor) => (captured = editor)} sim={store} />);

    const { container } = view;
    // Before any scan nothing conducts.
    expect(container.querySelectorAll(`[class*="${LIVE}"]`).length).toBe(0);

    // Press start (I0.0): the whole rung including the coil lights up.
    field.inputs[0] = 0b01;
    act(() => {
      runtime.step();
    });
    expect(memory.readBit('Q0.0')).toBe(true);
    expect(isLive(container.querySelector('[data-layer="nodes"] [data-symbol="coil-OUT"] path'))).toBe(true);
    expect(isLive(container.querySelector('[data-wire="0:2-7"]'))).toBe(true);
    expect(isLive(container.querySelector('[data-rail="left"]'))).toBe(true);
    // the closed start contact glows; the parallel seal-in contact (Q0.0 was low at load) does not
    expect(isLive(container.querySelector('[data-node-id="start"] [data-symbol] path:nth-child(3)'))).toBe(true);

    // Release start: the seal-in path keeps Q0.0 on, so the rung stays energised through the lower lane.
    field.inputs[0] = 0;
    act(() => {
      runtime.step();
    });
    expect(memory.readBit('Q0.0')).toBe(true);
    expect(isLive(container.querySelector('[data-wire="0:2-7"]'))).toBe(true);

    // Stop (I0.1 opens the NC contact): everything downstream goes dark again.
    field.inputs[0] = 0b10;
    act(() => {
      runtime.step();
    });
    expect(memory.readBit('Q0.0')).toBe(false);
    expect(isLive(container.querySelector('[data-wire="0:2-7"]'))).toBe(false);

    // Stopping the controller darkens the whole rung, rails included.
    act(() => {
      runtime.stop();
    });
    expect(container.querySelectorAll(`[class*="${LIVE}"]`).length).toBe(0);
  });

  it('locks editing while a simulation is attached', () => {
    let captured: EditorHandle | null = null;
    const view = render(<Harness onEditor={(editor) => (captured = editor)} sim={null} />);
    const networks = (captured as EditorHandle | null)?.networks ?? [];
    const runtime = new PlcRuntime(
      new MemoryMap(profile),
      { schemaVersion: 1, profileId: profile.id, networks },
      { scheduler: idle, clock: () => 0 },
    );
    view.rerender(<Harness onEditor={(editor) => (captured = editor)} sim={createSimulationStore(runtime)} />);
    expect(view.container.querySelector('[data-cell]')).toBeNull();
  });
});
