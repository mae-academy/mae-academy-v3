import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../../engine/types';
import { inProcessLogoTransport } from '../../remote/test-utils';
import { LogoBenchController } from '../controller';
import { checkProgram } from '@shared/logo/validate';
import { MEMORY_LIMITS } from '@shared/logo/memory';
import { SCENARIO_LIST, type ScenarioId } from '../scenarios';

/** Runs a scenario on the real bench controller with a hand-driven clock. Input numbers are 1-based. */
async function run(id: ScenarioId) {
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
  const c = new LogoBenchController({ scheduler, clock: () => now, scenario: id, transport: inProcessLogoTransport, batchMs: 0 });
  const scan = async (ms = 20) => {
    now += ms;
    const callback = pending;
    pending = null;
    callback?.();
    await c.idle();
  };
  expect(c.run()).toBe(true);
  await scan(0);
  /** Advance simulated time in scan-sized steps (timers see every scan, as on hardware). */
  const wait = async (ms: number, step = 50) => {
    for (let t = 0; t < ms; t += step) await scan(step);
  };
  const set = async (input: number, actuated: boolean) => {
    c.actuate(input - 1, actuated);
    await scan();
  };
  const tap = async (input: number) => {
    await set(input, true);
    await set(input, false);
  };
  const q = (output: number) => c.relayClosed(output);
  return { c, scan, wait, set, tap, q };
}

describe('benchmark library', async () => {
  it('has 10 AC + 10 DC programs plus beginner tutorials, all valid within the memory budget', () => {
    expect(SCENARIO_LIST.filter((s) => s.group === 'ac')).toHaveLength(10);
    expect(SCENARIO_LIST.filter((s) => s.group === 'dc')).toHaveLength(10);
    expect(SCENARIO_LIST.filter((s) => s.group === 'tutorial')).toHaveLength(3);
    expect(new Set(SCENARIO_LIST.map((s) => s.id)).size).toBe(SCENARIO_LIST.length);
    for (const scenario of SCENARIO_LIST) {
      const compiled = checkProgram(scenario.program);
      expect(compiled.diagnostics.map((d) => d.message), scenario.id).toEqual([]);
      expect(compiled.usage.bytes).toBeLessThanOrEqual(MEMORY_LIMITS.bytes);
      expect(scenario.inputs).toHaveLength(8);
      expect(scenario.loads).toHaveLength(4);
      expect(scenario.device).toBe(scenario.group === 'dc' ? '12/24RC' : '230RC');
      // every input the program reads is wired to a real device, not a spare
      const read = new Set<number>();
      for (const block of scenario.program.blocks) for (const wire of Object.values(block.inputs)) if (wire?.ref.kind === 'digital-input') read.add(wire.ref.index);
      for (const sink of scenario.program.sinks) if (sink.source.kind === 'digital-input') read.add(sink.source.index);
      for (const index of read) expect(scenario.inputs[index - 1]?.device.kind, `${scenario.id} I${index}`).not.toBe('spare');
    }
  });

  it('switches the bench voltage class with the scenario', async () => {
    const { c } = await run('dol-starter');
    expect(c.device.supply).toMatchObject({ kind: 'DC', volts: 24 });
    c.loadScenario('bath-fan');
    expect(c.device.supply).toMatchObject({ kind: 'AC', volts: 230 });
  });
});

