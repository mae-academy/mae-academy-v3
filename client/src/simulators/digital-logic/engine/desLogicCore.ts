/**
 * Digital Logic Design — discrete-event simulation core.
 * This module is deliberately independent of React state and analogue/MNA math.
 */
import type { CircuitComponent, CircuitWire, SimulationSnapshot, SimulationWarning } from '@/simulators/digital-logic/models/circuitTypes';
import { terminalKey } from '@/simulators/digital-logic/models/circuitTypes';
import { SimulationEngine } from '@/simulators/digital-logic/engine/simulation';
import { bitPinIdsFor, bitWidthFor, dataPinIdsFor, decoderOutputPinIdsFor, gateInputIdsFor, selectorPinIdsFor } from '@/simulators/digital-logic/components/dynamicLogicGeometry';

export type LogicState = 0 | 1 | 'Z' | 'X';
export type LogicStateListener = (next: LogicState, atNs: number) => void;

export const asLogicState = (value: unknown): LogicState => value === 1 || value === '1' || value === true || value === 'HIGH' ? 1 : value === 0 || value === '0' || value === false || value === 'LOW' ? 0 : value === 'Z' || value === 'X' ? value : 'X';
export const invertLogic = (value: LogicState): LogicState => value === 0 ? 1 : value === 1 ? 0 : value === 'Z' ? 'X' : 'X';
export const logicAnd = (values: LogicState[]): LogicState => values.some(value => value === 0) ? 0 : values.every(value => value === 1) ? 1 : 'X';
export const logicOr = (values: LogicState[]): LogicState => values.some(value => value === 1) ? 1 : values.every(value => value === 0) ? 0 : 'X';
export const logicXor = (values: LogicState[]): LogicState => values.some(value => value !== 0 && value !== 1) ? 'X' : (values.reduce<number>((total, value) => total ^ Number(value), 0) as LogicState);
export const resolveLogicDrivers = (values: LogicState[]): LogicState => {
  const active = values.filter(value => value !== 'Z');
  if (active.length === 0) return 'Z';
  if (active.some(value => value === 'X')) return 'X';
  return active.every(value => value === active[0]) ? active[0] : 'X';
};

export interface LogicEvent { id: number; atNs: number; delta: number; targetId: string; phase: 'evaluate' | 'commit'; }
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

export abstract class LogicComponent {
  readonly inputs = new Map<string, LogicState>();
  readonly outputs = new Map<string, LogicState>();
  protected nextOutputs = new Map<string, LogicState>();
  protected lastClock: LogicState = 0;

  constructor(readonly id: string, readonly pinMap: LogicPinMap, readonly propagationDelayNs = 10) {
    pinMap.inputs.forEach(pin => this.inputs.set(pin, 0));
    pinMap.outputs.forEach(pin => this.outputs.set(pin, 0));
  }

  setInput(pin: string, value: LogicState) { if (this.inputs.has(pin)) this.inputs.set(pin, value); }
  stageOutput(pin: string, value: LogicState) { if (this.outputs.has(pin)) this.nextOutputs.set(pin, value); }
  getOutput(pin: string) { return this.outputs.get(pin) ?? 'X'; }
  abstract evaluate(): Map<string, LogicState>;
  commit() { const changed = new Map<string, LogicState>(); this.nextOutputs.forEach((value, pin) => { if (this.outputs.get(pin) !== value) changed.set(pin, value); this.outputs.set(pin, value); }); this.nextOutputs.clear(); return changed; }
}

export class FullAdder extends LogicComponent {
  constructor(id: string, delayNs = 10) { super(id, { inputs: ['a', 'b', 'cin'], outputs: ['sum', 'cout'] }, delayNs); }
  evaluate() { const a = asLogicState(this.inputs.get('a')); const b = asLogicState(this.inputs.get('b')); const cin = asLogicState(this.inputs.get('cin')); this.nextOutputs.set('sum', logicXor([a, b, cin])); this.nextOutputs.set('cout', logicOr([logicAnd([a, b]), logicAnd([cin, logicXor([a, b])])])); return new Map(this.nextOutputs); }
}

