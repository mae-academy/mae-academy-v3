import { describe, expect, it } from 'vitest';
import { astToLatex, canonicalSopFromRows, evaluateAst, generateTruthTable, maxtermIndices, mintermIndices, parseBooleanExpression, tokenize } from './index';

describe('Logic Analyzer compiler', () => {
  it('tokenizes operator aliases and inserts explicit AND for adjacency', () => {
    expect(tokenize("AB + C' ^ !D").map(token => token.kind)).toEqual(['VARIABLE', 'AND', 'VARIABLE', 'OR', 'VARIABLE', 'POSTFIX_NOT', 'XOR', 'NOT', 'VARIABLE']);
    expect(tokenize('A&(B.C)').filter(token => token.kind === 'AND')).toHaveLength(2);
  });

  it('honors NOT, AND, XOR, OR precedence through Shunting-Yard', () => {
    const parsed = parseBooleanExpression('~A*B^C+D');
    expect(evaluateAst(parsed.ast, { A: false, B: true, C: false, D: false })).toBe(true);
    expect(evaluateAst(parsed.ast, { A: true, B: true, C: false, D: false })).toBe(false);
    expect(parsed.rpn.map(token => token.kind)).toEqual(['VARIABLE', 'NOT', 'VARIABLE', 'AND', 'VARIABLE', 'XOR', 'VARIABLE', 'OR']);
  });

  it('applies postfix NOT to its complete preceding parenthesized term', () => {
    const parsed = parseBooleanExpression("(A*B)'");
    expect(evaluateAst(parsed.ast, { A: true, B: true })).toBe(false);
    expect(evaluateAst(parsed.ast, { A: true, B: false })).toBe(true);
    expect(astToLatex(parsed.ast)).toBe('\\left(A \\cdot B\\right)^{\\prime}');
  });

  it('accepts ASCII and Unicode prime notation inside adjacent composite terms', () => {
    const ascii = parseBooleanExpression("A' + B'C");
    const unicode = parseBooleanExpression('A′ + B′C');
    const context = { A: true, B: true, C: true };
    expect(evaluateAst(ascii.ast, context)).toBe(false);
    expect(evaluateAst(unicode.ast, context)).toBe(false);
    expect(unicode.latex).toBe('A^{\\prime} + B^{\\prime} \\cdot C');
    expect(evaluateAst(unicode.ast, { A: false, B: true, C: true })).toBe(true);
  });

  it('retains postfix-prime notation visibly for parenthesized and nested operands', () => {
    expect(parseBooleanExpression("(A+B)'").latex).toBe('\\left(A + B\\right)^{\\prime}');
    expect(parseBooleanExpression('(A+B)′').latex).toBe('\\left(A + B\\right)^{\\prime}');
    expect(parseBooleanExpression("(A+B)'C").latex).toBe('\\left(A + B\\right)^{\\prime} \\cdot C');
  });

  it('keeps NOT grouping mathematically sound in LaTeX', () => {
    expect(parseBooleanExpression('~(A*B)').latex).toBe('\\overline{A \\cdot B}');
    expect(parseBooleanExpression('A*(B+C)').latex).toBe('A \\cdot \\left(B + C\\right)');
  });

  it('rejects malformed Boolean syntax without producing an AST', () => {
    expect(() => parseBooleanExpression('A + * B')).toThrow(/missing an operand/i);
    expect(() => parseBooleanExpression('(A+B')).toThrow(/Unmatched opening parenthesis/i);
    expect(() => parseBooleanExpression('A @ B')).toThrow(/Unexpected character/i);
  });

  it('preserves nested XOR, AND, OR, and complement precedence in a deep expression', () => {
    const parsed = parseBooleanExpression('~((A XOR B) * ~(C + D))');

    expect(evaluateAst(parsed.ast, { A: true, B: false, C: false, D: false })).toBe(false);
    expect(evaluateAst(parsed.ast, { A: true, B: false, C: true, D: false })).toBe(true);
    expect(evaluateAst(parsed.ast, { A: true, B: true, C: false, D: false })).toBe(true);
    expect(parsed.latex).toContain('\oplus');
    expect(parsed.latex).toContain('\overline');
  });
});

describe('Logic Analyzer truth-table reconstruction', () => {
  it('evaluates all rows and reports minterms/maxterms for a parsed expression', () => {
    const parsed = parseBooleanExpression('A*B+C');
    const rows = generateTruthTable(parsed.ast, parsed.variables);
    expect(rows).toHaveLength(8);
    expect(mintermIndices(rows)).toEqual([1, 3, 5, 6, 7]);
    expect(maxtermIndices(rows)).toEqual([0, 2, 4]);
  });

  it('reconstructs canonical SOP from output-edited rows and can parse it again', () => {
    const variables = ['A', 'B', 'C'];
    const rows = generateTruthTable(parseBooleanExpression('0').ast, variables).map(row => ({ ...row, value: row.index === 5 || row.index === 7 }));
    const sop = canonicalSopFromRows(variables, rows);
    expect(sop).toBe('A*~B*C+A*B*C');
    const rebuilt = parseBooleanExpression(sop);
    expect(generateTruthTable(rebuilt.ast, rebuilt.variables).filter(row => row.value).map(row => row.index)).toEqual([5, 7]);
  });

  it('bounds evaluation at six variables and supports the resulting 64-row table', () => {
    const parsed = parseBooleanExpression('A+B+C+D+E+F');
    expect(generateTruthTable(parsed.ast, parsed.variables)).toHaveLength(64);
  });
});
