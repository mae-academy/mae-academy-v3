/**
 * Block Diagram & Signal Flow Graph — placeholder card until the simulation
 * engine ships. Mirrors the control-systems studio shell (pure white card).
 */
export function BlockDiagramStudio() {
  return (
    <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="mb-4 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        Module Under Development
      </span>
      <h2 className="mb-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
        Block Diagram &amp; Signal Flow Graph
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Algebraic reductions, Mason&rsquo;s gain formula solver, and interactive flow-graph topology simulation will be available here soon.
      </p>
    </section>
  );
}

export default BlockDiagramStudio;
