// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { useRelayLadder } from '../../hooks/useRelayLadder';
import { startStopExample } from '../../models/ladderExamples';
import type { LadderCircuit } from '../../models/relayLadder';
import { ControlCircuitTab } from './ControlCircuitTab';

afterEach(async () => {
  cleanup();
  await act(async () => { await i18n.changeLanguage('en'); });
});

const colors: Palette = {
  background: '#eaf0f8', canvas: '#f8fbff', panel: '#ffffff', panelAlt: '#f1f5fb', line: '#d7e2ef', text: '#172033', muted: '#64748b', subtle: '#94a3b8',
  primary: '#2563eb', accent: '#7c3aed', danger: '#be123c', selection: '#7C3AED', grid: '#dbe7f3', wire: '#0f172a', powered: '#2563eb', input: '#ffffff', shadow: 'none',
};

interface HarnessProps {
  initial?: LadderCircuit;
  live?: boolean;
  time?: number;
  sensors?: Record<string, boolean>;
  onCircuit?: (circuit: LadderCircuit) => void;
}

/** The panel with the same state owner the studio gives it: a circuit, the relay hook and the schematic's tags. */
function Harness({ initial = { paths: [] }, live = true, time = 0, sensors = {}, onCircuit }: HarnessProps) {
  const [circuit, setCircuit] = useState(initial);
  const ladder = useRelayLadder({ circuit, live, time, sensors });
  return (
    <ControlCircuitTab
      colors={colors}
      isDark={false}
      circuit={circuit}
      onCircuitChange={next => { setCircuit(next); onCircuit?.(next); }}
      ladder={ladder}
      live={live}
      sensorTags={['1B1', '1B2']}
      solenoidTags={['1Y1']}
      exampleTags={{ stop: '1B2', solenoid: '1Y1' }}
    />
  );
}

const element = (tag: string, kind?: string) => {
  const nodes = screen.getAllByTestId(`ladder-element-${tag}`);
  return kind ? nodes.find(node => node.getAttribute('data-kind') === kind)! : nodes[0];
};

