// Label placement (bounding-box collision with slot fallback) and canvas bounds. Pure geometry, deterministic.

import { analyze, type Analysis } from './netlist';
import { rnd } from './geometry';
import { autoMathSource, mathMetrics, texText } from './mathText';
import type { SymPrim } from './symbols';
import type { Issue, LabelPref, SchematicSpec } from './types';

export const FONT = 16;
export const LINE_H = 18;
export type PxRect = [number, number, number, number];

/** One rendered label line: `math` lines hold LaTeX-subset source (see mathText.ts), others plain text. */
export interface LabelLine { text: string; math: boolean }
export interface TextBlock {
  lines: LabelLine[];
  anchor: 'start' | 'middle' | 'end';
  x: number;
  /** baseline y of each line */
  baselines: number[];
  rect: PxRect;
}
export interface PartLabel extends TextBlock { part: string }
export interface Layout {
  analysis: Analysis;
  P: number;
  partLabels: PartLabel[];
  freeLabels: TextBlock[];
  /** content bounds in px (before padding) */
  bounds: PxRect;
  warnings: Issue[];
}

export function textWidth(s: string, size = FONT): number {
  let w = 0;
  for (const ch of s) {
    if ('il.,;:\'|!()[]{}jtfI '.includes(ch)) w += 0.3;
    else if ('mwMWΩΩ@'.includes(ch)) w += 0.88;
    else if (ch >= 'A' && ch <= 'Z') w += 0.68;
    else w += 0.57;
  }
  return Math.ceil(w * size);
}

/** Pixel width of a label line at the label font size. */
export function lineWidth(l: LabelLine, size = FONT): number {
  return l.math ? mathMetrics(l.text, size).width : textWidth(l.text, size);
}
const hit = (a: PxRect, b: PxRect): boolean => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
const inflate = (r: PxRect, d: number): PxRect => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];

function primBounds(p: SymPrim): PxRect | null {
  switch (p.k) {
    case 'line': return [Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2)];
    case 'poly': return p.pts.length ? [Math.min(...p.pts.map((q) => q[0])), Math.min(...p.pts.map((q) => q[1])), Math.max(...p.pts.map((q) => q[0])), Math.max(...p.pts.map((q) => q[1]))] : null;
    case 'rect': return [p.x, p.y, p.x + p.w, p.y + p.h];
    case 'circle': return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
    case 'path': {
      const xs: number[] = [], ys: number[] = [];
      for (const s of p.d) {
        if (s[0] === 'Z') continue;
        if (s[0] === 'Q') { xs.push(s[1], s[3]); ys.push(s[2], s[4]); }
        else if (s[0] === 'A') { xs.push(s[3]); ys.push(s[4]); }
        else { xs.push(s[1]); ys.push(s[2]); }
      }
      return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
    }
    case 'text': {
      const w = textWidth(p.text, p.size ?? FONT);
      const x0 = p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2;
      const h = (p.size ?? FONT) / 2 + 2;
      return [x0, p.y - h, x0 + w, p.y + h];
    }
  }
}

type Side = 'above' | 'below' | 'left' | 'right';
const OUTWARD: Record<number, Side> = { 0: 'above', 90: 'right', 180: 'below', 270: 'left' };

function block(lines: LabelLine[], side: Side, align: 'c' | 'a' | 'b', gap: number, box: PxRect): TextBlock {
  const w = Math.max(...lines.map((l) => lineWidth(l)));
  const h = LINE_H * lines.length;
  const ext = lines.map((l) => (l.math ? mathMetrics(l.text, FONT) : { hasSub: false, hasSup: false }));
  const extraTop = ext[0].hasSup ? 2 : 0, extraBottom = ext[ext.length - 1].hasSub ? 2 : 0;
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  let anchor: TextBlock['anchor'] = 'middle';
  let x: number, top: number, x0: number;
  if (side === 'above' || side === 'below') {
    top = side === 'above' ? box[1] - gap - h : box[3] + gap;
    if (align === 'c') { anchor = 'middle'; x = rnd(cx); x0 = x - w / 2; }
    else if (align === 'a') { anchor = 'start'; x = box[0]; x0 = x; }
    else { anchor = 'end'; x = box[2]; x0 = x - w; }
  } else {
    top = align === 'c' ? rnd(cy - h / 2) : align === 'a' ? box[1] : box[3] - h;
    if (side === 'right') { anchor = 'start'; x = box[2] + gap; x0 = x; } else { anchor = 'end'; x = box[0] - gap; x0 = x - w; }
  }
  top = rnd(top);
  return { lines, anchor, x: rnd(x), baselines: lines.map((_, i) => top + LINE_H * i + 13), rect: [x0, top + 1 - extraTop, x0 + w, top + h - 1 + extraBottom] };
}

