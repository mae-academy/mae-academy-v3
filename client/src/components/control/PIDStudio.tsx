/**
 * PID Studio — compact Root Locus-parity control workspace.
 * Layout contract: plant → input/parameters → controller/scope → specs/construction/metrics.
 */
import { useEffect, useMemo, useState } from "react";
import {
  StandardStepPlot,
  SegmentedControl,
  StudioCard,
  InnerBox,
  StudioSlider,
  GradientButton,
  FormulaBox,
  type PlotSeries,
} from "@/components/common/templates";
import { Calculator } from "lucide-react";
import { TransferFunctionInput, TransferFunctionData } from "./TransferFunctionInput";
import { KatexMath } from "../ui/KatexMath";
import { NativeSelect } from "@/components/ui/NativeSelect";
import {
  controllerTransfer,
  defaultControllerSubtype,
  estimatePidFromSpecs,
  getControllerSubtypes,
  inputSignalTransfer,
  PidGains,
  ControllerPrimary,
  ControllerSubtype,
  SignalType,
  simulatePidScope,
} from "@/features/control/pidMath";

type SignalState = { type: SignalType; magnitude: number; parameter: number };
const primaryOptions: ControllerPrimary[] = ["P", "I", "D", "PI", "PD", "PID"];
const signalOptions: Array<{ value: SignalType; label: string }> = [
  { value: "impulse", label: "Impulse" },
  { value: "step", label: "Step" },
  { value: "ramp", label: "Ramp" },
  { value: "parabolic", label: "Parabolic" },
  { value: "exponential", label: "Exponential" },
  { value: "sine", label: "Sinusoidal (Sine)" },
  { value: "cosine", label: "Sinusoidal (Cosine)" },
];
const subtypeLabels: Record<ControllerSubtype, string> = {
  parallel: "Parallel",
  series: "Series",
  "parallel-standard": "Parallel Standard",
  "parallel-modified": "Parallel Modified",
  "series-standard": "Series Standard",
  "series-modified": "Series Modified",
};
const field =
  "h-10 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-slate-800 text-lg tracking-wide dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0";

function MathLabel({ math }: { math: string }) {
  return <KatexMath math={math} className="text-xs font-bold text-slate-500 dark:text-slate-400 normal-case lowercase" />;
}

function compactNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function timeDomainLatex(signal: SignalState) {
  const ampVal = signal.magnitude;
  const ampStr = compactNumber(ampVal);
  const prefix = ampVal === 1 ? "" : `${ampStr}`;
  const parameter = compactNumber(signal.parameter);
  if (signal.type === "impulse") return ampVal === 1 ? "r(t) = \\delta(t)" : `r(t) = ${prefix}\\delta(t)`;
  if (signal.type === "step") return ampVal === 1 ? "r(t) = u(t)" : `r(t) = ${prefix}u(t)`;
  if (signal.type === "ramp") return ampVal === 1 ? "r(t) = t\\,u(t)" : `r(t) = ${prefix}t\\,u(t)`;
  if (signal.type === "parabolic") return ampVal === 1 ? "r(t) = t^2\\,u(t)" : `r(t) = ${prefix}t^2\\,u(t)`;
  if (signal.type === "exponential") return ampVal === 1 ? `r(t) = e^{-${parameter}t}u(t)` : `r(t) = ${prefix}e^{-${parameter}t}u(t)`;
  if (signal.type === "sine") return ampVal === 1 ? `r(t) = \\sin(${parameter}t)u(t)` : `r(t) = ${prefix}\\sin(${parameter}t)u(t)`;
  return ampVal === 1 ? `r(t) = \\cos(${parameter}t)u(t)` : `r(t) = ${prefix}\\cos(${parameter}t)u(t)`;
}

// دالة حماية لضمان تحويل أي معادلة ترجع من الدوال إلى lowercase تماماً
function forceLowercaseMath(latex: string) {
  return latex
    .replace(/\bS\b/g, "s")
    .replace(/\bT\b/g, "t")
    .replace(/\\text\{S\}/g, "\\text{s}")
    .replace(/\\text\{T\}/g, "\\text{t}");
}

