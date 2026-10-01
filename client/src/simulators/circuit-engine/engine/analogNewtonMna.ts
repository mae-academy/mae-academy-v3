import { TabDDocumentedMna, TabDMnaError, type TabDOperatingPoint, type TabDPrimitive } from '@/simulators/circuit-engine/engine/analogDocumentedMna';

/** A p-n junction control voltage V(positive) − V(negative) whose per-iteration update must be limited. */
export interface TabDJunction {
  positive: string;
  negative: string;
  /** Reverse breakdown voltage (magnitude) for Zener-type junctions. */
  breakdownVoltage?: number;
  /** Saturation current used for the critical voltage (default 1e-12 A). */
  saturationCurrent?: number;
  /** Thermal voltage × emission coefficient (default 25.85 mV). */
  thermalVoltage?: number;
  /**
   * How the initial vector seeds this junction: `forward` starts it at ≈0.65 V (an unbiased exponential has a
   * conductance of Is/Vt ≈ 10⁻¹⁴ S, so a zero start drives the first iterate to ~10⁸ V), `flat` starts it at 0 V.
   */
  seed?: 'forward' | 'flat';
}

export interface TabDNonlinearDevice {
  id: string;
  positive: string;
  negative: string;
  /** Current flowing from positive to negative for the supplied node-voltage map. */
  current: (nodeVoltages: Record<string, number>) => number;
  /** Nodes on which the device current depends; omitted nodes are treated as zero. */
  controls: string[];
  breakdownVoltage?: number;
  /**
   * p-n junctions inside the device. Omitted: a device whose controls are exactly its own two terminals is one
   * forward-seeded junction (diode); any other device is junction-free (MOSFET, JFET, op-amp output stage).
   */
  junctions?: TabDJunction[];
}

export interface TabDNewtonOptions {
  /** Iteration budget of the plain Newton attempt (default 20). Continuation stages get their own budget. */
  maxIterations?: number;
  voltageTolerance?: number;
  currentTolerance?: number;
  reltol?: number;
  vntol?: number;
  abstol?: number;
  damping?: number;
  initialGuess?: Record<string, number>;
  /** Commit capacitor/inductor history and advance the clock with the accepted solve (default true). */
  commit?: boolean;
}

const MAX_CONDUCTANCE = 1e12;
const MAX_CURRENT = 1e9;
const DEFAULT_RELTOL = 1e-3;
const DEFAULT_VNTOL = 1e-6;
const DEFAULT_ABSTOL = 1e-9;
const DEFAULT_THERMAL_VOLTAGE = 0.02585;
/** Forward junction voltage used to seed the initial vector. */
export const JUNCTION_SEED_VOLTAGE = 0.65;
/** A junction control voltage never rises by more than this in one iteration. */
const MAX_JUNCTION_STEP = 2;
/**
 * Leakage conductance of a p-n junction model (SPICE `gmin`, 10⁻¹² S). Device models stamp it across each junction so a node that
 * reaches the rails only through off junctions keeps a well-defined voltage instead of an exponentially flat, unconvergeable one.
 */
export const JUNCTION_GMIN = 1e-12;
const PLAIN_ITERATIONS = 20;
const STAGE_ITERATIONS = 40;
const GMIN_SCHEDULE = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12];
const MIN_SOURCE_STEP = 1 / 1024;
/** Relative / absolute (A) agreement of the tangent model with the true device current that counts as an exact root. */
const EXACT_RELTOL = 1e-9;
const EXACT_ABSTOL = 1e-12;

