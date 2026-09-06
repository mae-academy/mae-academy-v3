/** PLC Ladder backend contract: deterministic BOOL, DINT, and REAL32 arithmetic. */

export function toPlcBool(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim() !== '' && value.trim() !== '0';
  return Boolean(value);
}

export function toDint(value: unknown): number {
  if (typeof value !== 'number') return 0;
  if (Number.isNaN(value)) return 0;
  if (value === Infinity) return 2147483647;
  if (value === -Infinity) return -2147483648;
  const floor = Math.floor(value);
  const fraction = value - floor;
  const rounded = fraction < .5 ? floor : fraction > .5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
  return rounded | 0;
}

export function real32(value: unknown): number { return Math.fround(typeof value === 'number' ? value : 0); }
export function dintAdd(a: number, b: number): number { return (toDint(a) + toDint(b)) | 0; }
export function dintSub(a: number, b: number): number { return (toDint(a) - toDint(b)) | 0; }
export function dintMul(a: number, b: number): number { return Math.imul(toDint(a), toDint(b)); }
export function dintDiv(a: number, b: number): number { const right = toDint(b); return right === 0 ? toDint(a) : Math.trunc(toDint(a) / right) | 0; }
export function dintMod(a: number, b: number): number { const right = toDint(b); return right === 0 ? 0 : (toDint(a) % right) | 0; }
export function realAdd(a: number, b: number): number { return Math.fround(real32(a) + real32(b)); }
export function realSub(a: number, b: number): number { return Math.fround(real32(a) - real32(b)); }
export function realMul(a: number, b: number): number { return Math.fround(real32(a) * real32(b)); }
export function realDiv(a: number, b: number): number { return Math.fround(real32(a) / real32(b)); }
export function realMod(a: number, b: number): number { const right = real32(b); return right === 0 ? real32(a) / 0 : Math.fround(real32(a) % right); }

export function parsePlcNumber(token: string): { value: number; dataType: 'DINT' | 'REAL' } | null {
  const text = token.trim();
  if (/^-?2#[01]+$/i.test(text)) return { value: Number.parseInt(text.replace(/^-?2#/i, ''), 2) * (text.startsWith('-') ? -1 : 1) | 0, dataType: 'DINT' };
  if (/^-?8#[0-7]+$/i.test(text)) return { value: Number.parseInt(text.replace(/^-?8#/i, ''), 8) * (text.startsWith('-') ? -1 : 1) | 0, dataType: 'DINT' };
  if (/^-?16#[0-9a-f]+$/i.test(text)) return { value: Number.parseInt(text.replace(/^-?16#/i, ''), 16) * (text.startsWith('-') ? -1 : 1) | 0, dataType: 'DINT' };
  if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return { value, dataType: /[.e]/i.test(text) ? 'REAL' : 'DINT' };
}