function GainControl({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [limitMin, setLimitMin] = useState(min);
  const [limitMax, setLimitMax] = useState(max);

  useEffect(() => {
    setLimitMin(min);
  }, [min]);

  useEffect(() => {
    setLimitMax(max);
  }, [max]);

  return (
    <StudioSlider
      label={<KatexMath math={label} />}
      value={value}
      onChange={onChange}
      min={limitMin}
      max={limitMax}
      step={step}
      editableLimits
      onMinChange={(v) => {
        if (v < limitMax) setLimitMin(v);
      }}
      onMaxChange={(v) => {
        if (v > limitMin) setLimitMax(v);
      }}
      editableValue
      precision={4}
    />
  );
}

export function PIDStudio() {
  const [plant, setPlant] = useState<TransferFunctionData>({
    mode: "polynomial",
    numPoly: [1, 2],
    denPoly: [1, 3, 2, 0],
    zpk: { k: 1, z: "-2", p: "0, -1, -2" },
    polyStr: { num: "1 2", den: "1 3 2 0" },
  });
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
  const scope = useMemo(
    () => simulatePidScope(controller, plant.numPoly, plant.denPoly, signal, maxTime),
    [controller, plant, signal, maxTime]
  );

  const stepPlotSeries: PlotSeries[] = useMemo(() => {
    const rData = scope.t.map((time, index) => ({ x: time, y: scope.r[index] }));
    const yData = scope.t.map((time, index) => ({ x: time, y: scope.y[index] }));
    const eData = scope.t.map((time, index) => ({ x: time, y: scope.r[index] - scope.y[index] }));
    return [
      {
        id: "r",
        katexName: "r(t)",
        data: rData,
        color: "#7C3AED",
        dashArray: "4,4",
        strokeWidth: 1.5,
      },
      {
        id: "y",
        katexName: "y(t)",
        data: yData,
        color: "#2563EB",
        strokeWidth: 2.5,
      },
      {
        id: "e",
        katexName: "e(t)",
        data: eData,
        color: "#E11D48",
        dashArray: "4,3",
        strokeWidth: 1.75,
      },
    ];
  }, [scope]);

  const subtypes = getControllerSubtypes(primary);
  const showKp = primary !== "I" && primary !== "D";
  const showKi = primary === "I" || primary === "PI" || primary === "PID";
  const showKd = primary === "D" || primary === "PD" || primary === "PID";
  const showN = subtype === "parallel-modified" || subtype === "series-modified";
  const usesParameter = signal.type === "exponential" || signal.type === "sine" || signal.type === "cosine";
  const parameterLabel = signal.type === "exponential" ? "a" : "\\omega";

  // Formulas formatted: r(t) and r(s) completely lowercase, only G is uppercase in G_c(s)
  const formattedRTime = timeDomainLatex(signal);
  const formattedRS = `r(s) = ${forceLowercaseMath(inputTransfer.latex)}`;
  const formattedGc = `G_c(s) = ${forceLowercaseMath(controller.latex)}`;

  const unifiedControlPanel = (
    <StudioCard
      title={
        <div className="w-full">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white block">
            Controller & Input Parameters
          </span>
          <div className="mt-2 flex flex-wrap gap-4 text-xs sm:text-sm text-violet-700 dark:text-violet-300 normal-case font-normal select-none">
            <KatexMath math={formattedRTime} className="normal-case" />
            <KatexMath math={formattedRS} className="normal-case" />
            <KatexMath math={formattedGc} className="normal-case" />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* 1. System Input */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            System Input
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block">
                <KatexMath math="r(t)" className="text-xs font-bold text-slate-500 dark:text-slate-400 normal-case" />
              </label>
              <NativeSelect
                value={signal.type}
                className="h-10 text-sm font-sans"
                onChange={(event) =>
                  setSignal((current: SignalState) => ({ ...current, type: event.target.value as SignalType }))
                }
              >
                {signalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label className="mb-1 block">
                <MathLabel math="A" />
              </label>
              <input
                type="number"
                step="any"
                value={signal.magnitude}
                onChange={(event) =>
                  setSignal((current: SignalState) => ({ ...current, magnitude: Number(event.target.value) }))
                }
                style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                className={field}
              />
            </div>
            {usesParameter && (
              <div className="sm:col-span-2">
                <label className="mb-1 block">
                  <MathLabel math={parameterLabel} />
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={signal.parameter}
                  onChange={(event) =>
                    setSignal((current: SignalState) => ({ ...current, parameter: Number(event.target.value) }))
                  }
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className={field}
                />
              </div>
            )}
          </div>
        </div>

        {/* Section Divider */}
        <div className="border-b border-slate-200 dark:border-slate-800" />

        {/* 2. Controller Architecture */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Controller Architecture
          </h4>
          <div>
            <SegmentedControl
              value={primary}
              onChange={(val) => {
                const nextPrimary = val as ControllerPrimary;
                setPrimary(nextPrimary);
                const subs = getControllerSubtypes(nextPrimary);
                if (subs.length > 0 && !subs.includes(subtype)) {
                  setSubtype(subs[0]);
                }
              }}
              options={primaryOptions.map((option) => ({ value: option, label: option }))}
            />
          </div>
          {subtypes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Controller Form</p>
              <SegmentedControl
                value={subtype}
                onChange={(val) => setSubtype(val as ControllerSubtype)}
                options={subtypes.map((option) => ({ value: option, label: subtypeLabels[option] }))}
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Section Divider */}
        <div className="border-b border-slate-200 dark:border-slate-800" />

        {/* 3. Tuning Parameters */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tuning Parameters
          </h4>
          <InnerBox className="space-y-3">
            {showKp && (
              <GainControl
                label="K_p"
                value={gains.kp}
                onChange={(kp) => setGains((current: PidGains) => ({ ...current, kp }))}
              />
            )}
            {showKi && (
              <GainControl
                label="K_i"
                value={gains.ki}
                onChange={(ki) => setGains((current: PidGains) => ({ ...current, ki }))}
              />
            )}
            {showKd && (
              <GainControl
                label="K_d"
                value={gains.kd}
                onChange={(kd) => setGains((current: PidGains) => ({ ...current, kd }))}
              />
            )}
            {showN && (
              <GainControl
                label="N"
                value={gains.n}
                min={1}
                max={500}
                step={1}
                onChange={(n) => setGains((current: PidGains) => ({ ...current, n }))}
              />
            )}
          </InnerBox>
        </div>
      </div>
    </StudioCard>
  );

  const scopePanel = (
    <StudioCard
      title="INTERACTIVE SCOPE"
      className="h-full flex flex-col"
      actionSlot={
        <div className="flex items-center gap-2">
          <MathLabel math="t_{max}" />
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            value={maxTime}
            onChange={(event) => setMaxTime(Math.max(1, Number(event.target.value)))}
            style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
            className="h-8 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right text-slate-800 text-lg tracking-wide focus:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
          />
        </div>
      }
    >
      <div className="mb-3">
        <KatexMath
          math={`Y(s) = ${forceLowercaseMath(scope.output.latex)}`}
          className="text-xs text-slate-500 dark:text-slate-400 normal-case"
        />
      </div>
      <div className="flex-1 w-full min-h-[500px]">
        <StandardStepPlot
          series={stepPlotSeries}
          height="100%"
          className="min-h-[500px]"
          xLabelKatex="t \text{ (s)}"
          yLabelKatex="y(t)"
          steadyStateValue={scope.y[scope.y.length - 1]}
          showSteadyState={true}
        />
      </div>
    </StudioCard>
  );

  const specsPanel = (
    <StudioCard title="Design by Specs">
      <div className="space-y-3">
        <FormulaBox>
          <KatexMath
            math={`s^2 + 2(${zeta.toFixed(3)})(${omegaN.toFixed(3)})s + ${omegaN.toFixed(3)}^2 = 0`}
            displayMode
            className="block overflow-x-auto text-center text-slate-800 dark:text-white"
          />
        </FormulaBox>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block">
              <MathLabel math="\zeta" />
            </label>
            <input
              type="number"
              min="0.01"
              max="2"
              step="0.01"
              value={zeta}
              onChange={(event) => setZeta(Number(event.target.value))}
              style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block">
              <MathLabel math="\omega_{n}" />
            </label>
            <input
              type="number"
              min="0.01"
              step="0.1"
              value={omegaN}
              onChange={(event) => setOmegaN(Number(event.target.value))}
              style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
              className={field}
            />
          </div>
        </div>
        <GradientButton
          onClick={() => {
            setPrimary("PID");
            setSubtype("parallel-standard");
            setGains(estimatePidFromSpecs(plant.numPoly, plant.denPoly, zeta, omegaN));
          }}
          className="inline-flex items-center gap-2"
        >
          <Calculator className="h-4 w-4" />
          Calculate PID
        </GradientButton>
      </div>
    </StudioCard>
  );

  const constructionPanel = (
    <StudioCard title="Closed-Loop Construction">
      <div className="space-y-3 text-sm">
        <FormulaBox>
          <KatexMath
            math={`G_{open}(s) = ${forceLowercaseMath(scope.openLoop.latex)}`}
            displayMode
            className="block overflow-x-auto text-slate-800 dark:text-white"
          />
        </FormulaBox>
        <FormulaBox>
          <KatexMath
            math={`T(s) = ${forceLowercaseMath(scope.closedLoop.latex)}`}
            displayMode
            className="block overflow-x-auto text-slate-800 dark:text-white"
          />
        </FormulaBox>
      </div>
    </StudioCard>
  );

  const metricsPanel = (
    <StudioCard title="Transient Metrics">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <div className="flex items-center justify-between py-3">
          <MathLabel math="M_p" />
          <KatexMath
            math={`${scope.overshoot.toFixed(2)}\\%`}
            className="text-sm font-bold text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center justify-between py-3">
          <MathLabel math="T_p" />
          <KatexMath
            math={`${scope.peakTime.toFixed(3)}\\,\\text{s}`}
            className="text-sm font-bold text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center justify-between py-3">
          <MathLabel math="T_s" />
          <KatexMath
            math={`${scope.settlingTime.toFixed(3)}\\,\\text{s}`}
            className="text-sm font-bold text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center justify-between py-3">
          <MathLabel math="e_{ss}" />
          <KatexMath
            math={`${scope.steadyStateError.toFixed(4)}`}
            className="text-sm font-bold text-slate-900 dark:text-white"
          />
        </div>
      </div>
    </StudioCard>
  );

  return (
    <div className="space-y-6">
      <TransferFunctionInput onUpdate={setPlant} defaultData={plant} gainK={1} />
      {/* تقسيم الشاشة بنسبة 40% إلى 60% مع منع الـ overflow */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        <div className="w-full lg:w-[40%] flex-shrink-0">
          {unifiedControlPanel}
        </div>
        <div className="w-full lg:w-[60%] flex-1">
          {scopePanel}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {specsPanel}
        {constructionPanel}
        {metricsPanel}
      </div>
    </div>
  );
}