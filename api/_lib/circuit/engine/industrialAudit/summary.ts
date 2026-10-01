/**
 * Aggregation and Markdown rendering for the industrial stress audit.
 */
import type { CircuitResult, Failure, Pillar } from './harness';
import { PILLAR_TITLES } from './harness';
import type { SolverId } from './backends';

export const SOLVER_LABEL: Record<SolverId, string> = {
  mna: 'mnaSolver (MNASolver, strict DC MNA)',
  nodal: 'NodalSolver (reduced nodal matrix + MNA certificate)',
  mesh: 'MeshSolver — topology-fallback path (no workspace geometry)',
  meshG: 'MeshSolver — workspace-geometry path (as used by the app)',
  tabd: 'analogDocumentedMna (TabDDocumentedMna, LU + backward Euler)',
  engine: 'analogSimulation (TabDSimulationEngine + TabDNewtonMna)',
};

const median = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a: number, b: number) => b ? `${(100 * a / b).toFixed(2)} %` : 'n/a';
const sci = (n: number) => Number.isFinite(n) ? (n === 0 ? '0' : n.toExponential(2)) : String(n);

export function normalizeSymptom(f: Failure): string {
  return `${f.kind}|${f.symptom}`
    .replace(/\(at Vin=[^)]*\)/g, '')
    .replace(/node [^\s:]+/g, 'node #').replace(/cycle closed by [^\n]*?(?= —|$)/g, 'cycle closed by #')
    .replace(/\bV\([^)]*\)/g, 'V(#)').replace(/\|V\([^)]*\)\|/g, '|V(#)|').replace(/\b[QDMRLC]\d+\b/g, '#')
    .replace(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi, '#').replace(/\s+/g, ' ').slice(0, 170);
}

export interface SolverStats { solver: SolverId; runs: number; passed: number; failed: number; solved: number; diagnostics: number; nonconverged: number; crashes: number; kclMedian: number; kclWorst: number; kvlWorst: number; powerWorst: number; oracleRel: number[]; oracleWorstRatio: number; ms: number }

export function solverStats(results: CircuitResult[], filter: (r: CircuitResult) => boolean = () => true): SolverStats[] {
  const map = new Map<SolverId, SolverStats & { kcl: number[] }>();
  for (const r of results.filter(filter)) for (const o of r.outcomes) {
    const s = map.get(o.run.solver) ?? { solver: o.run.solver, runs: 0, passed: 0, failed: 0, solved: 0, diagnostics: 0, nonconverged: 0, crashes: 0, kclMedian: NaN, kclWorst: 0, kvlWorst: 0, powerWorst: 0, oracleRel: [], oracleWorstRatio: 0, ms: 0, kcl: [] };
    s.runs += 1; if (o.pass) s.passed += 1; else s.failed += 1; s.ms += o.run.ms;
    if (o.run.status === 'solved') s.solved += 1; else if (o.run.status === 'diagnostic') s.diagnostics += 1; else if (o.run.status === 'nonconverged') s.nonconverged += 1; else s.crashes += 1;
    const g = o.run.gates;
    if (g && o.run.status === 'solved') {
      if (Number.isFinite(g.kcl.max)) { s.kcl.push(g.kcl.max); s.kclWorst = Math.max(s.kclWorst, g.kcl.max); } else s.kclWorst = Infinity;
      s.kvlWorst = Math.max(s.kvlWorst, g.kvl.max); s.powerWorst = Math.max(s.powerWorst, g.tellegen.relative);
    }
    const orc = o.run.oracle;
    if (orc && orc.supported && !orc.singular && o.run.status === 'solved') { s.oracleRel.push(orc.maxErr / Math.max(orc.scale, 1e-300)); s.oracleWorstRatio = Math.max(s.oracleWorstRatio, orc.maxErr / Math.max(orc.allowed, 1e-300)); }
    map.set(o.run.solver, s);
  }
  return Array.from(map.values()).map(s => ({ ...s, kclMedian: median(s.kcl) }));
}

export interface ClusterRow { key: string; kind: string; solver: SolverId; count: number; circuits: Set<string>; example: Failure; exampleId: string; pillars: Set<Pillar> }

