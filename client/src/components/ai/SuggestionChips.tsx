import { ImagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface Suggestion {
  id: "kvl" | "rootLocus" | "buck" | "photo";
  /** `fill` puts the text into the composer; `attach` fills a prompt and opens the image picker. */
  action: "fill" | "attach";
}

/** The starter prompts shown under the empty-state composer. They are topic-agnostic: the assistant infers the lab itself. */
export const SUGGESTIONS: readonly Suggestion[] = [
  { id: "kvl", action: "fill" },
  { id: "rootLocus", action: "fill" },
  { id: "buck", action: "fill" },
  { id: "photo", action: "attach" },
];

export interface SuggestionChipsProps {
  /** Receives the chip's text; the caller fills the composer and focuses it. */
  onFill: (text: string) => void;
  /** Receives the suggested prompt for an image question; the caller fills it and opens the file picker. */
  onAttach: (prompt: string) => void;
}

export function SuggestionChips({ onFill, onAttach }: SuggestionChipsProps) {
  const { t } = useTranslation("ai");
  return (
    <ul aria-label={t("suggestions.label")} className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((suggestion) => {
        const label = t(`suggestions.${suggestion.id}`);
        return (
          <li key={suggestion.id}>
            <button
              type="button"
              onClick={() => (suggestion.action === "attach" ? onAttach(t("suggestions.photoPrompt")) : onFill(label))}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 text-sm text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10 dark:hover:text-violet-100"
            >
              {suggestion.action === "attach" ? <ImagePlus className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" /> : null}
              <span dir="auto">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default SuggestionChips;
