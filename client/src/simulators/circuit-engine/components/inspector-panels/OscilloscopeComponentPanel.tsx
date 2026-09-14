/* Dedicated oscilloscope inspector: per-channel offset/time-div/volt-div step controls.
   Replaces the old generic "Electrical properties" number inputs and the "Live scope acquisition"
   list. Measurements live next to each channel in OscilloscopeTracePanel, not here. */
import { useState } from 'react';
import type { CircuitComponent, InstrumentReading } from '@/simulators/circuit-engine/models/circuitTypes';
import { formatEngineering } from '@/simulators/circuit-engine/models/circuitTypes';
import { OSCILLOSCOPE_TIME_DIV_PRESETS, OSCILLOSCOPE_VOLT_DIV_PRESETS } from '@/simulators/circuit-engine/models/componentDefs';
import { GRID_DIVS_X } from '@/simulators/circuit-engine/components/ui-components/OscilloscopeTracePanel';
import { calculateAutoscale } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements';
import { EducationalToolsPanel } from '@/simulators/circuit-engine/components/ui-components/EducationalToolsPanel';
import { DARK_CHANNEL_COLORS, LIGHT_CHANNEL_COLORS, type OscilloscopeDisplaySettings } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeDisplaySettings';
import { V3Math } from '@/components/ui/V3Math';

type PanelColors = { line: string; subtle: string; muted: string };

const CHANNELS = ['ch1', 'ch2', 'ch3', 'ch4'] as const;
type Channel = typeof CHANNELS[number];

function numeric(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

/** Offset is displayed in whatever unit its own Volt/Div scale reads in — µV for a mV/div trace,
 * kV for a very coarse one — so a small offset on a fine scale doesn't round away to "0.00 V". */
function offsetMath(value: number, voltDiv: number): string {
  const sign = value > 0 ? '+' : '';
  if (voltDiv < 0.001) return `\\text{Offset} = ${sign}${(value * 1e6).toFixed(1)}\\ \\mu\\text{V}`;
  if (voltDiv < 1) return `\\text{Offset} = ${sign}${(value * 1e3).toFixed(2)}\\ \\text{mV}`;
  if (voltDiv < 1000) return `\\text{Offset} = ${sign}${value.toFixed(2)}\\ \\text{V}`;
  return `\\text{Offset} = ${sign}${(value / 1000).toFixed(2)}\\ \\text{kV}`;
}

function perDivMath(value: number, unit: string): string {
  const formatted = formatEngineering(value, unit, 0); // presets are round decade values — no decimals needed
  const match = formatted.match(/^([-+]?\d+)\s*(.*)$/);
  if (!match) return `\\text{${formatted}/div}`;
  const [, num, suffix] = match;
  return `${num}\\ \\text{${suffix}/div}`;
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
      <div className="text-[12px] font-bold text-black uppercase tracking-wider" style={{ marginBottom: 8 }}>Oscilloscope settings</div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>Channel</span>
        <select
          value={selectedChannel}
          onChange={event => setSelectedChannel(event.target.value as Channel)}
          style={{ height: 32, borderRadius: 8, border: `1px solid ${colors.line}`, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: channelColor, background: '#fff' }}
        >
          {CHANNELS.map((channel, index) => <option key={channel} value={channel} style={{ color: displaySettings.channelColors[index] }}>{channel.toUpperCase()}</option>)}
        </select>
      </label>

      <StepArrowRow
        colors={colors}
        label="Offset (V)"
        displayMath={offsetMath(offset, voltDiv)}
        min={-maxOffset}
        max={maxOffset}
        step={offsetStep}
        value={offset}
        onChange={next => onPropertyChange(offsetKey, next)}
      />

      <PresetStepperRow
        colors={colors}
        label="Time/Div (s)"
        unit="s"
        presets={OSCILLOSCOPE_TIME_DIV_PRESETS}
        value={timeDiv}
        maxIndex={maxTimeDivIndex}
        onChange={next => onPropertyChange(timeDivKey, next)}
      />

      <PresetStepperRow
        colors={colors}
        label="Volt/Div (V)"
        unit="V"
        presets={OSCILLOSCOPE_VOLT_DIV_PRESETS}
        value={voltDiv}
        onChange={next => onPropertyChange(voltDivKey, next)}
      />

      <StepArrowRow
        colors={colors}
        label="Time shift (s)"
        displayMath={timeShiftMath(timeShift)}
        min={-maxTimeShift}
        max={maxTimeShift}
        step={maxTimeShift > 0 ? maxTimeShift / 100 : 1}
        value={timeShift}
        onChange={next => onPropertyChange(timeShiftKey, next)}
        onReset={timeShift !== 0 ? () => onPropertyChange(timeShiftKey, 0) : undefined}
      />

      <button
        type="button"
        onClick={handleAutoscale}
        disabled={!channelSamples || channelSamples.length < 2}
        style={{
          width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, border: 'none',
          background: !channelSamples || channelSamples.length < 2 ? '#cbd5e1' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase',
          cursor: !channelSamples || channelSamples.length < 2 ? 'default' : 'pointer',
        }}
        title="Fit Offset / Time-Div / Volt-Div to this channel's captured signal"
      >
        ⬜ Autoscale
      </button>

      <EducationalToolsPanel colors={colors} samples={channelSamples ?? []} frequencyHz={reading?.frequency ?? 0} />

      <DisplaySettingsSection colors={colors} settings={displaySettings} onChange={onDisplaySettingsChange} />
    </section>
  );
}

