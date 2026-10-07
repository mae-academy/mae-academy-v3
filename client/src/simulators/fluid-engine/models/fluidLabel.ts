/** LaTeX for a reference tag such as `1V1` or `1V1-PB`: single letters italic, letter runs upright, digits as-is. */
export function labelToLatex(label: string): string {
  const text = label.trim() || ' ';
  return text.replace(/[A-Za-z]+|[0-9]+|[^A-Za-z0-9]/g, token => {
    if (/^[A-Za-z]+$/.test(token)) return token.length === 1 ? token : `\\mathrm{${token}}`;
    if (/^[0-9]+$/.test(token)) return token;
    if (token === '-') return '\\text{-}';
    if (token === ' ') return '\\,';
    return `\\text{${token.replace(/[\\{}#$%&_~^]/g, '')}}`;
  });
}
