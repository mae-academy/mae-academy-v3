import type { SimulationSnapshot } from './circuitTypes';

/** Stable, non-minified observation adapter for Tab D solver payloads. */
export interface TabDObservableOperatingPoint {
  Iq: { success: boolean; PR: boolean; QR: number };
  Yn: Record<string, { iS: number; wl: string; HR: string }>;
  Di: Record<string, { iR: number; As: string; jR: string }>;
}

export function toTabDObservableOperatingPoint(snapshot: SimulationSnapshot): TabDObservableOperatingPoint {
  return {
    Iq: { success: snapshot.converged, PR: snapshot.converged, QR: 0 },
    Yn: Object.fromEntries(Object.entries(snapshot.nodeVoltages).map(([node, voltage]) => [node, { iS: voltage, wl: node, HR: `V(${node})` }])),
    Di: Object.fromEntries(Object.entries(snapshot.branchCurrents).map(([branch, current]) => [branch, { iR: current, As: branch, jR: `I(${branch})` }])),
  };
}
