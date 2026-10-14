// The 10 engineering gates + geometry checks. Never throws: bad input becomes errors.

import { boxGap, boxesOverlap, segInBox, type Box, type Seg2 } from './geometry';
import { layoutSchematic } from './layout';
import { analyze, type Analysis, type Netlist } from './netlist';
import { normalizeSchematicSpec, parseSchematicSpec } from './parse';
import { getSymbol } from './symbols';
import type { Issue, SchematicSpec } from './types';
import { parseValue, type Dim } from './values';

export interface ValidationStats {
  parts: number; wires: number; nets: number; junctions: number; crossovers: number; domains: number;
  width: number; height: number;
}
export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  netlist: Netlist;
  stats: ValidationStats;
  spec: SchematicSpec | null;
}

export const SCHEMATIC_GATES_SUMMARY = [
  'G1 Every part has a unique id, the right designator prefix (R,C,L,D,Q,M,S,V,I,U) and a value where required.',
  'G2 Analog circuits contain a ground part connected to a net; ground is node 0.',
  'G3 No shorted ideal voltage source, no conflicting parallel sources, no current source into an open net.',
  'G4 No floating terminals or nets: every terminal reaches another terminal unless the net is labelled/a port.',
  'G5 Semiconductor pins follow the library (A,K / B,C,E / G,D,S); diodes not shorted; polarity sane.',
  'G6 Junction dots only at T/3+ joins; plain wire crossings are not connected; no wire over a terminal.',
  'G7 Wires are orthogonal, integer, no zero-length segments and never pass through a part body.',
  'G8 With domains: each part lies in exactly one domain; wires may not cross a boundary except via an isolator.',
  'G9 Values parse and carry the right unit for the part (R: ohm, C: F, L: H, V: V, I: A).',
  'G10 Values are plausible (R 1 mOhm..100 MOhm, C <= 1 F, L <= 100 H, V <= 1 kV); nothing is silently changed.',
] as const;

const emptyNetlist = (): Netlist => ({ nets: [], parts: [], groundNet: null, netOfTerminal: {} });
const EMPTY_STATS: ValidationStats = { parts: 0, wires: 0, nets: 0, junctions: 0, crossovers: 0, domains: 0, width: 0, height: 0 };

export function validateSchematic(input: unknown): ValidationResult {
  try {
    const norm = typeof input === 'string' ? parseSchematicSpec(input) : normalizeSchematicSpec(input);
    if (!norm.spec) return { ok: false, errors: norm.errors, warnings: norm.warnings, netlist: emptyNetlist(), stats: EMPTY_STATS, spec: null };
    const res = validateSpec(norm.spec);
    res.warnings.unshift(...norm.warnings);
    return res;
  } catch (e) {
    return { ok: false, errors: [{ code: 'INTERNAL', message: `Validator failure: ${e instanceof Error ? e.message : 'unknown'}` }], warnings: [], netlist: emptyNetlist(), stats: EMPTY_STATS, spec: null };
  }
}

const DIM_NAME: Record<Dim, string> = { ohm: 'ohm (Ω)', F: 'farad (F)', H: 'henry (H)', V: 'volt (V)', A: 'ampere (A)', Hz: 'hertz (Hz)' };
const at = (p: [number, number]): string => `(${p[0]},${p[1]})`;

