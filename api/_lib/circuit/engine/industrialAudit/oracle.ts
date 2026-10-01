/**
 * Independent reference solvers owned by the audit harness (NOT the engine under test).
 *  - `dcOracle`      : equilibrated, partial-pivoting dense LU + iterative refinement on a linear DC netlist,
 *                      plus an infinity-norm condition number of the assembled MNA matrix.
 *  - `phasorOracle`  : complex MNA (real 2N embedding) for sinusoidal steady state.
 *  - `refineRoot`    : Newton polish starting at an engine solution to measure its true distance from a KCL root.
 */
import type { Prim } from './ir';

export interface DenseSolve { x: number[]; singular: boolean; cond: number; minPivot: number }

/** Solves A x = b with row/column equilibration, partial pivoting and two refinement sweeps. */
export function denseSolve(A: number[][], b: number[], wantCond = true): DenseSolve {
  const n = b.length;
  if (!n) return { x: [], singular: false, cond: 1, minPivot: 1 };
  const r = Array<number>(n).fill(1);
  const c = Array<number>(n).fill(1);
  for (let i = 0; i < n; i += 1) {
    let m = 0;
    for (let j = 0; j < n; j += 1) m = Math.max(m, Math.abs(A[i][j]));
    if (m === 0) return { x: Array(n).fill(NaN), singular: true, cond: Infinity, minPivot: 0 };
    r[i] = 1 / m;
  }
  for (let j = 0; j < n; j += 1) {
    let m = 0;
    for (let i = 0; i < n; i += 1) m = Math.max(m, Math.abs(A[i][j]) * r[i]);
    if (m === 0) return { x: Array(n).fill(NaN), singular: true, cond: Infinity, minPivot: 0 };
    c[j] = 1 / m;
  }
  const B = A.map((row, i) => row.map((v, j) => v * r[i] * c[j]));
  const perm = Array.from({ length: n }, (_, i) => i);
  let minPivot = Infinity;
  for (let k = 0; k < n; k += 1) {
    let p = k;
    for (let i = k + 1; i < n; i += 1) if (Math.abs(B[i][k]) > Math.abs(B[p][k])) p = i;
    minPivot = Math.min(minPivot, Math.abs(B[p][k]));
    if (Math.abs(B[p][k]) < 1e-13) return { x: Array(n).fill(NaN), singular: true, cond: Infinity, minPivot };
    if (p !== k) { [B[k], B[p]] = [B[p], B[k]]; [perm[k], perm[p]] = [perm[p], perm[k]]; }
    for (let i = k + 1; i < n; i += 1) {
      const f = B[i][k] / B[k][k];
      B[i][k] = f;
      if (f !== 0) for (let j = k + 1; j < n; j += 1) B[i][j] -= f * B[k][j];
    }
  }
  const lu = (rhs: number[]) => {
    const y = Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) { let s = rhs[perm[i]]; for (let j = 0; j < i; j += 1) s -= B[i][j] * y[j]; y[i] = s; }
    const z = Array<number>(n).fill(0);
    for (let i = n - 1; i >= 0; i -= 1) { let s = y[i]; for (let j = i + 1; j < n; j += 1) s -= B[i][j] * z[j]; z[i] = s / B[i][i]; }
    return z;
  };
  const solveScaledRhs = (rhs: number[]) => lu(rhs.map((v, i) => v * r[i])).map((v, j) => v * c[j]);
  let x = solveScaledRhs(b);
  for (let sweep = 0; sweep < 2; sweep += 1) {
    const res = b.map((bi, i) => { let s = bi; for (let j = 0; j < n; j += 1) s -= A[i][j] * x[j]; return s; });
    const dx = solveScaledRhs(res);
    x = x.map((v, i) => v + dx[i]);
  }
  let cond = NaN;
  if (wantCond && n <= 140) {
    let normA = 0;
    for (let i = 0; i < n; i += 1) { let s = 0; for (let j = 0; j < n; j += 1) s += Math.abs(A[i][j]); normA = Math.max(normA, s); }
    // ||A^-1||_inf = max row sum of |A^-1| ; column k of A^-1 = solve(A, e_k)
    const inv: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
    for (let k = 0; k < n; k += 1) {
      const e = Array<number>(n).fill(0); e[k] = 1;
      const col = solveScaledRhs(e);
      for (let i = 0; i < n; i += 1) inv[i][k] = col[i];
    }
    let normInv = 0;
    for (let i = 0; i < n; i += 1) { let s = 0; for (let j = 0; j < n; j += 1) s += Math.abs(inv[i][j]); normInv = Math.max(normInv, s); }
    cond = normA * normInv;
  }
  return { x, singular: false, cond, minPivot };
}

