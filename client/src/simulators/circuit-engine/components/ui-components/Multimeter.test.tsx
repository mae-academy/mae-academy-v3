// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CircuitComponent, InstrumentReading } from '@/simulators/circuit-engine/models/circuitTypes';
import {
  DEFAULT_REFRESH_HZ,
  Multimeter,
  shouldCommit,
  toMeterDisplay,
  type SimulationEngineReadout,
} from '@/simulators/circuit-engine/components/ui-components/Multimeter';

const dmm = (mode = 'DCV'): CircuitComponent => ({
  id: 'dmm1',
  type: 'dmm',
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  label: 'DMM1',
  props: { mode },
});

const volts = (value: number): InstrumentReading => ({ value, unit: 'V', status: 'ready' });
const REFRESH_MS = 1000 / DEFAULT_REFRESH_HZ;

/** Deterministic requestAnimationFrame: frames fire only when a test advances the clock. */
class FrameClock {
  now = 0;
  readonly cancelled: number[] = [];
  private nextId = 1;
  private readonly queue = new Map<number, FrameRequestCallback>();

  install(): void {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = this.nextId++;
      this.queue.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      this.cancelled.push(id);
      this.queue.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => this.now);
  }

  get pending(): number[] {
    return Array.from(this.queue.keys());
  }

  advance(ms: number): void {
    this.now += ms;
    const due = Array.from(this.queue.values());
    this.queue.clear();
    act(() => {
      for (const callback of due) callback(this.now);
    });
  }
}

/** Mutable stand-in for Home's effectiveSnapshot-backed readout. */
class FakeReadout implements SimulationEngineReadout {
  reading: InstrumentReading | undefined = volts(3.6);
  blocked: string | null = null;
  failure: Error | null = null;

  readInstrument(): InstrumentReading | undefined {
    if (this.failure) throw this.failure;
    return this.reading;
  }

  blockedReason(): string | null {
    return this.blocked;
  }
}

const shown = () => screen.getByLabelText(/^DMM1 reading:/).getAttribute('aria-label');
const expected = (reading: InstrumentReading | undefined, blocked: string | null = null) =>
  `DMM1 reading: ${toMeterDisplay(reading, blocked).text}`;

describe('toMeterDisplay', () => {
  it('maps every reading state onto a bench-meter display', () => {
    expect(toMeterDisplay(undefined, null)).toMatchObject({ status: 'no-input', text: '—' });
    expect(toMeterDisplay({ value: 0, unit: 'V', status: 'open' }, null)).toMatchObject({ status: 'overload', text: 'OL' });
    expect(toMeterDisplay({ value: 1e12, unit: 'Ω', status: 'overflow' }, null)).toMatchObject({ status: 'overload', text: 'OL' });
    expect(toMeterDisplay({ value: Infinity, unit: 'Ω', status: 'ready' }, null)).toMatchObject({ status: 'overload', text: 'OL' });
    expect(toMeterDisplay({ value: 0, unit: 'V', status: 'unsupported' }, null)).toMatchObject({ status: 'fault', text: '----' });
    expect(toMeterDisplay({ value: 12, unit: 'Ω', status: 'ready', continuity: true }, null)).toMatchObject({ text: 'SHORTED', continuity: true });
    expect(toMeterDisplay(volts(4.97), null)).toMatchObject({ status: 'reading', value: 4.97, unit: 'V' });
  });

  it('withholds any reading while a design-rule check blocks the solve', () => {
    expect(toMeterDisplay(volts(4.97), 'D1 has no ballast')).toMatchObject({ status: 'blocked', text: '----', annotation: 'Design-rule check failed' });
  });
});

describe('shouldCommit', () => {
  const at = (value: number) => toMeterDisplay(volts(value), null);

  it('never re-commits an identical display', () => {
    expect(shouldCommit(at(3.6), at(3.6), 10_000, DEFAULT_REFRESH_HZ)).toBe(false);
  });

  it('commits a real step — a switch opening — on the very next frame', () => {
    expect(shouldCommit(at(3.6), at(0), 0, DEFAULT_REFRESH_HZ)).toBe(true);
  });

  it('commits a status change immediately', () => {
    expect(shouldCommit(at(3.6), toMeterDisplay({ value: 0, unit: 'V', status: 'open' }, null), 0, DEFAULT_REFRESH_HZ)).toBe(true);
  });

  it('holds last-digit jitter until the refresh interval elapses', () => {
    expect(shouldCommit(at(3.6), at(3.62), REFRESH_MS / 2, DEFAULT_REFRESH_HZ)).toBe(false);
    expect(shouldCommit(at(3.6), at(3.62), REFRESH_MS, DEFAULT_REFRESH_HZ)).toBe(true);
  });
});

describe('<Multimeter>', () => {
  let clock: FrameClock;
  let readout: FakeReadout;

  beforeEach(() => {
    clock = new FrameClock();
    clock.install();
    readout = new FakeReadout();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the current reading on mount', () => {
    render(<Multimeter dmm={dmm()} readout={readout} labelColor="#64748b" />);
    expect(shown()).toBe(expected(volts(3.6)));
  });

  it('shows a switch opening on the next animation frame, not after a debounce', () => {
    render(<Multimeter dmm={dmm()} readout={readout} labelColor="#64748b" />);
    readout.reading = volts(0);
    clock.advance(16);
    expect(shown()).toBe(expected(volts(0)));
  });

  it('holds sub-step jitter until the display refresh interval', () => {
    render(<Multimeter dmm={dmm()} readout={readout} labelColor="#64748b" />);
    readout.reading = volts(3.62);
    clock.advance(16);
    expect(shown()).toBe(expected(volts(3.6)));
    clock.advance(REFRESH_MS);
    expect(shown()).toBe(expected(volts(3.62)));
  });

  it('shows OL for an open probe and ---- while a design-rule check blocks the solve', () => {
    render(<Multimeter dmm={dmm()} readout={readout} labelColor="#64748b" />);
    readout.reading = { value: 0, unit: 'V', status: 'open' };
    clock.advance(16);
    expect(shown()).toBe('DMM1 reading: OL');

    readout.blocked = 'D1 is forward-biased by V1 with no ballast';
    clock.advance(16);
    expect(shown()).toBe('DMM1 reading: ----');
    expect(screen.getByText('Design-rule check failed')).toBeTruthy();
  });

  it('contains a failing read port to an Err display instead of throwing', () => {
    render(<Multimeter dmm={dmm()} readout={readout} labelColor="#64748b" />);
    readout.failure = new Error('snapshot unavailable');
    clock.advance(16);
    expect(shown()).toBe('DMM1 reading: Err');
    expect(screen.getByText('snapshot unavailable')).toBeTruthy();
  });

  it('cancels its frame loop on unmount', () => {
    const { unmount } = render(<Multimeter dmm={dmm()} readout={readout} labelColor="#64748b" />);
    clock.advance(16);
    const [live] = clock.pending;
    expect(live).toBeDefined();

    unmount();

    expect(clock.cancelled).toContain(live);
    expect(clock.pending).toEqual([]);
  });
});
