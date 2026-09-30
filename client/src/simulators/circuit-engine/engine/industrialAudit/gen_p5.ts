/**
 * Pillar 5 — passive power networks: attenuator pads, star/delta and dense multi-source networks,
 * ideal-transformer multi-mesh coupling, AC impedance bridges (Maxwell-Wien, Schering, Anderson-type)
 * and balanced / unbalanced three-phase systems.
 */
import { NB, expandLinear, mulberry32, type Elem } from '@/simulators/circuit-engine/engine/industrialAudit/ir';
import { chk, type Circuit } from '@/simulators/circuit-engine/engine/industrialAudit/harness';
import { dcOracle, phasorOracle } from '@/simulators/circuit-engine/engine/industrialAudit/oracle';
import { elemsToAc, phasorChecks } from '@/simulators/circuit-engine/engine/industrialAudit/ac';
import type { SolverId } from '@/simulators/circuit-engine/engine/industrialAudit/backends';

const P = 'P5-Bridge' as const;
const ALL: SolverId[] = ['mna', 'tabd', 'nodal', 'mesh', 'meshG', 'engine'];

export function buildPillar5(): Circuit[] {
  const out: Circuit[] = [];
  const add = (c: Omit<Circuit, 'pillar' | 'solvers'> & { solvers?: SolverId[] }) => out.push({ pillar: P, solvers: ALL, ...c });
  const rnd = mulberry32(0x50505);
  const pick = (lo: number, hi: number) => lo * Math.pow(hi / lo, rnd());

  // ── 5a. Attenuator pads with impedance-matched source and load ──────────────────────────────────
  for (const kind of ['T', 'Pi', 'BridgedT'] as const) for (const dB of [3, 6, 10, 14, 20, 26]) for (const z0 of [50, 75, 600]) {
    const K = Math.pow(10, dB / 20);
    const nb = new NB().V('s', '0', 10, 'Vs').R('s', 'in', z0, 'Rs');
    if (kind === 'T') nb.R('in', 'm', z0 * (K - 1) / (K + 1), 'R1').R('m', '0', 2 * z0 * K / (K * K - 1), 'R2').R('m', 'out', z0 * (K - 1) / (K + 1), 'R3');
    else if (kind === 'Pi') nb.R('in', '0', z0 * (K + 1) / (K - 1), 'Ra').R('in', 'out', z0 * (K * K - 1) / (2 * K), 'Rb').R('out', '0', z0 * (K + 1) / (K - 1), 'Rc');
    else nb.R('in', 'm', z0, 'R1').R('m', 'out', z0, 'R2').R('in', 'out', z0 * (K - 1), 'Rb').R('m', '0', z0 / (K - 1), 'Rc');
    nb.R('out', '0', z0, 'RL');
    const layout: Record<string, [number, number]> = kind === 'T'
      ? { s: [0, 0], in: [100, 0], m: [200, 0], out: [300, 0], '0': [150, 140] }
      : kind === 'Pi'
        ? { s: [0, 0], in: [100, 0], out: [200, 0], '0': [100, 140] }
        : { s: [0, 0], in: [100, 0], m: [200, 0], out: [300, 0], '0': [200, 140] };
    const bends: Record<string, [number, number]> = kind === 'BridgedT' ? { Rb: [200, -90] } : kind === 'Pi' ? { RL: [260, 90] } : {};
    add({
      layout, layoutBends: bends,
      id: `P5/pad-${kind}-${dB}dB-${z0}ohm`, family: 'attenuator-pad', name: `${kind === 'BridgedT' ? 'Bridged-T' : kind + '-pad'} ${dB} dB, Z0=${z0} Ω, matched source & load`, els: nb.els, expect: 'solve', maxPrinciple: true,
      physics: ({ v }) => [chk('matched input: V(in) = Vs/2', v('in'), 5, 1e-9, 1e-9), chk(`matched insertion: V(out) = Vs/(2·${K.toFixed(4)})`, v('out'), 5 / K, 1e-9, 1e-9)],
    });
  }

  // ── 5b. Star/Delta equivalence under heavy loading and three independent sources ────────────────
  for (let k = 0; k < 24; k += 1) {
    const rab = pick(10, 1e5); const rbc = pick(10, 1e5); const rca = pick(10, 1e5); const sum = rab + rbc + rca;
    const vs = [pick(1, 50) * (rnd() > 0.5 ? 1 : -1), pick(1, 50) * (rnd() > 0.5 ? 1 : -1), pick(1, 50) * (rnd() > 0.5 ? 1 : -1)];
    const loads = [pick(10, 1e4), pick(10, 1e4), pick(10, 1e4)];
    const src = (nb: NB) => nb.V('a', '0', vs[0], 'V1').V('b', '0', vs[1], 'V2').V('c', '0', vs[2], 'V3').R('a', '0', loads[0], 'La').R('b', '0', loads[1], 'Lb').R('c', '0', loads[2], 'Lc');
    const delta = src(new NB()).R('a', 'b', rab, 'Rab').R('b', 'c', rbc, 'Rbc').R('c', 'a', rca, 'Rca');
    const star = src(new NB()).R('a', 'n', rab * rca / sum, 'Ra').R('b', 'n', rab * rbc / sum, 'Rb').R('c', 'n', rbc * rca / sum, 'Rc');
    const ref = dcOracle(expandLinear(star.els, 'dc'));
    add({
      id: `P5/star-delta-${k}`, family: 'star-delta', name: `Δ-network (${rab.toFixed(1)}, ${rbc.toFixed(1)}, ${rca.toFixed(1)} Ω) with 3 independent sources and heavy loads — must equal its Y-equivalent`, els: delta.els, expect: 'solve',
      physics: ({ run }) => ['V1', 'V2', 'V3'].map(id => chk(`source current ${id} equals Y-equivalent network`, run.reported?.[id] ?? NaN, ref.nodeV[`#${id}`], 1e-7, 1e-10)),
    });
  }

  // ── 5c. Dense multi-node networks with floating sources ─────────────────────────────────────────
  for (let k = 0; k < 24; k += 1) {
    const n = 5 + (k % 8);
    const nb = new NB();
    for (let i = 1; i <= n; i += 1) nb.R(`n${i}`, '0', pick(100, 1e5));
    for (let i = 1; i <= n; i += 1) for (let j = i + 1; j <= n; j += 1) if (rnd() < 0.7) nb.R(`n${i}`, `n${j}`, pick(50, 1e5));
    // floating voltage sources across disjoint node pairs (no source loops), plus grounded and current sources
    for (let s = 0; s + 1 < Math.min(n, 6); s += 2) nb.V(`n${s + 1}`, `n${s + 2}`, pick(0.5, 30) * (rnd() > 0.5 ? 1 : -1), `Vf${s}`);
    if (n > 6) nb.V(`n${n}`, '0', pick(1, 24), 'Vg');
    nb.I(`n${1 + (k % n)}`, `n${1 + ((k + 3) % n)}`, pick(1e-4, 0.05), 'Ia');
    add({ id: `P5/dense-network-${k}`, family: 'dense-multisource', name: `${n}-node dense resistive network, floating + grounded V sources and a current source (#${k})`, els: nb.els, expect: 'solve' });
  }

  // ── 5d. Multi-mesh ideal-transformer coupling ────────────────────────────────────────────────────
  const ratios: Array<[number, number]> = [[1, 1], [2, 1], [0.5, 1], [5, 0.2], [10, 1], [1, 4], [3, 3], [0.1, 10], [2, 2], [7, 0.5], [1, 1.5], [4, 0.25]];
  ratios.forEach(([n1, n2], k) => {
    const nb = new NB().V('s', '0', 24, 'Vs').R('s', 'p1', 50 + 10 * k, 'R1').XF('p1', '0', 'q1', '0', n1, 'T1').R('q1', 'm', 100, 'R2').R('m', '0', 400 + 50 * k, 'Rm')
      .XF('m', '0', 'q2', '0', n2, 'T2').R('q2', '0', 200, 'RL');
    add({ id: `P5/transformer-cascade-${k}`, family: 'mutual-coupling', name: `Two coupled meshes through ideal transformers (${n1}:1 then ${n2}:1)`, els: nb.els, expect: 'solve', solvers: k < 2 ? ['mna', 'tabd', 'nodal', 'engine'] : ['mna', 'tabd', 'engine'] });
  });

  // ── 5e. AC impedance bridges ─────────────────────────────────────────────────────────────────────
  const STEPS = 400; const CYCLES = 24;
  const bridge = (id: string, name: string, els: Elem[], f: number, nodes: string[], probes: string[]) => add({
    id, family: 'ac-bridge', name, els, expect: 'solve', solvers: ['tabd'],
    tran: { dt: 1 / (f * STEPS), steps: STEPS * CYCLES, probes, stride: STEPS * 2 },
    physics: ({ trace }) => phasorChecks(trace, els, f, nodes, 0.015, STEPS, 1),
  });
  const freqs = [500, 1000, 2000, 5000];
  // Maxwell-Wien
  for (let k = 0; k < 12; k += 1) {
    const f = freqs[k % 4]; const R2 = pick(200, 5e3); const R3 = pick(200, 5e3); const R4 = pick(200, 1e4); const C4 = pick(10e-9, 500e-9);
    const Rx = R2 * R3 / R4; const Lx = R2 * R3 * C4;
    const detune = k < 6 ? 0 : k < 8 ? 0 : [0.05, -0.08, 0.15, 0.3][k - 8];
    const nb = new NB().S('A', '0', 1, f, { id: 'Vsrc' }).R('A', 'x1', Rx * (k >= 8 && k % 2 ? 1 + detune : 1), 'Rx').L('x1', 'B', Lx * (k >= 8 && k % 2 === 0 ? 1 + detune : 1), { id: 'Lx' })
      .R('B', '0', R2, 'R2').R('A', 'D', R3, 'R3').R('D', '0', R4, 'R4').C('D', '0', C4, undefined, 'C4').R('B', 'D', 1e6, 'Rdet');
    bridge(`P5/maxwell-wien-${k}`, `Maxwell-Wien bridge ${k < 8 ? 'balanced' : `detuned ${(detune * 100).toFixed(0)}%`} @ ${f} Hz (Lx=${(Lx * 1e3).toFixed(3)} mH, Rx=${Rx.toFixed(1)} Ω)`, nb.els, f, ['B', 'D', 'B~D'], ['B', 'D']);
  }
  // Schering
  for (let k = 0; k < 12; k += 1) {
    const f = freqs[k % 4]; const R3 = pick(200, 5e3); const R4 = pick(500, 2e4); const C2 = pick(10e-9, 200e-9); const C4 = pick(1e-9, 100e-9);
    const Cx = C2 * R4 / R3; const Rx = R3 * C4 / C2;
    const detune = k < 8 ? 0 : [0.05, -0.08, 0.2, 0.4][k - 8];
    const nb = new NB().S('A', '0', 1, f, { id: 'Vsrc' }).R('A', 'x1', Rx, 'Rx').C('x1', 'B', Cx * (1 + detune), undefined, 'Cx').C('B', '0', C2, undefined, 'C2')
      .R('A', 'D', R3, 'R3').R('D', '0', R4, 'R4').C('D', '0', C4, undefined, 'C4').R('B', 'D', 1e6, 'Rdet');
    bridge(`P5/schering-${k}`, `Schering bridge ${k < 8 ? 'balanced' : `Cx detuned ${(detune * 100).toFixed(0)}%`} @ ${f} Hz (Cx=${(Cx * 1e9).toFixed(2)} nF, Rx=${Rx.toFixed(1)} Ω)`, nb.els, f, ['B', 'D', 'B~D'], ['B', 'D']);
  }
  // Anderson-type (5-node): standard-capacitor arm replaced by a series r-C leg feeding an inner node E
  for (let k = 0, made = 0; made < 12 && k < 200; k += 1) {
    const f = freqs[made % 4]; const omega = 2 * Math.PI * f;
    const R2 = pick(200, 5e3); const R3 = pick(200, 5e3); const R4 = pick(200, 5e3); const r = pick(100, 5e3); const C = pick(20e-9, 500e-9);
    const ref = phasorOracle(elemsToAc(new NB().S('A', '0', 1, f, { id: 'Vsrc' }).R('A', 'D', R3).R('D', '0', R4).R('D', 'E', r).C('E', '0', C).els, omega), omega);
    const [er, ei] = ref.nodeV.E; const d = er * er + ei * ei;
    const ratioRe = er / d; const ratioIm = -ei / d; // V_A / V_E with V_A = phasor of the source
    const srcPh = [Math.cos(-Math.PI / 2), Math.sin(-Math.PI / 2)]; // amplitude 1, sin → -90° phasor
    const invE = [er / d, -ei / d];
    const zr = srcPh[0] * invE[0] - srcPh[1] * invE[1]; const zi = srcPh[0] * invE[1] + srcPh[1] * invE[0];
    void ratioRe; void ratioIm;
    const Rx = R2 * (zr - 1); const Lx = R2 * zi / omega;
    if (!(Rx > 1e-3) || !(Lx > 1e-9)) continue;
    const detune = made < 8 ? 0 : [0.05, -0.1, 0.25, 0.5][made - 8];
    const nb = new NB().S('A', '0', 1, f, { id: 'Vsrc' }).R('A', 'x1', Rx, 'Rx').L('x1', 'B', Lx * (1 + detune), { id: 'Lx' }).R('B', '0', R2, 'R2')
      .R('A', 'D', R3, 'R3').R('D', '0', R4, 'R4').R('D', 'E', r, 'r').C('E', '0', C, undefined, 'C').R('B', 'E', 1e6, 'Rdet');
    bridge(`P5/anderson-${made}`, `Anderson-type bridge ${made < 8 ? 'balanced' : `Lx detuned ${(detune * 100).toFixed(0)}%`} @ ${f} Hz (Lx=${(Lx * 1e3).toFixed(3)} mH, Rx=${Rx.toFixed(1)} Ω)`, nb.els, f, ['B', 'E', 'B~E'], ['B', 'E']);
    made += 1;
  }

  // ── 5f. Three-phase systems (star-grounded source, line impedance, Y / Δ loads) ──────────────────
  const PH_STEPS = 240; const PH_CYCLES = 20; const AMP = 100;
  type Load = 'Y4' | 'Y3' | 'D';
  const poly = (k: number, load: Load, balanced: boolean, rl: boolean, f: number, skew: number[]) => {
    const Rl = 0.5 + 0.1 * k; const Ll = rl ? 1e-3 : 0;
    const RZ = [12, 12 * skew[0], 12 * skew[1]]; const LZ = rl ? [20e-3, 20e-3 * skew[0], 20e-3 * skew[1]] : [0, 0, 0];
    const nb = new NB();
    const ph = [0, -2 * Math.PI / 3, 2 * Math.PI / 3];
    ['a', 'b', 'c'].forEach((p, i) => {
      nb.S(`s${p}`, '0', AMP, f, { phase: ph[i], id: `S${p}` });
      if (Ll) nb.R(`s${p}`, `m${p}`, Rl, `Rl${p}`).L(`m${p}`, p, Ll, { id: `Ll${p}` }); else nb.R(`s${p}`, p, Rl, `Rl${p}`);
    });
    const loadImp = (a: string, b: string, i: number, id: string) => { if (LZ[i]) nb.R(a, `z${id}`, RZ[i], `R${id}`).L(`z${id}`, b, LZ[i], { id: `L${id}` }); else nb.R(a, b, RZ[i], `R${id}`); };
    if (load === 'Y4') ['a', 'b', 'c'].forEach((p, i) => loadImp(p, '0', i, p));
    else if (load === 'Y3') ['a', 'b', 'c'].forEach((p, i) => loadImp(p, 'N', i, p));
    else [['a', 'b'], ['b', 'c'], ['c', 'a']].forEach(([x, y], i) => loadImp(x, y, i, `${x}${y}`));
    const nodes = load === 'Y3' ? ['a', 'b', 'c', 'N'] : ['a', 'b', 'c'];
    const probes = load === 'Y3' ? ['a', 'b', 'c', 'N'] : ['a', 'b', 'c'];
    add({
      id: `P5/three-phase-${load}-${balanced ? 'bal' : 'unbal'}-${rl ? 'RL' : 'R'}-${k}`, family: 'polyphase', name: `3-phase ${load === 'D' ? 'Δ' : load === 'Y4' ? 'Y (4-wire, grounded neutral)' : 'Y (3-wire, floating neutral)'} ${balanced ? 'balanced' : `unbalanced ×[1, ${skew[0]}, ${skew[1]}]`} ${rl ? 'RL' : 'R'} load @ ${f} Hz`, els: nb.els, expect: 'solve', solvers: ['tabd'],
      tran: { dt: 1 / (f * PH_STEPS), steps: PH_STEPS * PH_CYCLES, probes, stride: PH_STEPS },
      physics: ({ trace, run }) => {
        const checks = phasorChecks(trace, nb.els, f, nodes, 0.02, PH_STEPS, AMP);
        if (load === 'Y4' && balanced && run.reported) {
          const sum = ['a', 'b', 'c'].reduce((s, p) => s + (run.reported![`R${p}`] ?? NaN), 0);
          checks.push(chk('balanced 4-wire system: neutral current Σ i_phase = 0', sum, 0, 0, 1e-9, 'discrete steady state is exactly 120° shift-invariant'));
        }
        if (load === 'Y3' && balanced) checks.push(chk('balanced floating star: neutral-point voltage = 0 (by symmetry)', trace ? Math.hypot(...[0].map(() => trace.last.nodeV.N ?? NaN)) : NaN, 0, 0, 1e-8));
        return checks;
      },
    });
  };
  let pk = 0;
  for (const load of ['Y4', 'Y3', 'D'] as Load[]) for (const rl of [false, true]) {
    poly(pk, load, true, rl, pk % 2 ? 60 : 50, [1, 1]); pk += 1;
    for (const skew of [[0.5, 2], [1, 1e-2], [3, 0.3]]) { poly(pk, load, false, rl, pk % 2 ? 60 : 50, skew); pk += 1; }
  }
  return out;
}
