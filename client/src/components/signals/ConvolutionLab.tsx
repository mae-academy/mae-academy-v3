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
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import { ConvolutionCanvas, type ConvolutionCanvasHandle } from "@/components/signals/ConvolutionCanvas";
import { DiscreteConvolutionScope } from "@/components/signals/DiscreteConvolutionScope";
import { DiscreteConvolutionTable } from "@/components/signals/DiscreteConvolutionTable";
import { continuousConvolutionAt, type ContinuousConvolutionResult } from "@/features/signals/engines/convolutionEngine";
import { parseSignalExpression } from "@/features/signals/engines/signalEngine";

const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const primary = "border-violet-500 bg-violet-600 text-white hover:bg-violet-500 dark:border-violet-400 dark:bg-violet-500 dark:hover:bg-violet-400";
const presets = [{ label: "Rectangular pulse", x: "\\operatorname{rect}(t)", h: "\\operatorname{rect}(t)" }, { label: "Step × exponential-like ramp", x: "u(t)", h: "r(t)" }, { label: "Delta scan", x: "\\operatorname{rect}(t)", h: "\\delta(t-1)" }, { label: "Sinc filter", x: "\\operatorname{sinc}(t)", h: "\\operatorname{rect}(t)" }] as const;

const discretePresets = [
  { label: "Rectangular pulses", x: "1, 2, 1", h: "1, -1, 2" },
  { label: "Moving average filter", x: "1, 1, 1, 1", h: "1, 1" },
  { label: "Bipolar steps", x: "1, -1, 1, -1", h: "1, 1, 1" },
  { label: "Echo / Multipath", x: "3, 2, 1", h: "1, 0, 1" },
] as const;

function parseSequence(source: string) {
  const values = source.split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
  return values.length ? values : [0];
}

const tex = String.raw;
const pill = "rounded-full px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 transition-all cursor-pointer";
// Parameters are instantiated (a=1, ω₀=2π) because the signal grammar is numeric-only.
const signalPills = [
  { label: tex`u(t)`, latex: "u(t)" }, { label: tex`\text{rect}(t)`, latex: "\\text{rect}(t)" }, { label: tex`\text{tri}(t)`, latex: "\\text{tri}(t)" },
  { label: tex`\delta(t)`, latex: "\\delta(t)" }, { label: tex`\text{sinc}(t)`, latex: "\\text{sinc}(t)" }, { label: tex`e^{-at}u(t)`, latex: "e^{-t}u(t)" }, { label: tex`\cos(\omega_0 t)`, latex: "\\cos(2\\pi t)" },
] as const;
const tokenPills = [
  { label: tex`t`, latex: "t" }, { label: "+", latex: "+" }, { label: "\u2212", latex: "-" }, { label: "\u00d7", latex: "\\cdot" },
  { label: "(", latex: "(" }, { label: ")", latex: ")" }, { label: "0.5", latex: "0.5" }, { label: "1", latex: "1" }, { label: "2", latex: "2" },
] as const;

function renderKatex(target: HTMLSpanElement | null, math: string) { if (!target) return; target.innerHTML = katex.renderToString(math, { displayMode: false, throwOnError: false }); }
function format(value: number, digits = 3) { return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "—"; }

