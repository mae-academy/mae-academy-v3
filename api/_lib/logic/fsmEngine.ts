/** Advanced FSM Explorer — pure state, encoding, excitation, minimization, and HDL engine. */
import { solveKMap } from './kmapSolver';

import type { ExcitationRow, FlipFlopKind, FSMDefinition, FSMEncoding, FSMEquation, FSMKind, FSMState, FSMTransition, FSMValue, StateAssignment, StateTableRow } from '../../../shared/logic/fsmTypes';
export type { ExcitationRow, FlipFlopKind, FSMDefinition, FSMEncoding, FSMEquation, FSMKind, FSMState, FSMTransition, FSMValue, StateAssignment, StateTableRow };

const bit = (value: string | undefined): FSMValue => value === '0' || value === '1' ? value : 'X';
const bitWidth = (count: number, encoding: FSMEncoding) => encoding === 'One-Hot' ? count : Math.max(1, Math.ceil(Math.log2(Math.max(2, count))));
const binary = (value: number, width: number) => value.toString(2).padStart(width, '0');
const gray = (value: number, width: number) => binary(value ^ (value >> 1), width);
const canonicalTransitions = (machine: FSMDefinition, stateId: string, input: FSMValue) => machine.transitions.find(transition => transition.from === stateId && transition.input === input);

export const generateStateAssignments = (states: readonly FSMState[], encoding: FSMEncoding): StateAssignment[] => {
  if (!states.length) throw new Error('An FSM requires at least one state.');
  const width = bitWidth(states.length, encoding);
  return states.map((state, index) => ({
    stateId: state.id,
    name: state.name,
    code: encoding === 'Binary' ? binary(index, width) : encoding === 'Gray' ? gray(index, width) : binary(2 ** index, width),
  }));
};

const stateOutput = (machine: FSMDefinition, state: FSMState, transition: FSMTransition | undefined): FSMValue => machine.kind === 'Moore' ? state.output : transition?.output ?? '0';

/** Produces complete rows including unused encodings, which are deliberately marked X for minimization. */
export const generateStateTable = (machine: FSMDefinition, encoding: FSMEncoding): StateTableRow[] => {
  const assignments = generateStateAssignments(machine.states, encoding);
  const width = bitWidth(machine.states.length, encoding);
  const stateById = new Map(machine.states.map(state => [state.id, state]));
  const assignmentByCode = new Map(assignments.map(assignment => [assignment.code, assignment]));
  return Array.from({ length: 2 ** width }, (_, codeIndex) => binary(codeIndex, width)).flatMap(code => (['0', '1'] as FSMValue[]).map(input => {
    const assignment = assignmentByCode.get(code);
    const state = assignment ? stateById.get(assignment.stateId) : undefined;
    if (!assignment || !state) return { presentState: 'Unused', presentCode: code, input, nextState: 'X', nextCode: 'X'.repeat(width), output: 'X', unused: true };
    const transition = canonicalTransitions(machine, state.id, input);
    const next = transition ? stateById.get(transition.to) : state;
    const nextAssignment = next ? assignments.find(candidate => candidate.stateId === next.id) : undefined;
    return { presentState: state.name, presentCode: code, input, nextState: next?.name ?? 'X', nextCode: nextAssignment?.code ?? 'X'.repeat(width), output: stateOutput(machine, state, transition), unused: false };
  }));
};

const excitationForBit = (flipFlop: FlipFlopKind, current: FSMValue, next: FSMValue) => {
  if (current === 'X' || next === 'X') return flipFlop === 'JK' ? { J: 'X', K: 'X' } : flipFlop === 'SR' ? { S: 'X', R: 'X' } : { [flipFlop]: 'X' };
  if (flipFlop === 'D') return { D: next };
  if (flipFlop === 'T') return { T: current === next ? '0' : '1' };
  if (flipFlop === 'JK') return current === '0' && next === '0' ? { J: '0', K: 'X' } : current === '0' && next === '1' ? { J: '1', K: 'X' } : current === '1' && next === '0' ? { J: 'X', K: '1' } : { J: 'X', K: '0' };
  return current === '0' && next === '0' ? { S: '0', R: 'X' } : current === '0' && next === '1' ? { S: '1', R: '0' } : current === '1' && next === '0' ? { S: '0', R: '1' } : { S: 'X', R: '0' };
};

