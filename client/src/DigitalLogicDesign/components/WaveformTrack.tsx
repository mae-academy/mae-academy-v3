/** Timing Waveforms — pure SVG square-wave track with optional tick-level input hit targets. */
import type { TimingHazard, Waveform, WaveformValue } from '../utils/timingEngine';

export const waveformY = (value: WaveformValue, highY: number, lowY: number) => value === 1 ? highY : lowY;

export const squareWavePath = (data: readonly WaveformValue[], tickWidth: number, highY: number, lowY: number) => {
  const values: readonly WaveformValue[] = data.length ? data : [0];
  let path = `M 0 ${waveformY(values[0], highY, lowY)}`;
  values.forEach((value, tick) => {
    const end = (tick + 1) * tickWidth;
    const currentY = waveformY(value, highY, lowY);
    path += ` L ${end} ${currentY}`;
    const next = values[tick + 1];
    if (next !== undefined && waveformY(next, highY, lowY) !== currentY) path += ` L ${end} ${waveformY(next, highY, lowY)}`;
  });
  return path;
};

export interface WaveformTrackProps {
  waveform: Waveform;
  y: number;
  tickWidth: number;
  width: number;
  risingEdges?: readonly number[];
  hazards?: readonly TimingHazard[];
  interactive?: boolean;
  onToggleTick?: (tick: number) => void;
}

/** Renders only the signal drawing region; labels and common timing guides stay in the parent canvas. */
export function WaveformTrack({ waveform, y, tickWidth, width, hazards = [], interactive = false, onToggleTick }: WaveformTrackProps) {
  const highY = y - 13;
  const lowY = y + 13;
  const trackHeight = 38;
  return <g aria-label={`${waveform.name} waveform`}>
    {waveform.data.map((value, tick) => value === 'X' || value === 'Z' ? <g key={`unknown-${tick}`}>
      <rect x={tick * tickWidth} y={y - 18} width={tickWidth} height="36" fill="#fee2e2" opacity=".72" />
      <line x1={tick * tickWidth} y1={y} x2={(tick + 1) * tickWidth} y2={y} stroke="#dc2626" strokeWidth="1.1" strokeDasharray="3 2" />
      <text x={tick * tickWidth + tickWidth / 2} y={y + 4} textAnchor="middle" fill="#b91c1c" fontSize="10" fontWeight="800">{value}</text>
    </g> : null)}
    {hazards.filter(hazard => hazard.tick < waveform.data.length).map(hazard => <rect key={`hazard-${hazard.tick}`} x={hazard.tick * tickWidth + 2} y={y - 18} width={Math.max(4, tickWidth - 4)} height="36" fill="#fef3c7" stroke="#d97706" strokeWidth="1" strokeDasharray="3 2" opacity=".9" />)}
    <path d={squareWavePath(waveform.data, tickWidth, highY, lowY)} fill="none" stroke={waveform.type === 'output' ? '#2563eb' : waveform.type === 'clock' ? '#334155' : '#0f172a'} strokeLinecap="square" strokeLinejoin="miter" strokeWidth={waveform.type === 'output' ? 2.4 : 2} />
    {interactive && waveform.data.map((_, tick) => <rect key={`hit-${tick}`} x={tick * tickWidth} y={y - trackHeight / 2} width={tickWidth} height={trackHeight} fill="transparent" role="button" aria-label={`Toggle ${waveform.name} at tick ${tick + 1}`} onClick={() => onToggleTick?.(tick)} style={{ cursor: 'pointer' }} />)}
  </g>;
}