export class DFlipFlop extends LogicComponent {
  private nextState: LogicState = 0;
  constructor(id: string, delayNs = 10) { super(id, { inputs: ['d', 'clk'], outputs: ['q', 'qn'] }, delayNs); }
  evaluate() { const clk = asLogicState(this.inputs.get('clk')); if (this.lastClock === 0 && clk === 1) this.nextState = asLogicState(this.inputs.get('d')); this.lastClock = clk; this.nextOutputs.set('q', this.nextState); this.nextOutputs.set('qn', invertLogic(this.nextState)); return new Map(this.nextOutputs); }
}

class BehavioralLogicComponent extends LogicComponent {
  private state: LogicState[];
  private pendingState: LogicState[] | null = null;
  private memory: LogicState[][] | null = null;
  private pendingMemory: LogicState[][] | null = null;
  private dividerCount = 0;
  private dividerOutput: LogicState = 0;
  private clockLevel: LogicState = 0;
  constructor(id: string, private readonly type: string, pinMap: LogicPinMap, delayNs: number, private readonly props: Record<string, unknown> = {}) {
    super(id, pinMap, delayNs);
    const stateWidth = type === 'logic-nbit-register' || type === 'logic-shift-register' || type === 'logic-counter' ? pinMap.outputs.length : 4;
    this.state = Array.from({ length: stateWidth }, () => 0 as LogicState);
    if (type === 'logic-ram-16x8') this.memory = Array.from({ length: 16 }, () => Array.from({ length: 8 }, () => 0 as LogicState));
  }
  override commit() {
    const changed = super.commit();
    if (this.pendingState) { this.state = this.pendingState; this.pendingState = null; }
    if (this.pendingMemory) { this.memory = this.pendingMemory; this.pendingMemory = null; }
    return changed;
  }
  evaluate() {
    const read = (pin: string) => asLogicState(this.inputs.get(pin));
    const out = (pin: string, value: LogicState) => this.nextOutputs.set(pin, value);
    const binary = (pin: string) => read(pin) === 1 ? 1 : 0;
    const selectorIndex = (selectors: string[]) => selectors.reduce<number | null>((index, pin, bit) => {
      const value = read(pin);
      return index === null || (value !== 0 && value !== 1) ? null : index | (value << bit);
    }, 0);
    const wordAtAddress = (address: number) => Array.from({ length: 8 }, (_, bit) => ((address >> bit) & 1) as LogicState);
    if (this.type.startsWith('gate-')) {
      const inputs = this.pinMap.inputs.map(read);
      const result = this.type === 'gate-and' ? logicAnd(inputs)
        : this.type === 'gate-or' ? logicOr(inputs)
          : this.type === 'gate-not' ? invertLogic(inputs[0] ?? 'X')
            : this.type === 'gate-nand' ? invertLogic(logicAnd(inputs))
              : this.type === 'gate-nor' ? invertLogic(logicOr(inputs))
                : this.type === 'gate-xor' ? logicXor(inputs)
                  : invertLogic(logicXor(inputs));
      out('y', result);
    }
    else if (this.type === 'logic-half-adder') { out('sum', logicXor([read('a'), read('b')])); out('carry', logicAnd([read('a'), read('b')])); }
    else if (this.type === 'logic-full-adder') { const a = read('a'); const b = read('b'); const cin = read('cin'); out('sum', logicXor([a, b, cin])); out('cout', logicOr([logicAnd([a, b]), logicAnd([cin, logicXor([a, b])])])); }
    else if (this.type === 'logic-half-subtractor') { out('diff', logicXor([read('a'), read('b')])); out('borrow', logicAnd([invertLogic(read('a')), read('b')])); }
    else if (this.type === 'logic-full-subtractor') { const a = read('a'); const b = read('b'); const bin = read('cin'); out('diff', logicXor([a, b, bin])); out('bout', logicOr([logicAnd([invertLogic(a), b]), logicAnd([bin, invertLogic(logicXor([a, b]))])])); }
    else if (this.type === 'logic-comparator') { const a = binary('a'); const b = binary('b'); out('gt', a > b ? 1 : 0); out('eq', a === b ? 1 : 0); out('lt', a < b ? 1 : 0); }
    else if (this.type === 'logic-encoder') {
      const dataPins = this.pinMap.inputs;
      const encodedPins = this.pinMap.outputs.filter(pin => pin.startsWith('y'));
      const states = dataPins.map(read);
      const active = states.flatMap((value, index) => value === 1 ? [index] : []);
      const uncertain = states.some(value => value === 'X' || value === 'Z');
      if (uncertain || active.length > 1) { encodedPins.forEach(pin => out(pin, 'X')); out('valid', 'X'); }
      else if (active.length === 0) { encodedPins.forEach(pin => out(pin, 0)); out('valid', 0); }
      else { encodedPins.forEach((pin, bit) => out(pin, ((active[0] >> bit) & 1) as LogicState)); out('valid', 1); }
    }
    else if (this.type === 'logic-decoder') {
      const selectors = this.pinMap.inputs.filter(pin => pin.startsWith('s'));
      const outputs = this.pinMap.outputs;
      const index = selectorIndex(selectors);
      const enabled = read('en');
      outputs.forEach((pin, outputIndex) => out(pin, enabled === 0 ? 0 : enabled !== 1 || index === null ? 'X' : outputIndex === index ? 1 : 0));
    }
    else if (this.type === 'logic-mux') { const index = selectorIndex(this.pinMap.inputs.filter(pin => pin.startsWith('s'))); out('y', index === null ? 'X' : read(`d${index}`)); }
    else if (this.type === 'logic-demux') { const index = selectorIndex(this.pinMap.inputs.filter(pin => pin.startsWith('s'))); this.pinMap.outputs.forEach((pin, outputIndex) => out(pin, index === null ? 'X' : outputIndex === index ? read('d') : 0)); }
    else if (this.type === 'logic-nbit-adder') {
      let carry = read('cin');
      this.pinMap.outputs.filter(pin => pin.startsWith('sum')).forEach((pin, bit) => {
        const a = read(`a${bit}`); const b = read(`b${bit}`);
        out(pin, logicXor([a, b, carry]));
        carry = logicOr([logicAnd([a, b]), logicAnd([a, carry]), logicAnd([b, carry])]);
      });
      out('cout', carry);
    }
    else if (this.type === 'logic-parity') {
      const dataParity = logicXor(['d0', 'd1', 'd2', 'd3'].map(read));
      out('even', dataParity);
      out('odd', invertLogic(dataParity));
      out('valid', invertLogic(logicXor([...['d0', 'd1', 'd2', 'd3'].map(read), read('p')])));
    }
    else if (this.type === 'logic-alu-4bit') {
      const op = selectorIndex(['op0', 'op1']);
      const a = bitPinIdsFor('a', 4).map(read); const b = bitPinIdsFor('b', 4).map(read);
      let result: LogicState[] = Array.from({ length: 4 }, () => 'X' as LogicState); let carry: LogicState = 'X';
      if (op === 0 || op === 1) {
        carry = op === 0 ? read('cin') : invertLogic(read('cin'));
        result = a.map((aBit, bit) => { const bBit = op === 0 ? b[bit] : invertLogic(b[bit]); const sum = logicXor([aBit, bBit, carry]); carry = logicOr([logicAnd([aBit, bBit]), logicAnd([aBit, carry]), logicAnd([bBit, carry])]); return sum; });
      } else if (op === 2) { result = a.map((value, bit) => logicAnd([value, b[bit]])); carry = 0; }
      else if (op === 3) { result = a.map((value, bit) => logicOr([value, b[bit]])); carry = 0; }
      result.forEach((value, bit) => out(`y${bit}`, value));
      out('cout', carry);
      out('zero', invertLogic(logicOr(result)));
    }
    else if (this.type === 'logic-clock') { out('out', this.clockLevel); }
    else if (this.type === 'logic-ff-d' || this.type === 'logic-ff-sr' || this.type === 'logic-ff-jk' || this.type === 'logic-ff-t') { const clk = read('clk'); if (this.lastClock === 0 && clk === 1) { let next = this.state[0]; if (this.type === 'logic-ff-d') next = read('d'); if (this.type === 'logic-ff-sr') { const s = read('s'); const r = read('r'); next = s === 1 && r === 0 ? 1 : r === 1 && s === 0 ? 0 : s === 1 && r === 1 ? 'X' : next; } if (this.type === 'logic-ff-jk') { const j = read('j'); const k = read('k'); next = j === 1 && k === 0 ? 1 : j === 0 && k === 1 ? 0 : j === 1 && k === 1 ? invertLogic(next) : next; } if (this.type === 'logic-ff-t' && read('t') === 1) next = invertLogic(next); this.state[0] = next; } this.lastClock = clk; out('q', this.state[0]); out('qn', invertLogic(this.state[0])); }
    else if (this.type === 'logic-shift-register') { const clk = read('clk'); if (this.lastClock === 0 && clk === 1) this.state = [read('d'), this.state[0], this.state[1], this.state[2]]; this.lastClock = clk; this.state.forEach((value, idx) => out(`q${idx}`, value)); }
    else if (this.type === 'logic-counter') { const clk = read('clk'); if (read('reset') === 1) this.state = [0, 0, 0, 0]; else if (this.lastClock === 0 && clk === 1) { const number = this.state.reduce<number>((total, value, idx) => total | ((value === 1 ? 1 : 0) << idx), 0); this.state = [0, 1, 2, 3].map(idx => ((number + 1) >> idx & 1) as LogicState); } this.lastClock = clk; this.state.forEach((value, idx) => out(`q${idx}`, value)); }
    else if (this.type === 'logic-nbit-register') {
      const clk = read('clk');
      let visibleState = this.state;
      if (this.lastClock === 0 && clk === 1) {
        const clear = read('clear');
        const next: LogicState[] = clear === 1 ? this.state.map(() => 0 as LogicState) : clear === 0 ? this.state.map((_, bit) => read(`d${bit}`)) : this.state.map(() => 'X' as LogicState);
        this.pendingState = next;
        visibleState = next;
      }
      this.lastClock = clk;
      visibleState.forEach((value, bit) => out(`q${bit}`, value));
    }
    else if (this.type === 'logic-ram-16x8') {
      const address = selectorIndex(bitPinIdsFor('a', 4)); const clk = read('clk'); let visibleMemory = this.memory;
      if (this.lastClock === 0 && clk === 1 && read('we') === 1 && address !== null && this.memory) {
        const next = this.memory.map(word => [...word]); next[address] = bitPinIdsFor('d', 8).map(read); this.pendingMemory = next; visibleMemory = next;
      }
      this.lastClock = clk;
      const oe = read('oe'); const word = address === null || !visibleMemory ? null : visibleMemory[address];
      this.pinMap.outputs.forEach((pin, bit) => out(pin, oe === 0 ? 'Z' : oe === 1 && word ? word[bit] : 'X'));
    }
    else if (this.type === 'logic-rom-16x8') {
      const address = selectorIndex(bitPinIdsFor('a', 4)); const oe = read('oe'); const word = address === null ? null : wordAtAddress(address);
      this.pinMap.outputs.forEach((pin, bit) => out(pin, oe === 0 ? 'Z' : oe === 1 && word ? word[bit] : 'X'));
    }
    else if (this.type === 'logic-frequency-divider') {
      const clk = read('clk'); const divisor = [2, 4, 8, 16].includes(Number(this.props.divideBy)) ? Number(this.props.divideBy) : 2;
      if (read('reset') === 1) { this.dividerCount = 0; this.dividerOutput = 0; }
      else if (this.lastClock === 0 && clk === 1) { this.dividerCount = (this.dividerCount + 1) % (divisor / 2); if (this.dividerCount === 0) this.dividerOutput = invertLogic(this.dividerOutput); }
      this.lastClock = clk;
      out('q', this.dividerOutput);
    }
    return new Map(this.nextOutputs);
  }
  toggleClock() { this.clockLevel = invertLogic(this.clockLevel); }
}

