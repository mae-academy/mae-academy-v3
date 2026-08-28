/**
 * PLC Ladder backend contract.
 * Stateful instruction semantics and generated-code execution live here, without UI dependencies.
 */
import { dintAdd, dintDiv, dintMod, dintMul, dintSub, real32, realAdd, realDiv, realMod, realMul, realSub, toDint, toPlcBool } from './numeric';
import type { PlcCounterValue, PlcDataType, PlcDiagnostic, PlcExecutionContext, PlcFbdCounterValue, PlcFbdOneShotValue, PlcFbdTimerValue, PlcInstructionTrace, PlcRuntimeValue, PlcScanMode, PlcTimerHiddenState, PlcTimerValue, PlcVariableMap } from './types';

type Operand =
  | { kind: 'literal'; value: number; dataType: 'DINT' | 'REAL' }
  | { kind: 'tag'; name: string }
  | { kind: 'member'; object: Operand; member: string }
  | { kind: 'index'; target: Operand; index: Operand };
type Meta = { nodeId: string; instructionType: string; rung: number };
type RuntimeFunction = (power: boolean, operands: Operand[], meta: Meta) => boolean;
export type PlcRuntimeFunctionMap = Readonly<Record<string, unknown>>;

const TIMER_FAMILIES = new Set<PlcTimerHiddenState['family']>(['TON', 'TOF', 'RTO', 'TONR', 'TOFR', 'RTOR']);
const STRUCTURED_MEMBERS = new Set(['PRE', 'ACC', 'EN', 'TT', 'DN', 'CU', 'CD', 'OV', 'UN', 'EnableIn', 'TimerEnable', 'Reset', 'EnableOut', 'Status', 'InstructFault', 'PresetInv', 'CUEnable', 'CDEnable', 'InputBit', 'OutputBit']);

function baseTagName(operand: Operand): string | null {
  if (operand.kind === 'tag') return operand.name;
  if (operand.kind === 'member') return baseTagName(operand.object);
  if (operand.kind === 'index') return baseTagName(operand.target);
  return null;
}

function resolve(variables: PlcVariableMap, operand: Operand): PlcRuntimeValue | undefined {
  if (operand.kind === 'literal') return operand.value;
  if (operand.kind === 'tag') return variables.get(operand.name);
  if (operand.kind === 'member') {
    const object = resolve(variables, operand.object);
    return object && typeof object === 'object' && !Array.isArray(object) ? (object as unknown as Record<string, PlcRuntimeValue>)[operand.member] : undefined;
  }
  const target = resolve(variables, operand.target);
  const index = toDint(Number(resolve(variables, operand.index)));
  if (!Array.isArray(target) || index < 0 || index >= target.length) throw Error(`RT-ARR-001 invalid array index ${index}`);
  return target[index];
}

function write(variables: PlcVariableMap, operand: Operand, value: PlcRuntimeValue) {
  if (operand.kind === 'literal') throw Error('Cannot assign to a literal.');
  if (operand.kind === 'tag') { variables.set(operand.name, value); return; }
  if (operand.kind === 'member') {
    const object = resolve(variables, operand.object);
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw Error('Member assignment requires a structured tag.');
    (object as unknown as Record<string, PlcRuntimeValue>)[operand.member] = value;
    return;
  }
  const target = resolve(variables, operand.target);
  const index = toDint(Number(resolve(variables, operand.index)));
  if (!Array.isArray(target) || index < 0 || index >= target.length) throw Error(`RT-ARR-001 invalid array index ${index}`);
  target[index] = value;
}

function scalar(variables: PlcVariableMap, operand: Operand): number | boolean {
  const value = resolve(variables, operand);
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (value && typeof value === 'object' && !Array.isArray(value) && 'ACC' in value) return Number((value as { ACC?: unknown }).ACC ?? 0);
  return 0;
}

function numeric(variables: PlcVariableMap, operand: Operand): number { const value = scalar(variables, operand); return typeof value === 'boolean' ? Number(value) : Number(value); }
function destinationType(operand: Operand, tagTypes: ReadonlyMap<string, PlcDataType>): PlcDataType | undefined { return tagTypes.get(baseTagName(operand) ?? ''); }
function writeScalar(variables: PlcVariableMap, operand: Operand, value: number | boolean, tagTypes: ReadonlyMap<string, PlcDataType>) {
  const type = destinationType(operand, tagTypes);
  write(variables, operand, type === 'BOOL' ? toPlcBool(value) : type === 'REAL' ? real32(Number(value)) : type === 'DINT' ? toDint(Number(value)) : value);
}
function diagnostic(context: PlcExecutionContext, meta: Meta, code: string, message: string) { context.logs.push({ severity: 'error', code, message, rung: meta.rung, element: meta.nodeId }); }