export function assembleDcMatrix(prims: Prim[]): { A: number[][]; z: number[]; nodes: string[]; ok: boolean } {
  // Re-run the dcOracle stamping but expose the assembled system (diagnostics only).
  const names = new Set<string>();
  for (const p of prims) { names.add(p.positive); names.add(p.negative); if ('controlPositive' in p && p.controlPositive) names.add(p.controlPositive); if ('controlNegative' in p && p.controlNegative) names.add(p.controlNegative); }
  const nodes = Array.from(names).filter(n => n !== '0').sort();
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const branches = prims.filter(p => p.kind === 'voltage' || p.kind === 'vcvs');
  const bIdx = new Map(branches.map((p, i) => [p.id, nodes.length + i]));
  const N = nodes.length + branches.length;
  const A = Array.from({ length: N }, () => Array<number>(N).fill(0)); const z = Array<number>(N).fill(0);
  const ni = (n?: string) => (n === undefined || n === '0') ? -1 : idx.get(n) ?? -1;
  const add = (i: number, j: number, v: number) => { if (i >= 0 && j >= 0) A[i][j] += v; };
  for (const p of prims) {
    const a = ni(p.positive); const b = ni(p.negative);
    if (p.kind === 'resistor') { const g = 1 / p.resistance; add(a, a, g); add(b, b, g); add(a, b, -g); add(b, a, -g); }
    else if (p.kind === 'current') { if (a >= 0) z[a] -= p.current; if (b >= 0) z[b] += p.current; }
    else if (p.kind === 'voltage') { const k = bIdx.get(p.id)!; add(a, k, 1); add(b, k, -1); add(k, a, 1); add(k, b, -1); z[k] += p.voltage; }
    else if (p.kind === 'vcvs') { const k = bIdx.get(p.id)!; add(a, k, 1); add(b, k, -1); add(k, a, 1); add(k, b, -1); add(k, ni(p.controlPositive), -p.gain); add(k, ni(p.controlNegative), p.gain); }
    else if (p.kind === 'vccs') { const cp = ni(p.controlPositive); const cn = ni(p.controlNegative); const g = p.gain ?? p.transconductance ?? 0; add(a, cp, g); add(a, cn, -g); add(b, cp, -g); add(b, cn, g); }
    else return { A: [], z: [], nodes, ok: false };
  }
  return { A, z, nodes, ok: true };
}

export interface DcOracleResult { supported: boolean; singular: boolean; nodeV: Record<string, number>; cond: number; reason?: string }

