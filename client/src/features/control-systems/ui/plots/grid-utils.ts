/**
 * Standard 1-2-5 Decade Scale sequence.
 * Multiples of 1, 2, and 5 scaled across powers of 10.
 */
export const DECADE_STEPS: readonly number[] = [
  0.001, 0.002, 0.005,
  0.01, 0.02, 0.05,
  0.1, 0.2, 0.5,
  1, 2, 5,
  10, 20, 50,
  100, 200, 500,
  1000,
] as const;

/**
 * Snaps any positive target interval to the closest standard 1-2-5 decade step.
 * Uses logarithmic distance comparison which is mathematically optimal for decade scales.
 */
export function findClosestDecadeStep(val: number): number {
  if (!isFinite(val) || val <= 0) return 1;
  if (val <= DECADE_STEPS[0]) return DECADE_STEPS[0];
  if (val >= DECADE_STEPS[DECADE_STEPS.length - 1]) return DECADE_STEPS[DECADE_STEPS.length - 1];

  let bestStep: number = DECADE_STEPS[0];
  let minLogDiff = Infinity;
  const targetLog = Math.log10(val);

  for (let i = 0; i < DECADE_STEPS.length; i++) {
    const step = DECADE_STEPS[i];
    const diff = Math.abs(targetLog - Math.log10(step));
    if (diff < minLogDiff) {
      minLogDiff = diff;
      bestStep = step;
    }
  }
  return bestStep;
}

/**
 * Returns the next larger step in the 1-2-5 decade series.
 */
export function getNextDecadeStep(current: number): number {
  const closest = findClosestDecadeStep(current);
  const idx = DECADE_STEPS.indexOf(closest as any);
  if (idx >= 0 && idx < DECADE_STEPS.length - 1) {
    return DECADE_STEPS[idx + 1];
  }
  return closest;
}

/**
 * Returns the previous smaller step in the 1-2-5 decade series.
 */
export function getPrevDecadeStep(current: number): number {
  const closest = findClosestDecadeStep(current);
  const idx = DECADE_STEPS.indexOf(closest as any);
  if (idx > 0) {
    return DECADE_STEPS[idx - 1];
  }
  return closest;
}

/**
 * Formats a decade step value for display in compact UI controls (steppers / dropdowns).
 */
export function formatStepDisplay(step: number): string {
  if (step >= 1) {
    return step.toString();
  }
  return Number(step.toFixed(4)).toString();
}

/**
 * Formats a coordinate number for axis tick labels without trailing decimal zeroes.
 */
export function formatTickNumber(val: number): string {
  const abs = Math.abs(val);
  if (abs < 1e-6) return "0";
  return Number(abs.toFixed(4)).toString();
}

/**
 * Formats a real axis tick label.
 */
export function formatRealTick(val: number): string {
  if (Math.abs(val) < 1e-6) return "0";
  const formatted = formatTickNumber(val);
  return val < 0 ? `-${formatted}` : formatted;
}

/**
 * Generates an array of tick coordinates strictly aligned to integer multiples (k * step)
 * within the given range [min, max].
 */
export function getAlignedGridTicks(
  min: number,
  max: number,
  step: number,
  maxTicks = 200
): number[] {
  if (step <= 0 || !isFinite(step) || !isFinite(min) || !isFinite(max) || min > max) {
    return [];
  }

  const ticks: number[] = [];
  const startMultiplier = Math.floor(min / step);
  const endMultiplier = Math.ceil(max / step);

  let count = 0;
  for (let k = startMultiplier; k <= endMultiplier && count < maxTicks; k++) {
    count++;
    const rawVal = k * step;
    const cleanVal = Math.abs(rawVal) < 1e-9 ? 0 : Number(rawVal.toFixed(6));
    if (cleanVal >= min - step * 0.01 && cleanVal <= max + step * 0.01) {
      ticks.push(cleanVal);
    }
  }

  return ticks;
}
