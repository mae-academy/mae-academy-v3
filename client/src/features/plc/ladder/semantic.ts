/** PLC Ladder backend contract: semantic validation occurs after parsing and before code generation. */
import type { LDInstruction, LDParameter, LDProgram, PlcAoi, PlcDataType, PlcDiagnostic, PlcInstructionType, PlcTag } from './types';

const ARITY: Partial<Record<PlcInstructionType, number | [number, number]>> = {
  XIC: 1, XIO: 1, ONS: 1, OTE: 1, OTL: 1, OTU: 1, AFI: 0, NOP: 0,
  OSR: 2, OSF: 2, TON: 1, TOF: 1, RTO: 1, CTU: 1, CTD: 1, RES: 1,
  CTUD: [3, 4], TONR: 1, TOFR: 1, RTOR: 1, OSRI: 1, OSFI: 1,
  MOV: 2, ADD: 3, SUB: 3, MUL: 3, DIV: 3, MOD: 3, NEG: 2, ABS: 2, SQRT: 2, SIN: 2, COS: 2, TAN: 2,
  AND: 3, OR: 3, XOR: 3, NOT: 2, MVM: 3, BTD: 5,
  EQU: 2, NEQ: 2, GRT: 2, GEQ: 2, LES: 2, LEQ: 2, LIM: 3,
};

const BOOL_INPUTS = new Set<PlcInstructionType>(['XIC', 'XIO', 'ONS', 'OTE', 'OTL', 'OTU']);
const STRUCTURED: Partial<Record<PlcInstructionType, PlcDataType[]>> = {
  TON: ['TIMER'], TOF: ['TIMER'], RTO: ['TIMER'], CTU: ['COUNTER'], CTD: ['COUNTER'], CTUD: ['FBD_COUNTER'], RES: ['TIMER', 'COUNTER', 'FBD_TIMER', 'FBD_COUNTER'],
  TONR: ['FBD_TIMER'], TOFR: ['FBD_TIMER'], RTOR: ['FBD_TIMER'], OSRI: ['FBD_ONESHOT'], OSFI: ['FBD_ONESHOT'],
};
const BOOL_MEMBERS = new Set(['EN', 'TT', 'DN', 'CU', 'CD', 'OV', 'UN', 'EnableIn', 'TimerEnable', 'Reset', 'EnableOut', 'InstructFault', 'PresetInv', 'CUEnable', 'CDEnable', 'InputBit', 'OutputBit']);

function parameterDataType(parameter: LDParameter, tag: PlcTag | undefined): PlcDataType | undefined {
  if (!tag) return undefined;
  if (parameter.type === 'LDMemberAccess') return BOOL_MEMBERS.has(parameter.member) ? 'BOOL' : tag.dataType;
  return tag.dataType;
}

function parameterBaseName(parameter: LDParameter): string | null {
  if (parameter.type === 'LDTagReference') return parameter.name;
  if (parameter.type === 'LDMemberAccess') return parameterBaseName(parameter.object);
  if (parameter.type === 'LDIndexedAccess') return parameterBaseName(parameter.target);
  return null;
}

function tagFor(parameter: LDParameter, tags: Map<string, PlcTag>): PlcTag | undefined { const name = parameterBaseName(parameter); return name ? tags.get(name) : undefined; }
function isWritable(parameter: LDParameter): boolean { return parameter.type !== 'LDNumericLiteral'; }

