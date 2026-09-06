import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';

describe('KMapMinimizer view', () => {
  it('renders direct Boolean-function entry, an accessible interactive grid, and a KaTeX SOP result panel', () => {
    const markup = renderToStaticMarkup(<KMapMinimizer />);
    expect(markup).toContain('Boolean expression');
    expect(markup).toContain('Minterms');
    expect(markup).toContain('Don’t-cares');
    expect(markup).toContain('K-Map → academic notation');
    expect(markup).toContain('Select 2-variable K-Map');
    expect(markup).toContain('Select 4-variable K-Map');
    expect(markup).toContain('Karnaugh map');
    expect(markup).toContain('Simplified expression');
    expect(markup).toContain('Sum of Products');
    expect(markup).not.toContain('Interactive K-Map');
  });
});
