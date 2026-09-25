import { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioCard, StudioSlider, InnerBox } from "@/components/common/templates";
import { PowerWarningAlert } from "./PowerWarningAlert";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { PowerScopePlot, type ScopeSeries } from "./PowerScopePlot";
import {
  defaultRectifierParameters,
  simulateControlledRectifier,
  type FullWaveSubtype,
  type RectifierLoad,
  type RectifierParameters,
  type RectifierPhase,
  type RectifierType,
  type VoltageFormat,
} from "@/features/power-electronics/rectifierMath";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-sm p-5 md:p-6 transition-all";
const heading = "text-sm font-bold text-slate-800 dark:text-white";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right font-mono text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-800 dark:bg-slate-950 dark:text-white";
const tex = String.raw;

const phaseOptions = [
  { value: "single" as RectifierPhase, label: "1-Φ Single" },
  { value: "three" as RectifierPhase, label: "3-Φ Three" },
];

const rectifierOptions = [
  { value: "half" as RectifierType, label: "Half-Wave" },
  { value: "full" as RectifierType, label: "Full-Wave" },
];

const fullWaveOptions = [
  { value: "bridge" as FullWaveSubtype, label: "Bridge" },
  { value: "center-tapped" as FullWaveSubtype, label: "Center-Tapped" },
];

const loadOptions = [
  { value: "R" as RectifierLoad, label: <KatexMath math="R" /> },
  { value: "RL" as RectifierLoad, label: <KatexMath math="RL" /> },
  { value: "RC" as RectifierLoad, label: <KatexMath math="RC" /> },
  { value: "RLC" as RectifierLoad, label: <KatexMath math="RLC" /> },
  { value: "RLE" as RectifierLoad, label: <KatexMath math="RLE" /> },
];

const voltageOptions = [
  { value: "rms" as VoltageFormat, label: <KatexMath math={tex`V_{\mathrm{RMS}}`} /> },
  { value: "peak" as VoltageFormat, label: <KatexMath math="V_m" /> },
];

const fwdOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
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

