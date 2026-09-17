import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatMeterReading, renderComponentCanvasLabel, renderSymbol, ThreePhaseMotorSymbol, formatDependentSourceMath, renderDependentSourceValueTspans } from '@/simulators/circuit-engine/components/symbols';

function markup(symbolId: string, props: Record<string, unknown> = {}, powered = false, animTime = 0) {
  return renderToStaticMarkup(<svg>{renderSymbol(symbolId, powered, props, animTime)}</svg>);
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

  it('renders the 3-Phase Source with neutral and phases A, B, C leads facing right', () => {
    const source = markup('three-phase-source');
    expect(source).toContain('r="33"');
    expect(source).toContain('x1="50" y1="-25" x2="21.5" y2="-25"');
    expect(source).toContain('x1="50" y1="0" x2="33" y2="0"');
    expect(source).toContain('x1="50" y1="25" x2="21.5" y2="25"');
    expect(source).toContain('x1="-50" y1="0" x2="-33" y2="0"');
  });

  it('uses red, yellow, blue, and neutral rails for the three-phase power rail', () => {
    const rail = markup('three-phase-rail', { _documentedStyle: true });
    expect(rail).toContain('#d14343');
    expect(rail).toContain('#d6a720');
    expect(rail).toContain('#2d73b7');
    expect(rail).toContain(`x1="-50" y1="${-100 / 3}" x2="50" y2="${-100 / 3}"`);
    expect(rail).toContain(`x1="-50" y1="${-50 / 3}" x2="50" y2="${-50 / 3}"`);
    expect(rail).toContain(`x1="-50" y1="${0 / 3}" x2="50" y2="${0 / 3}"`);
    expect(rail).toContain(`x1="-50" y1="${50 / 3}" x2="50" y2="${50 / 3}"`);
  });

  it('centers the documented IAC waveforms inside its source circle with visual parity to AC voltage source', () => {
    const sine = markup('ac-current', { waveform: 'sine', _documentedStyle: true });
    const square = markup('ac-current', { waveform: 'square' });
    const triangle = markup('ac-current', { waveform: 'triangle' });
    const sawtooth = markup('ac-current', { waveform: 'sawtooth' });
    expect(sine).toContain('M -15,2 C -10,-10 -5,-10 0,2 C 5,14 10,14 15,2');
    expect(square).toContain('M -15,8 L -15,-8 L 0,-8 L 0,8 L 15,8 L 15,-8');
    expect(triangle).toContain('M -15,0 L -7.5,-8 L 0,0 L 7.5,8 L 15,0');
    expect(sawtooth).toContain('M -15,8 L 0,-8 L 0,8 L 15,-8');
  });

  it('uses an ANSI zigzag potentiometer body and a dynamically movable wiper arrow', () => {
    const zero = markup('potentiometer', { wiper: 0 });
    expect(zero).toContain('data-zigzag-potentiometer="ansi-style"');
    expect(zero).toContain('x1="0" y1="-33.333" x2="-20" y2="-11"');
    expect(zero).toContain('points="-20,-6.5 -23.5,-12 -16.5,-12"');

    const mid = markup('potentiometer', { wiper: 0.5 });
    expect(mid).toContain('x1="0" y1="-33.333" x2="0" y2="-11"');
    expect(mid).toContain('points="0,-6.5 -3.5,-12 3.5,-12"');

    const max = markup('potentiometer', { wiper: 1 });
    expect(max).toContain('x1="0" y1="-33.333" x2="20" y2="-11"');
    expect(max).toContain('points="20,-6.5 16.5,-12 23.5,-12"');
  });

  it('composes documented Star and Delta packs from equal compact resistor arms without overlap or extra Star return paths', () => {
    const resistor = markup('resistor', { _documentedStyle: true });
    const star = markup('star-resistor-pack', { _documentedStyle: true });
    const delta = markup('delta-resistor-pack', { _documentedStyle: true });
    expect(resistor).toContain('data-zigzag-resistor="ansi-style"');
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
    expect(opamp).toContain('points="-35,-40 -35,40 35,0"');
    expect(opamp).toContain('x1="-50" y1="-25" x2="-35" y2="-25"');
    expect(opamp).toContain('x1="-50" y1="25" x2="-35" y2="25"');
    expect(opamp).toContain('x1="35" y1="0" x2="50" y2="0"');
    expect(opamp).toContain('x="-25" y="-24"');
    expect(opamp).toContain('x="-25" y="26"');
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
    expect(open).toContain('x1="-10" y1="25" x2="8" y2="15"');
    expect(closed).toContain('x1="-10" y1="25" x2="8" y2="25"');
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

  it('renders SCR symbol with a 45-degree to horizontal gate path and no redundant line', () => {
    const rendered = markup('scr', { _documentedStyle: true });
    expect(rendered).toContain('d="M 0,10 L -15,25 L -25,25"');
    expect(rendered).toContain('stroke-width="1.5"');
    expect(rendered).toContain('x1="0" y1="-25" x2="0" y2="-10"');
    expect(rendered).toContain('x1="0" y1="10" x2="0" y2="25"');
    expect(rendered).not.toContain('x1="10" y1="10" x2="16" y2="16"');
    expect(rendered).not.toContain('x1="-20" y1="15" x2="0" y2="15"');
  });

  it('synchronizes relay-spdt and relay-dpst internal contacts with sw-spdt and sw-dpst vector geometry and dynamic states', () => {
    // Relay SPDT de-energized: arm rests on NC (y=0)
    const spdtIdle = renderToStaticMarkup(<svg>{renderSymbol('relay-spdt', false, {}, 0)}</svg>);
    expect(spdtIdle).toContain('cx="-10" cy="0" r="2.5"'); // COM pivot
    expect(spdtIdle).toContain('cx="10" cy="0" r="2.5"');  // NC contact
    expect(spdtIdle).toContain('cx="10" cy="25" r="2.5"'); // NO contact
    expect(spdtIdle).toContain('x1="-10" y1="0" x2="8" y2="0"'); // Arm resting on NC
    expect(spdtIdle).toContain('x1="0" y1="-20" x2="0" y2="0"'); // Linkage to arm

    // Relay SPDT energized: arm swings cleanly to NO (y=25)
    const spdtActive = renderToStaticMarkup(<svg>{renderSymbol('relay-spdt', true, {}, 0)}</svg>);
    expect(spdtActive).toContain('x1="-10" y1="0" x2="8" y2="25"'); // Arm connected to NO
    expect(spdtActive).toContain('x1="0" y1="-20" x2="0" y2="14"'); // Linkage follows arm down

    // Relay DPST de-energized: both poles in open position (-10 and 15) matching sw-dpst
    const dpstIdle = renderToStaticMarkup(<svg>{renderSymbol('relay-dpst', false, {}, 0)}</svg>);
    expect(dpstIdle).toContain('x1="-10" y1="0" x2="8" y2="-10"'); // Pole 1 open
    expect(dpstIdle).toContain('x1="-10" y1="25" x2="8" y2="15"'); // Pole 2 open
    expect(dpstIdle).toContain('x1="0" y1="-20" x2="0" y2="20"');  // Linkage crossing arms

    // Relay DPST energized: both poles swing down closed (0 and 25)
    const dpstActive = renderToStaticMarkup(<svg>{renderSymbol('relay-dpst', true, {}, 0)}</svg>);
    expect(dpstActive).toContain('x1="-10" y1="0" x2="8" y2="0"');  // Pole 1 closed
    expect(dpstActive).toContain('x1="-10" y1="25" x2="8" y2="25"'); // Pole 2 closed
    expect(dpstActive).toContain('x1="0" y1="-20" x2="0" y2="25"'); // Linkage down to closed arm

    // Relay SPST NO de-energized: arm open (y2=15)
    const spstNoIdle = renderToStaticMarkup(<svg>{renderSymbol('relay-spst', false, { contactType: 'NO' }, 0)}</svg>);
    expect(spstNoIdle).toContain('x1="-10" y1="25" x2="8" y2="15"');
    expect(spstNoIdle).toContain('x1="0" y1="-20" x2="0" y2="20"');

    // Relay SPST NO energized: arm closed (y2=25)
    const spstNoActive = renderToStaticMarkup(<svg>{renderSymbol('relay-spst', true, { contactType: 'NO' }, 0)}</svg>);
    expect(spstNoActive).toContain('x1="-10" y1="25" x2="8" y2="25"');
    expect(spstNoActive).toContain('x1="0" y1="-20" x2="0" y2="25"');

    // Relay SPST NC de-energized: arm closed (y2=25)
    const spstNcIdle = renderToStaticMarkup(<svg>{renderSymbol('relay-spst', false, { contactType: 'NC' }, 0)}</svg>);
    expect(spstNcIdle).toContain('x1="-10" y1="25" x2="8" y2="25"');
    expect(spstNcIdle).toContain('x1="0" y1="-20" x2="0" y2="25"');

    // Relay SPST NC energized: arm open (y2=15)
    const spstNcActive = renderToStaticMarkup(<svg>{renderSymbol('relay-spst', true, { contactType: 'NC' }, 0)}</svg>);
    expect(spstNcActive).toContain('x1="-10" y1="25" x2="8" y2="15"');
    expect(spstNcActive).toContain('x1="0" y1="-20" x2="0" y2="20"');

    // Contactor de-energized: aux NC closed at 75, linkage at 69
    const contactorIdle = renderToStaticMarkup(<svg>{renderSymbol('contactor', false, {}, 0)}</svg>);
    expect(contactorIdle).toContain('x1="-10" y1="75" x2="8" y2="75"');
    expect(contactorIdle).toContain('x1="0" y1="-40" x2="0" y2="69"');

    // Contactor energized: aux NC open at 65, linkage pulls down to 75
    const contactorActive = renderToStaticMarkup(<svg>{renderSymbol('contactor', true, {}, 0)}</svg>);
    expect(contactorActive).toContain('x1="-10" y1="75" x2="8" y2="65"');
    expect(contactorActive).toContain('x1="0" y1="-40" x2="0" y2="75"');
  });

  it('renders DIAC and TRIAC matching SCR styling and 25px Cartesian grid alignment', () => {
    const diac = markup('diac');
    const triac = markup('triac');
    // DIAC: stroke-width 1.5, separated antiparallel triangles with horizontal bars, terminals at [0, -25] and [0, 25]
    expect(diac).toContain('stroke-width="1.5"');
    expect(diac).toContain('x1="0" y1="-25" x2="0" y2="-10"');
    expect(diac).toContain('x1="0" y1="10" x2="0" y2="25"');
    expect(diac).toContain('x1="-15" y1="-10" x2="15" y2="-10"');
    expect(diac).toContain('x1="-15" y1="10" x2="15" y2="10"');
    expect(diac).toContain('points="-13,10 1,10 -6.5,-10"');
    expect(diac).toContain('points="-1,-10 13,-10 6.5,10"');

    // TRIAC: stroke-width 1.5, terminals at [0, -25], [0, 25], and gate at [-25, 25]
    expect(triac).toContain('stroke-width="1.5"');
    expect(triac).toContain('points="-13,10 1,10 -6.5,-10"');
    expect(triac).toContain('points="-1,-10 13,-10 6.5,10"');
    expect(triac).toContain('d="M -0,10 L -18,25 L -25,25"');
  });

  it('renders DMM with standardized mae-component-label, KaTeX title header, and inverted dark mode casing', () => {
    const dmm = markup('dmm');
    expect(dmm).toContain('>DMM<');
    expect(dmm).toContain('mae-component-label');
    expect(dmm).toContain('y="-58"');
    // Light mode: dark charcoal body
    expect(dmm).toContain('fill="#1e232d"');
    expect(dmm).toContain('stroke="#111827"');

    // Dark mode: light gray body
    const dmmDark = markup('dmm', { _isDark: true });
    expect(dmmDark).toContain('fill="#e2e8f0"');
    expect(dmmDark).toContain('stroke="#94a3b8"');

    // Multi-letter acronyms (DMM) must render in upright KaTeX_Main, not italic
    const dmm1 = markup('dmm', { label: 'DMM1' });
    expect(dmm1).toContain('font-family="&#x27;KaTeX_Main&#x27;, serif" font-style="normal"');
    expect(dmm1).toContain('>DMM</tspan>');
    expect(dmm1).toContain('dy="2.5"');
    expect(dmm1).toContain('>1</tspan>');

    // Library drawer preview suppresses DMM label
    const dmmLibrary = markup('dmm', { _isLibraryThumbnail: true });
    expect(dmmLibrary).not.toContain('mae-component-label');
    expect(dmmLibrary).not.toContain('y="-58"');

    // LCD screen in light mode matches Live Multimeters colors (#e0f2fe background, #0284c7 digits)
    expect(dmm).toContain('fill="#e0f2fe"');
    expect(dmm).toContain('fill="#0284c7"');
    // LCD screen in dark mode has dark blue display (#0f2744 background, #38bdf8 digits)
    expect(dmmDark).toContain('fill="#0f2744"');
    expect(dmmDark).toContain('fill="#38bdf8"');
  });

  it('renders Voltmeter and Ammeter with dynamic displayValue or fallback, in upright KaTeX_Main typography', () => {
    const vDefault = markup('voltmeter');
    const vDynamic = markup('voltmeter', { displayValue: '12.0 V' });
    expect(vDefault).toContain('>V<');
    expect(vDynamic).toContain('>12.0 V<');

    const aDefault = markup('ammeter');
    const aDynamic = markup('ammeter', { displayValue: '250 mA' });
    expect(aDefault).toContain('>A<');
    expect(aDynamic).toContain('>250 mA<');

    // Digits and unit letters render upright (never italic), in the same KaTeX_Main face used
    // elsewhere for math Roman text — not KaTeX_Math, which is reserved for italic variable letters.
    for (const markup_ of [vDefault, vDynamic, aDefault, aDynamic]) {
      expect(markup_).toContain('font-family="KaTeX_Main, Times New Roman, serif"');
      expect(markup_).toContain('font-style="normal"');
    }
  });

  it('formats live meter readings as auto-scaled, 4-significant-digit upright KaTeX strings', () => {
    // Base-unit range: 3 decimals.
    expect(formatMeterReading(1.5, 'A')).toBe('1.500 A');
    // Auto-scales down to milli once the base-unit magnitude drops below 1.
    expect(formatMeterReading(0.02, 'A')).toBe('20.00 mA');
    expect(formatMeterReading(0.7502, 'V')).toBe('750.2 mV');
    expect(formatMeterReading(12, 'V')).toBe('12.00 V');
    // Sub-tolerance solver noise (below ngspice's own VNTOL/ABSTOL resolution) clamps to an exact
    // zero in the instrument's base unit, never a scaled-down "-0.000 µV" or "0.000 pA".
    expect(formatMeterReading(4e-8, 'V')).toBe('0.000 V');
    expect(formatMeterReading(-1e-19, 'A')).toBe('0.000 A');
    // Polarity survives scaling.
    expect(formatMeterReading(-0.005, 'A')).toBe('-5.000 mA');
  });

  it('renders oscilloscope with terminal labels visible ONLY when selected, CRT screen, and inverted dark mode body', () => {
    const unselectedScope = markup('oscilloscope');
    // Decorative sine wave removed
    expect(unselectedScope).not.toContain('C -45,-55 -35,15 -20,-20');
    // Clean screen with grid intact (standard CRT dark screen)
    expect(unselectedScope).toContain('fill="#030712"');
    // Light mode: dark charcoal casing
    expect(unselectedScope).toContain('fill="#1e232d"');
    expect(unselectedScope).toContain('stroke="#111827"');
    // External labels MUST NOT appear when unselected
    expect(unselectedScope).not.toContain('>CH1<');
    expect(unselectedScope).not.toContain('>CH2<');
    expect(unselectedScope).not.toContain('>CH3<');
    expect(unselectedScope).not.toContain('>CH4<');
    expect(unselectedScope).not.toContain('>GND<');

    // Dark mode: light gray body
    const darkScope = markup('oscilloscope', { _isDark: true });
    expect(darkScope).toContain('fill="#e2e8f0"');
    expect(darkScope).toContain('stroke="#94a3b8"');

    const selectedScope = markup('oscilloscope', { selected: true });
    // External labels MUST appear when selected
    expect(selectedScope).toContain('>CH1<');
    expect(selectedScope).toContain('>CH2<');
    expect(selectedScope).toContain('>CH3<');
    expect(selectedScope).toContain('>CH4<');
    expect(selectedScope).toContain('>GND<');
  });

  it('renders 1-Phase Aux Contact dynamically with open blade for NO and closed with IEC diagonal slash for NC', () => {
    const noOpen = markup('aux-contact-no', { contactType: 'NO' });
    expect(noOpen).toContain('x1="-10" y1="0" x2="8" y2="-10"');
    expect(noOpen).not.toContain('x1="-3" y1="-7" x2="5" y2="7"');

    const ncClosed = markup('aux-contact-no', { contactType: 'NC' });
    expect(ncClosed).toContain('x1="-10" y1="0" x2="8" y2="0"');
    expect(ncClosed).toContain('x1="-3" y1="-7" x2="5" y2="7"');

    const ncEnergized = markup('aux-contact-no', { contactType: 'NC', isEnergized: true });
    expect(ncEnergized).toContain('x1="-10" y1="0" x2="8" y2="-10"');
    expect(ncEnergized).toContain('x1="-3" y1="-7" x2="5" y2="7"');
  });

  it('renders 3-Phase Auxiliary Contact with 3 poles and mechanical dashed linkage', () => {
    const contact3P = markup('aux-contact-3phase', { contactType: 'NO' });
    // 3 parallel poles at y = -25, 0, 25
    expect(contact3P).toContain('x1="-50" y1="-25" x2="-10" y2="-25"');
    expect(contact3P).toContain('x1="-50" y1="0" x2="-10" y2="0"');
    expect(contact3P).toContain('x1="-50" y1="25" x2="-10" y2="25"');
    // Dashed mechanical linkage
    expect(contact3P).toContain('stroke-dasharray="4,3"');
    expect(contact3P).toContain('x1="0" y1="-25" x2="0" y2="25"');

    const contact3P_NC = markup('aux-contact-3phase', { contactType: 'NC' });
    // All 3 poles have diagonal NC slash
    expect(contact3P_NC).toContain('x1="-3" y1="-32" x2="5" y2="-18"');
    expect(contact3P_NC).toContain('x1="-3" y1="-7" x2="5" y2="7"');
    expect(contact3P_NC).toContain('x1="-3" y1="18" x2="5" y2="32"');
  });

  it('renders 3-Phase Motor with static IEC symbols when unpowered and unified blue active rotor animation when powered', () => {
    const unpowered = markup('motor-3phase');
    expect(unpowered).toContain('>3 ~<');
    expect(unpowered).toContain('>M<');
    expect(unpowered).not.toContain('stroke-dasharray="14 8"');

    const powered = markup('motor-3phase', {}, true, 0.25);
    expect(powered).toContain('>3 ~<');
    expect(powered).toContain('>M<');
    // Unified blue active rotation ring and indicator
    expect(powered).toContain('stroke-dasharray="14 8"');
    expect(powered).toContain('stroke="#2563eb"');
    expect(powered).toContain('stroke="#3b82f6"');
    expect(powered).toContain('--motor-spin-duration:1.000s');
    expect(ThreePhaseMotorSymbol).toBeDefined();

    // Voltage-dependent rotation duration scaling
    const slow = markup('motor-3phase', { _vEff: 100, nominalV: 400 }, true, 0.5);
    expect(slow).toContain('--motor-spin-duration:3.000s');

    const nominal = markup('motor-3phase', { _vEff: 400, nominalV: 400 }, true, 0.5);
    expect(nominal).toContain('--motor-spin-duration:1.000s');

    const fast = markup('motor-3phase', { _vEff: 480, nominalV: 400 }, true, 0.5);
    expect(fast).toContain('--motor-spin-duration:0.833s');

    // Stationary below threshold (< 0.5V)
    const belowThreshold = markup('motor-3phase', { _vEff: 0.3, nominalV: 400 }, true, 0.5);
    expect(belowThreshold).not.toContain('stroke-dasharray="14 8"');
  });

  it('renders DC Motor with static IEC symbol when unpowered and unified blue rotor animation with voltage scaling', () => {
    const unpowered = markup('motor-dc');
    expect(unpowered).toContain('>M<');
    expect(unpowered).not.toContain('stroke-dasharray="14 8"');

    const powered = markup('motor-dc', { nominalV: 24 }, true, 0.25);
    expect(powered).toContain('>M<');
    // Unified blue active rotation ring and indicator
    expect(powered).toContain('stroke-dasharray="14 8"');
    expect(powered).toContain('stroke="#2563eb"');
    expect(powered).toContain('stroke="#3b82f6"');
    expect(powered).toContain('--motor-spin-duration:1.000s');

    // Voltage-dependent rotation duration scaling
    const crawl = markup('motor-dc', { _vEff: 6, nominalV: 24 }, true, 0.5);
    expect(crawl).toContain('--motor-spin-duration:3.000s');

    const nominal = markup('motor-dc', { _vEff: 24, nominalV: 24 }, true, 0.5);
    expect(nominal).toContain('--motor-spin-duration:1.000s');

    const accelerated = markup('motor-dc', { _vEff: 48, nominalV: 24 }, true, 0.5);
    expect(accelerated).toContain('--motor-spin-duration:0.500s');

    // Stationary below threshold (< 0.5V)
    const belowThreshold = markup('motor-dc', { _vEff: 0.2, nominalV: 24 }, true, 0.5);
    expect(belowThreshold).not.toContain('stroke-dasharray="14 8"');
  });

  it('standardizes KaTeX typography: single-letter math variables italic, multi-letter acronyms upright', () => {
    // Single-letter identifiers: R1, C1, L1, V1, I1 -> italic base, upright subscript
    const r1 = renderToStaticMarkup(<text>{renderComponentCanvasLabel('R1')}</text>);
    expect(r1).toContain('font-family="&#x27;KaTeX_Math&#x27;, serif"');
    expect(r1).toContain('font-style="italic"');
    expect(r1).toContain('>R</tspan>');
    expect(r1).toContain('font-family="&#x27;KaTeX_Main&#x27;, serif"');
    expect(r1).toContain('font-style="normal"');
    expect(r1).toContain('>1</tspan>');

    const v1 = renderToStaticMarkup(<text>{renderComponentCanvasLabel('V1')}</text>);
    expect(v1).toContain('font-style="italic"');
    expect(v1).toContain('>V</tspan>');

    // Multi-letter designations / acronyms: GND -> upright \text{GND}
    const gnd = renderToStaticMarkup(<text>{renderComponentCanvasLabel('GND')}</text>);
    expect(gnd).toContain('font-family="&#x27;KaTeX_Main&#x27;, serif" font-style="normal"');
    expect(gnd).toContain('>GND</tspan>');
    expect(gnd).not.toContain('font-style="italic"');

    // OSC1 -> upright \text{OSC}_1
    const osc1 = renderToStaticMarkup(<text>{renderComponentCanvasLabel('OSC1')}</text>);
    expect(osc1).toContain('font-family="&#x27;KaTeX_Main&#x27;, serif" font-style="normal"');
    expect(osc1).toContain('>OSC</tspan>');
    expect(osc1).toContain('>1</tspan>');
    expect(osc1).not.toContain('font-style="italic"');

    // DMM1 -> upright \text{DMM}_1
    const dmm1 = renderToStaticMarkup(<text>{renderComponentCanvasLabel('DMM1')}</text>);
    expect(dmm1).toContain('font-family="&#x27;KaTeX_Main&#x27;, serif" font-style="normal"');
    expect(dmm1).toContain('>DMM</tspan>');
    expect(dmm1).toContain('>1</tspan>');
    expect(dmm1).not.toContain('font-style="italic"');
  });

  describe('Dependent Sources Dynamic Academic Labels', () => {
    it('generates academic KaTeX string for VCVS and VCCS based on target voltage', () => {
      // VCVS: controls voltage based on target voltage -> 5 V_{R_1}
      expect(formatDependentSourceMath('vcvs', 5, 'R1')).toBe('5 V_{R_1}');
      expect(formatDependentSourceMath('vcvs', 2.5, 'R_2')).toBe('2.5 V_{R_2}');
      // VCCS: controls current based on target voltage -> 0.05 V_{R_1}
      expect(formatDependentSourceMath('vccs', 0.05, 'R1')).toBe('0.05 V_{R_1}');
      expect(formatDependentSourceMath('vccs', 10, 'C1')).toBe('10 V_{C_1}');
    });

    it('generates academic KaTeX string for CCVS and CCCS based on target current', () => {
      // CCVS: controls voltage based on target current -> 1000 I_{R_1}
      expect(formatDependentSourceMath('ccvs', 1000, 'R1')).toBe('1000 I_{R_1}');
      expect(formatDependentSourceMath('ccvs', 50, 'L1')).toBe('50 I_{L_1}');
      // CCCS: controls current based on target current -> 100 I_{R_1}
      expect(formatDependentSourceMath('cccs', 100, 'R1')).toBe('100 I_{R_1}');
      expect(formatDependentSourceMath('cccs', 2, 'R_load')).toBe('2 I_{R_load}');
    });

    it('falls back to numeric gain when no target component is selected yet', () => {
      expect(formatDependentSourceMath('vcvs', 5, '')).toBe('5');
      expect(formatDependentSourceMath('vccs', 2, undefined)).toBe('2');
      expect(formatDependentSourceMath('ccvs', 10, '   ')).toBe('10');
    });

    it('renders SVG tspans with italic control variable (V/I) and upright numeric gain and subscript', () => {
      const vcvsMarkup = renderToStaticMarkup(<text>{renderDependentSourceValueTspans('vcvs', 5, 'R1')}</text>);
      // Upright gain
      expect(vcvsMarkup).toContain('>5</tspan>');
      // Italic V variable
      expect(vcvsMarkup).toContain('font-style="italic"');
      expect(vcvsMarkup).toContain('>V</tspan>');
      // Subscript R1
      expect(vcvsMarkup).toContain('>R1</tspan>');

      const cccsMarkup = renderToStaticMarkup(<text>{renderDependentSourceValueTspans('cccs', 2, 'R2')}</text>);
      // Upright gain
      expect(cccsMarkup).toContain('>2</tspan>');
      // Italic I variable
      expect(cccsMarkup).toContain('font-style="italic"');
      expect(cccsMarkup).toContain('>I</tspan>');
      // Subscript R2
      expect(cccsMarkup).toContain('>R2</tspan>');
    });
  });

  describe('Burnout explosion and body tinting', () => {
    it('renders a transient explode-fade animation with forwards fill mode and #EF4444 color tint', () => {
      const burnedResistor = markup('resistor', { _isBurned: true });
      expect(burnedResistor).toContain('color="#EF4444"');
      expect(burnedResistor).toContain('animation:explode-fade 1s cubic-bezier(0.16, 1, 0.3, 1) forwards');
      expect(burnedResistor).toContain('@keyframes explode-fade');
      expect(burnedResistor).not.toContain('animate-pulse');
    });
  });
});

