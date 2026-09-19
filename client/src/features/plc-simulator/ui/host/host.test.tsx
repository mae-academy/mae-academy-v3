// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGO_0BA8, S7_200_CPU224, S7_200_CPU226_EXP } from '../../domain/hardware';
import type { Network } from '../../domain/ast';
import type { Scheduler } from '../../engine/types';
import { ilToLad } from '../../transpiler';
import type { FbdGraph } from '../fbd/model';
import { PlcSimulatorApp } from './PlcSimulatorApp';

// Radix Slider measures its thumb with ResizeObserver, which jsdom does not implement.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Scheduler and clock the test advances by hand, so scans happen exactly when asked. */
function manual() {
  let pending: (() => void) | null = null;
  let now = 0;
  const scheduler: Scheduler = {
    schedule: (cb) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  };
  return {
    runtimeOptions: { scheduler, clock: () => now },
    /** Advance simulated time and let the scan loop fire once. */
    scan(ms = 20) {
      now += ms;
      const cb = pending;
      pending = null;
      act(() => cb?.());
    },
  };
}

const parse = (stl: string, profile = S7_200_CPU224): Network[] => {
  const out = ilToLad(stl, profile);
  if (!out.ok || !out.value) throw new Error(out.diagnostics.map((d) => d.message).join('; '));
  return out.value;
};

const SEAL = parse('NETWORK 1 // Seal-in\nLD I0.0\nO Q0.0\nAN I0.1\n= Q0.0');
const WITH_TIMER = parse('NETWORK 1\nLD I0.0\nTON T37, 30');

const nodesLayer = (c: HTMLElement) => c.querySelector('[data-layer="nodes"]') as HTMLElement;
const led = (c: HTMLElement, name: string) => within(c).getByRole('img', { name });
const status = () => screen.getByRole('status', { name: '' }) ?? null;
const mode = () => within(screen.getByRole('toolbar', { name: 'Execution controls' })).getAllByRole('status')[0]?.textContent;

