import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { nextAvailableStateId, StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';

describe('StateMachineExplorer view', () => {
  it('renders EDA controls, the native SVG diagram, tables, and equations without clutter panels', () => {
    const markup = renderToStaticMarkup(<StateMachineExplorer />);
    expect(markup).toContain('Add State');
    expect(markup).toContain('Add Transition To…');
    expect(markup).toContain('Selected: S0');
    expect(markup).toContain('Interactive FSM state diagram');
    expect(markup).toContain('State table');
    expect(markup).toContain('D excitation matrix');
    expect(markup).toContain('Minimized equations');
    expect(markup).not.toContain('Derivation Steps');
    expect(markup).not.toContain('Excitation analysis.');
    expect(markup).not.toContain('Generated Verilog');
    expect(markup).not.toContain('always @(posedge clk)');
  });

  it('allocates a free state ID rather than duplicating a surviving state after deletion', () => {
    expect(nextAvailableStateId([{ id: 'S0' }, { id: 'S2' }])).toBe('S1');
    expect(nextAvailableStateId([{ id: 'S0' }, { id: 'S1' }, { id: 'S2' }])).toBe('S3');
  });
});
