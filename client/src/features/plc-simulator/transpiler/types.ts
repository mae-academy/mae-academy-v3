import type { CompareOp, LogicWidth, NetworkId, NodeId, NumericType } from '../domain/ast';
import type { PlcAddress } from '../domain/types';

// ---- diagnostics -------------------------------------------------------------------------------

export type TranspileSeverity = 'warning' | 'error';

export type TranspileCode =
  // generator
  | 'STACK_OVERFLOW'
  | 'STACK_UNDERFLOW'
  | 'UNREPRESENTABLE_NODE'
  | 'EDGE_SEMANTICS'
  | 'NON_NATIVE_MNEMONIC'
  // parser
  | 'SYNTAX_ERROR'
  | 'UNKNOWN_OPCODE'
  | 'OPERAND_COUNT'
  | 'INVALID_OPERAND'
  | 'PROFILE_VIOLATION'
  | 'EMPTY_STACK'
  | 'UNBALANCED_STACK'
  | 'DANGLING_LOGIC'
  | 'ORPHAN_MOVE';

export interface TranspileDiagnostic {
  readonly code: TranspileCode;
  readonly severity: TranspileSeverity;
  readonly message: string;
  /** 1-based source line, when the diagnostic comes from parsing text. */
  readonly line?: number;
  /** 1-based column. */
  readonly column?: number;
  readonly networkId?: NetworkId;
  readonly nodeId?: NodeId;
  readonly address?: PlcAddress;
}

export interface TranspileResult<T> {
  /** False when any diagnostic has `error` severity. `value` is still populated where possible. */
  readonly ok: boolean;
  readonly value: T | null;
  readonly diagnostics: readonly TranspileDiagnostic[];
}

export const failure = <T>(diagnostics: readonly TranspileDiagnostic[]): TranspileResult<T> => ({
  ok: false,
  value: null,
  diagnostics,
});

export function result<T>(value: T, diagnostics: readonly TranspileDiagnostic[]): TranspileResult<T> {
  return { ok: !diagnostics.some((d) => d.severity === 'error'), value, diagnostics };
}

// ---- symbols -----------------------------------------------------------------------------------

export interface SymbolEntry {
  /** Micro/WIN symbol name: letters, digits and underscore, not starting with a digit. */
  readonly name: string;
  readonly comment?: string;
}

/** Absolute address (upper case, e.g. "I0.0") to its symbolic name. */
export type SymbolMap = Readonly<Record<PlcAddress, SymbolEntry>>;

// ---- S7-200 mnemonic tables --------------------------------------------------------------------

/** Logic stack depth of an S7-200 CPU. Exceeding it is a program fault, not a warning. */
export const LOGIC_STACK_DEPTH = 9;

/** Type letter used by the compare and data-move mnemonics: LDW>=, MOVR, +D ... */
export const TYPE_LETTER: Readonly<Record<NumericType, 'B' | 'W' | 'D' | 'R'>> = {
  BYTE: 'B',
  INT: 'W',
  DINT: 'D',
  REAL: 'R',
};

/** Width suffix of the word-logic mnemonics: WAND_B / WAND_W / WAND_DW. */
export const LOGIC_SUFFIX: Readonly<Record<LogicWidth, 'B' | 'W' | 'DW'>> = {
  BYTE: 'B',
  WORD: 'W',
  DWORD: 'DW',
};

/** Data move used to seed the accumulator before a destructive arithmetic instruction. */
export const MOVE_MNEMONIC: Readonly<Record<NumericType, string>> = {
  BYTE: 'MOVB',
  INT: 'MOVW',
  DINT: 'MOVD',
  REAL: 'MOVR',
};

export const MOVE_MNEMONICS: readonly string[] = ['MOVB', 'MOVW', 'MOVD', 'MOVR'];

/**
 * S7-200 arithmetic is destructive two-operand: `+I IN1, OUT` computes OUT := IN1 + OUT.
 * BYTE has no native arithmetic, so byte math is emitted with the word mnemonics.
 */
export const MATH_MNEMONIC: Readonly<Record<'ADD' | 'SUB' | 'MUL' | 'DIV', Readonly<Record<NumericType, string>>>> = {
  ADD: { BYTE: '+I', INT: '+I', DINT: '+D', REAL: '+R' },
  SUB: { BYTE: '-I', INT: '-I', DINT: '-D', REAL: '-R' },
  MUL: { BYTE: '*I', INT: '*I', DINT: '*D', REAL: '*R' },
  DIV: { BYTE: '/I', INT: '/I', DINT: '/D', REAL: '/R' },
};

/** Compare relation as it appears inside LDW>=, AR<, OW== ... */
export const COMPARE_OPS: readonly CompareOp[] = ['==', '<>', '>=', '<=', '>', '<'];

export type LoadMode = 'LD' | 'A' | 'O';

// ---- S7-200 timer allocation -------------------------------------------------------------------

/**
 * Timer resolution is fixed by the instance number on an S7-200, and TONR draws from a different
 * pool than TON/TOF. STL carries no time base, so this table is how the parser recovers it.
 */
export function timerResolution(
  fn: 'TON' | 'TOF' | 'TONR',
  instance: number,
): { readonly timeBaseMs: 1 | 10 | 100; readonly valid: boolean } {
  const inRange = (spans: readonly (readonly [number, number])[]): boolean =>
    spans.some(([from, to]) => instance >= from && instance <= to);

  if (fn === 'TONR') {
    if (inRange([[0, 0], [64, 64]])) return { timeBaseMs: 1, valid: true };
    if (inRange([[1, 4], [65, 68]])) return { timeBaseMs: 10, valid: true };
    if (inRange([[5, 31], [69, 95]])) return { timeBaseMs: 100, valid: true };
    return { timeBaseMs: 100, valid: false };
  }
  if (inRange([[32, 32], [96, 96]])) return { timeBaseMs: 1, valid: true };
  if (inRange([[33, 36], [97, 100]])) return { timeBaseMs: 10, valid: true };
  if (inRange([[37, 63], [101, 255]])) return { timeBaseMs: 100, valid: true };
  return { timeBaseMs: 100, valid: false };
}
