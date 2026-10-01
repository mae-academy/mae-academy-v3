import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';
import { compileNodalGeometry } from './useSimulation';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, path: [[0, 0], [20, 0]], routing: 'orthogonal' });

describe('Tab B visual topology: node label geometry', () => {
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
    expect(labels[0]).toMatchObject({ index: 1, label: 'V_1', color: '#2563eb', centroid: [115, 95] });
  });
});
