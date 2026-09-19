// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGO_0BA8, S7_200_CPU224, S7_200_CPU226_EXP } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { createFrameStore } from './frame-store';
import { LcdDisplay } from './LcdDisplay';
import { LogoHardware } from './LogoHardware';
import { S7200Hardware, levelOf } from './S7200Hardware';
import { renderLcd, initialLcdState, type LcdEffect, type LcdSnapshot } from './lcd-fsm';
import { VirtualField } from './virtual-field';

afterEach(cleanup);

const ledsOn = (root: HTMLElement): number => root.querySelectorAll('[role="img"][data-on="true"]').length;

describe('S7200Hardware', () => {
  function setup(profile = S7_200_CPU224, over: Partial<Parameters<typeof S7200Hardware>[0]> = {}) {
    const memory = new MemoryMap(profile);
    const field = new VirtualField(profile.memory.I?.bitCount ?? 0, profile.memory.Q?.bitCount ?? 0);
    const onSwitch = vi.fn();
    const view = render(
      <S7200Hardware profile={profile} memory={memory} field={field} mode="STOP" fault={false} switchPosition="TERM" onSwitch={onSwitch} {...over} />,
    );
    return { memory, field, onSwitch, ...view };
  }

  it('sizes the I/O banks from the hardware profile', () => {
    const a = setup(S7_200_CPU224);
    expect(a.container.querySelectorAll('[data-input]').length).toBe(14);
    expect(a.container.querySelectorAll('[data-bank^="Q"] [role="img"]').length).toBe(10);
    a.unmount();

    const b = setup(S7_200_CPU226_EXP);
    expect(b.container.querySelectorAll('[data-input]').length).toBe(40);
    expect(b.container.querySelectorAll('[data-bank^="Q"] [role="img"]').length).toBe(32);
  });

  it('lights RUN, STOP and SF according to the controller state', () => {
    const stopped = setup(S7_200_CPU224, { mode: 'STOP' });
    expect(within(stopped.container).getByRole('img', { name: 'STOP on' })).toBeDefined();
    expect(within(stopped.container).getByRole('img', { name: 'RUN off' })).toBeDefined();
    stopped.unmount();

    const running = setup(S7_200_CPU224, { mode: 'RUN', fault: true });
    expect(within(running.container).getByRole('img', { name: 'RUN on' })).toBeDefined();
    expect(within(running.container).getByRole('img', { name: 'STOP off' })).toBeDefined();
    expect(within(running.container).getByRole('img', { name: 'SF / system fault on' })).toBeDefined();
  });

  it('latches ON and OFF from the three-way switch and reflects it on the terminal LED', () => {
    const { field, container } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'I0.3 ON' }));
    expect(field.getInput(3)).toBe(true);
    expect(within(container).getByRole('img', { name: 'I0.3 terminal on' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'I0.3 ON' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'I0.3 OFF' }));
    expect(field.getInput(3)).toBe(false);
  });

  it('springs back from MOMENTARY_PUSH when released', () => {
    const { field } = setup();
    const push = screen.getByRole('button', { name: /I0\.5 MOMENTARY_PUSH/ });
    fireEvent.pointerDown(push);
    expect(field.getInput(5)).toBe(true);
    expect(push.getAttribute('aria-pressed')).toBe('true');

    fireEvent.pointerUp(push);
    expect(field.getInput(5)).toBe(false);
    expect(push.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'I0.5 OFF' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('supports the keyboard for the momentary position', () => {
    const { field } = setup();
    const push = screen.getByRole('button', { name: /I0\.0 MOMENTARY_PUSH/ });
    fireEvent.keyDown(push, { key: ' ' });
    expect(field.getInput(0)).toBe(true);
    fireEvent.keyUp(push, { key: ' ' });
    expect(field.getInput(0)).toBe(false);
  });

  it('reports the mode switch position and is operable as a radio group', () => {
    const { onSwitch } = setup();
    expect(screen.getByRole('radio', { name: 'TERM' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'RUN' }));
    expect(onSwitch).toHaveBeenLastCalledWith('RUN');
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Mode switch' }), { key: 'ArrowRight' });
    expect(onSwitch).toHaveBeenLastCalledWith('STOP');
  });

  it('shows the process image, not the terminal, on the output bank', () => {
    const { memory, container } = setup();
    expect(ledsOn(container)).toBe(1); // only STOP
    act(() => memory.writeBit('Q1.1', true));
    expect(within(container).getByRole('img', { name: 'Q1.1 on' })).toBeDefined();
  });

  it('maps switch modes to input levels', () => {
    expect([levelOf('ON'), levelOf('OFF'), levelOf('MOMENTARY_PUSH')]).toEqual([true, false, true]);
  });
});

describe('LogoHardware', () => {
  const idleFrame = createFrameStore(() => () => {});

  function setup() {
    const memory = new MemoryMap(LOGO_0BA8);
    const field = new VirtualField(16, 10);
    const effects: LcdEffect[] = [];
    const snap: LcdSnapshot = {
      mode: 'STOP',
      inputs: Array<boolean>(16).fill(false),
      outputs: Array<boolean>(10).fill(false),
      params: [],
      program: { networks: 1, blocks: 4 },
      scanMs: 20,
    };
    const view = render(
      <LogoHardware
        profile={LOGO_0BA8}
        memory={memory}
        field={field}
        mode="STOP"
        frame={idleFrame}
        getSnapshot={() => snap}
        onEffect={(effect) => effects.push(effect)}
      />,
    );
    return { memory, field, effects, ...view };
  }

  it('has 16 input terminals, 10 output relays, six keys and a 4-line display', () => {
    const { container } = setup();
    expect(container.querySelectorAll('[data-terminal]').length).toBe(16);
    expect(container.querySelectorAll('[data-relay]').length).toBe(10);
    for (const name of ['Up', 'Down', 'Left', 'Right', 'OK', 'Escape']) expect(screen.getByRole('button', { name })).toBeDefined();
    expect(container.querySelectorAll('[data-lcd-line]').length).toBe(4);
  });

  it('toggles an input terminal (I1..I16 map onto I0.0..I1.7)', () => {
    const { field } = setup();
    fireEvent.pointerDown(screen.getByRole('button', { name: /Input I10 \(I1\.1\)/ }));
    expect(field.getInput(9)).toBe(true);
    fireEvent.pointerDown(screen.getByRole('button', { name: /Input I10 \(I1\.1\)/ }));
    expect(field.getInput(9)).toBe(false);
  });

  it('acts as a pushbutton in push mode and with Shift-click', () => {
    const { field } = setup();
    fireEvent.click(screen.getByRole('switch'));
    const button = screen.getByRole('button', { name: /Input I2 /});
    fireEvent.pointerDown(button);
    expect(field.getInput(1)).toBe(true);
    fireEvent.pointerUp(button);
    expect(field.getInput(1)).toBe(false);

    fireEvent.click(screen.getByRole('switch')); // back to latch
    fireEvent.pointerDown(button, { shiftKey: true });
    expect(field.getInput(1)).toBe(true);
    fireEvent.pointerUp(button);
    expect(field.getInput(1)).toBe(false);
  });

  it('lights a relay LED from the memory image', () => {
    const { memory, container } = setup();
    act(() => memory.writeBit('Q0.2', true));
    expect(within(container.querySelector('[data-relay="Q3"]') as HTMLElement).getByRole('img').getAttribute('data-on')).toBe('true');
  });

  it('drives the display from the firmware FSM and emits the run effect', () => {
    const { effects } = setup();
    const lines = () => screen.getByRole('img', { name: /^Display/ }).getAttribute('aria-label');
    expect(lines()).toContain('▶ Start');

    fireEvent.click(screen.getByRole('button', { name: 'Down' }));
    expect(screen.getByRole('img', { name: /^Display/ }).textContent).toContain('>Program');

    fireEvent.click(screen.getByRole('button', { name: 'Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(effects).toEqual([{ type: 'run' }]);
  });

  it('accepts the arrow keys on the keypad', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Keypad' }), { key: 'ArrowDown' });
    expect(screen.getByRole('img', { name: /^Display/ }).textContent).toContain('>Program');
  });
});

describe('LcdDisplay', () => {
  const snap: LcdSnapshot = {
    mode: 'RUN',
    inputs: [true, ...Array<boolean>(15).fill(false)],
    outputs: Array<boolean>(10).fill(false),
    params: [],
    program: { networks: 1, blocks: 1 },
    scanMs: 20,
  };

  it('uses a green backlight for RUN and amber for STOP', () => {
    const run = render(<LcdDisplay frame={renderLcd(initialLcdState('RUN'), snap)} />);
    expect(run.container.querySelector('[data-backlight="run"]')).not.toBeNull();
    run.unmount();
    const stop = render(<LcdDisplay frame={renderLcd(initialLcdState('STOP'), { ...snap, mode: 'STOP' })} />);
    expect(stop.container.querySelector('[data-backlight="stop"]')).not.toBeNull();
  });

  it('renders the editor cursor as a single highlighted cell', () => {
    const frame = renderLcd({ screen: { kind: 'edit', page: 1, instance: 'T37', label: 'PT', digits: [0, 0, 0, 3, 0], pos: 4 } }, {
      ...snap,
      params: [{ kind: 'timer', instance: 'T37', title: 'T37 100ms', label: 'PT', current: 1, preset: 30 }],
    });
    const { container } = render(<LcdDisplay frame={frame} />);
    const cursor = container.querySelector('[data-lcd-line="2"] span');
    expect(cursor?.textContent).toBe('0');
  });
});
