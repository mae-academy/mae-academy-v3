/**
 * Pillar 4 — synthetic IC sub-circuits: discrete 555-timer equivalent, R-2R ladder DACs, H-bridge motor driver.
 */
import { NB, mulberry32, expandLinear, type Elem } from '@/simulators/circuit-engine/engine/industrialAudit/ir';
import { chk, chkGE, chkLE, type Circuit, type PhysicsCheck } from '@/simulators/circuit-engine/engine/industrialAudit/harness';
import { inspectEngine, makeEngine, mergeGates, runEngine, runMna, runTabdDc, type RunRecord, type SolverId } from '@/simulators/circuit-engine/engine/industrialAudit/backends';
import type { GateReport } from '@/simulators/circuit-engine/engine/industrialAudit/gates';

const P = 'P4-IC' as const;

function blankRun(solver: SolverId): RunRecord { return { solver, status: 'solved', extra: {}, faults: [], ms: 0 }; }

/** R-2R ladder: bit k drives spine node a_k through 2R; a_0 is terminated by 2R; output at a_{N-1}. */
export function r2rLadder(bits: number, code: number, vref: number, r: number, mismatch: (id: string) => number = () => 1): Elem[] {
  const nb = new NB();
  for (let k = 0; k < bits; k += 1) {
    nb.R(`a${k}`, `b${k}`, 2 * r * mismatch(`Rl${k}`), `Rl${k}`).V(`b${k}`, '0', ((code >> k) & 1) * vref, `V${k}`);
    if (k + 1 < bits) nb.R(`a${k}`, `a${k + 1}`, r * mismatch(`Rs${k}`), `Rs${k}`);
  }
  nb.R('a0', '0', 2 * r * mismatch('Rt'), 'Rt');
  return nb.els;
}

function r2rLayout(bits: number) {
  const layout: Record<string, [number, number]> = { '0': [50 * bits, 260] };
  for (let k = 0; k < bits; k += 1) { layout[`a${k}`] = [100 * k, 0]; layout[`b${k}`] = [100 * k, 100]; }
  return layout;
}

