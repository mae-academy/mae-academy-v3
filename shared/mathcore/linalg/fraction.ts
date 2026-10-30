/**
 * Exact rationals for teaching steps (STEPS.md §8.2 Gauss-Jordan: each row operation shown in LaTeX). Integer and
 * short-decimal matrices are reduced exactly, so a student sees R₂ ← R₂ − ⅔R₁, not R₂ ← R₂ − 0.6666666666666666R₁.
 */

/** Decimal places accepted for an exact conversion (0.125 → 1/8); longer decimals stay floating point. */
const MAX_EXACT_DECIMALS = 9;

// BigInt literals (0n) need an ES2020 target; this project targets lower, so the constants are built with BigInt().
const B0 = BigInt(0);
const B1 = BigInt(1);
const B10 = BigInt(10);
const bigPow10 = (k: number): bigint => {
  let r = B1;
  for (let i = 0; i < k; i++) r *= B10;
  return r;
};

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < B0 ? -a : a;
  let y = b < B0 ? -b : b;
  while (y !== B0) [x, y] = [y, x % y];
  return x;
};

export class Fraction {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint, d: bigint = B1) {
    if (d === B0) throw new RangeError("Fraction with zero denominator");
    const g = gcd(n, d) || B1;
    const s = d < B0 ? -B1 : B1;
    this.n = (s * n) / g;
    this.d = (s * d) / g;
  }

  static readonly ZERO = new Fraction(B0);
  static readonly ONE = new Fraction(B1);

  /** Exact value of a finite double with at most MAX_EXACT_DECIMALS decimals, else null. */
  static fromNumber(x: number): Fraction | null {
    if (!Number.isFinite(x)) return null;
    for (let k = 0; k <= MAX_EXACT_DECIMALS; k++) {
      const r = Math.round(x * 10 ** k);
      // Exact only if the decimal reads back as the same double (so 1e-200 is not mistaken for 0).
      if (Number.isSafeInteger(r) && r / 10 ** k === x) {
        return new Fraction(BigInt(r), bigPow10(k));
      }
    }
    return null;
  }

  add(o: Fraction): Fraction {
    return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Fraction): Fraction {
    return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Fraction): Fraction {
    return new Fraction(this.n * o.n, this.d * o.d);
  }
  div(o: Fraction): Fraction {
    return new Fraction(this.n * o.d, this.d * o.n);
  }
  neg(): Fraction {
    return new Fraction(-this.n, this.d);
  }
  isZero(): boolean {
    return this.n === B0;
  }
  isOne(): boolean {
    return this.n === B1 && this.d === B1;
  }
  abs(): Fraction {
    return this.n < B0 ? this.neg() : this;
  }
  compareAbs(o: Fraction): number {
    const a = (this.n < B0 ? -this.n : this.n) * o.d;
    const b = (o.n < B0 ? -o.n : o.n) * this.d;
    return a === b ? 0 : a > b ? 1 : -1;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  /** LaTeX: `3`, `-\frac{2}{3}`. */
  toLatex(): string {
    if (this.d === B1) return this.n.toString();
    const sign = this.n < B0 ? "-" : "";
    const n = this.n < B0 ? -this.n : this.n;
    return `${sign}\\frac{${n}}{${this.d}}`;
  }
}
