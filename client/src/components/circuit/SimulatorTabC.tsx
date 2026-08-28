/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Tab C preserves the legacy engine in its own document while that document provides
 * sibling menu, library, and workspace regions for the established editor nodes.
 */
import { useLocale } from "@/contexts/LocaleContext";

const copy = {
  en: {
    frameTitle: "E-Circuits editor",
  },
  ar: {
    frameTitle: "محرر E-Circuits",
  },
  es: {
    frameTitle: "Editor de E-Circuits",
  },
} as const;

export function SimulatorTabC({ instanceId = "circuitlab-core", label }: { instanceId?: string; label?: string }) {
  const { locale } = useLocale();
  const t = copy[locale];
  const frameTitle = label ? `${label} — ${t.frameTitle}` : t.frameTitle;

  return <section className="w-full overflow-hidden rounded-2xl bg-white transition-colors dark:bg-slate-900" onContextMenu={(event) => event.preventDefault()}>
    <iframe src={`/tab-c-legacy/editor/editor.html?layout=ghosting-v2&instance=${encodeURIComponent(instanceId)}`} title={frameTitle} sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer" className="block h-[calc(100svh-10rem)] min-h-[760px] w-full border-0 bg-white transition-colors dark:bg-slate-900"/>
  </section>;
}
