// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { placePart } from '../geometry';
import { validateSchematic } from '../validate';
import { ARCHETYPE_LIST } from './analog';
import { buildArchetype, findArchetype } from './registry';

const IDS = ['non_inverting_amplifier', 'inverting_amplifier', 'inverting_summing_amplifier', 'instrumentation_amplifier', 'sallen_key_lowpass', 'mfb_bandpass', 'twin_t_notch', 'precision_half_wave_rectifier'];

describe('analog archetypes', () => {
  it('exports every circuit and registers it', () => {
    expect(ARCHETYPE_LIST.map((a) => a.id)).toEqual(IDS);
    for (const id of IDS) expect(findArchetype(id)?.id).toBe(id);
  });
  it('resolves common names', () => {
    expect(findArchetype('Non-Inverting Amplifier')?.id).toBe('non_inverting_amplifier');
    expect(findArchetype('summing amplifier')?.id).toBe('inverting_summing_amplifier');
    expect(findArchetype('instrumentation amp')?.id).toBe('instrumentation_amplifier');
    expect(findArchetype('Sallen-Key low pass')?.id).toBe('sallen_key_lowpass');
    expect(findArchetype('multiple feedback band pass filter')?.id).toBe('mfb_bandpass');
    expect(findArchetype('twin-T notch filter')?.id).toBe('twin_t_notch');
    expect(findArchetype('superdiode')?.id).toBe('precision_half_wave_rectifier');
  });
  it('uses no commercial part numbers in any label or id', () => {
    for (const id of IDS) {
      const r = buildArchetype(id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(JSON.stringify(r.spec)).not.toMatch(/LM\d|TL0|OP0|1N\d|NE5|741/);
    }
  });
  it('summing amplifier follows the number of inputs', () => {
    for (const n of [2, 3, 4]) {
      const v = validateSchematic({ archetype: 'inverting_summing_amplifier', params: { inputs: n } });
      expect(v.errors).toEqual([]);
      expect(v.warnings).toEqual([]);
      expect(v.spec!.parts.filter((p) => p.type === 'resistor')).toHaveLength(n + 1);
      expect(v.netlist.netOfTerminal['U1.IN-']).toBe(v.netlist.netOfTerminal[`R${n}.2`]);
    }
  });
  it('non-inverting supply pins land on the right op-amp pins and the right rails', () => {
    const v = validateSchematic({ archetype: 'non_inverting_amplifier', params: { supply_pins: true } });
    expect(v.warnings).toEqual([]);
    const n = v.netlist.netOfTerminal;
    expect(n['U1.V+']).toBe(n['VCC.P']);
    expect(n['U1.V-']).toBe(n['VEE.P']);
    const top = v.spec!.parts.find((p) => p.id === 'VCC')!.at[1];
    const bottom = v.spec!.parts.find((p) => p.id === 'VEE')!.at[1];
    expect(top).toBeLessThan(bottom); // +V on top as in every textbook figure
  });
  it('a flipped op-amp keeps V+ on top (core fix in placePart)', () => {
    const at = (flip: boolean) => {
      const placed = placePart({ id: 'U1', type: 'opamp', at: [10, 10], rot: 0, flip, label: 'auto', attrs: { supply: true } }, 'IEC', 20)!;
      const find = (name: string) => placed.terminals.find((t) => t.name === name)!;
      return { vp: find('V+'), vn: find('V-'), inn: find('IN-'), inp: find('IN+') };
    };
    const normal = at(false), flipped = at(true);
    expect(normal.vp.y).toBeLessThan(normal.vn.y);
    expect(flipped.vp.y).toBeLessThan(flipped.vn.y);
    expect(flipped.inp.y).toBeLessThan(flipped.inn.y); // + input on top
  });
  it('twin-T derives 2C and R/2 exactly from R and C', () => {
    const v = validateSchematic({ archetype: 'twin_t_notch', params: { R: '4.7 kΩ', C: '33 nF' } });
    const val = (id: string) => v.spec!.parts.find((p) => p.id === id)?.value;
    expect(val('C3')).toBe('66 nF');
    expect(val('R3')).toBe('2.35 kΩ');
  });
  it('Sallen-Key equal-component mode ties R_2 to R_1 and C_2 to C_1', () => {
    const v = validateSchematic({ archetype: 'sallen_key_lowpass', params: { gain: 'equal_component', R_1: '1 kΩ', R_2: '5 kΩ', C_1: '10 nF', C_2: '1 nF' } });
    const val = (id: string) => v.spec!.parts.find((p) => p.id === id)?.value;
    expect(val('R2')).toBe('1 kΩ');
    expect(val('C2')).toBe('10 nF');
    expect(v.warnings).toEqual([]);
  });
});
