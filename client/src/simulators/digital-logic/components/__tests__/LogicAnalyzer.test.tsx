import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LogicAnalyzer } from '@/simulators/digital-logic/components/pages/LogicAnalyzer';

describe('LogicAnalyzer view', () => {
  it('renders the clean interactive truth table with decimal indices and without redundant clutter cards', () => {
    const markup = renderToStaticMarkup(<LogicAnalyzer />);
    expect(markup).toContain('Interactive Truth Table');
    expect(markup).toContain('click to edit');
    // Verify redundant clutter cards are removed
    expect(markup).not.toContain('Canonical SOP');
    expect(markup).not.toContain('Canonical POS');
    expect(markup).not.toContain('AST → academic notation');
    expect(markup).not.toContain('Boolean compiler / analysis desk');
  });

  it('safely bounds table without crashing when expression has more than 8 variables', () => {
    const markup = renderToStaticMarkup(<LogicAnalyzer expression="A + B + C + D + E + F + G + H + I" />);
    expect(markup).toContain('Interactive Truth Table');
    expect(markup).toContain('Maximum 8 input variables (A–H) supported');
  });

  it('adds a decimal index column (0 … 2^n − 1) ahead of the variable columns', () => {
    const markup = renderToStaticMarkup(<LogicAnalyzer expression="A . B + C . D" />);
    expect(markup).toContain('Decimal Row Index');
    const body = markup.slice(markup.indexOf('<tbody'), markup.indexOf('</tbody>'));
    const rows = body.split('<tr').slice(1);
    expect(rows).toHaveLength(16);
    // The first cell of row i carries the decimal index i.
    rows.forEach((row, index) => {
      const firstCell = row.slice(row.indexOf('<td'), row.indexOf('</td>'));
      expect(firstCell.replace(/<[^>]+>/g, ' ')).toMatch(new RegExp(`(^|\\s)${index}(\\s|$)`));
    });
  });
});
