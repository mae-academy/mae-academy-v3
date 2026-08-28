import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalysisBox } from './AnalysisBox';
import type { MNAElement } from '@/v3-simulator/lib/mnaSolver';

const colors = { panel: '#0f172a', panelAlt: '#172033', line: '#334155', text: '#f8fafc', muted: '#94a3b8', primary: '#3b82f6', danger: '#ef4444' };
const elements: MNAElement[] = [
  { type: 'voltage', id: 'Vs', positive: 'n1', negative: '0', voltage: 12 },
  { type: 'resistor', id: 'R1', positive: 'n1', negative: 'n2', resistance: 1000 },
  { type: 'resistor', id: 'R2', positive: 'n2', negative: '0', resistance: 2000 },
];

describe('Tab D Academic Analysis Workspace', () => {
  it('renders real solver-backed Nodal content and exposes all academic analysis modes', () => {
    const markup = renderToStaticMarkup(<AnalysisBox elements={elements} colors={colors} standalone />);
    expect(markup).toContain('Nodal');
    expect(markup).toContain('Mesh');
    expect(markup).toContain('Superposition');
    expect(markup).toContain('Thévenin');
    expect(markup).toContain('KCL');
    expect(markup).toContain('Solver-backed derivation');
  });
});
