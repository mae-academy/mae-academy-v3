// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderSpec } from '../render';
import { validateSchematic } from '../validate';
import { buildArchetype, findArchetype } from './registry';
import { ARCHETYPE_LIST } from './powerExtra';

const IDS = ['three_phase_half_wave_controlled_rectifier', 'boost_converter_snubber', 'buck_boost_converter', 'h_bridge_motor_driver'];

describe('powerExtra archetypes', () => {
  it('exports exactly the four ids and registers them', () => {
    expect(ARCHETYPE_LIST.map((a) => a.id)).toEqual(IDS);
    for (const id of IDS) expect(findArchetype(id)?.id).toBe(id);
  });

  it('resolves common aliases', () => {
    expect(findArchetype('3-phase half-wave thyristor rectifier')?.id).toBe(IDS[0]);
    expect(findArchetype('three pulse controlled rectifier')?.id).toBe(IDS[0]);
    expect(findArchetype('Boost converter with RCD snubber')?.id).toBe(IDS[1]);
    expect(findArchetype('buck-boost')?.id).toBe(IDS[2]);
    expect(findArchetype('inverting buck boost converter')?.id).toBe(IDS[2]);
    expect(findArchetype('H-Bridge')?.id).toBe(IDS[3]);
    expect(findArchetype('dc motor h bridge')?.id).toBe(IDS[3]);
  });

  it('rejects bad parameters with the archetype id in the message', () => {
    const bad: [string, Record<string, unknown>][] = [
      [IDS[0], { firing_angle: 200 }], [IDS[0], { firing_angle: 'x' }], [IDS[0], { load: 'RC' }],
      [IDS[1], { switch: 'relay' }], [IDS[1], { C_snub: '10 kΩ' }], [IDS[2], { Vin: '-3 V' }], [IDS[3], { Vs: '5000 V' }], [IDS[3], { colour: 'red' }],
    ];
    for (const [id, params] of bad) {
      const r = buildArchetype(id, params);
      expect(r.ok, JSON.stringify([id, params])).toBe(false);
      if (!r.ok) expect(r.errors[0].message).toContain(id);
    }
  });

  it('every variant validates with 0 errors and 0 warnings and has no part numbers', () => {
    const variants: [string, Record<string, unknown>][] = [
      [IDS[0], { load: 'R', firing_angle: 0 }], [IDS[0], { load: 'RL', firing_angle: 90 }], [IDS[0], { load: 'RLE', firing_angle: 180 }],
      ...(['switch', 'nmos', 'igbt'] as const).flatMap((switchType): [string, Record<string, unknown>][] => [
        [IDS[1], { switch: switchType }], [IDS[2], { switch: switchType }], [IDS[3], { switch: switchType }],
      ]),
    ];
    for (const [id, params] of variants) {
      const v = validateSchematic({ archetype: id, params });
      const label = JSON.stringify([id, params]);
      expect(v.errors.map((e) => e.message), label).toEqual([]);
      expect(v.warnings.map((e) => e.message), label).toEqual([]);
      expect(v.stats.crossovers, label).toBe(0);
      expect(v.netlist.groundNet, label).toBe('N0');
      expect(renderSpec(v.spec!).svg).not.toMatch(/\b(1N\d{3,4}|LM\d{3}|TL0\d\d|NE555|IRF\w+|2N\d{4}|BC\d{3})\b/);
    }
  });

  it('shows the firing angle and the output polarity', () => {
    const hw = validateSchematic({ archetype: IDS[0], params: { firing_angle: 45 } });
    expect(hw.spec!.labels.map((l) => l.text).join(' ')).toContain('45°');
    const bb = validateSchematic({ archetype: IDS[2] });
    // inverting output: the top (hot) output port is the minus terminal
    expect(bb.spec!.parts.find((p) => p.id === 'OUTP')!.value).toBe('−');
    expect(bb.spec!.parts.find((p) => p.id === 'OUTN')!.value).toBe('+');
  });

  it('uses S1..S4 designators for ideal switches and Q1..Q4 for transistors in the H-bridge', () => {
    const ids = (p: Record<string, unknown>): string[] => validateSchematic({ archetype: IDS[3], params: p }).spec!.parts.map((x) => x.id);
    expect(ids({ switch: 'switch' })).toEqual(expect.arrayContaining(['S1', 'S2', 'S3', 'S4']));
    expect(ids({ switch: 'igbt' })).toEqual(expect.arrayContaining(['Q1', 'Q2', 'Q3', 'Q4']));
  });

  it('keeps the H-bridge freewheeling diodes antiparallel to each switch', () => {
    for (const sw of ['nmos', 'igbt', 'switch']) {
      const v = validateSchematic({ archetype: IDS[3], params: { switch: sw } });
      const net = (k: string): string => v.netlist.netOfTerminal[k];
      const pre = sw === 'switch' ? 'S' : 'Q';
      const top = sw === 'nmos' ? 'D' : sw === 'igbt' ? 'C' : '1';
      const bot = sw === 'nmos' ? 'S' : sw === 'igbt' ? 'E' : '2';
      for (const n of [1, 2, 3, 4]) {
        expect(net(`D${n}.K`), `${sw} D${n}.K`).toBe(net(`${pre}${n}.${top}`));
        expect(net(`D${n}.A`), `${sw} D${n}.A`).toBe(net(`${pre}${n}.${bot}`));
      }
    }
  });
});
