/**
 * MAE Academy / Signals & Systems — Tab D Fourier-series coefficients panel.
 * Compact full-width card: a top band (definitions + T₀/ω₀ on the left, the c₀ calculation on the right), then
 * the positive and negative harmonics as two horizontal rows whose tiles line up column-for-column (c_k above c_{-k}).
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { KatexMath } from "@/components/ui/KatexMath";
import type { ComplexCoefficient } from "@shared/signals/results";

type Props = { coefficients: ComplexCoefficient[]; spanLimit: number; period: number; omega0: number; className?: string };

const number = (value: number, digits = 4) => Number(value.toFixed(digits)).toString();
const TILE_GRID = "grid grid-cols-[repeat(auto-fit,minmax(6.75rem,1fr))] gap-2";

function CoefficientTile({ harmonic, item }: { harmonic: number; item?: ComplexCoefficient }) {
  const magnitude = item?.magnitude ?? 0; const phase = item?.phase ?? 0;
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50/60 px-1.5 py-1.5 text-center text-[11px] leading-snug text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
      <KatexMath math={`c_{${harmonic}}`} className="text-xs font-bold text-slate-800 dark:text-slate-100" />
      <KatexMath math={`|c_{${harmonic}}|=${magnitude.toFixed(4)}`} />
      <KatexMath math={`\\angle c_{${harmonic}}=${phase.toFixed(3)}`} className="text-slate-500 dark:text-slate-400" />
    </div>
  );
}

function HarmonicRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
      <div className={TILE_GRID}>{children}</div>
    </div>
  );
}

export function SelectedCoefficientsTable({ coefficients, spanLimit, period, omega0, className }: Props) {
  const { t } = useTranslation('simulators');
  const c0 = coefficients.find((item) => item.harmonic === 0);
  const harmonics = Array.from({ length: spanLimit }, (_, index) => index + 1).filter((n) => coefficients.some((item) => Math.abs(item.harmonic) === n));
  const find = (harmonic: number) => coefficients.find((item) => item.harmonic === harmonic);

  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/70 sm:p-4", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800/80 mae-card-header-row panel-header" data-slot="card-header">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white mae-card-header-title">{t('signals.fourierCoefficients', 'Fourier coefficients')}</h3>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mae-card-header-actions shrink-0"><KatexMath math={`n \\in [${-spanLimit}, ${spanLimit}]`} /></span>
      </header>

      <div className="grid gap-4 pt-3 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
          <KatexMath math={String.raw`c_n=\frac{1}{T_0}\int_{\langle T_0\rangle}x(t)\,e^{-jn\omega_0t}\,dt`} className="block overflow-x-auto" />
          <KatexMath math={String.raw`x(t)=\sum_{n=-\infty}^{\infty}c_n\,e^{jn\omega_0t}`} className="block overflow-x-auto" />
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60"><KatexMath math={`T_0=${number(period)}\\text{ s}`} /></span>
            <span className="rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60"><KatexMath math={`\\omega_0=\\frac{2\\pi}{T_0}=${number(omega0)}\\text{ rad/s}`} /></span>
          </div>
          {c0 && (
            <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-violet-300/80 bg-violet-50/70 px-3 py-2 text-center text-sm dark:border-violet-500/40 dark:bg-violet-950/25">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">{t('signals.dcComponent', 'DC component')}</p>
              <KatexMath math={String.raw`c_0=\frac{1}{T_0}\int_{\langle T_0\rangle}x(t)\,dt=${c0.real.toFixed(4)}`} className="max-w-full overflow-x-auto text-violet-800 dark:text-violet-200" />
              <KatexMath math={`|c_0|=${c0.magnitude.toFixed(4)},\\ \\angle c_0=${c0.phase.toFixed(3)}`} className="text-xs text-slate-600 dark:text-slate-300" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-slate-100 lg:pl-4 lg:dark:border-slate-800/80">
          <HarmonicRow title={t('signals.positiveHarmonics', 'Positive harmonics')}>
            {harmonics.map((n) => <CoefficientTile key={n} harmonic={n} item={find(n)} />)}
          </HarmonicRow>
          <HarmonicRow title={t('signals.negativeHarmonics', 'Negative harmonics')}>
            {harmonics.map((n) => <CoefficientTile key={n} harmonic={-n} item={find(-n)} />)}
          </HarmonicRow>
        </div>
      </div>
    </section>
  );
}

export default SelectedCoefficientsTable;
