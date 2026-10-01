import { RemoteSimulationGate, prefetchSimulation } from "./RemoteSimulationGate";
import { simulateInverterRemote } from "@/services/controlClient";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioCard, StudioSlider, InnerBox } from "@/components/common/templates";
import { SchematicView, buildInverterCircuit, inverterFaultLegIds } from "@/features/power-electronics/schematics";
import { PowerWarningAlert, StudioAlert, NoticeBadge } from "./PowerWarningAlert";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { PowerScopePlot, type ScopeSeries } from "./PowerScopePlot";
import {
  defaultInverterParameters,
  type InverterLoad,
  type InverterParameters,
  type InverterPhase,
  type InverterSample,
  type SinglePhaseSubtype,
  type SwitchingTechnique,
  type ThreePhaseConduction,
} from "@shared/power/inverterTypes";
import type { InverterSimulation } from "@shared/power/inverterTypes";

const tex = String.raw;
const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-sm p-5 md:p-6 transition-all";
const heading = "text-sm font-bold text-slate-800 dark:text-white";
const field =
  "h-11 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-slate-800 text-xl font-medium sm:text-2xl tracking-wide dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 text-center disabled:cursor-not-allowed disabled:opacity-35 transition";

const threeModes = [
  { value: "180" as ThreePhaseConduction, label: <KatexMath math={tex`180^\circ`} /> },
  { value: "120" as ThreePhaseConduction, label: <KatexMath math={tex`120^\circ`} /> },
];

const loads = [
  { value: "R" as InverterLoad, label: <KatexMath math="R" /> },
  { value: "RL" as InverterLoad, label: <KatexMath math="RL" /> },
  { value: "RLE" as InverterLoad, label: <KatexMath math="RLE" /> },
];

function numberTex(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1000 || magnitude < 0.01)) {
    const [m, exponent] = value.toExponential(2).split("e");
    return `${m}\\times 10^{${Number(exponent)}}`;
  }
  return Number(value.toFixed(digits)).toString();
}

