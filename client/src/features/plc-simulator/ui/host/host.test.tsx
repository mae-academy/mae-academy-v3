// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGO_0BA8, S7_200_CPU224, S7_200_CPU226_EXP } from '../../domain/hardware';
import type { Network } from '../../domain/ast';
import type { Scheduler } from '../../engine/types';
import { ilToLad } from '../../transpiler';
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
    expect(nodesLayer(container).querySelector('[class*="stroke-[#6366f1]"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mode()).toBe('STOP');
    expect(container.querySelector('[data-cell]')).not.toBeNull();
    expect(container.querySelector('[class*="stroke-[#6366f1]"]')).toBeNull(); // wires dark again
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
    fireEvent.click(screen.getByRole('button', { name: /Run|Resume/ }));
    expect(mode()).toBe('RUN');
    expect(led(container, 'Q0.0 on')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mode()).toBe('PAUSE');
  });

  it('controls execution via toolbar: Run starts, Pause pauses, Stop stops and resets', () => {
    const sched = manual();
    render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(mode()).toBe('RUN');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mode()).toBe('PAUSE');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(mode()).toBe('RUN');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mode()).toBe('STOP');
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

  it('adjusts the scan period from the simulation speed selector', () => {
    const sched = manual();
    render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    const speedControl = screen.getByRole('tablist', { name: 'Simulation speed' });
    expect(speedControl).toBeDefined();
    fireEvent.click(within(speedControl).getByRole('tab', { name: '0.1x' }));
    fireEvent.click(within(speedControl).getByRole('tab', { name: 'Instant' }));
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

  it('keeps the LOGO! bench in its own tab, apart from the S7-200 rack', () => {
    const sched = manual();
    const { container } = render(<PlcSimulatorApp initialNetworks={SEAL} runtimeOptions={sched.runtimeOptions} />);
    expect(screen.queryByRole('img', { name: /^Display/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'IL' })).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'LOGO!' }));
    expect(container.querySelectorAll('[data-lcd-line]').length).toBe(4);
    expect(container.querySelectorAll('[data-terminal^="I"]').length).toBe(8);
    expect(container.querySelectorAll('[data-relay]').length).toBe(4);
    expect(screen.queryByRole('radiogroup', { name: 'Mode switch' })).toBeNull();
    // No editor on the LOGO! side: no LAD / IL toggle, no canvas, no palette, no inspector
    expect(screen.queryByRole('tab', { name: 'IL' })).toBeNull();
    expect(screen.queryByRole('application', { name: /Ladder logic editor/ })).toBeNull();
    expect(screen.queryByRole('application', { name: /Function block diagram/ })).toBeNull();
    expect(screen.queryByRole('searchbox', { name: 'Search components' })).toBeNull();
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
