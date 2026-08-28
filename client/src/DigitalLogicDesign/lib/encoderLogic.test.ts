import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { DiscreteEventLogicEngine, logicPinsFor } from './desLogicCore';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm: 'out', toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [25, 0]] });

describe('Ordinary scalable Encoder', () => {
  const run = (selectorCount: number, active: number[]) => {
    const inputCount = 2 ** selectorCount;
    const inputs = Array.from({ length: inputCount }, (_, index) => component(`d${index}`, 'digital-input', { state: active.includes(index) ? 'HIGH' : 'LOW' }));
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([...inputs, component('encoder', 'logic-encoder', { selectorCount })], inputs.map((input, index) => wire(`d${index}-encoder`, input.id, 'encoder', `d${index}`)));
    return engine;
  };

  it.each([[0, [0, 0]], [1, [1, 0]], [2, [0, 1]], [3, [1, 1]]])('encodes the one-hot 4-input state D%s into its binary output', (active, expected) => {
    const engine = run(2, [active]);
    expect([engine.getLogicState('encoder', 'y0'), engine.getLogicState('encoder', 'y1')]).toEqual(expected);
    expect(engine.getLogicState('encoder', 'valid')).toBe(1);
  });

  it('reports a deterministic inactive state when no data input is asserted', () => {
    const engine = run(2, []);
    expect([engine.getLogicState('encoder', 'y0'), engine.getLogicState('encoder', 'y1'), engine.getLogicState('encoder', 'valid')]).toEqual([0, 0, 0]);
  });

  it('reports X rather than silently prioritizing an invalid multiple-active state', () => {
    const engine = run(2, [1, 2]);
    expect([engine.getLogicState('encoder', 'y0'), engine.getLogicState('encoder', 'y1'), engine.getLogicState('encoder', 'valid')]).toEqual(['X', 'X', 'X']);
  });

  it('scales to an 8-input encoder with three binary output bits', () => {
    const engine = run(3, [7]);
    expect([engine.getLogicState('encoder', 'y0'), engine.getLogicState('encoder', 'y1'), engine.getLogicState('encoder', 'y2'), engine.getLogicState('encoder', 'valid')]).toEqual([1, 1, 1, 1]);
    expect(logicPinsFor(component('encoder', 'logic-encoder', { selectorCount: 3 }))).toEqual({ inputs: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'], outputs: ['y0', 'y1', 'y2', 'valid'] });
  });
});
