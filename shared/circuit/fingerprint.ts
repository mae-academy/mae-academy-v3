import type { CircuitComponent, CircuitWire } from './circuitTypes';

/**
 * Part type plus the wire endpoints attached to it. Unchanged by a value edit or a switch toggle, different once a part is
 * rewired or replaced; routing geometry never enters it.
 */
export function fingerprintCircuit(
  components: ReadonlyArray<Pick<CircuitComponent, 'id' | 'type'>>,
  wires: ReadonlyArray<Pick<CircuitWire, 'fromComp' | 'fromTerm' | 'toComp' | 'toTerm'>>,
): Map<string, string> {
  const links = new Map<string, string[]>();
  const attach = (id: string, link: string) => { const list = links.get(id); if (list) list.push(link); else links.set(id, [link]); };
  for (const wire of wires) {
    attach(wire.fromComp, `${wire.fromTerm}>${wire.toComp}.${wire.toTerm}`);
    attach(wire.toComp, `${wire.toTerm}>${wire.fromComp}.${wire.fromTerm}`);
  }
  return new Map(components.map(component => [component.id, `${component.type}|${(links.get(component.id) ?? []).sort().join(',')}`]));
}

/**
 * Compares a circuit with the one before it. When at least half of the previous parts are unchanged it is an edit (the stored
 * energy of the unchanged parts survives); otherwise it is a different circuit and starts from rest.
 */
export function diffCircuit(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): { sameCircuit: boolean; unchanged: Set<string> } {
  const unchanged = new Set<string>();
  next.forEach((fingerprint, id) => { if (previous.get(id) === fingerprint) unchanged.add(id); });
  return { sameCircuit: previous.size > 0 && unchanged.size >= 0.5 * previous.size, unchanged };
}
