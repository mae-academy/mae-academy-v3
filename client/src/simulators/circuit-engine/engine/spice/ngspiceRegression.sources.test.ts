/**
 * ngspice.wasm coverage for the three-phase source (validation spec Section I) — the real ngspice
 * binary, same full production pipeline as ngspiceRegression.test.ts (see ngspiceRegressionHelpers).
 * spiceAdapter.ts's `three-phase-source`/`three-phase-rail` mapping emits three independent AC
 * sources (L1/L2/L3 to N, 120° apart), mirroring the legacy engine's own three-phase math so canvas
 * circuits solve the same way on either engine. `connection` (Y/Δ) and `internalR` aren't modelled
 * yet — same gap as the legacy engine.
 *
 * Phase/magnitude extraction goes through `extractPhasor` (a single-frequency Fourier projection)
 * rather than raw point-by-point waveform comparison — it reads a genuine angle in degrees off the
 * simulated waveform, so `calculatePhaseAngleDifference`/`calculatePhasorSum` are exercised against
 * real ngspice output, not just against each other.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  calculatePhaseAngleDifference,
  calculatePhasorSum,
  calculateRMSVoltage,
  extractPhasor,
  part,
  simulate,
  verifyRelationship,
  warmupNgspice,
  wire,
  type Phasor,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { computeThreePhaseVoltages } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";

const FREQUENCY = 50;
const PERIOD = 1 / FREQUENCY;
const LINE_VOLTAGE = 400;
const { phaseVoltage: PHASE_VOLTAGE, peakVoltage: PEAK_VOLTAGE } =
  computeThreePhaseVoltages(LINE_VOLTAGE);
// 2 whole periods, 400 samples/period — plenty of resolution for extractPhasor's projection
// integral (accurate over a whole number of cycles) and for nodeVoltageAt's interpolation.
const SAMPLES_PER_PERIOD = 400;
const SOURCE_ANALYSIS = [`.tran ${PERIOD / SAMPLES_PER_PERIOD} ${2 * PERIOD}`];

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

/**
 * Balanced (or, with distinct resistances, unbalanced) wye load, one AC ammeter per phase, plus a
 * fourth ammeter in the actual neutral conductor between the load's own star point and the source's.
 *
 * The three loads must return to a *separate* load star point, not straight to v1's own "n" —
 * wiring ra/rb/rc directly onto v1:n (as the earlier 10 Ω balanced-load test in this file's previous
 * revision did) makes each phase a fully self-contained loop through its own source, ammeter and
 * resistor; the "neutral" ammeter then sees a tautological 0 A regardless of balance, since there is
 * no separate load-side node for any imbalance current to be measured crossing. Real 4-wire Y
 * systems have a genuine neutral conductor between two distinct star points — this reproduces that.
 */
function withWyeLoad(ra: number, rb: number, rc: number) {
  const { components, wires } = sourceOnly();
  return {
    components: [
      ...components,
      part("ra", "resistor", { resistance: ra }),
      part("rb", "resistor", { resistance: rb }),
      part("rc", "resistor", { resistance: rc }),
      part("ama", "ammeter", { mode: "AC" }),
      part("amb", "ammeter", { mode: "AC" }),
      part("amc", "ammeter", { mode: "AC" }),
      part("amn", "ammeter", { mode: "AC" }),
    ],
    wires: [
      ...wires, // v1:n -> ground (the source's own star point).
      wire("w2", "v1", "l1", "ama", "pos"),
      wire("w3", "ama", "neg", "ra", "a"),
      wire("w4", "ra", "b", "amn", "pos"), // -> load star point.
      wire("w5", "v1", "l2", "amb", "pos"),
      wire("w6", "amb", "neg", "rb", "a"),
      wire("w7", "rb", "b", "amn", "pos"), // -> load star point.
      wire("w8", "v1", "l3", "amc", "pos"),
      wire("w9", "amc", "neg", "rc", "a"),
      wire("w10", "rc", "b", "amn", "pos"), // -> load star point.
      wire("w11", "amn", "neg", "g", "gnd"), // the neutral conductor, load star point -> source star point.
    ],
  };
}

