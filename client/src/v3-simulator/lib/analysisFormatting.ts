export function formatAcademicNumber(value: number, decimals = 4) {
  if (!Number.isFinite(value)) return '\\mathrm{NaN}';
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function compactMathNumbers(math: string, decimals: number) {
  // Do not reinterpret digits embedded in TeX control names, identifiers,
  // subscripts, or hexadecimal \textcolor values as numerical quantities.
  return math.replace(/(?<![A-Za-z_\\#])(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![A-Za-z_])/gi, (token) => {
    const value = Number(token);
    return Number.isFinite(value) ? formatAcademicNumber(value, decimals) : token;
  });
}

export function latexMatrix(rows: number[][], decimals = 4) {
  if (!rows.length) return '\\begin{bmatrix}\\end{bmatrix}';
  return `\\begin{bmatrix}${rows.map((row) => row.map((value) => formatAcademicNumber(value, decimals)).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
}
