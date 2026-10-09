// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { DISC_TRAVEL, QuickExhaustCutaway } from './QuickExhaustCutaway';
import { FLOW_BLUE, cutawayTheme } from './cutawayParts';
import { analyzeCheck, analyzeCutaway, analyzeFlowControl, analyzeQuickExhaust, cutawayKindOf, type CutawayComponent } from './cutawayPhysics';
import { FlowControlCutaway, streamOpacity } from './FlowControlCutaways';
import { CheckValveCutaway } from './CheckValveCutaway';

afterEach(cleanup);
const THEME = cutawayTheme(false);
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };

describe('quick exhaust cutaway', () => {
  const qe = part('qe', 'quick-exhaust');
  const run = (supplied: boolean) => {
    const engine = new FluidEngine({
      components: [part('src', 'pressure-source'), part('v', 'valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), qe, part('cyl', 'cylinder-single')],
      wires: [wire('src:out', 'v:p1'), wire('v:p2', 'qe:p1'), wire('qe:p2', 'cyl:a')],
    } as never);
    engine.setManual('v', 'left', true);
    let snapshot = engine.step(1); 
    if (!supplied) {
      // The engine empties the working line within one tick; freeze the instant the supply drops, with the cylinder air still to dump.
      engine.setManual('v', 'left', false);
      snapshot = { ...engine.step(0.001), } as typeof snapshot;
      snapshot = { ...snapshot, portPressure: { ...snapshot.portPressure, 'qe:p2': 3 } };
    }
    return { snapshot, container: render(<QuickExhaustCutaway analysis={analyzeQuickExhaust(qe, snapshot)} medium="PNEUMATIC" theme={THEME} />).container };
  };

  it('is the cutaway of the quick-exhaust part', () => {
    expect(cutawayKindOf(qe)).toBe('quickExhaust');
  });

  it('pressurising 1→2: the disc sits on the exhaust seat and blue streams run into port 2', () => {
    const { container: c, snapshot } = run(true);
    expect(analyzeCutaway(qe, snapshot)!.kind).toBe('quickExhaust');
    expect(c.querySelector('svg')!.getAttribute('data-mode')).toBe('fill');
    expect(c.querySelector('.qe-disc')!.getAttribute('data-state')).toBe('on-exhaust');
    expect(Number(c.querySelector('.qe-disc')!.getAttribute('data-offset'))).toBe(0);
    expect(c.querySelectorAll('.cutaway-stream')).toHaveLength(0); // no overlapping stroke tubes
    const fills = Array.from(c.querySelectorAll('.flow-fill'));
    expect(fills.length).toBe(2); // inlet + chamber/port 2; the exhaust channel stays dry
    for (const rect of fills) { expect(rect.getAttribute('fill')).toBe(FLOW_BLUE); expect(rect.getAttribute('opacity')).toBe('0.85'); }
    expect(c.querySelectorAll('.flow-arrow').length).toBeGreaterThan(0);
  });

  it('rapid exhaust 2→3: with port 1 gone the disc is lifted onto the inlet seat and air dumps through port 3', () => {
    const { container: c } = run(false);
    expect(c.querySelector('svg')!.getAttribute('data-mode')).toBe('exhaust');
    expect(c.querySelector('.qe-disc')!.getAttribute('data-state')).toBe('on-inlet');
    expect(Number(c.querySelector('.qe-disc')!.getAttribute('data-offset'))).toBe(-DISC_TRAVEL);
    expect(c.querySelectorAll('.cutaway-stream')).toHaveLength(0);
    expect(c.querySelectorAll('.flow-fill')).toHaveLength(2); // chamber + port 2, and the exhaust channel; the sealed inlet stays dry
    expect(c.querySelectorAll('.flow-arrow').length).toBeGreaterThan(0);
  });
});

describe('check valve at equalised pressure', () => {
  it('keeps the ball in the cage (as the schematic symbol does) once the line has filled', () => {
    const chk = part('chk', 'check-valve');
    const engine = new FluidEngine({ components: [part('src', 'pressure-source'), chk, part('g', 'pressure-gauge')], wires: [wire('src:out', 'chk:p1'), wire('chk:p2', 'g:p')] } as never);
    const snapshot = engine.step(5);
    const analysis = analyzeCheck(chk, snapshot, 'check');
    expect(analysis.open).toBe(true);
    expect(analysis.state).toBe('Open / Free Flow');
    const c = render(<CheckValveCutaway analysis={analysis} medium="PNEUMATIC" theme={THEME} />).container;
    expect(c.querySelector('.check-ball')!.getAttribute('data-state')).toBe('open');
  });
});

describe('one-way flow control metered stream', () => {
  it('fades with the needle opening', () => {
    expect(streamOpacity(10)).toBeLessThan(streamOpacity(90));
    const fc = part('fc', 'flow-control-oneway', { openingPercentage: 20 });
    const engine = new FluidEngine({
      components: [part('src', 'pressure-source'), part('v', 'valve-5-2', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), fc, part('cyl', 'cylinder-double')],
      wires: [wire('src:out', 'v:p1'), wire('v:p4', 'fc:in'), wire('fc:out', 'cyl:a'), wire('v:p2', 'cyl:b')],
    } as never);
    engine.setManual('v', 'left', true);
    const c = render(<FlowControlCutaway analysis={analyzeFlowControl(fc, engine.step(0.3), 'oneway')} medium="PNEUMATIC" theme={THEME} />).container;
    expect(Number(c.querySelector('.metered-flow')!.getAttribute('data-opacity'))).toBeCloseTo(streamOpacity(20), 2);
  });
});
