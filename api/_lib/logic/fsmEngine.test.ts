import { describe, expect, it } from 'vitest';
import { createDefaultFSM } from '../../../shared/logic/fsmTypes';
import { generateExcitationTable, generateStateAssignments, generateStateTable, generateVerilog, minimizeExcitationEquations } from './fsmEngine';
import type { FSMDefinition } from './fsmEngine';

describe('fsmEngine', () => {
  const machine = createDefaultFSM();

  it('assigns binary, Gray, and one-hot codes deterministically', () => {
    expect(generateStateAssignments(machine.states, 'Binary').map(state => state.code)).toEqual(['00', '01', '10']);
    expect(generateStateAssignments(machine.states, 'Gray').map(state => state.code)).toEqual(['00', '01', '11']);
    expect(generateStateAssignments(machine.states, 'One-Hot').map(state => state.code)).toEqual(['001', '010', '100']);
  });

  it('marks every unused binary encoding as a complete dont-care row', () => {
    const rows = generateStateTable(machine, 'Binary');
    expect(rows).toHaveLength(8);
    expect(rows.filter(row => row.unused)).toEqual([
      expect.objectContaining({ presentCode: '11', input: '0', nextCode: 'XX', output: 'X' }),
      expect.objectContaining({ presentCode: '11', input: '1', nextCode: 'XX', output: 'X' }),
    ]);
  });

  it('generates mathematically correct D, T, JK, and SR excitation values', () => {
    const row = generateStateTable(machine, 'Binary').find(candidate => candidate.presentCode === '01' && candidate.input === '0');
    if (!row) throw new Error('Expected S1 input-0 row.');
    expect(generateExcitationTable([row], 'D')[0].signals).toEqual({ D1: '1', D0: '0' });
    expect(generateExcitationTable([row], 'T')[0].signals).toEqual({ T1: '1', T0: '1' });
    expect(generateExcitationTable([row], 'JK')[0].signals).toEqual({ J1: '1', K1: 'X', J0: 'X', K0: '1' });
    expect(generateExcitationTable([row], 'SR')[0].signals).toEqual({ S1: '1', R1: '0', S0: '0', R0: '1' });
  });

  it('minimizes excitation outputs through K-Map and emits a three-block Verilog module', () => {
    const equations = minimizeExcitationEquations(generateExcitationTable(generateStateTable(machine, 'Binary'), 'D'), 'A');
    expect(equations.map(equation => equation.signal)).toEqual(['D0', 'D1']);
    expect(equations[0].latex).toContain('D_{0} =');
    const verilog = generateVerilog(machine, 'Binary');
    expect(verilog).toContain('always @(posedge clk)');
    expect((verilog.match(/always @\(\*\)/g) ?? [])).toHaveLength(2);
  });

  it('marks all three unused codes as dont-cares for a five-state Mealy machine using three flip-flops', () => {
    const mealy: FSMDefinition = {
      kind: 'Mealy', inputName: 'A', outputName: 'Y',
      states: [
        { id: 'S0', name: 'S0', output: '0', x: 0, y: 0 }, { id: 'S1', name: 'S1', output: '0', x: 0, y: 0 },
        { id: 'S2', name: 'S2', output: '0', x: 0, y: 0 }, { id: 'S3', name: 'S3', output: '0', x: 0, y: 0 },
        { id: 'S4', name: 'S4', output: '0', x: 0, y: 0 },
      ],
      transitions: [
        { id: 't00', from: 'S0', to: 'S0', input: '0', output: '0' }, { id: 't01', from: 'S0', to: 'S1', input: '1', output: '1' },
        { id: 't10', from: 'S1', to: 'S2', input: '0', output: '0' }, { id: 't11', from: 'S1', to: 'S0', input: '1', output: '1' },
        { id: 't20', from: 'S2', to: 'S3', input: '0', output: '1' }, { id: 't21', from: 'S2', to: 'S1', input: '1', output: '0' },
        { id: 't30', from: 'S3', to: 'S4', input: '0', output: '1' }, { id: 't31', from: 'S3', to: 'S2', input: '1', output: '0' },
        { id: 't40', from: 'S4', to: 'S0', input: '0', output: '0' }, { id: 't41', from: 'S4', to: 'S3', input: '1', output: '1' },
      ],
    };
    const rows = generateStateTable(mealy, 'Binary');
    const unused = rows.filter(row => row.unused);

    expect(generateStateAssignments(mealy.states, 'Binary').map(state => state.code)).toEqual(['000', '001', '010', '011', '100']);
    expect(rows).toHaveLength(16);
    expect(unused).toHaveLength(6);
    expect(unused.every(row => row.nextCode === 'XXX' && row.output === 'X')).toBe(true);
    expect(generateExcitationTable(unused, 'T').every(row => Object.values(row.signals).every(value => value === 'X'))).toBe(true);
    expect(generateExcitationTable(unused, 'JK').every(row => Object.values(row.signals).every(value => value === 'X'))).toBe(true);
  });
});
