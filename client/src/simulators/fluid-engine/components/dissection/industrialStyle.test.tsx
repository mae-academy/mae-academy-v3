// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { EngineSnapshot } from '@shared/fluid/engine/types';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { analyzeCushion, analyzeSingle, analyzeSpool, landPositions, spoolBodyOf, spoolGeometry, spoolStart, type CutawayComponent, type SpoolKind } from './cutawayPhysics';
import { EXHAUST_GRAY, PRESSURE_BLUE, cutawayTheme, fluidTint } from './cutawayParts';
import { CylinderCushionCutaway } from './CylinderCushionCutaway';
import { SingleActingCutaway } from './SingleActingCutaway';
import { SpoolValveCutaway } from './SpoolValveCutaway';
import { CHAMBER, PISTON } from './cylinderGeometry';

afterEach(cleanup);

const LIGHT = cutawayTheme(false);
const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({ id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const wire = (a: string, b: string) => { const [fromComp, fromTerm] = a.split(':'); const [toComp, toTerm] = b.split(':'); return { id: a + b, fromComp, fromTerm, toComp, toTerm }; };
const SPRING = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
const PILOTS = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };

/** Source → valve (→ cylinder lines) run in the real engine; returns the valve's analysis. */
function valve(type: string, kind: SpoolKind, props: Record<string, unknown>, actuate: boolean) {
  const component = part('v', type, props);
  const three = kind === 'spool32';
  const engine = new FluidEngine({
    components: [part('src', 'pressure-source'), component, part('cyl', 'cylinder-double')],
    wires: three ? [wire('src:out', 'v:p1'), wire('v:p2', 'cyl:a')] : [wire('src:out', 'v:p1'), wire('v:p4', 'cyl:a'), wire('v:p2', 'cyl:b')],
  } as never);
  if (actuate) engine.setManual('v', 'left', true);
  const snapshot = engine.step(1);
  return { component, snapshot, analysis: analyzeSpool(component, snapshot, kind) };
}
const draw = (type: string, kind: SpoolKind, props: Record<string, unknown>, actuate = false) => {
  const { analysis } = valve(type, kind, props, actuate);
  return render(<SpoolValveCutaway analysis={analysis} medium="PNEUMATIC" theme={LIGHT} idPrefix={kind} />).container;
};
const groups = (kind: SpoolKind, type: string, offset: number) => {
  const body = spoolBodyOf(kind, type);
  const { covered, intervals } = spoolGeometry(landPositions(spoolStart(kind, offset, type), body), body);
  return { covered, groups: intervals.map(i => i.ports.join('')).filter(Boolean) };
};

describe('3/2 spool geometry follows the engine tables', () => {
  it('normally closed (ISO layout 1 · 2 · 3): rest joins 2 and 3 under a land on 1; actuated joins 1 and 2 under a land on 3', () => {
    expect(spoolBodyOf('spool32', 'valve-3-2-nc').ports).toEqual(['1', '2', '3']);
    expect(groups('spool32', 'valve-3-2-nc', 0)).toEqual({ covered: ['1'], groups: ['23'] });
    expect(groups('spool32', 'valve-3-2-nc', 1)).toEqual({ covered: ['3'], groups: ['12'] });
  });
  it('normally open uses the same port layout, mirrored in function', () => {
    expect(spoolBodyOf('spool32', 'valve-3-2-no').ports).toEqual(['1', '2', '3']);
    expect(groups('spool32', 'valve-3-2-no', 0)).toEqual({ covered: ['3'], groups: ['12'] });
    expect(groups('spool32', 'valve-3-2-no', 1)).toEqual({ covered: ['1'], groups: ['23'] });
  });
  it('the spool moves to the right on actuation (against the right-hand spring)', () => {
    expect(spoolStart('spool32', 1, 'valve-3-2-nc') - spoolStart('spool32', 0, 'valve-3-2-nc')).toBe(180);
    expect(spoolStart('spool32', 1, 'valve-3-2-no') - spoolStart('spool32', 0, 'valve-3-2-no')).toBe(60);
  });
  it('the drawn flow agrees with the engine in every state', () => {
    for (const [type, actuate, flow, blocked] of [['valve-3-2-nc', false, '23', '1'], ['valve-3-2-nc', true, '12', '3'], ['valve-3-2-no', false, '12', '3'], ['valve-3-2-no', true, '23', '1']] as const) {
      const { analysis, snapshot } = valve(type, 'spool32', SPRING, actuate);
      const joined = analysis.intervals.find(i => i.ports.length === 2)!.ports.slice().sort().join('');
      expect(joined, `${type} ${actuate}`).toBe(flow);
      expect(analysis.covered, `${type} ${actuate}`).toEqual([blocked]);
      // port 2 carries supply pressure exactly when the engine connects 1 → 2
      expect(snapshot.portPressure['v:p2'] > 0.5, `${type} ${actuate}`).toBe(flow === '12');
    }
  });
  it('labels the state with the flow path', () => {
    expect(valve('valve-3-2-nc', 'spool32', SPRING, false).analysis.state).toBe('Rest position — 2→3');
    expect(valve('valve-3-2-nc', 'spool32', SPRING, true).analysis.state).toBe('Actuated — 1→2');
    expect(valve('valve-3-2-no', 'spool32', SPRING, false).analysis.state).toBe('Rest position — 1→2');
    expect(valve('valve-3-2-no', 'spool32', SPRING, true).analysis.state).toBe('Actuated — 2→3');
  });
});

describe('industrial palette', () => {
  it('uses machined metal bodies, ground steel moving parts and black springs', () => {
    expect(LIGHT.casing).toBe('#374151');
    expect(LIGHT.hatch).toBe('#4B5563');
    expect(LIGHT.casingEdge).toBe('#1F2937');
    expect(LIGHT.ground).toBe('#6B7280');
    expect(LIGHT.steel).toBe('#9CA3AF');
    expect(LIGHT.spring).toBe('#000000');
  });
  it('pressure is a solid industrial blue, exhaust a light grey, an empty cavity nothing', () => {
    const live = fluidTint(6, 'PNEUMATIC');
    expect([live.fill, live.opacity]).toEqual([PRESSURE_BLUE, 1]);
    expect(fluidTint(0.5, 'PNEUMATIC').opacity).toBeGreaterThanOrEqual(0.6);
    expect(PRESSURE_BLUE).toBe('#3B82F6');
    expect(fluidTint(0, 'PNEUMATIC', true)).toEqual({ fill: EXHAUST_GRAY, opacity: 1 });
    expect(EXHAUST_GRAY).toBe('#F3F4F6');
    expect(fluidTint(0, 'PNEUMATIC').opacity).toBe(0);
    expect(fluidTint(50, 'HYDRAULIC').fill).not.toBe(PRESSURE_BLUE); // hydraulic keeps its own red scale
  });
});

describe('sectional spool valve', () => {
  const bodyOf = (c: HTMLElement) => c.querySelector('.valve-body')!;
  const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

  it('5/2 and 5/3: ports 4 and 2 on top, 5, 1 and 3 on the bottom, as rectangular stubs outside the body', () => {
    for (const [type, kind] of [['valve-5-2', 'spool52'], ['valve-5-3', 'spool53']] as const) {
      const c = draw(type, kind, PILOTS);
      const body = bodyOf(c);
      const bodyTop = num(body, 'y');
      const bodyBottom = bodyTop + num(body, 'height');
      const stubs = Object.fromEntries(Array.from(c.querySelectorAll('.port-stub')).filter(s => s.getAttribute('data-port') !== 'pilot').map(s => [s.getAttribute('data-port'), s]));
      expect(Object.keys(stubs).sort()).toEqual(['1', '2', '3', '4', '5']);
      for (const port of ['4', '2']) expect(num(stubs[port], 'y') + num(stubs[port], 'height'), `${kind} ${port}`).toBe(bodyTop);
      for (const port of ['5', '1', '3']) expect(num(stubs[port], 'y'), `${kind} ${port}`).toBe(bodyBottom);
      // left to right: 5, 4, 1, 2, 3
      const order = Object.keys(stubs).sort((a, b) => num(stubs[a], 'x') - num(stubs[b], 'x'));
      expect(order).toEqual(['5', '4', '1', '2', '3']);
      cleanup();
    }
  });

  it('3/2: port 2 on top, ports 1 and 3 on the bottom', () => {
    for (const type of ['valve-3-2-nc', 'valve-3-2-no']) {
      const c = draw(type, 'spool32', SPRING);
      const xs = ['1', '2', '3'].map(port => num(c.querySelector(`.port-stub[data-port="${port}"]`)!, 'x'));
      expect(xs[0]).toBeLessThan(xs[1]);
      expect(xs[1]).toBeLessThan(xs[2]);
      const body = bodyOf(c);
      const stub = (port: string) => c.querySelector(`.port-stub[data-port="${port}"]`)!;
      expect(num(stub('2'), 'y') + num(stub('2'), 'height')).toBe(num(body, 'y'));
      for (const port of ['1', '3']) expect(num(stub(port), 'y')).toBe(num(body, 'y') + num(body, 'height'));
      expect(c.querySelectorAll('.port-stub')).toHaveLength(3);
      cleanup();
    }
  });

  it('one integrated spool: a single shaft carries every land, and each land fills the bore with zero clearance', () => {
    for (const [type, kind, lands] of [['valve-3-2-nc', 'spool32', 2], ['valve-5-2', 'spool52', 3], ['valve-5-3', 'spool53', 3]] as const) {
      const c = draw(type, kind, SPRING);
      expect(c.querySelectorAll('.spool-shaft'), kind).toHaveLength(1);
      const landRects = Array.from(c.querySelectorAll('.spool-land'));
      expect(landRects, kind).toHaveLength(lands);
      const bore = c.querySelector('clipPath rect')!;
      for (const land of landRects) {
        expect(num(land, 'y'), kind).toBe(num(bore, 'y'));
        expect(num(land, 'height'), kind).toBe(num(bore, 'height'));
      }
      expect(c.querySelectorAll('.land-seal'), kind).toHaveLength(2 * lands);
      cleanup();
    }
  });

  it('the whole spool is one group that slides with the engine offset', () => {
    const rest = draw('valve-5-2', 'spool52', SPRING).querySelector('.cutaway-spool')!;
    expect(rest.getAttribute('style')).toContain('translate(165px');
    cleanup();
    const actuated = draw('valve-5-2', 'spool52', SPRING, true).querySelector('.cutaway-spool')!;
    expect(actuated.getAttribute('style')).toContain('translate(255px');
    expect(actuated.querySelectorAll('.spool-land')).toHaveLength(3);
  });

  it('springs are flat black coils flush on the cap shoulder, inside the bore, pressing on a seat plate on the spool end', () => {
    const c = draw('valve-5-3', 'spool53', PILOTS);
    const springs = Array.from(c.querySelectorAll('g[style*="scaleX"]'));
    expect(springs).toHaveLength(2);
    for (const spring of springs) {
      const path = spring.querySelector('path')!;
      expect(path.getAttribute('stroke')).toBe('#000000');
      expect(path.getAttribute('fill')).toBe('none');
      const ys = (path.getAttribute('d')!.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g) ?? []).map(pt => Number(pt.split(',')[1]));
      expect(Math.max(...ys.map(Math.abs))).toBeLessThan(30); // within the 60 px bore
    }
    const transforms = springs.map(spring => (spring as HTMLElement).style.transform);
    expect(transforms.some(t => t.includes('translate(40px'))).toBe(true); // left wall
    expect(transforms.some(t => t.includes('translate(740px'))).toBe(true); // right wall

    const plain = draw('valve-5-2', 'spool52', SPRING);
    expect(plain.querySelectorAll('.spring-seat')).toHaveLength(1);
  });

  it('a mechanical operator is one pin from the actuator to the spool end, and keeps touching it', () => {
    for (const actuate of [false, true]) {
      const c = draw('valve-5-2', 'spool52', SPRING, actuate);
      const pin = c.querySelector('.end-actuator[data-side="left"] .operator-pin') as HTMLElement;
      const stemEnd = spoolStart('spool52', actuate ? 1 : 0) - 28 - 30;
      // the pin ends at the spool end (outward coordinates from the cap face, which is x = 20)
      expect(Number(pin.dataset.tip), `actuated ${actuate}`).toBeCloseTo(20 - stemEnd);
      expect(Number(pin.dataset.length), `actuated ${actuate}`).toBeCloseTo(Number(pin.dataset.from) - Number(pin.dataset.tip));
      cleanup();
    }
  });

  it('pilot-operated ends get a full-bore piston head and a pilot channel; no springs hang free', () => {
    const c = draw('valve-5-2', 'spool52', PILOTS);
    const heads = Array.from(c.querySelectorAll('.pilot-head'));
    expect(heads).toHaveLength(2);
    for (const head of heads) expect(Number(head.getAttribute('height'))).toBe(60);
    expect(c.querySelectorAll('[data-pilot-channel]')).toHaveLength(2);
    expect(c.querySelectorAll('g[style*="scaleX"]')).toHaveLength(0);
  });
});

