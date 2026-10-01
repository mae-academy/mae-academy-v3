/**
 * Pillar 2 — transistor biasing and multistage amplifiers (TabDSimulationEngine component path).
 */
import { NB, mulberry32 } from './ir';
import { chk, chkGE, chkLE, type Circuit, type PhysicsCheck } from './harness';
import { mergeGates, runEngine, type RunRecord, type SolverId } from './backends';
import type { GateReport } from './gates';

const P = 'P2-Transistor' as const;
const VT = 0.02585;

export function buildPillar2(): Circuit[] {
  const out: Circuit[] = [];
  const rnd = mulberry32(0x22222);
  const logu = (lo: number, hi: number) => lo * Math.pow(hi / lo, rnd());
  const add = (c: Omit<Circuit, 'pillar' | 'solvers'> & { solvers?: SolverId[] }) => out.push({ pillar: P, solvers: ['engine'], ...c });

  // ── 2a. CE (bypassed RE) → direct-coupled emitter follower → Class-AB push-pull with diode bias ─────
  let idx = 0;
  for (const beta of [50, 100, 200, 300]) for (const vcc of [9, 12, 15]) for (const ic0 of [0.5e-3, 2e-3]) {
    idx += 1;
    const re = 0.1 * vcc / ic0; const ib = ic0 / beta; const vb = 0.1 * vcc + 0.65; const idiv = 10 * ib; const r2 = vb / idiv; const r1 = (vcc - vb) / (idiv + ib); const rc = 0.4 * vcc / ic0;
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').V('vee', '0', -vcc, 'Vee')
      .R('vcc', 'b1', r1, 'R1').R('b1', '0', r2, 'R2').R('vcc', 'c1', rc, 'RC').R('e1', '0', re, 'RE').Q('npn', 'b1', 'c1', 'e1', beta, 'Q1')
      .Q('npn', 'c1', 'vcc', 'e2', beta, 'Q2').R('e2', '0', 2.2e3, 'RE2')
      .R('e2', 'mid', 47e3, 'Rin').R('vcc', 'b3', 1e3 * (vcc / 12) + 500, 'Rb1').D('b3', 'mid', 'silicon', 'D1').D('mid', 'b4', 'silicon', 'D2').R('b4', 'vee', 1e3 * (vcc / 12) + 500, 'Rb2')
      .Q('npn', 'b3', 'vcc', 'e3', beta, 'Q3').R('e3', 'out', 0.47, 'Re3').Q('pnp', 'b4', 'vee', 'e4', beta, 'Q4').R('e4', 'out', 0.47, 'Re4').R('out', '0', [8, 50][idx % 2], 'RL');
    add({
      id: `P3x/bjt-cascade-${idx}`.replace('P3x', 'P2'), family: 'bjt-multistage', name: `CE→follower→Class-AB cascade, β=${beta}, ±${vcc} V, Ic≈${ic0 * 1e3} mA, RL=${[8, 50][idx % 2]} Ω`, els: nb.els, expect: 'solve', engineSteps: 4,
      physics: ({ v }) => [chk('CE stage operating current: Ic·RE ≈ V(e1)', v('e1') / re, ic0, 0.35, 1e-6, 'design-intent plausibility (±35 %: Vbe, divider loading)'), chkGE('Q1 base-emitter forward biased (0.45–0.85 V)', v('b1') - v('e1'), 0.45), chkLE('Q1 base-emitter ≤ 0.85 V', v('b1') - v('e1'), 0.85)],
    });
  }

  // ── 2b. Current mirrors ──────────────────────────────────────────────────────────────────────────
  const iref = [0.1e-3, 0.5e-3, 1e-3, 2e-3, 5e-3];
  for (let k = 0; k < 6; k += 1) {
    const beta = [50, 100, 200, 300, 100, 150][k]; const vcc = [12, 12, 15, 9, 5, 12][k]; const ir = iref[k % 5]; const rref = (vcc - 0.7) / ir;
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'd', rref, 'Rref').Q('npn', 'd', 'd', '0', beta, 'Q1').Q('npn', 'd', 'o', '0', beta, 'Q2').R('vcc', 'o', (vcc * 0.5) / ir, 'Rl');
    add({ id: `P2/mirror-simple-${k}`, family: 'current-mirror', name: `Simple NPN mirror, β=${beta}, Iref≈${ir * 1e3} mA`, els: nb.els, expect: 'solve',
      physics: ({ v }) => { const iR = (vcc - v('d')) / rref; return [chk('Iout = Iref·β/(β+2) (finite-β mirror error under the Ic=β·Ib model)', (vcc - v('o')) / ((vcc * 0.5) / ir), iR * beta / (beta + 2), 2e-3, 1e-9)]; } });
  }
  for (let k = 0; k < 12; k += 1) {
    const beta = [60, 100, 200, 300][k % 4]; const vcc = [12, 15, 9][k % 3]; const ir = iref[k % 5]; const rref = (vcc - 0.7) / ir; const re = [100, 500, 1e3, 220][k % 4] * (5e-4 / ir);
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'd', rref, 'Rref').Q('npn', 'd', 'd', '0', beta, 'Q1').Q('npn', 'd', 'o', 'e2', beta, 'Q2').R('e2', '0', re, 'Re').R('vcc', 'o', (vcc * 0.4) / (ir * 0.3), 'Rl');
    add({ id: `P2/mirror-widlar-${k}`, family: 'current-mirror', name: `Widlar source, β=${beta}, Iref≈${ir * 1e3} mA, Re=${re.toFixed(1)} Ω`, els: nb.els, expect: 'solve' });
  }
  for (let k = 0; k < 12; k += 1) {
    const beta = [60, 100, 200, 300][k % 4]; const vcc = [12, 15, 9][k % 3]; const ir = iref[(k + 1) % 5]; const rref = (vcc - 1.4) / ir;
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'in', rref, 'Rref').Q('npn', 'b', 'in', 'x', beta, 'Q3').Q('npn', 'b', 'b', '0', beta, 'Q1').Q('npn', 'b', 'x', '0', beta, 'Q2')
      .R('vcc', 'o', (vcc * 0.4) / ir, 'Rl').Q('npn', 'in', 'o', 'x', beta, 'Q4');
    // Wilson: Q3 (collector=in node, base=b? ) — modelled as the canonical 3-transistor Wilson mirror:
    // Q1 diode-connected to ground, Q2 mirrors it, Q3 (output) base tied to Q2 collector.
    const wil = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'in', rref, 'Rref').Q('npn', 'nb', 'in', 'x', beta, 'Q3').Q('npn', 'x', 'nb', '0', beta, 'Q2').Q('npn', 'x', 'x', '0', beta, 'Q1');
    void nb;
    // Wilson output is taken from Q3's collector; here Q3's collector doubles as the reference node, so load Q3 via a second branch:
    const wilson = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'ref', rref, 'Rref').Q('npn', 'q2b', 'ref', 'q3e', beta, 'Q3').Q('npn', 'q2b', 'q2b', '0', beta, 'Q1').Q('npn', 'q2b', 'q3e', '0', beta, 'Q2');
    void wil;
    add({ id: `P2/mirror-wilson-${k}`, family: 'current-mirror', name: `Wilson mirror (3×NPN), β=${beta}, Iref≈${ir * 1e3} mA`, els: wilson.els, expect: 'solve' });
  }
  for (let k = 0; k < 12; k += 1) {
    const beta = [60, 100, 200, 300][k % 4]; const vcc = [12, 15, 9][k % 3]; const ir = iref[(k + 2) % 5]; const rref = (vcc - 1.4) / ir;
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').R('vcc', 'ref', rref, 'Rref').Q('npn', 'ref', 'ref', 'm1', beta, 'Q3').Q('npn', 'm1', 'm1', '0', beta, 'Q1')
      .Q('npn', 'ref', 'o', 'm2', beta, 'Q4').Q('npn', 'm1', 'm2', '0', beta, 'Q2').R('vcc', 'o', (vcc * 0.35) / ir, 'Rl');
    add({ id: `P2/mirror-cascode-${k}`, family: 'current-mirror', name: `Cascode mirror (4×NPN), β=${beta}, Iref≈${ir * 1e3} mA`, els: nb.els, expect: 'solve' });
  }

  // ── 2c. Differential pairs ───────────────────────────────────────────────────────────────────────
  const vds = [0, 5e-3, -5e-3, 20e-3, -20e-3, 50e-3, -50e-3, 0.1];
  for (let k = 0; k < 16; k += 1) {
    const beta = [100, 200][k % 2]; const vd = vds[k % 8]; const vcm = [0, 1, -1, 2][(k >> 1) % 4]; const itail = [1e-3, 2e-3][(k >> 2) % 2]; const vcc = 12; const rc = 4e3;
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').V('vee', '0', -vcc, 'Vee').V('i1', '0', vcm + vd / 2, 'Vi1').V('i2', '0', vcm - vd / 2, 'Vi2')
      .R('vcc', 'o1', rc, 'RC1').R('vcc', 'o2', rc, 'RC2').Q('npn', 'i1', 'o1', 'tail', beta, 'Q1').Q('npn', 'i2', 'o2', 'tail', beta, 'Q2').I('tail', 'vee', itail, 'It');
    const ictot = itail * beta / (beta + 1); const ic1 = ictot / (1 + Math.exp(-vd / VT));
    add({ id: `P2/diffpair-bjt-ideal-tail-${k}`, family: 'differential-pair', name: `BJT diff pair, ideal tail ${itail * 1e3} mA, Vcm=${vcm} V, Vd=${vd * 1e3} mV, β=${beta}`, els: nb.els, expect: 'solve',
      physics: ({ v }) => [chk('collector current split Ic1 = Itail·β/(β+1)/(1+e^{−Vd/Vt})', (vcc - v('o1')) / rc, ic1, 5e-3, 1e-7), chk('common-mode rejection: Ic1+Ic2 independent of Vcm', (vcc - v('o1')) / rc + (vcc - v('o2')) / rc, ictot, 5e-3, 1e-7)] });
  }
  for (let k = 0; k < 8; k += 1) {
    const beta = [100, 200][k % 2]; const vd = [0, 10e-3, -10e-3, 40e-3][(k >> 1) % 4]; const vcm = [0, 1.5][k % 2];
    const re = [1e3, 2.2e3][(k >> 2) % 2];
    const nb = new NB().V('vcc', '0', 12, 'Vcc').V('vee', '0', -12, 'Vee').V('i1', '0', vcm + vd / 2, 'Vi1').V('i2', '0', vcm - vd / 2, 'Vi2')
      .R('vcc', 'o1', 4e3, 'RC1').R('vcc', 'o2', 4e3, 'RC2').Q('npn', 'i1', 'o1', 'tail', beta, 'Q1').Q('npn', 'i2', 'o2', 'tail', beta, 'Q2')
      .Q('npn', 'bt', 'tail', 'et', beta, 'Q3').R('vcc', 'bt', 1e9, 'Rdummy').V('bt', '0', -8.6, 'Vbias').R('et', 'vee', re, 'Ret');
    add({ id: `P2/diffpair-bjt-active-tail-${k}`, family: 'differential-pair', name: `BJT diff pair with active (BJT) tail source, Re=${re} Ω, Vcm=${vcm} V, Vd=${vd * 1e3} mV`, els: nb.els, expect: 'solve' });
  }
  for (let k = 0; k < 16; k += 1) {
    const vd = [0, 20e-3, -20e-3, 0.1, -0.1, 0, 0.3, -0.3][k % 8]; const vcm = [3, 4.5][(k >> 3) % 2]; const itail = [1e-3, 2e-3][(k >> 1) % 2];
    const nb = new NB().V('vdd', '0', 12, 'Vdd').V('vee', '0', 0, 'Vss').V('i1', '0', vcm + vd / 2, 'Vi1').V('i2', '0', vcm - vd / 2, 'Vi2')
      .R('vdd', 'o1', 4e3, 'RD1').R('vdd', 'o2', 4e3, 'RD2').M('n', 'i1', 'o1', 'tail', { rds: 10, vth: 2 + 0.1 * (k % 3), id: 'M1' }).M('n', 'i2', 'o2', 'tail', { rds: 10, vth: 2 + 0.1 * (k % 3), id: 'M2' }).I('tail', 'vee', itail, 'It');
    add({ id: `P2/diffpair-mos-${k}`, family: 'differential-pair', name: `NMOS diff pair, ideal tail ${itail * 1e3} mA, Vcm=${vcm} V, Vd=${vd * 1e3} mV`, els: nb.els, expect: 'solve',
      physics: ({ v }) => vd === 0 ? [chk('balanced pair: outputs equal for Vd=0 (CMRR symmetry)', v('o1') - v('o2'), 0, 0, 1e-4)] : [] });
  }

  // ── 2d. CMOS inverters and self-biased analog amplifiers ─────────────────────────────────────────
  for (const vdd of [5, 9, 12]) for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const vin = f * vdd;
    const nb = new NB().V('vdd', '0', vdd, 'Vdd').V('in', '0', vin, 'Vin').M('p', 'in', 'out', 'vdd', { rds: 0.2, vth: -2, id: 'MP' }).M('n', 'in', 'out', '0', { rds: 0.1, vth: 2, id: 'MN' }).R('out', '0', 1e7, 'Rload');
    add({ id: `P2/cmos-inverter-${vdd}V-${f}`, family: 'cmos-inverter', name: `CMOS inverter, Vdd=${vdd} V, Vin=${vin.toFixed(2)} V`, els: nb.els, expect: 'solve',
      physics: ({ v }) => f === 0 ? [chk('logic-high: Vout ≈ Vdd', v('out'), vdd, 1e-4, 1e-4)] : f === 1 ? [chk('logic-low: Vout ≈ 0', v('out'), 0, 0, 1e-3)] : [chkGE('Vout within supply', v('out'), -1e-6), chkLE('Vout within supply', v('out'), vdd + 1e-6)] });
  }
  for (const vdd of [5, 9, 12]) for (const rds of [0.1, 1, 10, 100]) {
    const make = () => {
      const rec: RunRecord = { solver: 'engine', status: 'solved', extra: {}, faults: [], ms: 0 }; const gates: GateReport[] = []; const vout: number[] = []; const t0 = performance.now();
      for (let i = 0; i <= 40; i += 1) {
        const vin = vdd * i / 40;
        const els = new NB().V('vdd', '0', vdd, 'Vdd').V('in', '0', vin, 'Vin').M('p', 'in', 'out', 'vdd', { rds: rds * 2, vth: -2, id: 'MP' }).M('n', 'in', 'out', '0', { rds, vth: 2, id: 'MN' }).R('out', '0', 1e7, 'Rload').els;
        const r = runEngine(els, { steps: 4 });
        if (r.status !== 'solved') return { runs: [{ ...r, message: `${r.message} (at Vin=${vin.toFixed(3)} V)` }], checks: [] };
        if (r.gates) gates.push(r.gates); if (r.refine && !r.refine.pass) rec.faults.push(`Vin=${vin.toFixed(3)}: operating point is not a KCL root (Δ=${r.refine.distance.toExponential(2)} V)`);
        vout.push(r.nodeV!.out);
      }
      rec.gates = mergeGates(gates); rec.ms = performance.now() - t0;
      const monotone = vout.every((x, i) => i === 0 || x <= vout[i - 1] + 1e-6);
      const checks: PhysicsCheck[] = [{ name: 'voltage-transfer curve is monotonically non-increasing', got: monotone ? 0 : 1, expected: 0, tol: 0, pass: monotone }, chk('VTC endpoint Vin=0 → Vout≈Vdd', vout[0], vdd, 1e-3, 1e-3), chk('VTC endpoint Vin=Vdd → Vout≈0', vout[vout.length - 1], 0, 0, 5e-3)];
      return { runs: [rec], checks: [{ solver: 'engine' as const, checks }] };
    };
    add({ id: `P2/cmos-vtc-sweep-${vdd}V-rds${rds}`, family: 'cmos-inverter', name: `CMOS inverter VTC sweep (41 points), Vdd=${vdd} V, Rds_on(N)=${rds} Ω`, els: [], expect: 'solve', custom: make });
  }
  for (const vdd of [3.3, 5, 9, 12]) for (const rf of [1e5, 1e6, 1e7, 1e8]) {
    const nb = new NB().V('vdd', '0', vdd, 'Vdd').M('p', 'g', 'out', 'vdd', { rds: 0.2, vth: -2, id: 'MP' }).M('n', 'g', 'out', '0', { rds: 0.1, vth: 2, id: 'MN' }).R('out', 'g', rf, 'Rf').R('out', '0', 1e6, 'Rload');
    add({ id: `P2/cmos-selfbias-${vdd}V-${rf}`, family: 'cmos-analog-amp', name: `Self-biased CMOS inverter amplifier with gate–drain feedback ${rf} Ω, Vdd=${vdd} V`, els: nb.els, expect: 'solve',
      physics: ({ v }) => [chk('no DC gate current: V(gate)=V(out)', v('g') - v('out'), 0, 0, 1e-3), ...(vdd >= 5 ? [chkGE('bias point in the transition region (Vout ≥ Vth)', v('out'), 2), chkLE('bias point in the transition region (Vout ≤ Vdd−|Vth|)', v('out'), vdd - 2)] : [])] });
  }

  // ── 2e. BJT switches, Darlington / Sziklai pairs, LED drivers ────────────────────────────────────
  for (let k = 0; k < 8; k += 1) {
    const beta = [50, 100, 200, 300][k % 4]; const vcc = [5, 12][k >> 2 & 1]; const rb = [10e3, 1e3, 4.7e3, 47e3][k % 4]; const rc = [1e3, 330, 100, 4.7e3][(k + 1) % 4]; const vin = [5, 3.3, 5, 12][k % 4];
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').V('in', '0', vin, 'Vin').R('in', 'b', rb, 'RB').Q('npn', 'b', 'c', '0', beta, 'Q1').R('vcc', 'c', rc, 'RC');
    add({ id: `P2/bjt-switch-${k}`, family: 'bjt-switch', name: `Saturating NPN switch β=${beta}, Vcc=${vcc} V, RB=${rb} Ω, RC=${rc} Ω (Ic demand ${(beta * (vin - 0.7) / rb * 1e3).toFixed(1)} mA vs ${(vcc / rc * 1e3).toFixed(1)} mA available)`, els: nb.els, expect: 'solve' });
  }
  for (let k = 0; k < 4; k += 1) {
    const beta = [100, 200][k % 2]; const vcc = [12, 5][k >> 1];
    const nb = new NB().V('vcc', '0', vcc, 'Vcc').V('in', '0', vcc * 0.5, 'Vin').R('in', 'b1', 10e3, 'RB').Q('npn', 'b1', 'vcc', 'b2', beta, 'Q1').Q('npn', 'b2', 'vcc', 'e', beta, 'Q2').R('e', '0', 1e3, 'RE');
    add({ id: `P2/darlington-${k}`, family: 'darlington', name: `Darlington emitter follower β=${beta}², Vcc=${vcc} V`, els: nb.els, expect: 'solve' });
  }
  return out;
}
