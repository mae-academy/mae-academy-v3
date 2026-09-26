import { describe, expect, it } from 'vitest';
import { solveKMap } from '@/simulators/digital-logic/engine/kmapSolver';
import { createKMapTopology } from '@/simulators/digital-logic/components/kmapGeometry';
import { astToAscii, astToOverlineLatex, generateTruthTable, parseBooleanExpression } from '@/simulators/digital-logic/engine/logicEngine';

const truth = (source: string) => {
  const parsed = parseBooleanExpression(source);
  return generateTruthTable(parsed.ast, parsed.variables).map(row => row.value);
};

describe('formula bar contract (ASCII in, KaTeX out)', () => {
  it('renders complements as overlines and AND as a centred dot', () => {
    expect(astToOverlineLatex(parseBooleanExpression("(A + B)' . C + D").ast)).toBe('\\overline{A + B} \\cdot C + D');
  });

  it('serializes every AST back to parser-safe ASCII with identical truth tables', () => {
    for (const source of ["(A + B)' . C + D", "!(A . B) + C'", "A ^ B'", "((A'))'", 'AB + C(D + A)']) {
      const ascii = astToAscii(parseBooleanExpression(source).ast);
      expect(ascii).not.toMatch(/[\\{}]/);
      expect(truth(ascii)).toEqual(truth(source));
    }
  });
});

describe('K-Map solver bounds guard', () => {
  it('discards out-of-range and overlapping terms instead of throwing on a stale variable count', () => {
    const solution = solveKMap({ variables: ['A', 'B', 'C'], minterms: [0, 1, 12, 15, -1, 2.5], dontCares: [1, 9] });
    expect(solution.minterms).toEqual([0, 1]);
    expect(solution.dontCares).toEqual([]);
  });

  it('emits a formula-bar ASCII expression that re-parses to the same function', () => {
    const solution = solveKMap({ variables: ['A', 'B', 'C', 'D'], minterms: [0, 1, 2, 3, 8, 9, 10, 11] });
    expect(solution.expression).toBe("B'");
    const minterms = [0, 2, 5, 7, 13, 15];
    const general = solveKMap({ variables: ['A', 'B', 'C', 'D'], minterms });
    expect(general.expression).not.toMatch(/[\\{}]/);
    const rows = truth(general.expression + " + 0A'B'C'D'");
    expect(rows.flatMap((value, index) => (value ? [index] : []))).toEqual(minterms);
  });
});

describe('K-Map topology', () => {
  it.each([[2, 2, 2], [3, 2, 4], [4, 4, 4]] as const)('%i-variable map is %i×%i with exactly the in-range minterms', (count, rows, columns) => {
    const topology = createKMapTopology(count);
    expect([topology.rows, topology.columns]).toEqual([rows, columns]);
    expect(topology.cells.map(cell => cell.minterm).sort((a, b) => a - b)).toEqual(Array.from({ length: 2 ** count }, (_, index) => index));
  });
});
