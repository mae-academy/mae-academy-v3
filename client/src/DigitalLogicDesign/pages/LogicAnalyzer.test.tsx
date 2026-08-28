import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LogicAnalyzer } from './LogicAnalyzer';

describe('LogicAnalyzer view', () => {
  it('renders the compiler input, academic preview, sticky-ready table, and SOP/POS summaries', () => {
    const markup = renderToStaticMarkup(<LogicAnalyzer />);
    expect(markup).toContain('Boolean expression');
    expect(markup).toContain('AST → academic notation');
    expect(markup).toContain('click to edit');
    expect(markup).toContain('Canonical SOP');
    expect(markup).toContain('Canonical POS');
    expect(markup).not.toContain('Boolean compiler / analysis desk');
  });
});
