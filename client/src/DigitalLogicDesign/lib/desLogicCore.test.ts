import { describe, expect, it } from 'vitest';
import { DFlipFlop, DiscreteEventLogicEngine, FullAdder, logicAnd, logicOr, logicPinsFor, logicXor, type LogicState } from './desLogicCore';
import type { CircuitComponent, CircuitWire } from './circuitTypes';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [10, 0]] });

describe('DES four-state algebra', () => {
  it('keeps deterministic bitwise results and propagates unknown states', () => { expect(logicAnd([1, 1])).toBe(1); expect(logicOr([0, 0])).toBe(0); expect(logicXor([1, 1, 1])).toBe(1); expect(logicAnd([1, 'Z'])).toBe('X'); });
  it('evaluates FullAdder directly with bitwise sum and carry', () => { const adder = new FullAdder('fa'); adder.setInput('a', 1); adder.setInput('b', 1); adder.setInput('cin', 1); adder.evaluate(); adder.commit(); expect(adder.getOutput('sum')).toBe(1); expect(adder.getOutput('cout')).toBe(1); });
  it('commits D flip-flop state only after an edge evaluation phase', () => { const ff = new DFlipFlop('d'); ff.setInput('d', 1); ff.setInput('clk', 0); ff.evaluate(); ff.commit(); expect(ff.getOutput('q')).toBe(0); ff.setInput('clk', 1); ff.evaluate(); ff.commit(); expect(ff.getOutput('q')).toBe(1); });
});

