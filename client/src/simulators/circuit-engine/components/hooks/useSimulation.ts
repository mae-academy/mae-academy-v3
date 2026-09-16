import { useMemo } from 'react';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { MNAError, MNASolver, type MNAElement, type MNAResult } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NODAL_COLORS, type NodalNodeLabel } from '@/simulators/circuit-engine/models/analysisTypes';
import { getTerminalWorldPos, type Point } from '@/simulators/circuit-engine/models/wiring';
import { NormalizedCircuitGraph } from '@/simulators/circuit-engine/models/NormalizedCircuitGraph';

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
  const groundComponents = components.filter(component => component.type === 'ground');
  if (groundComponents.length > 0) {
    const gnd0 = terminalKey(groundComponents[0].id, 'gnd');
    for (let i = 1; i < groundComponents.length; i++) {
      union.union(gnd0, terminalKey(groundComponents[i].id, 'gnd'));
    }
  }
  const groundTerminal = groundComponents[0] ? getDef(groundComponents[0].type)?.terminals[0] : undefined;
  const reference = groundComponents.length && groundTerminal ? union.find(terminalKey(groundComponents[0].id, groundTerminal.id)) : null;
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
    if (component.type === 'resistor') elements.push({ type: 'resistor', id: component.id, label: component.label, positive: nodeFor(component, 'a'), negative: nodeFor(component, 'b'), resistance: number(component, 'resistance', 1000) });
    if (component.type === 'impedance') {
      const format = String(component.props.format ?? 'rectangular');
      let r = 0, x = 0;
      if (format === 'polar') {
        const mag = number(component, 'mag', 5);
        const angRaw = number(component, 'ang', 53.13);
        const isRad = String(component.props.angleUnit) === 'radian';
        const ang = isRad ? angRaw : angRaw * Math.PI / 180;
        r = mag * Math.cos(ang);
        x = mag * Math.sin(ang);
      } else {
        r = number(component, 'r', 3);
        x = number(component, 'x', 4);
      }
      const effectiveR = x < -1e-6 ? 1e12 : Math.max(1e-9, r); // DC: Cap is open, Inductor is short
      elements.push({ type: 'resistor', id: component.id, label: component.label, positive: nodeFor(component, 'a'), negative: nodeFor(component, 'b'), resistance: effectiveR });
    }
    if (component.type === 'dc-voltage') elements.push({ type: 'voltage', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), voltage: number(component, 'voltage', 12) });
    if (component.type === 'dc-rail') elements.push({ type: 'voltage', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: '0', voltage: number(component, 'voltage', 24) });
    if (component.type === 'dc-current') elements.push({ type: 'current', id: component.id, label: component.label, from: nodeFor(component, 'pos'), to: nodeFor(component, 'neg'), current: number(component, 'current', 1) });
    if (component.type === 'vccs' || component.type === 'vcvs') {
      const targetRef = String(component.props.targetId ?? component.props.controlSourceId ?? '');
      const controlComponent = components.find(c => c.id === targetRef || c.label === targetRef);
      let cp = '0';
      let cn = '0';
      if (controlComponent) {
        const def = getDef(controlComponent.type);
        const terms = def?.terminals ?? [];
        if (controlComponent.type === 'dc-rail') {
          cp = nodeFor(controlComponent, 'pos');
          cn = '0';
        } else if (terms.length >= 2) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = nodeFor(controlComponent, terms[1].id);
        } else if (terms.length === 1) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = '0';
        }
      }
      const gain = number(component, 'gain', number(component, 'transconductance', 0.001));
      if (component.type === 'vccs') elements.push({ type: 'vccs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlPositive: cp, controlNegative: cn, gain, transconductance: gain });
      else elements.push({ type: 'vcvs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlPositive: cp, controlNegative: cn, gain: number(component, 'gain', 2) });
    }
    if (component.type === 'cccs' || component.type === 'ccvs') {
      const targetRef = String(component.props.targetId ?? component.props.controlSourceId ?? '');
      const controlComponent = components.find(c => c.id === targetRef || c.label === targetRef);
      let cp = '0';
      let cn = '0';
      let targetResistance: number | undefined = undefined;
      if (controlComponent) {
        const def = getDef(controlComponent.type);
        const terms = def?.terminals ?? [];
        if (controlComponent.type === 'dc-rail') {
          cp = nodeFor(controlComponent, 'pos');
          cn = '0';
        } else if (terms.length >= 2) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = nodeFor(controlComponent, terms[1].id);
        } else if (terms.length === 1) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = '0';
        }
        if (controlComponent.type === 'resistor') {
          targetResistance = number(controlComponent, 'resistance', 1000);
        }
      }
      const gain = number(component, 'gain', number(component, 'transresistance', 1000));
      if (component.type === 'cccs') elements.push({ type: 'cccs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlSourceId: targetRef, targetId: targetRef, gain: number(component, 'gain', 1), controlPositive: cp, controlNegative: cn, targetResistance });
      else elements.push({ type: 'ccvs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlSourceId: targetRef, targetId: targetRef, gain, transresistance: gain, controlPositive: cp, controlNegative: cn, targetResistance });
    }
    if (component.type === 'potentiometer') {
      const a = nodeFor(component, 't1') ?? nodeFor(component, 'a');
      const b = nodeFor(component, 't2') ?? nodeFor(component, 'b');
      const w = nodeFor(component, 'wiper');
      const total = Math.max(1e-9, number(component, 'resistance', 10000));
      const rawWiper = number(component, 'wiper', 0.5);
      const wiper = Math.max(0, Math.min(1, rawWiper > 1 ? rawWiper / 100 : rawWiper));
      elements.push({ type: 'resistor', id: `${component.id}:ra`, positive: a, negative: w, resistance: Math.max(1e-9, total * wiper) });
      elements.push({ type: 'resistor', id: `${component.id}:rb`, positive: w, negative: b, resistance: Math.max(1e-9, total * (1 - wiper)) });
    }
    if (component.type === 'star-resistor-pack') {
      const center = `internal:${component.id}:star`;
      elements.push({ type: 'resistor', id: `${component.id}:ra`, positive: nodeFor(component, 'a'), negative: center, resistance: number(component, 'rA', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rb`, positive: nodeFor(component, 'b'), negative: center, resistance: number(component, 'rB', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rc`, positive: nodeFor(component, 'c'), negative: center, resistance: number(component, 'rC', 30) });
    }
    if (component.type === 'delta-resistor-pack') {
      const a = nodeFor(component, 'top') ?? nodeFor(component, 'a');
      const b = nodeFor(component, 'left') ?? nodeFor(component, 'b');
      const c = nodeFor(component, 'right') ?? nodeFor(component, 'c');
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
