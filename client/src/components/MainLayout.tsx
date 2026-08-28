/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Persistent global shell; background, header, and footer remain outside route transitions.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import Header, { Locale } from "./Header";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { localizedContent } from "@/data/content";
import LanguageTransition from "@/components/LanguageTransition";

type MainLayoutProps = { children: ReactNode };

export default function MainLayout({ children }: MainLayoutProps) {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem("mae-locale") as Locale) || "en");
  const [isDark, setIsDark] = useState(() => localStorage.getItem("mae-theme") !== "light");
  const [languageTarget, setLanguageTarget] = useState<Locale | null>(null);
  const transitionTimers = useRef<number[]>([]);
  const copy = localizedContent[locale];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
    localStorage.setItem("mae-theme", isDark ? "dark" : "light");
    localStorage.setItem("mae-locale", locale);
    document.title = `MAE Academy — ${copy.about.title}`;
  }, [locale, isDark, copy.about.title]);

  useEffect(() => () => transitionTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const handleLocaleChange = (nextLocale: Locale) => {
    if (nextLocale === locale || languageTarget) return;
    setLanguageTarget(nextLocale);
    transitionTimers.current = [
      window.setTimeout(() => setLocale(nextLocale), 275),
      window.setTimeout(() => setLanguageTarget(null), 610),
    ];
  };

  return <LocaleProvider locale={locale}><div className={`min-h-screen overflow-x-hidden bg-[#f7f8fc] text-slate-950 transition-colors dark:bg-[#07111f] dark:text-slate-50 ${locale === "ar" ? "font-arabic" : "font-sans"}`}>
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true"><div className="absolute -left-56 top-24 h-[32rem] w-[32rem] rounded-full bg-blue-600/10 blur-3xl dark:bg-blue-500/15" /><div className="absolute -right-60 top-[28rem] h-[34rem] w-[34rem] rounded-full bg-rose-500/10 blur-3xl dark:bg-rose-500/10" /><div className="mae-noise absolute inset-0 opacity-[0.035] dark:opacity-[0.055]" /></div>
    <Header locale={locale} onLocaleChange={handleLocaleChange} isLocaleTransitioning={Boolean(languageTarget)} isDark={isDark} onThemeToggle={() => setIsDark((value) => !value)} />
    <main className="min-h-[calc(100svh-var(--mae-header-height))]">{children}</main>
    <footer className="border-t border-slate-200/80 bg-white/50 dark:border-white/10 dark:bg-slate-950/30"><div className="container py-8"><div className="h-px bg-gradient-to-r from-blue-600 via-violet-500 to-rose-500 opacity-75"/><div className="grid gap-0 border-x border-b border-slate-200/80 md:grid-cols-[1.25fr_.8fr_.55fr] dark:border-white/10"><div className="p-5"><p className="mb-3 text-[10px] font-bold tracking-[0.17em] text-violet-700 dark:text-violet-300">MAE / ACADEMY · TITLE BLOCK</p><p className="max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400">{copy.footer.description}</p></div><div className="flex items-end gap-5 border-t border-slate-200/80 p-5 text-xs font-semibold text-slate-500 md:border-s md:border-t-0 dark:border-white/10 dark:text-slate-400"><Link href="/research" className="hover:text-violet-700 dark:hover:text-violet-300">{copy.footer.research}</Link><Link href="/courses" className="hover:text-violet-700 dark:hover:text-violet-300">{copy.footer.courses}</Link><Link href="/simulations" className="hover:text-violet-700 dark:hover:text-violet-300">{copy.footer.simulations}</Link></div><div className="border-t border-slate-200/80 p-5 text-xs text-slate-400 md:border-s md:border-t-0 dark:border-white/10 dark:text-slate-500"><p className="mb-3 text-[9px] font-bold tracking-[.14em]">REF / MAE-2026</p><p>© {new Date().getFullYear()} MAE Academy</p></div></div></div></footer>
    <LanguageTransition target={languageTarget} />
  </div></LocaleProvider>;
}
