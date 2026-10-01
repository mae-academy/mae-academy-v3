/**
 * Industrial stress audit — circuit intermediate representation.
 *
 * One netlist (`Elem[]`) is expanded into whichever native input a solver under test consumes
 * (MNAElement[], TabDPrimitive[], or a component/wire graph for TabDSimulationEngine). The audit
 * never edits engine code; it only builds inputs and inspects outputs.
 *
 * Sign conventions (identical to mnaSolver.ts / analogDocumentedMna.ts):
 *  - branch current `i` is positive from terminal `a` through the element to terminal `b`;
 *  - `V`: V(a) - V(b) = v;   `I`: the source pulls `v` amps out of node `a` and pushes it into node `b`;
 *  - `E`: V(a) - V(b) = gain * (V(cp) - V(cn));   `G`: i(a->b) = gain * (V(cp) - V(cn)).
 */
import type { TabDNonlinearDevice } from '@/simulators/circuit-engine/engine/analogNewtonMna';
import type { TabDPrimitive } from '@/simulators/circuit-engine/engine/analogDocumentedMna';

export type Elem =
  | { t: 'R'; id: string; a: string; b: string; v: number }
  | { t: 'C'; id: string; a: string; b: string; v: number; v0?: number }
  | { t: 'L'; id: string; a: string; b: string; v: number; rs?: number; i0?: number }
  | { t: 'V'; id: string; a: string; b: string; v: number }
  | { t: 'S'; id: string; a: string; b: string; amp: number; f: number; off?: number; phase?: number }
  | { t: 'I'; id: string; a: string; b: string; v: number }
  | { t: 'E'; id: string; a: string; b: string; cp: string; cn: string; gain: number }
  | { t: 'G'; id: string; a: string; b: string; cp: string; cn: string; gain: number }
  | { t: 'OA'; id: string; np: string; nn: string; no: string; gain: number; rout?: number; /** Declared ± supply (engine `vcc` property); omitted = component default (±15 V). */ vcc?: number }
  | { t: 'D'; id: string; a: string; b: string; material?: 'silicon' | 'germanium' | 'gaas' | 'ideal' }
  | { t: 'Q'; id: string; ty: 'npn' | 'pnp'; nb: string; nc: string; ne: string; beta: number }
  | { t: 'M'; id: string; ty: 'n' | 'p'; ng: string; nd: string; ns: string; rds?: number; vth?: number }
  | { t: 'SW'; id: string; a: string; b: string; closed: boolean }
  /** Ground symbol attached to net `a`: every net carrying a GND symbol is one and the same reference node. */
  | { t: 'GND'; id: string; a: string }
  /** Digital gate macromodel (engine `gate-*` component: level-tracking ideal source referenced to ground). */
  | { t: 'GATE'; id: string; kind: 'nor' | 'nand' | 'and' | 'or' | 'not' | 'xor'; a: string; b?: string; out: string; high: number }
  /** Ideal transformer macromodel (VCVS secondary + CCCS primary), identical to the engine's `transformer` compile. */
  | { t: 'XF'; id: string; p1: string; p2: string; s1: string; s2: string; ratio: number };

/** Canonical primitive list that every gate (KCL/KVL/Tellegen) is evaluated on. */
export type NlPrim = { kind: 'nl'; id: string; positive: string; negative: string; controls: string[]; current: (nodeVoltages: Record<string, number>) => number };
export type Prim = TabDPrimitive | NlPrim;

export const OA_ROUT = 50;
export const OA_RIN = 1e12;

