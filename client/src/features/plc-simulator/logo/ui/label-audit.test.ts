// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { auditPortLabels } from './label-audit';

/** jsdom has no layout: stub the two measurements the audit reads. */
function fixture(labelCenter: readonly [number, number], target = '100,100') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 10 }) }); // 2 px per unit, offset 10
  const fo = document.createElementNS(NS, 'foreignObject');
  fo.setAttribute('data-port', 'I5');
  fo.setAttribute('data-label-id', 'I5');
  fo.setAttribute('data-target', target);
  const glyphs = document.createElement('span');
  glyphs.className = 'katex-html';
  const [cx, cy] = labelCenter;
  glyphs.getBoundingClientRect = () => ({ left: cx - 5, right: cx + 5, top: cy - 5, bottom: cy + 5, width: 10, height: 10, x: cx - 5, y: cy - 5, toJSON: () => ({}) });
  fo.appendChild(glyphs);
  svg.appendChild(fo);
  return svg;
}

/** Add a terminal anchor and its matching label to an SVG for the pairing audit. */
function fixtureWithAnchor(
  anchorBox: { left: number; right: number; top: number; bottom: number },
  labelBox: { left: number; right: number; top: number; bottom: number },
  id = 'I3',
) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) });

  const anchor = document.createElementNS(NS, 'g');
  anchor.setAttribute('data-terminal-id', id);
  anchor.getBoundingClientRect = () => ({ ...anchorBox, width: anchorBox.right - anchorBox.left, height: anchorBox.bottom - anchorBox.top, x: anchorBox.left, y: anchorBox.top, toJSON: () => ({}) });
  svg.appendChild(anchor);

  const label = document.createElementNS(NS, 'foreignObject');
  label.setAttribute('data-label-id', id);
  label.getBoundingClientRect = () => ({ ...labelBox, width: labelBox.right - labelBox.left, height: labelBox.bottom - labelBox.top, x: labelBox.left, y: labelBox.top, toJSON: () => ({}) });
  svg.appendChild(label);

  return svg;
}

describe('KaTeX label audit', () => {
  it('accepts a label next to its terminal (terminal at screen 210,210)', () => {
    expect(auditPortLabels(fixture([210, 240]))).toEqual([]);
  });

  it('reports a label that drifted away from its terminal, in user units', () => {
    const bad = auditPortLabels(fixture([210 + 400, 210]));
    expect(bad).toHaveLength(1);
    expect(bad[0]?.port).toBe('I5');
    expect(bad[0]?.distance).toBeCloseTo(197.5, 0); // (610 - 5 - 210) / 2 px per unit
  });

  it('does nothing without a layout engine', () => {
    const svg = fixture([0, 0]);
    Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => null });
    expect(auditPortLabels(svg)).toEqual([]);
  });

  it('silently skips a terminal that has no matching label (e.g. screw sub-terminals)', () => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) });
    const anchor = document.createElementNS(NS, 'g');
    anchor.setAttribute('data-terminal-id', 'Q1.2');
    anchor.getBoundingClientRect = () => ({ left: 100, right: 120, top: 100, bottom: 120, width: 20, height: 20, x: 100, y: 100, toJSON: () => ({}) });
    svg.appendChild(anchor);

    expect(auditPortLabels(svg)).toEqual([]);
  });

  it('accepts an anchor-label pair that is close', () => {
    const svg = fixtureWithAnchor(
      { left: 100, right: 120, top: 100, bottom: 120 },
      { left: 100, right: 130, top: 125, bottom: 140 },
    );
    expect(auditPortLabels(svg)).toEqual([]);
  });

  it('reports an anchor-label pair that drifted apart', () => {
    const svg = fixtureWithAnchor(
      { left: 100, right: 120, top: 100, bottom: 120 },
      { left: 500, right: 530, top: 100, bottom: 120 },
    );
    const bad = auditPortLabels(svg);
    expect(bad).toHaveLength(1);
    expect(bad[0]?.port).toBe('I3');
    expect(bad[0]?.distance).toBeGreaterThan(40);
  });
});

describe('KaTeX label audit on a LabelCanvas (SVG + HTML overlay)', () => {
  function canvas(labelCenter: readonly [number, number]) {
    const NS = 'http://www.w3.org/2000/svg';
    const root = document.createElement('div');
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 10 }) });
    root.appendChild(svg);
    const overlay = document.createElement('div');
    const label = document.createElement('div');
    label.setAttribute('data-port', 'Q4');
    label.setAttribute('data-target', '100,100');
    const glyphs = document.createElement('span');
    glyphs.className = 'katex-html';
    const [cx, cy] = labelCenter;
    glyphs.getBoundingClientRect = () => ({ left: cx - 5, right: cx + 5, top: cy - 5, bottom: cy + 5, width: 10, height: 10, x: cx - 5, y: cy - 5, toJSON: () => ({}) });
    label.appendChild(glyphs);
    overlay.appendChild(label);
    root.appendChild(overlay);
    return root;
  }

  it('finds overlay labels outside the svg and measures them against the svg transform', () => {
    expect(auditPortLabels(canvas([210, 225]))).toEqual([]);
    const bad = auditPortLabels(canvas([210 + 300, 210]));
    expect(bad.map((v) => v.port)).toEqual(['Q4']);
  });
});
