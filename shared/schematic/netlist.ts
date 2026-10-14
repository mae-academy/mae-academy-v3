// Connectivity analysis (union-find over terminals and wires) and netlist derivation.

import { isEnd, onSeg, placePart, wireSegments, type PlacedPart, type PlacedTerminal, type Seg2 } from './geometry';
import type { Issue, SchematicSpec } from './types';

export interface NetInfo { id: string; name: string; terminals: string[]; labelled: boolean }
export interface NetlistPart { designator: string; type: string; value: string; nodes: Record<string, string> }
export interface Netlist {
  nets: NetInfo[];
  parts: NetlistPart[];
  groundNet: string | null;
  /** "R1.2" -> "N3" */
  netOfTerminal: Record<string, string>;
}

class UF {
  p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  f(a: number): number { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
  u(a: number, b: number): void { const x = this.f(a), y = this.f(b); if (x !== y) this.p[Math.max(x, y)] = Math.min(x, y); }
}

export interface Analysis {
  spec: SchematicSpec;
  placed: PlacedPart[];
  terminals: PlacedTerminal[];
  segs: Seg2[];
  /** physical component id per terminal index */
  termComp: number[];
  /** physical component id per wire index */
  wireComp: number[];
  dots: [number, number][];
  crossings: [number, number][];
  danglingEnds: { wire: number; x: number; y: number }[];
  nearMisses: { x: number; y: number; what: string }[];
  /** terminals that sit on a wire's segment interior without a vertex */
  overTerminal: { term: PlacedTerminal; wire: number }[];
  /** physical component id of each label (or -1) */
  labelComp: number[];
  netlist: Netlist;
  /** net id per terminal index ('' when an unused optional terminal) */
  termNet: string[];
  warnings: Issue[];
}

const pk = (x: number, y: number): string => `${x},${y}`;

export function analyze(spec: SchematicSpec): Analysis {
  const placed: PlacedPart[] = [];
  for (const p of spec.parts) { const pp = placePart(p, spec.standard, spec.pitch); if (pp) placed.push(pp); }
  const terminals = placed.flatMap((p) => p.terminals);
  const T = terminals.length, W = spec.wires.length;
  const uf = new UF(T + W);

  const termAt = new Map<string, number[]>();
  terminals.forEach((t, i) => { const k = pk(t.x, t.y); (termAt.get(k) ?? termAt.set(k, []).get(k)!).push(i); });
  for (const idx of Array.from(termAt.values())) for (let i = 1; i < idx.length; i++) uf.u(idx[0], idx[i]);

  const segs: Seg2[] = spec.wires.flatMap((w, i) => wireSegments(w.pts, i));
  const hByY = new Map<number, Seg2[]>(), vByX = new Map<number, Seg2[]>();
  for (const s of segs) {
    if (s.y1 === s.y2) (hByY.get(s.y1) ?? hByY.set(s.y1, []).get(s.y1)!).push(s);
    else if (s.x1 === s.x2) (vByX.get(s.x1) ?? vByX.set(s.x1, []).get(s.x1)!).push(s);
  }
  const segsAt = (x: number, y: number): Seg2[] => [...(hByY.get(y) ?? []), ...(vByX.get(x) ?? [])].filter((s) => onSeg(s, x, y));

  const vertexPts = new Set<string>();
  spec.wires.forEach((w, wi) => {
    for (const [x, y] of w.pts) {
      vertexPts.add(pk(x, y));
      for (const ti of termAt.get(pk(x, y)) ?? []) uf.u(T + wi, ti);
      for (const s of segsAt(x, y)) if (s.wire !== wi) uf.u(T + wi, T + s.wire);
    }
  });

  // terminals lying on a wire interior without a vertex there
  const overTerminal: Analysis['overTerminal'] = [];
  terminals.forEach((t) => {
    for (const s of segsAt(t.x, t.y)) {
      if (isEnd(s, t.x, t.y)) continue;
      if (spec.wires[s.wire].pts.some(([x, y]) => x === t.x && y === t.y)) continue;
      overTerminal.push({ term: t, wire: s.wire });
    }
  });

  // crossings: interiors of both segments intersect and nothing is attached at that point
  const crossings: [number, number][] = [];
  const termPts = new Set(terminals.map((t) => pk(t.x, t.y)));
  const seenX = new Set<string>();
  for (const [y, hs] of Array.from(hByY)) for (const h of hs) {
    const lo = Math.min(h.x1, h.x2), hi = Math.max(h.x1, h.x2);
    for (const [x, vs] of Array.from(vByX)) {
      if (!(x > lo && x < hi)) continue;
      for (const v of vs) {
                const vlo = Math.min(v.y1, v.y2), vhi = Math.max(v.y1, v.y2);
        if (y > vlo && y < vhi && !vertexPts.has(pk(x, y)) && !termPts.has(pk(x, y)) && !seenX.has(pk(x, y))) { seenX.add(pk(x, y)); crossings.push([x, y]); }
      }
    }
  }
  crossings.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  // junction dots
  const dotPts = new Map<string, [number, number]>();
  const interesting: [number, number][] = [];
  spec.wires.forEach((w) => w.pts.forEach(([x, y]) => interesting.push([x, y])));
  terminals.forEach((t) => interesting.push([t.x, t.y]));
  const forced = spec.parts.filter((p) => p.type === 'junction').map((p) => pk(p.at[0], p.at[1]));
  for (const [x, y] of interesting) {
    const k = pk(x, y);
    if (dotPts.has(k)) continue;
    const arms = new Set<string>();
    for (const s of segsAt(x, y)) {
      if (s.y1 === s.y2) { if (Math.min(s.x1, s.x2) < x) arms.add('L'); if (Math.max(s.x1, s.x2) > x) arms.add('R'); }
      else { if (Math.min(s.y1, s.y2) < y) arms.add('U'); if (Math.max(s.y1, s.y2) > y) arms.add('D'); }
    }
    if (arms.size + (termAt.get(k)?.length ?? 0) >= 3) dotPts.set(k, [x, y]);
  }
  for (const p of spec.parts) if (p.type === 'junction') dotPts.set(pk(p.at[0], p.at[1]), [p.at[0], p.at[1]]);
  void forced;
  const dots = Array.from(dotPts.values()).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  // dangling wire ends and near-misses
  const danglingEnds: Analysis['danglingEnds'] = [];
  const nearMisses: Analysis['nearMisses'] = [];
  spec.wires.forEach((w, wi) => {
    for (const [x, y] of [w.pts[0], w.pts[w.pts.length - 1]]) {
      if (termAt.has(pk(x, y))) continue;
      const others = segsAt(x, y).filter((s) => s.wire !== wi);
      let arms = 0;
      for (const s of segs) if (s.wire === wi && onSeg(s, x, y) && !(s.x1 === s.x2 && s.y1 === s.y2)) arms++;
      if (others.length > 0 || arms > 1) continue;
      if (danglingEnds.some((d) => d.wire === wi && d.x === x && d.y === y)) continue;
      danglingEnds.push({ wire: wi, x, y });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const t = termAt.get(pk(nx, ny));
        if (t) nearMisses.push({ x, y, what: `terminal ${terminals[t[0]].key} at (${nx},${ny})` });
        else if (segsAt(nx, ny).some((s) => s.wire !== wi)) nearMisses.push({ x, y, what: `another wire at (${nx},${ny})` });
      }
    }
  });

