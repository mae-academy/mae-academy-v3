import { TabDDocumentedMna, TabDMnaError, type TabDOperatingPoint, type TabDPrimitive } from '@/simulators/digital-logic/engine/digitalLogicDocumentedMna';

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
  damping?: number;
}

const MAX_CONDUCTANCE = 1e12;
const MAX_CURRENT = 1e9;

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
    const tolerance = Math.max(1e-10, options.voltageTolerance ?? 1e-7);
    const damping = clamp(options.damping ?? 0.65, 0.05, 1);
    let guess: Record<string, number> = { '0': 0 };
    let latest: TabDOperatingPoint | null = null;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const companions = nonlinearDevices.flatMap(device => this.companionStamps(device, guess));
      latest = this.linear.solve([...primitives, ...companions], elapsedSeconds, false);
      const maxDelta = Object.entries(latest.nodeVoltages).reduce((maximum, [node, value]) => Math.max(maximum, Math.abs(value - (guess[node] ?? 0))), 0);
      if (maxDelta <= tolerance) {
        // Commit capacitor/inductor state exactly once after the final nonlinear solve.
        return this.linear.solve([...primitives, ...companions], elapsedSeconds, true);
      }
      // Voltage limiting prevents an exponential companion from jumping from a
      // zero-bias guess directly into an unrealistically huge forward current.
      guess = Object.fromEntries(Object.entries(latest.nodeVoltages).map(([node, value]) => {
        const prior = guess[node] ?? 0;
        const boundedDelta = clamp(value - prior, -0.35, 0.35);
        return [node, prior + damping * boundedDelta];
      }));
      guess['0'] = 0;
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
