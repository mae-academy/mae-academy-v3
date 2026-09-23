import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { Network } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { MemoryMap } from '../../domain/memory';
import { WIDTH_BYTES } from '../../domain/types';
import { PANEL, PANEL_HEADER, PANEL_TITLE } from '../chrome';
import { collectReferencedRegisters, type ReferencedRegister } from './register-scan';

export interface RegisterMonitorProps {
  networks: readonly Network[];
  profile: HardwareProfile;
  /** The session's memory, live regardless of RUN/STOP — the same source the I/O rack reads. */
  memory: MemoryMap;
  className?: string;
}

const AREA_BADGE_CLASS: Readonly<Record<ReferencedRegister['area'], string>> = {
  I: 'text-sky-600 dark:text-sky-400',
  Q: 'text-emerald-600 dark:text-emerald-400',
  M: 'text-amber-600 dark:text-amber-400',
  V: 'text-violet-600 dark:text-violet-400',
  T: 'text-rose-600 dark:text-rose-400',
  C: 'text-rose-600 dark:text-rose-400',
};

/** `VW` / `VD` / `VB` style badge for a byte area; T/C show their own letter (current value, word-wide). */
function badgeOf(reg: ReferencedRegister): string {
  if (reg.kind !== 'memory') return reg.area;
  return `${reg.area}${reg.width === 'byte' ? 'B' : reg.width === 'word' ? 'W' : 'D'}`;
}

const hex = (value: number, width: ReferencedRegister['width']): string =>
  `0x${(value >>> 0).toString(16).toUpperCase().padStart(WIDTH_BYTES[width] * 2, '0')}`;

/** Parses `0x1F`, `-42` or `42` the same way the operand editors do. */
function parseOverrideText(text: string): number | null {
  const trimmed = text.trim();
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed.slice(2), 16);
  if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

/** One row, subscribed to only its own address so a scan never re-renders rows it did not touch. */
function RegisterRow({ reg, memory }: { reg: ReferencedRegister; memory: MemoryMap }) {
  const subscribe = useCallback((cb: () => void) => memory.subscribe(() => cb()), [memory]);
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return memory.readSigned(reg.address);
      } catch {
        return 0;
      }
    },
    () => 0,
  );
  const unsigned = value < 0 ? value + 2 ** (WIDTH_BYTES[reg.width] * 8) : value;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = (): void => {
    const parsed = parseOverrideText(draft);
    if (parsed !== null) {
      try {
        // 'io' origin: an inspector override behaves like a forced field value, not a program write,
        // so it can also force process-image inputs (I) the program itself cannot write.
        memory.write(reg.address, parsed, 'io');
      } catch {
        // Out of range or otherwise invalid: silently discard, the field reverts to the live value.
      }
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 dark:border-[#1a1d24] dark:bg-[#090a0d]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${AREA_BADGE_CLASS[reg.area]}`}>
          {badgeOf(reg)}
        </span>
        <span className="truncate font-sans text-xs font-semibold text-slate-800 dark:text-slate-100">{reg.address}</span>
      </div>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            else if (event.key === 'Escape') setEditing(false);
          }}
          placeholder="dec or 0x.."
          className="h-6 w-28 rounded border border-violet-400 bg-white px-1.5 font-sans text-[11px] text-slate-900 outline-none dark:bg-[#13161c] dark:text-slate-100"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(String(value));
            setEditing(true);
          }}
          title="Click to force a value"
          className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-sans text-[11px] font-medium tabular-nums text-slate-600 transition hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#13161c] dark:hover:text-slate-100"
        >
          <span>Dec: {value}</span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span>Hex: {hex(unsigned, reg.width)}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Live register telemetry: every byte/word/dword address the active program actually references
 * (skipping bit contacts/coils, already shown on the canvas), with a click-to-force override that
 * writes straight into the running VM's memory — the same store the ladder, IL and I/O rack read.
 */
export function RegisterMonitor({ networks, profile, memory, className = '' }: RegisterMonitorProps) {
  // Recomputed only when the program itself changes; a scan updating memory never touches this,
  // each row's own subscription (below) handles that independently.
  const registers = useMemo(() => collectReferencedRegisters(networks, profile), [networks, profile]);

  return (
    <section aria-label="Used registers and memory" className={`${PANEL} ${className}`}>
      <div className={PANEL_HEADER}>
        <div className={PANEL_TITLE}>Registers &amp; Memory</div>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{registers.length} used</span>
      </div>
      {registers.length === 0 ? (
        <p className="p-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
          No VW/VD/VB, timer or counter operands in this program yet.
        </p>
      ) : (
        <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto p-2 font-sans text-xs">
          {registers.map((reg) => (
            <RegisterRow key={reg.address} reg={reg} memory={memory} />
          ))}
        </div>
      )}
    </section>
  );
}
