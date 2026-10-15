import { ListOrdered } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

/** Step-by-step guidance switch (a compact pill): full label from sm up, a short "Steps: ON" on phones. */
export function StepModeSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { t } = useTranslation("ai");
  const state = t(on ? "stepMode.on" : "stepMode.off");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("stepMode.label", { state })}
      title={t("stepMode.hint")}
      onClick={onToggle}
      data-step-mode-switch
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-9",
        on
          ? "border-blue-300 bg-gradient-to-r from-blue-600/15 to-indigo-600/15 text-blue-800 dark:border-blue-400/40 dark:from-blue-500/25 dark:to-indigo-500/25 dark:text-blue-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/[0.12] dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/[0.08]",
        FOCUS,
      )}
    >
      <ListOrdered className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span aria-hidden="true" className="sm:hidden">{t("stepMode.short", { state })}</span>
      <span aria-hidden="true" className="hidden sm:inline">{t("stepMode.label", { state })}</span>
    </button>
  );
}
