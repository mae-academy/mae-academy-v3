import type { ExecutionMode } from '../../engine/types';

/**
 * Firmware model of the LOGO! 0BA8 front-panel display and keypad.
 *
 * `lcdReduce` is a pure transition function: given the current screen, a key press or a mode change
 * and a snapshot of the controller, it returns the next screen and the *effects* the firmware wants
 * performed (start, stop, write a preset). It never touches the runtime itself, which keeps every
 * transition unit-testable and lets the host decide how an effect is carried out.
 */

export const LCD_COLS = 12;
export const LCD_ROWS = 4;
/** Timer and counter presets are signed 16-bit words. */
export const PRESET_MAX = 32767;
export const PRESET_DIGITS = 5;

export type LcdKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'esc';

export interface LcdParam {
  readonly kind: 'timer' | 'counter';
  readonly instance: string;
  /** First line of the parameter page: `T37 100ms`, `C0 CTU`. */
  readonly title: string;
  readonly label: 'PT' | 'PV';
  readonly current: number;
  readonly preset: number;
}

export interface LcdSnapshot {
  readonly mode: ExecutionMode;
  readonly inputs: readonly boolean[];
  readonly outputs: readonly boolean[];
  readonly params: readonly LcdParam[];
  readonly program: { readonly networks: number; readonly blocks: number };
  readonly scanMs: number;
}

export const MENU_ITEMS = ['start', 'program', 'setup', 'network'] as const;
export type MenuItem = (typeof MENU_ITEMS)[number];
export type InfoTopic = Exclude<MenuItem, 'start'>;

export type LcdScreen =
  | { readonly kind: 'menu'; readonly cursor: number }
  | { readonly kind: 'info'; readonly topic: InfoTopic }
  /** `page` 0 is the I/O matrix; page k >= 1 is `params[k - 1]`. */
  | { readonly kind: 'monitor'; readonly page: number }
  | { readonly kind: 'confirmStop'; readonly cursor: 0 | 1; readonly page: number }
  | {
      readonly kind: 'edit';
      readonly page: number;
      readonly instance: string;
      readonly label: 'PT' | 'PV';
      readonly digits: readonly number[];
      readonly pos: number;
    };

export interface LcdState {
  readonly screen: LcdScreen;
}

export type LcdEffect =
  | { readonly type: 'run' }
  | { readonly type: 'stop' }
  | { readonly type: 'commit'; readonly instance: string; readonly label: 'PT' | 'PV'; readonly value: number };

export type LcdEvent =
  | { readonly type: 'key'; readonly key: LcdKey }
  | { readonly type: 'mode'; readonly mode: ExecutionMode };

export interface LcdStep {
  readonly state: LcdState;
  readonly effects: readonly LcdEffect[];
}

export interface LcdFrame {
  /** Always `LCD_ROWS` lines of exactly `LCD_COLS` characters. */
  readonly lines: readonly string[];
  /** Block cursor of the value editor. */
  readonly cursor: { readonly line: number; readonly col: number } | null;
  readonly backlight: 'stop' | 'run';
}

// ---- helpers -----------------------------------------------------------------------------------

const isRunning = (mode: ExecutionMode): boolean => mode !== 'STOP';
const step = (screen: LcdScreen, ...effects: LcdEffect[]): LcdStep => ({ state: { screen }, effects });
const stay = (state: LcdState): LcdStep => ({ state, effects: [] });

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const pageCount = (snap: LcdSnapshot): number => 1 + snap.params.length;
const safePage = (page: number, snap: LcdSnapshot): number => clamp(page, 0, pageCount(snap) - 1);

/** Digits of `value`, zero-padded to the editor width and clamped to the preset range. */
export function toDigits(value: number): readonly number[] {
  const text = String(clamp(Math.trunc(value), 0, PRESET_MAX)).padStart(PRESET_DIGITS, '0');
  return Array.from(text, Number);
}

export const fromDigits = (digits: readonly number[]): number =>
  Math.min(PRESET_MAX, Number(digits.join('')) || 0);

export const initialLcdState = (mode: ExecutionMode): LcdState => ({
  screen: isRunning(mode) ? { kind: 'monitor', page: 0 } : { kind: 'menu', cursor: 0 },
});

// ---- transitions -------------------------------------------------------------------------------

