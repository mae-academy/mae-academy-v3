/**
 * Regression coverage for the three-phase source (validation spec Section I) against the LEGACY
 * engine (TabDSimulationEngine / analogSimulation.ts), NOT ngspice.wasm: spiceAdapter.ts explicitly
 * marks `three-phase-source` unsupported (see mapPart's "Unsupported" switch), so this is the only
 * engine the canvas actually solves it with today. `part`/`wire` are reused from
 * ngspiceRegressionHelpers.ts — plain CircuitComponent/CircuitWire builders, engine-agnostic — but
 * `simulate()` from that file is SPICE-specific and is not used here.
 */

import { describe, expect, it } from "vitest";

import { part, wire } from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { TabDSimulationEngine } from "@/simulators/circuit-engine/engine/analogSimulation";

const FREQUENCY = 50;
// lineVoltage chosen so phase (line-to-neutral) RMS comes out to exactly 230 V, matching the spec.
const LINE_VOLTAGE = 230 * Math.sqrt(3);
const PHASE_PEAK = 230 * Math.SQRT2;

/** Three-phase source with its neutral grounded, no load — for the raw waveform checks. */
function sourceOnly(phaseSequence: "ABC" | "ACB" = "ABC") {
  const components = [
    part("g", "ground"),
    part("v1", "three-phase-source", {
      lineVoltage: LINE_VOLTAGE,
      frequency: FREQUENCY,
      phaseSequence,
    }),
  ];
  const wires = [wire("w1", "v1", "n", "g", "gnd")];
  return { components, wires };
}

/** Adds a balanced 10 Ω wye load (spec's "Test Circuit") to each phase, returning to neutral. */
function withBalancedLoad(resistance = 10) {
  const { components, wires } = sourceOnly();
  return {
    components: [
      ...components,
      part("ra", "resistor", { resistance }),
      part("rb", "resistor", { resistance }),
      part("rc", "resistor", { resistance }),
    ],
    wires: [
      ...wires,
      wire("w2", "v1", "l1", "ra", "a"),
      wire("w3", "ra", "b", "v1", "n"),
      wire("w4", "v1", "l2", "rb", "a"),
      wire("w5", "rb", "b", "v1", "n"),
      wire("w6", "v1", "l3", "rc", "a"),
      wire("w7", "rc", "b", "v1", "n"),
    ],
  };
}

// The engine decouples its own MNA timestep from whatever `elapsedSeconds` is passed to step():
// it always resolves an AC/three-phase source at a *fixed* internal tick of 1/(frequency*50) — a
// hard-coded "minimum 50 samples per cycle" (see analogSimulation.ts step()'s `requiredDt`) — and
// silently replays the last snapshot for any step() call that hasn't yet banked a full tick's worth
// of accumulated elapsedSeconds. Stepping in anything other than that exact tick size either stalls
// (accumulator never crosses the threshold) or free-runs on the generic fallback engine instead of
// the documented one. So every sample here is taken on that native 50-samples/cycle grid.
const SAMPLES_PER_PERIOD = 50;
const ENGINE_TICK = 1 / (FREQUENCY * SAMPLES_PER_PERIOD);

/** Steps the engine over `periods` full cycles on its native tick, recording l1/l2/l3. */
function sampleThreePhase(
  components: ReturnType<typeof sourceOnly>["components"],
  wires: ReturnType<typeof sourceOnly>["wires"],
  periods: number
) {
  const engine = new TabDSimulationEngine();
  engine.setCircuit(components, wires);
  const l1: number[] = [];
  const l2: number[] = [];
  const l3: number[] = [];
  for (let i = 0; i < periods * SAMPLES_PER_PERIOD; i += 1) {
    const snapshot = engine.step(ENGINE_TICK);
    expect(snapshot.converged).toBe(true);
    l1.push(snapshot.terminalVoltages["v1:l1"] ?? NaN);
    l2.push(snapshot.terminalVoltages["v1:l2"] ?? NaN);
    l3.push(snapshot.terminalVoltages["v1:l3"] ?? NaN);
  }
  return { l1, l2, l3 };
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
}

/** Linear interpolation at a fractional sample index — SAMPLES_PER_PERIOD (50) isn't divisible by
 * 3, so a clean 120°-worth-of-samples offset (16.667) has to land between two recorded samples. */
function atFractionalIndex(values: number[], index: number): number {
  const i0 = Math.floor(index);
  const frac = index - i0;
  return values[i0] + frac * (values[i0 + 1] - values[i0]);
}

