/**
 * PID Studio — compact Root Locus-parity control workspace.
 * Layout contract: plant → input/parameters → controller/scope → specs/construction/metrics.
 */
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Legend } from "recharts";
import { Calculator } from "lucide-react";
import { TransferFunctionInput, TransferFunctionData } from "./TransferFunctionInput";
import { KatexMath } from "../ui/KatexMath";
import { BrandSlider } from "@/components/ui/BrandSlider";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { BrandRadio } from "@/components/ui/BrandRadio";
import {
  controllerTransfer, defaultControllerSubtype, estimatePidFromSpecs, getControllerSubtypes, inputSignalTransfer,
  PidGains, ControllerPrimary, ControllerSubtype, SignalType, simulatePidScope,
} from "@/lib/pidMath";

type SignalState = { type: SignalType; magnitude: number; parameter: number };
const primaryOptions: ControllerPrimary[] = ["P", "I", "D", "PI", "PD", "PID"];
const signalOptions: Array<{ value: SignalType; label: string }> = [
  { value: "impulse", label: "Impulse" }, { value: "step", label: "Step" }, { value: "ramp", label: "Ramp" }, { value: "parabolic", label: "Parabolic" },
  { value: "exponential", label: "Exponential" }, { value: "sine", label: "Sinusoidal (Sine)" }, { value: "cosine", label: "Sinusoidal (Cosine)" },
];
const subtypeLabels: Record<ControllerSubtype, string> = { parallel: "Parallel", series: "Series", "parallel-standard": "Parallel Standard", "parallel-modified": "Parallel Modified", "series-standard": "Series Standard", "series-modified": "Series Modified" };
const card = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm";
const heading = "text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider";
const field = "h-10 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-slate-800 text-lg tracking-wide dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0";

function MathLabel({ math }: { math: string }) { return <KatexMath math={math} className="text-xs font-bold text-slate-500 dark:text-slate-400" />; }

function compactNumber(value: number) { return Number(value.toFixed(6)).toString(); }

function timeDomainLatex(signal: SignalState) {
  const amplitude = compactNumber(signal.magnitude);
  const parameter = compactNumber(signal.parameter);
  if (signal.type === "impulse") return `R(t) = ${amplitude}\\delta(t)`;
  if (signal.type === "step") return `R(t) = ${amplitude}u(t)`;
  if (signal.type === "ramp") return `R(t) = ${amplitude}t\\,u(t)`;
  if (signal.type === "parabolic") return `R(t) = ${amplitude}t^2\\,u(t)`;
  if (signal.type === "exponential") return `R(t) = ${amplitude}e^{-${parameter}t}u(t)`;
  if (signal.type === "sine") return `R(t) = ${amplitude}\\sin(${parameter}t)u(t)`;
  return `R(t) = ${amplitude}\\cos(${parameter}t)u(t)`;
}

function GainControl({ label, value, onChange, min = 0, max = 100, step = 0.01 }: { label: string; value: number; onChange: (next: number) => void; min?: number; max?: number; step?: number }) {
  const [limitMin, setLimitMin] = useState(min);
  const [limitMax, setLimitMax] = useState(max);

  useEffect(() => {
    setLimitMin(min);
  }, [min]);

  useEffect(() => {
    setLimitMax(max);
  }, [max]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className="italic font-serif text-slate-800 text-lg tracking-wide dark:text-white">
          <KatexMath math={label} />
        </span>
        <input
          value={Number(value.toFixed(4))}
          type="number"
          min={limitMin}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
          className="h-8 w-24 rounded-md border border-slate-200 bg-slate-50 px-2 text-right text-slate-800 text-lg tracking-wide focus:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
        />
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={limitMin}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v < limitMax) setLimitMin(v);
          }}
          style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
          className="font-serif text-slate-800 text-lg tracking-wide bg-transparent border-none outline-none w-16 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 dark:text-white"
        />
        <BrandSlider
          min={limitMin}
          max={limitMax}
          step={(limitMax - limitMin) / 1000}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          value={limitMax}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > limitMin) setLimitMax(v);
          }}
          style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
          className="font-serif text-slate-800 text-lg tracking-wide bg-transparent border-none outline-none w-16 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 dark:text-white"
        />
      </div>
    </div>
  );
}

