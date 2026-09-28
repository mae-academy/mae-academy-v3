import type { ReactNode } from "react";
import { useLocation } from "wouter";
import SimulationPageHeader, { type SimulationPageTool } from "./SimulationPageHeader";

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
 *
 * The universal heading and segmented toolbar are delegated to the shared
 * <SimulationPageHeader /> so every Practical Simulation shares the exact
 * Control Systems header/toolbar frame (size, colour, spacing).
 */
export default function SimulatorLayout({ title, tabs, activeTab, routePrefix, backLabel, isRtl = false, hideToolNavigation = false, compact = false, station, children }: SimulatorLayoutProps) {
  const [, setLocation] = useLocation();
  const tools: SimulationPageTool[] = tabs.map((tab) => ({ id: tab.slug, label: tab.label }));
  const handleSelectTool = (toolId: string) => setLocation(`${routePrefix}/${toolId}`);

  return <section className="container min-h-[calc(100svh-var(--mae-header-height))] py-6 sm:py-8">
    {station ? <section className="relative mt-6 mb-6 overflow-hidden border-y border-slate-200 py-5 dark:border-white/[0.08]"><div className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-[#2563EB] via-[#7C3AED] to-[#E11D48]"/><div className="relative grid gap-5 ps-5 md:grid-cols-[minmax(0,1fr)_17rem] md:items-end"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-violet-700 dark:text-violet-300">{station.identifier}</p><h1 className="mae-display mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 dark:text-zinc-400">{station.outcome}</p></div><div className="relative grid grid-cols-2 gap-2 border-s border-slate-200 ps-4 font-mono text-[9px] font-bold uppercase tracking-[.13em] text-slate-500 dark:border-white/[0.08] dark:text-zinc-400">{station.metadata.map((value) => <span key={value} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-white/[0.08] dark:bg-[#08080A]">{value}</span>)}<span className="absolute -start-1.5 -bottom-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#E11D48] shadow-[0_0_12px_rgba(225,29,72,.8)] dark:border-black" aria-label="MAE reference point"/></div></div></section> : null}

    <SimulationPageHeader
      title={station ? undefined : (title || undefined)}
      backLabel={backLabel}
      backRoute="/simulations"
      tools={tools}
      activeTool={activeTab}
      onSelectTool={handleSelectTool}
      isRtl={isRtl}
      compact={compact}
      showBack={!station}
      showTitle={!station && Boolean(title)}
      showToolNavigation={!hideToolNavigation}
    />

    {children}
  </section>;
}
