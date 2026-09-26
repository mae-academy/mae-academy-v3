// @vitest-environment jsdom
// LOGO! 0BA4 workspace: bench, front panel, program library, FBD viewer and manual. Kept apart from the
// S7-200 host suite so each heavy UI suite runs in its own worker.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGO_0BA8 } from '../../domain/hardware';
import type { Scheduler } from '../../engine/types';
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

const led = (c: HTMLElement, name: string) => within(c).getByRole('img', { name });
const mode = () => within(screen.getByRole('toolbar', { name: 'Execution controls' })).getAllByRole('status')[0]?.textContent;

describe('LOGO! 0BA4 bench', () => {
  const display = () => screen.getByRole('img', { name: /^Display/ });
  const key = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const input = (pattern: RegExp) => screen.getByRole('button', { name: pattern });

  function startLogo() {
    const sched = manual();
    const view = render(<PlcSimulatorApp initialProfileId={LOGO_0BA8.id} runtimeOptions={sched.runtimeOptions} />);
    return { sched, ...view };
  }

  it('starts from the main menu and drives a pilot lamp through the Q1 dry contact', async () => {
    const { sched, container } = startLogo();
    expect(display().textContent).toContain('>Program..');
    key('Down');
    key('Down');
    key('Down');
    key('OK'); // Start
    expect(mode()).toBe('RUN');
    sched.scan();

    fireEvent.pointerDown(input(/^I1 S1 Stair buttons/));
    sched.scan();
    await waitFor(() => expect(led(container, 'Relay Q1 closed')).toBeDefined());
    expect(led(container, 'H1 Stair lights energized')).toBeDefined();
    expect(container.querySelector('[data-relay="Q1"]')?.getAttribute('data-closed')).toBe('true');
    fireEvent.pointerUp(input(/^I1 S1 Stair buttons/));

    key('Down'); // I: status screen
    await waitFor(() => expect(display().textContent).toContain('0..123456789'));
  });

  it('confirms "Stop Prg" (No preselected) and halts on Yes', () => {
    const { sched } = startLogo();
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    sched.scan();
    key('Escape');
    expect(display().textContent).toContain('>Stop');
    key('OK');
    expect(display().textContent).toContain('Stop Prg');
    key('Down');
    key('OK');
    expect(mode()).toBe('STOP');
    expect(display().textContent).toContain('>Program..');
  });

  it('follows a stop issued from the toolbar', () => {
    const { sched } = startLogo();
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    sched.scan();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mode()).toBe('STOP');
    expect(display().textContent).toContain('>Program..');
  });

  it('edits a timer from Set Param while running', () => {
    const { sched } = startLogo();
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    sched.scan();
    ['Escape', 'Down', 'OK'].forEach(key);
    expect(display().textContent).toContain('T  =30:00s');
    ['OK', 'Up', 'OK'].forEach(key);
    expect(display().textContent).toContain('T  =30:01s');
    expect(mode()).toBe('RUN');
  });

  it('opens and closes the dry contacts with the mains breaker', async () => {
    const { sched, container } = startLogo();
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    fireEvent.pointerDown(input(/^I2 S2 Corridor button/));
    sched.scan();
    await waitFor(() => expect(led(container, 'Relay Q2 closed')).toBeDefined());

    fireEvent.click(screen.getByRole('switch', { name: 'Mains breaker' }));
    expect(screen.getByRole('switch', { name: 'Mains breaker' }).getAttribute('aria-checked')).toBe('false');
    expect(led(container, 'Relay Q2 open')).toBeDefined();
    expect(led(container, 'RUN/STOP LED off')).toBeDefined();
    expect(display().getAttribute('data-backlight')).toBe('off');

    fireEvent.click(screen.getByRole('switch', { name: 'Mains breaker' }));
    expect(mode()).toBe('RUN'); // resumes the state it had at power-off
  });

  it('loads a scenario, re-dressing the bench and the program', async () => {
    const { sched, container } = startLogo();
    fireEvent.change(screen.getByRole('combobox', { name: 'Application scenario' }), { target: { value: 'sliding-door' } });
    expect(input(/^I1 B1 Motion outside \(motion sensor, NO\)/)).toBeDefined();
    expect(input(/^I3 S1 Door closed \(limit switch, NC\)/).getAttribute('aria-pressed')).toBe('true');
    expect(led(container, 'K1 Open drive off')).toBeDefined();

    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    fireEvent.pointerDown(input(/^I1 B1 Motion outside/)); // latching: sensor stays triggered
    fireEvent.pointerDown(input(/^I3 S1 Door closed/)); // door leaves the closed position
    sched.scan();
    sched.scan();
    await waitFor(() => expect(led(container, 'K1 Open drive energized')).toBeDefined());
    expect(led(container, 'K2 Close drive off')).toBeDefined();
  });

  it('switches the bench between 230 V AC and 24 V DC', () => {
    const { container } = startLogo();
    expect(container.querySelector('[data-terminal="L1"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '24V DC' }));
    expect(container.querySelector('[data-terminal="L+"]')).not.toBeNull();
    expect(container.querySelector('[data-terminal="M"]')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Siemens LOGO! 12/24RC controller' })).toBeDefined();
  });

  it('has no macOS window chrome and no Run / Step in the LOGO! toolbar', () => {
    startLogo();
    const card = screen.getByRole('group', { name: /^Electrical bench/ }).closest('section');
    expect(card?.querySelector('.bg-\\[\\#FF5F56\\]')).toBeNull(); // no traffic lights
    expect(card?.querySelector('h3')?.textContent).toContain('LOGO! 230RC');
    const toolbar = within(screen.getByRole('toolbar', { name: 'Execution controls' }));
    expect(toolbar.queryByRole('button', { name: /^(Run|Pause|Resume)$/ })).toBeNull();
    expect(toolbar.queryByRole('button', { name: 'Single step' })).toBeNull();
    expect(toolbar.getByRole('button', { name: 'Stop' })).toBeDefined(); // Reset
    expect(toolbar.getByRole('button', { name: 'Import' })).toBeDefined();
    expect(toolbar.getByRole('button', { name: 'Export' })).toBeDefined();
  });

  it('reconfigures an input from its badge menu: pushbutton -> limit switch (NC)', () => {
    const { container } = startLogo();
    const badge = () => screen.getByRole('button', { name: /^Configure I1 field device/ });
    expect(badge().textContent).toContain('PB NO');
    fireEvent.click(badge());
    const menu = screen.getByRole('menu', { name: 'I1 field device' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(8);
    expect(within(menu).getByRole('menuitemradio', { name: 'Pushbutton · NO' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Limit switch · NC' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(badge().textContent).toContain('LS NC');
    // NC limit at rest passes current: the terminal reads live; actuating it opens the contact
    expect(container.querySelector('[data-terminal="I1"]')?.getAttribute('data-live')).toBe('true');
    fireEvent.pointerDown(input(/^I1 S1 Stair buttons \(limit switch, NC\)/));
    expect(container.querySelector('[data-terminal="I1"]')?.getAttribute('data-live')).toBe('false');
  });

  it('spins the motor rotor only while its output is driven, and typesets port names with KaTeX', async () => {
    const { sched, container } = startLogo();
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    fireEvent.click(screen.getByRole('button', { name: /^Configure Q1 load/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Motor' }));
    const rotor = () => container.querySelector('[data-load="Q1"] [data-rotor]')?.getAttribute('data-rotor');
    expect(rotor()).toBe('idle');
    fireEvent.pointerDown(input(/^I1 S1 Stair buttons/));
    sched.scan();
    await waitFor(() => expect(rotor()).toBe('spinning'));
    fireEvent.pointerUp(input(/^I1 S1 Stair buttons/));

    const bench = (container.querySelector('svg[aria-label^="Electrical bench"]') as SVGElement).closest('[data-label-canvas]') as HTMLElement;
    for (const name of ['I1', 'I8', 'Q1', 'Q4', 'L1', 'N']) {
      expect(bench.querySelector(`[data-port="${name}"] .katex`), name).not.toBeNull();
    }
    // No raw LaTeX in any visible text: strip the typeset nodes and inspect what is left, and check the rendered glyphs.
    const rest = bench.cloneNode(true) as HTMLElement;
    rest.querySelectorAll('.katex').forEach((node) => node.remove());
    expect(rest.textContent).not.toMatch(/[_^]\{/);
    bench.querySelectorAll('.katex-html').forEach((node) => expect(node.textContent).not.toMatch(/[_^{}\\]/));
  });

  it('draws the switch as the canonical mechanical switch with a lamp X symbol', () => {
    const { container } = startLogo();
    expect(container.querySelector('[data-load="Q1"] circle + line')).not.toBeNull(); // lamp: circle crossed by an X
    expect(screen.getByRole('img', { name: 'Q4 Open circuit' })).toBeDefined(); // unused channel is a spare, like the spare inputs
    expect(container.querySelector('[data-input-row="I1"] [aria-pressed]')).not.toBeNull();
  });

  it('renders unused inputs as inert spare placeholders with no wire to their terminal', () => {
    const { container } = startLogo();
    const row = container.querySelector('[data-input-row="I5"]');
    expect(row?.getAttribute('data-spare')).toBe('true');
    expect(within(row as HTMLElement).queryByRole('button', { name: /^I5 / })).toBeNull(); // nothing to actuate
    expect(screen.getByRole('button', { name: /^Configure I5 field device \(spare input/ })).toBeDefined();
    // making it a real device wires it in
    fireEvent.click(screen.getByRole('button', { name: /^Configure I5 field device/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Limit switch · NO' }));
    expect(container.querySelector('[data-input-row="I5"]')?.getAttribute('data-spare')).toBeNull();
    expect(screen.getByRole('button', { name: /^I5 X5 Spare \(limit switch, NO\)/ })).toBeDefined();
  });

  it('draws all four keypad arrows from one path, differing only by rotation', () => {
    const { container } = startLogo();
    const arrows = ['Up', 'Down', 'Left', 'Right'].map((name) => container.querySelector(`[role="button"][aria-label="${name}"] path`) as SVGPathElement);
    expect(new Set(arrows.map((a) => a.getAttribute('d'))).size).toBe(1);
    expect(arrows.map((a) => /rotate\((\d+)\)/.exec(a.getAttribute('transform') ?? '')?.[1])).toEqual(['0', '180', '270', '90']);
    expect(new Set(arrows.map((a) => a.getAttribute('stroke-width'))).size).toBe(1);
  });

  it('closes the device menu with Escape and outside click', () => {
    const { container } = startLogo();
    fireEvent.click(screen.getByRole('button', { name: /^Configure I3 field device/ }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(display().textContent).toContain('>Program..'); // Esc did not reach the keypad
    fireEvent.click(screen.getByRole('button', { name: /^Configure I3 field device/ }));
    fireEvent.pointerDown(container.querySelector('[data-menu-backdrop]') as Element);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('swaps the load on a relay channel: lamp -> contactor coil -> spare (open circuit)', async () => {
    const { sched, container } = startLogo();
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    fireEvent.click(screen.getByRole('button', { name: /^Configure Q1 load/ }));
    const menu = screen.getByRole('menu', { name: 'Q1 load' });
    expect(within(menu).getAllByRole('menuitemradio').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Pilot indicator lamp',
      'Contactor drive coil',
      'Warning flashing beacon',
      'Motor',
      'Spare · open circuit',
    ]);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Contactor drive coil' }));
    fireEvent.pointerDown(input(/^I1 S1 Stair buttons/));
    sched.scan();
    await waitFor(() => expect(led(container, 'K1 Contactor coil energized')).toBeDefined());
    expect(container.querySelector('[data-relay="Q1"] [data-bridge]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Configure Q1 load/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Spare · open circuit' }));
    expect(led(container, 'Q1 Open circuit')).toBeDefined();
    expect(container.querySelector('[data-relay="Q1"]')?.getAttribute('data-closed')).toBe('true'); // relay still closes
  });
});

describe('LOGO! program library, FBD viewer and manual', () => {
  function startLogo() {
    const sched = manual();
    const view = render(<PlcSimulatorApp initialProfileId={LOGO_0BA8.id} runtimeOptions={sched.runtimeOptions} />);
    return { sched, ...view };
  }
  const key = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  it('offers 22 programs in three groups and switches the voltage class with the program', () => {
    const { container } = startLogo();
    const picker = screen.getByRole('combobox', { name: 'Application scenario' });
    expect(within(picker).getAllByRole('option')).toHaveLength(25);
    expect(Array.from(picker.querySelectorAll('optgroup')).map((g) => g.getAttribute('label'))).toEqual([
      '230 V AC · building automation',
      '24 V DC · machine automation',
      'Manual Ch. 8 references',
      'Beginner tutorials',
    ]);
    fireEvent.change(picker, { target: { value: 'star-delta' } });
    expect(container.querySelector('[data-terminal="L+"]')).not.toBeNull();
    expect(container.querySelector('svg[data-supply="dc"]')).not.toBeNull();
  });

  it('locks label geometry to the viewBox: aspect-ratio wrapper, percent placement, container-width font size', () => {
    const { container } = startLogo();
    const bench = (container.querySelector('svg[aria-label^="Electrical bench"]') as SVGElement).closest('[data-label-canvas]') as HTMLElement;
    expect(bench.style.aspectRatio.replace(/\s/g, '')).toBe('1200/680');
    expect(bench.style.containerType).toBe('inline-size');
    expect(bench.querySelector('foreignObject')).toBeNull(); // no foreignObject left to be mis-scaled
    const i1 = bench.querySelector('[data-port="I1"]') as HTMLElement; // screw at x = 515 -> 515 / 1200
    expect(i1.style.left).toBe(`${(515 / 1200) * 100}%`);
    expect(i1.style.top).toBe(`${((172 + 20) / 680) * 100}%`);
    expect(i1.style.fontSize).toBe(`${(10 / 1200) * 100}cqw`);
    expect(i1.style.transform).toBe('translate(-50%, -50%)');
    expect(i1.getAttribute('data-target')).toBe('515,172');
  });

  it('draws spare outputs with no wiring, mirroring spare inputs, and no square behind screws', () => {
    const { container } = startLogo();
    fireEvent.change(screen.getByRole('combobox', { name: 'Application scenario' }), { target: { value: 'seal-in-gates' } });
    const bench = container.querySelector('svg[aria-label^="Electrical bench"]') as SVGElement;
    expect(bench.querySelectorAll('[data-terminal="Q1.2"] rect')).toHaveLength(0);
    expect(bench.querySelectorAll('[data-terminal="I1"] circle')).toHaveLength(1);
    // Q1 wired (feed + output + return); Q2..Q4 spare: nothing drawn beyond the terminal itself
    const wires = Array.from(bench.querySelectorAll('path[fill="none"]')).map((p) => p.getAttribute('d') ?? '');
    const rightOfDevice = wires.filter((d) => /L 1[0-9]{3} /.test(d) || /L 1[0-9]{3}$/.test(d));
    expect(rightOfDevice.length).toBeGreaterThan(0);
    const spareOutputs = [2, 3, 4].map((n) => wires.filter((d) => d.startsWith(`M ${[0, 0, 566, 661, 756][n]} `)));
    for (const list of spareOutputs) expect(list).toHaveLength(0);
  });

  it('draws the program as an FBD and animates live wires while running', async () => {
    const { sched, container } = startLogo();
    fireEvent.change(screen.getByRole('combobox', { name: 'Application scenario' }), { target: { value: 'dol-starter' } });
    const fbd = () => container.querySelector('svg[data-fbd]') as SVGElement;
    expect(fbd().querySelectorAll('[data-fbd-block]')).toHaveLength(3);
    expect(fbd().querySelector('[data-fbd-block="B2"]')?.textContent).toContain('B02: AND');
    const canvas = fbd().closest('[data-label-canvas]') as HTMLElement;
    expect(canvas.querySelector('[data-port="I1"] .katex')).not.toBeNull();
    expect(canvas.querySelector('[data-port="Q1"] .katex')).not.toBeNull();

    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    fireEvent.pointerDown(screen.getByRole('button', { name: /^I1 S1 START/ }));
    sched.scan();
    fireEvent.pointerUp(screen.getByRole('button', { name: /^I1 S1 START/ }));
    sched.scan();
    await waitFor(() => expect(fbd().querySelector('[data-fbd-block="B2"]')?.getAttribute('data-high')).toBe('true'));
    expect(fbd().querySelector('path[data-net="B2"]')?.getAttribute('class')).toContain('lb-flow');
    await waitFor(() => expect(fbd().querySelector('path[data-net="I1"]')?.getAttribute('data-high')).toBe('false')); // released, sealed in via Q1
    expect(fbd().querySelector('[data-fbd-block="B2"]')?.getAttribute('data-high')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(container.querySelector('svg[data-fbd]')).toBeNull();
  });

  it('shows live timer accumulators in the FBD', async () => {
    const { sched, container } = startLogo();
    fireEvent.change(screen.getByRole('combobox', { name: 'Application scenario' }), { target: { value: 'pre-lube' } });
    ['Down', 'Down', 'Down', 'OK'].forEach(key);
    fireEvent.pointerDown(screen.getByRole('button', { name: /^I1 S1 START/ }));
    sched.scan();
    sched.scan(1000);
    sched.scan(1000);
    await waitFor(() => expect(container.querySelector('[data-fbd-live="B2"]')?.textContent).toMatch(/^2\.\d\d \/ 5\.00 s$/));
  });

  it('opens the manual from the toolbar, typeset with KaTeX, and loads tutorial programs on the bench', () => {
    startLogo();
    fireEvent.click(screen.getByRole('button', { name: "Beginner's manual" }));
    const manualRegion = screen.getByRole('region', { name: 'LOGO! manual' });
    const tabs = within(screen.getByRole('tablist', { name: 'Manual module' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['1 · Hardware', '2 · Scan cycle', '3 · Front panel', '4 · Blocks', '5 · Commissioning', 'A · Seal-in', 'B · Traffic light']);
    for (const tab of tabs) {
      fireEvent.click(tab);
      expect(manualRegion.querySelectorAll('.katex').length).toBeGreaterThan(0);
      const visible = manualRegion.cloneNode(true) as HTMLElement;
      visible.querySelectorAll('.katex').forEach((node) => node.remove());
      expect(visible.textContent).not.toMatch(/\\[a-z]+|[_^]\{/); // no raw LaTeX outside KaTeX
    }
    fireEvent.click(tabs[6] as HTMLElement); // tutorial B: worked FBD + parameters
    expect(manualRegion.querySelector('svg[data-fbd]')).not.toBeNull();
    expect(manualRegion.textContent).toContain('Async. pulse generator');
    fireEvent.click(within(manualRegion).getByRole('button', { name: /Load “Traffic light sequence” on the bench/ }));
    expect(screen.getByRole('combobox', { name: 'Application scenario' })).toHaveProperty('value', 'traffic-light');
    fireEvent.click(tabs[5] as HTMLElement);
    expect(manualRegion.querySelectorAll('svg[data-fbd]')).toHaveLength(2); // gate and RS versions
    fireEvent.click(screen.getByRole('button', { name: 'Close manual' }));
    expect(screen.queryByRole('region', { name: 'LOGO! manual' })).toBeNull();
  });
});

describe('LOGO! physical keyboard', () => {
  const display = () => screen.getByRole('img', { name: /^Display/ });
  const press = (name: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: name });

  function startLogo() {
    const sched = manual();
    const view = render(<PlcSimulatorApp initialProfileId={LOGO_0BA8.id} runtimeOptions={sched.runtimeOptions} />);
    return { sched, ...view };
  }

  it('shows the key hint bar', () => {
    startLogo();
    const hint = screen.getByRole('note', { name: 'Keyboard shortcuts' });
    expect(hint.textContent).toContain('▲▼◄► Nav');
    expect(hint.textContent).toContain('Enter: OK');
    expect(hint.textContent).toContain('Esc: Back');
  });

  it('maps Enter to OK, arrows to navigation and Escape to the parameter menu', () => {
    const { sched } = startLogo();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Enter'); // Start
    expect(mode()).toBe('RUN');
    sched.scan();
    press('ArrowDown');
    expect(display().textContent).toContain('I:');
    press('Escape');
    expect(display().textContent).toContain('>Stop');
    press('Enter');
    press('ArrowDown');
    press('Enter'); // Yes
    expect(mode()).toBe('STOP');
  });

  it('leaves keys alone in form fields and when the tab is hidden', () => {
    startLogo();
    press('Enter', screen.getByRole('combobox', { name: 'Application scenario' }));
    expect(display().textContent).toContain('>Program..');

    fireEvent.click(screen.getByRole('tab', { name: 'S7-200' }));
    press('ArrowDown');
    fireEvent.click(screen.getByRole('tab', { name: 'LOGO!' }));
    expect(display().textContent).toContain('>Program..');
  });
});

