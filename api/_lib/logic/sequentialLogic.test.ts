import { describe, expect, it } from 'vitest';
import { DiscreteEventLogicEngine } from './desLogicCore';
import type { CircuitComponent, CircuitWire } from '../../../shared/logic/circuitTypes';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });
const pulse = (engine: DiscreteEventLogicEngine, clock = 'clk') => { engine.driveDigitalInput(clock, 1); engine.driveDigitalInput(clock, 0); };

describe('Sequential edge-triggered DES components', () => {
  it('updates D Flip-Flop only at a rising edge and holds Q while D changes', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('d', 'digital-input', { state: 'LOW' }), component('clk', 'digital-input', { state: 'LOW' }), component('ff', 'logic-ff-d')], [wire('d', 'd', 'out', 'ff', 'd'), wire('clk', 'clk', 'out', 'ff', 'clk')]);
    engine.driveDigitalInput('d', 1); expect(engine.getLogicState('ff', 'q')).toBe(0);
    pulse(engine); expect(engine.getLogicState('ff', 'q')).toBe(1);
    engine.driveDigitalInput('d', 0); expect(engine.getLogicState('ff', 'q')).toBe(1);
  });

  it('handles JK set, reset, and toggle behavior on distinct rising edges', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('j', 'digital-input', { state: 'HIGH' }), component('k', 'digital-input', { state: 'HIGH' }), component('clk', 'digital-input', { state: 'LOW' }), component('ff', 'logic-ff-jk')], [wire('j', 'j', 'out', 'ff', 'j'), wire('k', 'k', 'out', 'ff', 'k'), wire('clk', 'clk', 'out', 'ff', 'clk')]);
    pulse(engine); expect(engine.getLogicState('ff', 'q')).toBe(1); pulse(engine); expect(engine.getLogicState('ff', 'q')).toBe(0);
    engine.driveDigitalInput('j', 1); engine.driveDigitalInput('k', 0); pulse(engine); expect(engine.getLogicState('ff', 'q')).toBe(1);
    engine.driveDigitalInput('j', 0); engine.driveDigitalInput('k', 1); pulse(engine); expect(engine.getLogicState('ff', 'q')).toBe(0);
  });

  it('shifts a serial bit stream to predictable parallel outputs', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('d', 'digital-input', { state: 'LOW' }), component('clk', 'digital-input', { state: 'LOW' }), component('shift', 'logic-shift-register')], [wire('d', 'd', 'out', 'shift', 'd'), wire('clk', 'clk', 'out', 'shift', 'clk')]);
    [1, 0, 1, 1].forEach(value => { engine.driveDigitalInput('d', value as 0 | 1); pulse(engine); });
    expect([0, 1, 2, 3].map(bit => engine.getLogicState('shift', `q${bit}`))).toEqual([1, 1, 0, 1]);
  });

  it('writes/reads RAM, exposes ROM data, and divides an input clock', () => {
    const ram = new DiscreteEventLogicEngine();
    ram.setCircuit([
      ...[0, 1, 2, 3].map(bit => component(`a${bit}`, 'digital-input', { state: bit === 1 ? 'HIGH' : 'LOW' })), ...[0, 1, 2, 3, 4, 5, 6, 7].map(bit => component(`d${bit}`, 'digital-input', { state: bit === 0 || bit === 3 ? 'HIGH' : 'LOW' })), component('we', 'digital-input', { state: 'HIGH' }), component('oe', 'digital-input', { state: 'HIGH' }), component('clk', 'digital-input', { state: 'LOW' }), component('mem', 'logic-ram-16x8'),
    ], [
      ...[0, 1, 2, 3].map(bit => wire(`a${bit}`, `a${bit}`, 'out', 'mem', `a${bit}`)), ...[0, 1, 2, 3, 4, 5, 6, 7].map(bit => wire(`d${bit}`, `d${bit}`, 'out', 'mem', `d${bit}`)), wire('we', 'we', 'out', 'mem', 'we'), wire('oe', 'oe', 'out', 'mem', 'oe'), wire('clk', 'clk', 'out', 'mem', 'clk'),
    ]);
    pulse(ram); expect([0, 1, 2, 3].map(bit => ram.getLogicState('mem', `q${bit}`))).toEqual([1, 0, 0, 1]);
    const rom = new DiscreteEventLogicEngine();
    rom.setCircuit([component('a0', 'digital-input', { state: 'LOW' }), component('a1', 'digital-input', { state: 'HIGH' }), component('a2', 'digital-input', { state: 'LOW' }), component('a3', 'digital-input', { state: 'LOW' }), component('oe', 'digital-input', { state: 'HIGH' }), component('rom', 'logic-rom-16x8')], [wire('a0', 'a0', 'out', 'rom', 'a0'), wire('a1', 'a1', 'out', 'rom', 'a1'), wire('a2', 'a2', 'out', 'rom', 'a2'), wire('a3', 'a3', 'out', 'rom', 'a3'), wire('oe', 'oe', 'out', 'rom', 'oe')]);
    expect([0, 1, 2, 3].map(bit => rom.getLogicState('rom', `q${bit}`))).toEqual([0, 1, 0, 0]);
    const divider = new DiscreteEventLogicEngine();
    divider.setCircuit([component('clk', 'digital-input', { state: 'LOW' }), component('reset', 'digital-input', { state: 'LOW' }), component('div', 'logic-frequency-divider', { divideBy: 2 })], [wire('clk', 'clk', 'out', 'div', 'clk'), wire('reset', 'reset', 'out', 'div', 'reset')]);
    pulse(divider); expect(divider.getLogicState('div', 'q')).toBe(1); pulse(divider); expect(divider.getLogicState('div', 'q')).toBe(0);
  });
});
