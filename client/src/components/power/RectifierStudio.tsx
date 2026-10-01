import { RemoteSimulationGate, prefetchSimulation } from "./RemoteSimulationGate";
import { simulateRectifierRemote } from "@/services/controlClient";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioCard, StudioSlider, InnerBox } from "@/components/common/templates";
import { SchematicView, buildRectifierCircuit, fwdAllowedFor, normalizeRectifierTopology, type RectifierSchematicTopology } from "@/features/power-electronics/schematics";
import { PowerWarningAlert } from "./PowerWarningAlert";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { PowerScopePlot, type ScopeSeries } from "./PowerScopePlot";
import {
  defaultRectifierParameters,
  type FullWaveSubtype,
  type RectifierLoad,
  type RectifierParameters,
  type RectifierPhase,
  type RectifierType,
  type VoltageFormat,
} from "@shared/power/rectifierTypes";
import type { RectifierSimulation } from "@shared/power/rectifierTypes";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-sm p-5 md:p-6 transition-all";
const heading = "text-sm font-bold text-slate-800 dark:text-white";
const field =
  "h-11 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-slate-800 text-xl font-medium sm:text-2xl tracking-wide dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 text-center disabled:cursor-not-allowed disabled:opacity-35 transition";
const tex = String.raw;

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
  return (
    <label className="block">
      <span className="mb-1.5 block"><MathLabel math={label} /></span>
      <input
        aria-label={label}
        type="number"
        min={min}
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        data-math-input="true"
        style={{
          fontFamily: "'KaTeX_Main', 'Times New Roman', serif"
        }}
        className={field}
      />
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

/** Maps studio state to the schematic topology; centre-tapped has no three-phase form, so it falls back to the bridge. */
function schematicTopology(parameters: RectifierParameters): RectifierSchematicTopology {
  const requested: RectifierSchematicTopology = parameters.rectifierType === "half" ? "half-wave" : parameters.fullWaveSubtype === "bridge" ? "bridge" : "center-tapped";
  return normalizeRectifierTopology(parameters.phase, requested);
}

function CircuitPlate({ parameters }: { parameters: RectifierParameters }) {
  const { t } = useTranslation("simulators");
  const shape = schematicTopology(parameters);
  const topology = shape === "bridge" ? t("power.bridge", "Bridge") : shape === "center-tapped" ? t("power.centerTapped", "Center-Tapped") : t("power.halfWave", "Half-Wave");
  // α = 0 behaves as an uncontrolled diode rectifier; any firing delay needs thyristors with gate triggers
  const controlled = parameters.firingAngle > 0;
  const schematic = useMemo(
    () => buildRectifierCircuit(parameters.phase, shape, parameters.loadType, parameters.freeWheelingDiode, controlled),
    [parameters.phase, shape, parameters.loadType, parameters.freeWheelingDiode, controlled],
  );
  return (
    <section className={`${card} min-h-[340px]`}>
      <div className="flex items-center justify-between gap-3 mae-card-header-row panel-header" data-slot="card-header">
        <h3 className={`${heading} mae-card-header-title`}>{t("power.circuitDiagram", "Circuit Diagram")}</h3>
        <span className="font-mono text-[10px] font-bold tracking-[.12em] text-violet-700 dark:text-violet-300 mae-card-header-actions shrink-0">
          {topology.toUpperCase()}
        </span>
      </div>
      <div className="mt-4 grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-slate-50 p-4 text-center dark:border-violet-400/30 dark:bg-slate-950">
        <SchematicView
          document={schematic}
          ariaLabel={t("power.rectifierDraftingAria", "{{topology}} rectifier native drafting plate", { topology })}
        />
      </div>
    </section>
  );
}

function RectifierStudioBody({ parameters, setParameters, simulation }: { parameters: RectifierParameters; setParameters: Dispatch<SetStateAction<RectifierParameters>>; simulation: RectifierSimulation }) {
  const { t } = useTranslation("simulators");
  const phaseOptions = [
    { value: "single" as RectifierPhase, label: t("power.phaseSingleShort", "1-Φ Single") },
    { value: "three" as RectifierPhase, label: t("power.phaseThreeShort", "3-Φ Three") },
  ];
  const rectifierOptions = [
    { value: "half" as RectifierType, label: t("power.halfWave", "Half-Wave") },
    { value: "full" as RectifierType, label: t("power.fullWave", "Full-Wave") },
  ];
  const fullWaveOptions = [
    { value: "bridge" as FullWaveSubtype, label: t("power.bridge", "Bridge") },
    { value: "center-tapped" as FullWaveSubtype, label: t("power.centerTapped", "Center-Tapped") },
  ];
  const fwdOptions = [
    { value: "yes", label: t("power.yes", "Yes") },
    { value: "no", label: t("power.no", "No") },
  ];
  const hasResistance = ["R", "RL", "RC", "RLC", "RLE"].includes(parameters.loadType);
  const hasInductance = ["RL", "RLC", "RLE"].includes(parameters.loadType);
  const hasCapacitance = ["RC", "RLC"].includes(parameters.loadType);
  const hasBackEmf = parameters.loadType === "RLE";

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
      title={t("power.topologyConfig", "Topology Configuration")}
      actionSlot={<KatexMath math={tex`\alpha = ${NumberValue(parameters.firingAngle, 0)}^\circ`} className="text-sm font-semibold text-violet-600 dark:text-violet-400" />}
    >
      <div className="space-y-4">
        <div>
          <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.phase", "Phase")}</span>
          <SegmentedControl
            options={phaseOptions}
            value={parameters.phase}
            onChange={(phase) => update("phase", phase)}
            fullWidth
            aria-label={t("power.rectifierPhaseAria", "Rectifier Phase")}
          />
        </div>

        <div>
          <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.rectifierTypeLabel", "Rectifier Type")}</span>
          <SegmentedControl
            options={rectifierOptions}
            value={parameters.rectifierType}
            onChange={(rectifierType) => update("rectifierType", rectifierType)}
            fullWidth
            aria-label={t("power.rectifierTypeLabel", "Rectifier Type")}
          />
        </div>

        {parameters.rectifierType === "full" && (
          <div>
            <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.fullWaveSubtypeLabel", "Full-Wave Subtype")}</span>
            <SegmentedControl
              options={fullWaveOptions}
              value={parameters.fullWaveSubtype}
              onChange={(fullWaveSubtype) => update("fullWaveSubtype", fullWaveSubtype)}
              fullWidth
              aria-label={t("power.fullWaveSubtypeLabel", "Full-Wave Subtype")}
            />
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3 mae-card-header-row panel-header" data-slot="card-header">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mae-card-header-title">{t("power.sourceFiringParams", "Source & Firing Parameters")}</h4>
            <KatexMath math={tex`\omega=${NumberValue(simulation.angularFrequency, 1)}\,\mathrm{rad/s}`} className="text-xs text-violet-700 dark:text-violet-300 mae-card-header-actions shrink-0" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.voltageFormat", "Voltage Format")}</span>
              <SegmentedControl
                options={voltageOptions}
                value={parameters.voltageFormat}
                onChange={(voltageFormat) => update("voltageFormat", voltageFormat)}
                fullWidth
                aria-label={t("power.voltageFormat", "Voltage Format")}
              />
            </div>
            <NumberField label={tex`V_{in}\,[\mathrm{V}]`} value={parameters.inputVoltage} min={0} step={1} onChange={(inputVoltage) => update("inputVoltage", inputVoltage)} />
            <NumberField label={tex`f\,[\mathrm{Hz}]`} value={parameters.frequency} min={1} step={1} onChange={(frequency) => update("frequency", frequency)} />
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <MathLabel math={tex`\alpha\,[^\circ]`} />
                <KatexMath math={tex`\alpha = ${NumberValue(parameters.firingAngle, 0)}^\circ`} className="text-xs font-semibold text-violet-600 dark:text-violet-400" />
              </div>
              <StudioSlider
                aria-label={t("power.firingAngleSliderAria", "firing angle slider")}
                min={0}
                max={180}
                step={1}
                value={parameters.firingAngle}
                onChange={(val) => update("firingAngle", val)}
                showLimits
                unit="°"
                minLabel={<KatexMath math="0^\circ" />}
                maxLabel={<KatexMath math="180^\circ" />}
              />
            </div>
          </div>
        </div>
      </div>
    </StudioCard>
  );

  const loadPanel = (
    <StudioCard title={t("power.loadConfig", "Load Configuration")}>
      <div className="mt-4">
        <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.loadTypeLabel", "Load Type")}</span>
        <SegmentedControl
          options={loadOptions}
          value={parameters.loadType}
          onChange={(loadType) => setParameters((current) => ({
            ...current,
            loadType,
            // a free-wheeling diode only exists for RL / RLE loads; drop it when switching away
            freeWheelingDiode: fwdAllowedFor(loadType) ? current.freeWheelingDiode : false,
          }))}
          fullWidth
          aria-label={t("power.loadTypeLabel", "Load Type")}
        />
      </div>

      {fwdAllowedFor(parameters.loadType) && (
        <div className="mt-4">
          <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.freeWheelingDiode", "Free-Wheeling Diode (FWD)")}</span>
          <SegmentedControl
            options={fwdOptions}
            value={parameters.freeWheelingDiode ? "yes" : "no"}
            onChange={(value) => update("freeWheelingDiode", value === "yes")}
            fullWidth
            aria-label={t("power.freeWheelingDiodeAria", "Free-Wheeling Diode")}
          />
        </div>
      )}

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
        title={parameters.phase === "three" ? t("power.threePhaseRectifierScope", "THREE-PHASE RECTIFIER SCOPE") : t("power.singlePhaseConverterScope", "SINGLE-PHASE CONVERTER SCOPE")}
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
        <h3 className={heading}>{t("power.steadyStateMetrics", "Steady-State Metrics")}</h3>
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
    <StudioErrorBoundary studioName={t("power.rectifierName", "Rectifier")}>
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

// Start the default-parameter solve as soon as this chunk evaluates, in parallel with first render.
prefetchSimulation("rectifier", defaultRectifierParameters, simulateRectifierRemote);

/** Holds the converter parameters; the simulation itself is solved by the serverless engine and streamed back as sample arrays. */
export function RectifierStudio() {
  const [parameters, setParameters] = useState<RectifierParameters>(defaultRectifierParameters);
  return (
    <RemoteSimulationGate namespace="rectifier" parameters={parameters} fetcher={simulateRectifierRemote}>
      {(simulation) => <RectifierStudioBody parameters={parameters} setParameters={setParameters} simulation={simulation} />}
    </RemoteSimulationGate>
  );
}
