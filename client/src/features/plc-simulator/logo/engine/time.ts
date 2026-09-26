import type { TimeBase, TimeValue } from './types';

/** Milliseconds per unit of each timebase (spec §3.4 resolution column). */
const UNIT_MS: Readonly<Record<TimeBase, number>> = { s: 10, m: 1000, h: 60_000 };

/** Largest literal per timebase: s = 99:99, m = 99:59, h = 99:59. */
export const TIME_MAX: Readonly<Record<TimeBase, number>> = { s: 9999, m: 99 * 60 + 59, h: 99 * 60 + 59 };

export const COUNT_MAX = 999_999;

export const toMs = (time: TimeValue): number => time.value * UNIT_MS[time.base];

/** Elapsed milliseconds expressed in whole units of `base` (for the live `Ta` readout). */
export const msToUnits = (ms: number, base: TimeBase): number => Math.floor(ms / UNIT_MS[base]);

export const clampTime = (base: TimeBase, value: number): number => Math.max(0, Math.min(TIME_MAX[base], Math.trunc(value)));

/** The two 2-digit fields of a literal: `SS:hh`, `MM:SS` or `HH:MM`. */
export function timeFields(base: TimeBase, value: number): readonly [number, number] {
  const v = clampTime(base, value);
  return base === 's' ? [Math.floor(v / 100), v % 100] : [Math.floor(v / 60), v % 60];
}

export function fromTimeFields(base: TimeBase, major: number, minor: number): number {
  const lo = base === 's' ? Math.min(99, minor) : Math.min(59, minor);
  return clampTime(base, base === 's' ? major * 100 + lo : major * 60 + lo);
}

const two = (n: number): string => String(n).padStart(2, '0');

/** `30:00s`, `06:00m`, `01:30h`: the on-device notation. */
export function formatTime(time: TimeValue): string {
  const [major, minor] = timeFields(time.base, time.value);
  return `${two(major)}:${two(minor)}${time.base}`;
}

/** Same notation for an elapsed time, saturating at the timebase maximum. */
export const formatElapsed = (ms: number, base: TimeBase): string =>
  formatTime({ base, value: Math.min(TIME_MAX[base], msToUnits(ms, base)) });
