// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { analyzeCutaway, cutawayKindOf, type CutawayComponent, type PressureValveAnalysis } from './cutawayPhysics';
import { cutawayTheme } from './cutawayParts';
import { PressureValveCutaway } from './PressureValveCutaway';

afterEach(cleanup);

const THEME = cutawayTheme(false);
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };

function regulatorRun(type: 'regulator-nr' | 'regulator-relieving', setpoint: number) {
  const valve = part('v', type, { setpoint });
  const engine = new FluidEngine({ components: [part('src', 'pressure-source'), valve, part('tank', 'air-reservoir')], wires: [wire('src:out', 'v:p1'), wire('v:p2', 'tank:left')] } as never);
  const snapshot = engine.step(2);
  return { valve, snapshot, analysis: analyzeCutaway(valve, snapshot) as PressureValveAnalysis };
}
const stage = (analysis: PressureValveAnalysis) => render(<PressureValveCutaway analysis={analysis} medium="PNEUMATIC" theme={THEME} />).container;
const base = (over: Partial<PressureValveAnalysis>): PressureValveAnalysis => ({ kind: 'regulator', relieving: false, setBar: 6, inBar: 8, outBar: 3, gap: 1, deflection: 0, venting: false, state: '', tone: 'open', description: '', readings: [], ...over });

describe('pressure valve cutaways', () => {
  it('maps the regulators and relief valves to their cutaways', () => {
    expect(['regulator-nr', 'regulator-relieving', 'pressure-relief', 'hyd-pressure-relief'].map(type => cutawayKindOf({ type }))).toEqual(['regulator', 'regulator', 'relief', 'relief']);
  });

  it('a regulator throttles the line to its dial setpoint and the cutaway follows', () => {
    const { analysis, snapshot, valve } = regulatorRun('regulator-nr', 4);
    expect(analysis.kind).toBe('regulator');
    expect(analysis.outBar).toBeCloseTo(4, 1);
    expect(analysis.inBar).toBeGreaterThan(analysis.outBar);
    expect(analyzeCutaway(valve, snapshot)!.kind).toBe('regulator');
    const c = stage(analysis);
    expect(c.querySelector('svg')!.getAttribute('data-testid')).toBe('cutaway-regulator');
    expect(c.querySelector('.diaphragm')).not.toBeNull();
    expect(c.querySelector('.control-spring')).not.toBeNull();
  });

  it('below the set point the poppet is open and the diaphragm down; at the set point it closes against the spring', () => {
    const open = stage(base({ outBar: 1, gap: 1, deflection: 0 }));
    const gapOpen = Number(open.querySelector('.regulator-poppet')!.getAttribute('data-gap'));
    const centreOpen = Number(open.querySelector('.diaphragm')!.getAttribute('data-centre'));
    expect(open.querySelectorAll('.cutaway-stream').length).toBeGreaterThan(0);
    cleanup();
    const closed = stage(base({ outBar: 6, inBar: 8, gap: 0, deflection: 1 }));
    expect(Number(closed.querySelector('.regulator-poppet')!.getAttribute('data-gap'))).toBe(0);
    expect(Number(closed.querySelector('.diaphragm')!.getAttribute('data-centre'))).toBeLessThan(centreOpen);
    expect(gapOpen).toBeGreaterThan(0);
    expect(closed.querySelectorAll('.cutaway-stream')).toHaveLength(0);
  });

  it('a relieving regulator lifts the diaphragm off the relief seat and vents through the bonnet', () => {
    const c = stage(base({ relieving: true, outBar: 6.4, inBar: 8, gap: 0, deflection: 1.4, venting: true }));
    expect(c.querySelector('svg')!.getAttribute('data-mode')).toBe('venting');
    expect(c.querySelector('.vent-flood')).not.toBeNull();
    expect(c.querySelectorAll('.cutaway-stream').length).toBeGreaterThan(0);
  });

  it('a relief valve stays closed below the set pressure and lifts the poppet above it', () => {
    const valve = part('r', 'pressure-relief', { crackingPressure: 3 });
    const run = (supplyBar: number) => {
      const engine = new FluidEngine({ components: [part('src', 'pressure-source', { pressure: supplyBar }), valve], wires: [wire('src:out', 'r:p1')] } as never);
      return analyzeCutaway(valve, engine.step(1)) as PressureValveAnalysis;
    };
    const closed = stage(run(2));
    expect(closed.querySelector('.relief-poppet')!.getAttribute('data-state')).toBe('seated');
    expect(closed.querySelectorAll('.cutaway-stream')).toHaveLength(0);
    cleanup();
    const opened = stage(run(8));
    expect(opened.querySelector('.relief-poppet')!.getAttribute('data-state')).toBe('open');
    expect(Number(opened.querySelector('.relief-poppet')!.getAttribute('data-lift'))).toBeGreaterThan(0);
    expect(opened.querySelectorAll('.cutaway-stream').length).toBeGreaterThan(0);
  });
});