/** Assembles and solves the MNA system of a linear DC primitive list. */
export function dcOracle(prims: Prim[]): DcOracleResult {
  const names = new Set<string>();
  for (const p of prims) {
    names.add(p.positive); names.add(p.negative);
    if ('controlPositive' in p && p.controlPositive) names.add(p.controlPositive);
    if ('controlNegative' in p && p.controlNegative) names.add(p.controlNegative);
  }
  const nodes = Array.from(names).filter(n => n !== '0').sort();
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const branchKinds = new Set(['voltage', 'vcvs']);
  const branches = prims.filter(p => branchKinds.has(p.kind));
  const bIdx = new Map(branches.map((p, i) => [p.id, nodes.length + i]));
  const N = nodes.length + branches.length;
  if (!names.has('0') && prims.length) return { supported: true, singular: true, nodeV: {}, cond: Infinity, reason: 'no ground reference' };
  const A = Array.from({ length: N }, () => Array<number>(N).fill(0));
  const z = Array<number>(N).fill(0);
  const ni = (n?: string) => (n === undefined || n === '0') ? -1 : idx.get(n) ?? -1;
  const add = (i: number, j: number, v: number) => { if (i >= 0 && j >= 0) A[i][j] += v; };
  const badValue = prims.find(p => (p.kind === 'resistor' && (!Number.isFinite(p.resistance) || p.resistance === 0)) || (p.kind === 'voltage' && !Number.isFinite(p.voltage)) || (p.kind === 'current' && !Number.isFinite(p.current)));
  if (badValue) return { supported: false, singular: false, nodeV: {}, cond: NaN, reason: `oracle refuses non-finite/zero-ohm value in ${badValue.id}` };
  for (const p of prims) {
    const a = ni(p.positive); const b = ni(p.negative);
    switch (p.kind) {
      case 'resistor': { const g = 1 / p.resistance; add(a, a, g); add(b, b, g); add(a, b, -g); add(b, a, -g); break; }
      case 'current': if (a >= 0) z[a] -= p.current; if (b >= 0) z[b] += p.current; break;
      case 'voltage': { const k = bIdx.get(p.id)!; add(a, k, 1); add(b, k, -1); add(k, a, 1); add(k, b, -1); z[k] += p.voltage; break; }
      case 'vcvs': { const k = bIdx.get(p.id)!; add(a, k, 1); add(b, k, -1); add(k, a, 1); add(k, b, -1); add(k, ni(p.controlPositive), -p.gain); add(k, ni(p.controlNegative), p.gain); break; }
      case 'vccs': { const cp = ni(p.controlPositive); const cn = ni(p.controlNegative); const g = p.gain ?? p.transconductance ?? 0; add(a, cp, g); add(a, cn, -g); add(b, cp, -g); add(b, cn, g); break; }
      case 'cccs': { const k = bIdx.get(p.controlBranchId ?? p.targetId ?? ''); if (k === undefined) return { supported: false, singular: false, nodeV: {}, cond: NaN, reason: 'cccs control is not a branch variable' }; add(a, k, p.gain); add(b, k, -p.gain); break; }
      default: return { supported: false, singular: false, nodeV: {}, cond: NaN, reason: `oracle does not stamp ${p.kind}` };
    }
  }
  if (!N) return { supported: true, singular: false, nodeV: { '0': 0 }, cond: 1 };
  const sol = denseSolve(A, z);
  if (sol.singular) return { supported: true, singular: true, nodeV: {}, cond: Infinity, reason: 'reference matrix is singular' };
  const nodeV: Record<string, number> = { '0': 0 };
  nodes.forEach((n, i) => { nodeV[n] = sol.x[i]; });
  // Also publish branch currents of voltage-like primitives under `#id`.
  branches.forEach(p => { nodeV[`#${p.id}`] = sol.x[bIdx.get(p.id)!]; });
  return { supported: true, singular: false, nodeV, cond: sol.cond };
}

/** True when every node is DC-connected to ground through conductive primitives (R, V, E outputs, switches, nonlinear). */
export function groundConnectivity(prims: Prim[], conductive: (p: Prim) => boolean = () => true) {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  const all = new Set<string>();
  for (const p of prims) {
    all.add(p.positive); all.add(p.negative);
    if (conductive(p)) link(p.positive, p.negative);
  }
  const seen = new Set<string>(['0']);
  const queue = ['0'];
  while (queue.length) { const n = queue.pop()!; for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); queue.push(m); } }
  return { floating: Array.from(all).filter(n => !seen.has(n)), hasGround: all.has('0') };
}

// ─── Phasor (sinusoidal steady-state) oracle ───────────────────────────────────────────────────────

export type AcElem =
  | { t: 'R'; a: string; b: string; v: number }
  | { t: 'C'; a: string; b: string; v: number }
  | { t: 'L'; a: string; b: string; v: number; rs?: number }
  | { t: 'V'; id: string; a: string; b: string; re: number; im: number };

/** Solves the complex MNA system at angular frequency ω; returns node phasors as [re, im]. */
export function phasorOracle(elems: AcElem[], omega: number): { nodeV: Record<string, [number, number]>; singular: boolean } {
  const names = new Set<string>();
  elems.forEach(e => { names.add(e.a); names.add(e.b); });
  const nodes = Array.from(names).filter(n => n !== '0').sort();
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const vs = elems.filter((e): e is Extract<AcElem, { t: 'V' }> => e.t === 'V');
  const n = nodes.length + vs.length;
  // complex matrix as two real matrices
  const Ar = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const Ai = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const zr = Array<number>(n).fill(0); const zi = Array<number>(n).fill(0);
  const ni = (x: string) => x === '0' ? -1 : idx.get(x)!;
  const addY = (p: number, q: number, gr: number, gi: number) => {
    if (p >= 0) { Ar[p][p] += gr; Ai[p][p] += gi; }
    if (q >= 0) { Ar[q][q] += gr; Ai[q][q] += gi; }
    if (p >= 0 && q >= 0) { Ar[p][q] -= gr; Ai[p][q] -= gi; Ar[q][p] -= gr; Ai[q][p] -= gi; }
  };
  for (const e of elems) {
    const p = ni(e.a); const q = ni(e.b);
    if (e.t === 'R') addY(p, q, 1 / e.v, 0);
    else if (e.t === 'C') addY(p, q, 0, omega * e.v);
    else if (e.t === 'L') { const zr_ = e.rs ?? 0; const zi_ = omega * e.v; const d = zr_ * zr_ + zi_ * zi_; addY(p, q, zr_ / d, -zi_ / d); }
  }
  vs.forEach((e, k) => {
    const col = nodes.length + k; const p = ni(e.a); const q = ni(e.b);
    if (p >= 0) { Ar[p][col] += 1; Ar[col][p] += 1; }
    if (q >= 0) { Ar[q][col] -= 1; Ar[col][q] -= 1; }
    zr[col] = e.re; zi[col] = e.im;
  });
  const big = Array.from({ length: 2 * n }, (_, i) => Array<number>(2 * n).fill(0));
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    big[i][j] = Ar[i][j]; big[i][j + n] = -Ai[i][j]; big[i + n][j] = Ai[i][j]; big[i + n][j + n] = Ar[i][j];
  }
  const sol = denseSolve(big, [...zr, ...zi], false);
  const out: Record<string, [number, number]> = { '0': [0, 0] };
  if (!sol.singular) nodes.forEach((name, i) => { out[name] = [sol.x[i], sol.x[i + n]]; });
  return { nodeV: out, singular: sol.singular };
}