function clamp(value: number, lower: number, upper: number) {
  return Math.max(lower, Math.min(upper, value));
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/** Bounded Shockley branch current with standard thermal-voltage normalization. */
export function shockleyCurrent(voltage: number, saturationCurrent: number, thermalVoltage = 0.02585, emissionCoefficient = 1) {
  const vt = Math.max(1e-6, thermalVoltage * emissionCoefficient);
  const exponent = voltage / vt;
  if (exponent > 40) {
    const base = Math.max(0, saturationCurrent) * Math.exp(40);
    return clamp(base + (base / vt) * (voltage - 40 * vt), -MAX_CURRENT, MAX_CURRENT);
  }
  const clampedExp = Math.max(-40, exponent);
  return clamp(Math.max(0, saturationCurrent) * (Math.exp(clampedExp) - 1), -MAX_CURRENT, MAX_CURRENT);
}

/**
 * SPICE-standard p-n junction voltage limiting algorithm (pnjlim).
 * Restricts exponential step jumps across non-linear device terminals in both
 * forward conduction and reverse breakdown.
 */
export function pnjlim(vnew: number, vold: number, vt = 0.02585, vcrit?: number, vbreakdown?: number): number {
  const critical = vcrit ?? (vt * Math.log(Math.max(1, vt / (Math.SQRT2 * 1e-12))));
  if (vnew > critical && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      if (arg > 0) return vold + vt * Math.log(arg);
      return critical;
    }
    return vnew > 0 ? vt * Math.log(Math.max(1e-12, vnew / vt)) : critical;
  }
  if (vbreakdown !== undefined && vbreakdown > 0) {
    const vrevNew = -vnew;
    const vrevOld = -vold;
    const revCrit = vbreakdown + vt * Math.log(Math.max(1, vt / (Math.SQRT2 * 1e-6)));
    if (vrevNew > revCrit && Math.abs(vrevNew - vrevOld) > 2 * vt) {
      if (vrevOld > vbreakdown) {
        const arg = 1 + (vrevNew - vrevOld) / vt;
        if (arg > 0) return -(vrevOld + vt * Math.log(arg));
        return -revCrit;
      }
      return -(vbreakdown + (vrevNew > vbreakdown ? vt * Math.log(Math.max(1e-12, (vrevNew - vbreakdown) / vt)) : 0));
    }
  }
  return vnew;
}

interface JunctionState {
  key: string;
  positive: string;
  negative: string;
  vt: number;
  vcrit: number;
  breakdown?: number;
  seed: 'forward' | 'flat';
}

interface Linearization {
  stamps: TabDPrimitive[];
  /** Companion-model prediction of the device current at `at`, used for the current-convergence test. */
  predict: (at: Record<string, number>) => number;
}

interface AttemptResult {
  guess: Record<string, number>;
  iterations: number;
  /** The accepted linear solve and the primitive set (with companion stamps) it solved. */
  latest: TabDOperatingPoint;
  tangent: TabDPrimitive[];
}

class NewtonStageFailure extends Error {
  constructor(readonly reason: 'iterations' | 'singular' | 'non-finite', readonly detail?: TabDMnaError) {
    super(reason);
  }
}

/**
 * Damped Newton-Raphson loop with SPICE-style convergence aids. Each nonlinear branch is locally linearized as
 * I(V) = G_eq·V + I_eq and stamped as a VCCS plus independent current source.
 *
 *  1. The initial vector seeds every p-n junction near its forward voltage instead of 0 V.
 *  2. Every junction control voltage is limited (pnjlim + a ±2 V step cap) on the device's own linearization point,
 *     never by moving source-pinned nodes.
 *  3. If plain Newton fails inside its budget, gmin stepping and then source stepping (10 % → 100 %) are tried.
 */
export class TabDNewtonMna {
  private readonly linear = new TabDDocumentedMna();

  reset() { this.linear.reset(); }
  /** Drops reactive history of components that no longer exist; everything else keeps its stored state. */
  retainState(componentIds: Set<string>) { this.linear.retainState(componentIds); }
  /** Commits the reactive history of a result obtained with `commit: false` and advances the clock. */
  commit(point: TabDOperatingPoint, elapsedSeconds: number): TabDOperatingPoint { return this.linear.commitHistory(point.tangent ?? [], point, elapsedSeconds); }
  /** Linear solve of an arbitrary primitive set against the current reactive history, without committing it. */
  solveTangent(primitives: TabDPrimitive[], elapsedSeconds: number): TabDOperatingPoint { return this.linear.solve(primitives, elapsedSeconds, false); }
  getTime() { return this.linear.getTime(); }