describe('control circuit workspace', () => {
  it('renders the +24V and 0V rails with the numbered current paths of the example', () => {
    render(<Harness initial={startStopExample()} />);
    const svg = screen.getByRole('img', { name: /rails/i });
    expect(within(svg as unknown as HTMLElement).getByTestId('rail-24v')).toBeTruthy();
    expect(screen.getByTestId('rail-0v')).toBeTruthy();
    const typeset = (selector: string) => Array.from(svg.querySelectorAll(selector)).map(label => (label.querySelector('.katex-html')?.textContent ?? '').replace(/\s/g, ''));
    expect(typeset('.rail-label')).toEqual(['+24V', '0V']);
    expect(typeset('.ladder-path-number')).toEqual(['1', '2']);
  });

  it('draws every symbol of the example: sensor, pushbutton, make contacts, coil and solenoid', () => {
    render(<Harness initial={startStopExample()} />);
    expect(element('1B2', 'sensor').querySelector('.sensor-housing')).toBeTruthy();
    expect(element('1B2', 'sensor').querySelector('.sensor-diamond')).toBeTruthy();
    expect(element('1B2', 'sensor').querySelector('.contact-nc')).toBeTruthy();
    expect(element('S5').querySelector('.pushbutton-operator.pb-no')).toBeTruthy();
    expect(element('K1', 'relayContact').querySelector('.contact-no')).toBeTruthy();
    expect(element('K1', 'relayCoil').querySelector('.coil-body')).toBeTruthy();
    expect(element('1Y1').querySelectorAll('.solenoid-diagonal')).toHaveLength(1);
    expect(element('S5').querySelector('.ladder-caption')?.textContent).toBe('START');
  });

  it('draws the pushbutton like the Circuit Lab: two terminal dots, a bridge bar on a T-stem, the bar drops when pressed', () => {
    render(<Harness initial={startStopExample()} />);
    const button = element('S5');
    const operator = () => button.querySelector('.pushbutton-operator') as SVGGElement;
    // Circuit Lab pb-no, turned on its side: terminal dots at +-10, bar 24 wide, stem 10 long
    expect(operator().getAttribute('transform')).toBe('rotate(-90)');
    expect(operator().querySelectorAll('circle')).toHaveLength(2);
    const bar = () => operator().querySelector('.push-bar') as SVGLineElement;
    const stem = () => operator().querySelector('.push-stem') as SVGLineElement;
    expect([bar().getAttribute('x1'), bar().getAttribute('x2'), bar().getAttribute('y1')]).toEqual(['-12', '12', '-10']);
    expect([stem().getAttribute('y1'), stem().getAttribute('y2')]).toEqual(['-10', '-20']);
    fireEvent.mouseDown(button);
    expect(operator().getAttribute('data-pressed')).toBe('true');
    expect(bar().getAttribute('y1')).toBe('-2.5');
    fireEvent.mouseUp(window);
    expect(bar().getAttribute('y1')).toBe('-10');
  });

  it('draws a normally-closed pushbutton with the bar across the gap (Circuit Lab pb-nc)', () => {
    const circuit = startStopExample();
    circuit.paths[0].conditions[0][0].form = 'NC';
    render(<Harness initial={circuit} />);
    const bar = element('S5').querySelector('.pb-nc .push-bar') as SVGLineElement;
    expect(bar.getAttribute('y1')).toBe('2.5');
  });

  it('prints the cross-reference of each relay under the 0V rail as a fraction: make contacts over break contacts', () => {
    render(<Harness initial={startStopExample()} />);
    const table = screen.getByTestId('ladder-xref-K1');
    expect(table.querySelector('.xref-no .katex-html')?.textContent?.replace(/\s/g, '')).toBe('12');
    expect(table.querySelector('.xref-bar')).toBeTruthy();
    expect(table.querySelector('.xref-nc .katex-html')?.textContent).toBe('-');
    // bar sits between the two lines
    const y = (selector: string) => {
      const node = table.querySelector(selector);
      return selector === '.xref-bar' ? Number(node?.getAttribute('y1')) : Number(node?.getAttribute('y')) + Number(node?.getAttribute('height')) / 2;
    };
    expect(y('.xref-no')).toBeLessThan(y('.xref-bar'));
    expect(y('.xref-bar')).toBeLessThan(y('.xref-nc'));
  });

  it('lights up the cross-referenced paths whose contacts of that relay are made', () => {
    render(<Harness initial={startStopExample()} />);
    const lit = () => Array.from(screen.getByTestId('ladder-xref-K1').querySelectorAll('.xref-no .katex-html [style*="color"]')).map(span => span.textContent?.trim());
    expect(lit()).toEqual([]);
    fireEvent.mouseDown(element('S5'));
    expect(lit()).toEqual(['1', '2']);
  });

  it('joins parallel branches through rounded corners with junction dots', () => {
    const { container } = render(<Harness initial={startStopExample()} />);
    const caps = Array.from(container.querySelectorAll('path.ladder-conductor')).map(path => path.getAttribute('d') ?? '');
    // one cap over and one under the S5 / K1 group, each a square horizontal run (no curves, no diagonals)
    expect(caps).toHaveLength(2);
    for (const d of caps) expect(d).toMatch(/^M[\d.]+,[\d.]+ H[\d.]+$/);
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(4);
  });

  it('shows only the relay wiring: no PLC header, I/O module, LAD / IL toggle or hardware badge', () => {
    const { container } = render(<Harness initial={startStopExample()} />);
    expect(screen.queryByRole('toolbar', { name: 'Execution controls' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Input switches' })).toBeNull();
    expect(screen.queryByText('I/O Module')).toBeNull();
    expect(screen.queryByRole('button', { name: 'LAD' })).toBeNull();
    expect(screen.queryByText(/S7-200|LOGO|ET-200/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Example' })).toBeNull();
    expect(container.querySelector('[data-layer="nodes"]')).toBeNull();
  });

  it('builds a circuit from the palette: a sensor, a pushbutton, a relay coil and a solenoid', () => {
    let last: LadderCircuit = { paths: [] };
    render(<Harness onCircuit={circuit => { last = circuit; }} />);

    fireEvent.click(screen.getByTestId('ladder-palette-sensor'));
    fireEvent.click(screen.getByTestId('ladder-site-series-1'));
    fireEvent.click(screen.getByTestId('ladder-palette-pushbutton-no'));
    fireEvent.click(screen.getByTestId('ladder-site-series-1'));
    fireEvent.click(screen.getByTestId('ladder-palette-relay-coil'));
    fireEvent.click(screen.getByTestId('ladder-site-load-1'));
    fireEvent.click(screen.getByTestId('ladder-add-path'));
    fireEvent.click(screen.getByTestId('ladder-palette-solenoid'));
    fireEvent.click(screen.getByTestId('ladder-site-load-2'));

    const [path1, path2] = last.paths;
    // defaults come from the schematic (1B1) and the numbering rules (S1, K1, 1Y1)
    expect(path1.conditions.map(group => group.map(item => `${item.kind}:${item.tag}`))).toEqual([['sensor:1B1'], ['pushbutton:S1']]);
    expect(path1.load).toMatchObject({ kind: 'relayCoil', tag: 'K1' });
    expect(path2.load).toMatchObject({ kind: 'solenoid', tag: '1Y1' });
    expect(element('1B1').querySelector('.sensor-housing')).toBeTruthy();
  });

  it('offers add-in-parallel sites and places the part beside the group', () => {
    let last: LadderCircuit = { paths: [] };
    render(<Harness initial={startStopExample()} onCircuit={circuit => { last = circuit; }} />);
    fireEvent.click(screen.getByTestId('ladder-palette-pushbutton-nc'));
    fireEvent.click(screen.getByTestId('ladder-site-parallel-1-2'));
    expect(last.paths[0].conditions[1].map(item => item.tag)).toEqual(['1B2', 'S1']);
    expect(last.paths[0].conditions[1][1]).toMatchObject({ kind: 'pushbutton', form: 'NC' });
  });

  it('does not offer a load site on a path that already has a load, and Escape cancels placing', () => {
    render(<Harness initial={startStopExample()} />);
    fireEvent.click(screen.getByTestId('ladder-palette-relay-coil'));
    expect(screen.queryByTestId('ladder-site-load-1')).toBeNull();
    expect(screen.getByTestId('ladder-hint').textContent).toContain('Relay coil');
    fireEvent.keyDown(screen.getByTestId('control-circuit'), { key: 'Escape' });
    expect(screen.queryByTestId('ladder-site-series-1')).toBeNull();
  });

  it('edits the tag, contact form and timer settings of the selected element', () => {
    let last: LadderCircuit = { paths: [] };
    render(<Harness initial={startStopExample()} onCircuit={circuit => { last = circuit; }} />);
    fireEvent.click(element('1B2', 'sensor'));
    fireEvent.change(screen.getByTestId('ladder-tag-input'), { target: { value: '2B1' } });
    fireEvent.change(screen.getByTestId('ladder-form-select'), { target: { value: 'NO' } });
    expect(last.paths[0].conditions[1][0]).toMatchObject({ tag: '2B1', form: 'NO' });
    expect(element('2B1').querySelector('.contact-no')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ladder-add-path'));
    fireEvent.click(screen.getByTestId('ladder-palette-timer-off'));
    fireEvent.click(screen.getByTestId('ladder-site-load-3'));
    expect(last.paths[2].load).toMatchObject({ kind: 'timerCoil', tag: 'KT1', mode: 'off', delay: 2 });
    fireEvent.change(screen.getByTestId('ladder-delay-input'), { target: { value: '3.5' } });
    fireEvent.change(screen.getByTestId('ladder-mode-select'), { target: { value: 'on' } });
    expect(last.paths[2].load).toMatchObject({ mode: 'on', delay: 3.5 });
    expect(element('KT1').querySelector('.timer-cross')).toBeTruthy();
    expect(element('KT1').querySelector('.ladder-timer-note')?.textContent).toBe('3.5 s On-delay');
  });

  it('deletes an element and a whole path', () => {
    let last: LadderCircuit = { paths: [] };
    render(<Harness initial={startStopExample()} onCircuit={circuit => { last = circuit; }} />);
    fireEvent.click(element('S5'));
    fireEvent.click(screen.getByTestId('ladder-delete-element'));
    expect(last.paths[0].conditions[0].map(item => item.tag)).toEqual(['K1']);
    fireEvent.click(screen.getByTestId('ladder-path-2'));
    fireEvent.click(screen.getByTestId('ladder-delete-path'));
    expect(last.paths).toHaveLength(1);
  });

  it('shows nothing energised until the simulation runs', () => {
    render(<Harness initial={startStopExample()} live={false} />);
    expect(screen.getByTestId('control-circuit').getAttribute('data-live')).toBe('false');
    expect(document.querySelectorAll('.ladder-conductor-live')).toHaveLength(0);
    expect(screen.getByTestId('ladder-hint').textContent).toContain('Press Run');
  });
});

describe('control circuit simulation', () => {
  it('holding S5 energises K1 and 1Y1, which stay on after release through the K1 contact', () => {
    render(<Harness initial={startStopExample()} />);
    expect(element('K1', 'relayCoil').getAttribute('data-closed')).toBe('false');
    expect(document.querySelectorAll('.ladder-lead-live').length).toBeGreaterThan(0);

    const start = element('S5');
    fireEvent.mouseDown(start);
    expect(start.getAttribute('data-operated')).toBe('true');
    expect(element('K1', 'relayCoil').getAttribute('data-closed')).toBe('true');
    expect(element('1Y1').getAttribute('data-closed')).toBe('true');
    expect(element('K1', 'relayContact').getAttribute('data-closed')).toBe('true');

    fireEvent.mouseUp(window);
    expect(start.getAttribute('data-operated')).toBe('false');
    expect(element('K1', 'relayCoil').getAttribute('data-closed')).toBe('true');
    expect(element('1Y1').getAttribute('data-closed')).toBe('true');
    // the energised coil is highlighted
    expect(element('1Y1').querySelector('.coil-body')?.getAttribute('stroke')).toBe('#e11d48');
  });

  it('the cylinder reaching 1B2 breaks the holding circuit', () => {
    const { rerender } = render(<Harness initial={startStopExample()} />);
    fireEvent.mouseDown(element('S5'));
    fireEvent.mouseUp(window);
    expect(element('1Y1').getAttribute('data-closed')).toBe('true');
    // the same component instance keeps its state; only the sensor input changes
    act(() => { rerender(<Harness initial={startStopExample()} sensors={{ '1b2': true }} />); });
    expect(element('K1', 'relayCoil').getAttribute('data-closed')).toBe('false');
    expect(element('1Y1').getAttribute('data-closed')).toBe('false');
  });

  it('a detented pushbutton stays operated until pressed again', () => {
    const circuit = startStopExample();
    circuit.paths[0].conditions[0][0].detent = true;
    render(<Harness initial={circuit} />);
    fireEvent.mouseDown(element('S5'));
    fireEvent.mouseUp(window);
    expect(element('S5').getAttribute('data-operated')).toBe('true');
    fireEvent.mouseDown(element('S5'));
    expect(element('S5').getAttribute('data-operated')).toBe('false');
  });

  it('forcing a sensor by hand makes its contact without a cylinder', () => {
    const circuit = startStopExample();
    render(<Harness initial={circuit} />);
    fireEvent.mouseDown(element('S5'));
    fireEvent.mouseUp(window);
    fireEvent.click(element('1B2', 'sensor'));
    fireEvent.click(screen.getByTestId('ladder-force'));
    expect(element('1Y1').getAttribute('data-closed')).toBe('false');
    expect(element('1B2', 'sensor').querySelector('.forced-badge')).toBeTruthy();
  });

  it('releases everything when the simulation stops', () => {
    const { rerender } = render(<Harness initial={startStopExample()} />);
    fireEvent.mouseDown(element('S5'));
    fireEvent.mouseUp(window);
    expect(element('1Y1').getAttribute('data-closed')).toBe('true');
    act(() => { rerender(<Harness initial={startStopExample()} live={false} />); });
    expect(element('1Y1').getAttribute('data-closed')).toBe('false');
  });
});

describe('control circuit cleanup', () => {
  it('draws no glow or blur filters, and strokes live conductors 2.5 px blue and idle ones 1.5 px slate', () => {
    const { container } = render(<Harness initial={startStopExample()} live />);
    expect(container.innerHTML).not.toMatch(/drop-shadow|filter|blur/i);
    const widths = new Set(Array.from(container.querySelectorAll('.ladder-conductor')).map(line => line.getAttribute('stroke-width')));
    expect([...widths].every(width => width === '2.5' || width === '1.5')).toBe(true);
  });

  it('typesets component tags with KaTeX', () => {
    const { container } = render(<Harness initial={startStopExample()} />);
    expect(container.querySelectorAll('svg .ladder-tag .katex').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg .coil-tag .katex').length).toBeGreaterThan(0);
  });

  it('groups the palette into switches, relay contacts and loads', () => {
    render(<Harness />);
    const groups = within(screen.getByTestId('ladder-palette')).getAllByRole('group');
    expect(groups).toHaveLength(3);
    expect(within(groups[0]).getByTestId('ladder-palette-pushbutton-no')).toBeTruthy();
    expect(within(groups[1]).getByTestId('ladder-palette-relay-contact-nc')).toBeTruthy();
    expect(within(groups[2]).getByTestId('ladder-palette-solenoid')).toBeTruthy();
  });

  it('removes the selected element with Delete or Backspace, but not while typing in a field', () => {
    render(<Harness initial={startStopExample()} />);
    fireEvent.mouseDown(element('S5'));
    fireEvent.keyDown(screen.getByTestId('ladder-tag-input'), { key: 'Backspace' });
    expect(screen.queryByTestId('ladder-element-S5')).toBeTruthy();
    fireEvent.keyDown(element('S5'), { key: 'Delete' });
    expect(screen.queryByTestId('ladder-element-S5')).toBeNull();
    expect(screen.queryByTestId('ladder-properties')).toBeNull();
  });
});

describe('control circuit layout and history', () => {
  it('puts the component library on the left of the wiring workspace', () => {
    render(<Harness />);
    const palette = screen.getByTestId('ladder-palette');
    const workspace = screen.getByTestId('ladder-workspace');
    expect(palette.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(workspace.querySelector('[data-testid="relay-ladder"]')).toBeTruthy();
    expect(palette.querySelector('[data-testid="ladder-add-path"]')).toBeNull();
  });

  it('undoes and redoes edits with Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z', () => {
    render(<Harness initial={startStopExample()} />);
    const panel = screen.getByTestId('control-circuit');
    fireEvent.click(screen.getByTestId('ladder-clear'));
    expect(screen.queryByTestId('ladder-element-S5')).toBeNull();
    fireEvent.keyDown(panel, { key: 'z', ctrlKey: true });
    expect(screen.queryByTestId('ladder-element-S5')).toBeTruthy();
    fireEvent.keyDown(panel, { key: 'y', ctrlKey: true });
    expect(screen.queryByTestId('ladder-element-S5')).toBeNull();
    fireEvent.keyDown(panel, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(panel, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(screen.queryByTestId('ladder-element-S5')).toBeNull();
  });
});

describe('control circuit language', () => {
  const EMOJI = /\p{Extended_Pictographic}/u;
  it.each([
    ['ar', 'المدخلات والحساسات', 'ملف مرحّل'],
    ['es', 'Entradas y sensores', 'Bobina de relé'],
    ['en', 'Inputs & Sensors', 'Relay coil'],
  ])('%s: palette and hints are translated with no emoji', async (lang, inputs, coil) => {
    await act(async () => { await i18n.changeLanguage(lang); });
    render(<I18nextProvider i18n={i18n}><Harness initial={startStopExample()} /></I18nextProvider>);
    const panel = screen.getByTestId('control-circuit');
    expect(panel.textContent).toContain(inputs);
    expect(screen.getByTestId('ladder-palette-relay-coil').textContent).toContain(coil);
    expect(screen.getByRole('button', { name: coil })).toBe(screen.getByTestId('ladder-palette-relay-coil'));
    expect(EMOJI.test(panel.textContent ?? '')).toBe(false);
    if (lang === 'ar') {
      const words = (screen.getByTestId('ladder-hint').textContent ?? '').match(/[A-Za-z]{3,}/g) ?? [];
      expect(words).toEqual([]);
    }
  });
});