  const termComp = terminals.map((_, i) => uf.f(i));
  const wireComp = spec.wires.map((_, i) => uf.f(T + i));

  // physical comp stats
  const compTerms = new Map<number, number[]>();
  termComp.forEach((c, i) => (compTerms.get(c) ?? compTerms.set(c, []).get(c)!).push(i));
  const compHasWire = new Set(wireComp);

  const labelComp = spec.labels.map((l) => {
    const t = termAt.get(pk(l.at[0], l.at[1]));
    if (t) return termComp[t[0]];
    const s = segsAt(l.at[0], l.at[1])[0];
    return s ? wireComp[s.wire] : -1;
  });

  // ---- nets: merge physical comps by ground / rail value / names ----
  const cuf = new UF(T + W + 1);
  const keyed = new Map<string, number>();
  const bind = (key: string, comp: number): void => { const prev = keyed.get(key); if (prev === undefined) keyed.set(key, comp); else cuf.u(prev, comp); };
  const nameOf = new Map<number, string>();
  const railName = new Map<number, string>();
  let groundComp = -1;
  placed.forEach((p) => {
    const t0 = p.terminals[0];
    if (!t0) return;
    const c = termComp[terminals.indexOf(t0)];
    if (p.part.type === 'ground') { if (groundComp < 0) groundComp = c; else cuf.u(groundComp, c); }
    else if (p.part.type === 'rail') { bind(`rail:${p.display}`, c); railName.set(c, p.display); }
    else if (p.part.type === 'port') { bind(`name:${p.display}`, c); nameOf.set(c, p.display); }
  });
  spec.labels.forEach((l, i) => { const c = labelComp[i]; if (c >= 0) { bind(`name:${l.text}`, c); if (!nameOf.has(c)) nameOf.set(c, l.text); } });