function timeShiftMath(seconds: number): string {
  if (seconds === 0) return '\\text{Shift} = 0\\ \\text{s}';
  const sign = seconds > 0 ? '+' : '';
  const abs = Math.abs(seconds);
  if (abs < 1e-6) return `\\text{Shift} = ${sign}${(seconds * 1e9).toFixed(1)}\\ \\text{ns}`;
  if (abs < 1e-3) return `\\text{Shift} = ${sign}${(seconds * 1e6).toFixed(1)}\\ \\mu\\text{s}`;
  if (abs < 1) return `\\text{Shift} = ${sign}${(seconds * 1e3).toFixed(2)}\\ \\text{ms}`;
  return `\\text{Shift} = ${sign}${seconds.toFixed(3)}\\ \\text{s}`;
}

/** Viewer preference (theme + channel colors) — see oscilloscopeDisplaySettings.ts for why this is
 * localStorage-backed rather than a component.props field like every other control on this panel. */
function DisplaySettingsSection({ colors, settings, onChange }: { colors: PanelColors; settings: OscilloscopeDisplaySettings; onChange: (next: Partial<OscilloscopeDisplaySettings>) => void }) {
  const defaults = settings.isDarkMode ? DARK_CHANNEL_COLORS : LIGHT_CHANNEL_COLORS;
  const setChannelColor = (index: number, color: string) => {
    const next = [...settings.channelColors] as [string, string, string, string];
    next[index] = color;
    onChange({ channelColors: next });
  };
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.line}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Display settings</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <ThemeButton label="☀️ Light" active={!settings.isDarkMode} onClick={() => onChange({ isDarkMode: false, channelColors: LIGHT_CHANNEL_COLORS })} />
        <ThemeButton label="🌙 Dark" active={settings.isDarkMode} onClick={() => onChange({ isDarkMode: true, channelColors: DARK_CHANNEL_COLORS })} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {CHANNELS.map((channel, index) => (
          <div key={channel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 30, fontSize: 11, fontWeight: 700, color: settings.channelColors[index] }}>{channel.toUpperCase()}</span>
            <input
              type="color"
              aria-label={`${channel.toUpperCase()} trace color`}
              value={settings.channelColors[index]}
              onChange={event => setChannelColor(index, event.target.value)}
              style={{ width: 32, height: 28, border: `1px solid ${colors.line}`, borderRadius: 4, padding: 0, cursor: 'pointer' }}
            />
            <span style={{ flex: 1, fontSize: 10, fontFamily: 'ui-monospace, monospace', color: colors.muted, textTransform: 'uppercase' }}>{settings.channelColors[index]}</span>
            <button
              type="button"
              aria-label={`Reset ${channel.toUpperCase()} color`}
              onClick={() => setChannelColor(index, defaults[index])}
              style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${colors.line}`, background: '#fff', fontSize: 12, cursor: 'pointer' }}
            >
              ⟳
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${active ? '#2563eb' : '#d0d0d0'}`, background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#334155' }}
    >
      {label}
    </button>
  );
}

const RANGE_INPUT_CLASS = "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand-gradient [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-blue-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow";

/** Offset/time-shift control: continuous within [min,max] at a fixed step, with prev/next buttons
 * that snap an out-of-range stored value back in bounds, plus an optional reset-to-0 button. */
function StepArrowRow({ colors, label, displayMath, min, max, step, value, onChange, onReset }: { colors: PanelColors; label: string; displayMath: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void; onReset?: () => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
        <span>{label}</span><span style={{ color: colors.muted, textTransform: 'none', fontWeight: 600 }}><V3Math math={displayMath} /></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepButton disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} label={`Decrease ${label}`}>‹</StepButton>
        <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className={RANGE_INPUT_CLASS} />
        <StepButton disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} label={`Increase ${label}`}>›</StepButton>
        {onReset && <StepButton disabled={false} onClick={onReset} label={`Reset ${label}`}>⟳</StepButton>}
      </div>
    </div>
  );
}

/** Time/Div & Volt/Div control: thumb travels over preset indices only, plus prev/next buttons —
 * a segmented "oscilloscope knob" rather than a continuous drag. `maxIndex` (Time/Div only, see
 * maxFeasibleTimeDivIndex) caps how far it can travel when there isn't more real data past that rung. */
function PresetStepperRow({ colors, label, unit, presets, value, maxIndex = presets.length - 1, onChange }: { colors: PanelColors; label: string; unit: string; presets: number[]; value: number; maxIndex?: number; onChange: (value: number) => void }) {
  const index = Math.min(maxIndex, nearestPresetIndex(presets, value));
  const step = (delta: number) => onChange(presets[Math.max(0, Math.min(maxIndex, index + delta))]);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
        <span>{label}</span><span style={{ color: colors.muted, textTransform: 'none', fontWeight: 600 }}><V3Math math={perDivMath(presets[index], unit)} /></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepButton disabled={index === 0} onClick={() => step(-1)} label={`Previous ${label}`}>‹</StepButton>
        <input aria-label={label} type="range" min={0} max={maxIndex} step={1} value={index} onChange={event => onChange(presets[Number(event.target.value)])} className={RANGE_INPUT_CLASS} title={maxIndex < presets.length - 1 ? 'Limited by the simulated transient window — see the circuit\'s SPICE run length' : undefined} />
        <StepButton disabled={index === maxIndex} onClick={() => step(1)} label={`Next ${label}`}>›</StepButton>
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
      style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: '1px solid #cbd5e1', background: disabled ? '#f1f5f9' : '#fff', color: disabled ? '#cbd5e1' : '#334155', fontSize: 13, lineHeight: 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      {children}
    </button>
  );
}