describe('S7-200 host', () => {
  it('runs the program against the virtual hardware end to end', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    expect(mode()).toBe('STOP');

    fireEvent.click(screen.getByRole('button', { name: 'I0.0 ON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('RUN');
    sched.scan();

    expect(led(container, 'Q0.0 on')).toBeDefined();
    // the RUN lamp is lit, the STOP lamp is dark
    expect(led(container, 'RUN on')).toBeDefined();
    expect(led(container, 'STOP off')).toBeDefined();

    // the seal-in keeps Q0.0 after the start switch is released...
    fireEvent.click(screen.getByRole('button', { name: 'I0.0 OFF' }));
    sched.scan();
    expect(led(container, 'Q0.0 on')).toBeDefined();
    // ...until stop is pressed
    fireEvent.click(screen.getByRole('button', { name: 'I0.1 ON' }));
    sched.scan();
    expect(led(container, 'Q0.0 off')).toBeDefined();
  });

  it('shows live power flow on the canvas and locks editing while running, then unlocks on stop', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    expect(container.querySelector('[data-cell]')).not.toBeNull(); // editable in STOP

    fireEvent.click(screen.getByRole('button', { name: 'I0.0 ON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    sched.scan();

    expect(container.querySelector('[data-cell]')).toBeNull(); // locked
    expect(nodesLayer(container).querySelector('[class*="stroke-[#2E7D32]"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mode()).toBe('STOP');
    expect(container.querySelector('[data-cell]')).not.toBeNull();
    expect(container.querySelector('[class*="stroke-[#2E7D32]"]')).toBeNull(); // wires dark again
    expect(led(container, 'Q0.0 off')).toBeDefined(); // outputs de-energised on STOP
  });

  it('single-steps exactly one scan and pauses', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    fireEvent.click(screen.getByRole('button', { name: 'I0.0 ON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Single step' }));
    expect(mode()).toBe('PAUSE');
    expect(led(container, 'Q0.0 on')).toBeDefined();
    // pausing keeps the outputs; Run resumes without a cold start
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('RUN');
    expect(led(container, 'Q0.0 on')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mode()).toBe('PAUSE');
  });

  it('honours the hardware mode switch: RUN starts, STOP stops and blocks the toolbar', () => {
    const sched = manual();
    render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);

    fireEvent.click(screen.getByRole('radio', { name: 'RUN' }));
    expect(mode()).toBe('RUN');
    fireEvent.click(screen.getByRole('radio', { name: 'STOP' }));
    expect(mode()).toBe('STOP');

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('STOP');
    expect(screen.getByRole('alert').textContent).toContain('mode switch is in STOP');

    fireEvent.click(screen.getByRole('radio', { name: 'TERM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('RUN');
  });

  it('refuses to run a program that does not compile for the profile', () => {
    const sched = manual();
    const bad = parse('LD I0.0\n= Q0.0', S7_200_CPU226_EXP).map((n) => ({
      ...n,
      nodes: n.nodes.map((node) => (node.type === 'contact' ? { ...node, operand: 'I3.0' } : node)),
    }));
    render(<PlcSimulatorApp initialNetworks={bad} runtimeOptions={sched.runtimeOptions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('STOP');
    expect(screen.getByRole('alert').textContent).toMatch(/error/);
  });

  it('adjusts the scan period from the slider within 20 to 500 ms', () => {
    const sched = manual();
    render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    const slider = screen.getByRole('slider', { name: 'Scan cycle time' });
    expect([slider.getAttribute('aria-valuemin'), slider.getAttribute('aria-valuemax')]).toEqual(['20', '500']);
    const toolbar = within(screen.getByRole('toolbar', { name: 'Execution controls' }));
    fireEvent.keyDown(slider, { key: 'End' });
    expect(toolbar.getByText('500 ms')).toBeDefined();
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(toolbar.getByText('20 ms')).toBeDefined();
  });
});

describe('hardware profile switching', () => {
  it('rebuilds the panel and keeps the program when switching CPU 224 -> CPU 226', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    expect(container.querySelectorAll('[data-input]').length).toBe(14);

    fireEvent.change(screen.getByRole('combobox', { name: 'Hardware profile' }), { target: { value: S7_200_CPU226_EXP.id } });
    expect(container.querySelectorAll('[data-input]').length).toBe(40);
    // same program, still editable and now validated against the 226
    expect(nodesLayer(container).querySelectorAll('[data-node-id]').length).toBe(4);
    expect(screen.queryByRole('list', { name: 'Profile issues' })).toBeNull();
  });

  it('reports what no longer fits when switching to a smaller CPU', () => {
    const sched = manual();
    const wide = parse('LD I3.4\n= Q2.5', S7_200_CPU226_EXP);
    render(<PlcSimulatorApp initialProfileId={S7_200_CPU226_EXP.id} initialNetworks={wide} runtimeOptions={sched.runtimeOptions} />);
    expect(screen.queryByRole('list', { name: 'Profile issues' })).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: 'Hardware profile' }), { target: { value: S7_200_CPU224.id } });
    const issues = screen.getByRole('list', { name: 'Profile issues' });
    expect(issues.textContent).toMatch(/I3\.4/);
    expect(issues.textContent).toMatch(/Q2\.5/);
    // and the program is not silently accepted
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('STOP');
  });

  it('keeps the LOGO! chassis in its own tab, apart from the S7-200 rack', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    expect(screen.queryByRole('img', { name: /^Display/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'STL / IL' })).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'LOGO! 0BA8' }));
    expect(container.querySelectorAll('[data-lcd-line]').length).toBe(4);
    expect(container.querySelectorAll('[data-terminal]').length).toBe(16);
    expect(container.querySelectorAll('[data-relay]').length).toBe(10);
    expect(screen.queryByRole('radiogroup', { name: 'Mode switch' })).toBeNull();
    // LOGO! programs are function block diagrams only: no LAD / IL toggle, no ladder canvas
    expect(screen.queryByRole('tab', { name: 'STL / IL' })).toBeNull();
    expect(screen.queryByRole('application', { name: /Ladder logic editor/ })).toBeNull();
    expect(screen.getByRole('application', { name: /Function block diagram/ })).toBeDefined();
  });

  it('starts from a clean memory image after a switch', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    fireEvent.click(screen.getByRole('button', { name: 'I0.0 ON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Single step' }));
    expect(led(container, 'Q0.0 on')).toBeDefined();

    fireEvent.change(screen.getByRole('combobox', { name: 'Hardware profile' }), { target: { value: S7_200_CPU226_EXP.id } });
    expect(led(container, 'Q0.0 off')).toBeDefined();
    expect(mode()).toBe('STOP');
  });
});

