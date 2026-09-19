import { describe, expect, it } from 'vitest';
import { getDef } from '@/simulators/digital-logic/models/componentDefs';
import { getLogicComponentTerminals, normalizedInputCount } from '@/simulators/digital-logic/models/logicGateContract';

describe('Digital Logic multi-input gate contract', () => {
  it.each([[2, ['a', 'b', 'y']], [3, ['a', 'b', 'c', 'y']], [4, ['a', 'b', 'c', 'd', 'y']]])('registers %s-input gate terminals on the documented left-side lattice', (inputCount, ids) => {
    const component = { id: 'G', type: 'gate-or', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'G', props: { inputCount } };
    expect(getLogicComponentTerminals(component, getDef('gate-or')!).map(terminal => terminal.id)).toEqual(ids);
  });
  it('constrains the selector to the supported 2–8 input range', () => {
    expect(normalizedInputCount(1)).toBe(2);
    expect(normalizedInputCount(3)).toBe(3);
    expect(normalizedInputCount(9)).toBe(8);
  });
  it('keeps every configurable gate output beyond the body with a common terminal position on the 25px grid', () => {
    ['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor'].forEach(type => {
      expect(getDef(type)!.terminals.find(terminal => terminal.id === 'y')?.x).toBe(50);
    });
    expect(getDef('gate-not')!.terminals.find(terminal => terminal.id === 'y')?.x).toBe(25);
  });
  it('keeps Logic Input and Logic Output terminals exactly at their symbol-lead endpoints on the 25px grid', () => {
    const input = { id: 'I', type: 'digital-input', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'I1', props: {} };
    const output = { id: 'O', type: 'digital-output', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'O1', props: {} };
    expect(getLogicComponentTerminals(input, getDef('digital-input')!)).toEqual([{ id: 'out', name: 'OUT', x: 25, y: 0, type: 'output' }]);
    expect(getLogicComponentTerminals(output, getDef('digital-output')!)).toEqual([{ id: 'in', name: 'IN', x: -25, y: 0, type: 'input' }]);
  });
  it('anchors NOT gate terminals explicitly at (-25, 0) and (+25, 0)', () => {
    const notGate = { id: 'N', type: 'gate-not', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'N1', props: {} };
    expect(getLogicComponentTerminals(notGate, getDef('gate-not')!)).toEqual([
      { id: 'a', name: 'A', x: -25, y: 0, type: 'input' },
      { id: 'y', name: 'Y', x: 25, y: 0, type: 'output' },
    ]);
  });
});
