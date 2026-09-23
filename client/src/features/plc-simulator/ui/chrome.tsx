import type { ReactNode } from 'react';

/**
 * Shared visual vocabulary of the PLC studio. Every class string is lifted from Arduino Studio and
 * the unified workspace shell, so the simulator sits in the same design system as the other tools.
 */

export const PANEL =
  'flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-[#1a1d24] dark:bg-[#0d0f12]';

export const PANEL_HEADER =
  'flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#1a1d24] dark:bg-[#0d0f12]';

/** Uppercase panel heading used by the component library and inspector. */
export const PANEL_TITLE = 'text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white';

/** Dot-grid canvas surface, identical to the Arduino board canvas. */
export const CANVAS_SURFACE = 'bg-slate-50 dark:bg-[#07080a]';
export const CANVAS_DOTS_STYLE = {
  backgroundImage: 'radial-gradient(circle, rgba(148,163,184,.25) 1px, transparent 1px)',
  backgroundSize: '20px 20px',
} as const;

export const PILL_BUTTON =
  'h-9 inline-flex items-center justify-center gap-1.5 px-2.5 text-xs font-medium transition active:scale-[.98] whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-300 dark:hover:bg-[#13161c]';

export const ICON_PILL_BUTTON = `${PILL_BUTTON} w-9 px-0`;

export const FIELD_INPUT =
  'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-100';

export function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200 dark:bg-[#1a1d24]" />;
}

/** macOS window controls, as drawn in the Code Studio and Arduino Studio editors. */
export function MacDots() {
  return (
    <div aria-hidden="true" className="me-2 flex shrink-0 items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full border border-[#E0443E]/40 bg-[#FF5F56]" />
      <span className="h-2.5 w-2.5 rounded-full border border-[#DEA123]/40 bg-[#FFBD2E]" />
      <span className="h-2.5 w-2.5 rounded-full border border-[#1AAB29]/40 bg-[#27C93F]" />
    </div>
  );
}

export interface WindowBarProps {
  icon: ReactNode;
  title: string;
  /** Right-aligned meta text or controls. */
  trailing?: ReactNode;
}

/** Title bar of an editor window: traffic-light dots, icon, mono file name. */
export function WindowBar({ icon, title, trailing }: WindowBarProps) {
  return (
    <div className={PANEL_HEADER}>
      <div className="flex min-w-0 items-center gap-1.5">
        <MacDots />
        <span className="ms-0.5 text-slate-500 dark:text-slate-400">{icon}</span>
        <span className="truncate font-sans text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</span>
      </div>
      {trailing !== undefined && <div className="shrink-0 font-sans text-[11px] text-slate-400 dark:text-slate-500">{trailing}</div>}
    </div>
  );
}