export function PIDStudio() {
  const [plant, setPlant] = useState<TransferFunctionData>({ mode: "polynomial", numPoly: [1, 2], denPoly: [1, 3, 2, 0], zpk: { k: 1, z: "-2", p: "0, -1, -2" }, polyStr: { num: "1 2", den: "1 3 2 0" } });
  const [primary, setPrimary] = useState<ControllerPrimary>("PID");
  const [subtype, setSubtype] = useState<ControllerSubtype>("parallel-standard");
  const [gains, setGains] = useState<PidGains>({ kp: 2, ki: 1, kd: 0.2, n: 100 });
  const [signal, setSignal] = useState<SignalState>({ type: "step", magnitude: 1, parameter: 1 });
  const [maxTime, setMaxTime] = useState(12);
  const [zeta, setZeta] = useState(0.7);
  const [omegaN, setOmegaN] = useState(2);

  useEffect(() => setSubtype(defaultControllerSubtype(primary)), [primary]);
  const controller = useMemo(() => controllerTransfer(primary, subtype, gains), [primary, subtype, gains]);
  const inputTransfer = useMemo(() => inputSignalTransfer(signal.type, signal.magnitude, signal.parameter), [signal]);
  const scope = useMemo(() => simulatePidScope(controller, plant.numPoly, plant.denPoly, signal, maxTime), [controller, plant, signal, maxTime]);
  const chartData = useMemo(() => scope.t.map((time, index) => ({ t: Number(time.toFixed(3)), y: scope.y[index], r: scope.r[index] })), [scope]);
  const subtypes = getControllerSubtypes(primary);
  const showKp = primary !== "I" && primary !== "D";
  const showKi = primary === "I" || primary === "PI" || primary === "PID";
  const showKd = primary === "D" || primary === "PD" || primary === "PID";
  const showN = subtype === "parallel-modified" || subtype === "series-modified";
  const usesParameter = signal.type === "exponential" || signal.type === "sine" || signal.type === "cosine";
  const parameterLabel = signal.type === "exponential" ? "a" : "\\omega";

  const inputPanel = <section className={card}><div className="mb-3 flex items-center justify-between gap-3"><h3 className={heading}>Input Signal Generator</h3><KatexMath math={`${timeDomainLatex(signal)},\\quad R(s) = ${inputTransfer.latex}`} className="max-w-[65%] overflow-x-auto text-sm text-violet-700 dark:text-violet-300" /></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">Signal Type</label><NativeSelect value={signal.type} className="h-10 text-sm font-sans" onChange={(event) => setSignal((current: SignalState) => ({ ...current, type: event.target.value as SignalType }))}>{signalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</NativeSelect></div><div><label className="mb-1 block"><MathLabel math="A" /></label><input type="number" step="any" value={signal.magnitude} onChange={(event) => setSignal((current: SignalState) => ({ ...current, magnitude: Number(event.target.value) }))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={field} /></div>{usesParameter && <div className="sm:col-span-2"><label className="mb-1 block"><MathLabel math={parameterLabel} /></label><input type="number" min="0" step="0.1" value={signal.parameter} onChange={(event) => setSignal((current: SignalState) => ({ ...current, parameter: Number(event.target.value) }))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={field} /></div>}</div></section>;

  const parameterPanel = <section className={card}><div className="mb-3 flex items-center justify-between gap-3"><h3 className={heading}>PID Parameters</h3><KatexMath math={`G_c(s) = ${controller.latex}`} className="text-sm text-violet-700 dark:text-violet-300" /></div><div className="space-y-3">{showKp && <GainControl label="K_p" value={gains.kp} onChange={(kp) => setGains((current: PidGains) => ({ ...current, kp }))} />}{showKi && <GainControl label="K_i" value={gains.ki} onChange={(ki) => setGains((current: PidGains) => ({ ...current, ki }))} />}{showKd && <GainControl label="K_d" value={gains.kd} onChange={(kd) => setGains((current: PidGains) => ({ ...current, kd }))} />}{showN && <GainControl label="N" value={gains.n} min={1} max={500} step={1} onChange={(n) => setGains((current: PidGains) => ({ ...current, n }))} />}</div></section>;

  const matrixPanel = <section className={`${card} flex flex-col`}><h3 className={heading}>Controller Matrix</h3><div className="mt-4 grid grid-cols-3 gap-2">{primaryOptions.map((option) => <button key={option} onClick={() => setPrimary(option)} className={`h-10 flex items-center justify-center rounded-xl border px-3 text-xs font-bold transition-all ${primary === option ? "bg-brand-gradient text-white border-transparent shadow-sm" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900"}`}>{option}</button>)}</div>{subtypes.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-bold text-slate-500 dark:text-slate-400">Controller Form</p><div className="grid gap-2 sm:grid-cols-2">{subtypes.map((option) => <label key={option} className={`h-10 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-xs font-semibold transition-all ${subtype === option ? "bg-brand-gradient text-white border-transparent shadow-sm" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"}`}><BrandRadio name="pid-form" checked={subtype === option} onChange={() => setSubtype(option)} className={subtype === option ? "border-white/90 checked:border-white checked:bg-[radial-gradient(circle,#7c3aed_38%,transparent_44%),#ffffff]" : ""} /><span className="truncate">{subtypeLabels[option]}</span></label>)}</div></div>}<div className="mt-4 grid min-h-28 flex-1 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950"><svg viewBox="0 0 300 90" className="h-14 w-full max-w-sm" fill="none" aria-label="Controller block diagram placeholder"><path d="M15 45h50m0 0 15-15v30L65 45m40 0h46m0 0 15-15v30l-15-15m40 0h44" stroke="currentColor" strokeWidth="2" className="text-violet-500"/><rect x="80" y="26" width="72" height="38" rx="7" stroke="currentColor" className="text-slate-400 dark:text-slate-500"/><rect x="166" y="26" width="72" height="38" rx="7" stroke="currentColor" className="text-slate-400 dark:text-slate-500"/></svg><span className="text-[10px] font-bold tracking-[.08em] text-slate-400">[Insert Block Diagram SVG for Current Controller Mode]</span></div></section>;

  const scopePanel = <section className={card}><div className="mb-4 flex items-center justify-between gap-4"><div><h3 className={heading}>Interactive RK4 Scope</h3><KatexMath math={`Y(s) = ${scope.output.latex}`} className="mt-1 block text-xs text-slate-500 dark:text-slate-400" /></div><div className="flex items-center gap-2"><MathLabel math="t_{max}" /><input type="number" min="1" max="60" step="1" value={maxTime} onChange={(event) => setMaxTime(Math.max(1, Number(event.target.value)))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className="h-8 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right text-slate-800 text-lg tracking-wide focus:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0" /></div></div><div className="h-[390px] rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0f172a]"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 16, right: 18, left: 0, bottom: 4 }}><CartesianGrid strokeDasharray="3 5" stroke="#64748b" strokeOpacity="0.2"/><XAxis dataKey="t" type="number" domain={[0, maxTime]} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false}/><YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={42}/><Tooltip contentStyle={{ borderRadius: 14, border: "1px solid rgba(148,163,184,.3)", background: "#0f172a", color: "#fff" }} labelStyle={{ color: "#cbd5e1" }}/><Legend wrapperStyle={{ fontSize: 12 }}/><ReferenceLine y={chartData[chartData.length - 1]?.y ?? 0} stroke="#a78bfa" strokeDasharray="6 5"/><Line type="monotone" dataKey="r" name="r(t)" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive animationDuration={450}/><Line type="monotone" dataKey="y" name="y(t)" stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive animationDuration={450}/></LineChart></ResponsiveContainer></div></section>;

  const specsPanel = <section className={card}><h3 className={heading}>Design by Specs</h3><div className="mt-4 space-y-3"><KatexMath math={`s^2 + 2(${zeta.toFixed(3)})(${omegaN.toFixed(3)})s + ${omegaN.toFixed(3)}^2 = 0`} displayMode className="block overflow-x-auto rounded-xl bg-slate-50 p-3 text-center text-slate-800 dark:bg-slate-950 dark:text-white" /><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block"><MathLabel math="\\zeta" /></label><input type="number" min="0.01" max="2" step="0.01" value={zeta} onChange={(event) => setZeta(Number(event.target.value))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={field} /></div><div><label className="mb-1 block"><MathLabel math="\\omega_n" /></label><input type="number" min="0.01" step="0.1" value={omegaN} onChange={(event) => setOmegaN(Number(event.target.value))} style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className={field} /></div></div><button onClick={() => { setPrimary("PID"); setSubtype("parallel-standard"); setGains(estimatePidFromSpecs(plant.numPoly, plant.denPoly, zeta, omegaN)); }} className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:scale-[1.02] active:scale-[.97]"><Calculator className="h-4 w-4"/>Calculate PID</button></div></section>;

  const constructionPanel = <section className={card}><h3 className={heading}>Closed-Loop Construction</h3><div className="mt-4 space-y-3 text-sm"><div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><KatexMath math={`G_{open}(s) = ${scope.openLoop.latex}`} displayMode className="block overflow-x-auto text-slate-800 dark:text-white" /></div><div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><KatexMath math={`T(s) = ${scope.closedLoop.latex}`} displayMode className="block overflow-x-auto text-slate-800 dark:text-white" /></div></div></section>;
  const metricsPanel = <section className={card}><h3 className={heading}>Transient Metrics</h3><div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800"><div className="flex items-center justify-between py-3"><MathLabel math="M_p"/><KatexMath math={`${scope.overshoot.toFixed(2)}\\%`} className="text-sm font-bold text-slate-900 dark:text-white" /></div><div className="flex items-center justify-between py-3"><MathLabel math="T_p"/><KatexMath math={`${scope.peakTime.toFixed(3)}\\,\\text{s}`} className="text-sm font-bold text-slate-900 dark:text-white" /></div><div className="flex items-center justify-between py-3"><MathLabel math="T_s"/><KatexMath math={`${scope.settlingTime.toFixed(3)}\\,\\text{s}`} className="text-sm font-bold text-slate-900 dark:text-white" /></div><div className="flex items-center justify-between py-3"><MathLabel math="e_{ss}"/><KatexMath math={`${scope.steadyStateError.toFixed(4)}`} className="text-sm font-bold text-slate-900 dark:text-white" /></div></div></section>;

  return <div className="space-y-6"><TransferFunctionInput onUpdate={setPlant} defaultData={plant} gainK={1} /><div className="grid gap-6 lg:grid-cols-2">{inputPanel}{parameterPanel}</div><div className="grid gap-6 lg:grid-cols-[.86fr_1.14fr]">{matrixPanel}{scopePanel}</div><div className="grid gap-6 lg:grid-cols-3">{specsPanel}{constructionPanel}{metricsPanel}</div></div>;
}
