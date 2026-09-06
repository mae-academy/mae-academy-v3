import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';
import { MNASolver } from '@/simulators/digital-logic/engine/mnaSolver';
import { compileDcTopology, compileNodalGeometry } from './useDigitalLogicSimulation';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, path: [[0, 0], [20, 0]], routing: 'orthogonal' });

describe('Tab B visual topology to MNA compilation', () => {
  it('maps a grounded source-resistor canvas into an exact 12 V MNA solution', () => {
    const elements = compileDcTopology([
      component('g', 'ground'), component('v', 'dc-voltage', { voltage: 12 }), component('r', 'resistor', { resistance: 1000 }),
    ], [wire('w1', 'g', 'gnd', 'v', 'neg'), wire('w2', 'v', 'pos', 'r', 'a'), wire('w3', 'r', 'b', 'g', 'gnd')]);
    const result = new MNASolver(elements).solve();
    expect(Object.values(result.nodeVoltages).some(value => Math.abs(value - 12) < 1e-10)).toBe(true);
  });

  it('expands grouped Star and Delta packs into three resistor MNA branches each', () => {
    const star = compileDcTopology([component('star', 'star-resistor-pack', { rA: 30, rB: 40, rC: 50 })], []);
    const delta = compileDcTopology([component('delta', 'delta-resistor-pack', { rAB: 30, rBC: 40, rCA: 50 })], []);
    expect(star).toHaveLength(3); expect(delta).toHaveLength(3);
    expect(star.map(item => item.type)).toEqual(['resistor', 'resistor', 'resistor']);
    expect(delta.map(item => item.type)).toEqual(['resistor', 'resistor', 'resistor']);
    expect((star[0] as { negative: string }).negative).toContain('internal:star:star');
  });

  it('never inserts a parallel 0 V control branch for current-controlled visual sources', () => {
    const elements = compileDcTopology([component('f', 'cccs', { gain: 4, controlSourceId: 'Vsense' }), component('h', 'ccvs', { transresistance: 1500, controlSourceId: 'Vsense' })], []);
    expect(elements.filter(item => item.type === 'current-sense')).toHaveLength(0);
    expect(elements.filter(item => item.type === 'cccs' || item.type === 'ccvs')).toHaveLength(2);
    expect((elements.find(item => item.type === 'cccs') as { controlSourceId: string }).controlSourceId).toBe('Vsense');
  });

  it('keeps VCCS and VCVS control terminals separate from their output terminals', () => {
    const elements = compileDcTopology([component('g', 'ground'), component('gm', 'vccs', { transconductance: .01 }), component('gain', 'vcvs', { gain: 10 })], []);
    const vccs = elements.find(item => item.type === 'vccs') as Extract<typeof elements[number], { type: 'vccs' }>;
    const vcvs = elements.find(item => item.type === 'vcvs') as Extract<typeof elements[number], { type: 'vcvs' }>;
    expect(vccs.controlPositive).not.toBe(vccs.positive);
    expect(vcvs.controlNegative).not.toBe(vcvs.negative);
  });

  it('derives an independent node label centroid from all connected visual pins and wire points', () => {
    const source = { ...component('v', 'dc-voltage', { voltage: 12 }), x: 100, y: 130 };
    const resistor = { ...component('r', 'resistor', { resistance: 1000 }), x: 160, y: 100 };
    const ground = { ...component('g', 'ground'), x: 190, y: 175 };
    const labels = compileNodalGeometry([source, resistor, ground], [
      { ...wire('w1', 'v', 'pos', 'r', 'a'), path: [[100, 100], [130, 100]] },
      { ...wire('w2', 'r', 'b', 'g', 'gnd'), path: [[190, 100], [190, 160]] },
      { ...wire('w3', 'g', 'gnd', 'v', 'neg'), path: [[190, 160], [100, 160]] },
    ]);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ index: 1, label: 'V_1', color: '#2563eb', centroid: [115, 100] });
  });
});
