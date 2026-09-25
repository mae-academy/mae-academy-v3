/**
 * MAE Academy / Signals & Systems — Tab E forward Laplace card (time-domain mode).
 * Renders 𝓛{h(t)} = H(s) with the term-by-term table pairs that produced it.
 */
import { KatexMath } from "@/components/ui/KatexMath";
import { StatusBadge } from "@/components/common/templates";
import type { ForwardLaplaceResult } from "@/features/signals/engines/laplaceEngine";

type Props = { result: ForwardLaplaceResult | null };

export function ForwardLaplaceCard({ result }: Props) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Laplace Transform</h3>
          <KatexMath math={String.raw`\mathcal{L}\{h(t)\}=H(s)`} className="mt-1 block text-sm text-slate-600 dark:text-slate-300" />
        </div>
        <StatusBadge variant="info" className="uppercase tracking-wider text-[10px]">Unilateral · Causal</StatusBadge>
      </header>

      {result?.ok ? (
        <>
          <div data-testid="forward-laplace-hs" className="mt-4 overflow-x-auto rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 text-center text-lg text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-white">
            <KatexMath math={result.transformLatex} displayMode />
          </div>
          <details open className="mt-3">
            <summary className="cursor-pointer select-none text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-200">
              Term-by-term transform pairs
            </summary>
            <ul className="mt-2 space-y-1.5">
              {result.pairs.map((pair, index) => (
                <li key={`${pair.timeLatex}-${index}`} className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-slate-200/70 bg-white/70 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                  <KatexMath math={pair.timeLatex} />
                  <KatexMath math={String.raw`\;\xrightarrow{\;\mathcal{L}\;}\;`} />
                  <KatexMath math={pair.sLatex} />
                </li>
              ))}
            </ul>
          </details>
          {result.notes.map((note) => (
            <p key={note} role="status" className="mt-3 rounded-r-xl border-l-2 border-violet-400 bg-violet-50/70 px-3 py-2 text-xs leading-5 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">{note}</p>
          ))}
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center dark:border-slate-700 dark:bg-slate-950/40">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">No rational transform</p>
          <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">{result && !result.ok ? result.error : "Enter h(t) from the keypad, for example e^{-3t}u(t)."}</p>
        </div>
      )}
    </section>
  );
}

export default ForwardLaplaceCard;