function Field({ label, value, setValue, disabled = false, min = 0, step = "any" }: { label: string; value: number; setValue: (value: number) => void; disabled?: boolean; min?: number; step?: number | "any" }) {
  return (
    <label className="block">
      <KatexMath math={label} className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400" />
      <input
        aria-label={label}
        className={field}
        type="number"
        min={min}
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => setValue(Number(event.target.value) || 0)}
        data-math-input="true"
        style={{
          fontFamily: "'KaTeX_Main', 'Times New Roman', serif"
        }}
      />
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

function computeInverterHarmonics(samples: InverterSample[], period: number, maxOrder = 25) {
  if (samples.length === 0 || period <= 0) return [];
  // Filter samples to exactly 1 fundamental period [0, T_0)
  const onePeriodSamples = samples.filter((s) => s.time < period - 1e-9);
  const analysisSamples = onePeriodSamples.length > 0 ? onePeriodSamples : samples;
  const n = analysisSamples.length;
  const harmonics: { order: number; rms: number }[] = [];
  const TWO_PI = Math.PI * 2;
  for (let order = 1; order <= maxOrder; order++) {
    let cosSum = 0;
    let sinSum = 0;
    for (let i = 0; i < n; i++) {
      const angle = (TWO_PI * order * i) / n;
      cosSum += analysisSamples[i].outputVoltage * Math.cos(angle);
      sinSum += analysisSamples[i].outputVoltage * Math.sin(angle);
    }
    const peak = (2 / n) * Math.hypot(cosSum, sinSum);
    harmonics.push({ order, rms: peak / Math.SQRT2 });
  }
  return harmonics;
}

function Circuit({ parameters, faulted }: { parameters: InverterParameters; faulted: boolean }) {
  const { t } = useTranslation("simulators");
  const techniqueLabels: Record<SwitchingTechnique, string> = {
    square: t("power.switchSquare", "Square"),
    "single-pulse": t("power.switchSingleP", "Single-P"),
    "multi-pulse": t("power.switchMultiP", "Multi-P"),
    spwm: t("power.switchSpwm", "SPWM"),
  };
  const bridgeWord = parameters.singlePhaseSubtype === "full-bridge" ? t("power.fullBridge", "Full-Bridge") : t("power.halfBridge", "Half-Bridge");
  const topology = parameters.phase === "single" ? `${bridgeWord} VSI` : `${t("power.threePhaseWord", "Three-Phase")} ${parameters.threePhaseConduction}° VSI`;
  const shape = parameters.singlePhaseSubtype;
  const schematic = useMemo(
    () => buildInverterCircuit(parameters.phase, shape, parameters.loadType),
    [parameters.phase, shape, parameters.loadType],
  );
  const faultLeg = useMemo(() => inverterFaultLegIds(parameters.phase, shape), [parameters.phase, shape]);
  return (
    <section className={`${card} min-h-[340px]`}>
      <div className="flex items-center justify-between gap-3 mae-card-header-row panel-header" data-slot="card-header">
        <h3 className={`${heading} mae-card-header-title`}>{t("power.circuitDiagram", "Circuit Diagram")}</h3>
        <span className={`text-xs font-bold mae-card-header-actions shrink-0 ${faulted ? "text-rose-600 dark:text-rose-300" : "text-violet-700 dark:text-violet-300"}`}>
          {faulted ? t("power.faultLegInhibited", "FAULT / LEG INHIBITED") : techniqueLabels[parameters.technique].toUpperCase()}
        </span>
      </div>
      <div className={`mt-4 grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-dashed p-4 text-center dark:bg-slate-950 ${faulted ? "border-rose-400 bg-rose-50 dark:border-rose-400/50 dark:bg-rose-500/10" : "border-violet-300 bg-slate-50 dark:border-violet-400/30 dark:bg-slate-950"}`}>
        <SchematicView
          document={schematic}
          ariaLabel={faulted ? t("power.shootThroughFaultAriaLabel", "Shoot-Through fault detected in inverter leg") : topology}
          highlightIds={faulted ? faultLeg : []}
        />
      </div>
    </section>
  );
}

function InverterStudioBody({ parameters, setParameters, simulation }: { parameters: InverterParameters; setParameters: Dispatch<SetStateAction<InverterParameters>>; simulation: InverterSimulation }) {
  const { t } = useTranslation("simulators");
  const phases = [
    { value: "single" as InverterPhase, label: t("power.phaseSingleFull", "Single-Phase (1-Φ)") },
    { value: "three" as InverterPhase, label: t("power.phaseThreeFull", "Three-Phase (3-Φ)") },
  ];
  const singleTopologies = [
    { value: "half-bridge" as SinglePhaseSubtype, label: t("power.halfBridge", "Half-Bridge") },
    { value: "full-bridge" as SinglePhaseSubtype, label: t("power.fullBridge", "Full-Bridge") },
  ];
  const techniques = [
    { value: "square" as SwitchingTechnique, label: t("power.switchSquare", "Square") },
    { value: "single-pulse" as SwitchingTechnique, label: t("power.switchSingleP", "Single-P") },
    { value: "multi-pulse" as SwitchingTechnique, label: t("power.switchMultiP", "Multi-P") },
    { value: "spwm" as SwitchingTechnique, label: t("power.switchSpwm", "SPWM") },
  ];
  const [showSignals, setShowSignals] = useState(false);
  const metrics = simulation.metrics;
  const isPwm = parameters.technique === "spwm";
  const hasL = parameters.loadType !== "R";
  const hasE = parameters.loadType === "RLE";
  const shootThroughFault = simulation.fault?.code === "SHOOT_THROUGH";
  const displayWarnings = simulation.warnings.filter((warning) => warning.code !== "SHOOT_THROUGH");

  const update = <K extends keyof InverterParameters>(key: K, value: InverterParameters[K]) =>
    setParameters((current) => ({ ...current, [key]: value }));

  // Build unified scope series conforming to Control Systems theme
  const scopeSeries: ScopeSeries[] = useMemo(() => {
    if (shootThroughFault) return [];
    const samples = simulation.samples;
    const seriesList: ScopeSeries[] = [];

    if (parameters.phase === "three") {
      // 3-Phase: VoA(t) (Red), VoB(t) (Yellow), VoC(t) (Blue), then Io(t) (Pink)
      seriesList.push({
        id: "voa",
        katexName: "V_{oA}(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.outputVoltage })),
        color: "#E11D48",
        strokeWidth: 2.8,
        stepped: true,
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "vob",
        katexName: "V_{oB}(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.vb })),
        color: "#EAB308",
        strokeWidth: 2,
        stepped: true,
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "voc",
        katexName: "V_{oC}(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.vc })),
        color: "#2563EB",
        strokeWidth: 2,
        stepped: true,
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "io",
        katexName: "I_o(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.outputCurrent })),
        color: "#ec4899",
        strokeWidth: 2.6,
        axis: "current",
        unit: "A",
      });
    } else {
      // 1-Phase: Vo(t) (Blue), then Io(t) (Pink)
      seriesList.push({
        id: "vo",
        katexName: "V_o(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.outputVoltage })),
        color: "#2563EB",
        strokeWidth: 2.8,
        stepped: true,
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "io",
        katexName: "I_o(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.outputCurrent })),
        color: "#ec4899",
        strokeWidth: 2.6,
        axis: "current",
        unit: "A",
      });
    }

    // PWM Reference & Carrier if enabled
    if (isPwm && showSignals) {
      seriesList.push({
        id: "ref",
        katexName: "v_{ref}(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.reference })),
        color: "#94a3b8",
        strokeWidth: 1.4,
        dashArray: "4,4",
        axis: "voltage",
        unit: "V",
      });
      seriesList.push({
        id: "car",
        katexName: "v_{tri}(t)",
        data: samples.map((d) => ({ t: d.time * 1000, val: d.carrier })),
        color: "#64748b",
        strokeWidth: 1,
        axis: "voltage",
        unit: "V",
      });
    }

    return seriesList;
  }, [simulation.samples, parameters.phase, isPwm, showSignals, shootThroughFault]);

  // Harmonic spectrum dataset
  const spectrumData = useMemo(() => {
    if (shootThroughFault) return null;
    const harmonics = computeInverterHarmonics(simulation.samples, simulation.period, 25);
    return {
      harmonics,
      fundamentalRms: metrics.voltageFundamentalRms,
      thdPercent: metrics.voltageThd,
    };
  }, [simulation.samples, simulation.period, metrics.voltageFundamentalRms, metrics.voltageThd, shootThroughFault]);

  const topology = (
    <StudioCard
      title={t("power.topologyConfig", "Topology Configuration")}
      actionSlot={<KatexMath math={tex`V_{dc}=${numberTex(parameters.dcVoltage, 0)}\,\mathrm{V}`} className="text-sm text-violet-700 dark:text-violet-300" />}
    >
      <div className="space-y-4">
        <div>
          <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.phase", "Phase")}</span>
          <SegmentedControl
            options={phases}
            value={parameters.phase}
            onChange={(phase) => update("phase", phase)}
            fullWidth
            aria-label={t("power.inverterPhaseAria", "Inverter Phase")}
          />
        </div>
        {parameters.phase === "single" ? (
          <div>
            <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.singlePhaseSubtypeLabel", "1-Φ Sub-Type")}</span>
            <SegmentedControl
              options={singleTopologies}
              value={parameters.singlePhaseSubtype}
              onChange={(singlePhaseSubtype) => update("singlePhaseSubtype", singlePhaseSubtype)}
              fullWidth
              aria-label={t("power.singlePhaseSubtypeLabel", "1-Φ Sub-Type")}
            />
          </div>
        ) : (
          <div>
            <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.threePhaseConductionLabel", "3-Φ Conduction Mode")}</span>
            <SegmentedControl
              options={threeModes}
              value={parameters.threePhaseConduction}
              onChange={(threePhaseConduction) => update("threePhaseConduction", threePhaseConduction)}
              fullWidth
              aria-label={t("power.threePhaseConductionLabel", "3-Φ Conduction Mode")}
            />
          </div>
        )}
      </div>
    </StudioCard>
  );

  const control = (
    <StudioCard title={t("power.controlTechnique", "Control Technique")}>
      <div className="mt-4">
        <SegmentedControl
          options={techniques}
          value={parameters.technique}
          onChange={(technique) => update("technique", technique)}
          fullWidth
          aria-label={t("power.switchingTechniqueAria", "Switching Technique")}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={tex`f_o\,[\mathrm{Hz}]`} value={parameters.fundamentalFrequency} min={1} step={1} setValue={(fundamentalFrequency) => update("fundamentalFrequency", fundamentalFrequency)} />
        {isPwm && <Field label={tex`f_c\,[\mathrm{Hz}]`} value={parameters.carrierFrequency} min={10} step={10} setValue={(carrierFrequency) => update("carrierFrequency", carrierFrequency)} />}
        {isPwm && (
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <KatexMath math="m_a" className="text-xs font-bold text-slate-500 dark:text-slate-400" />
              <KatexMath math={numberTex(parameters.modulationIndex, 2)} className="text-xs text-violet-700 dark:text-violet-300" />
            </div>
            <StudioSlider
              aria-label={t("power.modulationIndexAria", "modulation index")}
              min={0}
              max={1.2}
              step={0.01}
              value={parameters.modulationIndex}
              onChange={(val) => update("modulationIndex", val)}
              showLimits
              minLabel={<KatexMath math="0.0" />}
              maxLabel={<KatexMath math="1.2" />}
            />
          </div>
        )}
      </div>

      <div
        className={`mt-4 rounded-xl border p-3 transition-all ${
          shootThroughFault
            ? "border-rose-200 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
            : "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 text-slate-600 dark:text-slate-300"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <NoticeBadge
                label={t("power.protectionTest", "PROTECTION TEST")}
                tone={shootThroughFault ? "rose" : "slate"}
              />
              <span className="text-xs font-semibold">{t("power.shootThroughCommand", "Same-Leg Shoot-Through Command")}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {t("power.shootThroughDesc", "Toggle the documented shoot-through condition. The solver inhibits output rather than presenting a normal waveform.")}
            </p>
          </div>
          <button
            type="button"
            aria-pressed={Boolean(parameters.shootThroughFault)}
            onClick={() => update("shootThroughFault", !parameters.shootThroughFault)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-[.97] cursor-pointer ${
              shootThroughFault
                ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                : "border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {shootThroughFault ? t("power.clearFault", "Clear Fault") : t("power.triggerFault", "Trigger Fault")}
          </button>
        </div>
      </div>
    </StudioCard>
  );

  const sourceLoad = (
    <StudioCard title={t("power.sourceLoadConfig", "Source & Load Configuration")}>
      <div className="mt-4">
        <Field label={tex`V_{dc}\,[\mathrm{V}]`} value={parameters.dcVoltage} min={1} step={1} setValue={(dcVoltage) => update("dcVoltage", dcVoltage)} />
      </div>

      <div className="mt-4">
        <span className="mb-2 block mae-i18n-text text-xs font-bold text-slate-500 dark:text-slate-400">{t("power.loadSet", "Load Set")}</span>
        <SegmentedControl
          options={loads}
          value={parameters.loadType}
          onChange={(loadType) => update("loadType", loadType)}
          fullWidth
          aria-label={t("power.loadSet", "Load Set")}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label={tex`R\,[\Omega]`} value={parameters.resistance} min={0.05} step={0.1} setValue={(resistance) => update("resistance", resistance)} />
        <Field label={tex`L\,[\mathrm{mH}]`} value={parameters.inductanceMilliHenry} disabled={!hasL} min={0} step={1} setValue={(inductanceMilliHenry) => update("inductanceMilliHenry", inductanceMilliHenry)} />
        <Field label={tex`E\,[\mathrm{V}]`} value={parameters.backEmfVoltage} disabled={!hasE} min={0} step={1} setValue={(backEmfVoltage) => update("backEmfVoltage", backEmfVoltage)} />
      </div>
    </StudioCard>
  );

  const scopeHeaderRight = isPwm ? (
    <SegmentedControl
      size="sm"
      options={[
        { label: t("power.waveformOnly", "Waveform Only"), value: false },
        { label: t("power.pwmCarrier", "PWM Carrier"), value: true },
      ]}
      value={showSignals}
      onChange={setShowSignals}
      aria-label={t("power.pwmCarrierVisibilityAria", "PWM carrier visibility")}
    />
  ) : null;

  const scopeSection = (
    <div className="w-full">
      {shootThroughFault && (
        <StudioAlert
          variant="error"
          badge={t("power.protectionEventBadge", "PROTECTION EVENT · DC LINK LEG")}
          title={t("power.shootThroughFaultTitle", "Shoot-Through Fault Detected")}
          message={t("power.shootThroughFaultMsg", "The inverter output scope is inhibited. Short-circuit current cannot be modeled without a parasitic DC bus impedance.")}
          className="mb-4"
        />
      )}

      <PowerScopePlot
        title={parameters.phase === "three" ? t("power.threePhaseVsiScope", "THREE-PHASE VSI OUTPUT SCOPE") : t("power.singlePhaseVsiScope", "SINGLE-PHASE VSI OUTPUT SCOPE")}
        subtitleLatex={
          parameters.phase === "three"
            ? tex`V_{oA}(t),\ V_{oB}(t),\ V_{oC}(t),\ I_o(t)`
            : tex`V_o(t),\ I_o(t)`
        }
        series={scopeSeries}
        height={530}
        spectrum={spectrumData}
        headerRight={scopeHeaderRight}
      />
    </div>
  );

  const metricsPanel = (
    <section className={`${card} p-4`}>
      <div>
        <h3 className={heading}>{t("power.steadyStateMetrics", "Steady-State Metrics")}</h3>
        <KatexMath math={tex`\mathrm{DFT}\{V_{an},I_o\}_{T}`} className="mt-1 block text-xs text-slate-500 dark:text-slate-400" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={tex`V_{\mathrm{RMS}}`} value={tex`${numberTex(metrics.voltageRms)}\,\mathrm{V}`} />
        <Metric label={tex`V_1`} value={tex`${numberTex(metrics.voltageFundamentalRms)}\,\mathrm{V}`} />
        <Metric label={tex`I_{\mathrm{RMS}}`} value={tex`${numberTex(metrics.currentRms)}\,\mathrm{A}`} />
        <Metric label={tex`I_1`} value={tex`${numberTex(metrics.currentFundamentalRms)}\,\mathrm{A}`} />
        <Metric label={tex`\mathrm{THD}_v`} value={tex`${numberTex(metrics.voltageThd)}\%`} />
        <Metric label={tex`\mathrm{THD}_i`} value={tex`${numberTex(metrics.currentThd)}\%`} />
        <Metric label={tex`\mathrm{DF}`} value={numberTex(metrics.distortionFactor, 3)} />
        <Metric label={tex`\mathrm{HF}`} value={numberTex(metrics.harmonicFactor, 3)} />
        <Metric label="P" value={tex`${numberTex(metrics.activePower)}\,\mathrm{W}`} />
        <Metric label="S" value={tex`${numberTex(metrics.apparentPower)}\,\mathrm{VA}`} />
        <Metric label={tex`\mathrm{PF}`} value={numberTex(metrics.powerFactor, 3)} />
        <Metric label={tex`f_o`} value={tex`${numberTex(metrics.outputFrequency)}\,\mathrm{Hz}`} />
      </div>
    </section>
  );

  return (
    <StudioErrorBoundary studioName={t("power.inverterName", "Inverter")}>
      <div className="space-y-6">
        <PowerWarningAlert warnings={displayWarnings} />
        <div className="grid gap-4 lg:gap-5 lg:grid-cols-2 items-start">
          <aside className="min-w-0 space-y-6">
            {topology}
            {control}
            {sourceLoad}
            {metricsPanel}
          </aside>
          <main className="min-w-0 w-full space-y-6">
            {scopeSection}
            <Circuit parameters={parameters} faulted={shootThroughFault} />
          </main>
        </div>
      </div>
    </StudioErrorBoundary>
  );
}

export default InverterStudio;


// Start the default-parameter solve as soon as this chunk evaluates, in parallel with first render.
prefetchSimulation("inverter", defaultInverterParameters, simulateInverterRemote);

/** Holds the converter parameters; the simulation itself is solved by the serverless engine and streamed back as sample arrays. */
export function InverterStudio() {
  const [parameters, setParameters] = useState<InverterParameters>(defaultInverterParameters);
  return (
    <RemoteSimulationGate namespace="inverter" parameters={parameters} fetcher={simulateInverterRemote}>
      {(simulation) => <InverterStudioBody parameters={parameters} setParameters={setParameters} simulation={simulation} />}
    </RemoteSimulationGate>
  );
}