describe('230 V AC suite', async () => {
  it('hallway: either station toggles, central OFF resets', async () => {
    const b = await run('hallway-impulse');
    await b.tap(1);
    expect(b.q(1)).toBe(true);
    await b.tap(2);
    expect(b.q(1)).toBe(false);
    await b.tap(2);
    await b.tap(3);
    expect(b.q(1)).toBe(false);
  });

  it('roller shutter: interlocked, limit cut-off and anti-reversal deadband', async () => {
    const b = await run('roller-shutter');
    await b.set(5, false); // leaves the bottom limit
    await b.tap(1);
    expect([b.q(1), b.q(2)]).toEqual([true, false]);
    await b.tap(2); // DOWN while going up: stops, but may not reverse inside the deadband
    await b.scan();
    expect([b.q(1), b.q(2)]).toEqual([false, false]);
    await b.wait(1600);
    await b.tap(2);
    await b.scan();
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
    await b.set(5, true); // bottom limit reached
    expect(b.q(2)).toBe(false);
  });

  it('bath fan: runs with the light and 60 s after it', async () => {
    const b = await run('bath-fan');
    await b.set(1, true);
    expect([b.q(1), b.q(2)]).toEqual([true, true]);
    await b.set(1, false);
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
    await b.wait(59_000, 1000);
    expect(b.q(2)).toBe(true);
    await b.wait(1500, 500);
    expect(b.q(2)).toBe(false);
  });

  it('sump: duty alternates between pumps; the flood float runs both and alarms', async () => {
    const b = await run('sump-duplex');
    const cycle = async () => {
      await b.set(1, true);
      await b.set(2, true);
      const running = [b.q(1), b.q(2)];
      await b.set(2, false);
      await b.set(1, false);
      return running;
    };
    const first = await cycle();
    const second = await cycle();
    expect(first.filter(Boolean)).toHaveLength(1);
    expect(second).toEqual([first[1], first[0]]);
    await b.set(3, true);
    expect([b.q(1), b.q(2), b.q(3)]).toEqual([true, true, true]);
  });

  it('shopfront: floods all night, display only the first 6 h after dusk', async () => {
    const b = await run('shopfront-clock');
    await b.set(1, true);
    expect([b.q(2), b.q(3)]).toEqual([false, true]); // day
    await b.wait(10_100);
    expect([b.q(1), b.q(2)]).toEqual([true, true]); // dusk
    await b.wait(6_500);
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
  });

  it('heating: stage 2 only after a 30 s deficit', async () => {
    const b = await run('two-stage-heating');
    await b.set(2, true);
    await b.set(1, true);
    expect([b.q(1), b.q(2)]).toEqual([true, false]);
    await b.wait(30_100, 100);
    expect(b.q(2)).toBe(true);
  });

  it('security light: motion counts only in the dark; bypass forces it on', async () => {
    const b = await run('security-motion');
    await b.tap(1);
    await b.set(1, true);
    expect(b.q(1)).toBe(false);
    await b.set(2, true);
    expect(b.q(1)).toBe(true);
    await b.set(1, false);
    await b.wait(20_200, 100);
    expect(b.q(1)).toBe(false);
    await b.set(3, true);
    expect(b.q(1)).toBe(true);
  });

  it('siren: interrupted pattern until acknowledged', async () => {
    const b = await run('siren-pattern');
    await b.tap(1);
    const seen = new Set<boolean>();
    for (let i = 0; i < 60; i++) {
      await b.scan(50);
      seen.add(b.q(1));
    }
    expect(seen).toEqual(new Set([true, false]));
    await b.tap(2);
    await b.wait(1000);
    expect([b.q(1), b.q(2)]).toEqual([false, false]);
  });
});

