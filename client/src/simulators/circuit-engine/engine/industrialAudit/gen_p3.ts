/**
 * Pillar 3 — reactive, resonant and dynamic networks, including numerically extreme scale mixes.
 */
import { NB, mulberry32 } from '@/simulators/circuit-engine/engine/industrialAudit/ir';
import { chk, type Circuit } from '@/simulators/circuit-engine/engine/industrialAudit/harness';
import { phasorChecks } from '@/simulators/circuit-engine/engine/industrialAudit/ac';
import type { SolverId } from '@/simulators/circuit-engine/engine/industrialAudit/backends';

const P = 'P3-Reactive' as const;

export function buildPillar3(): Circuit[] {
  const out: Circuit[] = [];
  const add = (c: Omit<Circuit, 'pillar' | 'solvers'> & { solvers?: SolverId[] }) => out.push({ pillar: P, solvers: ['tabd'], ...c });
  const rnd = mulberry32(0x33333);
  const logu = (lo: number, hi: number) => lo * Math.pow(hi / lo, rnd());
  const sgn = () => (rnd() > 0.5 ? 1 : -1);

  // ── 3a. Parallel capacitor loops with unequal initial charge ─────────────────────────────────────
  for (const n of [2, 3, 4, 6, 8]) for (let v = 0; v < 2; v += 1) {
    const Cs = Array.from({ length: n }, () => logu(1e-9, v ? 1e-3 : 1e-5)); const V0 = Array.from({ length: n }, () => sgn() * logu(0.1, 50));
    const nb = new NB();
    Cs.forEach((c, i) => nb.C('x', '0', c, V0[i], `C${i}`));
    const vfinal = Cs.reduce((s, c, i) => s + c * V0[i], 0) / Cs.reduce((s, c) => s + c, 0);
    add({ id: `P3/parallel-caps-${n}-${v}`, family: 'cap-parallel-loop', name: `${n} ideal parallel capacitors, unequal initial voltages (C spread ${(Math.max(...Cs) / Math.min(...Cs)).toExponential(1)}×)`, els: nb.els, expect: 'solve', tran: { dt: 1e-4, steps: 6 },
      physics: ({ v: volt }) => [chk('charge conservation: V(x)=ΣC·V0/ΣC', volt('x'), vfinal, 1e-9, 1e-12)] });
  }
  for (const n of [3, 4, 5, 6]) for (let v = 0; v < 2; v += 1) {
    const nb = new NB();
    for (let i = 0; i < n; i += 1) nb.C(i === 0 ? '0' : `r${i}`, i + 1 === n ? '0' : `r${i + 1}`, logu(1e-7, 1e-4), sgn() * logu(0.5, 10) * (v ? 1 : 0.1), `C${i}`);
    add({ id: `P3/cap-ring-${n}-${v}`, family: 'cap-parallel-loop', name: `Ring of ${n} capacitors with KVL-inconsistent initial voltages (impulsive redistribution)`, els: nb.els, expect: 'solve', tran: { dt: 1e-5, steps: 8 } });
  }

  // ── 3b. Inductor cut-sets with mismatched currents ───────────────────────────────────────────────
  for (const n of [2, 3, 4, 5, 6, 3, 4, 6]) {
    const Ls = Array.from({ length: n }, () => logu(1e-6, 1e-1)); const I0 = Array.from({ length: n }, () => sgn() * logu(1e-3, 2));
    const nb = new NB();
    Ls.forEach((l, i) => nb.L('x', '0', l, { i0: I0[i], id: `L${i}` }));
    const dt = 1e-6; const v1 = -I0.reduce((s, i) => s + i, 0) / (dt * Ls.reduce((s, l) => s + 1 / l, 0));
    add({ id: `P3/parallel-inductors-${out.length}`, family: 'inductor-cutset', name: `${n} ideal parallel inductors with mismatched initial currents (ΣI0≠0)`, els: nb.els, expect: 'solve', tran: { dt, steps: 1, stride: 1 },
      physics: ({ v, run }) => [chk('cut-set KCL: Σ inductor currents = 0 after the step', Ls.reduce((s, _, i) => s + (run.reported?.[`L${i}`] ?? NaN), 0), 0, 0, 1e-9), chk('impulsive node voltage v = −ΣI0/(dt·Σ1/L)', v('x'), v1, 1e-6, 1e-9)] });
  }
  for (const n of [3, 4, 5, 6, 3, 5, 4]) {
    const nb = new NB(); const I0 = Array.from({ length: n }, () => sgn() * logu(1e-3, 1));
    for (let i = 0; i < n; i += 1) nb.L('x', `y${i}`, logu(1e-5, 1e-2), { i0: I0[i], id: `L${i}` }).R(`y${i}`, '0', logu(10, 1e4));
    add({ id: `P3/inductor-star-${out.length}`, family: 'inductor-cutset', name: `Star of ${n} inductors into resistive legs, node x has only inductive paths, mismatched ICs`, els: nb.els, expect: 'solve', tran: { dt: 1e-6, steps: 50 },
      physics: ({ run }) => [chk('cut-set KCL: Σ inductor currents = 0', Array.from({ length: n }, (_, i) => run.reported?.[`L${i}`] ?? NaN).reduce((s, i) => s + i, 0), 0, 0, 1e-9)] });
  }

  // ── 3c. Twin-T notch filters ─────────────────────────────────────────────────────────────────────
  for (let k = 0; k < 8; k += 1) {
    const R = logu(1e3, 1e5); const C = logu(1e-9, 1e-7); const f0 = 1 / (2 * Math.PI * R * C);
    const build = (src: (nb: NB) => NB) => src(new NB()).R('in', 'a', R, 'R1').R('a', 'out', R, 'R2').C('a', '0', 2 * C, undefined, 'C3')
      .C('in', 'b', C, undefined, 'C1').C('b', 'out', C, undefined, 'C2').R('b', '0', R / 2, 'R3').R('out', '0', 1e7, 'RL').els;
    const steps = 400; const cycles = 28;
    const els = build(nb => nb.S('in', '0', 1, f0, { id: 'Vin' }));
    add({ id: `P3/twin-T-notch-${k}`, family: 'twin-T', name: `Twin-T notch driven AT its null f0=${f0.toFixed(1)} Hz (R=${R.toExponential(2)}, C=${C.toExponential(2)})`, els, expect: 'solve', tran: { dt: 1 / (f0 * steps), steps: steps * cycles, probes: ['a', 'b', 'out'], stride: steps * 2 },
      physics: ({ trace }) => phasorChecks(trace, els, f0, ['a', 'b', 'out'], 0.015, steps, 1, 'twin-T') });
    const dc = build(nb => nb.V('in', '0', 5, 'Vin'));
    add({ id: `P3/twin-T-dc-${k}`, family: 'twin-T', name: `Twin-T settled to DC (passes DC with unity gain)`, els: dc, expect: 'solve', steadyDc: true, tran: { settle: true }, solvers: ['tabd', 'mna', 'nodal'],
      physics: ({ v }) => [chk('DC transfer = 1 (minus load divider)', v('out'), 5 * 1e7 / (1e7 + 2 * R), 1e-6, 1e-9)] });
  }

  // ── 3d. Wien bridge networks and oscillators ─────────────────────────────────────────────────────
  for (let k = 0; k < 8; k += 1) {
    const R = logu(1e3, 1e5); const C = logu(1e-9, 1e-7); const equal = k < 5; const R2 = equal ? R : R * logu(0.5, 2); const C2 = equal ? C : C * logu(0.5, 2);
    const f0 = 1 / (2 * Math.PI * Math.sqrt(R * R2 * C * C2));
    const steps = 400; const cycles = 26;
    const els = new NB().S('in', '0', 1, f0, { id: 'Vin' }).R('in', 'm', R, 'R1').C('m', 'out', C, undefined, 'C1').R('out', '0', R2, 'R2').C('out', '0', C2, undefined, 'C2').els;
    const expectedGain = 1 / (3 + R / R2 + C2 / C);
    add({ id: `P3/wien-network-${k}`, family: 'wien-bridge', name: `Wien RC network at f0=${f0.toFixed(1)} Hz (${equal ? 'equal' : 'unequal'} R,C)`, els, expect: 'solve', tran: { dt: 1 / (f0 * steps), steps: steps * cycles, probes: ['out'], stride: steps * 2 },
      physics: ({ trace }) => phasorChecks(trace, els, f0, ['out'], 0.015, steps, 1, `Wien (|H|=${expectedGain.toFixed(4)})`) });
  }
  for (const [kk, gainK] of [[0, 2.9], [1, 3.0], [2, 3.1], [3, 2.9], [4, 3.0], [5, 3.1]] as Array<[number, number]>) {
    const R = logu(2e3, 2e4); const C = logu(2e-9, 5e-8); const f0 = 1 / (2 * Math.PI * R * C);
    const Rg = 10e3; const Rf = (gainK - 1) * Rg;
    const nb = new NB().OA('p', 'nn', 'o', 1e6, 'U1').R('o', 'nn', Rf, 'Rf').R('nn', '0', Rg, 'Rg').R('o', 'm', R, 'R1').C('m', 'p', C, undefined, 'C1').R('p', '0', R, 'R2').C('p', '0', C, 0.5, 'C2');
    add({ id: `P3/wien-oscillator-${kk}`, family: 'wien-bridge', name: `Wien-bridge oscillator loop, amplifier gain K=${gainK} (${gainK < 3 ? 'decaying' : gainK === 3 ? 'marginal' : 'growing'}) with kicked C2`, els: nb.els, expect: 'solve', tran: { dt: 1 / (f0 * 100), steps: 100 * 12, stride: 50 } });
  }

  // ── 3e. RLC transmission-line ladders (8–16 sections) ────────────────────────────────────────────
  for (const seg of [8, 10, 12, 14, 16]) for (let v = 0; v < 5; v += 1) {
    const L = logu(1e-4, 1e-2); const C = logu(1e-10, 1e-8); const Rs = logu(0.1, 50) * (v === 4 ? 1e-3 : 1); const Rp = v === 3 ? logu(1e4, 1e7) : 1e9; const z0 = Math.sqrt(L / C);
    const RL = [z0, z0 * 3, z0 / 3, 1e6, z0][v];
    const nb = new NB().V('n0', '0', 10, 'Vs');
    for (let i = 0; i < seg; i += 1) nb.R(`n${i}`, `a${i}`, Rs, `Rs${i}`).L(`a${i}`, `n${i + 1}`, L, { id: `L${i}` }).C(`n${i + 1}`, '0', C, undefined, `C${i}`).R(`n${i + 1}`, '0', Rp, `Rp${i}`);
    nb.R(`n${seg}`, '0', RL, 'RL');
    add({ id: `P3/rlc-ladder-${seg}-${v}`, family: 'rlc-ladder', name: `${seg}-section lossy LC transmission-line ladder (Z0≈${z0.toFixed(0)} Ω, load ${RL.toExponential(2)} Ω)`, els: nb.els, expect: 'solve', steadyDc: true, tran: { settle: true }, solvers: ['tabd', 'mna', 'nodal'] });
  }

  // ── 3f. Extreme scale: MΩ beside mΩ, pF beside mF ───────────────────────────────────────────────
  const extremeDc: Array<[string, (nb: NB) => NB]> = [];
  for (let k = 0; k < 4; k += 1) {
    const n = [3, 5, 8, 12][k];
    extremeDc.push([`mΩ/MΩ alternating ladder, ${n} stages`, nb => { nb.V('n0', '0', 10, 'Vs'); for (let i = 0; i < n; i += 1) nb.R(`n${i}`, `n${i + 1}`, i % 2 ? 1e6 : 1e-3).R(`n${i + 1}`, '0', i % 2 ? 1e-3 + 1e-4 * i : 1e6); return nb.R(`n${n}`, '0', 1e3); }]);
  }
  for (let k = 0; k < 16; k += 1) {
    const n = 4 + (k % 6); const seed = rnd;
    extremeDc.push([`random log-uniform [1 mΩ, 1 MΩ] resistor network, ${n} nodes (#${k})`, nb => {
      nb.V('n1', '0', 12, 'Vs');
      for (let i = 1; i <= n; i += 1) nb.R(`n${i}`, '0', logu(1e-3, 1e6));
      for (let i = 1; i < n; i += 1) nb.R(`n${i}`, `n${i + 1}`, logu(1e-3, 1e6));
      for (let i = 1; i <= n; i += 1) for (let j = i + 2; j <= n; j += 1) if (seed() < 0.3) nb.R(`n${i}`, `n${j}`, logu(1e-3, 1e6));
      return nb;
    }]);
  }
  extremeDc.forEach(([name, build], k) => add({ id: `P3/extreme-resistive-${k}`, family: 'extreme-scale', name, els: build(new NB()).els, expect: 'solve', solvers: ['mna', 'tabd', 'nodal', 'mesh'], maxPrinciple: k < 4 }));
  for (let k = 0; k < 12; k += 1) {
    const n = 2 + (k % 4);
    const nb = new NB().V('n0', '0', 5, 'Vs');
    for (let i = 0; i < n; i += 1) nb.R(`n${i}`, `n${i + 1}`, [1e6, 1e-3, 1e3, 1e5][(i + k) % 4]).C(`n${i + 1}`, '0', [1e-12, 1e-3, 1e-9, 1e-6][(i + 2 * k) % 4]).R(`n${i + 1}`, '0', [1e7, 1e9, 1e6][(i + k) % 3]);
    add({ id: `P3/extreme-rc-${k}`, family: 'extreme-scale', name: `${n}-stage RC network mixing 1 mΩ…1 MΩ with 1 pF…1 mF (time-constants span ~15 decades)`, els: nb.els, expect: 'solve', steadyDc: true, tran: { settle: true }, solvers: ['tabd', 'mna', 'nodal'] });
  }
  for (let k = 0; k < 8; k += 1) {
    const R = [1e-3, 1e-3, 10, 1e6, 1e-3, 1, 1e6, 1e-3][k]; const L = [1e-9, 1e-3, 1e-6, 1, 1e-12, 1e-3, 1e-3, 1][k]; const C = [1e-12, 1e-3, 1e-9, 1e-12, 1e-3, 1e-6, 1e-3, 1e-12][k];
    const nb = new NB().V('s', '0', 1, 'Vs').R('s', 'a', R, 'R').L('a', 'b', L, { id: 'L' }).C('b', '0', C, undefined, 'C');
    const w0 = 1 / Math.sqrt(L * C);
    add({ id: `P3/extreme-series-rlc-${k}`, family: 'extreme-scale', name: `Series RLC with R=${R}, L=${L}, C=${C} (f0=${(w0 / 2 / Math.PI).toExponential(2)} Hz)`, els: nb.els, expect: 'solve', tran: { dt: (2 * Math.PI / w0) / 50, steps: 400 } });
  }
  return out;
}
