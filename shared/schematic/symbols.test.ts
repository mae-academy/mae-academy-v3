import { describe, expect, it } from 'vitest';
import { placePart } from './geometry';
import { SYMBOL_LIST, getSymbol, type SymPrim } from './symbols';
import { PART_TYPES, type PartSpec, type Rot } from './types';
import { formatValue, parseValue } from './values';

const part = (type: PartSpec['type'], at: [number, number], rot: Rot = 0, flip = false, attrs: PartSpec['attrs'] = {}): PartSpec => ({ id: 'X1', type, at, rot, flip, label: 'auto', attrs, value: 'v' });
const terms = (p: PartSpec): Record<string, [number, number]> => Object.fromEntries(placePart(p, 'IEC', 20)!.terminals.map((t) => [t.name, [t.x, t.y]]));

describe('terminal offsets', () => {
  const rots: Rot[] = [0, 90, 180, 270];
  const cases: [PartSpec['type'], [number, number], boolean, Record<string, [number, number]>[]][] = [
    ['resistor', [10, 5], false, [{ 1: [10, 5], 2: [14, 5] }, { 1: [10, 5], 2: [10, 9] }, { 1: [10, 5], 2: [6, 5] }, { 1: [10, 5], 2: [10, 1] }]],
    ['resistor', [10, 5], true, [{ 1: [10, 5], 2: [14, 5] }, { 1: [10, 5], 2: [10, 9] }, { 1: [10, 5], 2: [6, 5] }, { 1: [10, 5], 2: [10, 1] }]],
    ['npn', [0, 0], false, [
      { B: [0, 0], C: [2, -2], E: [2, 2] }, { B: [0, 0], C: [2, 2], E: [-2, 2] }, { B: [0, 0], C: [-2, 2], E: [-2, -2] }, { B: [0, 0], C: [-2, -2], E: [2, -2] }]],
    ['npn', [0, 0], true, [
      { B: [0, 0], C: [2, 2], E: [2, -2] }, { B: [0, 0], C: [-2, 2], E: [2, 2] }, { B: [0, 0], C: [-2, -2], E: [-2, 2] }, { B: [0, 0], C: [2, -2], E: [-2, -2] }]],
    ['opamp', [3, 3], false, [
      { 'IN-': [3, 3], 'IN+': [3, 5], OUT: [9, 4] }, { 'IN-': [3, 3], 'IN+': [1, 3], OUT: [2, 9] }, { 'IN-': [3, 3], 'IN+': [3, 1], OUT: [-3, 2] }, { 'IN-': [3, 3], 'IN+': [5, 3], OUT: [4, -3] }]],
  ];
  for (const [type, at, flip, expected] of cases) {
    rots.forEach((rot, i) => {
      it(`${type} rot ${rot}${flip ? ' flipped' : ''}`, () => {
        expect(terms(part(type, at, rot, flip))).toEqual(expected[i]);
      });
    });
  }
  it('resistor at [10,5] rot 0 has terminals [10,5] and [14,5]', () => {
    expect(terms(part('resistor', [10, 5]))).toEqual({ 1: [10, 5], 2: [14, 5] });
  });
});

