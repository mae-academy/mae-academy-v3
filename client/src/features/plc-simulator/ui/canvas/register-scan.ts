import type { Network } from '../../domain/ast';
import { validateAddress } from '../../domain/address';
import type { HardwareProfile } from '../../domain/hardware';
import type { ByteWidth } from '../../domain/types';
import { parseConstantText, readSlot, slotsOf } from './operand-slots';

/**
 * One byte/word/dword address the active program actually reads or writes, for the live register
 * monitor. Bit addresses (I/Q/M contacts and coils) are excluded: those already have their own
 * live wire colour and dedicated symbol on the canvas, so listing them again here would just be
 * noise on top of what the ladder is already showing.
 */
export interface ReferencedRegister {
  readonly address: string;
  readonly area: 'I' | 'Q' | 'M' | 'V' | 'T' | 'C';
  readonly width: ByteWidth;
  /** T/C hold their scan-current value at their own instance address (e.g. "T37" -> word). */
  readonly kind: 'memory' | 'timer' | 'counter';
}

/**
 * Scans every node's operand slots across every network (mirrors `usedAddresses`, but for the
 * wider byte/word/dword operands of compare/math/word-logic boxes and timer/counter instances,
 * not just bit addresses) and returns the distinct set of registers the program touches.
 */
export function collectReferencedRegisters(
  networks: readonly Network[],
  profile: HardwareProfile,
): readonly ReferencedRegister[] {
  const seen = new Map<string, ReferencedRegister>();

  for (const network of networks) {
    for (const node of network.nodes) {
      for (const slot of slotsOf(node)) {
        if (slot.requirement === 'bit-or-instance') continue; // contacts/coils: shown live on the canvas already
        const text = readSlot(node, slot.key).trim();
        if (text === '') continue;
        if (parseConstantText(text) !== null) continue; // a literal operand, not a register

        const address = text.toUpperCase();
        if (seen.has(address)) continue;

        if (slot.requirement === 'T' || slot.requirement === 'C') {
          const result = validateAddress(address, profile);
          if (!result.isValid) continue;
          seen.set(address, { address, area: slot.requirement, width: 'word', kind: slot.requirement === 'T' ? 'timer' : 'counter' });
          continue;
        }

        const result = validateAddress(address, profile);
        if (!result.isValid || !result.parsed || result.parsed.width === 'bit') continue;
        const area = result.parsed.area;
        if (area !== 'I' && area !== 'Q' && area !== 'M' && area !== 'V') continue;
        seen.set(address, { address, area, width: result.parsed.width, kind: 'memory' });
      }
    }
  }

  // A stable read order: by area in the conventional S7-200 documentation order, then by address.
  const areaOrder: Record<ReferencedRegister['area'], number> = { I: 0, Q: 1, M: 2, V: 3, T: 4, C: 5 };
  return Array.from(seen.values()).sort(
    (a, b) => areaOrder[a.area] - areaOrder[b.area] || a.address.localeCompare(b.address, undefined, { numeric: true }),
  );
}
