import { isIndexedArea, type PlcAddress } from '../../domain/types';
import type { ExecContext } from '../context';

/** Power-flow levels arriving at a box, in pin order top to bottom; index 0 is the rung itself. */
export type PinLevels = readonly boolean[];

/** Unwired pins read as de-energised. */
export const pin = (pins: PinLevels, index: number): boolean => pins[index] ?? false;

/** Writes an optional output binding (ENO / Q / CV mirrors) when the AST declares one. */
export function mirrorBit(ctx: ExecContext, address: PlcAddress | undefined, value: boolean): void {
  if (address !== undefined) ctx.memory.writeBit(address, value);
}

export function mirrorWord(ctx: ExecContext, address: PlcAddress | undefined, value: number): void {
  if (address !== undefined) ctx.memory.write(address, value);
}

/**
 * Nth consecutive bit starting at `base`, following hardware bit order (x.7 rolls into (x+1).0).
 * For T/C areas the offset walks instance numbers instead, matching `S`/`R` on a timer address.
 */
export function offsetBitAddress(ctx: ExecContext, base: PlcAddress, offset: number): PlcAddress {
  const parsed = ctx.memory.resolve(base);
  if (isIndexedArea(parsed.area)) return `${parsed.area}${parsed.byte + offset}`;
  const absolute = parsed.byte * 8 + (parsed.bit ?? 0) + offset;
  return `${parsed.area}${Math.floor(absolute / 8)}.${absolute % 8}`;
}
