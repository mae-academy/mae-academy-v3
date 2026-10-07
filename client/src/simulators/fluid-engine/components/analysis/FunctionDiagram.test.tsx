// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { FluidAnalysisPanel } from './FluidAnalysisPanel';
import { COLUMN, FunctionDiagram, LANE_COLORS, RISE } from './FunctionDiagram';
import { emptyTracker, readingsFromPositions, trackSample, type CycleTracker } from '../../models/functionDiagram';

afterEach(cleanup);

const COLORS = { line: '#ddd', text: '#111', muted: '#666', panel: '#fff', panelAlt: '#eee' } as unknown as Palette;
const cylinders = [{ id: 'a', label: '1A1', sensors: ['1B1', '1B2'] as [string, string] }, { id: 'b', label: '2A1', sensors: ['2B1', '2B2'] as [string, string] }];
const SEQUENCE: Array<[number, Record<string, number>]> = [
  [0, { a: 0, b: 0 }], [0.1, { a: 0.5, b: 0 }], [0.2, { a: 1, b: 0 }],
  [0.3, { a: 1, b: 0.5 }], [0.4, { a: 1, b: 1 }],
  [0.5, { a: 0.5, b: 1 }], [0.6, { a: 0, b: 1 }],
  [0.7, { a: 0, b: 0.5 }], [0.8, { a: 0, b: 0 }],
];
const track = (samples = SEQUENCE, from: CycleTracker = emptyTracker()) => samples.reduce((tracker, [time, positions]) => trackSample(tracker, time, readingsFromPositions(positions)), from);
const draw = (tracker: CycleTracker, props: { active?: boolean; startTag?: string } = {}) => render(<FunctionDiagram colors={COLORS} cylinders={cylinders} tracker={tracker} {...props} />).container;
const points = (container: HTMLElement, id: string) => container.querySelector(`.displacement-trace[data-cylinder="${id}"]`)!.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number) as [number, number]);

describe('FunctionDiagram: discrete step grid', () => {
  it('shows Step 1 · 2 · 3 · 4 · 1 (Cycle Complete) on a fixed grid, empty or not', () => {
    for (const tracker of [emptyTracker(), track()]) {
      const container = draw(tracker);
      expect(Array.from(container.querySelectorAll('.step-label')).map(label => label.getAttribute('data-step'))).toEqual(['1', '2', '3', '4', '1']);
      expect(container.querySelectorAll('.step-label')[4].textContent).toContain('Cycle Complete');
      expect(container.querySelectorAll('.step-label')[0].textContent).not.toContain('Cycle Complete');
      expect(container.querySelector('[data-testid="function-diagram"]')!.getAttribute('data-columns')).toBe('4');
      cleanup();
    }
  });

  it('typesets the cylinder tags and step numbers with KaTeX', () => {
    const container = draw(track());
    expect(container.querySelectorAll('.lane-label .katex').length).toBe(2);
    expect(container.querySelectorAll('.step-label .katex').length).toBe(5);
  });

  it('does not stretch or stack when the cycle loops: the same grid and the same traces after a second and third loop', () => {
    const once = track();
    const loop = (offset: number) => SEQUENCE.slice(1).map(([time, positions]): [number, Record<string, number>] => [time + offset, positions]);
    const reference = [points(draw(once), 'a'), points(draw(once), 'b')];
    cleanup();
    for (const tracker of [track(loop(1), once), track(loop(3), track(loop(1), once))]) {
      const container = draw(tracker);
      expect(container.querySelector('[data-testid="function-diagram"]')!.getAttribute('data-columns')).toBe('4');
      expect(container.querySelectorAll('.displacement-trace')).toHaveLength(2);
      expect([points(container, 'a'), points(container, 'b')]).toEqual(reference);
      cleanup();
    }
    expect(draw(track(loop(1), once)).querySelector('[data-testid="function-diagram"]')!.getAttribute('data-cycle')).toBe('2');
  });
});

