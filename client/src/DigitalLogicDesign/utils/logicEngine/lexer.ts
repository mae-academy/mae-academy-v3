/**
 * Logic Analyzer compiler layer — tokenizes a compact Boolean language.
 * Variables are single Latin letters; adjacency is expanded to explicit AND.
 */
export type TokenKind = 'VARIABLE' | 'CONSTANT' | 'AND' | 'OR' | 'XOR' | 'NOT' | 'POSTFIX_NOT' | 'LPAREN' | 'RPAREN';

export interface LogicToken {
  kind: TokenKind;
  lexeme: string;
  position: number;
}

const canEndOperand = (kind: TokenKind) => kind === 'VARIABLE' || kind === 'CONSTANT' || kind === 'RPAREN' || kind === 'POSTFIX_NOT';
const canStartOperand = (kind: TokenKind) => kind === 'VARIABLE' || kind === 'CONSTANT' || kind === 'LPAREN' || kind === 'NOT';
const isLetter = (value: string | undefined) => Boolean(value && /[A-Za-z]/.test(value));

export const tokenize = (source: string): LogicToken[] => {
  const raw: LogicToken[] = [];
  for (let position = 0; position < source.length; position += 1) {
    const character = source[position];
    if (/\s/.test(character)) continue;
    const keyword = source.slice(position, position + 3);
    if (keyword.toUpperCase() === 'XOR' && !isLetter(source[position - 1]) && !isLetter(source[position + 3])) {
      raw.push({ kind: 'XOR', lexeme: keyword, position });
      position += 2;
    }
    else if (/[A-Za-z]/.test(character)) raw.push({ kind: 'VARIABLE', lexeme: character, position });
    else if (character === '0' || character === '1') raw.push({ kind: 'CONSTANT', lexeme: character, position });
    else if (character === '*' || character === '&' || character === '.') raw.push({ kind: 'AND', lexeme: character, position });
    else if (character === '+' || character === '|') raw.push({ kind: 'OR', lexeme: character, position });
    else if (character === '^' || character === '⊕') raw.push({ kind: 'XOR', lexeme: character, position });
    else if (character === '~' || character === '!') raw.push({ kind: 'NOT', lexeme: character, position });
    else if (/['′’ʹ´]/.test(character)) raw.push({ kind: 'POSTFIX_NOT', lexeme: character, position });
    else if (character === '(') raw.push({ kind: 'LPAREN', lexeme: character, position });
    else if (character === ')') raw.push({ kind: 'RPAREN', lexeme: character, position });
    else throw new Error(`Unexpected character “${character}” at position ${position + 1}.`);
  }

  if (raw.length === 0) throw new Error('Enter a Boolean expression.');
  return raw.flatMap((token, index) => {
    const previous = raw[index - 1];
    return previous && canEndOperand(previous.kind) && canStartOperand(token.kind)
      ? [{ kind: 'AND' as const, lexeme: '·', position: token.position }, token]
      : [token];
  });
};
