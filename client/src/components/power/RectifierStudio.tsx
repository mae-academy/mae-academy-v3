import { useEffect, useMemo, useState } from "react";
/* MAE Luminous Technical Atelier: the established scope retains its calibrated grid and
   adds only a concise DCM extinction marker tied to the solver's sampled load current. */
import { CartesianGrid, Label, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  defaultRectifierParameters,
  simulateControlledRectifier,
  type FullWaveSubtype,
  type RectifierLoad,
  type RectifierParameters,
  type RectifierPhase,
  type RectifierType,
  type VoltageFormat,
} from "@/lib/rectifierMath";

const card = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const heading = "text-sm font-bold text-slate-800 dark:text-white";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right font-mono text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-800 dark:bg-slate-950 dark:text-white";
const tex = String.raw;
type StudioOption<T extends string> = { value: T; label?: string; math?: string };

const phaseOptions: StudioOption<RectifierPhase>[] = [
  { value: "single", label: "Single-Phase (1-Φ)" },
  { value: "three", label: "Three-Phase (3-Φ)" },
];
const rectifierOptions: StudioOption<RectifierType>[] = [
  { value: "half", label: "Half-Wave" },
  { value: "full", label: "Full-Wave" },
];
const fullWaveOptions: StudioOption<FullWaveSubtype>[] = [
  { value: "bridge", label: "Bridge" },
  { value: "center-tapped", label: "Center-Tapped" },
];
const loadOptions: StudioOption<RectifierLoad>[] = [
  { value: "R", math: "R" }, { value: "RL", math: "RL" }, { value: "RC", math: "RC" }, { value: "RLC", math: "RLC" }, { value: "RLE", math: "RLE" },
];
const voltageOptions: StudioOption<VoltageFormat>[] = [
  { value: "rms", math: tex`V_{\mathrm{RMS}}` }, { value: "peak", math: "V_m" },
];

function NumberValue(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1000 || absolute < 0.01)) {
    const [mantissa, exponent] = value.toExponential(2).split("e");
    return `${mantissa}\\times 10^{${Number(exponent)}}`;
  }
  return Number(value.toFixed(digits)).toString();
}

function MathLabel({ math }: { math: string }) {
  return <KatexMath math={math} className="text-xs font-bold text-slate-500 dark:text-slate-400" />;
}

