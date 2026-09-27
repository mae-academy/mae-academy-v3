import { describe, expect, it } from 'vitest';
import {
  LCD_COLS,
  fromDigits,
  initialLcdState,
  lcdReduce,
  renderLcd,
  toDigits,
  type LcdEffect,
  type LcdEvent,
  type LcdKey,
  type LcdParam,
  type LcdSnapshot,
  type LcdState,
} from './lcd-fsm';

const timer: LcdParam = { kind: 'timer', instance: 'T37', title: 'T37 100ms', label: 'PT', current: 23, preset: 30 };
const counter: LcdParam = { kind: 'counter', instance: 'C0', title: 'C0 CTU', label: 'PV', current: 3, preset: 10 };

const snapshot = (over: Partial<LcdSnapshot> = {}): LcdSnapshot => ({
  mode: 'RUN',
  inputs: [true, false, true, false, false, false, false, false, ...Array<boolean>(8).fill(false)],
  outputs: [true, false, false, false, false, false, false, false, false, true],
  params: [timer, counter],
  program: { networks: 5, blocks: 12 },
  scanMs: 20,
  ...over,
});

interface Run {
  state: LcdState;
  effects: LcdEffect[];
}

/** Feeds keys / events through the FSM, collecting every effect it requests. */
function drive(start: LcdState, snap: LcdSnapshot, ...inputs: (LcdKey | LcdEvent)[]): Run {
  let state = start;
  const effects: LcdEffect[] = [];
  for (const input of inputs) {
    const event: LcdEvent = typeof input === 'string' ? { type: 'key', key: input } : input;
    const result = lcdReduce(state, event, snap);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const stopped = snapshot({ mode: 'STOP' });
const menu = initialLcdState('STOP');
const monitor = initialLcdState('RUN');

describe('rendering contract', () => {
  it('always yields 4 lines of exactly 12 characters, on every screen', () => {
    const screens: LcdState[] = [
      menu,
      { screen: { kind: 'info', topic: 'program' } },
      { screen: { kind: 'info', topic: 'setup' } },
      { screen: { kind: 'info', topic: 'network' } },
      monitor,
      { screen: { kind: 'monitor', page: 1 } },
      { screen: { kind: 'monitor', page: 2 } },
      { screen: { kind: 'confirmStop', cursor: 0, page: 0 } },
      drive(monitor, snapshot(), 'down', 'ok').state,
    ];
    for (const state of screens) {
      const frame = renderLcd(state, snapshot());
      expect(frame.lines).toHaveLength(4);
      for (const line of frame.lines) expect(line).toHaveLength(LCD_COLS);
    }
  });

  it('uses the green/cyan backlight while running and amber while stopped', () => {
    expect(renderLcd(monitor, snapshot()).backlight).toBe('run');
    expect(renderLcd(menu, stopped).backlight).toBe('stop');
  });
});

describe('STOP mode menu', () => {
  it('shows the four root entries with the cursor on Start', () => {
    expect(renderLcd(menu, stopped).lines.map((l) => l.trimEnd())).toEqual(['>► Start', ' Program', ' Setup', ' Network']);
  });

  it('moves the cursor with up / down and stops at the ends', () => {
    expect(drive(menu, stopped, 'up').state.screen).toEqual({ kind: 'menu', cursor: 0 });
    expect(drive(menu, stopped, 'down', 'down').state.screen).toEqual({ kind: 'menu', cursor: 2 });
    expect(drive(menu, stopped, 'down', 'down', 'down', 'down', 'down').state.screen).toEqual({ kind: 'menu', cursor: 3 });
    expect(renderLcd(drive(menu, stopped, 'down').state, stopped).lines[1]?.trimEnd()).toBe('>Program');
  });

  it('requests RUN when OK is pressed on Start', () => {
    expect(drive(menu, stopped, 'ok').effects).toEqual([{ type: 'run' }]);
  });

  it('does not request anything for other keys', () => {
    expect(drive(menu, stopped, 'left', 'right', 'esc').effects).toEqual([]);
  });

  it('opens Program / Setup / Network and returns with ESC to the same entry', () => {
    const program = drive(menu, stopped, 'down', 'ok');
    expect(program.state.screen).toEqual({ kind: 'info', topic: 'program' });
    expect(renderLcd(program.state, stopped).lines[1]?.trimEnd()).toBe('Nets:5');
    expect(renderLcd(program.state, stopped).lines[2]?.trimEnd()).toBe('Blocks:12');

    const setup = drive(menu, stopped, 'down', 'down', 'ok');
    expect(renderLcd(setup.state, stopped).lines[1]?.trimEnd()).toBe('Scan:20ms');

    const back = drive(setup.state, stopped, 'esc');
    expect(back.state.screen).toEqual({ kind: 'menu', cursor: 2 });
    expect(drive(menu, stopped, 'down', 'down', 'down', 'ok').state.screen).toEqual({ kind: 'info', topic: 'network' });
  });
});

describe('mode changes under the display', () => {
  it('jumps from the menu to the I/O screen when the controller starts', () => {
    expect(drive(menu, snapshot(), { type: 'mode', mode: 'RUN' }).state.screen).toEqual({ kind: 'monitor', page: 0 });
    expect(drive({ screen: { kind: 'info', topic: 'setup' } }, snapshot(), { type: 'mode', mode: 'RUN' }).state.screen).toEqual({
      kind: 'monitor',
      page: 0,
    });
  });

  it('returns to the menu when the controller stops, from any run screen', () => {
    for (const screen of [
      { kind: 'monitor', page: 1 },
      { kind: 'confirmStop', cursor: 1, page: 0 },
      drive(monitor, snapshot(), 'down', 'ok').state.screen,
    ] as const) {
      expect(drive({ screen }, stopped, { type: 'mode', mode: 'STOP' }).state.screen).toEqual({ kind: 'menu', cursor: 0 });
    }
  });

  it('keeps the current screen when the mode event is irrelevant', () => {
    expect(drive(monitor, snapshot(), { type: 'mode', mode: 'PAUSE' }).state).toBe(monitor);
    expect(drive(menu, stopped, { type: 'mode', mode: 'STOP' }).state).toBe(menu);
  });

  it('follows a start from the host even when the LCD did not initiate it', () => {
    const after = drive(menu, snapshot(), 'down', { type: 'mode', mode: 'RUN' });
    expect(after.state.screen.kind).toBe('monitor');
    expect(after.effects).toEqual([]);
  });
});

describe('RUN mode: I/O status matrix', () => {
  it('prints the binary state of every input and output byte', () => {
    expect(renderLcd(monitor, snapshot()).lines).toEqual(['I0:10100000 ', 'I1:00000000 ', 'Q0:10000000 ', 'Q1:01       ']);
  });

  it('tracks state changes in real time', () => {
    const changed = snapshot({ inputs: Array<boolean>(16).fill(true) });
    expect(renderLcd(monitor, changed).lines.slice(0, 2)).toEqual(['I0:11111111 ', 'I1:11111111 ']);
  });

  it('shows only as many bytes as the hardware has', () => {
    const small = snapshot({ inputs: Array<boolean>(8).fill(false), outputs: [true, false, false, false] });
    expect(renderLcd(monitor, small).lines.map((l) => l.trimEnd())).toEqual(['I0:00000000', 'Q0:1000', '', '']);
  });
});

describe('RUN mode: timers and counters', () => {
  it('pages through the I/O screen and every timer / counter, wrapping around', () => {
    expect(drive(monitor, snapshot(), 'down').state.screen).toEqual({ kind: 'monitor', page: 1 });
    expect(drive(monitor, snapshot(), 'down', 'down').state.screen).toEqual({ kind: 'monitor', page: 2 });
    expect(drive(monitor, snapshot(), 'down', 'down', 'down').state.screen).toEqual({ kind: 'monitor', page: 0 });
    expect(drive(monitor, snapshot(), 'up').state.screen).toEqual({ kind: 'monitor', page: 2 });
    expect(drive(monitor, snapshot(), 'right').state.screen).toEqual({ kind: 'monitor', page: 1 });
    expect(drive(monitor, snapshot(), 'left').state.screen).toEqual({ kind: 'monitor', page: 2 });
  });

  it('shows the timer name, base, current value and setpoint', () => {
    const frame = renderLcd({ screen: { kind: 'monitor', page: 1 } }, snapshot());
    expect(frame.lines.map((l) => l.trimEnd())).toEqual(['T37 100ms', 'CV 00023', '>PT 00030', '1/2']);
  });

  it('shows a counter with its preset value label', () => {
    const frame = renderLcd({ screen: { kind: 'monitor', page: 2 } }, snapshot());
    expect(frame.lines.map((l) => l.trimEnd())).toEqual(['C0 CTU', 'CV 00003', '>PV 00010', '2/2']);
  });

  it('falls back to the I/O screen when the program has no timers or counters', () => {
    const bare = snapshot({ params: [] });
    expect(drive(monitor, bare, 'down').state.screen).toEqual({ kind: 'monitor', page: 0 });
    // and a stale page index after a program change is clamped, not rendered blank
    expect(renderLcd({ screen: { kind: 'monitor', page: 5 } }, bare).lines[0]).toContain('I0:');
  });

  it('ignores OK on the I/O screen', () => {
    expect(drive(monitor, snapshot(), 'ok').state).toBe(monitor);
  });
});

describe('RUN mode: stop confirmation', () => {
  const confirm = drive(monitor, snapshot(), 'esc');

  it('prompts with the cursor on Yes', () => {
    expect(confirm.state.screen).toEqual({ kind: 'confirmStop', cursor: 0, page: 0 });
    expect(renderLcd(confirm.state, snapshot()).lines.map((l) => l.trimEnd())).toEqual(['Stop', 'Program?', '>Yes', ' No']);
  });

  it('halts the controller and returns to the menu on Yes', () => {
    const yes = drive(monitor, snapshot(), 'esc', 'ok');
    expect(yes.effects).toEqual([{ type: 'stop' }]);
    expect(yes.state.screen).toEqual({ kind: 'menu', cursor: 0 });
  });

  it('keeps running and returns to the same page on No', () => {
    const no = drive({ screen: { kind: 'monitor', page: 1 } }, snapshot(), 'esc', 'down', 'ok');
    expect(no.effects).toEqual([]);
    expect(no.state.screen).toEqual({ kind: 'monitor', page: 1 });
    expect(renderLcd(drive(monitor, snapshot(), 'esc', 'down').state, snapshot()).lines[3]?.trimEnd()).toBe('>No');
  });

  it('treats ESC on the prompt as No', () => {
    const cancelled = drive(monitor, snapshot(), 'esc', 'esc');
    expect(cancelled.effects).toEqual([]);
    expect(cancelled.state.screen.kind).toBe('monitor');
  });
});

describe('live parameter editor', () => {
  const editTimer = drive({ screen: { kind: 'monitor', page: 1 } }, snapshot(), 'ok');

  it('enters edit mode on the highlighted parameter with the cursor on the last digit', () => {
    expect(editTimer.state.screen).toEqual({
      kind: 'edit',
      page: 1,
      instance: 'T37',
      label: 'PT',
      digits: [0, 0, 0, 3, 0],
      pos: 4,
    });
    const frame = renderLcd(editTimer.state, snapshot());
    expect(frame.lines[2]?.trimEnd()).toBe('>PT 00030');
    // 4 columns of prefix + digit position 4
    expect(frame.cursor).toEqual({ line: 2, col: 8 });
  });

  it('moves the cursor across the digits with left / right, clamped', () => {
    const at = (keys: LcdKey[]) => renderLcd(drive(editTimer.state, snapshot(), ...keys).state, snapshot()).cursor?.col;
    expect(at(['left'])).toBe(7);
    expect(at(['left', 'left', 'left', 'left', 'left', 'left'])).toBe(4);
    expect(at(['right'])).toBe(8);
  });

  it('increments and decrements only the targeted digit, wrapping 9 <-> 0 without carry', () => {
    const digits = (keys: LcdKey[]) => {
      const s = drive(editTimer.state, snapshot(), ...keys).state.screen;
      return s.kind === 'edit' ? s.digits.join('') : '';
    };
    expect(digits(['up'])).toBe('00031');
    expect(digits(['down'])).toBe('00039'); // 0 wraps to 9; the tens digit is not borrowed from
    expect(digits(['left', 'up'])).toBe('00040');
    expect(digits(['left', 'left', 'left', 'up', 'up'])).toBe('02030'); // third left lands on the thousands digit
    expect(digits(['left', 'left', 'left', 'left', 'up', 'up'])).toBe('20030');
    expect(digits(['down', 'down', 'down', 'down'])).toBe('00036'); // 0 -> 9 wraps, tens digit untouched
    expect(digits(['left', 'left', 'left', 'left', 'down'])).toBe('90030');
  });

  it('commits the new preset with OK and returns to the parameter page', () => {
    const done = drive(editTimer.state, snapshot(), 'left', 'up', 'up', 'ok'); // 30 -> 50
    expect(done.effects).toEqual([{ type: 'commit', instance: 'T37', label: 'PT', value: 50 }]);
    expect(done.state.screen).toEqual({ kind: 'monitor', page: 1 });
  });

  it('cancels with ESC and writes nothing', () => {
    const cancelled = drive(editTimer.state, snapshot(), 'up', 'up', 'esc');
    expect(cancelled.effects).toEqual([]);
    expect(cancelled.state.screen).toEqual({ kind: 'monitor', page: 1 });
    // the page still shows the untouched setpoint
    expect(renderLcd(cancelled.state, snapshot()).lines[2]?.trimEnd()).toBe('>PT 00030');
  });

  it('clamps a value beyond the 16-bit range on commit', () => {
    const big = drive(editTimer.state, snapshot(), 'left', 'left', 'left', 'left', 'down', 'ok'); // 90030
    expect(big.effects).toEqual([{ type: 'commit', instance: 'T37', label: 'PT', value: 32767 }]);
  });

  it('edits counter presets the same way', () => {
    const edit = drive({ screen: { kind: 'monitor', page: 2 } }, snapshot(), 'ok', 'left', 'up', 'ok'); // 10 -> 20
    expect(edit.effects).toEqual([{ type: 'commit', instance: 'C0', label: 'PV', value: 20 }]);
  });

  it('is discarded, not committed, when the controller stops mid-edit', () => {
    const stoppedMidEdit = drive(editTimer.state, stopped, 'up', { type: 'mode', mode: 'STOP' });
    expect(stoppedMidEdit.effects).toEqual([]);
    expect(stoppedMidEdit.state.screen).toEqual({ kind: 'menu', cursor: 0 });
  });

  it('shows the live current value while editing', () => {
    const later = snapshot({ params: [{ ...timer, current: 27 }, counter] });
    expect(renderLcd(editTimer.state, later).lines[1]?.trimEnd()).toBe('CV 00027');
  });
});

describe('digit helpers', () => {
  it('round-trips and clamps', () => {
    expect(toDigits(30)).toEqual([0, 0, 0, 3, 0]);
    expect(fromDigits(toDigits(12345))).toBe(12345);
    expect(toDigits(99999)).toEqual([3, 2, 7, 6, 7]);
    expect(toDigits(-5)).toEqual([0, 0, 0, 0, 0]);
    expect(fromDigits([9, 9, 9, 9, 9])).toBe(32767);
  });
});
