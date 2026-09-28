/**
 * MAE Academy / Signals & Systems — Tab D 3D Fourier Analysis workbench.
 * Bidirectional: Time-Domain [x(t)] solves 𝓕{x(t)} = X(jω) (or the series c_n); Frequency-Domain
 * [X(jω)] solves 𝓕⁻¹{X(jω)} = x(t). Either way the magnitude/phase spectra and the time trace are fed
 * from the same analytic model (numerical integration only when no table pair applies).
 */
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StatusBadge, StudioSlider, StudioCard, InnerBox, MathNumberInput } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import FourierCanvases, { type SpectrumSample, type TimeTrace } from "@/components/signals/FourierCanvases";
import { FourierWaterfall3D } from "@/components/signals/FourierWaterfall3D";
import { N_MAX, PERIOD_BOUNDS, presetWindow, suggestPeriod, type TimeWindow, type WindowPreset } from "@/components/signals/fourierWindow";
import { deriveFourierSeriesSteps, deriveTrigSeriesSteps, fourierSeries, fourierTransform } from "@/features/signals/engines/fourierEngine";
import { deriveForwardFourierSteps, deriveInverseFourierSteps, forwardFourier, inverseFourier, sampleSpectrum, scaleSpectrum, spectrumBandwidth, type Impulse } from "@/features/signals/engines/fourierAnalytic";
import { evaluateSignal } from "@/features/signals/engines/signalEngine";
import { estimateSupport } from "@/lib/plotAutoScale";
import { parseUnifiedSignal, parseUnifiedSignalNode } from "@/lib/signals/unifiedSignalParser";
import { SelectedCoefficientsTable } from "@/features/signals/ui/SelectedCoefficientsTable";
import { ContinuousDerivationCard } from "@/features/signals/ui/ContinuousDerivationCard";
import { FourierSeriesDerivationCard } from "@/features/signals/ui/FourierSeriesDerivationCard";
import { AnalysisSettingsCard } from "@/features/signals/ui/AnalysisSettingsCard";
import "@/components/signals/fourierAcademic.css";

const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const timeExamples = [
  { label: "Rectangular pulse", value: "\\text{rect}(t)" }, { label: "Causal exponential", value: "e^{-2t}u(t)" },
  { label: "Cosine carrier", value: "\\cos(4t)" }, { label: "Triangle pulse", value: "\\text{tri}(t)" },
] as const;
const freqExamples = [
  { label: "First-order low-pass", value: "\\frac{1}{3+j\\omega}" }, { label: "DC line", value: "2\\pi\\delta(\\omega)" },
  { label: "Two-sided exponential", value: "\\frac{4}{4+\\omega^{2}}" }, { label: "Ideal low-pass", value: "\\text{rect}\\left(\\frac{\\omega}{4}\\right)" },
] as const;
type Domain = "time" | "freq";
type SpectrumView = { samples: SpectrumSample[]; impulses: Impulse[]; bandwidth: number };

function number(value: number, digits = 4) { return Number(value.toFixed(digits)).toString(); }

/** Symmetric time window around the signal's support (3 periods / ±6 s when it never decays). */
function traceWindow(fn: (time: number) => number, periodHint?: number): number {
  const support = estimateSupport(fn, 30, 0.05, 1e-4);
  if (!support.unbounded) return Math.min(20, Math.max(2, 1.2 * Math.max(Math.abs(support.lo), Math.abs(support.hi))));
  return periodHint ? Math.min(20, Math.max(2, 3 * periodHint)) : 6;
}
const WINDOW_OPTIONS: ReadonlyArray<{ value: WindowPreset; label: string }> = [
  { value: "one", label: "1 Period" },
  { value: "two", label: "2 Periods" },
];

function sampleTrace(fn: (time: number) => number, radius: number, samples = 600) {
  return Array.from({ length: samples + 1 }, (_, index) => { const x = -radius + (2 * radius * index) / samples; const y = fn(x); return { x, y: Number.isFinite(y) ? y : 0 }; });
}

