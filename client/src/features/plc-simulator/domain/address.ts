import type { HardwareProfile } from './hardware';
import {
  SIZE_LETTER_WIDTH,
  WIDTH_BYTES,
  type AccessWidth,
  type AreaPrefix,
  type ParsedAddress,
} from './types';

export interface AddressValidationResult {
  isValid: boolean;
  error?: string;
  parsed?: ParsedAddress;
}

/** <area>[B|W|D]<index>[.<bit>] — e.g. I0.5, QB1, VW100, T37. */
const ADDRESS_RE = /^([IQMVTC])([BWD])?(\d+)(?:\.(\d+))?$/;

/** Pure validation of `address` against the active hardware profile. Case-insensitive. */
export function validateAddress(address: string, profile: HardwareProfile): AddressValidationResult {
  const fail = (error: string): AddressValidationResult => ({ isValid: false, error });

  const m = ADDRESS_RE.exec(address.trim().toUpperCase());
  if (!m) return fail(`Malformed address "${address}"`);

  const area = m[1] as AreaPrefix;
  const sizeLetter = m[2] as 'B' | 'W' | 'D' | undefined;
  const index = Number(m[3]);
  const bit = m[4] === undefined ? undefined : Number(m[4]);
  if (!Number.isSafeInteger(index)) return fail(`Index out of range in "${address}"`);

  const spec = profile.memory[area];
  if (!profile.allowedPrefixes.includes(area) || !spec) {
    return fail(`Area ${area} is not available on ${profile.model}`);
  }

  if (spec.kind === 'indexed') {
    if (sizeLetter !== undefined || bit !== undefined) {
      return fail(`${area} addresses take a bare instance index (e.g. ${area}37)`);
    }
    if (!spec.ranges.some((r) => index >= r.from && index <= r.to)) {
      const bounds = spec.ranges.map((r) => `${area}${r.from}-${area}${r.to}`).join(', ');
      return fail(`${area}${index} out of range on ${profile.model} (${bounds})`);
    }
    return { isValid: true, parsed: { area, byte: index, width: 'word' } };
  }

  const width: AccessWidth = sizeLetter === undefined ? 'bit' : SIZE_LETTER_WIDTH[sizeLetter];
  if (width === 'bit') {
    if (bit === undefined) return fail(`Bit address requires ".bit" suffix (e.g. ${area}${index}.0)`);
    if (bit > 7) return fail(`Bit index must be 0-7, got ${bit}`);
  } else if (bit !== undefined) {
    return fail(`${width} access cannot carry a bit index`);
  }
  if (!spec.widths.includes(width)) {
    return fail(`${width} access is not supported for area ${area} on ${profile.model}`);
  }

  // Bit access: exact bit boundary. Multi-byte access: every accessed byte must start inside the area.
  const lastBit =
    width === 'bit' ? index * 8 + (bit as number) : (index + WIDTH_BYTES[width] - 1) * 8;
  if (lastBit >= spec.bitCount) {
    const maxByte = Math.ceil(spec.bitCount / 8) - 1;
    const maxBit = spec.bitCount - maxByte * 8 - 1;
    return fail(`${address} exceeds ${area} area of ${profile.model} (max ${area}${maxByte}.${maxBit})`);
  }

  return { isValid: true, parsed: bit === undefined ? { area, byte: index, width } : { area, byte: index, bit, width } };
}
