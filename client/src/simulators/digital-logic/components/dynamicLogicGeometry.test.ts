import { describe, expect, it } from 'vitest';
import { getDef } from '@/simulators/digital-logic/models/componentDefs';
import { bitPinIdsFor, dataPinIdsFor, decoderOutputPinIdsFor, dynamicScaleConfigFor, dynamicGateGeometryFor, logicBlockLayoutFor, logicBodyBoundaryForPin, pruneWiresForTerminalSet, selectorPinIdsFor } from '@/simulators/digital-logic/components/dynamicLogicGeometry';
import { getLogicComponentBounds, getLogicComponentTerminals } from '@/simulators/digital-logic/models/logicGateContract';
import type { CircuitComponent, CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';

const component = (type: string, inputCount: number): CircuitComponent => ({ id: 'gate', type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'G1', props: { inputCount } });
const wire = (id: string, terminal: string): CircuitWire => ({ id, fromComp: 'source', fromTerm: 'out', toComp: 'gate', toTerm: terminal, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('Dynamic multi-input gate geometry', () => {
  it('uses constant 20px pin pitch and a vertically extended standard-gate frame for every eight-input gate', () => {
    ['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'].forEach(type => {
      const geometry = dynamicGateGeometryFor(type, 8);
      expect(geometry).toMatchObject({ inputCount: 8, width: 70, height: 180, inputX: -35, outputX: 45 });
      expect(geometry.inputY).toEqual([-70, -50, -30, -10, 10, 30, 50, 70]);
    });
  });

  it('registers centered A–H inputs and the same external Y output for all scalable gate families', () => {
    ['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'].forEach(type => {
      const gate = component(type, 8);
      const definition = getDef(type)!;
      const terminals = getLogicComponentTerminals(gate, definition);
      expect(terminals.map(terminal => terminal.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'y']);
      expect(terminals.at(-1)).toMatchObject({ id: 'y', x: 45, y: 0 });
      expect(getLogicComponentBounds(gate, definition)).toMatchObject({ width: 70, height: 180 });
    });
  });

  it('places MUX data pins on the wide side and selector pins on the bottom axis', () => {
    const mux = component('logic-mux', 2);
    const terminals = getLogicComponentTerminals(mux, getDef('logic-mux')!);
    expect(terminals.find(terminal => terminal.id === 'd0')).toMatchObject({ x: -66.66666666666667, y: -50 });
    expect(terminals.find(terminal => terminal.id === 'd3')).toMatchObject({ x: -66.66666666666667, y: 50 });
    expect(terminals.find(terminal => terminal.id === 's0')?.x).toBeCloseTo(-16.666666666666668);
    expect(terminals.find(terminal => terminal.id === 's0')?.y).toBeCloseTo(100);
    expect(terminals.find(terminal => terminal.id === 's1')?.x).toBeCloseTo(16.666666666666668);
    expect(terminals.find(terminal => terminal.id === 's1')?.y).toBeCloseTo(100);
    expect(terminals.find(terminal => terminal.id === 'y')).toMatchObject({ x: 66.66666666666667, y: 0 });
    expect(getLogicComponentBounds(mux, getDef('logic-mux')!).height).toBeCloseTo(200);
  });

  it('derives selector and bit lanes from one reusable scalable contract', () => {
    expect(selectorPinIdsFor(3)).toEqual(['s0', 's1', 's2']);
    expect(dataPinIdsFor(3)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
    expect(decoderOutputPinIdsFor(3)).toHaveLength(8);
    expect(bitPinIdsFor('sum', 8)).toEqual(['sum0', 'sum1', 'sum2', 'sum3', 'sum4', 'sum5', 'sum6', 'sum7']);
    expect(dynamicScaleConfigFor('logic-mux')).toMatchObject({ key: 'selectorCount', options: [1, 2, 3] });
    expect(dynamicScaleConfigFor('logic-nbit-register')).toMatchObject({ key: 'bitWidth', options: [4, 8] });
    const mux: CircuitComponent = { ...component('logic-mux', 2), props: { selectorCount: 3 } };
    expect(getLogicComponentTerminals(mux, getDef('logic-mux')!)).toHaveLength(12);
    const layout = logicBlockLayoutFor('logic-mux', dataPinIdsFor(3).concat(selectorPinIdsFor(3)), ['y']);
    expect(layout.pins.filter(pin => pin.side === 'bottom').map(pin => pin.id)).toEqual(['s0', 's1', 's2']);
    expect(getLogicComponentBounds(mux, getDef('logic-mux')!).height).toBeCloseTo(333.33333333333337);
  });

  it('garbage-collects wires that target removed dynamic input pins without disturbing valid connections', () => {
    const retained = pruneWiresForTerminalSet([wire('keep-a', 'a'), wire('remove-d', 'd'), wire('remove-h', 'h'), { ...wire('from-gate', 'a'), fromComp: 'gate', fromTerm: 'h', toComp: 'output', toTerm: 'in' }], 'gate', new Set(['a', 'b', 'y']));
    expect(retained.map(item => item.id)).toEqual(['keep-a']);
    const selectorRetained = pruneWiresForTerminalSet([wire('keep-s0', 's0'), wire('remove-s2', 's2'), wire('remove-d7', 'd7')], 'gate', new Set(['s0', 's1', 'd0', 'd1', 'd2', 'd3', 'y']));
    expect(selectorRetained.map(item => item.id)).toEqual(['keep-s0']);
  });

  it('starts special-shape pin leads on their actual MUX and ALU boundaries', () => {
    const muxLayout = logicBlockLayoutFor('logic-mux', ['d0', 'd1', 'd2', 'd3', 's0', 's1'], ['y']);
    const selector = muxLayout.pins.find(pin => pin.id === 's0')!;
    const muxBoundary = logicBodyBoundaryForPin('logic-mux', selector, muxLayout);
    expect(muxBoundary[0]).toBeCloseTo(selector.x);
    expect(muxBoundary[1]).toBeLessThan(selector.y);
    const aluLayout = logicBlockLayoutFor('logic-alu-4bit', ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'op0', 'op1', 'cin'], ['y0', 'y1', 'y2', 'y3', 'cout', 'zero']);
    const aLead = aluLayout.pins.find(pin => pin.id === 'a2')!;
    const aluBoundary = logicBodyBoundaryForPin('logic-alu-4bit', aLead, aluLayout);
    expect(aluBoundary[1]).toBeCloseTo(aLead.y);
    expect(aluBoundary[0]).toBeGreaterThan(-aluLayout.bodyHalfWidth);
  });
});
