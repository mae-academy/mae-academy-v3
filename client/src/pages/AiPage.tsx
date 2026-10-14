/** MAE AI: an engineering-professor chat assistant, optionally preset to a simulator lab via ?lab=. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Cpu, Lightbulb, ShieldAlert, Sparkles } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { LAB_CONTEXTS, type LabContext, type MascotState } from "@shared/aiTypes";
import { ChatBox } from "@/components/ai/ChatBox";
import { loadMinimized, saveMinimized } from "@/components/ai/chatStorage";
import { MascotVisualizer } from "@/components/ai/MascotVisualizer";
import { useMascotState } from "@/components/ai/useMascotState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { usePageTitle } from "@/hooks/usePageTitle";
import { aiPathForLab, parseLabParam, simulatorPathForLab } from "@/lib/aiLab";

const MASCOT_STATES: readonly MascotState[] = ["idle", "listening", "thinking", "eureka", "talking"];

const CARD = "rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/[0.08] dark:bg-[#08080A]/70 sm:p-5";

export default function AiPage() {
  const { t } = useTranslation("ai");
  usePageTitle(t("page.title"));

  // A chat UI has no indexable content; keep it out of search results.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const search = useSearch();
  const [, setLocation] = useLocation();
  const lab = parseLabParam(new URLSearchParams(search).get("lab"));
  const changeLab = useCallback((next: LabContext) => setLocation(aiPathForLab(next), { replace: true }), [setLocation]);
  // On narrow screens the switcher scrolls sideways; keep the selected lab visible (also after a deep link).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [lab]);

  const mascot = useMascotState();
  const [minimized, setMinimized] = useState(() => loadMinimized());
  const toggleMinimized = useCallback(() => {
    setMinimized((current) => {
      saveMinimized(!current);
      return !current;
    });
  }, []);

  const labOptions = useMemo(() => LAB_CONTEXTS.map((value) => ({ value, label: t(`labs.${value}`) })), [t]);
  const stateLabels = useMemo(() => Object.fromEntries(MASCOT_STATES.map((state) => [state, t(`mascot.states.${state}`)])) as Record<MascotState, string>, [t]);
  const bullets = t("info.items", { returnObjects: true }) as unknown as string[];
  const tips = t("info.tips", { returnObjects: true }) as unknown as string[];

  const mascotProps = { state: mascot.state, greeting: t("mascot.greeting"), stateLabels, toggleLabel: t("mascot.toggle") };

  return (
    <div className="mx-auto w-full max-w-[1536px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] rtl:tracking-normal text-violet-700 dark:text-violet-300">{t("page.eyebrow")}</p>
          <h1 className="mae-display mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            MAE <span className="mae-gradient-text">AI</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600 dark:text-zinc-400">{t("page.subtitle")}</p>
        </div>
        {/* Small screens: the mascot is a compact avatar next to the title; the full one lives in the sidebar. */}
        <div className="shrink-0 lg:hidden">
          <MascotVisualizer {...mascotProps} minimized />
        </div>
      </header>

      <nav ref={navRef} aria-label={t("page.labsAria")} className="mb-5 flex justify-start overflow-x-auto no-scrollbar pb-1 sm:justify-center">
        <SegmentedControl options={labOptions} value={lab} onChange={changeLab} size="lg" layoutId="ai-lab" className="shrink-0 shadow-sm" aria-label={t("page.labsAria")} />
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
        <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          <div className={`${CARD} hidden justify-center lg:flex`}>
            <MascotVisualizer {...mascotProps} minimized={minimized} onToggleMinimized={toggleMinimized} className={minimized ? undefined : "mx-auto"} />
          </div>

          <section className={CARD} aria-labelledby="mae-ai-info-title">
            <h2 id="mae-ai-info-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rtl:tracking-normal text-slate-800 dark:text-white">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />
              {t("info.title")}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm text-slate-600 marker:text-violet-500 dark:text-zinc-300">
              {bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <h3 className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider rtl:tracking-normal text-slate-800 dark:text-white">
              <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {t("info.tipsTitle")}
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-slate-600 marker:text-amber-500 dark:text-zinc-300">
              {tips.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("info.disclaimer")}</span>
            </p>
          </section>

          {/* The site's ads are served by the page-level AdSense script; this slot is a first-party shortcut, not an ad unit. */}
          <section className={CARD} aria-labelledby="mae-ai-explore-title">
            <h2 id="mae-ai-explore-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rtl:tracking-normal text-slate-800 dark:text-white">
              <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
              {t("explore.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">{t("explore.body")}</p>
            <Link
              href={simulatorPathForLab(lab)}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.08]"
            >
              <span>{lab === "general" ? t("explore.general") : t("explore.lab", { lab: t(`labs.${lab}`) })}</span>
              <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          </section>
        </aside>

        <ChatBox
          lab={lab}
          mascot={mascot}
          className="order-1 h-[min(44rem,calc(100dvh-5rem))] min-h-[28rem] lg:order-2 lg:h-[max(34rem,calc(100dvh-var(--mae-header-height)-2rem))]"
        />
      </div>
    </div>
  );
}
