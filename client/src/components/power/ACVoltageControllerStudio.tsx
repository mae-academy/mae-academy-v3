import { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioCard, StudioSlider, InnerBox } from "@/components/common/templates";
import { PowerWarningAlert } from "./PowerWarningAlert";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { PowerScopePlot, type ScopeSeries } from "./PowerScopePlot";
import {
  defaultAcVoltageControllerParameters,
  simulateAcVoltageController,
  type AcControlMode,
  type AcLoad,
  type AcPhase,
  type AcTopology,
  type AcVoltageControllerParameters,
  type AcVoltageFormat,
  type ThreePhaseConnection
} from "@/features/power-electronics/acVoltageControllerMath";

const tex = String.raw;
const field =
  "h-11 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-slate-800 text-xl font-medium sm:text-2xl tracking-wide dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 text-center disabled:cursor-not-allowed disabled:opacity-35 transition";

const phaseOptions: Array<{ value: AcPhase; label: string }> = [
  { value: "single", label: "Single-Phase (1-Φ)" },
  { value: "three", label: "Three-Phase (3-Φ)" }
];

const topologyOptions: Array<{ value: AcTopology; label: string }> = [
  { value: "unidirectional", label: "Unidirectional" },
  { value: "bidirectional", label: "Bidirectional / TRIAC" }
];

const connectionOptions: Array<{ value: ThreePhaseConnection; label: string }> = [
  { value: "star-3w", label: "Star-3W" },
  { value: "star-4w", label: "Star-4W" },
  { value: "delta", label: "Delta" }
];

const modeOptions: Array<{ value: AcControlMode; label: string }> = [
  { value: "phase-angle", label: "Phase-Angle" },
  { value: "integral-cycle", label: "Integral-Cycle" }
];

const formatOptions = [
  { value: "rms" as AcVoltageFormat, label: <KatexMath math={tex`V_{\mathrm{RMS}}`} /> },
  { value: "peak" as AcVoltageFormat, label: <KatexMath math="V_m" /> }
];

const loadOptions = [
  { value: "R" as AcLoad, label: <KatexMath math="R" /> },
  { value: "RL" as AcLoad, label: <KatexMath math="RL" /> }
];

