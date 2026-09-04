import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KatexMath } from "@/components/ui/KatexMath";
import { simulateLtiStepResponse } from "@/lib/controlMath";
import {
  buildFrequencyFactors,
  computeFrequencyResponse,
  extractStabilityMargins,
  factorSlopeEvents,
  formatEngineering,
  logspace,
  type FrequencyFactor,
} from "@/lib/frequencyResponseMath";
import { FrequencyTransferFunctionInput, type FrequencyTransferFunction } from "./FrequencyTransferFunctionInput";

type PrimaryView = "bode" | "nyquist" | "nichols";

const PANEL = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const HEADING = "text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white";
const RANGE_TRACK = "h-2 cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-700 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full";

const INITIAL_MODEL: FrequencyTransferFunction = {
  mode: "second-order",
  numerator: [1],
  denominator: [1, 1.2, 1],
  numeratorText: "1",
  denominatorText: "1 1.2 1",
  zpk: { gain: 1, zeros: "", poles: "-0.6+0.8j, -0.6-0.8j" },
  secondOrder: { wn: 1, zeta: 0.6 },
};

function matchDegrees(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  return {
    left: [...Array(length - left.length).fill(0), ...left],
    right: [...Array(length - right.length).fill(0), ...right],
  };
}

function factorSymbol(factor: FrequencyFactor) {
  if (factor.kind === "gain") return "K";
  return factor.label;
}

function makeClosedLoop(model: FrequencyTransferFunction, gain: number) {
  const numerator = model.numerator.map((coefficient) => coefficient * gain);
  const { left: denominatorAligned, right: numeratorAligned } = matchDegrees(model.denominator, numerator);
  return {
    numerator: numeratorAligned,
    denominator: denominatorAligned.map((coefficient, index) => coefficient + numeratorAligned[index]),
  };
}

function algebraicDcGain(numerator: number[], denominator: number[]) {
  const denominatorConstant = denominator[denominator.length - 1] ?? 0;
  if (Math.abs(denominatorConstant) < 1e-9) return "\\infty";
  return formatEngineering((numerator[numerator.length - 1] ?? 0) / denominatorConstant);
}

function ChartLegend() {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1.5"><i className="h-px w-5 bg-violet-500" /><KatexMath math="\mathrm{Exact}" /></span><span className="inline-flex items-center gap-1.5"><i className="h-0 w-5 border-t border-dashed border-rose-500" /><KatexMath math="\mathrm{Asymptote}" /></span><span className="inline-flex items-center gap-1.5"><i className="h-3 border-s border-dashed border-slate-400" /><KatexMath math="\mathrm{Crossover}" /></span></div>;
}

function ChartFrame({ title, children, legend = false }: { title: string; children: React.ReactNode; legend?: boolean }) {
  return <section className={`${PANEL} min-h-0`}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><KatexMath math={title} className={HEADING} />{legend && <ChartLegend />}</div>{children}</section>;
}

