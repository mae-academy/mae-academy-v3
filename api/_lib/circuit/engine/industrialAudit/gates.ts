/**
 * The "Professor's Criteria": KCL at every node, KVL around every fundamental cycle, Tellegen power balance,
 * and numerical sanity — evaluated on the canonical primitive list against the solver's *reported* result.
 */
import type { Prim } from './ir';
import { RESISTIVE_SWITCH_OFF, RESISTIVE_SWITCH_ON } from '../analogDocumentedMna';

/** Element law of a `resistive-switch` as the engine under test stamps it (single source of truth). */
const switchResistance = (closed: boolean) => (closed ? RESISTIVE_SWITCH_ON : RESISTIVE_SWITCH_OFF);

export interface GateOptions {
  kclTol?: number;
  kvlTol?: number;
  powerRel?: number;
  powerFloor?: number;
  /** `abs` mirrors the legacy clamp max(ε, |R|); TabDDocumentedMna now rejects non-positive R, so this only matters for raw-engine primitives. */
  resistorMode?: 'raw' | 'abs';
}

export interface GateReport {
  kcl: { max: number; node: string; pass: boolean };
  kvl: { max: number; loop: string; cycles: number; pass: boolean };
  tellegen: { delivered: number; absorbed: number; discrepancy: number; relative: number; pass: boolean };
  sanity: { pass: boolean; issues: string[] };
  pass: boolean;
}

const SOURCE_KINDS = new Set(['voltage', 'current', 'vcvs', 'vccs', 'cccs', 'ccvs']);

