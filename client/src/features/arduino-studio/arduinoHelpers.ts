/**
 * Stateless helpers referenced by transpiled sketches as `$h.*`.
 * Integer semantics follow avr-gcc (int = 16 bit, long = 32 bit).
 */

export class ArduinoRuntimeError extends Error {}

export type StrKind = "i" | "f" | "c" | "s";

function fmtFloat(v: number, digits: number): string {
  if (Number.isNaN(v)) return "nan";
  if (!Number.isFinite(v)) return v < 0 ? "-inf" : "inf";
  return v.toFixed(Math.max(0, Math.min(20, digits)));
}

export function toStr(v: unknown, kind: StrKind, digits = 2): string {
  switch (kind) {
    case "s":
      return String(v);
    case "c":
      return String.fromCharCode(Number(v) & 255);
    case "f":
      return fmtFloat(Number(v), digits);
    default:
      return String(Math.trunc(Number(v)));
  }
}

/** Integer to text in a given base; negatives are shown as 32-bit two's complement like Arduino's Print. */
export function toBase(v: number, base: number): string {
  if (base === 10 || ![2, 8, 16].includes(base)) return String(Math.trunc(v));
  const n = v < 0 ? v >>> 0 : Math.trunc(v);
  return n.toString(base).toUpperCase();
}

export const helpers = {
  toStr,
  toBase,
  get(arr: unknown, i: number): unknown {
    if (!Array.isArray(arr)) throw new ArduinoRuntimeError("Indexing a non-array value");
    if (i < 0 || i >= arr.length) throw new ArduinoRuntimeError(`Array index out of bounds: index ${i}, length ${arr.length}`);
    return arr[i];
  },
  set<T>(arr: unknown, i: number, v: T): T {
    if (!Array.isArray(arr)) throw new ArduinoRuntimeError("Indexing a non-array value");
    if (i < 0 || i >= arr.length) throw new ArduinoRuntimeError(`Array index out of bounds: index ${i}, length ${arr.length}`);
    arr[i] = v;
    return v;
  },
  mk(dims: number[], fill: number | string | boolean, init?: unknown[]): unknown[] {
    const build = (d: number, src?: unknown[]): unknown[] => {
      const n = dims[d];
      if (!Number.isInteger(n) || n < 0) throw new ArduinoRuntimeError(`Invalid array size ${n}`);
      return Array.from({ length: n }, (_, i) =>
        d === dims.length - 1 ? (src && i < src.length ? src[i] : fill) : build(d + 1, src && Array.isArray(src[i]) ? (src[i] as unknown[]) : undefined),
      );
    };
    return build(0, init);
  },
  idiv(a: number, b: number): number {
    if (b === 0) throw new ArduinoRuntimeError("Integer division by zero");
    return Math.trunc(a / b);
  },
  imod(a: number, b: number): number {
    if (b === 0) throw new ArduinoRuntimeError("Integer modulo by zero");
    return a % b;
  },
  clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
  },
  /** Arduino map(): 32-bit integer arithmetic. */
  map(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const den = (inMax - inMin) | 0;
    if (den === 0) return 0;
    return (Math.trunc(Math.imul((x - inMin) | 0, (outMax - outMin) | 0) / den) + outMin) | 0;
  },
  round(x: number): number {
    return x < 0 ? -Math.round(-x) : Math.round(x);
  },
  isDigit: (c: number): boolean => c >= 48 && c <= 57,
  isAlpha: (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122),
  isAlphaNumeric: (c: number): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122),
  isSpace: (c: number): boolean => c === 32 || (c >= 9 && c <= 13),
  isUpperCase: (c: number): boolean => c >= 65 && c <= 90,
  isLowerCase: (c: number): boolean => c >= 97 && c <= 122,
  isPunct: (c: number): boolean => (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126),
  toUpper: (c: number): number => (c >= 97 && c <= 122 ? c - 32 : c),
  toLower: (c: number): number => (c >= 65 && c <= 90 ? c + 32 : c),
  // --- String (JS strings model Arduino String) ---
  charAt(s: string, i: number): number {
    return i >= 0 && i < s.length ? s.charCodeAt(i) : 0;
  },
  sub(s: string, a: number, b?: number): string {
    const end = b === undefined ? s.length : b;
    return a > end ? s.substring(end, a) : s.substring(Math.max(0, a), Math.max(0, end));
  },
  indexOf(s: string, needle: string | number, from = 0): number {
    return s.indexOf(typeof needle === "number" ? String.fromCharCode(needle) : needle, from);
  },
  lastIndexOf(s: string, needle: string | number): number {
    return s.lastIndexOf(typeof needle === "number" ? String.fromCharCode(needle) : needle);
  },
  toInt(s: string): number {
    const m = /^\s*[+-]?\d+/.exec(s);
    return m ? parseInt(m[0], 10) | 0 : 0;
  },
  toFloat(s: string): number {
    const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s);
    return m ? parseFloat(m[0]) : 0;
  },
  eqIgnoreCase: (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase(),
  replace: (s: string, a: string | number, b: string | number): string =>
    s.split(typeof a === "number" ? String.fromCharCode(a) : a).join(typeof b === "number" ? String.fromCharCode(b) : b),
  remove(s: string, idx: number, count?: number): string {
    return count === undefined ? s.slice(0, idx) : s.slice(0, idx) + s.slice(idx + count);
  },
  setCharAt: (s: string, i: number, c: number): string =>
    i >= 0 && i < s.length ? s.slice(0, i) + String.fromCharCode(c) + s.slice(i + 1) : s,
  cmp: (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0),
};

export type Helpers = typeof helpers;
