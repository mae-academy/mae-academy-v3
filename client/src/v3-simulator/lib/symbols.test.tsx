import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderSymbol } from './symbols';

function markup(symbolId: string, props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(<svg>{renderSymbol(symbolId, false, props, 0)}</svg>);
}

describe('Tab D SVG symbol language', () => {
  it('renders the DC rail as a positive-only reference source with one visual terminal', () => {
    const rail = markup('dc-rail', { _documentedStyle: true });
    expect(rail).toContain('data-documented-dc-rail="positive-reference"');
    expect(rail).toContain('x1="0" y1="-25" x2="0" y2="0"');
    expect(rail).toContain('x1="-30" y1="0" x2="30" y2="0"');
    expect(rail).not.toContain('x1="-40" y1="0" x2="40" y2="0"');
    expect(rail).not.toContain('#eff6ff');
  });

  it('renders VABC with each phase lead beginning at the true PHASE-circle boundary and an opposing neutral', () => {
    const source = markup('three-phase-source', { _documentedStyle: true });
    expect(source).toContain('PHASE');
    expect((source.match(/data-phase-lead="circle"/g) ?? [])).toHaveLength(2);
    expect((source.match(/data-phase-lead="axis"/g) ?? [])).toHaveLength(1);
    expect(source).toContain('x1="22" y1="0" x2="40" y2="0"');
    expect(source).toContain('x1="-22" y1="0" x2="-40" y2="0"');
  });

  it('uses red, yellow, blue, and neutral rails for the three-phase power rail', () => {
    const rail = markup('three-phase-rail', { _documentedStyle: true });
    expect(rail).toContain('#d14343');
    expect(rail).toContain('#d6a720');
    expect(rail).toContain('#2d73b7');
  });

  it('centers the documented IAC sine wave inside its source circle without changing the legacy branch', () => {
    const documented = markup('ac-current', { _documentedStyle: true });
    const legacy = markup('ac-current');
    expect(documented).toContain('x1="0" y1="-2" x2="0" y2="-13"');
    expect(documented).toContain('M -11,0 C -7,-7 -3,-7 0,0 C 3,7 7,7 11,0');
    expect(legacy).toContain('M -10,-4 Q -5,-14 0,-4 Q 5,6 10,-4');
  });

  it('uses a centered IEEE variable-resistor body and a centered vertical wiper terminal', () => {
    const minimum = markup('potentiometer', { _documentedStyle: true, wiper: 0 });
    expect(minimum).toContain('data-rigid-body="potentiometer"');
    expect(minimum).toContain('x="-20" y="-7" width="40" height="14"');
    expect(minimum).toContain('x1="0" y1="-33.333333333333336" x2="0" y2="-7"');
    expect(minimum).toContain('points="0,-7 -4,-15 4,-15"');
  });

  it('composes documented Star and Delta packs from equal compact resistor arms without overlap or extra Star return paths', () => {
    const resistor = markup('resistor', { _documentedStyle: true });
    const star = markup('star-resistor-pack', { _documentedStyle: true });
    const delta = markup('delta-resistor-pack', { _documentedStyle: true });
    expect(resistor).toContain('data-rectangular-resistor="potentiometer-style"');
    expect(resistor).toContain('x="-20" y="-7" width="40" height="14"');
    expect(resistor).toContain('x1="-33.333333333333336" y1="0" x2="-20" y2="0"');
    expect(star).toContain('data-resistor-network="star"');
    expect((star.match(/data-rectangular-resistor="potentiometer-style"/g) ?? [])).toHaveLength(3);
    expect((star.match(/width="12" height="4\.2"/g) ?? [])).toHaveLength(3);
    expect(star).toContain('rotate(0) translate(16.666666666666668,0)');
    expect(star).toContain('rotate(120) translate(16.666666666666668,0)');
    expect(star).toContain('rotate(240) translate(16.666666666666668,0)');
    expect(star).not.toContain('45.534');
    expect(delta).toContain('data-resistor-network="delta"');
    expect((delta.match(/data-rectangular-resistor="potentiometer-style"/g) ?? [])).toHaveLength(3);
    expect((delta.match(/width="12" height="4\.2"/g) ?? [])).toHaveLength(3);
    expect(delta).toContain('translate(0,9.6225) rotate(0)');
    expect(delta).toContain('translate(8.3333,-4.81125) rotate(60)');
    expect(delta).toContain('translate(-8.3333,-4.81125) rotate(120)');
  });

  it('uses an IEEE-style documented op-amp with leads that end at the triangle boundary and leaves the legacy branch unchanged', () => {
    const documented = markup('opamp', { _documentedStyle: true });
    const legacy = markup('opamp');
    expect(documented).toContain('data-documented-opamp="ieee-boundary-aligned"');
    expect(documented).toContain('points="-22,-22 -22,22 26,0"');
    expect(documented).toContain('x1="-33.333333333333336" y1="-16.666666666666668" x2="-22" y2="-16.666666666666668"');
    expect(documented).toContain('x1="26" y1="0" x2="33.333333333333336" y2="0"');
    expect(documented).toContain('x="-25" y="-16.666666666666668" text-anchor="end" dominant-baseline="middle"');
    expect(documented).toContain('x="-25" y="16.666666666666668" text-anchor="end" dominant-baseline="middle"');
    expect(legacy).toContain('points="-30,-30 -30,30 30,0"');
  });

  it('uses direct collector/emitter leads and distinct regular arrowheads for documented NPN and PNP symbols', () => {
    const npn = markup('bjt-npn', { _documentedStyle: true });
    const pnp = markup('bjt-pnp', { _documentedStyle: true });
    expect(npn).toContain('x1="-6" y1="-10" x2="20" y2="-30"');
    expect(npn).toContain('x1="-6" y1="10" x2="20" y2="30"');
    expect(npn).toContain('data-emitter-arrow="npn"');
    expect(pnp).toContain('data-emitter-arrow="pnp"');
    expect(npn).toContain('translate(12 23.846) rotate(37.5686)');
    expect(pnp).toContain('points="-10,0 0,-4 0,4"');
    expect(npn).not.toBe(pnp);
  });

  it('uses repeated semicircular coil paths in documented transformers, relays, and contactors while retaining their contact geometry', () => {
    const transformer = markup('transformer', { _documentedStyle: true });
    const transformerCt = markup('transformer-ct', { _documentedStyle: true });
    const relay = markup('relay-spdt', { _documentedStyle: true });
    const contactor = markup('contactor', { _documentedStyle: true });
    expect((transformer.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(transformer).toContain('x1="-35" y1="-20" x2="-24" y2="-20"');
    expect(transformer).toContain('x1="24" y1="20" x2="35" y2="20"');
    expect(transformerCt).toContain('x1="24" y1="0" x2="35" y2="0"');
    expect((relay.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(relay).toContain('cx="-8" cy="20"');
    expect((contactor.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(contactor).toContain('x1="-40" y1="0"');
  });

  it('uses an explicit manual relay state to display a latched contact position', () => {
    const open = markup('relay-spst', { _documentedStyle: true, manualState: 'open' });
    const closed = markup('relay-spst', { _documentedStyle: true, manualState: 'closed' });
    expect(open).toContain('x1="-8" y1="35" x2="8" y2="25"');
    expect(closed).toContain('x1="-8" y1="35" x2="8" y2="35"');
  });
});
