import { TabDDocumentedMna, TabDMnaError, type TabDOperatingPoint, type TabDPrimitive } from './tabDDocumentedMna';

export interface TabDNonlinearDevice {
  id: string;
  positive: string;
  negative: string;
  /** Current flowing from positive to negative for the supplied node-voltage map. */
  current: (nodeVoltages: Record<string, number>) => number;
  /** Nodes on which the device current depends; omitted nodes are treated as zero. */
  controls: string[];
}

export interface TabDNewtonOptions {
  maxIterations?: number;
  voltageTolerance?: number;
  currentTolerance?: number;
  reltol?: number;
  vntol?: number;
  abstol?: number;
  damping?: number;
  initialGuess?: Record<string, number>;
}

const MAX_CONDUCTANCE = 1e12;
const MAX_CURRENT = 1e9;
const DEFAULT_RELTOL = 1e-3;
const DEFAULT_VNTOL = 1e-6;
const DEFAULT_ABSTOL = 1e-9;

function clamp(value: number, lower: number, upper: number) {
  return Math.max(lower, Math.min(upper, value));
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/** Bounded Shockley branch current with standard thermal-voltage normalization. */
export function shockleyCurrent(voltage: number, saturationCurrent: number, thermalVoltage = 0.02585, emissionCoefficient = 1) {
  const exponent = clamp(voltage / Math.max(1e-6, thermalVoltage * emissionCoefficient), -40, 40);
  return clamp(Math.max(0, saturationCurrent) * (Math.exp(exponent) - 1), -MAX_CURRENT, MAX_CURRENT);
}

/**
 * SPICE-standard p-n junction voltage limiting algorithm (pnjlim).
 * Restricts exponential step jumps exclusively across non-linear device terminals
 * (V_junction = V_pos - V_neg) while allowing linear nodes to update unhindered.
 */
export function pnjlim(vnew: number, vold: number, vt = 0.02585, vcrit?: number): number {
  const critical = vcrit ?? (vt * Math.log(Math.max(1, vt / (Math.SQRT2 * 1e-12))));
  if (vnew > critical && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      if (arg > 0) return vold + vt * Math.log(arg);
      return critical;
    }
    return vnew > 0 ? vt * Math.log(Math.max(1e-12, vnew / vt)) : critical;
  }
  return vnew;
}

/**
 * Damped Newton-Raphson loop. Each nonlinear branch is locally linearized as
 * I(V) = G_eq·V + I_eq and stamped as a VCCS plus independent current source.
 */
export class TabDNewtonMna {
  private readonly linear = new TabDDocumentedMna();

  reset() { this.linear.reset(); }
  getTime() { return this.linear.getTime(); }

  solve(primitives: TabDPrimitive[], nonlinearDevices: TabDNonlinearDevice[], elapsedSeconds = 1e-3, options: TabDNewtonOptions = {}): TabDOperatingPoint {
    if (!nonlinearDevices.length) return this.linear.solve(primitives, elapsedSeconds);
    const maxIterations = Math.max(1, Math.floor(options.maxIterations ?? 50));
    const reltol = options.reltol ?? DEFAULT_RELTOL;
    const vntol = options.vntol ?? options.voltageTolerance ?? DEFAULT_VNTOL;
    const abstol = options.abstol ?? options.currentTolerance ?? DEFAULT_ABSTOL;
    const damping = clamp(options.damping ?? 1, 0.05, 1);
    let guess: Record<string, number> = options.initialGuess ? { ...options.initialGuess, '0': 0 } : { '0': 0 };
    let latest: TabDOperatingPoint | null = null;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const companions = nonlinearDevices.flatMap(device => this.companionStamps(device, guess));
      latest = this.linear.solve([...primitives, ...companions], elapsedSeconds, false);

      // Dual Voltage & Current Convergence Verification
      let maxVoltageRatio = 0;
      for (const [node, value] of Object.entries(latest.nodeVoltages)) {
        const prior = guess[node] ?? 0;
        const vtol = reltol * Math.abs(value) + vntol;
        const ratio = Math.abs(value - prior) / vtol;
        if (ratio > maxVoltageRatio) maxVoltageRatio = ratio;
      }

      let maxCurrentRatio = 0;
      for (const device of nonlinearDevices) {
        const iNew = device.current(latest.nodeVoltages);
        const iOld = device.current(guess);
        const itol = reltol * Math.abs(iNew) + abstol;
        const ratio = Math.abs(iNew - iOld) / itol;
        if (ratio > maxCurrentRatio) maxCurrentRatio = ratio;
      }

      if (maxVoltageRatio <= 1 && maxCurrentRatio <= 1) {
        // Commit capacitor/inductor state exactly once after the final nonlinear solve.
        return this.linear.solve([...primitives, ...companions], elapsedSeconds, true);
      }

      // Linear supply nodes and passive resistor networks update directly from the
      // linear solve result without step-capping.
      const nextGuess: Record<string, number> = { ...latest.nodeVoltages, '0': 0 };

      // Restrict the exponential step limit exclusively across non-linear device terminals.
      const targetJunctions = new Map<string, number>();
      for (const device of nonlinearDevices) {
        const pos = device.positive;
        const neg = device.negative;
        const vOld = (guess[pos] ?? 0) - (guess[neg] ?? 0);
        const vNew = (latest.nodeVoltages[pos] ?? 0) - (latest.nodeVoltages[neg] ?? 0);
        const vLim = pnjlim(vNew, vOld);
        targetJunctions.set(device.id, vOld + damping * (vLim - vOld));
      }

      for (let pass = 0; pass < 3; pass += 1) {
        for (const device of nonlinearDevices) {
          const vTarget = targetJunctions.get(device.id)!;
          const pos = device.positive;
          const neg = device.negative;
          const currentV = (nextGuess[pos] ?? 0) - (nextGuess[neg] ?? 0);
          const diff = vTarget - currentV;
          if (Math.abs(diff) > 1e-12) {
            if (neg === '0') {
              nextGuess[pos] = (nextGuess[pos] ?? 0) + diff;
            } else if (pos === '0') {
              nextGuess[neg] = (nextGuess[neg] ?? 0) - diff;
            } else {
              nextGuess[pos] = (nextGuess[pos] ?? 0) + diff;
            }
          }
        }
      }

      nextGuess['0'] = 0;
      guess = nextGuess;
    }
    throw new TabDMnaError(`Newton-Raphson did not converge after ${maxIterations} iterations. Review nonlinear device biasing and ideal constraints.`);
  }

  private companionStamps(device: TabDNonlinearDevice, nodeVoltages: Record<string, number>): TabDPrimitive[] {
    const baseCurrent = clamp(finite(device.current(nodeVoltages)), -MAX_CURRENT, MAX_CURRENT);
    const controls = Array.from(new Set(device.controls));
    const partials: Array<{ node: string; conductance: number }> = [];
    for (const control of controls) {
      if (control === '0') continue;
      const prior = nodeVoltages[control] ?? 0;
      const delta = Math.max(1e-6, Math.abs(prior) * 1e-6);
      const perturbed = { ...nodeVoltages, [control]: prior + delta };
      const derivative = clamp((finite(device.current(perturbed)) - baseCurrent) / delta, -MAX_CONDUCTANCE, MAX_CONDUCTANCE);
      if (Math.abs(derivative) > 1e-18) partials.push({ node: control, conductance: derivative });
    }
    const equivalentCurrent = baseCurrent - partials.reduce((sum, partial) => sum + partial.conductance * (nodeVoltages[partial.node] ?? 0), 0);
    return [
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
    ];
  }
}
