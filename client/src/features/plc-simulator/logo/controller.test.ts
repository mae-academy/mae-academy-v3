import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../engine/types';
import { LogoBenchController } from './controller';
import type { PanelKey } from './firmware/panel';
import type { ScenarioId } from './scenarios';

/** Scheduler + clock advanced by hand, so every scan happens exactly when the test asks. */
function bench(scenario: ScenarioId = 'stairway') {
  let pending: (() => void) | null = null;
  let now = 0;
  const scheduler: Scheduler = {
    schedule: (callback) => {
      pending = callback;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  };
  const controller = new LogoBenchController({ scheduler, clock: () => now, wallClock: () => Date.UTC(2026, 8, 28, 9, 0), scenario });
  return {
    controller,
    scan(ms = 20) {
      now += ms;
      const callback = pending;
      pending = null;
      callback?.();
    },
    keys(...sequence: PanelKey[]) {
      sequence.forEach((key) => controller.press(key));
    },
    text: () => controller.frame().lines.join('\n'),
  };
}

describe('front-panel menu tree (spec §2.2)', () => {
  it('starts in the STOP main menu and enters RUN from Start', () => {
    const b = bench();
    expect(b.text()).toContain('>Program..');
    b.keys('down', 'down', 'down');
    expect(b.text()).toContain('>Start');
    b.keys('ok');
    expect(b.controller.mode).toBe('RUN');
    expect(b.controller.runLed).toBe('green');
    b.keys('down');
    expect(b.text()).toContain('I:');
    expect(b.text()).toContain('0..123456789');
  });

  it('shows active inputs inverted on the I: screen', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok', 'down');
    b.controller.actuate(0, true);
    b.scan();
    expect(b.controller.frame().inverted).toContainEqual({ line: 1, col: 3, length: 1 });
    expect(b.controller.frame().lines).toEqual(['I:          ', '0..123456789', '1.0123456789', '2.01234     ']);
    b.keys('down');
    expect(b.controller.frame().lines).toEqual(['Q:          ', '0..123456789', '1.0123456   ', '            ']);
  });

  it('asks "Stop Prg" with No preselected and stops only on Yes', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok');
    b.keys('esc');
    expect(b.text()).toContain('>Stop');
    b.keys('ok');
    expect(b.text()).toContain('Stop Prg');
    expect(b.text()).toContain('>No');
    b.keys('ok');
    expect(b.controller.mode).toBe('RUN');
    b.keys('ok', 'down', 'ok');
    expect(b.controller.mode).toBe('STOP');
    expect(b.text()).toContain('>Program..');
  });

  it('edits a timer in parameter-assignment mode without stopping the program', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok');
    b.controller.actuate(0, true);
    b.scan();
    b.scan(1000);
    b.keys('esc', 'down', 'ok');
    expect(b.text()).toContain('B1 Stairway');
    expect(b.text()).toContain('T  =30:00s');
    expect(b.text()).toMatch(/Ta =01:0\ds/);
    b.keys('ok', 'up', 'left', 'left', 'left', 'down', 'ok'); // 30:00 -> 20:01
    expect(b.text()).toContain('T  =20:01s');
    expect(b.controller.program.blocks[0]?.params.T).toEqual({ base: 's', value: 2001 });
    expect(b.controller.mode).toBe('RUN');
    expect(b.controller.relayClosed(1)).toBe(true); // the running timer kept its state
  });

  it('cancels a parameter edit with ESC', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok', 'esc', 'down', 'ok', 'ok', 'up', 'esc');
    expect(b.text()).toContain('T  =30:00s');
  });

  it('browses the circuit output -> inputs and rewires a connector in programming mode', () => {
    const b = bench();
    b.keys('ok', 'ok'); // Program.. -> Edit..
    expect(b.text()).toContain('Q1');
    expect(b.text()).toContain('>In =B1');
    b.keys('left');
    expect(b.text()).toContain('B1 Stairway');
    expect(b.text()).toContain('>Trg=I1');
    b.keys('ok', 'ok', 'down', 'ok'); // picker: Co -> list on I1, down to I2, OK
    expect(b.controller.program.blocks[0]?.inputs.Trg?.ref).toEqual({ kind: 'digital-input', index: 2 });
    expect(b.text()).toContain('>Trg=I2');
    b.keys('right');
    expect(b.text()).toContain('>In =B1');
    b.keys('down');
    expect(b.text()).toContain('Q2');
    b.keys('esc', 'esc');
    expect(b.text()).toContain('>Program..');
  });

  it('reports free memory and clears the program after confirmation', () => {
    const b = bench();
    b.keys('ok', 'down', 'down', 'ok');
    expect(b.text()).toContain('Free Memory:');
    expect(b.text()).toContain(`Byte =${2000 - 36}`);
    expect(b.text()).toContain('Block=127');
    b.keys('esc', 'down', 'ok');
    expect(b.text()).toContain('Clear Prg');
    b.keys('down', 'ok');
    expect(b.text()).toContain('No Program');
    b.keys('esc', 'down', 'down', 'down', 'ok');
    expect(b.controller.mode).toBe('STOP');
    expect(b.text()).toContain('No Program');
  });

  it('copies the program to the card and back', () => {
    const b = bench();
    b.keys('down', 'ok', 'ok');
    expect(b.text()).toContain('LOGO! → Card');
    expect(b.controller.cardHasProgram).toBe(true);
    b.keys('esc', 'esc', 'up', 'ok', 'down', 'down', 'down', 'ok', 'down', 'ok'); // Clear Prg -> Yes
    expect(b.controller.program.sinks).toHaveLength(0);
    b.keys('esc', 'down', 'ok', 'down', 'ok');
    expect(b.text()).toContain('Card → LOGO!');
    expect(b.controller.program.name).toBe('STAIRWAY');
  });

  it('sets the real-time clock from the Clock menu', () => {
    const b = bench();
    b.keys('down', 'down', 'ok', 'ok');
    expect(b.text()).toContain('Set Clock');
    b.keys('right', 'up', 'up', 'ok'); // hour + 2
    b.keys('esc', 'down', 'down', 'down', 'ok'); // Start: RUN screen 0 shows the clock
    const local = new Date(Date.UTC(2026, 8, 28, 9, 0));
    const two = (n: number) => String(n).padStart(2, '0');
    expect(b.text()).toContain(`${two((local.getHours() + 2) % 24)}:${two(local.getMinutes())}`);
  });
});

