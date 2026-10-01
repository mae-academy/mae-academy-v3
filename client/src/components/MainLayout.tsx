/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Persistent global shell; background, header, and footer remain outside route transitions.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Compass, Cpu, FileText, Heart, Mail, ShieldCheck } from "lucide-react";
import Header, { Locale } from "./Header";
import SocialLinks from "@/components/SocialLinks";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { localizedContent } from "@/data/content";
import LanguageTransition from "@/components/LanguageTransition";
import { SegmentedControl } from "@/components/common/templates/SegmentedControl";
import PrefetchLink from "@/components/common/PrefetchLink";
import { useTranslation } from "react-i18next";
import "@/i18n/config";

type MainLayoutProps = { children: ReactNode };

const SUPPORT_URL = "https://www.paypal.com/ncp/payment/KQC2MQJX795D6";

const languageOptions: { key: Locale; label: string; sub: string }[] = [
  { key: "en", label: "EN", sub: "English" },
  { key: "ar", label: "AR", sub: "العربية" },
  { key: "es", label: "ES", sub: "Español" },
];

export default function MainLayout({ children }: MainLayoutProps) {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem("mae-locale") as Locale) || "en");
  const [isDark, setIsDark] = useState(() => localStorage.getItem("mae-theme") !== "light");
  const [languageTarget, setLanguageTarget] = useState<Locale | null>(null);
  const transitionTimers = useRef<number[]>([]);
  const copy = localizedContent[locale];
  const { t } = useTranslation("common");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    localStorage.setItem("mae-theme", isDark ? "dark" : "light");
    localStorage.setItem("mae-locale", locale);
  }, [locale, isDark]);

  useEffect(() => () => transitionTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const handleLocaleChange = (nextLocale: Locale) => {
    if (nextLocale === locale || languageTarget) return;
    setLanguageTarget(nextLocale);
    transitionTimers.current = [
      window.setTimeout(() => setLocale(nextLocale), 275),
      window.setTimeout(() => setLanguageTarget(null), 610),
    ];
  };

  return <LocaleProvider locale={locale}><div className={`min-h-screen w-full max-w-full overflow-x-hidden bg-[#ffffff] text-slate-950 transition-colors dark:bg-[#000000] dark:text-zinc-100 ${locale === "ar" ? "font-arabic" : "font-sans"}`}>
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-56 top-24 h-[32rem] w-[32rem] rounded-full bg-blue-600/10 blur-3xl dark:bg-blue-600/8" />
      <div className="absolute left-[30%] top-[40rem] h-[28rem] w-[28rem] rounded-full bg-violet-600/8 blur-3xl dark:bg-violet-600/6" />
      <div className="absolute -right-60 top-[22rem] h-[34rem] w-[34rem] rounded-full bg-rose-500/7 blur-3xl dark:bg-rose-500/5" />
      <div className="mae-noise absolute inset-0 opacity-[0.03] dark:opacity-[0.03]" />
    </div>
    <Header locale={locale} onLocaleChange={handleLocaleChange} isLocaleTransitioning={Boolean(languageTarget)} isDark={isDark} onThemeToggle={() => setIsDark((value) => !value)} />
    <main className="min-h-[calc(100svh-var(--mae-header-height))] w-full max-w-full overflow-x-hidden">{children}</main>
    <footer className="border-t border-slate-200/80 bg-white/40 backdrop-blur-xs dark:border-white/[0.08] dark:bg-[#08080A]/80">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16 w-full">
        <div className="grid items-start gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_0.9fr_1fr] lg:gap-12">
          {/* Column 1: Brand & Mission */}
          <div>
            <Link href="/" className="group inline-flex items-center gap-2.5 text-slate-950 dark:text-white">
              <span className="text-xl font-black tracking-tight">
                MAE <span className="mae-gradient-text font-black">Academy</span>
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t("footer.description")}
            </p>
            <a
              href="mailto:maeacademy2026@gmail.com"
              className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
            >
              <Mail className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span>maeacademy2026@gmail.com</span>
            </a>
          </div>

          {/* Column 2: Platform Navigation */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              {t("footer.platform")}
            </p>
            <nav className="mt-4 flex flex-col gap-3 text-sm">
              <PrefetchLink
                href="/research"
                className="group inline-flex items-center gap-2.5 text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
              >
                <Compass className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600 dark:text-slate-500 dark:group-hover:text-violet-300" />
                <span className="font-medium">{t("footer.research")}</span>
              </PrefetchLink>
              <PrefetchLink
                href="/library"
                className="group inline-flex items-center gap-2.5 text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
              >
                <BookOpen className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600 dark:text-slate-500 dark:group-hover:text-violet-300" />
                <span className="font-medium">{t("footer.library")}</span>
              </PrefetchLink>
              <PrefetchLink
                href="/simulations"
                className="group inline-flex items-center gap-2.5 text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
              >
                <Cpu className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600 dark:text-slate-500 dark:group-hover:text-violet-300" />
                <span className="font-medium">{t("footer.simulations")}</span>
              </PrefetchLink>
            </nav>
          </div>

          {/* Column 3: Legal & Compliance */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              {t("footer.legalAndCompliance")}
            </p>
            <nav className="mt-4 flex flex-col gap-3 text-sm">
              <Link
                href="/privacy-policy"
                className="group inline-flex items-center gap-2.5 text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
              >
                <ShieldCheck className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600 dark:text-slate-500 dark:group-hover:text-violet-300" />
                <span className="font-medium">
                  {t("footer.privacyPolicy")}
                </span>
              </Link>
              <Link
                href="/terms-of-service"
                className="group inline-flex items-center gap-2.5 text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
              >
                <FileText className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600 dark:text-slate-500 dark:group-hover:text-violet-300" />
                <span className="font-medium">
                  {t("footer.termsOfService")}
                </span>
              </Link>
              <Link
                href="/attribution-policy"
                className="group inline-flex items-center gap-2.5 text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
              >
                <ShieldCheck className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-600 dark:text-slate-500 dark:group-hover:text-violet-300" />
                <span className="font-medium">
                  {t("footer.attributionPolicy")}
                </span>
              </Link>
            </nav>
          </div>

          {/* Column 4: Community, Languages & Support */}
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              {/* Language Switcher */}
              <SegmentedControl
                options={languageOptions.map((opt) => ({
                  label: opt.label,
                  value: opt.key,
                }))}
                value={locale}
                onChange={handleLocaleChange}
                disabled={Boolean(languageTarget)}
                size="sm"
                aria-label="Platform Language"
              />

              {/* Social Links */}
              <div>
                <SocialLinks className="gap-4.5" />
              </div>

              {/* Support Open Engineering CTA */}
              <div>
                <a
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-2xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:bg-white hover:text-rose-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-rose-400 dark:hover:bg-white/10 dark:hover:text-rose-300"
                >
                  <Heart className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                  <span>{t("footer.supportOurMission")}</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Subtle Legal Links */}
        <div className="mt-12 pt-8 border-t border-slate-200/60 dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/privacy-policy"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              {t("footer.privacyPolicy")}
            </Link>
            <span>·</span>
            <Link
              href="/terms-of-service"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              {t("footer.termsOfService")}
            </Link>
            <span>·</span>
            <Link
              href="/attribution-policy"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              {t("footer.attributionPolicy")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
    <LanguageTransition target={languageTarget} />
  </div></LocaleProvider>;
}