describe('24 V DC suite', async () => {
  it('DOL: seal-in, NC stop, overload trip', async () => {
    const b = await run('dol-starter');
    await b.tap(1);
    expect(b.q(1)).toBe(true);
    await b.tap(2); // STOP (NC) pressed
    expect(b.q(1)).toBe(false);
    await b.tap(1);
    await b.set(3, true); // overload trips
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
  });

  it('star-delta: star, then 50 ms transit, then delta; never both', async () => {
    const b = await run('star-delta');
    await b.tap(1);
    expect([b.q(1), b.q(2), b.q(3)]).toEqual([true, false, true]);
    let both = false;
    let sawGap = false;
    for (let t = 0; t < 5_400; t += 10) {
      await b.scan(10);
      if (b.q(1) && b.q(2)) both = true;
      if (!b.q(1) && !b.q(2)) sawGap = true;
    }
    expect(both).toBe(false);
    expect(sawGap).toBe(true);
    expect([b.q(1), b.q(2), b.q(3)]).toEqual([false, true, true]);
  });

  it('forward/reverse: enforced 3 s braking pause', async () => {
    const b = await run('fwd-rev-brake');
    await b.tap(1);
    expect(b.q(1)).toBe(true);
    await b.tap(2);
    await b.scan();
    expect([b.q(1), b.q(2), b.q(3)]).toEqual([false, false, true]);
    await b.wait(3_100);
    await b.tap(2);
    await b.scan();
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
  });

  it('conveyor: parts keep it running; 8 s without a part latches the jam fault', async () => {
    const b = await run('conveyor-jam');
    await b.tap(1);
    expect(b.q(1)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await b.wait(5_000, 100);
      await b.tap(3);
    }
    expect(b.q(1)).toBe(true);
    await b.wait(8_500, 100);
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
    await b.tap(4);
    expect(b.q(2)).toBe(false);
  });

  it('pneumatic: reciprocates and stops after 5 strokes', async () => {
    const b = await run('pneumatic-recipro');
    await b.tap(1);
    for (let stroke = 0; stroke < 5; stroke++) {
      expect(b.q(1), `stroke ${stroke}`).toBe(true); // extend
      await b.set(4, false);
      await b.set(3, true); // front
      expect(b.q(2)).toBe(true); // retract
      await b.set(3, false);
      await b.set(4, true); // rear
    }
    await b.scan();
    expect([b.q(1), b.q(3)]).toEqual([false, true]);
  });

  it('bottling: every 6th bottle opens the gate for 2 s', async () => {
    const b = await run('bottling-counter');
    for (let i = 0; i < 5; i++) await b.tap(1);
    expect(b.q(1)).toBe(false);
    await b.tap(1);
    expect(b.q(1)).toBe(true);
    await b.wait(2_100, 100);
    expect(b.q(1)).toBe(false);
    for (let i = 0; i < 6; i++) await b.tap(1);
    expect(b.q(1)).toBe(true);
  });

  it('two-hand: only within the 500 ms coincidence window, only while both are held', async () => {
    const b = await run('two-hand');
    await b.set(1, true);
    await b.wait(600);
    await b.set(2, true);
    expect(b.q(1)).toBe(false); // too late
    await b.set(1, false);
    await b.set(2, false);
    await b.set(1, true);
    await b.wait(200);
    await b.set(2, true);
    expect(b.q(1)).toBe(true);
    await b.set(2, false);
    expect(b.q(1)).toBe(false);
    await b.set(2, true);
    expect(b.q(1)).toBe(false); // no re-arming by re-pressing one hand
  });

  it('booster: lead pump alternates, lag cuts in after 3 s', async () => {
    const b = await run('booster-lead-lag');
    await b.set(3, true);
    await b.set(1, true);
    const lead1 = [b.q(1), b.q(2)];
    expect(lead1.filter(Boolean)).toHaveLength(1);
    await b.set(2, true);
    await b.wait(3_100);
    expect([b.q(1), b.q(2), b.q(3)]).toEqual([true, true, true]);
    await b.set(2, false);
    await b.set(1, false);
    await b.set(1, true);
    expect([b.q(1), b.q(2)]).toEqual([lead1[1], lead1[0]]);
  });

  it('hopper: pulses while enabled, inhibited when the chute is full', async () => {
    const b = await run('hopper-feeder');
    await b.set(1, true);
    expect(b.q(1)).toBe(true);
    await b.set(2, true);
    expect([b.q(1), b.q(2)]).toEqual([false, true]);
  });

  it('pre-lube: main drive only after 5 s pump run and confirmed pressure', async () => {
    const b = await run('pre-lube');
    await b.tap(1);
    expect([b.q(1), b.q(2)]).toEqual([true, false]);
    await b.wait(5_100, 100);
    expect([b.q(2), b.q(3)]).toEqual([false, true]); // no pressure: fault
    await b.set(3, true);
    expect([b.q(2), b.q(3)]).toEqual([true, false]);
    await b.tap(2);
    expect([b.q(1), b.q(2)]).toEqual([false, false]);
  });
});

describe('tutorial programs', async () => {
  it('seal-in (both versions): START seals in, STOP wins, and STOP wins over a held START', async () => {
    for (const id of ['seal-in-gates', 'seal-in-rs'] as const) {
      const b = await run(id);
      expect(b.q(1), id).toBe(false);
      await b.tap(1);
      expect(b.q(1), `${id} sealed`).toBe(true);
      await b.wait(500);
      expect(b.q(1), `${id} holds`).toBe(true);
      await b.tap(2); // STOP is NC: pressing it opens the contact
      expect(b.q(1), `${id} stopped`).toBe(false);
      await b.set(1, true);
      await b.set(2, true);
      expect(b.q(1), `${id} stop dominates`).toBe(false);
      await b.set(2, false);
      await b.set(1, false);
    }
  });

  it('traffic light: green 5 s, yellow 2 s, red 5 s, one lamp at a time, 12 s run-out after switch-off', async () => {
    const b = await run('traffic-light');
    const lamps = () => [b.q(1), b.q(2), b.q(3)].map((on) => (on ? 1 : 0));
    expect(lamps()).toEqual([0, 0, 0]);
    await b.set(1, true);
    const timeline: string[] = [];
    let previous = '';
    for (let t = 0; t < 32_000; t += 50) {
      await b.scan(50);
      const now = lamps();
      expect(now.reduce((a, c) => a + c, 0), `at ${t} ms`).toBeLessThanOrEqual(1);
      const name = now[2] ? 'green' : now[1] ? 'yellow' : now[0] ? 'red' : 'off';
      if (name !== previous) timeline.push(`${name}@${Math.round(t / 1000)}`);
      previous = name;
      if (t === 20_000) await b.set(1, false);
    }
    expect(timeline.slice(0, 6)).toEqual(['green@0', 'yellow@5', 'red@7', 'green@12', 'yellow@17', 'red@19']);
    // switched off at 20 s: the sequence keeps running for 12 s, then everything is dark
    expect(lamps()).not.toEqual([0, 0, 0]);
    await b.wait(400);
    expect(lamps()).toEqual([0, 0, 0]);
  });
});
