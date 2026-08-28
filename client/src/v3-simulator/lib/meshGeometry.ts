import { getDef } from './componentDefs';
import { type CircuitComponent, type CircuitWire } from './circuitTypes';
import { getTerminalWorldPos, type Point } from './wiring';
import { NormalizedCircuitGraph } from './NormalizedCircuitGraph';

export interface MeshBranchGeometry {
  /** MNA element id; the path is oriented from the element's positive to negative terminal. */
  id: string;
  path: Point[];
}

export interface MeshWireGeometry {
  id: string;
  path: Point[];
}

export interface MeshGeometry {
  branches: MeshBranchGeometry[];
  wires: MeshWireGeometry[];
  graph?: NormalizedCircuitGraph;
}

function terminal(component: CircuitComponent, terminalId: string): Point | null {
  const definition = getDef(component.type);
  const item = definition?.terminals.find((candidate) => candidate.id === terminalId);
  if (!item) return null;
  return getTerminalWorldPos(component.x, component.y, item.x, item.y, component.rotation, component.flipH, component.flipV);
}

/**
 * Preserves visual branch direction for Mesh Analysis. A branch is deliberately
 * oriented positive-to-negative so a clockwise traversal can classify a source
 * unambiguously as a voltage drop (+ → −) or a rise (− → +).
 */
export function compileMeshGeometry(components: CircuitComponent[], wires: CircuitWire[], normalizedGraph?: NormalizedCircuitGraph): MeshGeometry {
  const graph = normalizedGraph ?? NormalizedCircuitGraph.fromCanvas(components, wires);
  const groundIds = new Set(components.filter((component) => component.type === 'ground').map((component) => component.id));
  const branches = components.flatMap<MeshBranchGeometry>((component) => {
    const terminalIds = component.type === 'resistor'
      ? ['a', 'b'] as const
      : component.type === 'dc-voltage' || component.type === 'dc-current'
        ? ['pos', 'neg'] as const
        : null;
    if (!terminalIds) return [];
    const positive = terminal(component, terminalIds[0]);
    const negative = terminal(component, terminalIds[1]);
    return positive && negative ? [{ id: component.id, path: [positive, negative] }] : [];
  });
  // A ground symbol is an electrical reference for MNA, but its visual stub is
  // not a boundary of a planar mesh face. Keeping it in the half-edge graph
  // makes face discovery depend on where the user drew GND. MNA still receives
  // the complete wire set through compileDcTopology; only visual face geometry
  // excludes wires that terminate at a ground component.
  const faceWires = wires.filter((wire) => wire.path.length > 1 && !groundIds.has(wire.fromComp) && !groundIds.has(wire.toComp));
  return { branches, wires: faceWires.map((wire) => ({ id: wire.id, path: wire.path })), graph };
}
