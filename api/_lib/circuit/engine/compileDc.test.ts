import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../../../../shared/circuit/circuitTypes';
import { MNASolver } from './mnaSolver';
import { compileDcTopology } from './compileDc';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, path: [[0, 0], [20, 0]], routing: 'orthogonal' });

describe('Tab B visual topology to MNA compilation', () => {
  it('maps a grounded source-resistor canvas into an exact 12 V MNA solution', () => {
    const elements = compileDcTopology([
      component('g', 'ground'), component('v', 'dc-voltage', { voltage: 12 }), component('r', 'resistor', { resistance: 1000 }),
    ], [wire('w1', 'g', 'gnd', 'v', 'neg'), wire('w2', 'v', 'pos', 'r', 'a'), wire('w3', 'r', 'b', 'g', 'gnd')]);
    const result = new MNASolver(elements).solve();
    expect(Object.values(result.nodeVoltages).some((value: any) => Math.abs(value - 12) < 1e-10)).toBe(true);
  });

  it('compiles a positive-only DC rail directly against the ground reference without a phantom negative terminal', () => {
    const elements = compileDcTopology([
      component('g', 'ground'), component('rail', 'dc-rail', { voltage: 24 }), component('r', 'resistor', { resistance: 1000 }),
    ], [wire('w1', 'rail', 'pos', 'r', 'a'), wire('w2', 'r', 'b', 'g', 'gnd')]);
    const rail = elements.find((element: any) => element.id === 'rail') as Extract<typeof elements[number], { type: 'voltage' }>;
    expect(rail).toMatchObject({ positive: expect.not.stringMatching(/rail:neg/), negative: '0', voltage: 24 });
    expect(Object.values(new MNASolver(elements).solve().nodeVoltages).some((value: any) => Math.abs(value - 24) < 1e-10)).toBe(true);
  });

  it('expands grouped Star and Delta packs into three resistor MNA branches each', () => {
    const star = compileDcTopology([component('star', 'star-resistor-pack', { rA: 30, rB: 40, rC: 50 })], []);
    const delta = compileDcTopology([component('delta', 'delta-resistor-pack', { rAB: 30, rBC: 40, rCA: 50 })], []);
    expect(star).toHaveLength(3); expect(delta).toHaveLength(3);
    expect(star.map((item: any) => item.type)).toEqual(['resistor', 'resistor', 'resistor']);
    expect(delta.map((item: any) => item.type)).toEqual(['resistor', 'resistor', 'resistor']);
    expect((star[0] as { negative: string }).negative).toContain('internal:star:star');
  });

  it('never inserts a parallel 0 V control branch for current-controlled visual sources', () => {
    const elements = compileDcTopology([component('f', 'cccs', { gain: 4, controlSourceId: 'Vsense' }), component('h', 'ccvs', { transresistance: 1500, controlSourceId: 'Vsense' })], []);
    expect(elements.filter((item: any) => item.type === 'current-sense')).toHaveLength(0);
    expect(elements.filter((item: any) => item.type === 'cccs' || item.type === 'ccvs')).toHaveLength(2);
    expect((elements.find((item: any) => item.type === 'cccs') as { controlSourceId: string }).controlSourceId).toBe('Vsense');
  });

  it('keeps VCCS and VCVS control terminals separate from their output terminals', () => {
    const elements = compileDcTopology([component('g', 'ground'), component('gm', 'vccs', { transconductance: .01 }), component('gain', 'vcvs', { gain: 10 })], []);
    const vccs = elements.find((item: any) => item.type === 'vccs') as Extract<typeof elements[number], { type: 'vccs' }>;
    const vcvs = elements.find((item: any) => item.type === 'vcvs') as Extract<typeof elements[number], { type: 'vcvs' }>;
    expect(vccs.controlPositive).not.toBe(vccs.positive);
    expect(vcvs.controlNegative).not.toBe(vcvs.negative);
  });

  // The dc-current symbol's arrow points at its `pos` pin, so conventional current EXITS `pos` into
  // the external circuit. MNAElement.current is SPICE-oriented (flow runs `from`->`to` INSIDE the
  // source), so `pos` must compile to `to`; the same 2A-into-10Ω case is pinned against real
  // ngspice.wasm in spice/ngspiceRegression.currentSources.test.ts.
  it('compiles a DC current source with its schematic arrow direction, so the MNA RHS is not inverted', () => {
    const components = [component('g', 'ground'), component('i1', 'dc-current', { current: 2 }), component('r1', 'resistor', { resistance: 10 })];
    const elements = compileDcTopology(components, [
      wire('w1', 'i1', 'pos', 'r1', 'a'), wire('w2', 'r1', 'b', 'g', 'gnd'), wire('w3', 'i1', 'neg', 'g', 'gnd'),
    ]);
    const source = elements.find((item: any) => item.type === 'current') as Extract<typeof elements[number], { type: 'current' }>;
    const driven = elements.find((item: any) => item.type === 'resistor') as Extract<typeof elements[number], { type: 'resistor' }>;
    expect(source.from).toBe('0');
    expect(source.to).toBe(driven.positive);

    const result = new MNASolver(elements).solve();
    // Current is INJECTED into the driven node: RHS = +2, node rises to +I·R = +20 V (never -20 V).
    expect(result.rhs).toEqual([2]);
    expect(result.nodeVoltages[driven.positive]).toBeCloseTo(20, 9);
  });
});
