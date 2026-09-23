import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { HardwareProfile } from '../../domain/hardware';
import type { MemoryMap } from '../../domain/memory';
import type { ExecutionMode } from '../../engine/types';
import type { FrameStore } from './frame-store';
import { useFieldInput, useFrameVersion } from './hooks';
import { FieldLed, MemoryLed } from './Led';
import { LcdDisplay } from './LcdDisplay';
import {
  initialLcdState,
  lcdReduce,
  renderLcd,
  type LcdEffect,
  type LcdKey,
  type LcdSnapshot,
  type LcdState,
} from './lcd-fsm';
import { bitAddress, type VirtualField } from './virtual-field';

export interface LogoHardwareProps {
  profile: HardwareProfile;
  memory: MemoryMap;
  field: VirtualField;
  /** Runtime mode; the firmware follows it whenever the host starts or stops the controller. */
  mode: ExecutionMode;
  /** Paces the LCD; the terminals and LEDs subscribe individually and ignore it. */
  frame: FrameStore;
  getSnapshot: () => LcdSnapshot;
  /** Carries out what the firmware asked for (run, stop, write a preset). */
  onEffect: (effect: LcdEffect) => void;
  /**
   * Route the physical keyboard to the keypad: arrows navigate and edit digits, Enter is OK, Escape
   * is ESC. Keys the page or the diagram editor already consumed, and keys typed into fields or
   * pressed on focused controls, are left alone.
   */
  keyboard?: boolean;
  className?: string;
}

const KEY_LABEL: Readonly<Record<LcdKey, { glyph: string; name: string }>> = {
  up: { glyph: '▲', name: 'Up' },
  down: { glyph: '▼', name: 'Down' },
  left: { glyph: '◄', name: 'Left' },
  right: { glyph: '►', name: 'Right' },
  ok: { glyph: 'OK', name: 'OK' },
  esc: { glyph: 'ESC', name: 'Escape' },
};

/** Elements that own the arrow / Enter / Escape keys themselves, so the keypad must not react to them. */
const INTERACTIVE =
  'input, textarea, select, button, a[href], summary, [contenteditable=""], [contenteditable="true"], [role="tab"], [role="slider"], [role="switch"], [role="dialog"]';

const KEYBOARD: Readonly<Record<string, LcdKey>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  Escape: 'esc',
};

/** One screw terminal with its switch: a latching toggle, or a pushbutton held while pressed. */
const InputTerminal = memo(function InputTerminal({
  field,
  memory,
  index,
  push,
}: {
  field: VirtualField;
  memory: MemoryMap;
  index: number;
  push: boolean;
}) {
  const on = useFieldInput(field, index);
  const holding = useRef(false);
  const address = bitAddress('I', index);
  const label = `I${index + 1}`;

  const press = (momentary: boolean): void => {
    if (momentary) {
      holding.current = true;
      field.setInput(index, true);
    } else {
      field.toggleInput(index);
    }
  };
  const release = (): void => {
    if (!holding.current) return;
    holding.current = false;
    field.setInput(index, false);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button > 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    press(push || event.shiftKey);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) press(push);
  };

  return (
    <div className="flex w-9 flex-col items-center gap-1" data-terminal={label}>
      <MemoryLed memory={memory} address={address} color="green" label={`${label} image`} />
      <button
        type="button"
        aria-pressed={on}
        aria-label={`Input ${label} (${address}), ${push ? 'pushbutton' : 'toggle'}`}
        title={`${label} · ${address} — ${push ? 'hold to push' : 'click to toggle, Shift-click to push'}`}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => (event.key === ' ' || event.key === 'Enter') && release()}
        className={`h-6 w-7 rounded-sm border text-[10px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on
            ? 'border-emerald-700 bg-emerald-400 text-emerald-950 shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]'
            : 'border-slate-500 bg-slate-300 text-slate-700 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)]'
          }`}
      >
        {label}
      </button>
      <span className="font-sans text-[8px] font-semibold text-slate-500">{address}</span>
    </div>
  );
});

const OutputRelay = memo(function OutputRelay({ memory, index }: { memory: MemoryMap; index: number }) {
  const address = bitAddress('Q', index);
  return (
    <div className="flex w-9 flex-col items-center gap-1" data-relay={`Q${index + 1}`}>
      <span className="font-sans text-[8px] font-semibold text-slate-500">{address}</span>
      <div className="flex h-6 w-7 items-center justify-center rounded-sm border border-slate-500 bg-slate-300 text-[10px] font-bold text-slate-700">
        {`Q${index + 1}`}
      </div>
      <MemoryLed memory={memory} address={address} color="amber" label={`Relay Q${index + 1} (${address})`} />
    </div>
  );
});

/** LCD wrapper: the only part of the chassis that refreshes at frame rate. */
function LcdPanel({ state, frame, getSnapshot }: { state: LcdState; frame: FrameStore; getSnapshot: () => LcdSnapshot }) {
  useFrameVersion(frame);
  return <LcdDisplay frame={renderLcd(state, getSnapshot())} className="w-full" />;
}