describe("three-phase source (legacy engine — TabDSimulationEngine)", () => {
  it(
    "Test 1: sums to zero at every instant — VA + VB + VC = 0 (230√2·[sinθ + sin(θ-120°) + sin(θ+120°)])",
    () => {
      const { components, wires } = sourceOnly();
      const { l1, l2, l3 } = sampleThreePhase(components, wires, 2);
      for (let i = 0; i < l1.length; i += 1) {
        expect(l1[i] + l2[i] + l3[i]).toBeCloseTo(0, 6);
      }
    }
  );

  it("Test 2: exactly 120° phase separation — L2 lags L1 by 120°, L3 leads L1 by 120° (ABC sequence)", () => {
    const { components, wires } = sourceOnly("ABC");
    const { l1, l2, l3 } = sampleThreePhase(components, wires, 2);
    // A phase lag of 120° = a time delay of T/3: v_B(t) = v_A(t - T/3), so v_B at sample i equals
    // v_A at sample (i - offset); equivalently v_A[i] should equal v_B[i + offset]. The offset
    // (16.667 samples) is fractional, so the comparison side is interpolated; bounding the linear-
    // interpolation error on a smooth sine over one sample width (Δθ = 7.2°) at ~325 V peak gives
    // well under 1 V, so 2 V of slack safely separates "matches" from "off by a real phase error".
    const offset = SAMPLES_PER_PERIOD / 3;
    for (let i = 0; i < SAMPLES_PER_PERIOD; i += 1) {
      expect(Math.abs(atFractionalIndex(l2, i + offset) - l1[i])).toBeLessThan(2);
      // L3 leads L1 by 120° <=> lags by 240° = 2T/3.
      expect(Math.abs(atFractionalIndex(l3, i + 2 * offset) - l1[i])).toBeLessThan(2);
    }
  });

  it("Test 2b: ACB phaseSequence reverses rotation — L2 leads L1 by 120° instead of lagging", () => {
    const { components, wires } = sourceOnly("ACB");
    const { l1, l2 } = sampleThreePhase(components, wires, 2);
    const offset = SAMPLES_PER_PERIOD / 3;
    // With rotation reversed, L1 now lags L2 by 120°: v_A(t) = v_B(t - T/3).
    for (let i = 0; i < SAMPLES_PER_PERIOD; i += 1) {
      expect(Math.abs(atFractionalIndex(l1, i + offset) - l2[i])).toBeLessThan(2);
    }
  });

  it("Test 3: RMS symmetry — |VA| = |VB| = |VC| = 230 V", () => {
    const { components, wires } = sourceOnly();
    const { l1, l2, l3 } = sampleThreePhase(components, wires, 2);
    for (const phase of [l1, l2, l3]) {
      expect(rms(phase)).toBeCloseTo(230, 1);
    }
    // Peak sanity check against the closed-form 230√2. With only 50 discrete samples/cycle the
    // true continuous peak generally falls between two of them, so the recorded max undershoots
    // it slightly (bounded by A(1-cos(Δθ/2)) ≈ 0.64 V here, Δθ = 360°/50) — never overshoots it.
    const sampledPeak = Math.max(...l1.map(Math.abs));
    expect(sampledPeak).toBeLessThanOrEqual(PHASE_PEAK);
    expect(sampledPeak).toBeGreaterThan(PHASE_PEAK - 1);
  });

  it("Test Circuit: balanced 10 Ω/phase wye load draws 23 A RMS/phase for 15,870 W total, 0 A neutral", () => {
    const { components, wires } = withBalancedLoad(10);
    const engine = new TabDSimulationEngine();
    engine.setCircuit(components, wires);
    const currentA: number[] = [];
    const currentB: number[] = [];
    const currentC: number[] = [];
    const instantaneousPower: number[] = [];
    for (let i = 0; i < 2 * SAMPLES_PER_PERIOD; i += 1) {
      const snapshot = engine.step(ENGINE_TICK);
      expect(snapshot.converged).toBe(true);
      const va = snapshot.terminalVoltages["v1:l1"] ?? NaN;
      const vb = snapshot.terminalVoltages["v1:l2"] ?? NaN;
      const vc = snapshot.terminalVoltages["v1:l3"] ?? NaN;
      const ia = va / 10;
      const ib = vb / 10;
      const ic = vc / 10;
      currentA.push(ia);
      currentB.push(ib);
      currentC.push(ic);
      instantaneousPower.push(va * ia + vb * ib + vc * ic);
    }
    for (const current of [currentA, currentB, currentC]) {
      expect(rms(current)).toBeCloseTo(23, 1);
    }
    // Balanced resistive three-phase load: constant instantaneous total power (no 2ω ripple),
    // matching P = 3 × V_rms² / R = 3 × 230² / 10 = 15,870 W throughout, not just on average.
    for (const p of instantaneousPower) {
      expect(p).toBeCloseTo(15_870, -1);
    }
    // Neutral current is the phasor (here: instantaneous) sum of the three phase currents, which
    // is identically zero for a balanced load — the same identity as Test 1, one Ohm's-law step on.
    for (let i = 0; i < currentA.length; i += 1) {
      expect(currentA[i] + currentB[i] + currentC[i]).toBeCloseTo(0, 4);
    }
  });
});
