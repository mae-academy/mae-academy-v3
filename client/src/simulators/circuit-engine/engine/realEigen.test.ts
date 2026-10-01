import { describe, expect, it } from 'vitest';
import { eigenvalues, spectralAbscissa } from '@/simulators/circuit-engine/engine/realEigen';

const sortKey = (values: Array<{ re: number; im: number }>) => [...values].sort((x, y) => x.re - y.re || x.im - y.im);

describe('realEigen', () => {
  it('returns the diagonal of a triangular matrix', () => {
    const values = sortKey(eigenvalues([[3, 1, 4], [0, -2, 5], [0, 0, 0.5]]));
    expect(values.map(v => v.re)).toEqual([-2, 0.5, 3].map(x => expect.closeTo(x, 10)));
    expect(values.every(v => Math.abs(v.im) < 1e-12)).toBe(true);
  });

  it('finds a complex-conjugate pair of a planar rotation-scaling', () => {
    const values = sortKey(eigenvalues([[1, -2], [2, 1]]));
    expect(values[0].re).toBeCloseTo(1, 12);
    expect(values[1].re).toBeCloseTo(1, 12);
    expect(Math.abs(values[0].im)).toBeCloseTo(2, 12);
    expect(values[0].im + values[1].im).toBeCloseTo(0, 12);
  });

  it('reproduces the roots of a known polynomial through its companion matrix', () => {
    // (x-1)(x+2)(x-3)(x+4) = x^4 + 2x^3 - 13x^2 - 14x + 24
    const companion = [[0, 0, 0, -24], [1, 0, 0, 14], [0, 1, 0, 13], [0, 0, 1, -2]];
    const values = sortKey(eigenvalues(companion));
    [-4, -2, 1, 3].forEach((root, index) => {
      expect(values[index].re).toBeCloseTo(root, 8);
      expect(Math.abs(values[index].im)).toBeLessThan(1e-8);
    });
  });

  it('preserves trace and determinant on a dense 6x6 matrix', () => {
    let seed = 12345;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    const n = 6;
    const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => random() * 4));
    const values = eigenvalues(matrix);
    const trace = matrix.reduce((sum, row, i) => sum + row[i], 0);
    expect(values.reduce((sum, v) => sum + v.re, 0)).toBeCloseTo(trace, 9);
    // determinant by Gaussian elimination
    const m = matrix.map(row => [...row]);
    let det = 1;
    for (let c = 0; c < n; c += 1) {
      let p = c;
      for (let r = c + 1; r < n; r += 1) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      if (p !== c) { [m[c], m[p]] = [m[p], m[c]]; det = -det; }
      det *= m[c][c];
      for (let r = c + 1; r < n; r += 1) { const f = m[r][c] / m[c][c]; for (let k = c; k < n; k += 1) m[r][k] -= f * m[c][k]; }
    }
    let product = { re: 1, im: 0 };
    for (const v of values) product = { re: product.re * v.re - product.im * v.im, im: product.re * v.im + product.im * v.re };
    expect(product.re).toBeCloseTo(det, 7);
    expect(Math.abs(product.im)).toBeLessThan(1e-7);
  });

  it('classifies op-amp loop matrices: positive feedback is unstable, negative feedback stable', () => {
    expect(spectralAbscissa([[0.1]])).toBeGreaterThan(0);
    expect(spectralAbscissa([[-0.5]])).toBeLessThan(0);
    expect(spectralAbscissa([[-0.5, 0.2], [0.2, -0.5]])).toBeLessThan(0);
    expect(spectralAbscissa([[-0.1, 0.6], [0.6, -0.1]])).toBeGreaterThan(0);
  });
});
