/* Dedicated oscilloscope inspector: per-channel offset/time-div/volt-div/time-shift step controls
   plus Autoscale and the viewer-preference controls grid. Replaces the old generic "Electrical
   properties" number inputs and the "Live scope acquisition" list.
   All on-screen readout values (voltage, period, divisions, time) strictly render in KaTeX math format. */
import { useState } from 'react';
import type { CircuitComponent, InstrumentReading } from '@/simulators/circuit-engine/models/circuitTypes';
import { OSCILLOSCOPE_TIME_DIV_PRESETS, OSCILLOSCOPE_VOLT_DIV_PRESETS } from '@/simulators/circuit-engine/models/componentDefs';
import { GRID_DIVS_X } from '@/simulators/circuit-engine/components/ui-components/OscilloscopeTracePanel';
import { calculateAutoscale } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements';
import { OscilloscopeControlsGrid } from '@/simulators/circuit-engine/components/ui-components/OscilloscopeControlsGrid';
import type { OscilloscopeDisplaySettings } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeDisplaySettings';
import { V3Math } from '@/components/ui/V3Math';

type PanelColors = { line: string; subtle: string; muted: string };

const CHANNELS = ['ch1', 'ch2', 'ch3', 'ch4'] as const;
type Channel = typeof CHANNELS[number];

