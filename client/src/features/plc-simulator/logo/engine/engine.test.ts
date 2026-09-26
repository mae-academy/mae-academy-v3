import { describe, expect, it } from 'vitest';
import { classifyInput, DEVICES } from '../hardware/devices';
import { parseProgram, serializeProgram } from '../persist';
import { SCENARIO_LIST } from '../scenarios';
import { INITIAL_BLOCK_STATE, stepBlock } from './blocks';
import { compileProgram, pruneOrphans, rewire } from './compile';
import { LogoCpu } from './cpu';
import { canAddBlock, MEMORY_LIMITS, measureProgram } from './memory';
import { formatTime, toMs } from './time';
import type { Bit, BlockType, ConnectorRef, LogoBlock, LogoProgram, WireIn } from './types';

// ---- fixtures ------------------------------------------------------------------------------------

const I = (index: number): ConnectorRef => ({ kind: 'digital-input', index });
const Q = (index: number): ConnectorRef => ({ kind: 'digital-output', index });
const M = (index: number): ConnectorRef => ({ kind: 'digital-flag', index });
const B = (blockId: number): ConnectorRef => ({ kind: 'block-output', blockId });
const w = (ref: ConnectorRef, invert = false): WireIn => ({ ref, invert });
const X: WireIn = { ref: { kind: 'x' } };
const sec = (s: number) => ({ base: 's' as const, value: Math.round(s * 100) });

const gate = (id: number, type: BlockType, pins: WireIn[]): LogoBlock => ({
  id,
  type,
  inputs: type === 'NOT' ? { '1': pins[0] ?? X } : type === 'XOR' ? { '1': pins[0] ?? X, '2': pins[1] ?? X } : { '1': pins[0] ?? X, '2': pins[1] ?? X, '3': pins[2] ?? X, '4': pins[3] ?? X },
  params: {},
  retentive: false,
});

const toQ = (index: number, source: ConnectorRef) => ({ target: { kind: 'digital-output' as const, index }, source });
const toM = (index: number, source: ConnectorRef) => ({ target: { kind: 'digital-flag' as const, index }, source });

function start(program: LogoProgram): LogoCpu {
  const compiled = compileProgram(program);
  expect(compiled.diagnostics.map((d) => d.message)).toEqual([]);
  const cpu = new LogoCpu(compiled);
  cpu.start();
  return cpu;
}

const levels = (...high: number[]): Bit[] => Array.from({ length: 24 }, (_, i): Bit => (high.includes(i + 1) ? 1 : 0));
const q = (cpu: LogoCpu, index: number): Bit => cpu.readOutputs()[index - 1] ?? 0;

/** Truth table of one 4-input GF over all 16 input rows (row bits: input 1 is the MSB, as in the manual). */
function truthTable(type: BlockType): Bit[] {
  const out: Bit[] = [];
  for (let row = 0; row < 16; row++) {
    const pins = [3, 2, 1, 0].map((shift): Bit => ((row >> shift) & 1 ? 1 : 0));
    out.push(stepBlock(gate(1, type, []), pins, INITIAL_BLOCK_STATE, 0).q);
  }
  return out;
}

// ---- basic functions (spec §4.2) -----------------------------------------------------------------

