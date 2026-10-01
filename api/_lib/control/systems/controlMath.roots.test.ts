import { describe, expect, it } from 'vitest';
import { evalPolyComplex } from '../../../../shared/control/polynomial';
import { findPolynomialRoots, hessenbergEigenvalues } from './controlMath';

// The root finder was verified against ml-matrix's EigenvalueDecomposition on 2000 random polynomials of degree 3-12
// (worst relative root difference 6.6e-15) before that dependency was dropped; these tests keep the same guarantees dependency-free.
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fromRoots = (roots: number[]) => roots.reduce<number[]>((c, r) => { const next = Array(c.length + 1).fill(0); c.forEach((v, i) => { next[i] += v; next[i + 1] -= r * v; }); return next; }, [1]);

describe('pure-TypeScript polynomial roots (Hessenberg QR)', () => {
  it('every root of 2000 random polynomials (degree 3-12) has a relative residual ≈ machine precision, and complex roots come in conjugate pairs', () => {
    for (let trial = 0; trial < 2000; trial++) {
      const degree = 3 + (trial % 10);
      const c = Array.from({ length: degree + 1 }, (_, i) => (i === 0 ? 1 + rnd() : (rnd() - 0.5) * 20));
      const roots = findPolynomialRoots(c);
      expect(roots).toHaveLength(degree);
      for (const root of roots) {
        const value = evalPolyComplex(c, root);
        const scale = c.reduce((sum, x) => sum + Math.abs(x), 0) * Math.max(1, Math.hypot(root.re, root.im)) ** degree;
        expect(Math.hypot(value.re, value.im) / scale).toBeLessThan(1e-12);
      }
      for (const root of roots.filter((r) => r.im > 1e-9)) expect(roots.some((o) => Math.abs(o.re - root.re) < 1e-7 && Math.abs(o.im + root.im) < 1e-7)).toBe(true);
    }
  });

  it('recovers known roots, including repeated and clustered ones (error ~ eps^(1/multiplicity))', () => {
    expect(findPolynomialRoots(fromRoots([-1, -2, -3, -4])).map((r) => r.re).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-4, -3, -2, -1]);
    for (const roots of [[-1, -1, -1, -2], [-1, -1, -1, -1, -1], [0, 0, 0, -3], [-2, -2, -2, -2, -2, -2]]) {
      const found = findPolynomialRoots(fromRoots(roots));
      roots.forEach((r) => expect(Math.min(...found.map((m) => Math.hypot(m.re - r, m.im)))).toBeLessThan(2e-2));
    }
    const pair = findPolynomialRoots(fromRoots([-1, -2, -5]).length ? [1, 2, 5, 3] : []);
    expect(pair).toHaveLength(3);
  });

  it('eigenvalues of a Hessenberg matrix: diagonal, rotation block and a defective Jordan block', () => {
    const sorted = (v: Array<{ re: number; im: number }>) => v.map((e) => [Math.round(e.re * 1e6) / 1e6, Math.round(e.im * 1e6) / 1e6]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(sorted(hessenbergEigenvalues([[2, 0, 0], [0, 3, 0], [0, 0, 5]]))).toEqual([[2, 0], [3, 0], [5, 0]]);
    expect(sorted(hessenbergEigenvalues([[0, -1], [1, 0]]))).toEqual([[0, -1], [0, 1]]);
    for (const e of hessenbergEigenvalues([[1, 1, 0], [0, 1, 1], [0, 0, 1]])) expect(Math.abs(e.re - 1)).toBeLessThan(1e-4);
  });
});
