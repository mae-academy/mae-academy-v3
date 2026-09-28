/**
 * MAE Academy / Signals & Systems — unified multi-step KaTeX derivation renderer.
 * One flat container: header (title, transform pair, final target), then STEP rows split by dividers.
 * Shared by the Fourier series, CTFT / inverse CTFT and Laplace / inverse Laplace studios.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { KatexMath } from "@/components/ui/KatexMath";

export type ContinuousDerivationStep = { title: string; lines: string[] };

type Props = {
  title: string;
  /** KaTeX transform-pair caption, e.g. `\mathcal{F}\{x(t)\}=X(j\omega)`. */
  pair?: string;
  steps: ContinuousDerivationStep[];
  /** Final target formula; defaults to the first line of the last step. */
  target?: string | null;
  badge?: ReactNode;
  /** Controls (e.g. a segmented pill) rendered under the title row. */
  actions?: ReactNode;
  notes?: string[];
  error?: string | null;
  targetTestId?: string;
  className?: string;
};

const STEP_PREFIX = /^\s*step\s*(\d+)\s*[—–:-]\s*/i;

function splitTitle(title: string, index: number) {
  const match = STEP_PREFIX.exec(title);
  return { number: match ? Number(match[1]) : index + 1, label: title.replace(STEP_PREFIX, "") };
}

export function ContinuousDerivationCard({ title, pair, steps, target, badge, actions, notes = [], error = null, targetTestId, className }: Props) {
  const finalFormula = target === undefined ? steps[steps.length - 1]?.lines[0] ?? null : target;
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-md transition-all dark:border-slate-800 dark:bg-slate-900/70 sm:p-4 lg:p-5", className)}>
      <header className="border-b border-slate-100 pb-4 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{title}</h3>
          {badge}
        </div>
        {actions && <div className="mt-3">{actions}</div>}
        {pair && <KatexMath math={pair} className="mt-1 block text-sm text-slate-500 dark:text-slate-400" />}
        {finalFormula && !error && (
          <div data-testid={targetTestId} className="mt-3 overflow-x-auto rounded-xl border border-slate-200/60 bg-slate-50/70 p-3 text-center text-base text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:text-white">
            <KatexMath math={finalFormula} displayMode />
          </div>
        )}
      </header>

      {error ? (
        <p role="status" className="pt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{error}</p>
      ) : (
        <ol className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {steps.map((step, index) => {
            const { number, label } = splitTitle(step.title, index);
            return (
              <li key={step.title} className="py-3.5 first:pt-3.5 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2 pb-1.5 text-left">
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                    Step {number}:
                  </span>
                  <span className="font-sans text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {label}
                  </span>
                </div>
                <div className="w-full min-w-0 space-y-1.5 overflow-x-auto text-center py-1">
                  {step.lines.map((line, lineIndex) => (
                    <KatexMath key={lineIndex} math={line} displayMode className="block text-sm text-slate-700 dark:text-slate-200" />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {notes.map((text) => <p key={text} role="status" className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500 dark:border-slate-800/80 dark:text-slate-400">{text}</p>)}
    </section>
  );
}

export default ContinuousDerivationCard;
