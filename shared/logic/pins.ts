/** Pin catalogue of the logic components: which pins exist and which of them drive. Shared by the engine and the schematic UI. */
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { bitPinIdsFor, bitWidthFor, dataPinIdsFor, decoderOutputPinIdsFor, gateInputIdsFor, selectorPinIdsFor } from './dynamicLogicGeometry';

export interface LogicPinMap { inputs: string[]; outputs: string[]; }

export const LOGIC_COMPONENT_TYPES = new Set([
  'digital-input', 'digital-output', 'gate-and', 'gate-or', 'gate-not', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor',
  'logic-half-adder', 'logic-full-adder', 'logic-half-subtractor', 'logic-full-subtractor', 'logic-comparator', 'logic-encoder', 'logic-decoder', 'logic-mux', 'logic-demux', 'logic-nbit-adder', 'logic-parity', 'logic-alu-4bit',
  'logic-clock', 'logic-ff-sr', 'logic-ff-d', 'logic-ff-jk', 'logic-ff-t', 'logic-shift-register', 'logic-counter', 'logic-nbit-register', 'logic-ram-16x8', 'logic-rom-16x8', 'logic-frequency-divider',
]);

export const logicPinsFor = (component: Pick<CircuitComponent, 'type' | 'props'>): LogicPinMap => {
  const dynamicGateInputs = component.type === 'gate-not' ? ['a'] : gateInputIdsFor(component.type, component.props.inputCount);
  if (component.type === 'digital-input') return { inputs: [], outputs: ['out'] };
  if (component.type === 'digital-output') return { inputs: ['in'], outputs: [] };
  if (component.type.startsWith('gate-')) return { inputs: dynamicGateInputs, outputs: ['y'] };
  if (component.type === 'logic-half-adder' || component.type === 'logic-half-subtractor') return { inputs: ['a', 'b'], outputs: component.type === 'logic-half-adder' ? ['sum', 'carry'] : ['diff', 'borrow'] };
  if (component.type === 'logic-full-adder' || component.type === 'logic-full-subtractor') return { inputs: ['a', 'b', 'cin'], outputs: component.type === 'logic-full-adder' ? ['sum', 'cout'] : ['diff', 'bout'] };
  if (component.type === 'logic-comparator') return { inputs: ['a', 'b'], outputs: ['gt', 'eq', 'lt'] };
  if (component.type === 'logic-encoder') { const selectors = selectorPinIdsFor(component.props.selectorCount); return { inputs: dataPinIdsFor(component.props.selectorCount), outputs: [...selectors.map((_, bit) => `y${bit}`), 'valid'] }; }
  if (component.type === 'logic-decoder') { const selectors = selectorPinIdsFor(component.props.selectorCount); return { inputs: [...selectors, 'en'], outputs: decoderOutputPinIdsFor(component.props.selectorCount) }; }
  if (component.type === 'logic-mux') { const selectors = selectorPinIdsFor(component.props.selectorCount); return { inputs: [...dataPinIdsFor(component.props.selectorCount), ...selectors], outputs: ['y'] }; }
  if (component.type === 'logic-demux') { const selectors = selectorPinIdsFor(component.props.selectorCount); return { inputs: ['d', ...selectors], outputs: decoderOutputPinIdsFor(component.props.selectorCount) }; }
  if (component.type === 'logic-nbit-adder') { const width = bitWidthFor(component.props.bitWidth); return { inputs: [...bitPinIdsFor('a', width), ...bitPinIdsFor('b', width), 'cin'], outputs: [...bitPinIdsFor('sum', width), 'cout'] }; }
  if (component.type === 'logic-parity') return { inputs: ['d0', 'd1', 'd2', 'd3', 'p'], outputs: ['even', 'odd', 'valid'] };
  if (component.type === 'logic-alu-4bit') return { inputs: [...bitPinIdsFor('a', 4), ...bitPinIdsFor('b', 4), 'op0', 'op1', 'cin'], outputs: [...bitPinIdsFor('y', 4), 'cout', 'zero'] };
  if (component.type === 'logic-clock') return { inputs: [], outputs: ['out'] };
  if (component.type === 'logic-ff-sr') return { inputs: ['s', 'r', 'clk'], outputs: ['q', 'qn'] };
  if (component.type === 'logic-ff-d') return { inputs: ['d', 'clk'], outputs: ['q', 'qn'] };
  if (component.type === 'logic-ff-jk') return { inputs: ['j', 'k', 'clk'], outputs: ['q', 'qn'] };
  if (component.type === 'logic-ff-t') return { inputs: ['t', 'clk'], outputs: ['q', 'qn'] };
  if (component.type === 'logic-shift-register') return { inputs: ['d', 'clk'], outputs: ['q0', 'q1', 'q2', 'q3'] };
  if (component.type === 'logic-counter') return { inputs: ['clk', 'reset'], outputs: ['q0', 'q1', 'q2', 'q3'] };
  if (component.type === 'logic-nbit-register') { const width = bitWidthFor(component.props.bitWidth); return { inputs: [...bitPinIdsFor('d', width), 'clk', 'clear'], outputs: bitPinIdsFor('q', width) }; }
  if (component.type === 'logic-ram-16x8') return { inputs: [...bitPinIdsFor('a', 4), ...bitPinIdsFor('d', 8), 'we', 'oe', 'clk'], outputs: bitPinIdsFor('q', 8) };
  if (component.type === 'logic-rom-16x8') return { inputs: [...bitPinIdsFor('a', 4), 'oe'], outputs: bitPinIdsFor('q', 8) };
  if (component.type === 'logic-frequency-divider') return { inputs: ['clk', 'reset'], outputs: ['q'] };
  return { inputs: [], outputs: [] };
};


export const isJunctionNode = (id: string) => id.startsWith('junc_') || id.startsWith('junction') || id === 'junc';
/** Wires whose stored from→to direction runs against signal flow (output pin → input pin, through junctions). */
export const resolveReversedWires = (wires: readonly CircuitWire[], pins: Map<string, LogicPinMap>): Set<string> => {
  const key = (component: string, pin: string) => (isJunctionNode(component) ? component : `${component}:${pin}`);
  const adjacent = new Map<string, CircuitWire[]>();
  wires.forEach(wire => [key(wire.fromComp, wire.fromTerm), key(wire.toComp, wire.toTerm)].forEach(node => adjacent.set(node, [...(adjacent.get(node) ?? []), wire])));
  const reversed = new Set<string>();
  const seen = new Set<string>();
  const queue: string[] = [];
  wires.forEach(wire => [[wire.fromComp, wire.fromTerm], [wire.toComp, wire.toTerm]].forEach(([component, pin]) => {
    if (pins.get(component)?.outputs.includes(pin) && !seen.has(key(component, pin))) { seen.add(key(component, pin)); queue.push(key(component, pin)); }
  }));
  const done = new Set<string>();
  while (queue.length) {
    const node = queue.shift() as string;
    (adjacent.get(node) ?? []).forEach(wire => {
      if (done.has(wire.id)) return;
      done.add(wire.id);
      const fromNode = key(wire.fromComp, wire.fromTerm);
      const other = node === fromNode ? key(wire.toComp, wire.toTerm) : fromNode;
      if (node !== fromNode) reversed.add(wire.id);
      if (!seen.has(other)) { seen.add(other); queue.push(other); }
    });
  }
  return reversed;
};

