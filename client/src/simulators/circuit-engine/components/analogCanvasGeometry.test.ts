import { describe, it, expect } from 'vitest';
import { componentPrefix, nextComponentLabel, type CircuitComponent } from '../models/circuitTypes';
import { tabDComponentLabelAnchors } from './analogCanvasGeometry';

describe('Component Prefixes (circuitTypes.ts)', () => {
  it('maps potentiometer to R', () => {
    expect(componentPrefix('potentiometer')).toBe('R');
  });

  it('maps all diode variants to D', () => {
    const diodeVariants = [
      'diode',
      'diode-ideal',
      'diode-silicon',
      'diode-germanium',
      'diode-gaas',
      'zener',
      'led',
      'photodiode',
      'diac',
    ];
    for (const variant of diodeVariants) {
      expect(componentPrefix(variant)).toBe('D');
    }
  });

  it('unifies all controlled sources under CS', () => {
    const controlledSources = ['vcvs', 'vccs', 'cccs', 'ccvs'];
    for (const cs of controlledSources) {
      expect(componentPrefix(cs)).toBe('CS');
    }
  });

  it('maps impedance to Z', () => {
    expect(componentPrefix('impedance')).toBe('Z');
  });

  it('generates correct nextComponentLabel for updated prefixes', () => {
    const components: CircuitComponent[] = [
      { id: '1', type: 'resistor', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'R1', props: {} },
      { id: '2', type: 'vcvs', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'CS1', props: {} },
      { id: '3', type: 'diode', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'D1', props: {} },
    ];
    // Potentiometer shares 'R' prefix with resistor
    expect(nextComponentLabel('potentiometer', components)).toBe('R2');
    // Controlled sources share 'CS' prefix
    expect(nextComponentLabel('vccs', components)).toBe('CS2');
    // Diode variants share 'D' prefix
    expect(nextComponentLabel('diode-silicon', components)).toBe('D2');
    // Impedance uses 'Z'
    expect(nextComponentLabel('impedance', components)).toBe('Z1');
  });
});

