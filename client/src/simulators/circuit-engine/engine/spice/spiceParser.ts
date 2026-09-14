/** Structures raw ngspice vectors for the UI and derives multimeter readings from them. */

export interface SpiceSignalStats {
  mean: number;
  rms: number;
  /** Largest absolute value. */
  peak: number;
  peakToPeak: number;
  /** Hertz; 0 for DC or when fewer than two cycles are present. */
  frequency: number;
}

export interface SpiceResults {
  /** Transient time axis; empty for an operating point. */
  time: number[];
  isTransient: boolean;
  /** Keyed by lower-case SPICE node name (`n1`, `x1.spd`). Ground `0` is implicit. */
  nodeVoltages: Record<string, number[]>;
  /** Keyed by lower-case element name (`v1`, `vprobe_…`, `l.x1.la`); positive into the first node. */
  branchCurrents: Record<string, number[]>;
  nodeStats: Record<string, SpiceSignalStats>;
  branchStats: Record<string, SpiceSignalStats>;
}

// Bare keys only: complex AC vectors carry :real/:imag/:phase suffixes, and the bare key is the magnitude.
const VOLTAGE_KEY = /^v\((.+)\)$/i;
const CURRENT_KEY = /^i\((.+)\)$/i;
// ngspice's `.dc` sweep axis, reported as if it were a node.
const SWEEP_SCALE = "v-sweep";
// Schmitt band around the mid-level, as a fraction of peak-to-peak, so edges cannot chatter.
const HYSTERESIS_FRACTION = 0.05;

export function parseSpiceResults(
  rawVectors: Record<string, number[]>,
  timeVector: number[]
): SpiceResults {
  const nodeVoltages: Record<string, number[]> = {};
  const branchCurrents: Record<string, number[]> = {};

  for (const [key, values] of Object.entries(rawVectors)) {
    const voltage = VOLTAGE_KEY.exec(key);
    if (voltage) {
      const node = voltage[1].toLowerCase();
      if (node !== SWEEP_SCALE) nodeVoltages[node] = values;
      continue;
    }
    const current = CURRENT_KEY.exec(key);
    if (current) branchCurrents[current[1].toLowerCase()] = values;
  }

  const isTransient = timeVector.length > 1;
  const statsOf = (vectors: Record<string, number[]>) =>
    Object.fromEntries(
      Object.entries(vectors).map(([name, vector]) => [
        name,
        getSignalStats(
          vector,
          isTransient && vector.length === timeVector.length
            ? timeVector
            : undefined
        ),
      ])
    );

  return {
    time: isTransient ? timeVector : [],
    isTransient,
    nodeVoltages,
    branchCurrents,
    nodeStats: statsOf(nodeVoltages),
    branchStats: statsOf(branchCurrents),
  };
}

/** Voltage between two nodes, sample by sample. Ground `0` — or a node with no vector — reads 0 V. */
export function getDifferential(
  results: SpiceResults,
  positive: string,
  negative: string
): number[] {
  const trace = (node: string) =>
    node === "0" ? undefined : results.nodeVoltages[node.toLowerCase()];
  const a = trace(positive);
  const b = trace(negative);
  const length = Math.max(a?.length ?? 0, b?.length ?? 0);
  return Array.from({ length }, (_, i) => (a?.[i] ?? 0) - (b?.[i] ?? 0));
}

export function getSignalStats(
  vector: number[],
  time?: number[]
): SpiceSignalStats {
  let min = Infinity;
  let max = -Infinity;
  for (const value of vector) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {
    mean: getVmean(vector, time),
    rms: getVrms(vector, time),
    peak: getVpeak(vector),
    peakToPeak: vector.length > 0 ? max - min : 0,
    frequency: time ? getFrequency(vector, time) : 0,
  };
}

/**
 * Mean value. With `time`, integrated over whole periods: ngspice's timestep is adaptive, so a plain
 * sample average over-weights the fast edges where samples cluster.
 */
export function getVmean(vector: number[], time?: number[]): number {
  if (vector.length === 0) return 0;
  const window = measurementWindow(vector, time);
  if (!window)
    return vector.reduce((sum, value) => sum + value, 0) / vector.length;

  let area = 0;
  for (let i = 1; i < window.t.length; i += 1) {
    area +=
      ((window.t[i] - window.t[i - 1]) * (window.v[i] + window.v[i - 1])) / 2;
  }
  return area / (window.t[window.t.length - 1] - window.t[0]);
}

/** True RMS. With `time`, integrated over whole periods for the same reason as `getVmean`. */
export function getVrms(vector: number[], time?: number[]): number {
  if (vector.length === 0) return 0;
  const window = measurementWindow(vector, time);
  if (!window) {
    return Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0) / vector.length
    );
  }

  let area = 0;
  for (let i = 1; i < window.t.length; i += 1) {
    const a = window.v[i - 1];
    const b = window.v[i];
    // Exact integral of the squared linear interpolant, not a trapezoid on v².
    area += ((window.t[i] - window.t[i - 1]) * (a * a + a * b + b * b)) / 3;
  }
  return Math.sqrt(area / (window.t[window.t.length - 1] - window.t[0]));
}

