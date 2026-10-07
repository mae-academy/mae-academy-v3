import { describe, expect, it } from 'vitest';
import ar from '@/locales/ar/simulators.json';
import en from '@/locales/en/simulators.json';
import es from '@/locales/es/simulators.json';
import { FLUID_CATALOG } from '../models/fluidCatalog';
import { dictionaryKey, englishFluidT, optionLabel, parameterLabel, partName } from './fluidText';

type Tree = { [key: string]: string | Tree };
const leaves = (node: Tree, prefix = ''): Array<[string, string]> =>
  Object.entries(node).flatMap(([key, value]) => (typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));

const EMOJI = /\p{Extended_Pictographic}/u;
const ARABIC = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

const fluid = { en: en.fluid as Tree, ar: ar.fluid as Tree, es: es.fluid as Tree };

describe('fluid studio dictionary', () => {
  it('has the same keys and placeholders in English, Arabic and Spanish', () => {
    const base = leaves(fluid.en);
    for (const lang of ['ar', 'es'] as const) {
      const other = new Map(leaves(fluid[lang]));
      expect(base.filter(([key]) => !other.has(key)).map(([key]) => key)).toEqual([]);
      expect(other.size).toBe(base.length);
      for (const [key, value] of base) {
        const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
        expect(placeholders(other.get(key)!), key).toEqual(placeholders(value));
      }
    }
  });

  it('contains no emoji in any language', () => {
    for (const lang of ['en', 'ar', 'es'] as const) expect(leaves(fluid[lang]).filter(([, value]) => EMOJI.test(value))).toEqual([]);
  });

  it('never mixes Arabic with English words in one string, except the ISO terms AND / OR', () => {
    const mixed = leaves(fluid.ar).filter(([, value]) => ARABIC.test(value) && LATIN_WORD.test(value.replace(/\b(AND|OR|FRL|bar)\b/g, '').replace(/\{\{\w+\}\}/g, '')));
    expect(mixed.map(([key]) => key)).toEqual([]);
  });

  it('uses the agreed engineering terms', () => {
    const t = (lang: 'en' | 'ar' | 'es', key: string) => new Map(leaves(fluid[lang])).get(key);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'analysis.cutawayTab'))).toEqual(['Cutaway Anatomy', 'التشريح الداخلي', 'Anatomía de Corte']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'parts.dual-pressure-valve.name'))).toEqual(['Dual-Pressure Valve (AND)', 'صمام الضغط الثنائي (AND)', 'Válvula de Doble Presión (AND)']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'parts.shuttle-valve.name'))).toEqual(['Shuttle Valve (OR)', 'صمام التبديل الراجع (OR)', 'Válvula Selectora (OR)']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'parts.quick-exhaust.name'))).toEqual(['Quick Exhaust Valve', 'صمام التفريغ السريع', 'Válvula de Escape Rápido']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'parts.flow-control-oneway.name'))).toEqual(['One-Way Flow Control Valve', 'صمام خانق مع رجوع حر', 'Válvula Reguladora Unidireccional']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'params.endPositionCushioning'))).toEqual(['End-Position Cushioning', 'تخميد نهاية الشوط', 'Amortiguación de Fin de Carrera']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'inspector.limitSwitches'))).toEqual(['Limit Switches', 'مفاتيح نهاية الشوط', 'Finales de Carrera']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'board.retractExtend'))).toEqual(['Retract / Extend', 'تراجع / تمدد', 'Retracción / Extensión']);
    expect(['en', 'ar', 'es'].map(lang => t(lang as 'en', 'params.throttleOpening'))).toEqual(['Throttle Opening', 'نسبة فتح الخانق', 'Apertura de Estrangulación']);
  });

  it('translates every catalog part, parameter and option into all three languages', () => {
    const keys = new Set(leaves(fluid.en).map(([key]) => key));
    const missing: string[] = [];
    for (const def of FLUID_CATALOG) {
      for (const key of [`parts.${def.type}.name`, `parts.${def.type}.description`]) if (!keys.has(key)) missing.push(key);
      for (const parameter of def.parameters) {
        if (!parameter.advanced && !keys.has(`params.${dictionaryKey(parameter.label)}`)) missing.push(`params.${dictionaryKey(parameter.label)}`);
        for (const option of parameter.options ?? []) if (!keys.has(`options.${dictionaryKey(option)}`)) missing.push(`options.${dictionaryKey(option)}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('keeps the catalog English labels equal to the English dictionary', () => {
    for (const def of FLUID_CATALOG) expect(partName(englishFluidT, def.type, '?'), def.type).toBe(def.name);
    expect(parameterLabel(englishFluidT, 'Throttle Opening')).toBe('Throttle Opening');
    expect(optionLabel(englishFluidT, 'Hand Lever')).toBe('Hand Lever');
  });

  it('interpolates placeholders', () => {
    expect(englishFluidT('analysis.viewing', { name: '1V1' })).toBe('Viewing 1V1');
  });
});