function OptionMatrix<T extends string>({ value, options, onChange, columns = 2 }: { value: T; options: StudioOption<T>[]; onChange: (value: T) => void; columns?: number }) {
  return <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-bold transition-all ${value === option.value ? "border-violet-400 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-violet-100" : "border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:text-violet-200"}`}>{option.math ? <KatexMath math={option.math} /> : option.label}</button>)}</div>;
}

function NumberField({ label, value, onChange, disabled = false, min = 0, step = "any" }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; min?: number; step?: number | "any" }) {
  const [editing, setEditing] = useState(false);
  return <label className="block"><span className="mb-1.5 block"><MathLabel math={label} /></span><div className="relative"><input aria-label={label} type="number" min={min} step={step} disabled={disabled} value={Number.isFinite(value) ? value : 0} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={(event) => onChange(Number(event.target.value) || 0)} style={editing ? undefined : { color: "transparent", WebkitTextFillColor: "transparent", caretColor: "transparent" }} className={`${field} text-center`} /><span aria-hidden className={`pointer-events-none absolute inset-0 grid place-items-center ${editing ? "hidden" : ""} ${disabled ? "opacity-35" : ""}`}><KatexMath math={NumberValue(value)} className="text-sm font-semibold text-slate-900 dark:text-white" /></span></div></label>;
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950"><KatexMath math={label} className="block text-[10px] text-slate-500 dark:text-slate-400" /><KatexMath math={value} className="mt-1 block overflow-x-auto text-xs font-bold text-slate-900 dark:text-white" /></div>;
}

function ScopeTooltip({ active, payload, phase }: { active?: boolean; payload?: Array<{ payload: { time: number; va: number; vb: number; vc: number; outputVoltage: number; outputCurrent: number } }>; phase: RectifierPhase }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 shadow-xl"><KatexMath math={tex`t=${NumberValue(point.time * 1000, 2)}\,\mathrm{ms}`} className="block text-[11px] text-slate-200" />{phase === "three" ? <><KatexMath math={tex`V_a=${NumberValue(point.va)}\,\mathrm{V}`} className="mt-1 block text-[11px] text-cyan-300" /><KatexMath math={tex`V_b=${NumberValue(point.vb)}\,\mathrm{V}`} className="mt-1 block text-[11px] text-amber-300" /><KatexMath math={tex`V_c=${NumberValue(point.vc)}\,\mathrm{V}`} className="mt-1 block text-[11px] text-rose-300" /></> : <KatexMath math={tex`V_{in}=${NumberValue(point.va)}\,\mathrm{V}`} className="mt-1 block text-[11px] text-slate-300" />}<KatexMath math={tex`V_o=${NumberValue(point.outputVoltage)}\,\mathrm{V}`} className="mt-1 block text-[11px] text-blue-300" /><KatexMath math={tex`I_o=${NumberValue(point.outputCurrent)}\,\mathrm{A}`} className="mt-1 block text-[11px] text-violet-300" /></div>;
}

function CircuitPlate({ parameters }: { parameters: RectifierParameters }) {
  const topology = parameters.rectifierType === "full" ? parameters.fullWaveSubtype === "bridge" ? "Bridge" : "Center-Tapped" : "Half-Wave";
  const bridge = parameters.rectifierType === "full" && parameters.fullWaveSubtype === "bridge";
  return <section className={`${card} min-h-[340px]`}><div className="flex items-center justify-between gap-3"><h3 className={heading}>Converter Drafting Plate</h3><span className="font-mono text-[10px] font-bold tracking-[.12em] text-violet-700 dark:text-violet-300">{topology.toUpperCase()}</span></div><div className="mt-4 grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950"><svg viewBox="0 0 360 140" className="h-36 w-full max-w-lg" fill="none" role="img" aria-label={`${topology} rectifier native drafting plate`}><path d="M18 70h40m0 0 12-15v30L58 70m12 0h32M266 70h76M316 40v60m-13-48h26m-26 18h26m-26 18h26" stroke="#64748b" strokeWidth="1.5" /><circle cx="36" cy="70" r="18" stroke="#94a3b8" strokeWidth="1.4" /><path d="M24 70c4-10 9-10 13 0s9 10 13 0" stroke="#60a5fa" strokeWidth="1.6" />{bridge ? <><path d="M102 44h82v52h-82zM102 44l82 52M184 44l-82 52M143 44v-16m0 68v16M184 70h58" stroke="#8b5cf6" strokeWidth="1.7" /><path d="M116 51l12 7-12 7m12-7h13m-11 24 12 7-12 7m12-7h14m17-32 12 7-12 7m12-7h12m-26 24 12 7-12 7m12-7h12" stroke="#c4b5fd" strokeWidth="1.3" /></> : <><path d="M102 70h38m0 0 13-15v30l-13-15m13 0h65m0-30v60m-13-48h26m-26 18h26m-26 18h26m-23-48 12 8-12 8m12-8h14" stroke="#8b5cf6" strokeWidth="1.7" /><path d="M218 70h48" stroke="#8b5cf6" strokeWidth="1.7" /></>}<circle cx="266" cy="70" r="3.5" fill="#f43f5e" /><path d="M266 70h22" stroke="#f43f5e" strokeWidth="1.8" /><text x="18" y="126" fill="#94a3b8" fontSize="8" fontFamily="ui-monospace, monospace">AC SOURCE</text><text x="115" y="126" fill="#a78bfa" fontSize="8" fontFamily="ui-monospace, monospace">{bridge ? "D1–D4 BRIDGE" : "CONTROLLED PATH"}</text><text x="260" y="126" fill="#fb7185" fontSize="8" fontFamily="ui-monospace, monospace">REF / VO</text></svg><span className="mt-2 block font-mono text-[9px] font-bold tracking-[.12em] text-slate-400">SOURCE · RECTIFICATION PATH · LOAD REFERENCE</span></div></section>;
}

export function RectifierStudio() {
  const [parameters, setParameters] = useState<RectifierParameters>(defaultRectifierParameters);
  const [chartsReady, setChartsReady] = useState(false);
  const simulation = useMemo(() => simulateControlledRectifier(parameters), [parameters]);
  const hasResistance = ["R", "RL", "RC", "RLC", "RLE"].includes(parameters.loadType);
  const hasInductance = ["RL", "RLC", "RLE"].includes(parameters.loadType);
  const hasCapacitance = ["RC", "RLC"].includes(parameters.loadType);
  const hasBackEmf = parameters.loadType === "RLE";

  useEffect(() => { const frame = requestAnimationFrame(() => setChartsReady(true)); return () => cancelAnimationFrame(frame); }, []);

  const update = <K extends keyof RectifierParameters>(key: K, value: RectifierParameters[K]) => setParameters((current) => ({ ...current, [key]: value }));
  const data = useMemo(() => simulation.samples.map((sample, plotIndex) => ({ ...sample, plotIndex })), [simulation.samples]);
  const metrics = simulation.metrics;
  const currentExtinctionIndex = useMemo(() => metrics.conductionMode === "DCM" ? data.findIndex((point, index) => index > Math.floor(data.length * 0.2) && Math.abs(point.outputCurrent) <= 1e-8) : -1, [data, metrics.conductionMode]);
  const sourceTraceVa = parameters.phase === "three" ? <Line yAxisId="voltage" type="linear" dataKey="va" name="V_a" stroke="#22d3ee" strokeWidth={3.25} dot={false} isAnimationActive={false} /> : null;
  const sourceTraceVb = parameters.phase === "three" ? <Line yAxisId="voltage" type="linear" dataKey="vb" name="V_b" stroke="#fbbf24" strokeWidth={3.25} dot={false} isAnimationActive={false} /> : null;
  const sourceTraceVc = parameters.phase === "three" ? <Line yAxisId="voltage" type="linear" dataKey="vc" name="V_c" stroke="#fb7185" strokeWidth={3.25} dot={false} isAnimationActive={false} /> : null;
  const singleInputTrace = parameters.phase === "single" ? <Line yAxisId="voltage" type="linear" dataKey="va" name="V_{in}" stroke="#94a3b8" strokeWidth={1.75} strokeDasharray="5 5" dot={false} isAnimationActive={false} /> : null;
  const topologyPanel = <section className={card}><div className="mb-4 flex items-center justify-between gap-3"><h3 className={heading}>Topology Configuration</h3><KatexMath math={tex`\alpha=${NumberValue(parameters.firingAngle, 0)}^\circ`} className="text-sm text-violet-700 dark:text-violet-300" /></div><div className="space-y-4"><div><span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Phase</span><OptionMatrix value={parameters.phase} options={phaseOptions} onChange={(phase) => update("phase", phase)} /></div><div><span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Rectifier Type</span><OptionMatrix value={parameters.rectifierType} options={rectifierOptions} onChange={(rectifierType) => update("rectifierType", rectifierType)} /></div>{parameters.rectifierType === "full" && <div><span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Full-Wave Subtype</span><OptionMatrix value={parameters.fullWaveSubtype} options={fullWaveOptions} onChange={(fullWaveSubtype) => update("fullWaveSubtype", fullWaveSubtype)} /></div>}<div className="border-t border-slate-200 pt-4 dark:border-slate-800"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Source &amp; Firing Parameters</h4><KatexMath math={tex`\omega=${NumberValue(simulation.angularFrequency, 1)}\,\mathrm{rad/s}`} className="text-xs text-violet-700 dark:text-violet-300" /></div><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Voltage Format</span><OptionMatrix value={parameters.voltageFormat} options={voltageOptions} onChange={(voltageFormat) => update("voltageFormat", voltageFormat)} /></div><NumberField label={tex`V_{in}\,[\mathrm{V}]`} value={parameters.inputVoltage} min={0} step={1} onChange={(inputVoltage) => update("inputVoltage", inputVoltage)} /><NumberField label={tex`f\,[\mathrm{Hz}]`} value={parameters.frequency} min={1} step={1} onChange={(frequency) => update("frequency", frequency)} /><div className="sm:col-span-2"><div className="mb-2 flex items-center justify-between"><MathLabel math={tex`\alpha\,[^\circ]`} /><KatexMath math={tex`${NumberValue(parameters.firingAngle, 0)}^\circ`} className="text-xs text-violet-700 dark:text-violet-300" /></div><input aria-label="firing angle slider" type="range" min={0} max={180} step={1} value={parameters.firingAngle} onChange={(event) => update("firingAngle", Number(event.target.value))} className="w-full accent-blue-600" /></div></div></div></div></section>;

  const loadPanel = <section className={card}><h3 className={heading}>Load Configuration</h3><div className="mt-4"><span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Load Type</span><OptionMatrix value={parameters.loadType} options={loadOptions} columns={5} onChange={(loadType) => update("loadType", loadType)} /></div><div className="mt-4"><span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Free-Wheeling Diode (FWD)</span><OptionMatrix value={parameters.freeWheelingDiode ? "yes" : "no"} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={(value) => update("freeWheelingDiode", value === "yes")} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><NumberField label={tex`R\,[\Omega]`} value={parameters.resistance} disabled={!hasResistance} min={0.05} step={0.1} onChange={(resistance) => update("resistance", resistance)} /><NumberField label={tex`L\,[\mathrm{mH}]`} value={parameters.inductanceMilliHenry} disabled={!hasInductance} min={0} step={1} onChange={(inductanceMilliHenry) => update("inductanceMilliHenry", inductanceMilliHenry)} /><NumberField label={tex`C\,[\mu\mathrm{F}]`} value={parameters.capacitanceMicroFarad} disabled={!hasCapacitance} min={0} step={1} onChange={(capacitanceMicroFarad) => update("capacitanceMicroFarad", capacitanceMicroFarad)} /><NumberField label={tex`E\,[\mathrm{V}]`} value={parameters.backEmfVoltage} disabled={!hasBackEmf} min={0} step={1} onChange={(backEmfVoltage) => update("backEmfVoltage", backEmfVoltage)} /></div></section>;

  const outputScope = <section className={card}><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className={heading}>Output Scope</h3><KatexMath math={tex`V_{in}(t),\ V_o(t),\ I_o(t)`} className="mt-1 block text-xs text-slate-500 dark:text-slate-400" /></div><span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200">{metrics.conductionMode}</span></div>{metrics.conductionMode === "DCM" && <div role="status" className="mb-3 border-l-2 border-amber-400 bg-amber-50/70 px-3 py-2 dark:bg-amber-400/10"><div className="font-mono text-[9px] font-bold tracking-[.12em] text-amber-700 dark:text-amber-300">TRACE FLAG / CURRENT EXTINCTION</div><p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Load current returns to <strong>0 A</strong> in the discontinuous interval{metrics.extinctionAngleDeg === null ? "." : `; β = ${NumberValue(metrics.extinctionAngleDeg, 1)}°.`}</p></div>}<div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0f172a]"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{parameters.phase === "three" ? "Three-Phase ABC Input, Output Voltage & Load Current" : "Single-Phase Input, Output Voltage & Load Current"}</h4><KatexMath math={parameters.phase === "three" ? tex`V_a(t),\ V_b(t),\ V_c(t),\ V_o(t),\ I_o(t)` : tex`V_{in}(t),\ V_o(t),\ I_o(t)`} className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400" /></div><div className="flex flex-wrap gap-3 text-[10px] text-slate-500 dark:text-slate-400">{parameters.phase === "three" ? <><span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-cyan-400" /><KatexMath math="V_a" /></span><span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-amber-400" /><KatexMath math="V_b" /></span><span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-rose-400" /><KatexMath math="V_c" /></span></> : <span className="inline-flex items-center gap-1"><i className="h-px w-4 border-t border-dashed border-slate-400" /><KatexMath math="V_{in}" /></span>}<span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-blue-400" /><KatexMath math="V_o" /></span><span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 bg-violet-400" /><KatexMath math="I_o" /></span></div></div><div className="h-[530px] min-w-0">{chartsReady && <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={360}><LineChart data={data} margin={{ top: 12, right: 22, left: 8, bottom: 18 }}><CartesianGrid strokeDasharray="3 5" stroke="#64748b" strokeOpacity={0.2} /><XAxis dataKey="plotIndex" type="number" domain={[0, Math.max(data.length - 1, 1)]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(value) => `${((Number(value) / Math.max(data.length - 1, 1)) * simulation.period * 2000).toFixed(0)}`} tickLine={false} axisLine={false}><Label value="Time [ms]" position="insideBottom" offset={-8} fill="#94a3b8" fontSize={10} /></XAxis><YAxis yAxisId="voltage" tick={{ fontSize: 10, fill: "#60a5fa" }} tickLine={false} axisLine={false} width={54}><Label value="Voltage [V]" angle={-90} position="insideLeft" offset={-2} fill="#60a5fa" fontSize={10} /></YAxis><YAxis yAxisId="current" orientation="right" tick={{ fontSize: 10, fill: "#c4b5fd" }} tickLine={false} axisLine={false} width={52}><Label value="Current [A]" angle={90} position="insideRight" offset={-2} fill="#c4b5fd" fontSize={10} /></YAxis><Tooltip content={<ScopeTooltip phase={parameters.phase} />} /><ReferenceLine yAxisId="voltage" y={0} stroke="#94a3b8" strokeDasharray="4 4" /><ReferenceLine yAxisId="current" y={0} stroke="#c4b5fd" strokeOpacity={0.72} strokeDasharray="4 4" />{currentExtinctionIndex >= 0 && <ReferenceLine x={currentExtinctionIndex} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="5 4" label={{ value: "Iₒ = 0", position: "insideTopRight", fill: "#fbbf24", fontSize: 10 }} />}{sourceTraceVa}{sourceTraceVb}{sourceTraceVc}{singleInputTrace}<Line yAxisId="voltage" type="linear" dataKey="outputVoltage" name="V_o" stroke="#60a5fa" strokeWidth={2.8} dot={false} isAnimationActive={false} /><Line yAxisId="current" type="linear" dataKey="outputCurrent" name="I_o" stroke="#a78bfa" strokeWidth={2.6} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div></div></section>;

  const metricsPanel = <section className={`${card} p-4`}><div><h3 className={heading}>Steady-State Metrics</h3><KatexMath math={tex`\frac{1}{T_{out}}\int_{T_{out}}(\cdot)\,dt`} className="mt-1 block text-xs text-slate-500 dark:text-slate-400" /></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><MetricCell label={tex`V_{\mathrm{RMS}}`} value={tex`${NumberValue(metrics.voltageRms)}\,\mathrm{V}`} /><MetricCell label={tex`V_{\mathrm{DC}}`} value={tex`${NumberValue(metrics.voltageDc)}\,\mathrm{V}`} /><MetricCell label={tex`I_{\mathrm{RMS}}`} value={tex`${NumberValue(metrics.currentRms)}\,\mathrm{A}`} /><MetricCell label={tex`I_{\mathrm{DC}}`} value={tex`${NumberValue(metrics.currentDc)}\,\mathrm{A}`} /><MetricCell label={tex`P_{\mathrm{DC}}`} value={tex`${NumberValue(metrics.dcPower)}\,\mathrm{W}`} /><MetricCell label={tex`P_{\mathrm{AC}}`} value={tex`${NumberValue(metrics.acPower)}\,\mathrm{VA}`} /><MetricCell label={tex`f_{out}`} value={tex`${NumberValue(metrics.outputFrequency)}\,\mathrm{Hz}`} /><MetricCell label={tex`V_{\mathrm{ripple}}`} value={tex`${NumberValue(metrics.rippleVoltage)}\,\mathrm{V}`} /><MetricCell label={tex`\mathrm{FF}`} value={tex`${NumberValue(metrics.formFactor, 3)}`} /><MetricCell label={tex`\mathrm{RF}`} value={tex`${NumberValue(metrics.rippleFactor, 3)}`} /><MetricCell label={tex`\mathrm{PF}`} value={tex`${NumberValue(metrics.powerFactor, 3)}`} /><MetricCell label={tex`\eta`} value={tex`${NumberValue(metrics.efficiency)}\%`} /></div></section>;

  return <div className="space-y-6"><div className="grid gap-6 xl:grid-cols-2"><aside className="space-y-6">{topologyPanel}{loadPanel}{metricsPanel}</aside><main className="space-y-6">{outputScope}<CircuitPlate parameters={parameters} /></main></div></div>;
}

export default RectifierStudio;