describe('DES directed topology', () => {
  it('propagates a full-adder result through output regardless of wire creation direction', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('a', 'digital-input', { state: 'HIGH' }), component('b', 'digital-input', { state: 'HIGH' }), component('c', 'digital-input', { state: 'HIGH' }), component('fa', 'logic-full-adder'), component('o', 'digital-output')], [wire('a', 'fa', 'a', 'a', 'out'), wire('b', 'fa', 'b', 'b', 'out'), wire('c', 'fa', 'cin', 'c', 'out'), wire('out', 'o', 'in', 'fa', 'sum')]);
    expect(engine.getSnapshot().terminalVoltages['o:in']).toBe(1);
  });
  it('evaluates standard AND and OR gates through the scheduled event queue', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('a', 'digital-input', { state: 'HIGH' }), component('b', 'digital-input', { state: 'HIGH' }), component('and', 'gate-and'), component('or', 'gate-or'), component('o', 'digital-output')], [wire('a', 'a', 'out', 'and', 'a'), wire('b', 'b', 'out', 'and', 'b'), wire('and-or', 'and', 'y', 'or', 'a'), wire('or-o', 'or', 'y', 'o', 'in')]);
    expect(engine.getSnapshot().terminalVoltages['o:in']).toBe(1);
  });
  it('evaluates all six scalable eight-input gate families from variable pin arrays', () => {
    const pins = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const createCircuit = (type: string, lowPin?: string) => {
      const inputs = pins.map(pin => component(`i-${pin}`, 'digital-input', { state: pin === lowPin ? 'LOW' : 'HIGH' }));
      return [inputs, [...inputs.map((input, index) => wire(`w-${pins[index]}`, input.id, 'out', 'g', pins[index])), wire('g-o', 'g', 'y', 'o', 'in')]] as const;
    };
    const result = (type: string, lowPin?: string) => {
      const circuit = createCircuit(type, lowPin);
      const engine = new DiscreteEventLogicEngine();
      engine.setCircuit([...circuit[0], component('g', type, { inputCount: 8 }), component('o', 'digital-output')], circuit[1]);
      return engine.getSnapshot().terminalVoltages['o:in'];
    };
    expect(result('gate-and')).toBe(1);
    expect(result('gate-and', 'h')).toBe(0);
    expect(result('gate-or', 'h')).toBe(1);
    expect(result('gate-nand')).toBe(0);
    expect(result('gate-nor')).toBe(0);
    expect(result('gate-xor')).toBe(0);
    expect(result('gate-xnor')).toBe(1);
  });
  it('evaluates a selector-scalable decoder, mux, and demux behaviorally without building internal gate objects', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([
      component('s0', 'digital-input', { state: 'HIGH' }), component('s1', 'digital-input', { state: 'LOW' }), component('s2', 'digital-input', { state: 'HIGH' }), component('en', 'digital-input', { state: 'HIGH' }), component('d5', 'digital-input', { state: 'HIGH' }), component('d', 'digital-input', { state: 'HIGH' }),
      component('decoder', 'logic-decoder', { selectorCount: 3 }), component('mux', 'logic-mux', { selectorCount: 3 }), component('demux', 'logic-demux', { selectorCount: 3 }),
    ], [
      ...['s0', 's1', 's2'].flatMap(id => [wire(`${id}-decoder`, id, 'out', 'decoder', id), wire(`${id}-mux`, id, 'out', 'mux', id), wire(`${id}-demux`, id, 'out', 'demux', id)]),
      wire('en-decoder', 'en', 'out', 'decoder', 'en'), wire('d5-mux', 'd5', 'out', 'mux', 'd5'), wire('d-demux', 'd', 'out', 'demux', 'd'),
    ]);
    const voltage = engine.getSnapshot().terminalVoltages;
    expect(voltage['decoder:y5']).toBe(1);
    expect(voltage['decoder:y4']).toBe(0);
    expect(voltage['mux:y']).toBe(1);
    expect(voltage['demux:y5']).toBe(1);
    expect(voltage['demux:y3']).toBe(0);
    expect(logicPinsFor(component('mux', 'logic-mux', { selectorCount: 3 })).inputs).toHaveLength(11);
    expect(logicPinsFor(component('decoder', 'logic-decoder', { selectorCount: 3 })).outputs).toHaveLength(8);
  });
  it('evaluates an eight-bit ripple-carry adder from dynamic bit lanes', () => {
    const engine = new DiscreteEventLogicEngine();
    const aInputs = Array.from({ length: 8 }, (_, bit) => component(`a${bit}`, 'digital-input', { state: 'HIGH' }));
    const bInputs = Array.from({ length: 8 }, (_, bit) => component(`b${bit}`, 'digital-input', { state: bit === 0 ? 'HIGH' : 'LOW' }));
    engine.setCircuit([...aInputs, ...bInputs, component('cin', 'digital-input', { state: 'LOW' }), component('adder', 'logic-nbit-adder', { bitWidth: 8 })], [
      ...aInputs.map((input, bit) => wire(`a${bit}-adder`, input.id, 'out', 'adder', `a${bit}`)),
      ...bInputs.map((input, bit) => wire(`b${bit}-adder`, input.id, 'out', 'adder', `b${bit}`)),
      wire('cin-adder', 'cin', 'out', 'adder', 'cin'),
    ]);
    const voltage = engine.getSnapshot().terminalVoltages;
    expect(Array.from({ length: 8 }, (_, bit) => voltage[`adder:sum${bit}`])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(voltage['adder:cout']).toBe(1);
    expect(logicPinsFor(component('adder', 'logic-nbit-adder', { bitWidth: 8 }))).toMatchObject({ inputs: expect.any(Array), outputs: expect.any(Array) });
    expect(logicPinsFor(component('adder', 'logic-nbit-adder', { bitWidth: 8 })).inputs).toHaveLength(17);
  });
  it('captures a four-bit register only on a rising clock edge and honors synchronous clear', () => {
    const run = (clear: 'LOW' | 'HIGH') => {
      const engine = new DiscreteEventLogicEngine();
      engine.setCircuit([
        component('d0', 'digital-input', { state: 'HIGH' }), component('d1', 'digital-input', { state: 'LOW' }), component('d2', 'digital-input', { state: 'HIGH' }), component('d3', 'digital-input', { state: 'LOW' }), component('clk', 'digital-input', { state: 'HIGH' }), component('clear', 'digital-input', { state: clear }), component('register', 'logic-nbit-register', { bitWidth: 4 }),
      ], [
        ...Array.from({ length: 4 }, (_, bit) => wire(`d${bit}-register`, `d${bit}`, 'out', 'register', `d${bit}`)),
        wire('clk-register', 'clk', 'out', 'register', 'clk'), wire('clear-register', 'clear', 'out', 'register', 'clear'),
      ]);
      return engine.getSnapshot().terminalVoltages;
    };
    expect([0, 1, 2, 3].map(bit => run('LOW')[`register:q${bit}`])).toEqual([1, 0, 1, 0]);
    expect([0, 1, 2, 3].map(bit => run('HIGH')[`register:q${bit}`])).toEqual([0, 0, 0, 0]);
    expect(logicPinsFor(component('register', 'logic-nbit-register', { bitWidth: 8 }))).toMatchObject({ inputs: expect.any(Array), outputs: expect.any(Array) });
    expect(logicPinsFor(component('register', 'logic-nbit-register', { bitWidth: 8 })).outputs).toHaveLength(8);
  });
  it('notifies wire observers only when a scheduled driver output commits, with its propagation timestamp', () => {
    const engine = new DiscreteEventLogicEngine();
    const transitions: Array<{ state: LogicState; atNs: number }> = [];
    engine.subscribeToWire('input-output', (state, atNs) => transitions.push({ state, atNs }));
    engine.setCircuit([component('a', 'digital-input', { state: 'HIGH', propagationDelayNs: 25 }), component('o', 'digital-output')], [wire('input-output', 'a', 'out', 'o', 'in')]);
    expect(transitions).toEqual([{ state: 1, atNs: 25 }]);
  });
  it('shifts data by one stage on a rising edge through a two-phase behavioral component', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('d', 'digital-input', { state: 'HIGH' }), component('clk', 'digital-input', { state: 'HIGH' }), component('shift', 'logic-shift-register')], [wire('d-shift', 'd', 'out', 'shift', 'd'), wire('clk-shift', 'clk', 'out', 'shift', 'clk')]);
    const voltage = engine.getSnapshot().terminalVoltages;
    expect(voltage['shift:q0']).toBe(1);
    expect(voltage['shift:q1']).toBe(0);
    expect(voltage['shift:q2']).toBe(0);
    expect(voltage['shift:q3']).toBe(0);
  });
  it('advances a counter from deterministic clock-period edges rather than browser frame count', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('clock', 'logic-clock', { clockPeriodMs: 1 }), component('counter', 'logic-counter')], [wire('clk-counter', 'clock', 'out', 'counter', 'clk')]);
    engine.step(0.00051);
    expect(engine.getSnapshot().terminalVoltages['counter:q0']).toBe(1);
    engine.step(0.001);
    expect(engine.getSnapshot().terminalVoltages['counter:q0']).toBe(0);
    expect(engine.getSnapshot().terminalVoltages['counter:q1']).toBe(1);
  });
});
