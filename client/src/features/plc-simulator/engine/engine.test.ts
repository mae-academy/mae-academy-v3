import { describe, expect, it } from 'vitest';
import type { Branch, LadNode, LadderProgram, Network } from '../domain/ast';
import { S7_200_CPU224 } from '../domain/hardware';
import { MemoryMap } from '../domain/memory';
import { PlcRuntime } from './plc-runtime';
import type { FieldIoAdapter, Scheduler } from './types';

// ---- AST builders ------------------------------------------------------------------------------

const at = (row: number, col: number, branchId: string | null = null, rowSpan = 1) => ({
  row,
  col,
  rowSpan,
  colSpan: 1,
  branchId,
});

const contact = (id: string, operand: string, row: number, col: number, branchId: string | null = null, variant: 'NO' | 'NC' | 'P' | 'N' = 'NO'): LadNode => ({
  id,
  type: 'contact',
  variant,
  operand,
  layout: at(row, col, branchId),
});

const coil = (id: string, target: string, row: number, col: number): LadNode => ({
  id,
  type: 'coil',
  variant: 'OUT',
  target,
  layout: at(row, col),
});

const network = (id: string, nodes: LadNode[], branches: Branch[] = []): Network => ({
  id,
  grid: { rows: 8, cols: 10 },
  nodes,
  branches,
});

class Field implements FieldIoAdapter {
  readonly inputs = new Uint8Array(2);
  readonly outputs = new Uint8Array(2);

  sampleInputs(image: Uint8Array): void {
    image.set(this.inputs);
  }
  commitOutputs(image: Uint8Array): void {
    this.outputs.set(image);
  }
  setBit(byte: number, bit: number, value: boolean): void {
    const current = this.inputs[byte] ?? 0;
    this.inputs[byte] = value ? current | (1 << bit) : current & ~(1 << bit) & 0xff;
  }
}

/** Scheduler whose callbacks only fire when the test says so. */
class ManualScheduler implements Scheduler {
  private queue = new Map<number, () => void>();
  private next = 1;

  schedule(callback: () => void): number {
    const handle = this.next++;
    this.queue.set(handle, callback);
    return handle;
  }
  cancel(handle: number): void {
    this.queue.delete(handle);
  }
  /** Fires everything currently queued. */
  flush(): number {
    const due = Array.from(this.queue.values());
    this.queue.clear();
    for (const callback of due) callback();
    return due.length;
  }
  get pending(): number {
    return this.queue.size;
  }
}

function harness(networks: Network[], stepDeltaMs = 100) {
  const memory = new MemoryMap(S7_200_CPU224);
  const field = new Field();
  const scheduler = new ManualScheduler();
  let clockMs = 0;
  const program: LadderProgram = { schemaVersion: 1, profileId: S7_200_CPU224.id, networks };
  const runtime = new PlcRuntime(memory, program, {
    fieldIo: field,
    scheduler,
    clock: () => clockMs,
    stepDeltaMs,
    targetScanMs: 10,
  });
  return {
    memory,
    field,
    runtime,
    scheduler,
    advance: (ms: number) => {
      clockMs += ms;
    },
    get clockMs() {
      return clockMs;
    },
  };
}

// ---- tests -------------------------------------------------------------------------------------

describe('compiler', () => {
  it('reports addresses the profile cannot represent', () => {
    const h = harness([network('n1', [contact('c1', 'I1.6', 0, 0), coil('q1', 'Q0.0', 0, 3)])]);
    const compiled = h.runtime.compiled;
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics[0]?.code).toBe('ADDRESS_OUT_OF_RANGE');
    expect(h.runtime.run()).toBe(false);
    expect(h.runtime.mode).toBe('STOP');
  });

  it('rejects two boxes sharing one timer instance', () => {
    const timer = (id: string, row: number): LadNode => ({
      id,
      type: 'timer',
      fn: 'TON',
      instance: 'T37',
      timeBaseMs: 100,
      inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: 5 } },
      outputs: {},
      layout: at(row, 1),
    });
    const h = harness([network('n1', [timer('t1', 0)]), network('n2', [timer('t2', 0)])]);
    expect(h.runtime.compiled.diagnostics.some((d) => d.code === 'DUPLICATE_INSTANCE')).toBe(true);
  });
});

