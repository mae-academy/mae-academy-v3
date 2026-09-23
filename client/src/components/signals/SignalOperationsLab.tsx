/**
 * MAE Academy / Signals & Systems — Tab A functional signal laboratory.
 * The SIGNAL ENGINE mathfield feeds a pure composite-signal parser; the scope
 * renders its sampled trace and structural Dirac impulses, and the analysis
 * card derives periodicity (GCD/LCM), energy, and power from the same model.
 */
import { useMemo, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import { PiecewiseSignalScope, type ScopeModel } from "@/components/signals/PiecewiseSignalScope";
import {
  analyzeCompositeSignal,
  createCompositeSignal,
  parseCompositeSignal,
  sampleCompositeSignal,
  type CompositeAnalysis,
  type CompositeSignalModel,
} from "@/features/signals/engines/compositeSignal";

const tex = String.raw;
const panel = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const subpanel = "rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/75";
const pill = "rounded-full px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 transition-all cursor-pointer";

const signalPills = [
  { label: tex`u(t)`, latex: "u(t)" }, { label: tex`r(t)`, latex: "r(t)" }, { label: tex`\text{rect}(t)`, latex: "\\text{rect}(t)" },
  { label: tex`\Lambda(t)`, latex: "\\Lambda(t)" }, { label: tex`\text{sinc}(t)`, latex: "\\text{sinc}(t)" }, { label: tex`\text{sgn}(t)`, latex: "\\text{sgn}(t)" },
  { label: tex`\sin(\omega t)`, latex: "\\sin(\\omega t)" }, { label: tex`\cos(\omega t)`, latex: "\\cos(\\omega t)" }, { label: tex`\delta(t)`, latex: "\\delta(t)" },
] as const;

const tokenPills = [
  { label: tex`t`, latex: "t" }, { label: tex`t^2`, latex: "t^{2}" }, { label: "+", latex: "+" }, { label: "\u2212", latex: "-" },
  { label: "\u00d7", latex: "\\cdot" }, { label: tex`\pi`, latex: "\\pi" }, { label: "2", latex: "2" }, { label: "0.5", latex: "0.5" },
] as const;

const presets = [
  { label: tex`\sin(2\pi t)+\cos(4\pi t)`, latex: "x(t)=\\,\\sin(2\\pi t)+\\cos(4\\pi t)" },
  { label: tex`\text{rect}(t)`, latex: "x(t)=\\,\\text{rect}(t)" },
  { label: tex`2\sin(2\pi t)-\text{rect}(t-1)`, latex: "x(t)=\\,2\\sin(2\\pi t)-\\text{rect}(t-1)" },
  { label: tex`u(t)+3\delta(t-2)`, latex: "x(t)=\\,u(t)+3\\delta(t-2)" },
] as const;

function fmt(value: number | null) {
  return value === null ? "\\text{n/a}" : !Number.isFinite(value) ? "\\infty" : Number(value.toFixed(4)).toString();
}

function analysisSubject(analysis: CompositeAnalysis) {
  return analysis.classification === "Energy Signal" ? "Energy Signal" : analysis.classification === "Power Signal" ? "Power Signal" : "Neither";
}

const scopeSample = (model: ScopeModel, from: number, to: number) => sampleCompositeSignal(model as CompositeSignalModel, from, to);

export function SignalOperationsLab() {
  const [expression, setExpression] = useState(tex`x(t)=\sin(2\pi t)+\cos(4\pi t)`);
  const [periodicOverride, setPeriodicOverride] = useState<"auto" | "periodic" | "aperiodic">("auto");
  const [windowStart, setWindowStart] = useState(-5);
  const [windowEnd, setWindowEnd] = useState(5);
  const editorRef = useRef<MathLiveSignalInputHandle>(null);
  const insert = (latex: string) => editorRef.current?.insert(latex, "after");

  const parsed = useMemo(() => parseCompositeSignal(expression), [expression]);
  const model = useMemo(() => (parsed.ok ? createCompositeSignal(parsed.node, parsed.latex) : null), [parsed]);
  const analysis = useMemo(
    () => (model ? analyzeCompositeSignal(model, { periodicOverride, windowStart, windowEnd }) : null),
    [model, periodicOverride, windowStart, windowEnd],
  );

  return (
    <div className="space-y-6">
      {/* SIGNAL ENGINE input */}
      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Signal Operations &amp; Properties</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Compose any additive, subtractive, or multiplicative combination of canonical signals in terms of <KatexMath math="t" className="inline" />.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className={subpanel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="signal-mathfield-label" className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                SIGNAL ENGINE
              </h3>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${parsed.ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"}`}>
                {parsed.ok ? "Semantic model ready" : "Check grammar"}
              </span>
            </div>
            <div className="mt-4">
              <MathLiveSignalInput ref={editorRef} value={expression} onChange={setExpression} labelledBy="signal-mathfield-label" />
            </div>
            {!parsed.ok && <p className="mt-2 text-xs font-semibold leading-5 text-rose-600 dark:text-rose-300">{parsed.error}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Canonical signals</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {signalPills.map((item) => (
                    <button key={item.latex} type="button" onClick={() => insert(`+${item.latex}`)} className={pill}>
                      <KatexMath math={item.label} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Variables &amp; operators</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tokenPills.map((item) => (
                    <button key={item.latex} type="button" onClick={() => insert(item.latex)} className={pill}>
                      <KatexMath math={item.label} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={subpanel}>
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
          </div>
        </div>
      </section>

      {/* Main Workspace Grid: Composite Signal View & Academic Analysis */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
        {/* Left Scope: Composite Signal View */}
        <section className={panel}>
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">COMPOSITE SIGNAL VIEW</h4>
          {model ? (
            <PiecewiseSignalScope model={model} sample={scopeSample} yLabelKatex="x(t)" />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Awaiting a valid signal expression</p>
            </div>
          )}
        </section>

        {/* Right Sidebar: Academic Analysis */}
        <aside className={`${panel} space-y-4`}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            ACADEMIC ANALYSIS
          </h3>

          {analysis && model ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className={subpanel}>
                  <p className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-500 dark:text-slate-400">Classification</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{analysisSubject(analysis)}</p>
                </div>
                <div className={subpanel}>
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
                </div>
              </div>

              {analysis.fundamentalPeriod !== null ? (
                <div className={subpanel}>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Fundamental period</p>
                  <div className="mt-2.5 space-y-2">
                    <KatexMath math={tex`\omega_0 = \operatorname{GCD}(\omega_i) = ${fmt(analysis.fundamentalAngularFrequency)}\text{ rad/s}`} block className="text-sm text-violet-700 dark:text-violet-200" />
                    <KatexMath math={tex`T_0 = \frac{2\pi}{\omega_0} = ${fmt(analysis.fundamentalPeriod)}\text{ s}`} block className="text-sm text-violet-700 dark:text-violet-200" />
                  </div>
                </div>
              ) : (
                <div className={subpanel}>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Observation window</p>
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <KatexMath math="t_1\text{ [s]}" />
                      <input
                        type="number"
                        value={windowStart}
                        step={0.5}
                        onChange={(event) => setWindowStart(Number(event.target.value))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center font-mono text-sm font-bold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <KatexMath math="t_2\text{ [s]}" />
                      <input
                        type="number"
                        value={windowEnd}
                        step={0.5}
                        onChange={(event) => setWindowEnd(Number(event.target.value))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center font-mono text-sm font-bold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className={subpanel}>
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
              </div>

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
        </aside>
      </div>
    </div>
  );
}

export default SignalOperationsLab;
