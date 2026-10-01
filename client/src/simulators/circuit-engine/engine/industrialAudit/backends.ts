/**
 * Solver adapters. Each runner feeds one solver under test, captures its structured outcome
 * (solution / diagnostic / crash / non-convergence) and evaluates the gates on what it reported.
 */
import { MNAError, MNASolver, type MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NodalSolver } from '@/simulators/circuit-engine/engine/NodalSolver';
import { MeshSolver, buildMeshSystem, reconstructBranchCurrents, solveMeshCurrents } from '@/simulators/circuit-engine/engine/MeshSolver';
import type { MeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';
import { generateReducedNodalMatrix } from '@/simulators/circuit-engine/engine/reducedNodalMatrix';
import { TabDDocumentedMna, TabDMnaError, type TabDPrimitive } from '@/simulators/circuit-engine/engine/analogDocumentedMna';
import { TabDSimulationEngine } from '@/simulators/circuit-engine/engine/analogSimulation';
import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';
import { evaluateGates, type GateReport } from '@/simulators/circuit-engine/engine/industrialAudit/gates';
import { denseSolve, dcOracle, refineRoot, continuationSolve } from '@/simulators/circuit-engine/engine/industrialAudit/oracle';
import { expandLinear, type Elem, type Prim } from '@/simulators/circuit-engine/engine/industrialAudit/ir';

export type SolverId = 'mna' | 'nodal' | 'mesh' | 'meshG' | 'tabd' | 'engine';
export type RunStatus = 'solved' | 'diagnostic' | 'nonconverged' | 'crash';

export interface OracleCheck { supported: boolean; singular: boolean; maxErr: number; allowed: number; node: string; cond: number; pass: boolean; scale: number }
export interface RefineCheck { supported: boolean; converged: boolean; distance: number; allowed: number; pass: boolean }

export interface RunRecord {
  solver: SolverId;
  status: RunStatus;
  code?: string;
  message?: string;
  nodeV?: Record<string, number>;
  reported?: Record<string, number>;
  gates?: GateReport;
  oracle?: OracleCheck;
  refine?: RefineCheck;
  /** Solver-specific cross-checks (e.g. reduced-matrix vs MNA) and diagnostics. */
  extra: Record<string, number | string | boolean>;
  /** Free-form failure reasons recorded by the runner itself (beyond gates/oracle). */
  faults: string[];
  prims?: Prim[];
  ms: number;
}

const STRUCTURED = /Singular MNA|Newton-Raphson|ground reference|requires an existing|Invalid Circuit|Mesh-current|rank-deficient|residual certificate|singular/i;

function classify(error: unknown): Pick<RunRecord, 'status' | 'code' | 'message'> {
  if (error instanceof MNAError) return { status: 'diagnostic', code: error.code, message: error.message };
  if (error instanceof TabDMnaError) {
    const nonconv = /Newton-Raphson/.test(error.message);
    return { status: nonconv ? 'nonconverged' : 'diagnostic', code: nonconv ? 'NEWTON_NONCONVERGENCE' : /Singular/.test(error.message) ? 'SINGULAR_MATRIX' : /requires an explicit ground/.test(error.message) ? 'NO_REFERENCE' : 'TAB_D_MNA', message: error.message };
  }
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return { status: 'crash', code: 'UNSTRUCTURED_EXCEPTION', message };
}

function fromMessage(message: string): Pick<RunRecord, 'status' | 'code' | 'message'> {
  if (/Newton-Raphson/.test(message)) return { status: 'nonconverged', code: 'NEWTON_NONCONVERGENCE', message };
  if (STRUCTURED.test(message)) {
    const code = /Conflicting Voltage Sources/.test(message) ? 'CONFLICTING_VOLTAGE_SOURCES' : /residual/i.test(message) ? 'RESIDUAL_VIOLATION' : /Singular MNA|singular/i.test(message) ? 'SINGULAR_MATRIX' : /requires an explicit ground|Ground reference/i.test(message) ? 'NO_REFERENCE' : /rank/i.test(message) ? 'RANK_DEFICIENT' : 'DIAGNOSTIC';
    return { status: 'diagnostic', code, message };
  }
  return { status: 'crash', code: 'UNSTRUCTURED_MESSAGE', message };
}

const blank = (solver: SolverId): RunRecord => ({ solver, status: 'solved', extra: {}, faults: [], ms: 0 });

/** MNAElement view of a dc-expanded primitive list (what mnaSolver/NodalSolver/MeshSolver consume). */
export function primsToMna(prims: Prim[]): MNAElement[] {
  return prims.map((p): MNAElement => {
    switch (p.kind) {
      case 'resistor': return { type: 'resistor', id: p.id, positive: p.positive, negative: p.negative, resistance: p.resistance };
      case 'voltage': return { type: 'voltage', id: p.id, positive: p.positive, negative: p.negative, voltage: p.voltage };
      case 'current': return { type: 'current', id: p.id, from: p.positive, to: p.negative, current: p.current };
      case 'vccs': return { type: 'vccs', id: p.id, positive: p.positive, negative: p.negative, controlPositive: p.controlPositive, controlNegative: p.controlNegative, gain: p.gain ?? p.transconductance ?? 0 };
      case 'vcvs': return { type: 'vcvs', id: p.id, positive: p.positive, negative: p.negative, controlPositive: p.controlPositive, controlNegative: p.controlNegative, gain: p.gain };
      case 'cccs': return { type: 'cccs', id: p.id, positive: p.positive, negative: p.negative, targetId: p.controlBranchId ?? p.targetId, gain: p.gain };
      default: throw new Error(`primsToMna: unsupported ${p.kind}`);
    }
  });
}

function oracleCheck(prims: Prim[], nodeV: Record<string, number>): OracleCheck | undefined {
  const ref = dcOracle(prims);
  if (!ref.supported) return undefined;
  if (ref.singular) return { supported: true, singular: true, maxErr: 0, allowed: 0, node: '', cond: Infinity, pass: true, scale: 1 };
  let maxErr = 0; let worst = ''; let scale = 1;
  for (const [n, v] of Object.entries(ref.nodeV)) { if (!n.startsWith('#')) scale = Math.max(scale, Math.abs(v)); }
  for (const [n, v] of Object.entries(ref.nodeV)) {
    if (n.startsWith('#')) continue;
    const got = nodeV[n];
    const err = got === undefined || !Number.isFinite(got) ? Infinity : Math.abs(got - v);
    if (err > maxErr) { maxErr = err; worst = n; }
  }
  const allowed = Math.max(1e-9, 1e-7 * scale, Number.isFinite(ref.cond) ? 50 * ref.cond * 2.220446049250313e-16 * scale : 0);
  return { supported: true, singular: false, maxErr, allowed, node: worst, cond: ref.cond, pass: maxErr <= allowed, scale };
}

/** Worst-case merge of several gate evaluations (e.g. one per DAC code / per switching phase). */
export function mergeGates(list: GateReport[]): GateReport | undefined {
  if (!list.length) return undefined;
  return list.reduce((w, g) => ({
    kcl: g.kcl.max > w.kcl.max ? g.kcl : w.kcl,
    kvl: g.kvl.max > w.kvl.max ? g.kvl : w.kvl,
    tellegen: (!g.tellegen.pass && w.tellegen.pass) || (g.tellegen.pass === w.tellegen.pass && g.tellegen.relative > w.tellegen.relative) ? g.tellegen : w.tellegen,
    sanity: { pass: w.sanity.pass && g.sanity.pass, issues: [...w.sanity.issues, ...g.sanity.issues].slice(0, 8) },
    pass: w.pass && g.pass,
  }));
}

// ─── MNASolver ────────────────────────────────────────────────────────────────────────────────────

export function runMna(els: Elem[]): RunRecord {
  const rec = blank('mna'); const t0 = performance.now();
  let prims: Prim[];
  try { prims = expandLinear(els, 'dc'); } catch (e) { return { ...rec, ...classify(e), ms: performance.now() - t0 }; }
  rec.prims = prims;
  try {
    const result = new MNASolver(primsToMna(prims)).solve();
    rec.nodeV = result.nodeVoltages; rec.reported = result.branchCurrents;
    rec.extra.residualInfinity = result.residualInfinity ?? NaN;
    rec.gates = evaluateGates(prims, result.nodeVoltages, result.branchCurrents);
    rec.oracle = oracleCheck(prims, result.nodeVoltages);
  } catch (e) { Object.assign(rec, classify(e)); }
  rec.ms = performance.now() - t0;
  return rec;
}

// ─── TabDDocumentedMna (static solve) ─────────────────────────────────────────────────────────────

export function runTabdDc(els: Elem[]): RunRecord {
  const rec = blank('tabd'); const t0 = performance.now();
  let prims: Prim[];
  try { prims = expandLinear(els, 'dc'); } catch (e) { return { ...rec, ...classify(e), ms: performance.now() - t0 }; }
  rec.prims = prims;
  try {
    const result = new TabDDocumentedMna().solve(prims as TabDPrimitive[], 1e-3, false);
    rec.nodeV = result.nodeVoltages; rec.reported = result.branchCurrents;
    rec.gates = evaluateGates(prims, result.nodeVoltages, result.branchCurrents, { resistorMode: 'abs' });
    rec.oracle = oracleCheck(prims, result.nodeVoltages);
  } catch (e) { Object.assign(rec, classify(e)); }
  rec.ms = performance.now() - t0;
  return rec;
}

// ─── NodalSolver ──────────────────────────────────────────────────────────────────────────────────

export function runNodal(els: Elem[]): RunRecord {
  const rec = blank('nodal'); const t0 = performance.now();
  let prims: Prim[]; let mna: MNAElement[];
  try { prims = expandLinear(els, 'dc'); mna = primsToMna(prims); } catch (e) { return { ...rec, ...classify(e), ms: performance.now() - t0 }; }
  rec.prims = prims;
  try {
    const trace = new NodalSolver(mna).analyze();
    if (trace.status !== 'ready' || !trace.result) {
      Object.assign(rec, fromMessage(trace.warning ?? 'nodal analysis failed without a message'));
    } else {
      const result = trace.result;
      const reduced = generateReducedNodalMatrix(mna);
      const nodeV: Record<string, number> = { ...result.nodeVoltages };
      // Independent solve of the *reduced* nodal system the academic trace is rendered from.
      let reducedDeviation = 0;
      if (reduced.unknownNodes.length) {
        const sol = denseSolve(reduced.conductance, reduced.rhs, false);
        if (sol.singular) rec.faults.push('reduced nodal conductance matrix is singular although MNA solved');
        else reduced.unknownNodes.forEach((n, i) => { reducedDeviation = Math.max(reducedDeviation, Math.abs(sol.x[i] - (result.nodeVoltages[n] ?? NaN))); nodeV[n] = sol.x[i]; });
      }
      reduced.knownNodes.forEach((v, n) => { reducedDeviation = Math.max(reducedDeviation, Math.abs(v - (result.nodeVoltages[n] ?? NaN))); nodeV[n] = v; });
      // Eliminated nodes take the potentials the reduced system itself implies (back-substitution), not MNA's, so the gates grade the reduced system alone.
      if (reduced.recoverEliminated) {
        const unknownSolution = Object.fromEntries(reduced.unknownNodes.map(n => [n, nodeV[n]]));
        for (const [n, v] of Object.entries(reduced.recoverEliminated(unknownSolution))) if (!reduced.unknownNodes.includes(n)) { reducedDeviation = Math.max(reducedDeviation, Math.abs(v - (result.nodeVoltages[n] ?? NaN))); nodeV[n] = v; }
      }
      rec.extra.reducedVsMna = reducedDeviation;
      const scale = Math.max(1, ...Object.values(result.nodeVoltages).map(Math.abs));
      if (!(reducedDeviation <= 1e-6 * scale)) rec.faults.push(`reduced nodal system disagrees with MNA by ${reducedDeviation.toExponential(3)} V`);
      rec.nodeV = nodeV;
      // Branch-variable currents come from the MNA certificate; resistor/dependent currents are re-derived from the nodal voltages.
      const branchOnly: Record<string, number> = {};
      for (const p of prims) if (['voltage', 'vcvs', 'ccvs', 'cccs', 'inductor'].includes(p.kind) && result.branchCurrents[p.id] !== undefined) branchOnly[p.id] = result.branchCurrents[p.id];
      rec.reported = branchOnly;
      rec.gates = evaluateGates(prims, nodeV, branchOnly);
      rec.oracle = oracleCheck(prims, nodeV);
    }
  } catch (e) { Object.assign(rec, classify(e)); }
  rec.ms = performance.now() - t0;
  return rec;
}

// ─── MeshSolver ───────────────────────────────────────────────────────────────────────────────────

export const meshApplicable = (els: Elem[]) => els.every(e => e.t === 'R' || e.t === 'V' || e.t === 'I' || e.t === 'GND');

/** Straight-line workspace geometry from node coordinates (optionally with a bend point per element for parallel edges). */
export function layoutGeometry(els: Elem[], coords: Record<string, [number, number]>, bends: Record<string, [number, number]> = {}): MeshGeometry {
  const branches: MeshGeometry['branches'] = [];
  for (const e of els) {
    if (e.t !== 'R' && e.t !== 'V' && e.t !== 'I') continue;
    const pa = coords[e.a]; const pb = coords[e.b];
    if (!pa || !pb) throw new Error(`layout missing coordinates for ${e.id}`);
    branches.push({ id: e.id, path: bends[e.id] ? [pa, bends[e.id], pb] : [pa, pb] });
  }
  return { branches, wires: [] };
}

export function runMesh(els: Elem[], geometry?: MeshGeometry): RunRecord {
  const rec = blank(geometry ? 'meshG' : 'mesh'); const t0 = performance.now();
  let prims: Prim[]; let mna: MNAElement[];
  try { prims = expandLinear(els, 'dc'); mna = primsToMna(prims); } catch (e) { return { ...rec, ...classify(e), ms: performance.now() - t0 }; }
  rec.prims = prims;
  try {
    const trace = new MeshSolver(mna, geometry).analyze();
    if (trace.status !== 'ready' || !trace.result) {
      Object.assign(rec, fromMessage(trace.warning ?? 'mesh analysis failed without a message'));
    } else {
      const mnaResult = trace.result;
      const system = buildMeshSystem(mna, geometry);
      const meshCurrents = system.impedance.length ? solveMeshCurrents(system.impedance, system.source) : [];
      const cur = reconstructBranchCurrents(mna, system.cycles, meshCurrents);
      rec.reported = cur;
      rec.extra.meshCount = system.cycles.length;
      rec.extra.expectedMeshCount = system.topology.expectedMeshCount;
      rec.extra.rank = system.rank;
      let dev = 0; let scale = 1e-12;
      for (const [id, i] of Object.entries(cur)) { const ref = mnaResult.branchCurrents[id]; if (ref === undefined) continue; dev = Math.max(dev, Math.abs(i - ref)); scale = Math.max(scale, Math.abs(ref)); }
      rec.extra.meshVsMna = dev;
      if (dev > Math.max(1e-9, 1e-6 * scale)) rec.faults.push(`mesh currents disagree with MNA branch currents by ${dev.toExponential(3)} A`);
      // Node potentials are borrowed from MNA only where mesh analysis has no constitutive voltage (current-source terminals).
      rec.nodeV = mnaResult.nodeVoltages;
      rec.gates = evaluateGates(prims, mnaResult.nodeVoltages, cur);
    }
  } catch (e) { Object.assign(rec, classify(e)); }
  rec.ms = performance.now() - t0;
  return rec;
}

// ─── Transient (TabDDocumentedMna, backward Euler) ───────────────────────────────────────────────

export interface TranSpec {
  /** fixed time step, or 'settle' to march geometrically to DC steady state */
  dt?: number;
  steps?: number;
  settle?: boolean;
  probes?: string[];
  /** gate-check stride: check every `stride` steps plus first and last */
  stride?: number;
}

export interface TranTrace { t: number[]; v: Record<string, number[]>; last: { nodeV: Record<string, number>; cur: Record<string, number>; prims: Prim[] } }

/** Characteristic time-scale bounds used for the geometric settling schedule. */
function timeScales(els: Elem[]) {
  const Rs = els.flatMap(e => e.t === 'R' ? [Math.abs(e.v)] : e.t === 'L' && e.rs ? [e.rs] : []).filter(v => v > 0);
  const Cs = els.flatMap(e => e.t === 'C' ? [e.v] : []);
  const Ls = els.flatMap(e => e.t === 'L' ? [e.v] : []);
  const rMin = Rs.length ? Math.min(...Rs) : 1; const rSum = Rs.reduce((a, b) => a + b, 0) || 1;
  const cMin = Cs.length ? Math.min(...Cs) : 0; const cSum = Cs.reduce((a, b) => a + b, 0);
  const lMin = Ls.length ? Math.min(...Ls) : 0; const lSum = Ls.reduce((a, b) => a + b, 0);
  const tauMin = Math.min(cMin ? rMin * cMin : Infinity, lMin ? lMin / rSum : Infinity);
  const tauMax = Math.max(cSum * rSum, lSum / rMin);
  return { tauMin: Number.isFinite(tauMin) ? tauMin : 1e-3, tauMax: tauMax > 0 ? tauMax : 1e-3 };
}

/** Initial-condition preload through the public API only: an ideal source across each C (or in series with each L) for one step. */
function preloadInitialConditions(mna: TabDDocumentedMna, els: Elem[]) {
  const pre: TabDPrimitive[] = [];
  for (const e of els) {
    if (e.t === 'C' && e.v0 !== undefined) {
      pre.push({ kind: 'voltage', id: `__ic_v_${e.id}`, positive: `__ic_${e.id}`, negative: '0', voltage: e.v0 });
      pre.push({ kind: 'capacitor', id: e.id, positive: `__ic_${e.id}`, negative: '0', capacitance: e.v });
    } else if (e.t === 'L' && e.i0 !== undefined) {
      pre.push({ kind: 'current', id: `__ic_i_${e.id}`, positive: '0', negative: `__ic_${e.id}`, current: e.i0 });
      pre.push({ kind: 'inductor', id: e.id, positive: `__ic_${e.id}`, negative: '0', inductance: e.v, seriesResistance: e.rs ?? 0 });
    }
  }
  if (pre.length) mna.solve(pre, 1e-9, true);
}

export function runTran(els: Elem[], spec: TranSpec): { rec: RunRecord; trace?: TranTrace } {
  const rec = blank('tabd'); const t0 = performance.now();
  const mna = new TabDDocumentedMna();
  const probes = spec.probes ?? [];
  const trace: TranTrace = { t: [], v: Object.fromEntries(probes.map(p => [p, [] as number[]])), last: { nodeV: {}, cur: {}, prims: [] } };
  let worst: GateReport | undefined;
  const consider = (g: GateReport) => {
    if (!worst) { worst = g; return; }
    worst = {
      kcl: g.kcl.max > worst.kcl.max ? g.kcl : worst.kcl,
      kvl: g.kvl.max > worst.kvl.max ? g.kvl : worst.kvl,
      tellegen: g.tellegen.pass === false && worst.tellegen.pass ? g.tellegen : (g.tellegen.relative > worst.tellegen.relative ? g.tellegen : worst.tellegen),
      sanity: { pass: worst.sanity.pass && g.sanity.pass, issues: [...worst.sanity.issues, ...g.sanity.issues].slice(0, 8) },
      pass: worst.pass && g.pass,
    };
  };
  try {
    preloadInitialConditions(mna, els);
    let t = mna.getTime();
    const dts: number[] = [];
    if (spec.settle) {
      const { tauMin, tauMax } = timeScales(els);
      let dt = Math.max(1e-15, tauMin / 20);
      let elapsed = 0;
      while (elapsed < 60 * tauMax && dts.length < 400) { dts.push(dt); elapsed += dt; dt *= 1.3; }
      for (let k = 0; k < 10; k += 1) dts.push(Math.max(dt, 60 * tauMax));
    } else {
      const n = spec.steps ?? 200; const dt = spec.dt ?? 1e-4;
      for (let k = 0; k < n; k += 1) dts.push(dt);
    }
    const stride = spec.stride ?? Math.max(1, Math.floor(dts.length / 40));
    let prims: Prim[] = [];
    let result: ReturnType<TabDDocumentedMna['solve']> | undefined;
    for (let k = 0; k < dts.length; k += 1) {
      const dt = dts[k];
      t += dt;
      prims = expandLinear(els, 'tran', t);
      // TabDDocumentedMna applies max(1e-15,|R|): gates must see the same effective value.
      result = mna.solve(prims as TabDPrimitive[], dt, true);
      for (const p of probes) trace.v[p].push(result.nodeVoltages[p] ?? NaN);
      trace.t.push(t);
      if (k === 0 || k === dts.length - 1 || k % stride === 0) consider(evaluateGates(prims, result.nodeVoltages, result.branchCurrents, { resistorMode: 'abs' }));
    }
    if (result) { rec.nodeV = result.nodeVoltages; rec.reported = result.branchCurrents; trace.last = { nodeV: result.nodeVoltages, cur: result.branchCurrents, prims }; rec.prims = prims; }
    rec.gates = worst;
    rec.extra.steps = dts.length;
  } catch (e) { Object.assign(rec, classify(e)); }
  rec.ms = performance.now() - t0;
  return { rec, trace: rec.status === 'solved' ? trace : undefined };
}

// ─── TabDSimulationEngine (component graph) ──────────────────────────────────────────────────────

const ENGINE_TERMS: Record<string, (e: any) => Array<[string, string]>> = {
  R: e => [['a', e.a], ['b', e.b]],
  C: e => [['a', e.a], ['b', e.b]],
  L: e => [['a', e.a], ['b', e.b]],
  V: e => [['pos', e.a], ['neg', e.b]],
  S: e => [['pos', e.a], ['neg', e.b]],
  I: e => [['neg', e.a], ['pos', e.b]],
  OA: e => [['in+', e.np], ['in-', e.nn], ['out', e.no]],
  D: e => [['anode', e.a], ['cathode', e.b]],
  Q: e => [['base', e.nb], ['collector', e.nc], ['emitter', e.ne]],
  M: e => [['gate', e.ng], ['drain', e.nd], ['source', e.ns]],
  SW: e => [['a', e.a], ['b', e.b]],
  XF: e => [['p1', e.p1], ['p2', e.p2], ['s1', e.s1], ['s2', e.s2]],
  GND: e => [['gnd', e.a]],
  GATE: e => [['a', e.a], ...(e.b ? [['b', e.b] as [string, string]] : []), ['out', e.out], ['gnd', '0']],
};

export function irToEngineGraph(els: Elem[]): { components: CircuitComponent[]; wires: CircuitWire[] } {
  const comp = (id: string, type: string, props: Record<string, unknown>): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
  const components: CircuitComponent[] = [];
  const nets = new Map<string, Array<{ c: string; t: string }>>();
  const attach = (net: string, c: string, t: string) => { (nets.get(net) ?? nets.set(net, []).get(net)!).push({ c, t }); };
  for (const e of els) {
    switch (e.t) {
      case 'R': components.push(comp(e.id, 'resistor', { resistance: e.v })); break;
      case 'C': components.push(comp(e.id, 'capacitor', { capacitance: e.v })); break;
      case 'L': components.push(comp(e.id, 'inductor', { inductance: e.v, dcr: e.rs ?? 0 })); break;
      case 'V': components.push(comp(e.id, 'dc-voltage', { voltage: e.v })); break;
      case 'S': components.push(comp(e.id, 'ac-voltage', { amplitude: e.amp, frequency: e.f, offset: e.off ?? 0, phase: (e.phase ?? 0) * 180 / Math.PI, waveform: 'sine' })); break;
      case 'I': components.push(comp(e.id, 'dc-current', { current: e.v })); break;
      case 'OA': components.push(comp(e.id, 'opamp', { gain: e.gain, model: 'ideal', ...(e.vcc !== undefined ? { vcc: e.vcc } : {}) })); break;
      case 'D': components.push(comp(e.id, 'diode', { material: e.material ?? 'silicon' })); break;
      case 'Q': components.push(comp(e.id, e.ty === 'npn' ? 'bjt-npn' : 'bjt-pnp', { beta: e.beta })); break;
      case 'M': components.push(comp(e.id, e.ty === 'n' ? 'mosfet-n' : 'mosfet-p', { rdsOn: e.rds ?? (e.ty === 'n' ? 0.1 : 0.2), vth: e.vth ?? (e.ty === 'n' ? 2 : -2) })); break;
      case 'SW': components.push(comp(e.id, 'sw-spst-no', { state: e.closed ? 'closed' : 'open' })); break;
      case 'GND': components.push(comp(e.id, 'ground', {})); break;
      case 'XF': components.push(comp(e.id, 'transformer', { turnRatio: e.ratio })); break;
      case 'GATE': components.push(comp(e.id, `gate-${e.kind}`, { highVoltage: e.high, threshold: e.high / 2, delay: 0 })); break;
      default: throw new Error(`engine adapter: unsupported element ${e.t}`);
    }
    for (const [term, net] of ENGINE_TERMS[e.t](e)) attach(net, e.id, term);
  }
  if (nets.has('0')) { components.push(comp('GND0', 'ground', {})); attach('0', 'GND0', 'gnd'); }
  // ground symbols on different nets are one reference: the engine joins all `ground` components itself.
  const wires: CircuitWire[] = [];
  let wid = 0;
  nets.forEach(list => {
    for (let i = 1; i < list.length; i += 1) wires.push({ id: `w${++wid}`, fromComp: list[i - 1].c, fromTerm: list[i - 1].t, toComp: list[i].c, toTerm: list[i].t, routing: 'orthogonal', path: [[0, 0], [20, 0]] });
  });
  return { components, wires };
}

export interface EngineHandle { engine: TabDSimulationEngine; components: CircuitComponent[]; wires: CircuitWire[]; els: Elem[] }

export function makeEngine(els: Elem[]): EngineHandle {
  const { components, wires } = irToEngineGraph(els);
  const engine = new TabDSimulationEngine();
  engine.setCircuit(components, wires);
  return { engine, components, wires, els };
}

/** Gate + Newton-polish evaluation of the engine's current snapshot. */
export function inspectEngine(handle: EngineHandle, snapshot: ReturnType<TabDSimulationEngine['step']>, rec: RunRecord) {
  const compiled = (handle.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { primitives: TabDPrimitive[]; nonlinear: Array<{ id: string; positive: string; negative: string; controls: string[]; current: (n: Record<string, number>) => number }>; netForTerminal: (c: string, t: string) => string } | null }).compileDocumentedPrimitives(0.0005);
  if (!compiled) { rec.faults.push('engine returned no compiled primitives'); return; }
  const prims: Prim[] = [...compiled.primitives, ...compiled.nonlinear.map(d => ({ kind: 'nl' as const, id: d.id, positive: d.positive, negative: d.negative, controls: d.controls, current: d.current }))];
  rec.prims = prims; rec.reported = snapshot.branchCurrents;
  // Publish the engine's internal net names under the netlist's own node names so analytic checks can address them.
  const aliased: Record<string, number> = { ...snapshot.nodeVoltages };
  for (const e of handle.els) {
    const terms = (ENGINE_TERMS[e.t] as ((x: Elem) => Array<[string, string]>) | undefined)?.(e) ?? [];
    for (const [term, net] of terms) {
      if (net === '0' || aliased[net] !== undefined && !(net in snapshot.nodeVoltages)) continue;
      const v = snapshot.nodeVoltages[compiled.netForTerminal(e.id, term)];
      if (v !== undefined && !(net in snapshot.nodeVoltages)) aliased[net] = v;
    }
  }
  rec.nodeV = aliased;
  rec.gates = evaluateGates(prims, snapshot.nodeVoltages, snapshot.branchCurrents);
  const hasNl = compiled.nonlinear.length > 0;
  const linearOnly = prims.every(p => !['capacitor', 'inductor', 'cccs', 'ccvs'].includes(p.kind));
  if (!hasNl && linearOnly) {
    // engine primitives that carry a `resistive-switch` are not stamped by the DC oracle; oracleCheck() returns undefined then.
    try { rec.oracle = oracleCheck(prims.filter(p => p.kind !== 'nl'), snapshot.nodeVoltages); } catch { /* unsupported kinds */ }
  }
  if (hasNl && linearOnly) {
    const r = refineRoot(prims, snapshot.nodeVoltages);
    const allowed = 1e-4 + 1e-6 * Math.max(0, ...Object.values(snapshot.nodeVoltages).map(Math.abs));
    rec.refine = { supported: r.supported, converged: r.converged, distance: r.distance, allowed, pass: !r.supported || !r.converged ? true : r.distance <= allowed };
  }
}

