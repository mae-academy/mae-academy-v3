// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { pointInComponentBox } from '@/components/common/schematic/schematicGeometry';
import {
  ACTUATION_OPTIONS,
  FLUID_CATALOG,
  VALVE_SPECS,
  defaultFluidProps,
  getFluidDefinition,
  valveEdges,
  type FluidCatalogEntry,
} from '../../models/fluidCatalog';
import {
  ARROW_HALF_WIDTH,
  ARROW_LENGTH,
  CHECK_VALVE_HEIGHT,
  CHECK_VALVE_WIDTH,
  CYLINDER,
  CYLINDER_BARREL_HEIGHT,
  CYLINDER_BARREL_WIDTH,
  DASH_PATTERN,
  END_CAP_LENGTH,
  FLUID_GRID_SIZE,
  FRL_DIAMOND_SIZE,
  LOGIC_ELEMENT_DIAMETER,
  LOGIC_VALVE_HEIGHT,
  LOGIC_VALVE_WIDTH,
  ONE_WAY_FLOW_CONTROL_HEIGHT,
  ONE_WAY_FLOW_CONTROL_WIDTH,
  ROTARY_HOUSING_DIAMETER,
  VALVE_SQUARE_SIZE,
  isOnGrid,
} from '../../models/fluidGrid';
import { FluidSymbol, MOTOR, MOTOR_ORBIT_RADIUS, type FluidSymbolProps } from './FluidSymbols';
import { FluidLibraryIcon, PREVIEW_FILL, PREVIEW_MAX_SCALE, PREVIEW_STAGE, previewLayout, previewProps } from '../library/FluidLibraryIcon';
import { FLUID_LIBRARY_CATEGORIES } from '../../models/fluidCatalog';
import { portsOf } from '@shared/fluid/engine/componentSolvers';
import { isOnGrid } from '../../models/fluidGrid';
import { SERVICE_UNIT } from '../../models/fluidCatalog';

afterEach(cleanup);

const def = (type: string): FluidCatalogEntry => getFluidDefinition(type)!;
const draw = (type: string, extra: Partial<FluidSymbolProps> & { props?: Record<string, unknown> } = {}) => {
  const definition = def(type);
  return render(
    <svg><FluidSymbol definition={definition} stroke="#000" {...extra} props={{ ...defaultFluidProps(definition), ...extra.props }} /></svg>,
  ).container;
};
const num = (value: string | null) => Number(value);

/** Bounding box of a small SVG subset: rect, circle, polygon/polyline and absolute M/L/H/V paths. */
function bbox(element: Element): { x0: number; x1: number; y0: number; y1: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => { xs.push(x); ys.push(y); };
  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'rect') { const x = num(el.getAttribute('x')); const y = num(el.getAttribute('y')); add(x, y); add(x + num(el.getAttribute('width')), y + num(el.getAttribute('height'))); }
    else if (tag === 'circle') { const cx = num(el.getAttribute('cx')); const cy = num(el.getAttribute('cy')); const r = num(el.getAttribute('r')); add(cx - r, cy - r); add(cx + r, cy + r); }
    else if (tag === 'polygon' || tag === 'polyline') (el.getAttribute('points') ?? '').trim().split(/\s+/).forEach(pair => { const [x, y] = pair.split(',').map(Number); add(x, y); });
    else if (tag === 'path') {
      let x = 0; let y = 0;
      for (const [, command, args] of (el.getAttribute('d') ?? '').matchAll(/([MLHVZ])\s*([^MLHVZ]*)/g)) {
        const values = args.trim() === '' ? [] : args.trim().split(/[\s,]+/).map(Number);
        if (command === 'M' || command === 'L') { [x, y] = values; }
        else if (command === 'H') x = values[0];
        else if (command === 'V') y = values[0];
        add(x, y);
      }
    }
    Array.from(el.children).forEach(visit);
  };
  visit(element);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const pilots = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
/** Directional valves the palette offers (the 4/3 table exists for completeness only). */
const CATALOG_VALVES = Object.keys(VALVE_SPECS).filter(type => getFluidDefinition(type));

describe('master constants', () => {
  it('are the specified multiples of the 20 px grid', () => {
    expect(FLUID_GRID_SIZE).toBe(20);
    expect([VALVE_SQUARE_SIZE, CYLINDER_BARREL_WIDTH, CYLINDER_BARREL_HEIGHT, FRL_DIAMOND_SIZE, LOGIC_VALVE_WIDTH, LOGIC_VALVE_HEIGHT]).toEqual([60, 160, 60, 60, 120, 60]);
    for (const value of [VALVE_SQUARE_SIZE, CYLINDER_BARREL_WIDTH, CYLINDER_BARREL_HEIGHT, FRL_DIAMOND_SIZE, LOGIC_VALVE_WIDTH, LOGIC_VALVE_HEIGHT, END_CAP_LENGTH]) expect(isOnGrid(value) || value === END_CAP_LENGTH).toBe(true);
    expect([LOGIC_ELEMENT_DIAMETER, CHECK_VALVE_WIDTH, CHECK_VALVE_HEIGHT, ONE_WAY_FLOW_CONTROL_WIDTH, ONE_WAY_FLOW_CONTROL_HEIGHT, ROTARY_HOUSING_DIAMETER]).toEqual([16, 100, 40, 120, 60, 60]);
    expect([ARROW_LENGTH, 2 * ARROW_HALF_WIDTH, DASH_PATTERN, CYLINDER.flange]).toEqual([8, 7, '3,3', 6]);
  });
});

