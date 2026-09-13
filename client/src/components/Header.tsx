/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Persistent instrument-rail navigation with compact gradient signals.
 */
import { memo, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, Moon, Sun } from "lucide-react";
import HeaderNavigationSlider from "./HeaderNavigationSlider";
import { Locale } from "@/data/platform";
import { useLocale } from "@/contexts/LocaleContext";

export type { Locale } from "@/data/platform";

type HeaderProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  isLocaleTransitioning: boolean;
  isDark: boolean;
  onThemeToggle: () => void;
};

const localeLabel: Record<Locale, string> = { en: "EN", ar: "AR", es: "ES" };

function BrandMark() {
  return <svg viewBox="0 0 48 44" className="h-10 w-11 shrink-0" aria-label="MAE Academy tri-axis mark" role="img"><defs><linearGradient id="mark-gradient" x1="5" y1="3" x2="42" y2="41" gradientUnits="userSpaceOnUse"><stop stopColor="#2563EB"/><stop offset=".5" stopColor="#7C3AED"/><stop offset="1" stopColor="#E11D48"/></linearGradient></defs><path d="M5 35V11l11 14L24 9l8 16 11-14v24" fill="none" stroke="url(#mark-gradient)" strokeWidth="4.5" strokeLinecap="square" strokeLinejoin="bevel"/><path d="M8 37h32M24 7v31" stroke="currentColor" strokeOpacity=".3" strokeWidth="1"/><circle cx="24" cy="9" r="3.3" fill="#7C3AED"/></svg>;
}

function Header({ locale, onLocaleChange, isLocaleTransitioning, isDark, onThemeToggle }: HeaderProps) {
  const { copy } = useLocale();
  const [languageOpen, setLanguageOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0D0D11]/90">
      <div className="max-w-[1380px] mx-auto px-6 sm:px-8 lg:px-12 w-full flex h-[72px] items-center justify-between gap-3">
        <Link href="/" className="group flex items-center gap-3 text-slate-950 transition-transform duration-200 hover:scale-[1.02] active:scale-[.98] dark:text-white" aria-label={copy.controls.home}>
          <BrandMark />
          <span className="leading-none"><strong className="block text-sm tracking-[0.18em]">MAE <span className="mae-gradient-text">/</span></strong><span className="mt-1 block text-[9px] font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">ACADEMY</span></span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="relative">
            <button onClick={() => setLanguageOpen((value) => !value)} className="flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-bold tracking-[0.1em] text-slate-700 transition-all duration-200 hover:scale-105 hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-violet-400 dark:hover:text-violet-300" aria-label={copy.controls.language} aria-haspopup="listbox" aria-expanded={languageOpen}><span>{localeLabel[locale]}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${languageOpen ? "rotate-180" : ""}`} /></button>
            {languageOpen && <div className="absolute end-0 top-11 min-w-28 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 dark:border-white/[0.08] dark:bg-[#0D0D11] dark:shadow-black/60" role="listbox" aria-label={copy.controls.languageOptions}>
              {(["en", "ar", "es"] as Locale[]).map((option) => <button key={option} disabled={isLocaleTransitioning} onClick={() => { onLocaleChange(option); setLanguageOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 ${locale === option ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10"}`} role="option" aria-selected={locale === option}>{copy.languageNames[option]}<span className="text-[10px] tracking-wider opacity-70">{localeLabel[option]}</span></button>)}
            </div>}
          </div>
          <button onClick={onThemeToggle} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition-all duration-200 hover:scale-105 hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-violet-400 dark:hover:text-violet-300" aria-label={isDark ? copy.controls.themeToLight : copy.controls.themeToDark}>{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        </div>
      </div>
      <div className="border-t border-slate-200/70 py-2.5 dark:border-white/[0.08]"><div className="max-w-[1380px] mx-auto px-6 sm:px-8 lg:px-12 w-full"><HeaderNavigationSlider locale={locale} /></div></div>
    </header>
  );
}

export default memo(Header);