export function FrequencyResponseStudio() {
  const [model, setModel] = useState<FrequencyTransferFunction>(INITIAL_MODEL);
  const [gain, setGain] = useState(1);
  const [selectedFactorIds, setSelectedFactorIds] = useState<string[]>([]);
  const [primaryView, setPrimaryView] = useState<PrimaryView>("bode");
  const [timeHorizon, setTimeHorizon] = useState(12);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const openLoop = useMemo(() => ({
    numerator: model.numerator.map((coefficient) => coefficient * gain),
    denominator: model.denominator,
  }), [gain, model.denominator, model.numerator]);
  const factors = useMemo(() => buildFrequencyFactors(openLoop.numerator, openLoop.denominator), [openLoop.denominator, openLoop.numerator]);

  useEffect(() => {
    setSelectedFactorIds((previous) => {
      const supported = previous.filter((id) => factors.some((factor) => factor.id === id));
      return previous.length === 0 ? factors.map((factor) => factor.id) : supported;
    });
  }, [factors]);

  const response = useMemo(() => computeFrequencyResponse(factors, selectedFactorIds, logspace(-2, 4, 360)), [factors, selectedFactorIds]);
  const margins = useMemo(() => extractStabilityMargins(response), [response]);
  const slopeLogic = useMemo(() => factorSlopeEvents(factors.filter((factor) => selectedFactorIds.includes(factor.id))), [factors, selectedFactorIds]);
  const closedLoop = useMemo(() => makeClosedLoop(model, gain), [gain, model]);
  const stepResponse = useMemo(() => simulateLtiStepResponse(closedLoop.numerator, closedLoop.denominator, 1, timeHorizon, Math.min(0.02, timeHorizon / 700)), [closedLoop.denominator, closedLoop.numerator, timeHorizon]);

  const bodeData = useMemo(() => response.map((point) => ({
    ...point,
    logOmega: Math.log10(point.omega),
  })), [response]);
  const nyquistData = useMemo(() => response.map((point) => ({ re: point.re, im: point.im })), [response]);
  const nicholsData = useMemo(() => response.map((point) => ({ phase: point.phaseUnwrappedDeg, magnitude: point.magnitudeDb })), [response]);
  const stepData = useMemo(() => stepResponse.t.map((time, index) => ({ time, output: stepResponse.y[index], reference: stepResponse.sp[index] })), [stepResponse]);
  const gainCrossoverX = margins.gainCrossover ? Math.log10(margins.gainCrossover.omega) : undefined;
  const phaseCrossoverX = margins.phaseCrossover ? Math.log10(margins.phaseCrossover.omega) : undefined;
  const dcGain = algebraicDcGain(openLoop.numerator, openLoop.denominator);

  const toggleFactor = (id: string) => setSelectedFactorIds((current) => current.includes(id) ? current.filter((factorId) => factorId !== id) : [...current, id]);

  return <div className="space-y-6">
    <FrequencyTransferFunctionInput onChange={setModel} />

    <section className={`${PANEL} grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end`}>
      <div><h3 className={HEADING}>Live Gain Compensation</h3><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><KatexMath math="K" className="w-7 text-xl text-slate-950 dark:text-white" /><input aria-label="System gain K" className={`${RANGE_TRACK} w-full`} type="range" min={0.05} max={20} step={0.05} value={gain} onChange={(event) => setGain(Number(event.target.value))} /><div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-950"><KatexMath math={gain.toFixed(2)} className="font-mono text-sm text-violet-700 dark:text-violet-300" /></div></div></div>
      <div className="grid grid-cols-2 gap-2"><MetricTile label="\mathrm{PM}" value={margins.gainCrossover ? `${formatEngineering(margins.gainCrossover.phaseMarginDeg)}^\\circ` : "\\mathrm{N/A}"} /><MetricTile label="\mathrm{GM}" value={margins.phaseCrossover ? `${formatEngineering(margins.phaseCrossover.gainMarginDb)}\\,\\mathrm{dB}` : "\\mathrm{N/A}"} /></div>
    </section>

    <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <nav aria-label="Frequency-domain plot selection" className="flex flex-wrap gap-2">
          {([ ["bode", "\\mathrm{Bode}"], ["nyquist", "\\mathrm{Nyquist}"], ["nichols", "\\mathrm{Nichols}"] ] as const).map(([view, label]) => <button key={view} onClick={() => setPrimaryView(view)} className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${primaryView === view ? "border-violet-400 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-violet-100" : "border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:text-violet-200"}`}><KatexMath math={label} /></button>)}
        </nav>
        {primaryView === "bode" && <BodeView ready={chartsReady} data={bodeData} gainCrossoverX={gainCrossoverX} phaseCrossoverX={phaseCrossoverX} margins={margins} />}
        {primaryView === "nyquist" && <NyquistView ready={chartsReady} data={nyquistData} />}
        {primaryView === "nichols" && <NicholsView ready={chartsReady} data={nicholsData} />}
      </div>

      <aside className={`${PANEL} min-w-0 overflow-hidden`}><div className="flex items-center justify-between gap-3"><div><h3 className={HEADING}>Component Breakdown</h3><KatexMath math="G(j\omega)=\prod_i F_i(j\omega)" className="mt-1 block text-sm text-violet-700 dark:text-violet-300" /></div><KatexMath math={`${selectedFactorIds.length}/${factors.length}`} className="font-mono text-xs text-violet-700 dark:text-violet-300" /></div><div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{factors.map((factor) => <label key={factor.id} className="flex min-h-12 cursor-pointer items-center gap-3 py-3"><input type="checkbox" checked={selectedFactorIds.includes(factor.id)} onChange={() => toggleFactor(factor.id)} className="h-4 w-4 accent-violet-600" /><span className="min-w-0 flex-1 overflow-x-auto"><KatexMath math={factorSymbol(factor)} className="text-sm text-slate-800 dark:text-slate-100" /></span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${factor.kind === "pole" ? "bg-rose-500" : factor.kind === "zero" ? "bg-violet-500" : "bg-slate-400"}`} /></label>)}</div></aside>
    </section>

    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <ChartFrame title="\mathrm{Closed\! -\! Loop\ Step\ Response}"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><KatexMath math="T(s)=\frac{G(s)}{1+G(s)}" className="text-xs text-slate-500 dark:text-slate-400" /><label className="flex items-center gap-2"><KatexMath math="t_{max}" className="text-xs text-slate-600 dark:text-slate-300" /><input aria-label="Step response time horizon" className={`${RANGE_TRACK} w-28`} type="range" min={3} max={30} step={1} value={timeHorizon} onChange={(event) => setTimeHorizon(Number(event.target.value))} /><KatexMath math={`${timeHorizon}\\,\\mathrm{s}`} className="w-10 font-mono text-[10px] text-violet-700 dark:text-violet-300" /></label></div><div className="h-72 min-w-0">{chartsReady && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}><LineChart data={stepData} margin={{ top: 10, right: 20, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="currentColor" opacity={0.12} /><XAxis dataKey="time" type="number" domain={[0, timeHorizon]} tick={{ fontSize: 10 }} tickFormatter={(value) => `${value.toFixed(0)}s`} /><YAxis tick={{ fontSize: 10 }} width={34} /><Tooltip content={<StepTooltip />} /><ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="5 5" /><Line dataKey="reference" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="5 4" isAnimationActive={false} /><Line dataKey="output" stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div></ChartFrame>
      <section className={PANEL}><h3 className={HEADING}>Time-Domain Correlation</h3><div className="mt-4 grid grid-cols-2 gap-2"><MetricTile label="M_p" value={`${formatEngineering(stepResponse.overshootPercent)}\\%`} /><MetricTile label="t_r" value={`${formatEngineering(stepResponse.riseTime)}\\,\\mathrm{s}`} /><MetricTile label="t_s" value={`${formatEngineering(stepResponse.settlingTime)}\\,\\mathrm{s}`} /><MetricTile label="e_{ss}" value={formatEngineering(stepResponse.steadyStateError)} /></div></section>
    </section>

    <SketchTutorial dcGain={dcGain} factors={factors.filter((factor) => selectedFactorIds.includes(factor.id))} initialSlope={slopeLogic.initialSlopeDbPerDecade} events={slopeLogic.events} />
  </div>;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950"><KatexMath math={label} className="block text-[10px] text-slate-500 dark:text-slate-400" /><KatexMath math={value} className="mt-1 block overflow-x-auto font-mono text-sm text-slate-950 dark:text-white" /></div>;
}

function StepTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { time: number; output: number; reference: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return <div className="border border-white/15 bg-slate-950 px-3 py-2 text-[11px] text-white shadow-xl"><div>t = {Number(point.time).toFixed(2)} s</div><div><span className="font-serif italic">r(t)</span> (Set-point) = {formatEngineering(point.reference)}</div><div><span className="font-serif italic">y(t)</span> = {formatEngineering(point.output)}</div></div>;
}

function BodeView({ ready, data, gainCrossoverX, phaseCrossoverX, margins }: { ready: boolean; data: Array<Record<string, number>>; gainCrossoverX?: number; phaseCrossoverX?: number; margins: ReturnType<typeof extractStabilityMargins> }) {
  return <div className="grid gap-4"><ChartFrame title="20\log_{10}|G(j\omega)|\quad [\mathrm{dB}]" legend><div className="h-72 min-w-0">{ready && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}><LineChart data={data} margin={{ top: 8, right: 22, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="currentColor" opacity={0.12} /><XAxis dataKey="logOmega" type="number" domain={[-2, 4]} ticks={[-2, -1, 0, 1, 2, 3, 4]} tick={{ fontSize: 10 }} tickFormatter={(value) => `10^${value}`} /><YAxis dataKey="magnitudeDb" tick={{ fontSize: 10 }} width={38} /><Tooltip content={<BodeTooltip unit="dB" />} /><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />{gainCrossoverX !== undefined && <ReferenceLine x={gainCrossoverX} stroke="#7c3aed" strokeDasharray="4 4" />}{phaseCrossoverX !== undefined && <ReferenceLine x={phaseCrossoverX} stroke="#f43f5e" strokeDasharray="4 4" />}<Line dataKey="asymMagnitudeDb" stroke="#f43f5e" strokeWidth={1.75} strokeDasharray="7 5" dot={false} isAnimationActive={false} /><Line dataKey="magnitudeDb" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div>{margins.phaseCrossover && <MarginTag color="rose" math={`\\mathrm{GM}=${formatEngineering(margins.phaseCrossover.gainMarginDb)}\\,\\mathrm{dB}\\quad @\\quad \\omega_{pc}=${formatEngineering(margins.phaseCrossover.omega)}\\,\\mathrm{rad/s}`} />}</ChartFrame>
    <ChartFrame title="\angle G(j\omega)\quad [^\circ]" legend><div className="h-72 min-w-0">{ready && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}><LineChart data={data} margin={{ top: 8, right: 22, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="currentColor" opacity={0.12} /><XAxis dataKey="logOmega" type="number" domain={[-2, 4]} ticks={[-2, -1, 0, 1, 2, 3, 4]} tick={{ fontSize: 10 }} tickFormatter={(value) => `10^${value}`} /><YAxis dataKey="phaseUnwrappedDeg" tick={{ fontSize: 10 }} width={42} /><Tooltip content={<BodeTooltip unit="°" />} /><ReferenceLine y={-180} stroke="#94a3b8" strokeDasharray="4 4" />{gainCrossoverX !== undefined && <ReferenceLine x={gainCrossoverX} stroke="#7c3aed" strokeDasharray="4 4" />}<Line dataKey="asymPhaseDeg" stroke="#f43f5e" strokeWidth={1.75} strokeDasharray="7 5" dot={false} isAnimationActive={false} /><Line dataKey="phaseUnwrappedDeg" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div>{margins.gainCrossover && <MarginTag color="violet" math={`\\mathrm{PM}=${formatEngineering(margins.gainCrossover.phaseMarginDeg)}^\\circ\\quad @\\quad \\omega_{gc}=${formatEngineering(margins.gainCrossover.omega)}\\,\\mathrm{rad/s}`} />}</ChartFrame>
  </div>;
}

function BodeTooltip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: { omega: number; magnitudeDb: number; phaseUnwrappedDeg: number } }>; unit: string }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return <div className="border border-white/15 bg-slate-950 px-3 py-2 text-[11px] text-white shadow-xl"><div><span className="italic font-serif">ω</span> = {formatEngineering(point.omega)} rad/s</div><div><span className="italic font-serif">|G|</span> = {formatEngineering(point.magnitudeDb)} dB</div><div><span className="italic font-serif">∠G</span> = {formatEngineering(point.phaseUnwrappedDeg)}°</div><div className="sr-only">{unit}</div></div>;
}

function MarginTag({ math, color }: { math: string; color: "violet" | "rose" }) { return <div className={`mt-2 border-s-2 px-3 py-2 ${color === "violet" ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-rose-500 bg-rose-50 dark:bg-rose-500/10"}`}><KatexMath math={math} className="text-[11px] text-slate-700 dark:text-slate-200" /></div>; }

function NyquistView({ ready, data }: { ready: boolean; data: Array<{ re: number; im: number }> }) {
  const extent = Math.max(1, ...data.flatMap((point) => [Math.abs(point.re), Math.abs(point.im)])) * 1.15;
  return <ChartFrame title="\mathrm{Nyquist}:\ \Re\{G(j\omega)\}\ \mathrm{vs.}\ \Im\{G(j\omega)\}"><div className="h-[38rem] min-w-0">{ready && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}><LineChart data={data} margin={{ top: 20, right: 20, bottom: 10, left: 5 }}><CartesianGrid strokeDasharray="3 5" stroke="currentColor" opacity={0.12} /><XAxis dataKey="re" type="number" domain={[-extent, extent]} tick={{ fontSize: 10 }} /><YAxis dataKey="im" type="number" domain={[-extent, extent]} tick={{ fontSize: 10 }} width={40} /><Tooltip content={<ComplexTooltip />} /><ReferenceLine x={0} stroke="#94a3b8" /><ReferenceLine y={0} stroke="#94a3b8" /><ReferenceLine x={-1} y={0} stroke="#f43f5e" strokeDasharray="4 4" /><Line dataKey="im" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div><KatexMath math="\text{The crimson reference marks the critical point }-1+j0." className="mt-3 block text-xs text-slate-500 dark:text-slate-400" /></ChartFrame>;
}

function ComplexTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { re: number; im: number } }> }) { if (!active || !payload?.[0]) return null; const point = payload[0].payload; return <div className="border border-white/15 bg-slate-950 px-3 py-2 text-[11px] text-white"><div><span className="italic font-serif">Re</span> = {formatEngineering(point.re)}</div><div><span className="italic font-serif">Im</span> = {formatEngineering(point.im)}</div></div>; }