function numeric(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Format seconds for KaTeX math rendering (e.g. 10\,\mu\text{s}, 1\,\text{ms}, 2\,\text{s}). */
function formatTimeLatex(sec: number): string {
  if (sec < 1e-3) {
    const val = Number((sec * 1e6).toPrecision(3));
    return `${val}\\ \\mu\\text{s}`;
  }
  if (sec < 1) {
    const val = Number((sec * 1e3).toPrecision(3));
    return `${val}\\ \\text{ms}`;
  }
  const val = Number(sec.toPrecision(3));
  return `${val}\\ \\text{s}`;
}

/** Format volts for KaTeX math rendering (e.g. 10\,\text{mV}, 5\,\text{V}). */
function formatVoltLatex(v: number): string {
  if (v < 1) {
    const val = Number((v * 1e3).toPrecision(3));
    return `${val}\\ \\text{mV}`;
  }
  const val = Number(v.toPrecision(3));
  return `${val}\\ \\text{V}`;
}

/** Nearest preset index on a log scale — lets the stepper land on a rung even for a value that
 * predates this control (an older saved circuit, or a value entered before snapping applied). */
function nearestPresetIndex(presets: number[], value: number): number {
  let best = 0;
  let bestDiff = Infinity;
  presets.forEach((preset, index) => {
    const diff = Math.abs(Math.log10(preset) - Math.log10(Math.max(value, 1e-12)));
    if (diff < bestDiff) { bestDiff = diff; best = index; }
  });
  return best;
}

/** Highest preset whose 10-division window still fits inside the channel's actual simulated span.
 * `samples` is one fixed-length `.tran` sweep (≤ ~500ms — see SPICE_TRAN_PERIODS in Home.tsx), not a
 * live acquisition buffer, so a preset beyond this point can't show more real data: the trace just
 * fills the canvas with whatever was simulated and every further click would look identical. Capping
 * the stepper here — instead of letting it "stop changing" silently — is the fix for that. */
function maxFeasibleTimeDivIndex(presets: number[], dataSpanSeconds: number): number {
  let max = 0;
  presets.forEach((preset, index) => { if (preset * GRID_DIVS_X <= dataSpanSeconds) max = index; });
  return max;
}

export function OscilloscopeComponentPanel({ colors, component, readings, displaySettings, onDisplaySettingsChange, onPropertyChange, onPropertiesChange }: {
  colors: PanelColors;
  component: CircuitComponent;
  readings: Record<string, InstrumentReading>;
  displaySettings: OscilloscopeDisplaySettings;
  onDisplaySettingsChange: (next: Partial<OscilloscopeDisplaySettings>) => void;
  onPropertyChange: (key: string, value: unknown) => void;
  onPropertiesChange: (updates: Record<string, unknown>) => void;
}) {
  const [selectedChannel, setSelectedChannel] = useState<Channel>('ch1');
  const channelIndex = CHANNELS.indexOf(selectedChannel);
  const channelColor = displaySettings.channelColors[channelIndex];

  const offsetKey = `offset_${selectedChannel}`;
  const timeDivKey = `timeDiv_${selectedChannel}`;
  const voltDivKey = `voltDiv_${selectedChannel}`;
  const timeShiftKey = `timeShift_${selectedChannel}`;
  const timeDiv = numeric(component.props[timeDivKey], 0.01);
  const voltDiv = numeric(component.props[voltDivKey], 5);

  const reading = readings[`${component.id}:${selectedChannel}`];
  const channelSamples = reading?.samples;
  const dataSpanSeconds = channelSamples && channelSamples.length > 1
    ? channelSamples[channelSamples.length - 1].time - channelSamples[0].time
    : Infinity; // No run yet for this channel — don't restrict a control nothing has measured.
  const maxTimeDivIndex = maxFeasibleTimeDivIndex(OSCILLOSCOPE_TIME_DIV_PRESETS, dataSpanSeconds);

  // Offset travel and step both scale with Volt/Div: ±4 divisions of range, 1/10 division per click —
  // fine control on a 5mV trace, coarse control on a 100V one, instead of one fixed ±500V/5V control.
  const offsetStep = voltDiv / 10;
  const maxOffset = voltDiv * 4;
  const rawOffset = numeric(component.props[offsetKey], 0);
  const offset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));

  // How far the visible window can scroll within what was actually captured — the same "don't show
  // more than we have" window OscilloscopeTracePanel's own draw uses.
  const windowSeconds = Math.min(timeDiv * GRID_DIVS_X, Number.isFinite(dataSpanSeconds) ? dataSpanSeconds : timeDiv * GRID_DIVS_X);
  const maxTimeShift = Number.isFinite(dataSpanSeconds) ? Math.max(0, dataSpanSeconds - windowSeconds) : 0;
  const rawTimeShift = numeric(component.props[timeShiftKey], 0);
  const timeShift = Math.max(-maxTimeShift, Math.min(maxTimeShift, rawTimeShift));

  const handleAutoscale = () => {
    if (!channelSamples || channelSamples.length < 2) return;
    const result = calculateAutoscale(channelSamples, reading?.frequency ?? 0);
    onPropertiesChange({
      [offsetKey]: result.offset,
      [timeDivKey]: result.timeDiv,
      [voltDivKey]: result.voltDiv,
      [timeShiftKey]: result.timeShift,
    });
  };

  return (
    <section style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.line}` }}>
      <div className="text-[12px] font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider" style={{ marginBottom: 8 }}>Oscilloscope settings</div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Channel</span>
        <select
          value={selectedChannel}
          onChange={event => setSelectedChannel(event.target.value as Channel)}
          className="h-8 rounded-xl border border-slate-200 dark:border-[#282d38] px-2.5 text-[13px] font-bold bg-white dark:bg-[#13161c]"
          style={{ color: channelColor }}
        >
          {CHANNELS.map((channel, index) => <option key={channel} value={channel} style={{ color: displaySettings.channelColors[index] }}>{channel.toUpperCase()}</option>)}
        </select>
      </label>

      {/* Offset readout in KaTeX */}
      <StepArrowRow
        colors={colors}
        mathLabel={`V_{\\text{offset}} = ${offset.toFixed(2)}\\ \\text{V}`}
        min={-maxOffset}
        max={maxOffset}
        step={offsetStep}
        value={offset}
        onChange={next => onPropertyChange(offsetKey, next)}
      />

      {/* Time/Div readout in KaTeX */}
      <PresetStepperRow
        colors={colors}
        mathLabel={`t_{\\text{div}} = ${formatTimeLatex(timeDiv)}`}
        presets={OSCILLOSCOPE_TIME_DIV_PRESETS}
        value={timeDiv}
        maxIndex={maxTimeDivIndex}
        onChange={next => onPropertyChange(timeDivKey, next)}
      />

      {/* Volt/Div readout in KaTeX */}
      <PresetStepperRow
        colors={colors}
        mathLabel={`V_{\\text{div}} = ${formatVoltLatex(voltDiv)}`}
        presets={OSCILLOSCOPE_VOLT_DIV_PRESETS}
        value={voltDiv}
        onChange={next => onPropertyChange(voltDivKey, next)}
      />

      {/* Time shift readout in KaTeX */}
      <StepArrowRow
        colors={colors}
        mathLabel={`t_{\\text{shift}} = ${formatTimeLatex(timeShift)}`}
        min={-maxTimeShift}
        max={maxTimeShift}
        step={maxTimeShift > 0 ? maxTimeShift / 100 : 1}
        value={timeShift}
        onChange={next => onPropertyChange(timeShiftKey, next)}
        onReset={timeShift !== 0 ? () => onPropertyChange(timeShiftKey, 0) : undefined}
      />

      <OscilloscopeControlsGrid
        colors={colors}
        settings={displaySettings}
        onChange={onDisplaySettingsChange}
        onAutoscale={handleAutoscale}
        isAutoscaleDisabled={!channelSamples || channelSamples.length < 2}
      />
    </section>
  );
}

const RANGE_INPUT_CLASS = "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand-gradient [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-blue-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow";

/** Offset/time-shift control: continuous within [min,max] at a fixed step, with prev/next buttons
 * that snap an out-of-range stored value back in bounds, plus an optional reset-to-0 button.
 * Label strictly renders in KaTeX math format. */
function StepArrowRow({ colors, mathLabel, min, max, step, value, onChange, onReset }: { colors: PanelColors; mathLabel: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void; onReset?: () => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 tracking-tight" style={{ marginBottom: 4 }}>
        <V3Math math={mathLabel} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepButton disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} label="Decrease">‹</StepButton>
        <input aria-label={mathLabel} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className={RANGE_INPUT_CLASS} />
        <StepButton disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} label="Increase">›</StepButton>
        {onReset && <StepButton disabled={false} onClick={onReset} label="Reset">↶</StepButton>}
      </div>
    </div>
  );
}

/** Time/Div & Volt/Div control: thumb travels over preset indices only, plus prev/next buttons —
 * a segmented "oscilloscope knob" rather than a continuous drag.
 * Label strictly renders in KaTeX math format. */
function PresetStepperRow({ colors, mathLabel, presets, value, maxIndex = presets.length - 1, onChange }: { colors: PanelColors; mathLabel: string; presets: number[]; value: number; maxIndex?: number; onChange: (value: number) => void }) {
  const index = Math.min(maxIndex, nearestPresetIndex(presets, value));
  const step = (delta: number) => onChange(presets[Math.max(0, Math.min(maxIndex, index + delta))]);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 tracking-tight" style={{ marginBottom: 4 }}>
        <V3Math math={mathLabel} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepButton disabled={index === 0} onClick={() => step(-1)} label="Previous">‹</StepButton>
        <input aria-label={mathLabel} type="range" min={0} max={maxIndex} step={1} value={index} onChange={event => onChange(presets[Number(event.target.value)])} className={RANGE_INPUT_CLASS} title={maxIndex < presets.length - 1 ? 'Limited by the simulated transient window — see the circuit\'s SPICE run length' : undefined} />
        <StepButton disabled={index === maxIndex} onClick={() => step(1)} label="Next">›</StepButton>
      </div>
    </div>
  );
}

function StepButton({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-[22px] h-[22px] shrink-0 rounded-md border border-slate-200 dark:border-[#282d38] bg-white dark:bg-[#13161c] text-slate-700 dark:text-[#f8fafc] text-xs leading-none flex items-center justify-center cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:bg-slate-100 dark:disabled:bg-[#090a0d]"
    >
      {children}
    </button>
  );
}
