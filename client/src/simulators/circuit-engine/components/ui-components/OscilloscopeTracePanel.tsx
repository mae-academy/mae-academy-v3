/* Persistent 4-channel oscilloscope waveform display, docked in the inspector aside.
   Mirrors PersistentDmmPanel's layout convention; consumes real solver samples (no synthetic data).
   Per-channel offset/time-div/volt-div/time-shift live in component.props (set by
   OscilloscopeComponentPanel's sliders) — reading them straight from the same `scopes` prop is what
   makes slider changes reach this canvas instantly, with no extra prop-threading between the two
   panels. Theme/channel colors come from `displaySettings` (a viewer preference lifted into Home.tsx
   so both panels share one live value — see oscilloscopeDisplaySettings.ts). */
import { useEffect, useRef } from 'react';
import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';
import type { InstrumentReading, SamplePoint } from '@/simulators/circuit-engine/models/circuitTypes';
import { MeasurementTable } from '@/simulators/circuit-engine/components/ui-components/MeasurementTable';
import { calculateVdc, calculateVpp } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements';
import type { OscilloscopeDisplaySettings } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeDisplaySettings';
import { V3Math } from '@/components/ui/V3Math';

type ScopePanelColors = { line: string; subtle: string; muted: string };

const CHANNELS = ['ch1', 'ch2', 'ch3', 'ch4'] as const;
// Shared with OscilloscopeComponentPanel so its Time/Div stepper can cap out at what this canvas can
// actually draw (see the doc comment on drawChannelTrace).
export const GRID_DIVS_X = 10;
const GRID_DIVS_Y = 8;
const CANVAS_WIDTH = 268;
const CANVAS_HEIGHT = 160;

function numeric(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function OscilloscopeTracePanel({ colors, scopes, instrumentReadings, displaySettings }: { colors: ScopePanelColors; scopes: CircuitComponent[]; instrumentReadings: Record<string, InstrumentReading>; displaySettings: OscilloscopeDisplaySettings }) {
  if (scopes.length === 0) return null;
  return (
    <div style={{ borderBottom: `1px solid ${colors.line}`, background: `${colors.line}22` }}>
      <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Live Oscilloscopes</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: 10, gap: 14 }}>
        {scopes.map(scope => <ScopeUnit key={scope.id} colors={colors} scope={scope} instrumentReadings={instrumentReadings} displaySettings={displaySettings} />)}
      </div>
    </div>
  );
}

function formatVoltageDivLatex(v: number): string {
  if (Math.abs(v) < 1e-9) return '0\\ \\text{V}';
  const sign = v < 0 ? '-' : '+';
  const abs = Math.abs(v);
  if (abs < 1) {
    const val = Number((abs * 1e3).toPrecision(3));
    return `${sign}${val}\\ \\text{mV}`;
  }
  const val = Number(abs.toPrecision(3));
  return `${sign}${val}\\ \\text{V}`;
}

function formatTimeDivLatex(sec: number): string {
  if (Math.abs(sec) < 1e-9) return '0\\ \\text{s}';
  const abs = Math.abs(sec);
  if (abs < 1e-3) {
    const val = Number((abs * 1e6).toPrecision(3));
    return `${val}\\ \\mu\\text{s}`;
  }
  if (abs < 1) {
    const val = Number((abs * 1e3).toPrecision(3));
    return `${val}\\ \\text{ms}`;
  }
  const val = Number(abs.toPrecision(3));
  return `${val}\\ \\text{s}`;
}

function OscilloscopeAxisOverlay({
  timeDiv,
  voltDiv,
  offset,
  isDarkMode,
}: {
  timeDiv: number;
  voltDiv: number;
  offset: number;
  isDarkMode: boolean;
}) {
  const labelClass = isDarkMode
    ? 'bg-[#090a0d]/90 text-[#f8fafc] border border-[#1a1d24] shadow-xs'
    : 'bg-white/80 text-slate-800 border border-slate-200 shadow-xs';

  const vertDivs = [
    { d: 4, style: { top: '2px', left: '3px' } },
    { d: 2, style: { top: '25%', left: '3px', transform: 'translateY(-50%)' } },
    { d: 0, style: { top: '50%', left: '3px', transform: 'translateY(-50%)' } },
    { d: -2, style: { top: '75%', left: '3px', transform: 'translateY(-50%)' } },
    { d: -4, style: { bottom: '15px', left: '3px' } },
  ];

  const horizDivs = [
    { k: 0, style: { bottom: '2px', left: '3px' } },
    { k: 2, style: { bottom: '2px', left: '20%', transform: 'translateX(-50%)' } },
    { k: 4, style: { bottom: '2px', left: '40%', transform: 'translateX(-50%)' } },
    { k: 6, style: { bottom: '2px', left: '60%', transform: 'translateX(-50%)' } },
    { k: 8, style: { bottom: '2px', left: '80%', transform: 'translateX(-50%)' } },
    { k: 10, style: { bottom: '2px', right: '3px' } },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10">
      {/* Vertical Voltage Scale Divisions */}
      {vertDivs.map(({ d, style }) => (
        <span
          key={`v-${d}`}
          style={style}
          className={`absolute text-[8px] px-0.5 py-[0.5px] rounded leading-none font-mono flex items-center justify-center ${labelClass}`}
        >
          <V3Math math={formatVoltageDivLatex(offset + d * voltDiv)} />
        </span>
      ))}

      {/* Horizontal Timebase Scale Divisions */}
      {horizDivs.map(({ k, style }) => (
        <span
          key={`t-${k}`}
          style={style}
          className={`absolute text-[8px] px-0.5 py-[0.5px] rounded leading-none font-mono flex items-center justify-center ${labelClass}`}
        >
          <V3Math math={formatTimeDivLatex(k * timeDiv)} />
        </span>
      ))}
    </div>
  );
}

