import { memo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";
import HeaderNavigationSlider from "./HeaderNavigationSlider";
import { isRouteActive, Locale, platformRoutes } from "@/data/platform";
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
  return (
    <div
      className="w-11 h-11 md:w-12 md:h-12 shrink-0 mae-logo-mask"
      style={{ background: "var(--brand-gradient)" }}
      role="img"
      aria-label="MAE Academy logo"
    />
  );
}

function Header({ locale, onLocaleChange, isLocaleTransitioning, isDark, onThemeToggle }: HeaderProps) {
  const { copy } = useLocale();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0D0D11]/90 w-full max-w-full">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 w-full flex h-[68px] sm:h-[72px] md:h-[76px] items-center justify-between gap-3">
        <Link href="/" className="group flex items-center gap-2.5 sm:gap-3 text-slate-950 transition-transform duration-200 hover:scale-[1.02] active:scale-[.98] dark:text-white" aria-label={copy.controls.home}>
          <BrandMark />
          <div className="flex flex-col justify-center leading-none">
            <span className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#EC4899] bg-clip-text text-transparent">
              Academy
            </span>
            <span className="text-[11px] font-['Poppins'] font-medium text-slate-500 tracking-wider block mt-0.5">
              Platform
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Language Selector */}
          <div className="relative">
            <button onClick={() => setLanguageOpen((value) => !value)} className="flex h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold tracking-[0.1em] text-slate-700 transition-all duration-200 hover:scale-105 hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-violet-400 dark:hover:text-violet-300" aria-label={copy.controls.language} aria-haspopup="listbox" aria-expanded={languageOpen}><span>{localeLabel[locale]}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${languageOpen ? "rotate-180" : ""}`} /></button>
            {languageOpen && <div className="absolute end-0 top-12 min-w-32 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 z-50 dark:border-white/[0.08] dark:bg-[#0D0D11] dark:shadow-black/60" role="listbox" aria-label={copy.controls.languageOptions}>
              {(["en", "ar", "es"] as Locale[]).map((option) => <button key={option} disabled={isLocaleTransitioning} onClick={() => { onLocaleChange(option); setLanguageOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 ${locale === option ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10"}`} role="option" aria-selected={locale === option}>{copy.languageNames[option]}<span className="text-[10px] tracking-wider opacity-70">{localeLabel[option]}</span></button>)}
            </div>}
          </div>
          {/* Theme Toggle */}
          <button onClick={onThemeToggle} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition-all duration-200 hover:scale-105 hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-violet-400 dark:hover:text-violet-300" aria-label={isDark ? copy.controls.themeToLight : copy.controls.themeToDark}>{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          {/* Mobile Hamburger Drawer Toggle */}
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 md:hidden place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition-all duration-200 hover:scale-105 hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-violet-400 dark:hover:text-violet-300" aria-label="Toggle navigation menu" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
        </div>
      </div>

      {/* Mobile Drawer (Only on screens < md) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200/80 bg-white/95 backdrop-blur-xl px-4 py-4 dark:border-white/[0.08] dark:bg-[#0D0D11]/95 motion-safe:animate-in motion-safe:slide-in-from-top-2">
          <nav className="flex flex-col gap-1.5" aria-label="Mobile Navigation">
            {platformRoutes.map((route) => {
              const active = isRouteActive(location, route.href);
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    active
                      ? "brand-active-pill"
                      : "text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <span>{copy.navigation[route.index]}</span>
                  <span className={`text-[11px] font-mono opacity-70 ${active ? "text-white" : "text-slate-400"}`}>
                    {route.index}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Second-Tier Navigation Rail (Smooth touch horizontal scroll on mobile with hidden scrollbars) */}
      <div className="border-t border-slate-200/70 py-2 dark:border-white/[0.08] overflow-hidden">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 w-full flex overflow-x-auto no-scrollbar py-1">
          <HeaderNavigationSlider locale={locale} />
        </div>
      </div>
    </header>
  );
}

export default memo(Header);
