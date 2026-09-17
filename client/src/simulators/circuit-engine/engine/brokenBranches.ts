import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { terminalKey } from '@/simulators/circuit-engine/models/circuitTypes';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';

/**
 * Checks if a component is physically open (non-conductive between its terminals),
 * due to burnout, an open switch, blown fuse, or released button.
 */
export function isComponentOpen(component: CircuitComponent): boolean {
  if (component.state?.isBurned) return true;
  const props = component.props ?? {};
  const state = component.state ?? {};

  if (state.isBurned || state.isOpen === true || props.isOpen === true || props.open === true) {
    return true;
  }
  if (props.closed === false || state.closed === false) {
    return true;
  }
  if (props.manualState === 'open') {
    return true;
  }

  const type = component.type;

  // Latching SPST switches, pushbuttons, circuit breakers
  if (type === 'sw-spst-no' || type === 'circuit-breaker') {
    if (props.state === 'open' || props.state === 'released') return true;
    if (props.state !== 'closed') return true;
  }
  if (type === 'pb-no') {
    if (props.state !== 'pressed') return true;
  }
  if (type === 'sw-spst-nc') {
    if (props.state === 'open' || props.state === 'released') return true;
  }
  if (type === 'pb-nc') {
    if (props.state === 'pressed' || props.state === 'open') return true;
  }
  if (type === 'switch-spst' || type === 'switch') {
    if (props.closed === false || props.open === true || props.state === 'open') return true;
  }

  // Fuses
  if (type === 'fuse' && (Boolean(state.isBlown) || Boolean(props.blown))) {
    return true;
  }

  // Deactivated current source (open-circuit branch in superposition)
  if ((type === 'dc-current' || type === 'current') && Number(props.current) === 0) {
    return true;
  }

  return false;
}

/**
 * Identifies all wire IDs that belong to a broken or open branch (any branch containing
 * a burned component or an open switch).
 */
export function getBrokenWireIds(
  components: CircuitComponent[],
  wires: CircuitWire[]
): Set<string> {
  const brokenWires = new Set<string>();
  if (!components.length || !wires.length) return brokenWires;

  const componentMap = new Map<string, CircuitComponent>();
  for (const comp of components) {
    componentMap.set(comp.id, comp);
  }

  // Map each terminalKey to all connected wires
  const wireByTerminal = new Map<string, CircuitWire[]>();
  for (const wire of wires) {
    const from = terminalKey(wire.fromComp, wire.fromTerm);
    const to = terminalKey(wire.toComp, wire.toTerm);

    const fromList = wireByTerminal.get(from) ?? [];
    fromList.push(wire);
    wireByTerminal.set(from, fromList);

    const toList = wireByTerminal.get(to) ?? [];
    toList.push(wire);
    wireByTerminal.set(to, toList);
  }

  // Find all components with open/burned terminals
  const openComponents = components.filter(c => isComponentOpen(c));
  if (openComponents.length === 0) return brokenWires;

  // For each open component, traverse from each of its terminals along the series branch
  for (const openComp of openComponents) {
    const def = getDef(openComp.type);
    const terminals = def?.terminals ?? [];

    for (const term of terminals) {
      const startKey = terminalKey(openComp.id, term.id);
      const queue: string[] = [startKey];
      const visitedTerminals = new Set<string>([startKey]);

      while (queue.length > 0) {
        const currTerminal = queue.shift()!;
        const connectedWires = wireByTerminal.get(currTerminal) ?? [];

        for (const wire of connectedWires) {
          if (brokenWires.has(wire.id)) continue;
          brokenWires.add(wire.id);

          const fromKey = terminalKey(wire.fromComp, wire.fromTerm);
          const toKey = terminalKey(wire.toComp, wire.toTerm);
          const otherKey = fromKey === currTerminal ? toKey : fromKey;

          if (visitedTerminals.has(otherKey)) continue;
          visitedTerminals.add(otherKey);

          // Check if otherKey is a junction or continues series branch
          const wiresAtOther = (wireByTerminal.get(otherKey) ?? []).length;
          if (wiresAtOther > 1) {
            // Multiple wires meet at this node: branch junction, stop expanding
            continue;
          }

          const [otherCompId, otherPinId] = otherKey.split(':');
          const otherComp = componentMap.get(otherCompId);
          if (!otherComp) continue;

          // Ground is reference node junction
          if (otherComp.type === 'ground') continue;

          // Another open/burned component: dead end, stop
          if (isComponentOpen(otherComp)) continue;

          // Multi-terminal devices (3+ terminals) act as branch split/junctions
          const otherDef = getDef(otherComp.type);
          const otherTerms = otherDef?.terminals ?? [];
          if (otherTerms.length !== 2) continue;

          // 2-terminal series component: traverse through to its opposite terminal
          const nextTerm = otherTerms.find(t => t.id !== otherPinId);
          if (!nextTerm) continue;

          const nextKey = terminalKey(otherComp.id, nextTerm.id);
          if (visitedTerminals.has(nextKey)) continue;
          visitedTerminals.add(nextKey);

          const wiresAtNext = (wireByTerminal.get(nextKey) ?? []).length;
          if (wiresAtNext === 1) {
            // Exactly 1 wire leaves the other side: continues in series
            queue.push(nextKey);
          }
          // If > 1 wires leave, it's a junction so this branch ends here.
        }
      }
    }
  }

  return brokenWires;
}