/** Deterministic PRNG so every audit run builds byte-identical circuits. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Netlist builder with auto-generated unique ids. */
export class NB {
  readonly els: Elem[] = [];
  private counter = 0;
  private uid(prefix: string, id?: string) { return id ?? `${prefix}${++this.counter}`; }
  R(a: string, b: string, v: number, id?: string) { this.els.push({ t: 'R', id: this.uid('R', id), a, b, v }); return this; }
  C(a: string, b: string, v: number, v0?: number, id?: string) { this.els.push({ t: 'C', id: this.uid('C', id), a, b, v, v0 }); return this; }
  L(a: string, b: string, v: number, opts: { rs?: number; i0?: number; id?: string } = {}) { this.els.push({ t: 'L', id: this.uid('L', opts.id), a, b, v, rs: opts.rs, i0: opts.i0 }); return this; }
  V(a: string, b: string, v: number, id?: string) { this.els.push({ t: 'V', id: this.uid('V', id), a, b, v }); return this; }
  S(a: string, b: string, amp: number, f: number, opts: { off?: number; phase?: number; id?: string } = {}) { this.els.push({ t: 'S', id: this.uid('S', opts.id), a, b, amp, f, off: opts.off, phase: opts.phase }); return this; }
  I(a: string, b: string, v: number, id?: string) { this.els.push({ t: 'I', id: this.uid('I', id), a, b, v }); return this; }
  E(a: string, b: string, cp: string, cn: string, gain: number, id?: string) { this.els.push({ t: 'E', id: this.uid('E', id), a, b, cp, cn, gain }); return this; }
  G(a: string, b: string, cp: string, cn: string, gain: number, id?: string) { this.els.push({ t: 'G', id: this.uid('G', id), a, b, cp, cn, gain }); return this; }
  OA(np: string, nn: string, no: string, gain = 1e6, id?: string, vcc?: number) { this.els.push({ t: 'OA', id: this.uid('U', id), np, nn, no, gain, ...(vcc !== undefined ? { vcc } : {}) }); return this; }
  D(a: string, b: string, material: 'silicon' | 'germanium' | 'gaas' | 'ideal' = 'silicon', id?: string) { this.els.push({ t: 'D', id: this.uid('D', id), a, b, material }); return this; }
  Q(ty: 'npn' | 'pnp', nb: string, nc: string, ne: string, beta = 100, id?: string) { this.els.push({ t: 'Q', id: this.uid('Q', id), ty, nb, nc, ne, beta }); return this; }
  M(ty: 'n' | 'p', ng: string, nd: string, ns: string, opts: { rds?: number; vth?: number; id?: string } = {}) { this.els.push({ t: 'M', id: this.uid('M', opts.id), ty, ng, nd, ns, rds: opts.rds, vth: opts.vth }); return this; }
  SW(a: string, b: string, closed: boolean, id?: string) { this.els.push({ t: 'SW', id: this.uid('SW', id), a, b, closed }); return this; }
  XF(p1: string, p2: string, s1: string, s2: string, ratio: number, id?: string) { this.els.push({ t: 'XF', id: this.uid('T', id), p1, p2, s1, s2, ratio }); return this; }
  GATE(kind: 'nor' | 'nand' | 'and' | 'or' | 'not' | 'xor', a: string, b: string | undefined, out: string, high = 5, id?: string) { this.els.push({ t: 'GATE', id: this.uid('G', id), kind, a, b, out, high }); return this; }
  GND(a: string, id?: string) { this.els.push({ t: 'GND', id: this.uid('GND', id), a }); return this; }
  push(...more: Elem[]) { this.els.push(...more); return this; }
}

export const isNonlinearElem = (e: Elem) => e.t === 'D' || e.t === 'Q' || e.t === 'M';
export const hasReactive = (els: Elem[]) => els.some(e => e.t === 'C' || e.t === 'L');

/** Node set of a netlist (ground `0` included when referenced). */
export function netlistNodes(els: Elem[]): string[] {
  const nodes = new Set<string>();
  for (const e of els) {
    switch (e.t) {
      case 'OA': nodes.add(e.np); nodes.add(e.nn); nodes.add(e.no); break;
      case 'Q': nodes.add(e.nb); nodes.add(e.nc); nodes.add(e.ne); break;
      case 'M': nodes.add(e.ng); nodes.add(e.nd); nodes.add(e.ns); break;
      case 'E': case 'G': nodes.add(e.a); nodes.add(e.b); nodes.add(e.cp); nodes.add(e.cn); break;
      case 'GND': nodes.add(e.a); break;
      case 'GATE': nodes.add(e.a); if (e.b) nodes.add(e.b); nodes.add(e.out); nodes.add('0'); break;
      case 'XF': nodes.add(e.p1); nodes.add(e.p2); nodes.add(e.s1); nodes.add(e.s2); break;
      default: nodes.add(e.a); nodes.add(e.b);
    }
  }
  return Array.from(nodes);
}

export type ExpandMode = 'dc' | 'tran';

/**
 * Expands the netlist to canonical primitives for linear analyses.
 *  - `dc`: capacitors open, inductors shorted (0 V branch, or their series resistance),
 *          closed switch = 0 V branch, open switch = absent;
 *  - `tran`: reactive elements kept; switches become `resistive-switch`; sources sample `t`.
 * Op-amps expand to the same macromodel TabDSimulationEngine compiles (finite-gain VCVS, 50 Ω output,
 * 1 TΩ inputs to the negative rail which is ground when unwired).
 */
