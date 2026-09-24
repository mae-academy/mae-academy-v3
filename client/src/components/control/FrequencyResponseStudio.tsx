import React, { useEffect, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { simulateLtiStepResponse } from "@/features/control/controlMath";
import {
  buildFrequencyFactors,
  computeFrequencyResponse,
  extractStabilityMargins,
  factorSlopeEvents,
  formatEngineering,
  logspace,
  type FrequencyFactor,
} from "@/features/control/frequencyResponseMath";
import { SegmentedControl, StandardStepPlot, StudioCard, InnerBox, StudioSlider } from "@/components/common/templates";
import {
  BodePlot,
  NyquistPlot,
  NicholsPlot,
} from "@/features/control-systems/ui/plots";
import { TransferFunctionInput, type TransferFunctionData } from "./TransferFunctionInput";

type PrimaryView = "bode" | "nyquist" | "nichols";

const INITIAL_TF: TransferFunctionData = {
  mode: "polynomial",
  numPoly: [1],
  denPoly: [1, 1.2, 1],
  zpk: { k: 1, z: "", p: "-0.6+0.8j, -0.6-0.8j" },
  polyStr: { num: "1", den: "1 1.2 1" },
};

function matchDegrees(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  return {
    left: [...Array(length - left.length).fill(0), ...left],
    right: [...Array(length - right.length).fill(0), ...right],
  };
}


function makeClosedLoop(numPoly: number[], denPoly: number[], gain: number) {
  const numerator = numPoly.map((coefficient) => coefficient * gain);
  const { left: denominatorAligned, right: numeratorAligned } = matchDegrees(denPoly, numerator);
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

export function FrequencyResponseStudio() {
  const [tfData, setTfData] = useState<TransferFunctionData>(INITIAL_TF);
  const [gain, setGain] = useState(1);
  const [gainMin, setGainMin] = useState(0.05);
  const [gainMax, setGainMax] = useState(20);
  const [selectedFactorIds, setSelectedFactorIds] = useState<string[]>([]);
  const [primaryView, setPrimaryView] = useState<PrimaryView>("bode");
  const [timeHorizon, setTimeHorizon] = useState(12);

  const openLoop = useMemo(
    () => ({
      numerator: tfData.numPoly.map((coefficient) => coefficient * gain),
      denominator: tfData.denPoly,
    }),
    [gain, tfData.denPoly, tfData.numPoly]
  );
  const factors = useMemo(
    () => buildFrequencyFactors(openLoop.numerator, openLoop.denominator),
    [openLoop.denominator, openLoop.numerator]
  );

  useEffect(() => {
    setSelectedFactorIds((previous) => {
      const supported = previous.filter((id) => factors.some((factor) => factor.id === id));
      return previous.length === 0 ? factors.map((factor) => factor.id) : supported;
    });
  }, [factors]);

  const response = useMemo(
    () => computeFrequencyResponse(factors, selectedFactorIds, logspace(-2, 4, 360)),
    [factors, selectedFactorIds]
  );
  const margins = useMemo(() => extractStabilityMargins(response), [response]);
  const slopeLogic = useMemo(
    () => factorSlopeEvents(factors.filter((factor) => selectedFactorIds.includes(factor.id))),
    [factors, selectedFactorIds]
  );
  const closedLoop = useMemo(
    () => makeClosedLoop(tfData.numPoly, tfData.denPoly, gain),
    [gain, tfData.denPoly, tfData.numPoly]
  );
  const stepResponse = useMemo(
    () => simulateLtiStepResponse(closedLoop.numerator, closedLoop.denominator, 1, timeHorizon, Math.min(0.02, timeHorizon / 700)),
    [closedLoop.denominator, closedLoop.numerator, timeHorizon]
  );

  const nicholsData = useMemo(
    () =>
      response.map((point) => ({
        phase: point.phaseUnwrappedDeg,
        magnitude: point.magnitudeDb,
        omega: point.omega,
      })),
    [response]
  );

  const dcGain = algebraicDcGain(openLoop.numerator, openLoop.denominator);


  return (
    <div className="space-y-6">
      <TransferFunctionInput onUpdate={setTfData} defaultData={tfData} gainK={gain} />

      {/* Live Gain Compensation */}
      <StudioCard
        title="Live Gain Compensation"
        className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"
      >
        <div className="min-w-0">
          <StudioSlider
            label={<KatexMath math="K =" />}
            min={gainMin}
            max={gainMax}
            step={(gainMax - gainMin) / 1000}
            value={gain}
            onChange={setGain}
            editableLimits
            onMinChange={(v) => { if (v >= 0 && v < gainMax) setGainMin(v); }}
            onMaxChange={(v) => { if (v > gainMin) setGainMax(v); }}
            editableValue
            precision={4}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricTile
            label="\mathrm{PM}"
            value={margins.gainCrossover ? `${formatEngineering(margins.gainCrossover.phaseMarginDeg)}^\circ` : "\\mathrm{N/A}"}
          />
          <MetricTile
            label="\mathrm{GM}"
            value={margins.phaseCrossover ? `${formatEngineering(margins.phaseCrossover.gainMarginDb)}\\,\\mathrm{dB}` : "\\mathrm{N/A}"}
          />
        </div>
      </StudioCard>

      {/* Main Plot Section */}
      <section className="w-full space-y-4">
        <div>
          <SegmentedControl
            value={primaryView}
            onChange={(val) => setPrimaryView(val as PrimaryView)}
            options={[
              { value: "bode", label: "Bode" },
              { value: "nyquist", label: "Nyquist" },
              { value: "nichols", label: "Nichols" },
            ]}
          />
        </div>

        {primaryView === "bode" && <BodePlot data={response} margins={margins} />}
        {primaryView === "nyquist" && <NyquistPlot data={response} height={560} />}
        {primaryView === "nichols" && <NicholsPlot data={nicholsData} height={560} />}
      </section>

      {/* Closed-Loop Step Response & Time-Domain Metrics */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <StandardStepPlot
            title="Closed-Loop Step Response"
            xLabelKatex="t \text{ (s)}"
            yLabelKatex="y(t)"
            height={320}
            showSteadyState={true}
            steadyStateValue={1}
            series={[
              {
                id: "reference",
                katexName: "r(t)",
                color: "#8B5CF6",
                strokeWidth: 1.5,
                dashArray: "5,4",
                data: stepResponse.t.map((t, i) => ({ x: t, y: stepResponse.sp[i] })),
              },
              {
                id: "output",
                katexName: "y(t)",
                color: "#2563EB",
                strokeWidth: 2.5,
                data: stepResponse.t.map((t, i) => ({ x: t, y: stepResponse.y[i] })),
              },
            ]}
            headerRight={
              <div className="w-52">
                <StudioSlider
                  label={<KatexMath math="t_{max}" />}
                  min={3}
                  max={30}
                  step={1}
                  unit=" s"
                  value={timeHorizon}
                  onChange={setTimeHorizon}
                  aria-label="Step response time horizon"
                />
              </div>
            }
          />
        </div>

        {/* Time-Domain Correlation */}
        <StudioCard title="Time-Domain Correlation">
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="M_p" value={`${formatEngineering(stepResponse.overshootPercent)}\\%`} />
            <MetricTile label="t_r" value={`${formatEngineering(stepResponse.riseTime)}\\,\\mathrm{s}`} />
            <MetricTile label="t_s" value={`${formatEngineering(stepResponse.settlingTime)}\\,\\mathrm{s}`} />
            <MetricTile label="e_{ss}" value={formatEngineering(stepResponse.steadyStateError)} />
          </div>
        </StudioCard>
      </section>

      {/* Step-by-Step Sketch Tutor */}
      <SketchTutorial
        dcGain={dcGain}
        factors={factors.filter((factor) => selectedFactorIds.includes(factor.id))}
        initialSlope={slopeLogic.initialSlopeDbPerDecade}
        events={slopeLogic.events}
      />
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <InnerBox className="min-w-0 px-3 py-2.5">
      <KatexMath math={label} className="block text-[10px] text-slate-500 dark:text-slate-400" />
      <KatexMath math={value} className="mt-1 block overflow-x-auto text-sm text-slate-950 dark:text-white" />
    </InnerBox>
  );
}

function SketchTutorial({
  dcGain,
  factors,
  initialSlope,
  events,
}: {
  dcGain: string;
  factors: FrequencyFactor[];
  initialSlope: number;
  events: Array<{ omega: number; deltaDbPerDecade: number; label: string }>;
}) {
  let runningSlope = initialSlope;
  return (
    <StudioCard title="Step-by-Step Sketch Tutor">
      <div className="grid divide-y divide-slate-100 dark:divide-slate-800 xl:grid-cols-3 xl:divide-x xl:divide-y-0">
        <TutorialStep title="\mathrm{Anchor\ the\ DC\ gain}">
          <KatexMath math={`K_{DC}=${dcGain}`} displayMode className="text-lg text-violet-700 dark:text-violet-300" />
        </TutorialStep>
        <TutorialStep title="\mathrm{Order\ the\ corners}">
          {events.length ? (
            <ol className="space-y-2">
              {events.map((event, index) => (
                <li key={`${event.omega}-${event.label}-${index}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <KatexMath
                    math={`\\omega_c=${formatEngineering(event.omega)}\\,\\mathrm{rad/s}\\quad (${event.label})`}
                    className="text-xs text-slate-700 dark:text-slate-200"
                  />
                </li>
              ))}
            </ol>
          ) : (
            <KatexMath math="\mathrm{No\ finite\ corner\ frequencies}" className="text-xs text-slate-500 dark:text-slate-400" />
          )}
        </TutorialStep>
        <TutorialStep title="\mathrm{Trace\ the\ slope\ logic}">
          <KatexMath
            math={`\\mathrm{Start:}\\quad ${formatEngineering(initialSlope)}\\,\\mathrm{dB/dec}`}
            className="text-xs text-slate-700 dark:text-slate-200"
          />
          {events.map((event, index) => {
            runningSlope += event.deltaDbPerDecade;
            return (
              <KatexMath
                key={`${event.omega}-${event.deltaDbPerDecade}-${index}`}
                math={`\\omega=${formatEngineering(event.omega)}:\\quad ${
                  event.deltaDbPerDecade > 0 ? "+" : ""
                }${formatEngineering(event.deltaDbPerDecade)}\\Rightarrow ${formatEngineering(runningSlope)}\\,\\mathrm{dB/dec}`}
                className="mt-2 block text-xs text-slate-700 dark:text-slate-200"
              />
            );
          })}
        </TutorialStep>
      </div>
    </StudioCard>
  );
}

function TutorialStep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="min-h-40 p-4">
      <KatexMath math={title} className="text-sm font-bold text-slate-950 dark:text-white" />
      <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{children}</div>
    </article>
  );
}
