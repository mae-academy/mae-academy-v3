/** Logic Analyzer table layer — bounded truth-table evaluation and canonical SOP reconstruction. */
import type { ASTNode } from './ast';
import { evaluateAst } from './ast';

export interface TruthTableRow {
  index: number;
  context: Record<string, boolean>;
  value: boolean;
}

export const MAX_LOGIC_ANALYZER_VARIABLES = 6;

export const generateTruthTable = (ast: ASTNode, variables: string[]): TruthTableRow[] => {
  if (variables.length > MAX_LOGIC_ANALYZER_VARIABLES) throw new Error(`Logic Analyzer supports up to ${MAX_LOGIC_ANALYZER_VARIABLES} variables.`);
  return Array.from({ length: 2 ** variables.length }, (_, index) => {
    const context = Object.fromEntries(variables.map((variable, bit) => [variable, Boolean((index >> (variables.length - bit - 1)) & 1)]));
    return { index, context, value: evaluateAst(ast, context) };
  });
};

export const mintermIndices = (rows: TruthTableRow[]) => rows.filter(row => row.value).map(row => row.index);
export const maxtermIndices = (rows: TruthTableRow[]) => rows.filter(row => !row.value).map(row => row.index);

export const canonicalSopFromRows = (variables: string[], rows: TruthTableRow[]) => {
  const minterms = rows.filter(row => row.value);
  if (minterms.length === 0) return '0';
  return minterms.map(row => variables.map(variable => row.context[variable] ? variable : `~${variable}`).join('*')).join('+');
};
