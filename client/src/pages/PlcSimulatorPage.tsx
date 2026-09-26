import { useEffect } from "react";
import SimulatorLayout from "@/components/SimulatorLayout";
import { useLocale } from "@/contexts/LocaleContext";
import { DEMO_SYMBOLS, createDemoNetworks } from "@/features/plc-simulator/ui/host/demo-program";
import { PlcSimulatorApp } from "@/features/plc-simulator/ui/host/PlcSimulatorApp";

const TITLE = "PLC Simulator — Ladder Logic, Siemens LOGO! & S7-200 | MAE Academy";
const DESCRIPTION = "Build ladder logic, watch power flow through the rung, and drive virtual Siemens LOGO! 0BA4 and S7-200 hardware with a real scan cycle, entirely in your browser.";

/** The starter program students see on first open; built once, since the app only reads it at mount. */
const DEMO_NETWORKS = createDemoNetworks();

export default function PlcSimulatorPage() {
  const { copy, isRtl } = useLocale();
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const prevContent = meta.content;
    meta.content = DESCRIPTION;
    return () => {
      document.title = previous;
      if (created) meta?.remove();
      else if (meta) meta.content = prevContent;
    };
  }, []);

  return (
    <SimulatorLayout title="PLC" tabs={[]} activeTab="" routePrefix="/simulations/plc" backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation compact>
      {/* The simulator is left-to-right engineering notation regardless of page language. */}
      <div dir="ltr" className="mt-3 flex min-h-[calc(100svh-var(--mae-header-height)-9rem)] flex-col">
        <PlcSimulatorApp initialNetworks={DEMO_NETWORKS} symbols={DEMO_SYMBOLS} className="flex flex-1 flex-col" />
      </div>
    </SimulatorLayout>
  );
}
