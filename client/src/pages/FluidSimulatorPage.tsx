import SimulatorLayout from "@/components/SimulatorLayout";
import { useLocale } from "@/contexts/LocaleContext";
import { FluidSimulatorApp } from "@/simulators/fluid-engine/components/FluidSimulatorApp";
import { getSimulationMeta } from "@/config/simulationsMeta";
import { useEffect } from "react";
import SimulationDocumentation from "@/components/simulations/SimulationDocumentation";

export default function FluidSimulatorPage() {
  const { copy, isRtl } = useLocale();
  const shellTitle = copy.collections.simulations.cards.find((card) => card.code === "S.09")?.title ?? "Pneumatics and Hydraulic Drive";
  const seo = getSimulationMeta("pneumatics-and-hydraulics");

  useEffect(() => {
    if (seo) document.title = seo.title;
  }, [seo]);

  return (
    <SimulatorLayout title={shellTitle} tabs={[]} activeTab="" routePrefix="/simulations/pneumatics-and-hydraulics" backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation compact>
      {/* The simulator is left-to-right engineering notation regardless of page language. */}
      <div dir="ltr" className="mt-3 mae-simulator-shell">
        <FluidSimulatorApp />
      </div>
      <SimulationDocumentation topic="fluid" />
    </SimulatorLayout>
  );
}
