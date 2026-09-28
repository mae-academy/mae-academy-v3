import { convolutionWindow } from "@/lib/plotAutoScale";
import { evaluateSignal } from "@/features/signals/engines/signalEngine";
/**
 * MAE Academy / Signals & Systems — Tab C Convolution Engine.
 * Playback time is retained inside ConvolutionCanvas refs. This React shell
 * only holds setup inputs and user commands; it never receives animation t.
 */
import katex from "katex";
import { FastForward, Pause, Play, Rewind, Sigma, StepForward } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ConvolutionAnalysisCard, type ConvolutionAnalysisHandle } from "@/components/signals/ConvolutionAnalysisCard";
import { analyzeConvolutionRegime, type RegimeCache } from "@/features/signals/engines/convolutionPiecewise";
import { KatexMath } from "@/components/ui/KatexMath";
import { GradientButton, SegmentedControl, StudioButton, StudioSlider, StudioCard, InnerBox, FormulaBox } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import { ConvolutionCanvas, type ConvolutionCanvasHandle } from "@/components/signals/ConvolutionCanvas";
import { DiscreteConvolutionScope } from "@/components/signals/DiscreteConvolutionScope";
import { DiscreteConvolutionTable } from "@/components/signals/DiscreteConvolutionTable";
import { continuousConvolutionAt, type ContinuousConvolutionResult } from "@/features/signals/engines/convolutionEngine";
import { parseUnifiedSignalNode } from "@/lib/signals/unifiedSignalParser";

const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const primary = "border-violet-500 bg-violet-600 text-white hover:bg-violet-500 dark:border-violet-400 dark:bg-violet-500 dark:hover:bg-violet-400";
const presets = [{ label: "Rectangular pulse", x: "\\text{rect}(t)", h: "\\text{rect}(t)" }, { label: "Step × exponential-like ramp", x: "u(t)", h: "r(t)" }, { label: "Delta scan", x: "\\text{rect}(t)", h: "\\delta(t-1)" }, { label: "Sinc filter", x: "\\text{sinc}(t)", h: "\\text{rect}(t)" }] as const;

const discretePresets = [
  { label: "Rectangular pulses", x: "1, 2, 1", h: "1, -1, 2" },
  { label: "Unit impulse response", math: "h[n]=\\delta[n]", x: "1, 2, 3, 2, 1", h: "1" },
  { label: "Moving average filter", x: "1, 1, 1, 1", h: "1, 1" },
  { label: "Bipolar steps", x: "1, -1, 1, -1", h: "1, 1, 1" },
  { label: "Echo / Multipath", x: "3, 2, 1", h: "1, 0, 1" },
] as const;

function parseSequence(source: string) {
  const values = source.split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
  return values.length ? values : [0];
}

function renderKatex(target: HTMLSpanElement | null, math: string) { if (!target) return; target.innerHTML = katex.renderToString(math, { displayMode: false, throwOnError: false }); }
function format(value: number, digits = 3) { return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "—"; }