/** Merges every net carrying a ground symbol into the reference node `0`. */
export function mergeGroundSymbols(els: Elem[]): Elem[] {
  const grounded = new Set(els.flatMap(e => e.t === 'GND' ? [e.a] : []));
  if (!grounded.size) return els;
  const g = (n: string) => grounded.has(n) ? '0' : n;
  return els.filter(e => e.t !== 'GND').map((e): Elem => {
    switch (e.t) {
      case 'OA': return { ...e, np: g(e.np), nn: g(e.nn), no: g(e.no) };
      case 'Q': return { ...e, nb: g(e.nb), nc: g(e.nc), ne: g(e.ne) };
      case 'M': return { ...e, ng: g(e.ng), nd: g(e.nd), ns: g(e.ns) };
      case 'E': case 'G': return { ...e, a: g(e.a), b: g(e.b), cp: g(e.cp), cn: g(e.cn) };
      case 'GATE': return { ...e, a: g(e.a), b: e.b ? g(e.b) : undefined, out: g(e.out) };
      case 'XF': return { ...e, p1: g(e.p1), p2: g(e.p2), s1: g(e.s1), s2: g(e.s2) };
      default: return { ...e, a: g(e.a), b: g((e as { b: string }).b) } as Elem;
    }
  });
}

export function expandLinear(rawEls: Elem[], mode: ExpandMode, t = 0): Prim[] {
  const els = mergeGroundSymbols(rawEls);
  const out: Prim[] = [];
  for (const e of els) {
    switch (e.t) {
      case 'R': out.push({ kind: 'resistor', id: e.id, positive: e.a, negative: e.b, resistance: e.v }); break;
      case 'C': if (mode === 'tran') out.push({ kind: 'capacitor', id: e.id, positive: e.a, negative: e.b, capacitance: e.v }); break;
      case 'L':
        if (mode === 'tran') out.push({ kind: 'inductor', id: e.id, positive: e.a, negative: e.b, inductance: e.v, seriesResistance: e.rs ?? 0 });
        else if ((e.rs ?? 0) > 0) out.push({ kind: 'resistor', id: e.id, positive: e.a, negative: e.b, resistance: e.rs! });
        else out.push({ kind: 'voltage', id: e.id, positive: e.a, negative: e.b, voltage: 0 });
        break;
      case 'V': out.push({ kind: 'voltage', id: e.id, positive: e.a, negative: e.b, voltage: e.v }); break;
      case 'S': out.push({ kind: 'voltage', id: e.id, positive: e.a, negative: e.b, voltage: (e.off ?? 0) + e.amp * Math.sin(2 * Math.PI * e.f * t + (e.phase ?? 0)) }); break;
      case 'I': out.push({ kind: 'current', id: e.id, positive: e.a, negative: e.b, current: e.v }); break;
      case 'E': out.push({ kind: 'vcvs', id: e.id, positive: e.a, negative: e.b, controlPositive: e.cp, controlNegative: e.cn, gain: e.gain }); break;
      case 'G': out.push({ kind: 'vccs', id: e.id, positive: e.a, negative: e.b, controlPositive: e.cp, controlNegative: e.cn, gain: e.gain }); break;
      case 'OA': {
        const internal = `@${e.id}:out`;
        out.push({ kind: 'vcvs', id: `${e.id}:gain`, positive: internal, negative: '0', controlPositive: e.np, controlNegative: e.nn, gain: e.gain });
        out.push({ kind: 'resistor', id: `${e.id}:out`, positive: internal, negative: e.no, resistance: e.rout ?? OA_ROUT });
        out.push({ kind: 'resistor', id: `${e.id}:in+`, positive: e.np, negative: '0', resistance: OA_RIN });
        out.push({ kind: 'resistor', id: `${e.id}:in-`, positive: e.nn, negative: '0', resistance: OA_RIN });
        break;
      }
      case 'SW':
        if (mode === 'tran') out.push({ kind: 'resistive-switch', id: e.id, positive: e.a, negative: e.b, closed: e.closed });
        else if (e.closed) out.push({ kind: 'voltage', id: e.id, positive: e.a, negative: e.b, voltage: 0 });
        break;
      case 'GND': break;
      case 'XF':
        out.push({ kind: 'vcvs', id: `${e.id}:secondary`, positive: e.s1, negative: e.s2, controlPositive: e.p1, controlNegative: e.p2, gain: 1 / e.ratio });
        out.push({ kind: 'cccs', id: e.id, positive: e.p1, negative: e.p2, controlBranchId: `${e.id}:secondary`, gain: -1 / e.ratio });
        break;
      default: throw new Error(`expandLinear: nonlinear element ${(e as Elem).t} requires the engine backend`);
    }
  }
  return out;
}