describe('basic functions', () => {
  it('AND and OR match the manual truth tables; NAND and NOR are their complements', () => {
    expect(truthTable('AND')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(truthTable('OR')).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(truthTable('NAND')).toEqual(truthTable('AND').map((bit) => (bit ? 0 : 1)));
    expect(truthTable('NOR')).toEqual(truthTable('OR').map((bit) => (bit ? 0 : 1)));
  });

  it('XOR and NOT', () => {
    const xor = (a: Bit, b: Bit) => stepBlock(gate(1, 'XOR', []), [a, b], INITIAL_BLOCK_STATE, 0).q;
    expect([xor(0, 0), xor(0, 1), xor(1, 0), xor(1, 1)]).toEqual([0, 1, 1, 0]);
    expect(stepBlock(gate(1, 'NOT', []), [1], INITIAL_BLOCK_STATE, 0).q).toBe(0);
    expect(stepBlock(gate(1, 'NOT', []), [0], INITIAL_BLOCK_STATE, 0).q).toBe(1);
  });

  it('resolves open connectors per block: x = 1 for AND, x = 0 for OR', () => {
    const cpu = start({
      name: 'X',
      blocks: [gate(1, 'AND', [w(I(1))]), gate(2, 'OR', [w(I(1))])],
      sinks: [toQ(1, B(1)), toQ(2, B(2))],
    });
    cpu.scan(0, levels(1));
    expect([q(cpu, 1), q(cpu, 2)]).toEqual([1, 1]);
    cpu.scan(10, levels());
    expect([q(cpu, 1), q(cpu, 2)]).toEqual([0, 0]);
  });

  it('AND with edge evaluation pulses for exactly one cycle; NAND-edge fires on the falling side', () => {
    const cpu = start({
      name: 'EDGE',
      blocks: [gate(1, 'AND_EDGE', [w(I(1)), w(I(2))]), gate(2, 'NAND_EDGE', [w(I(1)), w(I(2))])],
      sinks: [toQ(1, B(1)), toQ(2, B(2))],
    });
    cpu.scan(0, levels(1));
    expect(q(cpu, 1)).toBe(0);
    cpu.scan(10, levels(1, 2));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(20, levels(1, 2));
    expect(q(cpu, 1)).toBe(0);
    expect(q(cpu, 2)).toBe(0);
    cpu.scan(30, levels(1));
    expect(q(cpu, 2)).toBe(1);
    cpu.scan(40, levels(1));
    expect(q(cpu, 2)).toBe(0);
  });

  it('inverts per consumer, never on the shared source', () => {
    const cpu = start({
      name: 'INV',
      blocks: [gate(1, 'OR', [w(I(1), true)]), gate(2, 'OR', [w(I(1))])],
      sinks: [toQ(1, B(1)), toQ(2, B(2))],
    });
    cpu.scan(0, levels(1));
    expect([q(cpu, 1), q(cpu, 2)]).toEqual([0, 1]);
  });
});

// ---- scan cycle (spec §3.3) ----------------------------------------------------------------------

describe('scan cycle', () => {
  it('double-buffers flags: NOT M1 -> M1 toggles exactly once per scan (Appendix B oscillator)', () => {
    const cpu = start({ name: 'OSC', blocks: [gate(1, 'NOT', [w(M(1))])], sinks: [toM(1, B(1)), toQ(1, M(1))] });
    const seen: Bit[] = [];
    for (let k = 0; k < 6; k++) {
      cpu.scan(k * 10, levels());
      seen.push(cpu.readFlags()[0] ?? 0);
    }
    expect(seen).toEqual([1, 0, 1, 0, 1, 0]);
    // Q1 reads M1 inside the cycle, so it lags the flag by one scan.
    expect(q(cpu, 1)).toBe(1);
  });

  it('holds M8 at 1 for the first cycle after RUN only', () => {
    const cpu = start({ name: 'M8', blocks: [gate(1, 'OR', [w(M(8))])], sinks: [toQ(1, B(1))] });
    cpu.scan(0, levels());
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(10, levels());
    expect(q(cpu, 1)).toBe(0);
    cpu.stop();
    cpu.start();
    cpu.scan(20, levels());
    expect(q(cpu, 1)).toBe(1);
  });

  it('reads a Q back with its previous-cycle value', () => {
    const cpu = start({ name: 'RB', blocks: [gate(1, 'OR', [w(I(1))]), gate(2, 'OR', [w(Q(1))])], sinks: [toQ(1, B(1)), toQ(2, B(2))] });
    cpu.scan(0, levels(1));
    expect([q(cpu, 1), q(cpu, 2)]).toEqual([1, 0]);
    cpu.scan(10, levels(1));
    expect([q(cpu, 1), q(cpu, 2)]).toEqual([1, 1]);
  });

  it('forces every output off in STOP and does not scan', () => {
    const cpu = start({ name: 'S', blocks: [gate(1, 'OR', [w(I(1))])], sinks: [toQ(1, B(1))] });
    cpu.scan(0, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.stop();
    expect(q(cpu, 1)).toBe(0);
    expect(cpu.scan(10, levels(1))).toBe(false);
  });
});

// ---- special functions (spec §4.4) ---------------------------------------------------------------

function sf(type: BlockType, inputs: LogoBlock['inputs'], params: LogoBlock['params'], retentive = false): LogoBlock {
  return { id: 1, type, inputs, params, retentive };
}
const one = (block: LogoBlock): LogoProgram => ({ name: 'SF', blocks: [block], sinks: [toQ(1, B(1))] });

describe('timers', () => {
  it('on-delay: Q after T of continuous Trg; a short pulse resets Ta', () => {
    const cpu = start(one(sf('ON_DELAY', { Trg: w(I(1)) }, { T: sec(1) })));
    cpu.scan(0, levels(1));
    cpu.scan(500, levels(1));
    cpu.scan(600, levels());
    cpu.scan(700, levels(1));
    cpu.scan(1600, levels(1));
    expect(q(cpu, 1)).toBe(0);
    cpu.scan(1700, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(1710, levels());
    expect(q(cpu, 1)).toBe(0);
  });

  it('off-delay: sets immediately, clears T after Trg falls, R wins', () => {
    const cpu = start(one(sf('OFF_DELAY', { Trg: w(I(1)), R: w(I(2)) }, { T: sec(2) })));
    cpu.scan(0, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(100, levels());
    cpu.scan(2000, levels());
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(2100, levels());
    expect(q(cpu, 1)).toBe(0);
    cpu.scan(2200, levels(1));
    cpu.scan(2300, levels(1, 2));
    expect(q(cpu, 1)).toBe(0);
  });

  it('on-/off-delay debounces in both directions', () => {
    const cpu = start(one(sf('ON_OFF_DELAY', { Trg: w(I(1)) }, { TH: sec(1), TL: sec(1) })));
    cpu.scan(0, levels(1));
    cpu.scan(1000, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(1100, levels());
    cpu.scan(1600, levels());
    cpu.scan(1700, levels(1)); // back before TL: off-delay cancelled
    cpu.scan(3000, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(3100, levels());
    cpu.scan(4100, levels());
    expect(q(cpu, 1)).toBe(0);
  });

  it('retentive on-delay runs to completion after a single edge until R', () => {
    const cpu = start(one(sf('RETENTIVE_ON_DELAY', { Trg: w(I(1)), R: w(I(2)) }, { T: sec(1) })));
    cpu.scan(0, levels(1));
    cpu.scan(100, levels()); // Trg released: the timer keeps running
    cpu.scan(900, levels());
    expect(q(cpu, 1)).toBe(0);
    cpu.scan(1000, levels());
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(1100, levels(2));
    expect(q(cpu, 1)).toBe(0);
  });

  it('wiping relay: pulse of T, aborted early when Trg falls', () => {
    const cpu = start(one(sf('WIPING_RELAY', { Trg: w(I(1)) }, { T: sec(1) })));
    cpu.scan(0, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(1000, levels(1));
    expect(q(cpu, 1)).toBe(0);
    cpu.scan(1100, levels());
    cpu.scan(1200, levels(1));
    expect(q(cpu, 1)).toBe(1);
    cpu.scan(1300, levels());
    expect(q(cpu, 1)).toBe(0);
  });

  it('asynchronous pulse generator free-runs TH/TL while En; Inv inverts only while enabled', () => {
    const cpu = start(one(sf('PULSE_GENERATOR', { En: w(I(1)), Inv: w(I(2)) }, { TH: sec(0.5), TL: sec(0.3) })));
    const trace: Bit[] = [];
    for (let t = 0; t <= 1600; t += 100) {
      cpu.scan(t, levels(1));
      trace.push(q(cpu, 1));
    }
    expect(trace).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1]);
    cpu.scan(1700, levels(1, 2));
    expect(q(cpu, 1)).toBe(0);
    cpu.scan(1800, levels(2));
    expect(q(cpu, 1)).toBe(0);
  });

  it('stairway switch: off at T with a T!L pre-warning blink T! before expiry; retriggers', () => {
    const cpu = start(one(sf('STAIRWAY', { Trg: w(I(1)) }, { T: sec(30), 'T!': sec(5), 'T!L': sec(1) })));
    const at = (ms: number, high = false): Bit => {
      cpu.scan(ms, high ? levels(1) : levels());
      return q(cpu, 1);
    };
    expect(at(0, true)).toBe(1);
    expect(at(24_900)).toBe(1);
    expect(at(25_500)).toBe(0); // pre-warning window [25 s, 26 s)
    expect(at(26_000)).toBe(1);
    expect(at(29_900)).toBe(1);
    expect(at(30_000)).toBe(0);
    expect(at(30_100, true)).toBe(1);
    expect(at(50_000)).toBe(1);
    expect(at(50_100, true)).toBe(1); // retrigger restarts Ta
    expect(at(75_000)).toBe(1);
  });

  it('formats literals in the device notation', () => {
    expect(formatTime(sec(30))).toBe('30:00s');
    expect(formatTime({ base: 'm', value: 6 * 60 })).toBe('06:00m');
    expect(toMs({ base: 'h', value: 90 })).toBe(90 * 60_000);
  });
});

describe('counter and bistables', () => {
  it('up/down counter counts edges and applies the On >= Off hysteresis rule', () => {
    const cpu = start(one(sf('UP_DOWN_COUNTER', { R: w(I(1)), Cnt: w(I(2)), Dir: w(I(3)) }, { On: 3, Off: 1 })));
    let t = 0;
    const pulse = (...extra: number[]) => {
      cpu.scan((t += 10), levels(2, ...extra));
      cpu.scan((t += 10), levels(...extra));
    };
    pulse();
    pulse();
    expect(q(cpu, 1)).toBe(0);
    pulse();
    expect([cpu.blockState(1).cnt, q(cpu, 1)]).toEqual([3, 1]);
    pulse(3); // down to 2: still >= Off
    expect([cpu.blockState(1).cnt, q(cpu, 1)]).toEqual([2, 1]);
    pulse(3);
    pulse(3); // 0 < Off
    expect([cpu.blockState(1).cnt, q(cpu, 1)]).toEqual([0, 0]);
    pulse();
    cpu.scan((t += 10), levels(1));
    expect(cpu.blockState(1).cnt).toBe(0);
  });

  it('latching relay: reset dominates', () => {
    const block = sf('LATCHING_RELAY', { S: w(I(1)), R: w(I(2)) }, {});
    const next = (prev: Bit, s: Bit, r: Bit) => stepBlock(block, [s, r], { ...INITIAL_BLOCK_STATE, q: prev }, 0).q;
    expect([next(0, 0, 0), next(1, 0, 0), next(1, 0, 1), next(0, 1, 0), next(0, 1, 1)]).toEqual([0, 1, 0, 1, 0]);
  });

  it('pulse relay reproduces the full manual status table', () => {
    // [Par, Qn-1, S, R, Trg edge] -> Qn
    const rows: Array<[('RS' | 'SR'), Bit, Bit, Bit, boolean, Bit]> = [];
    for (const par of ['RS', 'SR'] as const) {
      for (const prev of [0, 1] as const) {
        rows.push([par, prev, 0, 0, false, prev], [par, prev, 0, 0, true, prev ? 0 : 1]);
        rows.push([par, prev, 0, 1, false, 0], [par, prev, 0, 1, true, 0]);
        rows.push([par, prev, 1, 0, false, 1], [par, prev, 1, 0, true, 1]);
        rows.push([par, prev, 1, 1, false, par === 'SR' ? 1 : 0], [par, prev, 1, 1, true, par === 'SR' ? 1 : 0]);
      }
    }
    for (const [par, prev, s, r, edge, expected] of rows) {
      const block = sf('PULSE_RELAY', { Trg: X, S: X, R: X }, { Par: par });
      const pins: Bit[] = [edge ? 1 : 0, s, r];
      expect(stepBlock(block, pins, { ...INITIAL_BLOCK_STATE, q: prev, prev: 0 }, 0).q).toBe(expected);
    }
  });

  it('pulse relay with Trg = lo and Par = RS degenerates to the latching relay', () => {
    const pulse = sf('PULSE_RELAY', { Trg: X, S: X, R: X }, { Par: 'RS' });
    const latch = sf('LATCHING_RELAY', { S: X, R: X }, {});
    for (const prev of [0, 1] as const) {
      for (const s of [0, 1] as const) {
        for (const r of [0, 1] as const) {
          const state = { ...INITIAL_BLOCK_STATE, q: prev };
          expect(stepBlock(pulse, [0, s, r], state, 0).q).toBe(stepBlock(latch, [s, r], state, 0).q);
        }
      }
    }
  });
});

// ---- retentivity (spec §1.4, §3.4) ---------------------------------------------------------------

describe('retentivity', () => {
  it('keeps retentive block state across a power cycle and drops the rest', () => {
    const program: LogoProgram = {
      name: 'REM',
      blocks: [
        { id: 1, type: 'LATCHING_RELAY', inputs: { S: w(I(1)), R: X }, params: {}, retentive: true },
        { id: 2, type: 'LATCHING_RELAY', inputs: { S: w(I(1)), R: X }, params: {}, retentive: false },
      ],
      sinks: [toQ(1, B(1)), toQ(2, B(2))],
    };
    const cpu = start(program);
    cpu.scan(0, levels(1));
    cpu.powerLoss();
    cpu.start();
    cpu.scan(10, levels());
    expect([q(cpu, 1), q(cpu, 2)]).toEqual([1, 0]);
  });
});

// ---- validation and memory (spec §2.3, §3.1) -----------------------------------------------------

describe('program validation', () => {
  const errors = (program: LogoProgram) => compileProgram(program).diagnostics.map((d) => d.message).join('\n');

  it('rejects same-cycle feedback loops between blocks', () => {
    expect(errors({ name: 'L', blocks: [gate(1, 'OR', [w(B(2))]), gate(2, 'OR', [w(B(1))])], sinks: [toQ(1, B(1))] })).toMatch(/Feedback loop/);
  });

  it('rejects partially wired programs and blocks that reach no output', () => {
    const unwired: LogoProgram = { name: 'U', blocks: [{ id: 1, type: 'OFF_DELAY', inputs: { Trg: w(I(1)) }, params: { T: sec(1) }, retentive: false }], sinks: [toQ(1, B(1))] };
    expect(errors(unwired)).toMatch(/input R is not wired/);
    expect(errors({ name: 'O', blocks: [gate(1, 'OR', [w(I(1))])], sinks: [] })).toMatch(/not connected to any output/);
    expect(errors({ name: 'N', blocks: [gate(1, 'NOT', [])], sinks: [toQ(1, B(1))] })).toMatch(/may not be left open/);
  });

  it('allows one driver per connector', () => {
    expect(errors({ name: 'D', blocks: [], sinks: [toQ(1, I(1)), toQ(1, I(2))] })).toMatch(/Q1 is driven more than once/);
  });

  it('enforces the 130-block / 2000-byte / 60-byte REM budget', () => {
    const nots = (count: number): LogoProgram => {
      const blocks = Array.from({ length: count }, (_, i) => gate(i + 1, 'NOT', [w(i === 0 ? I(1) : B(i))]));
      return { name: 'BIG', blocks, sinks: [toQ(1, B(count))] };
    };
    expect(compileProgram(nots(130)).ok).toBe(true);
    expect(errors(nots(131))).toMatch(/Too many blocks: 131 \/ 130/);

    const heavy = Array.from({ length: 84 }, (_, i): LogoBlock => ({
      id: i + 1,
      type: 'UP_DOWN_COUNTER',
      inputs: { R: X, Cnt: w(I(1)), Dir: X },
      params: { On: 1, Off: 0 },
      retentive: i < 13,
    }));
    const usage = measureProgram(heavy);
    expect(usage).toEqual({ bytes: 84 * 24, blocks: 84, rem: 65 });
    expect(usage.bytes).toBeGreaterThan(MEMORY_LIMITS.bytes);
    expect(canAddBlock({ bytes: 1990, blocks: 10, rem: 0 }, 'AND', false)).toBe(false);
    expect(canAddBlock({ bytes: 1990, blocks: 10, rem: 0 }, 'XOR', false)).toBe(true);
    expect(canAddBlock({ bytes: 100, blocks: 10, rem: 58 }, 'ON_DELAY', true)).toBe(false);
    expect(canAddBlock({ bytes: 100, blocks: 10, rem: 58 }, 'ON_DELAY', false)).toBe(true);
  });

  it('prunes blocks disconnected by a rewire', () => {
    const program: LogoProgram = { name: 'P', blocks: [gate(1, 'OR', [w(I(1))]), gate(2, 'AND', [w(B(1))])], sinks: [toQ(1, B(2))] };
    const rewired = rewire(program, { kind: 'sink', index: 0 }, I(3));
    expect(rewired.blocks).toEqual([]);
    expect(pruneOrphans(program)).toBe(program);
  });
});

describe('scenarios and persistence', () => {
  it('every benchmark application compiles within the memory budget', () => {
    for (const scenario of SCENARIO_LIST) {
      const compiled = compileProgram(scenario.program);
      expect(compiled.diagnostics.map((d) => d.message), scenario.id).toEqual([]);
      expect(scenario.inputs).toHaveLength(8);
      expect(scenario.loads).toHaveLength(4);
    }
  });

  it('round-trips a program through the file format and rejects foreign files', () => {
    const program = SCENARIO_LIST[2]?.program;
    if (!program) throw new Error('missing scenario');
    const parsed = parseProgram(serializeProgram(program));
    expect(parsed).toEqual({ ok: true, program });
    expect(parseProgram('{"format":"other"}').ok).toBe(false);
    expect(parseProgram('nope').ok).toBe(false);
  });
});

describe('input stage', () => {
  it('switches on the documented thresholds and holds inside the undefined band', () => {
    const ac = DEVICES['230RC'];
    const dc = DEVICES['12/24RC'];
    expect([classifyInput(30, ac, 1), classifyInput(80, ac, 0), classifyInput(60, ac, 1), classifyInput(60, ac, 0)]).toEqual([0, 1, 1, 0]);
    expect([classifyInput(4, dc, 1), classifyInput(9, dc, 0), classifyInput(24, dc, 0)]).toEqual([0, 1, 1]);
  });
});