const overlayOptions = [
  { value: "none" as const, label: "Standard" },
  { value: "thyristor" as const, label: <KatexMath math="V_T" /> },
  { value: "gate" as const, label: "Gate" }
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
        style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
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

function Circuit({ parameters }: { parameters: AcVoltageControllerParameters }) {
  const title = parameters.phase === "three"
    ? `3-Φ ${parameters.threePhaseConnection.toUpperCase()}`
    : parameters.topology === "bidirectional"
    ? "1-Φ Bidirectional TRIAC"
    : "1-Φ Unidirectional SCR";

  return (
    <StudioCard
      title="Circuit Diagram"
      actionSlot={
        <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
          {parameters.controlMode === "phase-angle" ? "PHASE" : "INTEGRAL"}
        </span>
      }
      className="min-h-[340px]"
    >
      <div className="grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950">
        <svg viewBox="0 0 340 120" className="h-28 w-full max-w-lg" fill="none" aria-label={title}>
          <path d="M24 60h52m0 0 16-16v32L76 60m16 0h52m0 0 17-15v30l-17-15m17 0h36m0-30v60m-12-44h24m-24 18h24m-24 18h24M221 60h70" stroke="currentColor" strokeWidth="2" className="text-violet-500" />
          <circle cx="42" cy="60" r="18" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 dark:text-slate-500" />
          <path d="M30 60c4-10 9-10 13 0s9 10 13 0M142 38v44m12-35-24 26m24 0-24-26" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 dark:text-slate-500" />
          <path d="M292 36v48m-12-40h24m-24 16h24m-24 16h24" stroke="currentColor" strokeWidth="1.5" className="text-violet-500" />
        </svg>
        <span className="mt-2 block text-[10px] font-bold tracking-[.06em] text-slate-400">{title}</span>
      </div>
    </StudioCard>
  );
}

export function ACVoltageControllerStudio() {
  const [parameters, setParameters] = useState<AcVoltageControllerParameters>(defaultAcVoltageControllerParameters);
  const [overlay, setOverlay] = useState<"none" | "thyristor" | "gate">("none");
  const simulation = useMemo(() => simulateAcVoltageController(parameters), [parameters]);
  const metrics = simulation.metrics;
  const isPhase = parameters.controlMode === "phase-angle";
  const hasInductance = parameters.loadType === "RL";

  const update = <K extends keyof AcVoltageControllerParameters>(key: K, value: AcVoltageControllerParameters[K]) =>
    setParameters((current) => ({ ...current, [key]: value }));

  const series = useMemo((): ScopeSeries[] => {
    const periodMs = simulation.period * 1000;
    const drawn = simulation.samples.filter((_, index) => index % 3 === 0 || index === simulation.samples.length - 1);
    const toPoints = (fn: (sample: typeof simulation.samples[number]) => number) =>
      drawn.map((s) => ({ t: s.time * 1000, val: fn(s) }));

    const list: ScopeSeries[] = [];

    if (parameters.phase === "three") {
      list.push({
        id: "voa",
        katexName: "V_{oA}(t)",
        data: toPoints((s) => s.phaseAOutput),
        color: "#E11D48",
        axis: "voltage",
        unit: "V",
        strokeWidth: 2.8,
      });
      list.push({
        id: "vob",
        katexName: "V_{oB}(t)",
        data: toPoints((s) => s.phaseBOutput),
        color: "#EAB308",
        axis: "voltage",
        unit: "V",
        dashArray: "5 4",
        strokeWidth: 1.8,
      });
      list.push({
        id: "voc",
        katexName: "V_{oC}(t)",
        data: toPoints((s) => s.phaseCOutput),
        color: "#2563EB",
        axis: "voltage",
        unit: "V",
        dashArray: "5 4",
        strokeWidth: 1.8,
      });
      list.push({
        id: "io",
        katexName: "I_o(t)",
        data: toPoints((s) => s.outputCurrent),
        color: "#ec4899",
        axis: "current",
        unit: "A",
        strokeWidth: 2.5,
      });
    } else {
      list.push({
        id: "vs",
        katexName: "V_s(t)",
        data: toPoints((s) => s.sourceVoltage),
        color: "#94a3b8",
        axis: "voltage",
        unit: "V",
        dashArray: "6 5",
        strokeWidth: 1.5,
      });
      list.push({
        id: "vo",
        katexName: "V_o(t)",
        data: toPoints((s) => s.outputVoltage),
        color: "#2563eb",
        axis: "voltage",
        unit: "V",
        strokeWidth: 2.8,
      });
      list.push({
        id: "io",
        katexName: "I_o(t)",
        data: toPoints((s) => s.outputCurrent),
        color: "#ec4899",
        axis: "current",
        unit: "A",
        strokeWidth: 2.5,
      });
    }

    if (overlay === "thyristor") {
      list.push({
        id: "vt",
        katexName: "V_T(t)",
        data: toPoints((s) => s.thyristorVoltage),
        color: "#38bdf8",
        axis: "voltage",
        unit: "V",
        dashArray: "4 4",
        strokeWidth: 1.6,
      });
    }

    if (overlay === "gate") {
      list.push({
        id: "gate",
        katexName: "g(t)",
        data: toPoints((s) => s.gatePulse),
        color: "#7c3aed",
        axis: "voltage",
        unit: "",
        stepped: true,
        dashArray: "3 3",
        strokeWidth: 1.5,
      });
    }

    return list;
  }, [simulation.samples, simulation.period, parameters.phase, overlay]);

  const annotations = useMemo(() => {
    if (!isPhase) return undefined;
    const periodMs = simulation.period * 1000;
    const maxTime = periodMs * 2;
    const tAlpha1 = (metrics.firingAngle / 360) * periodMs;
    const tBeta1 = (metrics.extinctionAngle / 360) * periodMs;
    const tAlpha2 = (1 + metrics.firingAngle / 360) * periodMs;
    const tBeta2 = (1 + metrics.extinctionAngle / 360) * periodMs;

    return [
      { timeMs: tAlpha1, label: "α", color: "#7C3AED" },
      { timeMs: tBeta1, label: "β", color: "#7C3AED" },
      { timeMs: tAlpha2, label: "α", color: "#7C3AED" },
      { timeMs: tBeta2, label: "β", color: "#7C3AED" },
    ].filter((a) => a.timeMs <= maxTime);
  }, [isPhase, metrics.firingAngle, metrics.extinctionAngle, simulation.period]);

  const topology = (
    <StudioCard title="Topology Configuration">
      <div className="mt-4 space-y-4">
        <div>
          <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Phase</span>
          <SegmentedControl
            value={parameters.phase}
            options={phaseOptions}
            onChange={(phase) => update("phase", phase)}
            fullWidth
          />
        </div>
        <div>
          <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Topology Type</span>
          <SegmentedControl
            value={parameters.topology}
            options={topologyOptions}
            onChange={(topology) => update("topology", topology)}
            fullWidth
          />
        </div>
        {parameters.phase === "three" && (
          <div>
            <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">3-Φ Connection</span>
            <SegmentedControl
              value={parameters.threePhaseConnection}
              options={connectionOptions}
              onChange={(threePhaseConnection) => update("threePhaseConnection", threePhaseConnection)}
              fullWidth
            />
          </div>
        )}
      </div>
    </StudioCard>
  );

  const control = (
    <StudioCard title="Control Technique">
      <div className="mt-4">
        <SegmentedControl
          value={parameters.controlMode}
          options={modeOptions}
          onChange={(controlMode) => update("controlMode", controlMode)}
          fullWidth
        />
      </div>
      {isPhase ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <KatexMath math={tex`\alpha\,[^\circ]`} className="text-xs font-bold text-slate-500 dark:text-slate-400" />
            <div className="flex items-center gap-2.5">
              <KatexMath
                math={tex`\alpha = ${numberTex(parameters.firingAngle, 0)}^\circ`}
                className="text-xs font-semibold text-violet-600 dark:text-violet-400"
              />
              <KatexMath
                math={tex`\beta = ${metrics.extinctionAngle.toFixed(1)}^\circ`}
                className="text-xs font-semibold text-violet-600 dark:text-violet-400"
              />
            </div>
          </div>
          <StudioSlider
            aria-label="firing angle"
            min={0}
            max={180}
            step={1}
            unit="°"
            minLabel={<KatexMath math="0^\circ" />}
            maxLabel={<KatexMath math="180^\circ" />}
            value={parameters.firingAngle}
            onChange={(val) => update("firingAngle", val)}
            showLimits
          />
          <div className="mt-3">
            <Field
              label={tex`\alpha\,[^\circ]`}
              value={parameters.firingAngle}
              min={0}
              max={180}
              step={1}
              onChange={(firingAngle) => update("firingAngle", firingAngle)}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label={tex`n_{\mathrm{ON}}`}
            value={parameters.onCycles}
            min={1}
            max={12}
            step={1}
            onChange={(onCycles) => update("onCycles", onCycles)}
          />
          <Field
            label={tex`m_{\mathrm{OFF}}`}
            value={parameters.offCycles}
            min={1}
            max={12}
            step={1}
            onChange={(offCycles) => update("offCycles", offCycles)}
          />
          <div className="sm:col-span-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-center dark:border-violet-400/30 dark:bg-violet-500/10">
            <KatexMath
              math={tex`k=\frac{n}{n+m}=${numberTex(metrics.controlValue, 3)}`}
              className="text-sm font-bold text-violet-700 dark:text-violet-200"
            />
          </div>
        </div>
      )}
    </StudioCard>
  );

  const sourceLoad = (
    <StudioCard title="Source & Load Configuration">
      <div className="mt-4">
        <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Voltage Format</span>
        <SegmentedControl
          value={parameters.voltageFormat}
          options={formatOptions}
          onChange={(voltageFormat) => update("voltageFormat", voltageFormat)}
          fullWidth
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label={tex`V_s\,[\mathrm{V}]`}
          value={parameters.inputVoltage}
          min={0}
          step={1}
          onChange={(inputVoltage) => update("inputVoltage", inputVoltage)}
        />
        <Field
          label={tex`f\,[\mathrm{Hz}]`}
          value={parameters.frequency}
          min={1}
          step={1}
          onChange={(frequency) => update("frequency", frequency)}
        />
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label={tex`R\,[\Omega]`}
          value={parameters.resistance}
          min={0.05}
          step={0.1}
          onChange={(resistance) => update("resistance", resistance)}
        />
        <Field
          label={tex`L\,[\mathrm{mH}]`}
          value={parameters.inductanceMilliHenry}
          disabled={!hasInductance}
          min={0}
          step={1}
          onChange={(inductanceMilliHenry) => update("inductanceMilliHenry", inductanceMilliHenry)}
        />
      </div>
    </StudioCard>
  );

  const metricPanel = (
    <StudioCard
      title="Steady-State Metrics"
      actionSlot={<KatexMath math={tex`\frac{1}{T}\int_{0}^{T}(\cdot)\,dt`} className="text-xs text-slate-500 dark:text-slate-400" />}
    >
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={tex`V_{o\mathrm{rms}}`} value={tex`${numberTex(metrics.outputVoltageRms)}\,\mathrm{V}`} />
        <Metric label={tex`I_{o\mathrm{rms}}`} value={tex`${numberTex(metrics.outputCurrentRms)}\,\mathrm{A}`} />
        <Metric label="P" value={tex`${numberTex(metrics.activePower)}\,\mathrm{W}`} />
        <Metric label="S" value={tex`${numberTex(metrics.apparentPower)}\,\mathrm{VA}`} />
        <Metric label={tex`\mathrm{PF}`} value={numberTex(metrics.powerFactor, 3)} />
        <Metric label={tex`\alpha`} value={tex`${numberTex(metrics.firingAngle, 0)}^\circ`} />
        <Metric label={tex`\beta`} value={tex`${numberTex(metrics.extinctionAngle, 1)}^\circ`} />
        <Metric label={tex`\gamma`} value={tex`${numberTex(metrics.conductionAngle, 1)}^\circ`} />
        <Metric label={tex`\mathrm{THD}_v`} value={tex`${numberTex(metrics.voltageThd)}\%`} />
        <Metric label={tex`\mathrm{THD}_i`} value={tex`${numberTex(metrics.currentThd)}\%`} />
        <Metric label={tex`V_{s\mathrm{rms}}`} value={tex`${numberTex(metrics.sourceVoltageRms)}\,\mathrm{V}`} />
        <Metric
          label={isPhase ? tex`\mathrm{Mode}` : tex`k`}
          value={isPhase ? tex`\mathrm{Phase}` : numberTex(metrics.controlValue, 3)}
        />
      </div>
    </StudioCard>
  );

  return (
    <StudioErrorBoundary studioName="AC Voltage Controller">
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
              title={
                parameters.phase === "three"
                  ? "THREE-PHASE AC CONTROLLER OUTPUT SCOPE"
                  : "SINGLE-PHASE AC CONTROLLER OUTPUT SCOPE"
              }
              subtitleLatex={
                parameters.phase === "three"
                  ? tex`V_{oA}(t),\ V_{oB}(t),\ V_{oC}(t),\ I_o(t)`
                  : tex`V_s(t),\ V_o(t),\ I_o(t)`
              }
              series={series}
              annotations={annotations}
              headerRight={
                <SegmentedControl
                  size="sm"
                  value={overlay}
                  options={overlayOptions}
                  onChange={setOverlay}
                  aria-label="Scope Overlay Mode"
                />
              }
            />
            <Circuit parameters={parameters} />
          </main>
        </div>
      </div>
    </StudioErrorBoundary>
  );
}

export default ACVoltageControllerStudio;
