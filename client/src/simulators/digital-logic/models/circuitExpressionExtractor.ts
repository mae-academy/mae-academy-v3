/**
 * Bi-directional Boolean ⇄ schematic engine.
 * - Circuit → expression: back-propagates from a chosen `digital-output` through junction-aware
 *   nets into a Boolean AST (flip-flop outputs become state variables with next-state equations).
 * - Expression → circuit: lowers an AST into a gate netlist and lays it out in grid-snapped
 *   stages (inputs · inversion layer · term gates · output); wire geometry is left to the canvas router.
 */
import { nanoid } from 'nanoid';
import type { CircuitComponent, CircuitWire } from '@shared/logic/circuitTypes';
import { nextComponentLabel } from '@shared/logic/circuitTypes';
import { getDef } from '@shared/logic/componentDefs';
import { getLogicComponentBounds } from '@shared/logic/logicGateContract';
import { logicPinsFor } from '@shared/logic/pins';
import { DYNAMIC_GATE_MAX_INPUTS, gateInputIdsFor } from '@shared/logic/dynamicLogicGeometry';
import type { SynthesisDiagram, SynthesisMode } from '@shared/logic/synthesisTypes';
import { astToAscii, parseBooleanExpression, type ASTNode } from '@shared/logic/logicEngine';

export const MAX_CIRCUIT_VARIABLES = 8;
export const LAYOUT_GRID = 25;
export const LAYOUT_COLUMN_PITCH = 175;
export const LAYOUT_INPUT_PITCH = 75;
export const APPEND_GAP = 250;

const isJunction = (id: string) => id.startsWith('junc_') || id.startsWith('junction') || id === 'junc';
const snap = (value: number) => Math.round(value / LAYOUT_GRID) * LAYOUT_GRID;
const NOT = (node: ASTNode): ASTNode => ({ type: 'NOT', left: node, negationStyle: 'postfix' });
const binary = (type: 'AND' | 'OR' | 'XOR', operands: ASTNode[]): ASTNode =>
  operands.reduce((left, right) => ({ type, left, right }));
const variable = (name: string): ASTNode => ({ type: 'VARIABLE', value: name });
const constant = (value: '0' | '1'): ASTNode => ({ type: 'CONSTANT', value });

/* ───────────────────────────── Circuit → expression ───────────────────────────── */

export class ExtractionError extends Error {}

export interface StateEquation {
  /** State variable letter standing for the flip-flop's Q output. */
  state: string;
  flipFlop: string;
  /** Next-state equation Q⁺ in formula-bar ASCII. */
  expression: string;
}

export interface ExtractionResult {
  outputLabel: string;
  expression: string;
  variables: string[];
  stateEquations: StateEquation[];
  /** Inputs whose labels were not single letters and received canonical names. */
  renamedInputs: Record<string, string>;
}

/** Every placed logic output, in label order (F_1, F_2, …). */
export const listCircuitOutputs = (components: readonly CircuitComponent[]): CircuitComponent[] =>
  components.filter(component => component.type === 'digital-output')
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

/** Union-find over pin terminals so T-junction segments resolve to one shared net. */
const buildNets = (wires: readonly CircuitWire[]) => {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    if (!parent.has(key)) parent.set(key, key);
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(key, root);
    return root;
  };
  const key = (component: string, pin: string) => (isJunction(component) ? component : `${component}:${pin}`);
  wires.forEach(wire => {
    const a = find(key(wire.fromComp, wire.fromTerm));
    const b = find(key(wire.toComp, wire.toTerm));
    if (a !== b) parent.set(a, b);
  });
  const members = new Map<string, string[]>();
  parent.forEach((_, member) => {
    const root = find(member);
    members.set(root, [...(members.get(root) ?? []), member]);
  });
  return { netOf: (component: string, pin: string) => find(key(component, pin)), members: (net: string) => members.get(net) ?? [] };
};

/** Letter sequence reserved for flip-flop state variables (kept clear of input letters). */
const STATE_LETTERS = 'QPONMLKJIZYXWVUTSR'.split('');

