import { useMemo, useState, type ReactNode } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioCard, StudioSlider, InnerBox } from "@/components/common/templates";
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
const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-sm p-5 md:p-6 transition-all";
const heading = "text-sm font-bold text-slate-800 dark:text-white";
const field =
  "h-11 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-slate-800 text-xl font-medium sm:text-2xl tracking-wide dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 text-center disabled:cursor-not-allowed disabled:opacity-35 transition";

const topologyOptions: Array<{ value: ChopperTopology; label: string }> = [
  { value: "buck", label: "Buck" },
  { value: "boost", label: "Boost" },
  { value: "buck-boost", label: "Buck-Boost" }
];

const quadrantOptions: Array<{ value: QuadrantClass; label: string; badge?: ReactNode }> = [
  { value: "A", label: "Class A", badge: <span className="font-['Poppins',sans-serif] text-[10px] sm:text-xs tracking-normal font-medium">1st-Q</span> },
  { value: "B", label: "Class B", badge: <span className="font-['Poppins',sans-serif] text-[10px] sm:text-xs tracking-normal font-medium">2nd-Q</span> },
  { value: "C", label: "Class C", badge: <span className="font-['Poppins',sans-serif] text-[10px] sm:text-xs tracking-normal font-medium">2-Q A</span> },
  { value: "D", label: "Class D", badge: <span className="font-['Poppins',sans-serif] text-[10px] sm:text-xs tracking-normal font-medium">2-Q B</span> },
  { value: "E", label: "Class E", badge: <span className="font-['Poppins',sans-serif] text-[10px] sm:text-xs tracking-normal font-medium">4-Q</span> }
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
  return (
    <label className="block">
      <KatexMath math={label} className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400" />
      <input
        aria-label={label}
        className={field}
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        style={{
          fontFamily: "'KaTeX_Main', 'Times New Roman', serif"
        }}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <InnerBox className="px-2.5 py-2">
      <KatexMath math={label} className="block text-[10px] text-slate-500 dark:text-slate-400" />
      <KatexMath math={value} className="mt-1 block overflow-x-auto text-xs font-bold text-slate-900 dark:text-white" />
    </InnerBox>
  );
}

