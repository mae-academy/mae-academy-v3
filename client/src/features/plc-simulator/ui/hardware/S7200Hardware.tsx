import { memo, useCallback, useRef, useState, type PointerEvent, type ReactElement } from 'react';
import type { HardwareProfile } from '../../domain/hardware';
import type { MemoryMap } from '../../domain/memory';
import type { ExecutionMode } from '../../engine/types';
import { PANEL, PANEL_TITLE } from '../chrome';
import { FieldLed, MemoryLed } from './Led';
import { bitAddress, type VirtualField } from './virtual-field';

/** Position of the mechanical mode switch (kept for type compatibility). */
export type ModeSwitchPosition = 'RUN' | 'TERM' | 'STOP';

/** OFF and ON latch; MOMENTARY_PUSH is spring-loaded and only lasts while it is held. */
export type InputMode = 'ON' | 'OFF' | 'MOMENTARY_PUSH';

export interface S7200HardwareProps {
  profile: HardwareProfile;
  memory: MemoryMap;
  field: VirtualField;
  mode: ExecutionMode;
  /** System fault: the last scan reported an error. */
  fault: boolean;
  switchPosition?: ModeSwitchPosition;
  onSwitch?: (position: ModeSwitchPosition) => void;
  className?: string;
}

/** Per-input switch level for a mode: MOMENTARY_PUSH is only true while it is being held. */
export const levelOf = (mode: InputMode): boolean => mode === 'ON' || mode === 'MOMENTARY_PUSH';

/** Three-way switch on one input: OFF, ON, and a spring-loaded momentary push. */
const InputSwitch = memo(function InputSwitch({
  field,
  memory: _memory,
  index,
}: {
  field: VirtualField;
  memory: MemoryMap;
  index: number;
}) {
  const [mode, setMode] = useState<InputMode>('OFF');
  const holding = useRef(false);
  const address = bitAddress('I', index);

  const choose = useCallback(
    (next: InputMode): void => {
      setMode(next);
      field.setInput(index, levelOf(next));
    },
    [field, index],
  );

  const push = (): void => {
    holding.current = true;
    choose('MOMENTARY_PUSH');
  };
  const release = (): void => {
    if (!holding.current) return;
    holding.current = false;
    choose('OFF'); // spring return
  };

  const cell = (active: boolean, tone: 'on' | 'off' | 'push'): string => {
    const base =
      'h-4.5 w-full rounded font-sans text-[7.5px] font-bold leading-none outline-none transition-all focus-visible:ring-1 focus-visible:ring-violet-400 px-0.5';
    if (!active) {
      return `${base} bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800 dark:bg-[#1a1d24] dark:text-slate-400 dark:hover:bg-[#222731] dark:hover:text-slate-200`;
    }
    if (tone === 'on') {
      return `${base} bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)] border border-red-600`;
    }
    if (tone === 'push') {
      return `${base} bg-violet-500 text-white shadow-[0_0_8px_rgba(139,92,246,0.5)] border border-violet-600`;
    }
    return `${base} bg-white text-slate-800 border border-slate-300 shadow-2xs hover:bg-slate-50 dark:bg-slate-700 dark:text-white dark:border-slate-600`;
  };

  return (
    <div
      role="group"
      aria-label={`Input ${address} switch`}
      className="flex w-full min-w-0 flex-col items-center gap-1.5"
      data-input={address}
    >
      <span className="truncate font-sans text-[8.5px] font-bold text-slate-700 dark:text-slate-300">
        {address}
      </span>
      <FieldLed
        field={field}
        index={index}
        color="red"
        label={`${address} terminal`}
        className="!h-4 !w-4 shadow-xs"
      />
      <div className="flex w-full flex-col gap-0.5 rounded border border-slate-200/80 bg-white p-0.5 shadow-2xs dark:border-[#222731] dark:bg-[#13161c]">
        <button
          type="button"
          aria-pressed={mode === 'ON'}
          aria-label={`${address} ON`}
          onClick={() => choose('ON')}
          className={cell(mode === 'ON', 'on')}
        >
          ON
        </button>
        <button
          type="button"
          aria-pressed={mode === 'OFF'}
          aria-label={`${address} OFF`}
          onClick={() => choose('OFF')}
          className={cell(mode === 'OFF', 'off')}
        >
          OFF
        </button>
        <button
          type="button"
          aria-pressed={mode === 'MOMENTARY_PUSH'}
          aria-label={`${address} MOMENTARY_PUSH (hold)`}
          onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            push();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(event) => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
              event.preventDefault();
              push();
            }
          }}
          onKeyUp={(event) => (event.key === ' ' || event.key === 'Enter') && release()}
          className={cell(mode === 'MOMENTARY_PUSH', 'push')}
        >
          PUSH
        </button>
      </div>
    </div>
  );
});

