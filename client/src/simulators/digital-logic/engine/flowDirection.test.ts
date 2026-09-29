import { describe, expect, it } from 'vitest';
import { DiscreteEventLogicEngine } from '@/simulators/digital-logic/engine/desLogicCore';
import type { CircuitComponent, CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [10, 0]] });

describe('wire flow direction', () => {
  it('reverses only wires drawn input-pin → output-pin, including through junctions', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit(
      [component('a', 'digital-input', { state: 'HIGH' }), component('g', 'gate-and'), component('o', 'digital-output'), component('o2', 'digital-output')],
      [wire('fwd', 'a', 'out', 'g', 'a'), wire('rev', 'o', 'in', 'g', 'y'), wire('j1', 'g', 'y', 'junc_1', 'p'), wire('j2', 'o2', 'in', 'junc_1', 'p')],
    );
    expect(engine.isWireFlowReversed('fwd')).toBe(false);
    expect(engine.isWireFlowReversed('rev')).toBe(true);
    expect(engine.isWireFlowReversed('j1')).toBe(false);
    expect(engine.isWireFlowReversed('j2')).toBe(true);
  });
});
