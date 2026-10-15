// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSchematicSpec } from '../parse';
import { renderSpec } from '../render';
import { validateSchematic } from '../validate';
import { ARCHETYPE_DOC } from './archetypeDoc';
import { ARCHETYPES, DUPLICATE_ARCHETYPE_IDS, buildArchetype, findArchetype, isArchetypeRequest } from './registry';
import { resolveParams } from './params';
import type { Archetype, ParamDef } from './types';

const ROSTER = [
  'three_phase_full_wave_rectifier', 'three_phase_half_wave_controlled_rectifier', 'single_phase_full_bridge_rectifier', 'non_inverting_amplifier',
  'inverting_summing_amplifier', 'inverting_amplifier', 'instrumentation_amplifier', 'sallen_key_lowpass', 'mfb_bandpass', 'buck_converter',
  'boost_converter_snubber', 'buck_boost_converter', 'h_bridge_motor_driver', 'wheatstone_bridge', 'twin_t_notch', 'bjt_common_emitter',
  'mosfet_common_source', 'cmos_inverter', 'timer555_astable', 'colpitts_oscillator', 'wien_bridge_oscillator', 'precision_half_wave_rectifier',
];

/** SI number -> engineering text the parser accepts, e.g. 4.7e-5 -> "47 µ" + unit. */
function eng(si: number, unit: ParamDef['unit']): string {
  const u = { ohm: 'Ω', F: 'F', H: 'H', V: 'V', A: 'A', Hz: 'Hz' }[unit ?? 'V'];
  const steps: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, p] of steps) if (si >= f * 0.999999) return `${Number((si / f).toPrecision(6))} ${p}${u}`;
  return `${si} ${u}`;
}

/** Defaults, every choice combination, and the value extremes of each parameter. */
function parameterSets(a: Archetype): Record<string, unknown>[] {
  const sets: Record<string, unknown>[] = [{}];
  const choices = a.params.filter((p) => p.kind === 'choice' || p.kind === 'bool');
  let combos: Record<string, unknown>[] = [{}];
  for (const p of choices) {
    const options = p.kind === 'bool' ? [true, false] : (p.choices ?? []);
    combos = combos.flatMap((c) => options.map((o) => ({ ...c, [p.name]: o })));
  }
  sets.push(...combos);
  for (const p of a.params.filter((q) => q.kind === 'value')) {
    if (p.min !== undefined) sets.push({ [p.name]: eng(p.min, p.unit) });
    if (p.max !== undefined) sets.push({ [p.name]: eng(p.max, p.unit) });
  }
  for (const p of a.params.filter((q) => q.kind === 'int')) {
    if (p.min !== undefined) sets.push({ [p.name]: p.min });
    if (p.max !== undefined) sets.push({ [p.name]: p.max });
  }
  return sets;
}

describe('archetype registry', () => {
  it('has no duplicate ids; every id is snake_case and on the roster', () => {
    expect(DUPLICATE_ARCHETYPE_IDS).toEqual([]);
    for (const id of Array.from(ARCHETYPES.keys())) {
      expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(ROSTER).toContain(id);
    }
  });
  it('implements at least the three phase-1 archetypes', () => {
    for (const id of ['three_phase_full_wave_rectifier', 'single_phase_full_bridge_rectifier', 'buck_converter']) expect(ARCHETYPES.has(id)).toBe(true);
  });
  it('finds archetypes by id or alias, ignoring case and separators', () => {
    expect(findArchetype('Buck Converter')?.id).toBe('buck_converter');
    expect(findArchetype('three-phase bridge rectifier')?.id).toBe('three_phase_full_wave_rectifier');
    expect(findArchetype('nope')).toBeUndefined();
    expect(findArchetype('__proto__')).toBeUndefined();
  });
  it('declares well-formed parameters with valid defaults', () => {
    for (const a of Array.from(ARCHETYPES.values())) {
      expect(a.summary.length).toBeGreaterThan(10);
      const names = a.params.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
      expect(resolveParams(a, {}).ok, a.id).toBe(true);
      for (const p of a.params) if (p.kind === 'choice') expect(p.choices).toContain(p.default);
    }
  });
  it('generates a compact catalogue from the registry', () => {
    for (const id of Array.from(ARCHETYPES.keys())) expect(ARCHETYPE_DOC).toContain(id);
    // ~260 chars per circuit for the full 22-circuit roster (it is sent in every request's system prompt)
    expect(ARCHETYPE_DOC.length).toBeLessThan(7000);
  });
});