/** LED bank laid out one process-image byte per row, cleanly formatted without clutter. */
function LedBank({
  area,
  bits,
  children,
}: {
  area: 'I' | 'Q';
  bits: number;
  children: (index: number) => ReactElement;
}) {
  const byteCount = Math.ceil(bits / 8);
  const rows = Array.from({ length: byteCount }, (_, byte) => byte);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((byte) => {
        const bitsInByte = Math.min(8, bits - byte * 8);
        return (
          <div key={byte} className="flex flex-col gap-1" data-bank={`${area}${byte}`}>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 8 }, (_, bit) => {
                const index = byte * 8 + bit;
                if (bit < bitsInByte) {
                  return children(index);
                }
                return (
                  <div
                    key={`empty-${index}`}
                    aria-hidden="true"
                    className="flex flex-col items-center justify-center p-1 opacity-0 pointer-events-none"
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * S7-200 I/O Module panel: outputs on top with bright prominent red LEDs,
 * followed by strictly 8-pin aligned inputs with prominent status LEDs.
 */
export function S7200Hardware({
  profile,
  memory,
  field,
  mode: _mode,
  fault: _fault,
  className = '',
}: S7200HardwareProps) {
  const inputs = profile.memory.I?.bitCount ?? 0;
  const outputs = profile.memory.Q?.bitCount ?? 0;

  return (
    <section
      aria-label={`${profile.model} controller`}
      className={`${PANEL} ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-[#1a1d24]">
        <div className={PANEL_TITLE}>I/O MODULE</div>
        <span className="font-sans text-[10px] font-medium text-slate-400 dark:text-slate-500">
          {profile.model}
        </span>
      </div>

      <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto p-2.5 text-xs">
        {/* Digital Outputs at the very TOP for immediate reaction visibility */}
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-0.5">
            Digital Outputs
          </h3>
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-1.5 dark:border-[#1a1d24] dark:bg-[#0d0f12]">
            <LedBank area="Q" bits={outputs}>
              {(index) => {
                const address = bitAddress('Q', index);
                return (
                  <div
                    key={index}
                    className="flex flex-col items-center gap-1.5 rounded border border-slate-200/80 bg-white py-1.5 px-0.5 shadow-2xs dark:border-[#222731] dark:bg-[#13161c]"
                  >
                    <span className="truncate font-sans text-[8.5px] font-bold text-slate-700 dark:text-slate-300">
                      {address}
                    </span>
                    <MemoryLed
                      memory={memory}
                      address={address}
                      color="red"
                      label={address}
                      className="!h-4 !w-4 shadow-xs"
                    />
                  </div>
                );
              }}
            </LedBank>
          </div>
        </div>

        {/* Digital Inputs */}
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-0.5">
            Digital Inputs
          </h3>
          <div role="group" aria-label="Input switches" className="flex flex-col gap-2">
            {Array.from({ length: Math.ceil(inputs / 8) }, (_, byte) => {
              const bitsInByte = Math.min(8, inputs - byte * 8);
              return (
                <div
                  key={byte}
                  className="flex flex-col gap-1 rounded-lg border border-slate-200/80 bg-slate-50/70 p-1.5 dark:border-[#1a1d24] dark:bg-[#0d0f12]"
                >
                  <div className="grid grid-cols-8 gap-1">
                    {Array.from({ length: 8 }, (_, bit) => {
                      const index = byte * 8 + bit;
                      if (bit < bitsInByte) {
                        return <InputSwitch key={index} field={field} memory={memory} index={index} />;
                      }
                      return (
                        <div
                          key={`empty-${index}`}
                          aria-hidden="true"
                          className="flex flex-col items-center justify-center p-0.5 opacity-0 pointer-events-none"
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
