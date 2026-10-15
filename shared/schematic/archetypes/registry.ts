// Registry of archetypes (built from archetypes/families.ts) and the request expansion used by the spec parser.

import type { Issue, SchematicSpec } from '../types';
import * as families from './families';
import { resolveParams } from './params';
import type { Archetype } from './types';

const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const all: Archetype[] = [];
export const DUPLICATE_ARCHETYPE_IDS: string[] = [];
const byId = new Map<string, Archetype>();
for (const list of Object.values(families) as readonly (readonly Archetype[])[]) {
  for (const a of list) {
    if (byId.has(a.id)) { DUPLICATE_ARCHETYPE_IDS.push(a.id); continue; }
    byId.set(a.id, a);
    all.push(a);
  }
}

/** Every registered archetype by id (insertion order = family order). */
export const ARCHETYPES: ReadonlyMap<string, Archetype> = byId;

const lookup = new Map<string, Archetype>();
for (const a of all) {
  lookup.set(key(a.id), a);
  for (const alias of a.aliases) if (!lookup.has(key(alias))) lookup.set(key(alias), a);
}

/** Find by id or alias (case, spaces and dashes are ignored). */
export function findArchetype(idOrAlias: string): Archetype | undefined {
  return lookup.get(key(idOrAlias));
}

export type BuildResult = { ok: true; archetype: Archetype; spec: SchematicSpec } | { ok: false; errors: Issue[] };

const err = (code: string, message: string): Issue => ({ code, message });

/** Build the spec of an archetype from raw params (strict). Never throws. */
export function buildArchetype(id: string, params?: unknown, title?: string): BuildResult {
  const arch = typeof id === 'string' ? findArchetype(id) : undefined;
  if (!arch) {
    return { ok: false, errors: [err('ARCH_UNKNOWN', `Unknown archetype ${JSON.stringify(String(id).slice(0, 40))}. Valid ids: ${Array.from(byId.keys()).join(', ') || 'none'}.`)] };
  }
  const r = resolveParams(arch, params);
  if (!r.ok) return { ok: false, errors: r.errors.map((m) => err('ARCH_PARAM', m)) };
  try {
    const spec = arch.build(r.params);
    return { ok: true, archetype: arch, spec: title ? { ...spec, title } : spec };
  } catch (e) {
    return { ok: false, errors: [err('ARCH_BUILD', `Archetype "${arch.id}" could not be built (${e instanceof Error ? e.message : 'unknown'}).`)] };
  }
}

/** True when a parsed JSON value is an archetype request (has an own "archetype" key). */
export function isArchetypeRequest(json: unknown): boolean {
  return typeof json === 'object' && json !== null && !Array.isArray(json) && Object.prototype.hasOwnProperty.call(json, 'archetype');
}

const REQUEST_KEYS = new Set(['archetype', 'params', 'title']);

/** Expand `{ "archetype": id, "params": {...}, "title"?: string }` into the built spec (or precise errors). */
export function expandArchetypeRequest(raw: Record<string, unknown>): { spec: SchematicSpec | null; errors: Issue[] } {
  const errors: Issue[] = [];
  for (const k of Object.keys(raw)) {
    if (!REQUEST_KEYS.has(k)) errors.push(err('ARCH_REQUEST', `An archetype request has only "archetype", "params" and "title"; remove ${JSON.stringify(k.slice(0, 30))} (never add parts, wires or coordinates).`));
  }
  const id = raw.archetype;
  if (typeof id !== 'string') errors.push(err('ARCH_REQUEST', '"archetype" must be a string id.'));
  const title = raw.title;
  if (title !== undefined && (typeof title !== 'string' || title.length > 80 || /[\u0000-\u001f\u007f]/.test(title))) errors.push(err('ARCH_REQUEST', '"title" must be a plain string of at most 80 characters.'));
  if (errors.length || typeof id !== 'string') return { spec: null, errors };
  const built = buildArchetype(id, raw.params, typeof title === 'string' && title.trim() ? title.trim() : undefined);
  return built.ok ? { spec: built.spec, errors: [] } : { spec: null, errors: built.errors };
}
