/**
 * MAE Academy / Signals & Systems — Tab C Convolution Engine.
 * Playback time is retained inside ConvolutionCanvas refs. This React shell
 * only holds setup inputs and user commands; it never receives animation t.
 */
import katex from "katex";
import { FastForward, Pause, Play, Rewind, Sigma, StepForward } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { GradientButton, SegmentedControl, StudioButton, StudioSlider, StudioCard, InnerBox, FormulaBox } from "@/components/common/templates";
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import { ConvolutionCanvas, type ConvolutionCanvasHandle } from "@/components/signals/ConvolutionCanvas";
import { DiscreteConvolutionTable } from "@/components/signals/DiscreteConvolutionTable";
import { continuousConvolutionAt, type ContinuousConvolutionResult } from "@/features/signals/engines/convolutionEngine";
import { parseSignalExpression } from "@/features/signals/engines/signalEngine";

const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const primary = "border-violet-500 bg-violet-600 text-white hover:bg-violet-500 dark:border-violet-400 dark:bg-violet-500 dark:hover:bg-violet-400";
const presets = [{ label: "Rectangular pulse", x: "\\operatorname{rect}(t)", h: "\\operatorname{rect}(t)" }, { label: "Step × exponential-like ramp", x: "u(t)", h: "r(t)" }, { label: "Delta scan", x: "\\operatorname{rect}(t)", h: "\\delta(t-1)" }, { label: "Sinc filter", x: "\\operatorname{sinc}(t)", h: "\\operatorname{rect}(t)" }] as const;

function renderKatex(target: HTMLSpanElement | null, math: string) { if (!target) return; target.innerHTML = katex.renderToString(math, { displayMode: false, throwOnError: false }); }
function format(value: number, digits = 3) { return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "—"; }

export function ConvolutionLab() {
  const [xExpression, setXExpression] = useState("\\operatorname{rect}(t)"); const [hExpression, setHExpression] = useState("\\operatorname{rect}(t)");
  const [mode, setMode] = useState<"continuous" | "discrete">("continuous"); const [isPlaying, setIsPlaying] = useState(false); const [speed, setSpeed] = useState(0.7);
  const xEditor = useRef<MathLiveSignalInputHandle>(null); const hEditor = useRef<MathLiveSignalInputHandle>(null); const canvas = useRef<ConvolutionCanvasHandle>(null); const formulaRef = useRef<HTMLSpanElement>(null); const resultRef = useRef<HTMLSpanElement>(null); const sliderRef = useRef<HTMLInputElement>(null); const lastFormulaUpdate = useRef(0);
  const xParsed = useMemo(() => parseSignalExpression(xExpression), [xExpression]); const hParsed = useMemo(() => parseSignalExpression(hExpression), [hExpression]);
  const valid = xParsed.ok && hParsed.ok;
  const updateReadout = (result: ContinuousConvolutionResult, throttle: boolean) => {
    if (sliderRef.current) {
      sliderRef.current.value = String(result.t);
      sliderRef.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const now = performance.now();
    if (throttle && now - lastFormulaUpdate.current < 80) return;
    lastFormulaUpdate.current = now;
    renderKatex(formulaRef.current, result.overlapLatex);
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
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Reverse, shift, multiply, integrate. The continuous scope evaluates <KatexMath math="y(t)=\int x(\tau)h(t-\tau)\,d\tau" /> at each canvas frame without storing animation time in React.</p>
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
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem]">
        <InnerBox>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SIGNAL A</h3>
          <KatexMath math="x(t)" className="mt-2 block text-lg font-black text-slate-900 dark:text-white" />
          <div className="mt-3"><h3 id="conv-x-label" className="sr-only">Input signal x of t</h3><MathLiveSignalInput ref={xEditor} value={xExpression} onChange={setXExpression} labelledBy="conv-x-label" /></div>
          {!xParsed.ok && <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300">{xParsed.error}</p>}
        </InnerBox>
        <InnerBox>
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
    </StudioCard>
    {valid && xParsed.ok && hParsed.ok && (mode === "continuous" ? <StudioCard>
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
      <FormulaBox className="mt-4 flex flex-col gap-2">
        <span className="font-black uppercase tracking-[0.14em] text-xs">Live overlap bounds / trapezoidal result</span>
        <span ref={formulaRef} className="overflow-x-auto"><KatexMath math="y(-3)=0" /></span>
        <span className="text-[11px] opacity-80">Resolution: <KatexMath math="d\tau\le0.01" />. Delta responses bypass numerical sampling through the symbolic shortcut.</span>
      </FormulaBox>
    </StudioCard> : <StudioCard>
      <div className="mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
          DISCRETE CONVOLUTION MATRIX
        </h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Choose the output sample index. Its reverse diagonal highlights every product contributing to <KatexMath math="y[n]" />.</p>
      </div>
      <DiscreteConvolutionTable />
    </StudioCard>) }
  </div>;
}

export default ConvolutionLab;
