/**
 * ngspice.wasm coverage for the three-phase source (validation spec Section I) — the real ngspice
 * binary, same full production pipeline as ngspiceRegression.test.ts (see ngspiceRegressionHelpers).
 * spiceAdapter.ts's `three-phase-source`/`three-phase-rail` mapping emits three independent AC
 * sources (L1/L2/L3 to N, 120° apart), mirroring the legacy engine's own three-phase math so canvas
 * circuits solve the same way on either engine. `connection` (Y/Δ) and `internalR` aren't modelled
 * yet — same gap as the legacy engine.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  part,
  simulate,
  warmupNgspice,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

const FREQUENCY = 50;
const PERIOD = 1 / FREQUENCY;
// lineVoltage chosen so phase (line-to-neutral) RMS comes out to exactly 230 V, matching the spec.
const LINE_VOLTAGE = 230 * Math.sqrt(3);
const PHASE_PEAK = 230 * Math.SQRT2;
// Fine enough to resolve a 50 Hz sine comfortably and give nodeVoltageAt() plenty of interpolation
// resolution; 2 periods is enough for both the pointwise checks and a whole-cycle RMS reading.
const SOURCE_ANALYSIS = [`.tran ${PERIOD / 400} ${2 * PERIOD}`];

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

/** Adds a balanced 10 Ω wye load (spec's "Test Circuit"), one AC ammeter per phase. */
function withBalancedLoad(resistance = 10) {
  const { components, wires } = sourceOnly();
  return {
    components: [
      ...components,
      part("ra", "resistor", { resistance }),
      part("rb", "resistor", { resistance }),
      part("rc", "resistor", { resistance }),
      part("ama", "ammeter", { mode: "AC" }),
      part("amb", "ammeter", { mode: "AC" }),
      part("amc", "ammeter", { mode: "AC" }),
    ],
    wires: [
      ...wires,
      wire("w2", "v1", "l1", "ama", "pos"),
      wire("w3", "ama", "neg", "ra", "a"),
      wire("w4", "ra", "b", "v1", "n"),
      wire("w5", "v1", "l2", "amb", "pos"),
      wire("w6", "amb", "neg", "rb", "a"),
      wire("w7", "rb", "b", "v1", "n"),
      wire("w8", "v1", "l3", "amc", "pos"),
      wire("w9", "amc", "neg", "rc", "a"),
      wire("w10", "rc", "b", "v1", "n"),
    ],
  };
}

describe("three-phase source (ngspice.wasm coverage)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  it(
    "Test 1: sums to zero at every instant — VA + VB + VC = 0 (230√2·[sinθ + sin(θ-120°) + sin(θ+120°)])",
    async () => {
      const { components, wires } = sourceOnly();
      const { nodeVoltageAt } = await simulate(components, wires, "practical", SOURCE_ANALYSIS);
      const steps = 400;
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * 2 * PERIOD;
        const sum =
          nodeVoltageAt("v1", "l1", t) +
          nodeVoltageAt("v1", "l2", t) +
          nodeVoltageAt("v1", "l3", t);
        expect(sum).toBeCloseTo(0, 3);
      }
    },
    RUN_TIMEOUT
  );

  it(
    "Test 2: exactly 120° phase separation — L2 lags L1 by 120°, L3 leads L1 by 120° (ABC sequence)",
    async () => {
      const { components, wires } = sourceOnly("ABC");
      const { nodeVoltageAt } = await simulate(components, wires, "practical", SOURCE_ANALYSIS);
      const offset = PERIOD / 3; // 120° of time delay.
      const steps = 200;
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * PERIOD;
        // v_B(t) = v_A(t - T/3) <=> v_A(t) = v_B(t + T/3).
        expect(nodeVoltageAt("v1", "l2", t + offset)).toBeCloseTo(nodeVoltageAt("v1", "l1", t), 1);
        // L3 leads L1 by 120° <=> lags by 240° = 2T/3.
        expect(nodeVoltageAt("v1", "l3", t + 2 * offset)).toBeCloseTo(nodeVoltageAt("v1", "l1", t), 1);
      }
    },
    RUN_TIMEOUT
  );

  it(
    "Test 2b: ACB phaseSequence reverses rotation — L2 leads L1 by 120° instead of lagging",
    async () => {
      const { components, wires } = sourceOnly("ACB");
      const { nodeVoltageAt } = await simulate(components, wires, "practical", SOURCE_ANALYSIS);
      const offset = PERIOD / 3;
      const steps = 200;
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * PERIOD;
        // With rotation reversed, L1 now lags L2 by 120°: v_A(t) = v_B(t - T/3) <=> v_B(t) = v_A(t + T/3).
        expect(nodeVoltageAt("v1", "l1", t + offset)).toBeCloseTo(nodeVoltageAt("v1", "l2", t), 1);
      }
    },
    RUN_TIMEOUT
  );

  it(
    "Test 3: RMS symmetry — |VA| = |VB| = |VC| = 230 V",
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
      const { readings, nodeVoltageAt } = await simulate(
        withMeters.components,
        withMeters.wires,
        "practical",
        SOURCE_ANALYSIS
      );
      for (const meter of ["vma", "vmb", "vmc"]) {
        expect(readings[meter].status).toBe("ready");
        expect(readings[meter].value).toBeCloseTo(230, 0);
      }
      // Peak sanity check against the closed-form 230√2, sampled finely enough that the true
      // continuous peak is within interpolation reach of a recorded step.
      let peak = 0;
      for (let i = 0; i <= 400; i += 1) {
        peak = Math.max(peak, Math.abs(nodeVoltageAt("v1", "l1", (i / 400) * PERIOD)));
      }
      expect(peak).toBeCloseTo(PHASE_PEAK, 0);
    },
    RUN_TIMEOUT
  );

  it(
    "Test Circuit: balanced 10 Ω/phase wye load draws 23 A RMS/phase, 0 A neutral",
    async () => {
      const { components, wires } = withBalancedLoad(10);
      const { readings, nodeVoltageAt } = await simulate(
        components,
        wires,
        "practical",
        SOURCE_ANALYSIS
      );
      for (const meter of ["ama", "amb", "amc"]) {
        expect(readings[meter].status).toBe("ready");
        expect(readings[meter].value).toBeCloseTo(23, 0);
      }
      // Neutral current is the instantaneous sum of the three phase currents, identically zero for
      // a balanced resistive load — the same zero-sum identity as Test 1, one Ohm's-law step on.
      const steps = 200;
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * PERIOD;
        const ia = nodeVoltageAt("v1", "l1", t) / 10;
        const ib = nodeVoltageAt("v1", "l2", t) / 10;
        const ic = nodeVoltageAt("v1", "l3", t) / 10;
        expect(ia + ib + ic).toBeCloseTo(0, 2);
      }
    },
    RUN_TIMEOUT
  );
});
