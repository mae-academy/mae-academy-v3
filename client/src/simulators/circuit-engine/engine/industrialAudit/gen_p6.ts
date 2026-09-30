/**
 * Pillar 6 — real-world student mistakes and degenerate topologies.
 */
import { NB } from '@/simulators/circuit-engine/engine/industrialAudit/ir';
import { chk, chkLE, type Circuit } from '@/simulators/circuit-engine/engine/industrialAudit/harness';
import type { SolverId } from '@/simulators/circuit-engine/engine/industrialAudit/backends';

const LIN: SolverId[] = ['mna', 'tabd', 'nodal', 'mesh', 'engine'];
const P = 'P6-Student' as const;

export function buildPillar6(): Circuit[] {
  const out: Circuit[] = [];
  const add = (c: Omit<Circuit, 'pillar' | 'solvers'> & { solvers?: SolverId[] }) => out.push({ pillar: P, solvers: LIN, ...c });

  // 6a — dangling nodes hanging off a live node through a resistor chain (well-posed: V(dangling) = V(tap)).
  const danglingSpecs: Array<[number, number]> = [[1, 1e3], [1, 1e6], [1, 1e9], [2, 1e3], [2, 1e6], [2, 1e9], [3, 1e4], [3, 1e6]];
  danglingSpecs.forEach(([len, r], k) => {
    const nb = new NB().V('in', '0', 10).R('in', 'tap', 1e3).R('tap', '0', 2e3);
    let prev = 'tap';
    for (let i = 1; i <= len; i += 1) { nb.R(prev, `dn${i}`, r); prev = `dn${i}`; }
    const last = prev;
    add({
      id: `P6/dangling-chain-${len}x${r}`, family: 'dangling-node', name: `Dangling chain of ${len} × ${r} Ω off a divider tap`, els: nb.els, expect: 'solve', maxPrinciple: true,
      physics: ({ v }) => [chk(`V(${last}) equals V(tap) (no DC current in a dead-end branch)`, v(last), v('tap'), 1e-9, 1e-9), chk('V(tap) = 10·2/3', v('tap'), 20 / 3, 1e-9, 1e-9)],
    });
  });

  // 6b — isolated resistor island with no DC path to ground (ill-posed for a pure DC solver).
  for (let n = 2; n <= 5; n += 1) for (const r of [1e3, 1e5]) {
    const nb = new NB().V('in', '0', 5).R('in', '0', 1e3);
    for (let i = 0; i < n; i += 1) nb.R(`isl${i}`, `isl${(i + 1) % n}`, r * (i + 1));
    if (n === 2) nb.R('isl0', 'isl1', r / 2);
    add({ id: `P6/island-ring-${n}-${r}`, family: 'floating-island', name: `Isolated ${n}-node resistor ring (${r} Ω base), no DC path to ground`, els: nb.els, expect: 'either', note: 'Floating island: acceptable outcomes are a structured diagnostic or a leak-resistance solution that satisfies every gate.' });
  }

  // 6c — floating sub-circuit driven by a current source (KCL-consistent ring, common-mode voltage indeterminate).
  for (let k = 0; k < 6; k += 1) {
    const I = [1e-3, 5e-3, 1e-6, 0.1, 2e-3, 1e-4][k];
    const nb = new NB().V('in', '0', 12).R('in', '0', 470).I('f1', 'f2', I).R('f2', 'f3', 1e3 * (k + 1)).R('f3', 'f1', 2.2e3);
    add({ id: `P6/floating-current-loop-${k}`, family: 'floating-island', name: `Current-source-driven floating loop (I=${I} A), no ground reference in the loop`, els: nb.els, expect: 'either' });
  }

  // 6d — capacitor-only coupling (floating at DC): DC solve ambiguous, backward-Euler transient well-posed.
  const capRatios = [[1e-6, 1e-6], [1e-6, 4e-6], [10e-6, 1e-6], [1e-9, 1e-6], [1e-6, 1e-9], [47e-6, 100e-6], [1e-12, 1e-6], [3.3e-6, 3.3e-6]];
  capRatios.forEach(([c1, c2], k) => {
    const nb = new NB().V('in', '0', 9, 'Vs').C('in', 'x', c1, undefined, 'C1').C('x', '0', c2, undefined, 'C2');
    add({
      id: `P6/cap-divider-floating-${k}`, family: 'floating-node-capacitive', name: `Capacitive divider, node x has no DC path (C1=${c1}, C2=${c2})`, els: nb.els, expect: 'either', solvers: ['mna', 'tabd', 'engine'],
      tran: { dt: 1e-3, steps: 20 },
      physics: ({ v, run }) => run.solver === 'tabd' ? [chk('charge-conserving capacitive divider V(x)=Vs·C1/(C1+C2)', v('x'), 9 * c1 / (c1 + c2), 1e-9, 1e-9)] : [],
    });
  });

  // 6e — no reference node anywhere.
  for (let k = 0; k < 6; k += 1) {
    const nb = new NB().V('a', 'b', 5 + k).R('a', 'c', 1e3).R('c', 'b', 2e3 * (k + 1));
    if (k % 2) nb.R('c', 'a', 4.7e3);
    add({ id: `P6/no-reference-${k}`, family: 'no-ground', name: `Network with no ground symbol/reference node (#${k})`, els: nb.els, expect: 'either' });
  }

  // 6f — multiple ground symbols, ground mid-circuit, bridged "grounds" (all one reference).
  for (let k = 0; k < 8; k += 1) {
    const nb = new NB().V('p', 'g1', 12).R('p', 'm', 1e3).R('m', 'g2', 2e3 + 500 * k).R('g1', 'g2', 100 * (k + 1)).GND('g1').GND('g2');
    if (k >= 4) nb.R('m', 'g3', 3e3).GND('g3');
    add({
      id: `P6/multi-ground-${k}`, family: 'multi-ground', name: `${k >= 4 ? 'Three' : 'Two'} ground symbols bridged by a resistor (all must be one reference)`, els: nb.els, expect: 'solve', solvers: ['mna', 'tabd', 'nodal', 'engine'],
      physics: ({ v }) => [chk('V(g1)=0', v('g1'), 0, 0, 1e-12), chk('V(g2)=0', v('g2'), 0, 0, 1e-12), chk('V(m) = 12·(1)/(…) divider sanity: V(p)-V(g1)=12', v('p') - v('g1'), 12, 1e-9, 1e-9)],
    });
  }

  // 6g — series current sources: equal (node b indeterminate) and unequal (KCL-inconsistent).
  const seriesI: Array<[number, number, 'either' | 'diagnostic']> = [[1e-3, 1e-3, 'either'], [5e-3, 5e-3, 'either'], [1e-6, 1e-6, 'either'], [0.2, 0.2, 'either'], [1e-3, 2e-3, 'diagnostic'], [5e-3, 1e-3, 'diagnostic'], [1e-6, 1e-3, 'diagnostic'], [1, 0.5, 'diagnostic']];
  seriesI.forEach(([i1, i2, exp], k) => {
    const nb = new NB().V('in', '0', 10).R('in', 'a', 1e3).I('a', 'b', i1).I('b', '0', i2).R('a', '0', 1e3);
    add({ id: `P6/series-current-sources-${k}`, family: 'series-current-sources', name: `Series current sources ${i1} A → ${i2} A sharing node b (${exp === 'either' ? 'consistent' : 'KCL-inconsistent'})`, els: nb.els, expect: exp });
  });

  // 6h — parallel ideal voltage sources.
  const parallelV: Array<[number[], boolean, 'either' | 'diagnostic']> = [
    [[5, 5], false, 'either'], [[12, 12], false, 'either'], [[3.3, 3.3, 3.3], false, 'either'],
    [[5, 6], false, 'diagnostic'], [[12, 5], false, 'diagnostic'], [[1, 1.001], false, 'diagnostic'], [[5, 5, 9], false, 'diagnostic'],
    [[5, 5], true, 'diagnostic'], [[0, 0], false, 'either'], [[5, -5], false, 'diagnostic'], [[9, 9, 9, 9], false, 'either'], [[1e-6, 2e-6], false, 'diagnostic'],
  ];
  parallelV.forEach(([vs, reversed, exp], k) => {
    const nb = new NB();
    vs.forEach((v, i) => { if (reversed && i === 1) nb.V('0', 'a', v); else nb.V('a', '0', v); });
    nb.R('a', 'b', 1e3).R('b', '0', 2e3);
    add({ id: `P6/parallel-voltage-sources-${k}`, family: 'parallel-voltage-sources', name: `Parallel ideal sources [${vs.join(', ')}] V${reversed ? ' (one reversed)' : ''}`, els: nb.els, expect: exp });
  });

  // 6i — voltage-source loops.
  const loops: Array<[number[], 'either' | 'diagnostic']> = [
    [[5, 3, -8], 'either'], [[1, 1, -2], 'either'], [[10, -4, -6], 'either'], [[2.5, 2.5, 2.5, -7.5], 'either'],
    [[5, 3, -7], 'diagnostic'], [[1, 1, -1], 'diagnostic'], [[10, 4, 6], 'diagnostic'], [[2.5, 2.5, 2.5, -7], 'diagnostic'],
  ];
  loops.forEach(([vs, exp], k) => {
    const nb = new NB();
    const nodes = vs.map((_, i) => i === 0 ? '0' : `l${i}`);
    vs.forEach((v, i) => nb.V(nodes[i], nodes[(i + 1) % vs.length], v));
    nb.R(nodes[1], '0', 1e3);
    add({ id: `P6/voltage-loop-${k}`, family: 'voltage-source-loop', name: `Loop of ${vs.length} ideal sources [${vs.join(', ')}] V (${exp === 'either' ? 'KVL-consistent' : 'KVL-inconsistent'})`, els: nb.els, expect: exp });
  });

  // 6j — current source with no return path.
  for (let k = 0; k < 6; k += 1) {
    const nb = new NB().V('in', '0', 5).R('in', '0', 1e3).I('0', 'dead', [1e-3, 1e-6, 0.5, 2e-3, 1e-9, 10][k]);
    if (k % 2) nb.C('dead', '0', 1e-6);
    if (k === 4) nb.R('dead', 'dead2', 1e3);
    add({ id: `P6/current-into-dead-end-${k}`, family: 'dead-end-current', name: `Current source pushing into a node with no DC return path (#${k})`, els: nb.els, expect: 'either' });
  }

  // 6k — degenerate switch closures (resistive-switch: 1e-15 Ω closed, 1e15 Ω open).
  const share: Array<[number, number, number, number]> = [[1e-6, 1e-6, 5, 0], [1e-6, 2e-6, 10, -5], [1e-9, 1e-6, 3, 7], [100e-6, 1e-6, 12, 0], [1e-3, 1e-12, 5, -5]];
  share.forEach(([c1, c2, v1, v2], k) => {
    const nb = new NB().C('a', '0', c1, v1, 'C1').C('b', '0', c2, v2, 'C2').SW('a', 'b', true, 'SW').R('a', '0', 1e12).R('b', '0', 1e12);
    add({
      id: `P6/switch-charge-sharing-${k}`, family: 'switch-closure', name: `Closing a switch across two capacitors at ${v1} V and ${v2} V (instantaneous node jump)`, els: nb.els, expect: 'solve', solvers: ['tabd'],
      tran: { dt: 1e-4, steps: 5, probes: ['a', 'b'] },
      physics: ({ v, run }) => [chk('charge conservation: V(a)=(C1V1+C2V2)/(C1+C2)', v('a'), (c1 * v1 + c2 * v2) / (c1 + c2), 1e-6, 1e-9), chk('V(a)=V(b)', v('a') - v('b'), 0, 0, 1e-9), chkLE('switch branch current physically bounded (< 1e3 A)', Math.abs(run.reported?.SW ?? NaN), 1e3, 'capacitor charge-sharing current is C·ΔV/Δt')],
    });
  });
  for (let k = 0; k < 3; k += 1) {
    const Vv = [5, 12, 1.5][k]; const Cc = [1e-6, 100e-6, 1e-9][k];
    const nb = new NB().V('s', '0', Vv, 'Vs').SW('s', 'c', true, 'SW').C('c', '0', Cc, 0, 'C1');
    add({
      id: `P6/switch-ideal-source-into-cap-${k}`, family: 'switch-closure', name: `Switch closes an ideal ${Vv} V source directly onto an uncharged ${Cc} F capacitor`, els: nb.els, expect: 'solve', solvers: ['tabd'],
      tran: { dt: 1e-3, steps: 4 },
      physics: ({ v, run }) => [chk('capacitor reaches the source voltage', v('c'), Vv, 1e-6, 1e-9), chkLE('switch branch current physically bounded (< 1e3 A)', Math.abs(run.reported?.SW ?? NaN), 1e3)],
    });
  }
  for (let k = 0; k < 3; k += 1) {
    const [v1, v2] = [[5, 3], [12, 0], [5, -5]][k];
    const nb = new NB().V('a', '0', v1, 'V1').V('b', '0', v2, 'V2').SW('a', 'b', true, 'SW');
    add({
      id: `P6/switch-shorts-two-sources-${k}`, family: 'switch-closure', name: `Switch closes between two ideal sources (${v1} V and ${v2} V)`, els: nb.els, expect: 'either', solvers: ['tabd'],
      tran: { dt: 1e-3, steps: 3 },
      physics: ({ run }) => [chkLE('switch branch current physically bounded (< 1e6 A)', Math.abs(run.reported?.SW ?? NaN), 1e6, `ideal sources ${v1} V / ${v2} V shorted through the switch`)],
    });
  }
  for (let k = 0; k < 3; k += 1) {
    const nb = new NB().V('s', '0', 10).SW('s', 'x', false, 'SW').R('x', '0', [1e3, 1e6, 1e9][k]);
    add({
      id: `P6/switch-open-leak-${k}`, family: 'switch-closure', name: `Open switch (1e15 Ω) feeding a ${[1e3, 1e6, 1e9][k]} Ω load`, els: nb.els, expect: 'solve', solvers: ['tabd'],
      tran: { dt: 1e-3, steps: 3 },
      physics: ({ v }) => [chk('open switch blocks the source: V(x)≈0', v('x'), 10 * [1e3, 1e6, 1e9][k] / (1e15 + [1e3, 1e6, 1e9][k]), 1e-3, 1e-12)],
    });
  }

  // 6l — zero-ohm resistors.
  for (let k = 0; k < 8; k += 1) {
    const nb = new NB().V('in', '0', 5).R('in', 'x', 0).R('x', '0', [1e3, 100, 1, 1e6, 50, 470, 10, 2e3][k]);
    if (k >= 4) nb.R('x', 'y', 0).R('y', '0', 1e3);
    add({ id: `P6/zero-ohm-resistor-${k}`, family: 'zero-ohm', name: `Zero-ohm resistor in series with the source (#${k}${k >= 4 ? ', two cascaded' : ''})`, els: nb.els, expect: 'either' });
  }

  // 6m — invalid element values.
  const bad: Array<[string, (nb: NB) => NB, 'diagnostic' | 'either']> = [
    ['R=NaN', nb => nb.V('in', '0', 5).R('in', 'x', Number.NaN).R('x', '0', 1e3), 'diagnostic'],
    ['R=+Infinity', nb => nb.V('in', '0', 5).R('in', 'x', Number.POSITIVE_INFINITY).R('x', '0', 1e3), 'diagnostic'],
    ['V=NaN', nb => nb.V('in', '0', Number.NaN).R('in', '0', 1e3), 'diagnostic'],
    ['V=+Infinity', nb => nb.V('in', '0', Number.POSITIVE_INFINITY).R('in', '0', 1e3), 'diagnostic'],
    ['I=NaN', nb => nb.V('in', '0', 5).R('in', 'x', 1e3).R('x', '0', 1e3).I('0', 'x', Number.NaN), 'diagnostic'],
    ['I=-Infinity', nb => nb.V('in', '0', 5).R('in', 'x', 1e3).R('x', '0', 1e3).I('0', 'x', Number.NEGATIVE_INFINITY), 'diagnostic'],
    ['R=-1kΩ (negative resistance)', nb => nb.V('in', '0', 5).R('in', 'x', -1e3).R('x', '0', 3e3), 'either'],
    ['R=-1Ω in a loop that cancels a +1Ω', nb => nb.V('in', '0', 5).R('in', 'x', 1).R('x', '0', 1e3).R('x', '0', -1e3), 'either'],
    ['R=1e-30 Ω', nb => nb.V('in', '0', 5).R('in', 'x', 1e-30).R('x', '0', 1e3), 'either'],
    ['R=1e30 Ω', nb => nb.V('in', '0', 5).R('in', 'x', 1e30).R('x', '0', 1e3), 'either'],
  ];
  bad.forEach(([label, build, exp], k) => add({ id: `P6/invalid-value-${k}`, family: 'invalid-values', name: `Invalid/degenerate element value: ${label}`, els: build(new NB()).els, expect: exp, note: exp === 'diagnostic' ? 'A non-finite parameter must be rejected with a structured diagnostic, never propagated into the solution vector.' : undefined }));

  // 6n — voltage source with both terminals on one node.
  [[5, 'diagnostic'], [0, 'either'], [12, 'diagnostic'], [0, 'either'], [-3, 'diagnostic'], [1e-3, 'diagnostic']].forEach(([vv, exp], k) => {
    const nb = new NB().V('a', '0', 10).R('a', 'n', 1e3).R('n', '0', 1e3).V('n', 'n', vv as number, 'Vloop');
    add({ id: `P6/self-shorted-source-${k}`, family: 'shorted-source', name: `Ideal ${vv} V source with both terminals on the same node`, els: nb.els, expect: exp as 'either' | 'diagnostic' });
  });

  // 6o — resistor with both terminals on one node.
  for (let k = 0; k < 4; k += 1) {
    const nb = new NB().V('in', '0', 6).R('in', 'x', 1e3).R('x', '0', 2e3).R('x', 'x', [1e3, 1, 1e9, 10][k], 'Rself');
    add({ id: `P6/self-shorted-resistor-${k}`, family: 'shorted-resistor', name: `Resistor wired back onto its own node (#${k}) — carries no current`, els: nb.els, expect: 'solve', physics: ({ v }) => [chk('V(x)=6·2/3 unaffected', v('x'), 4, 1e-9, 1e-9)] });
  }

  // 6p — trivial circuits.
  add({ id: 'P6/trivial-source-only', family: 'trivial', name: 'Ideal source with nothing attached', els: new NB().V('a', '0', 5).els, expect: 'solve', physics: ({ v }) => [chk('V(a)=5', v('a'), 5)] });
  add({ id: 'P6/trivial-resistor-only', family: 'trivial', name: 'Resistor to ground with no source (all-zero solution)', els: new NB().R('a', '0', 1e3).els, expect: 'solve', physics: ({ v }) => [chk('V(a)=0', v('a'), 0, 0, 1e-12)] });
  add({ id: 'P6/trivial-current-source-loop', family: 'trivial', name: 'Current source through a single resistor to ground', els: new NB().I('0', 'a', 2e-3).R('a', '0', 1e3).els, expect: 'solve', physics: ({ v }) => [chk('V(a)=2 V', v('a'), 2)] });
  add({ id: 'P6/trivial-empty-netlist', family: 'trivial', name: 'Empty netlist', els: [], expect: 'either' });
  return out;
}