export function ConvolutionLab() {
  const [xExpression, setXExpression] = useState("\\text{rect}(t)"); const [hExpression, setHExpression] = useState("\\text{rect}(t)");
  const [discreteXSource, setDiscreteXSource] = useState("1, 2, 1");
  const [discreteHSource, setDiscreteHSource] = useState("1, -1, 2");
  const [discreteN, setDiscreteN] = useState(0);
  const discreteX = useMemo(() => parseSequence(discreteXSource), [discreteXSource]);
  const discreteH = useMemo(() => parseSequence(discreteHSource), [discreteHSource]);

  const [activeTarget, setActiveTarget] = useState<"x" | "h">("x");
  const [mode, setMode] = useState<"continuous" | "discrete">("continuous"); const [isPlaying, setIsPlaying] = useState(false); const [speed, setSpeed] = useState(0.7);
  const canvas = useRef<ConvolutionCanvasHandle>(null); const resultRef = useRef<HTMLSpanElement>(null); const sliderRef = useRef<HTMLInputElement>(null); const lastFormulaUpdate = useRef(0); const analysisRef = useRef<ConvolutionAnalysisHandle>(null);
  const xParsed = useMemo(() => parseUnifiedSignalNode(xExpression), [xExpression]); const hParsed = useMemo(() => parseUnifiedSignalNode(hExpression), [hExpression]);
  const valid = xParsed.ok && hParsed.ok;
  const convRange = useMemo(
    () => (xParsed.ok && hParsed.ok
      ? convolutionWindow((t) => evaluateSignal(xParsed.ast, t), (t) => evaluateSignal(hParsed.ast, t))
      : { from: -3, to: 3 }),
    [xParsed, hParsed],
  );
  const regimeCache = useMemo<RegimeCache>(() => new Map(), [xExpression, hExpression]);
  const astRef = useRef({ x: xParsed, h: hParsed, cache: regimeCache }); astRef.current = { x: xParsed, h: hParsed, cache: regimeCache };
  const updateReadout = (result: ContinuousConvolutionResult, throttle: boolean) => {
    if (sliderRef.current) {
      // Update DOM directly; dispatching "input" re-enters onChange -> setTime -> onFrame -> here (infinite loop).
      sliderRef.current.value = String(result.t);
      const ratio = Math.min(1, Math.max(0, (result.t - convRange.from) / (convRange.to - convRange.from))); const box = sliderRef.current.closest("div");
      box?.style.setProperty("--slider-pct", `${ratio * 100}%`); box?.style.setProperty("--slider-ratio", `${ratio}`);
    }
    const now = performance.now();
    if (throttle && now - lastFormulaUpdate.current < 80) return;
    lastFormulaUpdate.current = now;
    const { x, h, cache } = astRef.current; if (x.ok && h.ok) analysisRef.current?.update(analyzeConvolutionRegime(x.ast, h.ast, result.t, cache), result.t, result.value);
    renderKatex(resultRef.current, `y(${format(result.t)})=${format(result.value, 4)}`);
  };
  const manualReadout = (result: ContinuousConvolutionResult) => updateReadout(result, false);
  const setPreset = (preset: typeof presets[number]) => { setXExpression(preset.x); setHExpression(preset.h); setIsPlaying(false); };
  const step = (delta: number) => { setIsPlaying(false); canvas.current?.nudge(delta); };

  return <div className="space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Convolution Engine</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {mode === "continuous"
              ? <>Reverse, shift, multiply, integrate. The continuous scope evaluates <KatexMath math="y(t)=\int_{-\infty}^{\infty} x(\tau)h(t-\tau)\,d\tau" /> at each canvas frame without storing animation time in React.</>
              : <>Reverse, shift, multiply, sum. The discrete stem scope evaluates <KatexMath math="y[n]=\sum_k x[k]h[n-k]" /> across 3 synchronized stem tiers with reverse-diagonal matrix analysis.</>}
          </p>
        </div>
        <SegmentedControl
          value={mode}
          onChange={(m) => { setMode(m); setIsPlaying(false); }}
          options={[
            {
              value: "continuous",
              label: (
                <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                  Continuous-Time <KatexMath math="[x(t)]" />
                </span>
              ),
              "aria-label": "Continuous-Time [x(t)]",
            },
            {
              value: "discrete",
              label: (
                <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                  Discrete-Time <KatexMath math="[x[n]]" />
                </span>
              ),
              "aria-label": "Discrete-Time [x[n]]",
            },
          ]}
        />
      </div>

      {mode === "continuous" ? (
        <>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <UnifiedSignalEngineTerminal
              channels={[
                { id: "x", lhs: "x(t)", accent: "blue", value: xExpression, onChange: setXExpression, error: xParsed.ok ? null : xParsed.error },
                { id: "h", lhs: "h(t)", accent: "rose", value: hExpression, onChange: setHExpression, error: hParsed.ok ? null : hParsed.error },
              ]}
            />
            <InnerBox className="self-start">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">QUICK EXPERIMENTS</h3>
              <div className="mt-3 grid gap-2">{presets.map((preset) => <button key={preset.label} type="button" onClick={() => setPreset(preset)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98] ${idle}`}>{preset.label}</button>)}</div>
            </InnerBox>
          </div>
        </>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Comma-separated samples, starting at n = 0.</p>
            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
              {([
                { id: "x", prefix: "x[n] =", source: discreteXSource, values: discreteX, set: setDiscreteXSource, accent: "border-blue-500/80 bg-blue-500/5 ring-2 ring-blue-500/20", placeholder: "e.g. 1, 2, 1" },
                { id: "h", prefix: "h[n] =", source: discreteHSource, values: discreteH, set: setDiscreteHSource, accent: "border-rose-500/80 bg-rose-500/5 ring-2 ring-rose-500/20", placeholder: "e.g. 1, -1, 2" },
              ] as const).map((field) => (
                <div key={field.id}>
                  <div onClick={() => setActiveTarget(field.id)} className={`flex items-center gap-2.5 rounded-xl border p-3 transition-all cursor-pointer ${activeTarget === field.id ? field.accent : "border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-900/50"}`}>
                    <span className="font-serif text-sm font-semibold text-slate-700 dark:text-slate-200"><KatexMath math={field.prefix} /></span>
                    <input
                      value={field.source}
                      onFocus={() => setActiveTarget(field.id)}
                      onChange={(e) => { field.set(e.target.value); setDiscreteN(0); }}
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                      style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif" }}
                      placeholder={field.placeholder}
                      aria-label={field.prefix}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <KatexMath math={`${field.id}[n] = \\{${field.values.join(",\\; ")}\\}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <InnerBox className="self-start">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">DISCRETE PRESETS</h3>
            <div className="mt-3 grid gap-2">
              {discretePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => { setDiscreteXSource(preset.x); setDiscreteHSource(preset.h); setDiscreteN(0); }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98] ${idle}`}
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <span>{preset.label}</span>
                    {"math" in preset && (
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        <KatexMath math={preset.math} />
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </InnerBox>
        </div>
      )}
    </StudioCard>

    {mode === "continuous" ? (
      valid && xParsed.ok && hParsed.ok ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full">
          {/* Left Panel: 3-Tier Waveform Scopes (75% / col-span-8 or 9) */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            <StudioCard>
              <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                  THREE-TIER CANVAS LAYOUT
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <GradientButton onClick={() => setIsPlaying(true)} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <Play className="h-3.5 w-3.5 fill-current" />Play
                  </GradientButton>
                  <StudioButton onClick={() => setIsPlaying(false)} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <Pause className="h-3.5 w-3.5" />Pause
                  </StudioButton>
                  <StudioButton onClick={() => { setSpeed(2.4); setIsPlaying(true); }} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <FastForward className="h-3.5 w-3.5" />Fast forward
                  </StudioButton>
                  <StudioButton onClick={() => step(-0.45)} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <Rewind className="h-3.5 w-3.5" />Rewind
                  </StudioButton>
                </div>
              </div>
              <InnerBox className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] items-end">
                <StudioSlider
                  ref={sliderRef}
                  label={<span>Shift parameter <KatexMath math="t" /></span>}
                  valueDisplay={<span ref={resultRef} className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400"><KatexMath math="y(-3)=0" /></span>}
                  min={convRange.from}
                  max={convRange.to}
                  step={0.01}
                  defaultValue={convRange.from}
                  onChange={(val) => {
                    setIsPlaying(false);
                    canvas.current?.setTime(val);
                  }}
                />
                <StudioButton onClick={() => step(0.05)} className="inline-flex items-center justify-center gap-1 cursor-pointer">
                  <StepForward className="h-3.5 w-3.5" />Fine step
                </StudioButton>
              </InnerBox>
              <ConvolutionCanvas ref={canvas} x={xParsed.ast} h={hParsed.ast} range={convRange} isPlaying={isPlaying} speed={speed} onFrame={(result) => updateReadout(result, true)} onManualReadout={manualReadout} />
            </StudioCard>
          </div>
          {/* Right Panel: Academic Analytical Engine (25% / col-span-4 or 3) */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4 lg:sticky lg:top-4">
            <ConvolutionAnalysisCard ref={analysisRef} />
          </div>
        </div>
      ) : null
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full">
        {/* Left Panel: 3-Tier Waveform Scopes (75% / col-span-8 or 9) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          <StudioCard>
            <div className="mb-4 flex flex-col gap-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                THREE-TIER DISCRETE STEM CANVAS
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Discrete convolution evaluated in the stem domain: reverse-reflected kernel <KatexMath math="h[n-k]" /> slides across input <KatexMath math="x[k]" />. Hover over any stem to inspect exact sample values.
              </p>
            </div>
            <DiscreteConvolutionScope
              x={discreteX}
              h={discreteH}
              n={discreteN}
              onIndexChange={setDiscreteN}
            />
          </StudioCard>
        </div>

        {/* Right Panel: Academic Analytical Engine (25% / col-span-4 or 3) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4 lg:sticky lg:top-4">
          <DiscreteConvolutionTable
            xSource={discreteXSource}
            hSource={discreteHSource}
            onXSourceChange={setDiscreteXSource}
            onHSourceChange={setDiscreteHSource}
            active={discreteN}
            onActiveChange={setDiscreteN}
            hideInputs={true}
          />
        </div>
      </div>
    )}
  </div>;
}

export default ConvolutionLab;
