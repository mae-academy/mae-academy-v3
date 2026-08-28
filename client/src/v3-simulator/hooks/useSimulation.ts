import { useMemo } from 'react';
import { getDef } from '@/v3-simulator/lib/componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from '@/v3-simulator/lib/circuitTypes';
import { MNAError, MNASolver, type MNAElement, type MNAResult } from '@/v3-simulator/lib/mnaSolver';
import { NODAL_COLORS, type NodalNodeLabel } from '@/v3-simulator/lib/analysisTypes';
import { getTerminalWorldPos, type Point } from '@/v3-simulator/lib/wiring';
import { NormalizedCircuitGraph } from '@/v3-simulator/lib/NormalizedCircuitGraph';

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(value: string): string { const prior = this.parent.get(value); if (!prior) { this.parent.set(value, value); return value; } if (prior === value) return value; const root = this.find(prior); this.parent.set(value, root); return root; }
  union(left: string, right: string) { const a = this.find(left); const b = this.find(right); if (a !== b) this.parent.set(b, a); }
}

export interface TabBMnaState {
  result: MNAResult | null;
  error: string | null;
  elements: MNAElement[];
}

/** Converts the current Tab B canvas topology into a pure DC MNA system on every topology or value change. */
export function useSimulation(components: CircuitComponent[], wires: CircuitWire[], normalizedGraph?: NormalizedCircuitGraph): TabBMnaState {
  return useMemo(() => {
    try {
      const elements = compileDcTopology(components, wires, normalizedGraph);
      if (!elements.length) return { result: null, error: null, elements };
      return { result: new MNASolver(elements).solve(), error: null, elements };
    } catch (error) {
      return { result: null, error: error instanceof MNAError ? error.message : 'Invalid Circuit: MNA evaluation failed', elements: [] };
    }
  }, [components, wires, normalizedGraph]);
}

export function compileDcTopology(components: CircuitComponent[], wires: CircuitWire[], normalizedGraph?: NormalizedCircuitGraph): MNAElement[] {
  const union = new UnionFind();
  for (const component of components) for (const terminal of getDef(component.type)?.terminals ?? []) union.find(terminalKey(component.id, terminal.id));
  for (const wire of wires) union.union(terminalKey(wire.fromComp, wire.fromTerm), terminalKey(wire.toComp, wire.toTerm));
  const ground = components.find(component => component.type === 'ground');
  const groundTerminal = ground ? getDef(ground.type)?.terminals[0] : undefined;
  const reference = ground && groundTerminal ? union.find(terminalKey(ground.id, groundTerminal.id)) : null;
  const nodeFor = (component: CircuitComponent, terminal: string) => {
    if (normalizedGraph) return normalizedGraph.netForTerminal(component.id, terminal);
    const root = union.find(terminalKey(component.id, terminal));
    return root === reference ? '0' : `n:${root}`;
  };
  const number = (component: CircuitComponent, key: string, fallback: number) => {
    const value = Number(component.props[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  const elements: MNAElement[] = [];
  for (const component of components) {
    if (component.type === 'resistor') elements.push({ type: 'resistor', id: component.id, positive: nodeFor(component, 'a'), negative: nodeFor(component, 'b'), resistance: number(component, 'resistance', 1000) });
    if (component.type === 'dc-voltage') elements.push({ type: 'voltage', id: component.id, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), voltage: number(component, 'voltage', 12) });
    if (component.type === 'dc-rail') elements.push({ type: 'voltage', id: component.id, positive: nodeFor(component, 'pos'), negative: '0', voltage: number(component, 'voltage', 24) });
    if (component.type === 'dc-current') elements.push({ type: 'current', id: component.id, from: nodeFor(component, 'pos'), to: nodeFor(component, 'neg'), current: number(component, 'current', 1) });
    if (component.type === 'vccs') elements.push({ type: 'vccs', id: component.id, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlPositive: nodeFor(component, 'cp'), controlNegative: nodeFor(component, 'cn'), transconductance: number(component, 'transconductance', 0.001) });
    if (component.type === 'vcvs') elements.push({ type: 'vcvs', id: component.id, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlPositive: nodeFor(component, 'cp'), controlNegative: nodeFor(component, 'cn'), gain: number(component, 'gain', 2) });
    if (component.type === 'cccs' || component.type === 'ccvs') {
      // A zero-volt sense branch is valid only when it is explicitly inserted
      // in series by a topology editor. Stamping one across cp/cn here would
      // short a user net in parallel, so controlled sources reference a
      // selected existing voltage/current-sense branch instead.
      const controlSourceId = String(component.props.controlSourceId ?? '');
      if (component.type === 'cccs') elements.push({ type: 'cccs', id: component.id, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlSourceId, gain: number(component, 'gain', 1) });
      else elements.push({ type: 'ccvs', id: component.id, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlSourceId, transresistance: number(component, 'transresistance', 1000) });
    }
    if (component.type === 'star-resistor-pack') {
      const center = `internal:${component.id}:star`;
      elements.push({ type: 'resistor', id: `${component.id}:ra`, positive: nodeFor(component, 'a'), negative: center, resistance: number(component, 'rA', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rb`, positive: nodeFor(component, 'b'), negative: center, resistance: number(component, 'rB', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rc`, positive: nodeFor(component, 'c'), negative: center, resistance: number(component, 'rC', 30) });
    }
    if (component.type === 'delta-resistor-pack') {
      const a = nodeFor(component, 'a'); const b = nodeFor(component, 'b'); const c = nodeFor(component, 'c');
      elements.push({ type: 'resistor', id: `${component.id}:rab`, positive: a, negative: b, resistance: number(component, 'rAB', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rbc`, positive: b, negative: c, resistance: number(component, 'rBC', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rca`, positive: c, negative: a, resistance: number(component, 'rCA', 30) });
    }
  }
  return elements;
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
    }));
  }
  const union = new UnionFind();
  for (const component of components) for (const terminal of getDef(component.type)?.terminals ?? []) union.find(terminalKey(component.id, terminal.id));
  for (const wire of wires) union.union(terminalKey(wire.fromComp, wire.fromTerm), terminalKey(wire.toComp, wire.toTerm));
  const ground = components.find((component) => component.type === 'ground');
  const groundTerminal = ground ? getDef(ground.type)?.terminals[0] : undefined;
  const reference = ground && groundTerminal ? union.find(terminalKey(ground.id, groundTerminal.id)) : null;
  const pointsByRoot = new Map<string, Point[]>();
  const addPoint = (root: string, point: Point) => {
    if (root === reference) return;
    const points = pointsByRoot.get(root) ?? [];
    points.push(point); pointsByRoot.set(root, points);
  };
  for (const component of components) {
    const definition = getDef(component.type);
    for (const terminal of definition?.terminals ?? []) {
      const root = union.find(terminalKey(component.id, terminal.id));
      addPoint(root, getTerminalWorldPos(component.x, component.y, terminal.x, terminal.y, component.rotation, component.flipH, component.flipV));
    }
  }
  for (const wire of wires) {
    const root = union.find(terminalKey(wire.fromComp, wire.fromTerm));
    wire.path.forEach((point) => addPoint(root, point));
  }
  return Array.from(pointsByRoot.entries()).map(([root, points]) => ({ node: `n:${root}`, points })).sort((left, right) => left.node.localeCompare(right.node)).map(({ node, points }, index) => ({
    node,
    index: index + 1,
    label: `V_${index + 1}`,
    color: NODAL_COLORS[index % NODAL_COLORS.length],
    centroid: [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, y]) => sum + y, 0) / points.length],
  }));
}
