import { describe, expect, it } from 'vitest';
import { PlcEngineError, type PlcTransport } from '@/services/plcClient';
import { PlcRuntime } from '../../../../../api/_lib/plc/engine/plc-runtime';
import { MemoryMap as ServerMemory } from '../../../../../api/_lib/plc/domain/memory';
import { S7_200_CPU224 } from '../domain/hardware';
import { MemoryMap } from '../domain/memory';
import type { PlcEvent } from '../engine/types';
import { VirtualField } from '../ui/hardware/virtual-field';
import { createDemoNetworks } from '../ui/host/demo-program';
import { RemoteRuntime } from './remote-runtime';
import { inProcessTransport } from './test-utils';
import { forEachTreeNode } from './trace';

const inProcess = inProcessTransport;

const program = { schemaVersion: 1 as const, profileId: S7_200_CPU224.id, networks: createDemoNetworks() };
const noTimers = { schedule: () => 0, cancel: () => {} };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RemoteRuntime (single-step) matches the reference PlcRuntime run in-process', () => {
  it('memory image and power-flow trace are identical after every scan', async () => {
    const localMemory = new ServerMemory(S7_200_CPU224);
    const localField = new VirtualField(14, 10);
    const local = new PlcRuntime(localMemory, program, { fieldIo: localField, clock: () => 0, stepDeltaMs: 100, scheduler: noTimers });
    local.enableFlowTrace();

    const remoteMemory = new MemoryMap(S7_200_CPU224);
    const remoteField = new VirtualField(14, 10);
    const remote = new RemoteRuntime(remoteMemory, program, { fieldIo: remoteField, clock: () => 0, stepDeltaMs: 100, scheduler: noTimers, transport: inProcess });
    remote.enableFlowTrace();

    const script: Record<number, [string, boolean]> = { 3: ['I0.0', true], 4: ['I0.0', false], 70: ['I0.1', true], 72: ['I0.1', false] };
    const localRoots = local.compiled.networks.map((n) => n.root);
    const remoteRoots = remote.compiled.networks.map((n) => n.root);

    let alarmSeen = false;
    for (let i = 0; i < 90; i++) {
      const edit = script[i];
      if (edit) {
        localField.writeInput(edit[0], edit[1]);
        remoteField.writeInput(edit[0], edit[1]);
      }
      local.step();
      await remote.step();

      expect(remoteMemory.snapshot(), `memory after scan ${i + 1}`).toEqual(localMemory.snapshot());
      const a: boolean[] = [];
      const b: boolean[] = [];
      forEachTreeNode(localRoots, (t) => a.push(local.enableFlowTrace().read(t, 'in'), local.enableFlowTrace().read(t, 'out')));
      forEachTreeNode(remoteRoots, (t) => b.push(remote.enableFlowTrace().read(t, 'in'), remote.enableFlowTrace().read(t, 'out')));
      expect(b, `power flow after scan ${i + 1}`).toEqual(a);
      expect(remote.mode).toBe('PAUSE');
      alarmSeen ||= localMemory.readBit('Q0.1');
    }
    expect(alarmSeen).toBe(true); // the 5 s alarm really fired during the script
  });
});

describe('RemoteRuntime (RUN) pipelining, optimism and failure handling', () => {
  const make = (transport: PlcTransport, extra = {}) => {
    const memory = new MemoryMap(S7_200_CPU224);
    const field = new VirtualField(14, 10);
    const runtime = new RemoteRuntime(memory, program, { fieldIo: field, targetScanMs: 5, stepDeltaMs: 5, batchScans: 8, transport, ...extra });
    const events: PlcEvent[] = [];
    runtime.subscribe((e) => events.push(e));
    return { memory, field, runtime, events };
  };

  it('runs continuously, energises outputs, and stops cleanly', async () => {
    let calls = 0;
    const { memory, field, runtime, events } = make(async (body) => (calls++, inProcess(body)));
    field.writeInput('I0.0', true);
    expect(runtime.run()).toBe(true);
    await wait(600); // 5 ms scans are batched to ~160 ms of simulated time per request
    expect(memory.readBit('Q0.0')).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(events.filter((e) => e.type === 'scan').length).toBeGreaterThanOrEqual(3);

    runtime.stop();
    expect(memory.readBit('Q0.0')).toBe(false); // outputs de-energised on STOP
    const after = calls;
    await wait(80);
    expect(calls).toBe(after); // nothing more is sent once stopped
    expect(runtime.mode).toBe('STOP');
  });

  it('keeps an optimistic input across an in-flight response', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const { memory, field, runtime } = make(async (body) => {
      const result = await inProcess(body);
      if (first) {
        first = false;
        await gate; // hold the first reply while the user flips a switch
      }
      return result;
    });
    runtime.run();
    await wait(20);
    field.writeInput('I0.3', true);
    runtime.syncInputs(); // what the session does when the field changes
    expect(memory.readBit('I0.3')).toBe(true); // instant, before any reply
    release();
    await wait(60);
    expect(memory.readBit('I0.3')).toBe(true); // the late reply did not revert it
    runtime.stop();
  });

  it('retries throttled requests, then recovers', async () => {
    let n = 0;
    const { runtime, memory, field } = make(async (body) => {
      if (n++ < 2) throw new PlcEngineError('Simulation rate limit reached', 429, 5);
      return inProcess(body);
    });
    field.writeInput('I0.0', true);
    runtime.run();
    await wait(200);
    expect(runtime.mode).toBe('RUN');
    expect(memory.readBit('Q0.0')).toBe(true);
    runtime.stop();
  });

  it('drops to STOP with an ENGINE_UNREACHABLE diagnostic when the engine is down', async () => {
    const { runtime, events } = make(async () => {
      throw new PlcEngineError('Cannot reach the simulation engine');
    }, { retries: 1 });
    runtime.run();
    await wait(400);
    expect(runtime.mode).toBe('STOP');
    expect(events.some((e) => e.type === 'diagnostic' && e.diagnostic.code === 'ENGINE_UNREACHABLE')).toBe(true);
  });

  it('does not apply a reply that arrives after pause()', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { memory, field, runtime } = make(async (body) => {
      const result = await inProcess(body);
      await gate;
      return result;
    });
    field.writeInput('I0.0', true);
    runtime.run();
    await wait(20);
    runtime.pause();
    release();
    await wait(40);
    expect(memory.readBit('Q0.0')).toBe(false);
    expect(runtime.mode).toBe('PAUSE');
  });
});