export function validateSpec(spec: SchematicSpec): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const E = (code: string, message: string, where?: string): void => { errors.push({ code, message, where }); };
  const W = (code: string, message: string, where?: string): void => { warnings.push({ code, message, where }); };
  const a: Analysis = analyze(spec);
  const P = spec.pitch;
  const net = (key: string): string => a.netlist.netOfTerminal[key] ?? '';
  const termsOf = (id: string) => a.terminals.filter((t) => t.part === id);

  // ---- G1 ----
  const seen = new Map<string, number>();
  spec.parts.forEach((p) => seen.set(p.id, (seen.get(p.id) ?? 0) + 1));
  for (const [id, n] of Array.from(seen)) if (n > 1) E('G1_DUPLICATE_ID', `G1: id "${id}" is used by ${n} parts; every part needs a unique id.`, id);
  for (const p of spec.parts) {
    const sym = getSymbol(p.type)!;
    if (sym.valueRequired && (p.value === undefined || p.value.trim() === '')) E('G1_NO_VALUE', `G1: ${p.id} (${p.type}) at ${at(p.at)} needs a "value" (e.g. ${sym.unit === 'ohm' ? '"10 kΩ"' : sym.unit === 'F' ? '"100 nF"' : sym.unit === 'V' ? '"12 V"' : '"text"'}).`, p.id);
    if (sym.prefixes.length && !sym.prefixes.some((pre) => p.id.toUpperCase().startsWith(pre))) W('G1_PREFIX', `G1: id "${p.id}" of type ${p.type} should start with ${sym.prefixes.join(' or ')} (standard designator).`, p.id);
  }

  // ---- G2 ----
  const grounds = a.placed.filter((p) => p.part.type === 'ground');
  const analog = a.placed.some((p) => p.sym.analog && !['ground', 'rail', 'port', 'junction'].includes(p.part.type));
  if (analog && grounds.length === 0) E('G2_NO_GROUND', 'G2: the circuit has analog parts but no "ground" part. Add a ground symbol connected to the 0 V node.');
  if (grounds.length > 0 && a.netlist.groundNet !== 'N0') E('G2_GROUND_NODE', 'G2: ground is not node 0.');

  // ---- G3 / G5 / G10 pieces on sources & diodes ----
  const vsrc = a.placed.filter((p) => ['vsource', 'vsource_ac', 'battery'].includes(p.part.type));
  const vinfo = vsrc.map((p) => {
    const [t1, t2] = p.terminals;
    const pv = p.part.value ? parseValue(p.part.value) : null;
    return { p, pos: net(t1.key), neg: net(t2.key), val: pv ? pv.si : null, text: p.display };
  });
  for (const v of vinfo) if (v.pos && v.pos === v.neg) E('G3_SHORTED_SOURCE', `G3: voltage source ${v.p.part.id} has both terminals on net ${v.pos}; it is shorted. Connect its terminals to different nets.`, v.p.part.id);
  for (let i = 0; i < vinfo.length; i++) for (let j = i + 1; j < vinfo.length; j++) {
    const x = vinfo[i], y = vinfo[j];
    if (!x.pos || x.pos === x.neg || y.pos === y.neg) continue;
    const same = x.pos === y.pos && x.neg === y.neg, rev = x.pos === y.neg && x.neg === y.pos;
    if (!same && !rev) continue;
    const eq = x.val !== null && y.val !== null ? x.val === y.val : x.text === y.text;
    if (rev || !eq) E('G3_PARALLEL_SOURCES', `G3: ideal voltage sources ${x.p.part.id} (${x.text}) and ${y.p.part.id} (${y.text}) are in parallel${rev ? ' with opposite polarity' : ' with different values'}; this is a contradiction. Put a resistance in series or remove one.`, x.p.part.id);
    else W('G3_PARALLEL_SAME', `G3: sources ${x.p.part.id} and ${y.p.part.id} are redundant parallel ideal sources.`, x.p.part.id);
  }
  const OTHER_SKIP = new Set(['ground', 'rail', 'port', 'junction']);
  for (const p of a.placed.filter((q) => q.part.type === 'isource')) {
    for (const t of p.terminals) {
      const n = net(t.key);
      if (!n || n === 'N0') continue;
      const others = a.terminals.filter((o) => o.part !== p.part.id && net(o.key) === n && !OTHER_SKIP.has(a.placed.find((q) => q.part.id === o.part)!.part.type));
      if (others.length === 0) E('G3_CURRENT_SOURCE_OPEN', `G3: current source ${p.part.id} drives net ${n} (terminal ${t.name} at ${at([t.x, t.y])}) which has no other component: an ideal current source into an open circuit is invalid.`, p.part.id);
    }
  }

  // ---- G4 ----
  const compTerms = new Map<number, number[]>();
  a.termComp.forEach((c, i) => (compTerms.get(c) ?? compTerms.set(c, []).get(c)!).push(i));
  const labelled = new Set(a.labelComp.filter((c) => c >= 0));
  const wireComps = new Set(a.wireComp);
  for (const [c, idxs] of Array.from(compTerms)) {
    const real = idxs.filter((i) => !(a.terminals[i].optional && idxs.length === 1 && !wireComps.has(c)));
    if (real.length === 0 || idxs.length >= 2) continue;
    const t = a.terminals[idxs[0]];
    const ptype = a.placed.find((q) => q.part.id === t.part)!.part.type;
    if (labelled.has(c) || ptype === 'port') continue;
    const hasWire = wireComps.has(c);
    E('G4_FLOATING', hasWire
      ? `G4: terminal ${t.key} at ${at([t.x, t.y])} connects only to a wire that goes nowhere. Route the wire to another terminal or label the net.`
      : `G4: terminal ${t.key} at ${at([t.x, t.y])} is not connected to any wire or terminal (floating). Draw a wire to it or label it as an open port.`, t.key);
  }
  spec.wires.forEach((w, wi) => {
    if (!compTerms.has(a.wireComp[wi])) W('G4_DANGLING_WIRE', `G4: wires[${wi}] starting at ${at(w.pts[0])} connects no terminal.`, `wires[${wi}]`);
  });
  for (const d of a.danglingEnds) W('G4_DANGLING_END', `G4: wires[${d.wire}] ends at (${d.x},${d.y}) connected to nothing. End wires on a terminal, another wire, or remove the stub.`, `wires[${d.wire}]`);

  // ---- G5 ----
  for (const p of a.placed) {
    const ty = p.part.type;
    if (['diode', 'zener', 'led', 'schottky'].includes(ty) && net(p.terminals[0].key) && net(p.terminals[0].key) === net(p.terminals[1].key)) E('G5_DIODE_SHORTED', `G5: diode ${p.part.id} has anode and cathode on the same net ${net(p.terminals[0].key)} (shorted).`, p.part.id);
    if (ty === 'polarized_capacitor' || ty === 'battery') {
      const [pl, mi] = [net(p.terminals[0].key), net(p.terminals[1].key)];
      if (ty === 'polarized_capacitor' && pl === 'N0' && mi && mi !== 'N0') W('G5_POLARITY', `G5: polarized capacitor ${p.part.id} has its + terminal on ground and - on ${mi}; check polarity (rotate 180 if reversed).`, p.part.id);
    }
  }

  // ---- G6 ----
  for (const o of a.overTerminal) E('G6_WIRE_OVER_TERMINAL', `G6: wires[${o.wire}] passes over terminal ${o.term.key} at ${at([o.term.x, o.term.y])} without a vertex there, so it is NOT connected. Split the wire so it has a point exactly at ${at([o.term.x, o.term.y])}.`, `wires[${o.wire}]`);
  for (const m of a.nearMisses) W('G6_NEAR_MISS', `G6: a wire ends at (${m.x},${m.y}) one grid unit from ${m.what} without touching it; if they should connect, extend the wire.`, `(${m.x},${m.y})`);

  // ---- G7 ----
  spec.wires.forEach((w, wi) => {
    for (let i = 1; i < w.pts.length; i++) {
      const [p, q] = [w.pts[i - 1], w.pts[i]];
      if (p[0] === q[0] && p[1] === q[1]) E('G7_ZERO_LENGTH', `G7: wires[${wi}] has duplicate consecutive point ${at(p)} (zero-length segment). Remove it.`, `wires[${wi}]`);
      else if (p[0] !== q[0] && p[1] !== q[1]) E('G7_DIAGONAL', `G7: wires[${wi}] segment ${at(p)} -> ${at(q)} is diagonal. Consecutive points must share x or y; add an intermediate corner point.`, `wires[${wi}]`);
    }
  });
  const ortho = a.segs.filter((s) => (s.x1 === s.x2) !== (s.y1 === s.y2));
  for (const s of ortho) {
    for (const p of a.placed) {
      if (segInBox(s, p.box)) { E('G7_WIRE_THROUGH_PART', `G7: wires[${s.wire}] segment (${s.x1},${s.y1}) -> (${s.x2},${s.y2}) passes through the body of ${p.part.id}. Route around it.`, `wires[${s.wire}]`); break; }
    }
  }
  overlapCheck(ortho, true, W);
  overlapCheck(ortho, false, W);

  // ---- G8 ----
  if (spec.domains.length > 0) {
    const inDom = (d: SchematicSpec['domains'][number], x: number, y: number): boolean => x >= d.rect[0] && x <= d.rect[0] + d.rect[2] && y >= d.rect[1] && y <= d.rect[1] + d.rect[3];
    const domOf = (x: number, y: number): number => spec.domains.findIndex((d) => inDom(d, x, y));
    for (const p of a.placed) {
      if (p.sym.isolator || p.part.type === 'junction') continue;
      const hits = spec.domains.filter((d) => p.box[0] >= d.rect[0] && p.box[2] <= d.rect[0] + d.rect[2] && p.box[1] >= d.rect[1] && p.box[3] <= d.rect[1] + d.rect[3]);
      if (hits.length === 0) E('G8_OUTSIDE', `G8: ${p.part.id} at ${at(p.part.at)} does not lie fully inside any domain. Move it inside one of: ${spec.domains.map((d) => `"${d.name}" [${d.rect}]`).join(', ')}.`, p.part.id);
      else if (hits.length > 1) E('G8_AMBIGUOUS', `G8: ${p.part.id} lies inside ${hits.length} overlapping domains; domains must be disjoint.`, p.part.id);
    }
    const compNet = new Map<number, string>();
    a.termComp.forEach((c, i) => { if (a.termNet[i]) compNet.set(c, a.termNet[i]); });
    spec.wires.forEach((w, wi) => {
      let cross = false;
      for (let i = 1; i < w.pts.length; i++) if (domOf(w.pts[i - 1][0], w.pts[i - 1][1]) !== domOf(w.pts[i][0], w.pts[i][1])) cross = true;
      if (!cross) return;
      const n = compNet.get(a.wireComp[wi]);
      const msg = `G8: wires[${wi}] crosses a domain boundary. Domains can only be linked through an isolator (optocoupler or transformer), not a direct wire.`;
      if (n === 'N0' || !n) W('G8_CROSSING', `${msg} (net ${n ?? '?'} is ground/unknown; shared ground is flagged as a warning).`, `wires[${wi}]`);
      else E('G8_CROSSING', `${msg} (net ${n})`, `wires[${wi}]`);
    });
  }

  // ---- G9 / G10 ----
  for (const p of a.placed) {
    const sym = p.sym;
    if (!sym.unit || p.part.value === undefined) continue;
    const pv = parseValue(p.part.value);
    if (!pv) { W('G9_UNPARSEABLE', `G9: ${p.part.id} value ${JSON.stringify(p.part.value)} could not be parsed as a number with SI prefix (e.g. "10 kΩ", "47 µF").`, p.part.id); continue; }
    if (pv.dim && pv.dim !== sym.unit) { E('G9_WRONG_UNIT', `G9: ${p.part.id} is a ${p.part.type} but its value ${JSON.stringify(p.part.value)} has the unit of ${DIM_NAME[pv.dim]}; expected ${DIM_NAME[sym.unit]}.`, p.part.id); continue; }
    const v = Math.abs(pv.si);
    const plaus = (cond: boolean, what: string): void => { if (cond) W('G10_RANGE', `G10: ${p.part.id} value ${p.display} looks implausible (${what}). Check the SI prefix; the value was not changed.`, p.part.id); };
    if (sym.unit === 'ohm') plaus(v < 1e-3 || v > 1e8, 'resistors are normally 1 mΩ..100 MΩ');
    if (sym.unit === 'F') plaus(v > 1, 'capacitance above 1 F');
    if (sym.unit === 'H') plaus(v > 100, 'inductance above 100 H');
    if (sym.unit === 'V') plaus(v > 1000, 'voltage above 1 kV');
  }
  // diode reverse across a source
  for (const p of a.placed.filter((q) => ['diode', 'schottky', 'zener', 'led'].includes(q.part.type))) {
    const an = net(p.terminals[0].key), ka = net(p.terminals[1].key);
    for (const v of vinfo) {
      if (v.pos && v.neg && an === v.neg && ka === v.pos && p.part.type !== 'zener') W('G10_DIODE_REVERSE', `G10: diode ${p.part.id} is reverse-biased directly across source ${v.p.part.id} (anode on its - net, cathode on its + net). Swap the diode orientation if it should conduct.`, p.part.id);
      if (v.pos && v.neg && an === v.pos && ka === v.neg) W('G10_DIODE_FORWARD_SHORT', `G10: diode ${p.part.id} is forward-biased directly across source ${v.p.part.id} with no series element (very large current).`, p.part.id);
    }
  }
  void termsOf;

  // ---- geometry ----
  const bx = a.placed.filter((p) => p.box[2] - p.box[0] > 0 && p.box[3] - p.box[1] > 0);
  for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
    const A = bx[i], B = bx[j];
    if (boxesOverlap(A.box as Box, B.box as Box)) E('GEOM_OVERLAP', `Parts ${A.part.id} and ${B.part.id} overlap (boxes [${A.box.join(',')}] and [${B.box.join(',')}]). Move one by at least ${Math.ceil(Math.min(A.box[2], B.box[2]) - Math.max(A.box[0], B.box[0]))} grid units, or connect them with a wire instead of placing them corner to corner.`, A.part.id);
    else {
      const gap = boxGap(A.box as Box, B.box as Box);
      const shared = A.terminals.some((t) => B.terminals.some((u) => u.x === t.x && u.y === t.y));
      if (gap < 1 && !shared) W('GEOM_CLEARANCE', `Parts ${A.part.id} and ${B.part.id} are only ${Math.max(0, gap)} grid units apart; keep at least 1.`, A.part.id);
    }
  }

  const lay = layoutSchematic(spec);
  warnings.push(...lay.warnings);

  const stats: ValidationStats = {
    parts: spec.parts.length, wires: spec.wires.length, nets: a.netlist.nets.length, junctions: a.dots.length, crossovers: a.crossings.length,
    domains: spec.domains.length, width: lay.bounds[2] - lay.bounds[0], height: lay.bounds[3] - lay.bounds[1],
  };
  void P;
  return { ok: errors.length === 0, errors, warnings, netlist: a.netlist, stats, spec };
}

function overlapCheck(segs: Seg2[], horizontal: boolean, W: (c: string, m: string, w?: string) => void): void {
  const lines = new Map<number, Seg2[]>();
  for (const s of segs) {
    if (horizontal ? s.y1 !== s.y2 : s.x1 !== s.x2) continue;
    const k = horizontal ? s.y1 : s.x1;
    (lines.get(k) ?? lines.set(k, []).get(k)!).push(s);
  }
  for (const [k, list] of Array.from(lines)) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const lo = (s: Seg2): number => (horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2));
      const hi = (s: Seg2): number => (horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2));
      if (Math.min(hi(list[i]), hi(list[j])) - Math.max(lo(list[i]), lo(list[j])) > 0) {
        W('G7_OVERLAP', `G7: wires[${list[i].wire}] and wires[${list[j].wire}] overlap along ${horizontal ? 'y' : 'x'}=${k}; merge or separate them.`, `wires[${list[i].wire}]`);
      }
    }
  }
}
