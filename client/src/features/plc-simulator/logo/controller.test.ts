import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../engine/types';
import { inProcessLogoTransport } from '../remote/test-utils';
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
  const controller = new LogoBenchController({ scheduler, clock: () => now, wallClock: () => Date.UTC(2026, 8, 28, 9, 0), scenario, transport: inProcessLogoTransport, batchMs: 0 });
  return {
    controller,
    /** Fires one scan tick and waits for the engine's answer. */
    async scan(ms = 20) {
      now += ms;
      const callback = pending;
      pending = null;
      callback?.();
      await controller.idle();
    },
    /** Presses keys, then waits for any engine operation they queued. */
    async keys(...sequence: PanelKey[]) {
      sequence.forEach((key) => controller.press(key));
      await controller.idle();
    },
    text: () => controller.frame().lines.join('\n'),
  };
}

describe('front-panel menu tree (spec §2.2)', async () => {
  it('starts in the STOP main menu and enters RUN from Start', async () => {
    const b = bench();
    expect(b.text()).toContain('>Program..');
    await b.keys('down', 'down', 'down');
    expect(b.text()).toContain('>Start');
    await b.keys('ok');
    expect(b.controller.mode).toBe('RUN');
    expect(b.controller.runLed).toBe('green');
    await b.keys('down');
    expect(b.text()).toContain('I:');
    expect(b.text()).toContain('0..123456789');
  });

  it('shows active inputs inverted on the I: screen', async () => {
    const b = bench();
    await b.keys('down', 'down', 'down', 'ok', 'down');
    b.controller.actuate(0, true);
    await b.scan();
    expect(b.controller.frame().inverted).toContainEqual({ line: 1, col: 3, length: 1 });
    expect(b.controller.frame().lines).toEqual(['I:          ', '0..123456789', '1.0123456789', '2.01234     ']);
    await b.keys('down');
    expect(b.controller.frame().lines).toEqual(['Q:          ', '0..123456789', '1.0123456   ', '            ']);
  });

  it('asks "Stop Prg" with No preselected and stops only on Yes', async () => {
    const b = bench();
    await b.keys('down', 'down', 'down', 'ok');
    await b.keys('esc');
    expect(b.text()).toContain('>Stop');
    await b.keys('ok');
    expect(b.text()).toContain('Stop Prg');
    expect(b.text()).toContain('>No');
    await b.keys('ok');
    expect(b.controller.mode).toBe('RUN');
    await b.keys('ok', 'down', 'ok');
    expect(b.controller.mode).toBe('STOP');
    expect(b.text()).toContain('>Program..');
  });

  it('edits a timer in parameter-assignment mode without stopping the program', async () => {
    const b = bench();
    await b.keys('down', 'down', 'down', 'ok');
    b.controller.actuate(0, true);
    await b.scan();
    await b.scan(1000);
    await b.keys('esc', 'down', 'ok');
    expect(b.text()).toContain('B1 Stairway');
    expect(b.text()).toContain('T  =30:00s');
    expect(b.text()).toMatch(/Ta =01:0\ds/);
    await b.keys('ok', 'up', 'left', 'left', 'left', 'down', 'ok'); // 30:00 -> 20:01
    expect(b.text()).toContain('T  =20:01s');
    expect(b.controller.program.blocks[0]?.params.T).toEqual({ base: 's', value: 2001 });
    expect(b.controller.mode).toBe('RUN');
    expect(b.controller.relayClosed(1)).toBe(true); // the running timer kept its state
  });

  it('cancels a parameter edit with ESC', async () => {
    const b = bench();
    await b.keys('down', 'down', 'down', 'ok', 'esc', 'down', 'ok', 'ok', 'up', 'esc');
    expect(b.text()).toContain('T  =30:00s');
  });

  it('browses the circuit output -> inputs and rewires a connector in programming mode', async () => {
    const b = bench();
    await b.keys('ok', 'ok'); // Program.. -> Edit..
    expect(b.text()).toContain('Q1');
    expect(b.text()).toContain('>In =B1');
    await b.keys('left');
    expect(b.text()).toContain('B1 Stairway');
    expect(b.text()).toContain('>Trg=I1');
    await b.keys('ok', 'ok', 'down', 'ok'); // picker: Co -> list on I1, down to I2, OK
    expect(b.controller.program.blocks[0]?.inputs.Trg?.ref).toEqual({ kind: 'digital-input', index: 2 });
    expect(b.text()).toContain('>Trg=I2');
    await b.keys('right');
    expect(b.text()).toContain('>In =B1');
    await b.keys('down');
    expect(b.text()).toContain('Q2');
    await b.keys('esc', 'esc');
    expect(b.text()).toContain('>Program..');
  });

  it('reports free memory and clears the program after confirmation', async () => {
    const b = bench();
    await b.keys('ok', 'down', 'down', 'ok');
    expect(b.text()).toContain('Free Memory:');
    expect(b.text()).toContain(`Byte =${2000 - 36}`);
    expect(b.text()).toContain('Block=127');
    await b.keys('esc', 'down', 'ok');
    expect(b.text()).toContain('Clear Prg');
    await b.keys('down', 'ok');
    expect(b.text()).toContain('No Program');
    await b.keys('esc', 'down', 'down', 'down', 'ok');
    expect(b.controller.mode).toBe('STOP');
    expect(b.text()).toContain('No Program');
  });

  it('copies the program to the card and back', async () => {
    const b = bench();
    await b.keys('down', 'ok', 'ok');
    expect(b.text()).toContain('LOGO! ► Card');
    expect(b.controller.cardHasProgram).toBe(true);
    await b.keys('esc', 'esc', 'up', 'ok', 'down', 'down', 'down', 'ok', 'down', 'ok'); // Clear Prg -> Yes
    expect(b.controller.program.sinks).toHaveLength(0);
    await b.keys('esc', 'down', 'ok', 'down', 'ok');
    expect(b.text()).toContain('Card ► LOGO!');
    expect(b.controller.program.name).toBe('STAIRWAY');
  });

  it('sets the real-time clock from the Clock menu', async () => {
    const b = bench();
    await b.keys('down', 'down', 'ok', 'ok');
    expect(b.text()).toContain('Set Clock');
    await b.keys('right', 'up', 'up', 'ok'); // hour + 2
    await b.keys('esc', 'down', 'down', 'down', 'ok'); // Start: RUN screen 0 shows the clock
    const local = new Date(Date.UTC(2026, 8, 28, 9, 0));
    const two = (n: number) => String(n).padStart(2, '0');
    expect(b.text()).toContain(`${two((local.getHours() + 2) % 24)}:${two(local.getMinutes())}`);
  });
});