const createLogicComponent = (component: CircuitComponent): LogicComponent => {
  const pins = logicPinsFor(component); const delay = Math.max(0, Number(component.props.propagationDelayNs ?? 10));
  if (component.type === 'logic-full-adder') return new FullAdder(component.id, delay);
  if (component.type === 'logic-ff-d') return new DFlipFlop(component.id, delay);
  return new BehavioralLogicComponent(component.id, component.type, pins, delay, component.props);
};

interface DirectedConnection { wire: CircuitWire; driver: string; driverPin: string; receiver: string; receiverPin: string; }
const resolveConnection = (wire: CircuitWire, pins: Map<string, LogicPinMap>): DirectedConnection | null => {
  const from = pins.get(wire.fromComp); const to = pins.get(wire.toComp); if (!from || !to) return null;
  const fromOutput = from.outputs.includes(wire.fromTerm); const toOutput = to.outputs.includes(wire.toTerm); if (fromOutput === toOutput) return null;
  return fromOutput ? { wire, driver: wire.fromComp, driverPin: wire.fromTerm, receiver: wire.toComp, receiverPin: wire.toTerm } : { wire, driver: wire.toComp, driverPin: wire.toTerm, receiver: wire.fromComp, receiverPin: wire.fromTerm };
};

export class DiscreteEventLogicEngine extends SimulationEngine {
  private logicComponents: CircuitComponent[] = [];
  private runtimes = new Map<string, LogicComponent>();
  private connections: DirectedConnection[] = [];
  private events: LogicEvent[] = [];
  private sequence = 0;
  private nowNs = 0;
  private readonly nextClockEdgeNs = new Map<string, number>();
  private snapshot: SimulationSnapshot = this.makeLogicSnapshot();
  private readonly subscribers = new Map<string, Set<LogicStateListener>>();
  private eventBudgetReached = false;
  private readonly maxEventsPerFlush = 20_000;
  private readonly initialSettleNs = 10_000;

