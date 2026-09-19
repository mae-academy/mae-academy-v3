import { memo } from 'react';
import type { MemoryMap } from '../../domain/memory';
import { useFieldInput, useMemoryBitOf } from './hooks';
import type { VirtualField } from './virtual-field';

export type LedColor = 'green' | 'amber' | 'red' | 'cyan';

const ON: Readonly<Record<LedColor, string>> = {
  green: 'bg-[#39ff7a] shadow-[0_0_8px_2px_rgba(57,255,122,0.75)] border-[#0c6b30]',
  amber: 'bg-[#ffb300] shadow-[0_0_8px_2px_rgba(255,179,0,0.75)] border-[#7a5200]',
  red: 'bg-[#ff3b30] shadow-[0_0_8px_2px_rgba(255,59,48,0.75)] border-[#7d1510]',
  cyan: 'bg-[#40e0ff] shadow-[0_0_8px_2px_rgba(64,224,255,0.75)] border-[#0b6478]',
};
const OFF: Readonly<Record<LedColor, string>> = {
  green: 'bg-[#0f3a1e] border-[#08210f]',
  amber: 'bg-[#3d2a00] border-[#241900]',
  red: 'bg-[#3d0f0c] border-[#240806]',
  cyan: 'bg-[#0b2f38] border-[#061c22]',
};

export interface LedProps {
  on: boolean;
  color: LedColor;
  /** Accessible name, e.g. "Q0.1". State is appended automatically. */
  label: string;
  className?: string;
}

/** A single indicator lamp. Pure: whoever owns the state decides when it lights. */
export function Led({ on, color, label, className = '' }: LedProps) {
  return (
    <span
      role="img"
      aria-label={`${label} ${on ? 'on' : 'off'}`}
      data-on={on}
      className={`inline-block h-3 w-3 shrink-0 rounded-full border ${on ? ON[color] : OFF[color]} ${className}`}
    />
  );
}

/** LED wired to a memory bit. It subscribes alone, so only this lamp re-renders when the bit flips. */
export const MemoryLed = memo(function MemoryLed({
  memory,
  address,
  color,
  label = address,
}: {
  memory: MemoryMap;
  address: string;
  color: LedColor;
  label?: string;
}) {
  return <Led on={useMemoryBitOf(memory, address)} color={color} label={label} />;
});

/** LED showing where the simulated switch on an input terminal currently sits. */
export const FieldLed = memo(function FieldLed({
  field,
  index,
  color,
  label,
}: {
  field: VirtualField;
  index: number;
  color: LedColor;
  label: string;
}) {
  return <Led on={useFieldInput(field, index)} color={color} label={label} />;
});
