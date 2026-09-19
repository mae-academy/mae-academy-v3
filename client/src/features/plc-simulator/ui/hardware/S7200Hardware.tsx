import { memo, useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { HardwareProfile } from '../../domain/hardware';
import type { MemoryMap } from '../../domain/memory';
import type { ExecutionMode } from '../../engine/types';
import { FieldLed, Led, MemoryLed } from './Led';
import { bitAddress, type VirtualField } from './virtual-field';

/** Position of the mechanical mode switch. TERM leaves control to the programming software. */
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
  switchPosition: ModeSwitchPosition;
  onSwitch: (position: ModeSwitchPosition) => void;
  className?: string;
}

const SWITCH_POSITIONS: readonly ModeSwitchPosition[] = ['RUN', 'TERM', 'STOP'];

/** Per-input switch level for a mode: MOMENTARY_PUSH is only true while it is being held. */
export const levelOf = (mode: InputMode): boolean => mode === 'ON' || mode === 'MOMENTARY_PUSH';

function ModeSwitch({ position, onSwitch }: { position: ModeSwitchPosition; onSwitch: (p: ModeSwitchPosition) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = SWITCH_POSITIONS.indexOf(position);
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? at - 1 : at;
    const target = SWITCH_POSITIONS[Math.max(0, Math.min(SWITCH_POSITIONS.length - 1, next))];
    if (target && target !== position) {
      event.preventDefault();
      onSwitch(target);
    }
  };
  const index = SWITCH_POSITIONS.indexOf(position);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="radiogroup"
        aria-label="Mode switch"
        onKeyDown={onKeyDown}
        className="relative grid w-40 grid-cols-3 rounded-md border border-zinc-700 bg-zinc-950 p-0.5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/3)] rounded bg-gradient-to-b from-zinc-300 to-zinc-500 shadow transition-transform duration-150"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {SWITCH_POSITIONS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="radio"
            aria-checked={entry === position}
            tabIndex={entry === position ? 0 : -1}
            onClick={() => onSwitch(entry)}
            className={`relative z-10 h-7 rounded text-[10px] font-bold tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              entry === position ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {entry}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Three-way switch on one input: OFF, ON, and a spring-loaded momentary push. */
const InputSwitch = memo(function InputSwitch({
  field,
  memory,
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

  // Only ON reads as energised (green); the resting OFF position is neutral and the spring-loaded
  // PUSH position is amber, so a glance at the panel shows which inputs are actually driven.
  const cell = (active: boolean, tone: 'on' | 'off' | 'push'): string =>
    `h-5 w-full rounded-sm text-[8px] font-bold leading-none outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
      !active
        ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
        : tone === 'on'
          ? 'bg-emerald-400 text-emerald-950'
          : tone === 'push'
            ? 'bg-amber-400 text-amber-950'
            : 'bg-zinc-500 text-white'
    }`;

  return (
    <div role="group" aria-label={`Input ${address} switch`} className="flex w-11 flex-col items-center gap-1" data-input={address}>
      <span className="font-mono text-[9px] text-zinc-400">{address}</span>
      <div className="flex gap-1">
        <MemoryLed memory={memory} address={address} color="green" label={`${address} image`} />
        <FieldLed field={field} index={index} color="amber" label={`${address} terminal`} />
      </div>
      <div className="flex w-full flex-col gap-px rounded bg-zinc-900 p-px">
        <button type="button" aria-pressed={mode === 'ON'} aria-label={`${address} ON`} onClick={() => choose('ON')} className={cell(mode === 'ON', 'on')}>
          ON
        </button>
        <button type="button" aria-pressed={mode === 'OFF'} aria-label={`${address} OFF`} onClick={() => choose('OFF')} className={cell(mode === 'OFF', 'off')}>
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

/** LED bank laid out one process-image byte per row, exactly as the CPU labels them. */
function LedBank({
  area,
  bits,
  children,
}: {
  area: 'I' | 'Q';
  bits: number;
  children: (index: number) => ReactElement;
}) {
  const rows = Array.from({ length: Math.ceil(bits / 8) }, (_, byte) => byte);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((byte) => (
        <div key={byte} className="flex flex-wrap items-end gap-x-1.5 gap-y-1" data-bank={`${area}${byte}`}>
          <span className="w-6 font-mono text-[10px] font-bold text-zinc-400">{`${area}${byte}`}</span>
          {Array.from({ length: Math.min(8, bits - byte * 8) }, (_, bit) => children(byte * 8 + bit))}
        </div>
      ))}
    </div>
  );
}

/**
 * S7-200 CPU 224 / 226 front panel: status LEDs, RUN/TERM/STOP switch, banks of I/O LEDs sized from
 * the hardware profile, and a three-way test switch on every input.
 */
export function S7200Hardware({ profile, memory, field, mode, fault, switchPosition, onSwitch, className = '' }: S7200HardwareProps) {
  const inputs = profile.memory.I?.bitCount ?? 0;
  const outputs = profile.memory.Q?.bitCount ?? 0;
  const running = mode === 'RUN' || mode === 'SINGLE_STEP';

  return (
    <section
      aria-label={`${profile.model} controller`}
      className={`w-full max-w-[44rem] rounded-lg border border-zinc-700 bg-gradient-to-b from-zinc-800 to-zinc-900 p-3 text-zinc-200 shadow-xl ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700 pb-3">
        <div>
          <div className="text-[10px] font-black tracking-[0.25em] text-[#00b8b8]">SIEMENS</div>
          <div className="text-sm font-bold">{profile.model.replace('S7-200 ', 'SIMATIC S7-200 ')}</div>
        </div>

        <div role="group" aria-label="System status" className="flex items-center gap-4">
          {(
            [
              ['SF', fault, 'red'],
              ['RUN', running || mode === 'PAUSE', 'green'],
              ['STOP', mode === 'STOP', 'amber'],
            ] as const
          ).map(([name, on, color]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <Led on={on} color={color} label={name === 'SF' ? 'SF / system fault' : name} className={name === 'RUN' && mode === 'PAUSE' ? 'animate-pulse' : ''} />
              <span className="text-[9px] font-bold tracking-wider text-zinc-400">{name === 'SF' ? 'SF/DIAG' : name}</span>
            </div>
          ))}
        </div>

        <ModeSwitch position={switchPosition} onSwitch={onSwitch} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr]">
        <div>
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Digital inputs</h3>
          <div role="group" aria-label="Input switches" className="flex flex-col gap-2">
            {Array.from({ length: Math.ceil(inputs / 8) }, (_, byte) => (
              <div key={byte} className="flex flex-wrap gap-x-1 gap-y-2 rounded bg-zinc-900/70 p-1.5">
                {Array.from({ length: Math.min(8, inputs - byte * 8) }, (_, bit) => (
                  <InputSwitch key={byte * 8 + bit} field={field} memory={memory} index={byte * 8 + bit} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Digital outputs</h3>
          <div className="rounded bg-zinc-900/70 p-2">
            <LedBank area="Q" bits={outputs}>
              {(index) => (
                <div key={index} className="flex flex-col items-center gap-0.5">
                  <MemoryLed memory={memory} address={bitAddress('Q', index)} color="green" label={bitAddress('Q', index)} />
                  <span className="font-mono text-[8px] text-zinc-500">{index & 7}</span>
                </div>
              )}
            </LedBank>
          </div>
        </div>
      </div>
    </section>
  );
}
