/**
 * MAE Academy / Signals & Systems — Tab D analytic Fourier pair card.
 * Forward: 𝓕{x(t)} = X(jω) with term-by-term table pairs (plus c_n = X(jnω₀)/T₀ in series mode).
 * Inverse: 𝓕⁻¹{X(jω)} = x(t). Falls back to a "numerical spectrum" notice when no table entry applies.
 */
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { StatusBadge } from "@/components/common/templates";

type Props = {
  direction: "forward" | "inverse";
  /** Solved equation, e.g. "X(j\\omega)=\\frac{1}{2+j\\omega}"; null when unsolved. */
  latex: string | null;
  pairs?: Array<{ timeLatex: string; freqLatex: string }>;
  notes?: string[];
  error?: string | null;
  seriesMode?: boolean;
};

const note = "mt-3 rounded-r-xl border-l-2 border-violet-400 bg-violet-50/70 px-3 py-2 text-xs leading-5 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200";

export function FourierTransformCard({ direction, latex, pairs = [], notes = [], error = null, seriesMode = false }: Props) {
  const { t } = useTranslation('simulators');
  const forward = direction === "forward";
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{forward ? t('signals.fourierTransform', 'Fourier Transform') : t('signals.inverseFourierTransform', 'Inverse Fourier Transform')}</h3>
          <KatexMath math={forward ? String.raw`\mathcal{F}\{x(t)\}=X(j\omega)` : String.raw`\mathcal{F}^{-1}\{X(j\omega)\}=x(t)`} className="mt-1 block text-sm text-slate-600 dark:text-slate-300" />
        </div>
        <StatusBadge variant={latex ? "info" : "neutral"} className="uppercase tracking-wider text-[10px]">{latex ? t('signals.analytic', 'Analytic') : t('signals.numerical', 'Numerical')}</StatusBadge>
      </header>

      {latex ? (
        <>
          <div data-testid="fourier-solution" className="mt-4 overflow-x-auto rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 text-center text-lg text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-white">
            <KatexMath math={latex} displayMode />
          </div>
          {seriesMode && forward && (
            <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              {t('signals.periodicExtensionLabel', 'Periodic extension:')} <KatexMath math={String.raw`c_n=\frac{1}{T_0}X(jn\omega_0)`} /> {t('signals.onePeriodOf', 'when one period of')} <KatexMath math="x(t)" /> {t('signals.fitsInside', 'fits inside')} <KatexMath math={String.raw`[-T_0/2,\,T_0/2]`} />.
            </p>
          )}
          {pairs.length > 1 && (
            <details open className="mt-3">
              <summary className="cursor-pointer select-none text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-200">{t('signals.termByTermPairs', 'Term-by-term transform pairs')}</summary>
              <ul className="mt-2 space-y-1.5">
                {pairs.map((pair, index) => (
                  <li key={`${pair.timeLatex}-${index}`} className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-slate-200/70 bg-white/70 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                    <KatexMath math={pair.timeLatex} />
                    <KatexMath math={String.raw`\;\xleftrightarrow{\;\mathcal{F}\;}\;`} />
                    <KatexMath math={pair.freqLatex} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center dark:border-slate-700 dark:bg-slate-950/40">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{forward ? t('signals.noClosedFormTransform', 'No closed-form transform') : t('signals.noClosedFormInverse', 'No closed-form inverse')}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">{error ?? t('signals.enterExpressionPlaceholder', 'Enter an expression from the keypad.')}</p>
          {forward && error && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t('signals.spectraNumericIntro', 'The spectra below are computed numerically from ')}<KatexMath math={String.raw`\int x(t)e^{-j\omega t}\,dt`} />.</p>}
        </div>
      )}
      {notes.map((text) => <p key={text} role="status" className={note}>{text}</p>)}
    </section>
  );
}

export default FourierTransformCard;