export function extractCircuitExpression(
  components: readonly CircuitComponent[],
  wires: readonly CircuitWire[],
  outputId?: string,
): ExtractionResult {
  const outputs = listCircuitOutputs(components);
  const output = outputId ? outputs.find(candidate => candidate.id === outputId) : outputs[0];
  if (!output) throw new ExtractionError('No digital output (e.g. F₁, F₂) found on canvas');
  const byId = new Map(components.map(component => [component.id, component]));
  const nets = buildNets(wires);

  // Canonical input names: a single-letter label is the variable itself (inputs sharing a letter are
  // the same signal, as with net labels); other labels take the next free letter, top-to-bottom.
  const inputs = components.filter(component => component.type === 'digital-input').sort((a, b) => a.y - b.y || a.x - b.x);
  const inputName = new Map<string, string>();
  const renamedInputs: Record<string, string> = {};
  const used = new Set<string>();
  inputs.forEach(input => {
    const label = input.label.trim().toUpperCase();
    if (/^[A-Z]$/.test(label)) { inputName.set(input.id, label); used.add(label); }
  });
  inputs.forEach(input => {
    const label = input.label.trim();
    if (inputName.has(input.id) || label === '0' || label === '1') return;
    const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(candidate => !used.has(candidate));
    if (!letter) throw new ExtractionError('Too many distinct inputs to name.');
    inputName.set(input.id, letter);
    used.add(letter);
    renamedInputs[input.label] = letter;
  });

  const stateName = new Map<string, string>();
  const pendingFlipFlops: CircuitComponent[] = [];
  const stateFor = (flipFlop: CircuitComponent) => {
    const existing = stateName.get(flipFlop.id);
    if (existing) return existing;
    const letter = STATE_LETTERS.find(candidate => !used.has(candidate));
    if (!letter) throw new ExtractionError('Too many state variables to name.');
    used.add(letter);
    stateName.set(flipFlop.id, letter);
    pendingFlipFlops.push(flipFlop);
    return letter;
  };

  const memo = new Map<string, ASTNode>();
  const onStack = new Set<string>();

  const driverOf = (componentId: string, pin: string): { component: CircuitComponent; pin: string } | null => {
    const drivers = nets.members(nets.netOf(componentId, pin)).flatMap(member => {
      if (isJunction(member)) return [];
      const separator = member.lastIndexOf(':');
      const component = byId.get(member.slice(0, separator));
      const memberPin = member.slice(separator + 1);
      return component && logicPinsFor(component).outputs.includes(memberPin) ? [{ component, pin: memberPin }] : [];
    });
    if (drivers.length > 1) throw new ExtractionError(`Net feeding ${byId.get(componentId)?.label ?? componentId}.${pin} has ${drivers.length} conflicting drivers.`);
    return drivers[0] ?? null;
  };

  const inputExpression = (component: CircuitComponent, pin: string, floating: '0' | '1'): ASTNode => {
    const driver = driverOf(component.id, pin);
    return driver ? traceDriver(driver.component, driver.pin) : constant(floating);
  };

  const traceDriver = (component: CircuitComponent, pin: string): ASTNode => {
    const memoKey = `${component.id}:${pin}`;
    const cached = memo.get(memoKey);
    if (cached) return cached;
    let node: ASTNode;
    if (component.type === 'digital-input') {
      const label = component.label.trim();
      node = label === '0' || label === '1' ? constant(label) : variable(inputName.get(component.id) as string);
    } else if (component.type.startsWith('logic-ff-')) {
      const state = variable(stateFor(component));
      node = pin === 'qn' ? NOT(state) : state;
    } else if (component.type.startsWith('gate-')) {
      if (onStack.has(component.id)) {
        throw new ExtractionError(`Combinational feedback loop through ${component.label}: the output has no stable Boolean expression. Break the loop with a flip-flop.`);
      }
      onStack.add(component.id);
      const pins = logicPinsFor(component).inputs;
      const family = component.type.replace('gate-', '');
      const identity: '0' | '1' = family === 'and' || family === 'nand' ? '1' : '0';
      const operands = pins.map(inputPin => inputExpression(component, inputPin, identity));
      onStack.delete(component.id);
      if (family === 'not') node = NOT(operands[0]);
      else if (family === 'buffer') node = operands[0];
      else {
        const operator = family === 'and' || family === 'nand' ? 'AND' : family === 'xor' || family === 'xnor' ? 'XOR' : 'OR';
        const core = binary(operator, operands);
        node = family === 'nand' || family === 'nor' || family === 'xnor' ? NOT(core) : core;
      }
    } else {
      throw new ExtractionError(`${component.label} (${getDef(component.type)?.name ?? component.type}) cannot be expressed as a combinational Boolean function.`);
    }
    memo.set(memoKey, node);
    return node;
  };

  const root = inputExpression(output, 'in', '0');
  if (!driverOf(output.id, 'in')) throw new ExtractionError(`Output ${output.label} is not connected to any gate or input.`);

  // Next-state equations; tracing a flip-flop's inputs can reveal further flip-flops.
  const stateEquations: StateEquation[] = [];
  for (let index = 0; index < pendingFlipFlops.length; index += 1) {
    const flipFlop = pendingFlipFlops[index];
    const q = variable(stateName.get(flipFlop.id) as string);
    const input = (pin: string) => inputExpression(flipFlop, pin, '0');
    const next: ASTNode = flipFlop.type === 'logic-ff-d' ? input('d')
      : flipFlop.type === 'logic-ff-t' ? binary('XOR', [input('t'), q])
      : flipFlop.type === 'logic-ff-jk' ? binary('OR', [binary('AND', [input('j'), NOT(q)]), binary('AND', [NOT(input('k')), q])])
      : binary('OR', [input('s'), binary('AND', [NOT(input('r')), q])]);
    stateEquations.push({ state: q.value as string, flipFlop: flipFlop.label, expression: astToAscii(next) });
  }

  const expression = astToAscii(root);
  return { outputLabel: output.label, expression, variables: parseBooleanExpression(expression).variables, stateEquations, renamedInputs };
}