/** Samples one component terminal's `.tran` trace at SAMPLES_PER_PERIOD resolution over `periods`
 * cycles, for feeding into `extractPhasor`. */
function sampleSeries(
  nodeVoltageAt: (componentId: string, terminal: string, atTime: number) => number,
  componentId: string,
  terminal: string,
  periods: number
): { time: number[]; values: number[] } {
  const time: number[] = [];
  const values: number[] = [];
  const steps = periods * SAMPLES_PER_PERIOD;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / SAMPLES_PER_PERIOD) * PERIOD;
    time.push(t);
    values.push(nodeVoltageAt(componentId, terminal, t));
  }
  return { time, values };
}

/** Extracts each phase's peak-magnitude/angle Phasor (relative to t=0) from a `.tran` run's
 * L1/L2/L3-to-neutral traces, over exactly 2 whole periods. */
async function threePhasePhasors(
  components: Parameters<typeof simulate>[0],
  wires: Parameters<typeof simulate>[1]
): Promise<{ l1: Phasor; l2: Phasor; l3: Phasor }> {
  const { nodeVoltageAt } = await simulate(components, wires, "practical", SOURCE_ANALYSIS);
  const phasorFor = (terminal: string) => {
    const { time, values } = sampleSeries(nodeVoltageAt, "v1", terminal, 2);
    return extractPhasor(time, values, FREQUENCY);
  };
  return { l1: phasorFor("l1"), l2: phasorFor("l2"), l3: phasorFor("l3") };
}

