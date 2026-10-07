// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { chargeTime } from '@shared/fluid/engine/componentSolvers';
import { DEFAULT_ENGINE_CONFIG } from '@shared/fluid/engine/types';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { AirReservoirCutaway, GAUGE_MAX, gaugeAngle, inflowPeriod } from './AirReservoirCutaway';
import { TIMER, TimeDelayCutaway, pilotChannelX } from './TimeDelayCutaway';
import { CutawayViewer } from './CutawayViewer';
import { cutawayControls, upstreamThrottle } from './cutawayControls';
import { analyzeCutaway, analyzeReservoir, analyzeTimer, chargePhase, cutawayKindOf, type CutawayComponent } from './cutawayPhysics';
import { chargeColor, cutawayTheme, mixColor } from './cutawayParts';

afterEach(cleanup);

const THEME = cutawayTheme(false);
const THRESHOLD = DEFAULT_ENGINE_CONFIG.pilotThreshold;
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };
const PUSH = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
const COLORS = { background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#f1f5f9', line: '#cbd5e1', text: '#0f172a', muted: '#64748b', subtle: '', primary: '', accent: '', danger: '', selection: '#2563eb', grid: '', wire: '', powered: '', input: '', shadow: '' };

/** Source → push valve → [throttle] → reservoir → nothing. */
function reservoirRun(throttleType: 'flow-control' | 'flow-control-oneway', opening = 20) {
  const reservoir = part('res', 'air-reservoir');
  const parts = [part('src', 'pressure-source'), part('v0', 'valve-3-2-nc', PUSH), part('fc', throttleType, { openingPercentage: opening }), reservoir];
  const engine = new FluidEngine({ components: parts, wires: [wire('src:out', 'v0:p1'), wire('v0:p2', 'fc:in'), wire('fc:out', 'res:left')] } as never);
  return { engine, reservoir, parts, wires: [wire('src:out', 'v0:p1'), wire('v0:p2', 'fc:in'), wire('fc:out', 'res:left')] };
}

/** Source → push valve → time-delay valve → gauge. */
function timerRun(props: Record<string, unknown> = {}) {
  const timer = part('td', 'time-delay-valve', props);
  const engine = new FluidEngine({
    components: [part('src', 'pressure-source'), part('v0', 'valve-3-2-nc', PUSH), timer, part('out', 'pressure-gauge')],
    wires: [wire('src:out', 'v0:p1'), wire('src:out', 'td:p1'), wire('v0:p2', 'td:z12'), wire('td:p2', 'out:p')],
  } as never);
  return { engine, timer };
}

describe('registry', () => {
  it('opens a cutaway for the air reservoir and the time-delay valve', () => {
    expect(cutawayKindOf({ type: 'air-reservoir' })).toBe('reservoir');
    expect(cutawayKindOf({ type: 'time-delay-valve' })).toBe('timer');
  });
});

describe('colour of the charge', () => {
  it('blends light grey into deep blue in proportion', () => {
    expect(chargeColor(0)).toBe('#F3F4F6');
    expect(chargeColor(1)).toBe('#2563EB');
    expect(mixColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(chargeColor(2)).toBe(chargeColor(1));
  });
});

describe('air reservoir cutaway', () => {
  it('classifies charging, charged, discharging and empty from the rate of change', () => {
    expect(chargePhase(0, 0, 6)).toBe('empty');
    expect(chargePhase(2, 1.2, 6)).toBe('charging');
    expect(chargePhase(6, 0.001, 6)).toBe('charged');
    expect(chargePhase(5.95, 0.2, 6)).toBe('charged');
    expect(chargePhase(3, -0.5, 6)).toBe('discharging');
  });

  it('reads pressure, rate, supply and volume from the engine, and fills in proportion to P / P_supply', () => {
    const { engine, reservoir } = reservoirRun('flow-control-oneway');
    expect(analyzeReservoir(reservoir, engine.step()).phase).toBe('empty');
    engine.setManual('v0', 'left', true);
    const early = analyzeReservoir(reservoir, engine.step(1));
    expect(early.phase).toBe('charging');
    expect(early.supply).toBe(6);
    expect(early.pressure).toBeGreaterThan(0.5);
    expect(early.ratio).toBeCloseTo(early.pressure / 6, 6);
    expect(early.rate).toBeGreaterThan(0);
    expect(early.volumeCm3).toBe(1000);
    const late = analyzeReservoir(reservoir, engine.step(40));
    expect(late.phase).toBe('charged');
    expect(late.ratio).toBeGreaterThan(0.99);
    expect(late.storedLitres).toBeCloseTo((1000 / 1000) * (late.pressure / 1.01325), 6);
  });

  it('draws a smoothly saturating fill, a gauge that follows the bar reading and the live read-out', () => {
    const { engine, reservoir } = reservoirRun('flow-control-oneway');
    engine.setManual('v0', 'left', true);
    const analysis = analyzeReservoir(reservoir, engine.step(2));
    const svg = render(<AirReservoirCutaway analysis={analysis} medium="PNEUMATIC" theme={THEME} />).container.querySelector('svg')!;
    expect(svg.getAttribute('data-fill')).toBe(chargeColor(analysis.ratio));
    expect(svg.querySelector('.gas-fill')!.getAttribute('fill')).toBe(chargeColor(analysis.ratio));
    expect(Number(svg.querySelector('.gauge-needle')!.getAttribute('data-angle'))).toBeCloseTo(gaugeAngle(analysis.pressure), 1);
    expect(svg.querySelector('[data-testid="reservoir-hud"]')!.textContent).toContain(`${analysis.pressure.toFixed(1)} bar`);
    expect(svg.querySelector('[data-testid="reservoir-hud"]')!.textContent).toContain('Charging');
    expect(svg.querySelector('[data-testid="reservoir-hud"]')!.textContent).toContain('1000 cm³');
    expect(svg.querySelector('.vessel-shell')).not.toBeNull();
    expect(svg.querySelectorAll('.vessel-saddle')).toHaveLength(2);
  });

  it('gauge needle sweeps 270° from 0 to full scale', () => {
    expect(gaugeAngle(0)).toBe(-135);
    expect(gaugeAngle(GAUGE_MAX / 2)).toBe(0);
    expect(gaugeAngle(GAUGE_MAX)).toBe(135);
    expect(gaugeAngle(99)).toBe(135);
  });

  it('inlet dots enter while charging, slow down as the vessel fills, and run backwards when it discharges', () => {
    expect(inflowPeriod(0.9)).toBeGreaterThan(inflowPeriod(0.5));
    expect(inflowPeriod(0.5)).toBeGreaterThan(inflowPeriod(0));
    const { engine, reservoir } = reservoirRun('flow-control', 20);
    engine.setManual('v0', 'left', true);
    const charging = analyzeReservoir(reservoir, engine.step(1));
    const dots = render(<AirReservoirCutaway analysis={charging} medium="PNEUMATIC" theme={THEME} />).container.querySelector('[data-testid="inlet-dots"]')!;
    expect(dots.getAttribute('data-reverse')).toBe('false');
    cleanup();
    engine.step(40);
    const charged = analyzeReservoir(reservoir, engine.getSnapshot());
    expect(render(<AirReservoirCutaway analysis={charged} medium="PNEUMATIC" theme={THEME} />).container.querySelector('[data-testid="inlet-dots"]')).toBeNull();
    cleanup();
    engine.setManual('v0', 'left', false);
    const discharging = analyzeReservoir(reservoir, engine.step(0.5));
    expect(discharging.phase).toBe('discharging');
    expect(discharging.rate).toBeLessThan(0);
    expect(render(<AirReservoirCutaway analysis={discharging} medium="PNEUMATIC" theme={THEME} />).container.querySelector('[data-testid="inlet-dots"]')!.getAttribute('data-reverse')).toBe('true');
  });

  it('empties at once behind a one-way flow control', () => {
    const { engine, reservoir } = reservoirRun('flow-control-oneway');
    engine.setManual('v0', 'left', true);
    engine.step(40);
    engine.setManual('v0', 'left', false);
    const analysis = analyzeReservoir(reservoir, engine.step());
    expect(analysis.pressure).toBe(0);
    expect(analysis.phase).not.toBe('charging');
  });
});

describe('time delay valve cutaway', () => {
  const stage = (analysis: ReturnType<typeof analyzeTimer>) => render(<TimeDelayCutaway analysis={analysis} medium="PNEUMATIC" theme={THEME} />).container.querySelector('svg')!;
  const spoolOf = (svg: Element) => svg.querySelector('[data-testid="cutaway-spool32"]')!;

  it('passes through delay, switching and an instant reset', () => {
    const { engine, timer } = timerRun({ openingPercentage: 20, volume: 500 });
    expect(analyzeTimer(timer, engine.step()).phase).toBe('idle');
    engine.setManual('v0', 'left', true);
    const delay = analyzeTimer(timer, engine.step(0.5));
    expect(delay.phase).toBe('delay');
    expect(delay.open).toBe(false);
    expect(delay.chamberBar).toBeGreaterThan(0);
    expect(delay.chamberBar).toBeLessThan(THRESHOLD);
    expect(delay.direction).toBe(1);
    expect(delay.remaining).toBeCloseTo(chargeTime(6, delay.chamberBar, THRESHOLD, 20, 500), 6);
    expect(delay.spool.offset).toBe(0);

    const switched = analyzeTimer(timer, engine.step(5));
    expect(switched.phase).toBe('switched');
    expect(switched.open).toBe(true);
    expect(switched.chamberBar).toBeGreaterThanOrEqual(THRESHOLD);
    expect(switched.spool.offset).toBe(1);
    expect(switched.p2).toBe(6);

    engine.setManual('v0', 'left', false);
    const reset = analyzeTimer(timer, engine.step());
    expect(reset.open).toBe(false);
    expect(reset.chamberBar).toBe(0);
    expect(reset.phase).toBe('idle');
  });

  it('the pilot threshold is the cracking pressure shown on the gauge', () => {
    const { engine, timer } = timerRun();
    const svg = stage(analyzeTimer(timer, engine.step()));
    expect(svg.querySelector('.gauge-mark')).not.toBeNull();
    expect(analyzeTimer(timer, engine.getSnapshot()).threshold).toBe(THRESHOLD);
  });

  it('stacks the three stages in one housing and joins the chamber to the spool valve pilot face', () => {
    const { engine, timer } = timerRun();
    const svg = stage(analyzeTimer(timer, engine.step()));
    const rect = (selector: string) => { const el = svg.querySelector(selector)!; return { y: Number(el.getAttribute('y')), height: Number(el.getAttribute('height')), x: Number(el.getAttribute('x')), width: Number(el.getAttribute('width')) }; };
    const upper = rect('.oneway-core .valve-body');
    const chamber = rect('.chamber-body');
    expect(upper.y + upper.height).toBe(chamber.y);
    expect(upper.x).toBe(chamber.x);
    expect(upper.width).toBe(chamber.width);
    // the nested spool valve is scaled to the housing width and sits under the chamber
    const nested = spoolOf(svg);
    expect(nested).not.toBeNull();
    expect(Number(nested.getAttribute('y'))).toBeGreaterThan(chamber.y + chamber.height - 40);
    // the pilot line runs from the chamber to the channel of the spool's pilot face
    const line = rect('.pilot-line');
    expect(pilotChannelX()).toBeGreaterThan(line.x);
    expect(pilotChannelX()).toBeLessThan(line.x + line.width);
    expect(TIMER.spoolScale).toBeCloseTo(580 / 740, 9);
  });

  it('the needle follows the throttle opening and the chamber fills with the pressure ratio', () => {
    const open = timerRun({ openingPercentage: 100 });
    open.engine.setManual('v0', 'left', true);
    const a = analyzeTimer(open.timer, open.engine.step(0.3));
    const nearlyShut = timerRun({ openingPercentage: 10 });
    nearlyShut.engine.setManual('v0', 'left', true);
    const b = analyzeTimer(nearlyShut.timer, nearlyShut.engine.step(0.3));
    expect(a.chamberBar).toBeGreaterThan(b.chamberBar);
    const shift = (svg: Element) => Number(svg.querySelector('.flow-needle')!.getAttribute('data-shift'));
    const svgA = stage(a);
    const shiftA = shift(svgA);
    cleanup();
    const svgB = stage(b);
    expect(shiftA).toBeGreaterThan(shift(svgB));
    expect(svgB.querySelector('.chamber-fill')!.getAttribute('fill')).toBe(chargeColor(b.ratio));
  });

  it('the spool snaps open once the chamber reaches the cracking pressure, and the stream reaches port 2', () => {
    const { engine, timer } = timerRun();
    engine.setManual('v0', 'left', true);
    const before = stage(analyzeTimer(timer, engine.step(0.4)));
    expect(before.getAttribute('data-spool')).toBe('closed');
    expect(Number(spoolOf(before).getAttribute('data-spool-offset'))).toBe(0);
    cleanup();
    const after = stage(analyzeTimer(timer, engine.step(6)));
    expect(after.getAttribute('data-spool')).toBe('open');
    expect(Number(spoolOf(after).getAttribute('data-spool-offset'))).toBe(1);
    expect(after.querySelectorAll('.cutaway-stream').length).toBeGreaterThan(0);
  });

  it('on reset the check valve lifts and the chamber empties backwards', () => {
    const { engine, timer } = timerRun();
    engine.setManual('v0', 'left', true);
    engine.step(1);
    // a plain throttle in front would hold it; here the signal is vented, the check bypass opens
    engine.setManual('v0', 'left', false);
    const analysis = analyzeTimer(timer, engine.step());
    expect(analysis.chamberBar).toBe(0);
    expect(analyzeCutaway(timer, engine.getSnapshot())!.kind).toBe('timer');
  });
});

describe('viewer and controls', () => {
  const circuit = () => {
    const { engine, parts, wires } = reservoirRun('flow-control-oneway', 20);
    return { engine, parts, wires, reservoir: parts[3] as CutawayComponent };
  };

  it('mounts both cutaways with the live transient metrics', () => {
    const { engine, reservoir } = circuit();
    engine.setManual('v0', 'left', true);
    const { container } = render(<CutawayViewer component={reservoir} snapshot={engine.step(1)} medium="PNEUMATIC" colors={COLORS} isDark={false} />);
    const viewer = within(container).getByTestId('cutaway-viewer');
    expect(viewer.getAttribute('data-kind')).toBe('reservoir');
    expect(within(viewer).getByTestId('cutaway-reservoir')).toBeTruthy();
    const metrics = within(viewer).getByTestId('cutaway-metrics');
    expect(metrics.textContent).toContain('dP/dt');
    expect(metrics.textContent).toContain('Stored air');
    expect(metrics.textContent).toContain('Current Pressure');
    expect(within(viewer).getByTestId('cutaway-state').textContent).toBe('Charging');
    cleanup();

    const { engine: timerEngine, timer } = timerRun();
    timerEngine.setManual('v0', 'left', true);
    const second = render(<CutawayViewer component={timer} snapshot={timerEngine.step(0.5)} medium="PNEUMATIC" colors={COLORS} isDark={false} />).container;
    expect(within(second).getByTestId('cutaway-viewer').getAttribute('data-kind')).toBe('timer');
    expect(within(second).getByTestId('cutaway-state').textContent).toContain('Delay running');
    expect(within(second).getByTestId('cutaway-metrics').textContent).toContain('Delay left');
  });

  it('finds the throttle wired to a reservoir and offers opening, volume and supply sliders', () => {
    const { parts, wires, reservoir } = circuit();
    expect(upstreamThrottle(reservoir, { components: parts as CutawayComponent[], wires })?.id).toBe('fc');
    const update = vi.fn();
    const controls = cutawayControls(reservoir, { components: parts as CutawayComponent[], wires, update }, key => key);
    expect(controls.map(control => control.id)).toEqual(['opening', 'volume', 'supply']);
    controls[0].onChange(35);
    expect(update).toHaveBeenLastCalledWith('fc', expect.objectContaining({ openingPercentage: 35 }));
    controls[1].onChange(2000);
    expect(update).toHaveBeenLastCalledWith('res', expect.objectContaining({ volume: 2000 }));
    controls[2].onChange(8);
    expect(update).toHaveBeenLastCalledWith('src', expect.objectContaining({ pressure: 8 }));
  });

  it('the time-delay valve adjusts its own throttle', () => {
    const timer = part('td', 'time-delay-valve');
    const update = vi.fn();
    const controls = cutawayControls(timer, { components: [timer], wires: [], update }, key => key);
    expect(controls.map(control => control.id)).toEqual(['opening', 'volume']);
    controls[0].onChange(60);
    expect(update).toHaveBeenLastCalledWith('td', expect.objectContaining({ openingPercentage: 60 }));
    expect(cutawayControls(part('v', 'valve-3-2-nc'), { components: [], wires: [], update }, key => key)).toEqual([]);
  });

  it('renders the sliders under the stage and reports changes', () => {
    const { engine, parts, wires, reservoir } = circuit();
    const update = vi.fn();
    const controls = cutawayControls(reservoir, { components: parts as CutawayComponent[], wires, update }, key => key);
    render(<CutawayViewer component={reservoir} snapshot={engine.step()} medium="PNEUMATIC" colors={COLORS} isDark={false} controls={controls} />);
    const box = screen.getByTestId('cutaway-controls');
    expect(within(box).getAllByRole('slider')).toHaveLength(3);
    fireEvent.change(within(box).getByLabelText('cutaway.controls.opening'), { target: { value: '55' } });
    expect(update).toHaveBeenCalledWith('fc', expect.objectContaining({ openingPercentage: 55 }));
  });
});
