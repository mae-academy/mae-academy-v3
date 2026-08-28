import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export type SimulatorLayoutTab = {
  slug: string;
  label: string;
};

type SimulatorLayoutProps = {
  title: string;
  tabs: readonly SimulatorLayoutTab[];
  activeTab: string;
  routePrefix: string;
  backLabel: string;
  isRtl?: boolean;
  hideToolNavigation?: boolean;
  compact?: boolean;
  station?: { identifier: string; outcome: string; metadata: readonly string[] };
  children: ReactNode;
};

/**
 * The single simulator page frame used by every routed MAE Academy simulator.
 * It deliberately owns navigation and page hierarchy only; each tool continues
 * to own its own controls, model state, and workspace.
 */
export default function SimulatorLayout({ title, tabs, activeTab, routePrefix, backLabel, isRtl = false, hideToolNavigation = false, compact = false, station, children }: SimulatorLayoutProps) {
  return <section className={`container min-h-[calc(100svh-var(--mae-header-height))] ${compact ? "py-6 sm:py-8" : "py-10 sm:py-16"}`}>
    <Link href="/simulations" className="flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
      <ArrowLeft className={`h-4 w-4 stroke-[1.5] ${isRtl ? "rotate-180" : ""}`} />
      {backLabel}
    </Link>

    {station ? <section className="relative mt-6 mb-6 overflow-hidden border-y border-slate-200 py-5 dark:border-slate-700"><div className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-blue-500 via-violet-500 to-rose-500"/><div className="relative grid gap-5 ps-5 md:grid-cols-[minmax(0,1fr)_17rem] md:items-end"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-violet-700 dark:text-violet-300">{station.identifier}</p><h1 className="mae-display mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 dark:text-slate-300">{station.outcome}</p></div><div className="relative grid grid-cols-2 gap-2 border-s border-slate-200 ps-4 font-mono text-[9px] font-bold uppercase tracking-[.13em] text-slate-500 dark:border-slate-700 dark:text-slate-400">{station.metadata.map((value, index) => <span key={value} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">{value}</span>)}<span className="absolute -start-1.5 -bottom-1.5 h-3 w-3 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,.8)] dark:border-slate-950" aria-label="MAE reference point"/></div></div></section> : <h1 className={`mae-display text-center font-extrabold tracking-tight text-slate-900 dark:text-white ${compact ? "mt-4 mb-5 text-3xl md:text-4xl" : "mt-6 mb-12 text-5xl md:text-6xl"}`}>
      {title}
    </h1>}

    {!hideToolNavigation && <nav aria-label={`${title} tools`} className={`${compact ? "mb-4" : "mb-8"} overflow-x-auto pb-1`}>
      <div className="flex w-full min-w-max max-w-5xl mx-auto overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {tabs.map((tab, index) => {
          const active = tab.slug === activeTab;
          return <Link key={tab.slug} href={`${routePrefix}/${tab.slug}`} className={`flex min-h-14 flex-1 items-center justify-center px-6 py-4 text-center text-sm font-semibold transition-all focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 ${active ? (compact ? "bg-violet-700 text-white" : "bg-gradient-to-r from-blue-600 to-pink-500 text-white") : `bg-white text-slate-500 hover:bg-gray-50 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${index === 0 ? "" : "border-s border-gray-200 dark:border-slate-700"}`}`}>
            {tab.label}
          </Link>;
        })}
      </div>
    </nav>}

    {children}
  </section>;
}
