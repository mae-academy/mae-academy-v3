/**
 * Pillar 1 — complex active analog and op-amp systems.
 * Op-amps use the engine macromodel (finite gain A=1e6, 50 Ω output, 1 TΩ inputs); declared supply rails are ±15 V.
 */
import { NB, mulberry32 } from './ir';
import { chk, chkLE, type Circuit } from './harness';
import type { SolverId } from './backends';

const P = 'P1-OpAmp' as const;
const A = 1e6;
const RAIL = 15;
/** Supply declared by circuits whose ideal output cannot fit inside ±RAIL (e.g. a 20 V rectifier): the engine clamps to the declared rail, so the expectation and the rail must agree. */
const WIDE_RAIL = 30;
const supplyFor = (idealPeak: number) => (Math.abs(idealPeak) + 1 > RAIL ? WIDE_RAIL : RAIL);
const VT = 0.02585;
const LINEAR: SolverId[] = ['mna', 'tabd', 'nodal', 'engine'];

type Kind = 'LP' | 'HP' | 'BP';

/** One Sallen-Key section from `inp` to `out`; returns nothing (elements are appended to `nb`). */
function skSection(nb: NB, tag: string, kind: Kind, inp: string, out: string, r: number, c: number, k: number) {
  const x = `${tag}x`; const p = `${tag}p`; const n = `${tag}n`;
  const gainNet = () => { if (k === 1) return out; nb.R(out, n, r * 10 * (k - 1), `${tag}Rb`).R(n, '0', r * 10, `${tag}Ra`); return n; };
  if (kind === 'LP') nb.R(inp, x, r, `${tag}R1`).R(x, p, r, `${tag}R2`).C(x, out, c, undefined, `${tag}C1`).C(p, '0', c, undefined, `${tag}C2`).OA(p, gainNet(), out, A, `${tag}U`);
  else if (kind === 'HP') nb.C(inp, x, c, undefined, `${tag}C1`).C(x, p, c, undefined, `${tag}C2`).R(x, out, r, `${tag}R1`).R(p, '0', r, `${tag}R2`).OA(p, gainNet(), out, A, `${tag}U`);
  else {
    // Sallen-Key band-pass (equal component): Vin-R1-A; A-C2-gnd; A-R3-out; A-C1-p; p-R2-gnd
    nb.R(inp, x, r, `${tag}R1`).C(x, '0', c, undefined, `${tag}C2`).R(out, x, 2 * r, `${tag}R3`).C(x, p, c, undefined, `${tag}C1`).R(p, '0', r, `${tag}R2`).OA(p, gainNet(), out, A, `${tag}U`);
  }
}