// ─── Newton polish for nonlinear operating points ─────────────────────────────────────────────────

export interface RefineResult { supported: boolean; converged: boolean; nodeV: Record<string, number>; distance: number; residual: number; iterations: number; reason?: string }

export function refineRoot(prims: Prim[], startV: Record<string, number>): RefineResult {
  const names = new Set<string>();
  for (const p of prims) {
    names.add(p.positive); names.add(p.negative);
    if ('controlPositive' in p && p.controlPositive) names.add(p.controlPositive);
    if ('controlNegative' in p && p.controlNegative) names.add(p.controlNegative);
    if (p.kind === 'nl') p.controls.forEach(c => names.add(c));
  }
  const nodes = Array.from(names).filter(n => n !== '0').sort();
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const branches = prims.filter(p => p.kind === 'voltage' || p.kind === 'vcvs');
  const bIdx = new Map(branches.map((p, i) => [p.id, nodes.length + i]));
  const N = nodes.length + branches.length;
  const unsupported = prims.find(p => !['resistor', 'current', 'voltage', 'vccs', 'vcvs', 'nl', 'resistive-switch'].includes(p.kind));
  if (unsupported) return { supported: false, converged: false, nodeV: {}, distance: NaN, residual: NaN, iterations: 0, reason: `refine does not stamp ${unsupported.kind}` };
  const ni = (n?: string) => (n === undefined || n === '0') ? -1 : idx.get(n) ?? -1;
  const x0 = Array<number>(N).fill(0);
  nodes.forEach((n, i) => { x0[i] = startV[n] ?? 0; });
  // initial branch currents: solve linear least-squares is overkill; start at 0 and let Newton settle them.
  const volt = (x: number[], n: string) => { const i = ni(n); return i < 0 ? 0 : x[i]; };
  const nodeMap = (x: number[]) => { const m: Record<string, number> = { '0': 0 }; nodes.forEach((n, i) => { m[n] = x[i]; }); return m; };
  const residualAndJacobian = (x: number[], wantJ: boolean) => {
    const F = Array<number>(N).fill(0);
    const J: number[][] = wantJ ? Array.from({ length: N }, () => Array<number>(N).fill(0)) : [];
    const addF = (i: number, v: number) => { if (i >= 0) F[i] += v; };
    const addJ = (i: number, j: number, v: number) => { if (wantJ && i >= 0 && j >= 0) J[i][j] += v; };
    const nm = nodeMap(x);
    for (const p of prims) {
      const a = ni(p.positive); const b = ni(p.negative);
      switch (p.kind) {
        case 'resistor': case 'resistive-switch': {
          const r = p.kind === 'resistor' ? p.resistance : (p.closed ? 1e-15 : 1e15);
          const g = 1 / r; const i = g * (volt(x, p.positive) - volt(x, p.negative));
          addF(a, i); addF(b, -i); addJ(a, a, g); addJ(b, b, g); addJ(a, b, -g); addJ(b, a, -g); break;
        }
        case 'current': addF(a, p.current); addF(b, -p.current); break;
        case 'voltage': { const k = bIdx.get(p.id)!; addF(a, x[k]); addF(b, -x[k]); addJ(a, k, 1); addJ(b, k, -1); F[k] += volt(x, p.positive) - volt(x, p.negative) - p.voltage; addJ(k, a, 1); addJ(k, b, -1); break; }
        case 'vcvs': { const k = bIdx.get(p.id)!; const cp = ni(p.controlPositive); const cn = ni(p.controlNegative); addF(a, x[k]); addF(b, -x[k]); addJ(a, k, 1); addJ(b, k, -1); F[k] += volt(x, p.positive) - volt(x, p.negative) - p.gain * (volt(x, p.controlPositive) - volt(x, p.controlNegative)); addJ(k, a, 1); addJ(k, b, -1); addJ(k, cp, -p.gain); addJ(k, cn, p.gain); break; }
        case 'vccs': { const g = p.gain ?? p.transconductance ?? 0; const i = g * (volt(x, p.controlPositive) - volt(x, p.controlNegative)); addF(a, i); addF(b, -i); addJ(a, ni(p.controlPositive), g); addJ(a, ni(p.controlNegative), -g); addJ(b, ni(p.controlPositive), -g); addJ(b, ni(p.controlNegative), g); break; }
        case 'nl': {
          const i0 = p.current(nm); addF(a, i0); addF(b, -i0);
          if (wantJ) for (const c of p.controls) {
            if (c === '0') continue;
            const h = 1e-7 * Math.max(1, Math.abs(nm[c] ?? 0));
            const up = { ...nm, [c]: (nm[c] ?? 0) + h }; const dn = { ...nm, [c]: (nm[c] ?? 0) - h };
            const d = (p.current(up) - p.current(dn)) / (2 * h);
            const col = ni(c); addJ(a, col, d); addJ(b, col, -d);
          }
          break;
        }
        default: break;
      }
    }
    return { F, J };
  };
  // seed branch currents with one linear solve of KCL rows at the start point (keeps Newton in a sane basin)
  let x = x0.slice();
  const inf = (v: number[]) => v.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  let iterations = 0;
  let lastRes = Infinity;
  for (; iterations < 60; iterations += 1) {
    const { F, J } = residualAndJacobian(x, true);
    lastRes = inf(F);
    if (lastRes < 1e-13) break;
    const sol = denseSolve(J, F.map(v => -v), false);
    if (sol.singular || sol.x.some(v => !Number.isFinite(v))) return { supported: true, converged: false, nodeV: {}, distance: NaN, residual: lastRes, iterations, reason: 'Jacobian singular at refinement' };
    let step = 1;
    const base = lastRes;
    for (let bt = 0; bt < 30; bt += 1) {
      const trial = x.map((v, i) => v + step * sol.x[i]);
      if (inf(residualAndJacobian(trial, false).F) < base * (1 - 1e-4 * step) || bt === 29) { x = trial; break; }
      step *= 0.5;
    }
  }
  lastRes = inf(residualAndJacobian(x, false).F);
  const nodeV = nodeMap(x);
  let distance = 0;
  for (const n of nodes) distance = Math.max(distance, Math.abs(nodeV[n] - (startV[n] ?? 0)));
  return { supported: true, converged: lastRes < 1e-9, nodeV, distance, residual: lastRes, iterations };
}

