import { describe, expect, it } from 'vitest';
import { DiscreteEventLogicEngine, invertLogic, logicAnd, logicOr, logicXor } from '@/simulators/digital-logic/engine/desLogicCore';
import type { CircuitComponent, CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('Logic gate truth tables', () => {
  const pairs: Array<[0 | 1, 0 | 1]> = [[0, 0], [0, 1], [1, 0], [1, 1]];
  it('matches every two-input truth-table row for AND, OR, NAND, NOR, XOR, and XNOR', () => {
    pairs.forEach(([a, b]) => {
      const and = logicAnd([a, b]); const or = logicOr([a, b]); const xor = logicXor([a, b]);
      expect(and).toBe((a & b) as 0 | 1);
      expect(or).toBe((a | b) as 0 | 1);
      expect(invertLogic(and)).toBe((a & b ? 0 : 1) as 0 | 1);
      expect(invertLogic(or)).toBe((a | b ? 0 : 1) as 0 | 1);
      expect(xor).toBe((a ^ b) as 0 | 1);
      expect(invertLogic(xor)).toBe((a ^ b ? 0 : 1) as 0 | 1);
    });
  });

  it('implements the NOT truth table exactly', () => { expect(invertLogic(0)).toBe(1); expect(invertLogic(1)).toBe(0); });

  it('returns 1 for a four-input AND only when every input is 1', () => {
    const run = (states: Array<'LOW' | 'HIGH'>) => {
      const engine = new DiscreteEventLogicEngine();
      const inputs = states.map((state, index) => component(`i${index}`, 'digital-input', { state }));
      engine.setCircuit([...inputs, component('and', 'gate-and', { inputCount: 4 }), component('out', 'digital-output')], [
        ...inputs.map((input, index) => wire(`w${index}`, input.id, 'out', 'and', ['a', 'b', 'c', 'd'][index])), wire('out', 'and', 'y', 'out', 'in'),
      ]);
      return engine.getLogicState('out', 'in');
    };
    expect(run(['HIGH', 'HIGH', 'HIGH', 'HIGH'])).toBe(1);
    expect(run(['HIGH', 'HIGH', 'LOW', 'HIGH'])).toBe(0);
  });
});
