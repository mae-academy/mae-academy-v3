// @vitest-environment jsdom
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { analyzeCutaway, analyzeFlowControl, analyzeSpool, cutawayKindOf, type CutawayComponent, type FlowControlAnalysis } from './cutawayPhysics';
import { cutawayTheme } from './cutawayParts';
import { FlowControlCutaway, ONEWAY_TRAVEL, POPPET_LIFT, THROTTLE_TRAVEL, needleShift, streamWidth } from './FlowControlCutaways';
import { SpoolValveCutaway } from './SpoolValveCutaway';
import { CutawayViewer } from './CutawayViewer';

afterEach(cleanup);

const THEME = cutawayTheme(false);
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };
const SPRING = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };

/** Source → 5/2 → [throttle in the rear line] → double-acting cylinder; the valve is held, or released after a full stroke. */
function throttleRun(type: string, opening: number, phase: 'extend' | 'retract') {
  const fc = part('fc', type, { openingPercentage: opening });
  const engine = new FluidEngine({
    components: [part('src', 'pressure-source'), part('v', 'valve-5-2', SPRING), fc, part('cyl', 'cylinder-double')],
    wires: [wire('src:out', 'v:p1'), wire('v:p4', 'fc:in'), wire('fc:out', 'cyl:a'), wire('v:p2', 'cyl:b')],
  } as never);
  engine.setManual('v', 'left', true);
  let snapshot = engine.step(0.3);
  if (phase === 'retract') {
    engine.step(40);
    engine.setManual('v', 'left', false);
    snapshot = engine.step(0.2);
  }
  return { fc, snapshot, analysis: analyzeFlowControl(fc, snapshot, type === 'flow-control' ? 'throttle' : 'oneway') };
}
const stage = (analysis: FlowControlAnalysis) => render(<FlowControlCutaway analysis={analysis} medium="PNEUMATIC" theme={THEME} />).container;
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe('flow control analysis', () => {
  it('registers the throttle and the one-way valve, and reads the opening from the part', () => {
    expect(cutawayKindOf({ type: 'flow-control' })).toBe('throttle');
    expect(cutawayKindOf({ type: 'flow-control-oneway' })).toBe('oneway');
    expect(throttleRun('flow-control', 35, 'extend').analysis.opening).toBe(35);
    expect(analyzeCutaway(part('fc', 'flow-control'), throttleRun('flow-control', 35, 'extend').snapshot)!.kind).toBe('throttle');
  });

  it('flow 1→2 through the cylinder supply line is controlled flow; the return 2→1 is free', () => {
    const out = throttleRun('flow-control-oneway', 20, 'extend').analysis;
    expect(out.direction).toBe(1);
    expect(out.state).toBe('Controlled flow 1→2 — through the throttle');
    expect(out.description).toContain('20 %');
    const back = throttleRun('flow-control-oneway', 20, 'retract').analysis;
    expect(back.direction).toBe(-1);
    expect(back.state).toBe('Free return 2→1 — check valve open');
  });

  it('a plain throttle chokes both directions', () => {
    expect(throttleRun('flow-control', 20, 'extend').analysis.state).toBe('Throttled flow 1→2');
    const back = throttleRun('flow-control', 20, 'retract').analysis;
    expect(back.direction).toBe(-1);
    expect(back.state).toBe('Throttled flow 2→1');
  });

  it('no flow when nothing moves', () => {
    const fc = part('fc', 'flow-control-oneway');
    const idle = new FluidEngine({ components: [fc, part('cyl', 'cylinder-double')], wires: [wire('fc:out', 'cyl:a')] } as never).step(0.2);
    const analysis = analyzeFlowControl(fc, idle, 'oneway');
    expect(analysis.direction).toBe(0);
    expect(analysis.state).toBe('No flow');
  });
});

