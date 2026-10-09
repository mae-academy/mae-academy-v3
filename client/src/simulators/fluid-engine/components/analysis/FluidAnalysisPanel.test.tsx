// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { EngineComponent, EngineSnapshot, EngineWire } from '@shared/fluid/engine/types';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import type { CutawayComponent } from '../dissection/cutawayPhysics';
import { AND_GEOMETRY } from '../dissection/DualPressureCutaway';
import { CHAMBER, PISTON, PISTON_MAX_X, PISTON_MIN_X, TRAVEL } from '../dissection/cylinderGeometry';
import { FluidAnalysisPanel } from './FluidAnalysisPanel';

afterEach(cleanup);

const colors: Palette = {
  background: '#eaf0f8', canvas: '#f8fbff', panel: '#ffffff', panelAlt: '#f1f5fb', line: '#d7e2ef', text: '#172033', muted: '#64748b', subtle: '#94a3b8',
  primary: '#2563eb', accent: '#7c3aed', danger: '#be123c', selection: '#7C3AED', grid: '#dbe7f3', wire: '#0f172a', powered: '#2563eb', input: '#ffffff', shadow: 'none',
};

const part = (id: string, type: string, label: string, props: Record<string, unknown> = {}): CutawayComponent => ({
  id, type, label, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props },
});
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};

/** Everything the panel needs for one selected component, with a real engine behind the snapshot. */
function scene(component: CutawayComponent, setup?: (engine: FluidEngine) => void): { component: CutawayComponent; snapshot: EngineSnapshot } {
  const engine = new FluidEngine({ components: [component as EngineComponent], wires: [] as EngineWire[] });
  setup?.(engine);
  return { component, snapshot: engine.step() };
}

const renderPanel = (selected: CutawayComponent | undefined, snapshot: EngineSnapshot, initialTab: 'control' | 'cutaway' = 'cutaway') =>
  render(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={snapshot} selected={selected} initialTab={initialTab} />);

const EMPTY = new FluidEngine({ components: [], wires: [] }).getSnapshot();

describe('FluidAnalysisPanel tabs', () => {
  it('offers the cutaway, control-circuit and function-diagram tabs, with no input board', () => {
    renderPanel(undefined, EMPTY);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['Cutaway Anatomy', 'Control Circuit (Ladder / Electrical)', 'Function Diagram (Displacement-Step)']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('analysis-tab-board')).toBeNull();
    expect(screen.queryByRole('button', { name: /push|latch/i })).toBeNull();
  });

  it('hosts a control-circuit scaffold tab', () => {
    renderPanel(undefined, EMPTY);
    fireEvent.click(screen.getByTestId('analysis-tab-control'));
    expect(screen.getByTestId('control-circuit-scaffold')).toBeTruthy();
  });

  it('shows the placeholder banner when nothing inspectable is selected', () => {
    renderPanel(undefined, EMPTY);
    expect(screen.getByTestId('cutaway-empty').textContent).toBe('Select an AND, OR, 5/2, 5/3 valve, or a Cylinder on the canvas to inspect its internal physical mechanism.');
    expect(screen.queryByTestId('cutaway-viewer')).toBeNull();
  });

  it('treats a part without a cutaway (a sequence valve) as nothing selected', () => {
    const { component, snapshot } = scene(part('v3', 'sequence-ext', '1V9'));
    renderPanel(component, snapshot);
    expect(screen.getByTestId('cutaway-empty')).toBeTruthy();
  });

  it('shows the cutaway of the selected part with no badge or tab icons, and switches tabs on click', () => {
    const { component, snapshot } = scene(part('v', 'valve-5-2', '1V1'));
    renderPanel(component, snapshot, 'control');
    expect(screen.queryByTestId('cutaway-badge')).toBeNull();
    expect(screen.getByTestId('analysis-tab-cutaway').querySelector('svg')).toBeNull();
    expect(screen.queryByTestId('cutaway-viewer')).toBeNull();

    fireEvent.click(screen.getByTestId('analysis-tab-cutaway'));
    expect(screen.getByTestId('cutaway-viewer')).toBeTruthy();
    expect(screen.queryByTestId('control-circuit-scaffold')).toBeNull();
  });
});

