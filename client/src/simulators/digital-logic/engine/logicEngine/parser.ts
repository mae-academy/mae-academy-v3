/** Logic Analyzer parser layer — Dijkstra Shunting-Yard to RPN, then AST construction. */
import type { ASTNode } from './ast';
import { astToLatex, variablesFromAst } from './ast';
import type { LogicToken, TokenKind } from './lexer';
import { tokenize } from './lexer';

export interface ParsedLogicExpression {
  source: string;
  tokens: LogicToken[];
  rpn: LogicToken[];
  ast: ASTNode;
  variables: string[];
  latex: string;
}

const precedence: Record<Exclude<TokenKind, 'VARIABLE' | 'CONSTANT' | 'LPAREN' | 'RPAREN' | 'POSTFIX_NOT'>, number> = { OR: 1, XOR: 2, AND: 3, NOT: 4 };
const isBinary = (kind: TokenKind) => kind === 'AND' || kind === 'OR' || kind === 'XOR';

export const toRpn = (tokens: LogicToken[]): LogicToken[] => {
  const output: LogicToken[] = [];
  const operators: LogicToken[] = [];
  tokens.forEach(token => {
    if (token.kind === 'VARIABLE' || token.kind === 'CONSTANT') { output.push(token); return; }
    if (token.kind === 'POSTFIX_NOT') { output.push(token); return; }
    if (token.kind === 'LPAREN') { operators.push(token); return; }
    if (token.kind === 'RPAREN') {
      while (operators.length && operators[operators.length - 1].kind !== 'LPAREN') output.push(operators.pop()!);
      if (!operators.length) throw new Error(`Unmatched closing parenthesis at position ${token.position + 1}.`);
      operators.pop();
      return;
    }
    const operatorPrecedence = precedence[token.kind as keyof typeof precedence];
    while (operators.length && operators[operators.length - 1].kind !== 'LPAREN') {
      const previous = operators[operators.length - 1];
      const previousPrecedence = precedence[previous.kind as keyof typeof precedence];
      if (previousPrecedence < operatorPrecedence) break;
      output.push(operators.pop()!);
    }
    operators.push(token);
  });
  while (operators.length) {
    const operator = operators.pop()!;
    if (operator.kind === 'LPAREN') throw new Error(`Unmatched opening parenthesis at position ${operator.position + 1}.`);
    output.push(operator);
  }
  return output;
};

export const astFromRpn = (rpn: LogicToken[]): ASTNode => {
  const stack: ASTNode[] = [];
  rpn.forEach(token => {
    if (token.kind === 'VARIABLE') { stack.push({ type: 'VARIABLE', value: token.lexeme }); return; }
    if (token.kind === 'CONSTANT') { stack.push({ type: 'CONSTANT', value: token.lexeme }); return; }
    if (token.kind === 'NOT' || token.kind === 'POSTFIX_NOT') {
      const operand = stack.pop();
      if (!operand) throw new Error(`NOT is missing an operand at position ${token.position + 1}.`);
      stack.push({ type: 'NOT', left: operand, negationStyle: token.kind === 'POSTFIX_NOT' ? 'postfix' : 'prefix' });
      return;
    }
    if (!isBinary(token.kind)) throw new Error(`Unsupported token at position ${token.position + 1}.`);
    const right = stack.pop(); const left = stack.pop();
    if (!left || !right) throw new Error(`${token.lexeme} is missing an operand at position ${token.position + 1}.`);
    stack.push({ type: token.kind, left, right });
  });
  if (stack.length !== 1) throw new Error('Invalid Boolean expression.');
  return stack[0];
};

export const parseBooleanExpression = (source: string): ParsedLogicExpression => {
  const tokens = tokenize(source);
  const rpn = toRpn(tokens);
  const ast = astFromRpn(rpn);
  return { source, tokens, rpn, ast, variables: variablesFromAst(ast), latex: astToLatex(ast) };
};
