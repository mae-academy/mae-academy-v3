import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DigitalLogicSimulatorApp } from '@/simulators/digital-logic/components/DigitalLogicSimulatorApp';

describe('DigitalLogicSimulatorApp', () => {
  it('renders all six workspace tabs with the schematic tab active by default', () => {
    const markup = renderToStaticMarkup(<DigitalLogicSimulatorApp />);
    for (const label of ['Schematic Workspace', 'Logic Analyzer', 'K-Map Minimizer', 'Universal Synthesis', 'Timing Waveforms', 'State Machine Explorer']) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('Component Library');
  });
});