export const generateExcitationTable = (stateTable: readonly StateTableRow[], flipFlop: FlipFlopKind): ExcitationRow[] => stateTable.map(row => {
  const signals: Record<string, FSMValue> = {};
  Array.from(row.presentCode).forEach((current, index) => {
    const label = row.presentCode.length - 1 - index;
    const result = excitationForBit(flipFlop, bit(current), bit(row.nextCode[index]));
    Object.entries(result).forEach(([name, value]) => { signals[`${name}${label}`] = value; });
  });
  return { ...row, signals };
});

/** Sends excitation truth rows through the existing QMC/Petrick solver where the variable count is supported. */
export const minimizeExcitationEquations = (rows: readonly ExcitationRow[], inputName: string): FSMEquation[] => {
  if (!rows.length) return [];
  const stateWidth = rows[0].presentCode.length;
  const variables = [inputName, ...Array.from({ length: stateWidth }, (_, index) => String.fromCharCode(66 + index))];
  if (variables.length < 2 || variables.length > 5) return [];
  const aliases = new Map(variables.slice(1).map((variable, index) => [variable, `Q_{${stateWidth - 1 - index}}`]));
  const signalNames = Object.keys(rows[0].signals).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return signalNames.map(signalName => {
    const minterms: number[] = [];
    const dontCares: number[] = [];
    rows.forEach(row => {
      const index = Number.parseInt(`${row.input}${row.presentCode}`, 2);
      if (row.signals[signalName] === '1') minterms.push(index);
      if (row.signals[signalName] === 'X') dontCares.push(index);
    });
    const solution = solveKMap({ variables, minterms, dontCares });
    const latex = solution.latex.replace(/[B-E]/g, variable => aliases.get(variable) ?? variable);
    return { signal: signalName, latex: `${signalName.replace(/([A-Z])(\d+)/, '$1_{$2}')} = ${latex}`, minterms, dontCares };
  });
};

export const generateVerilog = (machine: FSMDefinition, encoding: FSMEncoding, moduleName = 'fsm_controller') => {
  const assignments = generateStateAssignments(machine.states, encoding);
  const width = bitWidth(machine.states.length, encoding);
  const declarations = assignments.map(assignment => `localparam [${width - 1}:0] ${assignment.name.toUpperCase()} = ${width}'b${assignment.code};`).join('\n  ');
  const stateById = new Map(machine.states.map(state => [state.id, state]));
  const nextCases = machine.states.map(state => {
    const zero = canonicalTransitions(machine, state.id, '0');
    const one = canonicalTransitions(machine, state.id, '1');
    const zeroState = stateById.get(zero?.to ?? state.id)?.name.toUpperCase() ?? state.name.toUpperCase();
    const oneState = stateById.get(one?.to ?? state.id)?.name.toUpperCase() ?? state.name.toUpperCase();
    return `      ${state.name.toUpperCase()}: if (${machine.inputName}) next_state = ${oneState}; else next_state = ${zeroState};`;
  }).join('\n');
  const outputCases = machine.states.map(state => {
    if (machine.kind === 'Moore') return `      ${state.name.toUpperCase()}: ${machine.outputName} = 1'b${state.output === 'X' ? '0' : state.output};`;
    const zero = canonicalTransitions(machine, state.id, '0')?.output ?? '0';
    const one = canonicalTransitions(machine, state.id, '1')?.output ?? '0';
    return `      ${state.name.toUpperCase()}: ${machine.outputName} = ${machine.inputName} ? 1'b${one === 'X' ? '0' : one} : 1'b${zero === 'X' ? '0' : zero};`;
  }).join('\n');
  return `module ${moduleName}(input wire clk, input wire rst, input wire ${machine.inputName}, output reg ${machine.outputName});
  reg [${width - 1}:0] state, next_state;
  ${declarations}

  // 1. Current-state register
  always @(posedge clk) begin
    if (rst) state <= ${assignments[0].name.toUpperCase()};
    else state <= next_state;
  end

  // 2. Next-state combinational logic
  always @(*) begin
    next_state = state;
    case (state)
${nextCases}
      default: next_state = ${assignments[0].name.toUpperCase()};
    endcase
  end

  // 3. Output combinational logic
  always @(*) begin
    ${machine.outputName} = 1'b0;
    case (state)
${outputCases}
      default: ${machine.outputName} = 1'b0;
    endcase
  end
endmodule`;
};
