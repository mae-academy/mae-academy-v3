import type { LogicWidth, NumericType } from '../domain/ast';
import type { ByteWidth } from '../domain/types';

// Type metadata only. The arithmetic that reads and writes operands lives with the engine, which
// runs server-side (api/_lib/plc/engine/numeric.ts).

export interface NumericTypeSpec {
  readonly width: ByteWidth;
  readonly signed: boolean;
  readonly integer: boolean;
  readonly min: number;
  readonly max: number;
}

export const NUMERIC_TYPES: Readonly<Record<NumericType, NumericTypeSpec>> = {
  BYTE: { width: 'byte', signed: false, integer: true, min: 0, max: 0xff },
  INT: { width: 'word', signed: true, integer: true, min: -32768, max: 32767 },
  DINT: { width: 'dword', signed: true, integer: true, min: -2147483648, max: 2147483647 },
  REAL: { width: 'dword', signed: true, integer: false, min: -3.402823466e38, max: 3.402823466e38 },
};

export const LOGIC_WIDTHS: Readonly<Record<LogicWidth, ByteWidth>> = {
  BYTE: 'byte',
  WORD: 'word',
  DWORD: 'dword',
};