export function FourierStudio() {
  const [domain, setDomain] = useState<Domain>("time");
  const [expression, setExpression] = useState("\\text{rect}(t)"); const [spectrumSource, setSpectrumSource] = useState<string>(freqExamples[0].value);
  const [mode, setMode] = useState<"fs" | "ft">("fs"); const [scale, setScale] = useState(1);
  // ── Single source of truth for the FS workspace (Analysis Settings, Harmonic Builder, 3D waterfall) ──
  const [fundamentalPeriod, setFundamentalPeriod] = useState(2);
  const [periodLimits, setPeriodLimits] = useState({ min: 0.5, max: 10 });
  const [numHarmonics, setNumHarmonics] = useState(12);
  const [harmonicLimits, setHarmonicLimits] = useState({ min: 1, max: N_MAX });
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("two");
  const timeWindow = useMemo<TimeWindow>(
    () => presetWindow(windowPreset, fundamentalPeriod),
    [fundamentalPeriod, windowPreset],
  );
  const applyPeriod = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(PERIOD_BOUNDS.max, Math.max(PERIOD_BOUNDS.min, value));
    setPeriodLimits((limits) => ({ min: Math.min(limits.min, next), max: Math.max(limits.max, next) }));
    setFundamentalPeriod(next);
  };
  const applyHarmonics = (value: number) => setNumHarmonics(Math.min(harmonicLimits.max, Math.max(harmonicLimits.min, Math.round(value))));
  const selectWindowPreset = (preset: WindowPreset) => {
    setWindowPreset(preset);
  };
  const freqMode = domain === "freq" && mode === "ft"; const viewMode = freqMode ? "ft" : mode;

  // ── Time-domain direction: 𝓕{x(t)} ──
  const parsed = useMemo(() => parseUnifiedSignalNode(expression), [expression]);
  const parsedMath = useMemo(() => parseUnifiedSignal(expression), [expression]);
  const forward = useMemo(() => (!freqMode && parsedMath.ok ? forwardFourier(parsedMath.node) : null), [freqMode, parsedMath]);
  const series = useMemo(() => (!freqMode && parsed.ok && mode === "fs" ? fourierSeries(parsed.ast, fundamentalPeriod, N_MAX) : null), [freqMode, mode, parsed, fundamentalPeriod]);
  const trigDerivationSteps = useMemo(() => (!freqMode && mode === "fs" && parsed.ok ? deriveTrigSeriesSteps(parsed.ast, fundamentalPeriod) : null), [freqMode, mode, parsed, fundamentalPeriod]);
  const seriesDerivationSteps = useMemo(() => (!freqMode && mode === "fs" && parsed.ok ? deriveFourierSeriesSteps(parsed.ast, fundamentalPeriod) : null), [freqMode, mode, parsed, fundamentalPeriod]);
  const transformDerivationSteps = useMemo(() => (!freqMode && mode === "ft" && parsedMath.ok ? deriveForwardFourierSteps(parsedMath.node) : null), [freqMode, mode, parsedMath]);
  // Signal-aware T₀: spectral lines → 2π/gcd(ω_i); pulses → twice their extent about t = 0.
  useEffect(() => {
    if (freqMode || !parsed.ok) return;
    const ast = parsed.ast;
    const lines = forward?.ok ? forward.spectrum.impulses.map((impulse) => impulse.omega) : [];
    const suggested = suggestPeriod((time) => evaluateSignal(ast, time), lines);
    if (suggested !== null) applyPeriod(suggested);
  }, [expression, freqMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeSpectrum = useMemo<SpectrumView | null>(() => {
    if (freqMode || mode !== "ft" || !parsed.ok) return null;
    if (forward?.ok) { const model = scaleSpectrum(forward.spectrum, scale); const bandwidth = spectrumBandwidth(model); return { samples: sampleSpectrum(model, bandwidth), impulses: model.impulses, bandwidth }; }
    // Numerical fallback: wide pass, then crop to the 10% bandwidth (+20%).
    const wide = fourierTransform(parsed.ast, scale, 40, 400, 10, 2000).spectrum;
    const peak = Math.max(...wide.map((point) => point.magnitude), 1e-12);
    const edge = Math.max(0, ...wide.filter((point) => point.magnitude > 0.1 * peak).map((point) => Math.abs(point.omega)));
    const bandwidth = Math.min(40, Math.max(4, 1.2 * edge));
    return { samples: wide.filter((point) => Math.abs(point.omega) <= bandwidth), impulses: [], bandwidth };
  }, [forward, freqMode, mode, parsed, scale]);
  const timeTrace = useMemo<TimeTrace | null>(() => {
    if (freqMode || mode !== "ft" || !parsed.ok) return null;
    const ast = parsed.ast; const fn = (time: number) => evaluateSignal(ast, scale * time);
    const lines = forward?.ok ? forward.spectrum.impulses.map((impulse) => Math.abs(impulse.omega * scale)).filter((omega) => omega > 1e-9) : [];
    const radius = traceWindow(fn, lines.length ? (2 * Math.PI) / Math.min(...lines) : undefined);
    return { katexName: Math.abs(scale - 1) < 1e-9 ? "x(t)" : `x(${number(scale, 2)}t)`, data: sampleTrace(fn, radius) };
  }, [forward, freqMode, mode, parsed, scale]);

  // ── Frequency-domain direction: 𝓕⁻¹{X(jω)} ──
  const inverse = useMemo(() => (freqMode ? inverseFourier(spectrumSource) : null), [freqMode, spectrumSource]);
  const inverseDerivationSteps = useMemo(() => (freqMode ? deriveInverseFourierSteps(spectrumSource) : null), [freqMode, spectrumSource]);
  const freqSpectrum = useMemo<SpectrumView | null>(() => {
    if (!inverse?.ok) return null;
    const bandwidth = spectrumBandwidth(inverse.spectrum);
    return { samples: sampleSpectrum(inverse.spectrum, bandwidth), impulses: inverse.spectrum.impulses, bandwidth };
  }, [inverse]);
  const freqTrace = useMemo<TimeTrace | null>(() => {
    if (!inverse?.ok) return null;
    const lines = inverse.spectrum.impulses.map((impulse) => Math.abs(impulse.omega)).filter((omega) => omega > 1e-9);
    const radius = traceWindow(inverse.valueAt, lines.length ? (2 * Math.PI) / Math.min(...lines) : undefined);
    return { katexName: "x(t)", data: sampleTrace(inverse.valueAt, radius) };
  }, [inverse]);

  const spectrum = freqMode ? freqSpectrum : timeSpectrum;
  const impulseNote = spectrum && spectrum.impulses.length > 0 ? ["Impulse lines are drawn as violet spikes whose height equals their area."] : [];
  const ready = freqMode ? Boolean(inverse?.ok) : parsed.ok;
  return <div className="fourier-academic space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Harmonic Workspace</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Transform between time and frequency, and examine magnitude/phase spectra, the harmonic builder, and a rotatable time–harmonic space.</p>
        </div>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "fs", label: "Periodic / FS" },
            { value: "ft", label: "Aperiodic / FT" },
          ]}
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {mode === "ft" && (
            <SegmentedControl
              value={domain}
              onChange={setDomain}
              fullWidth
              options={[
                {
                  value: "time",
                  label: (
                    <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                      Time-Domain <KatexMath math="[x(t)]" />
                    </span>
                  ),
                  "aria-label": "Time-Domain [x(t)]",
                },
                {
                  value: "freq",
                  label: (
                    <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                      Frequency-Domain <KatexMath math={mode === "ft" ? "[X(j\\omega)]" : "[X(j\\omega)\\ /\\ c_n]"} />
                    </span>
                  ),
                  "aria-label": mode === "ft" ? "Frequency-Domain [X(j\\omega)]" : "Frequency-Domain [X(j\\omega) / c_n]",
                },
              ]}
              aria-label="Input domain"
            />
          )}
          {freqMode ? (
            <UnifiedSignalEngineTerminal key="freq" title="FREQUENCY-DOMAIN SPECTRUM" domain="w" channels={[{ id: "X", lhs: "X(j\\omega)", value: spectrumSource, onChange: setSpectrumSource, error: inverse && !inverse.ok ? inverse.error : null }]}>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{freqExamples.map((example) => <button key={example.label} type="button" onClick={() => setSpectrumSource(example.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{example.label}</button>)}</div>
            </UnifiedSignalEngineTerminal>
          ) : (
            <UnifiedSignalEngineTerminal key="time" title="TIME-DOMAIN SIGNAL" channels={[{ id: "x", lhs: "x(t)", value: expression, onChange: setExpression, error: parsed.ok ? null : parsed.error }]}>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{timeExamples.map((example) => <button key={example.label} type="button" onClick={() => setExpression(example.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{example.label}</button>)}</div>
            </UnifiedSignalEngineTerminal>
          )}
        </div>
        <div className={cn("flex min-w-0 flex-col gap-5", mode === "fs" && !freqMode ? "h-full" : "self-start")}>
          <AnalysisSettingsCard
            freqMode={freqMode}
            mode={mode}
            fundamentalPeriod={fundamentalPeriod}
            periodLimits={periodLimits}
            applyPeriod={applyPeriod}
            setPeriodLimits={setPeriodLimits}
            numHarmonics={numHarmonics}
            harmonicLimits={harmonicLimits}
            applyHarmonics={applyHarmonics}
            setHarmonicLimits={setHarmonicLimits}
            windowPreset={windowPreset}
            selectWindowPreset={selectWindowPreset}
            timeWindow={timeWindow}
            scale={scale}
            setScale={setScale}
          />
        </div>
      </div>
    </StudioCard>
    {ready && <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        <div className="min-w-0 lg:col-span-8 flex flex-col">
          <StudioCard className="min-w-0 flex-1 flex flex-col justify-between">
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                MAGNITUDE, PHASE &amp; {freqMode ? "SYNTHESIZED x(t)" : mode === "fs" ? "HARMONIC BUILDER" : "TIME SCALING"}
              </h3>
            </div>
            <FourierCanvases
              mode={viewMode}
              series={series}
              spectrum={spectrum?.samples ?? null}
              impulses={spectrum?.impulses ?? []}
              bandwidth={spectrum?.bandwidth ?? 8}
              trace={freqMode ? freqTrace : timeTrace}
              periodic={parsed.ok ? (time) => evaluateSignal(parsed.ast, time) : undefined}
              harmonics={numHarmonics}
              timeWindow={mode === "fs" && !freqMode ? timeWindow : undefined}
            />
          </StudioCard>
        </div>
        <div className="relative min-h-[34rem] min-w-0 lg:col-span-4">
          {freqMode && inverseDerivationSteps ? (
            <ContinuousDerivationCard
              className="overflow-y-auto pr-1 lg:absolute lg:inset-0"
              title="Inverse Fourier Transform"
              pair={String.raw`\mathcal{F}^{-1}\{X(j\omega)\}=x(t)`}
              steps={inverseDerivationSteps}
              target={inverse?.ok ? inverse.latex : null}
              targetTestId="fourier-solution"
              badge={<StatusBadge variant={inverse?.ok ? "info" : "neutral"} className="uppercase tracking-wider text-[10px]">{inverse?.ok ? "Analytic" : "Numerical"}</StatusBadge>}
              notes={[...(inverse?.ok ? inverse.notes : []), ...impulseNote]}
            />
          ) : !freqMode && mode === "ft" && transformDerivationSteps ? (
            <ContinuousDerivationCard
              className="overflow-y-auto pr-1 lg:absolute lg:inset-0"
              title="Fourier Transform"
              pair={String.raw`\mathcal{F}\{x(t)\}=X(j\omega)`}
              steps={transformDerivationSteps}
              target={forward?.ok ? forward.spectrum.latex : null}
              targetTestId="fourier-solution"
              badge={<StatusBadge variant={forward?.ok ? "info" : "neutral"} className="uppercase tracking-wider text-[10px]">{forward?.ok ? "Analytic" : "Numerical"}</StatusBadge>}
              notes={[...(forward && !forward.ok ? [`${forward.error} The spectra are computed numerically from the definition integral.`] : []), ...impulseNote]}
            />
          ) : (
            viewMode === "fs" && seriesDerivationSteps && trigDerivationSteps ? (
              <FourierSeriesDerivationCard
                className="overflow-y-auto pr-1 lg:absolute lg:inset-0"
                efsSteps={seriesDerivationSteps}
                tfsSteps={trigDerivationSteps}
              />
            ) : null
          )}
        </div>

        {viewMode === "fs" && series && (
          <div className="min-w-0 lg:col-span-12">
            <SelectedCoefficientsTable
              className="w-full"
              coefficients={series.coefficients}
              spanLimit={Math.max(1, Math.floor(numHarmonics / 2))}
              period={series.period}
              omega0={series.omega0}
            />
          </div>
        )}
      </div>
      {viewMode === "fs" && series ? <StudioCard>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            3D TIME–FREQUENCY HARMONIC WATERFALL
          </h3>
          <span className="text-[11px] text-slate-400">Drag to orbit • Scroll to zoom • Hover a harmonic to inspect it</span>
        </div>
        <FourierWaterfall3D
          series={series}
          harmonics={numHarmonics}
          onHarmonicsChange={applyHarmonics}
          harmonicLimits={harmonicLimits}
          timeWindow={timeWindow}
          windowPreset={windowPreset}
          onWindowPresetChange={selectWindowPreset}
        />
      </StudioCard> : null}
    </>}
  </div>;
}

export default FourierStudio;
