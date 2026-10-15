// Placing symbols: rotation/flip transforms, terminal positions (grid units) and pixel-space primitives.

import { formatValue } from './values';
import { getSymbol, type Seg, type SymPrim, type SymbolDef } from './symbols';
import type { PartSpec, Pt, Rot, Standard } from './types';

/** Round half away from zero so mirrored shapes stay mirrored. */
export const rnd = (x: number): number => {
  const r = Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
  return r === 0 ? 0 : r;
};

export function tf(rot: Rot, flip: boolean, x: number, y: number): [number, number] {
  if (flip) y = -y;
  let r: [number, number];
  switch (rot) {
    case 90: r = [-y, x]; break;
    case 180: r = [-x, -y]; break;
    case 270: r = [y, -x]; break;
    default: r = [x, y];
  }
  return [r[0] + 0, r[1] + 0];
}

export interface PlacedTerminal { part: string; name: string; x: number; y: number; optional: boolean; key: string }
export interface PlacedPart {
  part: PartSpec;
  sym: SymbolDef;
  terminals: PlacedTerminal[];
  /** pixel-space primitives (absolute, pre canvas offset) */
  prims: SymPrim[];
  /** footprint in grid units, absolute */
  box: [number, number, number, number];
  /** value text as displayed (normalised) */
  display: string;
}

export function placePart(part: PartSpec, std: Standard, P: number): PlacedPart | null {
  const sym = getSymbol(part.type);
  if (!sym) return null;
  const display = part.value === undefined ? '' : formatValue(part.value, sym.unit);
  const built = sym.build({ attrs: part.attrs, std, value: display });
  const [ax, ay] = part.at;
  const T = (x: number, y: number): [number, number] => tf(part.rot, part.flip, x, y);
  const px = (x: number, y: number): [number, number] => {
    const [a, b] = T(x, y);
    return [ax * P + rnd(a * P), ay * P + rnd(b * P)];
  };
  const mirrored = part.flip;
  const prims: SymPrim[] = built.prims.map((p): SymPrim => {
    switch (p.k) {
      case 'line': {
        const [x1, y1] = px(p.x1, p.y1), [x2, y2] = px(p.x2, p.y2);
        return { k: 'line', x1, y1, x2, y2, sw: p.sw };
      }
      case 'poly':
        return { k: 'poly', pts: p.pts.map(([x, y]) => px(x, y)), closed: p.closed, fill: p.fill };
      case 'rect': {
        const [x1, y1] = px(p.x, p.y), [x2, y2] = px(p.x + p.w, p.y + p.h);
        return { k: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), fill: p.fill };
      }
      case 'circle': {
        const [cx, cy] = px(p.cx, p.cy);
        return { k: 'circle', cx, cy, r: Math.max(1, rnd(p.r * P)), fill: p.fill };
      }
      case 'path':
        return { k: 'path', fill: p.fill, d: p.d.map((s): Seg => {
          switch (s[0]) {
            case 'M': case 'L': case 'T': { const [x, y] = px(s[1], s[2]); return [s[0], x, y]; }
            case 'Q': { const [a, b] = px(s[1], s[2]), [x, y] = px(s[3], s[4]); return ['Q', a, b, x, y]; }
            case 'A': { const [x, y] = px(s[3], s[4]); return ['A', Math.max(1, rnd(s[1] * P)), (mirrored ? 1 - s[2] : s[2]) as 0 | 1, x, y]; }
            default: return ['Z'];
          }
        }) };
      case 'text': {
        const [x, y] = px(p.x, p.y);
        return { ...p, x, y };
      }
    }
  });
  const c1 = T(built.box[0], built.box[1]), c2 = T(built.box[2], built.box[3]);
  const box: [number, number, number, number] = [
    ax + Math.min(c1[0], c2[0]), ay + Math.min(c1[1], c2[1]), ax + Math.max(c1[0], c2[0]), ay + Math.max(c1[1], c2[1]),
  ];
  // A flipped op-amp (inverting input at the bottom) keeps V+ on top and V- at the bottom, as in every textbook figure.
  const swapSupply = part.type === 'opamp' && part.flip;
  const terminals: PlacedTerminal[] = built.terminals.map((tm) => {
    const [x, y] = T(tm.x, tm.y);
    const name = swapSupply && tm.name === 'V+' ? 'V-' : swapSupply && tm.name === 'V-' ? 'V+' : tm.name;
    return { part: part.id, name, x: ax + Math.round(x), y: ay + Math.round(y), optional: tm.optional === true, key: `${part.id}.${name}` };
  });
  return { part, sym, terminals, prims, box, display };
}

// ---- segment helpers (grid units, integer) ----
export interface Seg2 { x1: number; y1: number; x2: number; y2: number; wire: number }
export const isH = (s: Seg2): boolean => s.y1 === s.y2;
export const isV = (s: Seg2): boolean => s.x1 === s.x2;

export function wireSegments(pts: Pt[], wire: number): Seg2[] {
  const out: Seg2[] = [];
  for (let i = 1; i < pts.length; i++) out.push({ x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], wire });
  return out;
}

/** point lies on the (orthogonal) segment, endpoints included */
export function onSeg(s: Seg2, x: number, y: number): boolean {
  if (s.y1 === s.y2) return y === s.y1 && x >= Math.min(s.x1, s.x2) && x <= Math.max(s.x1, s.x2);
  if (s.x1 === s.x2) return x === s.x1 && y >= Math.min(s.y1, s.y2) && y <= Math.max(s.y1, s.y2);
  return false;
}
export const isEnd = (s: Seg2, x: number, y: number): boolean => (s.x1 === x && s.y1 === y) || (s.x2 === x && s.y2 === y);

/** does the segment run through the STRICT interior of the box (positive-length overlap)? */
export function segInBox(s: Seg2, b: [number, number, number, number]): boolean {
  if (b[2] - b[0] <= 0 || b[3] - b[1] <= 0) return false;
  if (s.y1 === s.y2) {
    if (!(s.y1 > b[1] && s.y1 < b[3])) return false;
    return Math.min(Math.max(s.x1, s.x2), b[2]) - Math.max(Math.min(s.x1, s.x2), b[0]) > 0;
  }
  if (s.x1 === s.x2) {
    if (!(s.x1 > b[0] && s.x1 < b[2])) return false;
    return Math.min(Math.max(s.y1, s.y2), b[3]) - Math.max(Math.min(s.y1, s.y2), b[1]) > 0;
  }
  return false;
}

export type Box = [number, number, number, number];
const E = 1e-6;
export function boxesOverlap(a: Box, b: Box): boolean {
  if (a[2] - a[0] <= 0 || a[3] - a[1] <= 0 || b[2] - b[0] <= 0 || b[3] - b[1] <= 0) return false;
  return Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > E && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > E;
}
/** gap between boxes (>0 separated, 0 touching, <0 overlapping) as Chebyshev-style distance */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(a[1] - b[3], b[1] - a[3]);
  return Math.max(dx, dy);
}
