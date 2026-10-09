// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { ACTUATION_OPTIONS, LATCHING_OPERATORS, defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { ActiveElementProperties } from '../ActiveElementProperties';
import { FluidSymbol } from '../symbols/FluidSymbols';
import { ARMATURE, COPPER, EndActuator, OUTSIDE_ACTUATORS } from './ActuatorCutaways';
import { BALL_RADIUS, CAGE_TRAVEL, CheckValveCutaway, SEATED_X, SPRING_TRAVEL, THROAT_HALF, THROAT_X } from './CheckValveCutaway';
import { FlowControlCutaway } from './FlowControlCutaways';
import { SpringCheckValveCutaway } from './SpringCheckValveCutaway';
import { analyzeCheck, analyzeFlowControl, cutawayKindOf, type CutawayComponent } from './cutawayPhysics';
import { cutawayTheme, roundedPath } from './cutawayParts';

afterEach(cleanup);
const THEME = cutawayTheme(false);
const COLORS = { background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ddd', text: '#111', muted: '#666', subtle: '#999', primary: '#00f', accent: '#70f', danger: '#f00', selection: '#70f', grid: '#eee', wire: '#000', powered: '#00f', input: '#fff', shadow: '' } as unknown as Palette;
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe('actuator dropdown', () => {
  it('lists the nine standard operators in the requested order with the solenoid fourth', () => {
    expect(ACTUATION_OPTIONS.slice(0, 9)).toEqual(['Pneumatic Pilot', 'Pushbutton', 'Spring Return', 'Solenoid', 'Hand Lever', 'Detent Lever', 'Foot Pedal', 'Roller', 'Plunger']);
    expect(ACTUATION_OPTIONS.indexOf('Solenoid')).toBe(3);
    expect(ACTUATION_OPTIONS).not.toContain('Spring Centred');
    expect(ACTUATION_OPTIONS[0]).not.toBe('None');
    expect(LATCHING_OPERATORS).toContain('Solenoid');
  });

  it('the selects in the properties panel show the labelled options in that order', () => {
    const definition = getFluidDefinition('valve-5-2')!;
    const component = { id: 'v', type: 'valve-5-2', label: '1V1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: defaultFluidProps(definition) };
    render(<ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} onLabelChange={() => undefined} onPropsChange={() => undefined} onRotate={() => undefined} onDuplicate={() => undefined} onDelete={() => undefined} />);
    for (const label of ['Left Actuation', 'Right Actuation']) {
      const options = Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(option => option.textContent);
      expect(options.slice(0, 9)).toEqual([
        'Pneumatic Pilot (Signal 12/14)', 'Pushbutton (Manual)', 'Spring Return (Mechanical)', 'Electrical Solenoid (Single)', 'Hand Lever',
        'Detented Lever (Mechanical Latch)', 'Foot Pedal', 'Roller Lever (Limit Switch)', 'Mechanical Plunger',
      ]);
    }
    expect((screen.getByLabelText('Left Actuation') as HTMLSelectElement).value).toBe('Pushbutton');
    expect((screen.getByLabelText('Right Actuation') as HTMLSelectElement).value).toBe('Spring Return');
    fireEvent.change(screen.getByLabelText('Left Actuation'), { target: { value: 'Solenoid' } });
  });
});

describe('ISO 1219-1 operator glyphs', () => {
  const cap = (kind: string, pressed = false) => {
    const definition = getFluidDefinition('valve-3-2-nc')!;
    return render(<svg><FluidSymbol definition={definition} stroke="#000" props={{ ...defaultFluidProps(definition), actuationLeft: kind, actuationRight: 'None' }} operatorPressed={{ left: pressed }} /></svg>).container.querySelector('.valve-end-cap[data-side="left"]')!;
  };
  it('solenoid: a 20 × 24 box on the push pin holding an open triangle whose apex points at the valve body', () => {
    const c = cap('Solenoid');
    expect(c.querySelector('path')!.getAttribute('d')).toContain('M 10 -12 H 30 V 12 H 10 Z');
    const triangle = c.querySelector('.solenoid-triangle')!;
    expect(triangle.getAttribute('fill')).toBe('none');
    const [apex, base1, base2] = triangle.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
    expect(apex[0]).toBeLessThan(base1[0]);
    expect(base1[0]).toBe(base2[0]);
  });
  it('hand lever: stem, 45° arm of 20 px and a solid knob of radius 3', () => {
    const c = cap('Hand Lever');
    const d = c.querySelector('path')!.getAttribute('d')!;
    expect(d).toBe('M 0 0 H 12.9 L 27 -14.1');
    expect(Math.hypot(27 - 12.9, 14.1)).toBeCloseTo(19.94, 1); // ≈ 20 px at 45°
    const knob = c.querySelector('circle')!;
    expect(num(knob, 'r')).toBe(3);
    expect(knob.getAttribute('fill')).toBe('#000');
    expect(num(knob, 'cx') + num(knob, 'r')).toBeLessThanOrEqual(30);
  });
  it('detented lever: a horizontal stem ends in a V tooth resting on a notched seat, and latching drops the lever into the notch', () => {
    const c = cap('Detent Lever');
    const seat = c.querySelector('.detent-seat')!.getAttribute('d')!;
    expect(seat).toBe('M 6 8 H 13 L 17 13 L 21 8 H 28'); // V-shaped pocket, bottom at y = 13
    expect(c.querySelector('.detent-tooth')!.getAttribute('d')).toBe('M 17 0 V 3 M 13 3 H 21 L 17 9 Z'); // tooth tip rests on the rim (y = 9)
    expect(c.querySelector('.detent-lever')!.getAttribute('data-latched')).toBe('false');
    expect(c.querySelector('.detent-arm')!.getAttribute('style')).toContain('translateY(0px)');
    expect(c.querySelector('circle')!.getAttribute('r')).toBe('3');
  });
  it('spring return: symmetrical zig-zag inside 30 px', () => {
    const d = cap('Spring Return').querySelector('path')!.getAttribute('d')!;
    const pts = Array.from(d.matchAll(/L ([\d.]+) (-?[\d.]+)/g)).map(m => [Number(m[1]), Number(m[2])]);
    const peaks = pts.filter(p => Math.abs(p[1]) === 8);
    expect(peaks).toHaveLength(5);
    // mirror symmetry about the centre line x = 15
    for (const [x, y] of peaks) expect(peaks.some(([mx, my]) => Math.abs(mx - (30 - x)) < 1e-9 && my === y)).toBe(true);
    expect(Math.max(...pts.map(p => p[0]))).toBeLessThanOrEqual(30);
  });
  it('pneumatic pilot: an equilateral triangle pointing into the casing', () => {
    const tri = cap('Pneumatic Pilot').querySelector('polygon')!.getAttribute('points')!.split(' ').map(p => p.split(',').map(Number));
    const side = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(side(tri[0], tri[1])).toBeCloseTo(12);
    expect(side(tri[1], tri[2])).toBeCloseTo(12);
    expect(side(tri[0], tri[2])).toBeCloseTo(12);
    expect(tri[0]).toEqual([0, 0]); // tip on the casing face
  });
  it('foot pedal plate is inclined 20°, roller is a disc tangent to its arm', () => {
    const pedal = cap('Foot Pedal').querySelector('path')!.getAttribute('d')!;
    expect(pedal).toBe('M 0 0 H 8 L 12 -9 L 30 -2.5');
    expect(Math.atan2(-2.5 + 9, 30 - 12) * (180 / Math.PI)).toBeCloseTo(20, 0);
    const roller = cap('Roller');
    const circle = roller.querySelector('circle')!;
    const arm = roller.querySelector('path')!.getAttribute('d')!;
    expect(arm).toBe('M 0 0 H 4 L 16 -5');
    expect(num(circle, 'cx') - num(circle, 'r')).toBe(16); // the arm ends exactly on the disc's edge
  });
  it('plunger: a rounded convex cap', () => {
    const d = cap('Plunger').querySelector('path')!.getAttribute('d')!;
    expect(d).toContain('L 30 0');
  });
});

describe('actuator cross-sections', () => {
  const draw = (kind: string, active: boolean, side: 'left' | 'right' = 'left') =>
    render(<svg><EndActuator kind={kind} side={side} edgeX={side === 'left' ? 20 : 760} tipX={side === 'left' ? 120 : 660} active={active} axisY={170} theme={THEME} idPrefix="t" /></svg>).container;

  it('draws a housing for every outside operator, flush on the cap, with a pin to the spool end', () => {
    for (const kind of OUTSIDE_ACTUATORS) {
      for (const side of ['left', 'right'] as const) {
        const c = draw(kind, false, side);
        const group = c.querySelector('.end-actuator')!;
        expect(group.getAttribute('data-actuator'), kind).toBe(kind);
        const pin = c.querySelector('.operator-pin')!;
        expect(num(pin, 'data-tip'), `${kind} ${side}`).toBe(-100); // spool end 100 px inside the cap face
        expect(num(pin, 'data-length'), `${kind} ${side}`).toBeGreaterThan(100);
        expect(group.getAttribute('transform'), `${kind} ${side}`).toContain(side === 'left' ? 'scale(-1,1)' : 'scale(1,1)');
        expect(c.querySelector('.cap-bushing'), kind).not.toBeNull();
        cleanup();
      }
    }
  });

  it('solenoid: copper windings (hashed #D97706), a #4B5563 armature and a manual override pin; energising slides the armature inward', () => {
    const idle = draw('Solenoid', false);
    expect(idle.querySelectorAll('.solenoid-winding')).toHaveLength(2);
    expect(idle.querySelector('pattern rect')!.getAttribute('fill')).toBe(COPPER);
    expect(COPPER).toBe('#D97706');
    expect(idle.querySelector('.solenoid-winding')!.getAttribute('fill')).toBe('url(#t-copper-left)');
    expect(idle.querySelector('.solenoid-armature rect')!.getAttribute('fill')).toBe(ARMATURE);
    expect(ARMATURE).toBe('#4B5563');
    expect(idle.querySelector('.manual-override')).not.toBeNull();
    const rest = (idle.querySelector('.solenoid-armature') as HTMLElement).style.transform;
    cleanup();
    const energised = draw('Solenoid', true);
    expect(energised.querySelector('[data-solenoid]')!.getAttribute('data-solenoid')).toBe('energised');
    expect((energised.querySelector('.solenoid-armature') as HTMLElement).style.transform).not.toBe(rest);
    expect((energised.querySelector('.solenoid-armature') as HTMLElement).style.transform).toContain('-16px');
  });

  it('pushbutton cap sinks when pressed; levers rock; pedal flattens; roller travels', () => {
    const t = (kind: string, active: boolean, selector: string) => (draw(kind, active).querySelector(selector) as HTMLElement).style.transform;
    expect(t('Pushbutton', false, '.actuator-moving')).not.toBe(t('Pushbutton', true, '.actuator-moving'));
    expect(t('Hand Lever', false, '.lever-arm')).not.toBe(t('Hand Lever', true, '.lever-arm'));
    expect(t('Foot Pedal', true, '.pedal-plate')).toContain('rotate(4deg)');
    expect(t('Foot Pedal', false, '.pedal-plate')).toContain('rotate(20deg)');
    expect(t('Roller', false, '.actuator-moving')).not.toBe(t('Roller', true, '.actuator-moving'));
  });

  it('detented latch adds the spring-loaded ball detent; a plain hand lever does not', () => {
    expect(draw('Detent Lever', false).querySelector('.detent-ball circle')).not.toBeNull();
    expect(draw('Detent Lever', false).querySelector('.detent-plate')).not.toBeNull();
    cleanup();
    expect(draw('Hand Lever', false).querySelector('.detent-ball')).toBeNull();
  });

  it('foot pedal and roller ride in a guided sleeve bearing', () => {
    expect(draw('Foot Pedal', false).querySelector('.sleeve-bearing')).not.toBeNull();
    cleanup();
    expect(draw('Roller', false).querySelector('.sleeve-bearing')).not.toBeNull();
  });
});

describe('check valve cutaways', () => {
  /** Source → pushbutton 3/2 → check valve → cylinder; `hold` releases the button after a full stroke. */
  function run(type: string, bar: number, phase: 'open' | 'back') {
    const k = part('k', type, { crackingPressure: 0.5 });
    const engine = new FluidEngine({
      components: [part('s', 'pressure-source', { pressure: bar }), part('v', 'valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), k, part('c', 'cylinder-double')],
      wires: [wire('s:out', 'v:p1'), wire('v:p2', 'k:p1'), wire('k:p2', 'c:a')],
    } as never);
    engine.setManual('v', 'left', true);
    let snapshot = engine.step(0.3);
    if (phase === 'back') {
      engine.step(30);
      engine.setManual('v', 'left', false);
      snapshot = engine.step(0.3);
    }
    return { k, snapshot };
  }

  it('registered as dedicated cutaways', () => {
    expect(cutawayKindOf({ type: 'check-valve' })).toBe('check');
    expect(cutawayKindOf({ type: 'check-valve-spring' })).toBe('springCheck');
  });

  it('the ball is tangent to the 45° seat when seated', () => {
    // seat wall: x + y = THROAT_X + (175 − THROAT_HALF); distance of the ball centre from it equals the radius
    const distance = Math.abs(SEATED_X + 175 - (THROAT_X + 175 - THROAT_HALF)) / Math.SQRT2;
    expect(distance).toBeCloseTo(BALL_RADIUS);
    expect(BALL_RADIUS).toBeGreaterThan(THROAT_HALF); // the ball cannot pass the throat
  });

  it('forward flow lifts the ball into the cage; reverse flow drives it hermetically into the seat', () => {
    const open = run('check-valve', 6, 'open');
    const analysis = analyzeCheck(open.k, open.snapshot, 'check');
    expect(analysis.open).toBe(true);
    expect(analysis.state).toBe('Open / Free Flow');
    const c = render(<CheckValveCutaway analysis={analysis} medium="PNEUMATIC" theme={THEME} />).container;
    expect(c.querySelector('.check-ball')!.getAttribute('data-state')).toBe('open');
    expect(num(c.querySelector('.check-ball')!, 'data-lift')).toBe(CAGE_TRAVEL);
    expect(c.querySelectorAll('.cutaway-stream').length).toBeGreaterThanOrEqual(2); // flows around both sides of the ball
    cleanup();

    const back = run('check-valve', 6, 'back');
    const sealed = analyzeCheck(back.k, back.snapshot, 'check');
    expect(sealed.open).toBe(false);
    expect(sealed.backPressure).toBe(true);
    expect(sealed.state).toBe('Blocked / Reverse Flow');
    const s = render(<CheckValveCutaway analysis={sealed} medium="PNEUMATIC" theme={THEME} />).container;
    expect(s.querySelector('.check-ball')!.getAttribute('data-state')).toBe('seated');
    expect(num(s.querySelector('.check-ball')!, 'data-lift')).toBe(0);
    expect(s.querySelector('.check-ball circle')!.getAttribute('cx')).toBe(String(SEATED_X));
    expect(s.querySelector('.retention-cage')).not.toBeNull();
  });

  it('spring-loaded: stays seated below the cracking pressure and compresses the spring in its sleeve above it', () => {
    const below = run('check-valve-spring', 0.3, 'open');
    const closed = analyzeCheck(below.k, below.snapshot, 'springCheck');
    expect(closed.crack).toBeCloseTo(0.5);
    expect(closed.open).toBe(false);
    expect(closed.state).toBe('Closed — below the cracking pressure');
    const c = render(<SpringCheckValveCutaway analysis={closed} medium="PNEUMATIC" theme={THEME} />).container;
    expect(c.querySelector('.check-ball')!.getAttribute('data-state')).toBe('seated');
    expect(c.querySelector('[data-testid="crack-label"]')!.textContent).toBe('cracking pressure 0.5 bar');
    const scale = (root: HTMLElement) => Math.abs(Number(/scaleX\(([-\d.]+)\)/.exec((root.querySelector('.spring-guide g[style*="scaleX"]') as HTMLElement).style.transform)![1]));
    const seatedScale = scale(c);
    cleanup();

    const above = run('check-valve-spring', 6, 'open');
    const opened = analyzeCheck(above.k, above.snapshot, 'springCheck');
    expect(opened.open).toBe(true);
    expect(opened.state).toBe('Open — above the cracking pressure');
    const o = render(<SpringCheckValveCutaway analysis={opened} medium="PNEUMATIC" theme={THEME} />).container;
    expect(num(o.querySelector('.check-ball')!, 'data-lift')).toBe(SPRING_TRAVEL);
    expect(scale(o)).toBeLessThan(seatedScale);
    // the spring seats on the shoulder rib and is guided by a sleeve
    const rib = o.querySelector('.shoulder-rib')!;
    expect((o.querySelector('.spring-guide g[style*="scaleX"]') as HTMLElement).style.transform).toContain(`translate(${num(rib, 'x')}px`);
    expect(o.querySelectorAll('.guide-sleeve')).toHaveLength(2);
  });

  it('the spring shortens as the ball lifts', () => {
    const lengths = [0, 1].map(open => {
      const c = render(<SpringCheckValveCutaway analysis={{ ...analyzeCheck(run('check-valve-spring', 6, 'open').k, run('check-valve-spring', 6, 'open').snapshot, 'springCheck'), open: !!open }} medium="PNEUMATIC" theme={THEME} />).container;
      const value = Math.abs(Number(/scaleX\(([-\d.]+)\)/.exec((c.querySelector('.spring-guide g[style*="scaleX"]') as HTMLElement).style.transform)![1]));
      cleanup();
      return value;
    });
    expect(lengths[1]).toBeLessThan(lengths[0]);
  });
});

describe('one-way flow control bypass', () => {
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

  it('the spring seats flush against a shoulder rib, in both states', () => {
    for (const phase of ['extend', 'retract'] as const) {
      const c = run(phase);
      const rib = c.querySelector('.shoulder-rib')!;
      const ribFace = num(rib, 'x') + num(rib, 'width');
      const spring = c.querySelector('g[style*="scaleX"]') as HTMLElement;
      expect(spring.style.transform, phase).toContain(`translate(${ribFace}px`);
      cleanup();
    }
  });

  it('the sealing element is a polished ball seated in a 45° cone, lifting 16 px on free return and compressing the spring uniformly', () => {
    const seated = run('extend');
    expect(seated.querySelector('.check-ball')!.tagName.toLowerCase()).toBe('circle');
    expect(seated.querySelectorAll('.check-seat')).toHaveLength(2);
    const scale = (c: HTMLElement) => Number(/scaleX\(([-\d.]+)\)/.exec((c.querySelector('g[style*="scaleX"]') as HTMLElement).style.transform)![1]);
    const seatedScale = scale(seated);
    cleanup();
    const lifted = run('retract');
    expect(num(lifted.querySelector('.check-poppet')!, 'data-lift')).toBe(16);
    expect(scale(lifted)).toBeLessThan(seatedScale);
  });

  it('streamlines bend with curves instead of right-angle joints', () => {
    for (const phase of ['extend', 'retract'] as const) {
      const c = run(phase);
      const paths = Array.from(c.querySelectorAll('.cutaway-stream')).map(p => p.getAttribute('d')!);
      expect(paths.some(d => d.includes(' Q ')), phase).toBe(true);
      cleanup();
    }
    expect(roundedPath([[0, 0], [10, 0], [10, 10]], 4)).toBe('M 0 0 L 6 0 Q 10 0 10 4 L 10 10');
    expect(roundedPath([[0, 0], [10, 0]], 4)).toBe('M 0 0 L 10 0');
  });
});
