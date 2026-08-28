import { describe, expect, it } from 'vitest';
import { DiscreteEventLogicEngine } from './desLogicCore';
import type { CircuitComponent, CircuitWire } from './circuitTypes';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });
const logicState = (value: number) => value ? 'HIGH' : 'LOW';

describe('Combinational DES components', () => {
  it('computes Full Adder 1 + 1 + 1 as Sum=1 and Cout=1', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit(['a', 'b', 'cin'].map(id => component(id, 'digital-input', { state: 'HIGH' })).concat(component('adder', 'logic-full-adder')) as CircuitComponent[], [wire('a', 'a', 'out', 'adder', 'a'), wire('b', 'b', 'out', 'adder', 'b'), wire('cin', 'cin', 'out', 'adder', 'cin')]);
    expect(engine.getLogicState('adder', 'sum')).toBe(1); expect(engine.getLogicState('adder', 'cout')).toBe(1);
  });

  it('routes all four selector combinations through a 4×1 MUX', () => {
    [0, 1, 2, 3].forEach(index => {
      const engine = new DiscreteEventLogicEngine();
      const data = Array.from({ length: 4 }, (_, bit) => component(`d${bit}`, 'digital-input', { state: bit === index ? 'HIGH' : 'LOW' }));
      engine.setCircuit([...data, component('s0', 'digital-input', { state: logicState(index & 1) }), component('s1', 'digital-input', { state: logicState(index >> 1) }), component('mux', 'logic-mux', { selectorCount: 2 })], [
        ...data.map((entry, bit) => wire(`d${bit}`, entry.id, 'out', 'mux', `d${bit}`)), wire('s0', 's0', 'out', 'mux', 's0'), wire('s1', 's1', 'out', 'mux', 's1'),
      ]);
      expect(engine.getLogicState('mux', 'y')).toBe(1);
    });
  });

  it('sets exactly one active-high decoder output and clears the rest', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('s0', 'digital-input', { state: 'HIGH' }), component('s1', 'digital-input', { state: 'LOW' }), component('en', 'digital-input', { state: 'HIGH' }), component('decoder', 'logic-decoder', { selectorCount: 2 })], [wire('s0', 's0', 'out', 'decoder', 's0'), wire('s1', 's1', 'out', 'decoder', 's1'), wire('en', 'en', 'out', 'decoder', 'en')]);
    expect([0, 1, 2, 3].map(bit => engine.getLogicState('decoder', `y${bit}`))).toEqual([0, 1, 0, 0]);
  });

  it('generates/checks even parity and executes the 4-bit ALU add operation', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([
      component('d0', 'digital-input', { state: 'HIGH' }), component('d1', 'digital-input', { state: 'LOW' }), component('d2', 'digital-input', { state: 'HIGH' }), component('d3', 'digital-input', { state: 'LOW' }), component('p', 'digital-input', { state: 'LOW' }), component('parity', 'logic-parity'),
      ...[0, 1, 2, 3].flatMap(bit => [component(`a${bit}`, 'digital-input', { state: logicState((3 >> bit) & 1) }), component(`b${bit}`, 'digital-input', { state: logicState((5 >> bit) & 1) })]), component('op0', 'digital-input', { state: 'LOW' }), component('op1', 'digital-input', { state: 'LOW' }), component('cin', 'digital-input', { state: 'LOW' }), component('alu', 'logic-alu-4bit'),
    ], [
      ...['d0', 'd1', 'd2', 'd3', 'p'].map(pin => wire(`p-${pin}`, pin, 'out', 'parity', pin)),
      ...[0, 1, 2, 3].flatMap(bit => [wire(`a-${bit}`, `a${bit}`, 'out', 'alu', `a${bit}`), wire(`b-${bit}`, `b${bit}`, 'out', 'alu', `b${bit}`)]), wire('op0', 'op0', 'out', 'alu', 'op0'), wire('op1', 'op1', 'out', 'alu', 'op1'), wire('cin', 'cin', 'out', 'alu', 'cin'),
    ]);
    expect(engine.getLogicState('parity', 'even')).toBe(0); expect(engine.getLogicState('parity', 'valid')).toBe(1);
    expect([0, 1, 2, 3].map(bit => engine.getLogicState('alu', `y${bit}`))).toEqual([0, 0, 0, 1]);
  });
});
