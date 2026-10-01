import { getDef } from './componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from './circuitTypes';
import type { CircuitDescription, ElectricalComponent, NetTable, WireLink } from './protocol';

/** Anything that can name the electrical net (MNA node) a terminal sits on; '0' is the ground reference. */
export interface NetLookup {
  netForTerminal(componentId: string, terminalId: string): string;
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(value: string): string { const prior = this.parent.get(value); if (!prior) { this.parent.set(value, value); return value; } if (prior === value) return value; const root = this.find(prior); this.parent.set(value, root); return root; }
  union(left: string, right: string) { const a = this.find(left); const b = this.find(right); if (a !== b) this.parent.set(b, a); }
}

/**
 * Net lookup built from the wire connectivity (union-find over terminal keys, every ground symbol merged into node '0').
 * The wires only need their endpoints; routing geometry is irrelevant here.
 */
export function netLookupFromWires(components: ReadonlyArray<Pick<CircuitComponent, 'id' | 'type'>>, wires: ReadonlyArray<Pick<CircuitWire, 'fromComp' | 'fromTerm' | 'toComp' | 'toTerm'>>): NetLookup {
  const union = new UnionFind();
  for (const component of components) for (const terminal of getDef(component.type)?.terminals ?? []) union.find(terminalKey(component.id, terminal.id));
  for (const wire of wires) union.union(terminalKey(wire.fromComp, wire.fromTerm), terminalKey(wire.toComp, wire.toTerm));
  const groundComponents = components.filter(component => component.type === 'ground');
  if (groundComponents.length > 0) {
    const gnd0 = terminalKey(groundComponents[0].id, 'gnd');
    for (let i = 1; i < groundComponents.length; i++) union.union(gnd0, terminalKey(groundComponents[i].id, 'gnd'));
  }
  const groundTerminal = groundComponents[0] ? getDef(groundComponents[0].type)?.terminals[0] : undefined;
  const reference = groundComponents.length && groundTerminal ? union.find(terminalKey(groundComponents[0].id, groundTerminal.id)) : null;
  return { netForTerminal: (componentId, terminalId) => { const root = union.find(terminalKey(componentId, terminalId)); return root === reference ? '0' : `n:${root}`; } };
}

/**
 * Net lookup from an explicit net table `{ netName: ['R1.a', 'V1.pos', ...] }` (the serverless request form). A terminal absent
 * from every net is floating and gets a private net of its own.
 */
export function netLookupFromNets(nets: Record<string, string[]>): NetLookup & { wired: Set<string> } {
  const byTerminal = new Map<string, string>();
  const wired = new Set<string>();
  for (const [net, terminals] of Object.entries(nets)) for (const terminal of terminals) { byTerminal.set(terminal, net); wired.add(terminal); }
  return { wired, netForTerminal: (componentId, terminalId) => byTerminal.get(terminalKey(componentId, terminalId)) ?? `n:${terminalKey(componentId, terminalId)}` };
}


const sanitizeProp = (value: unknown): string | number | boolean | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value); // "NaN" / "Infinity" survive JSON and are diagnosed by the engine
  if (typeof value === 'string') return value.length > 256 ? value.slice(0, 256) : value;
  if (typeof value === 'boolean') return value;
  return null;
};

/**
 * The electrical content of a schematic and nothing else: parts with their parameters, wire connectivity, and the net each
 * terminal sits on. Coordinates, rotations, routing, colours and symbols never leave the browser.
 */
export function describeCircuit(
  components: ReadonlyArray<Pick<CircuitComponent, 'id' | 'type' | 'label' | 'props' | 'state'>>,
  wires: ReadonlyArray<Pick<CircuitWire, 'id' | 'fromComp' | 'fromTerm' | 'toComp' | 'toTerm'>>,
  lookup: NetLookup = netLookupFromWires(components, wires),
): CircuitDescription {
  const grouped = new Map<string, string[]>();
  for (const component of components) {
    for (const terminal of getDef(component.type)?.terminals ?? []) {
      const net = lookup.netForTerminal(component.id, terminal.id);
      const members = grouped.get(net);
      if (members) members.push(terminalKey(component.id, terminal.id)); else grouped.set(net, [terminalKey(component.id, terminal.id)]);
    }
  }
  const nodes: NetTable = {};
  grouped.forEach((members, net) => { if (net === '0' || members.length > 1) nodes[net] = members; });
  return {
    components: components.map((component): ElectricalComponent => ({
      id: component.id,
      type: component.type,
      ...(component.label && component.label !== component.id ? { label: component.label } : {}),
      props: Object.fromEntries(Object.entries(component.props).map(([key, value]) => [key, sanitizeProp(value)])),
      ...(component.state?.isBurned ? { state: { isBurned: true } } : {}),
    })),
    wires: wires.map((wire): WireLink => [wire.id, wire.fromComp, wire.fromTerm, wire.toComp, wire.toTerm]),
    nodes,
  };
}