function NumberField({ label, value, onChange, disabled = false, min = 0, step = "any" }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; min?: number; step?: number | "any" }) {
  const [editing, setEditing] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block"><MathLabel math={label} /></span>
      <div className="relative">
        <input
          aria-label={label}
          type="number"
          min={min}
          step={step}
          disabled={disabled}
          value={Number.isFinite(value) ? value : 0}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          style={editing ? undefined : { color: "transparent", WebkitTextFillColor: "transparent", caretColor: "transparent" }}
          className={`${field} text-center`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 grid place-items-center ${editing ? "hidden" : ""} ${disabled ? "opacity-35" : ""}`}
        >
          <KatexMath math={NumberValue(value)} className="text-sm font-semibold text-slate-900 dark:text-white" />
        </span>
      </div>
    </label>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950">
      <KatexMath math={label} className="block text-[10px] text-slate-500 dark:text-slate-400" />
      <KatexMath math={value} className="mt-1 block overflow-x-auto text-xs font-bold text-slate-900 dark:text-white" />
    </div>
  );
}

function CircuitPlate({ parameters }: { parameters: RectifierParameters }) {
  const topology = parameters.rectifierType === "full" ? parameters.fullWaveSubtype === "bridge" ? "Bridge" : "Center-Tapped" : "Half-Wave";
  const bridge = parameters.rectifierType === "full" && parameters.fullWaveSubtype === "bridge";
  return (
    <section className={`${card} min-h-[340px]`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={heading}>Converter Drafting Plate</h3>
        <span className="font-mono text-[10px] font-bold tracking-[.12em] text-violet-700 dark:text-violet-300">
          {topology.toUpperCase()}
        </span>
      </div>
      <div className="mt-4 grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950">
        <svg viewBox="0 0 360 140" className="h-36 w-full max-w-lg" fill="none" role="img" aria-label={`${topology} rectifier native drafting plate`}>
          <path d="M18 70h40m0 0 12-15v30L58 70m12 0h32M266 70h76M316 40v60m-13-48h26m-26 18h26m-26 18h26" stroke="#64748b" strokeWidth="1.5" />
          <circle cx="36" cy="70" r="18" stroke="#94a3b8" strokeWidth="1.4" />
          <path d="M24 70c4-10 9-10 13 0s9 10 13 0" stroke="#60a5fa" strokeWidth="1.6" />
          {bridge ? (
            <>
              <path d="M102 44h82v52h-82zM102 44l82 52M184 44l-82 52M143 44v-16m0 68v16M184 70h58" stroke="#8b5cf6" strokeWidth="1.7" />
              <path d="M116 51l12 7-12 7m12-7h13m-11 24 12 7-12 7m12-7h14m17-32 12 7-12 7m12-7h12m-26 24 12 7-12 7m12-7h12" stroke="#c4b5fd" strokeWidth="1.3" />
            </>
          ) : (
            <>
              <path d="M102 70h38m0 0 13-15v30l-13-15m13 0h65m0-30v60m-13-48h26m-26 18h26m-26 18h26m-23-48 12 8-12 8m12-8h14" stroke="#8b5cf6" strokeWidth="1.7" />
              <path d="M218 70h48" stroke="#8b5cf6" strokeWidth="1.7" />
            </>
          )}
          <circle cx="266" cy="70" r="3.5" fill="#f43f5e" />
          <path d="M266 70h22" stroke="#f43f5e" strokeWidth="1.8" />
          <text x="18" y="126" fill="#94a3b8" fontSize="8" fontFamily="ui-monospace, monospace">AC SOURCE</text>
          <text x="115" y="126" fill="#a78bfa" fontSize="8" fontFamily="ui-monospace, monospace">{bridge ? "D1–D4 BRIDGE" : "CONTROLLED PATH"}</text>
          <text x="260" y="126" fill="#fb7185" fontSize="8" fontFamily="ui-monospace, monospace">REF / VO</text>
        </svg>
        <span className="mt-2 block font-mono text-[9px] font-bold tracking-[.12em] text-slate-400">
          SOURCE · RECTIFICATION PATH · LOAD REFERENCE
        </span>
      </div>
    </section>
  );
}

export function RectifierStudio() {
  const [parameters, setParameters] = useState<RectifierParameters>(defaultRectifierParameters);
  const [chartsReady, setChartsReady] = useState(false);
  const simulation = useMemo(() => simulateControlledRectifier(parameters), [parameters]);
  const hasResistance = ["R", "RL", "RC", "RLC", "RLE"].includes(parameters.loadType);
  const hasInductance = ["RL", "RLC", "RLE"].includes(parameters.loadType);
  const hasCapacitance = ["RC", "RLC"].includes(parameters.loadType);
  const hasBackEmf = parameters.loadType === "RLE";

  useEffect(() => {
    const frame = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const update = <K extends keyof RectifierParameters>(key: K, value: RectifierParameters[K]) =>
    setParameters((current) => ({ ...current, [key]: value }));

  const data = useMemo(
    () => simulation.samples.map((sample, plotIndex) => ({ ...sample, plotIndex })),
    [simulation.samples]
  );
  const metrics = simulation.metrics;

  const currentExtinctionIndex = useMemo(
    () =>
      metrics.conductionMode === "DCM"
        ? data.findIndex(
            (point, index) =>
              index > Math.floor(data.length * 0.2) && Math.abs(point.outputCurrent) <= 1e-8
          )
        : -1,
    [data, metrics.conductionMode]
  );

  const extinctionTimeMs = currentExtinctionIndex >= 0 ? data[currentExtinctionIndex].time * 1000 : null;

  // Build unified scope series conforming to Control Systems theme
  const scopeSeries: ScopeSeries[] = useMemo(() => {
    const seriesList: ScopeSeries[] = [];

    // Output Voltage (Primary signal: Vibrant Royal Blue #2563eb)
    seriesList.push({
      id: "vo",
      katexName: "V_o(t)",
      data: data.map((d) => ({ t: d.time * 1000, val: d.outputVoltage })),
      color: "#2563eb",
      strokeWidth: 2.8,
      axis: "voltage",
      unit: "V",
    });

    // Output Current (Current curve: MAE Coral/Pink #ec4899)
    seriesList.push({
      id: "io",
      katexName: "I_o(t)",
      data: data.map((d) => ({ t: d.time * 1000, val: d.outputCurrent })),
      color: "#ec4899",
      strokeWidth: 2.6,
      axis: "current",
      unit: "A",
    });

    // Three-phase source traces
    if (parameters.phase === "three") {
      seriesList.push({
        id: "va",
        katexName: "V_A(t)",
        data: data.map((d) => ({ t: d.time * 1000, val: d.va })),
        color: "#E11D48",
        strokeWidth: 1.8,
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "vb",
        katexName: "V_B(t)",
        data: data.map((d) => ({ t: d.time * 1000, val: d.vb })),
        color: "#EAB308",
        strokeWidth: 1.8,
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "vc",
        katexName: "V_C(t)",
        data: data.map((d) => ({ t: d.time * 1000, val: d.vc })),
        color: "#2563EB",
        strokeWidth: 1.8,
        axis: "voltage",
        unit: "V",
      });
    } else {
      // Single-phase input trace (Muted slate dashed #94a3b8)
      seriesList.push({
        id: "vin",
        katexName: "V_{in}(t)",
        data: data.map((d) => ({ t: d.time * 1000, val: d.va })),
        color: "#94a3b8",
        strokeWidth: 1.5,
        dashArray: "5,4",
        axis: "voltage",
        unit: "V",
      });
    }

    return seriesList;
  }, [data, parameters.phase]);

  const topologyPanel = (
    <StudioCard
      title="Topology Configuration"
      actionSlot={<KatexMath math={tex`\alpha = ${NumberValue(parameters.firingAngle, 0)}^\circ`} className="text-sm font-semibold text-violet-600 dark:text-violet-400" />}
    >
      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Phase</span>
          <SegmentedControl
            options={phaseOptions}
            value={parameters.phase}
            onChange={(phase) => update("phase", phase)}
            fullWidth
            aria-label="Rectifier Phase"
          />
        </div>

        <div>
          <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Rectifier Type</span>
          <SegmentedControl
            options={rectifierOptions}
            value={parameters.rectifierType}
            onChange={(rectifierType) => update("rectifierType", rectifierType)}
            fullWidth
            aria-label="Rectifier Type"
          />
        </div>

        {parameters.rectifierType === "full" && (
          <div>
            <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Full-Wave Subtype</span>
            <SegmentedControl
              options={fullWaveOptions}
              value={parameters.fullWaveSubtype}
              onChange={(fullWaveSubtype) => update("fullWaveSubtype", fullWaveSubtype)}
              fullWidth
              aria-label="Full-Wave Subtype"
            />
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Source &amp; Firing Parameters</h4>
            <KatexMath math={tex`\omega=${NumberValue(simulation.angularFrequency, 1)}\,\mathrm{rad/s}`} className="text-xs text-violet-700 dark:text-violet-300" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Voltage Format</span>
              <SegmentedControl
                options={voltageOptions}
                value={parameters.voltageFormat}
                onChange={(voltageFormat) => update("voltageFormat", voltageFormat)}
                fullWidth
                aria-label="Voltage Format"
              />
            </div>
            <NumberField label={tex`V_{in}\,[\mathrm{V}]`} value={parameters.inputVoltage} min={0} step={1} onChange={(inputVoltage) => update("inputVoltage", inputVoltage)} />
            <NumberField label={tex`f\,[\mathrm{Hz}]`} value={parameters.frequency} min={1} step={1} onChange={(frequency) => update("frequency", frequency)} />
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <MathLabel math={tex`\alpha\,[^\circ]`} />
                <KatexMath math={tex`\alpha = ${NumberValue(parameters.firingAngle, 0)}^\circ`} className="text-xs font-semibold text-violet-600 dark:text-violet-400" />
              </div>
              <StudioSlider aria-label="firing angle slider" min={0} max={180} step={1} value={parameters.firingAngle} onChange={(val) => update("firingAngle", val)} showLimits />
            </div>
          </div>
        </div>
      </div>
    </StudioCard>
  );

  const loadPanel = (
    <StudioCard title="Load Configuration">
      <div className="mt-4">
        <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Load Type</span>
        <SegmentedControl
          options={loadOptions}
          value={parameters.loadType}
          onChange={(loadType) => update("loadType", loadType)}
          fullWidth
          aria-label="Load Type"
        />
      </div>

      <div className="mt-4">
        <span className="mb-2 block text-xs font-bold text-slate-500 dark:text-slate-400">Free-Wheeling Diode (FWD)</span>
        <SegmentedControl
          options={fwdOptions}
          value={parameters.freeWheelingDiode ? "yes" : "no"}
          onChange={(value) => update("freeWheelingDiode", value === "yes")}
          fullWidth
          aria-label="Free-Wheeling Diode"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NumberField label={tex`R\,[\Omega]`} value={parameters.resistance} disabled={!hasResistance} min={0.05} step={0.1} onChange={(resistance) => update("resistance", resistance)} />
        <NumberField label={tex`L\,[\mathrm{mH}]`} value={parameters.inductanceMilliHenry} disabled={!hasInductance} min={0} step={1} onChange={(inductanceMilliHenry) => update("inductanceMilliHenry", inductanceMilliHenry)} />
        <NumberField label={tex`C\,[\mu\mathrm{F}]`} value={parameters.capacitanceMicroFarad} disabled={!hasCapacitance} min={0} step={1} onChange={(capacitanceMicroFarad) => update("capacitanceMicroFarad", capacitanceMicroFarad)} />
        <NumberField label={tex`E\,[\mathrm{V}]`} value={parameters.backEmfVoltage} disabled={!hasBackEmf} min={0} step={1} onChange={(backEmfVoltage) => update("backEmfVoltage", backEmfVoltage)} />
      </div>
    </StudioCard>
  );

  const outputScope = (
    <div className="recharts-responsive-container w-full">
      <PowerScopePlot
        title={parameters.phase === "three" ? "THREE-PHASE RECTIFIER SCOPE" : "SINGLE-PHASE CONVERTER SCOPE"}
        subtitleLatex={parameters.phase === "three" ? tex`V_A(t),\ V_B(t),\ V_C(t),\ V_o(t),\ I_o(t)` : tex`V_{in}(t),\ V_o(t),\ I_o(t)`}
        series={scopeSeries}
        height={530}
        dcmExtinctionTimeMs={extinctionTimeMs}
        dcmExtinctionLabel={metrics.extinctionAngleDeg !== null ? `I_o = 0 · β = ${NumberValue(metrics.extinctionAngleDeg, 1)}°` : "I_o = 0"}
        dcmWindowStartMs={extinctionTimeMs}
      />
    </div>
  );

  const metricsPanel = (
    <section className={`${card} p-4`}>
      <div>
        <h3 className={heading}>Steady-State Metrics</h3>
        <KatexMath math={tex`\frac{1}{T_{out}}\int_{T_{out}}(\cdot)\,dt`} className="mt-1 block text-xs text-slate-500 dark:text-slate-400" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCell label={tex`V_{\mathrm{RMS}}`} value={tex`${NumberValue(metrics.voltageRms)}\,\mathrm{V}`} />
        <MetricCell label={tex`V_{\mathrm{DC}}`} value={tex`${NumberValue(metrics.voltageDc)}\,\mathrm{V}`} />
        <MetricCell label={tex`I_{\mathrm{RMS}}`} value={tex`${NumberValue(metrics.currentRms)}\,\mathrm{A}`} />
        <MetricCell label={tex`I_{\mathrm{DC}}`} value={tex`${NumberValue(metrics.currentDc)}\,\mathrm{A}`} />
        <MetricCell label={tex`P_{\mathrm{DC}}`} value={tex`${NumberValue(metrics.dcPower)}\,\mathrm{W}`} />
        <MetricCell label={tex`P_{\mathrm{AC}}`} value={tex`${NumberValue(metrics.acPower)}\,\mathrm{VA}`} />
        <MetricCell label={tex`f_{out}`} value={tex`${NumberValue(metrics.outputFrequency)}\,\mathrm{Hz}`} />
        <MetricCell label={tex`V_{\mathrm{ripple}}`} value={tex`${NumberValue(metrics.rippleVoltage)}\,\mathrm{V}`} />
        <MetricCell label={tex`\mathrm{FF}`} value={tex`${NumberValue(metrics.formFactor, 3)}`} />
        <MetricCell label={tex`\mathrm{RF}`} value={tex`${NumberValue(metrics.rippleFactor, 3)}`} />
        <MetricCell label={tex`\mathrm{PF}`} value={tex`${NumberValue(metrics.powerFactor, 3)}`} />
        <MetricCell label={tex`\eta`} value={tex`${NumberValue(metrics.efficiency)}\%`} />
      </div>
    </section>
  );

  return (
    <StudioErrorBoundary studioName="Rectifier">
      <div className="space-y-6">
        <PowerWarningAlert warnings={simulation.warnings} />
        <div className="grid gap-4 lg:gap-5 lg:grid-cols-2 items-start">
          <aside className="space-y-6">
            {topologyPanel}
            {loadPanel}
            {metricsPanel}
          </aside>
          <main className="space-y-6">
            {outputScope}
            <CircuitPlate parameters={parameters} />
          </main>
        </div>
      </div>
    </StudioErrorBoundary>
  );
}

export default RectifierStudio;
