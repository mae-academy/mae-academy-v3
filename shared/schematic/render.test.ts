// @vitest-environment jsdom
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUCK_CONVERTER, PID_LOOP, REFERENCE_SPECS, VOLTAGE_DIVIDER } from './fixtures';
import { parseSchematicSpec } from './parse';
import { escapeXml, renderSchematicSvg } from './render';

const ELEMENTS = new Set(['svg', 'g', 'defs', 'line', 'polyline', 'polygon', 'path', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'title', 'desc']);
const ATTRS = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'id', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'points', 'd',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'shape-rendering',
  'font-family', 'font-size', 'font-weight', 'text-anchor',
]);

function audit(svg: string): void {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  expect(doc.documentElement.tagName).toBe('svg');
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    expect(ELEMENTS.has(el.tagName), `element <${el.tagName}>`).toBe(true);
    for (const at of Array.from(el.attributes)) expect(ATTRS.has(at.name), `attribute ${at.name} on <${el.tagName}>`).toBe(true);
  }
}

describe('SVG output', () => {
  it('has the documented structure, white background and integer coordinates', () => {
    const r = renderSchematicSvg(BUCK_CONVERTER);
    expect(r.svg.startsWith('<!-- Standard: IEC 60617 | Pitch P = 20 px | Signal stroke 2 px | Power stroke 3 px -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(r.svg).toContain('fill="#fff"/>');
    for (const id of ['wires', 'parts', 'junctions', 'labels']) expect(r.svg).toContain(`<g id="${id}"`);
    expect(r.svg).toContain('shape-rendering="crispEdges"');
    expect(r.svg).toContain('font-family="Helvetica, Arial, sans-serif"');
    const m = /viewBox="0 0 (\d+) (\d+)" width="(\d+)" height="(\d+)"/.exec(r.svg)!;
    expect([Number(m[3]), Number(m[4])]).toEqual([r.width, r.height]);
    // every numeric attribute is an integer
    const nums = Array.from(r.svg.matchAll(/ (?:x|y|x1|y1|x2|y2|cx|cy|r|width|height)="([^"]*)"/g)).map((x) => x[1]);
    expect(nums.length).toBeGreaterThan(50);
    for (const n of nums) expect(n).toMatch(/^-?\d+$/);
    audit(r.svg);
  });
  it('uses the IEEE header and the junction radius 3 at pitch 20', () => {
    const r = renderSchematicSvg({ ...VOLTAGE_DIVIDER, standard: 'IEEE' });
    expect(r.svg).toContain('<!-- Standard: IEEE 315 |');
    expect(r.svg).toMatch(/<g id="junctions"[^>]*>\n<circle [^>]* r="3"\/>/);
  });
  it('power wires use a 3 px stroke and arrows draw a polygon', () => {
    const r = renderSchematicSvg({ parts: [], wires: [{ pts: [[0, 0], [4, 0]], power: true, arrow: true }] });
    expect(r.svg).toContain('stroke-width="3"');
    expect(r.svg).toContain('<polygon');
  });
  it('is deterministic: identical specs give byte-identical SVG', () => {
    for (const s of Object.values(REFERENCE_SPECS)) {
      const a = renderSchematicSvg(s).svg;
      expect(renderSchematicSvg(JSON.parse(JSON.stringify(s))).svg).toBe(a);
      expect(renderSchematicSvg(parseSchematicSpec(JSON.stringify(s)).spec).svg).toBe(a);
    }
  });
  it('all reference schematics pass the element/attribute whitelist', () => {
    for (const s of Object.values(REFERENCE_SPECS)) audit(renderSchematicSvg(s).svg);
  });
  it('is safe on anything', () => {
    for (const bad of [null, undefined, 3, 'x', [], { parts: [{ type: 'nope' }] }]) {
      const r = renderSchematicSvg(bad);
      audit(r.svg);
    }
  });
});

describe('hostile specs', () => {
  const evil = '"><svg onload=alert(1)></svg><script>alert(2)</script>&amp;';
  const hostile = {
    title: '</title><script>alert(1)</script>',
    parts: [
      { id: 'R1', type: 'resistor', value: evil.slice(0, 80), at: [4, 4] },
      { id: 'U1', type: 'block', value: '<img src=x onerror=alert(1)>', at: [12, 4], attrs: { w: 6, h: 2 } },
      { id: 'P1', type: 'port', value: '<b>Vin</b>', at: [4, 10] },
      { id: 'S1', type: 'switch', at: [10, 10], attrs: { control: '"><script>' } },
    ],
    wires: [{ pts: [[0, 0], [4, 0]] }],
    labels: [{ text: '<script>alert(3)</script>', at: [2, 2], anchor: 'start' }, { text: "' onload='x", at: [3, 3], anchor: 'middle' }],
    domains: [{ name: '"><script>', rect: [0, 0, 30, 20] }],
  };
  it('produces only whitelisted markup with every string escaped', () => {
    const r = renderSchematicSvg(hostile);
    audit(r.svg);
    expect(r.svg).not.toContain('<script');
    expect(r.svg).not.toContain('<img');
    expect(r.svg).not.toContain('<b>');
    const doc0 = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
    for (const el of Array.from(doc0.getElementsByTagName('*'))) for (const at of Array.from(el.attributes)) expect(at.name.startsWith('on')).toBe(false);
    const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
    const texts = Array.from(doc.getElementsByTagName('text')).map((t) => t.textContent);
    expect(texts).toContain('<script>alert(3)</script>');
    expect(doc.getElementsByTagName('title')[0].textContent).toBe('</title><script>alert(1)</script>');
  });
  it('rejects hostile ids and unknown types before rendering', () => {
    const r = parseSchematicSpec(JSON.stringify({ parts: [{ id: '<script>', type: 'resistor', value: '1k', at: [0, 0] }, { id: 'X"onload="1', type: 'resistor', value: '1k', at: [5, 0] }] }));
    expect(r.spec).toBeNull();
    expect(r.errors.map((e) => e.code)).toContain('G1_ID_FORMAT');
    const t = parseSchematicSpec(JSON.stringify({ parts: [{ id: 'A1', type: '"><svg onload=1>', at: [0, 0] }] }));
    expect(t.errors[0].code).toBe('TYPE_UNKNOWN');
    expect(t.errors[0].message.length).toBeLessThan(600); // echoed type name is truncated
  });
  it('escapes all XML metacharacters and strips control characters', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(escapeXml('a\u0001b\u0007c')).toBe('abc');
  });
});

describe('golden SVGs', () => {
  const dir = `${__dirname}/__golden__/`;
  const cases: [string, unknown][] = [['voltage_divider', VOLTAGE_DIVIDER], ['buck_converter', BUCK_CONVERTER], ['pid_loop', PID_LOOP]];
  for (const [name, s] of cases) {
    it(`${name} matches the locked golden file`, () => {
      const svg = renderSchematicSvg(s).svg;
      const file = `${dir}${name}.svg`;
      if (process.env.UPDATE_GOLDEN === '1') fs.writeFileSync(file, svg);
      expect(fs.readFileSync(file, 'utf8')).toBe(svg);
    });
  }
});
