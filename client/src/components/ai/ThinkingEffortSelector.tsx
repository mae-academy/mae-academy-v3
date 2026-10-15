import { Brain, Microscope, Scale, Zap, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { THINKING_EFFORTS, type ThinkingEffort } from "@shared/aiTypes";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const ICONS: Record<ThinkingEffort, LucideIcon> = { low: Zap, medium: Scale, high: Microscope };

/** Selected look per level: low is a light badge, medium the standard brand tint, high a high-contrast accent. */
const ACTIVE: Record<ThinkingEffort, string> = {
  low: "bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-zinc-50",
  medium: "bg-violet-100 text-violet-900 dark:bg-violet-500/25 dark:text-violet-100",
  high: "bg-violet-700 text-white dark:bg-violet-500 dark:text-white",
};

/**
 * Reasoning-depth selector: a segmented radio group (Low / Med / High). Heavy derivations get a bigger thinking budget,
 * quick questions stay fast and cheap. Full labels from sm up, icons only on phones.
 */
export function ThinkingEffortSelector({ value, onChange }: { value: ThinkingEffort; onChange: (next: ThinkingEffort) => void }) {
  const { t } = useTranslation("ai");
  const move = (from: ThinkingEffort, step: number) => {
    const next = THINKING_EFFORTS[(THINKING_EFFORTS.indexOf(from) + step + THINKING_EFFORTS.length) % THINKING_EFFORTS.length];
    onChange(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-thinking-effort="${next}"]`)?.focus());
  };
  return (
    <div
      role="radiogroup"
      aria-label={t("thinking.label")}
      data-thinking-effort-selector
      className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 dark:border-white/[0.12] dark:bg-transparent sm:min-h-9"
    >
      <Brain className="mx-1.5 hidden h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400 md:block" aria-hidden="true" />
      <span className="hidden pe-1 text-xs font-medium text-slate-600 dark:text-zinc-300 md:inline">{t("thinking.label")}</span>
      {THINKING_EFFORTS.map((effort) => {
        const Icon = ICONS[effort];
        const selected = value === effort;
        const name = t(`thinking.${effort}`);
        return (
          <button
            key={effort}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${t("thinking.label")}: ${name}`}
            title={t(`thinking.${effort}Hint`)}
            tabIndex={selected ? 0 : -1}
            data-thinking-effort={effort}
            onClick={() => onChange(effort)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(effort, 1); }
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(effort, -1); }
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors sm:min-h-8",
              selected ? ACTIVE[effort] : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.08]",
              FOCUS,
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
}