export function evaluateGates(prims: Prim[], nodeV: Record<string, number>, reported: Record<string, number>, options: GateOptions = {}): GateReport {
  const kclTol = options.kclTol ?? 1e-4;
  const kvlTol = options.kvlTol ?? 1e-3;
  const powerRel = options.powerRel ?? 1e-3;
  // 1 nW absolute floor: below this the 0.1 % relative gate is dominated by double-precision noise in VCVS branch currents (A·1e-16 ≳ 1e-10 A).
  const powerFloor = options.powerFloor ?? 1e-9;
  const issues: string[] = [];

  const nodeNames = new Set<string>();
  for (const p of prims) {
    nodeNames.add(p.positive); nodeNames.add(p.negative);
    if ('controlPositive' in p && p.controlPositive) nodeNames.add(p.controlPositive);
    if ('controlNegative' in p && p.controlNegative) nodeNames.add(p.controlNegative);
    if (p.kind === 'nl') p.controls.forEach(c => nodeNames.add(c));
  }
  const vAll: Record<string, number> = { ...nodeV, '0': 0 };
  for (const n of Array.from(nodeNames)) {
    if (n === '0') continue;
    const v = vAll[n];
    if (v === undefined || v === null) issues.push(`node ${n}: voltage missing from solution`);
    else if (!Number.isFinite(v)) issues.push(`node ${n}: non-finite voltage (${v})`);
  }
  for (const [k, v] of Object.entries(vAll)) if (k !== '0' && !Number.isFinite(v) && !issues.some(i => i.startsWith(`node ${k}:`))) issues.push(`node ${k}: non-finite voltage (${v})`);
  const V = (n?: string) => (n === undefined || n === '0') ? 0 : (vAll[n] ?? NaN);

  const resistance = (r: number) => options.resistorMode === 'abs' ? Math.max(1e-15, Math.abs(r)) : r;
  const branchCurrent = (p: Prim): number => {
    const got = reported[p.id];
    switch (p.kind) {
      case 'current': return p.current;
      case 'nl': return p.current(vAll);
      case 'resistor': return got ?? (V(p.positive) - V(p.negative)) / resistance(p.resistance);
      case 'resistive-switch': return got ?? (V(p.positive) - V(p.negative)) / switchResistance(p.closed);
      case 'vccs': return got ?? (p.gain ?? p.transconductance ?? 0) * (V(p.controlPositive) - V(p.controlNegative));
      default:
        if (got === undefined || got === null) { issues.push(`${p.kind} ${p.id}: branch current not reported by solver`); return NaN; }
        return got;
    }
  };
  const constitutiveV = (p: Prim, i: number): number | null => {
    switch (p.kind) {
      case 'resistor': return resistance(p.resistance) * i;
      case 'resistive-switch': return switchResistance(p.closed) * i;
      case 'voltage': return p.voltage;
      case 'vcvs': return p.gain * (V(p.controlPositive) - V(p.controlNegative));
      default: return null;
    }
  };

  // Second view of each current: re-derived from the *node voltages* via the element law (R, switch, VCCS), so a solver that
  // reports self-consistent currents but wrong node potentials cannot pass.
  const derivedCurrent = (p: Prim, reportedI: number): number => {
    switch (p.kind) {
      case 'resistor': return (V(p.positive) - V(p.negative)) / resistance(p.resistance);
      case 'resistive-switch': return (V(p.positive) - V(p.negative)) / switchResistance(p.closed);
      case 'vccs': return (p.gain ?? p.transconductance ?? 0) * (V(p.controlPositive) - V(p.controlNegative));
      default: return reportedI;
    }
  };
  const currents = prims.map(p => branchCurrent(p));
  const currentsDerived = prims.map((p, k) => derivedCurrent(p, currents[k]));
  currents.forEach((i, k) => { if (!Number.isFinite(i)) issues.push(`${prims[k].kind} ${prims[k].id}: non-finite branch current (${i})`); });
  const vBranch = prims.map((p, k) => constitutiveV(p, currents[k]) ?? (V(p.positive) - V(p.negative)));

  // KCL at every node (ground included — it validates every source-branch current variable).
  const residual = new Map<string, number>();
  nodeNames.forEach(n => residual.set(n, 0));
  prims.forEach((p, k) => {
    residual.set(p.positive, (residual.get(p.positive) ?? 0) + currents[k]);
    residual.set(p.negative, (residual.get(p.negative) ?? 0) - currents[k]);
  });
  let kclMax = 0; let kclNode = '';
  residual.forEach((r, n) => { const a = Number.isFinite(r) ? Math.abs(r) : Infinity; if (a > kclMax || (!Number.isFinite(r) && kclNode === '')) { kclMax = a; kclNode = n; } });
  const residualDerived = new Map<string, number>();
  nodeNames.forEach(n => residualDerived.set(n, 0));
  prims.forEach((p, k) => {
    residualDerived.set(p.positive, (residualDerived.get(p.positive) ?? 0) + currentsDerived[k]);
    residualDerived.set(p.negative, (residualDerived.get(p.negative) ?? 0) - currentsDerived[k]);
  });
  residualDerived.forEach((r, n) => { const a = Number.isFinite(r) ? Math.abs(r) : Infinity; if (a > kclMax) { kclMax = a; kclNode = `${n} (currents re-derived from node voltages)`; } });

  // KVL around every fundamental cycle of the spanning forest.
  const adj = new Map<string, Array<{ edge: number; to: string }>>();
  prims.forEach((p, k) => {
    (adj.get(p.positive) ?? adj.set(p.positive, []).get(p.positive)!).push({ edge: k, to: p.negative });
    (adj.get(p.negative) ?? adj.set(p.negative, []).get(p.negative)!).push({ edge: k, to: p.positive });
  });
  const parentEdge = new Map<string, number>(); const parentNode = new Map<string, string>(); const depth = new Map<string, number>(); const root = new Map<string, string>();
  const treeEdges = new Set<number>();
  for (const start of Array.from(adj.keys())) {
    if (depth.has(start)) continue;
    depth.set(start, 0); root.set(start, start);
    const queue = [start];
    while (queue.length) {
      const u = queue.shift()!;
      for (const { edge, to } of adj.get(u) ?? []) {
        if (depth.has(to)) continue;
        depth.set(to, depth.get(u)! + 1); root.set(to, start); parentEdge.set(to, edge); parentNode.set(to, u); treeEdges.add(edge);
        queue.push(to);
      }
    }
  }
  // drop across edge when walking from `from` to `to`
  const drop = (edge: number, from: string) => (prims[edge].positive === from ? vBranch[edge] : -vBranch[edge]);
  let kvlMax = 0; let kvlLoop = ''; let cycles = 0;
  prims.forEach((p, k) => {
    if (treeEdges.has(k)) return;
    cycles += 1;
    let sum = drop(k, p.positive); // walk chord positive -> negative
    let u = p.negative; let w = p.positive; // tree path negative -> positive
    const up: Array<{ edge: number; from: string }> = []; const down: Array<{ edge: number; from: string }> = [];
    while (u !== w) {
      if ((depth.get(u) ?? 0) >= (depth.get(w) ?? 0)) { const e = parentEdge.get(u)!; up.push({ edge: e, from: u }); u = parentNode.get(u)!; }
      else { const e = parentEdge.get(w)!; down.push({ edge: e, from: parentNode.get(w)! }); w = parentNode.get(w)!; }
    }
    for (const s of up) sum += drop(s.edge, s.from);
    for (const s of down.reverse()) sum += drop(s.edge, s.from);
    const a = Number.isFinite(sum) ? Math.abs(sum) : Infinity;
    if (a > kvlMax || (!Number.isFinite(sum) && kvlLoop === '')) { kvlMax = a; kvlLoop = `${p.id} (${p.positive}→${p.negative})`; }
  });

  // Tellegen / power conservation.
  let delivered = 0; let absorbed = 0;
  prims.forEach((p, k) => {
    const pAbs = vBranch[k] * currents[k];
    if (SOURCE_KINDS.has(p.kind)) delivered -= pAbs; else absorbed += pAbs;
  });
  const discrepancy = Math.abs(delivered - absorbed);
  const scale = Math.max(Math.abs(delivered), Math.abs(absorbed));
  const relative = scale > 0 ? discrepancy / scale : 0;
  const powerPass = Number.isFinite(discrepancy) && discrepancy <= powerRel * scale + powerFloor;

  // KVL also requires every branch's constitutive voltage to equal the potential difference its terminals actually carry.
  prims.forEach((p, k) => {
    const c = constitutiveV(p, currents[k]);
    if (c === null) return;
    const dev = Math.abs(c - (V(p.positive) - V(p.negative)));
    const a = Number.isFinite(dev) ? dev : Infinity;
    if (a > kvlMax) { kvlMax = a; kvlLoop = `branch law of ${p.id} (${p.positive}→${p.negative}): element voltage ≠ node-potential difference`; }
  });
  const kclPass = kclMax <= kclTol && Number.isFinite(kclMax);
  const kvlPass = kvlMax <= kvlTol && Number.isFinite(kvlMax);
  const sanityPass = issues.length === 0;
  return {
    kcl: { max: kclMax, node: kclNode, pass: kclPass },
    kvl: { max: kvlMax, loop: kvlLoop, cycles, pass: kvlPass },
    tellegen: { delivered, absorbed, discrepancy, relative, pass: powerPass },
    sanity: { pass: sanityPass, issues },
    pass: kclPass && kvlPass && powerPass && sanityPass,
  };
}

/** Numerical sanity on an arbitrary solution vector (used for solvers that expose no primitive list). */
export function vectorSanity(values: Array<number | null | undefined>): string[] {
  const issues: string[] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined) issues.push(`entry ${i} is ${String(v)}`);
    else if (!Number.isFinite(v)) issues.push(`entry ${i} is non-finite (${v})`);
  });
  return issues;
}
