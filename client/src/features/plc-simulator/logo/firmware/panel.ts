import { nextBlockId, type WireTarget } from '../engine/compile';
import type { CpuMode, ParamView } from '../engine/cpu';
import { canAddBlock, freeMemory, type MemoryUsage } from '../engine/memory';
import { COUNT_MAX, formatTime, fromTimeFields, TIME_MAX, timeFields } from '../engine/time';
import {
  BLOCK_SPECS,
  connectorName,
  type BlockType,
  type SinkTarget,
  sinkName,
  type Bit,
  type ConnectorRef,
  type LogoProgram,
  type NumericParamKey,
  type PinName,
  type WireIn,
} from '../engine/types';

/**
 * LOGO! 0BA4 front-panel firmware (spec §2): the menu tree of Appendix D as a pure state machine.
 * `panelReduce` maps (screen, key / host event, controller snapshot) to the next screen plus the
 * effects the firmware requests (run, stop, write a parameter, rewire a connector, card transfer).
 * `renderPanel` turns a screen into the 4 x 12 character frame.
 */

export const LCD_COLS = 12;
export const LCD_ROWS = 4;

export type PanelKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'esc';

export interface RtcReading {
  /** 0 = Monday ... 6 = Sunday. */
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface PanelSnapshot {
  readonly powered: boolean;
  readonly mode: CpuMode;
  readonly program: LogoProgram;
  readonly usage: MemoryUsage;
  /** I1..I24, Q1..Q16, M1..M24 as currently committed. */
  readonly inputs: readonly Bit[];
  readonly outputs: readonly Bit[];
  readonly flags: readonly Bit[];
  readonly params: readonly ParamView[];
  readonly clock: RtcReading;
  readonly card: { readonly program: LogoProgram | null; readonly protect: boolean };
  readonly swTime: boolean;
  readonly sync: boolean;
}

interface PathStep {
  readonly node: { readonly kind: 'sink'; readonly target: SinkTarget } | { readonly kind: 'block'; readonly id: number };
  readonly pin: number;
}

/** Connector-list categories of the selection cursor (spec §2.3): constants, basic functions, special functions, block numbers. */
export type PickerCategory = 'Co' | 'GF' | 'SF' | 'BN';
export type Picker =
  | { readonly kind?: undefined; readonly stage: 'category'; readonly cursor: number }
  | { readonly kind?: undefined; readonly stage: 'list'; readonly category: PickerCategory; readonly cursor: number };
export type PickerItem = { readonly kind: 'ref'; readonly ref: ConnectorRef } | { readonly kind: 'block'; readonly type: BlockType };

export type PanelScreen =
  | { readonly kind: 'noProgram' }
  | { readonly kind: 'main'; readonly cursor: number }
  | { readonly kind: 'programming'; readonly cursor: number }
  /**
   * Circuit browser, output -> inputs. `picker` is the Co/GF/SF/BN list (solid-block cursor); `onPin`
   * moves the underscore cursor from the output name to its (still empty) connector.
   */
  | { readonly kind: 'editPrg'; readonly path: readonly PathStep[]; readonly picker: Picker | null; readonly onPin: boolean }
  | { readonly kind: 'info'; readonly topic: 'memory' | 'name' | 'password'; readonly back: PanelScreen }
  | { readonly kind: 'message'; readonly lines: readonly string[]; readonly back: PanelScreen }
  /** Yes/No prompt; cursor 0 = No (the default), 1 = Yes. */
  | { readonly kind: 'confirm'; readonly action: 'clear' | 'stop'; readonly cursor: 0 | 1 }
  | { readonly kind: 'transfer'; readonly cursor: number }
  | { readonly kind: 'clock'; readonly cursor: number }
  | {
      readonly kind: 'setClock';
      readonly field: number;
      readonly draft: { readonly weekday: number; readonly hour: number; readonly minute: number };
      readonly back: PanelScreen;
    }
  /** On/Off selector; cursor 0 = On, 1 = Off. */
  | { readonly kind: 'toggle'; readonly setting: 'swTime' | 'sync'; readonly cursor: 0 | 1 }
  /** RUN start screens: 0 date/time, 1 I:, 2 Q:, 3 M:. */
  | { readonly kind: 'run'; readonly page: number }
  | { readonly kind: 'paramMenu'; readonly cursor: number }
  | { readonly kind: 'setParam'; readonly index: number }
  | { readonly kind: 'editParam'; readonly index: number; readonly digits: readonly number[]; readonly pos: number };

export type PanelEffect =
  | { readonly type: 'run' }
  | { readonly type: 'stop' }
  | { readonly type: 'setParam'; readonly blockId: number; readonly key: NumericParamKey; readonly value: number }
  | { readonly type: 'rewire'; readonly target: WireTarget; readonly ref: ConnectorRef }
  | { readonly type: 'placeBlock'; readonly target: WireTarget; readonly blockType: BlockType }
  | { readonly type: 'clearProgram' }
  | { readonly type: 'toCard' }
  | { readonly type: 'fromCard' }
  | { readonly type: 'toggleCopyProtect' }
  | { readonly type: 'setClock'; readonly weekday: number; readonly hour: number; readonly minute: number }
  | { readonly type: 'setSwTime'; readonly on: boolean }
  | { readonly type: 'setSync'; readonly on: boolean };

export type PanelEvent =
  | { readonly type: 'key'; readonly key: PanelKey }
  /** The controller changed mode underneath the display (toolbar, refused start, ...). */
  | { readonly type: 'mode'; readonly mode: CpuMode }
  /** Power restored, or a new program was loaded: restart the display from the top. */
  | { readonly type: 'reset' };

export interface PanelStep {
  readonly screen: PanelScreen;
  readonly effects: readonly PanelEffect[];
}

/** One LCD frame: exactly `LCD_ROWS` lines of `LCD_COLS` characters. */
export interface PanelFrame {
  readonly lines: readonly string[];
  /** Inverted character runs: active I/Q/M bits, the solid-block selection cursor. */
  readonly inverted: readonly { readonly line: number; readonly col: number; readonly length: number }[];
  /** Blinking digit cursor of a value editor. */
  readonly cursor: { readonly line: number; readonly col: number } | null;
  readonly backlight: 'run' | 'stop' | 'off';
}

// ---- menu definitions ---------------------------------------------------------------------------

export const MAIN_MENU = ['Program..', 'Card..', 'Clock..', 'Start'] as const;
export const PROGRAMMING_MENU = ['Edit..', 'Edit Name', 'Memory?', 'Clear Prg', 'Password'] as const;
export const TRANSFER_MENU = ['→Card', 'Card→', 'CopyProtect'] as const;
export const CLOCK_MENU = ['Set Clock', 'S/W Time', 'Sync'] as const;
export const PARAM_MENU = ['Stop', 'Set Param', 'Set Clock', 'Prg Name'] as const;
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const RUN_PAGES = 4;

const BENCH_IO = { I: 8, Q: 4, M: 8 } as const;

// ---- helpers ------------------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const wrap = (value: number, length: number): number => ((value % length) + length) % length;
const go = (screen: PanelScreen, ...effects: PanelEffect[]): PanelStep => ({ screen, effects });
const hasProgram = (snap: PanelSnapshot): boolean => snap.program.sinks.length > 0;

export function initialPanel(snap: PanelSnapshot): PanelScreen {
  if (!hasProgram(snap)) return { kind: 'noProgram' };
  return snap.mode === 'RUN' ? { kind: 'run', page: 0 } : { kind: 'main', cursor: 0 };
}

/** Screens that only exist while the program runs (parameter-assignment overlay). */
function isRunScreen(screen: PanelScreen): boolean {
  switch (screen.kind) {
    case 'run':
    case 'paramMenu':
    case 'setParam':
    case 'editParam':
      return true;
    case 'confirm':
      return screen.action === 'stop';
    case 'info':
    case 'message':
    case 'setClock':
      return isRunScreen(screen.back);
    default:
      return false;
  }
}

interface PinRow {
  readonly name: string;
  readonly wire: WireIn;
  readonly target: WireTarget;
}

/** Pins of the node the circuit browser currently shows; null when the path is stale. */
function nodePins(step: PathStep, program: LogoProgram): readonly PinRow[] | null {
  const node = step.node;
  if (node.kind === 'sink') {
    const name = sinkName(node.target);
    const sink = program.sinks.find((candidate) => sinkName(candidate.target) === name);
    return [{ name: 'In', wire: { ref: sink?.source ?? { kind: 'x' } }, target: { kind: 'output', target: node.target } }];
  }
  const id = node.id;
  const block = program.blocks.find((candidate) => candidate.id === id);
  if (!block) return null;
  return BLOCK_SPECS[block.type].pins.map((pin: PinName) => ({
    name: pin,
    wire: block.inputs[pin] ?? { ref: { kind: 'x' } },
    target: { kind: 'pin', blockId: id, pin },
  }));
}

/** Outputs the browser can visit: the driven ones in program order, then the free Q1..Q4 (empty `- [ Qn ]`). */
export function outputSlots(program: LogoProgram): SinkTarget[] {
  const used = program.sinks.map((sink) => sink.target);
  const free: SinkTarget[] = [];
  for (let index = 1; index <= BENCH_IO.Q; index++) {
    if (!used.some((target) => sinkName(target) === `Q${index}`)) free.push({ kind: 'digital-output', index });
  }
  return [...used, ...free];
}

const GF_TYPES: readonly BlockType[] = ['AND', 'AND_EDGE', 'NAND', 'NAND_EDGE', 'OR', 'NOR', 'XOR', 'NOT'];
const SF_TYPES: readonly BlockType[] = [
  'ON_DELAY',
  'OFF_DELAY',
  'ON_OFF_DELAY',
  'RETENTIVE_ON_DELAY',
  'WIPING_RELAY',
  'PULSE_GENERATOR',
  'STAIRWAY',
  'UP_DOWN_COUNTER',
  'LATCHING_RELAY',
  'PULSE_RELAY',
];

export function pickerCategories(program: LogoProgram, forBlock: number | null): PickerCategory[] {
  return program.blocks.some((block) => block.id !== forBlock) ? ['Co', 'GF', 'SF', 'BN'] : ['Co', 'GF', 'SF'];
}

/** Firmware picker rule (spec §3.1): a block the memory can no longer afford is simply not offered. */
export function pickerItems(program: LogoProgram, category: PickerCategory, forBlock: number | null, usage: MemoryUsage): PickerItem[] {
  if (category === 'GF' || category === 'SF') {
    return (category === 'GF' ? GF_TYPES : SF_TYPES).filter((type) => canAddBlock(usage, type, false)).map((type) => ({ kind: 'block', type }));
  }
  const wantBlocks = category === 'BN';
  return connectorOptions(program, forBlock)
    .filter((ref) => (ref.kind === 'block-output') === wantBlocks)
    .map((ref) => ({ kind: 'ref', ref }));
}

const itemLabel = (item: PickerItem): string => (item.kind === 'ref' ? connectorName(item.ref) : BLOCK_SPECS[item.type].label);

/** Connector list of the selection cursor (spec §2.3 rule 3): constants, bench I/O, flags, blocks. */
export function connectorOptions(program: LogoProgram, forBlock: number | null): ConnectorRef[] {
  const options: ConnectorRef[] = forBlock === null ? [] : [{ kind: 'x' }];
  options.push({ kind: 'hi' }, { kind: 'lo' });
  for (let i = 1; i <= BENCH_IO.I; i++) options.push({ kind: 'digital-input', index: i });
  for (let i = 1; i <= BENCH_IO.Q; i++) options.push({ kind: 'digital-output', index: i });
  for (let i = 1; i <= BENCH_IO.M; i++) options.push({ kind: 'digital-flag', index: i });
  for (const block of [...program.blocks].sort((a, b) => a.id - b.id)) {
    if (block.id !== forBlock) options.push({ kind: 'block-output', blockId: block.id });
  }
  return options;
}

const currentBlock = (path: readonly PathStep[]): number | null => {
  const node = path[path.length - 1]?.node;
  return node?.kind === 'block' ? node.id : null;
};

function paramDigits(view: ParamView): number[] {
  if (view.kind === 'count') return Array.from(String(clamp(view.value, 0, COUNT_MAX)).padStart(6, '0'), Number);
  const [major, minor] = timeFields(view.base ?? 's', view.value);
  return [Math.floor(major / 10), major % 10, Math.floor(minor / 10), minor % 10];
}

function digitsValue(view: ParamView, digits: readonly number[]): number {
  if (view.kind === 'count') return clamp(Number(digits.join('')) || 0, 0, COUNT_MAX);
  const [a = 0, b = 0, c = 0, d = 0] = digits;
  return fromTimeFields(view.base ?? 's', a * 10 + b, c * 10 + d);
}

const menuMove = (cursor: number, key: PanelKey, length: number): number =>
  key === 'up' ? clamp(cursor - 1, 0, length - 1) : key === 'down' ? clamp(cursor + 1, 0, length - 1) : cursor;

// ---- transitions --------------------------------------------------------------------------------

export function panelReduce(screen: PanelScreen, event: PanelEvent, snap: PanelSnapshot): PanelStep {
  if (event.type === 'reset') return go(initialPanel(snap));
  if (event.type === 'mode') {
    if (event.mode === 'RUN' && !isRunScreen(screen)) return go({ kind: 'run', page: 0 });
    if (event.mode === 'STOP' && isRunScreen(screen)) return go(hasProgram(snap) ? { kind: 'main', cursor: 0 } : { kind: 'noProgram' });
    return go(screen);
  }
  if (!snap.powered) return go(screen);

  const { key } = event;
  const vertical = key === 'up' || key === 'down';

  switch (screen.kind) {
    case 'noProgram':
      return key === 'esc' ? go({ kind: 'main', cursor: 0 }) : go(screen);

    case 'main': {
      if (vertical) return go({ kind: 'main', cursor: menuMove(screen.cursor, key, MAIN_MENU.length) });
      if (key !== 'ok') return go(screen);
      if (screen.cursor === 0) return go({ kind: 'programming', cursor: 0 });
      if (screen.cursor === 1) return go({ kind: 'transfer', cursor: 0 });
      if (screen.cursor === 2) return go({ kind: 'clock', cursor: 0 });
      return hasProgram(snap) ? go({ kind: 'run', page: 0 }, { type: 'run' }) : go({ kind: 'noProgram' });
    }

    case 'programming': {
      if (vertical) return go({ kind: 'programming', cursor: menuMove(screen.cursor, key, PROGRAMMING_MENU.length) });
      if (key === 'esc') return go({ kind: 'main', cursor: 0 });
      if (key !== 'ok') return go(screen);
      const back: PanelScreen = screen;
      switch (screen.cursor) {
        case 0: {
          const first = outputSlots(snap.program)[0] ?? { kind: 'digital-output' as const, index: 1 };
          return go({ kind: 'editPrg', path: [{ node: { kind: 'sink', target: first }, pin: 0 }], picker: null, onPin: false });
        }
        case 1:
          return go({ kind: 'info', topic: 'name', back });
        case 2:
          return go({ kind: 'info', topic: 'memory', back });
        case 3:
          return go({ kind: 'confirm', action: 'clear', cursor: 0 });
        default:
          return go({ kind: 'info', topic: 'password', back });
      }
    }

    case 'editPrg': {
      const step = screen.path[screen.path.length - 1];
      const pins = step ? nodePins(step, snap.program) : null;
      if (!step || !pins) return go({ kind: 'programming', cursor: 0 });
      const row = pins[clamp(step.pin, 0, pins.length - 1)];
      if (!row) return go(screen);
      const forBlock = currentBlock(screen.path);
      const picker = screen.picker;

      if (picker !== null) {
        const categories = pickerCategories(snap.program, forBlock);
        const delta = key === 'up' || key === 'left' ? -1 : 1;
        if (picker.stage === 'category') {
          if (key === 'esc') return go({ ...screen, picker: null });
          if (key !== 'ok') return go({ ...screen, picker: { stage: 'category', cursor: wrap(picker.cursor + delta, categories.length) } });
          const category = categories[picker.cursor];
          if (!category) return go(screen);
          const items = pickerItems(snap.program, category, forBlock, snap.usage);
          if (items.length === 0) return go(screen);
          const current = items.findIndex((item) => item.kind === 'ref' && connectorName(item.ref) === connectorName(row.wire.ref));
          return go({ ...screen, picker: { stage: 'list', category, cursor: Math.max(0, current) } });
        }
        const items = pickerItems(snap.program, picker.category, forBlock, snap.usage);
        if (key === 'esc') return go({ ...screen, picker: { stage: 'category', cursor: Math.max(0, categories.indexOf(picker.category)) } });
        if (key !== 'ok') return go({ ...screen, picker: { ...picker, cursor: wrap(picker.cursor + delta, Math.max(1, items.length)) } });
        const item = items[picker.cursor];
        if (!item) return go({ ...screen, picker: null });
        if (item.kind === 'ref') return go({ ...screen, picker: null }, { type: 'rewire', target: row.target, ref: item.ref });
        // A placed block takes the next block number; focus moves on to its input pins.
        const placed: PathStep = { node: { kind: 'block', id: nextBlockId(snap.program) }, pin: 0 };
        return go({ ...screen, picker: null, onPin: false, path: [...screen.path, placed] }, { type: 'placeBlock', target: row.target, blockType: item.type });
      }

      const atSink = screen.path.length === 1;
      const node = step.node;
      if (vertical) {
        if (atSink && node.kind === 'sink') {
          const slots = outputSlots(snap.program);
          const at = slots.findIndex((slot) => sinkName(slot) === sinkName(node.target));
          const next = slots[wrap(at + (key === 'up' ? -1 : 1), slots.length)];
          return next ? go({ ...screen, path: [{ node: { kind: 'sink', target: next }, pin: 0 }], onPin: false }) : go(screen);
        }
        const pin = menuMove(step.pin, key, pins.length);
        return go({ ...screen, path: [...screen.path.slice(0, -1), { ...step, pin }] });
      }
      if (key === 'left') {
        // Walk toward the inputs: into the block that drives the selected connector...
        if (row.wire.ref.kind === 'block-output') {
          return go({ ...screen, path: [...screen.path, { node: { kind: 'block', id: row.wire.ref.blockId }, pin: 0 }] });
        }
        // ...or, on an empty output, from the output name onto its connector.
        return atSink ? go({ ...screen, onPin: true }) : go(screen);
      }
      if (key === 'right' || key === 'esc') {
        if (!atSink) return go({ ...screen, path: screen.path.slice(0, -1) });
        return key === 'esc' ? go({ kind: 'programming', cursor: 0 }) : go({ ...screen, onPin: false });
      }
      // OK: open the Co / GF / SF / BN list on the current connector.
      return go({ ...screen, picker: { stage: 'category', cursor: 0 } });
    }

    case 'info':
    case 'message':
      return key === 'ok' || key === 'esc' ? go(screen.back) : go(screen);

    case 'confirm': {
      if (vertical) return go({ ...screen, cursor: screen.cursor === 0 ? 1 : 0 });
      const decline: PanelScreen = screen.action === 'clear' ? { kind: 'programming', cursor: 3 } : { kind: 'paramMenu', cursor: 0 };
      if (key === 'esc') return go(decline);
      if (key !== 'ok') return go(screen);
      if (screen.cursor === 0) return go(decline);
      return screen.action === 'clear'
        ? go({ kind: 'noProgram' }, { type: 'clearProgram' })
        : go(hasProgram(snap) ? { kind: 'main', cursor: 0 } : { kind: 'noProgram' }, { type: 'stop' });
    }

    case 'transfer': {
      if (vertical) return go({ kind: 'transfer', cursor: menuMove(screen.cursor, key, TRANSFER_MENU.length) });
      if (key === 'esc') return go({ kind: 'main', cursor: 1 });
      if (key !== 'ok') return go(screen);
      const back: PanelScreen = screen;
      if (screen.cursor === 0) {
        return hasProgram(snap)
          ? go({ kind: 'message', lines: ['Program', 'copied', 'LOGO! → Card'], back }, { type: 'toCard' })
          : go({ kind: 'message', lines: ['No Program'], back });
      }
      if (screen.cursor === 1) {
        if (!snap.card.program) return go({ kind: 'message', lines: ['No Program', 'on Card'], back });
        if (snap.card.protect) return go({ kind: 'message', lines: ['Card is', 'protected'], back });
        return go({ kind: 'message', lines: ['Program', 'copied', 'Card → LOGO!'], back }, { type: 'fromCard' });
      }
      return go({ kind: 'message', lines: ['CopyProtect', snap.card.protect ? 'Off' : 'On'], back }, { type: 'toggleCopyProtect' });
    }

    case 'clock': {
      if (vertical) return go({ kind: 'clock', cursor: menuMove(screen.cursor, key, CLOCK_MENU.length) });
      if (key === 'esc') return go({ kind: 'main', cursor: 2 });
      if (key !== 'ok') return go(screen);
      if (screen.cursor === 0) {
        const { weekday, hour, minute } = snap.clock;
        return go({ kind: 'setClock', field: 0, draft: { weekday, hour, minute }, back: screen });
      }
      const setting = screen.cursor === 1 ? 'swTime' : 'sync';
      const on = setting === 'swTime' ? snap.swTime : snap.sync;
      return go({ kind: 'toggle', setting, cursor: on ? 0 : 1 });
    }

    case 'setClock': {
      if (key === 'left' || key === 'right') return go({ ...screen, field: clamp(screen.field + (key === 'left' ? -1 : 1), 0, 2) });
      if (vertical) {
        const delta = key === 'up' ? 1 : -1;
        const { weekday, hour, minute } = screen.draft;
        const draft =
          screen.field === 0
            ? { weekday: wrap(weekday + delta, 7), hour, minute }
            : screen.field === 1
              ? { weekday, hour: wrap(hour + delta, 24), minute }
              : { weekday, hour, minute: wrap(minute + delta, 60) };
        return go({ ...screen, draft });
      }
      if (key === 'esc') return go(screen.back);
      return go(screen.back, { type: 'setClock', ...screen.draft });
    }

    case 'toggle': {
      if (vertical) return go({ ...screen, cursor: screen.cursor === 0 ? 1 : 0 });
      const back: PanelScreen = { kind: 'clock', cursor: screen.setting === 'swTime' ? 1 : 2 };
      if (key === 'esc') return go(back);
      if (key !== 'ok') return go(screen);
      const on = screen.cursor === 0;
      return go(back, screen.setting === 'swTime' ? { type: 'setSwTime', on } : { type: 'setSync', on });
    }

    case 'run': {
      if (vertical) return go({ kind: 'run', page: wrap(screen.page + (key === 'up' ? -1 : 1), RUN_PAGES) });
      return key === 'esc' ? go({ kind: 'paramMenu', cursor: 0 }) : go(screen);
    }

    case 'paramMenu': {
      if (vertical) return go({ kind: 'paramMenu', cursor: menuMove(screen.cursor, key, PARAM_MENU.length) });
      if (key === 'esc') return go({ kind: 'run', page: 0 });
      if (key !== 'ok') return go(screen);
      const back: PanelScreen = screen;
      if (screen.cursor === 0) return go({ kind: 'confirm', action: 'stop', cursor: 0 });
      if (screen.cursor === 1) return snap.params.length > 0 ? go({ kind: 'setParam', index: 0 }) : go({ kind: 'message', lines: ['No Param'], back });
      if (screen.cursor === 2) {
        const { weekday, hour, minute } = snap.clock;
        return go({ kind: 'setClock', field: 0, draft: { weekday, hour, minute }, back });
      }
      return go({ kind: 'info', topic: 'name', back });
    }

    case 'setParam': {
      const count = snap.params.length;
      if (count === 0 || key === 'esc') return go({ kind: 'paramMenu', cursor: 1 });
      if (vertical) return go({ kind: 'setParam', index: wrap(screen.index + (key === 'up' ? -1 : 1), count) });
      const view = snap.params[clamp(screen.index, 0, count - 1)];
      if (key === 'ok' && view) {
        const digits = paramDigits(view);
        return go({ kind: 'editParam', index: screen.index, digits, pos: digits.length - 1 });
      }
      return go(screen);
    }

    case 'editParam': {
      const view = snap.params[screen.index];
      if (!view || key === 'esc') return go({ kind: 'setParam', index: screen.index });
      if (key === 'left' || key === 'right') {
        return go({ ...screen, pos: clamp(screen.pos + (key === 'left' ? -1 : 1), 0, screen.digits.length - 1) });
      }
      if (vertical) {
        const delta = key === 'up' ? 1 : 9; // +9 mod 10 == -1: digits wrap without carrying
        return go({ ...screen, digits: screen.digits.map((digit, index) => (index === screen.pos ? (digit + delta) % 10 : digit)) });
      }
      return go(
        { kind: 'setParam', index: screen.index },
        { type: 'setParam', blockId: view.blockId, key: view.key, value: digitsValue(view, screen.digits) },
      );
    }

    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

// ---- rendering ----------------------------------------------------------------------------------

export const fit = (text: string): string => text.slice(0, LCD_COLS).padEnd(LCD_COLS, ' ');

type Inverted = PanelFrame['inverted'][number];

function frame(snap: PanelSnapshot, rows: readonly string[], inverted: readonly Inverted[] = [], cursor: PanelFrame['cursor'] = null): PanelFrame {
  return {
    lines: Array.from({ length: LCD_ROWS }, (_, index) => fit(rows[index] ?? '')),
    inverted,
    cursor,
    backlight: snap.mode === 'RUN' ? 'run' : 'stop',
  };
}

function menu(items: readonly string[], cursor: number): string[] {
  const start = clamp(cursor - (LCD_ROWS - 1), 0, Math.max(0, items.length - LCD_ROWS));
  return items.slice(start, start + LCD_ROWS).map((label, index) => `${start + index === cursor ? '>' : ' '}${label}`);
}

const two = (n: number): string => String(n).padStart(2, '0');

/**
 * I:/Q:/M: status screen (spec §2.1): bit-number rows `0..123456789`, `1.0123456789`, `2.01234`;
 * a bit that is 1 is shown inverted.
 */
function bitScreen(snap: PanelSnapshot, area: 'I' | 'Q' | 'M', bits: readonly Bit[]): PanelFrame {
  const rows = [`${area}:`, '0..123456789', '1.0123456789', '2.0123456789'];
  const inverted: Inverted[] = [];
  bits.forEach((level, index) => {
    const n = index + 1;
    if (level !== 1) return;
    if (n <= 9) inverted.push({ line: 1, col: 2 + n, length: 1 });
    else if (n <= 19) inverted.push({ line: 2, col: 2 + (n - 10), length: 1 });
    else inverted.push({ line: 3, col: 2 + (n - 20), length: 1 });
  });
  const count = bits.length;
  const trimmed = rows.map((row, line) => {
    if (line === 0) return row;
    const first = line === 1 ? 1 : (line - 1) * 10; // first bit number of this row
    const last = Math.min(count, line === 1 ? 9 : (line - 1) * 10 + 9);
    return last < first ? '' : row.slice(0, line === 1 ? 3 + last : 2 + (last - first) + 1);
  });
  return frame(snap, trimmed, inverted);
}

function paramLine(view: ParamView, value: number): string {
  const label = view.key.padEnd(3);
  return view.kind === 'time' ? `${label}=${formatTime({ base: view.base ?? 's', value })}` : `${label}=${String(value).padStart(6, '0')}`;
}

function actualLine(view: ParamView): string {
  if (view.kind === 'count') return `Cnt=${String(clamp(view.actual, 0, COUNT_MAX)).padStart(6, '0')}`;
  const base = view.base ?? 's';
  return `Ta =${formatTime({ base, value: Math.min(TIME_MAX[base], view.actual) })}`;
}

function paramTitle(view: ParamView, program: LogoProgram): string {
  const block = program.blocks.find((candidate) => candidate.id === view.blockId);
  return `B${view.blockId} ${block ? BLOCK_SPECS[block.type].label : ''}`;
}

export function renderPanel(screen: PanelScreen, snap: PanelSnapshot): PanelFrame {
  if (!snap.powered) return { lines: Array.from({ length: LCD_ROWS }, () => fit('')), inverted: [], cursor: null, backlight: 'off' };

  switch (screen.kind) {
    case 'noProgram':
      return frame(snap, ['No Program', 'Press ESC']);
    case 'main':
      return frame(snap, menu(MAIN_MENU, screen.cursor));
    case 'programming':
      return frame(snap, menu(PROGRAMMING_MENU, screen.cursor));
    case 'transfer':
      return frame(snap, menu(TRANSFER_MENU, screen.cursor));
    case 'clock':
      return frame(snap, menu(CLOCK_MENU, screen.cursor));
    case 'paramMenu':
      return frame(snap, menu(PARAM_MENU, screen.cursor));

    case 'info': {
      if (screen.topic === 'memory') {
        const free = freeMemory(snap.usage);
        return frame(snap, ['Free Memory:', `Byte =${free.bytes}`, `Block=${free.blocks}`, `REM  =${free.rem}`]);
      }
      if (screen.topic === 'name') return frame(snap, ['Prg Name:', snap.program.name || '(none)']);
      return frame(snap, ['Password:', 'No password']);
    }

    case 'message':
      return frame(snap, screen.lines);

    case 'confirm':
      return frame(snap, [screen.action === 'clear' ? 'Clear Prg' : 'Stop Prg', `${screen.cursor === 0 ? '>' : ' '}No`, `${screen.cursor === 1 ? '>' : ' '}Yes`]);

    case 'toggle': {
      const title = screen.setting === 'swTime' ? 'S/W Time:' : 'Sync:';
      return frame(snap, [title, `${screen.cursor === 0 ? '>' : ' '}On`, `${screen.cursor === 1 ? '>' : ' '}Off`]);
    }

    case 'setClock': {
      const { weekday, hour, minute } = screen.draft;
      const line = `${WEEKDAYS[weekday] ?? 'Mo'} ${two(hour)}:${two(minute)}`;
      const col = screen.field === 0 ? 0 : screen.field === 1 ? 3 : 6;
      return frame(snap, ['Set Clock', line, `${snap.clock.year}-${two(snap.clock.month)}-${two(snap.clock.day)}`], [{ line: 1, col, length: 2 }]);
    }

    case 'run': {
      if (screen.page === 1) return bitScreen(snap, 'I', snap.inputs);
      if (screen.page === 2) return bitScreen(snap, 'Q', snap.outputs);
      if (screen.page === 3) return bitScreen(snap, 'M', snap.flags);
      const { clock } = snap;
      return frame(snap, [`${WEEKDAYS[clock.weekday] ?? 'Mo'} ${two(clock.hour)}:${two(clock.minute)}`, `${clock.year}-${two(clock.month)}-${two(clock.day)}`]);
    }

    case 'setParam': {
      const view = snap.params[screen.index];
      if (!view) return frame(snap, ['No Param']);
      return frame(snap, [paramTitle(view, snap.program), paramLine(view, view.value), actualLine(view), `${screen.index + 1}/${snap.params.length}`.padEnd(10) + '▲▼']);
    }

    case 'editParam': {
      const view = snap.params[screen.index];
      if (!view) return frame(snap, ['No Param']);
      const value = digitsValue(view, screen.digits);
      const text =
        view.kind === 'time'
          ? `${view.key.padEnd(3)}=${screen.digits[0]}${screen.digits[1]}:${screen.digits[2]}${screen.digits[3]}${view.base ?? 's'}`
          : paramLine(view, value);
      const col = view.kind === 'time' ? [4, 5, 7, 8][screen.pos] ?? 4 : 4 + screen.pos;
      return frame(snap, [paramTitle(view, snap.program), text, actualLine(view), 'OK save ESC'], [], { line: 1, col });
    }

    case 'editPrg': {
      const step = screen.path[screen.path.length - 1];
      const pins = step ? nodePins(step, snap.program) : null;
      if (!step || !pins) return frame(snap, ['No Program']);
      const forBlock = currentBlock(screen.path);
      const picker = screen.picker;
      if (picker !== null) {
        if (picker.stage === 'category') return frame(snap, menu(pickerCategories(snap.program, forBlock), picker.cursor));
        const items = pickerItems(snap.program, picker.category, forBlock, snap.usage);
        return frame(snap, menu(items.map(itemLabel), Math.min(picker.cursor, items.length - 1)));
      }
      const node = step.node;
      if (node.kind === 'sink') {
        const name = sinkName(node.target);
        if (screen.path.length === 1 && !snap.program.sinks.some((sink) => sinkName(sink.target) === name)) {
          return frame(snap, ['Edit Prg', `- [ ${name} ]`], [], { line: 1, col: screen.onPin ? 0 : 4 });
        }
      }
      const title =
        node.kind === 'sink'
          ? sinkName(node.target).padEnd(10) + '▲▼'
          : (() => {
              const id = node.id;
              const block = snap.program.blocks.find((candidate) => candidate.id === id);
              return `B${id} ${block ? BLOCK_SPECS[block.type].label : '?'}`;
            })();
      const selected = clamp(step.pin, 0, pins.length - 1);
      const visible = LCD_ROWS - 1;
      const start = clamp(selected - (visible - 1), 0, Math.max(0, pins.length - visible));
      const rows = pins.slice(start, start + visible).map((row, offset) => {
        const prefix = `${start + offset === selected ? '>' : ' '}${row.name.padEnd(3)}=`;
        return `${prefix}${row.wire.invert ? '¬' : ''}${connectorName(row.wire.ref)}`;
      });
      return frame(snap, [title, ...rows]);
    }

    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}