describe('cylinder sections', () => {
  const snapshot = (stroke: number, bar: number, velocity = 0): EngineSnapshot => ({
    cylinders: { c: { stroke, velocity, force: 0, chamberPressureA: bar, chamberPressureB: 0 } },
    portPressure: { 'c:a': bar, 'c:b': 0 }, nets: [], valves: {}, logic: {}, sensors: {}, motors: {}, reliefValves: {}, diagnostics: [],
  } as unknown as EngineSnapshot);
  const single = (stroke: number, bar = 6) => render(<SingleActingCutaway analysis={analyzeSingle(part('c', 'cylinder-single'), snapshot(stroke, bar))} medium="PNEUMATIC" theme={LIGHT} />).container;
  const double = (type: string, stroke: number) => render(<CylinderCushionCutaway analysis={analyzeCushion(part('c', type, { cushioning: 'Fixed - both' }), snapshot(stroke, 6))} medium="PNEUMATIC" theme={LIGHT} />).container;
  const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

  it('piston head spans the full internal diameter with two elastomer seal rings, at every stroke', () => {
    for (const stroke of [0, 0.5, 1]) {
      for (const make of [() => single(stroke), () => double('cylinder-double', stroke), () => double('cylinder-double-rod', stroke)]) {
        const c = make();
        const head = c.querySelector('.piston-head')!;
        expect([num(head, 'y'), num(head, 'height')]).toEqual([CHAMBER.y0, CHAMBER.y1 - CHAMBER.y0]);
        expect(num(head, 'height')).toBe(PISTON.y1 - PISTON.y0);
        const seals = Array.from(c.querySelectorAll('.piston-seal'));
        expect(seals).toHaveLength(2);
        for (const seal of seals) expect(seal.getAttribute('fill')).toBe(LIGHT.seal);
        cleanup();
      }
    }
  });

  it('front cap carries a rod guide bearing on both sides of the rod, so the rod runs through a snug bore', () => {
    for (const make of [() => single(0.5), () => double('cylinder-double', 0.5)]) {
      const c = make();
      const bearing = c.querySelector('.rod-bearing[data-direction="1"]')!;
      const sleeves = Array.from(bearing.querySelectorAll('rect')).filter(r => !r.classList.contains('rod-wiper'));
      expect(sleeves).toHaveLength(2);
      const rod = c.querySelector('.piston-rod-assembly, #piston-rod-assembly')!;
      const rodRect = Array.from(rod.querySelectorAll('rect')).find(r => num(r, 'width') >= 700)!;
      const rodTop = num(rodRect, 'y');
      const rodBottom = rodTop + num(rodRect, 'height');
      const [upper, lower] = sleeves.sort((a, b) => num(a, 'y') - num(b, 'y'));
      expect(num(upper, 'y') + num(upper, 'height')).toBeLessThanOrEqual(rodTop);
      expect(num(upper, 'y') + num(upper, 'height')).toBeGreaterThanOrEqual(rodTop - 1);
      expect(num(lower, 'y')).toBeGreaterThanOrEqual(rodBottom);
      expect(num(lower, 'y')).toBeLessThanOrEqual(rodBottom + 1);
      cleanup();
    }
  });

  it('a through-rod cylinder is guided at both caps', () => {
    const c = double('cylinder-double-rod', 0.5);
    expect(c.querySelectorAll('.rod-bearing')).toHaveLength(2);
    expect(double('cylinder-double', 0.5).querySelectorAll('.rod-bearing')).toHaveLength(1);
  });

  it('rear and front end caps are solid machined blocks distinct from the barrel', () => {
    const c = single(0.5);
    const caps = Array.from(c.querySelectorAll('.end-cap'));
    expect(caps.map(cap => cap.getAttribute('data-end'))).toEqual(['rear', 'front']);
    for (const cap of caps) expect(cap.getAttribute('fill')).toBe(LIGHT.hatch);
  });

  it('single-acting: the return spring is flat black, flush on the front cap and kept inside the barrel', () => {
    for (const stroke of [0, 0.5, 1]) {
      const c = single(stroke);
      const spring = c.querySelector('.return-spring g[style*="scaleX"]') as HTMLElement;
      expect(spring.style.transform).toContain(`translate(${CHAMBER.x1}px`);
      const path = spring.querySelector('path')!;
      expect(path.getAttribute('stroke')).toBe('#000000');
      const ys = (path.getAttribute('d')!.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g) ?? []).map(pt => Math.abs(Number(pt.split(',')[1])));
      expect(Math.max(...ys)).toBeLessThan((CHAMBER.y1 - CHAMBER.y0) / 2);
      expect(num(c.querySelector('.return-spring')!, 'data-spring-length')).toBeGreaterThanOrEqual(40);
      cleanup();
    }
  });

  it('single-acting: everything behind the piston fills solid blue and grows with the stroke', () => {
    const widths = [0.2, 0.6, 1].map(stroke => {
      const c = single(stroke);
      const blue = Array.from(c.querySelectorAll('.cutaway-piston-fluid rect')).find(r => r.getAttribute('fill') === PRESSURE_BLUE)!;
      expect(Number(blue.getAttribute('opacity'))).toBe(1);
      const piston = Number(c.querySelector('.cutaway-piston')!.getAttribute('data-piston-x'));
      cleanup();
      return piston;
    });
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
  });
});
