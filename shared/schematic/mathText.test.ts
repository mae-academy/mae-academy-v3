import { describe, expect, it } from 'vitest';
import { escapeXml, renderSchematicSvg } from './render';
import { validateSchematic } from './validate';
import { autoMathSource, mathMetrics, mathTspans, parseMath } from './mathText';

const svg = (src: string): string => mathTspans(src, 16, escapeXml);

describe('math label converter', () => {
  it('renders variables italic with a subscript that returns to the baseline', () => {
    expect(parseMath('V_A')).toEqual([{ text: 'V', italic: true, level: 0 }, { text: 'A', italic: true, level: 1 }]);
    expect(svg('V_A')).toBe('<tspan font-style="italic">V</tspan><tspan dy="4" font-size="12" font-style="italic">A</tspan>');
    expect(svg('V_A\\,\\angle 0°')).toBe('<tspan font-style="italic">V</tspan><tspan dy="4" font-size="12" font-style="italic">A</tspan><tspan dy="-4">\u2009∠0°</tspan>');
    // after returning to the baseline (any following text) the net vertical shift is zero, so nothing drifts
    for (const s of ['V_{\\text{out}}', 'x^2_i', 'R_{L1}', 'a_{b_c}', 'V_A^2']) {
      const dys = Array.from(svg(`${s}z`).matchAll(/dy="(-?\d+)"/g)).map((m) => Number(m[1]));
      expect(dys.reduce((a, b) => a + b, 0), s).toBe(0);
    }
  });
  it('keeps \\text and \\mathrm upright, digits and units upright, with Greek letters as Unicode', () => {
    expect(parseMath('V_{\\text{out}}')).toEqual([{ text: 'V', italic: true, level: 0 }, { text: 'out', italic: false, level: 1 }]);
    expect(parseMath('\\mathrm{kHz}')).toEqual([{ text: 'kHz', italic: false, level: 0 }]);
    expect(parseMath('\\omega_0 = 2\\pi f')).toEqual([
      { text: 'ω', italic: true, level: 0 }, { text: '0', italic: false, level: 1 }, { text: '=2', italic: false, level: 0 }, { text: 'πf', italic: true, level: 0 },
    ]);
    expect(parseMath('\\Omega')[0]).toEqual({ text: 'Ω', italic: false, level: 0 });
    expect(parseMath('\\mu F').map((r) => r.text).join('')).toBe('μF');
  });
  it('supports superscripts, grouping, thin spaces, minus and degrees', () => {
    expect(parseMath('x^{2}')).toEqual([{ text: 'x', italic: true, level: 0 }, { text: '2', italic: false, level: -1 }]);
    expect(svg('x^2')).toContain('dy="-6"');
    expect(parseMath('a\\,b').map((r) => r.text).join('')).toBe('a\u2009b');
    expect(parseMath('-120°').map((r) => r.text).join('')).toBe('−120°');
    expect(parseMath('${V_s}$').map((r) => r.text).join('')).toBe('Vs');
  });
  it('turns plain designators into math automatically', () => {
    expect(autoMathSource('R1')).toBe('R_{1}');
    expect(autoMathSource('C12')).toBe('C_{12}');
    expect(autoMathSource('Vout')).toBe('V_{\\text{out}}');
    expect(autoMathSource('Vin')).toBe('V_{\\text{in}}');
    expect(autoMathSource('V_A')).toBe('V_A');
    expect(autoMathSource('r(t)')).toBe('r(t)');
    expect(autoMathSource('SW')).toBe('\\text{SW}');
    expect(autoMathSource('+')).toBe('\\mathbf{+}');
    expect(svg(autoMathSource('R1'))).toBe('<tspan font-style="italic">R</tspan><tspan dy="4" font-size="12">1</tspan>');
  });
  it('escapes hostile text and never throws on garbage', () => {
    const out = svg('\\text{<script>alert(1)</script>} & "x"');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
    for (const g of ['', '{', '}}}', '\\', '\\frac{1}{2', '_', '^^^', 'a_'.repeat(300), '{'.repeat(100), '\\unknowncmd', '\u0000x']) {
      expect(() => svg(g)).not.toThrow();
    }
    expect(parseMath('a'.repeat(500)).length).toBeLessThanOrEqual(80);
  });
  it('estimates width and flags scripts', () => {
    const plain = mathMetrics('R', 16), sub = mathMetrics('R_L', 16);
    expect(sub.width).toBeGreaterThan(plain.width);
    expect(sub.hasSub).toBe(true);
    expect(plain.hasSub).toBe(false);
    expect(mathMetrics('x^2', 16).hasSup).toBe(true);
  });
  it('is deterministic', () => {
    expect(svg('V_{\\text{out}}\\,\\angle -120°')).toBe(svg('V_{\\text{out}}\\,\\angle -120°'));
  });
});

describe('labels in the drawing', () => {
  const base = { title: 't', parts: [{ id: 'R1', type: 'resistor', value: '1k', at: [4, 4] }, { id: 'VA', type: 'vsource_ac', value: '230 V', at: [4, 10], attrs: { label: 'V_A\\,(0°)' } }], wires: [], labels: [] };
  it('draws designators as math and honours attrs.label', () => {
    const out = renderSchematicSvg(base).svg;
    expect(out).toContain('<tspan font-style="italic">R</tspan><tspan dy="4" font-size="12">1</tspan>');
    expect(out).toContain('<tspan font-style="italic">V</tspan><tspan dy="4" font-size="12" font-style="italic">A</tspan>');
    expect(out).not.toContain('>VA<');
  });
  it('rejects malformed ic pins with precise errors and accepts good ones', () => {
    const ic = (attrs: unknown) => validateSchematic({ parts: [{ id: 'U1', type: 'ic', at: [2, 2], attrs }], wires: [], labels: [] });
    expect(ic({ w: 8, h: 8, pins: [{ name: 'A', side: 'X', pos: 1 }] }).errors[0].message).toContain('side');
    expect(ic({ w: 8, h: 8, pins: [{ name: 'A', side: 'L', pos: 9 }] }).errors[0].message).toContain('pos 9');
    expect(ic({ w: 8, h: 8, pins: [{ name: 'A', side: 'L', pos: 2 }, { name: 'A', side: 'R', pos: 2 }] }).errors[0].message).toContain('used twice');
    expect(ic({ w: 8, h: 8, pins: [{ name: '<b>', side: 'L', pos: 2 }] }).errors[0].message).toContain('name');
    expect(ic({ w: 8, h: 8, pins: [{ name: 'A', side: 'L', pos: 2, optional: true }] }).errors.map((e) => e.code)).not.toContain('ATTR_VALUE');
  });
});