function NicholsView({ ready, data }: { ready: boolean; data: Array<{ phase: number; magnitude: number }> }) { return <ChartFrame title="\mathrm{Nichols}:\ 20\log_{10}|G(j\omega)|\ \mathrm{vs.}\ \angle G(j\omega)"><div className="h-[38rem] min-w-0">{ready && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}><LineChart data={data} margin={{ top: 20, right: 20, bottom: 10, left: 5 }}><CartesianGrid strokeDasharray="3 5" stroke="currentColor" opacity={0.12} /><XAxis dataKey="phase" type="number" tick={{ fontSize: 10 }} /><YAxis dataKey="magnitude" type="number" tick={{ fontSize: 10 }} width={40} /><Tooltip content={<NicholsTooltip />} /><ReferenceLine x={-180} stroke="#f43f5e" strokeDasharray="4 4" /><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" /><Line dataKey="magnitude" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div><KatexMath math="\text{The crossing of }0\,\mathrm{dB}\text{ and }-180^\circ\text{ is the open-loop stability reference.}" className="mt-3 block text-xs text-slate-500 dark:text-slate-400" /></ChartFrame>; }

function NicholsTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { phase: number; magnitude: number } }> }) { if (!active || !payload?.[0]) return null; const point = payload[0].payload; return <div className="border border-white/15 bg-slate-950 px-3 py-2 text-[11px] text-white"><div><span className="italic font-serif">∠G</span> = {formatEngineering(point.phase)}°</div><div><span className="italic font-serif">|G|</span> = {formatEngineering(point.magnitude)} dB</div></div>; }