describe('symbol library invariants', () => {
  it('covers every whitelisted type exactly once', () => {
    expect(SYMBOL_LIST.map((s) => s.type).sort()).toEqual([...PART_TYPES].sort());
  });
  const attrsFor = (t: string): PartSpec['attrs'] => (t === 'block' ? { w: 4, h: 2 } : t === 'sum' ? { signs: { W: '+', S: '−' } } : t === 'nmos' || t === 'pmos' ? { body_diode: true } : t === 'opamp' ? { supply: true } : {});
  for (const s of SYMBOL_LIST) {
    it(`${s.type}: terminals on integer grid points inside the footprint, in all 8 orientations`, () => {
      for (const rot of [0, 90, 180, 270] as Rot[]) for (const flip of [false, true]) {
        const pl = placePart(part(s.type, [7, -3], rot, flip, attrsFor(s.type)), 'IEC', 20)!;
        const seen = new Set<string>();
        for (const t of pl.terminals) {
          expect(Number.isInteger(t.x) && Number.isInteger(t.y)).toBe(true);
          expect(t.x).toBeGreaterThanOrEqual(pl.box[0] - 1e-9);
          expect(t.x).toBeLessThanOrEqual(pl.box[2] + 1e-9);
          expect(t.y).toBeGreaterThanOrEqual(pl.box[1] - 1e-9);
          expect(t.y).toBeLessThanOrEqual(pl.box[3] + 1e-9);
          const k = `${t.x},${t.y}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
    });
    it(`${s.type}: body stays within the footprint (+0.3 grid)`, () => {
      const pl = placePart(part(s.type, [0, 0], 0, false, attrsFor(s.type)), 'IEC', 20)!;
      const [x0, y0, x1, y1] = pl.box.map((v) => v * 20);
      const m = 6;
      const chk = (x: number, y: number): void => {
        expect(x).toBeGreaterThanOrEqual(x0 - m);
        expect(x).toBeLessThanOrEqual(x1 + m);
        expect(y).toBeGreaterThanOrEqual(y0 - m);
        expect(y).toBeLessThanOrEqual(y1 + m);
      };
      for (const p of pl.prims as SymPrim[]) {
        if (p.k === 'line') { chk(p.x1, p.y1); chk(p.x2, p.y2); }
        else if (p.k === 'poly') p.pts.forEach(([x, y]) => chk(x, y));
        else if (p.k === 'rect') { chk(p.x, p.y); chk(p.x + p.w, p.y + p.h); }
        else if (p.k === 'circle') { chk(p.cx - p.r, p.cy - p.r); chk(p.cx + p.r, p.cy + p.r); }
        else if (p.k === 'path') p.d.forEach((sg) => { if (sg[0] !== 'Z') chk(sg[sg.length - 2] as number, sg[sg.length - 1] as number); });
      }
    });
  }
  it('IEEE resistor is a zigzag polyline, IEC a rectangle', () => {
    const iec = placePart(part('resistor', [0, 0]), 'IEC', 20)!;
    const ieee = placePart(part('resistor', [0, 0]), 'IEEE', 20)!;
    expect(iec.prims.some((p) => p.k === 'rect')).toBe(true);
    expect(ieee.prims.some((p) => p.k === 'rect')).toBe(false);
    expect(ieee.prims.some((p) => p.k === 'poly' && p.pts.length > 6)).toBe(true);
  });
  it('npn arrow points out of the emitter, pnp into the base', () => {
    const arrow = (type: 'npn' | 'pnp') => placePart(part(type, [0, 0]), 'IEC', 20)!.prims.find((p) => p.k === 'poly' && p.closed && p.fill === 'black') as Extract<SymPrim, { k: 'poly' }>;
    const n = arrow('npn').pts[0], p = arrow('pnp').pts[0];
    expect(n[0]).toBeGreaterThan(20); // tip away from the base bar (x=20)
    expect(p[0]).toBeLessThan(30); // tip next to the base bar
    expect(n[1]).toBeGreaterThan(0);
  });
  it('getSymbol rejects unknown names', () => {
    expect(getSymbol('__proto__')).toBeUndefined();
    expect(getSymbol('constructor')).toBeUndefined();
  });
});

describe('value parser', () => {
  const table: [string, number | null, string | null][] = [
    ['10 kΩ', 1e4, 'Ω'], ['10k', 1e4, null], ['47uF', 47e-6, 'F'], ['47 µF', 47e-6, 'F'], ['47 μF', 47e-6, 'F'],
    ['50 uH', 50e-6, 'H'], ['12 V', 12, 'V'], ['2.5 Ω', 2.5, 'Ω'], ['1 MHz', 1e6, 'Hz'], ['100 nF', 1e-7, 'F'],
    ['4.7 pF', 4.7e-12, 'F'], ['5 mA', 5e-3, 'A'], ['1 Mohm', 1e6, 'Ω'], ['10 ohm', 10, 'Ω'], ['+12 V', 12, 'V'],
    ['−12 V', -12, 'V'], ['1e3', 1000, null], ['2 GHz', 2e9, 'Hz'], ['100', 100, null], ['3 mH', 3e-3, 'H'],
    ['abc', null, null], ['10 mm', null, null], ['', null, null], ['1..2', null, null],
  ];
  for (const [text, si, unit] of table) {
    it(`parses ${JSON.stringify(text)}`, () => {
      const r = parseValue(text);
      if (si === null) { expect(r).toBeNull(); return; }
      expect(r).not.toBeNull();
      expect(r!.si).toBeCloseTo(si, 12);
      expect(r!.unit).toBe(unit);
    });
  }
  it('normalises u to the micro sign and adds the default unit for display', () => {
    expect(formatValue('47uF', 'F')).toBe('47 µF');
    expect(formatValue('10k', 'ohm')).toBe('10 kΩ');
    expect(formatValue('10 ohm', 'ohm')).toBe('10 Ω');
    expect(formatValue('weird', 'ohm')).toBe('weird');
  });
});
