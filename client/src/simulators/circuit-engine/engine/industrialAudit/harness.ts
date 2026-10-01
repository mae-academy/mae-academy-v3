/**
 * Circuit specification, execution and verdict logic for the industrial stress audit.
 */
import { layoutGeometry, meshApplicable, runEngine, runMesh, runMna, runNodal, runTabdDc, runTran, type RunRecord, type SolverId, type TranSpec, type TranTrace } from '@/simulators/circuit-engine/engine/industrialAudit/backends';
import { expandLinear, type Elem } from '@/simulators/circuit-engine/engine/industrialAudit/ir';
import { dcOracle } from '@/simulators/circuit-engine/engine/industrialAudit/oracle';

export type Pillar = 'P1-OpAmp' | 'P2-Transistor' | 'P3-Reactive' | 'P4-IC' | 'P5-Bridge' | 'P6-Student';
export const PILLAR_TITLES: Record<Pillar, string> = {
  'P1-OpAmp': '1. Complex active analog & op-amp systems',
  'P2-Transistor': '2. Transistor biasing & multi-stage amplifiers',
  'P3-Reactive': '3. Reactive, resonant & dynamic networks',
  'P4-IC': '4. Synthetic sub-circuits & IC emulations (555 / R-2R DAC / H-bridge)',
  'P5-Bridge': '5. Passive power, AC bridges & polyphase networks',
  'P6-Student': '6. Student-mistake edge cases & degenerate topologies',
};

export interface PhysicsCheck { name: string; got: number; expected: number; tol: number; pass: boolean; note?: string }

export const chk = (name: string, got: number, expected: number, rel = 1e-6, abs = 1e-9, note?: string): PhysicsCheck => {
  const tol = abs + rel * Math.abs(expected);
  return { name, got, expected, tol, pass: Number.isFinite(got) && Number.isFinite(expected) && Math.abs(got - expected) <= tol, note };
};
export const chkLE = (name: string, got: number, limit: number, note?: string): PhysicsCheck => ({ name, got, expected: limit, tol: 0, pass: Number.isFinite(got) && got <= limit, note: note ?? 'got ≤ limit' });
export const chkGE = (name: string, got: number, limit: number, note?: string): PhysicsCheck => ({ name, got, expected: limit, tol: 0, pass: Number.isFinite(got) && got >= limit, note: note ?? 'got ≥ limit' });

export interface PhysicsCtx { v: (node: string) => number; run: RunRecord; trace?: TranTrace }

export interface Circuit {
  id: string;
  pillar: Pillar;
  family: string;
  name: string;
  els: Elem[];
  solvers: SolverId[];
  expect: 'solve' | 'diagnostic' | 'either';
  /** When set, the `tabd` solver runs a backward-Euler transient instead of a static solve. */
  tran?: TranSpec;
  /** Node coordinates (planar straight-line embedding) enabling the geometry-backed `meshG` run — the path the app takes. */
  layout?: Record<string, [number, number]>;
  layoutBends?: Record<string, [number, number]>;
  engineSteps?: number;
  /** Simulated seconds the engine is run for (0.1 s chunks) so reactive netlists reach their DC operating point. */
  engineSettle?: number;
  engineStepSeconds?: number;
  /** Analytic reference checks evaluated on every solver run that produced a solution. */
  physics?: (ctx: PhysicsCtx) => PhysicsCheck[];
  /** Positive-feedback circuit with two stable saturated states: the unbounded linear DC reference is an unstable equilibrium and is not a valid expectation. */
  bistable?: boolean;
  /** Op-amp output nodes must stay inside ±limit (the supply rails declared by the design). */
  rails?: { nodes: string[]; limit: number };
  /** Passive resistive network driven only by independent voltage sources: every node must lie within the source hull. */
  maxPrinciple?: boolean;
  /** Transient marched to steady state must land on the DC operating point of the same netlist. */
  steadyDc?: boolean;
  /** Bespoke runner (sweeps, scripted switching). Must return fully gated runs. */
  custom?: () => { runs: RunRecord[]; checks: Array<{ solver: SolverId; checks: PhysicsCheck[] }> };
  note?: string;
}

export type FailureKind =
  | 'KCL' | 'KVL' | 'POWER' | 'NUMERICAL_SANITY' | 'UNSTRUCTURED_EXCEPTION' | 'NEWTON_NONCONVERGENCE'
  | 'DIAGNOSTIC_ON_VALID' | 'SILENT_SOLVE_ON_ILLPOSED' | 'ORACLE_MISMATCH' | 'NL_ROOT_MISMATCH'
  | 'PHYSICS_MISMATCH' | 'RAIL_VIOLATION' | 'SOLVER_FAULT';

export interface Failure { solver: SolverId; kind: FailureKind; symptom: string; got?: string; expected?: string }

export interface RunOutcome { run: RunRecord; physics: PhysicsCheck[]; failures: Failure[]; pass: boolean }