export function layoutSchematic(spec: SchematicSpec): Layout {
  const a = analyze(spec);
  const P = spec.pitch;
  const warnings: Issue[] = [];
  const obstacles: PxRect[] = [];
  for (const p of a.placed) obstacles.push(inflate(p.box.map((v) => v * P) as PxRect, 2));
  for (const s of a.segs) obstacles.push(inflate([Math.min(s.x1, s.x2) * P, Math.min(s.y1, s.y2) * P, Math.max(s.x1, s.x2) * P, Math.max(s.y1, s.y2) * P], 2));
  for (const d of a.dots) obstacles.push([d[0] * P - 4, d[1] * P - 4, d[0] * P + 4, d[1] * P + 4]);

  // free-standing labels first: they are fixed
  const freeLabels: TextBlock[] = spec.labels.map((l) => {
    const line: LabelLine = { text: autoMathSource(l.text), math: true };
    const m = mathMetrics(line.text, FONT);
    const w = m.width;
    const x = l.at[0] * P, base = l.at[1] * P - 6;
    const x0 = l.anchor === 'start' ? x : l.anchor === 'end' ? x - w : x - w / 2;
    return { lines: [line], anchor: l.anchor, x, baselines: [base], rect: [x0, base - 13 - (m.hasSup ? 2 : 0), x0 + w, base + 3 + (m.hasSub ? 2 : 0)] };
  });
  const placedRects: PxRect[] = [];
  freeLabels.forEach((f, i) => {
    for (const p of a.placed) {
      const b = p.box.map((v) => v * P) as PxRect;
      if (hit(f.rect, b)) { warnings.push({ code: 'LABEL_OVERLAP', message: `Label "${spec.labels[i].text}" at (${spec.labels[i].at}) overlaps part ${p.part.id}; move the label.`, where: `labels[${i}]` }); break; }
    }
    for (const sg of a.segs) {
      const sr: PxRect = [Math.min(sg.x1, sg.x2) * P - 1, Math.min(sg.y1, sg.y2) * P - 1, Math.max(sg.x1, sg.x2) * P + 1, Math.max(sg.y1, sg.y2) * P + 1];
      if (hit(f.rect, sr)) { warnings.push({ code: 'LABEL_WIRE_OVERLAP', message: `Label "${spec.labels[i].text}" at (${spec.labels[i].at}) overlaps a wire; move the label into free space.`, where: `labels[${i}]` }); break; }
    }
    placedRects.push(f.rect);
  });

  const partLabels: PartLabel[] = [];
  for (const p of a.placed) {
    const mode = p.sym.labelMode;
    if (mode === 'none' || p.part.label === 'none') continue;
    const lines: LabelLine[] = [];
    if (mode === 'full' || mode === 'id') {
      const des = autoMathSource(p.part.attrs.label ?? p.part.id);
      lines.push({ text: p.part.attrs.control ? `${des}\\ ${texText(`(${p.part.attrs.control})`)}` : des, math: true });
    }
    if (mode !== 'id' && p.display && p.part.type === 'rail' && p.part.attrs.label) lines.push({ text: `${autoMathSource(p.part.attrs.label)}\\,=\\,${texText(p.display)}`, math: true }); // rail: "V_{CC} = 12 V"
    else if (mode !== 'id' && p.display) lines.push(p.part.type === 'port' ? { text: autoMathSource(p.display), math: true } : { text: p.display, math: false });
    if (lines.length === 0) continue;
    const box = p.box.map((v) => Math.round(v * P)) as PxRect;
    const pref = p.part.label !== 'auto' ? (p.part.label as Exclude<LabelPref, 'auto' | 'none'>) : null;
    const base: Side[] = mode === 'value' ? [OUTWARD[p.part.rot], 'above', 'below', 'right', 'left'] : p.part.rot === 0 || p.part.rot === 180 ? ['above', 'below', 'right', 'left'] : ['right', 'left', 'above', 'below'];
    const sides = Array.from(new Set<Side>([...(pref ? [pref] : []), ...base]));
    const own = obstacles.filter((_, i) => i !== a.placed.indexOf(p));
    const others = [...own, ...placedRects];
    const cands: TextBlock[] = [];
    for (const [align, gap] of [['c', 6], ['a', 6], ['b', 6], ['c', 6 + P], ['a', 6 + P], ['b', 6 + P], ['c', 6 + 2 * P]] as const) {
      for (const s of sides) cands.push(block(lines, s, align, gap, box));
    }
    let chosen = cands.find((c) => !others.some((o) => hit(c.rect, o)));
    if (!chosen) {
      chosen = cands[0];
      warnings.push({ code: 'LABEL_NO_SLOT', message: `No clean label slot for ${p.part.id}; the label may overlap wires or parts. Add space around ${p.part.id} or set label to a free side.`, where: p.part.id });
    }
    placedRects.push(chosen.rect);
    partLabels.push({ ...chosen, part: p.part.id });
  }

  // label/label overlap (only possible after a forced fallback)
  const all = [...partLabels.map((l) => ({ r: l.rect, n: l.part })), ...freeLabels.map((l, i) => ({ r: l.rect, n: `labels[${i}]` }))];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (hit(all[i].r, all[j].r)) warnings.push({ code: 'LABEL_OVERLAP', message: `Labels ${all[i].n} and ${all[j].n} overlap.`, where: all[i].n });
  }

  // inner-text overflow for blocks / gain
  for (const p of a.placed) {
    for (const pr of p.prims) {
      if (pr.k !== 'text' || (p.part.type !== 'block' && p.part.type !== 'gain')) continue;
      const w = textWidth(pr.text, pr.size);
      const avail = p.part.type === 'block' ? (p.box[2] - p.box[0]) * P - 8 : 1.5 * P;
      if (w > avail) warnings.push({ code: 'TEXT_OVERFLOW', message: `Text "${pr.text}" of ${p.part.id} is wider than its ${p.part.type}; increase attrs.w or shorten the text.`, where: p.part.id });
    }
  }

  // bounds
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const add = (r: PxRect | null): void => { if (!r) return; minx = Math.min(minx, r[0]); miny = Math.min(miny, r[1]); maxx = Math.max(maxx, r[2]); maxy = Math.max(maxy, r[3]); };
  for (const p of a.placed) { add(p.box.map((v) => v * P) as PxRect); for (const pr of p.prims) add(primBounds(pr)); }
  for (const w of spec.wires) for (const [x, y] of w.pts) add([x * P - 2, y * P - 2, x * P + 2, y * P + 2]);
  for (const l of partLabels) add(l.rect);
  for (const l of freeLabels) add(l.rect);
  for (const d of spec.domains) add([d.rect[0] * P, d.rect[1] * P, (d.rect[0] + d.rect[2]) * P, (d.rect[1] + d.rect[3]) * P]);
  if (!Number.isFinite(minx)) { minx = 0; miny = 0; maxx = 4 * P; maxy = 4 * P; }
  const bounds: PxRect = [Math.floor(minx) - 2, Math.floor(miny) - 2, Math.ceil(maxx) + 2, Math.ceil(maxy) + 2];
  return { analysis: a, P, partLabels, freeLabels, bounds, warnings };
}