export function ConvolutionLab() {
  const [xExpression, setXExpression] = useState("\\operatorname{rect}(t)"); const [hExpression, setHExpression] = useState("\\operatorname{rect}(t)");
  const [discreteXSource, setDiscreteXSource] = useState("1, 2, 1");
  const [discreteHSource, setDiscreteHSource] = useState("1, -1, 2");
  const [discreteN, setDiscreteN] = useState(0);
  const discreteX = useMemo(() => parseSequence(discreteXSource), [discreteXSource]);
  const discreteH = useMemo(() => parseSequence(discreteHSource), [discreteHSource]);

  const [mode, setMode] = useState<"continuous" | "discrete">("continuous"); const [isPlaying, setIsPlaying] = useState(false); const [speed, setSpeed] = useState(0.7);
  const xEditor = useRef<MathLiveSignalInputHandle>(null); const hEditor = useRef<MathLiveSignalInputHandle>(null); const canvas = useRef<ConvolutionCanvasHandle>(null); const resultRef = useRef<HTMLSpanElement>(null); const sliderRef = useRef<HTMLInputElement>(null); const lastFormulaUpdate = useRef(0); const analysisRef = useRef<ConvolutionAnalysisHandle>(null);
  const [activeField, setActiveField] = useState<"x" | "h">("x");
  const xParsed = useMemo(() => parseSignalExpression(xExpression), [xExpression]); const hParsed = useMemo(() => parseSignalExpression(hExpression), [hExpression]);
  const valid = xParsed.ok && hParsed.ok;
  const regimeCache = useMemo<RegimeCache>(() => new Map(), [xExpression, hExpression]);
  const astRef = useRef({ x: xParsed, h: hParsed, cache: regimeCache }); astRef.current = { x: xParsed, h: hParsed, cache: regimeCache };
  const insertToken = (latex: string) => (activeField === "x" ? xEditor : hEditor).current?.insert(latex, "after");
  const updateReadout = (result: ContinuousConvolutionResult, throttle: boolean) => {
    if (sliderRef.current) {
      // Update DOM directly; dispatching "input" re-enters onChange -> setTime -> onFrame -> here (infinite loop).
      sliderRef.current.value = String(result.t);
      const ratio = Math.min(1, Math.max(0, (result.t + 3) / 6)); const box = sliderRef.current.closest("div");
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
              ? "Reverse, shift, multiply, integrate. The continuous scope evaluates y(t)=\\int x(\\tau)h(t-\\tau)\\,d\\tau at each canvas frame without storing animation time in React."
              : "Reverse, shift, multiply, sum. The discrete stem scope evaluates y[n]=\\sum_k x[k]h[n-k] across 3 synchronized stem tiers with reverse-diagonal matrix analysis."}
          </p>
        </div>
        <SegmentedControl
          value={mode}
          onChange={(m) => { setMode(m); setIsPlaying(false); }}
          options={[
            { value: "continuous", label: "Continuous" },
            { value: "discrete", label: "Discrete" },
          ]}
        />
      </div>

      {mode === "continuous" ? (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem]">
            <InnerBox onFocusCapture={() => setActiveField("x")} className={activeField === "x" ? "ring-2 ring-blue-500/30" : ""}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SIGNAL A</h3>
              <KatexMath math="x(t)" className="mt-2 block text-lg font-black text-slate-900 dark:text-white" />
              <div className="mt-3"><h3 id="conv-x-label" className="sr-only">Input signal x of t</h3><MathLiveSignalInput ref={xEditor} value={xExpression} onChange={setXExpression} labelledBy="conv-x-label" /></div>
              {!xParsed.ok && <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300">{xParsed.error}</p>}
            </InnerBox>
            <InnerBox onFocusCapture={() => setActiveField("h")} className={activeField === "h" ? "ring-2 ring-blue-500/30" : ""}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SIGNAL B</h3>
              <KatexMath math="h(t)" className="mt-2 block text-lg font-black text-slate-900 dark:text-white" />
              <div className="mt-3"><h3 id="conv-h-label" className="sr-only">Impulse response h of t</h3><MathLiveSignalInput ref={hEditor} value={hExpression} onChange={setHExpression} labelledBy="conv-h-label" /></div>
              {!hParsed.ok && <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300">{hParsed.error}</p>}
            </InnerBox>
            <InnerBox>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">QUICK EXPERIMENTS</h3>
              <div className="mt-3 grid gap-2">{presets.map((preset) => <button key={preset.label} type="button" onClick={() => setPreset(preset)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98] ${idle}`}>{preset.label}</button>)}</div>
            </InnerBox>
          </div>
          <InnerBox className="mt-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Inserting into <KatexMath math={activeField === "x" ? "x(t)" : "h(t)"} /> — click a field to switch</p>
            <div className="flex flex-wrap gap-1.5">{signalPills.map((item) => <button key={item.label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(item.latex)} className={pill}><KatexMath math={item.label} /></button>)}</div>
            <div className="flex flex-wrap gap-1.5">{tokenPills.map((item) => <button key={item.latex} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(item.latex)} className={pill}><KatexMath math={item.label} /></button>)}</div>
          </InnerBox>
        </>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem]">
          <InnerBox>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SEQUENCE A</h3>
            <KatexMath math="x[n]" className="mt-2 block text-lg font-black text-slate-900 dark:text-white" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comma-separated samples (starts at n = 0):</p>
            <input
              value={discreteXSource}
              onChange={(e) => {
                setDiscreteXSource(e.target.value);
                setDiscreteN(0);
              }}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              placeholder="e.g. 1, 2, 1"
            />
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-500 text-[11px]">Preview:</span>
              <KatexMath math={`x[n] = \\{${discreteX.length > 0 ? discreteX.join(",\\; ") : "\\dots"}\\}`} />
            </div>
          </InnerBox>

          <InnerBox>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SEQUENCE B</h3>
            <KatexMath math="h[n]" className="mt-2 block text-lg font-black text-slate-900 dark:text-white" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Impulse response samples (starts at n = 0):</p>
            <input
              value={discreteHSource}
              onChange={(e) => {
                setDiscreteHSource(e.target.value);
                setDiscreteN(0);
              }}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              placeholder="e.g. 1, -1, 2"
            />
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-500 text-[11px]">Preview:</span>
              <KatexMath math={`h[n] = \\{${discreteH.length > 0 ? discreteH.join(",\\; ") : "\\dots"}\\}`} />
            </div>
          </InnerBox>

          <InnerBox>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">DISCRETE PRESETS</h3>
            <div className="mt-3 grid gap-2">
              {discretePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDiscreteXSource(preset.x);
                    setDiscreteHSource(preset.h);
                    setDiscreteN(0);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98] ${idle}`}
                >
                  {preset.label}
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
                  min={-3}
                  max={3}
                  step={0.01}
                  defaultValue={-3}
                  onChange={(val) => {
                    setIsPlaying(false);
                    canvas.current?.setTime(val);
                  }}
                />
                <StudioButton onClick={() => step(0.05)} className="inline-flex items-center justify-center gap-1 cursor-pointer">
                  <StepForward className="h-3.5 w-3.5" />Fine step
                </StudioButton>
              </InnerBox>
              <ConvolutionCanvas ref={canvas} x={xParsed.ast} h={hParsed.ast} isPlaying={isPlaying} speed={speed} onFrame={(result) => updateReadout(result, true)} onManualReadout={manualReadout} />
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
