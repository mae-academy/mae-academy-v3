/**
 * Circuit Lab domain chunk — default export is a render dispatcher.
 * Handles both digital circuit (circuit-lab) and analog circuit (circuitlab-1/2/3) clones.
 */
import { AnalogCircuitSimulator } from "@/simulators/circuit-engine/components/AnalogCircuitSimulator";
import { DigitalCircuitSimulator } from "@/simulators/digital-logic/components/DigitalCircuitSimulator";

export default function CircuitStudiosRenderer({
  isCircuitLab,
  isCircuitLabClone,
  instanceId,
  label,
}: {
  isCircuitLab: boolean;
  isCircuitLabClone: boolean;
  instanceId: string;
  label: string;
}) {
  if (isCircuitLab) return <DigitalCircuitSimulator />;
  if (isCircuitLabClone) return <AnalogCircuitSimulator instanceId={instanceId} label={label} />;
  return null;
}