  solve(primitives: TabDPrimitive[], nonlinearDevices: TabDNonlinearDevice[], elapsedSeconds = 1e-3, options: TabDNewtonOptions = {}): TabDOperatingPoint {
    if (!nonlinearDevices.length) return this.linear.solve(primitives, elapsedSeconds, options.commit ?? true);
    const plainIterations = Math.max(1, Math.floor(options.maxIterations ?? PLAIN_ITERATIONS));
    const tolerances = {
      reltol: options.reltol ?? DEFAULT_RELTOL,
      vntol: options.vntol ?? options.voltageTolerance ?? DEFAULT_VNTOL,
      abstol: options.abstol ?? options.currentTolerance ?? DEFAULT_ABSTOL,
      damping: clamp(options.damping ?? 1, 0.05, 1),
    };
    const junctions = this.collectJunctions(nonlinearDevices);
    const seeded = this.seedVector(junctions, options.initialGuess ? { ...options.initialGuess, '0': 0 } : { '0': 0 }, !options.initialGuess);
    const nodeNames = this.collectNodes(primitives, nonlinearDevices);
    const failures: NewtonStageFailure[] = [];
    let totalIterations = 0;

    const attempt = (start: Record<string, number>, sourceScale: number, gmin: number, budget: number): AttemptResult | null => {
      try {
        const result = this.iterate(primitives, nonlinearDevices, junctions, nodeNames, elapsedSeconds, start, sourceScale, gmin, budget, tolerances);
        totalIterations += result.iterations;
        return result;
      } catch (error) {
        if (error instanceof NewtonStageFailure) { failures.push(error); totalIterations += budget; return null; }
        throw error;
      }
    };
    const commit = (stage: AttemptResult): TabDOperatingPoint => {
      const point: TabDOperatingPoint = { ...stage.latest, tangent: stage.tangent };
      return options.commit === false ? point : this.linear.commitHistory(stage.tangent, point, elapsedSeconds);
    };

    // Stage 1: plain Newton from the supplied previous solution (or the junction-seeded vector).
    let plain = attempt(seeded, 1, 0, plainIterations);
    if (plain) return commit(plain);
    // A stale warm start (e.g. right after a switch toggle) can be the problem: retry from the physical seed.
    if (options.initialGuess) {
      const fresh = this.seedVector(junctions, { '0': 0 }, true);
      plain = attempt(fresh, 1, 0, plainIterations);
      if (plain) return commit(plain);
    }
    const start = this.seedVector(junctions, { '0': 0 }, true);

    // Stage 2: gmin stepping — a large shunt conductance on every node makes the first problem nearly linear; relax it by decades.
    let walking: Record<string, number> | null = start;
    for (const gmin of GMIN_SCHEDULE) {
      const stage = attempt(walking, 1, gmin, STAGE_ITERATIONS);
      if (!stage) { walking = null; break; }
      walking = stage.guess;
    }
    if (walking) {
      const done = attempt(walking, 1, 0, STAGE_ITERATIONS);
      if (done) return commit(done);
    }

    // Stage 3: source stepping — ramp every independent source from 10 % to 100 % with adaptive step halving.
    let lambda = 0;
    let step = 0.1;
    let guess = start;
    let finalStage: AttemptResult | null = null;
    let rounds = 0;
    while (lambda < 1 && rounds < 200) {
      rounds += 1;
      const target = Math.min(1, lambda + step);
      const stage = attempt(guess, target, 0, STAGE_ITERATIONS);
      if (stage) {
        guess = stage.guess;
        finalStage = stage;
        lambda = target;
        step = Math.min(0.25, step * 1.5);
      } else {
        step /= 2;
        if (step < MIN_SOURCE_STEP) break;
      }
    }
    if (lambda >= 1 && finalStage) return commit(finalStage);

    const singular = failures.filter(failure => failure.reason === 'singular');
    if (singular.length === failures.length && singular[0]?.detail) throw singular[0].detail;
    throw new TabDMnaError(`Newton-Raphson did not converge after ${totalIterations} iterations (plain Newton, gmin stepping and source stepping exhausted). Review nonlinear device biasing and ideal constraints.`);
  }

