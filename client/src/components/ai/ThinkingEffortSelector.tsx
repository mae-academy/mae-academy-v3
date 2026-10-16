import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { THINKING_EFFORTS, parseThinkingEffort, type ThinkingEffort } from "@shared/aiTypes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const TRIGGER = "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/[0.12] dark:bg-transparent dark:text-zinc-200 dark:hover:bg-white/[0.08]";

/**
 * Reasoning-depth dropdown (Low / Med / High), small enough for the composer's accessory bar. Heavy derivations get a bigger
 * thinking budget, quick questions stay fast and cheap. Plain text only: the word "Thinking" shows from sm up, phones show just the level.
 */
export function ThinkingEffortSelector({ value, onChange }: { value: ThinkingEffort; onChange: (next: ThinkingEffort) => void }) {
  const { t } = useTranslation("ai");
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
          className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-9", TRIGGER, FOCUS)}
        >
          <span aria-hidden="true" className="hidden sm:inline">{t("thinking.label")}:</span>
          <span aria-hidden="true">{name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56 rounded-2xl p-1.5" aria-label={t("thinking.label")}>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(parseThinkingEffort(next))}>
          {THINKING_EFFORTS.map((effort) => {
            const selected = effort === value;
            return (
              <DropdownMenuRadioItem
                key={effort}
                value={effort}
                title={t(`thinking.${effort}Hint`)}
                data-thinking-effort-option={effort}
                className={cn(
                  "min-h-11 rounded-xl py-2 pl-3 pr-9 text-sm [&>span:first-child]:hidden",
                  selected && "bg-gradient-to-r from-blue-600/10 to-purple-600/10 font-semibold text-blue-700 dark:text-blue-200",
                )}
              >
                {t(`thinking.${effort}`)}
                {selected ? <Check className="absolute end-3 h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" /> : null}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
