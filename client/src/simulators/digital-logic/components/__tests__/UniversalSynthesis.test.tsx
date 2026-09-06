import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';

describe('UniversalSynthesis view', () => {
  it('renders the source editor, four pedagogical derivation stages, and read-only gate diagram', () => {
    const markup = renderToStaticMarkup(<UniversalSynthesis />);
    expect(markup).toContain('Boolean expression');
    expect(markup).toContain('Convert to All-NAND');
    expect(markup).toContain('Original SOP Expression');
    expect(markup).toContain('Apply Double Inversion');
    expect(markup).toContain('Apply De Morgan');
    expect(markup).toContain('Final NAND Logic');
    expect(markup).toContain('Read-only schematic');
    expect(markup).toContain('NAND-only gate schematic');
  });
});