  /** One Newton run at fixed source scale and gmin; throws NewtonStageFailure when it does not converge inside `budget`. */
  private iterate(
    primitives: TabDPrimitive[],
    devices: TabDNonlinearDevice[],
    junctions: JunctionState[],
    nodeNames: string[],
    elapsedSeconds: number,
    start: Record<string, number>,
    sourceScale: number,
    gmin: number,
    budget: number,
    tolerances: { reltol: number; vntol: number; abstol: number; damping: number },
  ): AttemptResult {
    const scaled = sourceScale === 1 ? primitives : primitives.map(primitive => {
      if (primitive.kind === 'voltage') return { ...primitive, voltage: primitive.voltage * sourceScale };
      if (primitive.kind === 'current') return { ...primitive, current: primitive.current * sourceScale };
      return primitive;
    });
    const shunts: TabDPrimitive[] = gmin > 0
      ? nodeNames.map(node => ({ kind: 'resistor' as const, id: `__gmin:${node}`, positive: node, negative: '0', resistance: 1 / gmin }))
      : [];
    const junctionVoltage = (map: Record<string, number>, junction: JunctionState) => (map[junction.positive] ?? 0) - (map[junction.negative] ?? 0);
    let guess: Record<string, number> = { ...start, '0': 0 };
    let limited = new Map(junctions.map(junction => [junction.key, junctionVoltage(guess, junction)]));
    let polishing = false;

    for (let iteration = 0; iteration < budget; iteration += 1) {
      // Linearize every device at the current point with its junction voltages as limited last iteration.
      const linearizations = devices.map(device => this.linearize(device, this.evaluationPoint(device, guess, junctions, limited)));
      let latest: TabDOperatingPoint;
      const tangent = [...scaled, ...shunts, ...linearizations.flatMap(item => item.stamps)];
      try {
        latest = this.linear.solve(tangent, elapsedSeconds, false);
      } catch (error) {
        if (error instanceof TabDMnaError) throw new NewtonStageFailure('singular', error);
        throw error;
      }
      const solution = latest.nodeVoltages;
      for (const value of Object.values(solution)) if (!Number.isFinite(value)) throw new NewtonStageFailure('non-finite');

      // Exact root: the tangent model reproduces every true device current at the solution, so the solve already satisfies the
      // nonlinear KCL equations whatever the step size (linear-region op-amp stages, linear devices, an exactly resolved diode).
      let exactRoot = true;
      for (let index = 0; index < devices.length; index += 1) {
        const actual = devices[index].current(solution);
        const predicted = linearizations[index].predict(solution);
        if (Math.abs(actual - predicted) > EXACT_RELTOL * Math.max(Math.abs(actual), Math.abs(predicted)) + EXACT_ABSTOL) { exactRoot = false; break; }
      }
      if (exactRoot) return { guess: { ...solution, '0': 0 }, iterations: iteration + 1, latest, tangent };

      // Voltage-step and predicted-vs-actual device-current convergence tests.
      let converged = true;
      for (const [node, value] of Object.entries(solution)) {
        const prior = guess[node] ?? 0;
        if (Math.abs(value - prior) > tolerances.reltol * Math.max(Math.abs(value), Math.abs(prior)) + tolerances.vntol) { converged = false; break; }
      }
      if (converged) {
        for (let index = 0; index < devices.length; index += 1) {
          const actual = devices[index].current(solution);
          const predicted = linearizations[index].predict(solution);
          if (Math.abs(actual - predicted) > tolerances.reltol * Math.max(Math.abs(actual), Math.abs(predicted)) + tolerances.abstol) { converged = false; break; }
        }
      }

      // Limit each junction's control-voltage update (SPICE pnjlim) for the next linearization point.
      let wasLimited = false;
      const nextLimited = new Map<string, number>();
      for (const junction of junctions) {
        const vNew = junctionVoltage(solution, junction);
        const vOld = limited.get(junction.key) ?? junctionVoltage(guess, junction);
        let vLim = pnjlim(vNew, vOld, junction.vt, junction.vcrit, junction.breakdown);
        // A forward-biased junction never rises by more than +2 V per iteration (pnjlim is stricter near the knee). Reverse
        // moves are flat in a Shockley junction, so a legitimately deep reverse bias is reached at once, and a junction
        // leaving reverse bias is compressed by pnjlim's logarithm rather than by a fixed step.
        if (vOld > 0 && vLim > vOld + MAX_JUNCTION_STEP) vLim = vOld + MAX_JUNCTION_STEP;
        if (Math.abs(vLim - vNew) > 1e-9 + 1e-9 * Math.abs(vNew)) wasLimited = true;
        nextLimited.set(junction.key, vLim);
      }

      if (converged && !wasLimited) {
        // One more unlimited iteration from the accepted point: quadratic convergence makes the residual of the
        // committed operating point negligible (the tolerance test alone only bounds the last step, not the KCL error).
        if (polishing) return { guess: { ...solution, '0': 0 }, iterations: iteration + 1, latest, tangent };
        polishing = true;
      } else {
        polishing = false;
      }

      const damped = tolerances.damping >= 1 ? solution : Object.fromEntries(Object.entries(solution).map(([node, value]) => [node, (guess[node] ?? 0) + tolerances.damping * (value - (guess[node] ?? 0))]));
      guess = { ...damped, '0': 0 };
      limited = nextLimited;
    }
    throw new NewtonStageFailure('iterations');
  }