/** Compatibility wrapper: expression string for the first (or named) output, or null. */
export function extractBooleanExpression(components: CircuitComponent[], wires: CircuitWire[], targetOutputLabel = 'F_1'): string | null {
  const outputs = listCircuitOutputs(components);
  const target = outputs.find(output => output.label === targetOutputLabel || output.label === targetOutputLabel.replace('_', '')) ?? outputs[0];
  if (!target) return null;
  try {
    return extractCircuitExpression(components, wires, target.id).expression;
  } catch {
    return null;
  }
}

/* ───────────────────────────── Expression → netlist ───────────────────────────── */

export type NetRef = { kind: 'input'; name: string } | { kind: 'gate'; id: string } | { kind: 'constant'; value: '0' | '1' };

export interface NetlistGate {
  id: string;
  type: string;
  inputs: NetRef[];
}

export interface LogicNetlist {
  inputs: string[];
  gates: NetlistGate[];
  output: NetRef;
}

const refKey = (ref: NetRef) => (ref.kind === 'input' ? `i:${ref.name}` : ref.kind === 'gate' ? `g:${ref.id}` : `c:${ref.value}`);

/** Builds a structurally shared netlist; same-operator chains flatten into one gate (≤ 8 inputs, then balanced). */
export function netlistFromAst(ast: ASTNode): LogicNetlist {
  const gates: NetlistGate[] = [];
  const shared = new Map<string, NetRef>();
  const inputs = new Set<string>();

  const addGate = (type: string, operands: NetRef[]): NetRef => {
    const key = `${type}(${operands.map(refKey).join(',')})`;
    const existing = shared.get(key);
    if (existing) return existing;
    const id = `g${gates.length + 1}`;
    gates.push({ id, type, inputs: operands });
    const ref: NetRef = { kind: 'gate', id };
    shared.set(key, ref);
    return ref;
  };
  const flatten = (node: ASTNode, type: ASTNode['type']): ASTNode[] =>
    node.type === type && node.left && node.right ? [...flatten(node.left, type), ...flatten(node.right, type)] : [node];
  const wide = (type: string, operands: NetRef[], invert: boolean): NetRef => {
    let level = operands;
    while (level.length > DYNAMIC_GATE_MAX_INPUTS) {
      const chunks = Math.ceil(level.length / DYNAMIC_GATE_MAX_INPUTS);
      const size = Math.ceil(level.length / chunks);
      level = Array.from({ length: chunks }, (_, index) => addGate(`gate-${type}`, level.slice(index * size, (index + 1) * size)));
    }
    return addGate(`gate-${invert ? `n${type}` : type}`.replace('gate-nxor', 'gate-xnor'), level);
  };

  const lower = (node: ASTNode): NetRef => {
    if (node.type === 'VARIABLE') { inputs.add(node.value as string); return { kind: 'input', name: node.value as string }; }
    if (node.type === 'CONSTANT') return { kind: 'constant', value: node.value === '1' ? '1' : '0' };
    if (node.type === 'NOT') {
      const child = node.left as ASTNode;
      if (child.type === 'AND' || child.type === 'OR' || child.type === 'XOR') {
        return wide(child.type.toLowerCase(), flatten(child, child.type).map(lower), true);
      }
      return addGate('gate-not', [lower(child)]);
    }
    return wide(node.type.toLowerCase(), flatten(node, node.type).map(lower), false);
  };

  const output = lower(ast);
  if (inputs.size > MAX_CIRCUIT_VARIABLES) throw new Error(`Maximum ${MAX_CIRCUIT_VARIABLES} input variables (A–H) supported.`);
  return { inputs: Array.from(inputs).sort(), gates, output };
}

