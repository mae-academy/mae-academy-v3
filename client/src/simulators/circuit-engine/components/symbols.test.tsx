import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderSymbol } from '@/simulators/circuit-engine/components/symbols';

function markup(symbolId: string, props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(<svg>{renderSymbol(symbolId, false, props, 0)}</svg>);
}

describe('Tab D SVG symbol language', () => {
  it('renders the DC rail as a positive-only reference source with one visual terminal', () => {
    const rail = markup('dc-rail', { _documentedStyle: true });
    expect(rail).toContain('data-documented-dc-rail="positive-reference"');
    expect(rail).toContain('x1="0" y1="-10" x2="0" y2="0"');
    expect(rail).toContain('x1="-24" y1="-10" x2="24" y2="-10"');
    expect(rail).not.toContain('x1="-40" y1="0" x2="40" y2="0"');
    expect(rail).not.toContain('#eff6ff');
    expect(rail).not.toContain('24V');
  });

  it('renders the 3-Phase Source with neutral and phases A, B, C leads', () => {
    const source = markup('three-phase-source');
    expect(source).toContain('r="22"');
    expect(source).toContain('x1="-36" y1="0" x2="-21" y2="0"');
    expect(source).toContain('x1="22" y1="0" x2="30" y2="0"');
    expect(source).toContain('x1="16" y1="-15" x2="31" y2="-25"');
    expect(source).toContain('x1="16" y1="15" x2="31" y2="25"');
  });

  it('uses red, yellow, blue, and neutral rails for the three-phase power rail', () => {
    const rail = markup('three-phase-rail', { _documentedStyle: true });
    expect(rail).toContain('#d14343');
    expect(rail).toContain('#d6a720');
    expect(rail).toContain('#2d73b7');
    expect(rail).toContain(`x1="${-100 / 3}" y1="${-100 / 3}" x2="50" y2="${-100 / 3}"`);
    expect(rail).toContain(`x1="${-100 / 3}" y1="${-50 / 3}" x2="50" y2="${-50 / 3}"`);
    expect(rail).toContain(`x1="${-100 / 3}" y1="${0 / 3}" x2="50" y2="${0 / 3}"`);
    expect(rail).toContain(`x1="${-100 / 3}" y1="${50 / 3}" x2="50" y2="${50 / 3}"`);
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
    expect(minimum).toContain('x1="0" y1="-30" x2="0" y2="-11"');
    expect(minimum).toContain('points="0,-7 -4,-12 4,-12"');
  });

  it('composes documented Star and Delta packs from equal compact resistor arms without overlap or extra Star return paths', () => {
    const resistor = markup('resistor', { _documentedStyle: true });
    const star = markup('star-resistor-pack', { _documentedStyle: true });
    const delta = markup('delta-resistor-pack', { _documentedStyle: true });
    expect(resistor).toContain('data-rectangular-resistor="potentiometer-style"');
    expect(resistor).toContain('x="-20" y="-7" width="40" height="14"');
    expect(resistor).toContain('x1="-30" y1="0" x2="-20" y2="0"');
    expect(star).toContain('data-resistor-network="star"');
    expect((star.match(/data-rectangular-resistor="potentiometer-style"/g) ?? [])).toHaveLength(3);
    expect((star.match(/width="13" height="4\.5"/g) ?? [])).toHaveLength(3);
    expect(star).toContain('rotate(0) translate(15, 0)');
    expect(star).toContain('x1="0" y1="0" x2="-15" y2="-30"');
    expect(star).toContain('x1="0" y1="0" x2="-15" y2="30"');
    expect(delta).toContain('data-resistor-network="delta"');
    expect((delta.match(/data-rectangular-resistor="potentiometer-style"/g) ?? [])).toHaveLength(3);
    expect((delta.match(/width="13" height="4\.5"/g) ?? [])).toHaveLength(3);
    expect(delta).toContain('x1="0" y1="-20" x2="-20" y2="20"');
    expect(delta).toContain('x1="0" y1="-20" x2="20" y2="20"');
    expect(delta).toContain('x1="-20" y1="20" x2="20" y2="20"');
    expect(delta).toContain('rotate(0)');
  });

  it('renders the 3-terminal op-amp with hidden power rails and +/- input polarity indicators', () => {
    const opamp = markup('opamp');
    expect(opamp).toContain('points="-20,-25 30,0 -20,25"');
    expect(opamp).toContain('x1="-35" y1="-20" x2="-35" y2="-9"');
    expect(opamp).toContain('x1="-35" y1="9" x2="-35" y2="20"');
    expect(opamp).toContain('x1="30" y1="0" x2="35" y2="0"');
  });

  it('uses orthogonal collector/emitter routing and distinct regular arrowheads for NPN and PNP symbols', () => {
    const npn = markup('bjt-npn');
    const pnp = markup('bjt-pnp');
    expect(npn).toContain('d="M 0 -10 L 15 -25 L 25 -25"');
    expect(npn).toContain('d="M 0 10 L 15 25 L 25 25"');
    expect(npn).toContain('points="15,25 9,25 15,19"');
    expect(pnp).toContain('points="9,19 15,19 9,25"');
    expect(npn).not.toBe(pnp);
  });

  it('renders MOSFET and JFET symbols with correct channel and gate orientation', () => {
    const mosN = markup('mosfet-n');
    const mosP = markup('mosfet-p');
    const jfetN = markup('jfet-n');
    const jfetP = markup('jfet-p');
    expect(mosN).toContain('points="7,0 13,-3.5 13,3.5"');
    expect(mosP).toContain('points="15,0 8,-5 8,5"');
    expect(mosN).toContain('d="M 5 0 L 25 0 L 25 13"');
    expect(mosP).toContain('d="M 5 0 L 25 0 L 25 13"');
    expect(jfetN).toContain('points="-15,-5 -9,0 -15,5"');
    expect(jfetP).toContain('rotate(180 -12 0)');
  });

  it('uses repeated semicircular coil paths in documented transformers, relays, and contactors while retaining their contact geometry', () => {
    const transformer = markup('transformer', { _documentedStyle: true });
    const transformerCt = markup('transformer-ct', { _documentedStyle: true });
    const relay = markup('relay-spdt', { _documentedStyle: true });
    const contactor = markup('contactor', { _documentedStyle: true });
    
    // The redesigned Transformer uses exact SVG Arc (A) paths with inductor geometry
    expect((transformer.match(/ A /g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(transformer).toContain('x1="-20" y1="-50" x2="-50" y2="-50"');
    expect(transformer).toContain('x1="-20" y1="50" x2="-50" y2="50"');
    expect(transformerCt).toContain('x1="20" y1="0" x2="50" y2="0"');
    
    // Relays and Contactors utilize exact SVG Arc (A) paths for their coils
    expect((relay.match(/ A /g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((contactor.match(/ A /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('uses an explicit manual relay state to display a latched contact position', () => {
    const open = markup('relay-spst', { _documentedStyle: true, manualState: 'open' });
    const closed = markup('relay-spst', { _documentedStyle: true, manualState: 'closed' });
    expect(open).toContain('x1="-8" y1="35" x2="8" y2="25"');
    expect(closed).toContain('x1="-8" y1="35" x2="8" y2="35"');
  });

  it('standardizes schematic symbols to stroke="currentColor" and fill="none" without hardcoded dark strokes or solid white fills', () => {
    const symbolsToCheck = [
      'dc-voltage',
      'ac-voltage',
      'dc-current',
      'ac-current',
      'ground',
      'resistor',
      'potentiometer',
      'capacitor',
      'inductor',
      'vcvs',
      'vccs',
      'diode',
      'sw-spst-no',
      'fuse',
      'voltmeter',
      'ammeter',
      'gate-and',
    ];

    for (const sym of symbolsToCheck) {
      const rendered = markup(sym);
      expect(rendered).toContain('stroke="currentColor"');
      expect(rendered).not.toContain('#1a2744');
      expect(rendered).not.toContain('fill="white"');
    }
  });

  it('completely removes TestShape from symbol rendering and catalog', () => {
    // Should render the fallback question mark because test-shape is eradicated
    const rendered = markup('test-shape');
    expect(rendered).toContain('>?<');
  });
});
