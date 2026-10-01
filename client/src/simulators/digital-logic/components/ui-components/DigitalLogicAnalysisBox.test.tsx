import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DigitalLogicAnalysisBox } from '@/simulators/digital-logic/components/ui-components/DigitalLogicAnalysisBox';
import { astToOverlineLatex } from '@shared/logic/logicEngine/ast';
import { parseBooleanExpression } from '@shared/logic/logicEngine';

const mockColors = {
  panel: '#ffffff',
  panelAlt: '#f8fafc',
  line: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#2563eb',
  danger: '#f43f5e',
};

describe('DigitalLogicAnalysisBox lower workspace drawer', () => {
  it('renders centered SegmentedControl with 5 genuine tabs and executive formula bar', () => {
    const markup = renderToStaticMarkup(
      <DigitalLogicAnalysisBox colors={mockColors} standalone />
    );

    // Segmented tabs
    expect(markup).toContain('Boolean &amp; Truth Table');
    expect(markup).toContain('K-Map Minimizer');
    expect(markup).toContain('Universal Synthesis');
    expect(markup).toContain('Timing Waveforms');
    expect(markup).toContain('State Machine Explorer');

    // Universal formula bar
    expect(markup).toContain('Universal Boolean Expression');
    expect(markup).toContain('Extract from Canvas');
    expect(markup).toContain('Generate Circuit');
    expect(markup).toContain('id="executive-boolean-expression-input"');
    expect(markup).not.toContain('Live KaTeX Preview');
  });

  it('formats (A + B)\' . C with KaTeX overline and centered dot', () => {
    const parsed = parseBooleanExpression("(A + B)' . C");
    const latex = astToOverlineLatex(parsed.ast);
    expect(latex).toBe('\\overline{A + B} \\cdot C');
  });

  it('formats !(A + B) . C and !A identical to shorthand with overline', () => {
    const parsedPrefix = parseBooleanExpression('!(A + B) . C');
    expect(astToOverlineLatex(parsedPrefix.ast)).toBe('\\overline{A + B} \\cdot C');

    const parsedNotA = parseBooleanExpression("A'");
    expect(astToOverlineLatex(parsedNotA.ast)).toBe('\\overline{A}');
  });

  it('displays soft variable limit badge when expression exceeds 8 variables without crashing', () => {
    const markup = renderToStaticMarkup(
      <DigitalLogicAnalysisBox
        colors={mockColors}
        standalone
        initialExpression="A + B + C + D + E + F + G + H + I"
      />
    );
    expect(markup).toContain('Maximum 8 input variables (A–H) supported');
    expect(markup).toContain('Interactive Truth Table');
  });
});
