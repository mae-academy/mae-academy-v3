// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S7_200_CPU224, S7_200_CPU226_EXP } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { LcdDisplay } from './LcdDisplay';
import { S7200Hardware, levelOf } from './S7200Hardware';
import { renderLcd, initialLcdState, type LcdSnapshot } from './lcd-fsm';
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

  it('shows the process image, not the terminal, on the output bank', () => {
    const { memory, container } = setup();
    expect(ledsOn(container)).toBe(0);
    act(() => memory.writeBit('Q1.1', true));
    expect(within(container).getByRole('img', { name: 'Q1.1 on' })).toBeDefined();
  });

  it('maps switch modes to input levels', () => {
    expect([levelOf('ON'), levelOf('OFF'), levelOf('MOMENTARY_PUSH')]).toEqual([true, false, true]);
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
