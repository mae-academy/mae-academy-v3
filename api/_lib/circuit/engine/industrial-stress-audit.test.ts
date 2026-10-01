/**
 * INDUSTRIAL STRESS AUDIT — REPORT-ONLY.
 *
 * Procedurally generates ~950 circuits across six pillars (op-amp systems, transistor stages, reactive/resonant networks,
 * IC emulations, AC/polyphase/passive networks, student-mistake topologies) and grades every in-house solver
 * (mnaSolver, NodalSolver, MeshSolver, analogDocumentedMna, analogSimulation/TabDNewtonMna) against:
 *   KCL (<=1e-4 A at every node) · KVL (<=1e-3 V around every fundamental cycle) · Tellegen power balance (<=0.1 %) ·
 *   numerical sanity (no NaN/Inf/null; singular/non-convergent systems must return a structured diagnostic) ·
 *   an independent high-precision reference solution and analytic physics where one exists.
 *
 * Nothing here modifies the engine. A red result IS the audit finding. Set AUDIT_REPORT_DIR to choose where the
 * JSON + Markdown report is written (defaults to the OS temp directory).
 */
import { afterAll, describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPillar1 } from './industrialAudit/gen_p1';
import { buildPillar2 } from './industrialAudit/gen_p2';
import { buildPillar3 } from './industrialAudit/gen_p3';
import { buildPillar4 } from './industrialAudit/gen_p4';
import { buildPillar5 } from './industrialAudit/gen_p5';
import { buildPillar6 } from './industrialAudit/gen_p6';
import { expect } from 'vitest';
import { evaluateGates } from './industrialAudit/gates';
import { dcOracle, phasorOracle } from './industrialAudit/oracle';
import { NB, expandLinear } from './industrialAudit/ir';
import { runMna } from './industrialAudit/backends';
import { runCircuit, type CircuitResult } from './industrialAudit/harness';
import { renderMarkdown } from './industrialAudit/summary';

const circuits = [...buildPillar1(), ...buildPillar2(), ...buildPillar3(), ...buildPillar4(), ...buildPillar5(), ...buildPillar6()];
const results = new Map<string, CircuitResult>();
const started = Date.now();

/** Strip bulky solution vectors so the JSON report stays reviewable. */
const slim = (r: CircuitResult) => ({
  id: r.id, pillar: r.pillar, family: r.family, name: r.name, expect: r.expect, pass: r.pass,
  failures: r.failures,
  runs: r.outcomes.map(o => ({
    solver: o.run.solver, status: o.run.status, code: o.run.code, message: o.run.message, pass: o.pass, ms: Math.round(o.run.ms * 100) / 100,
    gates: o.run.gates && { kcl: o.run.gates.kcl, kvl: o.run.gates.kvl, tellegen: o.run.gates.tellegen, sanity: o.run.gates.sanity },
    oracle: o.run.oracle, refine: o.run.refine, extra: o.run.extra, faults: o.run.faults, physics: o.physics.map(p => ({ name: p.name, got: p.got, expected: p.expected, tol: p.tol, pass: p.pass })),
  })),
});