export function lcdReduce(state: LcdState, event: LcdEvent, snap: LcdSnapshot): LcdStep {
  const { screen } = state;

  if (event.type === 'mode') {
    if (event.mode === 'STOP') {
      // The controller stopped under the display (toolbar, mode switch): drop any edit, show the menu.
      return screen.kind === 'monitor' || screen.kind === 'confirmStop' || screen.kind === 'edit'
        ? step({ kind: 'menu', cursor: 0 })
        : stay(state);
    }
    return screen.kind === 'menu' || screen.kind === 'info' ? step({ kind: 'monitor', page: 0 }) : stay(state);
  }

  const { key } = event;

  switch (screen.kind) {
    case 'menu': {
      if (key === 'up') return step({ kind: 'menu', cursor: clamp(screen.cursor - 1, 0, MENU_ITEMS.length - 1) });
      if (key === 'down') return step({ kind: 'menu', cursor: clamp(screen.cursor + 1, 0, MENU_ITEMS.length - 1) });
      if (key === 'ok') {
        const item = MENU_ITEMS[screen.cursor] ?? 'start';
        return item === 'start' ? step(screen, { type: 'run' }) : step({ kind: 'info', topic: item });
      }
      return stay(state);
    }

    case 'info': {
      if (key === 'esc' || key === 'ok') {
        return step({ kind: 'menu', cursor: MENU_ITEMS.indexOf(screen.topic) });
      }
      return stay(state);
    }

    case 'monitor': {
      const page = safePage(screen.page, snap);
      const last = pageCount(snap);
      if (key === 'up' || key === 'left') return step({ kind: 'monitor', page: (page - 1 + last) % last });
      if (key === 'down' || key === 'right') return step({ kind: 'monitor', page: (page + 1) % last });
      if (key === 'esc') return step({ kind: 'confirmStop', cursor: 0, page });
      if (key === 'ok') {
        const param = page > 0 ? snap.params[page - 1] : undefined;
        if (!param) return stay(state);
        return step({
          kind: 'edit',
          page,
          instance: param.instance,
          label: param.label,
          digits: toDigits(param.preset),
          pos: PRESET_DIGITS - 1,
        });
      }
      return stay(state);
    }

    case 'confirmStop': {
      if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
        return step({ ...screen, cursor: screen.cursor === 0 ? 1 : 0 });
      }
      if (key === 'esc') return step({ kind: 'monitor', page: screen.page });
      if (key === 'ok') {
        return screen.cursor === 0
          ? step({ kind: 'menu', cursor: 0 }, { type: 'stop' })
          : step({ kind: 'monitor', page: screen.page });
      }
      return stay(state);
    }

    case 'edit': {
      if (key === 'left') return step({ ...screen, pos: clamp(screen.pos - 1, 0, PRESET_DIGITS - 1) });
      if (key === 'right') return step({ ...screen, pos: clamp(screen.pos + 1, 0, PRESET_DIGITS - 1) });
      if (key === 'up' || key === 'down') {
        const delta = key === 'up' ? 1 : 9; // +9 mod 10 == -1, so digits wrap without carrying
        const digits = screen.digits.map((digit, index) => (index === screen.pos ? (digit + delta) % 10 : digit));
        return step({ ...screen, digits });
      }
      if (key === 'esc') return step({ kind: 'monitor', page: screen.page }); // nothing was written: rolled back
      if (key === 'ok') {
        return step(
          { kind: 'monitor', page: screen.page },
          { type: 'commit', instance: screen.instance, label: screen.label, value: fromDigits(screen.digits) },
        );
      }
      return stay(state);
    }

    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

// ---- rendering ---------------------------------------------------------------------------------

/** Fits text to one display line: truncated or space-padded to exactly `LCD_COLS`. */
export const fit = (text: string): string => text.slice(0, LCD_COLS).padEnd(LCD_COLS, ' ');

const pad5 = (value: number): string => String(clamp(Math.trunc(value), -9999, 99999)).padStart(PRESET_DIGITS, '0');

/** `I0:10100000` — one byte of an I/O area, lowest bit first, as the process image lays it out. */
function byteRow(area: 'I' | 'Q', byte: number, bits: readonly boolean[]): string {
  const cells = bits.slice(byte * 8, byte * 8 + 8).map((on) => (on ? '1' : '0'));
  return `${area}${byte}:${cells.join('')}`;
}

function ioMatrix(snap: LcdSnapshot): string[] {
  const rows: string[] = [];
  for (let byte = 0; byte * 8 < snap.inputs.length; byte++) rows.push(byteRow('I', byte, snap.inputs));
  for (let byte = 0; byte * 8 < snap.outputs.length; byte++) rows.push(byteRow('Q', byte, snap.outputs));
  return rows.slice(0, LCD_ROWS);
}

const finish = (rows: readonly string[], snap: LcdSnapshot, cursor: LcdFrame['cursor'] = null): LcdFrame => ({
  lines: Array.from({ length: LCD_ROWS }, (_, index) => fit(rows[index] ?? '')),
  cursor,
  backlight: isRunning(snap.mode) ? 'run' : 'stop',
});

export function renderLcd(state: LcdState, snap: LcdSnapshot): LcdFrame {
  const { screen } = state;

  switch (screen.kind) {
    case 'menu': {
      const labels = ['► Start', 'Program', 'Setup', 'Network'];
      return finish(labels.map((label, index) => `${index === screen.cursor ? '>' : ' '}${label}`), snap);
    }

    case 'info': {
      if (screen.topic === 'program') {
        return finish(['Program', `Nets:${snap.program.networks}`, `Blocks:${snap.program.blocks}`], snap);
      }
      if (screen.topic === 'setup') return finish(['Setup', `Scan:${snap.scanMs}ms`, 'Clock: --'], snap);
      return finish(['Network', 'No module'], snap);
    }

    case 'monitor': {
      const page = safePage(screen.page, snap);
      const param = page > 0 ? snap.params[page - 1] : undefined;
      if (!param) return finish(ioMatrix(snap), snap);
      return finish(
        [param.title, `CV ${pad5(param.current)}`, `>${param.label} ${pad5(param.preset)}`, `${page}/${snap.params.length}`],
        snap,
      );
    }

    case 'confirmStop':
      return finish(
        // "Stop Program?" is 13 characters and the panel is 12 wide, so the prompt wraps over two lines.
        ['Stop', 'Program?', `${screen.cursor === 0 ? '>' : ' '}Yes`, `${screen.cursor === 1 ? '>' : ' '}No`],
        snap,
      );

    case 'edit': {
      const param = snap.params.find((entry) => entry.instance === screen.instance);
      const prefix = `>${screen.label} `;
      return finish(
        [param?.title ?? screen.instance, `CV ${pad5(param?.current ?? 0)}`, `${prefix}${screen.digits.join('')}`, 'OK save ESC'],
        snap,
        { line: 2, col: prefix.length + screen.pos },
      );
    }

    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}
