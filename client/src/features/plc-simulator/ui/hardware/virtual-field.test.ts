import { describe, expect, it } from 'vitest';
import { S7_200_CPU224 } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { RemoteRuntime } from '../../remote/remote-runtime';
import { inProcessTransport } from '../../remote/test-utils';
import type { LadderProgram } from '../../domain/ast';
import { createFrameStore } from './frame-store';
import { VirtualField, bitAddress } from './virtual-field';

describe('VirtualField', () => {
  it('drives inputs by bit address and by LOGO! terminal number', () => {
    const field = new VirtualField(16, 10);
    field.writeInput('I0.5', true);
    field.writeInput('I10', true); // terminal 10 == I1.1
    expect(field.getInput(5)).toBe(true);
    expect(field.getInput(9)).toBe(true);
    field.writeInput('i0.5', false);
    expect(field.getInput(5)).toBe(false);
  });

  it('rejects inputs the hardware does not have', () => {
    const field = new VirtualField(14, 10);
    expect(() => field.writeInput('I1.6', true)).toThrow(RangeError);
    expect(() => field.writeInput('I15', true)).toThrow(RangeError);
    expect(() => field.writeInput('Q0.0', true)).toThrow(/not an input/);
  });

  it('notifies only on a real change', () => {
    const field = new VirtualField(8, 4);
    let calls = 0;
    field.subscribe(() => (calls += 1));
    field.setInput(0, true);
    field.setInput(0, true);
    field.toggleInput(0);
    expect(calls).toBe(2);
    expect(field.getRevision()).toBe(2);
  });

  it('feeds the scan cycle and receives the latched outputs', async () => {
    const memory = new MemoryMap(S7_200_CPU224);
    const field = new VirtualField(14, 10);
    const program: LadderProgram = {
      schemaVersion: 1,
      profileId: S7_200_CPU224.id,
      networks: [
        {
          id: 'n',
          grid: { rows: 1, cols: 4 },
          nodes: [
            { id: 'a', type: 'contact', variant: 'NO', operand: 'I0.3', layout: { row: 0, col: 0, rowSpan: 1, colSpan: 1, branchId: null } },
            { id: 'q', type: 'coil', variant: 'OUT', target: 'Q1.1', layout: { row: 0, col: 2, rowSpan: 1, colSpan: 1, branchId: null } },
          ],
          branches: [],
        },
      ],
    };
    const runtime = new RemoteRuntime(memory, program, { fieldIo: field, scheduler: { schedule: () => 0, cancel: () => {} }, clock: () => 0, transport: inProcessTransport });

    field.writeInput('I0.3', true);
    await runtime.step();
    expect(memory.readBit('Q1.1')).toBe(true);
    expect(field.getOutput(9)).toBe(true);
    expect(bitAddress('Q', 9)).toBe('Q1.1');

    field.writeInput('I0.3', false);
    await runtime.step();
    expect(field.getOutput(9)).toBe(false);
  });

  it('masks nothing it should not: clearInputs releases every switch', () => {
    const field = new VirtualField(16, 4);
    field.setInput(3, true);
    field.setInput(12, true);
    field.clearInputs();
    expect([3, 12].some((i) => field.getInput(i))).toBe(false);
  });
});

describe('createFrameStore', () => {
  function manual() {
    let pending: (() => void) | null = null;
    let clock = 0;
    return {
      schedule: (cb: () => void) => {
        pending = cb;
        return () => {
          if (pending === cb) pending = null;
        };
      },
      now: () => clock,
      tick(ms = 16) {
        clock += ms;
        const cb = pending;
        pending = null;
        cb?.();
      },
      get waiting() {
        return pending !== null;
      },
    };
  }

  it('publishes one version for a burst of notifications', () => {
    const sched = manual();
    let notify = (): void => {};
    const store = createFrameStore((n) => ((notify = n), () => {}), { minIntervalMs: 0, ...sched });
    let seen = 0;
    store.subscribe(() => (seen += 1));

    for (let i = 0; i < 500; i++) notify();
    expect(seen).toBe(0);
    sched.tick();
    expect(seen).toBe(1);
    expect(store.getVersion()).toBe(1);
  });

  it('holds back frames faster than the minimum interval', () => {
    const sched = manual();
    let notify = (): void => {};
    const store = createFrameStore((n) => ((notify = n), () => {}), { minIntervalMs: 50, ...sched });
    let seen = 0;
    store.subscribe(() => (seen += 1));

    notify();
    sched.tick(60);
    expect(seen).toBe(1);
    notify();
    sched.tick(16); // only 16 ms since the last publish
    expect(seen).toBe(1);
    sched.tick(40);
    expect(seen).toBe(2);
  });

  it('attaches lazily and detaches when the last listener leaves', () => {
    const sched = manual();
    let attached = 0;
    let detached = 0;
    const store = createFrameStore(() => (attached++, () => void detached++), sched);
    expect(attached).toBe(0);
    const a = store.subscribe(() => {});
    const b = store.subscribe(() => {});
    expect(attached).toBe(1);
    a();
    expect(detached).toBe(0);
    b();
    expect(detached).toBe(1);
    expect(sched.waiting).toBe(false);
  });
});