export function clusterFailures(results: CircuitResult[]): ClusterRow[] {
  const map = new Map<string, ClusterRow>();
  for (const r of results) for (const f of r.failures) {
    const key = `${f.solver}|${normalizeSymptom(f)}`;
    const row = map.get(key) ?? { key, kind: f.kind, solver: f.solver, count: 0, circuits: new Set(), example: f, exampleId: r.id, pillars: new Set() };
    row.count += 1; row.circuits.add(r.id); row.pillars.add(r.pillar);
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.circuits.size - a.circuits.size);
}

export function precisionByFamily(results: CircuitResult[]) {
  // per family: for circuits with a supported oracle, each solver's median relative error and "win" count (lowest error, ties within 1e-13)
  const fam = new Map<string, Map<SolverId, number[]>>(); const wins = new Map<string, Map<SolverId, number>>();
  for (const r of results) {
    const errs: Array<[SolverId, number]> = [];
    for (const o of r.outcomes) { const orc = o.run.oracle; if (o.run.status === 'solved' && orc && orc.supported && !orc.singular) errs.push([o.run.solver, orc.maxErr / Math.max(orc.scale, 1e-300)]); }
    if (errs.length < 2) continue;
    const f = fam.get(r.family) ?? new Map(); const w = wins.get(r.family) ?? new Map();
    const best = Math.min(...errs.map(e => e[1]));
    for (const [s, e] of errs) { (f.get(s) ?? f.set(s, []).get(s)!).push(e); if (e <= best + 1e-13) w.set(s, (w.get(s) ?? 0) + 1); }
    fam.set(r.family, f); wins.set(r.family, w);
  }
  return { fam, wins };
}