describe('authoring a program from an empty memory', () => {
  const clearMemory = (b: ReturnType<typeof bench>) => {
    b.keys('ok', 'down', 'down', 'down', 'ok', 'down', 'ok'); // Program.. -> Clear Prg -> Yes
    expect(b.controller.program.sinks).toHaveLength(0);
    expect(b.controller.snapshot().usage).toEqual({ bytes: 0, blocks: 0, rem: 0 });
    expect(b.text()).toContain('No Program');
    b.keys('esc'); // main menu
  };

  it('Edit Prg on empty memory presents "- [ Q1 ]" with the cursor on Q1', () => {
    const b = bench();
    clearMemory(b);
    b.keys('ok', 'ok'); // Program.. -> Edit..
    expect(b.text()).not.toContain('No Program');
    expect(b.controller.frame().lines[1]).toBe('- [ Q1 ]    ');
    expect(b.controller.frame().cursor).toEqual({ line: 1, col: 4 });
    b.keys('left');
    expect(b.controller.frame().cursor).toEqual({ line: 1, col: 0 });
    b.keys('right');
    expect(b.controller.frame().cursor).toEqual({ line: 1, col: 4 });
  });

  it('builds Q1 = OR(I1, I2, x, x) with the keypad and runs it on the bench', () => {
    const b = bench();
    clearMemory(b);
    b.keys('ok', 'ok', 'left', 'ok'); // Edit.. -> pin -> picker
    expect(b.text()).toContain('>Co');
    expect(b.text()).toContain(' GF');
    expect(b.text()).toContain(' SF');
    b.keys('down', 'ok'); // GF list
    expect(b.text()).toContain('>AND');
    b.keys('down', 'down', 'down', 'down', 'ok'); // AND, AND-edge, NAND, NAND-edge, OR
    expect(b.controller.program.blocks).toHaveLength(1);
    expect(b.controller.program.blocks[0]?.type).toBe('OR');
    expect(b.controller.program.sinks).toEqual([{ target: { kind: 'digital-output', index: 1 }, source: { kind: 'block-output', blockId: 1 } }]);
    expect(b.text()).toContain('B1 OR');
    expect(b.text()).toContain('>1  =x');

    b.keys('ok', 'ok', 'down', 'down', 'down', 'ok'); // pin 1: Co list x, hi, lo, I1
    expect(b.controller.program.blocks[0]?.inputs['1']?.ref).toEqual({ kind: 'digital-input', index: 1 });
    b.keys('down', 'ok', 'ok', 'down', 'down', 'down', 'down', 'ok');
    expect(b.controller.program.blocks[0]?.inputs['2']?.ref).toEqual({ kind: 'digital-input', index: 2 });
    b.keys('down'); // pin 3 stays open, pin 4 explicitly terminated with x
    b.keys('down', 'ok', 'ok', 'ok');
    expect(b.controller.program.blocks[0]?.inputs['4']?.ref).toEqual({ kind: 'x' });

    b.keys('esc', 'esc', 'esc'); // back to the main menu
    expect(b.text()).toContain('>Program..');
    b.keys('down', 'down', 'down', 'ok'); // Start
    expect(b.controller.mode).toBe('RUN');

    const contact = () => b.controller.relayClosed(1);
    b.scan();
    expect(contact()).toBe(false);
    b.controller.actuate(0, true);
    b.scan();
    expect(contact()).toBe(true);
    b.controller.actuate(1, true);
    b.scan();
    expect(contact()).toBe(true);
    b.controller.actuate(0, false);
    b.scan();
    expect(contact()).toBe(true); // OR: I2 alone holds it
    b.controller.actuate(1, false);
    b.scan();
    expect(contact()).toBe(false);
  });

  it('offers only blocks the memory can still afford', () => {
    const b = bench();
    clearMemory(b);
    b.keys('ok', 'ok', 'ok', 'down', 'ok');
    expect(b.controller.frame().lines.join('')).toContain('AND');
  });
});

