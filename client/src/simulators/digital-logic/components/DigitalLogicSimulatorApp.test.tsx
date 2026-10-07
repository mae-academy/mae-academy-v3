// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { DigitalLogicSimulatorApp } from '@/simulators/digital-logic/components/DigitalLogicSimulatorApp';

describe('DigitalLogicSimulatorApp', () => {
  it('renders the five analysis tabs with the Boolean tab active by default', () => {
    const markup = renderToStaticMarkup(<LocaleProvider locale="en"><DigitalLogicSimulatorApp /></LocaleProvider>);
    for (const label of ['Boolean &amp; Truth Table', 'K-Map Minimizer', 'Universal Synthesis', 'Timing Waveforms', 'State Machine Explorer']) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('role="tablist"');
    expect(markup).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/button>)[\s\S])*Boolean &amp; Truth Table/);
  });
});