describe('throttle cutaway', () => {
  it('the needle slides one-to-one with the opening: 0 % seated, 100 % fully retracted', () => {
    expect(needleShift(0, THROTTLE_TRAVEL)).toBe(0);
    expect(needleShift(100, THROTTLE_TRAVEL)).toBe(THROTTLE_TRAVEL);
    const shifts = [10, 25, 50, 100].map(opening => num(stage(throttleRun('flow-control', opening, 'extend').analysis).querySelector('.flow-needle')!, 'data-shift'));
    for (let i = 1; i < shifts.length; i += 1) expect(shifts[i]).toBeGreaterThan(shifts[i - 1]);
    expect(shifts[0]).toBeCloseTo(5.6);
    expect(shifts[3]).toBe(THROTTLE_TRAVEL);
  });

  it('moves the needle with a CSS transform, so the drawn screw really shifts between 10 % and 100 %', () => {
    const at = (opening: number) => (stage(throttleRun('flow-control', opening, 'extend').analysis).querySelector('.flow-needle') as HTMLElement).style.transform;
    expect(at(10)).not.toBe(at(100));
    expect(at(100)).toContain(`${-THROTTLE_TRAVEL}px`);
  });

  it('the streamline through the orifice widens with the opening', () => {
    const width = (opening: number) => {
      const c = stage(throttleRun('flow-control', opening, 'extend').analysis);
      cleanup();
      return streamWidth(opening) + 0 * c.children.length;
    };
    expect(width(10)).toBeLessThan(width(50));
    expect(width(50)).toBeLessThan(width(100));
    const drawn = (opening: number) => num(stage(throttleRun('flow-control', opening, 'extend').analysis).querySelector('.cutaway-stream')!, 'stroke-width');
    expect(drawn(10)).toBeLessThan(drawn(100));
    expect(drawn(10)).toBeCloseTo(streamWidth(10));
  });

  it('shows port 1 and port 2 and the conical seat', () => {
    const c = stage(throttleRun('flow-control', 50, 'extend').analysis);
    expect(c.querySelector('.conical-seat')).not.toBeNull();
    expect(c.querySelector('.needle-tip')).not.toBeNull();
    expect(c.querySelectorAll('.port-stub')).toHaveLength(2);
    expect(c.textContent).toContain('needle 50 % open');
  });
});

