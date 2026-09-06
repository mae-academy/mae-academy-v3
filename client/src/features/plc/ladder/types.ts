/**
 * PLC Ladder backend contract.
 * This module is intentionally UI-free: the later editor may serialize its DOM state
 * into this AST, but execution never depends on React, SVG, Canvas, or editor layout.
 */

export type PlcDataType = 'BOOL' | 'DINT' | 'REAL' | 'TIMER' | 'COUNTER' | 'FBD_TIMER' | 'FBD_COUNTER' | 'FBD_ONESHOT';
export type PlcTagUsage = 'in' | 'out' | 'inout' | 'local';
export type PlcRoutineType = 'ld' | 'st';
export type PlcScanMode = 'prescan' | 'normal';

export interface PlcTag {
  name: string;
  dataType: PlcDataType;
  usage: PlcTagUsage;
  dimension?: number;
  defaultValue?: unknown;
  description?: string;
}

export interface PlcRoutine {
  type: PlcRoutineType;
  content: string;
  description?: string;
}

export interface PlcAoi {
  name: string;
  description: string;
  tags: PlcTag[];
  routines: Record<string, PlcRoutine>;
}

export interface SourceLocation {
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface LDNumericLiteral {
  type: 'LDNumericLiteral';
  value: number;
  dataType: 'DINT' | 'REAL';
  location?: SourceLocation;
  nodeId: string;
}

export interface LDTagReference {
  type: 'LDTagReference';
  name: string;
  location?: SourceLocation;
  nodeId: string;
}

export interface LDMemberAccess {
  type: 'LDMemberAccess';
  object: LDParameter;
  member: string;
  location?: SourceLocation;
  nodeId: string;
}

export interface LDIndexedAccess {
  type: 'LDIndexedAccess';
  target: LDParameter;
  index: LDParameter;
  location?: SourceLocation;
  nodeId: string;
}

export type LDParameter = LDNumericLiteral | LDTagReference | LDMemberAccess | LDIndexedAccess;

export type PlcInstructionType =
  | 'XIC' | 'XIO' | 'ONS' | 'OSR' | 'OSF' | 'OTE' | 'OTL' | 'OTU' | 'AFI' | 'NOP'
  | 'TON' | 'TOF' | 'RTO' | 'CTU' | 'CTD' | 'CTUD' | 'RES'
  | 'TONR' | 'TOFR' | 'RTOR' | 'OSRI' | 'OSFI'
  | 'MOV' | 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD' | 'NEG' | 'ABS' | 'SQRT' | 'SIN' | 'COS' | 'TAN'
  | 'AND' | 'OR' | 'XOR' | 'NOT' | 'MVM' | 'BTD'
  | 'EQU' | 'NEQ' | 'GRT' | 'GEQ' | 'LES' | 'LEQ' | 'LIM';

export interface LDInstruction {
  type: 'LDInstruction';
  instructionType: PlcInstructionType;
  parameters: LDParameter[];
  location?: SourceLocation;
  nodeId: string;
}

export interface LDCircuit {
  type: 'LDCircuit';
  elements: Array<LDInstruction | LDBranch>;
  location?: SourceLocation;
  nodeId: string;
}

export interface LDBranch {
  type: 'LDBranch';
  circuits: LDCircuit[];
  location?: SourceLocation;
  nodeId: string;
}

export interface LDRung {
  type: 'LDRung';
  index: number;
  circuit: LDCircuit;
  location?: SourceLocation;
  nodeId: string;
}

export interface LDProgram {
  type: 'LDProgram';
  rungs: LDRung[];
}

export interface PlcTimerValue {
  PRE: number;
  ACC: number;
  EN: boolean;
  TT: boolean;
  DN: boolean;
  __timerState?: PlcTimerHiddenState;
}

export interface PlcCounterValue {
  PRE: number;
  ACC: number;
  CU: boolean;
  CD: boolean;
  DN: boolean;
  OV: boolean;
  UN: boolean;
  __ctudState?: PlcCounterHiddenState;
}

export interface PlcFbdTimerValue extends PlcTimerValue {
  EnableIn: boolean;
  TimerEnable: boolean;
  Reset: boolean;
  EnableOut: boolean;
  Status: number;
  InstructFault: boolean;
  PresetInv: boolean;
}

export interface PlcFbdCounterValue extends PlcCounterValue {
  EnableIn: boolean;
  CUEnable: boolean;
  CDEnable: boolean;
  Reset: boolean;
  EnableOut: boolean;
}

export interface PlcFbdOneShotValue {
  EnableIn: boolean;
  InputBit: boolean;
  EnableOut: boolean;
  OutputBit: boolean;
  __oneShotState?: PlcOneShotHiddenState;
}

export interface PlcTimerHiddenState {
  version: 1;
  family: 'TON' | 'TOF' | 'RTO' | 'TONR' | 'TOFR' | 'RTOR';
  kind: 'ladder' | 'fbd';
  accUs: number;
  lastExecUs: number;
  lastInput: 0 | 1;
  lastPublishedAccMs: number;
  dn: 0 | 1;
  tofrNeedsPreset: boolean;
}

export interface PlcCounterHiddenState {
  lastCuEnable: 0 | 1;
  lastCdEnable: 0 | 1;
  acc: number;
}

export interface PlcOneShotHiddenState {
  lastInput: 0 | 1;
}

export type PlcRuntimeValue = boolean | number | PlcTimerValue | PlcCounterValue | PlcFbdTimerValue | PlcFbdCounterValue | PlcFbdOneShotValue | PlcRuntimeValue[];
export type PlcVariableMap = Map<string, PlcRuntimeValue>;

export type PlcDiagnosticSeverity = 'error' | 'warning';
export interface PlcDiagnostic {
  severity: PlcDiagnosticSeverity;
  code: string;
  message: string;
  rung?: number;
  element?: string;
  location?: SourceLocation;
}

export interface PlcInstructionTrace {
  nodeId: string;
  instructionType: PlcInstructionType;
  inputPower: boolean;
  outputPower: boolean;
  operands: Record<string, unknown>;
}

export interface PlcRungTrace {
  rungIndex: number;
  inputPower: boolean;
  elements: PlcInstructionTrace[];
  outputPower: boolean;
}

export interface PlcExecutionTrace {
  sourceHash: string;
  rungs: PlcRungTrace[];
}

export interface PlcExecutionContext {
  variables: PlcVariableMap;
  logs: PlcDiagnostic[];
  nowUs: number;
  scanMode: PlcScanMode;
  trace: PlcExecutionTrace | null;
}

export interface PlcCompilationResult {
  success: boolean;
  code?: string;
  ast: LDProgram;
  diagnostics: PlcDiagnostic[];
}

export interface PlcScanSnapshot {
  scanCount: number;
  nowUs: number;
  parameters: Record<string, PlcRuntimeValue>;
  localTags: Record<string, PlcRuntimeValue>;
  diagnostics: PlcDiagnostic[];
  trace?: PlcExecutionTrace;
}
