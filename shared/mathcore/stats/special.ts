/**
 * Special functions (STEPS.md §8.6): Γ, ln Γ, erf, erfc, regularized incomplete beta Iₓ(a, b) and regularized
 * incomplete gamma P(a, x). Checked against mpmath and SciPy offline through the golden files.
 */

const SQRT_PI = Math.sqrt(Math.PI);
const LN_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const EPS = Number.EPSILON;
/** Iteration cap for series and continued fractions; reaching it returns NaN instead of a silent wrong value. */
const MAX_ITER = 10_000;

// Lanczos approximation, g = 7, n = 9 (relative error about 1e-15 for real arguments).
const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function gamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return Infinity;
  if (Number.isInteger(x)) {
    if (x <= 0) return NaN; // poles
    if (x <= 171) {
      let f = 1;
      for (let k = 2; k < x; k++) f *= k;
      return f;
    }
    return Infinity;
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  if (x > 171.7) return Infinity;
  const z = x - 1;
  let s = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) s += LANCZOS[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  // t^(z+0.5) e^(-t) split to avoid overflow before x ≈ 171.
  const half = Math.pow(t, (z + 0.5) / 2);
  return Math.sqrt(2 * Math.PI) * half * (half * Math.exp(-t)) * s;
}

export function lnGamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity; // poles
  // Reflection; for negative x this is ln|Γ(x)|.
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let s = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) s += LANCZOS[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(s);
}

/** erf(x) = 2/√π e^{-x²} Σ 2ⁿ x^{2n+1} / (1·3·…·(2n+1)): all terms positive, so no cancellation for |x| ≤ 3. */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < MAX_ITER; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (Math.abs(term) <= EPS * Math.abs(sum)) break;
  }
  return ((2 / SQRT_PI) * Math.exp(-x2)) * sum;
}

/** erfc(x) for x ≥ 0.5 by the Laplace continued fraction (modified Lentz). */
function erfcFraction(x: number): number {
  const tiny = 1e-300;
  // erfc(x) = e^{-x²}/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + …)))))
  let f = x;
  let C = x;
  let D = 0;
  for (let n = 1; n < MAX_ITER; n++) {
    const an = n / 2;
    D = x + an * D;
    D = Math.abs(D) < tiny ? tiny : D;
    C = x + an / C;
    C = Math.abs(C) < tiny ? tiny : C;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) <= EPS) return Math.exp(-x * x) / (SQRT_PI * f);
  }
  return NaN;
}

export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax <= 3) return erfSeries(x);
  if (ax > 6) return Math.sign(x);
  return Math.sign(x) * (1 - erfcFraction(ax));
}

export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0.5) return 1 - erf(x);
  if (x > 27) return 0;
  return erfcFraction(x);
}

/** Continued fraction for the incomplete beta (modified Lentz). */
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  d = Math.abs(d) < tiny ? tiny : d;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = 1 + aa / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = 1 + aa / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) return h;
  }
  return NaN;
}

/** Regularized incomplete beta Iₓ(a, b), a, b > 0, 0 ≤ x ≤ 1. */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (!(a > 0) || !(b > 0) || Number.isNaN(x) || x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaFraction(a, b, x)) / a;
  return 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

/** Regularized lower incomplete gamma P(a, x), a > 0, x ≥ 0. */
export function incompleteGammaP(a: number, x: number): number {
  if (!(a > 0) || Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return 0;
  const lnFront = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let sum = del;
    for (let n = 1; n < MAX_ITER; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) return sum * Math.exp(lnFront);
    }
    return NaN;
  }
  return 1 - incompleteGammaQFraction(a, x, lnFront);
}

/** Regularized upper incomplete gamma Q(a, x) = 1 − P(a, x), accurate in the upper tail. */
export function incompleteGammaQ(a: number, x: number): number {
  if (!(a > 0) || Number.isNaN(x) || x < 0) return NaN;
  if (x < a + 1) return 1 - incompleteGammaP(a, x);
  return incompleteGammaQFraction(a, x, -x + a * Math.log(x) - lnGamma(a));
}

function incompleteGammaQFraction(a: number, x: number, lnFront: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    d = Math.abs(d) < tiny ? tiny : d;
    c = b + an / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) return Math.exp(lnFront) * h;
  }
  return NaN;
}
