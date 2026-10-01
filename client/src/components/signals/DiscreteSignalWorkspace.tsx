/**
 * MAE Academy / Signals & Systems — Tab A discrete-time workspace.
 * Mirrors the continuous layout: the unified terminal + ACADEMIC TEST SIGNALS live in the header card
 * (DiscreteInputPanel); the dominant stem scope, ACADEMIC ANALYSIS (energy/power, period, symmetry), and
 * SAMPLE ARRAYS sit below it (DiscreteResults). Transformations are typed directly, e.g. x[n−2] or x[−n].
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { InnerBox, StatusBadge, StudioCard } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import { DiscreteStemPlot } from "@/components/signals/DiscreteStemPlot";
import { analyzeSequence, discreteWindow, discreteYDomain, evaluateDiscrete, parseDiscreteSignal, sampleSequence, sequenceArrayLatex, type SequenceAnalysis } from "@shared/signals/discreteSignalEngine";

const tex = String.raw;
const ORIGINAL = "#2563EB";
export const DISCRETE_DEFAULT = tex`u[n]-u[n-5]`;
const presets = [
  { label: tex`u[n]-u[n-5]`, latex: tex`u[n]-u[n-5]` },
  { label: tex`\delta[n]+2\delta[n-1]-\delta[n-2]`, latex: tex`\delta[n]+2\delta[n-1]-\delta[n-2]` },
  { label: tex`(0.8)^{n}u[n]`, latex: tex`(0.8)^{n}u[n]` },
  { label: tex`\cos\left(\frac{\pi}{4}n\right)`, latex: tex`\cos\left(\frac{\pi}{4}n\right)` },
  { label: tex`r[n]-r[n-4]`, latex: tex`r[n]-r[n-4]` },
  { label: tex`\text{rect}_{3}[n]`, latex: tex`\text{rect}_{3}[n]` },
] as const;
const fmt = (value: number | null) => (value === null ? "\\infty" : Number(value.toFixed(4)).toString());
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** ω₀ = 2π/N₀ reduced, e.g. N₀ = 8 → π/4. */
function fundamentalFrequencyTex(period: number) {
  const divisor = gcd(2, period); const numerator = 2 / divisor; const denominator = period / divisor;
  const top = numerator === 1 ? "\\pi" : `${numerator}\\pi`;
  return denominator === 1 ? top : `\\frac{${top}}{${denominator}}`;
}

type PanelProps = { expression: string; onExpressionChange: (latex: string) => void };

export function DiscreteInputPanel({ expression, onExpressionChange }: PanelProps) {
  const { t } = useTranslation('simulators');
  const parsed = useMemo(() => parseDiscreteSignal(expression), [expression]);
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <UnifiedSignalEngineTerminal
        key="discrete"
        title={t('signals.signalEngineTitle', 'Signal Engine')}
        domain="n"
        channels={[{ id: "x", lhs: "x[n]", value: expression, onChange: onExpressionChange, error: parsed.ok ? null : parsed.error }]}
      />
      <InnerBox className="self-start">
        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">{t('signals.academicTestSignals', 'Academic test signals')}</p>
        <div className="mt-3 grid gap-2">
          {presets.map((preset, index) => (
            <button
              key={preset.latex}
              data-testid={`discrete-preset-${index}`}
              type="button"
              onClick={() => onExpressionChange(preset.latex)}
              className="flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-left text-xs font-bold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 active:scale-[0.97] dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200"
            >
              <KatexMath math={preset.label} />
            </button>
          ))}
        </div>
      </InnerBox>
    </div>
  );
}