export function buildPillar1(): Circuit[] {
  const out: Circuit[] = [];
  const rnd = mulberry32(0x11111);
  const logu = (lo: number, hi: number) => lo * Math.pow(hi / lo, rnd());
  const add = (c: Omit<Circuit, 'pillar' | 'solvers'> & { solvers?: SolverId[] }) => out.push({ pillar: P, solvers: LINEAR, engineSettle: c.els.some(e => e.t === 'C' || e.t === 'L') ? 0.6 : undefined, ...c });
  const opampOuts = (nb: NB) => nb.els.flatMap(e => e.t === 'OA' ? [e.no] : []);

  // ── 1a. Sallen-Key LP / HP / BP cascades, 2nd…6th order ───────────────────────────────────────────
  for (const kind of ['LP', 'HP'] as Kind[]) for (const order of [2, 3, 4, 5, 6]) for (const k of [1, 1.586]) for (const vin of [1, -2.5]) {
    const nb = new NB().V('in', '0', vin, 'Vin'); let prev = 'in'; let gain = 1;
    const sections = Math.floor(order / 2);
    for (let s = 0; s < sections; s += 1) { const o = `s${s}`; skSection(nb, `S${s}`, kind, prev, o, logu(1e3, 1e5), logu(1e-9, 1e-7), k); prev = o; gain *= kind === 'LP' ? k : 0; }
    if (order % 2) { // odd order: passive RC then buffered (first-order active section)
      const R = logu(1e3, 1e5); const C = logu(1e-9, 1e-7);
      if (kind === 'LP') nb.R(prev, 'odd', R, 'Rodd').C('odd', '0', C, undefined, 'Codd'); else nb.C(prev, 'odd', C, undefined, 'Codd').R('odd', '0', R, 'Rodd');
      nb.OA('odd', 'o5', 'o5', A, 'Uodd'); prev = 'o5'; if (kind === 'HP') gain = 0;
    }
    const finalNode = prev;
    add({ id: `P1/sallen-key-${kind}-o${order}-K${k}-v${vin}`, family: 'sallen-key', name: `Sallen-Key ${kind === 'LP' ? 'low' : 'high'}-pass, order ${order}, K=${k}, DC input ${vin} V`, els: nb.els, expect: 'solve', rails: { nodes: opampOuts(nb), limit: RAIL },
      physics: ({ v }) => [kind === 'LP' ? chk(`DC gain = K^${sections} (caps open)`, v(finalNode), vin * gain, 1e-2, 1e-4, 'macromodel rout 50 Ω against the gain network') : chk('DC gain = 0 (caps block)', v(finalNode), 0, 0, 1e-3)] });
  }
  for (const order of [2, 4, 6]) for (const k of [1.5, 2.5]) for (const vin of [1, -1.5]) {
    const nb = new NB().V('in', '0', vin, 'Vin'); let prev = 'in';
    for (let s = 0; s < order / 2; s += 1) { skSection(nb, `B${s}`, 'BP', prev, `b${s}`, logu(1e3, 1e5), logu(1e-9, 1e-7), k); prev = `b${s}`; }
    add({ id: `P1/sallen-key-BP-o${order}-K${k}-v${vin}`, family: 'sallen-key', name: `Sallen-Key equal-component band-pass, order ${order}, K=${k}, DC input ${vin} V`, els: nb.els, expect: 'solve', rails: { nodes: opampOuts(nb), limit: RAIL },
      physics: ({ v }) => [chk('band-pass blocks DC: output ≈ 0', v(prev), 0, 0, 1e-3)] });
  }
  for (const kind of ['LP', 'HP', 'BP'] as Kind[]) for (const order of [2, 4, 6]) for (let rep = 0; rep < 2; rep += 1) {
    const nb = new NB().V('in', '0', 1, 'Vin'); let prev = 'in';
    for (let s = 0; s < order / 2; s += 1) { skSection(nb, `T${s}`, kind, prev, `t${s}`, logu(1e3, 1e5), logu(1e-9, 1e-7), kind === 'BP' ? 2 : 1); prev = `t${s}`; }
    add({ id: `P1/sallen-key-settle-${kind}-o${order}-${rep}`, family: 'sallen-key', name: `Sallen-Key ${kind} order ${order} marched (backward Euler) to DC steady state`, els: nb.els, expect: 'solve', solvers: ['tabd', 'mna', 'nodal'], steadyDc: true, tran: { settle: true } });
  }

  // ── 1b. Three-op-amp instrumentation amplifier with CMRR-limiting resistor mismatch ──────────────
  for (const vcm of [0, 2.5, -5]) for (const vd of [0.01, 0.1]) for (const mism of [0, 1e-3, 1e-2, 5e-2]) {
    const rg = 1e3 * (1 + 4 * rnd()); const r1 = 10e3; const r2 = 10e3; const r3 = 10e3 * (1 + 9 * rnd());
    const e = (x: number) => x * (1 + mism * (rnd() * 2 - 1));
    const R1a = e(r1); const R1b = e(r1); const R2 = e(r2); const R3 = e(r3); const R2p = e(r2); const R3p = e(r3);
    const v1 = vcm + vd / 2; const v2 = vcm - vd / 2;
    const nb = new NB().V('in1', '0', v1, 'V1').V('in2', '0', v2, 'V2').OA('in1', 'x1', 'a1', A, 'U1').OA('in2', 'x2', 'a2', A, 'U2').R('x1', 'x2', rg, 'Rg').R('a1', 'x1', R1a, 'R1a').R('a2', 'x2', R1b, 'R1b')
      .R('a1', 'm', R2, 'R2').R('m', 'out', R3, 'R3').OA('pp', 'm', 'out', A, 'U3').R('a2', 'pp', R2p, 'R2p').R('pp', '0', R3p, 'R3p');
    const va = v1 + (v1 - v2) * R1a / rg; const vb = v2 - (v1 - v2) * R1b / rg;
    const ideal = vb * (R3p / (R2p + R3p)) * (1 + R3 / R2) - va * (R3 / R2);
    add({ id: `P1/inamp-vcm${vcm}-vd${vd}-mm${mism}`, family: 'instrumentation-amp', name: `3-op-amp instrumentation amp, Vcm=${vcm} V, Vd=${vd} V, resistor mismatch ±${mism * 100}%`, els: nb.els, expect: 'solve', rails: { nodes: ['a1', 'a2', 'out'], limit: RAIL },
      physics: ({ v }) => [chk('output equals the exact mismatch-aware ideal transfer function', v('out'), ideal, 2e-3, 2e-4, 'finite A=1e6 and 50 Ω rout perturb the ideal by <0.2 %')] });
  }

  // ── 1c. Active peak detector (DC: follower through a diode; bleeder keeps the hold node defined) ─
  for (const mat of ['silicon', 'germanium'] as const) for (const vin of [0.5, 1, 2.5, 5, -0.5, -2.5, 0.1]) {
    const nb = new NB().V('in', '0', vin, 'Vin').OA('in', 'pk', 'o', A, 'U1').D('o', 'pk', mat, 'D1').R('pk', '0', 1e5, 'Rbleed');
    add({ id: `P1/peak-detector-${mat}-${vin}`, family: 'peak-detector', name: `Active peak detector (${mat} diode), Vin=${vin} V`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['o'], limit: RAIL },
      physics: ({ v }) => vin > 0 ? [chk('hold node follows the input (precision detector)', v('pk'), vin, 1e-3, 1e-4)] : [chk('negative input: diode blocks; hold node sits at −Is·Rbleed (reverse saturation leakage)', v('pk'), -(mat === 'germanium' ? 1e-6 : 1e-12) * 1e5, 0.02, 5e-4)] });
  }

  // ── 1d. Precision half-wave and full-wave rectifiers ─────────────────────────────────────────────
  for (const gain of [1, 4]) for (const vin of [-3, -1, -0.1, 0.1, 1, 3, -5, 2]) {
    const supply = supplyFor(vin < 0 ? gain * vin : 0); // the op-amp output sits one diode drop above the rectified output
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'n', 10e3, 'R1').OA('0', 'n', 'o', A, 'U1', supply === RAIL ? undefined : supply).D('o', 'out', 'silicon', 'D1').D('n', 'o', 'silicon', 'D2').R('out', 'n', 10e3 * gain, 'R2').R('out', '0', 10e3, 'RL');
    add({ id: `P1/half-wave-rectifier-g${gain}-${vin}`, family: 'precision-rectifier', name: `Precision half-wave rectifier, gain ${gain}, Vin=${vin} V${supply === RAIL ? '' : ` (declared ±${supply} V supply)`}`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['o'], limit: supply },
      physics: ({ v }) => [chk('rectified output', v('out'), vin < 0 ? -gain * vin : 0, 5e-3, 2e-3, 'diode drop is inside the feedback loop')] });
  }
  for (const rf of [10e3, 22e3, 47e3]) for (const vin of [-5, -2.5, -1, -0.2, 0.2, 1, 2.5, 5]) {
    const rr = 10e3;
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'n1', rr, 'R1').OA('0', 'n1', 'o1', A, 'U1').D('hw', 'o1', 'silicon', 'D1').D('o1', 'n1', 'silicon', 'D2').R('hw', 'n1', rr, 'R2').R('hw', '0', 1e6, 'Rhw')
      .R('in', 'n2', rf, 'Ra').R('hw', 'n2', rf / 2, 'Rb').R('n2', 'out', rf, 'Rf').OA('0', 'n2', 'out', A, 'U2').R('out', '0', 10e3, 'RL');
    add({ id: `P1/full-wave-rectifier-${rf}-${vin}`, family: 'precision-rectifier', name: `Precision full-wave rectifier (2 op-amps, Rf=${rf}), Vin=${vin} V`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['o1', 'out'], limit: RAIL },
      physics: ({ v }) => [chk('|Vin| at the output', v('out'), Math.abs(vin), 5e-3, 3e-3)] });
  }

  // ── 1e. Logarithmic / anti-logarithmic converters ────────────────────────────────────────────────
  const logCases: Array<[number, number]> = [[0.01, 1e3], [0.1, 1e4], [1, 1e5], [5, 1e5], [10, 1e5], [0.05, 1e3], [0.5, 1e4], [2, 1e4], [1, 1e4], [0.2, 1e5], [3, 1e5], [7, 1e5]];
  logCases.forEach(([vin, r], k) => {
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'n', r, 'R1').OA('0', 'n', 'out', A, 'U1').D('n', 'out', 'silicon', 'D1');
    const i = vin / r;
    add({ id: `P1/log-amp-diode-${k}`, family: 'log-antilog', name: `Logarithmic amplifier (diode), Vin=${vin} V, R=${r} Ω`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chk('Vout = −Vt·ln(Vin/(R·Is)+1)', v('out'), -VT * Math.log(i / 1e-12 + 1), 3e-3, 1e-3)] });
  });
  [0.30, 0.35, 0.40, 0.45, 0.48, 0.50, 0.52, 0.54, 0.56, 0.42, 0.38, 0.50].forEach((vin, k) => {
    const rf = [100, 1e3, 10e3][k % 3];
    const i = 1e-12 * (Math.exp(vin / VT) - 1);
    const supply = supplyFor(rf * i);
    const nb = new NB().V('in', '0', vin, 'Vin').D('in', 'n', 'silicon', 'D1').OA('0', 'n', 'out', A, 'U1', supply === RAIL ? undefined : supply).R('out', 'n', rf, 'Rf');
    add({ id: `P1/antilog-amp-diode-${k}`, family: 'log-antilog', name: `Anti-logarithmic amplifier (diode), Vin=${vin} V, Rf=${rf} Ω${supply === RAIL ? '' : ` (declared ±${supply} V supply)`}`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['out'], limit: supply },
      physics: ({ v }) => [chk('Vout = −Rf·Is·(e^{Vin/Vt}−1)', v('out'), -rf * i, 1e-2, 1e-4, 'series resistance 1 mΩ and finite A perturb slightly')] });
  });
  [[0.1, 1e4], [1, 1e5], [5, 1e5], [0.5, 1e4], [2, 1e5], [10, 1e5]].forEach(([vin, r], k) => {
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'n', r, 'R1').OA('0', 'n', 'out', A, 'U1').Q('npn', '0', 'n', 'out', 100, 'Q1');
    add({ id: `P1/log-amp-bjt-${k}`, family: 'log-antilog', name: `Logarithmic amplifier (NPN in feedback), Vin=${vin} V, R=${r} Ω`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chk('Vout = −Vt·ln(Ic/(β·Is)+1)', v('out'), -VT * Math.log((vin / r) / (100 * 1e-15) + 1), 3e-3, 1e-3)] });
  });
  [0.55, 0.58, 0.60, 0.62, 0.64, 0.66].forEach((vbe, k) => {
    const rf = [100, 1e3][k % 2];
    const nb = new NB().V('e', '0', -vbe, 'Ve').R('n', 'out', rf, 'Rf').OA('0', 'n', 'out', A, 'U1').Q('npn', '0', 'n', 'e', 100, 'Q1');
    add({ id: `P1/antilog-amp-bjt-${k}`, family: 'log-antilog', name: `Anti-logarithmic amplifier (NPN), Vbe=${vbe} V, Rf=${rf} Ω`, els: nb.els, expect: 'solve', solvers: ['engine'], rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chk('Vout = +Rf·β·Is·(e^{Vbe/Vt}−1)', v('out'), rf * 100 * 1e-15 * (Math.exp(vbe / VT) - 1), 1e-2, 1e-4)] });
  });

  // ── 1f. Multiple-feedback filters ────────────────────────────────────────────────────────────────
  for (const kind of ['LP', 'HP', 'BP'] as Kind[]) for (const sections of [1, 2]) for (const vin of [1, -1.5]) {
    const nb = new NB().V('in', '0', vin, 'Vin'); let prev = 'in'; let gain = 1;
    for (let s = 0; s < sections; s += 1) {
      const t = `M${s}`; const r = logu(1e3, 5e4); const c = logu(1e-9, 1e-7); const out = `${t}o`; const g = kind === 'LP' ? logu(0.5, 4) : 1;
      if (kind === 'LP') { nb.R(prev, `${t}a`, r, `${t}R1`).R(`${t}a`, `${t}n`, r, `${t}R2`).C(`${t}a`, '0', c, undefined, `${t}C1`).R(`${t}a`, out, r * g, `${t}R3`).C(`${t}n`, out, c, undefined, `${t}C2`).OA('0', `${t}n`, out, A, `${t}U`); gain *= -g; }
      else if (kind === 'HP') nb.C(prev, `${t}a`, c, undefined, `${t}C1`).C(`${t}a`, `${t}n`, c, undefined, `${t}C2`).R(`${t}a`, '0', r, `${t}R1`).R(`${t}n`, out, r, `${t}R2`).OA('0', `${t}n`, out, A, `${t}U`);
      else nb.R(prev, `${t}a`, r, `${t}R1`).C(`${t}a`, `${t}n`, c, undefined, `${t}C1`).C(`${t}a`, out, c, undefined, `${t}C2`).R(`${t}n`, out, 2 * r, `${t}R3`).R(`${t}a`, '0', r / 2, `${t}R2`).OA('0', `${t}n`, out, A, `${t}U`);
      prev = out;
    }
    const last = prev;
    add({ id: `P1/mfb-${kind}-${sections * 2}-v${vin}`, family: 'mfb-filter', name: `Multiple-feedback ${kind} filter, order ${sections * 2}, DC input ${vin} V`, els: nb.els, expect: 'solve', rails: { nodes: opampOuts(nb), limit: RAIL },
      physics: ({ v }) => kind === 'LP' ? [chk('DC gain = Π(−R3/R1)', v(last), vin * gain, 1e-2, 1e-4)] : [chk('DC blocked: output ≈ 0', v(last), 0, 0, 1e-3)] });
  }

  // ── 1g. State-variable (KHN) biquads ─────────────────────────────────────────────────────────────
  for (const ratio of [1, 2, 5, 10]) for (const vin of [1, -1.5, 0.5]) {
    const r1 = 10e3; const rq = logu(1e3, 1e5);
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'n1', r1, 'R1').R('hp', 'n1', 10e3, 'Rf').R('lp', 'n1', r1 * ratio, 'R2').R('bp', 'p1', rq, 'Rq1').R('p1', '0', rq / 3, 'Rq2').OA('p1', 'n1', 'hp', A, 'U1')
      .R('hp', 'n2', 10e3, 'Ri1').C('n2', 'bp', 10e-9, undefined, 'Ci1').OA('0', 'n2', 'bp', A, 'U2').R('bp', 'n3', 10e3, 'Ri2').C('n3', 'lp', 10e-9, undefined, 'Ci2').OA('0', 'n3', 'lp', A, 'U3');
    add({ id: `P1/khn-r${ratio}-v${vin}`, family: 'state-variable', name: `KHN state-variable biquad, LP gain ratio ${ratio}, DC input ${vin} V`, els: nb.els, expect: 'solve', rails: { nodes: ['hp', 'bp', 'lp'], limit: RAIL },
      physics: ({ v }) => [chk('LP output DC = −(R2/R1)·Vin (integrator chain forces HP=BP=0)', v('lp'), -ratio * vin, 1e-2, 1e-3), chk('HP output ≈ 0 at DC', v('hp'), 0, 0, 1e-3)] });
  }

  // ── 1h. Schmitt triggers (inverting / non-inverting, symmetric and offset thresholds) ────────────
  const schmittVin = [-5, -1, -0.2, 0.2, 1, 5, 0.6, -0.6];
  schmittVin.forEach((vin, k) => {
    const r1 = [9e3, 3e3, 1e3, 19e3][k % 4]; const r2 = 1e3; const vref = k >= 4 ? 1 : 0; const beta = r2 / (r1 + r2);
    const nb = new NB().V('in', '0', vin, 'Vin').R('out', 'p', r1, 'R1').R('p', 'r', r2, 'R2').V('r', '0', vref, 'Vref').OA('p', 'in', 'out', A, 'U1');
    add({ id: `P1/schmitt-inverting-${k}`, family: 'schmitt-trigger', bistable: true, name: `Inverting Schmitt trigger, β=${beta.toFixed(3)}, ${vref ? 'offset (asymmetric) thresholds' : 'symmetric'}, Vin=${vin} V`, els: nb.els, expect: 'solve', rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v, run }) => run.solver !== 'engine' ? [] : [{ name: 'bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium', got: Math.abs(v('out')), expected: 0.9 * RAIL, tol: 0, pass: Math.abs(v('out')) >= 0.9 * RAIL, note: 'positive-feedback loop gain Aβ≫1' }] });
  });
  schmittVin.forEach((vin, k) => {
    const r1 = [1e3, 2e3, 5e3, 10e3][k % 4]; const r2 = 10e3; const vref = k >= 4 ? 1 : 0;
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'p', r1, 'R1').R('out', 'p', r2, 'R2').V('r', '0', vref, 'Vref').OA('p', 'r', 'out', A, 'U1');
    add({ id: `P1/schmitt-noninverting-${k}`, family: 'schmitt-trigger', bistable: true, name: `Non-inverting Schmitt trigger, R2/R1=${(r2 / r1).toFixed(1)}, ${vref ? 'offset thresholds' : 'symmetric'}, Vin=${vin} V`, els: nb.els, expect: 'solve', rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v, run }) => run.solver !== 'engine' ? [] : [{ name: 'bistable: output sits at a saturated state (|Vout| ≥ 0.9·Vsat), not the unstable linear equilibrium', got: Math.abs(v('out')), expected: 0.9 * RAIL, tol: 0, pass: Math.abs(v('out')) >= 0.9 * RAIL, note: 'positive-feedback loop gain Aβ≫1' }] });
  });

  // ── 1i. Rail clamping, virtual ground stability and finite input impedance ───────────────────────
  for (const g of [1, 10, 100, 1000]) for (const vin of [0.01, 0.1, 0.5]) {
    const nb = new NB().V('in', '0', vin, 'Vin').R('in', 'n', 1e3, 'R1').R('n', 'out', 1e3 * g, 'Rf').OA('0', 'n', 'out', A, 'U1').R('out', '0', 10e3, 'RL');
    add({ id: `P1/inverting-amp-g${g}-v${vin}`, family: 'rail-clamp', name: `Inverting amplifier gain −${g}, Vin=${vin} V (ideal output ${(-g * vin).toFixed(2)} V vs ±${RAIL} V rails)`, els: nb.els, expect: 'solve', rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chkLE('virtual ground: |V(in−)| ≤ |V(VCVS out)|/A + 1 nV', Math.abs(v('n')), Math.abs(v('@U1:out')) / A * 1.001 + 1e-9), ...(Math.abs(g * vin) < RAIL ? [chk('closed-loop gain', v('out'), -g * vin, 2e-3, 1e-4)] : [])] });
  }
  for (const g of [2, 11, 101]) for (const vin of [0.05, 1]) {
    const nb = new NB().V('in', '0', vin, 'Vin').R('out', 'n', 1e3 * (g - 1), 'Rf').R('n', '0', 1e3, 'Rg').OA('in', 'n', 'out', A, 'U1').R('out', '0', 10e3, 'RL');
    add({ id: `P1/noninverting-amp-g${g}-v${vin}`, family: 'rail-clamp', name: `Non-inverting amplifier gain ${g}, Vin=${vin} V (ideal output ${(g * vin).toFixed(2)} V vs ±${RAIL} V rails)`, els: nb.els, expect: 'solve', rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chkLE('virtual short: |V(in+)−V(in−)| ≤ |V(VCVS out)|/A + 1 nV', Math.abs(v('in') - v('n')), Math.abs(v('@U1:out')) / A * 1.001 + 1e-9), ...(Math.abs(g * vin) < RAIL ? [chk('closed-loop gain', v('out'), g * vin, 2e-3, 1e-4)] : [])] });
  }
  for (const rs of [1e6, 1e7, 1e8, 1e9, 1e10, 1e11]) {
    const nb = new NB().V('src', '0', 5, 'Vs').R('src', 'in', rs, 'Rs').OA('in', 'out', 'out', A, 'U1').R('out', '0', 1e4, 'RL');
    add({ id: `P1/follower-high-source-impedance-${rs}`, family: 'rail-clamp', name: `Voltage follower from a ${rs} Ω source (finite 1 TΩ input impedance error)`, els: nb.els, expect: 'solve', rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chk('follower output = Vs·Rin/(Rin+Rs)', v('out'), 5 * 1e12 / (1e12 + rs), 2e-3, 1e-6)] });
  }
  for (const rin of [1e6, 1e8, 1e9]) for (const g of [10, 100]) {
    const nb = new NB().V('in', '0', 0.05, 'Vin').R('in', 'n', rin, 'R1').R('n', 'out', rin * g, 'Rf').OA('0', 'n', 'out', A, 'U1').R('out', '0', 1e4, 'RL');
    add({ id: `P1/megaohm-inverting-amp-${rin}-g${g}`, family: 'rail-clamp', name: `Inverting amplifier with ${rin} Ω input resistor (high-impedance summing node), gain −${g}`, els: nb.els, expect: 'solve', rails: { nodes: ['out'], limit: RAIL },
      physics: ({ v }) => [chk('closed-loop gain', v('out'), -g * 0.05, 2e-3, 1e-4), chkLE('virtual ground stability', Math.abs(v('n')), Math.abs(v('@U1:out')) / A * 1.001 + 1e-9)] });
  }
  return out;
}
