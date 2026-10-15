// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderSpec } from '../render';
import { validateSchematic } from '../validate';
import { ARCHETYPES, findArchetype } from './registry';

const IDS = ['wheatstone_bridge', 'bjt_common_emitter', 'mosfet_common_source', 'cmos_inverter', 'timer555_astable', 'colpitts_oscillator', 'wien_bridge_oscillator'];
const PART_NUMBER = /\b(1N\d{3,4}|LM\d{3}|TL0\d\d|NE555|IRF\w+|2N\d{4}|BC\d{3}|BD\d{3}|MC\d{4}|CD4\d{3})\b/;

describe('discrete archetypes', () => {
  it('are registered and found by alias', () => {
    for (const id of IDS) expect(ARCHETYPES.has(id), id).toBe(true);
    expect(findArchetype('common emitter amplifier')?.id).toBe('bjt_common_emitter');
    expect(findArchetype('555 timer')?.id).toBe('timer555_astable');
    expect(findArchetype('Wien bridge')?.id).toBe('wien_bridge_oscillator');
    expect(findArchetype('colpitts')?.id).toBe('colpitts_oscillator');
    expect(findArchetype('CMOS inverter')?.id).toBe('cmos_inverter');
    expect(findArchetype('wheatstone')?.id).toBe('wheatstone_bridge');
    expect(findArchetype('common source amplifier')?.id).toBe('mosfet_common_source');
  });

  for (const id of IDS) {
    it(`${id}: ground is node 0, no commercial part numbers, deterministic`, () => {
      const v = validateSchematic({ archetype: id });
      expect(v.errors).toEqual([]);
      expect(v.warnings).toEqual([]);
      expect(v.netlist.groundNet).toBe('N0');
      const svg = renderSpec(v.spec!).svg;
      expect(svg).not.toMatch(PART_NUMBER);
      expect(renderSpec(validateSchematic({ archetype: id }).spec!).svg).toBe(svg);
    });
  }

  it('passes parameter values through to the drawing', () => {
    const v = validateSchematic({ archetype: 'bjt_common_emitter', params: { RC: '2.2 kΩ', Vcc: '9 V', load: 'none' } });
    expect(v.ok).toBe(true);
    expect(v.spec!.parts.find((p) => p.id === 'RC')?.value).toBe('2.2 kΩ');
    expect(v.spec!.parts.find((p) => p.id === 'VCC')?.value).toBe('9 V');
    expect(v.spec!.parts.some((p) => p.id === 'RL')).toBe(false);
  });

  it('555 without the control capacitor omits CTRL; with the LED load adds R_L and D_1', () => {
    const a = validateSchematic({ archetype: 'timer555_astable', params: { ctrl_cap: false, load: 'led' } });
    expect(a.ok).toBe(true);
    expect(a.spec!.parts.some((p) => p.id === 'C2')).toBe(false);
    expect(a.spec!.parts.find((p) => p.id === 'U1')?.attrs.pins?.some((q) => q.name === 'CTRL')).toBe(false);
    expect(a.spec!.parts.some((p) => p.id === 'D1' && p.type === 'led')).toBe(true);
    expect(a.netlist.netOfTerminal['D1.K']).toBe('N0');
  });

  it('555 uses the exact astable formulas in the drawing', () => {
    const v = validateSchematic({ archetype: 'timer555_astable' });
    expect(v.spec!.labels.map((l) => l.text).join('|')).toContain('1.44');
  });

  it('wheatstone: detector choice swaps the open ports for R_G', () => {
    const v = validateSchematic({ archetype: 'wheatstone_bridge', params: { detector: 'resistor' } });
    expect(v.ok).toBe(true);
    expect(v.netlist.netOfTerminal['RG.1']).toBe(v.netlist.netOfTerminal['R1.1']);
    expect(v.netlist.netOfTerminal['RG.2']).toBe(v.netlist.netOfTerminal['R2.2']);
  });
});