  const unused = (i: number): boolean => {
    const c = termComp[i];
    return terminals[i].optional && (compTerms.get(c)?.length ?? 0) === 1 && !compHasWire.has(c);
  };
  const netIdByRoot = new Map<number, string>();
  const nets: NetInfo[] = [];
  const groundRoot = groundComp >= 0 ? cuf.f(groundComp) : -1;
  if (groundRoot >= 0) { netIdByRoot.set(groundRoot, 'N0'); nets.push({ id: 'N0', name: 'N0', terminals: [], labelled: false }); }
  const termNet: string[] = [];
  let n = 1;
  terminals.forEach((t, i) => {
    if (unused(i)) { termNet.push(''); return; }
    const root = cuf.f(termComp[i]);
    let id = netIdByRoot.get(root);
    if (!id) {
      id = `N${n++}`;
      netIdByRoot.set(root, id);
      nets.push({ id, name: id, terminals: [], labelled: false });
    }
    termNet.push(id);
    nets.find((x) => x.id === id)!.terminals.push(t.key);
  });
  // names: port/label > rail value
  const byId = new Map(nets.map((x) => [x.id, x]));
  const compsOfNet = new Map<string, number[]>();
  for (let c = 0; c < T + W; c++) {
    if (uf.f(c) !== c) continue;
    const id = netIdByRoot.get(cuf.f(c));
    if (id) (compsOfNet.get(id) ?? compsOfNet.set(id, []).get(id)!).push(c);
  }
  for (const [id, comps] of Array.from(compsOfNet)) {
    const net = byId.get(id)!;
    if (id === 'N0') continue;
    let nm: string | undefined;
    for (const c of comps) if (nameOf.has(c)) { nm = nameOf.get(c); net.labelled = true; break; }
    if (!nm) for (const c of comps) if (railName.has(c)) { nm = railName.get(c); break; }
    if (nm) net.name = nm;
  }
  const netName = (id: string): string => (id ? byId.get(id)?.name ?? id : '-');

  const netOfTerminal: Record<string, string> = Object.create(null);
  terminals.forEach((t, i) => { if (termNet[i]) netOfTerminal[t.key] = termNet[i]; });
  const SKIP = new Set(['ground', 'rail', 'port', 'junction']);
  const parts: NetlistPart[] = placed
    .filter((p) => !SKIP.has(p.part.type))
    .map((p) => {
      const nodes: Record<string, string> = Object.create(null);
      for (const t of p.terminals) nodes[t.name] = netName(termNet[terminals.indexOf(t)]);
      return { designator: p.part.id, type: p.part.type, value: p.display, nodes };
    });
  const netlist: Netlist = { nets, parts, groundNet: groundRoot >= 0 ? 'N0' : null, netOfTerminal };

  return { spec, placed, terminals, segs, termComp, wireComp, dots, crossings, danglingEnds, nearMisses, overTerminal, labelComp, netlist, termNet, warnings: [] };
}

export function deriveNetlist(spec: SchematicSpec): Netlist {
  return analyze(spec).netlist;
}

export function netlistToMarkdown(nl: Netlist): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = nl.parts.map((p) => `| ${esc(p.designator)} | ${esc(p.type)} | ${esc(p.value || '-')} | ${Object.entries(p.nodes).map(([k, v]) => `${esc(k)}=${esc(v)}`).join(', ')} |`);
  return ['| Designator | Type | Value | Nodes |', '| --- | --- | --- | --- |', ...rows].join('\n');
}
