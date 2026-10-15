import { Brain, ChevronDown, Microscope, Scale, Zap, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { THINKING_EFFORTS, parseThinkingEffort, type ThinkingEffort } from "@shared/aiTypes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const ICONS: Record<ThinkingEffort, LucideIcon> = { low: Zap, medium: Scale, high: Microscope };

/** Trigger look per level: low is a light badge, medium the soft brand tint, high the solid brand gradient. */
const TRIGGER: Record<ThinkingEffort, string> = {
  low: "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/[0.12] dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/[0.08]",
  medium: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400/25 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60",
  high: "border-transparent bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:opacity-90",
};

/**
 * Reasoning-depth dropdown (Low / Med / High), small enough for the composer's accessory bar. Heavy derivations get a bigger
 * thinking budget, quick questions stay fast and cheap. The word "Thinking" shows from sm up; phones show the icon and level.
 */
export function ThinkingEffortSelector({ value, onChange }: { value: ThinkingEffort; onChange: (next: ThinkingEffort) => void }) {
  const { t } = useTranslation("ai");
  const Icon = ICONS[value];
  const name = t(`thinking.${value}`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t("thinking.label")}: ${name}`}
          title={t(`thinking.${value}Hint`)}
          data-thinking-effort-trigger
          data-thinking-effort={value}
          className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-9", TRIGGER[value], FOCUS)}
        >
          <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span aria-hidden="true" className="hidden sm:inline">{t("thinking.label")}:</span>
          <span aria-hidden="true" className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64 rounded-2xl p-1.5" aria-label={t("thinking.label")}>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(parseThinkingEffort(next))}>
          {THINKING_EFFORTS.map((effort) => {
            const ItemIcon = ICONS[effort];
            return (
              <DropdownMenuRadioItem key={effort} value={effort} data-thinking-effort-option={effort} className="min-h-11 items-start gap-2 rounded-xl py-2">
                <ItemIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{t(`thinking.${effort}`)}</span>
                  <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">{t(`thinking.${effort}Hint`)}</span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