describe('authoring a program from an empty memory', async () => {
  const clearMemory = async (b: ReturnType<typeof bench>) => {
    await b.keys('ok', 'down', 'down', 'down', 'ok', 'down', 'ok'); // Program.. -> Clear Prg -> Yes
    expect(b.controller.program.sinks).toHaveLength(0);
    expect(b.controller.snapshot().usage).toEqual({ bytes: 0, blocks: 0, rem: 0 });
    expect(b.text()).toContain('No Program');
    await b.keys('esc'); // main menu
  };

  it('Edit Prg on empty memory presents "- [ Q1 ]" with the cursor on Q1', async () => {
    const b = bench();
    await clearMemory(b);
    await b.keys('ok', 'ok'); // Program.. -> Edit..
    expect(b.text()).not.toContain('No Program');
    expect(b.controller.frame().lines[1]).toBe('- [ Q1 ]    ');
    expect(b.controller.frame().cursor).toEqual({ line: 1, col: 4 });
    await b.keys('left');
    expect(b.controller.frame().cursor).toEqual({ line: 1, col: 0 });
    await b.keys('right');
    expect(b.controller.frame().cursor).toEqual({ line: 1, col: 4 });
  });

  it('builds Q1 = OR(I1, I2, x, x) with the keypad and runs it on the bench', async () => {
    const b = bench();
    await clearMemory(b);
    await b.keys('ok', 'ok', 'left', 'ok'); // Edit.. -> pin -> picker
    expect(b.text()).toContain('>Co');
    expect(b.text()).toContain(' GF');
    expect(b.text()).toContain(' SF');
    await b.keys('down', 'ok'); // GF list
    expect(b.text()).toContain('>AND');
    await b.keys('down', 'down', 'down', 'down', 'ok'); // AND, AND-edge, NAND, NAND-edge, OR
    expect(b.controller.program.blocks).toHaveLength(1);
    expect(b.controller.program.blocks[0]?.type).toBe('OR');
    expect(b.controller.program.sinks).toEqual([{ target: { kind: 'digital-output', index: 1 }, source: { kind: 'block-output', blockId: 1 } }]);
    expect(b.text()).toContain('B1 OR');
    expect(b.text()).toContain('>1  =x');

    await b.keys('ok', 'ok', 'down', 'down', 'down', 'ok'); // pin 1: Co list x, hi, lo, I1
    expect(b.controller.program.blocks[0]?.inputs['1']?.ref).toEqual({ kind: 'digital-input', index: 1 });
    await b.keys('down', 'ok', 'ok', 'down', 'down', 'down', 'down', 'ok');
    expect(b.controller.program.blocks[0]?.inputs['2']?.ref).toEqual({ kind: 'digital-input', index: 2 });
    await b.keys('down'); // pin 3 stays open, pin 4 explicitly terminated with x
    await b.keys('down', 'ok', 'ok', 'ok');
    expect(b.controller.program.blocks[0]?.inputs['4']?.ref).toEqual({ kind: 'x' });

    await b.keys('esc', 'esc', 'esc'); // back to the main menu
    expect(b.text()).toContain('>Program..');
    await b.keys('down', 'down', 'down', 'ok'); // Start
    expect(b.controller.mode).toBe('RUN');

    const contact = () => b.controller.relayClosed(1);
    await b.scan();
    expect(contact()).toBe(false);
    b.controller.actuate(0, true);
    await b.scan();
    expect(contact()).toBe(true);
    b.controller.actuate(1, true);
    await b.scan();
    expect(contact()).toBe(true);
    b.controller.actuate(0, false);
    await b.scan();
    expect(contact()).toBe(true); // OR: I2 alone holds it
    b.controller.actuate(1, false);
    await b.scan();
    expect(contact()).toBe(false);
  });

  it('offers only blocks the memory can still afford', async () => {
    const b = bench();
    await clearMemory(b);
    await b.keys('ok', 'ok', 'ok', 'down', 'ok');
    expect(b.controller.frame().lines.join('')).toContain('AND');
  });
});

