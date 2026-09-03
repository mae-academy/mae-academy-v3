import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

/**
 * A single reusable tool-tab item for the MAE Academy simulator toolbar.
 * `id` is the stable key / active-tool value; `label` is the localized text.
 */
export type SimulationPageTool = { id: string; label: string };

type SimulationPageHeaderProps = {
  /** Localized simulation title, rendered centered between the back button and the toolbar. */
  title?: string;
  /** Localized text for the back pill (e.g. footer.simulations). */
  backLabel?: string;
  /** Route the back pill navigates to. Defaults to "/simulations". */
  backRoute?: string;
  /** Ordered tool tabs rendered as the segmented toolbar. */
  tools: ReadonlyArray<SimulationPageTool>;
  /** Currently selected tool id (controlled from the caller's route/state). */
  activeTool: string;
  /** Invoked with the selected tool id when a tab is clicked. */
  onSelectTool: (id: string) => void;
  /** Flip the back arrow for RTL locales. */
  isRtl?: boolean;
  /** Compact typography + spacing variant (used by a few narrow tools). */
  compact?: boolean;
  /** Show the back pill. Defaults to true. */
  showBack?: boolean;
  /** Show the centered title. Defaults to true. */
  showTitle?: boolean;
  /** Render the segmented toolbar. Defaults to true. */
  showToolNavigation?: boolean;
};

/**
 * The single canonical simulation page header + toolbar for MAE Academy.
 *
 * This is the exact frame first defined on the Control Systems simulator and now
 * shared by every Practical Simulation so that size, color and spacing are 100%
 * identical across all of them. It is fully controlled: the caller owns the active
 * tool and decides what happens on selection (route push or local state).
 */
export default function SimulationPageHeader({
  title,
  backLabel,
  backRoute = "/simulations",
  tools,
  activeTool,
  onSelectTool,
  isRtl = false,
  compact = false,
  showBack = true,
  showTitle = true,
  showToolNavigation = true,
}: SimulationPageHeaderProps) {
  return (
    <>
      {showBack && backLabel ? (
        <Link href={backRoute} className="flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
          <ArrowLeft className={`h-4 w-4 stroke-[1.5] ${isRtl ? "rotate-180" : ""}`} />
          {backLabel}
        </Link>
      ) : null}

      {showTitle && title ? (
        <h1 className={`mae-display text-center font-extrabold tracking-tight text-slate-900 dark:text-white ${compact ? "mt-4 mb-5 text-3xl md:text-4xl" : "mt-6 mb-12 text-5xl md:text-6xl"}`}>
          {title}
        </h1>
      ) : null}

      {showToolNavigation && tools.length > 0 ? (
        <nav aria-label={`${title ?? "Simulation"} tools`} className={`${compact ? "mb-4" : "mb-8"} overflow-x-auto pb-1`}>
          <div className="mx-auto flex w-full min-w-max max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {tools.map((tool, index) => {
              const active = tool.id === activeTool;
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectTool(tool.id)}
                  className={`flex min-h-14 flex-1 items-center justify-center px-6 py-4 text-center text-sm font-semibold transition-all focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 ${active ? (compact ? "bg-violet-700 text-white" : "bg-gradient-to-r from-blue-600 to-pink-500 text-white") : `bg-white text-slate-500 hover:bg-gray-50 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${index === 0 ? "" : "border-s border-gray-200 dark:border-slate-700"}`}`}
                >
                  {tool.label}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}
