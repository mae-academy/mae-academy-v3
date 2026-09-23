import { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PowerSlider } from "./PowerSlider";
import { PowerWarningAlert } from "./PowerWarningAlert";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { PowerScopePlot, type ScopeSeries } from "./PowerScopePlot";
import {
  defaultChopperParameters,
  simulateChopper,
  type ChopperControl,
  type ChopperLoad,
  type ChopperParameters,
  type ChopperTopology,
  type QuadrantClass
} from "@/features/power-electronics/chopperMath";

const tex = String.raw;
const card = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const heading = "text-sm font-bold text-slate-800 dark:text-white";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center font-mono text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-800 dark:bg-slate-950 dark:text-white";

const topologyOptions: Array<{ value: ChopperTopology; label: string }> = [
  { value: "buck", label: "Buck" },
  { value: "boost", label: "Boost" },
  { value: "buck-boost", label: "Buck-Boost" }
];

const quadrantOptions: Array<{ value: QuadrantClass; label: string; badge?: string }> = [
  { value: "A", label: "Class A", badge: "1st-Q" },
  { value: "B", label: "Class B", badge: "2nd-Q" },
  { value: "C", label: "Class C", badge: "2-Q A" },
  { value: "D", label: "Class D", badge: "2-Q B" },
  { value: "E", label: "Class E", badge: "4-Q" }
];

const controlOptions: Array<{ value: ChopperControl; label: string }> = [
  { value: "pwm", label: "PWM (Time-Ratio)" },
  { value: "frequency", label: "Frequency Mod." }
];

const loadOptions = [
  { value: "R" as ChopperLoad, label: <KatexMath math="R" /> },
  { value: "RL" as ChopperLoad, label: <KatexMath math="RL" /> },
  { value: "RLE" as ChopperLoad, label: <KatexMath math="RLE" /> }
];

function numberTex(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1000 || absolute < 0.01)) {
    const [m, e] = value.toExponential(2).split("e");
    return `${m}\\times10^{${Number(e)}}`;
  }
  return Number(value.toFixed(digits)).toString();
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  min = 0,
  max,
  step = "any"
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const [editing, setEditing] = useState(false);
  return (
    <label className="block">
      <KatexMath math={label} className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400" />
      <div className="relative">
        <input
          aria-label={label}
          className={field}
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={Number.isFinite(value) ? value : 0}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          style={editing ? undefined : { color: "transparent", WebkitTextFillColor: "transparent", caretColor: "transparent" }}
        />
        <span aria-hidden className={`pointer-events-none absolute inset-0 grid place-items-center ${editing ? "hidden" : ""} ${disabled ? "opacity-35" : ""}`}>
          <KatexMath math={numberTex(value)} className="text-sm font-semibold text-slate-900 dark:text-white" />
        </span>
      </div>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950">
      <KatexMath math={label} className="block text-[10px] text-slate-500 dark:text-slate-400" />
      <KatexMath math={value} className="mt-1 block overflow-x-auto text-xs font-bold text-slate-900 dark:text-white" />
    </div>
  );
}