export interface CircuitResult {
  id: string; pillar: Pillar; family: string; name: string; expect: Circuit['expect'];
  outcomes: RunOutcome[]; failures: Failure[]; pass: boolean; note?: string;
}

const fmt = (n: number) => Number.isFinite(n) ? (Math.abs(n) >= 1e4 || (Math.abs(n) < 1e-3 && n !== 0) ? n.toExponential(4) : String(Math.round(n * 1e9) / 1e9)) : String(n);

function sourceHull(els: Elem[]) {
  const vals = [0];
  for (const e of els) { if (e.t === 'V') vals.push(e.v); if (e.t === 'S') vals.push((e.off ?? 0) + e.amp, (e.off ?? 0) - e.amp); }
  return { lo: Math.min(...vals), hi: Math.max(...vals) };
}

export function judgeRun(circuit: Circuit, run: RunRecord, trace?: TranTrace): RunOutcome {
  const failures: Failure[] = [];
  const physics: PhysicsCheck[] = [];
  const solver = run.solver;
  const fail = (kind: FailureKind, symptom: string, got?: string, expected?: string) => failures.push({ solver, kind, symptom, got, expected });
  if (run.status === 'crash') fail('UNSTRUCTURED_EXCEPTION', `Uncaught / unstructured error: ${run.message}`);
  else if (run.status === 'nonconverged') {
    if (circuit.expect === 'solve') {
      const proof = run.extra.independentSolverConverged;
      fail('NEWTON_NONCONVERGENCE', `${run.message ?? 'Newton-Raphson did not converge'}${proof === true ? ' — an independent source-stepping homotopy DOES find a DC operating point (engine failure, not a pathological circuit)' : proof === false ? ' — the independent homotopy also failed (circuit may be genuinely pathological)' : ''}`);
    }
  }
  else if (run.status === 'diagnostic') {
    if (circuit.expect === 'solve') {
      const proof = run.extra.independentSolverConverged;
      fail('DIAGNOSTIC_ON_VALID', `Well-posed circuit rejected with ${run.code}: ${run.message}${proof === true ? ' — an independent source-stepping homotopy DOES find a DC operating point' : ''}`);
    }
  }
  else {
    if (circuit.expect === 'diagnostic') fail('SILENT_SOLVE_ON_ILLPOSED', 'Solver returned a numeric solution for a structurally ill-posed circuit (no diagnostic raised)', `${Object.keys(run.nodeV ?? {}).length} node voltages`, 'structured diagnostic');
    const g = run.gates;
    if (g) {
      if (!g.kcl.pass) fail('KCL', `KCL violated at node ${g.kcl.node}`, `${fmt(g.kcl.max)} A`, '≤ 1e-4 A');
      if (!g.kvl.pass) fail('KVL', `KVL violated around cycle closed by ${g.kvl.loop}`, `${fmt(g.kvl.max)} V`, '≤ 1e-3 V');
      if (!g.tellegen.pass) fail('POWER', `Power balance broken: delivered ${fmt(g.tellegen.delivered)} W vs absorbed ${fmt(g.tellegen.absorbed)} W`, `${(g.tellegen.relative * 100).toExponential(3)} %`, '≤ 0.1 %');
      if (!g.sanity.pass) fail('NUMERICAL_SANITY', g.sanity.issues.slice(0, 3).join('; '));
    }
    for (const f of run.faults) fail('SOLVER_FAULT', f);
    if (run.oracle && run.oracle.supported && !run.oracle.singular && !run.oracle.pass) fail('ORACLE_MISMATCH', `Node ${run.oracle.node} deviates from the reference solve (κ≈${fmt(run.oracle.cond)})`, `${fmt(run.oracle.maxErr)} V`, `≤ ${fmt(run.oracle.allowed)} V`);
    if (run.refine && !run.refine.pass) fail('NL_ROOT_MISMATCH', 'Reported nonlinear operating point is not a KCL root: Newton polish moved it', `${fmt(run.refine.distance)} V`, `≤ ${fmt(run.refine.allowed)} V`);
    const grounded = new Set(circuit.els.flatMap(e => e.t === 'GND' ? [e.a] : []));
    const v = (n: string) => (n === '0' || grounded.has(n)) ? 0 : (run.nodeV?.[n] ?? NaN);
    if (circuit.physics) physics.push(...circuit.physics({ v, run, trace }));
    for (const e of circuit.els) {
      if (e.t === 'Q') physics.push(chkGE(`${e.id} (${e.ty.toUpperCase()}): V_${e.ty === 'npn' ? 'CE' : 'EC'} ≥ −0.05 V (a BJT cannot have its collector junction forward-biased beyond saturation)`, e.ty === 'npn' ? v(e.nc) - v(e.ne) : v(e.ne) - v(e.nc), -0.05, 'device-region plausibility'));
      if (e.t === 'M') physics.push(chkGE(`${e.id} (${e.ty.toUpperCase()}MOS): V_DS polarity ≥ −0.05 V (channel current must flow drain-ward)`, e.ty === 'n' ? v(e.nd) - v(e.ns) : v(e.ns) - v(e.nd), -0.05, 'device-region plausibility'));
    }
    // Supply-rail clamping belongs to the engine's `opamp` component; raw MNA/TabD/Nodal solvers only see a linear VCVS macromodel.
    if (circuit.rails && run.solver === 'engine') for (const n of circuit.rails.nodes) physics.push({ name: `rail bound |V(${n})| ≤ ${fmt(circuit.rails.limit)} V`, got: Math.abs(v(n)), expected: circuit.rails.limit, tol: 0, pass: Math.abs(v(n)) <= circuit.rails.limit + 1e-9, note: 'declared supply rail' });
    if (circuit.maxPrinciple && run.nodeV) {
      const { lo, hi } = sourceHull(circuit.els);
      let worst = 0; let worstNode = '';
      for (const [n, val] of Object.entries(run.nodeV)) { const out = Math.max(lo - val, val - hi, 0); if (out > worst) { worst = out; worstNode = n; } }
      physics.push({ name: `maximum principle: all nodes within [${fmt(lo)}, ${fmt(hi)}] V`, got: worst, expected: 0, tol: 1e-6, pass: worst <= 1e-6, note: worstNode ? `worst node ${worstNode}` : undefined });
    }
    if (circuit.steadyDc && run.nodeV) {
      try {
        const ref = dcOracle(expandLinear(circuit.els, 'dc'));
        if (ref.supported && !ref.singular) {
          let err = 0; let worstNode = ''; let scale = 1;
          for (const [n, val] of Object.entries(ref.nodeV)) { if (n.startsWith('#')) continue; scale = Math.max(scale, Math.abs(val)); const e = Math.abs((run.nodeV[n] ?? NaN) - val); if (!(e <= err)) { err = e; worstNode = n; } }
          physics.push({ name: 'transient steady state equals DC operating point', got: err, expected: 0, tol: 1e-5 * scale + 1e-9, pass: err <= 1e-5 * scale + 1e-9, note: worstNode ? `worst node ${worstNode}` : undefined });
        }
      } catch { /* oracle unsupported for this netlist */ }
    }
    for (const c of physics) if (!c.pass) fail(c.name.startsWith('rail') ? 'RAIL_VIOLATION' : 'PHYSICS_MISMATCH', `${c.name}${c.note ? ` (${c.note})` : ''}`, fmt(c.got), `${fmt(c.expected)} ± ${fmt(c.tol)}`);
  }
  return { run, physics, failures, pass: failures.length === 0 };
}