  subscribeToWire(wireId: string, listener: LogicStateListener) { const set = this.subscribers.get(wireId) ?? new Set<LogicStateListener>(); set.add(listener); this.subscribers.set(wireId, set); return () => set.delete(listener); }
  override setCircuit(components: CircuitComponent[], wires: CircuitWire[]) {
    this.logicComponents = components.filter(component => LOGIC_COMPONENT_TYPES.has(component.type)).map(component => ({ ...component, props: { ...component.props } }));
    this.runtimes = new Map(this.logicComponents.map(component => [component.id, createLogicComponent(component)]));
    const pins = new Map(this.logicComponents.map(component => [component.id, logicPinsFor(component)]));
    this.connections = wires.map(wire => resolveConnection(wire, pins)).filter((wire): wire is DirectedConnection => Boolean(wire));
    this.events = []; this.sequence = 0; this.nowNs = 0; this.nextClockEdgeNs.clear(); this.eventBudgetReached = false;
    this.logicComponents.forEach(component => { if (component.type === 'digital-input') this.runtimes.get(component.id)?.setInput('state', asLogicState(component.props.state)); this.schedule(component.id, 0, 'evaluate'); });
    this.flush(this.initialSettleNs);
    this.logicComponents.filter(component => component.type === 'logic-clock').forEach(component => {
      const halfPeriod = this.clockHalfPeriodNs(component);
      this.nextClockEdgeNs.set(component.id, halfPeriod);
    });
  }
  override reset() { this.events = []; this.nowNs = 0; this.nextClockEdgeNs.clear(); this.snapshot = this.makeLogicSnapshot(); }
  override getSnapshot() { return this.snapshot; }
  override getTime() { return this.nowNs / 1_000_000_000; }
  getLogicState(componentId: string, pin: string): LogicState {
    const runtime = this.runtimes.get(componentId);
    if (!runtime) return 'X';
    return runtime.pinMap.outputs.includes(pin) ? runtime.getOutput(pin) : runtime.inputs.get(pin) ?? 'X';
  }
  getWireLogicState(wireId: string): LogicState {
    const conn = this.connections.find(c => c.wire.id === wireId);
    if (!conn) return 'X';
    return this.runtimes.get(conn.driver)?.getOutput(conn.driverPin) ?? 'X';
  }
  toggleDigitalInput(componentId: string) {
    const source = this.logicComponents.find(c => c.id === componentId && c.type === 'digital-input');
    if (!source) return this.snapshot;
    const currentState = asLogicState(source.props.state);
    const nextState: LogicState = currentState === 1 ? 0 : 1;
    return this.driveDigitalInput(componentId, nextState);
  }
  driveDigitalInput(componentId: string, value: LogicState) {
    const source = this.logicComponents.find(component => component.id === componentId && component.type === 'digital-input');
    const runtime = this.runtimes.get(componentId);
    if (!source || !runtime) throw new Error(`Unknown Digital Logic input: ${componentId}`);
    source.props.state = value;
    runtime.setInput('state', value);
    this.schedule(componentId, 0, 'evaluate');
    this.eventBudgetReached = false;
    this.flush(this.nowNs + this.initialSettleNs);
    return this.snapshot;
  }
  override step(elapsedSeconds = 1 / 1000) {
    const targetNs = this.nowNs + Math.max(0, elapsedSeconds * 1_000_000_000);
    let guard = 0;
    while (guard++ < 100_000) {
      const due = Array.from(this.nextClockEdgeNs.entries()).filter(([, atNs]) => atNs <= targetNs).sort((a, b) => a[1] - b[1])[0];
      if (!due) break;
      const [componentId, atNs] = due;
      this.nowNs = atNs;
      const runtime = this.runtimes.get(componentId);
      const component = this.logicComponents.find(entry => entry.id === componentId);
      if (runtime instanceof BehavioralLogicComponent && component) {
        runtime.toggleClock();
        this.schedule(componentId, 0, 'evaluate');
        this.flush(atNs);
        this.nextClockEdgeNs.set(componentId, atNs + this.clockHalfPeriodNs(component));
      } else this.nextClockEdgeNs.delete(componentId);
    }
    this.eventBudgetReached = false;
    this.flush(targetNs);
    if (!this.eventBudgetReached) this.nowNs = targetNs;
    this.snapshot = { ...this.snapshot, time: this.getTime() };
    return this.snapshot;
  }

