import { useEffect } from "react";
import SimulatorLayout from "@/components/SimulatorLayout";
import { useLocale } from "@/contexts/LocaleContext";
import { ArduinoStudio } from "@/features/arduino-studio/ArduinoStudio";

const TITLE = "Arduino Studio — Interactive Arduino UNO Simulator | MAE Academy";
const DESCRIPTION = "Write Arduino C++ sketches and watch an interactive UNO board react: digital I/O, PWM, analog inputs, serial monitor, and live plotter, entirely in your browser.";

export default function ArduinoStudioPage() {
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
    <SimulatorLayout title="Arduino Studio" tabs={[]} activeTab="" routePrefix="/simulators/arduino-studio" backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation compact>
      <div className="mt-3">
        <ArduinoStudio />
      </div>
    </SimulatorLayout>
  );
}
