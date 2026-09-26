import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';

describe('UniversalSynthesis view', () => {
  it('renders the architecture selector, four pedagogical derivation stages, and read-only gate diagram without duplicate input', () => {
    const markup = renderToStaticMarkup(<UniversalSynthesis />);
    expect(markup).not.toContain('id="synthesis-expression"');
    expect(markup).toContain('Target Universal Architecture');
    expect(markup).toContain('Convert to All-NAND');
    expect(markup).toContain('Original SOP Expression');
    expect(markup).toContain('Apply Double Inversion');
    expect(markup).toContain('Apply De Morgan');
    expect(markup).toContain('Final NAND Logic');
    expect(markup).toContain('Load Circuit to Canvas');
    expect(markup).not.toContain('Universal-gate schematic');
    expect(markup).not.toContain('NAND-only gate schematic');
    expect(markup).not.toContain('READ-ONLY');
  });

  it('safely handles non-SOP expressions without crashing and presents educational error and conversion action', () => {
    const markup = renderToStaticMarkup(<UniversalSynthesis expression="(A + B)' . C" />);
    expect(markup).not.toContain('id="synthesis-expression"');
    expect(markup).toContain('Invalid Synthesis Source');
    expect(markup).toContain('All-NAND synthesis requires a Sum of Products expression');
    expect(markup).toContain('Convert to Canonical SOP');
    // Canonical form is rendered as KaTeX math, never raw pseudo-syntax.
    expect(markup).not.toContain('~A*~B*C');
    expect(markup).toContain('katex');
    // Keeps last valid pedagogical steps rendered
    expect(markup).toContain('Pedagogical Derivation');
  });
});