/** I1 -> Q1, and optionally I1 -> TON(preset ticks). Blocks are laid out on the grid. */
const wire = (preset?: number): FbdGraph => ({
  blocks: [
    { id: 'b1', kind: 'input', x: 40, y: 40, index: 0 },
    { id: 'b2', kind: 'output', x: 300, y: 40, index: 0 },
    ...(preset === undefined ? [] : [{ id: 'b3', kind: 'ton' as const, x: 300, y: 140, preset }]),
  ],
  links: [{ id: 'l1', from: 'b1', to: 'b2', pin: 0 }, ...(preset === undefined ? [] : [{ id: 'l2', from: 'b1', to: 'b3', pin: 0 }])],
});

describe('LOGO! front panel driving the controller', () => {
  const display = () => screen.getByRole('img', { name: /^Display/ });
  const key = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  function startLogo(graph: FbdGraph = wire()) {
    const sched = manual();
    const view = render(<PlcSimulatorApp initialProfileId={LOGO_0BA8.id} initialLogoGraph={graph} runtimeOptions={sched.runtimeOptions} />);
    return { sched, ...view };
  }

  it('starts the program from the menu, then shows the live I/O matrix', async () => {
    const { sched, container } = startLogo();
    expect(display().textContent).toContain('>▶ Start');

    fireEvent.pointerDown(screen.getByRole('button', { name: /Input I1 \(I0\.0\)/ })); // I1 on
    key('OK');
    expect(mode()).toBe('RUN');
    sched.scan();

    expect(led(container, 'Relay Q1 (Q0.0) on')).toBeDefined();
    await waitFor(() => expect(display().textContent).toContain('I0:10000000'));
    expect(display().textContent).toContain('Q0:10000000');
  });

  it('confirms before stopping and halts the controller on Yes', async () => {
    const { sched } = startLogo();
    key('OK');
    sched.scan();
    await waitFor(() => expect(display().textContent).toContain('I0:'));

    key('Escape');
    expect(display().textContent).toContain('Program?');
    key('OK'); // cursor starts on Yes
    expect(mode()).toBe('STOP');
    expect(display().textContent).toContain('>▶ Start');
  });

  it('keeps running when No is chosen', async () => {
    const { sched } = startLogo();
    key('OK');
    sched.scan();
    key('Escape');
    key('Down');
    key('OK');
    expect(mode()).toBe('RUN');
    await waitFor(() => expect(display().textContent).toContain('I0:'));
  });

  it('follows a stop issued from the toolbar', async () => {
    const { sched } = startLogo();
    key('OK');
    sched.scan();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(display().textContent).toContain('>▶ Start'));
  });

  it('edits a timer preset from the keypad and writes it back into the diagram', async () => {
    const { sched, container } = startLogo(wire(30));
    key('OK'); // Start
    sched.scan();

    key('Down'); // I/O -> T37
    await waitFor(() => expect(display().textContent).toContain('T37 100ms'));
    expect(display().textContent).toContain('>PT 00030');
    expect(container.textContent).toContain('TON 3.0s');

    key('OK'); // enter edit mode on the last digit
    key('Up');
    key('Up'); // 30 -> 32
    key('OK'); // commit
    await waitFor(() => expect(display().textContent).toContain('>PT 00032'));
    // the block on the diagram is the source of that value
    expect(container.textContent).toContain('TON 3.2s');
  });

  it('cancels a preset edit with ESC and leaves the diagram untouched', async () => {
    const { sched, container } = startLogo(wire(30));
    key('OK');
    sched.scan();
    key('Down');
    key('OK');
    key('Up');
    key('Up');
    key('Escape');
    await waitFor(() => expect(display().textContent).toContain('>PT 00030'));
    expect(container.textContent).toContain('TON 3.0s');
  });
});

