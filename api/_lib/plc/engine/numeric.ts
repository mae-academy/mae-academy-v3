import type { LogicWidth, NumericType, Operand } from '../domain/ast';
import type { MemoryMap } from '../domain/memory';
import type { ByteWidth, PlcAddress } from '../domain/types';

// ---- IEEE-754 single precision codec ---------------------------------------------------------
// REAL values live in memory as a raw 32-bit pattern; a shared view avoids per-scan allocation.

const codec = new DataView(new ArrayBuffer(4));

export function bitsToFloat32(bits: number): number {
  codec.setUint32(0, bits >>> 0);
  return codec.getFloat32(0);
}

export function float32ToBits(value: number): number {
  codec.setFloat32(0, value);
  return codec.getUint32(0);
}

/** Rounds `value` to the nearest representable float32, matching what memory will hold. */
export const toFloat32 = (value: number): number => bitsToFloat32(float32ToBits(value));

// ---- type metadata ---------------------------------------------------------------------------

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

export const LOGIC_MASKS: Readonly<Record<LogicWidth, number>> = {
  BYTE: 0xff,
  WORD: 0xffff,
  DWORD: 0xffffffff,
};

// ---- operand access --------------------------------------------------------------------------

/** Reads an operand with the numeric interpretation demanded by the instruction's `dataType`. */
export function readNumeric(memory: MemoryMap, operand: Operand, type: NumericType): number {
  if (operand.kind === 'constant') {
    return type === 'REAL' ? toFloat32(operand.value) : Math.trunc(operand.value);
  }
  if (type === 'REAL') return bitsToFloat32(memory.read(operand.address));
  return NUMERIC_TYPES[type].signed ? memory.readSigned(operand.address) : memory.read(operand.address);
}

/** Reads an operand as an unsigned bit pattern, masked to `width` (word-logic semantics). */
export function readRaw(memory: MemoryMap, operand: Operand, width: LogicWidth): number {
  const raw = operand.kind === 'constant' ? Math.trunc(operand.value) : memory.read(operand.address);
  return (raw & LOGIC_MASKS[width]) >>> 0;
}

export interface NumericWriteResult {
  /** The value that actually landed in memory (truncated / rounded to the destination type). */
  readonly stored: number;
  /** The value exceeded the destination range, or a non-finite REAL was produced. */
  readonly overflow: boolean;
}

/**
 * Writes `value` with `type` semantics. Out-of-range integers still commit their truncated
 * low-order bits — authentic hardware wrap-around — but report `overflow` so ENO can drop.
 */
export function writeNumeric(
  memory: MemoryMap,
  address: PlcAddress,
  type: NumericType,
  value: number,
): NumericWriteResult {
  if (type === 'REAL') {
    const finite = Number.isFinite(value);
    memory.write(address, float32ToBits(finite ? value : 0));
    return { stored: finite ? toFloat32(value) : 0, overflow: !finite };
  }
  const spec = NUMERIC_TYPES[type];
  const truncated = Math.trunc(value);
  const overflow = !Number.isFinite(value) || truncated < spec.min || truncated > spec.max;
  const safe = Number.isFinite(truncated) ? truncated : 0;
  memory.write(address, safe); // MemoryMap masks to the destination width
  return { stored: spec.signed ? memory.readSigned(address) : memory.read(address), overflow };
}
