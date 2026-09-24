/**
 * MAE Academy / Signals & Systems — Tab D 3D Fourier Analysis workbench.
 * Solver execution is pure and memoized; the visual spectrum and partial sum
 * are delegated to imperative Canvas and the 3D waterfall is added separately.
 */
import { Braces, Gauge } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioSlider, StudioCard, InnerBox } from "@/components/common/templates";
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import FourierCanvases from "@/components/signals/FourierCanvases";
import { FourierWaterfall3D } from "@/components/signals/FourierWaterfall3D";
import { fourierSeries, fourierTransform } from "@/features/signals/engines/fourierEngine";
import { parseSignalExpression } from "@/features/signals/engines/signalEngine";
import "./fourierAcademic.css";

const active = "border-violet-500 bg-violet-600 text-white dark:border-violet-400 dark:bg-violet-500";
const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const examples = [{ label: "Periodic rectangular pulse", value: "\\operatorname{rect}(t)" }, { label: "Cosine carrier", value: "cos(2*pi*t)" }, { label: "Triangle pulse", value: "\\operatorname{tri}(t)" }, { label: "Sinc", value: "\\operatorname{sinc}(t)" }] as const;
function number(value: number, digits = 4) { return Number(value.toFixed(digits)).toString(); }

export function FourierAnalysisLab() {
  const [expression, setExpression] = useState("\\operatorname{rect}(t)"); const [mode, setMode] = useState<"fs" | "ft">("fs"); const [period, setPeriod] = useState(2); const [harmonics, setHarmonics] = useState(12); const [scale, setScale] = useState(1);
  const field = useRef<MathLiveSignalInputHandle>(null); const parsed = useMemo(() => parseSignalExpression(expression), [expression]);
  const series = useMemo(() => parsed.ok && mode === "fs" ? fourierSeries(parsed.ast, period, 18) : null, [mode, parsed, period]);
  const transform = useMemo(() => parsed.ok && mode === "ft" ? fourierTransform(parsed.ast, scale, 16, 240, 8, 1600) : null, [mode, parsed, scale]);
  const derivation = series?.derivation ?? transform?.derivation ?? [];
  return <div className="fourier-academic space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Harmonic Workspace</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Examine the signal’s harmonic structure in the time domain, magnitude/phase spectra, and a rotatable time–harmonic space.</p>
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
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
        <InnerBox>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">TIME-DOMAIN SIGNAL</h3>
          <KatexMath math={`x(t)=${expression}`} className="mt-2 block min-h-7 overflow-x-auto text-lg font-black text-slate-900 dark:text-white" />
          <div className="mt-4"><h3 id="fourier-field-label" className="sr-only">Fourier input signal equation</h3><MathLiveSignalInput ref={field} value={expression} onChange={setExpression} labelledBy="fourier-field-label" /></div>
          {!parsed.ok && <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{examples.map((example) => <button key={example.label} type="button" onClick={() => setExpression(example.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{example.label}</button>)}</div>
        </InnerBox>
        <InnerBox>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">ANALYSIS SETTINGS</h3>
          {mode === "fs" ? <>
            <StudioSlider className="mt-4" label="Fundamental period" mathLabel={<KatexMath math="T_0" />} unit=" s" min={0.5} max={6} step={0.1} value={period} onChange={setPeriod} />
            <StudioSlider className="mt-5" label="Number of harmonics" mathLabel={<KatexMath math="N" />} min={1} max={50} step={1} value={harmonics} onChange={setHarmonics} />
            <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">The partial-sum graph redraws inside requestAnimationFrame as <KatexMath math="N" /> changes; the amber guide marks a discontinuity where Gibbs overshoot is visible.</p>
          </> : <>
            <StudioSlider className="mt-4" label="Time scale" mathLabel={<KatexMath math="a" />} min={0.3} max={3} step={0.05} value={scale} onChange={setScale} />
            <div className="mt-4 rounded-xl border border-violet-300/70 bg-violet-50 p-3 text-xs leading-5 text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100">
              <Gauge className="mr-1 inline h-3.5 w-3.5" />Compressing <KatexMath math="x(at)" /> expands the frequency envelope by the reciprocal scale.
            </div>
          </>}
        </InnerBox>
      </div>
    </StudioCard>
    {parsed.ok && <>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <StudioCard>
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              MAGNITUDE, PHASE &amp; {mode === "fs" ? "HARMONIC BUILDER" : "TIME SCALING"}
            </h3>
          </div>
          <FourierCanvases mode={mode} series={series} transform={transform} node={parsed.ast} harmonics={harmonics} scale={scale} />
        </StudioCard>
        <StudioCard className="max-h-[630px] overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              {mode === "fs" ? "FOURIER SERIES" : "FOURIER TRANSFORM"}
            </h3>
          </div>
          <div className="mt-5 space-y-3 overflow-x-auto">
            {derivation.map((step, index) => <KatexMath key={index} math={step} block className="block text-left text-sm text-slate-600 dark:text-slate-300" />)}
          </div>
          {mode === "fs" && series && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">SELECTED COEFFICIENTS</h3>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
              {series.coefficients.filter((item) => [0, 1, -1, 2, -2].includes(item.harmonic)).map((item) => <div key={item.harmonic} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900"><KatexMath math={`c_{${item.harmonic}}`} /><span className="font-mono">|c|={number(item.magnitude)}</span></div>)}
            </div>
          </div>}
          {mode === "ft" && transform?.isStandardRect && <div className="mt-5 rounded-xl border border-blue-300/60 bg-blue-50 p-4 text-xs leading-5 text-blue-950 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-100">
            <Braces className="mr-1 inline h-3.5 w-3.5" />Pattern shortcut active: the rectangular pulse spectrum is evaluated analytically as a scaled sinc envelope.
          </div>}
        </StudioCard>
      </div>
      {mode === "fs" && series ? <StudioCard>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            3D TIME–FREQUENCY HARMONIC WATERFALL
          </h3>
          <span className="text-[11px] text-slate-400">Drag to rotate • Scroll to zoom • Interactive software 3D engine</span>
        </div>
        <FourierWaterfall3D series={series} harmonics={harmonics} />
      </StudioCard> : <StudioCard className="border-blue-300/50 dark:border-blue-400/25">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
          FOURIER TRANSFORM SCALING VIEW
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Use the scale control above to compress or expand the time-domain signal. The direct spectrum canvas immediately displays the reciprocal spread predicted by the scaling relationship.</p>
        <KatexMath math="x(at)\;\Longleftrightarrow\;\frac{1}{|a|}X\!\left(j\frac{\omega}{a}\right)" block className="mt-4 block overflow-x-auto text-left text-lg text-blue-700 dark:text-blue-200" />
      </StudioCard>}
    </>}
  </div>;
}

export default FourierAnalysisLab;