/* ───────────────────────────── Netlist → placed schematic ───────────────────────────── */

export interface GeneratedCircuit {
  components: CircuitComponent[];
  wires: CircuitWire[];
}

const partBounds = (component: CircuitComponent) => {
  const definition = getDef(component.type);
  return definition ? getLogicComponentBounds(component, definition) : { width: 50, height: 50 };
};

/**
 * Stage layout on the 25px grid: inputs at x = 0 (75px pitch, or wider when tall gates need it),
 * input inverters at x = 175, every further gate one column right of its deepest operand, output last.
 * Wires carry topology only; the canvas router computes collision-free orthogonal paths.
 */
export function layoutNetlist(netlist: LogicNetlist, outputLabel = 'F_1'): GeneratedCircuit {
  const components: CircuitComponent[] = [];
  const wires: CircuitWire[] = [];
  const place = (type: string, label: string, x: number, y: number, props: Record<string, unknown>): CircuitComponent => {
    const component: CircuitComponent = { id: nanoid(10), type, x: snap(x), y: snap(y), rotation: 0, flipH: false, flipV: false, label, props };
    components.push(component);
    return component;
  };

  const inputPitch = LAYOUT_INPUT_PITCH;
  const sources = new Map<string, CircuitComponent>();
  netlist.inputs.forEach((name, index) => sources.set(`i:${name}`, place('digital-input', name, 0, index * inputPitch, { state: 'LOW' })));
  const constantSource = (value: '0' | '1') => {
    const key = `c:${value}`;
    if (!sources.has(key)) sources.set(key, place('digital-input', value, 0, (netlist.inputs.length + (value === '1' ? 1 : 0)) * inputPitch, { state: value === '1' ? 'HIGH' : 'LOW' }));
    return sources.get(key) as CircuitComponent;
  };
  const sourceFor = (ref: NetRef): CircuitComponent => (ref.kind === 'constant' ? constantSource(ref.value) : sources.get(refKey(ref)) as CircuitComponent);

  // Column assignment: single-source gates straight off an input form the inversion layer (column 1).
  const gateById = new Map(netlist.gates.map(gate => [gate.id, gate]));
  const column = new Map<string, number>();
  const columnOf = (ref: NetRef): number => {
    if (ref.kind !== 'gate') return 0;
    const cached = column.get(ref.id);
    if (cached !== undefined) return cached;
    const gate = gateById.get(ref.id) as NetlistGate;
    const distinct = new Set(gate.inputs.map(refKey));
    const isInputInverter = distinct.size === 1 && gate.inputs[0].kind !== 'gate';
    const value = isInputInverter ? 1 : Math.max(2, 1 + Math.max(...gate.inputs.map(columnOf)));
    column.set(ref.id, value);
    return value;
  };
  netlist.gates.forEach(gate => columnOf({ kind: 'gate', id: gate.id }));

  // Constants are placed lazily below the inputs; create them before gates need their y.
  netlist.gates.forEach(gate => gate.inputs.forEach(ref => { if (ref.kind === 'constant') constantSource(ref.value); }));

  const placedGates = new Map<string, CircuitComponent>();
  const yOf = (ref: NetRef) => (ref.kind === 'gate' ? (placedGates.get(ref.id) as CircuitComponent).y : sourceFor(ref).y);
  const maxColumn = Math.max(0, ...Array.from(column.values()));
  const usedLabels: CircuitComponent[] = [];
  for (let col = 1; col <= maxColumn; col += 1) {
    const inColumn = netlist.gates.filter(gate => column.get(gate.id) === col)
      .map(gate => ({ gate, desired: gate.inputs.reduce((sum, ref) => sum + yOf(ref), 0) / gate.inputs.length }))
      .sort((a, b) => a.desired - b.desired);
    let floor = -Infinity;
    inColumn.forEach(({ gate, desired }) => {
      const inputCount = gate.type === 'gate-not' ? undefined : Math.max(2, gate.inputs.length);
      const probe: CircuitComponent = { id: '', type: gate.type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: '', props: inputCount ? { inputCount } : {} };
      const half = partBounds(probe).height / 2;
      const y = snap(Math.max(desired, floor + half));
      const label = nextComponentLabel(gate.type, usedLabels);
      const component = place(gate.type, label, col * LAYOUT_COLUMN_PITCH, y, probe.props);
      usedLabels.push(component);
      placedGates.set(gate.id, component);
      floor = component.y + half + LAYOUT_GRID;
    });
  }

  const outputComponent = place('digital-output', outputLabel, (maxColumn + 1) * LAYOUT_COLUMN_PITCH, yOf(netlist.output), {});
  const componentFor = (ref: NetRef) => (ref.kind === 'gate' ? placedGates.get(ref.id) as CircuitComponent : sourceFor(ref));
  const connect = (from: NetRef, to: CircuitComponent, pin: string) => {
    const source = componentFor(from);
    wires.push({ id: nanoid(10), fromComp: source.id, fromTerm: source.type === 'digital-input' ? 'out' : 'y', toComp: to.id, toTerm: pin, routing: 'orthogonal', path: [] });
  };

  netlist.gates.forEach(gate => {
    const component = placedGates.get(gate.id) as CircuitComponent;
    // Pins are assigned top-to-bottom by operand height so wires fan in without crossing; a
    // single-operand universal gate has its inputs tied together (NAND/NOR used as an inverter).
    const operands = [...gate.inputs].sort((a, b) => yOf(a) - yOf(b));
    if (gate.type === 'gate-not') { connect(operands[0], component, 'a'); return; }
    const pins = gateInputIdsFor(gate.type, Math.max(2, operands.length));
    pins.forEach((pin, index) => connect(operands[Math.min(index, operands.length - 1)], component, pin));
  });
  connect(netlist.output, outputComponent, 'in');
  return { components, wires };
}