export function renderMarkdown(results: CircuitResult[], meta: { generatedAt: string; durationMs: number }): string {
  const L: string[] = [];
  const total = results.length; const passed = results.filter(r => r.pass).length; const failed = total - passed;
  const allRuns = results.flatMap(r => r.outcomes);
  L.push('# Industrial Stress Audit — Circuit Simulation Engine', '', `_Generated ${meta.generatedAt} · wall time ${(meta.durationMs / 1000).toFixed(1)} s · REPORT-ONLY audit: no engine file was modified._`, '');
  L.push('## 1. Executive metrics', '', '| Metric | Value |', '|---|---|',
    `| Total circuits executed | **${total}** |`, `| Circuits passed (every assigned solver satisfied every gate) | **${passed}** |`, `| Circuits failed | **${failed}** |`, `| Exact pass percentage | **${pct(passed, total)}** |`,
    `| Total solver executions | ${allRuns.length} |`, `| Solver executions passed | ${allRuns.filter(o => o.pass).length} (${pct(allRuns.filter(o => o.pass).length, allRuns.length)}) |`,
    `| Failure records (gate/physics/diagnostic violations) | ${results.reduce((s, r) => s + r.failures.length, 0)} |`, '');
  const failedSets = new Map<string, number>();
  results.filter(r => !r.pass).forEach(r => { const k = Array.from(new Set(r.failures.map(f => f.solver))).sort().join(' + '); failedSets.set(k, (failedSets.get(k) ?? 0) + 1); });
  L.push('### Failure attribution (which solver(s) failed on each failing circuit)', '', '| Failing solver set | Circuits |', '|---|---:|');
  Array.from(failedSets.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => L.push(`| ${k} | ${n} |`));
  L.push('');
  L.push('## 2. Category breakdown (six pillars)', '', '| Pillar | Circuits | Passed | Failed | Pass rate |', '|---|---:|---:|---:|---:|');
  (Object.keys(PILLAR_TITLES) as Pillar[]).forEach(p => { const rs = results.filter(r => r.pillar === p); const ok = rs.filter(r => r.pass).length; L.push(`| ${PILLAR_TITLES[p]} | ${rs.length} | ${ok} | ${rs.length - ok} | ${pct(ok, rs.length)} |`); });
  L.push('', '### Family-level breakdown', '', '| Pillar | Family | Circuits | Passed | Pass rate |', '|---|---|---:|---:|---:|');
  const fams = new Map<string, CircuitResult[]>(); results.forEach(r => (fams.get(`${r.pillar}|${r.family}`) ?? fams.set(`${r.pillar}|${r.family}`, []).get(`${r.pillar}|${r.family}`)!).push(r));
  Array.from(fams.entries()).sort().forEach(([k, rs]) => { const [p, f] = k.split('|'); const ok = rs.filter(r => r.pass).length; L.push(`| ${p} | ${f} | ${rs.length} | ${ok} | ${pct(ok, rs.length)} |`); });

  L.push('', '## 3. Solver ranking & comparison', '', 'Every solver execution is graded against the same gates. _Oracle error_ is the max node-voltage deviation from the harness-owned equilibrated-LU reference solve, normalised by the largest node voltage.', '',
    '| Solver | Runs | Passed | Solved | Structured diagnostic | Newton non-conv. | Unstructured crash | Median worst-node KCL | Worst KCL | Worst KVL | Worst power mismatch | Median oracle rel. error | Worst oracle error / allowance |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of solverStats(results)) L.push(`| ${SOLVER_LABEL[s.solver]} | ${s.runs} | ${s.passed} (${pct(s.passed, s.runs)}) | ${s.solved} | ${s.diagnostics} | ${s.nonconverged} | ${s.crashes} | ${sci(s.kclMedian)} A | ${sci(s.kclWorst)} A | ${sci(s.kvlWorst)} V | ${(s.powerWorst * 100).toExponential(2)} % | ${sci(median(s.oracleRel))} | ${sci(s.oracleWorstRatio)} |`);
  L.push('', '### Per-pillar solver pass rates', '', '| Pillar | Solver | Runs | Passed | Rate |', '|---|---|---:|---:|---:|');
  (Object.keys(PILLAR_TITLES) as Pillar[]).forEach(p => solverStats(results, r => r.pillar === p).forEach(s => L.push(`| ${p} | ${s.solver} | ${s.runs} | ${s.passed} | ${pct(s.passed, s.runs)} |`)));
  const { fam, wins } = precisionByFamily(results);
  L.push('', '### Numerical precision by topology family (median oracle-relative error; wins = lowest error on the circuit)', '', '| Family | Solver | Circuits compared | Median rel. error | Wins |', '|---|---|---:|---:|---:|');
  Array.from(fam.entries()).sort().forEach(([f, m]) => Array.from(m.entries()).forEach(([s, errs]) => L.push(`| ${f} | ${s} | ${errs.length} | ${sci(median(errs))} | ${wins.get(f)?.get(s) ?? 0} |`)));

  const clusters = clusterFailures(results);
  L.push('', '## 4. Failure clusters (root-cause signatures, most widespread first)', '', '| # | Solver | Kind | Circuits affected | Pillars | Representative symptom | Example circuit |', '|---:|---|---|---:|---|---|---|');
  clusters.slice(0, 80).forEach((c, i) => L.push(`| ${i + 1} | ${c.solver} | ${c.kind} | ${c.circuits.size} | ${Array.from(c.pillars).join(', ')} | ${c.example.symptom.replace(/\|/g, '\\|').slice(0, 170)} | ${c.exampleId} |`));

  L.push('', '## 5. Failure ledger (every failed circuit)', '');
  for (const p of Object.keys(PILLAR_TITLES) as Pillar[]) {
    const bad = results.filter(r => r.pillar === p && !r.pass);
    L.push(`### ${PILLAR_TITLES[p]} — ${bad.length} failed`, '');
    for (const r of bad) {
      L.push(`- **${r.id}** — ${r.name}`);
      const seen = new Set<string>();
      for (const f of r.failures) { const k = `${f.solver}|${normalizeSymptom(f)}`; if (seen.has(k)) continue; seen.add(k); L.push(`  - \`${f.solver}\` **${f.kind}**: ${f.symptom}${f.got !== undefined ? ` — obtained ${f.got}${f.expected ? `, required ${f.expected}` : ''}` : ''}`); }
    }
    L.push('');
  }
  return L.join('\n');
}
