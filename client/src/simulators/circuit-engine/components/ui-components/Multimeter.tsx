/**
 * Live DMM readout. It samples a typed engine read port on requestAnimationFrame and commits to React
 * state only when the rendered reading changes — at once for a status/unit change or a real step, at a
 * bench meter's refresh rate for last-digit jitter — so a 60 fps simulation never re-renders the panel
 * per frame, yet a switch toggle still shows on the very next frame.
 */

import React, { Component, memo, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { V3Math } from '@/components/ui/V3Math';
import { formatEngineering, type CircuitComponent, type InstrumentReading } from '@/simulators/circuit-engine/models/circuitTypes';

/**
 * Read side of the simulation a meter samples. Home backs it with `effectiveSnapshot` — the single
 * merge of the live engine and the SPICE overlay — never the raw legacy engine, whose snapshot lacks
 * the SPICE clamps and would reopen the Run/Pause desync.
 */
export interface SimulationEngineReadout {
  readInstrument(id: string): InstrumentReading | undefined;
  /** Why readings are withheld (a failed design-rule check); `null` while they are live. */
  blockedReason(): string | null;
}

export type MeterStatus = 'reading' | 'overload' | 'no-input' | 'blocked' | 'fault';

export interface MeterDisplay {
  status: MeterStatus;
  /** Value behind `text`; NaN when the display shows none. */
  value: number;
  unit: string;
  /** Main-line text, also the accessible reading. */
  text: string;
  annotation: string;
  continuity: boolean;
}

/** Committed updates per second for last-digit changes; bench DMMs refresh 2–5 times a second. */
export const DEFAULT_REFRESH_HZ = 4;
/** A move larger than this fraction of the reading is a real step, shown on the next frame. */
const STEP_FRACTION = 0.01;

const NO_VALUE = Number.NaN;

export function toMeterDisplay(reading: InstrumentReading | undefined, blockedReason: string | null): MeterDisplay {
  if (blockedReason) {
    return { status: 'blocked', value: NO_VALUE, unit: '', text: '----', annotation: 'Design-rule check failed', continuity: false };
  }
  if (!reading) {
    return { status: 'no-input', value: NO_VALUE, unit: '', text: '—', annotation: 'Connect HI and COM probes', continuity: false };
  }
  if (reading.status === 'open') {
    return { status: 'overload', value: NO_VALUE, unit: reading.unit, text: 'OL', annotation: 'Open / not fully connected', continuity: false };
  }
  if (reading.status === 'overflow' || (reading.status === 'ready' && !Number.isFinite(reading.value))) {
    return { status: 'overload', value: NO_VALUE, unit: reading.unit, text: 'OL', annotation: 'Over range', continuity: false };
  }
  if (reading.status === 'unsupported') {
    return { status: 'fault', value: NO_VALUE, unit: reading.unit, text: '----', annotation: 'No reading in this mode', continuity: false };
  }
  if (reading.continuity === true) {
    return { status: 'reading', value: reading.value, unit: reading.unit, text: 'SHORTED', annotation: 'Continuity detected', continuity: true };
  }
  return {
    status: 'reading',
    value: reading.value,
    unit: reading.unit,
    text: formatEngineering(reading.value, reading.unit),
    annotation: 'Probe-linked measurement',
    continuity: false,
  };
}

/**
 * Whether `next` should replace the committed display now: immediately for a change of status, unit
 * or continuity, or a step beyond `STEP_FRACTION`; otherwise only once `1 / refreshHz` has elapsed.
 */
export function shouldCommit(previous: MeterDisplay, next: MeterDisplay, elapsedMs: number, refreshHz: number): boolean {
  if (previous.text === next.text && previous.annotation === next.annotation) return false;
  if (previous.status !== next.status || previous.unit !== next.unit || previous.continuity !== next.continuity) return true;
  if (elapsedMs >= 1000 / refreshHz) return true;
  const scale = Math.max(Math.abs(previous.value), Math.abs(next.value));
  return !(scale > 0) || Math.abs(next.value - previous.value) > STEP_FRACTION * scale;
}

function faultDisplay(error: unknown): MeterDisplay {
  const detail = error instanceof Error ? error.message : String(error);
  return { status: 'fault', value: NO_VALUE, unit: '', text: 'Err', annotation: detail || 'Reading failed', continuity: false };
}

/** Engineering value typeset through KaTeX, e.g. `4.97 V`, `13.6 mA`. */
export function EngineeringMath({ value, unit }: { value: number; unit?: string }) {
  const formatted = formatEngineering(value, unit ?? '');
  const match = formatted.match(/^([-+]?\d+(?:\.\d+)?)(?:\s*)(.*)$/);
  if (!match) return <>{formatted}</>;
  const suffix = match[2].trim();
  const suffixMath: Record<string, string> = { 'Ω': '\\Omega', 'kΩ': '\\mathrm{k}\\Omega', 'MΩ': '\\mathrm{M}\\Omega', 'V': '\\mathrm{V}', 'mV': '\\mathrm{mV}', 'A': '\\mathrm{A}', 'mA': '\\mathrm{mA}', 'Hz': '\\mathrm{Hz}', 'kHz': '\\mathrm{kHz}', 'H': '\\mathrm{H}', 'mH': '\\mathrm{mH}', 'F': '\\mathrm{F}', 'µF': '\\mu\\mathrm{F}' };
  return <V3Math math={`${match[1]}\\,${suffixMath[suffix] ?? `\\mathrm{${suffix}}`}`} />;
}

/* ------------------------------------------------------------------------ Continuity buzzer --- */

interface Tone {
  context: AudioContext;
  oscillator: OscillatorNode;
  holders: number;
}

let tone: Tone | null = null;

/** One shared 2.7 kHz tone for every meter in CONT mode (browsers cap AudioContexts); returns its release. */
function acquireContinuityTone(): () => void {
  if (!tone) {
    const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return () => undefined;
    try {
      const context = new Context();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 2700;
      gain.gain.value = 0.1;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      tone = { context, oscillator, holders: 0 };
    } catch {
      // Autoplay policy can refuse an AudioContext before a user gesture; the meter still reads.
      return () => undefined;
    }
  }
  const held = tone;
  held.holders += 1;
  let released = false;
  return () => {
    if (released || tone !== held) return;
    released = true;
    held.holders -= 1;
    if (held.holders > 0) return;
    try {
      held.oscillator.stop();
      void held.context.close();
    } catch {
      // Already stopped.
    }
    tone = null;
  };
}

/* --------------------------------------------------------------------------------- Component --- */

export interface MultimeterProps {
  dmm: CircuitComponent;
  /** Must keep a stable identity: the sampling loop re-subscribes whenever it changes. */
  readout: SimulationEngineReadout;
  labelColor: string;
  refreshHz?: number;
}

interface BoundaryProps {
  label: string;
  /** Changing it — e.g. turning the rotary selector — clears a caught error. */
  resetKey: string;
  children: ReactNode;
}

/** Contains a render failure to this one meter instead of unmounting the whole workspace. */
class MeterErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Multimeter ${this.props.label} failed to render.`, error, info.componentStack);
  }

  componentDidUpdate(previous: BoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <MeterFace label={this.props.label} labelColor="#b91c1c" display={faultDisplay('Display fault')} />;
  }
}

function MeterFace({ label, labelColor, display }: { label: string; labelColor: string; display: MeterDisplay }) {
  const numeric = display.status === 'reading' && !display.continuity;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div
        aria-label={`${label} reading: ${display.text}`}
        data-status={display.status}
        style={{ padding: 10, background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 7, textAlign: 'right', color: '#0284c7', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
      >
        <div style={{ fontSize: 22, fontWeight: 800 }}>{numeric ? <EngineeringMath value={display.value} unit={display.unit} /> : display.text}</div>
        <div style={{ marginTop: 4, fontSize: 10, color: '#0369a1' }}>{display.annotation}</div>
      </div>
    </div>
  );
}

function LiveMultimeter({ dmm, readout, labelColor, refreshHz = DEFAULT_REFRESH_HZ }: MultimeterProps) {
  const sample = useCallback((): MeterDisplay => {
    try {
      return toMeterDisplay(readout.readInstrument(dmm.id), readout.blockedReason());
    } catch (error) {
      return faultDisplay(error);
    }
  }, [readout, dmm.id]);
  const [display, setDisplay] = useState<MeterDisplay>(sample);
  const committed = useRef(display);

  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return undefined;
    let frame = 0;
    let disposed = false;
    let lastCommit = performance.now();
    const tick = (now: number) => {
      if (disposed) return;
      const next = sample();
      if (shouldCommit(committed.current, next, now - lastCommit, refreshHz)) {
        committed.current = next;
        lastCommit = now;
        setDisplay(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, [sample, refreshHz]);

  useEffect(() => (display.continuity ? acquireContinuityTone() : undefined), [display.continuity]);

  return <MeterFace label={dmm.label} labelColor={labelColor} display={display} />;
}

/** One DMM on the live panel. Memoized: it re-renders from its own sampling loop, not the parent's frames. */
export const Multimeter = memo(function Multimeter(props: MultimeterProps) {
  return (
    <MeterErrorBoundary label={props.dmm.label} resetKey={String(props.dmm.props.mode ?? 'DCV')}>
      <LiveMultimeter {...props} />
    </MeterErrorBoundary>
  );
});