describe('power flow', () => {
  it('passes a series contact through to its coil', () => {
    const h = harness([network('n1', [contact('c1', 'I0.0', 0, 0), coil('q1', 'Q0.0', 0, 3)])]);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false);

    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true);
    // Phase D published the image to the field.
    expect(h.field.outputs[0]).toBe(0b1);
  });

  it('ORs parallel lanes and ANDs the result with the rest of the rung', () => {
    const branch: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 0, rowStart: 0, rowEnd: 1 };
    const h = harness([
      network(
        'n1',
        [
          contact('a', 'I0.0', 0, 0, 'b1'),
          contact('b', 'I0.1', 1, 0, 'b1'),
          contact('gate', 'I0.2', 0, 1),
          coil('q', 'Q0.0', 0, 4),
        ],
        [branch],
      ),
    ]);

    // Neither lane conducts.
    h.field.setBit(0, 2, true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false);

    // Lower lane alone is enough.
    h.field.setBit(0, 1, true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true);

    // The series gate still has to agree.
    h.field.setBit(0, 2, false);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false);
  });

  it('nests a parallel group inside a parallel lane', () => {
    const outer: Branch = { id: 'b1', parentId: null, splitCol: 0, mergeCol: 2, rowStart: 0, rowEnd: 2 };
    const inner: Branch = { id: 'b2', parentId: 'b1', splitCol: 1, mergeCol: 1, rowStart: 1, rowEnd: 2 };
    const h = harness([
      network(
        'n1',
        [
          contact('top', 'I0.0', 0, 0, 'b1'),
          contact('mid', 'I0.1', 1, 0, 'b1'), // lane 1: I0.1 AND (I0.2 OR I0.3)
          contact('innerA', 'I0.2', 1, 1, 'b2'),
          contact('innerB', 'I0.3', 2, 1, 'b2'),
          coil('q', 'Q0.0', 0, 5),
        ],
        [outer, inner],
      ),
    ]);

    h.field.setBit(0, 1, true); // mid only: inner group is open
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false);

    h.field.setBit(0, 3, true); // inner lower lane closes
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true);
  });

  it('writes every coil on a rung even after the flow collapses', () => {
    const h = harness([
      network('n1', [coil('q1', 'Q0.0', 0, 1), contact('c', 'I0.0', 0, 2), coil('q2', 'Q0.1', 0, 3)]),
    ]);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true); // fed directly by the left rail
    expect(h.memory.readBit('Q0.1')).toBe(false); // gated by the open contact
  });
});

describe('contacts', () => {
  it('detects rising and falling edges across scans', () => {
    const h = harness([
      network('n1', [contact('p', 'I0.0', 0, 0, null, 'P'), coil('qp', 'Q0.0', 0, 2)]),
      network('n2', [contact('n', 'I0.0', 0, 0, null, 'N'), coil('qn', 'Q0.1', 0, 2)]),
    ]);

    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false);

    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true); // one scan only
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false);

    h.field.setBit(0, 0, false);
    h.runtime.step();
    expect(h.memory.readBit('Q0.1')).toBe(true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.1')).toBe(false);
  });
});

