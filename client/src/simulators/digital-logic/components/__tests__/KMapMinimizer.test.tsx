import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';

describe('KMapMinimizer view', () => {
  it('renders an accessible interactive grid, canonical solver controls, and a KaTeX SOP result panel without redundant cards', () => {
    const markup = renderToStaticMarkup(<KMapMinimizer />);
    expect(markup).not.toContain('Boolean expression');
    expect(markup).not.toContain('K-Map → academic notation');
    expect(markup).not.toContain('Cover Analysis');
    expect(markup).not.toContain('id="kmap-minterms"');
    expect(markup).toContain('Select 2-variable K-Map');
    expect(markup).toContain('Select 4-variable K-Map');
    expect(markup).toContain('Karnaugh map');
    expect(markup).toContain('Simplified expression');
    expect(markup).toContain('Sum of Products');
  });
});
