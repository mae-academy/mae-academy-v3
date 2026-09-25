/**
 * Fourier series observation window: presets tied to T₀, symbolic period-grounded time ticks,
 * and signal-aware fundamental-period detection. Shared by the Harmonic Builder and the 3D waterfall.
 */
import { estimateSupport } from "@/lib/plotAutoScale";

export const N_MAX = 50;
export const PERIOD_BOUNDS = { min: 0.1, max: 20 } as const;

export type WindowPreset = "one" | "two" | "custom";

export interface TimeWindow {
  start: number;
  end: number;
}

/** 1 period → [−T₀/2, T₀/2]; 2 periods → [−T₀, T₀]. */
export function presetWindow(preset: Exclude<WindowPreset, "custom">, period: number): TimeWindow {
  const half = preset === "one" ? period / 2 : period;
  return { start: -half, end: half };
}

/** A usable window: finite, ordered, at least 1% of a period wide. */
export function isValidWindow(window: TimeWindow, period: number): boolean {
  return Number.isFinite(window.start) && Number.isFinite(window.end) && window.end - window.start >= 0.01 * period;
}

export interface PeriodTick {
  value: number;
  latex: string;
}

/** c·T₀ as inline KaTeX with c = p/q, q ∈ {1, 2, 4}: T_0, -T_0/2, 3T_0/4, 2T_0 … (legible at tick size). */
export function periodMultipleLatex(multiple: number): string {
  if (Math.abs(multiple) < 1e-9) return "0";
  const sign = multiple < 0 ? "-" : "";
  const abs = Math.abs(multiple);
  for (const q of [1, 2, 4]) {
    const p = Math.round(abs * q);
    if (Math.abs(p / q - abs) > 1e-9) continue;
    if (q === 1) return `${sign}${p === 1 ? "" : p}T_0`;
    return `${sign}${p === 1 ? "" : p}T_0/${q}`;
  }
  return `${sign}${Number(abs.toPrecision(3))}T_0`;
}

const TICK_STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100] as const;

/** Ticks at clean multiples of T₀ (quarter/half periods when zoomed in) inside the window, ≤ maxTicks. */
export function periodTicks(window: TimeWindow, period: number, maxTicks = 7): PeriodTick[] {
  const span = window.end - window.start;
  if (!(span > 0) || !(period > 0)) return [];
  const step = TICK_STEPS.find((s) => span / (s * period) + 1 <= maxTicks) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const unit = step * period;
  const ticks: PeriodTick[] = [];
  for (let j = Math.ceil(window.start / unit - 1e-9); j * unit <= window.end + unit * 1e-9; j++) {
    ticks.push({ value: j * unit, latex: periodMultipleLatex(j * step) });
  }
  return ticks;
}

/** Real-valued GCD with tolerance (fundamental of harmonically related line frequencies). */
function realGcd(values: number[], tolerance = 1e-6): number {
  let g = values[0];
  for (const v of values.slice(1)) {
    let a = Math.max(g, v);
    let b = Math.min(g, v);
    while (b > tolerance * Math.max(1, a)) {
      const r = a % b;
      a = b;
      b = r < tolerance * Math.max(1, a) || b - r < tolerance * Math.max(1, a) ? 0 : r;
    }
    g = a;
  }
  return g;
}

/**
 * Signal-aware T₀: periodic signals (spectral lines ω_i) → 2π / gcd(ω_i); pulses → twice the extent
 * of the support about t = 0, so one period [−T₀/2, T₀/2] holds the whole pulse with a 50% duty
 * margin. Non-decaying aperiodic signals return null (keep the user's T₀).
 */
export function suggestPeriod(fn: (time: number) => number, lineOmegas: ReadonlyArray<number> = []): number | null {
  const lines = lineOmegas.map(Math.abs).filter((w) => w > 1e-6);
  if (lines.length > 0) {
    const omega0 = realGcd(lines);
    return omega0 > 1e-6 ? Number(((2 * Math.PI) / omega0).toPrecision(6)) : null;
  }
  const support = estimateSupport(fn, 30, 0.01, 1e-4);
  if (support.unbounded) return null;
  const reach = Math.max(Math.abs(support.lo), Math.abs(support.hi));
  const width = support.hi - support.lo;
  if (reach < 1e-3) return null;
  const period = Math.max(2 * width, 2 * reach);
  return Math.max(PERIOD_BOUNDS.min, Math.round(period * 10) / 10);
}