describe('bench electrical behaviour', async () => {
  it('stairway: light on from the pushbutton, pre-warning blink, then off after T', async () => {
    const b = bench();
    await b.keys('down', 'down', 'down', 'ok');
    await b.scan();
    b.controller.actuate(0, true);
    await b.scan();
    expect(b.controller.relayClosed(1)).toBe(true);
    b.controller.actuate(0, false);
    const trace: boolean[] = [];
    for (let s = 0; s < 31; s++) {
      await b.scan(1000);
      trace.push(b.controller.relayClosed(1));
    }
    expect(trace.slice(0, 24).every(Boolean)).toBe(true);
    expect(trace[24]).toBe(false); // ~25 s: pre-warning off-blink
    expect(trace[25]).toBe(true);
    expect(trace[30]).toBe(false);
  });

  it('pulse relay toggles the corridor light; central OFF resets it', async () => {
    const b = bench();
    await b.keys('down', 'down', 'down', 'ok');
    const tap = async (index: number) => {
      b.controller.actuate(index, true);
      await b.scan();
      b.controller.actuate(index, false);
      await b.scan();
    };
    await tap(1);
    expect(b.controller.relayClosed(2)).toBe(true);
    await tap(1);
    expect(b.controller.relayClosed(2)).toBe(false);
    await tap(1);
    await tap(2);
    expect(b.controller.relayClosed(2)).toBe(false);
  });

  it('models terminal voltages per voltage class and NC contacts', () => {
    const b = bench('seal-in-gates');
    const stop = () => b.controller.benchInputs[1];
    expect(stop()?.volts).toBe(230); // NC STOP button at rest: closed
    b.controller.actuate(1, true);
    expect(stop()?.volts).toBe(0);
    b.controller.setDevice('12/24RC');
    b.controller.actuate(1, false);
    expect(stop()?.volts).toBe(24);
    expect(b.controller.device.supply.hot).toBe('L+');
  });

  it('traffic light sequence automatically configures Red on Q1, Yellow on Q2, and Green on Q3', () => {
    const b = bench('traffic-light');
    expect(b.controller.loads[0]?.color).toBe('red');
    expect(b.controller.loads[1]?.color).toBe('yellow');
    expect(b.controller.loads[2]?.color).toBe('green');
  });

  it('dynamically customises lamp color on a relay channel', () => {
    const b = bench('stairway');
    expect(b.controller.loads[0]?.kind).toBe('lamp');
    b.controller.setLampColor(0, 'green');
    expect(b.controller.loads[0]?.color).toBe('green');
    b.controller.setLoadKind(0, 'lamp');
    b.controller.setLampColor(0, 'yellow');
    expect(b.controller.loads[0]?.color).toBe('yellow');
    expect(b.controller.loads[0]?.tag).toBe('Yellow lamp');
  });

  it('power cycle: relays drop, display goes dark, power-up boots into STOP mode; retentive data only survives', async () => {
    const b = bench('stairway');
    await b.keys('down', 'down', 'down', 'ok');
    b.controller.actuate(0, true);
    await b.scan();
    expect(b.controller.relayClosed(1)).toBe(true);
    b.controller.setPower(false);
    expect(b.controller.relayClosed(1)).toBe(false);
    expect(b.controller.frame().backlight).toBe('off');
    expect(b.controller.runLed).toBeNull();
    expect(b.controller.benchInputs[0]?.volts).toBe(0);
    expect(b.controller.run()).toBe(false);
    b.controller.actuate(0, false);
    b.controller.setPower(true);
    expect(b.controller.mode).toBe('STOP');
    await b.scan();
    expect(b.controller.relayClosed(1)).toBe(false); // non-retentive stairway timer was cleared
  });

  it('power-up copies a different program from the inserted card', async () => {
    const b = bench('stairway');
    await b.keys('down', 'ok', 'ok'); // → Card
    b.controller.loadScenario('sump-duplex');
    b.controller.setPower(false);
    b.controller.setPower(true);
    expect(b.controller.program.name).toBe('STAIRWAY');
  });

  it('single-steps exactly one scan and holds', async () => {
    const b = bench();
    b.controller.actuate(1, true);
    b.controller.step();
    await b.controller.idle();
    expect(b.controller.mode).toBe('PAUSE');
    expect(b.controller.relayClosed(2)).toBe(true);
    expect(b.controller.readMetrics()?.cycle).toBe(1);
    await b.scan();
    expect(b.controller.readMetrics()?.cycle).toBe(1);
  });
});