export function buildPillar4(): Circuit[] {
  const out: Circuit[] = [];
  const rnd = mulberry32(0x44444);
  const add = (c: Omit<Circuit, 'pillar' | 'solvers'> & { solvers: SolverId[] }) => out.push({ pillar: P, ...c });

  // ── 4b. R-2R DAC, individual codes (8 and 10 bit) ────────────────────────────────────────────────
  const code8 = [0, 1, 2, 3, 4, 8, 16, 32, 64, 127, 128, 129, 170, 85, 254, 255, ...Array.from({ length: 24 }, () => Math.floor(rnd() * 256))];
  const code10 = [0, 1, 2, 511, 512, 513, 1022, 1023, 341, 682, 256, 255, ...Array.from({ length: 18 }, () => Math.floor(rnd() * 1024))];
  const vrefs = [5, 3.3, 2.5, 10];
  for (const [bits, codes] of [[8, code8], [10, code10]] as Array<[number, number[]]>) codes.forEach((code, k) => {
    const vref = vrefs[k % 4]; const r = [1e3, 10e3, 2.5e3][k % 3];
    add({
      id: `P4/r2r-${bits}bit-code${code}-${k}`, family: 'r2r-dac', name: `${bits}-bit R-2R ladder, code ${code}/${2 ** bits - 1}, Vref=${vref} V, R=${r} Ω`, els: r2rLadder(bits, code, vref, r), expect: 'solve', maxPrinciple: true,
      solvers: ['mna', 'tabd', 'nodal', 'mesh', 'meshG', ...(k % 3 === 0 ? ['engine' as const] : [])], layout: r2rLayout(bits), layoutBends: { Rt: [-80, 130] },
      physics: ({ v }) => [chk(`Vout = Vref·code/2^${bits}`, v(`a${bits - 1}`), vref * code / 2 ** bits, 1e-9, 1e-12, 'exact for an unloaded R-2R ladder')],
    });
  });

  // ── R-2R full-code sweeps: nodal linearity + monotonicity ────────────────────────────────────────
  for (const bits of [8, 10]) for (const vref of [5, 3.3]) for (const mism of [0, 1e-6]) {
    const codes = 2 ** bits; const r = 10e3;
    const tol = mism === 0 ? 1e-12 : 50 * mism * vref; // physical INL allowance of a 1e-6 mismatched ladder
    const make = (solver: 'mna' | 'tabd') => () => {
      const rec = blankRun(solver); const gates: GateReport[] = []; const vout: number[] = []; let worstOracle = 0; const t0 = performance.now();
      const rngMis = mulberry32(bits * 131 + Math.round(vref * 10));
      const factors = new Map<string, number>();
      const mismatch = (id: string) => { if (!mism) return 1; if (!factors.has(id)) factors.set(id, 1 + mism * (rngMis() * 2 - 1)); return factors.get(id)!; };
      for (let c = 0; c < codes; c += 1) {
        const run = (solver === 'mna' ? runMna : runTabdDc)(r2rLadder(bits, c, vref, r, mismatch));
        if (run.status !== 'solved') { return { runs: [{ ...run, solver }], checks: [] }; }
        if (run.gates) gates.push(run.gates);
        if (run.oracle && run.oracle.supported) worstOracle = Math.max(worstOracle, run.oracle.maxErr / Math.max(run.oracle.allowed, 1e-300));
        vout.push(run.nodeV![`a${bits - 1}`]);
      }
      rec.gates = mergeGates(gates); rec.ms = performance.now() - t0; rec.extra.codes = codes; rec.extra.worstOracleRatio = worstOracle;
      if (worstOracle > 1) rec.faults.push(`reference-solver deviation exceeded the conditioning allowance (ratio ${worstOracle.toExponential(2)})`);
      const lsb = vref / codes;
      const monotonic = vout.every((v, i) => i === 0 || v > vout[i - 1]);
      let inl = 0; let dnl = 0;
      vout.forEach((v, i) => { inl = Math.max(inl, Math.abs(v - vref * i / codes)); if (i) dnl = Math.max(dnl, Math.abs((v - vout[i - 1]) - lsb)); });
      const checks: PhysicsCheck[] = [
        { name: 'strictly monotonic over every code', got: monotonic ? 0 : 1, expected: 0, tol: 0, pass: monotonic },
        chkLE(`INL (max |Vout − ideal|) ≤ ${tol.toExponential(1)} V`, inl, tol), chkLE(`DNL (max |ΔV − LSB|) ≤ ${(2 * tol).toExponential(1)} V`, dnl, 2 * tol),
      ];
      return { runs: [rec], checks: [{ solver, checks }] };
    };
    (['mna', 'tabd'] as const).forEach(solver => add({ id: `P4/r2r-${bits}bit-sweep-${solver}-${vref}V-${mism}`, family: 'r2r-dac-sweep', name: `${bits}-bit R-2R full sweep (${codes} codes), Vref=${vref} V, resistor mismatch ±${mism}`, els: [], expect: 'solve', solvers: [solver], custom: make(solver) }));
  }

  // ── 4a. Discrete 555-timer equivalent (engine path: divider + 2 comparators + NOR SR latch + discharge BJT) ─
  for (const vcc of [5, 9, 12, 15]) for (const state of ['set', 'reset'] as const) for (const depth of [0.05, 0.25]) {
    const thr = state === 'set' ? depth * vcc : (1 - depth) * vcc; const trg = state === 'set' ? depth * vcc : (1 - depth) * vcc;
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'ref2', 5e3, 'R1').R('ref2', 'ref1', 5e3, 'R2').R('ref1', '0', 5e3, 'R3')
      .V('thr', '0', thr, 'Vthr').V('trg', '0', trg, 'Vtrg')
      .OA('thr', 'ref2', 'c1', 1e5, 'U1', vcc).OA('ref1', 'trg', 'c2', 1e5, 'U2', vcc)
      .GATE('nor', 'c1', 'qb', 'q', vcc, 'N1').GATE('nor', 'c2', 'q', 'qb', vcc, 'N2')
      .R('qb', 'bd', 10e3, 'Rb').Q('npn', 'bd', 'dis', '0', 100, 'QD').R('vcc', 'dis', 10e3, 'Rext').R('q', 'out', 100, 'Ro').R('out', '0', 1e3, 'Rl');
    const expectQ = state === 'set' ? vcc : 0;
    add({
      id: `P4/555-${vcc}V-${state}-${depth}`, family: '555-timer', name: `555 equivalent @ Vcc=${vcc} V, ${state.toUpperCase()} (THRES=${thr.toFixed(2)} V, TRIG=${trg.toFixed(2)} V)`, els: nb.els, expect: 'solve', solvers: ['engine'], engineSteps: 12,
      rails: { nodes: ['c1', 'c2'], limit: vcc },
      physics: ({ v }) => [
        chk('latch output Q level', v('q'), expectQ, 1e-6, 1e-6), chk('latch complement Qb level', v('qb'), vcc - expectQ, 1e-6, 1e-6),
        chk('divider tap 2/3·Vcc', v('ref2'), 2 * vcc / 3, 1e-6, 1e-6), chk('divider tap 1/3·Vcc', v('ref1'), vcc / 3, 1e-6, 1e-6),
        chkGE('discharge transistor collector stays above saturation (V(dis) ≥ −0.05 V)', v('dis'), -0.05, 'a BJT cannot drive its collector below emitter'),
      ],
    });
  }

  // ── 4c. H-bridge with flyback clamp diodes and inductive kickback ───────────────────────────────
  const hb = (vs: number, rm: number, lm: number, mat: 'silicon' | 'germanium' | 'ideal', closed: [boolean, boolean, boolean, boolean]) => new NB().V('vs', '0', vs, 'Vs')
    .SW('vs', 'A', closed[0], 'Q1').SW('A', '0', closed[1], 'Q2').SW('vs', 'B', closed[2], 'Q3').SW('B', '0', closed[3], 'Q4')
    .R('A', 'm', rm, 'Rm').L('m', 'B', lm, { id: 'Lm' }).D('A', 'vs', mat, 'D1').D('0', 'A', mat, 'D2').D('B', 'vs', mat, 'D3').D('0', 'B', mat, 'D4').els;
  const mats: Array<'silicon' | 'germanium' | 'ideal'> = ['silicon', 'germanium', 'ideal'];
  for (let k = 0; k < 24; k += 1) {
    const vs = [12, 24, 48][k % 3]; const rm = [0.5, 2, 10, 1][k % 4]; const lm = [1e-3, 10e-3, 100e-3][(k >> 1) % 3]; const mat = mats[k % 3];
    const dir = k % 2 === 0; // which diagonal conducts first
    const els = hb(vs, rm, lm, mat, dir ? [true, false, false, true] : [false, true, true, false]);
    add({
      id: `P4/h-bridge-kickback-${k}`, family: 'h-bridge', name: `H-bridge ${vs} V, motor ${rm} Ω + ${lm * 1e3} mH, ${mat} flyback diodes, ${dir ? 'Q1/Q4' : 'Q2/Q3'} drive then all-off`, els, expect: 'solve', solvers: ['engine'],
      custom: () => {
        const rec = blankRun('engine'); const gates: GateReport[] = []; const checks: PhysicsCheck[] = []; const t0 = performance.now(); const DT = 5e-4;
        const fail = (snapMsg: string | undefined, phase: string) => { rec.status = snapMsg?.includes('Newton') ? 'nonconverged' : 'diagnostic'; rec.code = rec.status === 'nonconverged' ? 'NEWTON_NONCONVERGENCE' : 'SINGULAR_MATRIX'; rec.message = `${snapMsg ?? 'converged=false'} (${phase})`; rec.ms = performance.now() - t0; return { runs: [rec], checks: [] }; };
        try {
          const handle = makeEngine(els);
          let snap = handle.engine.getSnapshot();
          for (let i = 0; i < 40; i += 1) { snap = handle.engine.step(DT); if (!snap.converged) return fail(snap.warnings[0]?.message, `drive phase, step ${i + 1}`); }
          const phase1 = blankRun('engine'); inspectEngine(handle, snap, phase1); if (phase1.gates) gates.push(phase1.gates);
          const iBefore = phase1.reported?.Lm ?? NaN;
          // open every switch in place (keeps reactive state — the harness toggles the same component objects the engine compiled)
          const comps = (handle.engine as unknown as { tabDComponents: Array<{ id: string; type: string; props: Record<string, unknown> }> }).tabDComponents;
          comps.filter(c => c.type === 'sw-spst-no').forEach(c => { c.props.state = 'open'; });
          snap = handle.engine.step(DT);
          if (!snap.converged) return fail(snap.warnings[0]?.message, 'first step after switch-off (inductive kickback)');
          const phase2 = blankRun('engine'); inspectEngine(handle, snap, phase2); if (phase2.gates) gates.push(phase2.gates); if (phase2.refine && !phase2.refine.pass) rec.faults.push(`post-switching operating point is not a KCL root (Δ=${phase2.refine.distance.toExponential(2)} V)`);
          const vA = phase2.nodeV?.A ?? NaN; const vB = phase2.nodeV?.B ?? NaN; const iAfter = phase2.reported?.Lm ?? NaN;
          const lo = dir ? vA : vB; const hi = dir ? vB : vA;
          checks.push(chkGE(`flyback clamp: the node driven below ground stays ≥ −1.5 V (got ${lo.toFixed(3)} V)`, lo, -1.5), chkLE(`flyback clamp: the node driven above the rail stays ≤ Vs+1.5 V (got ${hi.toFixed(3)} V)`, hi, vs + 1.5));
          const vL = (phase2.nodeV?.m ?? NaN) - (phase2.nodeV?.B ?? NaN);
          checks.push(chk('backward-Euler inductor relation v_L = L·(i_after − i_before)/Δt (state carried across the switching event)', vL, lm * (iAfter - iBefore) / DT, 2e-3, 2e-3, `i_before=${iBefore.toFixed(4)} A, i_after=${iAfter.toFixed(4)} A`));
          for (let i = 0; i < 20; i += 1) { snap = handle.engine.step(DT); if (!snap.converged) return fail(snap.warnings[0]?.message, `freewheel decay, step ${i + 2} after switch-off`); }
          const phase3 = blankRun('engine'); inspectEngine(handle, snap, phase3); if (phase3.gates) gates.push(phase3.gates);
          rec.nodeV = phase3.nodeV; rec.reported = phase3.reported;
          checks.push(chkLE('inductor current decays after the source is removed', Math.abs(phase3.reported?.Lm ?? NaN), Math.abs(iBefore) + 1e-9));
        } catch (e) { rec.status = 'crash'; rec.code = 'UNSTRUCTURED_EXCEPTION'; rec.message = e instanceof Error ? `${e.name}: ${e.message}` : String(e); return { runs: [rec], checks: [] }; }
        rec.gates = mergeGates(gates); rec.ms = performance.now() - t0;
        return { runs: [rec], checks: [{ solver: 'engine', checks }] };
      },
    });
  }
  // Product-faithful switching: the app toggles a switch by calling simulation.setCircuit(updatedComponents, wires) (Home.tsx),
  // so the inductor's stored current must survive that call for any kickback to be physically possible.
  for (let k = 0; k < 4; k += 1) {
    const lm = [1e-3, 10e-3, 100e-3, 5e-3][k]; const vs = 24;
    // linear motor-winding branch with a snubber (no diodes) so the test isolates reactive-state retention from Newton convergence
    const els = new NB().V('vs', '0', vs, 'Vs').SW('vs', 'A', true, 'Q1').R('A', 'm', 1, 'Rm').L('m', '0', lm, { id: 'Lm' }).R('A', '0', 1e3, 'Rsnub').els;
    add({
      id: `P4/switch-toggle-state-retention-${k}`, family: 'state-retention', name: `Drive switch opened the way the app does it (setCircuit), ${lm * 1e3} mH winding — stored inductor current must survive`, els, expect: 'solve', solvers: ['engine'],
      custom: () => {
        const rec = blankRun('engine'); const t0 = performance.now(); const DT = 5e-4; const gates: GateReport[] = [];
        try {
          const handle = makeEngine(els);
          let snap = handle.engine.getSnapshot();
          for (let i = 0; i < 40; i += 1) snap = handle.engine.step(DT);
          const before = blankRun('engine'); inspectEngine(handle, snap, before); if (before.gates) gates.push(before.gates);
          const iBefore = before.reported?.Lm ?? NaN;
          const toggled = handle.components.map(c => c.type === 'sw-spst-no' ? { ...c, props: { ...c.props, state: 'open' } } : c);
          handle.engine.setCircuit(toggled, handle.wires);
          snap = handle.engine.step(DT);
          if (!snap.converged) { rec.status = 'nonconverged'; rec.code = 'NEWTON_NONCONVERGENCE'; rec.message = `${snap.warnings[0]?.message} (first step after setCircuit toggle)`; return { runs: [rec], checks: [] }; }
          const after = blankRun('engine'); inspectEngine(handle, snap, after); if (after.gates) gates.push(after.gates);
          const iAfter = after.reported?.Lm ?? NaN; const vL = (after.nodeV?.m ?? NaN) - 0;
          rec.nodeV = after.nodeV; rec.reported = after.reported; rec.gates = mergeGates(gates); rec.ms = performance.now() - t0;
          return { runs: [rec], checks: [{ solver: 'engine' as const, checks: [chk('inductor current survives the switch toggle: backward-Euler relation v_L = L·(i_after − i_before)/Δt', vL, lm * (iAfter - iBefore) / DT, 2e-3, 2e-3, `i_before=${iBefore.toFixed(3)} A → i_after=${iAfter.toFixed(3)} A (a reset state would give i_before=0)`)] }] };
        } catch (e) { rec.status = 'crash'; rec.code = 'UNSTRUCTURED_EXCEPTION'; rec.message = e instanceof Error ? `${e.name}: ${e.message}` : String(e); return { runs: [rec], checks: [] }; }
      },
    });
  }
  // shoot-through (both switches of one leg closed) and all-open static states
  for (let k = 0; k < 4; k += 1) {
    const vs = [12, 24, 5, 48][k];
    add({
      id: `P4/h-bridge-shoot-through-${k}`, family: 'h-bridge', name: `H-bridge shoot-through: Q1 and Q2 closed across a ${vs} V supply (student mistake)`, els: hb(vs, 1, 1e-3, 'silicon', [true, true, false, false]), expect: 'either', solvers: ['engine'],
      physics: ({ run }) => [chkLE('supply current physically bounded (< 1e6 A)', Math.abs(run.reported?.Vs ?? NaN), 1e6, 'two ideal closed switches across an ideal source')],
    });
  }
  return out;
}
