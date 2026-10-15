// Compact LLM-facing catalogue generated FROM the registry (so it can never drift from the code).

import { ARCHETYPES } from './registry';
import type { Archetype, ParamDef } from './types';

const UNIT_SHOWN: Record<string, string> = { ohm: 'Ω', F: 'F', H: 'H', V: 'V', A: 'A', Hz: 'Hz' };

function paramText(p: ParamDef): string {
  if (p.kind === 'choice') return `${p.name}=${(p.choices ?? []).join('|')} (${String(p.default)})`;
  if (p.kind === 'value') return `${p.name} [${UNIT_SHOWN[p.unit ?? ''] ?? ''}] (${String(p.default)})`;
  return `${p.name} (${String(p.default)})`;
}

export function archetypeLine(a: Archetype): string {
  return `- ${a.id}: ${a.summary} Params: ${a.params.map(paramText).join('; ') || 'none'}.`;
}

/** The catalogue of every registered archetype, one terse line each. */
export function buildArchetypeDoc(): string {
  return Array.from(ARCHETYPES.values()).map(archetypeLine).join('\n');
}

export const ARCHETYPE_DOC: string = buildArchetypeDoc();