describe("three-phase source (ngspice.wasm coverage)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  it(
    "computeThreePhaseVoltages: 400 V line gives 230.94 V phase and 326.6 V peak",
    () => {
      // Pure math, no simulation — the same identities the SPICE mapping itself uses.
      expect(PHASE_VOLTAGE).toBeCloseTo(230.94, 2);
      expect(PEAK_VOLTAGE).toBeCloseTo(230.94 * Math.SQRT2, 2);
      expect(calculateRMSVoltage(PEAK_VOLTAGE)).toBeCloseTo(PHASE_VOLTAGE, 6);
    }
  );

  it(
    "measures line-to-line voltage as 400 V ±2% between every pair of phases",
    async () => {
      const { components, wires } = sourceOnly();
      const withMeters = {
        components: [
          ...components,
          part("vm12", "voltmeter", { mode: "AC" }),
          part("vm23", "voltmeter", { mode: "AC" }),
          part("vm31", "voltmeter", { mode: "AC" }),
        ],
        wires: [
          ...wires,
          wire("w2", "vm12", "pos", "v1", "l1"),
          wire("w3", "vm12", "neg", "v1", "l2"),
          wire("w4", "vm23", "pos", "v1", "l2"),
          wire("w5", "vm23", "neg", "v1", "l3"),
          wire("w6", "vm31", "pos", "v1", "l3"),
          wire("w7", "vm31", "neg", "v1", "l1"),
        ],
      };
      const { readings } = await simulate(
        withMeters.components,
        withMeters.wires,
        "practical",
        SOURCE_ANALYSIS
      );
      const tolerance = LINE_VOLTAGE * 0.02;
      for (const meter of ["vm12", "vm23", "vm31"]) {
        expect(readings[meter].status).toBe("ready");
        expect(verifyRelationship(readings[meter].value, LINE_VOLTAGE, tolerance)).toBe(true);
      }
    },
    RUN_TIMEOUT
  );

  it(
    "measures phase (line-to-neutral) voltage as 230.94 V ±2% on every phase",
    async () => {
      const { components, wires } = sourceOnly();
      const withMeters = {
        components: [
          ...components,
          part("vma", "voltmeter", { mode: "AC" }),
          part("vmb", "voltmeter", { mode: "AC" }),
          part("vmc", "voltmeter", { mode: "AC" }),
        ],
        wires: [
          ...wires,
          wire("w2", "vma", "pos", "v1", "l1"),
          wire("w3", "vma", "neg", "v1", "n"),
          wire("w4", "vmb", "pos", "v1", "l2"),
          wire("w5", "vmb", "neg", "v1", "n"),
          wire("w6", "vmc", "pos", "v1", "l3"),
          wire("w7", "vmc", "neg", "v1", "n"),
        ],
      };
      const { readings } = await simulate(
        withMeters.components,
        withMeters.wires,
        "practical",
        SOURCE_ANALYSIS
      );
      const tolerance = PHASE_VOLTAGE * 0.02;
      for (const meter of ["vma", "vmb", "vmc"]) {
        expect(readings[meter].status).toBe("ready");
        expect(verifyRelationship(readings[meter].value, PHASE_VOLTAGE, tolerance)).toBe(true);
      }
    },
    RUN_TIMEOUT
  );

  it.each(["ABC", "ACB"] as const)(
    "verifies 120° phase separation ±3° between consecutive phases (%s sequence)",
    async sequence => {
      const { components, wires } = sourceOnly(sequence);
      const { l1, l2, l3 } = await threePhasePhasors(components, wires);
      const expectedL2 = sequence === "ACB" ? 120 : -120;
      const expectedL3 = sequence === "ACB" ? -120 : 120;
      expect(
        verifyRelationship(calculatePhaseAngleDifference(l1.angleDegrees, l2.angleDegrees), expectedL2, 3)
      ).toBe(true);
      expect(
        verifyRelationship(calculatePhaseAngleDifference(l1.angleDegrees, l3.angleDegrees), expectedL3, 3)
      ).toBe(true);
      // Consecutive-phase separation either way round the rotation is 120°, regardless of sequence.
      expect(
        Math.abs(calculatePhaseAngleDifference(l2.angleDegrees, l3.angleDegrees))
      ).toBeCloseTo(120, 0);
    },
    RUN_TIMEOUT
  );

  it(
    "verifies the phasor sum VL1N + VL2N + VL3N = 0 (phasor-diagram correctness)",
    async () => {
      const { components, wires } = sourceOnly();
      const { l1, l2, l3 } = await threePhasePhasors(components, wires);
      // Each phasor should read back at ~PEAK_VOLTAGE (extractPhasor returns peak, not RMS).
      for (const phasor of [l1, l2, l3]) {
        expect(verifyRelationship(phasor.magnitude, PEAK_VOLTAGE, PEAK_VOLTAGE * 0.02)).toBe(true);
      }
      const resultant = calculatePhasorSum(l1, l2, l3);
      expect(verifyRelationship(resultant.magnitude, 0, PEAK_VOLTAGE * 0.01)).toBe(true);
    },
    RUN_TIMEOUT
  );

  it(
    "3-phase Y, 400 V, balanced 1 kΩ/phase load: draws 230.94 mA RMS/phase and ≈0 A neutral",
    async () => {
      const { components, wires } = withWyeLoad(1000, 1000, 1000);
      const { readings } = await simulate(components, wires, "practical", SOURCE_ANALYSIS);
      const expectedCurrent = PHASE_VOLTAGE / 1000;
      for (const meter of ["ama", "amb", "amc"]) {
        expect(readings[meter].status).toBe("ready");
        expect(
          verifyRelationship(readings[meter].value, expectedCurrent, expectedCurrent * 0.02)
        ).toBe(true);
      }
      expect(readings.amn.status).toBe("ready");
      expect(verifyRelationship(readings.amn.value, 0, expectedCurrent * 0.02)).toBe(true);
    },
    RUN_TIMEOUT
  );

  it(
    "3-phase Y, 400 V, unbalanced load (1 kΩ/2 kΩ/3 kΩ): neutral current is well above 0 A",
    async () => {
      const { components, wires } = withWyeLoad(1000, 2000, 3000);
      const { readings } = await simulate(components, wires, "practical", SOURCE_ANALYSIS);
      expect(readings.amn.status).toBe("ready");
      // Unequal phase currents (230.94 mA / 115.5 mA / 77.0 mA) leave a genuine residual — well
      // clear of the balanced case's near-zero reading, not just outside a tight tolerance band.
      expect(readings.amn.value).toBeGreaterThan(0.03);
    },
    RUN_TIMEOUT
  );
});
