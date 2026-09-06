import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from '@/simulators/digital-logic/models/circuitTypes';
import { defaultInputShortcut, findInputByShortcut, logicIoLabel, normalizeDefaultLogicLabel } from '@/simulators/digital-logic/models/logicInputBindings';

const component = (id: string, type: string, label: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, label, props, x: 0, y: 0, rotation: 0, flipH: false, flipV: false });
describe('Digital Logic Input bindings', () => {
  it('uses I/O default labels and number shortcuts by insertion order', () => {
    const components = [component('a', 'digital-input', 'I1'), component('b', 'digital-input', 'I2'), component('o', 'digital-output', 'O1')];
    expect(logicIoLabel('digital-input', components)).toBe('I3');
    expect(logicIoLabel('digital-output', components)).toBe('O2');
    expect(defaultInputShortcut(components[1], components)).toBe('2');
  });
  it('finds default and customized input shortcuts without accepting an ambiguous match', () => {
    const components = [component('a', 'digital-input', 'I1', { shortcut: 'q' }), component('b', 'digital-input', 'I2'), component('o', 'digital-output', 'O1')];
    expect(findInputByShortcut(components, 'Q')?.id).toBe('a');
    expect(findInputByShortcut(components, '2')?.id).toBe('b');
  });
  it('normalizes only the former default Input/Output labels', () => {
    expect(normalizeDefaultLogicLabel(component('a', 'digital-input', 'Input 3'))).toBe('I3');
    expect(normalizeDefaultLogicLabel(component('o', 'digital-output', 'Output1'))).toBe('O1');
    expect(normalizeDefaultLogicLabel(component('a', 'digital-input', 'Clock A'))).toBe('Clock A');
  });
});
