import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { KatexMath } from "@/components/ui/KatexMath";
import {
  formatEngineering,
  type FactorSlopeEvent,
  type FrequencyFactor,
  type FrequencyPoint,
  type StabilityMargins,
} from "@shared/control/frequencyTypes";
import { bodeRemote } from "@/services/controlClient";
import { useRemoteQuery } from "@/lib/useRemoteQuery";
import type { StepResponseData } from "@shared/control/stepTypes";
import { SegmentedControl, StandardStepPlot, StudioCard, InnerBox, StudioSlider, MathNumberInput } from "@/components/common/templates";
import {
  BodePlot,
  NyquistPlot,
  NicholsPlot,
} from "@/features/control-systems/ui/plots";
import { TransferFunctionInput, type TransferFunctionData } from "./TransferFunctionInput";

const EMPTY_FACTORS: FrequencyFactor[] = [];
const EMPTY_RESPONSE: FrequencyPoint[] = [];
const EMPTY_MARGINS: StabilityMargins = {};
const EMPTY_SLOPES = { initialSlopeDbPerDecade: 0, events: [] as FactorSlopeEvent[] };
const EMPTY_STEP = { t: [], y: [], sp: [], error: [], overshootPercent: 0, peakTime: 0, settlingTime: 0, riseTime: 0, delayTime: 0, steadyStateError: 0, termination: "complete" } satisfies StepResponseData;

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
  const { t } = useTranslation('simulators');
  const [tfData, setTfData] = useState<TransferFunctionData>(INITIAL_TF);
  const [gain, setGain] = useState(1);
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
  // Factor decomposition, Bode / Nyquist / Nichols data, margins, slope events and the closed-loop step response are computed
  // by the serverless engine; the last answer stays plotted while a newer one loads.
  const bodeQuery = useRemoteQuery(
    `bode|${tfData.numPoly.join(",")}|${tfData.denPoly.join(",")}|${gain}|${selectedFactorIds.join(",")}|${timeHorizon}`,
    (signal) => bodeRemote(tfData.numPoly, tfData.denPoly, gain, selectedFactorIds, Math.min(200, timeHorizon), 360, signal),
    { debounceMs: 40 },
  );
  const bode = bodeQuery.error ? null : bodeQuery.data;
  const factors: FrequencyFactor[] = bode?.factors ?? EMPTY_FACTORS;
  const factorIdsKey = factors.map((factor) => factor.id).join("|");

  useEffect(() => {
    setSelectedFactorIds((previous) => {
      const supported = previous.filter((id) => factorIdsKey.split("|").includes(id));
      return previous.length === 0 ? (factorIdsKey ? factorIdsKey.split("|") : previous) : supported.length === previous.length ? previous : supported;
    });
  }, [factorIdsKey]);

  const response: FrequencyPoint[] = bode?.response ?? EMPTY_RESPONSE;
  const margins: StabilityMargins = bode?.margins ?? EMPTY_MARGINS;
  const slopeLogic = bode?.slopeLogic ?? EMPTY_SLOPES;
  const stepResponse = bode?.stepResponse ?? EMPTY_STEP;

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

      {/* Main Plot Section */}
      <section className="w-full space-y-4">
        <div>
          <SegmentedControl
            value={primaryView}
            onChange={(val) => setPrimaryView(val as PrimaryView)}
            options={[
              { value: "bode", label: t('control.bode', 'Bode') },
              { value: "nyquist", label: t('control.nyquist', 'Nyquist') },
              { value: "nichols", label: t('control.nichols', 'Nichols') },
            ]}
          />
        </div>

        {primaryView === "bode" && <BodePlot data={response} margins={margins} />}
        {primaryView === "nyquist" && <NyquistPlot data={response} height={560} />}
        {primaryView === "nichols" && <NicholsPlot data={nicholsData} height={560} />}
      </section>

      {/* Row A: Gain Compensation Panel + Step Response Scope */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Compact Control Panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col">
          <StudioCard title={t('control.liveGainCompensation', 'Live Gain Compensation')} className="h-full flex flex-col justify-between">
            <div className="space-y-5">
              <StudioSlider
                label={<span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t('control.gainCompensation', 'Gain Compensation')}</span>}
                mathLabel={<KatexMath math="K" />}
                min={0.01}
                max={10}
                step={0.01}
                value={gain}
                onChange={(newK) => setGain(newK)}
                editableLimits
                editableValue
              />
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <InnerBox className="min-w-0 px-3 py-2.5">
                  <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">PM</span>
                  <div className="mt-1 overflow-x-auto text-sm font-semibold text-slate-950 dark:text-white">
                    {margins.gainCrossover ? (
                      <KatexMath math={`\\text{PM} = ${margins.gainCrossover.phaseMarginDeg.toFixed(1)}^\\circ`} />
                    ) : (
                      <span className="text-slate-400 font-mono text-xs font-medium">N/A</span>
                    )}
                  </div>
                </InnerBox>
                <InnerBox className="min-w-0 px-3 py-2.5">
                  <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">GM</span>
                  <div className="mt-1 overflow-x-auto text-sm font-semibold text-slate-950 dark:text-white">
                    {margins.phaseCrossover !== undefined && Number.isFinite(margins.phaseCrossover.gainMarginDb) ? (
                      <KatexMath math={`${margins.phaseCrossover.gainMarginDb.toFixed(1)}\\text{ dB}`} />
                    ) : (
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">N/A</span>
                    )}
                  </div>
                </InnerBox>
              </div>
            </div>
          </StudioCard>
        </div>

        {/* Right Column: Step Response Scope */}
        <div className="col-span-12 lg:col-span-8 min-w-0 flex flex-col">
          <StandardStepPlot
            title={t('control.closedLoopStepResponse', 'Closed-Loop Step Response')}
            xLabelKatex="t \text{ (s)}"
            yLabelKatex="y(t)"
            height={320}
            className="!bg-white/70 dark:!bg-slate-900/70 border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-sm p-3.5 sm:p-4 lg:p-5"
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
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-serif">
                  <KatexMath math="t_{\max}" />
                </span>
                <MathNumberInput
                  value={timeHorizon}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val > 0) setTimeHorizon(val);
                  }}
                  min={1}
                  max={100}
                  step={1}
                  className="w-12 h-7"
                />
                <span className="text-xs text-slate-500 font-serif">s</span>
              </div>
            }
          />
        </div>
      </div>

      {/* Row B: Time-Domain Correlation + Sketch Tutor in a Single Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Time-Domain Correlation */}
        <div className="col-span-12 lg:col-span-5 flex flex-col">
          <StudioCard title={t('control.timeDomainCorrelation', 'Time-Domain Correlation')} className="h-full flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-2.5 h-full content-between">
              <MetricTile label="M_p" value={`${formatEngineering(stepResponse.overshootPercent)}\\%`} />
              <MetricTile label="t_r" value={`${formatEngineering(stepResponse.riseTime)}\\,\\mathrm{s}`} />
              <MetricTile label="t_s" value={`${formatEngineering(stepResponse.settlingTime)}\\,\\mathrm{s}`} />
              <MetricTile label="e_{ss}" value={formatEngineering(stepResponse.steadyStateError)} />
            </div>
          </StudioCard>
        </div>

        {/* Right Column: Step-by-Step Sketch Tutor */}
        <div className="col-span-12 lg:col-span-7 flex flex-col">
          <SketchTutorial
            dcGain={dcGain}
            factors={factors.filter((factor) => selectedFactorIds.includes(factor.id))}
            initialSlope={slopeLogic.initialSlopeDbPerDecade}
            events={slopeLogic.events}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <InnerBox className="min-w-0 px-3.5 py-3 flex flex-col justify-center">
      <KatexMath math={label} className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400" />
      <KatexMath math={value} className="mt-1.5 block overflow-x-auto text-base font-semibold text-slate-950 dark:text-white" />
    </InnerBox>
  );
}

function SketchTutorial({
  dcGain,
  factors,
  initialSlope,
  events,
  className,
}: {
  dcGain: string;
  factors: FrequencyFactor[];
  initialSlope: number;
  events: Array<{ omega: number; deltaDbPerDecade: number; label: string }>;
  className?: string;
}) {
  const { t } = useTranslation('simulators');
  let runningSlope = initialSlope;
  return (
    <StudioCard title={t('control.sketchTutor', 'Step-by-Step Sketch Tutor')} className={className}>
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