/** After an engine Newton failure: does an independent source-stepping homotopy find a DC operating point of the same compiled primitives? */
export function existenceProof(handle: EngineHandle, rec: RunRecord) {
  try {
    const compiled = (handle.engine as unknown as { compileDocumentedPrimitives: (dt: number) => { primitives: TabDPrimitive[]; nonlinear: Array<{ id: string; positive: string; negative: string; controls: string[]; current: (n: Record<string, number>) => number }> } | null }).compileDocumentedPrimitives(0.0005);
    if (!compiled) return;
    const prims: Prim[] = [...compiled.primitives, ...compiled.nonlinear.map(d => ({ kind: 'nl' as const, id: d.id, positive: d.positive, negative: d.negative, controls: d.controls, current: d.current }))];
    const r = continuationSolve(prims);
    rec.extra.independentSolverConverged = r.converged;
    rec.extra.independentSolverStage = r.stage;
    if (r.converged) { rec.extra.independentMaxNodeVoltage = Math.max(0, ...Object.values(r.nodeV).map(Math.abs)); }
  } catch { rec.extra.independentSolverConverged = 'unsupported'; }
}

/** Netlists whose *declared* DC solution the harness can compute independently of the engine's own compile step. */
const declaredLinear = (els: Elem[]) => els.every(e => ['R', 'V', 'I', 'OA', 'GND', 'XF', 'E', 'G'].includes(e.t)) && els.every(e => e.t !== 'R' || (Number.isFinite(e.v) && e.v !== 0)) && els.every(e => e.t !== 'V' || Number.isFinite(e.v)) && els.every(e => e.t !== 'I' || Number.isFinite(e.v));