function Circuit({ parameters }: { parameters: ChopperParameters }) {
  const title = `${parameters.topology === "buck" ? "Buck" : parameters.topology === "boost" ? "Boost" : "Buck-Boost"} · Class ${parameters.quadrantClass}`;
  return (
    <section className={`${card} min-h-[340px]`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={heading}>Circuit Diagram</h3>
        <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
          {parameters.control === "pwm" ? "PWM" : "FM"}
        </span>
      </div>
      <div className="mt-4 grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950">
        <svg viewBox="0 0 340 120" className="h-28 w-full max-w-lg" fill="none" aria-label={title}>
          <path d="M24 60h52m0 0 16-16v32L76 60m16 0h42m0 0 16-16v32l-16-16m16 0h28m0-32v64m-12-48h24m-24 20h24m-24 20h24m30-28h54" stroke="currentColor" strokeWidth="2" className="text-violet-500" />
          <circle cx="42" cy="60" r="18" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 dark:text-slate-500" />
          <path d="M30 60c4-10 9-10 13 0s9 10 13 0M134 38v44m12-35-24 26m24 0-24-26M238 34v52m-11-42 22 0m-22 16 22 0m-22 16 22 0" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 dark:text-slate-500" />
        </svg>
        <span className="mt-2 block text-[10px] font-bold tracking-[.06em] text-slate-400">{title}</span>
      </div>
    </section>
  );
}

export function ChopperStudio() {
  const [parameters, setParameters] = useState<ChopperParameters>(defaultChopperParameters);
  const simulation = useMemo(() => simulateChopper(parameters), [parameters]);
  const metrics = simulation.metrics;
  const hasL = parameters.loadType !== "R";
  const hasE = parameters.loadType === "RLE";

  const update = <K extends keyof ChopperParameters>(key: K, value: ChopperParameters[K]) =>
    setParameters((current) => ({ ...current, [key]: value }));

  const series = useMemo((): ScopeSeries[] => {
    const drawn = simulation.samples.filter((_, index) => index % 2 === 0 || index === simulation.samples.length - 1);
    const toPoints = (fn: (sample: typeof simulation.samples[number]) => number) =>
      drawn.map((s) => ({ t: s.time * 1000, val: fn(s) }));

    return [
      {
        id: "vo",
        katexName: "V_o(t)",
        data: toPoints((s) => s.outputVoltage),
        color: "#2563eb",
        axis: "voltage",
        unit: "V",
        stepped: true,
        strokeWidth: 2.8,
      },
      {
        id: "io",
        katexName: "I_o(t)",
        data: toPoints((s) => s.outputCurrent),
        color: "#ec4899",
        axis: "current",
        unit: "A",
        strokeWidth: 2.8,
      },
      {
        id: "gate",
        katexName: "g(t)",
        data: toPoints((s) => s.gatePulse),
        color: "#10b981",
        axis: "voltage",
        unit: "",
        stepped: true,
        dashArray: "4 3",
        strokeWidth: 1.5,
      },
    ];
  }, [simulation.samples]);

  const dcmExtinctionTimeMs = useMemo(() => {
    if (metrics.conductionMode !== "DCM") return null;
    const samples = simulation.samples;
    const startIdx = Math.floor(samples.length * 0.15);
    const idx = samples.findIndex((point, index) => index > startIdx && Math.abs(point.outputCurrent) <= 1e-6);
    if (idx >= 0) return samples[idx].time * 1000;
    return null;
  }, [simulation.samples, metrics.conductionMode]);

  const topology = (
    <section className={card}>
      <h3 className={heading}>Topology Configuration</h3>
      <div className="mt-4 space-y-4">
        <div>
          <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Basic Topology</span>
          <SegmentedControl
            value={parameters.topology}
            options={topologyOptions}
            onChange={(topology) => update("topology", topology)}
            fullWidth
          />
        </div>
        <div>
          <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Quadrant Classification</span>
          <SegmentedControl
            value={parameters.quadrantClass}
            options={quadrantOptions}
            onChange={(quadrantClass) => update("quadrantClass", quadrantClass)}
            fullWidth
          />
        </div>
      </div>
    </section>
  );

  const control = (
    <section className={card}>
      <h3 className={heading}>Control Technique</h3>
      <div className="mt-4">
        <SegmentedControl
          value={parameters.control}
          options={controlOptions}
          onChange={(control) => update("control", control)}
          fullWidth
        />
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <KatexMath math="D" className="text-xs font-bold text-slate-500 dark:text-slate-400" />
          <KatexMath math={tex`D = ${numberTex(parameters.dutyCycle, 2)}`} className="text-xs font-semibold text-violet-600 dark:text-violet-400" />
        </div>
        <PowerSlider
          aria-label="duty cycle"
          min={0}
          max={1}
          step={0.01}
          value={parameters.dutyCycle}
          onChange={(event) => update("dutyCycle", Number(event.target.value))}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="D" value={parameters.dutyCycle} min={0} max={1} step={0.01} onChange={(dutyCycle) => update("dutyCycle", dutyCycle)} />
        <Field label={tex`f_s\,[\mathrm{Hz}]`} value={parameters.switchingFrequency} min={50} step={50} onChange={(switchingFrequency) => update("switchingFrequency", switchingFrequency)} />
      </div>
    </section>
  );

  const sourceLoad = (
    <section className={card}>
      <h3 className={heading}>Source &amp; Load Configuration</h3>
      <div className="mt-4">
        <Field label={tex`V_s\,[\mathrm{V}]`} value={parameters.inputVoltage} min={1} step={1} onChange={(inputVoltage) => update("inputVoltage", inputVoltage)} />
      </div>
      <div className="mt-4">
        <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Load Set</span>
        <SegmentedControl
          value={parameters.loadType}
          options={loadOptions}
          onChange={(loadType) => update("loadType", loadType)}
          fullWidth
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label={tex`R\,[\Omega]`} value={parameters.resistance} min={0.05} step={0.1} onChange={(resistance) => update("resistance", resistance)} />
        <Field label={tex`L\,[\mathrm{mH}]`} value={parameters.inductanceMilliHenry} disabled={!hasL} min={0} step={0.1} onChange={(inductanceMilliHenry) => update("inductanceMilliHenry", inductanceMilliHenry)} />
        <Field label={tex`E\,[\mathrm{V}]`} value={parameters.backEmfVoltage} disabled={!hasE} min={0} step={1} onChange={(backEmfVoltage) => update("backEmfVoltage", backEmfVoltage)} />
      </div>
    </section>
  );

  const metricPanel = (
    <section className={`${card} p-4`}>
      <div>
        <h3 className={heading}>Steady-State Metrics</h3>
        <KatexMath math={tex`\frac{1}{T_s}\int_0^{T_s}(\cdot)\,dt`} className="mt-1 block text-xs text-slate-500 dark:text-slate-400" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={tex`V_{dc}`} value={tex`${numberTex(metrics.outputVoltageDc)}\,\mathrm{V}`} />
        <Metric label={tex`V_{\mathrm{rms}}`} value={tex`${numberTex(metrics.outputVoltageRms)}\,\mathrm{V}`} />
        <Metric label={tex`I_{dc}`} value={tex`${numberTex(metrics.outputCurrentDc)}\,\mathrm{A}`} />
        <Metric label={tex`\Delta I`} value={tex`${numberTex(metrics.rippleCurrent)}\,\mathrm{A}`} />
        <Metric label={tex`I_{\max}`} value={tex`${numberTex(metrics.currentMax)}\,\mathrm{A}`} />
        <Metric label={tex`I_{\min}`} value={tex`${numberTex(metrics.currentMin)}\,\mathrm{A}`} />
        <Metric label={tex`L_c`} value={tex`${numberTex(metrics.criticalInductanceMilliHenry)}\,\mathrm{mH}`} />
        <Metric label={tex`\mathrm{Mode}`} value={tex`\mathrm{${metrics.conductionMode}}`} />
        <Metric label={tex`P_{in}`} value={tex`${numberTex(metrics.inputPower)}\,\mathrm{W}`} />
        <Metric label={tex`P_{out}`} value={tex`${numberTex(metrics.outputPower)}\,\mathrm{W}`} />
        <Metric label={tex`\eta`} value={tex`${numberTex(metrics.efficiency)}\%`} />
        <Metric label="D" value={numberTex(metrics.dutyCycle, 3)} />
      </div>
    </section>
  );

  return (
    <StudioErrorBoundary studioName="Chopper">
      <div className="space-y-6">
        <PowerWarningAlert warnings={simulation.warnings} />
        <div className="grid gap-6 xl:grid-cols-2">
          <aside className="min-w-0 space-y-6">
            {topology}
            {control}
            {sourceLoad}
            {metricPanel}
          </aside>
          <main className="min-w-0 w-full space-y-6">
            {metrics.conductionMode === "DCM" && (
              <div role="status" className="border-l-4 border-violet-500 bg-violet-500/10 px-4 py-3 rounded-r-2xl">
                <div className="font-mono text-[10px] font-bold tracking-[.12em] text-violet-700 dark:text-violet-300">
                  SCOPE FLAG / DISCONTINUOUS CONDUCTION
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Load current reaches <strong>0 A</strong> before the next switching interval; the violet field marks the zero-current window.
                </p>
              </div>
            )}
            <PowerScopePlot
              title={`${parameters.topology === "buck" ? "BUCK" : parameters.topology === "boost" ? "BOOST" : "BUCK-BOOST"} CHOPPER OUTPUT SCOPE`}
              subtitleLatex={tex`T_s=\frac{1}{f_s}=${numberTex(simulation.period * 1000, 3)}\,\mathrm{ms}`}
              series={series}
              dcmExtinctionTimeMs={dcmExtinctionTimeMs}
              dcmWindowStartMs={dcmExtinctionTimeMs}
              dcmExtinctionLabel="I_o = 0 · DCM"
            />
            <Circuit parameters={parameters} />
          </main>
        </div>
      </div>
    </StudioErrorBoundary>
  );
}

export default ChopperStudio;
