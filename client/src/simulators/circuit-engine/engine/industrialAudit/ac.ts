/**
 * Sinusoidal steady-state helpers: phasor reference (oracle) vs. the backward-Euler transient of the engine.
 * Backward Euler is first-order accurate, so these checks use a *documented* amplitude tolerance
 * (fraction of the source amplitude) rather than a bitwise comparison.
 */
import type { Elem } from '@/simulators/circuit-engine/engine/industrialAudit/ir';
import { phasorOracle, type AcElem } from '@/simulators/circuit-engine/engine/industrialAudit/oracle';
import type { PhysicsCheck } from '@/simulators/circuit-engine/engine/industrialAudit/harness';
import type { TranTrace } from '@/simulators/circuit-engine/engine/industrialAudit/backends';

export function elemsToAc(els: Elem[], omega: number): AcElem[] {
  return els.flatMap((e): AcElem[] => {
    switch (e.t) {
      case 'R': return [{ t: 'R', a: e.a, b: e.b, v: e.v }];
      case 'C': return [{ t: 'C', a: e.a, b: e.b, v: e.v }];
      case 'L': return [{ t: 'L', a: e.a, b: e.b, v: e.v, rs: e.rs }];
      case 'S': { const ph = (e.phase ?? 0) - Math.PI / 2; return [{ t: 'V', id: e.id, a: e.a, b: e.b, re: e.amp * Math.cos(ph), im: e.amp * Math.sin(ph) }]; }
      case 'V': return [{ t: 'V', id: e.id, a: e.a, b: e.b, re: 0, im: 0 }]; // DC source is an AC short
      default: throw new Error(`elemsToAc: unsupported ${e.t}`);
    }
  });
}

/** Complex amplitude (Re, Im) of v(t)=Re(V e^{jωt}) fitted over the last `cycles` whole cycles. */
export function measurePhasor(t: number[], v: number[], f: number, cycles: number, stepsPerCycle: number): [number, number] {
  const n = Math.min(t.length, cycles * stepsPerCycle);
  let a = 0; let b = 0;
  for (let i = t.length - n; i < t.length; i += 1) { const w = 2 * Math.PI * f * t[i]; a += v[i] * Math.sin(w); b += v[i] * Math.cos(w); }
  a *= 2 / n; b *= 2 / n;
  return [b, -a];
}

/** One check per requested node (or node difference `x-y`) against the phasor reference. */
export function phasorChecks(trace: TranTrace | undefined, els: Elem[], f: number, nodes: string[], tolAmp: number, stepsPerCycle: number, refAmp: number, label = 'phasor'): PhysicsCheck[] {
  if (!trace) return [];
  const omega = 2 * Math.PI * f;
  const ref = phasorOracle(elemsToAc(els, omega), omega);
  return nodes.map(spec => {
    const [x, y] = spec.split('~');
    const sample = (name: string) => trace.v[name];
    const series = y ? sample(x).map((val, i) => val - sample(y)[i]) : sample(x);
    const meas = measurePhasor(trace.t, series, f, 4, stepsPerCycle);
    const rx = ref.nodeV[x] ?? [NaN, NaN]; const ry = y ? (ref.nodeV[y] ?? [NaN, NaN]) : [0, 0];
    const expected: [number, number] = [rx[0] - ry[0], rx[1] - ry[1]];
    const err = Math.hypot(meas[0] - expected[0], meas[1] - expected[1]);
    return { name: `${label} V(${spec}) vs steady-state phasor (|meas|=${Math.hypot(...meas).toExponential(3)}, |ref|=${Math.hypot(...expected).toExponential(3)})`, got: err, expected: 0, tol: tolAmp * refAmp, pass: Number.isFinite(err) && err <= tolAmp * refAmp, note: `backward-Euler tolerance ${(tolAmp * 100).toFixed(1)} % of source amplitude` };
  });
}
