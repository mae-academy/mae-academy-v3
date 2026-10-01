/**
 * Power Electronics domain chunk — default export is a render dispatcher.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RectifierStudio } from "@/components/power/RectifierStudio";
import { InverterStudio } from "@/components/power/InverterStudio";
import { ACVoltageControllerStudio } from "@/components/power/ACVoltageControllerStudio";
import { ChopperStudio } from "@/components/power/ChopperStudio";

const STUDIO_TITLES: Record<string, { en: string; ar: string }> = {
  rectifier: { en: "Controlled Rectifier Studio", ar: "مختبر المقومات المحكومة" },
  inverter: { en: "PWM Inverter Studio", ar: "مختبر العواكس والـ PWM" },
  acvc: { en: "AC Voltage Controller Studio", ar: "مختبر مغيرات الجهد المتردد" },
  chopper: { en: "DC-DC Converter & Chopper Studio", ar: "مختبر مغيرات الجهد المستمر" },
};

export default function PowerStudiosRenderer({ tool }: { tool: string }) {
  const { i18n } = useTranslation();
  const entry = STUDIO_TITLES[tool];
  const title = entry ? (i18n.language?.startsWith("ar") ? entry.ar : entry.en) : "";

  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    // Defer so it lands after the route-level title setters.
    const timer = window.setTimeout(() => { document.title = `${title} — MAE Academy`; }, 50);
    return () => { window.clearTimeout(timer); document.title = prev; };
  }, [title]);

  if (!entry) return null;
  return (
    <>
      <h1 className="px-4 pt-4 text-lg font-bold text-slate-800 dark:text-white" data-testid="power-studio-title">{title}</h1>
      {tool === "rectifier" && <RectifierStudio />}
      {tool === "inverter" && <InverterStudio />}
      {tool === "acvc" && <ACVoltageControllerStudio />}
      {tool === "chopper" && <ChopperStudio />}
    </>
  );
}
