/**
 * MAE Academy / Signals & Systems — Tab A functional signal laboratory.
 * The unified SIGNAL ENGINE terminal feeds the unified signal parser; the scope
 * renders its sampled trace and structural Dirac impulses, and the analysis
 * card derives periodicity (GCD/LCM), energy, and power from the same model.
 * A top segmented control switches to the discrete-time x[n] workspace (stem plots, integer operations).
 */
import { useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { MathNumberInput, SegmentedControl, StudioCard, InnerBox, StatusBadge } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import { PiecewiseSignalScope, type ScopeModel } from "@/components/signals/PiecewiseSignalScope";
import { DISCRETE_DEFAULT, DiscreteInputPanel, DiscreteResults } from "@/components/signals/DiscreteSignalWorkspace";
import {
  analyzeCompositeSignal,
  createCompositeSignal,
  sampleCompositeSignal,
  type CompositeAnalysis,
  type CompositeSignalModel,
} from "@/features/signals/engines/compositeSignal";
import { parseUnifiedSignal } from "@/lib/signals/unifiedSignalParser";

const tex = String.raw;

const presets = [
  { label: tex`\sin(2\pi t)+\cos(4\pi t)`, latex: tex`\sin(2\pi t)+\cos(4\pi t)` },
  { label: tex`\text{rect}(t)`, latex: tex`\text{rect}(t)` },
  { label: tex`2\sin(2\pi t)-\text{rect}(t-1)`, latex: tex`2\sin(2\pi t)-\text{rect}(t-1)` },
  { label: tex`u(t)+3\delta(t-2)`, latex: tex`u(t)+3\delta(t-2)` },
] as const;

function fmt(value: number | null) {
  return value === null ? "\\text{n/a}" : !Number.isFinite(value) ? "\\infty" : Number(value.toFixed(4)).toString();
}

function analysisSubject(analysis: CompositeAnalysis) {
  return analysis.classification === "Energy Signal" ? "Energy Signal" : analysis.classification === "Power Signal" ? "Power Signal" : "Neither";
}

const scopeSample = (model: ScopeModel, from: number, to: number, sampleCount?: number) =>
  sampleCompositeSignal(model as CompositeSignalModel, from, to, sampleCount ?? 3000);

export function SignalOperationsLab() {
  const [domain, setDomain] = useState<"ct" | "dt">("ct");
  const [discreteExpression, setDiscreteExpression] = useState<string>(DISCRETE_DEFAULT);
  const [expression, setExpression] = useState(tex`\sin(2\pi t)+\cos(4\pi t)`);
  const [periodicOverride, setPeriodicOverride] = useState<"auto" | "periodic" | "aperiodic">("auto");
  const [windowStart, setWindowStart] = useState(-5);
  const [windowEnd, setWindowEnd] = useState(5);

  const parsed = useMemo(() => parseUnifiedSignal(expression), [expression]);
  const model = useMemo(() => (parsed.ok ? createCompositeSignal(parsed.node, parsed.latex) : null), [parsed]);
  const analysis = useMemo(
    () => (model ? analyzeCompositeSignal(model, { periodicOverride, windowStart, windowEnd }) : null),
    [model, periodicOverride, windowStart, windowEnd],
  );

  return (
    <div className="space-y-6">
      {/* SIGNAL ENGINE input */}
      <StudioCard className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Signal Operations &amp; Properties</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Compose any additive, subtractive, or multiplicative combination of canonical signals in terms of <KatexMath math={domain === "ct" ? "t" : "n\\in\\mathbb{Z}"} className="inline" />.
            </p>
          </div>
          <SegmentedControl
            value={domain}
            onChange={setDomain}
            options={[
              {
                value: "ct",
                label: (
                  <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                    Continuous-Time <KatexMath math="[x(t)]" />
                  </span>
                ),
                "aria-label": "Continuous-Time [x(t)]",
              },
              {
                value: "dt",
                label: (
                  <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                    Discrete-Time <KatexMath math="[x[n]]" />
                  </span>
                ),
                "aria-label": "Discrete-Time [x[n]]",
              },
            ]}
            aria-label="Signal domain"
          />
        </div>

        {domain === "dt" ? <DiscreteInputPanel expression={discreteExpression} onExpressionChange={setDiscreteExpression} /> : <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <UnifiedSignalEngineTerminal
            channels={[{ id: "x", lhs: "x(t)", value: expression, onChange: setExpression, error: parsed.ok ? null : parsed.error }]}
          />

          <InnerBox className="self-start">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Academic test signals</p>
            <div className="mt-3 grid gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.latex}
                  type="button"
                  onClick={() => setExpression(preset.latex)}
                  className="flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-left text-xs font-bold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 active:scale-[0.97] dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200"
                >
                  <KatexMath math={preset.label} />
                </button>
              ))}
            </div>
          </InnerBox>
        </div>}
      </StudioCard>

      {/* Main Workspace Grid: Composite Signal View & Academic Analysis */}
      {domain === "dt" && <DiscreteResults expression={discreteExpression} />}
      {domain === "ct" && <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
        {/* Left Scope: Composite Signal View */}
        <StudioCard>
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">COMPOSITE SIGNAL VIEW</h4>
          {model ? (
            <PiecewiseSignalScope
              model={model}
              sample={scopeSample}
              yLabelKatex="x(t)"
              fundamentalPeriod={analysis?.fundamentalPeriod}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Awaiting a valid signal expression</p>
            </div>
          )}
        </StudioCard>

        {/* Right Sidebar: Academic Analysis */}
        <StudioCard className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            ACADEMIC ANALYSIS
          </h3>

          {analysis && model ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <InnerBox>
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Classification
                    </span>
                    <div className="text-base font-semibold">
                      {analysis.classification === "Power Signal" ? (
                        <span className="text-blue-600 dark:text-blue-400 font-serif tracking-wide text-base">
                          <KatexMath math="\text{Power Signal}" />
                        </span>
                      ) : analysis.classification === "Energy Signal" ? (
                        <span className="text-purple-600 dark:text-purple-400 font-serif tracking-wide text-base">
                          <KatexMath math="\text{Energy Signal}" />
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400 font-serif text-base">
                          <KatexMath math="\text{Neither}" />
                        </span>
                      )}
                    </div>
                  </div>
                </InnerBox>
                <InnerBox>
                  <p className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-500 dark:text-slate-400">Periodicity</p>
                  <div className="mt-1.5">
                    <SegmentedControl
                      size="sm"
                      value={periodicOverride === "auto" ? (analysis.autoPeriodic ? "periodic" : "aperiodic") : periodicOverride}
                      onChange={(value) => setPeriodicOverride(value)}
                      options={[
                        { label: "Periodic", value: "periodic" as const },
                        { label: "Aperiodic", value: "aperiodic" as const },
                      ]}
                      aria-label="Periodicity override"
                    />
                  </div>
                </InnerBox>
              </div>

              {analysis.fundamentalPeriod !== null ? (
                <InnerBox>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Fundamental period</p>
                  <div className="mt-2.5 space-y-2">
                    {analysis.components && analysis.components.length > 1 ? (
                      <>
                        <KatexMath
                          math={tex`\omega_1 = ${fmt(analysis.components[0].omega)}\text{ rad/s}, \quad \omega_2 = ${fmt(analysis.components[1].omega)}\text{ rad/s}`}
                          block
                          className="text-sm text-violet-700 dark:text-violet-200"
                        />
                        <KatexMath
                          math={tex`T_1 = \frac{2\pi}{\omega_1} = ${fmt(analysis.components[0].period)}\text{ s}, \quad T_2 = \frac{2\pi}{\omega_2} = ${fmt(analysis.components[1].period)}\text{ s}`}
                          block
                          className="text-sm text-violet-700 dark:text-violet-200"
                        />
                        <KatexMath
                          math={tex`T_0 = \operatorname{LCM}(T_1, T_2) = ${fmt(analysis.fundamentalPeriod)}\text{ s} \quad \left(\omega_0 = \frac{2\pi}{T_0} = ${fmt(analysis.fundamentalAngularFrequency)}\text{ rad/s}\right)`}
                          block
                          className="text-sm text-violet-700 dark:text-violet-200"
                        />
                      </>
                    ) : (
                      <>
                        <KatexMath
                          math={tex`\omega_1 = ${fmt(analysis.fundamentalAngularFrequency)}\text{ rad/s}, \quad T_1 = \frac{2\pi}{\omega_1} = ${fmt(analysis.fundamentalPeriod)}\text{ s}`}
                          block
                          className="text-sm text-violet-700 dark:text-violet-200"
                        />
                        <KatexMath
                          math={tex`T_0 = T_1 = ${fmt(analysis.fundamentalPeriod)}\text{ s} \quad \left(\omega_0 = \frac{2\pi}{T_0} = ${fmt(analysis.fundamentalAngularFrequency)}\text{ rad/s}\right)`}
                          block
                          className="text-sm text-violet-700 dark:text-violet-200"
                        />
                      </>
                    )}
                  </div>
                </InnerBox>
              ) : (
                <InnerBox>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Observation window</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <KatexMath math="\left[t_1\right]" />
                      <MathNumberInput
                        value={windowStart}
                        step={0.5}
                        onChange={(event) => setWindowStart(Number(event.target.value))}
                        className="w-20"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <KatexMath math="\left[t_2\right]" />
                      <MathNumberInput
                        value={windowEnd}
                        step={0.5}
                        onChange={(event) => setWindowEnd(Number(event.target.value))}
                        className="w-20"
                      />
                    </label>
                  </div>
                </InnerBox>
              )}

              <InnerBox>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <KatexMath math={tex`E=\int_{t_1}^{t_2}|x(t)|^2dt`} className="text-xs text-slate-500 dark:text-slate-400 block" />
                    <div className="mt-1.5">
                      <KatexMath math={`E = ${fmt(analysis.energy)}`} className="text-base text-slate-900 dark:text-white" />
                    </div>
                  </div>
                  <div>
                    <KatexMath math={tex`P=\frac{1}{T_0}\int_{0}^{T_0}|x(t)|^2dt`} className="text-xs text-slate-500 dark:text-slate-400 block" />
                    <div className="mt-1.5">
                      <KatexMath math={`P = ${fmt(analysis.power)}`} className="text-base text-slate-900 dark:text-white" />
                    </div>
                  </div>
                </div>
              </InnerBox>

              {model.impulses.length > 0 && (
                <div className="border-l-2 border-rose-400 bg-rose-50/70 px-3 py-2 dark:bg-rose-500/10 rounded-r-xl">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-rose-700 dark:text-rose-200">Symbolic Dirac entity</p>
                  {model.impulses.map((impulse) => (
                    <KatexMath key={`${impulse.time}-${impulse.weight}`} math={impulse.latex} block className="mt-1 text-sm font-bold text-rose-700 dark:text-rose-100" />
                  ))}
                </div>
              )}

              {analysis.warnings.map((warning) => (
                <p key={warning} role="status" className="border-l-2 border-amber-400 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200 rounded-r-xl">
                  {warning}
                </p>
              ))}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Awaiting valid input</p>
              <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">{!parsed.ok ? parsed.error : ""}</p>
            </div>
          )}
        </StudioCard>
      </div>}
    </div>
  );
}

export default SignalOperationsLab;