describe('bench electrical behaviour', () => {
  it('stairway: light on from the pushbutton, pre-warning blink, then off after T', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok');
    b.scan();
    b.controller.actuate(0, true);
    b.scan();
    expect(b.controller.relayClosed(1)).toBe(true);
    b.controller.actuate(0, false);
    const trace: boolean[] = [];
    for (let s = 0; s < 31; s++) {
      b.scan(1000);
      trace.push(b.controller.relayClosed(1));
    }
    expect(trace.slice(0, 24).every(Boolean)).toBe(true);
    expect(trace[24]).toBe(false); // ~25 s: pre-warning off-blink
    expect(trace[25]).toBe(true);
    expect(trace[30]).toBe(false);
  });

  it('pulse relay toggles the corridor light; central OFF resets it', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok');
    const tap = (index: number) => {
      b.controller.actuate(index, true);
      b.scan();
      b.controller.actuate(index, false);
      b.scan();
    };
    tap(1);
    expect(b.controller.relayClosed(2)).toBe(true);
    tap(1);
    expect(b.controller.relayClosed(2)).toBe(false);
    tap(1);
    tap(2);
    expect(b.controller.relayClosed(2)).toBe(false);
  });

  it('models terminal voltages per voltage class and NC contacts', () => {
    const b = bench('factory-gate');
    const stop = () => b.controller.benchInputs[2];
    expect(stop()?.volts).toBe(230); // NC STOP button at rest: closed
    b.controller.actuate(2, true);
    expect(stop()?.volts).toBe(0);
    b.controller.setDevice('12/24RC');
    b.controller.actuate(2, false);
    expect(stop()?.volts).toBe(24);
    expect(b.controller.device.supply.hot).toBe('L+');
  });

  it('sliding door never energises both contactors (interlock)', () => {
    const b = bench('sliding-door');
    b.keys('down', 'down', 'down', 'ok');
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let opened = 0;
    for (let s = 0; s < 800; s++) {
      if (random() < 0.2) b.controller.toggle(Math.floor(random() * 4));
      b.scan(random() < 0.1 ? 1000 : 20);
      const k1 = b.controller.relayClosed(1);
      const k2 = b.controller.relayClosed(2);
      expect(k1 && k2).toBe(false);
      if (k1) opened += 1;
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('factory gate: the safety edge reverses a closing gate; the beacon flashes while moving', () => {
    const b = bench('factory-gate');
    b.keys('down', 'down', 'down', 'ok');
    b.scan();
    b.controller.actuate(4, false); // gate leaves the closed limit
    b.controller.actuate(1, true); // CLOSE
    b.scan();
    b.controller.actuate(1, false);
    b.scan();
    expect(b.controller.relayClosed(2)).toBe(true);
    const beacon = new Set<boolean>();
    for (let s = 0; s < 10; s++) {
      b.scan(200);
      beacon.add(b.controller.relayClosed(3));
    }
    expect(beacon).toEqual(new Set([true, false]));
    b.controller.actuate(5, true); // safety edge struck
    b.scan();
    expect(b.controller.relayClosed(2)).toBe(false);
    b.controller.actuate(5, false);
    b.scan();
    expect(b.controller.relayClosed(1)).toBe(true); // re-opening
  });

  it('power cycle: relays drop, display goes dark, RUN resumes on power-up; retentive data only survives', () => {
    const b = bench();
    b.keys('down', 'down', 'down', 'ok');
    b.controller.actuate(0, true);
    b.scan();
    expect(b.controller.relayClosed(1)).toBe(true);
    b.controller.setPower(false);
    expect(b.controller.relayClosed(1)).toBe(false);
    expect(b.controller.frame().backlight).toBe('off');
    expect(b.controller.runLed).toBeNull();
    expect(b.controller.benchInputs[0]?.volts).toBe(0);
    expect(b.controller.run()).toBe(false);
    b.controller.actuate(0, false);
    b.controller.setPower(true);
    expect(b.controller.mode).toBe('RUN');
    b.scan();
    expect(b.controller.relayClosed(1)).toBe(false); // non-retentive stairway timer was cleared
  });

  it('power-up copies a different program from the inserted card', () => {
    const b = bench();
    b.keys('down', 'ok', 'ok'); // → Card
    b.controller.loadScenario('factory-gate');
    b.controller.setPower(false);
    b.controller.setPower(true);
    expect(b.controller.program.name).toBe('STAIRWAY');
  });

  it('single-steps exactly one scan and holds', () => {
    const b = bench();
    b.controller.actuate(1, true);
    b.controller.step();
    expect(b.controller.mode).toBe('PAUSE');
    expect(b.controller.relayClosed(2)).toBe(true);
    expect(b.controller.readMetrics()?.cycle).toBe(1);
    b.scan();
    expect(b.controller.readMetrics()?.cycle).toBe(1);
  });
});
