import SimulatorLayout from "@/components/SimulatorLayout";
import SimulationDocumentation from "@/components/simulations/SimulationDocumentation";
import { useLocale } from "@/contexts/LocaleContext";
import { ArduinoStudio } from "@/features/arduino-studio/ArduinoStudio";
import { useSimulatorSeo } from "@/seo/useSimulatorSeo";

export default function ArduinoStudioPage() {
  const { copy, isRtl } = useLocale();
  const shellTitle = copy.collections.simulations.cards.find((card) => card.code === "S.08")?.title ?? "Arduino Studio";
  useSimulatorSeo("arduino");

  return (
    <SimulatorLayout title={shellTitle} tabs={[]} activeTab="" routePrefix="/simulators/arduino-studio" backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation compact>
      {/* The simulator is left-to-right engineering notation regardless of page language. */}
      <div dir="ltr" className="mt-3 mae-simulator-shell">
        <ArduinoStudio />
      </div>
      <SimulationDocumentation topic="arduino" />
    </SimulatorLayout>
  );
}
