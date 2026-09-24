/**
 * Block Diagram & Signal Flow Graph — placeholder card until the simulation
 * engine ships. Mirrors the control-systems studio shell.
 */
import { StudioCard, StatusBadge } from "@/components/common/templates";

export function BlockDiagramStudio() {
  return (
    <StudioCard
      title="Block Diagram & Signal Flow Graph"
      actionSlot={<StatusBadge variant="neutral" label="Module Under Development" />}
      className="flex min-h-[420px] flex-col items-center justify-center text-center p-12"
    >
      <div className="max-w-md mx-auto space-y-3 py-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Block Diagram &amp; Signal Flow Graph
        </h2>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Algebraic reductions, Mason&rsquo;s gain formula solver, and interactive flow-graph topology simulation will be available here soon.
        </p>
      </div>
    </StudioCard>
  );
}

export default BlockDiagramStudio;

