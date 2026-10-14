/**
 * MAE AI entry banner for the Home hero: a compact single-row callout
 * (stacked on mobile) that routes to the /ai assistant.
 */
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import PrefetchLink from "@/components/common/PrefetchLink";

export default function MaeAiCallout() {
  const { t } = useTranslation("landing");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 shadow-sm dark:border-white/[0.08] dark:bg-[#08080A]">
      {/* Soft brand glow bleeding in from the inline-start edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -start-16 -top-16 h-40 w-64 rounded-full bg-gradient-to-br from-blue-500/20 via-violet-500/15 to-transparent blur-2xl dark:from-blue-500/25 dark:via-violet-500/20"
      />
      {/* Brand gradient edge line along the top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-600/0 via-violet-500/70 to-indigo-600/0"
      />

      <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm ring-1 ring-inset ring-white/20"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-start">
            <h2 className="text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
              {t("aiCallout.title")}
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
              {t("aiCallout.description")}
            </p>
          </div>
        </div>

        <PrefetchLink
          href="/ai"
          className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#08080A] sm:w-auto"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t("aiCallout.cta")}
        </PrefetchLink>
      </div>
    </div>
  );
}
