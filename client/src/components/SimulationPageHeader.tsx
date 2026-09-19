import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import SegmentedControl from "@/components/ui/SegmentedControl";

/**
 * A single reusable tool-tab item for the MAE Academy simulator toolbar.
 * `id` is the stable key / active-tool value; `label` is the localized text.
 */
export type SimulationPageTool = { id: string; label: string };

export interface SimulationPageHeaderProps {
  /** Localized simulation title, rendered centered between the back button and the toolbar. */
  title?: string;
  /** Subtitle or short description text below title. */
  subtitle?: string;
  /** Localized text for the back pill (e.g. footer.simulations). */
  backLabel?: string;
  /** Route the back pill navigates to. Defaults to "/simulations". */
  backRoute?: string;
  /** Ordered tool tabs rendered as the segmented toolbar. */
  tools?: ReadonlyArray<SimulationPageTool>;
  /** Currently selected tool id (controlled from the caller's route/state). */
  activeTool?: string;
  /** Invoked with the selected tool id when a tab is clicked. */
  onSelectTool?: (id: string) => void;
  /** Flip the back arrow for RTL locales. */
  isRtl?: boolean;
  /** Compact typography + spacing variant (maintained for backwards compatibility). */
  compact?: boolean;
  /** Show the back pill. Defaults to true. */
  showBack?: boolean;
  /** Show the centered title. Defaults to true. */
  showTitle?: boolean;
  /** Render the segmented toolbar. Defaults to true. */
  showToolNavigation?: boolean;
  /** Custom container class override. */
  className?: string;
}

/**
 * The single canonical simulation page header + toolbar for MAE Academy.
 *
 * Shared by every Practical Simulation workspace so that font family, size, color,
 * and vertical margins (mb-8 distance to toolbar/workspace) are 100% identical.
 */
export function SimulationPageHeader({
  title,
  subtitle,
  backLabel,
  backRoute = "/simulations",
  tools = [],
  activeTool = "",
  onSelectTool,
  isRtl = false,
  compact = false,
  showBack = true,
  showTitle = true,
  showToolNavigation = true,
  className = "",
}: SimulationPageHeaderProps) {
  const hasTools = tools && tools.length > 0 && Boolean(onSelectTool);

  return (
    <div className={`w-full flex flex-col items-center justify-center text-center ${className}`}>
      {showBack && backLabel ? (
        <div className="w-full flex justify-start mb-6">
          <Link
            href={backRoute}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.08] dark:bg-[#08080A] dark:text-zinc-200 dark:hover:bg-white/[0.04]"
          >
            <ArrowLeft className={`h-4 w-4 stroke-[1.5] ${isRtl ? "rotate-180" : ""}`} />
            {backLabel}
          </Link>
        </div>
      ) : null}

      {showTitle && title ? (
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white select-none">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
      ) : null}

      {showToolNavigation && hasTools ? (
        <nav
          aria-label={`${title ?? "Simulation"} tools`}
          className="mb-8 flex justify-center overflow-x-auto pb-1 w-full"
        >
          <SegmentedControl
            options={tools.map((tool) => ({ label: tool.label, value: tool.id }))}
            value={activeTool}
            onChange={onSelectTool!}
            size="lg"
            className="shadow-sm"
            aria-label={`${title ?? "Simulation"} tools`}
          />
        </nav>
      ) : null}
    </div>
  );
}

export default SimulationPageHeader;