/**
 * Siemens LOGO! 0BA8: input terminals on top, output relays below, a backlit 4-line display and a
 * six-key keypad. The display is driven by the firmware FSM in `lcd-fsm.ts`; this component only
 * holds its state and forwards key presses and the effects it requests.
 */
export function LogoHardware({ profile, memory, field, mode, frame, getSnapshot, onEffect, keyboard = false, className = '' }: LogoHardwareProps) {
  const inputs = profile.memory.I?.bitCount ?? 0;
  const outputs = profile.memory.Q?.bitCount ?? 0;
  const [push, setPush] = useState(false);

  const lcd = useRef<LcdState>(initialLcdState(mode));
  const [lcdState, setLcdState] = useState<LcdState>(lcd.current);
  const effects = useRef(onEffect);
  effects.current = onEffect;

  const send = useCallback(
    (event: Parameters<typeof lcdReduce>[1]): void => {
      const result = lcdReduce(lcd.current, event, getSnapshot());
      lcd.current = result.state;
      setLcdState(result.state);
      for (const effect of result.effects) effects.current(effect);
    },
    [getSnapshot],
  );

  // Follow the controller when it is started or stopped from the toolbar or the program itself.
  useEffect(() => send({ type: 'mode', mode }), [mode, send]);

  // Brief "pressed" flash on the on-screen key when it was hit from the keyboard.
  const [flash, setFlash] = useState<LcdKey | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const press = useCallback(
    (key: LcdKey): void => {
      send({ type: 'key', key });
      setFlash(key);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 140);
    },
    [send],
  );

  const onKeypadKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const key = KEYBOARD[event.key];
    if (!key || event.target instanceof HTMLButtonElement) return; // buttons handle Enter themselves
    event.preventDefault();
    press(key);
  };

  useEffect(() => {
    if (!keyboard) return undefined;
    const onWindowKey = (event: globalThis.KeyboardEvent): void => {
      const key = KEYBOARD[event.key];
      if (!key || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE) !== null) return;
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }, [keyboard, press]);

  const keyButton = (key: LcdKey, extra = ''): ReactElement => (
    <button
      key={key}
      type="button"
      aria-label={KEY_LABEL[key].name}
      onClick={() => send({ type: 'key', key })}
      data-pressed={flash === key ? 'true' : undefined}
      className={`flex h-9 items-center justify-center rounded-md border border-slate-500 bg-gradient-to-b from-slate-100 to-slate-300 text-xs font-bold text-slate-800 shadow-[0_2px_0_rgba(0,0,0,0.3)] outline-none active:translate-y-px active:shadow-none focus-visible:ring-2 focus-visible:ring-sky-400 data-[pressed=true]:translate-y-px data-[pressed=true]:shadow-none data-[pressed=true]:ring-2 data-[pressed=true]:ring-[#009999] ${extra}`}
    >
      {KEY_LABEL[key].glyph}
    </button>
  );

  return (
    <section
      aria-label="Siemens LOGO! 0BA8 controller"
      className={`w-full max-w-[44rem] rounded-xl border-2 border-slate-400 bg-gradient-to-b from-slate-200 to-slate-300 p-3 text-slate-800 shadow-lg ${className}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-black tracking-widest text-[#009999]">SIEMENS</span>
        <span className="text-xs font-bold tracking-wide">LOGO! 0BA8</span>
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-600">
          Inputs
          <button
            type="button"
            role="switch"
            aria-checked={push}
            onClick={() => setPush((value) => !value)}
            className="rounded border border-slate-500 bg-white px-1.5 py-0.5 text-[10px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {push ? 'Push' : 'Latch'}
          </button>
        </label>
      </div>

      <div role="group" aria-label="Input terminals" className="flex flex-wrap justify-center gap-x-1 gap-y-2 rounded-md bg-slate-400/40 px-2 py-2">
        {Array.from({ length: inputs }, (_, index) => (
          <InputTerminal key={index} field={field} memory={memory} index={index} push={push} />
        ))}
      </div>

      <div className="my-3 flex items-stretch gap-3">
        <LcdPanel state={lcdState} frame={frame} getSnapshot={getSnapshot} />
        <div
          role="group"
          aria-label="Keypad"
          tabIndex={0}
          onKeyDown={onKeypadKeyDown}
          className="grid shrink-0 grid-cols-3 gap-1.5 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          {keyButton('esc')}
          {keyButton('up')}
          {keyButton('ok')}
          {keyButton('left')}
          {keyButton('down')}
          {keyButton('right')}
        </div>
      </div>

      {keyboard && (
        <div
          role="note"
          aria-label="Keyboard shortcuts"
          className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-slate-400/25 px-2 py-1 font-sans text-[10px] font-medium text-slate-600"
        >
          <span>[▲▼◄► Nav]</span>
          <span>[Enter: OK]</span>
          <span>[Esc: Back]</span>
        </div>
      )}

      <div role="group" aria-label="Output relays" className="flex flex-wrap justify-center gap-x-1 gap-y-2 rounded-md bg-slate-400/40 px-2 py-2">
        {Array.from({ length: outputs }, (_, index) => (
          <OutputRelay key={index} memory={memory} index={index} />
        ))}
      </div>
    </section>
  );
}
