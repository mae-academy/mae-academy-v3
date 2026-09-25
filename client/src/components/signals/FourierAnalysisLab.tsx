/**
 * MAE Academy / Signals & Systems — Tab D 3D Fourier Analysis workbench.
 * Bidirectional: Time-Domain [x(t)] solves 𝓕{x(t)} = X(jω) (or the series c_n); Frequency-Domain
 * [X(jω)] solves 𝓕⁻¹{X(jω)} = x(t). Either way the magnitude/phase spectra and the time trace are fed
 * from the same analytic model (numerical integration only when no table pair applies).
 */
import { Braces, Gauge } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioSlider, StudioCard, InnerBox, MathNumberInput } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import FourierCanvases, { type SpectrumSample, type TimeTrace } from "@/components/signals/FourierCanvases";
import { FourierTransformCard } from "@/components/signals/FourierTransformCard";
import { FourierWaterfall3D } from "@/components/signals/FourierWaterfall3D";
import { isValidWindow, N_MAX, PERIOD_BOUNDS, presetWindow, suggestPeriod, type TimeWindow, type WindowPreset } from "@/components/signals/fourierWindow";
import { fourierSeries, fourierTransform } from "@/features/signals/engines/fourierEngine";
import { forwardFourier, inverseFourier, sampleSpectrum, scaleSpectrum, spectrumBandwidth, type Impulse } from "@/features/signals/engines/fourierAnalytic";
import { evaluateSignal } from "@/features/signals/engines/signalEngine";
import { estimateSupport } from "@/lib/plotAutoScale";
import { parseUnifiedSignal, parseUnifiedSignalNode } from "@/lib/signals/unifiedSignalParser";
import "./fourierAcademic.css";

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
  { value: "custom", label: "Custom" },
];

/** Numeric bound input with a local draft, so "-" / "1." mid-typing never fights the controlled value. */
function WindowBoundInput({ value, onCommit, label }: { value: number; onCommit: (value: number) => void; label: string }) {
  const [draft, setDraft] = useState(() => number(value, 3));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(number(value, 3)); }, [value, focused]);
  return (
    <MathNumberInput
      aria-label={label}
      value={draft}
      step={0.1}
      className="w-24"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = parseFloat(event.target.value);
        if (Number.isFinite(next)) onCommit(next);
      }}
    />
  );
}

function sampleTrace(fn: (time: number) => number, radius: number, samples = 600) {
  return Array.from({ length: samples + 1 }, (_, index) => { const x = -radius + (2 * radius * index) / samples; const y = fn(x); return { x, y: Number.isFinite(y) ? y : 0 }; });
}

