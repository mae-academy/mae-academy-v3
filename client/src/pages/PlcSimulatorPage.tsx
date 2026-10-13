import { useCallback, useEffect, useState } from "react";
import { publishDocsTool } from "@/components/simulations/toolDocs/activeToolStore";
import SimulatorLayout from "@/components/SimulatorLayout";
import SimulationDocumentation from "@/components/simulations/SimulationDocumentation";
import { useLocale } from "@/contexts/LocaleContext";
import { DEMO_SYMBOLS, createDemoNetworks } from "@/features/plc-simulator/ui/host/demo-program";
import { PlcSimulatorApp, type PlcPlatform } from "@/features/plc-simulator/ui/host/PlcSimulatorApp";
import { LOGO_0BA8 } from "@/features/plc-simulator/domain/hardware";
import { useSimulatorSeo } from "@/seo/useSimulatorSeo";

/** The starter program students see on first open; built once, since the app only reads it at mount. */
const DEMO_NETWORKS = createDemoNetworks();

const initialPlatform = (): PlcPlatform =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("platform") === "logo" ? "logo" : "s7";

export default function PlcSimulatorPage() {
  const { copy, isRtl } = useLocale();
  const [platform, setPlatform] = useState<PlcPlatform>(initialPlatform);
  useEffect(() => {
    publishDocsTool("plc", platform === "logo" ? "logo" : "ladder-s7-200");
  }, [platform]);
  // Ladder / S7-200 and LOGO! FBD are separate environments, each with its own title, meta and docs.
  useSimulatorSeo(platform === "logo" ? "plc-logo" : "plc-ladder");

  const onPlatformChange = useCallback((next: PlcPlatform) => {
    setPlatform(next);
    const url = new URL(window.location.href);
    if (next === "logo") url.searchParams.set("platform", "logo");
    else url.searchParams.delete("platform");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <SimulatorLayout title="PLC" tabs={[]} activeTab="" routePrefix="/simulations/plc" backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation compact>
      {/* The simulator is left-to-right engineering notation regardless of page language. */}
      <div dir="ltr" className="mt-3 flex min-h-[calc(100svh-var(--mae-header-height)-9rem)] flex-col mae-simulator-shell">
        <PlcSimulatorApp
          initialNetworks={DEMO_NETWORKS}
          symbols={DEMO_SYMBOLS}
          initialProfileId={initialPlatform() === "logo" ? LOGO_0BA8.id : undefined}
          onPlatformChange={onPlatformChange}
          className="flex flex-1 flex-col"
        />
      </div>
      <SimulationDocumentation topic="plc" />
    </SimulatorLayout>
  );
}
