import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { getBrokenWireIds, isComponentOpen } from './brokenBranches';

const component = (id: string, type: string, props: Record<string, unknown> = {}, state: Record<string, unknown> = {}): CircuitComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label: id,
  props,
  state,
});

const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({
  id,
  fromComp,
  fromTerm,
  toComp,
  toTerm,
  routing: 'orthogonal',
  path: [[0, 0], [40, 0]],
});

describe('brokenBranches logic', () => {
  it('correctly identifies open switches and burned components', () => {
    expect(isComponentOpen(component('R1', 'resistor'))).toBe(false);
    expect(isComponentOpen(component('R1', 'resistor', {}, { isBurned: true }))).toBe(true);
    expect(isComponentOpen(component('SW1', 'sw-spst-no', { state: 'open' }))).toBe(true);
    expect(isComponentOpen(component('SW1', 'sw-spst-no', { state: 'closed' }))).toBe(false);
    expect(isComponentOpen(component('SW1', 'switch-spst', { closed: false }))).toBe(true);
    expect(isComponentOpen(component('SW1', 'switch-spst', { closed: true }))).toBe(false);
    expect(isComponentOpen(component('PB1', 'pb-no', { state: 'released' }))).toBe(true);
    expect(isComponentOpen(component('PB1', 'pb-no', { state: 'pressed' }))).toBe(false);
  });

  it('clamps all wires in a simple series loop when a switch is open', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('SW1', 'sw-spst-no', { state: 'open' }),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w_src_sw', 'V1', 'pos', 'SW1', 'a'),
      wire('w_sw_r', 'SW1', 'b', 'R1', 'a'),
      wire('w_r_gnd', 'R1', 'b', 'GND', 'gnd'),
      wire('w_src_gnd', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const brokenWires = getBrokenWireIds(components, wires);
    expect(brokenWires.has('w_src_sw')).toBe(true);
    expect(brokenWires.has('w_sw_r')).toBe(true);
    expect(brokenWires.has('w_r_gnd')).toBe(true);
  });

  it('clamps all wires in a simple series loop when a resistor is burned', () => {
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('R1', 'resistor', { resistance: 100 }, { isBurned: true }),
      component('GND', 'ground'),
    ];
    const wires = [
      wire('w1', 'V1', 'pos', 'R1', 'a'),
      wire('w2', 'R1', 'b', 'GND', 'gnd'),
      wire('w3', 'V1', 'neg', 'GND', 'gnd'),
    ];

    const brokenWires = getBrokenWireIds(components, wires);
    expect(brokenWires.has('w1')).toBe(true);
    expect(brokenWires.has('w2')).toBe(true);
  });

  it('clamps ONLY the broken parallel branch, leaving healthy branches unaffected', () => {
    // V1 -> J1
    // J1 -> R1 (healthy) -> J2
    // J1 -> R2 (burned) -> J2
    // J2 -> V1
    const components = [
      component('V1', 'dc-voltage', { voltage: 12 }),
      component('R1', 'resistor', { resistance: 100 }),
      component('R2', 'resistor', { resistance: 200 }, { isBurned: true }),
    ];
    // In this circuit, R1:a and R2:a are connected to V1:pos (so V1:pos has 2 wires = junction)
    // R1:b and R2:b are connected to V1:neg (so V1:neg has 2 wires = junction)
    const wires = [
      wire('w_r1_top', 'V1', 'pos', 'R1', 'a'),
      wire('w_r1_bot', 'R1', 'b', 'V1', 'neg'),
      wire('w_r2_top', 'V1', 'pos', 'R2', 'a'),
      wire('w_r2_bot', 'R2', 'b', 'V1', 'neg'),
    ];

    const brokenWires = getBrokenWireIds(components, wires);
    // Burned branch R2 wires must be broken
    expect(brokenWires.has('w_r2_top')).toBe(true);
    expect(brokenWires.has('w_r2_bot')).toBe(true);

    // Healthy branch R1 wires must NOT be broken
    expect(brokenWires.has('w_r1_top')).toBe(false);
    expect(brokenWires.has('w_r1_bot')).toBe(false);
  });
});