describe('timers', () => {
  const tonNetwork = (fn: 'TON' | 'TOF' | 'TONR', timeBaseMs: 1 | 10 | 100, preset: number): Network =>
    network('n1', [
      contact('in', 'I0.0', 0, 0),
      {
        id: 'timer',
        type: 'timer',
        fn,
        instance: 'T37',
        timeBaseMs,
        inputs: { IN: { kind: 'flow' }, PT: { kind: 'constant', value: preset } },
        outputs: { ET: 'VW10' },
        layout: at(0, 1),
      },
    ]);

  it('TON delays the output and clears on falling IN', () => {
    const h = harness([tonNetwork('TON', 100, 5)]); // 5 x 100 ms = 500 ms
    h.field.setBit(0, 0, true);

    for (let i = 0; i < 4; i++) h.runtime.step(); // 400 ms
    expect(h.memory.read('T37')).toBe(4);
    expect(h.memory.readBit('T37')).toBe(false);

    h.runtime.step(); // 500 ms
    expect(h.memory.readBit('T37')).toBe(true);
    expect(h.memory.read('VW10')).toBe(5);

    h.field.setBit(0, 0, false);
    h.runtime.step();
    expect(h.memory.readBit('T37')).toBe(false);
    expect(h.memory.read('T37')).toBe(0);
  });

  it('TOF holds the output until the off-delay expires', () => {
    const h = harness([tonNetwork('TOF', 100, 3)]);
    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(h.memory.readBit('T37')).toBe(true); // follows IN immediately

    h.field.setBit(0, 0, false);
    h.runtime.step();
    h.runtime.step();
    expect(h.memory.readBit('T37')).toBe(true); // 200 ms into a 300 ms delay
    h.runtime.step();
    expect(h.memory.readBit('T37')).toBe(false);
    expect(h.memory.read('T37')).toBe(3);
  });

  it('TONR retains the accumulator and clears only on an R coil', () => {
    const net = tonNetwork('TONR', 100, 4);
    const withReset: Network = {
      ...net,
      nodes: [...net.nodes],
    };
    const h = harness([
      withReset,
      network('n2', [
        contact('rst', 'I0.1', 0, 0),
        { id: 'r', type: 'coil', variant: 'RESET', target: 'T37', count: 1, layout: at(0, 2) },
      ]),
    ]);

    h.field.setBit(0, 0, true);
    h.runtime.step();
    h.runtime.step();
    expect(h.memory.read('T37')).toBe(2);

    h.field.setBit(0, 0, false); // retentive: value survives IN dropping
    h.runtime.step();
    expect(h.memory.read('T37')).toBe(2);

    h.field.setBit(0, 0, true);
    h.runtime.step();
    h.runtime.step();
    expect(h.memory.readBit('T37')).toBe(true); // 4 ticks reached

    h.field.setBit(0, 1, true); // explicit reset
    h.runtime.step();
    expect(h.memory.read('T37')).toBe(0);
    expect(h.memory.readBit('T37')).toBe(false);
  });

  it('services a 10 ms timer in Phase C, one scan behind the box', () => {
    const h = harness([tonNetwork('TON', 10, 2)], 10); // 2 x 10 ms = 20 ms
    h.field.setBit(0, 0, true);

    h.runtime.step(); // Phase B latches, Phase C advances to 1 tick
    expect(h.memory.read('T37')).toBe(1);
    h.runtime.step();
    expect(h.memory.read('T37')).toBe(2);
    expect(h.memory.readBit('T37')).toBe(true);
  });
});

describe('counters', () => {
  const counterNetwork = (fn: 'CTU' | 'CTD' | 'CTUD', preset: number): Network => {
    const inputs =
      fn === 'CTU'
        ? { CU: { kind: 'flow' as const }, R: { kind: 'flow' as const }, PV: { kind: 'constant' as const, value: preset } }
        : fn === 'CTD'
          ? { CD: { kind: 'flow' as const }, LD: { kind: 'flow' as const }, PV: { kind: 'constant' as const, value: preset } }
          : {
              CU: { kind: 'flow' as const },
              CD: { kind: 'flow' as const },
              R: { kind: 'flow' as const },
              PV: { kind: 'constant' as const, value: preset },
            };
    return network('n1', [
      contact('cu', 'I0.0', 0, 0),
      contact('second', 'I0.1', 1, 0),
      contact('third', 'I0.2', 2, 0),
      // rowSpan covers the box's pins: CU/R for CTU, CU/CD/R for CTUD
      { id: 'ctr', type: 'counter', fn, instance: 'C0', inputs, outputs: { CV: 'VW20' }, layout: at(0, 1, null, 3) } as LadNode,
    ]);
  };

  it('CTU counts rising edges and resets on R', () => {
    const h = harness([counterNetwork('CTU', 2)]);

    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(h.memory.readSigned('C0')).toBe(1);

    h.runtime.step(); // level held: no second count
    expect(h.memory.readSigned('C0')).toBe(1);

    h.field.setBit(0, 0, false);
    h.runtime.step();
    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(h.memory.readSigned('C0')).toBe(2);
    expect(h.memory.readBit('C0')).toBe(true); // CV >= PV
    expect(h.memory.read('VW20')).toBe(2);

    h.field.setBit(0, 1, true); // R dominates
    h.runtime.step();
    expect(h.memory.readSigned('C0')).toBe(0);
    expect(h.memory.readBit('C0')).toBe(false);
  });

  it('CTD loads the preset and stops at zero', () => {
    const h = harness([counterNetwork('CTD', 2)]);

    h.field.setBit(0, 1, true); // LD
    h.runtime.step();
    expect(h.memory.readSigned('C0')).toBe(2);
    h.field.setBit(0, 1, false);

    for (let i = 0; i < 3; i++) {
      h.field.setBit(0, 0, true);
      h.runtime.step();
      h.field.setBit(0, 0, false);
      h.runtime.step();
    }
    expect(h.memory.readSigned('C0')).toBe(0);
    expect(h.memory.readBit('C0')).toBe(true); // CV <= 0
  });

  it('CTUD counts both directions and can go negative', () => {
    const h = harness([counterNetwork('CTUD', 1)]);

    const pulse = (bit: number) => {
      h.field.setBit(0, bit, true);
      h.runtime.step();
      h.field.setBit(0, bit, false);
      h.runtime.step();
    };

    pulse(0); // CU
    expect(h.memory.readSigned('C0')).toBe(1);
    expect(h.memory.readBit('C0')).toBe(true);

    pulse(1); // CD
    pulse(1);
    expect(h.memory.readSigned('C0')).toBe(-1);
    expect(h.memory.readBit('C0')).toBe(false);

    h.field.setBit(0, 2, true); // R
    h.runtime.step();
    expect(h.memory.readSigned('C0')).toBe(0);
  });
});

