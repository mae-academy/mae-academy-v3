import { getDef } from '@shared/circuit/componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from '@shared/circuit/circuitTypes';
import { NODAL_COLORS, type NodalNodeLabel } from '@shared/circuit/analysisTypes';
import { getTerminalWorldPos, type Point } from '@/simulators/circuit-engine/models/wiring';
import { NormalizedCircuitGraph } from '@/simulators/circuit-engine/models/NormalizedCircuitGraph';

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(value: string): string { const prior = this.parent.get(value); if (!prior) { this.parent.set(value, value); return value; } if (prior === value) return value; const root = this.find(prior); this.parent.set(value, root); return root; }
  union(left: string, right: string) { const a = this.find(left); const b = this.find(right); if (a !== b) this.parent.set(b, a); }
}

/**
 * Computes each visual net from the exact same terminal-union topology used by
 * MNA. Pins and every routed wire point on a net contribute to its centroid.
 */
export function compileNodalGeometry(components: CircuitComponent[], wires: CircuitWire[], normalizedGraph?: NormalizedCircuitGraph): NodalNodeLabel[] {
  if (normalizedGraph) {
    return normalizedGraph.essentialJunctions.sort((left, right) => left.net.localeCompare(right.net)).map((junction, index) => ({
      node: junction.net,
      index: index + 1,
      label: `V_${index + 1}`,
      color: NODAL_COLORS[index % NODAL_COLORS.length],
      centroid: junction.point,
      textOffset: junction.textOffset,
    }));
  }
  const union = new UnionFind();
  for (const component of components) for (const terminal of getDef(component.type)?.terminals ?? []) union.find(terminalKey(component.id, terminal.id));
  for (const wire of wires) union.union(terminalKey(wire.fromComp, wire.fromTerm), terminalKey(wire.toComp, wire.toTerm));
  const groundComponents = components.filter((component) => component.type === 'ground');
  if (groundComponents.length > 0) {
    const gnd0 = terminalKey(groundComponents[0].id, 'gnd');
    for (let i = 1; i < groundComponents.length; i++) {
      union.union(gnd0, terminalKey(groundComponents[i].id, 'gnd'));
    }
  }
  const groundTerminal = groundComponents[0] ? getDef(groundComponents[0].type)?.terminals[0] : undefined;
  const reference = groundComponents.length && groundTerminal ? union.find(terminalKey(groundComponents[0].id, groundTerminal.id)) : null;
  const pointsByRoot = new Map<string, Point[]>();
  const terminalCountByRoot = new Map<string, number>();
  const addPoint = (root: string, point: Point) => {
    if (root === reference) return;
    const points = pointsByRoot.get(root) ?? [];
    points.push(point); pointsByRoot.set(root, points);
  };
  for (const component of components) {
    const definition = getDef(component.type);
    for (const terminal of definition?.terminals ?? []) {
      const root = union.find(terminalKey(component.id, terminal.id));
      if (root !== reference) {
        terminalCountByRoot.set(root, (terminalCountByRoot.get(root) ?? 0) + 1);
      }
      addPoint(root, getTerminalWorldPos(component.x, component.y, terminal.x, terminal.y, component.rotation, component.flipH, component.flipV));
    }
  }
  for (const wire of wires) {
    const root = union.find(terminalKey(wire.fromComp, wire.fromTerm));
    wire.path.forEach((point) => addPoint(root, point));
  }
  return Array.from(pointsByRoot.entries())
    .filter(([root]) => (terminalCountByRoot.get(root) ?? 0) >= 2)
    .map(([root, points]) => ({ node: `n:${root}`, points }))
    .sort((left, right) => left.node.localeCompare(right.node))
    .map(({ node, points }, index) => ({
      node,
      index: index + 1,
      label: `V_${index + 1}`,
      color: NODAL_COLORS[index % NODAL_COLORS.length],
      centroid: [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, y]) => sum + y, 0) / points.length],
    }));
}