/** Parses the formula bar expression and produces a laid-out schematic (inputs A–H, gates, F_1). */
export function generateCircuitFromExpression(source: string, outputLabel = 'F_1'): GeneratedCircuit {
  const parsed = parseBooleanExpression(source);
  if (parsed.variables.length > MAX_CIRCUIT_VARIABLES) throw new Error(`Maximum ${MAX_CIRCUIT_VARIABLES} input variables (A–H) supported.`);
  return layoutNetlist(netlistFromAst(parsed.ast), outputLabel);
}

/* ───────────────────────────── Placement on an existing canvas ───────────────────────────── */

export type CircuitPlacementMode = 'replace' | 'append';

/**
 * Replace: centre the generated circuit on (0, 0).
 * Append: shift it right of the existing work (max X + 250px), keep its top aligned, and relabel
 * gates/output so references (U…, F_…) stay unique across the workspace.
 */
export function placeGeneratedCircuit(
  existing: readonly CircuitComponent[],
  generated: GeneratedCircuit,
  mode: CircuitPlacementMode,
): GeneratedCircuit {
  if (generated.components.length === 0) return generated;
  const xs = generated.components.map(component => component.x);
  const ys = generated.components.map(component => component.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let dx: number;
  let dy: number;
  if (mode === 'replace' || existing.length === 0) {
    dx = snap(-(minX + maxX) / 2);
    dy = snap(-(minY + maxY) / 2);
  } else {
    const existingMaxX = Math.max(...existing.map(component => component.x + partBounds(component).width / 2));
    const existingMinY = Math.min(...existing.map(component => component.y));
    dx = snap(existingMaxX + APPEND_GAP - minX);
    dy = snap(existingMinY - minY);
  }
  const labelPool: CircuitComponent[] = mode === 'append' ? [...existing] : [];
  const components = generated.components.map(component => {
    const relabel = mode === 'append' && component.type !== 'digital-input';
    const moved = { ...component, x: component.x + dx, y: component.y + dy, label: relabel ? nextComponentLabel(component.type, labelPool) : component.label };
    labelPool.push(moved);
    return moved;
  });
  return { components, wires: generated.wires.map(wire => ({ ...wire, path: [] })) };
}

/**
 * Lowers a synthesized universal-gate diagram into the shared schematic netlist and lays it out with
 * the same staged engine as Generate Circuit, using ONLY NAND (or NOR) gates. A single-operand
 * universal gate is emitted with both inputs tied together so no pin floats.
 */
export const synthesisDiagramToCircuit = (diagram: SynthesisDiagram): GeneratedCircuit => {
  const nodeById = new Map(diagram.nodes.map(node => [node.id, node]));
  const refFor = (nodeId: string): NetRef => {
    const node = nodeById.get(nodeId);
    if (!node) throw new Error('Malformed synthesis diagram.');
    if (node.kind === 'gate') return { kind: 'gate', id: node.id };
    if (node.label === '0' || node.label === '1') return { kind: 'constant', value: node.label };
    return { kind: 'input', name: node.label };
  };
  const gateType = diagram.mode === 'NAND' ? 'gate-nand' : 'gate-nor';
  const gates: NetlistGate[] = diagram.nodes.filter(node => node.kind === 'gate').map(node => {
    const inputs = diagram.wires.filter(wire => wire.to === node.id).map(wire => refFor(wire.from));
    if (inputs.length > DYNAMIC_GATE_MAX_INPUTS) throw new Error(`A ${inputs.length}-input ${diagram.mode} exceeds the ${DYNAMIC_GATE_MAX_INPUTS}-input gate limit; minimize the expression first.`);
    return { id: node.id, type: gateType, inputs: inputs.length === 1 ? [inputs[0], inputs[0]] : inputs };
  });
  const outputNode = diagram.nodes.find(node => node.kind === 'output');
  const outputWire = diagram.wires.find(wire => wire.to === outputNode?.id);
  if (!outputWire) throw new Error('Malformed synthesis diagram.');
  const inputs = diagram.nodes.filter(node => node.kind === 'input' && node.label !== '0' && node.label !== '1').map(node => node.label).sort();
  return layoutNetlist({ inputs, gates, output: refFor(outputWire.from) });
};
