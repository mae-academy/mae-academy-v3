import type { FluidMedium } from './fluidCatalog';

interface PressureScale {
  /** Pressure in bar from which a line counts as carrying working pressure. */
  working: number;
  high: string;
  low: string;
  empty: string;
}

export const PRESSURE_SCALE: Record<FluidMedium, PressureScale> = {
  // Supply blue, trapped / reduced cyan, exhausted slate.
  PNEUMATIC: { working: 4, high: '#0284c7', low: '#38bdf8', empty: '#94a3b8' },
  // Working pressure deep red, partial pressure orange, tank return grey.
  HYDRAULIC: { working: 40, high: '#b91c1c', low: '#ea580c', empty: '#64748b' },
};

/** Below this a line reads as empty (atmosphere / tank). */
const EMPTY_BAR = 0.01;

/** Colour of a pipe carrying `pressure` bar. */
export function pressureColor(pressure: number, medium: FluidMedium): string {
  const scale = PRESSURE_SCALE[medium];
  if (pressure >= scale.working) return scale.high;
  return pressure > EMPTY_BAR ? scale.low : scale.empty;
}
