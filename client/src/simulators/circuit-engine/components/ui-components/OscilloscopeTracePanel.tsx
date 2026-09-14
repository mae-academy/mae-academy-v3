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
    <div style={{ marginTop: 'auto', borderTop: `1px solid ${colors.line}`, background: `${colors.line}22` }}>
      <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Live Oscilloscopes</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: 10, gap: 14 }}>
        {scopes.map(scope => <ScopeUnit key={scope.id} colors={colors} scope={scope} instrumentReadings={instrumentReadings} displaySettings={displaySettings} />)}
      </div>
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
  const canvasBackground = displaySettings.isDarkMode ? '#0a0a0a' : '#ffffff';

  // Redraws whenever the live samples advance, a slider edits offset/time-div/volt-div/time-shift,
  // or the theme/channel colors change — none needing more than a plain re-render to stay under 16ms.
  const sampleKey = readings.map(reading => reading?.samples?.at(-1)?.value).join(',');
  const configKey = channelConfigs.map(config => `${config.offset}|${config.timeDiv}|${config.voltDiv}|${config.timeShift}`).join(';');
  const themeKey = `${displaySettings.isDarkMode}|${displaySettings.channelColors.join(',')}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    drawGraticule(ctx, displaySettings);
    readings.forEach((reading, index) => {
      if (reading?.status === 'ready' && reading.samples) {
        const { offset, timeDiv, voltDiv, timeShift } = channelConfigs[index];
        drawChannelTrace(ctx, reading.samples, displaySettings.channelColors[index], offset, voltDiv, timeDiv, timeShift);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey, configKey, themeKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>{scope.label}</div>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ width: '100%', height: CANVAS_HEIGHT, background: canvasBackground, border: '1px solid #444', borderRadius: 4, display: 'block' }} />
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
              isDarkMode={displaySettings.isDarkMode}
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
  ctx.fillStyle = isDark ? '#0a0a0a' : '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const stepX = width / GRID_DIVS_X;
  const stepY = height / GRID_DIVS_Y;
  ctx.strokeStyle = isDark ? '#222' : '#e2e8f0';
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
  ctx.strokeStyle = isDark ? '#444' : '#94a3b8';
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
function drawChannelTrace(ctx: CanvasRenderingContext2D, samples: SamplePoint[], color: string, offset: number, voltDiv: number, timeDiv: number, timeShift: number): void {
  if (samples.length < 2) return;
  const { width, height } = ctx.canvas;
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
  const pixelsPerDivY = height / GRID_DIVS_Y;
  const centerY = height / 2;
  const safeVoltDiv = Math.max(1e-9, voltDiv);
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
