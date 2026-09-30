import { describe, expect, it } from 'vitest';
import { LOGO_0BA8, S7_200_CPU224, S7_200_CPU226_EXP } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { RemoteRuntime } from '../../remote/remote-runtime';
import { inProcessTransport } from '../../remote/test-utils';
import { ladToIl, exportMicroWin } from '../../transpiler';
import { DEMO_SYMBOLS, DEMO_STL, createDemoNetworks } from './demo-program';
import { VirtualField } from '../hardware/virtual-field';
import { validateForProfile } from './program';
import { validateNetworkLayout } from '../../domain/ast';

describe('demo program', () => {
  it('is two networks and is clean on every built-in profile', () => {
    for (const profile of [LOGO_0BA8, S7_200_CPU224, S7_200_CPU226_EXP]) {
      const networks = createDemoNetworks(profile);
      expect(networks).toHaveLength(2);
      expect(validateForProfile(networks, profile).filter((i) => i.severity === 'error')).toEqual([]);
      for (const network of networks) expect(validateNetworkLayout(network)).toEqual([]);
    }
  });

  it('carries the requested titles, elements and addresses', () => {
    const [seal, alarm] = createDemoNetworks();
    expect(seal?.title).toBe('Start / stop seal-in');
    const contacts = seal?.nodes.filter((n) => n.type === 'contact').map((n) => (n.type === 'contact' ? `${n.variant}:${n.operand}` : ''));
    expect(contacts?.sort()).toEqual(['NC:I0.1', 'NO:I0.0', 'NO:Q0.0']);
    expect(seal?.nodes.find((n) => n.type === 'coil')).toMatchObject({ target: 'Q0.0' });
    expect(seal?.branches).toHaveLength(1); // the seal-in branch

    const timer = alarm?.nodes.find((n) => n.type === 'timer');
    expect(timer).toMatchObject({ fn: 'TON', instance: 'T37', timeBaseMs: 100, inputs: { PT: { kind: 'constant', value: 50 } } });
    expect(alarm?.nodes.find((n) => n.type === 'coil')).toMatchObject({ target: 'Q0.1' });
  });

  it('behaves: latches on start, alarms after exactly 5 s, and resets on stop', async () => {
    const memory = new MemoryMap(S7_200_CPU224);
    const field = new VirtualField(14, 10);
    let now = 0;
    const runtime = new RemoteRuntime(
      memory,
      { schemaVersion: 1, profileId: S7_200_CPU224.id, networks: createDemoNetworks() },
      { fieldIo: field, clock: () => now, stepDeltaMs: 100, scheduler: { schedule: () => 0, cancel: () => {} }, transport: inProcessTransport },
    );
    const scan = async (n = 1) => {
      for (let i = 0; i < n; i++) await runtime.step();
    };

    await scan(3);
    expect(memory.readBit('Q0.0')).toBe(false);

    field.writeInput('I0.0', true); // press start
    await scan();
    field.writeInput('I0.0', false); // release: the seal-in holds the motor
    await scan(20);
    expect(memory.readBit('Q0.0')).toBe(true);
    expect(memory.readBit('Q0.1')).toBe(false); // ~2.1 s in: not yet

    await scan(28); // 50 scans of 100 ms since the motor started
    expect(memory.readBit('Q0.1')).toBe(false);
    await scan(3);
    expect(memory.readBit('Q0.1')).toBe(true);

    field.writeInput('I0.1', true); // stop
    await scan(2);
    expect(memory.readBit('Q0.0')).toBe(false);
    expect(memory.readBit('Q0.1')).toBe(false); // the timer resets with the motor
    expect(now).toBe(0);
  });

  it('exports a faithful listing, with the symbol table', () => {
    const networks = createDemoNetworks();
    const stl = ladToIl(networks).value ?? '';
    expect(stl).toContain('NETWORK 1 // Start / stop seal-in');
    expect(stl.replace(/\s+/g, ' ')).toContain('LD I0.0 O Q0.0 AN I0.1 = Q0.0');
    expect(stl.replace(/\s+/g, ' ')).toContain('LD Q0.0 TON T37, 50 LD T37 = Q0.1');
    const file = exportMicroWin(networks, S7_200_CPU224, DEMO_SYMBOLS);
    expect(file.symbolTable?.content).toContain('Run_Timer\tT37');
    expect(file.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(DEMO_STL).toContain('TON T37, 50');
  });
});