describe('selecting each supported component mounts its cutaway', () => {
  const cases: Array<{ type: string; label: string; stage: string; kind: string; name: string }> = [
    { type: 'dual-pressure-valve', label: '1V1', stage: 'cutaway-and', kind: 'and', name: 'Dual-Pressure Valve (AND)' },
    { type: 'shuttle-valve', label: '1V2', stage: 'cutaway-or', kind: 'or', name: 'Shuttle Valve (OR)' },
    { type: 'valve-3-2-nc', label: '1V2', stage: 'cutaway-spool32', kind: 'spool32', name: '3/2 Spool Valve' },
    { type: 'valve-2-2-no', label: '1V1', stage: 'cutaway-spool22', kind: 'spool22', name: '2/2 Spool Valve' },
    { type: 'valve-4-2', label: '1V5', stage: 'cutaway-spool42', kind: 'spool42', name: '4/2 Spool Valve' },
    { type: 'flow-control', label: '1V6', stage: 'cutaway-throttle', kind: 'throttle', name: 'Throttle Valve (Adjustable)' },
    { type: 'flow-control-oneway', label: '1V7', stage: 'cutaway-oneway', kind: 'oneway', name: 'One-Way Flow Control Valve' },
    { type: 'valve-5-2', label: '1V3', stage: 'cutaway-spool52', kind: 'spool52', name: '5/2 Spool Valve' },
    { type: 'valve-5-3', label: '1V4', stage: 'cutaway-spool53', kind: 'spool53', name: '5/3 Closed-Centre Spool Valve' },
    { type: 'cylinder-double', label: '1A1', stage: 'cutaway-cushion', kind: 'cushion', name: 'Cushioned Cylinder' },
    { type: 'cylinder-single', label: '1A0', stage: 'cutaway-single', kind: 'single', name: 'Single-Acting Spring-Return Cylinder' },
  ];

  for (const { type, label, stage, kind, name } of cases) {
    it(`${type} → ${stage}`, () => {
      const { component, snapshot } = scene(part('c', type, label, type === 'cylinder-double' ? { cushioning: 'Adjustable - both' } : {}));
      renderPanel(component, snapshot);
      const viewer = screen.getByTestId('cutaway-viewer');
      expect(viewer.getAttribute('data-kind')).toBe(kind);
      expect(within(viewer).getByTestId(stage)).toBeTruthy();
      expect(viewer.querySelectorAll('svg')).toHaveLength(1);
      expect(viewer.querySelector('header')!.textContent).toContain(`${label} · ${name}`);
      expect(screen.getByTestId('cutaway-state').textContent).not.toBe('');
      expect(screen.getByTestId('cutaway-readings').children.length).toBeGreaterThanOrEqual(type === 'cylinder-single' ? 1 : 2);
      expect(screen.getByTestId('cutaway-description').textContent!.length).toBeGreaterThan(30);
      expect(screen.queryByTestId('cutaway-badge')).toBeNull();
    });
  }

  it('the double-rod cylinder opens the same cushion cutaway, with a rod through the rear cap too', () => {
    const { component, snapshot } = scene(part('c', 'cylinder-double-rod', '1A2', { cushioning: 'Fixed - both' }));
    renderPanel(component, snapshot);
    const stage = screen.getByTestId('cutaway-cushion');
    expect(stage.querySelectorAll('.cushion-spear')).toHaveLength(2);
    expect(stage.querySelectorAll('[data-needle="fixed"]')).toHaveLength(2);
  });

  it('switches stage when the selection changes', () => {
    const and = scene(part('a', 'dual-pressure-valve', '1V1'));
    const or = scene(part('o', 'shuttle-valve', '1V2'));
    const { rerender } = renderPanel(and.component, and.snapshot);
    expect(screen.getByTestId('cutaway-and')).toBeTruthy();
    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={or.snapshot} selected={or.component} initialTab="cutaway" />);
    expect(screen.queryByTestId('cutaway-and')).toBeNull();
    expect(screen.getByTestId('cutaway-or')).toBeTruthy();
    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={or.snapshot} selected={undefined} initialTab="cutaway" />);
    expect(screen.getByTestId('cutaway-empty')).toBeTruthy();
  });
});