describe('Component Label Anchors (analogCanvasGeometry.ts)', () => {
  it('centers horizontal components horizontally with 6px padding', () => {
    // Resistor: halfWidth = 30, halfHeight = 10 -> bodyHalfH = 10, offsetY = 10 + 6 = 16
    const resistorAnchors = tabDComponentLabelAnchors('resistor', true, 30, 10);
    expect(resistorAnchors.reference[0]).toBe(0);
    expect(resistorAnchors.value[0]).toBe(0);
    expect(resistorAnchors.reference[1]).toBe(-16);
    expect(resistorAnchors.value[1]).toBe(16);

    // Capacitor: halfWidth = 30, halfHeight = 15 -> bodyHalfH = 15, offsetY = 15 + 6 = 21
    const capAnchors = tabDComponentLabelAnchors('capacitor', true, 30, 15);
    expect(capAnchors.reference[0]).toBe(0);
    expect(capAnchors.value[0]).toBe(0);
    expect(capAnchors.reference[1]).toBe(-21);
    expect(capAnchors.value[1]).toBe(21);

    // Diode: halfWidth = 20, halfHeight = 10 -> bodyHalfH = 10, offsetY = 10 + 6 = 16
    const diodeAnchors = tabDComponentLabelAnchors('diode', true, 20, 10);
    expect(diodeAnchors.reference[0]).toBe(0);
    expect(diodeAnchors.value[0]).toBe(0);
    expect(diodeAnchors.reference[1]).toBe(-16);
    expect(diodeAnchors.value[1]).toBe(16);
  });

  it('positions vertical components safely to the right with 6px padding', () => {
    // Resistor: halfWidth = 30, halfHeight = 10 -> bodyHalfW = 30, offsetX = 30 + 6 = 36
    const resistorAnchors = tabDComponentLabelAnchors('resistor', false, 30, 10);
    expect(resistorAnchors.reference[0]).toBe(36);
    expect(resistorAnchors.value[0]).toBe(36);
    expect(resistorAnchors.reference[1]).toBe(-6);
    expect(resistorAnchors.value[1]).toBe(10);
  });

  it('handles controlled sources with tighter Left/Right and Top/Bottom placement', () => {
    // Horizontal (wires Left/Right) -> Labels Top/Bottom (18 + 4 = 22)
    const csHorizontal = tabDComponentLabelAnchors('vcvs', true, 35, 35);
    expect(csHorizontal.reference).toEqual([0, -22]);
    expect(csHorizontal.value).toEqual([0, 22]);
    expect(csHorizontal.refTextAnchor).toBe('middle');
    expect(csHorizontal.valTextAnchor).toBe('middle');

    // Vertical (wires Top/Bottom) -> Labels Left/Right (18 + 4 = 22)
    const csVertical = tabDComponentLabelAnchors('vccs', false, 35, 35);
    expect(csVertical.reference).toEqual([-22, 0]);
    expect(csVertical.value).toEqual([22, 0]);
    expect(csVertical.refTextAnchor).toBe('end');
    expect(csVertical.valTextAnchor).toBe('start');
  });

  it('handles circular sources with closer Left/Right and Top/Bottom placement', () => {
    // Horizontal (wires Left/Right) -> Labels Top/Bottom (33 + 4 = 37)
    const voltHorizontal = tabDComponentLabelAnchors('voltmeter', true, 50, 50);
    expect(voltHorizontal.reference).toEqual([0, -37]);
    expect(voltHorizontal.value).toEqual([0, 37]);
    expect(voltHorizontal.refTextAnchor).toBe('middle');
    expect(voltHorizontal.valTextAnchor).toBe('middle');

    // Vertical (wires Top/Bottom) -> Labels Left/Right (33 + 4 = 37)
    const dcVoltVertical = tabDComponentLabelAnchors('dc-voltage', false, 50, 50);
    expect(dcVoltVertical.reference).toEqual([-37, 0]);
    expect(dcVoltVertical.value).toEqual([37, 0]);
    expect(dcVoltVertical.refTextAnchor).toBe('end');
    expect(dcVoltVertical.valTextAnchor).toBe('start');
  });

  it('hugs visual core for transformers, relays, and contactors', () => {
    // Transformer (bodyHalfW = 20, bodyHalfH = 50, padding = 6)
    const xformerV = tabDComponentLabelAnchors('transformer', false, 50, 50);
    expect(xformerV.reference).toEqual([26, -6]); // 20 + 6 = 26
    expect(xformerV.value).toEqual([26, 10]);

    const xformerH = tabDComponentLabelAnchors('transformer', true, 50, 50);
    expect(xformerH.reference).toEqual([0, -56]); // -(50 + 6) = -56
    expect(xformerH.value).toEqual([0, 56]);

    // Relay (bodyHalfW = 35, bodyHalfH = 35, padding = 6)
    const relayV = tabDComponentLabelAnchors('relay-spst', false, 50, 50);
    expect(relayV.reference).toEqual([41, -6]); // 35 + 6 = 41
    expect(relayV.value).toEqual([41, 10]);

    // Contactor (bodyHalfW = 35, bodyHalfH = 75, padding = 4, yShift = 12.5)
    // Horizontal rotation: offsetY = 75 + 4 = 79
    // Top: -79 + 12.5 = -66.5
    // Bottom: 79 + 12.5 = 91.5
    const contactorH = tabDComponentLabelAnchors('contactor', true, 50, 80);
    expect(contactorH.reference).toEqual([0, -66.5]);
    expect(contactorH.value).toEqual([0, 91.5]);

    // 3-Phase Fuse (bodyHalfW = 20, bodyHalfH = 25, padding = 4)
    const fuse3pV = tabDComponentLabelAnchors('fuse-3phase', false, 50, 50);
    expect(fuse3pV.reference).toEqual([24, -6]); // 20 + 4 = 24
    expect(fuse3pV.value).toEqual([24, 10]);
  });

  it('forces ground labels safely below the symbol to avoid terminal wire at top', () => {
    const groundAnchors = tabDComponentLabelAnchors('ground', false, 15, 15);
    expect(groundAnchors.reference).toEqual([0, 30]);
    expect(groundAnchors.value).toEqual([0, 42]);
    expect(groundAnchors.refTextAnchor).toBe('middle');
    expect(groundAnchors.valTextAnchor).toBe('middle');
  });

  it('places three-phase-rail labels on the right side between L2 and L3', () => {
    const railAnchors = tabDComponentLabelAnchors('three-phase-rail', false, 45, 30);
    expect(railAnchors).toEqual({
      reference: [60, -12],
      value: [60, 8],
      refTextAnchor: 'start',
      valTextAnchor: 'start'
    });
  });

  it('preserves sw-dpst custom 12px padding', () => {
    const dpstH = tabDComponentLabelAnchors('sw-dpst', true, 25, 25);
    expect(dpstH.reference).toEqual([0, -37]); // -(25 + 12)
    expect(dpstH.value).toEqual([0, 37]);

    const dpstV = tabDComponentLabelAnchors('sw-dpst', false, 25, 25);
    expect(dpstV.reference).toEqual([37, -6]); // 25 + 12
    expect(dpstV.value).toEqual([37, 10]);
  });

  it('preserves opamp bounds with visual footprint', () => {
    const opamp = tabDComponentLabelAnchors('opamp', true, 40, 40);
    expect(opamp.reference).toEqual([0, -31]); // -(25 + 6)
    expect(opamp.value).toEqual([0, 31]);
  });

  it('shifts sw-spdt and sw-dpdt anchors with yShift = 12.5 and padding = 6', () => {
    // sw-spdt horizontal: bodyHalfH = 12.5, padding = 6 -> offsetY = Math.round(18.5) = 19
    // reference: [0, -19 + 12.5] = [0, -6.5]
    // value: [0, 19 + 12.5] = [0, 31.5]
    const spdtH = tabDComponentLabelAnchors('sw-spdt', true, 25, 12.5);
    expect(spdtH.reference).toEqual([0, -6.5]);
    expect(spdtH.value).toEqual([0, 31.5]);

    // sw-spdt vertical: bodyHalfW = 25, padding = 6 -> offsetX = 31
    // reference: [31, -6 + 12.5] = [31, 6.5]
    // value: [31, 10 + 12.5] = [31, 22.5]
    const spdtV = tabDComponentLabelAnchors('sw-spdt', false, 25, 12.5);
    expect(spdtV.reference).toEqual([31, 6.5]);
    expect(spdtV.value).toEqual([31, 22.5]);
  });
});
