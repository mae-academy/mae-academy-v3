// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { CAGE_TRAVEL, CheckValveCutaway } from './CheckValveCutaway';
import { FlowControlCutaway } from './FlowControlCutaways';
import { EXHAUST_GRAY, FLOW_BLUE, cutawayTheme } from './cutawayParts';
import { analyzeCheck, analyzeFlowControl, type CutawayComponent } from './cutawayPhysics';

afterEach(cleanup);
const THEME = cutawayTheme(false);
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };

describe('plain check valve flow states', () => {
  const run = (forward: boolean) => {
    const chk = part('chk', 'check-valve');
    const engine = new FluidEngine({
      components: [part('src', 'pressure-source'), chk, part('load', 'cylinder-single'), part('g', 'pressure-gauge')],
      wires: forward ? [wire('src:out', 'chk:p1'), wire('chk:p2', 'load:a')] : [wire('src:out', 'chk:p2'), wire('chk:p1', 'g:p')],
    } as never);
    // forward: the cylinder is still filling, so air is flowing; reverse: the gauge side is dead-ended
    return render(<CheckValveCutaway analysis={analyzeCheck(chk, engine.step(forward ? 0.1 : 0.5), 'check')} medium="PNEUMATIC" theme={THEME} />).container;
  };

  it('forward flow lifts the ball a few pixels into the cage and washes it with animated blue streams', () => {
    const c = run(true);
    const ball = c.querySelector('.check-ball')!;
    expect(ball.getAttribute('data-state')).toBe('open');
    expect(CAGE_TRAVEL).toBeGreaterThanOrEqual(12);
    expect(CAGE_TRAVEL).toBeLessThanOrEqual(15);
    expect(Number(ball.getAttribute('data-lift'))).toBe(CAGE_TRAVEL);
    // the displaced ball rests on the stop pad with clear windows (> 12 px) above and below it
    const pad = c.querySelector('.cage-pad')!;
    const windowTop = Number(c.querySelector('.cage-stop')!.getAttribute('y')) + Number(c.querySelector('.cage-stop')!.getAttribute('height'));
    expect(Number(pad.getAttribute('y')) - windowTop).toBeGreaterThan(12);
    const streams = Array.from(c.querySelectorAll('.cutaway-stream'));
    expect(streams).toHaveLength(2); // one each side of the ball
    for (const stream of streams) expect(stream.getAttribute('stroke')).toBe(FLOW_BLUE);
    expect(c.querySelector('style')!.textContent).toContain('stroke-dashoffset'); // the dashes travel
  });

  it('reverse flow seats the ball at once, draws no streams and greys the sealed inlet side', () => {
    const c = run(false);
    const ball = c.querySelector('.check-ball')!;
    expect(ball.getAttribute('data-state')).toBe('seated');
    expect(Number(ball.getAttribute('data-lift'))).toBe(0);
    expect((ball as HTMLElement).style.transition).toContain('30ms');
    expect(c.querySelectorAll('.cutaway-stream')).toHaveLength(0);
    expect(c.querySelector('clipPath + rect, g[clip-path] rect')!.getAttribute('fill')).toBe(EXHAUST_GRAY);
  });
});

describe('one-way flow control flow states', () => {
  const run = (phase: 'extend' | 'retract') => {
    const fc = part('fc', 'flow-control-oneway', { openingPercentage: 20 });
    const engine = new FluidEngine({
      components: [part('src', 'pressure-source'), part('v', 'valve-5-2', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), fc, part('cyl', 'cylinder-double')],
      wires: [wire('src:out', 'v:p1'), wire('v:p4', 'fc:in'), wire('fc:out', 'cyl:a'), wire('v:p2', 'cyl:b')],
    } as never);
    engine.setManual('v', 'left', true);
    let snapshot = engine.step(0.3);
    if (phase === 'retract') { engine.step(40); engine.setManual('v', 'left', false); snapshot = engine.step(0.2); }
    return render(<FlowControlCutaway analysis={analyzeFlowControl(fc, snapshot, 'oneway')} medium="PNEUMATIC" theme={THEME} />).container;
  };

  it('controlled flow 1→2: poppet shut, bypass dry, one narrow blue jet through the needle gap', () => {
    const c = run('extend');
    expect(c.querySelector('.check-poppet')!.getAttribute('data-state')).toBe('seated');
    expect(c.querySelector('.bypass-flood')).toBeNull();
    const streams = Array.from(c.querySelectorAll('.cutaway-stream'));
    expect(streams).toHaveLength(1);
    expect(streams[0].getAttribute('stroke')).toBe(FLOW_BLUE);
    expect(Number(streams[0].getAttribute('stroke-width'))).toBeLessThan(7);
  });

  it('free return 2→1: poppet lifted off its seat, bypass chamber flooded blue, wide streams run back to port 1', () => {
    const c = run('retract');
    expect(c.querySelector('.check-poppet')!.getAttribute('data-state')).toBe('open');
    expect(Number(c.querySelector('.check-poppet')!.getAttribute('data-lift'))).toBeGreaterThan(0);
    expect(c.querySelector('.bypass-flood')!.getAttribute('fill')).toBe(FLOW_BLUE);
    const streams = Array.from(c.querySelectorAll('.cutaway-stream[stroke="#2563EB"]'));
    expect(streams.length).toBe(2);
    for (const stream of streams) {
      expect(stream.getAttribute('stroke')).toBe(FLOW_BLUE);
      expect(Number(stream.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(7);
    }
  });
});