function Analysis({ analysis }: { analysis: SequenceAnalysis }) {
  const { t } = useTranslation('simulators');
  const classification = analysis.classification === "Power Signal"
    ? <span className="font-serif text-base tracking-wide text-blue-600 dark:text-blue-400"><KatexMath math="\text{Power Signal}" /></span>
    : analysis.classification === "Energy Signal"
      ? <span className="font-serif text-base tracking-wide text-purple-600 dark:text-purple-400"><KatexMath math="\text{Energy Signal}" /></span>
      : <span className="font-serif text-base text-slate-500 dark:text-slate-400"><KatexMath math="\text{Neither}" /></span>;
  const symmetryLabel = {
    even: t('signals.symmetryEven', 'Even'),
    odd: t('signals.symmetryOdd', 'Odd'),
    "even and odd": t('signals.symmetryEvenOdd', 'Even & Odd (x ≡ 0)'),
    neither: t('signals.neither', 'Neither'),
  }[analysis.symmetry];
  const symmetryRelation = analysis.symmetry === "even" ? "x[-n]=x[n]" : analysis.symmetry === "odd" ? "x[-n]=-x[n]" : analysis.symmetry === "even and odd" ? "x[n]=0\\ \\forall n" : "x[-n]\\ne\\pm x[n]";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InnerBox>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('signals.classification', 'Classification')}</span>
          <div data-testid="discrete-classification" className="mt-1">{classification}</div>
        </InnerBox>
        <InnerBox>
          <p className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-500 dark:text-slate-400">{t('signals.periodicity', 'Periodicity')}</p>
          <div className="mt-1.5">
            <StatusBadge variant={analysis.period !== null ? "info" : "neutral"} className="uppercase tracking-wider text-[10px]">{analysis.period !== null ? t('signals.periodic', 'Periodic') : t('signals.aperiodic', 'Aperiodic')}</StatusBadge>
          </div>
        </InnerBox>
      </div>

      {analysis.period !== null && (
        <InnerBox>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{t('signals.fundamentalPeriod', 'Fundamental period')}</p>
          <div className="mt-2.5 space-y-2" data-testid="discrete-period">
            <KatexMath math={`N_0=${analysis.period}\\text{ samples}`} block className="text-sm text-violet-700 dark:text-violet-200" />
            <KatexMath math={`\\omega_0=\\frac{2\\pi}{N_0}=${fundamentalFrequencyTex(analysis.period)}\\text{ rad/sample}`} block className="text-sm text-violet-700 dark:text-violet-200" />
          </div>
        </InnerBox>
      )}

      <InnerBox>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{t('signals.symmetryLabel', 'Symmetry')}</p>
        <div data-testid="discrete-symmetry" className="mt-2 flex flex-wrap items-center gap-3">
          <StatusBadge variant={analysis.symmetry === "neither" ? "neutral" : "default"} className="uppercase tracking-wider text-[10px]">{symmetryLabel}</StatusBadge>
          <KatexMath math={symmetryRelation} className="text-sm text-slate-700 dark:text-slate-200" />
        </div>
      </InnerBox>

      <InnerBox>
        <div className="space-y-4">
          <div>
            <KatexMath math={String.raw`E_x=\sum_{n=-\infty}^{\infty}|x[n]|^2`} className="block text-xs text-slate-500 dark:text-slate-400" />
            <div className="mt-1.5" data-testid="discrete-energy"><KatexMath math={`E_x=${fmt(analysis.energy)}`} className="text-base text-slate-900 dark:text-white" /></div>
          </div>
          <div>
            <KatexMath math={String.raw`P_x=\lim_{N\to\infty}\frac{1}{2N+1}\sum_{n=-N}^{N}|x[n]|^2`} className="block text-xs text-slate-500 dark:text-slate-400" />
            <div className="mt-1.5" data-testid="discrete-power"><KatexMath math={`P_x=${fmt(analysis.power)}`} className="text-base text-slate-900 dark:text-white" /></div>
          </div>
        </div>
      </InnerBox>
    </div>
  );
}

export function DiscreteResults({ expression }: { expression: string }) {
  const { t } = useTranslation('simulators');
  const parsed = useMemo(() => parseDiscreteSignal(expression), [expression]);
  const samples = useMemo(() => (parsed.ok ? sampleSequence(parsed.node) : []), [parsed]);
  const frame = useMemo(() => discreteWindow([samples]), [samples]);
  const yDomain = useMemo(() => discreteYDomain([samples], frame), [frame, samples]);
  const analysis = useMemo(() => (parsed.ok ? analyzeSequence((n) => evaluateDiscrete(parsed.node, n)) : null), [parsed]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
      <StudioCard>
        <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">{t('signals.discreteSignalView', 'Discrete signal view')}</h4>
        {parsed.ok ? (
          <DiscreteStemPlot testId="stem-original" title={tex`\text{Original sequence } x[n]`} name="x[n]" samples={samples} color={ORIGINAL} window={frame} yDomain={yDomain} height={360} />
        ) : (
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500">{t('signals.awaitingValidSequence', 'Awaiting a valid sequence')}</p>
          </div>
        )}
      </StudioCard>

      <div className="space-y-6 self-start">
        <StudioCard className="space-y-4">
          <h3 className="border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800 dark:border-slate-800 dark:text-white">{t('signals.academicAnalysis', 'ACADEMIC ANALYSIS')}</h3>
          {analysis ? <Analysis analysis={analysis} /> : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('signals.awaitingValidInput', 'Awaiting valid input')}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">{!parsed.ok ? parsed.error : ""}</p>
            </div>
          )}
        </StudioCard>
        {parsed.ok && (
          <StudioCard className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800 dark:border-slate-800 dark:text-white">{t('signals.sampleArrays', 'Sample arrays')}</h3>
            <div data-testid="array-original" className="overflow-x-auto rounded-xl border border-blue-200/70 bg-blue-50/60 px-3 py-2 text-sm text-slate-900 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-white">
              <KatexMath math={sequenceArrayLatex("x", samples)} />
            </div>
            <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">{t('signals.underlinedEntryPrefix', 'The underlined entry marks ')}<KatexMath math="n=0" />{t('signals.underlinedEntrySuffix', '.')}</p>
          </StudioCard>
        )}
      </div>
    </div>
  );
}
