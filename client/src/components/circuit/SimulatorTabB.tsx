import { V3SimulatorApp } from "@/v3-simulator/V3SimulatorApp";

/**
 * An isolated V3 simulator mount. The archived V3 source lives entirely
 * under client/src/v3-simulator and does not touch Tab A namespaces.
 */
export function SimulatorTabB() {
  return <V3SimulatorApp />;
}