/** Instrument calibration: positive and negative controls proving the gates/oracles can actually detect faults. */
describe('Audit instrument calibration (positive & negative controls)', () => {
  const divider = new NB().V('in', '0', 10, 'V1').R('in', 'mid', 1e3, 'R1').R('mid', '0', 2e3, 'R2').els;
  const prims = expandLinear(divider, 'dc');
  const healthy = runMna(divider);
  it('healthy MNA solution passes all four gates and matches the analytic divider', () => {
    expect(healthy.gates?.pass).toBe(true);
    expect(Math.abs(healthy.nodeV!.mid - 20 / 3)).toBeLessThan(1e-12);
  });
  it('KCL gate detects a corrupted node voltage', () => {
    const bad = evaluateGates(prims, { ...healthy.nodeV!, mid: healthy.nodeV!.mid + 1 }, healthy.reported!);
    expect(bad.kcl.pass).toBe(false);
  });
  it('KCL/Tellegen gates detect a wrong-signed source current', () => {
    const bad = evaluateGates(prims, healthy.nodeV!, { ...healthy.reported!, V1: -healthy.reported!.V1 });
    expect(bad.kcl.pass || bad.tellegen.pass).toBe(false);
  });
  it('KVL gate detects a source whose node voltage violates its declared value', () => {
    const bad = evaluateGates(prims, { ...healthy.nodeV!, in: 9 }, healthy.reported!);
    expect(bad.kvl.pass).toBe(false);
  });
  it('sanity gate rejects NaN, Infinity and missing node voltages', () => {
    expect(evaluateGates(prims, { ...healthy.nodeV!, mid: Number.NaN }, healthy.reported!).sanity.pass).toBe(false);
    expect(evaluateGates(prims, { ...healthy.nodeV!, mid: Number.POSITIVE_INFINITY }, healthy.reported!).sanity.pass).toBe(false);
    const { mid: _omit, ...missing } = healthy.nodeV!;
    expect(evaluateGates(prims, missing, healthy.reported!).sanity.pass).toBe(false);
  });
  it('DC oracle is exact on a divider and flags a floating island as singular', () => {
    expect(Math.abs(dcOracle(prims).nodeV.mid - 20 / 3)).toBeLessThan(1e-13);
    const island = expandLinear(new NB().V('a', '0', 1, 'V1').R('a', '0', 1, 'R1').R('x', 'y', 1, 'R2').R('y', 'x', 2, 'R3').els, 'dc');
    expect(dcOracle(island).singular).toBe(true);
  });
  it('phasor oracle reproduces the RC low-pass corner (|H| = 1/√2, −45°)', () => {
    const R = 1e3; const C = 1e-6; const w = 1 / (R * C);
    const ref = phasorOracle([{ t: 'V', id: 'V', a: 'in', b: '0', re: 1, im: 0 }, { t: 'R', a: 'in', b: 'out', v: R }, { t: 'C', a: 'out', b: '0', v: C }], w);
    const [re, im] = ref.nodeV.out;
    expect(Math.abs(Math.hypot(re, im) - Math.SQRT1_2)).toBeLessThan(1e-12);
    expect(Math.abs(Math.atan2(im, re) + Math.PI / 4)).toBeLessThan(1e-12);
  });
});

describe(`Industrial stress audit — ${circuits.length} circuits`, () => {
  it('builds a benchmark of 500–1000 uniquely identified circuits', () => {
    const ids = new Set(circuits.map(c => c.id));
    if (ids.size !== circuits.length) throw new Error(`duplicate circuit ids: ${circuits.length - ids.size}`);
    if (circuits.length < 500 || circuits.length > 1000) throw new Error(`benchmark size ${circuits.length} outside 500–1000`);
  });

  for (const circuit of circuits) {
    it(circuit.id, () => {
      const result = runCircuit(circuit);
      results.set(circuit.id, result);
      if (!result.pass) {
        const summary = result.failures.slice(0, 3).map(f => `[${f.solver}] ${f.kind}: ${f.symptom}${f.got ? ` (got ${f.got}; need ${f.expected ?? '—'})` : ''}`).join(' | ');
        const error = new Error(`${circuit.name} :: ${summary}${result.failures.length > 3 ? ` (+${result.failures.length - 3} more)` : ''}`);
        error.stack = '';
        throw error;
      }
    }, 240_000);
  }

  afterAll(() => {
    const all = Array.from(results.values());
    const dir = process.env.AUDIT_REPORT_DIR ?? join(tmpdir(), 'industrial-stress-audit');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'industrial-stress-audit.report.json'), JSON.stringify(all.map(slim)));
    writeFileSync(join(dir, 'industrial-stress-audit.generated.md'), renderMarkdown(all, { generatedAt: new Date().toISOString(), durationMs: Date.now() - started }));
    const passed = all.filter(r => r.pass).length;
    // eslint-disable-next-line no-console
    console.log(`\n[industrial-stress-audit] ${all.length} circuits executed · ${passed} passed · ${all.length - passed} failed · ${(100 * passed / Math.max(1, all.length)).toFixed(2)} % pass · report → ${dir}`);
  });
});