  private collectNodes(primitives: TabDPrimitive[], devices: TabDNonlinearDevice[]): string[] {
    const names = new Set<string>();
    const add = (node?: string) => { if (node && node !== '0') names.add(node); };
    for (const primitive of primitives) {
      add(primitive.positive); add(primitive.negative);
      if ('controlPositive' in primitive) add(primitive.controlPositive);
      if ('controlNegative' in primitive) add(primitive.controlNegative);
    }
    for (const device of devices) { add(device.positive); add(device.negative); device.controls.forEach(add); }
    return Array.from(names);
  }

  private collectJunctions(devices: TabDNonlinearDevice[]): JunctionState[] {
    const byKey = new Map<string, JunctionState>();
    const register = (junction: TabDJunction, fallbackBreakdown?: number) => {
      const key = `${junction.positive}|${junction.negative}`;
      const existing = byKey.get(key);
      const vt = junction.thermalVoltage ?? DEFAULT_THERMAL_VOLTAGE;
      const saturation = junction.saturationCurrent ?? 1e-12;
      const breakdown = junction.breakdownVoltage ?? fallbackBreakdown;
      if (existing) {
        // Devices sharing a junction use the most conservative parameters so the limited voltage stays consistent.
        existing.vt = Math.max(existing.vt, vt);
        if (breakdown !== undefined) existing.breakdown = breakdown;
        if (junction.seed === 'forward') existing.seed = 'forward';
        return;
      }
      byKey.set(key, { key, positive: junction.positive, negative: junction.negative, vt, vcrit: vt * Math.log(vt / (Math.SQRT2 * saturation)), breakdown, seed: junction.seed ?? 'forward' });
    };
    for (const device of devices) {
      if (device.junctions) { device.junctions.forEach(junction => register(junction, device.breakdownVoltage)); continue; }
      const controls = new Set(device.controls);
      if (controls.size === 2 && controls.has(device.positive) && controls.has(device.negative)) register({ positive: device.positive, negative: device.negative }, device.breakdownVoltage);
    }
    return Array.from(byKey.values());
  }

  /** Initial vector: forward junctions at ≈0.65 V above their cathode/emitter, flat junctions at 0 V. */
  private seedVector(junctions: JunctionState[], base: Record<string, number>, apply: boolean): Record<string, number> {
    const vector: Record<string, number> = { ...base, '0': 0 };
    if (!apply) return vector;
    const seeded = new Set<string>();
    for (const pass of [0, 1, 2]) {
      for (const junction of junctions) {
        if (junction.seed !== 'forward') continue;
        const neg = junction.negative; const pos = junction.positive;
        if (pos === '0' || seeded.has(pos)) continue;
        if (neg === '0' || seeded.has(neg) || pass > 0) { vector[pos] = (vector[neg] ?? 0) + JUNCTION_SEED_VOLTAGE; seeded.add(pos); }
      }
    }
    for (const junction of junctions) {
      if (junction.seed !== 'flat') continue;
      if (junction.negative !== '0' && !seeded.has(junction.negative)) { vector[junction.negative] = vector[junction.positive] ?? 0; seeded.add(junction.negative); }
    }
    return vector;
  }