export function getVpeak(vector: number[]): number {
  return vector.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
}

/** Rising mid-level crossings with hysteresis; handles DC offsets and square edges alike. */
export function getFrequency(vector: number[], time: number[]): number {
  const crossings = risingCrossings(vector, time);
  if (crossings.length < 2) return 0;
  return (
    (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0])
  );
}

/** Exported so an educational display can show the exact crossings `getFrequency` counted, rather
 * than a simplified re-derivation that could disagree with the number the app actually reports. */
export function risingCrossings(vector: number[], time: number[]): number[] {
  if (vector.length < 2 || time.length !== vector.length) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const value of vector) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  if (!(span > 1e-12 * Math.max(1, Math.abs(max), Math.abs(min)))) return [];

  const level = (max + min) / 2;
  const rearm = level - span * HYSTERESIS_FRACTION;
  const crossings: number[] = [];
  let armed = vector[0] < rearm;
  for (let i = 1; i < vector.length; i += 1) {
    if (vector[i] < rearm) {
      armed = true;
      continue;
    }
    if (armed && vector[i - 1] < level && vector[i] >= level) {
      const fraction = (level - vector[i - 1]) / (vector[i] - vector[i - 1]);
      crossings.push(time[i - 1] + fraction * (time[i] - time[i - 1]));
      armed = false;
    }
  }
  return crossings;
}

/** A genuine 2-crossing "one period" window only makes sense if that period is a substantial slice
 * of what was actually captured — see the doc comment on measurementWindow for why. */
const MIN_WINDOW_FRACTION_OF_RECORD = 0.15;

/**
 * Samples clipped to whole periods (first to last rising crossing, endpoints interpolated), or the
 * full record when fewer than two crossings exist, or when the crossing-derived window covers only
 * a sliver of what was actually captured. `undefined` when there is no usable time axis.
 *
 * That sliver check matters because a series inductor lets a step/pulse excitation legitimately
 * produce exactly two rising mid-level crossings without the signal being periodic at all —
 * confirmed against real ngspice output on a step into R–L–C (R=1kΩ, L=1mH, C=1µF, heavily
 * overdamped, no true ringing): the inductor briefly holds current at 0, so the R–L junction tracks
 * the source almost instantly up near its final value (crossing #1), dips as inductor current builds
 * over the fast L/R time constant, then climbs back through the same level on the slow RLC settle
 * (crossing #2) — a single transient excursion, not a period. Naively clipping to it as "one period"
 * cut the averaging window down to the first 7% of a 10ms record and read the DC level as ~7.5V
 * instead of the true ~24V. Simply requiring more crossings breaks a real, deliberately-tested case
 * instead (spiceParser.test.ts's "2.1 cycles" fixture: a clean periodic sine only ever produces
 * `floor(cycles)` *interior* crossings — 2 of them here — no matter how many full periods it runs,
 * since t=0 itself is a boundary, not a detected transition). What actually differs between the two:
 * a signal deliberately captured for multiple periods (every AC source in this app's own `.tran`
 * runs, see SPICE_TRAN_PERIODS in Home.tsx) has its "one period" occupy a large share of the total
 * capture (in that fixture, 1 of 2.1 cycles ≈ 48%); the step-response artifact's spurious "period"
 * was 6.9% of a capture sized to show the full settle, not to sample a period. Requiring the window
 * span at least 15% of the record keeps the legitimate case (comfortable 3× margin) and rejects the
 * transient one (2× margin the other way).
 */
function measurementWindow(
  vector: number[],
  time: number[] | undefined
): { t: number[]; v: number[] } | undefined {
  if (!time || time.length !== vector.length || vector.length < 2)
    return undefined;
  if (!(time[time.length - 1] > time[0])) return undefined;

  const crossings = risingCrossings(vector, time);
  const recordSpan = time[time.length - 1] - time[0];
  const windowSpan = crossings.length >= 2 ? crossings[crossings.length - 1] - crossings[0] : 0;
  if (crossings.length < 2 || windowSpan < MIN_WINDOW_FRACTION_OF_RECORD * recordSpan) {
    return { t: time, v: vector };
  }

  const start = crossings[0];
  const end = crossings[crossings.length - 1];
  const t = [start];
  const v = [interpolate(vector, time, start)];
  for (let i = 0; i < time.length; i += 1) {
    if (time[i] > start && time[i] < end) {
      t.push(time[i]);
      v.push(vector[i]);
    }
  }
  t.push(end);
  v.push(interpolate(vector, time, end));
  return { t, v };
}

function interpolate(vector: number[], time: number[], at: number): number {
  for (let i = 1; i < time.length; i += 1) {
    if (time[i] >= at) {
      const span = time[i] - time[i - 1];
      if (!(span > 0)) return vector[i];
      return (
        vector[i - 1] +
        ((at - time[i - 1]) / span) * (vector[i] - vector[i - 1])
      );
    }
  }
  return vector[vector.length - 1];
}