function SketchTutorial({ dcGain, factors, initialSlope, events }: { dcGain: string; factors: FrequencyFactor[]; initialSlope: number; events: Array<{ omega: number; deltaDbPerDecade: number; label: string }> }) {
  let runningSlope = initialSlope;
  return <section className={PANEL}><div className="border-b border-slate-200 pb-4 dark:border-slate-800"><h3 className={HEADING}>Step-by-Step Sketch Tutor</h3></div><div className="grid divide-y divide-slate-100 dark:divide-slate-800 xl:grid-cols-3 xl:divide-x xl:divide-y-0"><TutorialStep title="\mathrm{Anchor\ the\ DC\ gain}"><KatexMath math={`K_{DC}=${dcGain}`} displayMode className="text-lg text-violet-700 dark:text-violet-300" /></TutorialStep><TutorialStep title="\mathrm{Order\ the\ corners}">{events.length ? <ol className="space-y-2">{events.map((event, index) => <li key={`${event.omega}-${event.label}-${index}`} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" /><KatexMath math={`\\omega_c=${formatEngineering(event.omega)}\\,\\mathrm{rad/s}\\quad (${event.label})`} className="text-xs text-slate-700 dark:text-slate-200" /></li>)}</ol> : <KatexMath math="\mathrm{No\ finite\ corner\ frequencies}" className="text-xs text-slate-500 dark:text-slate-400" />}</TutorialStep><TutorialStep title="\mathrm{Trace\ the\ slope\ logic}"><KatexMath math={`\\mathrm{Start:}\\quad ${formatEngineering(initialSlope)}\\,\\mathrm{dB/dec}`} className="text-xs text-slate-700 dark:text-slate-200" />{events.map((event, index) => { runningSlope += event.deltaDbPerDecade; return <KatexMath key={`${event.omega}-${event.deltaDbPerDecade}-${index}`} math={`\\omega=${formatEngineering(event.omega)}:\\quad ${event.deltaDbPerDecade > 0 ? "+" : ""}${formatEngineering(event.deltaDbPerDecade)}\\Rightarrow ${formatEngineering(runningSlope)}\\,\\mathrm{dB/dec}`} className="mt-2 block text-xs text-slate-700 dark:text-slate-200" />; })}</TutorialStep></div></section>;
}

function TutorialStep({ title, children }: { title: string; children: React.ReactNode }) { return <article className="min-h-40 p-4"><KatexMath math={title} className="text-sm font-bold text-slate-950 dark:text-white" /><div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{children}</div></article>; }
