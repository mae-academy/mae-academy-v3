import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StudioCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actionSlot?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function StudioCard({ title, subtitle, actionSlot, className, children }: StudioCardProps) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-sm p-3.5 sm:p-4 lg:p-5 transition-all", className)}>
      {(title || subtitle || actionSlot) && (
        <header
          data-slot="card-header"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-4 mae-card-header-row panel-header"
        >
          <div className="mae-card-header-title min-w-0">
            {title && <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actionSlot && <div className="mae-card-header-actions max-w-full sm:shrink-0">{actionSlot}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

