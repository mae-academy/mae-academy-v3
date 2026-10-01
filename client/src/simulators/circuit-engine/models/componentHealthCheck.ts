import { getDef } from '@shared/circuit/componentDefs';
import { terminalKey, type CircuitComponent, type SimulationSnapshot } from '@shared/circuit/circuitTypes';

function componentCurrent(componentId: string, branchCurrents: Record<string, number>): number {
  const direct = branchCurrents[componentId];
  if (direct !== undefined) return Math.abs(direct);

  let max = 0;
  for (const key in branchCurrents) {
    if (key.startsWith(`${componentId}:`)) max = Math.max(max, Math.abs(branchCurrents[key]));
  }
  return max;
}

function componentVoltageDrop(component: CircuitComponent, terminalVoltages: Record<string, number>): number {
  const terminals = getDef(component.type)?.terminals ?? [];
  if (terminals.length === 0) return 0;

  const voltages = terminals.map((t) => terminalVoltages[terminalKey(component.id, t.id)] ?? 0);
  return Math.max(...voltages) - Math.min(...voltages);
}

/**
 * Evaluates each component's simulated voltage/current/power against its ratings and latches
 * `state.isBurned = true` on overage. Already-burned components are skipped, so burnout persists
 * across re-simulation until the user replaces or resets the component elsewhere.
 */
export function evaluateComponentHealth(
  circuit: { components: CircuitComponent[] },
  simulationResults: SimulationSnapshot,
): CircuitComponent[] {
  return circuit.components.map((component) => {
    if (component.state?.isBurned) return component;

    const ratings = component.ratings ?? getDef(component.type)?.ratings;
    if (!ratings) return component;

    const current = componentCurrent(component.id, simulationResults.branchCurrents);
    const voltageDrop = Math.abs(componentVoltageDrop(component, simulationResults.terminalVoltages));
    const power = voltageDrop * current;

    const overRated =
      (ratings.maxPower !== undefined && power > ratings.maxPower) ||
      (ratings.maxCurrent !== undefined && current > ratings.maxCurrent) ||
      (ratings.maxVoltage !== undefined && voltageDrop > ratings.maxVoltage);

    if (!overRated) return component;

    return { ...component, state: { ...component.state, isBurned: true } };
  });
}