describe('LOGO! physical keyboard', () => {
  const display = () => screen.getByRole('img', { name: /^Display/ });
  const press = (name: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: name });

  function startLogo(graph: FbdGraph = wire(30)) {
    const sched = manual();
    const view = render(<PlcSimulatorApp initialProfileId={LOGO_0BA8.id} initialLogoGraph={graph} runtimeOptions={sched.runtimeOptions} />);
    return { sched, ...view };
  }

  it('shows the key hint bar', () => {
    startLogo();
    const hint = screen.getByRole('note', { name: 'Keyboard shortcuts' });
    expect(hint.textContent).toContain('▲▼◄► Nav');
    expect(hint.textContent).toContain('Enter: OK');
    expect(hint.textContent).toContain('Esc: Back');
  });

  it('maps Enter to OK, arrows to navigation and Escape to the stop confirmation', async () => {
    const { sched } = startLogo();
    press('Enter'); // OK on "Start"
    expect(mode()).toBe('RUN');
    sched.scan();
    await waitFor(() => expect(display().textContent).toContain('I0:'));

    press('ArrowDown'); // next RUN page
    await waitFor(() => expect(display().textContent).toContain('T37 100ms'));
    press('ArrowUp');
    await waitFor(() => expect(display().textContent).toContain('I0:'));

    press('Escape');
    expect(display().textContent).toContain('Program?');
    press('ArrowDown'); // No
    press('Enter');
    expect(mode()).toBe('RUN');
    press('Escape');
    press('Enter'); // Yes
    expect(mode()).toBe('STOP');
  });

  it('adjusts a value digit by digit with the arrow keys', async () => {
    const { sched } = startLogo();
    press('Enter');
    sched.scan();
    press('ArrowDown');
    await waitFor(() => expect(display().textContent).toContain('>PT 00030'));
    press('Enter'); // edit
    press('ArrowLeft'); // tens digit
    press('ArrowUp'); // 30 -> 40
    press('Enter');
    await waitFor(() => expect(display().textContent).toContain('>PT 00040'));
  });

  it('leaves keys alone while typing in a field or when the tab is hidden', () => {
    startLogo();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search components' }), { target: { value: 'and' } });
    press('Enter', screen.getByRole('searchbox', { name: 'Search components' }));
    expect(mode()).toBe('STOP');

    fireEvent.click(screen.getByRole('tab', { name: 'S7-200 CPU' }));
    press('Enter');
    expect(screen.queryByRole('img', { name: /^Display/ })).toBeNull(); // LOGO! is hidden
    fireEvent.click(screen.getByRole('tab', { name: 'LOGO! 0BA8' }));
    expect(mode()).toBe('STOP');
  });
});

describe('Micro/WIN export', () => {
  it('previews, copies and downloads the generated .awl', async () => {
    const sched = manual();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const createObjectURL = vi.fn(() => 'blob:mock');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    const source = (await screen.findByLabelText('AWL source')) as HTMLTextAreaElement;
    expect(source.value).toContain('// Generated by MAE Academy PLC Simulator');
    expect(source.value).toContain('// Target CPU: S7-200 CPU 224');
    expect(source.value).toContain('NETWORK 1 // Seal-in');
    expect(source.value).toContain('LD     I0.0');

    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(source.value));
    await screen.findByText('Copied');

    fireEvent.click(screen.getByRole('button', { name: /Download s7_200_cpu224\.awl/ }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('targets the selected CPU in the header', async () => {
    const sched = manual();
    render(<PlcSimulatorApp initialProfileId={S7_200_CPU226_EXP.id} initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const source = (await screen.findByLabelText('AWL source')) as HTMLTextAreaElement;
    expect(source.value).toContain('// Target CPU: S7-200 CPU 226 + Expansion');
  });
});