describe('parameter parsing is strict', () => {
  const arch = ARCHETYPES.get('buck_converter')!;
  it('accepts engineering notation and numbers, normalising the display', () => {
    const r = resolveParams(arch, { Vin: '24', L: '47uH', C: '220 µF', R_load: 4.7, switch: 'NMOS' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params).toMatchObject({ Vin: '24 V', L: '47 µH', C: '220 µF', R_load: '4.7 Ω', switch: 'nmos' });
  });
  it('rejects unknown parameters with the valid list', () => {
    const r = resolveParams(arch, { Vin: '12 V', colour: 'red' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/unknown parameter "colour".*Vin/);
  });
  it('rejects wrong units, junk, out-of-range values and bad choices with precise errors', () => {
    for (const bad of [{ Vin: '12 Ω' }, { Vin: 'abc' }, { Vin: '5000 V' }, { Vin: '' }, { L: '-3 mH' }, { switch: 'relay' }, { C: [1] }, { Vin: { a: 1 } }]) {
      const r = resolveParams(arch, bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('buck_converter');
    }
    expect(resolveParams(arch, 'x').ok).toBe(false);
    expect(resolveParams(arch, [1]).ok).toBe(false);
  });
  it('treats hostile strings as plain invalid values (nothing reaches the drawing)', () => {
    const r = buildArchetype('buck_converter', { Vin: '"><script>alert(1)</script>' });
    expect(r.ok).toBe(false);
  });
});

describe('every parameter combination validates with 0 errors and 0 warnings', () => {
  for (const a of Array.from(ARCHETYPES.values())) {
    it(`${a.id}: defaults, all choice combinations and value extremes`, () => {
      const sets = parameterSets(a);
      expect(sets.length).toBeGreaterThan(1);
      for (const params of sets) {
        const v = validateSchematic({ archetype: a.id, params });
        const label = `${a.id} ${JSON.stringify(params)}`;
        expect(v.errors.map((e) => e.message), label).toEqual([]);
        expect(v.warnings.map((e) => e.message), label).toEqual([]);
        const svg = renderSpec(v.spec!).svg;
        expect(new DOMParser().parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror')).toHaveLength(0);
      }
    });
  }
});

describe('archetype requests in the spec pipeline', () => {
  it('expands transparently through parse and validate (string, fenced text and object)', () => {
    const req = { archetype: 'buck_converter', params: { Vin: '24 V' }, title: 'My buck' };
    const viaObject = validateSchematic(req);
    const viaText = validateSchematic('Here it is:\n```schematic\n' + JSON.stringify(req) + '\n```');
    expect(viaObject.ok).toBe(true);
    expect(viaObject.spec?.title).toBe('My buck');
    expect(JSON.stringify(viaText.spec)).toBe(JSON.stringify(viaObject.spec));
    expect(viaObject.spec?.parts.find((p) => p.id === 'VIN')?.value).toBe('24 V');
    expect(parseSchematicSpec(JSON.stringify(req)).json).toEqual(req);
    expect(isArchetypeRequest(req)).toBe(true);
    expect(isArchetypeRequest({ parts: [] })).toBe(false);
  });
  it('reports unknown ids, extra keys and bad params as errors, never a drawing', () => {
    const unknown = validateSchematic({ archetype: 'flux_capacitor' });
    expect(unknown.ok).toBe(false);
    expect(unknown.errors[0].message).toContain('Valid ids');
    const extra = validateSchematic({ archetype: 'buck_converter', parts: [] });
    expect(extra.ok).toBe(false);
    expect(extra.errors[0].message).toContain('never add parts');
    expect(validateSchematic({ archetype: 'buck_converter', params: { nope: 1 } }).ok).toBe(false);
    expect(validateSchematic({ archetype: 7 }).ok).toBe(false);
    expect(validateSchematic({ archetype: 'buck_converter', title: 'x'.repeat(200) }).ok).toBe(false);
  });
  it('is deterministic: the same request builds the same spec and SVG', () => {
    const a = renderSpec(validateSchematic({ archetype: 'three_phase_full_wave_rectifier' }).spec!).svg;
    const b = renderSpec(validateSchematic({ archetype: 'three_phase_full_wave_rectifier', params: {} }).spec!).svg;
    expect(a).toBe(b);
  });
});