function asTimer(value: PlcRuntimeValue | undefined): PlcTimerValue { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Timer instruction requires a timer tag.'); return value as PlcTimerValue; }
function asCounter(value: PlcRuntimeValue | undefined): PlcCounterValue { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Counter instruction requires a counter tag.'); return value as PlcCounterValue; }
function binary(value: unknown): 0 | 1 { return toPlcBool(value) ? 1 : 0; }
function milliseconds(us: number): number { return Math.floor(us / 1000 + .5); }

function freshTimerState(family: PlcTimerHiddenState['family'], kind: PlcTimerHiddenState['kind'], nowUs: number): PlcTimerHiddenState {
  return { version: 1, family, kind, accUs: 0, lastExecUs: Math.max(0, Math.trunc(nowUs)), lastInput: 0, lastPublishedAccMs: 0, dn: 0, tofrNeedsPreset: false };
}
function validTimerState(value: unknown, family: PlcTimerHiddenState['family'], kind: PlcTimerHiddenState['kind']): value is PlcTimerHiddenState {
  if (!value || typeof value !== 'object') return false;
  const state = value as PlcTimerHiddenState;
  return state.version === 1 && state.family === family && state.kind === kind && TIMER_FAMILIES.has(state.family) && Number.isSafeInteger(state.accUs) && state.accUs >= 0 && Number.isSafeInteger(state.lastExecUs) && state.lastExecUs >= 0 && Number.isSafeInteger(state.lastPublishedAccMs) && (state.lastInput === 0 || state.lastInput === 1) && (state.dn === 0 || state.dn === 1) && typeof state.tofrNeedsPreset === 'boolean';
}

function runLadderTimer(context: PlcExecutionContext, family: 'TON' | 'TOF' | 'RTO', power: boolean, timer: PlcTimerValue) {
  const nowUs = Math.max(0, Math.trunc(context.nowUs));
  const state = validTimerState(timer.__timerState, family, 'ladder') ? timer.__timerState : freshTimerState(family, 'ladder', nowUs);
  timer.__timerState = state;
  const preset = Math.max(Math.trunc(Number(timer.PRE) || 0), 1);
  if (context.scanMode === 'prescan') {
    state.accUs = family === 'TOF' ? preset * 1000 : 0;
    state.dn = 0; state.lastExecUs = nowUs; state.lastInput = binary(power); state.lastPublishedAccMs = family === 'TOF' ? preset : 0;
    timer.ACC = state.lastPublishedAccMs; timer.EN = false; timer.TT = false; timer.DN = false;
    return;
  }
  if (timer.ACC !== state.lastPublishedAccMs) state.accUs = Math.max(0, Math.trunc(Number(timer.ACC) || 0)) * 1000;
  const input = binary(power); const elapsedUs = Math.max(0, nowUs - state.lastExecUs); const transition = family === 'TOF' ? state.lastInput === 1 && input === 0 : state.lastInput === 0 && input === 1;
  if (family === 'TON') {
    if (input) { if (!transition && !state.dn) { state.accUs += elapsedUs; if (milliseconds(state.accUs) >= preset) state.dn = 1; } }
    else { state.accUs = 0; state.dn = 0; }
  } else if (family === 'RTO') {
    if (input && !transition && !state.dn) { state.accUs += elapsedUs; if (milliseconds(state.accUs) >= preset) state.dn = 1; }
  } else if (input) { state.accUs = 0; state.dn = 1; }
  else if (!transition && state.dn) { state.accUs += elapsedUs; if (milliseconds(state.accUs) >= preset) state.dn = 0; }
  timer.ACC = milliseconds(state.accUs); timer.EN = Boolean(input); timer.TT = family === 'TOF' ? !input && Boolean(state.dn) : Boolean(input) && !Boolean(state.dn); timer.DN = Boolean(state.dn);
  state.lastExecUs = nowUs; state.lastInput = input; state.lastPublishedAccMs = timer.ACC;
}

function runFbdTimer(context: PlcExecutionContext, family: 'TONR' | 'TOFR' | 'RTOR', timer: PlcFbdTimerValue) {
  const nowUs = Math.max(0, Math.trunc(context.nowUs));
  const state = validTimerState(timer.__timerState, family, 'fbd') ? timer.__timerState : freshTimerState(family, 'fbd', nowUs);
  timer.__timerState = state;
  const presetRaw = Math.trunc(Number(timer.PRE) || 0);
  if (presetRaw < 0) { timer.InstructFault = true; timer.PresetInv = true; timer.Status = 3; timer.EnableOut = false; return; }
  timer.InstructFault = false; timer.PresetInv = false; timer.Status = 0;
  const preset = Math.max(presetRaw, 1);
  const enabled = binary(timer.EnableIn && timer.TimerEnable);
  const reset = Boolean(timer.Reset);
  if (context.scanMode === 'prescan') {
    state.accUs = family === 'TOFR' ? preset * 1000 : 0;
    state.dn = 0; state.lastExecUs = nowUs; state.lastInput = enabled; state.lastPublishedAccMs = family === 'TOFR' ? preset : 0; state.tofrNeedsPreset = family === 'TOFR';
    timer.ACC = state.lastPublishedAccMs; timer.EN = false; timer.TT = false; timer.DN = false; timer.EnableOut = false;
    return;
  }
  if (timer.ACC !== state.lastPublishedAccMs) state.accUs = Math.max(0, Math.trunc(Number(timer.ACC) || 0)) * 1000;
  if (reset) { state.accUs = 0; state.dn = 0; state.tofrNeedsPreset = family === 'TOFR'; }
  const elapsedUs = Math.max(0, nowUs - state.lastExecUs);
  const rising = state.lastInput === 0 && enabled === 1; const falling = state.lastInput === 1 && enabled === 0;
  if (family === 'TONR') {
    if (!enabled || reset) { state.accUs = 0; state.dn = 0; }
    else if (!rising && !state.dn) { state.accUs += elapsedUs; if (milliseconds(state.accUs) >= preset) state.dn = 1; }
  } else if (family === 'RTOR') {
    if (!reset && enabled && !rising && !state.dn) { state.accUs += elapsedUs; if (milliseconds(state.accUs) >= preset) state.dn = 1; }
  } else if (enabled) { state.accUs = 0; state.dn = 1; state.tofrNeedsPreset = false; }
  else if (state.tofrNeedsPreset) { state.accUs = preset * 1000; state.dn = 0; state.tofrNeedsPreset = false; }
  else if (!falling && state.dn) { state.accUs += elapsedUs; if (milliseconds(state.accUs) >= preset) state.dn = 0; }
  timer.ACC = milliseconds(state.accUs); timer.EN = Boolean(enabled); timer.TT = family === 'TOFR' ? !enabled && Boolean(state.dn) : Boolean(enabled) && !Boolean(state.dn); timer.DN = Boolean(state.dn); timer.EnableOut = Boolean(timer.EnableIn);
  state.lastExecUs = nowUs; state.lastInput = enabled; state.lastPublishedAccMs = timer.ACC;
}

function runCounter(context: PlcExecutionContext, family: 'CTU' | 'CTD', power: boolean, counter: PlcCounterValue) {
  if (context.scanMode === 'prescan') { if (family === 'CTU') counter.CU = true; else counter.CD = true; return; }
  const previous = family === 'CTU' ? counter.CU : counter.CD;
  if (power && !previous) {
    if (family === 'CTU') { counter.ACC += 1; if (counter.ACC > 2147483647) { counter.ACC = -2147483648; counter.OV = true; } }
    else { counter.ACC -= 1; if (counter.ACC < -2147483648) { counter.ACC = 2147483647; counter.UN = true; } }
  }
  if (family === 'CTU') counter.CU = power; else counter.CD = power;
  counter.DN = counter.ACC >= counter.PRE;
}

function resetStructured(value: PlcRuntimeValue | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const target = value as unknown as Record<string, unknown>;
  if ('ACC' in target) target.ACC = 0;
  if ('DN' in target) target.DN = false;
  if ('TT' in target) target.TT = false;
  if ('OV' in target) target.OV = false;
  if ('UN' in target) target.UN = false;
  delete target.__timerState; delete target.__ctudState;
}

export function createRuntimeFunctions(context: PlcExecutionContext, tagTypes: ReadonlyMap<string, PlcDataType>): PlcRuntimeFunctionMap {
  const base = (power: boolean) => power;
  const functions: Record<string, RuntimeFunction> = {
    XIC: (power, [bit]) => power && toPlcBool(scalar(context.variables, bit)),
    XIO: (power, [bit]) => power && !toPlcBool(scalar(context.variables, bit)),
    OTE: (power, [bit]) => { writeScalar(context.variables, bit, power, tagTypes); return power; },
    OTL: (power, [bit]) => { if (power) writeScalar(context.variables, bit, true, tagTypes); return power; },
    OTU: (power, [bit]) => { if (power) writeScalar(context.variables, bit, false, tagTypes); return power; },
    AFI: () => false, NOP: base,
    ONS: (power, [storage]) => {
      if (context.scanMode === 'prescan') { writeScalar(context.variables, storage, true, tagTypes); return false; }
      if (power) { const held = toPlcBool(scalar(context.variables, storage)); writeScalar(context.variables, storage, true, tagTypes); return !held; }
      writeScalar(context.variables, storage, false, tagTypes); return false;
    },
    OSR: (power, [storage, output]) => { if (context.scanMode === 'prescan') { writeScalar(context.variables, storage, true, tagTypes); writeScalar(context.variables, output, false, tagTypes); } else if (power) { const held = toPlcBool(scalar(context.variables, storage)); writeScalar(context.variables, storage, true, tagTypes); writeScalar(context.variables, output, !held, tagTypes); } else { writeScalar(context.variables, storage, false, tagTypes); writeScalar(context.variables, output, false, tagTypes); } return power; },
    OSF: (power, [storage, output]) => { if (context.scanMode === 'prescan') { writeScalar(context.variables, storage, false, tagTypes); writeScalar(context.variables, output, false, tagTypes); } else if (power) { writeScalar(context.variables, storage, true, tagTypes); writeScalar(context.variables, output, false, tagTypes); } else { const held = toPlcBool(scalar(context.variables, storage)); writeScalar(context.variables, storage, false, tagTypes); writeScalar(context.variables, output, held, tagTypes); } return power; },
    TON: (power, [timer]) => { runLadderTimer(context, 'TON', power, asTimer(resolve(context.variables, timer))); return power; },
    TOF: (power, [timer]) => { runLadderTimer(context, 'TOF', power, asTimer(resolve(context.variables, timer))); return power; },
    RTO: (power, [timer]) => { runLadderTimer(context, 'RTO', power, asTimer(resolve(context.variables, timer))); return power; },
    CTU: (power, [counter]) => { runCounter(context, 'CTU', power, asCounter(resolve(context.variables, counter))); return power; },
    CTD: (power, [counter]) => { runCounter(context, 'CTD', power, asCounter(resolve(context.variables, counter))); return power; },
    RES: (power, [target]) => { if (power) resetStructured(resolve(context.variables, target)); return power; },
  };

  const whenPowered = (fn: (operands: Operand[], meta: Meta) => void): RuntimeFunction => (power, operands, meta) => { if (power) fn(operands, meta); return power; };
  const comparison = (predicate: (a: number, b: number) => boolean): RuntimeFunction => (power, [left, right]) => power && predicate(numeric(context.variables, left), numeric(context.variables, right));
  functions.MOV = whenPowered(([source, destination]) => writeScalar(context.variables, destination, scalar(context.variables, source), tagTypes));
  for (const [name, operation] of Object.entries({ ADD: (a: number, b: number, real: boolean) => real ? realAdd(a, b) : dintAdd(a, b), SUB: (a: number, b: number, real: boolean) => real ? realSub(a, b) : dintSub(a, b), MUL: (a: number, b: number, real: boolean) => real ? realMul(a, b) : dintMul(a, b), DIV: (a: number, b: number, real: boolean) => real ? realDiv(a, b) : dintDiv(a, b), MOD: (a: number, b: number, real: boolean) => real ? realMod(a, b) : dintMod(a, b) })) {
    functions[name] = whenPowered(([left, right, destination], meta) => { const real = destinationType(left, tagTypes) === 'REAL' || destinationType(right, tagTypes) === 'REAL' || destinationType(destination, tagTypes) === 'REAL'; if ((name === 'DIV' || name === 'MOD') && numeric(context.variables, right) === 0 && !real) diagnostic(context, meta, 'RT-MATH-001', `${name} used a zero divisor; PLC DINT fallback was applied.`); writeScalar(context.variables, destination, operation(numeric(context.variables, left), numeric(context.variables, right), real), tagTypes); });
  }
  functions.NEG = whenPowered(([source, destination]) => writeScalar(context.variables, destination, destinationType(destination, tagTypes) === 'REAL' ? real32(-numeric(context.variables, source)) : toDint(-numeric(context.variables, source)), tagTypes));
  functions.ABS = whenPowered(([source, destination]) => writeScalar(context.variables, destination, destinationType(destination, tagTypes) === 'REAL' ? real32(Math.abs(numeric(context.variables, source))) : toDint(Math.abs(numeric(context.variables, source))), tagTypes));
  functions.SQRT = whenPowered(([source, destination]) => writeScalar(context.variables, destination, real32(Math.sqrt(Math.abs(numeric(context.variables, source)))), tagTypes));
  functions.SIN = whenPowered(([source, destination]) => writeScalar(context.variables, destination, real32(Math.sin(numeric(context.variables, source))), tagTypes));
  functions.COS = whenPowered(([source, destination]) => writeScalar(context.variables, destination, real32(Math.cos(numeric(context.variables, source))), tagTypes));
  functions.TAN = whenPowered(([source, destination]) => writeScalar(context.variables, destination, real32(Math.tan(numeric(context.variables, source))), tagTypes));
  functions.AND = whenPowered(([a, b, destination]) => writeScalar(context.variables, destination, toDint(numeric(context.variables, a)) & toDint(numeric(context.variables, b)), tagTypes));
  functions.OR = whenPowered(([a, b, destination]) => writeScalar(context.variables, destination, toDint(numeric(context.variables, a)) | toDint(numeric(context.variables, b)), tagTypes));
  functions.XOR = whenPowered(([a, b, destination]) => writeScalar(context.variables, destination, toDint(numeric(context.variables, a)) ^ toDint(numeric(context.variables, b)), tagTypes));
  functions.NOT = whenPowered(([source, destination]) => writeScalar(context.variables, destination, ~toDint(numeric(context.variables, source)), tagTypes));
  functions.MVM = whenPowered(([source, mask, destination]) => { const a = toDint(numeric(context.variables, source)); const b = toDint(numeric(context.variables, mask)); const d = toDint(numeric(context.variables, destination)); writeScalar(context.variables, destination, (a & b) | (d & ~b), tagTypes); });
  functions.BTD = whenPowered(([source, sourceBit, destinationBit, length, destination]) => { const size = Math.max(0, Math.min(32, toDint(numeric(context.variables, length)))); const fieldMask = size >= 32 ? -1 : (1 << size) - 1; const sourceShift = Math.max(0, Math.min(31, toDint(numeric(context.variables, sourceBit)))); const destinationShift = Math.max(0, Math.min(31, toDint(numeric(context.variables, destinationBit)))); const destinationMask = (fieldMask << destinationShift) | 0; const field = ((toDint(numeric(context.variables, source)) >>> sourceShift) & fieldMask) << destinationShift; const result = (toDint(numeric(context.variables, destination)) & ~destinationMask) | (field & destinationMask); writeScalar(context.variables, destination, result | 0, tagTypes); });
  functions.EQU = comparison((a, b) => a === b); functions.NEQ = comparison((a, b) => a !== b); functions.GRT = comparison((a, b) => a > b); functions.GEQ = comparison((a, b) => a >= b); functions.LES = comparison((a, b) => a < b); functions.LEQ = comparison((a, b) => a <= b);
  functions.LIM = (power, [low, test, high]) => { const a = numeric(context.variables, low); const b = numeric(context.variables, test); const c = numeric(context.variables, high); const result = ![a, b, c].some(Number.isNaN) && (a <= c ? b >= a && b <= c : b >= a || b <= c); return power && result; };
  // FBD stateful calls share the hidden-state contract but honour their block-level enables.
  functions.CTUD = (power, [counterOperand, cuOperand, cdOperand, resetOperand]) => { const counter = asCounter(resolve(context.variables, counterOperand)) as PlcFbdCounterValue; const state = counter.__ctudState ?? { lastCuEnable: 0 as 0 | 1, lastCdEnable: 0 as 0 | 1, acc: toDint(counter.ACC) }; const enabled = Boolean(counter.EnableIn); const cu = binary(enabled && numeric(context.variables, cuOperand)); const cd = binary(enabled && numeric(context.variables, cdOperand)); const reset = resetOperand ? toPlcBool(scalar(context.variables, resetOperand)) : Boolean(counter.Reset); if (context.scanMode === 'prescan') { state.lastCuEnable = 1; state.lastCdEnable = 1; counter.EnableOut = false; } else if (reset) { state.acc = 0; state.lastCuEnable = 0; state.lastCdEnable = 0; counter.OV = false; counter.UN = false; } else state.acc = toDint(state.acc + (cu && !state.lastCuEnable ? 1 : 0) - (cd && !state.lastCdEnable ? 1 : 0)); state.lastCuEnable = cu; state.lastCdEnable = cd; counter.__ctudState = state; counter.ACC = state.acc; counter.CU = Boolean(cu); counter.CD = Boolean(cd); counter.DN = counter.ACC >= counter.PRE; counter.EnableOut = context.scanMode === 'normal' && enabled; return power; };
  functions.OSRI = (power, [oneShotOperand]) => { const oneShot = asTimer(resolve(context.variables, oneShotOperand)) as unknown as PlcFbdOneShotValue; const state = oneShot.__oneShotState ?? { lastInput: context.scanMode === 'prescan' ? 1 as 0 | 1 : 0 as 0 | 1 }; const enabled = Boolean(oneShot.EnableIn); const input = binary(enabled && oneShot.InputBit); oneShot.OutputBit = context.scanMode === 'prescan' ? false : enabled && input === 1 && state.lastInput === 0; oneShot.EnableOut = context.scanMode === 'normal' && enabled; state.lastInput = input; oneShot.__oneShotState = state; return power; };
  functions.OSFI = (power, [oneShotOperand]) => { const oneShot = asTimer(resolve(context.variables, oneShotOperand)) as unknown as PlcFbdOneShotValue; const state = oneShot.__oneShotState ?? { lastInput: context.scanMode === 'prescan' ? 0 as 0 | 1 : 0 as 0 | 1 }; const enabled = Boolean(oneShot.EnableIn); const input = binary(enabled && oneShot.InputBit); oneShot.OutputBit = context.scanMode === 'prescan' ? false : enabled && input === 0 && state.lastInput === 1; oneShot.EnableOut = context.scanMode === 'normal' && enabled; state.lastInput = input; oneShot.__oneShotState = state; return power; };
  for (const family of ['TONR', 'TOFR', 'RTOR'] as const) functions[family] = (power, [timerOperand]) => { const timer = asTimer(resolve(context.variables, timerOperand)) as PlcFbdTimerValue; runFbdTimer(context, family, timer); return power; };
  const trace = (trace: unknown, meta: Meta, inputPower: boolean, outputPower: boolean, operands: Operand[]) => {
      if (!trace || typeof trace !== 'object') return;
      const record = trace as { elements?: PlcInstructionTrace[] };
      if (!Array.isArray(record.elements)) return;
      record.elements.push({
        nodeId: meta.nodeId,
        instructionType: meta.instructionType as PlcInstructionTrace['instructionType'],
        inputPower,
        outputPower,
        operands: Object.fromEntries(operands.map((operand, index) => [`p${index}`, resolve(context.variables, operand)])),
      });
    };
  return Object.freeze({ ...functions, trace });
}

export function executeGeneratedCode(code: string, context: PlcExecutionContext, tagTypes: ReadonlyMap<string, PlcDataType>): PlcExecutionContext {
  try {
    const funcs = createRuntimeFunctions(context, tagTypes);
    Function('context', 'vars', 'funcs', 'log', '__scanMode', '__trace', `'use strict';\n${code}`)(context, context.variables, funcs, context.logs, context.scanMode, context.trace);
  } catch (error) {
    context.logs.push({ severity: 'error', code: 'RT-EXEC-001', message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
  return context;
}

export function executableMember(member: string): boolean { return STRUCTURED_MEMBERS.has(member); }