  /** Node map at which a device is linearized: the current iterate with its junction voltages replaced by the limited values. */
  private evaluationPoint(device: TabDNonlinearDevice, iterate: Record<string, number>, junctions: JunctionState[], limited?: Map<string, number>): Record<string, number> {
    if (!limited) return iterate;
    const relevant = junctions.filter(junction => this.deviceUsesJunction(device, junction));
    if (!relevant.length) return iterate;
    const point = { ...iterate };
    // Realise each limited junction voltage by moving one of its two nodes. A node already moved for another junction of the
    // same device (an NPN's base serves both B-E and B-C) is left alone and the opposite terminal moves instead, so earlier
    // limited voltages are not silently undone.
    const moved = new Set<string>();
    for (const junction of relevant) {
      const target = limited.get(junction.key);
      if (target === undefined) continue;
      const actual = (point[junction.positive] ?? 0) - (point[junction.negative] ?? 0);
      const shift = target - actual;
      if (shift === 0) continue;
      if (junction.positive !== '0' && !moved.has(junction.positive)) { point[junction.positive] = (point[junction.positive] ?? 0) + shift; moved.add(junction.positive); }
      else if (junction.negative !== '0' && !moved.has(junction.negative)) { point[junction.negative] = (point[junction.negative] ?? 0) - shift; moved.add(junction.negative); }
      else if (junction.positive !== '0') point[junction.positive] = (point[junction.positive] ?? 0) + shift;
      else point[junction.negative] = (point[junction.negative] ?? 0) - shift;
    }
    return point;
  }

  private deviceUsesJunction(device: TabDNonlinearDevice, junction: JunctionState): boolean {
    if (device.junctions) return device.junctions.some(item => item.positive === junction.positive && item.negative === junction.negative);
    return junction.positive === device.positive && junction.negative === device.negative;
  }

  private linearize(device: TabDNonlinearDevice, at: Record<string, number>): Linearization {
    const baseCurrent = clamp(finite(device.current(at)), -MAX_CURRENT, MAX_CURRENT);
    const controls = Array.from(new Set(device.controls));
    // Central differences: a one-sided step is biased in opposite directions for the two terminals of a junction, so the
    // estimated conductances stop cancelling and the equivalent current I_eq = I − Σ g·V picks up (Σ g)·V_common — thousands of
    // amperes once a node is a few hundred volts off mid-iteration.
    const raw: Array<{ node: string; conductance: number }> = [];
    for (const control of controls) {
      if (control === '0') continue;
      const prior = at[control] ?? 0;
      const delta = Math.max(1e-6, Math.abs(prior) * 1e-9);
      const up = clamp(finite(device.current({ ...at, [control]: prior + delta })), -MAX_CURRENT, MAX_CURRENT);
      const down = clamp(finite(device.current({ ...at, [control]: prior - delta })), -MAX_CURRENT, MAX_CURRENT);
      raw.push({ node: control, conductance: clamp((up - down) / (2 * delta), -MAX_CONDUCTANCE, MAX_CONDUCTANCE) });
    }
    // Every device here depends on voltage differences only, so its conductances sum to zero (ground's, never stamped, included).
    // With ground among the controls its implicit term absorbs any residual; otherwise enforce the sum on the dominant term, which
    // makes I_eq independent of any common-mode offset of the iterate.
    if (raw.length > 1 && !controls.includes('0')) {
      const residual = raw.reduce((sum, item) => sum + item.conductance, 0);
      const dominant = raw.reduce((best, item) => Math.abs(item.conductance) > Math.abs(best.conductance) ? item : best, raw[0]);
      dominant.conductance -= residual;
    }
    const partials = raw.filter(item => Math.abs(item.conductance) > 1e-18);
    const equivalentCurrent = baseCurrent - partials.reduce((sum, partial) => sum + partial.conductance * (at[partial.node] ?? 0), 0);
    return {
      stamps: [
        ...partials.map(partial => ({
          kind: 'vccs' as const,
          id: `${device.id}:nr:${partial.node}`,
          positive: device.positive,
          negative: device.negative,
          controlPositive: partial.node,
          controlNegative: '0',
          transconductance: partial.conductance,
        })),
        { kind: 'current' as const, id: `${device.id}:nr:ieq`, positive: device.positive, negative: device.negative, current: equivalentCurrent },
      ],
      predict: (solution) => equivalentCurrent + partials.reduce((sum, partial) => sum + partial.conductance * (solution[partial.node] ?? 0), 0),
    };
  }
}