/** Conduction mode badge — emerald for CCM (healthy), amber for DCM (informational). */
function ModeMetric({ mode }: { mode: "CCM" | "DCM" }) {
  const isCcm = mode === "CCM";
  return (
    <InnerBox className="px-2.5 py-2">
      <KatexMath math={String.raw`\mathrm{Mode}`} className="block text-[10px] text-slate-500 dark:text-slate-400" />
      <span
        className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
          isCcm
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        }`}
      >
        {mode}
      </span>
    </InnerBox>
  );
}

function Circuit({ parameters }: { parameters: ChopperParameters }) {
  const title = `${parameters.topology === "buck" ? "Buck" : parameters.topology === "boost" ? "Boost" : "Buck-Boost"} · Class ${parameters.quadrantClass}`;
  return (
    <StudioCard
      title="Circuit Diagram"
      actionSlot={
        <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
          {parameters.control === "pwm" ? "PWM" : "FM"}
        </span>
      }
      className="min-h-[340px]"
    >
      <div className="grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950">
        <svg viewBox="0 0 340 120" className="h-28 w-full max-w-lg" fill="none" aria-label={title}>
          <path d="M24 60h52m0 0 16-16v32L76 60m16 0h42m0 0 16-16v32l-16-16m16 0h28m0-32v64m-12-48h24m-24 20h24m-24 20h24m30-28h54" stroke="currentColor" strokeWidth="2" className="text-violet-500" />
          <circle cx="42" cy="60" r="18" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 dark:text-slate-500" />
          <path d="M30 60c4-10 9-10 13 0s9 10 13 0M134 38v44m12-35-24 26m24 0-24-26M238 34v52m-11-42 22 0m-22 16 22 0m-22 16 22 0" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 dark:text-slate-500" />
        </svg>
        <span className="mt-2 block text-[10px] font-bold tracking-[.06em] text-slate-400">{title}</span>
      </div>
    </StudioCard>
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
        color: "#7c3aed",
        axis: "voltage",
        unit: "",
        stepped: true,
        dashArray: "4 3",
        strokeWidth: 1.5,
      },
    ];
  }, [simulation.samples]);

  const topology = (
    <StudioCard title="Topology Configuration">
      <div className="space-y-4">
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
            onChange={(quadrantClass) => {
              setParameters((current) => {
                const base = { ...current, quadrantClass };
                if (quadrantClass === "B") {
                  // Class B requires active back-EMF load (RLE); default E = 60% Vs
                  return {
                    ...base,
                    loadType: "RLE" as const,
                    backEmfVoltage: current.backEmfVoltage > 0
                      ? current.backEmfVoltage
                      : Math.round(current.inputVoltage * 0.6),
                  };
                }
                if (quadrantClass === "C") {
                  // Class C: two-quadrant voltage-positive / current-bidirectional
                  // RL load sufficient; back-EMF optional
                  return { ...base, loadType: "RL" as const };
                }
                if (quadrantClass === "D") {
                  // Class D: output voltage swings ±; current stays positive
                  // RL load is typical (no back-EMF required)
                  return { ...base, loadType: "RL" as const };
                }
                if (quadrantClass === "E") {
                  // Class E: full four-quadrant; RLE with motor-like back-EMF
                  return {
                    ...base,
                    loadType: "RLE" as const,
                    backEmfVoltage: current.backEmfVoltage > 0
                      ? current.backEmfVoltage
                      : Math.round(current.inputVoltage * 0.3),
                  };
                }
                return base; // Class A: no forced changes
              });
            }}
            fullWidth
          />
        </div>
      </div>
    </StudioCard>
  );

  const control = (
    <StudioCard title="Control Technique">
      <div>
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
        <StudioSlider
          aria-label="duty cycle"
          min={0}
          max={1}
          step={0.01}
          value={parameters.dutyCycle}
          onChange={(val) => update("dutyCycle", val)}
          showLimits
          minLabel={<KatexMath math="0" />}
          maxLabel={<KatexMath math="1" />}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="D" value={parameters.dutyCycle} min={0} max={1} step={0.01} onChange={(dutyCycle) => update("dutyCycle", dutyCycle)} />
        <Field label={tex`f_s\,[\mathrm{Hz}]`} value={parameters.switchingFrequency} min={50} step={50} onChange={(switchingFrequency) => update("switchingFrequency", switchingFrequency)} />
      </div>
    </StudioCard>
  );

  const sourceLoad = (
    <StudioCard title="Source & Load Configuration">
      <div>
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
    </StudioCard>
  );

  const metricPanel = (
    <StudioCard
      title="Steady-State Metrics"
      actionSlot={<KatexMath math={tex`\frac{1}{T_s}\int_0^{T_s}(\cdot)\,dt`} className="text-xs text-slate-500 dark:text-slate-400" />}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={tex`V_{dc}`} value={tex`${numberTex(metrics.outputVoltageDc)}\,\mathrm{V}`} />
        <Metric label={tex`V_{\mathrm{rms}}`} value={tex`${numberTex(metrics.outputVoltageRms)}\,\mathrm{V}`} />
        <Metric label={tex`I_{dc}`} value={tex`${numberTex(metrics.outputCurrentDc)}\,\mathrm{A}`} />
        <Metric label={tex`\Delta I`} value={tex`${numberTex(metrics.rippleCurrent)}\,\mathrm{A}`} />
        <Metric label={tex`I_{\max}`} value={tex`${numberTex(metrics.currentMax)}\,\mathrm{A}`} />
        <Metric label={tex`I_{\min}`} value={tex`${numberTex(metrics.currentMin)}\,\mathrm{A}`} />
        <Metric label={tex`L_c`} value={tex`${numberTex(metrics.criticalInductanceMilliHenry)}\,\mathrm{mH}`} />
        <ModeMetric mode={metrics.conductionMode} />
        <Metric label={tex`P_{in}`} value={tex`${numberTex(metrics.inputPower)}\,\mathrm{W}`} />
        <Metric label={tex`P_{out}`} value={tex`${numberTex(metrics.outputPower)}\,\mathrm{W}`} />
        <Metric label={tex`\eta`} value={tex`${numberTex(metrics.efficiency)}\%`} />
        <Metric label="D" value={numberTex(metrics.dutyCycle, 3)} />
      </div>
    </StudioCard>
  );

  return (
    <StudioErrorBoundary studioName="Chopper">
      <div className="space-y-6">
        <PowerWarningAlert warnings={simulation.warnings} />
        <div className="grid gap-4 lg:gap-5 lg:grid-cols-2 items-start">
          <aside className="min-w-0 space-y-6">
            {topology}
            {control}
            {sourceLoad}
            {metricPanel}
          </aside>
          <main className="min-w-0 w-full space-y-6">

            <PowerScopePlot
              title={`CLASS ${parameters.quadrantClass} · ${parameters.topology === "buck" ? "BUCK" : parameters.topology === "boost" ? "BOOST" : "BUCK-BOOST"} CHOPPER OUTPUT SCOPE`}
              subtitleLatex={tex`T_s=\frac{1}{f_s}=${numberTex(simulation.period * 1000, 3)}\,\mathrm{ms}`}
              series={series}
            />
            <Circuit parameters={parameters} />
          </main>
        </div>
      </div>
    </StudioErrorBoundary>
  );
}

export default ChopperStudio;
