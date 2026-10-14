// Deterministic SVG renderer. Every user string is XML-escaped; attributes only ever receive engine-computed numbers.

import { rnd } from './geometry';
import { layoutSchematic } from './layout';
import { normalizeSchematicSpec } from './parse';
import type { Fill, Seg, SymPrim } from './symbols';
import type { SchematicSpec } from './types';

export interface RenderOptions { padding?: number }
export interface RenderResult { svg: string; width: number; height: number }

export function escapeXml(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const num = (v: number): string => {
  const r = Number.isFinite(v) ? Math.round(v) : 0;
  return String(r === 0 ? 0 : r);
};
const fillAttr = (f: Fill | undefined): string => (f === 'white' ? ' fill="#fff"' : f === 'black' ? ' fill="#000"' : '');

function pathD(d: Seg[], ox: number, oy: number): string {
  return d.map((s) => {
    switch (s[0]) {
      case 'M': case 'L': case 'T': return `${s[0]}${num(s[1] + ox)} ${num(s[2] + oy)}`;
      case 'Q': return `Q${num(s[1] + ox)} ${num(s[2] + oy)} ${num(s[3] + ox)} ${num(s[4] + oy)}`;
      case 'A': return `A${num(s[1])} ${num(s[1])} 0 0 ${s[2]} ${num(s[3] + ox)} ${num(s[4] + oy)}`;
      default: return 'Z';
    }
  }).join('');
}

function prim(p: SymPrim, ox: number, oy: number): string {
  switch (p.k) {
    case 'line':
      return `<line x1="${num(p.x1 + ox)}" y1="${num(p.y1 + oy)}" x2="${num(p.x2 + ox)}" y2="${num(p.y2 + oy)}"${p.sw ? ` stroke-width="${num(p.sw)}"` : ''}/>`;
    case 'poly': {
      const pts = p.pts.map(([x, y]) => `${num(x + ox)},${num(y + oy)}`).join(' ');
      return p.closed ? `<polygon points="${pts}"${fillAttr(p.fill)}/>` : `<polyline points="${pts}"/>`;
    }
    case 'rect':
      return `<rect x="${num(p.x + ox)}" y="${num(p.y + oy)}" width="${num(p.w)}" height="${num(p.h)}"${fillAttr(p.fill)}/>`;
    case 'circle':
      return `<circle cx="${num(p.cx + ox)}" cy="${num(p.cy + oy)}" r="${num(p.r)}"${fillAttr(p.fill)}/>`;
    case 'path':
      return `<path d="${pathD(p.d, ox, oy)}"${fillAttr(p.fill)}/>`;
    case 'text': {
      const size = p.size ?? 14;
      return `<text x="${num(p.x + ox)}" y="${num(p.y + oy + size * 0.35)}" text-anchor="${p.anchor ?? 'middle'}" font-size="${num(size)}"${p.bold ? ' font-weight="bold"' : ''} fill="#000" stroke="none">${escapeXml(p.text)}</text>`;
    }
  }
}

function invalidSvg(): RenderResult {
  const svg = '<!-- Standard: IEC 60617 | Pitch P = 20 px | Signal stroke 2 px | Power stroke 3 px -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 60" width="320" height="60">\n<rect x="0" y="0" width="320" height="60" fill="#fff"/>\n<text x="12" y="34" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#000">Invalid schematic spec</text>\n</svg>\n';
  return { svg, width: 320, height: 60 };
}

export function renderSchematicSvg(input: unknown, opts: RenderOptions = {}): RenderResult {
  try {
    const spec: SchematicSpec | null = normalizeSchematicSpec(input).spec;
    if (!spec) return invalidSvg();
    return renderSpec(spec, opts);
  } catch {
    return invalidSvg();
  }
}

export function renderSpec(spec: SchematicSpec, opts: RenderOptions = {}): RenderResult {
  const pad = Math.max(0, Math.min(200, Math.round(opts.padding ?? 24)));
  const lay = layoutSchematic(spec);
  const P = spec.pitch;
  const [minx, miny, maxx, maxy] = lay.bounds;
  const ox = pad - minx, oy = pad - miny;
  const width = maxx - minx + 2 * pad, height = maxy - miny + 2 * pad;
  const std = spec.standard === 'IEEE' ? 'IEEE 315' : 'IEC 60617';
  const out: string[] = [];
  out.push(`<!-- Standard: ${std} | Pitch P = ${P} px | Signal stroke 2 px | Power stroke 3 px -->`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}" width="${num(width)}" height="${num(height)}">`);
  out.push(`<title>${escapeXml(spec.title || 'Schematic')}</title>`);
  out.push('<desc>Schematic generated deterministically from a grid-snapped spec.</desc>');
  out.push(`<rect x="0" y="0" width="${num(width)}" height="${num(height)}" fill="#fff"/>`);

  if (spec.domains.length > 0) {
    out.push('<g id="domains" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="6 4" font-family="Helvetica, Arial, sans-serif">');
    for (const d of spec.domains) {
      out.push(`<rect x="${num(d.rect[0] * P + ox)}" y="${num(d.rect[1] * P + oy)}" width="${num(d.rect[2] * P)}" height="${num(d.rect[3] * P)}"/>`);
      out.push(`<text x="${num(d.rect[0] * P + ox + 6)}" y="${num(d.rect[1] * P + oy + 14)}" font-size="12" fill="#000" stroke="none">${escapeXml(d.name)}</text>`);
    }
    out.push('</g>');
  }

  out.push('<g id="wires" fill="none" stroke="#000" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" shape-rendering="crispEdges">');
  const arrows: string[] = [];
  spec.wires.forEach((w) => {
    const pts = w.pts.map(([x, y]) => [x * P, y * P] as [number, number]);
    if (w.arrow && pts.length >= 2) {
      const [tx, ty] = pts[pts.length - 1];
      const [px, py] = pts[pts.length - 2];
      const len = Math.hypot(tx - px, ty - py);
      if (len > 0) {
        const ux = (tx - px) / len, uy = (ty - py) / len;
        const al = Math.min(len, 10);
        const bx = tx - ux * al, by = ty - uy * al;
        pts[pts.length - 1] = [rnd(bx), rnd(by)];
        const hw = 4;
        arrows.push(`<polygon points="${num(tx + ox)},${num(ty + oy)} ${num(bx - uy * hw + ox)},${num(by + ux * hw + oy)} ${num(bx + uy * hw + ox)},${num(by - ux * hw + oy)}" fill="#000" stroke-linejoin="miter"/>`);
      }
    }
    const d = pts.map(([x, y]) => `${num(x + ox)},${num(y + oy)}`).join(' ');
    out.push(`<polyline points="${d}"${w.power ? ' stroke-width="3"' : ''}/>`);
  });
  out.push(...arrows);
  out.push('</g>');

  out.push('<g id="parts" fill="none" stroke="#000" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" font-family="Helvetica, Arial, sans-serif">');
  for (const pl of lay.analysis.placed) {
    out.push('<g>');
    for (const p of pl.prims) out.push(prim(p, ox, oy));
    out.push('</g>');
  }
  out.push('</g>');

  const r = Math.max(2, Math.round(P * 0.15));
  out.push('<g id="junctions" fill="#000" stroke="none">');
  for (const [x, y] of lay.analysis.dots) out.push(`<circle cx="${num(x * P + ox)}" cy="${num(y * P + oy)}" r="${num(r)}"/>`);
  out.push('</g>');

  out.push('<g id="labels" fill="#000" stroke="none" font-family="Helvetica, Arial, sans-serif" font-size="14">');
  const text = (l: { lines: string[]; anchor: string; x: number; baselines: number[] }): void => {
    l.lines.forEach((line, i) => out.push(`<text x="${num(l.x + ox)}" y="${num(l.baselines[i] + oy)}" text-anchor="${l.anchor}">${escapeXml(line)}</text>`));
  };
  lay.partLabels.forEach(text);
  lay.freeLabels.forEach(text);
  out.push('</g>');
  out.push('</svg>');
  return { svg: out.join('\n') + '\n', width, height };
}
