import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from '@/simulators/digital-logic/models/circuitTypes';
import { defaultInputShortcut, findInputByShortcut, logicIoLabel, normalizeDefaultLogicLabel } from '@/simulators/digital-logic/models/logicInputBindings';

const component = (id: string, type: string, label: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, label, props, x: 0, y: 0, rotation: 0, flipH: false, flipV: false });
describe('Digital Logic Input bindings', () => {
  it('uses sequential A-Z labels for inputs and F_1, F_2 for outputs', () => {
    const components = [component('a', 'digital-input', 'A'), component('b', 'digital-input', 'B'), component('o', 'digital-output', 'F_1')];
    expect(logicIoLabel('digital-input', components)).toBe('C');
    expect(logicIoLabel('digital-output', components)).toBe('F_2');
    expect(defaultInputShortcut(components[1], components)).toBe('b');
  });

  it('assigns the next available uppercase letter when an intermediate input is removed', () => {
    // If A and C are present, the next available letter is B
    const components = [component('a', 'digital-input', 'A'), component('c', 'digital-input', 'C')];
    expect(logicIoLabel('digital-input', components)).toBe('B');
  });

  it('assigns next available index for outputs when an intermediate output is removed', () => {
    // If F_1 and F_3 are present, the next available output is F_2
    const components = [component('o1', 'digital-output', 'F_1'), component('o3', 'digital-output', 'F_3')];
    expect(logicIoLabel('digital-output', components)).toBe('F_2');
  });

  it('finds input by label (case-insensitive) or explicit shortcut, including R', () => {
    const components = [
      component('a', 'digital-input', 'A', { shortcut: 'q' }),
      component('b', 'digital-input', 'B'),
      component('r', 'digital-input', 'R'),
      component('o', 'digital-output', 'F_1'),
    ];
    expect(findInputByShortcut(components, 'Q')?.id).toBe('a');
    expect(findInputByShortcut(components, 'a')?.id).toBe('a');
    expect(findInputByShortcut(components, 'B')?.id).toBe('b');
    expect(findInputByShortcut(components, 'b')?.id).toBe('b');
    expect(findInputByShortcut(components, 'R')?.id).toBe('r');
    expect(findInputByShortcut(components, 'r')?.id).toBe('r');
  });

  it('normalizes only the former default Input/Output labels', () => {
    expect(normalizeDefaultLogicLabel(component('a', 'digital-input', 'Input 3'))).toBe('I3');
    expect(normalizeDefaultLogicLabel(component('o', 'digital-output', 'Output1'))).toBe('O1');
    expect(normalizeDefaultLogicLabel(component('a', 'digital-input', 'Clock A'))).toBe('Clock A');
  });
});
