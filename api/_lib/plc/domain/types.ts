/** Primitive addressing vocabulary shared by profiles, validator, memory map and AST. */

export const AREA_PREFIXES = ['I', 'Q', 'M', 'V', 'T', 'C'] as const;
export type AreaPrefix = (typeof AREA_PREFIXES)[number];

/** Areas backed by a flat byte array (bit/byte/word/dword access). */
export type ByteAreaPrefix = 'I' | 'Q' | 'M' | 'V';
/** Areas indexed by instance number (timers/counters: current, preset, status bit). */
export type IndexedAreaPrefix = 'T' | 'C';

export type AccessWidth = 'bit' | 'byte' | 'word' | 'dword';
export type ByteWidth = Exclude<AccessWidth, 'bit'>;

export const WIDTH_BYTES: Readonly<Record<ByteWidth, 1 | 2 | 4>> = { byte: 1, word: 2, dword: 4 };
export const WIDTH_MASK: Readonly<Record<AccessWidth, number>> = {
  bit: 0x1,
  byte: 0xff,
  word: 0xffff,
  dword: 0xffffffff,
};
/** Size-letter suffix as written in addresses: VB / VW / VD. */
export const SIZE_LETTER_WIDTH: Readonly<Record<'B' | 'W' | 'D', ByteWidth>> = {
  B: 'byte',
  W: 'word',
  D: 'dword',
};

/** Canonical address text, e.g. "I0.5", "VW100", "T37". Validated by `validateAddress`. */
export type PlcAddress = string;

/**
 * Result of parsing an address.
 * For T/C areas `byte` holds the instance index and `width` is 'word' (current value).
 */
export interface ParsedAddress {
  readonly area: AreaPrefix;
  readonly byte: number;
  readonly bit?: number;
  readonly width: AccessWidth;
}

export const isIndexedArea = (area: AreaPrefix): area is IndexedAreaPrefix =>
  area === 'T' || area === 'C';