describe('box instructions', () => {
  it('adds, compares and reports division by zero', () => {
    const h = harness([
      network('n1', [
        {
          id: 'add',
          type: 'math',
          fn: 'ADD',
          dataType: 'INT',
          in1: { kind: 'address', address: 'VW0' },
          in2: { kind: 'constant', value: 5 },
          out: 'VW2',
          eno: 'M0.0',
          layout: at(0, 0),
        },
      ]),
      network('n2', [
        {
          id: 'cmp',
          type: 'compare',
          op: '>=',
          dataType: 'INT',
          lhs: { kind: 'address', address: 'VW2' },
          rhs: { kind: 'constant', value: 10 },
          layout: at(0, 0),
        },
        coil('q', 'Q0.0', 0, 2),
      ]),
    ]);

    h.memory.write('VW0', 3, 'io');
    h.runtime.step();
    expect(h.memory.readSigned('VW2')).toBe(8);
    expect(h.memory.readBit('Q0.0')).toBe(false);
    expect(h.memory.readBit('M0.0')).toBe(true); // ENO

    h.memory.write('VW0', 20, 'io');
    h.runtime.step();
    expect(h.memory.readSigned('VW2')).toBe(25);
    expect(h.memory.readBit('Q0.0')).toBe(true);
  });

  it('leaves the destination untouched on a divide by zero and drops ENO', () => {
    const h = harness([
      network('n1', [
        {
          id: 'div',
          type: 'math',
          fn: 'DIV',
          dataType: 'INT',
          in1: { kind: 'constant', value: 100 },
          in2: { kind: 'address', address: 'VW0' },
          out: 'VW2',
          eno: 'M0.0',
          layout: at(0, 0),
        },
      ]),
    ]);

    h.memory.write('VW2', 42, 'io');
    const report = h.runtime.step();
    expect(h.memory.readSigned('VW2')).toBe(42);
    expect(h.memory.readBit('M0.0')).toBe(false);
    expect(report?.statusFlags.divideByZero).toBe(true);
    expect(report?.diagnostics.some((d) => d.code === 'DIVIDE_BY_ZERO')).toBe(true);
  });

  it('round-trips a REAL through memory', () => {
    const h = harness([
      network('n1', [
        {
          id: 'sqr',
          type: 'math',
          fn: 'SQR',
          dataType: 'REAL',
          in: { kind: 'constant', value: 2 },
          out: 'VD4',
          layout: at(0, 0),
        },
      ]),
    ]);
    h.runtime.step();
    const bits = h.memory.read('VD4');
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, bits);
    expect(view.getFloat32(0)).toBeCloseTo(Math.SQRT2, 6);
  });

  it('masks word logic to the declared width', () => {
    const h = harness([
      network('n1', [
        {
          id: 'and',
          type: 'wordLogic',
          fn: 'W_AND',
          width: 'WORD',
          in1: { kind: 'address', address: 'VW0' },
          in2: { kind: 'constant', value: 0x00ff },
          out: 'VW2',
          layout: at(0, 0),
        },
      ]),
    ]);
    h.memory.write('VW0', 0xabcd, 'io');
    h.runtime.step();
    expect(h.memory.read('VW2')).toBe(0x00cd);
  });
});