export function runCircuit(circuit: Circuit): CircuitResult {
  const outcomes: RunOutcome[] = [];
  if (circuit.custom) {
    const { runs, checks } = circuit.custom();
    runs.forEach(run => {
      const outcome = judgeRun({ ...circuit, physics: undefined, rails: undefined }, run);
      const extra = checks.find(c => c.solver === run.solver)?.checks ?? [];
      for (const c of extra) { outcome.physics.push(c); if (!c.pass) outcome.failures.push({ solver: run.solver, kind: 'PHYSICS_MISMATCH', symptom: `${c.name}${c.note ? ` (${c.note})` : ''}`, got: fmt(c.got), expected: `${fmt(c.expected)} ± ${fmt(c.tol)}` }); }
      outcome.pass = outcome.failures.length === 0;
      outcomes.push(outcome);
    });
  } else {
    for (const solver of circuit.solvers) {
      let run: RunRecord; let trace: TranTrace | undefined;
      switch (solver) {
        case 'mna': run = runMna(circuit.els); break;
        case 'nodal': run = runNodal(circuit.els); break;
        case 'mesh':
          if (!meshApplicable(circuit.els)) continue;
          run = runMesh(circuit.els); break;
        case 'meshG':
          if (!circuit.layout || !meshApplicable(circuit.els)) continue;
          run = runMesh(circuit.els, layoutGeometry(circuit.els, circuit.layout, circuit.layoutBends)); break;
        case 'tabd':
          if (circuit.tran) { const r = runTran(circuit.els, circuit.tran); run = r.rec; trace = r.trace; } else run = runTabdDc(circuit.els);
          break;
        case 'engine': run = runEngine(circuit.els, { steps: circuit.engineSteps, stepSeconds: circuit.engineStepSeconds, settleSeconds: circuit.engineSettle, skipDeclaredOracle: circuit.bistable }); break;
      }
      outcomes.push(judgeRun(circuit, run, trace));
    }
  }
  const failures = outcomes.flatMap(o => o.failures);
  return { id: circuit.id, pillar: circuit.pillar, family: circuit.family, name: circuit.name, expect: circuit.expect, outcomes, failures, pass: failures.length === 0 && outcomes.length > 0, note: circuit.note };
}
