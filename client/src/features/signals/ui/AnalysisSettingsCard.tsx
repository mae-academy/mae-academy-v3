import { useState } from "react";
import { cn } from "@/lib/utils";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StudioSlider, InnerBox } from "@/components/common/templates";
import { N_MAX, PERIOD_BOUNDS, type TimeWindow, type WindowPreset } from "@/components/signals/fourierWindow";

function number(value: number, digits = 4) { return Number(value.toFixed(digits)).toString(); }

/** Hard range of the aperiodic time scale a. */
const SCALE_BOUNDS = { min: 0.1, max: 2 } as const;

const WINDOW_OPTIONS: ReadonlyArray<{ value: WindowPreset; label: string }> = [
  { value: "one", label: "1 Period" },
  { value: "two", label: "2 Periods" },
];

export type AnalysisSettingsCardProps = {
  freqMode: boolean;
  mode: "fs" | "ft";

  // FS mode
  fundamentalPeriod: number;
  periodLimits: { min: number; max: number };
  applyPeriod: (val: number) => void;
  setPeriodLimits: React.Dispatch<React.SetStateAction<{ min: number; max: number }>>;
  numHarmonics: number;
  harmonicLimits: { min: number; max: number };
  applyHarmonics: (val: number) => void;
  setHarmonicLimits: React.Dispatch<React.SetStateAction<{ min: number; max: number }>>;
  windowPreset: WindowPreset;
  selectWindowPreset: (preset: WindowPreset) => void;
  timeWindow: TimeWindow;

  // FT mode
  scale: number;
  setScale: (val: number) => void;
};

export function AnalysisSettingsCard({
  freqMode,
  mode,
  fundamentalPeriod,
  periodLimits,
  applyPeriod,
  setPeriodLimits,
  numHarmonics,
  harmonicLimits,
  applyHarmonics,
  setHarmonicLimits,
  windowPreset,
  selectWindowPreset,
  timeWindow,
  scale,
  setScale,
}: AnalysisSettingsCardProps) {
  const [scaleLimits, setScaleLimits] = useState<{ min: number; max: number }>({ min: SCALE_BOUNDS.min, max: SCALE_BOUNDS.max });

  return (
    <InnerBox className={cn("flex flex-col", mode === "fs" && !freqMode && "flex-1 justify-between pb-6")}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
        ANALYSIS SETTINGS
      </h3>
      {freqMode ? (
        <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Magnitude and phase are evaluated directly from <KatexMath math="X(j\omega)" />; the time trace is the synthesized{" "}
          <KatexMath math="x(t)" />. All axes auto-scale to the spectrum's bandwidth.
        </p>
      ) : mode === "fs" ? (
        <>
          <StudioSlider
            className="mt-4"
            label="Fundamental period"
            mathLabel={<KatexMath math="T_0\ (\text{s})" />}
            min={periodLimits.min}
            max={periodLimits.max}
            step={0.01}
            value={fundamentalPeriod}
            onChange={applyPeriod}
            editableLimits
            onMinChange={(v) => {
              if (v >= PERIOD_BOUNDS.min && v < periodLimits.max) {
                setPeriodLimits((l) => ({ ...l, min: v }));
                if (fundamentalPeriod < v) applyPeriod(v);
              }
            }}
            onMaxChange={(v) => {
              if (v <= PERIOD_BOUNDS.max && v > periodLimits.min) {
                setPeriodLimits((l) => ({ ...l, max: v }));
                if (fundamentalPeriod > v) applyPeriod(v);
              }
            }}
            editableValue
            precision={3}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            <KatexMath math={`\\omega_0 = \\tfrac{2\\pi}{T_0} = ${number((2 * Math.PI) / fundamentalPeriod, 4)}\\ \\text{rad/s}`} />
            <KatexMath math={`f_0 = \\tfrac{1}{T_0} = ${number(1 / fundamentalPeriod, 4)}\\ \\text{Hz}`} />
          </div>
          <StudioSlider
            className="mt-5"
            label="Number of harmonics"
            variant="spectral"
            min={harmonicLimits.min}
            max={harmonicLimits.max}
            step={1}
            value={numHarmonics}
            onChange={applyHarmonics}
            editableLimits
            onMinChange={(v) => {
              const m = Math.round(v);
              if (m >= 1 && m < harmonicLimits.max) {
                setHarmonicLimits((l) => ({ ...l, min: m }));
                if (numHarmonics < m) applyHarmonics(m);
              }
            }}
            onMaxChange={(v) => {
              const m = Math.round(v);
              if (m <= N_MAX && m > harmonicLimits.min) {
                setHarmonicLimits((l) => ({ ...l, max: m }));
                if (numHarmonics > m) applyHarmonics(m);
              }
            }}
            valueDisplay={
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                <KatexMath math={`N = ${numHarmonics}`} />
              </span>
            }
          />
          <div className="mt-5 grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Observation window</span>
              <SegmentedControl<WindowPreset>
                options={WINDOW_OPTIONS}
                value={windowPreset}
                onChange={selectWindowPreset}
                size="sm"
                aria-label="Observation window preset"
              />
            </div>
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
              <KatexMath math={`t \\in [${number(timeWindow.start, 3)},\\ ${number(timeWindow.end, 3)}]\\ \\text{s} = ${windowPreset === "one" ? "1" : "2"}\\,T_0`} />
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            The partial sum redraws as <KatexMath math="N" /> changes; Gibbs overshoot stays visible at every jump discontinuity.
          </p>
        </>
      ) : (
        <>
          <StudioSlider
            className="mt-4"
            label="Time scale"
            mathLabel={<KatexMath math="a" />}
            min={scaleLimits.min}
            max={scaleLimits.max}
            step={0.05}
            value={scale}
            onChange={(v) => { if (Number.isFinite(v)) setScale(Math.min(scaleLimits.max, Math.max(scaleLimits.min, v))); }}
            editableLimits
            onMinChange={(v) => { if (v >= SCALE_BOUNDS.min && v < scaleLimits.max) { setScaleLimits((l) => ({ ...l, min: v })); if (scale < v) setScale(v); } }}
            onMaxChange={(v) => { if (v <= SCALE_BOUNDS.max && v > scaleLimits.min) { setScaleLimits((l) => ({ ...l, max: v })); if (scale > v) setScale(v); } }}
            editableValue
            precision={2}
          />
        </>
      )}
    </InnerBox>
  );
}

export default AnalysisSettingsCard;