describe('stages are driven by the snapshot', () => {
  const style = (element: Element | null) => (element as HTMLElement).style.transform;

  it('AND: the H-spool slides to the signal-free side and centres when both inlets are live', () => {
    const component = part('a', 'dual-pressure-valve', '1V1');
    const left = scene(component, engine => engine.injectPressure('a', 'x', 6));
    const { rerender, container } = renderPanel(component, left.snapshot);
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Blocked — left signal only');
    expect(container.querySelector('#and-spool')!.getAttribute('data-offset')).toBe('1');
    expect(style(container.querySelector('#and-spool'))).toContain('translate(40px');
    expect(container.querySelectorAll('.cutaway-stream').length).toBe(1); // dead-ends at the disc face

    const both = scene(component, engine => { engine.injectPressure('a', 'x', 6); engine.injectPressure('a', 'y', 6); });
    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={both.snapshot} selected={component} initialTab="cutaway" />);
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Open — both signals present');
    expect(container.querySelector('#and-spool')!.getAttribute('data-offset')).toBe('0');
    expect(style(container.querySelector('#and-spool'))).toContain('translate(0px');
    expect(container.querySelectorAll('.cutaway-stream').length).toBe(4); // two bypass channels per inlet, all ending in port 2
  });

  it('OR: the ball goes to the opposite seat, ±140 units', () => {
    const component = part('o', 'shuttle-valve', '1V2');
    const right = scene(component, engine => engine.injectPressure('o', 'y', 5));
    const { container } = renderPanel(component, right.snapshot);
    const ball = container.querySelector('#shuttle-ball')!;
    expect(ball.parentElement!.getAttribute('data-offset')).toBe('-1');
    expect(style(ball.parentElement)).toContain('translate(-140px');
    expect(screen.getByTestId('cutaway-description').textContent).toContain('left conical seat');
  });

  it('5/2: the spool and its readings follow the pilot signal', () => {
    const component = part('v', 'valve-5-2', '1V3', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' });
    const rest = scene(component);
    const { rerender, container } = renderPanel(component, rest.snapshot);
    expect(style(container.querySelector('.cutaway-spool'))).toContain('translate(165px');
    const actuated = scene(component, engine => { engine.injectPressure('v', 'p1', 6); engine.injectPressure('v', 'pilotL', 6); });
    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={actuated.snapshot} selected={component} initialTab="cutaway" />);
    expect(style(container.querySelector('.cutaway-spool'))).toContain('translate(255px');
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Actuated — 1→4, 2→3');
    expect(screen.getByTestId('cutaway-readings').textContent).toContain('14');
    expect(container.querySelectorAll('.cutaway-stream').length).toBe(1);
  });

  it('5/3: both centring springs are drawn, and the lands close the ports in mid-position', () => {
    const component = part('v', 'valve-5-3', '1V4');
    const { container } = renderPanel(component, scene(component).snapshot);
    expect(style(container.querySelector('.cutaway-spool'))).toContain('translate(210px');
    expect(container.querySelectorAll('[data-testid="cutaway-spool53"] g[style*="scaleX"]')).toHaveLength(2);
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Mid-position — all ports closed');
  });

  it('cylinder: the piston assembly translates with the stroke and the spear engages inside the cushion zone', () => {
    const component = part('cyl', 'cylinder-double', '1A1', { cushioning: 'Adjustable - both' });
    const network = { components: [part('src', 'pressure-source', '0Z1'), part('v', 'valve-5-2', '1V1', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' }), component] as EngineComponent[], wires: [pipe('src:out', 'v:p1'), pipe('v:p4', 'cyl:a'), pipe('v:p2', 'cyl:b')] };
    const engine = new FluidEngine(network);
    engine.injectPressure('v', 'pilotL', 6);

    let mid: EngineSnapshot | undefined;
    let cushioning: EngineSnapshot | undefined;
    for (let tick = 0; tick < 400 && !cushioning; tick += 1) {
      const snapshot = engine.step();
      if (!mid && snapshot.cylinders.cyl.stroke > 0.4) mid = snapshot;
      if (snapshot.cylinders.cyl.stroke > 0.95) cushioning = snapshot;
    }
    const { rerender, container } = renderPanel(component, mid!);
    const assembly = () => container.querySelector('#piston-rod-assembly');
    expect(Number(assembly()!.getAttribute('data-stroke'))).toBeCloseTo(mid!.cylinders.cyl.stroke, 2);
    // The piston head travels TRAVEL stage units (the bore minus the end-cap clearances) over the full stroke.
    expect(Number(/translate\(([\d.]+)px/.exec(style(assembly()))![1])).toBeCloseTo(mid!.cylinders.cyl.stroke * TRAVEL, 1);
    expect(mid!.cylinders.cyl.stroke).toBeGreaterThan(0.4);
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Normal stroke — free exhaust');
    expect(screen.queryByText('main exit closed')).toBeNull();

    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={cushioning!} selected={component} initialTab="cutaway" />);
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Cushioning — exhaust throttled');
    expect(screen.getByText('main exit closed')).toBeTruthy();
    expect(container.querySelectorAll('.cutaway-stream').length).toBeGreaterThan(0);
    const front = container.querySelector('.cushion-spear[data-end="front"]')!;
    expect(Number(front.getAttribute('data-depth'))).toBeGreaterThan(0.4);
  });

  it('shows hydraulic pressures in the hydraulic palette', () => {
    const component = part('o', 'shuttle-valve', '1V2');
    const { snapshot } = scene(component, engine => engine.injectPressure('o', 'x', 50));
    const { container } = render(<FluidAnalysisPanel colors={colors} isDark={false} medium="HYDRAULIC" snapshot={snapshot} selected={component} initialTab="cutaway" />);
    const fills = [...container.querySelectorAll('[data-testid="cutaway-or"] rect')].map(rect => rect.getAttribute('fill'));
    expect(fills).toContain('#b91c1c');
  });
});

describe('AND cutaway clearances', () => {
  const { CX, DISC, GAP, TRAVEL: AND_TRAVEL, SHOULDER, DUCT_HALF, CHAMBER: AND_CHAMBER, SLOT_CENTER, SLOT_HALF, SHAFT_HALF, HUB_HALF } = AND_GEOMETRY;

  it('the central gap between the discs is wider than a disc, with room for ducts above and below the shaft', () => {
    expect(GAP).toBeGreaterThan(DISC.width);
    expect(SLOT_CENTER - SLOT_HALF).toBeGreaterThan(SHAFT_HALF);
    expect(SLOT_CENTER + SLOT_HALF).toBeLessThan(DISC.half);
    expect(HUB_HALF).toBeLessThan(GAP / 2);
    expect(2 * DUCT_HALF).toBeLessThan(GAP);
  });

  it('a disc pushed over by one signal covers port 2 and the far disc lands exactly on its shoulder', () => {
    expect(DISC.width / 2).toBeGreaterThanOrEqual(DUCT_HALF);
    expect(CX + AND_TRAVEL + DISC.width / 2 + AND_TRAVEL).toBeCloseTo(AND_CHAMBER.x1 - SHOULDER, 6);
    expect(CX - AND_TRAVEL - DISC.width / 2 - AND_TRAVEL).toBeCloseTo(AND_CHAMBER.x0 + SHOULDER, 6);
    expect(DISC.half).toBeLessThan(AND_CHAMBER.half);
  });

  it('draws the spool and ducts for each state: one signal blocks, two signals stream through four ducts', () => {
    const component = part('a', 'dual-pressure-valve', '1V1');
    const one = scene(component, engine => engine.injectPressure('a', 'y', 6));
    const { rerender, container } = renderPanel(component, one.snapshot);
    expect(container.querySelector('#and-spool')!.getAttribute('data-offset')).toBe('-1');
    expect(container.querySelector('.and-streams')).toBeNull();
    const both = scene(component, engine => { engine.injectPressure('a', 'x', 6); engine.injectPressure('a', 'y', 6); });
    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={both.snapshot} selected={component} initialTab="cutaway" />);
    const streams = container.querySelectorAll('.and-streams .cutaway-stream');
    expect(streams).toHaveLength(4);
    expect(container.querySelectorAll('.and-streams polygon')).toHaveLength(4); // an arrowhead on each streamline
    expect(container.querySelectorAll('.and-shaft')).toHaveLength(2); // shaft interrupted by the cross-bore
  });
});

describe('cylinder cutaways keep the piston inside the bore', () => {
  const pistonX = (container: HTMLElement) => Number(container.querySelector('#piston-rod-assembly')!.getAttribute('data-piston-x'));
  const withStroke = (component: CutawayComponent, stroke: number, bar = 0): EngineSnapshot => ({
    ...scene(component).snapshot,
    cylinders: { [component.id]: { stroke, velocity: 0, force: 0, chamberPressureA: bar, chamberPressureB: 0 } },
    portPressure: { [`${component.id}:a`]: bar, [`${component.id}:b`]: 0 },
  });

  it('double-acting and through-rod: the piston face stops short of both caps at 0 %, 100 % and out-of-range readings', () => {
    for (const type of ['cylinder-double', 'cylinder-double-rod']) {
      const component = part('c', type, '1A1', { cushioning: 'Fixed - both' });
      for (const stroke of [-0.2, 0, 0.5, 1, 1.3, Number.NaN]) {
        const { container } = renderPanel(component, withStroke(component, stroke));
        const x = pistonX(container);
        expect(x, `${type} @ ${stroke}`).toBeGreaterThanOrEqual(CHAMBER.x0 + 1);
        expect(x + PISTON.width, `${type} @ ${stroke}`).toBeLessThanOrEqual(CHAMBER.x1 - 1);
        cleanup();
      }
      expect(PISTON_MIN_X).toBeGreaterThan(CHAMBER.x0);
      expect(PISTON_MAX_X + PISTON.width).toBeLessThan(CHAMBER.x1);
    }
  });

  it('the port channels are never covered by the rod or piston, and fluid is masked to the bore', () => {
    const component = part('c', 'cylinder-double-rod', '1A2', { cushioning: 'Adjustable - both' });
    const { container } = renderPanel(component, withStroke(component, 1, 6));
    const stage = container.querySelector('[data-testid="cutaway-cushion"]')!;
    const rods = Array.from(stage.querySelectorAll('#piston-rod-assembly > rect')).filter(rect => Number(rect.getAttribute('height')) === 16);
    expect(rods.length).toBeGreaterThan(0);
    for (const rod of rods) {
      // the rod's band (y 162–178) lies below the bottom of every port channel (y < 146)
      expect(Number(rod.getAttribute('y'))).toBeGreaterThan(146);
    }
    const clip = stage.querySelector('clipPath')!;
    expect(clip.querySelectorAll('rect').length).toBe(7); // bore + 3 bores per cap
    expect(stage.querySelector('.cutaway-piston-fluid')!.parentElement!.getAttribute('clip-path')).toContain(clip.id);
  });
});

describe('single-acting cylinder cutaway', () => {
  const component = part('s', 'cylinder-single', '1A0');
  const at = (stroke: number, velocity: number, bar: number): EngineSnapshot => ({
    ...scene(component).snapshot,
    cylinders: { s: { stroke, velocity, force: 0, chamberPressureA: bar, chamberPressureB: 0 } },
    portPressure: { 's:a': bar },
  });
  const springLength = (container: HTMLElement) => Number(container.querySelector('.return-spring')!.getAttribute('data-spring-length'));

  it('compresses the spring on the forward stroke and never lets the piston reach the front cap', () => {
    const lengths: number[] = [];
    for (const stroke of [0, 0.5, 1, 1.4]) {
      const { container } = renderPanel(component, at(stroke, 0, 6));
      lengths.push(springLength(container));
      const x = Number(container.querySelector('#piston-rod-assembly')!.getAttribute('data-piston-x'));
      expect(x + PISTON.width).toBeLessThan(CHAMBER.x1 - 30); // the spring keeps at least its solid length
      cleanup();
    }
    expect(lengths[0]).toBeGreaterThan(lengths[1]);
    expect(lengths[1]).toBeGreaterThan(lengths[2]);
    expect(lengths[2]).toBeCloseTo(40, 0);
    expect(lengths[3]).toBe(lengths[2]);
  });

  it('retracts under spring force when the pressure drops, and shows the single port plus the vent', () => {
    const { container, rerender } = renderPanel(component, at(0.6, 0.3, 6));
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Extending — pressure compresses the spring');
    expect(container.querySelectorAll('.cutaway-stream').length).toBe(2); // supply into A, exhaust through the vent
    rerender(<FluidAnalysisPanel colors={colors} isDark={false} medium="PNEUMATIC" snapshot={at(0.4, -0.3, 0)} selected={component} initialTab="cutaway" />);
    expect(screen.getByTestId('cutaway-state').textContent).toBe('Retracting — spring drives the piston back');
    expect(container.querySelectorAll('.cutaway-stream').length).toBe(2);
    expect(container.querySelector('[data-testid="cutaway-single"]')!.textContent).toContain('Vent');
    expect(container.querySelectorAll('[data-testid="cutaway-single"] g[style*="scaleX"]')).toHaveLength(1);
  });

  it('follows a real engine run: pressure drives it to the end of the stroke against the spring', () => {
    const network = { components: [part('src', 'pressure-source', '0Z1'), part('v', 'valve-3-2-nc', '1V1', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' }), component] as EngineComponent[], wires: [pipe('src:out', 'v:p1'), pipe('v:p2', 's:a')] };
    const engine = new FluidEngine(network);
    engine.injectPressure('v', 'pilotL', 6);
    let snapshot = engine.step();
    for (let tick = 0; tick < 2000 && !(snapshot.cylinders.s.stroke > 0.99 && Math.abs(snapshot.cylinders.s.velocity) < 1e-4); tick += 1) snapshot = engine.step();
    expect(snapshot.cylinders.s.stroke).toBeGreaterThan(0.99);
    const { container } = renderPanel(component, snapshot);
    expect(springLength(container)).toBeLessThan(60);
    expect(screen.getByTestId('cutaway-state').textContent).toContain('Fully extended');
  });
});