describe('master control relay', () => {
  it('forces coils inside a de-energised zone off but retains S/R state', () => {
    const h = harness([
      network('n1', [
        contact('mcrIn', 'I0.0', 0, 0),
        { id: 'mcr', type: 'coil', variant: 'MASTER', mode: 'begin', layout: at(0, 2) },
      ]),
      network('n2', [
        contact('drive', 'I0.1', 0, 0),
        coil('q', 'Q0.0', 0, 2),
        { id: 'set', type: 'coil', variant: 'SET', target: 'M1.0', count: 1, layout: at(0, 3) },
      ]),
      network('n3', [{ id: 'mcre', type: 'coil', variant: 'MASTER', mode: 'end', layout: at(0, 0) }]),
    ]);

    h.field.setBit(0, 0, true); // zone energised
    h.field.setBit(0, 1, true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true);
    expect(h.memory.readBit('M1.0')).toBe(true);

    h.field.setBit(0, 0, false); // zone drops
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(false); // forced off
    expect(h.memory.readBit('M1.0')).toBe(true); // retained
  });

  it('flags a zone left open at the end of the scan', () => {
    const h = harness([
      network('n1', [{ id: 'mcr', type: 'coil', variant: 'MASTER', mode: 'begin', layout: at(0, 0) }]),
    ]);
    const report = h.runtime.step();
    expect(report?.diagnostics.some((d) => d.code === 'MCR_UNBALANCED')).toBe(true);
  });
});

describe('mode machine', () => {
  const simple = () => harness([network('n1', [contact('c', 'I0.0', 0, 0), coil('q', 'Q0.0', 0, 2)])]);

  it('scans only while in RUN and de-energises outputs on STOP', () => {
    const h = simple();
    h.field.setBit(0, 0, true);

    expect(h.runtime.run()).toBe(true);
    expect(h.runtime.mode).toBe('RUN');
    h.scheduler.flush();
    expect(h.memory.readBit('Q0.0')).toBe(true);
    const afterFirst = h.runtime.metrics?.cycle ?? 0;
    expect(afterFirst).toBeGreaterThan(0);

    h.runtime.pause();
    expect(h.runtime.mode).toBe('PAUSE');
    expect(h.scheduler.flush()).toBe(0); // nothing queued while paused
    expect(h.runtime.metrics?.cycle).toBe(afterFirst);

    h.runtime.stop();
    expect(h.runtime.mode).toBe('STOP');
    expect(h.memory.readBit('Q0.0')).toBe(false);
    expect(h.field.outputs[0]).toBe(0);
  });

  it('single step runs exactly one scan and settles in PAUSE', () => {
    const h = simple();
    const modes: string[] = [];
    h.runtime.subscribe((event) => {
      if (event.type === 'mode') modes.push(event.mode);
    });

    h.runtime.step();
    expect(h.runtime.mode).toBe('PAUSE');
    expect(h.runtime.metrics?.cycle).toBe(1);
    expect(modes).toEqual(['SINGLE_STEP', 'PAUSE']);

    h.runtime.step();
    expect(h.runtime.metrics?.cycle).toBe(2);
  });

  it('advances simulated time by stepDeltaMs regardless of wall time', () => {
    const h = simple();
    h.advance(9999); // operator thinking time must not reach the timers
    const report = h.runtime.step();
    expect(report?.metrics.deltaMs).toBe(100);
  });

  it('catches up at most maxCatchUpScans when the scheduler oversleeps', () => {
    const h = simple();
    h.runtime.run();
    h.scheduler.flush();
    const before = h.runtime.metrics?.cycle ?? 0;

    h.advance(1000); // a full second of missed scans at a 10 ms target
    h.scheduler.flush();
    const executed = (h.runtime.metrics?.cycle ?? 0) - before;
    expect(executed).toBeLessThanOrEqual(4);
  });

  it('reset clears memory and returns to STOP', () => {
    const h = simple();
    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(h.memory.readBit('Q0.0')).toBe(true);

    h.runtime.reset();
    expect(h.runtime.mode).toBe('STOP');
    expect(h.memory.readBit('Q0.0')).toBe(false);
    expect(h.runtime.metrics).toBeNull();
  });
});

describe('process image', () => {
  it('latches inputs once per scan and masks points the CPU does not expose', () => {
    const h = harness([network('n1', [contact('c', 'I1.5', 0, 0), coil('q', 'Q0.0', 0, 2)])]);

    h.field.inputs[1] = 0xff; // includes I1.6/I1.7, which CPU 224 does not have
    h.runtime.step();
    expect(h.memory.readBit('I1.5')).toBe(true);
    expect(h.memory.read('IB1')).toBe(0x3f); // 14 points => top two bits masked off
    expect(h.memory.readBit('Q0.0')).toBe(true);
  });

  it('emits one memory version per scan', () => {
    const h = harness([network('n1', [contact('c', 'I0.0', 0, 0), coil('q', 'Q0.0', 0, 2)])]);
    let batches = 0;
    h.memory.subscribe(() => {
      batches += 1;
    });

    h.field.setBit(0, 0, true);
    h.runtime.step();
    expect(batches).toBe(1);
  });
});
