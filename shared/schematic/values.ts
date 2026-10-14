// Engineering value parsing ("10 kΩ", "47uF", "1 MHz") with SI prefixes and unit checking.

export type Dim = 'ohm' | 'F' | 'H' | 'V' | 'A' | 'Hz';

const PREFIX: Record<string, number> = {
  k: 1e3, K: 1e3, M: 1e6, G: 1e9, m: 1e-3, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, n: 1e-9, p: 1e-12,
};

const UNIT: Record<string, { sym: string; dim: Dim }> = {
  'Ω': { sym: 'Ω', dim: 'ohm' }, 'Ω': { sym: 'Ω', dim: 'ohm' },
  ohm: { sym: 'Ω', dim: 'ohm' }, ohms: { sym: 'Ω', dim: 'ohm' }, Ohm: { sym: 'Ω', dim: 'ohm' },
  Ohms: { sym: 'Ω', dim: 'ohm' }, R: { sym: 'Ω', dim: 'ohm' },
  F: { sym: 'F', dim: 'F' }, H: { sym: 'H', dim: 'H' },
  V: { sym: 'V', dim: 'V' }, Vdc: { sym: 'V', dim: 'V' }, VDC: { sym: 'V', dim: 'V' }, Vac: { sym: 'V', dim: 'V' },
  Vrms: { sym: 'V', dim: 'V' }, Vpp: { sym: 'V', dim: 'V' }, Vpk: { sym: 'V', dim: 'V' },
  A: { sym: 'A', dim: 'A' }, Hz: { sym: 'Hz', dim: 'Hz' },
};

export interface ParsedValue {
  si: number;
  sign: '' | '+' | '−';
  numText: string;
  /** one of k M G m µ n p, or '' */
  prefix: string;
  unit: string | null;
  dim: Dim | null;
}

const RE = /^([+\-−]?)\s*(\d+(?:\.\d+)?|\.\d+)(?:[eE]([+\-]?\d+))?\s*([kKMGmuµμnp])?\s*([A-Za-zΩΩ]*)\s*$/;

export function parseValue(raw: string): ParsedValue | null {
  const m = RE.exec(raw);
  if (!m) return null;
  let prefixCh = m[4] ?? '';
  let unitTxt = m[5] ?? '';
  // "10 F", "5 H" etc. must not eat the unit as a prefix; prefix chars are never unit letters, so this is safe.
  // Edge: "5 m" prefix m, no unit. "10 mm" -> unknown unit -> null.
  let unit: { sym: string; dim: Dim } | null = null;
  if (unitTxt) {
    unit = UNIT[unitTxt] ?? null;
    if (!unit) {
      // maybe the "prefix" letter was really part of an unusual unit; reject
      return null;
    }
  }
  const mantissa = Number(m[2] + (m[3] ? 'e' + m[3] : ''));
  if (!Number.isFinite(mantissa)) return null;
  const factor = prefixCh ? PREFIX[prefixCh] : 1;
  const sign = m[1] === '-' || m[1] === '−' ? '−' : m[1] === '+' ? '+' : '';
  const si = (sign === '−' ? -1 : 1) * mantissa * factor;
  if (prefixCh === 'u' || prefixCh === 'μ') prefixCh = 'µ';
  if (prefixCh === 'K') prefixCh = 'k';
  unitTxt = unit ? unit.sym : '';
  return { si, sign, numText: m[2] + (m[3] ? 'e' + m[3] : ''), prefix: prefixCh, unit: unit ? unit.sym : null, dim: unit ? unit.dim : null };
}

export const DEFAULT_UNIT: Record<Dim, string> = { ohm: 'Ω', F: 'F', H: 'H', V: 'V', A: 'A', Hz: 'Hz' };

/** Display text: u -> µ, ohm -> Ω, default unit appended when the dimension is known from the part type. */
export function formatValue(raw: string, expected: Dim | null): string {
  const p = parseValue(raw);
  if (!p) return raw;
  const unit = p.unit ?? (expected ? DEFAULT_UNIT[expected] : '');
  return `${p.sign}${p.numText}${unit || p.prefix ? ' ' : ''}${p.prefix}${unit}`;
}