  private schedule(targetId: string, delayNs: number, phase: LogicEvent['phase']) { this.events.push({ id: this.sequence++, atNs: this.nowNs + delayNs, delta: phase === 'commit' ? 1 : 0, targetId, phase }); this.events.sort((a, b) => a.atNs - b.atNs || a.delta - b.delta || a.id - b.id); }
  private clockHalfPeriodNs(component: CircuitComponent) { return Math.max(1, Number(component.props.clockPeriodMs ?? 250) * 500_000); }
  private flush(untilNs = Number.POSITIVE_INFINITY) {
    let guard = 0;
    while (this.events.length && this.events[0].atNs <= untilNs && guard++ < this.maxEventsPerFlush) {
      const event = this.events.shift()!; this.nowNs = Math.max(this.nowNs, event.atNs); const runtime = this.runtimes.get(event.targetId); if (!runtime) continue;
      if (event.phase === 'evaluate') { this.feedInputs(event.targetId); runtime.evaluate(); this.schedule(event.targetId, runtime.propagationDelayNs, 'commit'); }
      else { const changed = runtime.commit(); changed.forEach((value, pin) => this.propagate(event.targetId, pin, value)); }
    }
    this.eventBudgetReached = Boolean(this.events.length && this.events[0].atNs <= untilNs && guard >= this.maxEventsPerFlush);
    this.snapshot = this.createSnapshot();
  }
  private feedInputs(componentId: string) {
    const runtime = this.runtimes.get(componentId); if (!runtime) return;
    const source = this.logicComponents.find(component => component.id === componentId);
    if (source?.type === 'digital-input') runtime.stageOutput('out', asLogicState(source.props.state));
    const valuesByReceiverPin = new Map<string, LogicState[]>();
    this.connections.filter(connection => connection.receiver === componentId).forEach(connection => {
      const value = this.runtimes.get(connection.driver)?.getOutput(connection.driverPin) ?? 'X';
      const values = valuesByReceiverPin.get(connection.receiverPin) ?? [];
      values.push(value); valuesByReceiverPin.set(connection.receiverPin, values);
    });
    valuesByReceiverPin.forEach((values, pin) => runtime.setInput(pin, resolveLogicDrivers(values)));
  }
  private propagate(driverId: string, driverPin: string, value: LogicState) { this.connections.filter(connection => connection.driver === driverId && connection.driverPin === driverPin).forEach(connection => { this.subscribers.get(connection.wire.id)?.forEach(listener => listener(value, this.nowNs)); this.schedule(connection.receiver, 0, 'evaluate'); }); }
  private makeLogicSnapshot(): SimulationSnapshot { return { time: 0, nodeVoltages: {}, terminalVoltages: {}, branchCurrents: {}, wireCurrents: {}, componentPowered: {}, componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: {}, warnings: [], converged: true }; }
  private createSnapshot() { const terminalVoltages: Record<string, number> = {}; const componentPowered: Record<string, boolean> = {}; const wireCurrents: Record<string, number> = {}; const warnings: SimulationWarning[] = [];
    this.runtimes.forEach((runtime, id) => runtime.pinMap.outputs.forEach(pin => { const value = runtime.getOutput(pin); terminalVoltages[terminalKey(id, pin)] = value === 1 ? 1 : 0; componentPowered[id] = componentPowered[id] || value === 1; }));
    this.connections.forEach(connection => { const value = this.runtimes.get(connection.driver)?.getOutput(connection.driverPin) ?? 'X'; wireCurrents[connection.wire.id] = value === 1 ? 1 : 0; terminalVoltages[terminalKey(connection.receiver, connection.receiverPin)] = value === 1 ? 1 : 0; if (value === 'X') warnings.push({ code: 'logic-unknown', message: `Unknown logic state on ${connection.wire.id}` }); });
    const driversByReceiverPin = new Map<string, LogicState[]>();
    this.connections.forEach(connection => { const key = terminalKey(connection.receiver, connection.receiverPin); const values = driversByReceiverPin.get(key) ?? []; values.push(this.runtimes.get(connection.driver)?.getOutput(connection.driverPin) ?? 'X'); driversByReceiverPin.set(key, values); });
    driversByReceiverPin.forEach((values, pin) => { if (values.length > 1 && resolveLogicDrivers(values) === 'X') warnings.push({ code: 'logic-driver-conflict', message: `Conflicting logic drivers at ${pin}` }); });
    if (this.eventBudgetReached) warnings.push({ code: 'logic-event-budget', message: 'Feedback activity exceeded the event budget for this simulation slice; remaining events are queued.' });
    this.logicComponents.filter(component => component.type === 'digital-output').forEach(component => {
      const value = this.runtimes.get(component.id)?.inputs.get('in') ?? 'X';
      terminalVoltages[terminalKey(component.id, 'in')] = value === 1 ? 1 : 0;
      componentPowered[component.id] = value === 1;
    });
    return { time: this.getTime(), nodeVoltages: {}, terminalVoltages, branchCurrents: {}, wireCurrents, componentPowered, componentIntensity: Object.fromEntries(Object.entries(componentPowered).map(([id, powered]) => [id, powered ? 1 : 0])), nodeHistory: {}, branchHistory: {}, instrumentReadings: {}, warnings, converged: warnings.length === 0 };
  }
}