describe('one-way flow control cutaway', () => {
  it('controlled flow: check poppet seated against the seat, fluid forced through the throttle path', () => {
    const c = stage(throttleRun('flow-control-oneway', 20, 'extend').analysis);
    const poppet = c.querySelector('.check-poppet')!;
    expect(poppet.getAttribute('data-state')).toBe('seated');
    expect(num(poppet, 'data-lift')).toBe(0);
    expect(c.querySelector('svg')!.getAttribute('data-check')).toBe('seated');
    expect(c.querySelector('.check-ball')).not.toBeNull();
    expect(c.querySelector('.shoulder-rib')).not.toBeNull();
    expect(Array.from(c.querySelectorAll('.cutaway-stream')).map(stream => num(stream, 'stroke-width'))).toContainEqual(streamWidth(20));
  });

  it('free return: poppet lifted off its seat, one wide stream through the bypass', () => {
    const c = stage(throttleRun('flow-control-oneway', 20, 'retract').analysis);
    const poppet = c.querySelector('.check-poppet')!;
    expect(poppet.getAttribute('data-state')).toBe('open');
    expect(num(poppet, 'data-lift')).toBe(POPPET_LIFT);
    expect(c.querySelector('svg')!.getAttribute('data-check')).toBe('open');
    // the bypass ignores the needle: wider than the 20 % throttle stream (the grey vent arrow is the only other stream)
    const widths = Array.from(c.querySelectorAll('.cutaway-stream')).map(stream => num(stream, 'stroke-width'));
    expect(Math.max(...widths)).toBeGreaterThan(streamWidth(20));
  });

  it('the spring is compressed by the lift, and the needle still follows the opening', () => {
    const seated = stage(throttleRun('flow-control-oneway', 20, 'extend').analysis);
    const scale = (c: HTMLElement) => Number(/scaleX\(([-\d.]+)\)/.exec((c.querySelector('g[style*="scaleX"]') as HTMLElement).style.transform)![1]);
    const seatedScale = scale(seated);
    cleanup();
    const lifted = stage(throttleRun('flow-control-oneway', 20, 'retract').analysis);
    expect(scale(lifted)).toBeLessThan(seatedScale);
    expect(needleShift(100, ONEWAY_TRAVEL)).toBe(ONEWAY_TRAVEL);
    expect(num(stage(throttleRun('flow-control-oneway', 100, 'extend').analysis).querySelector('.flow-needle')!, 'data-shift')).toBe(ONEWAY_TRAVEL);
  });

  it('mounts through the viewer with the right name and readings', () => {
    const { fc, snapshot } = throttleRun('flow-control-oneway', 20, 'extend');
    const colors = { background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ddd', text: '#111', muted: '#666', subtle: '#999', primary: '#00f', accent: '#70f', danger: '#f00', selection: '#70f', grid: '#eee', wire: '#000', powered: '#00f', input: '#fff', shadow: '' };
    const { getByTestId, container } = render(<CutawayViewer component={fc} snapshot={snapshot} medium="PNEUMATIC" colors={colors as never} isDark={false} />);
    expect(getByTestId('cutaway-oneway')).toBeTruthy();
    expect(container.textContent).toContain('One-Way Flow Control Valve');
  });
});

describe('2/2 and 4/2 cutaways follow the engine', () => {
  const run = (type: string, kind: 'spool22' | 'spool42', push: boolean) => {
    const v = part('v', type, SPRING);
    const engine = new FluidEngine({
      components: [part('src', 'pressure-source'), v, part('cyl', 'cylinder-double')],
      wires: kind === 'spool22' ? [wire('src:out', 'v:p1'), wire('v:p2', 'cyl:a')] : [wire('src:out', 'v:p1'), wire('v:p4', 'cyl:a'), wire('v:p2', 'cyl:b')],
    } as never);
    if (push) engine.setManual('v', 'left', true);
    const snapshot = engine.step(1);
    return { snapshot, analysis: analyzeSpool(v, snapshot, kind) };
  };

  it('2/2 normally open: open at rest (1→2), port 1 sealed by a land when actuated', () => {
    const rest = run('valve-2-2-no', 'spool22', false);
    expect(rest.analysis.state).toBe('Rest position — 1→2 open');
    expect(rest.analysis.covered).toEqual([]);
    expect(rest.snapshot.portPressure['v:p2']).toBeGreaterThan(0.5);
    const closed = run('valve-2-2-no', 'spool22', true);
    expect(closed.analysis.state).toBe('Actuated — port 1 closed');
    expect(closed.analysis.covered).toEqual(['1']);
    expect(closed.snapshot.portPressure['v:p2']).toBeLessThan(0.5);
  });

  it('4/2: rest 1→2, 4→3; actuated 1→4, 2→3; both exhaust chambers read port 3', () => {
    const rest = run('valve-4-2', 'spool42', false);
    expect(rest.analysis.state).toBe('Rest position — 1→2, 4→3');
    const actuated = run('valve-4-2', 'spool42', true);
    expect(actuated.analysis.state).toBe('Actuated — 1→4, 2→3');
    expect(actuated.analysis.readings.map(r => r.label).sort()).toEqual(['1', '2', '3', '4']);
    expect(actuated.analysis.description).not.toContain('Port 5');
    expect(actuated.snapshot.portPressure['v:p4']).toBeGreaterThan(0.5);
  });

  it('renders with the 4/2 exhaust stubs both numbered 3', () => {
    const c = render(<SpoolValveCutaway analysis={run('valve-4-2', 'spool42', false).analysis} medium="PNEUMATIC" theme={THEME} />).container;
    const labels = Array.from(c.querySelectorAll('svg > g text')).map(t => t.textContent);
    expect(labels.filter(label => label === '3')).toHaveLength(2);
    expect(labels).not.toContain('5');
  });
});

describe('panel text', () => {
  const dir = join(__dirname);
  const sources = [...readdirSync(dir), ...readdirSync(join(dir, '../analysis')).map(f => `../analysis/${f}`)].filter(f => /\.tsx$/.test(f) && !/\.test\./.test(f));
  it('uses no monospace font class and no emoji', () => {
    for (const file of sources) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/font-mono|monospace|ui-monospace/);
      expect(text, file).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