function ScopeUnit({ colors, scope, instrumentReadings, displaySettings }: { colors: ScopePanelColors; scope: CircuitComponent; instrumentReadings: Record<string, InstrumentReading>; displaySettings: OscilloscopeDisplaySettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readings = CHANNELS.map(channel => instrumentReadings[`${scope.id}:${channel}`]);
  const channelConfigs = CHANNELS.map(channel => ({
    offset: numeric(scope.props[`offset_${channel}`], 0),
    timeDiv: numeric(scope.props[`timeDiv_${channel}`], 0.01),
    voltDiv: numeric(scope.props[`voltDiv_${channel}`], 5),
    timeShift: numeric(scope.props[`timeShift_${channel}`], 0),
  }));
  const canvasBackground = displaySettings.isDarkMode ? '#090a0d' : '#ffffff';

  const readyIndex = readings.findIndex(r => r?.status === 'ready');
  const primaryConfig = channelConfigs[readyIndex >= 0 ? readyIndex : 0];

  // Redraws whenever the live samples advance, a slider edits offset/time-div/volt-div/time-shift,
  // or the theme/channel colors change — none needing more than a plain re-render to stay under 16ms.
  const sampleKey = readings.map(reading => reading?.samples?.at(-1)?.value).join(',');
  const configKey = channelConfigs.map(config => `${config.offset}|${config.timeDiv}|${config.voltDiv}|${config.timeShift}`).join(';');
  const themeKey = `${displaySettings.isDarkMode}|${displaySettings.channelColors.join(',')}|${displaySettings.acquisitionMode ?? 'live'}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    drawGraticule(ctx, displaySettings);
    readings.forEach((reading, index) => {
      if (reading?.status === 'ready' && reading.samples) {
        const { offset, timeDiv, voltDiv, timeShift } = channelConfigs[index];
        drawChannelTrace(ctx, reading.samples, displaySettings.channelColors[index], offset, voltDiv, timeDiv, timeShift, displaySettings.acquisitionMode);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey, configKey, themeKey]);

  const modeText = displaySettings.acquisitionMode === 'step' ? 'STEP' : 'ROLL';
  const timeDivStr = formatTimeDivLatex(primaryConfig.timeDiv);
  const voltDivStr = formatVoltageDivLatex(primaryConfig.voltDiv).replace(/^[+-]/, '');
  const headerLatex = displaySettings.showValues
    ? `${timeDivStr}\\text{ /div} \\cdot ${voltDivStr}\\text{ /div} \\quad \\textbf{${modeText}}`
    : `\\textbf{${modeText}}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="flex items-center justify-between">
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>{scope.label}</div>
        <div className="flex items-center gap-2">
          <V3Math math={headerLatex} className="text-[10px] text-slate-400 font-mono" />
        </div>
      </div>
      <div className="relative overflow-hidden rounded" style={{ width: '100%', height: CANVAS_HEIGHT, border: `1px solid ${colors.line}` }}>
        <canvas ref={canvasRef} data-scope-id={scope.id} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ width: '100%', height: CANVAS_HEIGHT, background: canvasBackground, display: 'block' }} />
        {displaySettings.showValues && (
          <OscilloscopeAxisOverlay
            timeDiv={primaryConfig.timeDiv}
            voltDiv={primaryConfig.voltDiv}
            offset={primaryConfig.offset}
            isDarkMode={displaySettings.isDarkMode}
          />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {CHANNELS.map((channel, index) => {
          const reading = readings[index];
          const isReady = reading?.status === 'ready';
          const samples = isReady ? reading.samples ?? [] : [];
          return (
            <MeasurementTable
              key={channel}
              channel={channel}
              color={displaySettings.channelColors[index]}
              isConnected={isReady}
              measurements={isReady ? { frequency: reading.frequency ?? 0, vpp: calculateVpp(samples), vrms: reading.value, vdc: calculateVdc(samples) } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function drawGraticule(ctx: CanvasRenderingContext2D, displaySettings: OscilloscopeDisplaySettings): void {
  const { width, height } = ctx.canvas;
  const isDark = displaySettings.isDarkMode;
  ctx.fillStyle = isDark ? '#090a0d' : '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const stepX = width / GRID_DIVS_X;
  const stepY = height / GRID_DIVS_Y;
  ctx.strokeStyle = isDark ? '#1a1d24' : '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_DIVS_X; i++) {
    ctx.beginPath();
    ctx.moveTo(i * stepX, 0);
    ctx.lineTo(i * stepX, height);
    ctx.stroke();
  }
  for (let i = 1; i < GRID_DIVS_Y; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * stepY);
    ctx.lineTo(width, i * stepY);
    ctx.stroke();
  }
  ctx.strokeStyle = isDark ? '#222630' : '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}


/** Real scope behaviour: a trailing `10 * timeDiv` second sweep window, vertical position driven by
 * (value - offset) / voltDiv rather than auto-scaling to the trace's own peak. Clamped to the
 * graticule like a real scope clips an over-range signal at the top/bottom of the screen.
 *
 * `samples` is one fixed-length `.tran` sweep (at most ~500ms, see SPICE_TRAN_PERIODS in Home.tsx),
 * not a live rolling acquisition buffer — there's no more history to "fetch" for a slow Time/Div.
 * When the requested window exceeds what was actually simulated, the window is clamped to the real
 * data span so the trace fills the screen instead of being squeezed into a sliver with a blank tail.
 *
 * `timeShift` scrolls the window's right edge earlier (positive) or later (negative) within that
 * same real data span — OscilloscopeComponentPanel already clamps it so the window can never be
 * pushed past the captured samples, so no clamping happens here beyond the window-fit above.
 */
function drawChannelTrace(
  ctx: CanvasRenderingContext2D,
  samples: SamplePoint[],
  color: string,
  offset: number,
  voltDiv: number,
  timeDiv: number,
  timeShift: number,
  acquisitionMode: 'live' | 'step' = 'live'
): void {
  if (samples.length < 2) return;
  const { width, height } = ctx.canvas;
  const pixelsPerDivY = height / GRID_DIVS_Y;
  const centerY = height / 2;
  const safeVoltDiv = Math.max(1e-9, voltDiv);

  if (acquisitionMode === 'step') {
    // Step Response Behavior (t >= 0 Frozen / Transient Capture):
    // 1. Time Horizon: Anchors the horizontal axis strictly from t = 0 to t = +T_span
    const tSpan = Math.max(1e-9, timeDiv * GRID_DIVS_X);
    // 2. Fixed Capture (No Left-Shifting): Data points prior to step excitation (t < 0) are blanked
    const stepSamples = samples.filter(s => s.time >= 0);
    if (stepSamples.length < 2) return;
    // 3. Waveform plots left-to-right starting rigidly at the left vertical axis (t = 0)
    // Once transient reaches T_span, trace remains static/pinned on screen (no leftward drift or buffer truncation)
    const visible = stepSamples.filter(s => s.time <= tSpan + tSpan * 1e-6);
    if (visible.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    visible.forEach((sample, index) => {
      const x = Math.min(width, (sample.time / tSpan) * width);
      const y = Math.max(0, Math.min(height, centerY - ((sample.value - offset) / safeVoltDiv) * pixelsPerDivY));
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    return;
  }

  // Continuous / Live Roll Behavior:
  // Rolling window buffer showing dynamic real-time data moving across [t - T_window, t]
  const requestedWindow = Math.max(1e-9, timeDiv * GRID_DIVS_X);
  const dataStart = samples[0].time;
  const dataEnd = samples[samples.length - 1].time;
  const windowSeconds = Math.min(requestedWindow, Math.max(1e-9, dataEnd - dataStart));
  const desiredEnd = dataEnd - timeShift;
  const windowEnd = Math.max(dataStart + windowSeconds, Math.min(dataEnd, desiredEnd));
  const windowStart = windowEnd - windowSeconds;
  // Tiny epsilon on the left boundary only — the right edge is included by construction (it
  // trivially satisfies `>= windowStart`), so this guards a boundary sample that floating-point
  // subtraction landed a hair below windowStart, not a reproduced cutoff at the sweep's leading edge.
  const epsilon = windowSeconds * 1e-6;
  const visible = samples.filter(sample => sample.time >= windowStart - epsilon && sample.time <= windowEnd + epsilon);
  if (visible.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  visible.forEach((sample, index) => {
    const x = ((sample.time - windowStart) / windowSeconds) * width;
    const y = Math.max(0, Math.min(height, centerY - ((sample.value - offset) / safeVoltDiv) * pixelsPerDivY));
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