function validateParameter(parameter: LDParameter, tags: Map<string, PlcTag>, diagnostics: PlcDiagnostic[], rung: number): PlcTag | undefined {
  if (parameter.type === 'LDNumericLiteral') return undefined;
  if (parameter.type === 'LDTagReference') {
    const tag = tags.get(parameter.name);
    if (!tag) diagnostics.push({ severity: 'error', code: 'LD-SEM-001', message: `Unknown tag ${parameter.name}.`, rung, element: parameter.nodeId, location: parameter.location });
    return tag;
  }
  if (parameter.type === 'LDMemberAccess') {
    const tag = validateParameter(parameter.object, tags, diagnostics, rung);
    if (tag && !['TIMER', 'COUNTER', 'FBD_TIMER', 'FBD_COUNTER', 'FBD_ONESHOT'].includes(tag.dataType)) diagnostics.push({ severity: 'error', code: 'LD-SEM-002', message: `${tag.name} does not support member access.`, rung, element: parameter.nodeId, location: parameter.location });
    return tag;
  }
  const tag = validateParameter(parameter.target, tags, diagnostics, rung);
  if (tag && !tag.dimension) diagnostics.push({ severity: 'error', code: 'LD-SEM-003', message: `${tag.name} is not an array.`, rung, element: parameter.nodeId, location: parameter.location });
  validateParameter(parameter.index, tags, diagnostics, rung);
  return tag;
}

function validateInstruction(instruction: LDInstruction, tags: Map<string, PlcTag>, diagnostics: PlcDiagnostic[], rung: number) {
  const expected = ARITY[instruction.instructionType];
  if (expected !== undefined) {
    const valid = typeof expected === 'number' ? instruction.parameters.length === expected : instruction.parameters.length >= expected[0] && instruction.parameters.length <= expected[1];
    if (!valid) diagnostics.push({ severity: 'error', code: 'LD-SEM-004', message: `${instruction.instructionType} expects ${typeof expected === 'number' ? expected : `${expected[0]}–${expected[1]}`} operand(s).`, rung, element: instruction.nodeId, location: instruction.location });
  }
  const resolved = instruction.parameters.map(parameter => validateParameter(parameter, tags, diagnostics, rung));
  if (BOOL_INPUTS.has(instruction.instructionType) && resolved[0] && parameterDataType(instruction.parameters[0], resolved[0]) !== 'BOOL') diagnostics.push({ severity: 'error', code: 'LD-SEM-005', message: `${instruction.instructionType} requires a BOOL operand.`, rung, element: instruction.nodeId, location: instruction.location });
  const structured = STRUCTURED[instruction.instructionType];
  if (structured && resolved[0] && !structured.includes(resolved[0].dataType)) diagnostics.push({ severity: 'error', code: 'LD-SEM-006', message: `${instruction.instructionType} requires ${structured.join(' or ')}.`, rung, element: instruction.nodeId, location: instruction.location });
  const writes = instruction.instructionType === 'OTE' || instruction.instructionType === 'OTL' || instruction.instructionType === 'OTU' ? [0]
    : instruction.instructionType === 'OSR' || instruction.instructionType === 'OSF' ? [0, 1]
      : ['MOV', 'NEG', 'ABS', 'SQRT', 'SIN', 'COS', 'TAN', 'NOT'].includes(instruction.instructionType) ? [instruction.parameters.length - 1]
        : ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'AND', 'OR', 'XOR', 'MVM', 'BTD'].includes(instruction.instructionType) ? [instruction.parameters.length - 1] : [];
  for (const index of writes) if (instruction.parameters[index] && !isWritable(instruction.parameters[index])) diagnostics.push({ severity: 'error', code: 'LD-SEM-007', message: `${instruction.instructionType} destination must be a writable tag.`, rung, element: instruction.nodeId, location: instruction.location });
}

export function validateLadderAst(ast: LDProgram, aoi: Pick<PlcAoi, 'tags'>): PlcDiagnostic[] {
  const diagnostics: PlcDiagnostic[] = [];
  const tags = new Map<string, PlcTag>();
  for (const tag of aoi.tags) {
    if (tags.has(tag.name)) diagnostics.push({ severity: 'error', code: 'LD-SEM-008', message: `Duplicate tag ${tag.name}.` });
    else tags.set(tag.name, tag);
  }
  const visitCircuit = (circuit: LDProgram['rungs'][number]['circuit'], rung: number) => circuit.elements.forEach(element => {
    if (element.type === 'LDInstruction') validateInstruction(element, tags, diagnostics, rung);
    else element.circuits.forEach(child => visitCircuit(child, rung));
  });
  ast.rungs.forEach(rung => visitCircuit(rung.circuit, rung.index));
  return diagnostics;
}
