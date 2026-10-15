// Strict parameter parsing for archetypes: unknown parameters are rejected, values are parsed (never trusted), missing ones defaulted.

import { DEFAULT_UNIT, formatValue, parseValue } from '../values';
import type { Archetype, ParamDef, ParamValue, ResolvedParams } from './types';

export type ParamResult = { ok: true; params: ResolvedParams } | { ok: false; errors: string[] };

const own = (o: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const show = (v: unknown): string => JSON.stringify(typeof v === 'string' ? v.slice(0, 40) : v) ?? 'undefined';
const EXAMPLE: Record<string, string> = { ohm: '"10 kΩ"', F: '"47 µF"', H: '"50 µH"', Hz: '"1 kHz"', V: '"12 V"', A: '"2 A"' };

function parseOne(def: ParamDef, raw: unknown, arch: string): { value?: ParamValue; error?: string } {
  const where = `archetype "${arch}", parameter "${def.name}"`;
  switch (def.kind) {
    case 'bool':
      return typeof raw === 'boolean' ? { value: raw } : { error: `${where}: ${show(raw)} is not true or false.` };
    case 'int': {
      const n = typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isInteger(n)) return { error: `${where}: ${show(raw)} is not an integer.` };
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) return { error: `${where}: ${n} is outside ${def.min ?? '-inf'}..${def.max ?? 'inf'}.` };
      return { value: n };
    }
    case 'choice': {
      const s = typeof raw === 'string' ? raw.trim() : '';
      const hit = (def.choices ?? []).find((c) => c.toLowerCase() === s.toLowerCase());
      return hit !== undefined ? { value: hit } : { error: `${where}: ${show(raw)} is not one of ${(def.choices ?? []).map((c) => JSON.stringify(c)).join(', ')}.` };
    }
    case 'value': {
      const text = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
      const pv = text ? parseValue(text) : null;
      if (!pv) return { error: `${where}: ${show(raw)} is not a value; use a number with an optional SI prefix and unit, for example ${EXAMPLE[def.unit ?? 'V']}.` };
      if (def.unit && pv.dim && pv.dim !== def.unit) return { error: `${where}: ${show(raw)} has the wrong unit; expected ${DEFAULT_UNIT[def.unit]}.` };
      if (pv.si <= 0) return { error: `${where}: ${show(raw)} must be positive.` };
      const mag = pv.si;
      if ((def.min !== undefined && mag < def.min) || (def.max !== undefined && mag > def.max)) return { error: `${where}: ${show(raw)} is outside the supported range ${def.min ?? 0}..${def.max ?? 'inf'} (SI units).` };
      return { value: formatValue(text, def.unit ?? null) };
    }
  }
}

/** Resolve the raw params of a request against an archetype. Collects every problem; never throws. */
export function resolveParams(arch: Archetype, raw: unknown): ParamResult {
  const errors: string[] = [];
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    return { ok: false, errors: [`archetype "${arch.id}": "params" must be an object of parameter values.`] };
  }
  const given = (raw ?? {}) as Record<string, unknown>;
  const known = new Set(arch.params.map((p) => p.name));
  for (const key of Object.keys(given)) {
    if (!known.has(key)) errors.push(`archetype "${arch.id}": unknown parameter ${JSON.stringify(key.slice(0, 30))}; valid parameters: ${arch.params.map((p) => p.name).join(', ') || 'none'}.`);
  }
  const out: Record<string, ParamValue> = {};
  for (const def of arch.params) {
    const given1 = own(given, def.name);
    const v = given1 === undefined || given1 === null ? def.default : given1; // defaults take the same strict path
    const r = parseOne(def, v, arch.id);
    if (r.error) errors.push(r.error);
    else out[def.name] = r.value as ParamValue;
  }
  return errors.length ? { ok: false, errors } : { ok: true, params: out };
}