/**
 * Source-stepping homotopy: scales every independent source from 0 to 1 and polishes each stage with `refineRoot`.
 * Used as an existence proof when the engine's own Newton loop reports non-convergence.
 */
export function continuationSolve(prims: Prim[], stages = 25): { converged: boolean; nodeV: Record<string, number>; stage: number; residual: number } {
  let v: Record<string, number> = { '0': 0 };
  let residual = 0;
  for (let k = 1; k <= stages; k += 1) {
    const lambda = k / stages;
    const scaled = prims.map((p): Prim => p.kind === 'voltage' ? { ...p, voltage: p.voltage * lambda } : p.kind === 'current' ? { ...p, current: p.current * lambda } : p);
    const r = refineRoot(scaled, v);
    residual = r.residual;
    if (!r.supported) return { converged: false, nodeV: {}, stage: k, residual: NaN };
    if (!r.converged) {
      // retry the stage from a tighter sub-step before giving up
      let ok = false; let sub: Record<string, number> = v;
      for (let j = 1; j <= 8; j += 1) {
        const l2 = (k - 1 + j / 8) / stages;
        const s2 = prims.map((p): Prim => p.kind === 'voltage' ? { ...p, voltage: p.voltage * l2 } : p.kind === 'current' ? { ...p, current: p.current * l2 } : p);
        const r2 = refineRoot(s2, sub); if (!r2.converged) { ok = false; break; } sub = r2.nodeV; ok = true;
      }
      if (!ok) return { converged: false, nodeV: v, stage: k, residual };
      v = sub;
    } else v = r.nodeV;
  }
  return { converged: true, nodeV: v, stage: stages, residual };
}