describe('connection pins land on grid points', () => {
  it('every terminal of every part, in every operator / medium variant, is a multiple of 20', () => {
    for (const entry of FLUID_CATALOG) {
      const variants = [defaultFluidProps(entry), { ...defaultFluidProps(entry), ...pilots }, { ...defaultFluidProps(entry), lubricator: 'Without Lubricator', drain: 'Automatic', cushioning: 'Adjustable - both', directions: 'Both directions' }];
      for (const props of variants) {
        for (const port of entry.portsFor(props)) {
          expect(isOnGrid(port.x), `${entry.type}:${port.id} x=${port.x}`).toBe(true);
          expect(isOnGrid(port.y), `${entry.type}:${port.id} y=${port.y}`).toBe(true);
        }
      }
    }
  });

  it('valve working ports sit on the top row and supply / exhaust ports on the bottom row, 30 px from the envelope', () => {
    for (const type of CATALOG_VALVES) {
      for (const port of def(type).portsFor(defaultFluidProps(def(type))).filter(p => p.type !== 'PILOT')) {
        expect(Math.abs(port.y), `${type}:${port.id}`).toBe(VALVE_SQUARE_SIZE);
        if (port.type === 'WORKING') expect(port.y).toBeLessThan(0);
        if (port.type === 'PRESSURE' || port.type === 'EXHAUST') expect(port.y).toBeGreaterThan(0);
        expect([-20, 0, 20]).toContain(port.x);
      }
    }
    const five = def('valve-5-2').portsFor(defaultFluidProps(def('valve-5-2'))).map(p => `${p.isoNumber}@${p.x},${p.y}`).sort();
    expect(five).toEqual(['1@0,60', '2@20,-60', '3@20,60', '4@-20,-60', '5@-20,60']);
  });

  it('pilot terminals sit one 30 px actuator beyond the furthest the sliding cap can reach, so the body never covers them', () => {
    const left = (type: string) => def(type).portsFor({ ...defaultFluidProps(def(type)), ...pilots }).filter(p => p.type === 'PILOT');
    const two = left('valve-5-2');
    expect(two.map(p => [p.id, p.x])).toEqual([['pilotL', -120], ['pilotR', 120]]);
    const three = left('valve-5-3');
    expect(three.map(p => [p.id, p.x])).toEqual([['pilotL', -180], ['pilotR', 180]]);
    expect(valveEdges(VALVE_SPECS['valve-5-3'])).toEqual({ left: -90, right: 90 });
    expect(valveEdges(VALVE_SPECS['valve-3-2-nc'])).toEqual({ left: -90, right: 30 });
    for (const p of [...two, ...three]) expect(isOnGrid(p.x), p.id).toBe(true);
  });

  it('a pilot pin is never under the strip at any spool offset, and the selection box reaches it', () => {
    for (const type of ['valve-3-2-nc', 'valve-5-2', 'valve-5-3']) {
      const spec = VALVE_SPECS[type];
      const offsets = spec.positions === 3 ? [-1, 0, 1] : [0, 1];
      const edges = valveEdges(spec);
      const pins = def(type).portsFor({ ...defaultFluidProps(def(type)), ...pilots }).filter(p => p.type === 'PILOT');
      for (const pin of pins) {
        for (const offset of offsets) {
          const stripLeft = edges.left + offset * VALVE_SQUARE_SIZE;
          const stripRight = edges.right + offset * VALVE_SQUARE_SIZE;
          expect(pin.x <= stripLeft - END_CAP_LENGTH || pin.x >= stripRight + END_CAP_LENGTH, `${type} ${pin.id} @${offset}`).toBe(true);
        }
      }
      const bounds = def(type).boundsFor({ ...defaultFluidProps(def(type)), ...pilots });
      const centerX = bounds.centerX ?? 0;
      for (const pin of pins) expect(Math.abs(pin.x - centerX) <= bounds.width / 2).toBe(true);
    }
  });


  it('the origin of a 2-position valve is the centre of its rest chamber, so hit-testing accepts the off-centre box', () => {
    const bounds = def('valve-5-2').boundsFor({ ...defaultFluidProps(def('valve-5-2')), actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' });
    expect(bounds).toEqual({ width: 180, height: 60, centerX: -30 });
    const part = { id: 'v', type: 'valve-5-2', x: 400, y: 300, rotation: 0, flipH: false, flipV: false, label: '1V1', props: {} };
    const at = (x: number) => pointInComponentBox(part, [400 + x, 300], bounds.width / 2, bounds.height / 2, 0, 10, bounds.centerX);
    expect(at(-110)).toBe(true); // over the actuated chamber / pushbutton
    expect(at(55)).toBe(true); // over the spring
    expect(at(-140)).toBe(false);
    expect(at(80)).toBe(false);
    expect(pointInComponentBox(part, [400 - 110, 300], 90, 30)).toBe(false); // a centred box would miss it
  });
});

describe('valve envelopes are 60 × 60', () => {
  it('every chamber of every directional valve measures exactly one square', () => {
    for (const type of CATALOG_VALVES) {
      const spec = VALVE_SPECS[type];
      const container = draw(type);
      const squares = Array.from(container.querySelectorAll('.valve-envelope-spool > g > rect'));
      expect(squares, type).toHaveLength(spec.positions);
      for (const square of squares) {
        expect([num(square.getAttribute('width')), num(square.getAttribute('height'))], type).toEqual([60, 60]);
        expect(isOnGrid(num(square.getAttribute('y')) + 30)).toBe(true);
      }
      const span = bbox(container.querySelector('.valve-envelope-spool')!);
      expect(span.x1 - span.x0).toBe(60 * spec.positions);
    }
  });

  it('sequence, regulating and relief valves use the very same single square', () => {
    const reference = draw('valve-5-2').querySelector('.valve-envelope-spool > g > rect')!;
    for (const type of ['regulator-nr', 'regulator-relieving', 'sequence-ext', 'pressure-relief', 'hyd-pressure-relief', 'sequence-combo', 'frl-detailed']) {
      const square = draw(type).querySelector('.valve-square');
      expect(square, type).not.toBeNull();
      expect([square!.getAttribute('width'), square!.getAttribute('height')], type).toEqual([reference.getAttribute('width'), reference.getAttribute('height')]);
      cleanup();
    }
  });

  it('the strip slides exactly one square per unit of spool offset', () => {
    expect(draw('valve-5-2', { spoolOffset: 1 }).querySelector('.valve-envelope-spool')!.getAttribute('style')).toContain('translateX(60px)');
    cleanup();
    expect(draw('valve-5-3', { spoolOffset: -1 }).querySelector('.valve-envelope-spool')!.getAttribute('style')).toContain('translateX(-60px)');
  });
});

describe('end-cap actuators', () => {
  it('are 30 px long, start on the axis and stay centred on it', () => {
    for (const kind of ACTUATION_OPTIONS.filter(option => option !== 'None')) {
      const container = draw('valve-3-2-nc', { props: { actuationLeft: 'None', actuationRight: kind } });
      const cap = container.querySelector('.valve-end-cap[data-side="right"]')!;
      expect(cap.getAttribute('transform'), kind).toBe('translate(30,0) scale(1,1)');
      const box = bbox(cap);
      expect(box.x0, kind).toBe(0);
      expect(box.x1, kind).toBe(END_CAP_LENGTH);
      expect(box.y0 >= -20 && box.y1 <= 20, kind).toBe(true); // inside the click target
      expect(box.x1 - box.x0, kind).toBeLessThanOrEqual(END_CAP_LENGTH);
      cleanup();
    }
  });

  it('the left cap mirrors the right one about the strip edge', () => {
    const cap = draw('valve-3-2-nc', { props: { actuationLeft: 'Pushbutton', actuationRight: 'None' } }).querySelector('.valve-end-cap[data-side="left"]')!;
    expect(cap.getAttribute('transform')).toBe('translate(-90,0) scale(-1,1)');
  });
});

describe('pilot pins stay on the grid while the spool slides', () => {
  /** Visible lead: the slice of the clipped, sliding lead line that lies between the pin and the cap. */
  const pilotLeads = (type: string, spoolOffset: number) => {
    const container = draw(type, { props: pilots, spoolOffset });
    return Array.from(container.querySelectorAll('.pilot-lead')).map(lead => {
      const [x0, x1] = (lead.querySelector('.pilot-lead-slide path')!.getAttribute('d')!.match(/-?\d+/g) ?? []).map(Number).filter((_, i) => i !== 1) as [number, number];
      const clip = lead.querySelector('clipPath rect')!;
      const clipX0 = num(clip.getAttribute('x'));
      const clipX1 = clipX0 + num(clip.getAttribute('width'));
      const shift = num(/translateX\((-?[\d.]+)px\)/.exec(lead.querySelector('.pilot-lead-slide')!.getAttribute('style')!)![1]);
      const lo = Math.max(Math.min(x0, x1) + shift, clipX0);
      const hi = Math.min(Math.max(x0, x1) + shift, clipX1);
      return {
        port: lead.getAttribute('data-port'),
        pin: [num(lead.querySelector('circle')!.getAttribute('cx')), num(lead.querySelector('circle')!.getAttribute('cy'))],
        visible: Math.max(0, hi - lo),
        clipId: lead.querySelector('clipPath')!.getAttribute('id'),
        clipRef: lead.querySelector('[clip-path]')!.getAttribute('clip-path'),
      };
    });
  };

  it('the terminal pins never move, and the lead is exactly as long as the gap between pin and cap', () => {
    const rest = pilotLeads('valve-5-2', 0);
    cleanup();
    const actuated = pilotLeads('valve-5-2', 1);
    expect(rest.map(p => p.pin)).toEqual([[-120, 0], [120, 0]]);
    expect(actuated.map(p => p.pin)).toEqual(rest.map(p => p.pin));
    // 14 (left) is flush at rest and one square long when the strip has slid right; 12 (right) is the mirror image
    expect(rest.map(p => p.visible)).toEqual([0, 60]);
    expect(actuated.map(p => p.visible)).toEqual([60, 0]);
    cleanup();
    expect(pilotLeads('valve-5-3', 0).map(p => p.visible)).toEqual([60, 60]);
    cleanup();
    expect(pilotLeads('valve-5-3', -1).map(p => p.visible)).toEqual([0, 120]);
  });

  it('each lead is clipped by its own, uniquely named clip path', () => {
    const container = render(<svg><FluidSymbol definition={def('valve-5-2')} stroke="#000" props={{ ...defaultFluidProps(def('valve-5-2')), ...pilots }} /><FluidSymbol definition={def('valve-5-2')} stroke="#000" props={{ ...defaultFluidProps(def('valve-5-2')), ...pilots }} /></svg>).container;
    const ids = Array.from(container.querySelectorAll('clipPath')).map(c => c.getAttribute('id')!);
    expect(new Set(ids).size).toBe(4);
    for (const lead of Array.from(container.querySelectorAll('.pilot-lead'))) {
      expect(lead.querySelector('[clip-path]')!.getAttribute('clip-path')).toBe(`url(#${lead.querySelector('clipPath')!.getAttribute('id')})`);
    }
  });
});

describe('operated manual actuators', () => {
  const cap = (kind: string, pressed: boolean) => draw('valve-3-2-nc', { props: { actuationLeft: kind, actuationRight: 'None' }, operatorPressed: { left: pressed } }).querySelector('.valve-end-cap[data-side="left"]')!;

  it('a pushbutton sinks 4 px towards the casing and shades, keeping its guide rods flush with the casing', () => {
    const idle = cap('Pushbutton', false);
    expect(idle.getAttribute('data-pressed')).toBe('false');
    expect(idle.querySelector('path')!.getAttribute('d')).toBe('M 0 -5 H 24 M 0 5 H 24 M 24 -11 H 30 V 11 H 24 Z');
    expect(idle.querySelector('path')!.getAttribute('fill')).toBe('none');
    cleanup();
    const down = cap('Pushbutton', true);
    expect(down.getAttribute('data-pressed')).toBe('true');
    expect(down.querySelector('path')!.getAttribute('d')).toBe('M 0 -5 H 20 M 0 5 H 20 M 20 -11 H 26 V 11 H 20 Z');
    expect(down.querySelector('path')!.getAttribute('fill')).toBe('#000');
    const box = bbox(down);
    expect(box.x0).toBe(0); // the rods still start on the casing
  });

  it('every mechanical operator changes appearance when operated', () => {
    for (const kind of ['Pushbutton', 'Hand Lever', 'Detent Lever', 'Foot Pedal', 'Plunger', 'Roller', 'Idle-Return Roller', 'Solenoid']) {
      const idle = cap(kind, false).innerHTML;
      cleanup();
      const down = cap(kind, true).innerHTML;
      cleanup();
      expect(down, kind).not.toBe(idle);
    }
  });

  it('the cap never moves relative to the strip: it is a child of the sliding group', () => {
    const container = draw('valve-5-2', { props: { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }, spoolOffset: 1, operatorPressed: { left: true } });
    const strip = container.querySelector('.valve-envelope-spool')!;
    expect(strip.querySelectorAll(':scope > .valve-end-cap')).toHaveLength(2);
    expect(strip.getAttribute('style')).toContain('translateX(60px)');
  });
});

describe('pushbutton glyph', () => {
  it('is a flat cap closing two parallel guide pins that enter the casing flush at the end edge', () => {
    const container = draw('valve-3-2-nc', { props: { actuationLeft: 'None', actuationRight: 'Pushbutton' } });
    const d = container.querySelector('.valve-end-cap[data-side="right"] path')!.getAttribute('d')!;
    expect(d).toBe('M 0 -5 H 24 M 0 5 H 24 M 24 -11 H 30 V 11 H 24 Z');
    const box = bbox(container.querySelector('.valve-end-cap[data-side="right"]')!);
    expect([box.x0, box.x1]).toEqual([0, END_CAP_LENGTH]); // starts on the casing, no gap
  });
});

describe('cylinders', () => {
  it('have a 160 × 60 barrel with 6 px flanges and a 54 px piston disc spanning the whole interior', () => {
    const container = draw('cylinder-double');
    const barrel = container.querySelector('.cylinder-barrel')!;
    expect([num(barrel.getAttribute('x')), num(barrel.getAttribute('y')), num(barrel.getAttribute('width')), num(barrel.getAttribute('height'))]).toEqual([-80, -30, 160, 60]);
    const flanges = Array.from(container.querySelectorAll('.cylinder-flange'));
    expect(flanges).toHaveLength(2);
    for (const flange of flanges) {
      // protrudes 6 px above and below the 60 px barrel
      expect(num(flange.getAttribute('y'))).toBe(-36);
      expect(num(flange.getAttribute('height'))).toBe(72);
    }
    const disc = container.querySelector('.piston-disc')!;
    expect([num(disc.getAttribute('y')), num(disc.getAttribute('height'))]).toEqual([-27, 54]);
  });

  it('the rod is on the axis, 40 px out of the front cap at 0 % and 120 px at 100 %', () => {
    for (const [extension, outside] of [[0, 40], [1, 120], [0.5, 80]] as const) {
      const container = draw('cylinder-double', { extension });
      const rod = container.querySelector('.piston-rod')!;
      expect(rod.getAttribute('d')).toMatch(/^M -40 0 H 120$/);
      const travel = num(/translateX\(([\d.]+)px\)/.exec(container.querySelector('.piston-rod-assembly')!.getAttribute('style')!)![1]);
      expect(travel).toBe(80 * extension);
      expect(120 + travel - 80, `extension ${extension}`).toBe(outside);
      cleanup();
    }
  });

  it('the single-acting spring keeps its coil count and a 50 px swing touching the bore walls at any stroke', () => {
    let points = -1;
    for (const extension of [0, 0.5, 1]) {
      const spring = draw('cylinder-single', { extension }).querySelector('.spring-coil')!;
      const pairs = spring.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
      if (points < 0) points = pairs.length;
      expect(pairs.length).toBe(points);
      const ys = pairs.map(pair => pair[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBe(50);
      expect(pairs[0][0]).toBeCloseTo(-40 + 80 * extension, 5);
      expect(pairs[pairs.length - 1][0]).toBe(80);
      cleanup();
    }
  });

  it('both working ports leave the bottom edge at ±60, and the cylinder is wider than any 2-position valve', () => {
    for (const type of ['cylinder-double', 'cylinder-double-rod']) {
      expect(def(type).portsFor({}).map(p => [p.x, p.y])).toEqual([[-60, 60], [60, 60]]);
    }
    expect(def('cylinder-single').portsFor({}).map(p => [p.x, p.y])).toEqual([[-60, 60]]);
    const barrel = CYLINDER_BARREL_WIDTH;
    for (const type of ['valve-2-2-no', 'valve-3-2-nc', 'valve-4-2', 'valve-5-2']) {
      const edges = valveEdges(VALVE_SPECS[type]);
      expect(barrel).toBeGreaterThan(edges.right - edges.left);
    }
  });

  it('double-rod cylinders carry the rod through both caps', () => {
    expect(draw('cylinder-double-rod').querySelectorAll('.piston-rod')).toHaveLength(2);
  });
});

describe('energy and preparation palette', () => {
  const ids = (medium: 'PNEUMATIC' | 'HYDRAULIC') => Object.values(FLUID_LIBRARY_CATEGORIES[medium]).flat().map(item => item.id);
  const REMOVED = ['compressor', 'filter', 'water-separator', 'lubricator'];

  it('offers the pressure source, air reservoir, simple service unit, composite main unit, pressure gauge and exhaust port, in that order', () => {
    expect(FLUID_LIBRARY_CATEGORIES.PNEUMATIC['Energy & Preparation'].map(item => item.id)).toEqual(['pressure-source', 'air-reservoir', 'frl-simplified', 'service-unit', 'pressure-gauge', 'exhaust-port']);
  });

  it('orders the pneumatic palette and keeps every actuator and prunes only duplicate and sequence parts', () => {
    const palette = FLUID_LIBRARY_CATEGORIES.PNEUMATIC;
    expect(Object.keys(palette)).toEqual(['Energy & Preparation', 'Actuators', 'Directional Control Valves', 'Logic & Flow Control', 'Pressure Control Valves']);
    expect(palette['Actuators'].map(item => item.id)).toEqual(['cylinder-single', 'cylinder-double', 'cylinder-double-rod', 'air-motor-fixed']);
    expect(palette['Directional Control Valves'].map(item => item.id)).toEqual(['valve-2-2-nc', 'valve-3-2-nc', 'valve-4-2', 'valve-5-2', 'valve-5-3']);
    expect(palette['Pressure Control Valves'].map(item => item.id)).toEqual(['regulator-nr', 'regulator-relieving', 'pressure-relief']);
    const all = Object.values(palette).flat().map(item => item.id);
    for (const gone of ['silencer', 'valve-2-2-no', 'valve-3-2-no', 'sequence-ext', 'sequence-combo']) expect(all).not.toContain(gone);
  });

  it('no longer lists the compressor, filter, water separator or lubricator anywhere', () => {
    for (const medium of ['PNEUMATIC', 'HYDRAULIC'] as const) for (const type of REMOVED) expect(ids(medium), `${medium} ${type}`).not.toContain(type);
    for (const type of REMOVED) expect(getFluidDefinition(type), type).toBeUndefined();
  });

  it('draws both service units with their lubricator, whatever the stored option says', () => {
    expect(draw('frl-detailed').querySelectorAll('.frl-diamond')).toHaveLength(2);
    expect(draw('frl-detailed', { props: { lubricator: 'Without Lubricator' } }).querySelectorAll('.frl-diamond')).toHaveLength(2);
    expect(draw('frl-simplified', { props: { lubricator: 'Without Lubricator' } }).querySelectorAll('path[d="M 40 -30 V -18"]')).toHaveLength(1);
  });

  it('files the time-delay valve under Logic & Flow Control', () => {
    expect(FLUID_LIBRARY_CATEGORIES.PNEUMATIC['Logic & Flow Control'].map(item => item.id)).toContain('time-delay-valve');
  });
});

/** The open basin of an internal tank glyph (`M -10 y V y' H 10 V y`): hydraulic valves no longer carry one. */
const BASIN = /^M -10 -?\d+ V -?\d+ H 10 V -?\d+$/;

describe('hydraulic library symbols (ISO 1219-1)', () => {
  it('the pump is a circle with a solid triangle pointing out of it, towards the pressure port', () => {
    const container = draw('hyd-pump', { medium: 'HYDRAULIC' });
    expect(container.querySelector('circle')!.getAttribute('r')).toBe('30');
    const triangle = container.querySelector('polygon')!;
    expect(triangle.getAttribute('fill')).toBe('#000');
    const points = triangle.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
    expect(points[0][1]).toBeLessThan(points[1][1]); // apex up, base below it
    expect(def('hyd-pump').ports.find(p => p.lettering === 'P')).toMatchObject({ x: 0, y: -60 });
  });

  it('the tank is an open-top vessel the return line enters from above', () => {
    const container = draw('hyd-tank', { medium: 'HYDRAULIC' });
    const paths = Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('d'));
    expect(paths).toContain('M -30 0 V 30 H 30 V 0');
    expect(def('hyd-tank').ports).toHaveLength(1);
    expect(def('hyd-tank').ports[0]).toMatchObject({ lettering: 'T', type: 'EXHAUST', x: 0, y: -40 });
    expect(container.textContent).toContain('T');
  });

  it('the pressure supply is a solid triangle (ISO 1219) even where the pneumatic one is open', () => {
    const solid = draw('hyd-pressure-source', { medium: 'HYDRAULIC' }).querySelector('polygon')!;
    expect(solid.getAttribute('fill')).toBe('#000');
    expect(def('hyd-pressure-source').ports.map(p => [p.x, p.y])).toEqual([[40, 0]]);
    cleanup();
    expect(draw('pressure-source', { medium: 'PNEUMATIC' }).querySelector('polygon')!.getAttribute('fill')).toBe('none');
  });

  it('every cylinder draws its entry triangle inside the barrel above each port: solid for oil, open for air', () => {
    for (const [type, count] of [['cylinder-single', 1], ['cylinder-double', 2], ['cylinder-double-rod', 2]] as const) {
      for (const [medium, fill] of [['HYDRAULIC', '#000'], ['PNEUMATIC', 'none']] as const) {
        const triangles = draw(type, { medium }).querySelectorAll('.entry-triangle');
        expect(triangles, `${type} ${medium}`).toHaveLength(count);
        triangles.forEach((t, i) => {
          expect(t.getAttribute('fill')).toBe(fill);
          const [apex, left, right] = t.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
          expect(apex[1]).toBeLessThan(left[1]); // apex points up, into the chamber
          expect(right[0] - left[0]).toBe(8);
          for (const [, y] of [apex, left, right]) expect(Math.abs(y)).toBeLessThanOrEqual(30); // within the 60 px barrel
          expect(Math.max(left[1], right[1])).toBe(30); // base sits on the bottom casing line
          expect(apex[0]).toBe(def(type).ports[i].x);
        });
        cleanup();
      }
    }
  });

  it('pilot triangles are solid on hydraulic valves and open on pneumatic ones', () => {
    const pilots = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
    expect(draw('hvalve-4-3', { medium: 'HYDRAULIC', props: pilots }).querySelector('.pilot-triangle')!.getAttribute('fill')).toBe('#000');
    cleanup();
    expect(draw('valve-5-3', { medium: 'PNEUMATIC', props: pilots }).querySelector('.pilot-triangle')!.getAttribute('fill')).toBe('none');
  });

  it('a solenoid is a rectangle holding the energy triangle: solid for oil, open for air', () => {
    for (const [type, medium, fill] of [['hvalve-4-2', 'HYDRAULIC', '#000'], ['valve-5-2', 'PNEUMATIC', 'none']] as const) {
      const container = draw(type, { medium, props: { actuationLeft: 'Solenoid', actuationRight: 'Spring Return' } });
      expect(container.querySelector('.solenoid-triangle')!.getAttribute('fill'), medium).toBe(fill);
      cleanup();
    }
  });

  it('the hydraulic power unit draws a solid pump triangle, a suction filter, a relief valve and a shut-off with outlet port 2', () => {
    const container = draw('hyd-power-unit', { medium: 'HYDRAULIC' });
    expect(container.querySelector('[data-stage="hyd-pump"] polygon')!.getAttribute('fill')).toBe('#000');
    expect(container.querySelector('.hpu-filter .frl-diamond')).not.toBeNull();
    expect(container.querySelector('.hpu-tank')).not.toBeNull();
    expect(container.querySelector('[data-stage="hyd-pressure-relief"]')).not.toBeNull();
    expect(container.querySelector('[data-stage="valve-2-2-nc"]')).not.toBeNull();
    expect(def('hyd-power-unit').ports).toHaveLength(1);
    expect(def('hyd-power-unit').ports[0]).toMatchObject({ isoNumber: '2', type: 'WORKING' });
  });

  it('the power unit sets its relief valve right of the pump line, widens the tank under the return line, and shows no 0S1 tag', () => {
    const container = draw('hyd-power-unit', { medium: 'HYDRAULIC', operatorTags: { right: '0S1' } });
    expect(container.textContent).not.toContain('0S1');
    const relief = container.querySelector('[data-stage="hyd-pressure-relief"]')!.getAttribute('transform')!;
    expect(Number(/translate\((-?\d+)/.exec(relief)![1])).toBeGreaterThanOrEqual(140);
    const basin = container.querySelector('.hpu-tank')!.getAttribute('d')!;
    const [, left, right] = /M (-?\d+) \d+ V \d+ H (-?\d+)/.exec(basin)!.map(Number);
    expect(right - left).toBeGreaterThan(200);
  });

  it('every shut port carries a T plug in its envelope: the open 3/2 envelope shuts port 3, the vented one port 1', () => {
    const plugs = (type: string) => Array.from(draw(type).querySelectorAll('.valve-envelope-spool > g')).map(cell => cell.querySelectorAll('path[d^="M"][d*="V"][d*="H"]').length);
    for (const type of ['valve-3-2-nc', 'hvalve-3-2-nc']) {
      const counts = plugs(type);
      expect(counts[0], type).toBeGreaterThanOrEqual(1); // actuated cell: 1→2 open, 3 shut
      expect(counts[1], type).toBeGreaterThanOrEqual(1); // rest cell: 1 shut
      cleanup();
    }
  });

  it('the hydraulic motor adds a second solid triangle when it runs both ways', () => {
    expect(draw('hyd-motor', { medium: 'HYDRAULIC' }).querySelectorAll('polygon')).toHaveLength(1);
    cleanup();
    expect(draw('hyd-motor', { medium: 'HYDRAULIC', props: { directions: 'Both directions' } }).querySelectorAll('polygon')).toHaveLength(2);
  });

  it('hydraulic valves draw the letters P, T, A, B on their own terminals instead of an internal tank', () => {
    for (const type of ['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float']) {
      const container = draw(type, { medium: 'HYDRAULIC', props: { actuationLeft: 'None', actuationRight: 'None' } });
      const letters = Array.from(container.querySelectorAll('text')).map(text => text.textContent).sort();
      expect(letters, type).toEqual(['A', 'B', 'P', 'T']);
      expect(Array.from(container.querySelectorAll('path')).some(path => BASIN.test(path.getAttribute('d') ?? '')), type).toBe(false);
      cleanup();
    }
  });

  it('the two 4/3 neutrals draw different centre chambers', () => {
    const centre = (type: string) => {
      const container = draw(type, { medium: 'HYDRAULIC', props: { actuationLeft: 'None', actuationRight: 'None' } });
      const cells = Array.from(container.querySelectorAll('.valve-envelope-spool > g'));
      const cell = cells[1];
      return [cell.querySelectorAll('.arrowhead').length, cell.querySelectorAll('path').length];
    };
    const closed = centre('hvalve-4-3');
    const float = centre('hvalve-4-3-float');
    expect(closed[0]).toBe(0);
    expect(float[0]).toBe(2);
  });

  it('the relief and reducing valves expose their tank port T on a stub, with no basin symbol', () => {
    expect(def('hyd-pressure-relief').ports.map(p => [p.lettering, p.x, p.y])).toEqual([['P', 0, 60], ['T', 0, -60]]);
    expect(def('hyd-reducing-valve').ports.map(p => p.lettering)).toEqual(['P', 'A']);
    expect(def('hyd-reducing-valve-3way').ports.map(p => p.lettering)).toEqual(['P', 'A', 'T']);
    const container = draw('hyd-pressure-relief', { medium: 'HYDRAULIC' });
    expect(Array.from(container.querySelectorAll('path')).some(path => BASIN.test(path.getAttribute('d') ?? ''))).toBe(false);
    expect(container.textContent).toContain('T');
  });
});

describe('time delay valve symbol', () => {
  const ports = () => Object.fromEntries(def('time-delay-valve').portsFor({}).map(p => [p.isoNumber, [p.x, p.y]]));

  it('has the ISO ports 1, 2, 3 and the pilot 12, all on the 20 px grid', () => {
    expect(ports()).toEqual({ '1': [-20, 60], '2': [0, -60], '3': [20, 60], '12': [-220, 0] });
    for (const port of def('time-delay-valve').portsFor({})) expect([isOnGrid(port.x), isOnGrid(port.y)], port.id).toEqual([true, true]);
    expect(def('time-delay-valve').portsFor({}).find(p => p.isoNumber === '12')!.type).toBe('PILOT');
  });

  it('every port is a port the engine models, and the housing reaches the pilot terminal', () => {
    const engine = new Set(portsOf({ id: 'x', type: 'time-delay-valve', props: {} }));
    for (const port of def('time-delay-valve').ports) expect(engine.has(port.id), port.id).toBe(true);
    const bounds = def('time-delay-valve').boundsFor({});
    expect((bounds.centerX ?? 0) - bounds.width / 2).toBeCloseTo(-220, 6);
  });

  it('draws the housing, the pilot chain (throttle, check valve, reservoir) and the 3/2 valve with its spring', () => {
    const container = draw('time-delay-valve');
    expect(container.querySelector('.td-housing')).not.toBeNull();
    expect(container.querySelector('.td-reservoir')).not.toBeNull();
    expect(container.querySelector('.td-check .check-seat')).not.toBeNull();
    expect(container.querySelectorAll('.valve-envelope-spool .valve-square, .valve-envelope-spool rect')).not.toHaveLength(0);
    expect(container.querySelector('.valve-end-cap[data-side="right"] .spring-coil, .valve-end-cap[data-side="right"] path')).not.toBeNull();
    expect(container.textContent).toEqual(expect.stringContaining('12'));
  });

  it('the valve strip slides to the open chamber when the timer has switched', () => {
    const rest = draw('time-delay-valve', { logicOffset: 0 }).querySelector('.valve-envelope-spool')!;
    expect(rest.getAttribute('style')).toContain('translateX(0px)');
    cleanup();
    const open = draw('time-delay-valve', { logicOffset: 1 }).querySelector('.valve-envelope-spool')!;
    expect(open.getAttribute('style')).toContain('translateX(60px)');
  });
});

const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('logic valves', () => {
  /** Distance from a point to the infinite line through two points. */
  const distance = (p: [number, number], a: [number, number], b: [number, number]) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);

  it('AND, OR and quick exhaust share one 120 × 60 envelope (a 2-chamber valve) with the inlets on the axis and the outlet at the top centre', () => {
    for (const type of ['shuttle-valve', 'dual-pressure-valve', 'quick-exhaust']) {
      const envelope = draw(type).querySelector('.logic-envelope')!;
      expect([num(envelope.getAttribute('x')), num(envelope.getAttribute('y')), num(envelope.getAttribute('width')), num(envelope.getAttribute('height'))], type).toEqual([-60, -30, 120, 60]);
      expect(def(type).boundsFor({}), type).toEqual({ width: 120, height: 60 });
      cleanup();
    }
    const at = (type: string) => Object.fromEntries(def(type).ports.map(p => [p.id, [p.x, p.y]]));
    expect(at('shuttle-valve')).toEqual({ x: [-80, 0], y: [80, 0], out: [0, -60] });
    expect(at('dual-pressure-valve')).toEqual({ x: [-80, 0], y: [80, 0], out: [0, -60] });
    expect(at('quick-exhaust')).toEqual({ p1: [-80, 0], p2: [0, -60], p3: [0, 60] });
    // the same outer rectangle as a 2-chamber directional valve
    const strip = bbox(draw('valve-5-2').querySelector('.valve-envelope-spool > g')!.parentElement!.querySelector('g > rect')!.parentElement!.parentElement!);
    expect(strip.x1 - strip.x0).toBe(120);
  });

  it('AND: four guide stops (two a side, from roof and floor), a 20 px gate, and an H-spool of two discs on a rigid connector', () => {
    const container = draw('dual-pressure-valve');
    const stops = numbers(container.querySelector('.and-stops')!.getAttribute('d')!);
    // M x y V y  ×4
    expect(stops).toEqual([-40, -30, -10, -40, 10, 30, 40, -30, -10, 40, 10, 30]);
    const spool = container.querySelector('.and-spool .logic-element')!;
    const box = bbox(spool);
    expect([box.x0, box.x1, box.y0, box.y1]).toEqual([-16, 16, -13, 13]);
    expect(spool.getAttribute('d')).toContain('M -16 0 H 16'); // the rigid connector
    expect(box.y1 - box.y0).toBeGreaterThan(20); // wider than the gate, so the stops catch it
    // the outlet rises from the centre of the body to port 2
    expect(Array.from(container.querySelectorAll('path')).some(path => path.getAttribute('d') === 'M 0 -30 V 0')).toBe(true);
  });

  it('AND: one signal slides the spool until the left (or right) disc sits exactly under the outlet', () => {
    expect(draw('dual-pressure-valve', { logicOffset: 1 }).querySelector('.and-spool')!.getAttribute('style')).toContain('translate(16px');
    cleanup();
    expect(draw('dual-pressure-valve', { logicOffset: -1 }).querySelector('.and-spool')!.getAttribute('style')).toContain('translate(-16px');
    cleanup();
    expect(draw('dual-pressure-valve', { logicOffset: 0 }).querySelector('.and-spool')!.getAttribute('style')).toContain('translate(0px');
  });

  it('OR: the 16 px ball is tangent to the conical seat on either side when it reaches it', () => {
    const container = draw('shuttle-valve');
    expect(num(container.querySelector('.shuttle-ball circle')!.getAttribute('r')) * 2).toBe(16);
    const arms = numbers(container.querySelector('.conical-seats')!.getAttribute('d')!);
    // left funnel: wall (-60, ±4) → mouth (-30, ±20)
    expect(arms.slice(0, 8)).toEqual([-60, -4, -30, -20, -60, 4, -30, 20]);
    const travel = num(/translate\(([\d.]+)px/.exec(draw('shuttle-valve', { logicOffset: 1 }).querySelector('.shuttle-ball')!.getAttribute('style')!)![1]);
    for (const side of [1, -1]) {
      const centre: [number, number] = [side * travel, 0];
      const wall = side * 60;
      const mouth = side * 30;
      for (const sign of [-1, 1]) {
        expect(distance(centre, [wall, sign * 4], [mouth, sign * 20])).toBeCloseTo(8, 1);
      }
    }
    // it fits inside the body at the seat
    expect(travel + 8).toBeLessThanOrEqual(60);
  });

  it('OR and quick exhaust are drawn on the same seats, with the outlet branch dropping from port 2', () => {
    const or = draw('shuttle-valve').querySelector('.conical-seats')!.getAttribute('d');
    cleanup();
    const qe = draw('quick-exhaust');
    expect(qe.querySelector('.conical-seats')!.getAttribute('d')).toBe(or);
    expect(Array.from(qe.querySelectorAll('path')).some(path => path.getAttribute('d') === 'M 0 -30 V -12')).toBe(true);
  });

  it('quick exhaust: dashed pilot line rises from port 1, runs across above the body and slopes down into the outlet pipe; exhaust triangle below', () => {
    const container = draw('quick-exhaust');
    const pilot = container.querySelector('.pilot-bypass')!;
    expect(pilot.getAttribute('d')).toBe('M -70 0 V -48 H -20 L 0 -40');
    expect(pilot.getAttribute('stroke-dasharray')).toBe('3,3');
    expect(num(pilot.getAttribute('stroke-width'))).toBe(1);
    const top = numbers(pilot.getAttribute('d')!)[2];
    expect(top).toBeLessThan(-30); // above the body
    // the end of the slope lies on the outlet pipe (x = 0, between the body roof and port 2)
    expect(numbers(pilot.getAttribute('d')!).slice(-2)).toEqual([0, -40]);
    const vent = Array.from(container.querySelectorAll('polygon')).find(p => !p.classList.contains('arrowhead'))!;
    const ys = vent.getAttribute('points')!.split(' ').map(pair => Number(pair.split(',')[1]));
    expect(Math.min(...ys)).toBeGreaterThan(30);
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys)); // apex pointing down
  });

  it('quick exhaust: the ball goes to the right seat when supplied and to the left seat when port 1 drops', () => {
    expect(draw('quick-exhaust', { logicOffset: 1 }).querySelector('.shuttle-ball')!.getAttribute('style')).toContain('translate(50.5px');
    cleanup();
    expect(draw('quick-exhaust', { logicOffset: -1 }).querySelector('.shuttle-ball')!.getAttribute('style')).toContain('translate(-50.5px');
  });
});

describe('check valves', () => {
  const distanceToArm = (centre: [number, number], arm: [[number, number], [number, number]]) => {
    const [[x1, y1], [x2, y2]] = arm;
    return Math.abs((x2 - x1) * (y1 - centre[1]) - (x1 - centre[0]) * (y2 - y1)) / Math.hypot(x2 - x1, y2 - y1);
  };

  it('are 100 px along the axis (terminals 10 px beyond the 100 px envelope, on the grid)', () => {
    for (const type of ['check-valve', 'check-valve-spring']) {
      expect(def(type).boundsFor({}), type).toEqual({ width: 100, height: 40 });
      expect(def(type).ports.map(p => [p.x, p.y]), type).toEqual([[-60, 0], [60, 0]]);
    }
  });

  it('the 16 px ball sits tangent to both arms of the open V seat, touching neither the vertex nor an arm tip', () => {
    for (const type of ['check-valve', 'check-valve-spring']) {
      const container = draw(type);
      const seat = container.querySelector('.check-seat')!;
      const [tx1, ty1, vx, vy, tx2, ty2] = (seat.getAttribute('d')!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(vy).toBe(0);
      expect(tx1).toBeGreaterThan(vx); // the V opens towards the ball side
      expect(tx1).toBe(tx2);
      const ball = container.querySelector('circle.logic-element')!;
      expect(num(ball.getAttribute('r')) * 2).toBe(16);
      const centre: [number, number] = [num(ball.getAttribute('cx')), 0];
      expect(distanceToArm(centre, [[tx1, ty1], [vx, vy]]), type).toBeCloseTo(8, 1);
      expect(distanceToArm(centre, [[tx2, ty2], [vx, vy]]), type).toBeCloseTo(8, 1);
      expect(centre[0] - 8, `${type} ball clear of the vertex`).toBeGreaterThan(vx);
      cleanup();
    }
  });

  it('the spring-loaded valve runs a 4-peak spring, as high as the ball, from the back of the ball to the outlet pin', () => {
    const container = draw('check-valve-spring');
    const spring = container.querySelector('.spring-coil')!;
    const points = spring.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
    const peaks = points.filter(([, y]) => y !== 0);
    expect(peaks).toHaveLength(4);
    expect(peaks.map(([, y]) => y)).toEqual([-8, 8, -8, 8]); // uniform, alternating, 16 px = the ball diameter
    const ball = bbox(container.querySelector('circle.logic-element')!);
    const group = container.querySelector('g[transform^="translate"]')!.getAttribute('transform');
    const shift = num(/translate\((-?\d+)/.exec(group!)![1]);
    expect(points[0][0]).toBe(shift + ball.x1); // starts at the back of the ball
    expect(points[points.length - 1][0]).toBe(40);
    const lines = Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('d'));
    expect(lines.join(' ')).toMatch(/M 40 0 H 60/); // and on to the outlet terminal
  });

  it('the plain check valve keeps the line out of the ball: it stops at the seat vertex and resumes at the ball', () => {
    const lines = numbers(draw('check-valve').querySelector('svg > g > g > path')!.getAttribute('d')!);
    expect(lines.slice(0, 2)).toEqual([-60, 0]);
    expect(lines[2]).toBe(-12);
    expect(lines[3]).toBeCloseTo(12, 6);
    expect(lines[lines.length - 1]).toBe(60);
  });
});

describe('flow-control valves', () => {
  it('the throttle is two symmetrical pinching arcs crossed by a 45° adjustment arrow', () => {
    const container = draw('flow-control');
    const arcs = Array.from(container.querySelectorAll('path')).filter(path => (path.getAttribute('d') ?? '').includes('Q'));
    expect(arcs).toHaveLength(2);
    const [top, bottom] = arcs.map(arc => numbers(arc.getAttribute('d')!));
    expect(top.map(Math.abs)).toEqual(bottom.map(Math.abs)); // mirror images
    const diagonal = Array.from(container.querySelectorAll('path')).map(path => numbers(path.getAttribute('d') ?? '')).find(values => values.length === 4 && values[0] === -16)!;
    expect(diagonal).toEqual([-16, 16, 16, -16]);
    expect(Math.atan2(diagonal[1] - diagonal[3], diagonal[2] - diagonal[0]) * (180 / Math.PI)).toBeCloseTo(45, 6);
  });

  it('the one-way valve is a dash-dot 120 × 60 block with two parallel branches on shared T-junctions', () => {
    const container = draw('flow-control-oneway');
    const box = container.querySelector('.valve-square')!;
    expect([num(box.getAttribute('width')), num(box.getAttribute('height'))]).toEqual([120, 60]);
    expect(box.getAttribute('stroke-dasharray')).toBe('12 4 2 4');
    expect(def('flow-control-oneway').boundsFor({})).toEqual({ width: 120, height: 60 });
    expect(def('flow-control-oneway').ports.map(p => [p.x, p.y])).toEqual([[-80, 0], [80, 0]]);
    const dots = Array.from(container.querySelectorAll('circle')).filter(c => c.getAttribute('stroke') === 'none').map(c => [num(c.getAttribute('cx')), num(c.getAttribute('cy'))]);
    expect(dots).toEqual([[-40, 0], [40, 0]]);
    const verticals = Array.from(container.querySelectorAll('path')).find(path => path.getAttribute('d') === 'M -40 -15 V 15 M 40 -15 V 15');
    expect(verticals).toBeTruthy();
  });

  it('the throttle is the top branch and the check valve the bottom one, its seat on the outlet side (1 → 2 blocked)', () => {
    const container = draw('flow-control-oneway');
    const branchTransform = Array.from(container.querySelectorAll('g')).find(g => g.getAttribute('transform') === 'translate(0,15) scale(-1,1)')!;
    expect(branchTransform).toBeTruthy();
    const seat = branchTransform.querySelector('.check-seat')!;
    const vertex = numbers(seat.getAttribute('d')!)[2];
    expect(-vertex).toBeGreaterThan(0); // mirrored: the vertex (seat) is on the right
    const ball = num(branchTransform.querySelector('circle.logic-element')!.getAttribute('cx'));
    expect(-ball).toBeLessThan(-vertex);
    // everything stays inside the housing
    const inner = bbox(container.querySelector('svg > g > g')!);
    expect(inner.y0).toBeGreaterThanOrEqual(-30);
    expect(inner.y1).toBeLessThanOrEqual(30);
  });
});

describe('stroke and arrowhead consistency', () => {
  const widthOf = (element: Element | null) => num(element!.getAttribute('stroke-width'));

  it('bodies are 2 px, flow arrows / T-bars / springs 1.5 px and dashed pilot lines 1 px with a 3,3 pattern', () => {
    const valve = draw('valve-5-2');
    const cell = valve.querySelector('.valve-envelope-spool > g > rect')!;
    expect(widthOf(cell)).toBe(2);
    const detailPaths = Array.from(valve.querySelectorAll('.valve-envelope-spool > g > path, .valve-envelope-spool > g > g > path'));
    expect(detailPaths.length).toBeGreaterThan(4);
    for (const path of detailPaths) expect(widthOf(path)).toBe(1.5);
    cleanup();

    expect(widthOf(draw('cylinder-double').querySelector('.cylinder-barrel'))).toBe(2);
    cleanup();
    expect(widthOf(draw('cylinder-single').querySelector('.spring-coil'))).toBe(1.5);
    cleanup();

    for (const type of ['frl-detailed', 'regulator-nr', 'sequence-ext', 'pressure-relief']) {
      const dashed = Array.from(draw(type).querySelectorAll('path[stroke-dasharray]')).filter(path => path.getAttribute('stroke-dasharray') === '3,3');
      expect(dashed.length, type).toBeGreaterThan(0);
      for (const path of dashed) expect(widthOf(path), type).toBe(1);
      cleanup();
    }
  });

  it('scales all three weights together with the outline width', () => {
    const valve = draw('valve-5-2', { strokeWidth: 4 });
    expect(widthOf(valve.querySelector('.valve-envelope-spool > g > rect'))).toBe(4);
    expect(widthOf(valve.querySelector('.valve-envelope-spool > g > g > path'))).toBe(3);
  });

  it('every arrowhead in every part has the same length and width', () => {
    let seen = 0;
    for (const entry of FLUID_CATALOG) {
      const container = draw(entry.type, { props: { actuationLeft: 'Idle-Return Roller', actuationRight: 'Idle-Return Roller', cushioning: 'Adjustable - both', directions: 'Both directions' }, spoolOffset: 0 });
      for (const arrow of Array.from(container.querySelectorAll('polygon.arrowhead'))) {
        const [tip, a, b] = arrow.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        expect(Math.hypot(tip[0] - mid[0], tip[1] - mid[1]), entry.type).toBeCloseTo(8, 6);
        expect(Math.hypot(a[0] - b[0], a[1] - b[1]), entry.type).toBeCloseTo(7, 6);
        seen += 1;
      }
      cleanup();
    }
    expect(seen).toBeGreaterThan(40);
  });
});

describe('one-way flow-control containment', () => {
  it('everything inside the one-way block (throttle arcs, arrow, check valve) stays within its 120 × 60 box', () => {
    const container = draw('flow-control-oneway');
    const inner = Array.from(container.querySelectorAll('svg > g > g > *')).filter(el => !el.classList.contains('valve-square'));
    expect(inner.length).toBeGreaterThan(4);
    const branches = container.querySelectorAll('svg > g > g > g');
    expect(branches.length).toBeGreaterThanOrEqual(2);
    for (const branch of Array.from(branches)) {
      const transform = branch.getAttribute('transform');
      const box = bbox(branch);
      const dy = transform?.match(/translate\(0,(-?\d+)\)/)?.[1];
      const lo = box.y0 + (dy ? Number(dy) : 0);
      const hi = box.y1 + (dy ? Number(dy) : 0);
      expect(lo).toBeGreaterThanOrEqual(-30);
      expect(hi).toBeLessThanOrEqual(30);
    }
  });
});

describe('pressure-control valves', () => {
  const pressureValves = ['regulator-nr', 'regulator-relieving', 'sequence-ext', 'pressure-relief', 'hyd-pressure-relief'];

  it('are one 60 × 60 square with a 30 px opposing spring on the right', () => {
    for (const type of pressureValves) {
      const container = draw(type);
      const square = container.querySelector('.valve-square')!;
      expect([num(square.getAttribute('x')), num(square.getAttribute('y')), num(square.getAttribute('width')), num(square.getAttribute('height'))], type).toEqual([-30, -30, 60, 60]);
      const spring = bbox(container.querySelector('.spring-coil')!);
      expect([spring.x0, spring.x1], type).toEqual([30, 60]);
      expect(def(type).boundsFor({}), type).toEqual({ width: 60, height: 60 });
      cleanup();
    }
  });

  it('put port 1 at the bottom centre, port 2 at the top centre and the external pilot on the left side, on grid nodes', () => {
    const at = (type: string) => Object.fromEntries(def(type).ports.map(p => [p.id, [p.x, p.y]]));
    expect(at('regulator-nr')).toEqual({ p1: [0, 60], p2: [0, -60] });
    expect(at('regulator-relieving')).toEqual({ p1: [0, 60], p2: [0, -60], p3: [20, 60] });
    expect(at('sequence-ext')).toEqual({ p1: [0, 60], p2: [0, -60], z12: [-60, 0] });
    expect(at('pressure-relief')).toEqual({ p1: [0, 60] });
    expect(at('hyd-pressure-relief')).toEqual({ p1: [0, 60], t: [0, -60] });
    expect(at('sequence-combo')).toEqual({ p1: [0, 60], p2: [0, -60] });
  });

  it('draw the dashed sensing line with its bends on grid nodes (it enters the 30 px wall)', () => {
    for (const type of ['regulator-nr', 'regulator-relieving', 'pressure-relief', 'hyd-pressure-relief']) {
      const sensing = Array.from(draw(type).querySelectorAll('path[stroke-dasharray="3,3"]')).find(path => /^M 0 -?40 H -40 V 0 H -30$/.test(path.getAttribute('d') ?? ''));
      expect(sensing, type).toBeTruthy();
      const bends = (sensing!.getAttribute('d') ?? '').match(/-?\d+/g)!.map(Number).slice(0, -1);
      for (const value of bends) expect(isOnGrid(value), `${type} ${value}`).toBe(true);
      cleanup();
    }
  });

  it('the sequence + check block is built from 60 px squares and keeps its terminals on the grid', () => {
    const container = draw('sequence-combo');
    const square = container.querySelector('.valve-square')!;
    expect([square.getAttribute('width'), square.getAttribute('height')]).toEqual(['60', '60']);
    expect(container.querySelectorAll('circle.logic-element')).toHaveLength(1);
  });
});

describe('rotary actuators', () => {
  it('motors and pumps all use one 60 px circular housing', () => {
    for (const type of ['air-motor-fixed', 'hyd-motor', 'hyd-pump']) {
      const housing = draw(type).querySelector('svg > g > g > circle')!;
      expect(num(housing.getAttribute('r')) * 2, type).toBe(ROTARY_HOUSING_DIAMETER);
      expect(num(housing.getAttribute('r')) * 2).toBeGreaterThanOrEqual(50);
      expect(num(housing.getAttribute('r')) * 2).toBeLessThanOrEqual(60);
      expect(def(type).boundsFor({}).width, type).toBe(60);
      cleanup();
    }
  });
});

describe('library previews', () => {
  const colors = { background: '', canvas: '', panel: '', panelAlt: '', line: '', text: '#000', muted: '', subtle: '', primary: '', accent: '', danger: '', selection: '', grid: '', wire: '', powered: '', input: '', shadow: '' };
  const items = (medium: 'PNEUMATIC' | 'HYDRAULIC') => Object.values(FLUID_LIBRARY_CATEGORIES[medium]).flat();

  it('draw every part at its canvas size: one common scale, reduced only for parts bigger than the stage', () => {
    const scales: Record<string, number> = {};
    for (const medium of ['PNEUMATIC', 'HYDRAULIC'] as const) {
      for (const item of items(medium)) {
        const container = render(<FluidLibraryIcon item={item} colors={colors} medium={medium} />).container;
        scales[item.id] = num(container.querySelector('svg')!.getAttribute('data-preview-scale'));
        cleanup();
      }
    }
    for (const [type, scale] of Object.entries(scales)) expect(scale, type).toBeGreaterThan(0);
    // Small parts are enlarged, wide ones fitted: every symbol ends up filling the stage, not floating in it.
    expect(scales['pressure-gauge']).toBeGreaterThan(1.5);
    expect(scales['check-valve']).toBeGreaterThan(1);
    expect(Object.keys(scales).length).toBeGreaterThan(30);
  });

  it('centres the symbol on the common stage and fills 75-85 % of it', () => {
    const wide = previewLayout({ cx: -30, cy: 0, width: 200, height: 100 });
    expect(wide.scale).toBeCloseTo((PREVIEW_FILL * PREVIEW_STAGE.width) / 200, 6);
    expect(wide.translateX).toBeCloseTo(PREVIEW_STAGE.width / 2 + 30 * wide.scale, 6);
    expect(wide.translateY).toBeCloseTo(PREVIEW_STAGE.height / 2, 6);
    expect(PREVIEW_FILL).toBeGreaterThanOrEqual(0.75);
    expect(PREVIEW_FILL).toBeLessThanOrEqual(0.85);
    // tall parts are limited by the height, tiny ones by the enlargement cap
    expect(previewLayout({ cx: 0, cy: 0, width: 10, height: 400 }).scale).toBeCloseTo((PREVIEW_FILL * PREVIEW_STAGE.height) / 400, 6);
    expect(previewLayout({ cx: 0, cy: 0, width: 5, height: 5 }).scale).toBe(PREVIEW_MAX_SCALE);
  });

  it('valve tiles draw the bare envelope: no operators, pilot terminals or springs, and a larger scale for it', () => {
    for (const type of ['valve-5-3', 'valve-5-2', 'valve-3-2-nc', 'valve-4-2', 'hvalve-4-3']) {
      const props = previewProps(type);
      expect([props.actuationLeft, props.actuationRight], type).toEqual(['None', 'None']);
      const container = render(<FluidLibraryIcon item={{ id: type, name: type, description: '' }} colors={colors} medium="PNEUMATIC" />).container;
      expect(container.querySelector('.valve-end-cap'), type).toBeNull();
      expect(container.querySelectorAll('rect').length, type).toBeGreaterThanOrEqual(2);
      cleanup();
    }
    const scale = (type: string) => { const c = render(<FluidLibraryIcon item={{ id: type, name: type, description: '' }} colors={colors} medium="PNEUMATIC" />).container; const v = num(c.querySelector('svg')!.getAttribute('data-preview-scale')); cleanup(); return v; };
    expect(scale('valve-5-3')).toBeCloseTo((PREVIEW_FILL * PREVIEW_STAGE.height) / 120, 6);
  });

  it('every tile keeps its outline near 1.5 screen pixels whatever the scale', () => {
    const outline = (type: string) => {
      const container = render(<FluidLibraryIcon item={{ id: type, name: type, description: '' }} colors={colors} medium="PNEUMATIC" />).container;
      const width = num(container.querySelector('svg path, svg rect')!.getAttribute('stroke-width'));
      const scale = num(container.querySelector('svg')!.getAttribute('data-preview-scale'));
      cleanup();
      return width * (100 / PREVIEW_STAGE.width) * scale;
    };
    expect(outline('valve-5-2')).toBeCloseTo(1.5, 5);
    expect(outline('cylinder-double')).toBeCloseTo(1.5, 5);
  });
});

describe('actuator tags, latch, motor and limit-switch styling', () => {
  it('the operator tag rides the sliding strip, centred 12 px above its glyph and clear of every chamber', () => {
    const container = draw('valve-3-2-nc', { props: { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }, operatorTags: { left: '1S1' }, spoolOffset: 1 });
    const strip = container.querySelector('.valve-envelope-spool')!;
    const tag = strip.querySelector(':scope > .operator-tag')!;
    expect(tag.textContent).toBe('1S1');
    expect(num(tag.getAttribute('y'))).toBe(-(11 + 12)); // 12 px above the pushbutton's top edge
    expect(tag.getAttribute('text-anchor')).toBe('middle');
    expect(num(tag.getAttribute('x'))).toBeLessThan(-30); // outside the left edge of the envelopes, over the stem
    expect(container.querySelectorAll('.valve-end-cap text')).toHaveLength(0); // never inside the cap or the cells
  });

  it('the detent lever drops into its notch while latched', () => {
    const idle = draw('valve-3-2-nc', { props: { actuationLeft: 'Detent Lever', actuationRight: 'None' } });
    const latched = draw('valve-3-2-nc', { props: { actuationLeft: 'Detent Lever', actuationRight: 'None' }, operatorPressed: { left: true } });
    expect(idle.querySelector('.detent-arm')!.getAttribute('style')).toContain('translateY(0px)');
    expect(latched.querySelector('.detent-arm')!.getAttribute('style')).toContain('translateY(4px)');
    expect(latched.querySelector('.detent-lever')!.getAttribute('data-latched')).toBe('true');
  });

  it('the air motor triangle orbits the centre and stays inside the housing at every angle', () => {
    for (const type of ['air-motor-fixed']) {
      for (const angle of [0, 45, 90, 137, 180, 271, 359]) {
        const container = draw(type, { shaftAngle: angle, props: { directions: 'Both directions' } });
        for (const triangle of Array.from(container.querySelectorAll('.motor-triangle'))) {
          expect(triangle.getAttribute('transform')).toBe(`rotate(${angle})`);
          const points = triangle.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
          const reach = Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
          expect(reach).toBeLessThan(MOTOR.radius - 1);
        }
      }
    }
    expect(MOTOR_ORBIT_RADIUS).toBe(MOTOR.radius - MOTOR.triangleHeight - 2);
  });

  it('limit switches are deep grey at rest and industrial blue with a crimson pip when tripped, never green', () => {
    const idle = draw('cylinder-double', { sensorTags: ['1S2', '1S3'], sensorActive: [false, false] });
    const tripped = draw('cylinder-double', { sensorTags: ['1S2', '1S3'], sensorActive: [true, false] });
    const stroke = (container: HTMLElement, end: string) => container.querySelector(`.cylinder-sensor[data-end="${end}"] path`)!.getAttribute('stroke');
    expect(stroke(idle, 'retracted')).toBe('#6B7280');
    expect(stroke(tripped, 'retracted')).toBe('#2563EB');
    expect(stroke(tripped, 'extended')).toBe('#6B7280');
    expect(tripped.querySelector('.sensor-pip')!.getAttribute('fill')).toBe('#E11D48');
    expect(idle.querySelector('.sensor-pip')).toBeNull();
    expect(tripped.innerHTML.toLowerCase()).not.toMatch(/16a34a|22c55e|10b981/);
  });
});

describe('composite main service unit 0Z1', () => {
  const stages = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-stage]')).map(el => ({ type: el.getAttribute('data-stage'), x: Number(/translate\((-?[\d.]+),/.exec(el.getAttribute('transform')!)![1]) }));

  it('is the pressure source, the simple FRL and a 2/2 NC shut-off valve, left to right', () => {
    expect(def('service-unit').isoCode).toBe('0Z1');
    const container = draw('service-unit', { props: { shutoff: 'ON' }, operatorTags: { right: '0S1' } });
    const placed = stages(container);
    expect(placed.map(stage => stage.type)).toEqual(['pressure-source', 'frl-simplified', 'valve-2-2-nc']);
    expect(placed.map(stage => stage.x)).toEqual([...placed.map(stage => stage.x)].sort((a, b) => a - b));
    expect(container.querySelector('[data-stage="frl-simplified"] .frl-diamond, [data-stage="frl-simplified"] rect')).not.toBeNull();
  });

  it('the shut-off valve has a spring, the detented lever and the 0S1 tag above the lever', () => {
    const container = draw('service-unit', { props: { shutoff: 'ON' }, operatorTags: { right: '0S1' } });
    const valve = container.querySelector('[data-stage="valve-2-2-nc"]')!;
    expect(valve.querySelector('.valve-end-cap[data-side="left"] .spring-coil, .valve-end-cap[data-side="left"] path')).not.toBeNull();
    expect(valve.querySelector('.valve-end-cap[data-side="right"] .detent-lever')).not.toBeNull();
    expect(valve.querySelector('.detent-tooth')).not.toBeNull();
    const tag = container.querySelector('.operator-tag')!;
    expect(tag.textContent).toBe('0S1');
    expect(Number(tag.getAttribute('y'))).toBeLessThan(0); // above the lever, inside the valve's frame
  });

  it('is enclosed in a tight ISO dashed boundary (at most 6 px clear of the glyphs)', () => {
    const box = draw('service-unit', {}).querySelector('.iso-boundary')!;
    expect([box.getAttribute('stroke'), box.getAttribute('stroke-dasharray'), box.getAttribute('stroke-width'), box.getAttribute('fill')]).toEqual(['#94A3B8', '4 4', '1.5', 'none']);
    expect(SERVICE_UNIT.pad).toBeLessThanOrEqual(6);
    expect(Number(box.getAttribute('x'))).toBeCloseTo(-17.3 - SERVICE_UNIT.pad);
  });

  it('stacks the valve directly above the FRL, feeds port 1 from the FRL outlet and sends port 2 straight right', () => {
    const container = draw('service-unit', {});
    const at = (type: string) => /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(container.querySelector(`[data-stage="${type}"]`)!.getAttribute('transform')!)!.slice(1).map(Number);
    const [frlX, frlY] = at('frl-simplified');
    const [valveX, valveY] = at('valve-2-2-nc');
    const [sourceX, sourceY] = at('pressure-source');
    expect(valveX).toBe(frlX);
    expect(valveY).toBeLessThan(frlY);
    expect(sourceY).toBe(frlY);
    expect(sourceX).toBeLessThan(frlX);
    const manifold = Array.from(container.querySelectorAll('.manifold')).map(path => path.getAttribute('d')!);
    expect(manifold[0]).toBe(`M ${SERVICE_UNIT.frlX + SERVICE_UNIT.frlHalf} 0 H ${SERVICE_UNIT.frlOutX} V ${SERVICE_UNIT.port1Y} H ${valveX}`);
    expect(manifold[1]).toBe(`M ${valveX} ${SERVICE_UNIT.port2Y} H ${SERVICE_UNIT.outletX}`);
    expect(SERVICE_UNIT.frlX - SERVICE_UNIT.frlHalf - (SERVICE_UNIT.sourceX + SERVICE_UNIT.sourceStub)).toBeLessThanOrEqual(8);
  });

  it('shows the valve open and the lever latched when ON, and shut with the lever up when OFF', () => {
    const on = draw('service-unit', { props: { shutoff: 'ON' } });
    const off = draw('service-unit', { props: { shutoff: 'OFF' } });
    expect(on.querySelector('.detent-lever')!.getAttribute('data-latched')).toBe('true');
    expect(off.querySelector('.detent-lever')!.getAttribute('data-latched')).toBe('false');
    expect(on.querySelector('.valve-envelope-spool')!.getAttribute('data-offset')).toBe('1');
    expect(off.querySelector('.valve-envelope-spool')!.getAttribute('data-offset')).toBe('0');
  });

  it('has one port, the supply bus (port 2) on the right, on the grid and joined to the valve outlet', () => {
    const ports = def('service-unit').portsFor({});
    expect(ports.map(p => [p.id, p.isoNumber, p.x, p.y])).toEqual([['out', '2', SERVICE_UNIT.outletX + SERVICE_UNIT.shiftX, SERVICE_UNIT.port2Y + SERVICE_UNIT.shiftY]]);
    expect(isOnGrid(ports[0].x) && isOnGrid(ports[0].y)).toBe(true);
    const container = draw('service-unit', {});
    expect(container.querySelector('[data-stage="valve-2-2-nc"]')).not.toBeNull();
    const { width, centerX } = def('service-unit').boundsFor({});
    expect(ports[0].x).toBeLessThanOrEqual((centerX ?? 0) + width / 2);
  });
});
