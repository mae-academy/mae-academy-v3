/**
 * Power Electronics domain chunk — default export is a render dispatcher.
 */
import { RectifierStudio } from "@/components/power/RectifierStudio";
import { InverterStudio } from "@/components/power/InverterStudio";
import { ACVoltageControllerStudio } from "@/components/power/ACVoltageControllerStudio";
import { ChopperStudio } from "@/components/power/ChopperStudio";

export default function PowerStudiosRenderer({ tool }: { tool: string }) {
  if (tool === "a") return <RectifierStudio />;
  if (tool === "b") return <InverterStudio />;
  if (tool === "c") return <ACVoltageControllerStudio />;
  if (tool === "d") return <ChopperStudio />;
  return null;
}