/**
 * The declared-linear oracle models op-amps as unbounded VCVS. When that ideal solution would drive an op-amp beyond its
 * declared supply (engine default ±15 V), the physical answer is a saturated output and the unbounded reference is not a
 * valid expectation — the rail and bistability checks of the same circuit judge it instead.
 */
function idealSolutionLeavesRails(els: Elem[]): boolean {
  const amps = els.filter((e): e is Extract<Elem, { t: 'OA' }> => e.t === 'OA');
  if (!amps.length) return false;
  try {
    const ref = dcOracle(expandLinear(els, 'dc'));
    if (!ref.supported || ref.singular) return false;
    return amps.some(e => Math.abs(ref.nodeV[`@${e.id}:out`] ?? 0) > (e.vcc ?? 15));
  } catch { return false; }
}

export function runEngine(els: Elem[], opts: { steps?: number; stepSeconds?: number; settleSeconds?: number; skipDeclaredOracle?: boolean } = {}): RunRecord {
  const rec = blank('engine'); const t0 = performance.now();
  try {
    const handle = makeEngine(els);
    let snap = handle.engine.getSnapshot();
    if (opts.settleSeconds) { const calls = Math.ceil(opts.settleSeconds / 0.1); for (let k = 0; k < calls; k += 1) { snap = handle.engine.step(0.1); if (!snap.converged) break; } }
    else for (let k = 0; k < (opts.steps ?? 3); k += 1) snap = handle.engine.step(opts.stepSeconds ?? 1e-3);
    if (!snap.converged) {
      Object.assign(rec, fromMessage(snap.warnings[0]?.message ?? 'engine reported converged=false without a warning'));
      if (rec.status === 'nonconverged' || rec.status === 'diagnostic') existenceProof(handle, rec);
    } else {
      inspectEngine(handle, snap, rec);
      // The engine silently clamps/substitutes parameters; compare against what the netlist *declares*.
      if (rec.nodeV && !opts.skipDeclaredOracle && declaredLinear(els) && !idealSolutionLeavesRails(els)) { const declared = oracleCheck(expandLinear(els, 'dc'), rec.nodeV); if (declared) rec.oracle = declared; }
    }
  } catch (e) { Object.assign(rec, classify(e)); }
  rec.ms = performance.now() - t0;
  return rec;
}
