import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../../../shared/logic/circuitTypes';
import { getDef } from '../../../shared/logic/componentDefs';
import { IdealLogicEngine } from './idealLogicEngine';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [25, 0]] });
const tables = { 'gate-and': [[false, false, false], [false, true, false], [true, false, false], [true, true, true]], 'gate-or': [[false, false, false], [false, true, true], [true, false, true], [true, true, true]], 'gate-nand': [[false, false, true], [false, true, true], [true, false, true], [true, true, false]], 'gate-nor': [[false, false, true], [false, true, false], [true, false, false], [true, true, false]], 'gate-xor': [[false, false, false], [false, true, true], [true, false, true], [true, true, false]], 'gate-xnor': [[false, false, true], [false, true, false], [true, false, false], [true, true, true]] } as const;

describe('Ideal Logic Engine', () => {
  it.each(Object.entries(tables))('%s matches its complete truth table without ground', (gate, rows) => rows.forEach(([a, b, expected]) => {
    const engine = new IdealLogicEngine();
    engine.setCircuit([component('A', 'digital-input', { state: a ? 'HIGH' : 'LOW' }), component('B', 'digital-input', { state: b ? 'HIGH' : 'LOW' }), component('G', gate), component('O', 'digital-output')], [wire('a', 'A', 'out', 'G', 'a'), wire('b', 'B', 'out', 'G', 'b'), wire('y', 'G', 'y', 'O', 'in')]);
    expect(engine.step().terminalVoltages['O:in']).toBe(expected ? 1 : 0);
  }));
  it('inverts NOT without a ground or voltage setting', () => {
    const engine = new IdealLogicEngine();
    engine.setCircuit([component('A', 'digital-input', { state: 'LOW' }), component('N', 'gate-not'), component('O', 'digital-output')], [wire('a', 'A', 'out', 'N', 'a'), wire('y', 'N', 'y', 'O', 'in')]);
    expect(engine.step().terminalVoltages['O:in']).toBe(1);
  });
  it('evaluates selectable three- and four-input gates with parity and all-input rules', () => {
    const engine = new IdealLogicEngine();
    engine.setCircuit([
      component('A', 'digital-input', { state: 'HIGH' }), component('B', 'digital-input', { state: 'HIGH' }), component('C', 'digital-input', { state: 'LOW' }), component('D', 'digital-input', { state: 'HIGH' }),
      component('X3', 'gate-xor', { inputCount: 3 }), component('N4', 'gate-nand', { inputCount: 4 }), component('OX', 'digital-output'), component('ON', 'digital-output'),
    ], [wire('a', 'A', 'out', 'X3', 'a'), wire('b', 'B', 'out', 'X3', 'b'), wire('c', 'C', 'out', 'X3', 'c'), wire('x', 'X3', 'y', 'OX', 'in'), wire('d1', 'A', 'out', 'N4', 'a'), wire('d2', 'B', 'out', 'N4', 'b'), wire('d3', 'C', 'out', 'N4', 'c'), wire('d4', 'D', 'out', 'N4', 'd'), wire('n', 'N4', 'y', 'ON', 'in')]);
    const snapshot = engine.step();
    expect(snapshot.terminalVoltages['OX:in']).toBe(0);
    expect(snapshot.terminalVoltages['ON:in']).toBe(1);
  });
  it('propagates the submitted chained program from three inputs through AND then OR into Logic Output', () => {
    const engine = new IdealLogicEngine();
    engine.setCircuit([
      component('I1', 'digital-input', { state: 'HIGH' }), component('I2', 'digital-input', { state: 'HIGH' }), component('I3', 'digital-input', { state: 'LOW' }),
      component('A', 'gate-and', { inputCount: 2 }), component('R', 'gate-or', { inputCount: 2 }), component('O1', 'digital-output'),
    ], [wire('i1', 'I1', 'out', 'A', 'a'), wire('i2', 'I2', 'out', 'A', 'b'), wire('and', 'A', 'y', 'R', 'a'), wire('i3', 'I3', 'out', 'R', 'b'), wire('out', 'R', 'y', 'O1', 'in')]);
    expect(engine.step().terminalVoltages['O1:in']).toBe(1);
  });
  it('propagates the submitted chained program when wires were started from gate inputs instead of source outputs', () => {
    const engine = new IdealLogicEngine();
    engine.setCircuit([
      component('I1', 'digital-input', { state: 'HIGH' }), component('I2', 'digital-input', { state: 'HIGH' }), component('I3', 'digital-input', { state: 'HIGH' }),
      component('A', 'gate-and', { inputCount: 2 }), component('R', 'gate-or', { inputCount: 2 }), component('O1', 'digital-output'),
    ], [wire('i1', 'A', 'a', 'I1', 'out'), wire('i2', 'A', 'b', 'I2', 'out'), wire('and', 'R', 'a', 'A', 'y'), wire('i3', 'R', 'b', 'I3', 'out'), wire('out', 'O1', 'in', 'R', 'y')]);
    expect(engine.step().terminalVoltages['O1:in']).toBe(1);
  });
  it('defines every visible logic component without a Ground terminal, voltage, or threshold property', () => {
    ['digital-input', 'digital-output', 'gate-and', 'gate-or', 'gate-not', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'].forEach(type => {
      const definition = getDef(type)!;
      expect(definition.terminals.some(terminal => terminal.id === 'gnd')).toBe(false);
      expect(Object.keys(definition.properties)).not.toContain('highVoltage');
      expect(Object.keys(definition.properties)).not.toContain('threshold');
    });
  });
});