describe('FunctionDiagram: geometry and lanes', () => {
  it('draws each stroke as a straight 45° ramp across one column and each dwell as a horizontal line', () => {
    const container = draw(track());
    expect(COLUMN).toBe(RISE);
    const a = points(container, 'a');
    expect(a).toHaveLength(5);
    a.slice(1).forEach(([x1, y1], index) => {
      const [x0, y0] = a[index];
      expect(x1 - x0).toBeCloseTo(COLUMN); // one column per step
      const rise = Math.abs(y1 - y0);
      expect(rise === 0 || Math.abs(rise - (x1 - x0)) < 0.01).toBe(true); // flat, or exactly 45°
    });
    expect(a.map(([, y]) => y)).toEqual([a[0][1], a[0][1] - RISE, a[0][1] - RISE, a[0][1], a[0][1]]);
  });

  it('keeps one lane per cylinder, 1A above 2A, in separate colours', () => {
    const container = draw(track());
    const lanes = Array.from(container.querySelectorAll('.diagram-lane')).map(lane => lane.getAttribute('data-cylinder'));
    expect(lanes).toEqual(['a', 'b']);
    expect(container.querySelector('.displacement-trace[data-cylinder="a"]')!.getAttribute('stroke')).toBe('#2563EB');
    expect(container.querySelector('.displacement-trace[data-cylinder="b"]')!.getAttribute('stroke')).toBe('#7C3AED');
    expect(LANE_COLORS.slice(0, 2)).toEqual(['#2563EB', '#7C3AED']);
    expect(Math.max(...points(container, 'a').map(([, y]) => y))).toBeLessThan(Math.min(...points(container, 'b').map(([, y]) => y)));
  });

  it('marks 1B2, 2B2, 1B1, 2B1 where each stroke ends', () => {
    const container = draw(track());
    expect(Array.from(container.querySelectorAll('.sensor-mark')).map(mark => mark.getAttribute('data-sensor'))).toEqual(['1B2', '2B2', '1B1', '2B1']);
  });
});

describe('FunctionDiagram: signals and playhead', () => {
  it('draws an arrow from each tripped switch to the stroke it starts, and the start signal into step 1', () => {
    const container = draw(track(), { startTag: '1S1' });
    const links = Array.from(container.querySelectorAll('.signal-link'));
    expect(links.map(link => link.getAttribute('data-line'))).toEqual(['1', '2', '3']);
    // 1B2 (top of lane 1A) → start of 2A+ (bottom of lane 2A): a vertical arrow that goes down.
    const first = links[0];
    expect(first.getAttribute('x1')).toBe(first.getAttribute('x2'));
    expect(Number(first.getAttribute('y2'))).toBeGreaterThan(Number(first.getAttribute('y1')));
    const start = container.querySelector('.start-signal')!;
    expect(start.textContent).toContain('START');
    expect(start.querySelectorAll('.katex')).toHaveLength(1);
  });

  it('labels the start signal even without a tag, and draws none before anything moved', () => {
    expect(draw(track()).querySelector('.start-signal')!.textContent).toContain('START');
    cleanup();
    expect(draw(emptyTracker()).querySelector('.start-signal')).toBeNull();
  });

  it('shows the playhead only while the simulation is live, at the step being executed', () => {
    const midway = track(SEQUENCE.slice(0, 4));
    expect(draw(midway).querySelector('.playhead')).toBeNull();
    cleanup();
    const head = draw(midway, { active: true }).querySelector('.playhead')!;
    expect(Number(head.getAttribute('data-position'))).toBeCloseTo(1.5);
    cleanup();
    expect(Number(draw(track(), { active: true }).querySelector('.playhead')!.getAttribute('data-position'))).toBe(4);
  });

  it('explains itself while there is nothing to draw', () => {
    expect(draw(emptyTracker()).textContent).toContain('start signal');
    cleanup();
    render(<FunctionDiagram colors={COLORS} cylinders={[]} tracker={emptyTracker()} />);
    expect(screen.getByTestId('function-diagram').textContent).toContain('Add a cylinder');
  });
});

describe('FluidAnalysisPanel tab', () => {
  it('is its own tab of the analysis panel', () => {
    render(<FluidAnalysisPanel colors={COLORS} isDark={false} medium="PNEUMATIC" snapshot={new FluidEngine({ components: [], wires: [] }).getSnapshot()} selected={undefined} functionDiagram={{ cylinders, tracker: track(), active: false }} />);
    fireEvent.click(screen.getByTestId('analysis-tab-function'));
    expect(screen.getByTestId('function-diagram')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Function Diagram (Displacement-Step)' }).getAttribute('aria-selected')).toBe('true');
  });
});