export function FourierAnalysisLab() {
  const [domain, setDomain] = useState<Domain>("time");
  const [expression, setExpression] = useState("\\text{rect}(t)"); const [spectrumSource, setSpectrumSource] = useState<string>(freqExamples[0].value);
  const [mode, setMode] = useState<"fs" | "ft">("fs"); const [scale, setScale] = useState(1);
  // ── Single source of truth for the FS workspace (Analysis Settings, Harmonic Builder, 3D waterfall) ──
  const [fundamentalPeriod, setFundamentalPeriod] = useState(2);
  const [periodLimits, setPeriodLimits] = useState({ min: 0.5, max: 10 });
  const [numHarmonics, setNumHarmonics] = useState(12);
  const [harmonicLimits, setHarmonicLimits] = useState({ min: 1, max: N_MAX });
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("two");
  const [customWindow, setCustomWindow] = useState<TimeWindow>({ start: -2, end: 2 });
  const timeWindow = useMemo<TimeWindow>(
    () => (windowPreset === "custom" ? customWindow : presetWindow(windowPreset, fundamentalPeriod)),
    [customWindow, fundamentalPeriod, windowPreset],
  );
  const applyPeriod = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(PERIOD_BOUNDS.max, Math.max(PERIOD_BOUNDS.min, value));
    setPeriodLimits((limits) => ({ min: Math.min(limits.min, next), max: Math.max(limits.max, next) }));
    setFundamentalPeriod(next);
  };
  const applyHarmonics = (value: number) => setNumHarmonics(Math.min(harmonicLimits.max, Math.max(harmonicLimits.min, Math.round(value))));
  const selectWindowPreset = (preset: WindowPreset) => {
    if (preset === "custom") setCustomWindow(timeWindow);
    setWindowPreset(preset);
  };
  const editWindow = (patch: Partial<TimeWindow>) => {
    const next = { ...timeWindow, ...patch };
    if (!isValidWindow(next, fundamentalPeriod)) return;
    setCustomWindow(next);
    setWindowPreset("custom");
  };
  const freqMode = domain === "freq"; const viewMode = freqMode ? "ft" : mode;

  // ── Time-domain direction: 𝓕{x(t)} ──
  const parsed = useMemo(() => parseUnifiedSignalNode(expression), [expression]);
  const parsedMath = useMemo(() => parseUnifiedSignal(expression), [expression]);
  const forward = useMemo(() => (!freqMode && parsedMath.ok ? forwardFourier(parsedMath.node) : null), [freqMode, parsedMath]);
  const series = useMemo(() => (!freqMode && parsed.ok && mode === "fs" ? fourierSeries(parsed.ast, fundamentalPeriod, N_MAX) : null), [freqMode, mode, parsed, fundamentalPeriod]);
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
  const ready = freqMode ? Boolean(inverse?.ok) : parsed.ok;
  const derivation = freqMode
    ? ["x(t)=\\frac{1}{2\\pi}\\int_{-\\infty}^{\\infty}X(j\\omega)\\,e^{j\\omega t}\\,d\\omega", "\\text{Rational part: }s=j\\omega,\\ \\text{ROC}\\ni j\\omega\\text{ axis}", "A_k\\,\\delta(\\omega-\\omega_k)\\ \\longleftrightarrow\\ \\frac{A_k}{2\\pi}e^{j\\omega_k t}"]
    : series?.derivation ?? ["X(j\\omega)=\\int_{-\\infty}^{\\infty}x(t)e^{-j\\omega t}\\,dt", ...(Math.abs(scale - 1) > 1e-9 ? [`x(at)\\ \\longleftrightarrow\\ \\frac{1}{|a|}X\\!\\left(j\\frac{\\omega}{a}\\right),\\quad a=${number(scale)}`] : [])];

  return <div className="fourier-academic space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Harmonic Workspace</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Transform between time and frequency, and examine magnitude/phase spectra, the harmonic builder, and a rotatable time–harmonic space.</p>
        </div>
        {!freqMode && (
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "fs", label: "Periodic / FS" },
              { value: "ft", label: "Aperiodic / FT" },
            ]}
          />
        )}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <SegmentedControl
            value={domain}
            onChange={setDomain}
            fullWidth
            options={[
              { value: "time", label: "Time-Domain [x(t)]" },
              { value: "freq", label: "Frequency-Domain [X(jω) / c_n]" },
            ]}
            aria-label="Input domain"
          />
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
        <div className="flex min-w-0 flex-col gap-5 self-start">
          <InnerBox>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">ANALYSIS SETTINGS</h3>
            {freqMode ? (
              <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">Magnitude and phase are evaluated directly from <KatexMath math="X(j\omega)" />; the time trace is the synthesized <KatexMath math="x(t)" />. All axes auto-scale to the spectrum's bandwidth.</p>
            ) : mode === "fs" ? <>
              <StudioSlider
                className="mt-4"
                label="Fundamental period"
                mathLabel={<KatexMath math="T_0\ (\text{s})" />}
                min={periodLimits.min}
                max={periodLimits.max}
                step={0.01}
                value={fundamentalPeriod}
                onChange={applyPeriod}
                editableLimits
                onMinChange={(v) => { if (v >= PERIOD_BOUNDS.min && v < periodLimits.max) { setPeriodLimits((l) => ({ ...l, min: v })); if (fundamentalPeriod < v) setFundamentalPeriod(v); } }}
                onMaxChange={(v) => { if (v <= PERIOD_BOUNDS.max && v > periodLimits.min) { setPeriodLimits((l) => ({ ...l, max: v })); if (fundamentalPeriod > v) setFundamentalPeriod(v); } }}
                editableValue
                precision={3}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                <KatexMath math={`\\omega_0 = \\tfrac{2\\pi}{T_0} = ${number((2 * Math.PI) / fundamentalPeriod, 4)}\\ \\text{rad/s}`} />
                <KatexMath math={`f_0 = \\tfrac{1}{T_0} = ${number(1 / fundamentalPeriod, 4)}\\ \\text{Hz}`} />
              </div>
              <StudioSlider
                className="mt-5"
                label="Number of harmonics"
                min={harmonicLimits.min}
                max={harmonicLimits.max}
                step={1}
                value={numHarmonics}
                onChange={applyHarmonics}
                editableLimits
                onMinChange={(v) => { const m = Math.round(v); if (m >= 1 && m < harmonicLimits.max) { setHarmonicLimits((l) => ({ ...l, min: m })); if (numHarmonics < m) setNumHarmonics(m); } }}
                onMaxChange={(v) => { const m = Math.round(v); if (m <= N_MAX && m > harmonicLimits.min) { setHarmonicLimits((l) => ({ ...l, max: m })); if (numHarmonics > m) setNumHarmonics(m); } }}
                valueDisplay={<span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"><KatexMath math={`N = ${numHarmonics}`} /></span>}
              />
              <div className="mt-5 grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Observation window</span>
                  <SegmentedControl<WindowPreset> options={WINDOW_OPTIONS} value={windowPreset} onChange={selectWindowPreset} size="sm" aria-label="Observation window preset" />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <KatexMath math="t_A" />
                  <WindowBoundInput label="Window start t_A (s)" value={timeWindow.start} onCommit={(start) => editWindow({ start })} />
                  <KatexMath math="t_B" />
                  <WindowBoundInput label="Window end t_B (s)" value={timeWindow.end} onCommit={(end) => editWindow({ end })} />
                </div>
                <KatexMath className="text-xs text-slate-500 dark:text-slate-400" math={`t \\in [${number(timeWindow.start, 3)},\\ ${number(timeWindow.end, 3)}]\\ \\text{s} = ${number((timeWindow.end - timeWindow.start) / fundamentalPeriod, 2)}\\,T_0`} />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">The partial sum redraws as <KatexMath math="N" /> changes; Gibbs overshoot stays visible at every jump discontinuity.</p>
            </> : <>
              <StudioSlider className="mt-4" label="Time scale" mathLabel={<KatexMath math="a" />} min={0.3} max={3} step={0.05} value={scale} onChange={setScale} />
              <div className="mt-4 rounded-xl border border-violet-300/70 bg-violet-50 p-3 text-xs leading-5 text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100">
                <Gauge className="mr-1 inline h-3.5 w-3.5" />Compressing <KatexMath math="x(at)" /> expands the frequency envelope by the reciprocal scale.
              </div>
            </>}
          </InnerBox>
          {freqMode
            ? <FourierTransformCard direction="inverse" latex={inverse?.ok ? inverse.latex : null} notes={inverse?.ok ? inverse.notes : []} error={inverse && !inverse.ok ? inverse.error : null} />
            : <FourierTransformCard direction="forward" latex={forward?.ok ? forward.spectrum.latex : null} pairs={forward?.ok ? forward.spectrum.pairs : []} error={forward && !forward.ok ? forward.error : parsedMath.ok ? null : parsedMath.error} seriesMode={mode === "fs"} />}
        </div>
      </div>
    </StudioCard>
    {ready && <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <StudioCard>
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
        <StudioCard className="max-h-[680px] overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              {freqMode ? "INVERSE FOURIER TRANSFORM" : mode === "fs" ? "FOURIER SERIES" : "FOURIER TRANSFORM"}
            </h3>
          </div>
          <div className="mt-5 space-y-3 overflow-x-auto">
            {derivation.map((step, index) => <KatexMath key={index} math={step} block className="block text-left text-sm text-slate-600 dark:text-slate-300" />)}
          </div>
          {viewMode === "fs" && series && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SELECTED COEFFICIENTS</h3>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
              {series.coefficients.filter((item) => [0, 1, -1, 2, -2].includes(item.harmonic)).map((item) => <div key={item.harmonic} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900"><KatexMath math={`c_{${item.harmonic}}`} /><KatexMath math={`|c_{${item.harmonic}}|=${number(item.magnitude)}`} /></div>)}
            </div>
          </div>}
          {spectrum && spectrum.impulses.length > 0 && <div className="mt-5 rounded-xl border border-violet-300/60 bg-violet-50 p-4 text-xs leading-5 text-violet-950 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100">
            <Braces className="mr-1 inline h-3.5 w-3.5" />Impulse lines are drawn as violet spikes whose height equals their area.
          </div>}
        </StudioCard>
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
      </StudioCard> : !freqMode ? <StudioCard className="border-blue-300/50 dark:border-blue-400/25">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
          FOURIER TRANSFORM SCALING VIEW
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Use the scale control above to compress or expand the time-domain signal. The spectrum canvases immediately display the reciprocal spread predicted by the scaling relationship.</p>
        <KatexMath math="x(at)\;\Longleftrightarrow\;\frac{1}{|a|}X\!\left(j\frac{\omega}{a}\right)" block className="mt-4 block overflow-x-auto text-left text-lg text-blue-700 dark:text-blue-200" />
      </StudioCard> : null}
    </>}
  </div>;
}

export default FourierAnalysisLab;
