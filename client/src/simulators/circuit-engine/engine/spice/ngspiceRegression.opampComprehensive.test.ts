/**
 * Op-amp regression suite: every archetypal configuration, each asserted against its closed-form
 * result rather than against a previously recorded number.
 *
 * The bug this suite exists to lock down: the `opamp` part shipped with an open-loop gain of
 * 10 V/V. That is not a weak op-amp, it is a different circuit — an inverting integrator built
 * around it has the exact transfer function −A/(1 + sRC(A + 1)), a first-order lag with
 * τ_eff = RC(A + 1) = 11 ms at R = 1 kΩ, C = 1 µF, so a 2 V step produced the exponential
 * 20(1 − e^(−t/11ms)) instead of the textbook −(1/RC)∫V_in dt ramp. `integrator ramp` below
 * asserts the ramp *and* explicitly rejects that exponential, so the regression cannot come back
 * disguised as "close enough at 100 ms" (both curves end at 20 V — they differ only in shape).
 *
 * Everything here runs the full production pipeline through real ngspice.wasm, exactly as the
 * canvas does: convertToSpiceComponents → generateNetlist → ngspice → parseSpiceResults.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  part,
  RUN_TIMEOUT,
  simulate,
  warmupNgspice,
  WASM_BOOT_TIMEOUT,
  wire,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { convertToSpiceComponents, resolveCircuitNets } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";
import { requiresTransientInitialConditions } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import { MIN_OPAMP_GAIN } from "@/simulators/circuit-engine/engine/spice/spiceTypes";
import { getDef } from "@shared/circuit/componentDefs";
import type { CircuitComponent, CircuitWire } from "@shared/circuit/circuitTypes";
import {
  OPAMP_COMPARATOR,
  OPAMP_DIFFERENTIATOR,
  OPAMP_IDEAL_INTEGRATOR,
  OPAMP_SCHMITT_TRIGGER,
  OPAMP_SUMMING_AMPLIFIER,
  type ExampleDefinition,
} from "@/simulators/circuit-engine/examples";

/** ±30 V rails, so a ramp to +20 V is a linearity result and not a clipping result. */
const WIDE_RAILS = 30;

/** Least-squares fit of `values` against `time`, plus the worst residual against that fit. */
function linearFit(
  time: number[],
  values: number[]
): { slope: number; intercept: number; maxResidual: number } {
  const n = time.length;
  const meanT = time.reduce((a, b) => a + b, 0) / n;
  const meanV = values.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (time[i] - meanT) * (values[i] - meanV);
    sxx += (time[i] - meanT) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = meanV - slope * meanT;
  const maxResidual = Math.max(
    ...values.map((v, i) => Math.abs(v - (slope * time[i] + intercept)))
  );
  return { slope, intercept, maxResidual };
}

/** Peak amplitude of a waveform over the window `[from, to]`, ignoring the turn-on transient. */
function peakBetween(
  time: number[],
  values: number[],
  from: number,
  to: number
): number {
  let peak = 0;
  for (let i = 0; i < time.length; i += 1) {
    if (time[i] < from || time[i] > to) continue;
    peak = Math.max(peak, Math.abs(values[i]));
  }
  return peak;
}

type VoltageAt = (componentId: string, terminal: string, atTime: number) => number;

/** Peak |V| at one terminal over `[from, to]`, densely resampled from the interpolated trace. */
function terminalPeak(
  voltageAt: VoltageAt,
  componentId: string,
  terminal: string,
  from: number,
  to: number,
  samples = 2000
): number {
  let peak = 0;
  for (let i = 0; i <= samples; i += 1) {
    const t = from + ((to - from) * i) / samples;
    peak = Math.max(peak, Math.abs(voltageAt(componentId, terminal, t)));
  }
  return peak;
}

/** A grounded op-amp stage: `in+` to ground, with a caller-supplied inverting-side network. */
function groundedNonInvertingInput(opAmpId: string, groundId: string, wireId: string): CircuitWire {
  return wire(wireId, opAmpId, "in+", groundId, "gnd");
}

describe("op-amp behavioural model — comprehensive regression", () => {
  beforeAll(async () => {
    await warmupNgspice();
  }, WASM_BOOT_TIMEOUT);

  /* ------------------------------------------------------------------ default parameters --- */

  describe("defaults", () => {
    it("the placed part carries a textbook open-loop gain, not a scalar one", () => {
      const definition = getDef("opamp");
      expect(definition).toBeDefined();
      const gain = definition!.properties.gain;
      expect(Number(gain.value)).toBeGreaterThanOrEqual(MIN_OPAMP_GAIN);
      // The floor has to hold for anything a student can dial in too, not only for the default.
      expect(Number(gain.min)).toBeGreaterThanOrEqual(MIN_OPAMP_GAIN);
      expect(definition!.properties.model.value).toBe("ideal");
    });

    it("lifts a legacy circuit saved with gain 10 back above the floor", () => {
      const components = [
        part("g", "ground"),
        part("u1", "opamp", { gain: 10, vcc: 15 }),
      ];
      const wires = [wire("w1", "u1", "in+", "g", "gnd")];
      const nets = resolveCircuitNets(components, wires);
      const spice = convertToSpiceComponents(components, wires, nets, "practical");
      const opAmp = spice.find(element => element.kind === "opamp");
      expect(opAmp).toBeDefined();
      expect(opAmp!.kind === "opamp" && opAmp!.gain).toBeGreaterThanOrEqual(MIN_OPAMP_GAIN);
    });
  });

  /* ------------------------------------------------------------------------- integrator --- */

  /**
   * The mission circuit: 2 V DC → R4 (1 kΩ) → inverting integrator U1 (C1 = 1 µF) → unity-gain
   * inverter U2 (R2 = R3 = 1 kΩ). Textbook result at U2's output:
   *
   *     V_out(t) = +(1/R4·C1)·V_in·t = +2000·t V/s = +2 V/ms   ⇒   +20 V at t = 10 ms
   */
  function integratorWithInverter(
    resistance: number,
    capacitance: number,
    inputVoltage: number
  ): { components: CircuitComponent[]; wires: CircuitWire[] } {
    const components = [
      part("g", "ground"),
      part("v1", "dc-voltage", { voltage: inputVoltage, internalR: 0 }),
      part("r4", "resistor", { resistance }),
      part("c1", "capacitor", { capacitance }),
      part("u1", "opamp", { model: "ideal", vcc: WIDE_RAILS }),
      part("r2", "resistor", { resistance: 1000 }),
      part("r3", "resistor", { resistance: 1000 }),
      part("u2", "opamp", { model: "ideal", vcc: WIDE_RAILS }),
    ];
    const wires = [
      wire("w1", "v1", "pos", "r4", "a"),
      wire("w2", "v1", "neg", "g", "gnd"),
      // Integrating stage: C1 is the ONLY path from out back to in-, so there is no DC feedback.
      wire("w3", "r4", "b", "u1", "in-"),
      wire("w4", "u1", "in-", "c1", "a"),
      wire("w5", "c1", "b", "u1", "out"),
      groundedNonInvertingInput("u1", "g", "w6"),
      // Unity-gain inverter, so the scope reads the positive ramp the schematic advertises.
      wire("w7", "u1", "out", "r2", "a"),
      wire("w8", "r2", "b", "u2", "in-"),
      wire("w9", "u2", "in-", "r3", "a"),
      wire("w10", "r3", "b", "u2", "out"),
      groundedNonInvertingInput("u2", "g", "w11"),
    ];
    return { components, wires };
  }

  it(
    "integrator ramp: +2 V/ms, reaching +20 V at 10 ms, linear rather than exponential",
    async () => {
      const { components, wires } = integratorWithInverter(1000, 1e-6, 2);
      const { results, nodeVoltageAt } = await simulate(
        components,
        wires,
        "practical",
        [".tran 5e-5 0.1 uic"]
      );

      // Closed form: dV/dt = V_in / (R·C) = 2 / (1e3 · 1e-6) = 2000 V/s.
      for (const [milliseconds, expected] of [
        [2.5, 5],
        [5, 10],
        [7.5, 15],
        [10, 20],
      ] as const) {
        const measured = nodeVoltageAt("u2", "out", milliseconds / 1000);
        expect(Math.abs(measured - expected)).toBeLessThan(expected * 0.01);
      }

      // Linearity over the whole pre-saturation window, not just at the four checkpoints: the
      // A = 10 bug also passed through 0 V and 20 V, it simply curved in between.
      const outputName = Object.keys(results.nodeVoltages).find(name =>
        results.nodeVoltages[name].some(v => v > 19)
      );
      expect(outputName).toBeDefined();
      const trace = results.nodeVoltages[outputName!];
      const window = results.time
        .map((t, i) => ({ t, v: trace[i] }))
        .filter(sample => sample.t >= 0.001 && sample.t <= 0.01);
      const fit = linearFit(window.map(s => s.t), window.map(s => s.v));
      expect(fit.slope).toBeCloseTo(2000, -1); // 2000 V/s ± 5 V/s
      expect(Math.abs(fit.slope - 2000)).toBeLessThan(2000 * 0.01);
      // A true ramp; the 11 ms exponential deviates from its own best-fit line by ~0.8 V here.
      expect(fit.maxResidual).toBeLessThan(0.05);

      // And an explicit rejection of the old first-order-lag shape, at the point the two curves
      // differ clearly: 20(1 − e^(−t/11ms)) reads 7.30 V at 5 ms, the ramp reads 10 V.
      const lagPrediction = 20 * (1 - Math.exp(-0.005 / 0.011));
      expect(Math.abs(nodeVoltageAt("u2", "out", 0.005) - lagPrediction)).toBeGreaterThan(1.5);
    },
    RUN_TIMEOUT
  );

  it(
    "integrator slope tracks 1/RC across component values",
    async () => {
      const cases = [
        { resistance: 2000, capacitance: 1e-6, input: 2, slope: 1000 },
        { resistance: 10000, capacitance: 1e-7, input: 1, slope: 1000 },
        { resistance: 1000, capacitance: 4.7e-7, input: 1, slope: 1 / (1000 * 4.7e-7) },
      ];
      for (const testCase of cases) {
        const { components, wires } = integratorWithInverter(
          testCase.resistance,
          testCase.capacitance,
          testCase.input
        );
        const { nodeVoltageAt } = await simulate(components, wires, "practical", [
          ".tran 5e-6 0.01 uic",
        ]);
        const early = nodeVoltageAt("u2", "out", 0.002);
        const late = nodeVoltageAt("u2", "out", 0.008);
        const slope = (late - early) / 0.006;
        expect(Math.abs(slope - testCase.slope)).toBeLessThan(testCase.slope * 0.01);
      }
    },
    RUN_TIMEOUT * 3
  );

  it("flags the integrator topology as needing transient initial conditions", () => {
    const { components, wires } = integratorWithInverter(1000, 1e-6, 2);
    const nets = resolveCircuitNets(components, wires);
    const spice = convertToSpiceComponents(components, wires, nets, "practical");
    expect(requiresTransientInitialConditions(spice)).toBe(true);

    // The same stage with a DC feedback resistor across C1 has a well-defined bias point and keeps
    // ngspice's own `.op`.
    const damped = [...components, part("rdc", "resistor", { resistance: 1e6 })];
    const dampedWires = [
      ...wires,
      wire("wdc1", "u1", "in-", "rdc", "a"),
      wire("wdc2", "rdc", "b", "u1", "out"),
    ];
    const dampedNets = resolveCircuitNets(damped, dampedWires);
    expect(
      requiresTransientInitialConditions(
        convertToSpiceComponents(damped, dampedWires, dampedNets, "practical")
      )
    ).toBe(false);
  });

  /* ----------------------------------------------------------------------- differentiator --- */

  it(
    "differentiator turns a triangle into a square at −Rf·C·dV/dt",
    async () => {
      const frequency = 100;
      const period = 1 / frequency;
      const amplitude = 1;
      const feedback = 10000;
      const capacitance = 1e-7;
      // A triangle of peak A at frequency f ramps at 4·A·f volts per second.
      const rampRate = 4 * amplitude * frequency;
      const expected = feedback * capacitance * rampRate;

      const components = [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude, frequency, waveform: "triangle", offset: 0 }),
        // Series damping: a bare C on the summing node puts a zero in the loop gain and the stage
        // oscillates. Its corner (1/(2π·Rs·C) = 16 kHz) sits far above the 100 Hz signal.
        part("rs", "resistor", { resistance: 100 }),
        part("cin", "capacitor", { capacitance }),
        part("rf", "resistor", { resistance: feedback }),
        part("u1", "opamp", { model: "ideal", vcc: 15 }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "rs", "a"),
        wire("w2", "rs", "b", "cin", "a"),
        wire("w3", "cin", "b", "u1", "in-"),
        wire("w4", "u1", "in-", "rf", "a"),
        wire("w5", "rf", "b", "u1", "out"),
        groundedNonInvertingInput("u1", "g", "w6"),
        wire("w7", "vin", "neg", "g", "gnd"),
      ];

      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${period / 400} ${period * 4}`,
      ]);

      // ngspice's triangle starts at its trough, so it rises through the first half period and
      // falls through the second; the inverting differentiator's output is the opposite sign.
      const onRisingRamp = nodeVoltageAt("u1", "out", period * 2 + period * 0.25);
      const onFallingRamp = nodeVoltageAt("u1", "out", period * 2 + period * 0.75);
      expect(onRisingRamp).toBeLessThan(0);
      expect(onFallingRamp).toBeGreaterThan(0);
      expect(Math.abs(Math.abs(onRisingRamp) - expected)).toBeLessThan(expected * 0.05);
      expect(Math.abs(Math.abs(onFallingRamp) - expected)).toBeLessThan(expected * 0.05);
    },
    RUN_TIMEOUT
  );

  it(
    "differentiator turns a square edge into a decaying spike",
    async () => {
      const frequency = 100;
      const period = 1 / frequency;
      const components = [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude: 1, frequency, waveform: "square", offset: 0 }),
        part("rs", "resistor", { resistance: 100 }),
        part("cin", "capacitor", { capacitance: 1e-7 }),
        part("rf", "resistor", { resistance: 10000 }),
        part("u1", "opamp", { model: "ideal", vcc: 15 }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "rs", "a"),
        wire("w2", "rs", "b", "cin", "a"),
        wire("w3", "cin", "b", "u1", "in-"),
        wire("w4", "u1", "in-", "rf", "a"),
        wire("w5", "rf", "b", "u1", "out"),
        groundedNonInvertingInput("u1", "g", "w6"),
        wire("w7", "vin", "neg", "g", "gnd"),
      ];
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${period / 4000} ${period * 3}`,
      ]);
      // A spike at every edge, and essentially nothing between them: dV/dt of a flat level is 0.
      const spike = terminalPeak(nodeVoltageAt, "u1", "out", period, period * 3, 12000);
      expect(spike).toBeGreaterThan(1);
      const flat = Math.abs(nodeVoltageAt("u1", "out", period * 1.25));
      expect(flat).toBeLessThan(spike * 0.05);
    },
    RUN_TIMEOUT
  );

  /* ---------------------------------------------------------- comparator & Schmitt trigger --- */

  it(
    "open-loop comparator clamps hard at each rail",
    async () => {
      const supply = 12;
      for (const [signal, reference, expected] of [
        [3, 1, supply],
        [1, 3, -supply],
      ] as const) {
        const components = [
          part("g", "ground"),
          part("vsig", "dc-voltage", { voltage: signal, internalR: 0 }),
          part("vref", "dc-voltage", { voltage: reference, internalR: 0 }),
          part("u1", "opamp", { model: "ideal", vcc: supply }),
          part("rload", "resistor", { resistance: 100000 }),
        ];
        const wires = [
          wire("w1", "vsig", "pos", "u1", "in+"),
          wire("w2", "vsig", "neg", "g", "gnd"),
          wire("w3", "vref", "pos", "u1", "in-"),
          wire("w4", "vref", "neg", "g", "gnd"),
          wire("w5", "u1", "out", "rload", "a"),
          wire("w6", "rload", "b", "g", "gnd"),
        ];
        const { nodeVoltage } = await simulate(components, wires, "practical", [".op"]);
        // No soft settling: a 2 V overdrive against A = 1e6 is deep into saturation.
        expect(Math.abs(nodeVoltage("u1", "out") - expected)).toBeLessThan(0.01);
      }
    },
    RUN_TIMEOUT * 2
  );

  it(
    "non-inverting Schmitt trigger trips at ±V_sat·R1/R2",
    async () => {
      const supply = 12;
      const r1 = 10000;
      const r2 = 100000;
      const expectedTrip = (supply * r1) / r2; // ±1.2 V
      const frequency = 100;
      const period = 1 / frequency;

      const components = [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude: 3, frequency, waveform: "triangle", offset: 0 }),
        part("r1", "resistor", { resistance: r1 }),
        part("r2", "resistor", { resistance: r2 }),
        part("u1", "opamp", { model: "ideal", vcc: supply }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "r1", "a"),
        wire("w2", "vin", "neg", "g", "gnd"),
        // Positive feedback onto in+ — the whole point of a Schmitt trigger.
        wire("w3", "r1", "b", "u1", "in+"),
        wire("w4", "u1", "in+", "r2", "a"),
        wire("w5", "r2", "b", "u1", "out"),
        wire("w6", "u1", "in-", "g", "gnd"),
      ];

      const { results } = await simulate(components, wires, "practical", [
        `.tran ${period / 4000} ${period * 2}`,
      ]);
      const outName = Object.keys(results.nodeVoltages).find(name =>
        results.nodeVoltages[name].some(v => v > supply * 0.9)
      );
      const inName = Object.keys(results.nodeVoltages).find(name => {
        const trace = results.nodeVoltages[name];
        const peak = Math.max(...trace.map(Math.abs));
        return peak > 2.5 && peak < 3.5;
      });
      expect(outName).toBeDefined();
      expect(inName).toBeDefined();

      const out = results.nodeVoltages[outName!];
      const input = results.nodeVoltages[inName!];
      const rising: number[] = [];
      const falling: number[] = [];
      for (let i = 1; i < out.length; i += 1) {
        if (out[i - 1] < 0 && out[i] > 0) rising.push(input[i]);
        if (out[i - 1] > 0 && out[i] < 0) falling.push(input[i]);
      }
      expect(rising.length).toBeGreaterThan(0);
      expect(falling.length).toBeGreaterThan(0);
      // Output goes HIGH on the way up at V_TH = +V_sat·R1/R2, and LOW on the way down at V_TL.
      for (const trip of rising) expect(Math.abs(trip - expectedTrip)).toBeLessThan(expectedTrip * 0.05);
      for (const trip of falling) expect(Math.abs(trip + expectedTrip)).toBeLessThan(expectedTrip * 0.05);
      // Hysteresis is real width, not a single threshold crossed twice.
      expect(rising[0] - falling[0]).toBeGreaterThan(expectedTrip);
    },
    RUN_TIMEOUT
  );

  it(
    "inverting Schmitt trigger trips at ±V_sat·R1/(R1+R2)",
    async () => {
      const supply = 12;
      const r1 = 10000;
      const r2 = 100000;
      const expectedTrip = (supply * r1) / (r1 + r2);
      const frequency = 100;
      const period = 1 / frequency;

      const components = [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude: 3, frequency, waveform: "triangle", offset: 0 }),
        part("rin", "resistor", { resistance: 1000 }),
        part("r1", "resistor", { resistance: r1 }),
        part("r2", "resistor", { resistance: r2 }),
        part("u1", "opamp", { model: "ideal", vcc: supply }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "rin", "a"),
        wire("w2", "rin", "b", "u1", "in-"),
        wire("w3", "vin", "neg", "g", "gnd"),
        wire("w4", "u1", "in+", "r1", "a"),
        wire("w5", "r1", "b", "g", "gnd"),
        wire("w6", "u1", "in+", "r2", "a"),
        wire("w7", "r2", "b", "u1", "out"),
      ];

      const { results } = await simulate(components, wires, "practical", [
        `.tran ${period / 4000} ${period * 2}`,
      ]);
      const outName = Object.keys(results.nodeVoltages).find(name =>
        results.nodeVoltages[name].some(v => v > supply * 0.9)
      );
      const inName = Object.keys(results.nodeVoltages).find(name => {
        const peak = Math.max(...results.nodeVoltages[name].map(Math.abs));
        return peak > 2.5 && peak < 3.5;
      });
      expect(outName).toBeDefined();
      expect(inName).toBeDefined();

      const out = results.nodeVoltages[outName!];
      const input = results.nodeVoltages[inName!];
      const trips: Array<{ at: number; direction: "up" | "down" }> = [];
      for (let i = 1; i < out.length; i += 1) {
        if (out[i - 1] > 0 && out[i] < 0) trips.push({ at: input[i], direction: "down" });
        if (out[i - 1] < 0 && out[i] > 0) trips.push({ at: input[i], direction: "up" });
      }
      expect(trips.length).toBeGreaterThan(1);
      // Inverting: the output falls when the input rises past +V_TH, and rises when it falls
      // past −V_TL.
      for (const trip of trips) {
        const expectedAt = trip.direction === "down" ? expectedTrip : -expectedTrip;
        expect(Math.abs(trip.at - expectedAt)).toBeLessThan(Math.abs(expectedAt) * 0.05);
      }
    },
    RUN_TIMEOUT
  );

  /* ------------------------------------------------------------------ linear topologies --- */

  it(
    "inverting amplifier: A_v = −Rf/Rin to within 0.05%",
    async () => {
      for (const [rin, rf, input] of [
        [1000, 10000, 1],
        [2200, 4700, 2],
        [10000, 10000, 5],
      ] as const) {
        const components = [
          part("g", "ground"),
          part("vin", "dc-voltage", { voltage: input, internalR: 0 }),
          part("rin", "resistor", { resistance: rin }),
          part("rf", "resistor", { resistance: rf }),
          part("u1", "opamp", { model: "ideal", vcc: WIDE_RAILS }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "rin", "a"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "rin", "b", "u1", "in-"),
          wire("w4", "u1", "in-", "rf", "a"),
          wire("w5", "rf", "b", "u1", "out"),
          groundedNonInvertingInput("u1", "g", "w6"),
        ];
        const { nodeVoltage } = await simulate(components, wires, "practical", [".op"]);
        const expected = (-rf / rin) * input;
        expect(Math.abs(nodeVoltage("u1", "out") - expected)).toBeLessThan(
          Math.abs(expected) * 5e-4
        );
      }
    },
    RUN_TIMEOUT * 3
  );

  it(
    "non-inverting amplifier: A_v = 1 + Rf/R1 to within 0.05%",
    async () => {
      for (const [r1, rf, input] of [
        [1000, 9000, 1],
        [1000, 1000, 3],
        [4700, 10000, 2],
      ] as const) {
        const components = [
          part("g", "ground"),
          part("vin", "dc-voltage", { voltage: input, internalR: 0 }),
          part("r1", "resistor", { resistance: r1 }),
          part("rf", "resistor", { resistance: rf }),
          part("u1", "opamp", { model: "ideal", vcc: WIDE_RAILS }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "u1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "u1", "in-", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "u1", "in-", "rf", "a"),
          wire("w6", "rf", "b", "u1", "out"),
        ];
        const { nodeVoltage } = await simulate(components, wires, "practical", [".op"]);
        const expected = (1 + rf / r1) * input;
        expect(Math.abs(nodeVoltage("u1", "out") - expected)).toBeLessThan(
          Math.abs(expected) * 5e-4
        );
      }
    },
    RUN_TIMEOUT * 3
  );

  it(
    "summing amplifier: V_out = −Rf·Σ(V_k/R_k)",
    async () => {
      const feedback = 10000;
      const channels = [
        { voltage: 1, resistance: 10000 },
        { voltage: 2, resistance: 20000 },
        { voltage: -3, resistance: 5000 },
      ];
      const components: CircuitComponent[] = [
        part("g", "ground"),
        part("rf", "resistor", { resistance: feedback }),
        part("u1", "opamp", { model: "ideal", vcc: WIDE_RAILS }),
      ];
      const wires: CircuitWire[] = [
        wire("wf1", "u1", "in-", "rf", "a"),
        wire("wf2", "rf", "b", "u1", "out"),
        groundedNonInvertingInput("u1", "g", "wg"),
      ];
      channels.forEach((channel, index) => {
        const source = `v${index}`;
        const resistor = `r${index}`;
        components.push(part(source, "dc-voltage", { voltage: channel.voltage, internalR: 0 }));
        components.push(part(resistor, "resistor", { resistance: channel.resistance }));
        wires.push(wire(`ws${index}a`, source, "pos", resistor, "a"));
        wires.push(wire(`ws${index}b`, resistor, "b", "u1", "in-"));
        wires.push(wire(`ws${index}c`, source, "neg", "g", "gnd"));
      });

      const { nodeVoltage } = await simulate(components, wires, "practical", [".op"]);
      const expected =
        -feedback * channels.reduce((sum, c) => sum + c.voltage / c.resistance, 0);
      expect(Math.abs(nodeVoltage("u1", "out") - expected)).toBeLessThan(
        Math.max(Math.abs(expected) * 1e-3, 1e-3)
      );
    },
    RUN_TIMEOUT
  );

  it(
    "difference amplifier: differential gain R2/R1, with common-mode rejected",
    async () => {
      const r1 = 10000;
      const r2 = 100000;
      const build = (v1: number, v2: number) => {
        const components = [
          part("g", "ground"),
          part("va", "dc-voltage", { voltage: v1, internalR: 0 }),
          part("vb", "dc-voltage", { voltage: v2, internalR: 0 }),
          part("r1", "resistor", { resistance: r1 }),
          part("r2", "resistor", { resistance: r2 }),
          part("r3", "resistor", { resistance: r1 }),
          part("r4", "resistor", { resistance: r2 }),
          part("u1", "opamp", { model: "ideal", vcc: WIDE_RAILS }),
        ];
        const wires = [
          wire("w1", "va", "pos", "r1", "a"),
          wire("w2", "r1", "b", "u1", "in-"),
          wire("w3", "u1", "in-", "r2", "a"),
          wire("w4", "r2", "b", "u1", "out"),
          wire("w5", "vb", "pos", "r3", "a"),
          wire("w6", "r3", "b", "u1", "in+"),
          wire("w7", "u1", "in+", "r4", "a"),
          wire("w8", "r4", "b", "g", "gnd"),
          wire("w9", "va", "neg", "g", "gnd"),
          wire("w10", "vb", "neg", "g", "gnd"),
        ];
        return { components, wires };
      };

      const differential = build(1, 1.1);
      const { nodeVoltage: differentialOut } = await simulate(
        differential.components,
        differential.wires,
        "practical",
        [".op"]
      );
      const expected = (r2 / r1) * (1.1 - 1);
      expect(Math.abs(differentialOut("u1", "out") - expected)).toBeLessThan(expected * 2e-3);

      // Pure common mode: both inputs at 5 V. Perfectly matched resistors, so the only residual is
      // the finite open-loop gain — a CMRR far past any real part's.
      const commonMode = build(5, 5);
      const { nodeVoltage: commonModeOut } = await simulate(
        commonMode.components,
        commonMode.wires,
        "practical",
        [".op"]
      );
      expect(Math.abs(commonModeOut("u1", "out"))).toBeLessThan(1e-3);
    },
    RUN_TIMEOUT * 2
  );

  /* ------------------------------------------------------- active filters & non-linear --- */

  it(
    "unity-gain Sallen-Key low-pass: flat in band, |H| = Q = 0.5 at f0",
    async () => {
      const resistance = 10000;
      const capacitance = 1e-8;
      // Equal-component unity-gain Sallen-Key: ω0 = 1/RC, Q = 0.5, so |H(jω0)| = Q.
      const f0 = 1 / (2 * Math.PI * resistance * capacitance);

      const build = (frequency: number) => {
        const components = [
          part("g", "ground"),
          part("vin", "ac-voltage", { amplitude: 1, frequency, waveform: "sine", offset: 0 }),
          part("ra", "resistor", { resistance }),
          part("rb", "resistor", { resistance }),
          part("ca", "capacitor", { capacitance }),
          part("cb", "capacitor", { capacitance }),
          part("u1", "opamp", { model: "ideal", vcc: 15 }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "ra", "a"),
          wire("w2", "ra", "b", "rb", "a"),
          wire("w3", "rb", "b", "u1", "in+"),
          wire("w4", "u1", "in+", "cb", "a"),
          wire("w5", "cb", "b", "g", "gnd"),
          // CA bootstraps the mid node to the output — the stage's only feedback path besides the
          // unity-gain wire, and what gives the pole pair its Q.
          wire("w6", "ra", "b", "ca", "a"),
          wire("w7", "ca", "b", "u1", "out"),
          wire("w8", "u1", "in-", "u1", "out"),
          wire("w9", "vin", "neg", "g", "gnd"),
        ];
        return { components, wires };
      };

      // Second-order roll-off: |H| = 1/|1 − (f/f0)² + j(f/f0)/Q|, which a decade past f0 is
      // 1/|−99 + 20j| = 0.00990.
      for (const [frequency, expectedGain, tolerance] of [
        [f0 / 100, 1, 0.02],
        [f0, 0.5, 0.03],
        [f0 * 10, 1 / Math.hypot(99, 20), 0.05],
      ] as const) {
        const period = 1 / frequency;
        // The critically damped poles decay with τ = 1/ω0, so settle for at least 10τ before
        // measuring — at 10·f0 that is ~16 periods, and the 1% output is otherwise swamped by
        // what is left of the turn-on transient.
        const settle = Math.max(8 * period, 10 * resistance * capacitance);
        const span = settle + 4 * period;
        const { components, wires } = build(frequency);
        const { nodeVoltageAt } = await simulate(components, wires, "practical", [
          `.tran ${period / 400} ${span}`,
        ]);
        const input = terminalPeak(nodeVoltageAt, "vin", "pos", settle, span);
        const output = terminalPeak(nodeVoltageAt, "u1", "out", settle, span);
        expect(Math.abs(output / input - expectedGain)).toBeLessThan(expectedGain * tolerance);
      }
    },
    RUN_TIMEOUT * 4
  );

  it(
    "precision half-wave rectifier passes signals far below a diode drop",
    async () => {
      const frequency = 1000;
      const period = 1 / frequency;
      const amplitude = 0.3; // Well under a silicon diode's 0.7 V — a passive rectifier reads 0 V.
      const components = [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude, frequency, waveform: "sine", offset: 0 }),
        part("d1", "diode", { material: "silicon" }),
        part("rl", "resistor", { resistance: 10000 }),
        part("u1", "opamp", { model: "ideal", vcc: 15 }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "u1", "in+"),
        wire("w2", "vin", "neg", "g", "gnd"),
        // Superdiode: the diode sits inside the loop, so the op-amp drives its own forward drop out.
        wire("w3", "u1", "out", "d1", "anode"),
        wire("w4", "d1", "cathode", "rl", "a"),
        wire("w5", "rl", "b", "g", "gnd"),
        wire("w6", "d1", "cathode", "u1", "in-"),
      ];
      const { nodeVoltageAt } = await simulate(components, wires, "practical", [
        `.tran ${period / 400} ${period * 3}`,
      ]);
      // Positive half tracks the input; negative half is held off, not attenuated by 0.7 V.
      const positivePeak = nodeVoltageAt("rl", "a", period * 2.25);
      expect(Math.abs(positivePeak - amplitude)).toBeLessThan(amplitude * 0.05);
      const negativeHalf = nodeVoltageAt("rl", "a", period * 2.75);
      expect(Math.abs(negativeHalf)).toBeLessThan(0.01);
    },
    RUN_TIMEOUT
  );

  /* --------------------------------------------------------------- realistic-mode dynamics --- */

  it(
    "realistic mode: closed-loop bandwidth follows GBW / A_v",
    async () => {
      const gbw = 1e6;
      const closedLoopGain = 10;
      const cutoff = gbw / closedLoopGain; // 100 kHz
      const gainAt = async (frequency: number) => {
        const period = 1 / frequency;
        const components = [
          part("g", "ground"),
          part("vin", "ac-voltage", { amplitude: 0.1, frequency, waveform: "sine", offset: 0 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("rf", "resistor", { resistance: 9000 }),
          part("u1", "opamp", { model: "realistic", gain: 1e5, gbw, vcc: 15, slewRate: 1000 }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "u1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "u1", "in-", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "u1", "in-", "rf", "a"),
          wire("w6", "rf", "b", "u1", "out"),
        ];
        const { nodeVoltageAt } = await simulate(components, wires, "practical", [
          `.tran ${period / 400} ${period * 40}`,
        ]);
        return terminalPeak(nodeVoltageAt, "u1", "out", period * 30, period * 40) / 0.1;
      };

      // Slew rate deliberately set huge here so this measures the pole and nothing else.
      const inBand = await gainAt(cutoff / 100);
      expect(Math.abs(inBand - closedLoopGain)).toBeLessThan(closedLoopGain * 0.02);
      const atCutoff = await gainAt(cutoff);
      expect(Math.abs(atCutoff - closedLoopGain / Math.SQRT2)).toBeLessThan(
        (closedLoopGain / Math.SQRT2) * 0.12
      );
    },
    RUN_TIMEOUT * 4
  );

  it(
    "realistic mode: a large step is slew-rate limited, an ideal one is not",
    async () => {
      // 0.5 V/µs on a unity-gain buffer driven by a 10 V step: the output needs 20 µs to get there.
      const slewRate = 0.5;
      const build = (model: "ideal" | "realistic") => {
        const components = [
          part("g", "ground"),
          part("vin", "ac-voltage", { amplitude: 5, frequency: 10000, waveform: "square", offset: 0 }),
          part("u1", "opamp", { model, gain: 1e5, gbw: 1e7, slewRate, vcc: 15 }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "u1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "u1", "in-", "u1", "out"),
        ];
        return { components, wires };
      };

      // The square starts HIGH and falls at T/2 = 50 µs. Slope is taken across the +3 V → −3 V span
      // of that edge (the middle 60% of the swing), clear of the rounding at either end.
      const measureSlope = async (model: "ideal" | "realistic") => {
        const { components, wires } = build(model);
        const { nodeVoltageAt } = await simulate(components, wires, "practical", [
          ".tran 1e-8 0.00009 uic",
        ]);
        const step = 1e-9;
        let upper: number | undefined;
        let lower: number | undefined;
        for (let t = 45e-6; t < 90e-6; t += step) {
          const v = nodeVoltageAt("u1", "out", t);
          if (upper === undefined && v < 3) upper = t;
          if (lower === undefined && v < -3) {
            lower = t;
            break;
          }
        }
        expect(upper).toBeDefined();
        expect(lower).toBeDefined();
        return 6 / Math.max(lower! - upper!, step) / 1e6; // V/µs
      };

      const realistic = await measureSlope("realistic");
      expect(realistic).toBeLessThan(slewRate * 1.3);
      expect(realistic).toBeGreaterThan(slewRate * 0.7);
      // The ideal element has no slew limit at all, so its edge is orders of magnitude faster.
      const ideal = await measureSlope("ideal");
      expect(ideal).toBeGreaterThan(slewRate * 20);
    },
    RUN_TIMEOUT * 3
  );

  it(
    "realistic mode: the output saturates a rail margin short of each supply",
    async () => {
      const supply = 15;
      const railMargin = 1.5;
      const components = [
        part("g", "ground"),
        part("vsig", "dc-voltage", { voltage: 5, internalR: 0 }),
        part("u1", "opamp", { model: "realistic", gain: 1e5, vcc: supply, railMargin }),
        part("rload", "resistor", { resistance: 100000 }),
      ];
      const wires = [
        wire("w1", "vsig", "pos", "u1", "in+"),
        wire("w2", "vsig", "neg", "g", "gnd"),
        wire("w3", "u1", "in-", "g", "gnd"),
        wire("w4", "u1", "out", "rload", "a"),
        wire("w5", "rload", "b", "g", "gnd"),
      ];
      const { nodeVoltage } = await simulate(components, wires, "practical", [".op"]);
      // (supply − margin), less the divider formed by the 50 Ω output resistance into the load.
      const expected = (supply - railMargin) * (100000 / 100050);
      expect(Math.abs(nodeVoltage("u1", "out") - expected)).toBeLessThan(0.05);
    },
    RUN_TIMEOUT
  );

  /* ------------------------------------------------------------ shipped example schematics --- */

  describe("example library schematics", () => {
    /** Mirrors Home.tsx's live run: `.tran` step = window/2000, plus `uic` when the topology needs it. */
    async function simulateExample(example: ExampleDefinition, window: number) {
      const { components, wires } = example.schematic;
      const nets = resolveCircuitNets(components, wires);
      const uic = requiresTransientInitialConditions(
        convertToSpiceComponents(components, wires, nets, "practical")
      );
      return simulate(components, wires, "practical", [
        `.tran ${window / 2000} ${window}${uic ? " uic" : ""}`,
      ]);
    }

    it(
      "ideal integrator example: +20 V at 10 ms on a straight 2 V/ms ramp",
      async () => {
        const { nodeVoltageAt } = await simulateExample(OPAMP_IDEAL_INTEGRATOR, 0.1);
        expect(Math.abs(nodeVoltageAt("u2", "out", 0.01) - 20)).toBeLessThan(0.2);
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.01) + 20)).toBeLessThan(0.2);
        const slope = (nodeVoltageAt("u2", "out", 0.008) - nodeVoltageAt("u2", "out", 0.002)) / 0.006;
        expect(Math.abs(slope - 2000)).toBeLessThan(20);
        // Clipped at the +30 V rail long after the ramp would have crossed it.
        expect(Math.abs(nodeVoltageAt("u2", "out", 0.05) - 30)).toBeLessThan(0.1);
      },
      RUN_TIMEOUT
    );

    it(
      "differentiator example: ∓1 V square from the 250 Hz triangle",
      async () => {
        const { nodeVoltageAt } = await simulateExample(OPAMP_DIFFERENTIATOR, 0.02);
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.008 + 0.001) + 1)).toBeLessThan(0.05);
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.008 + 0.003) - 1)).toBeLessThan(0.05);
      },
      RUN_TIMEOUT
    );

    it(
      "comparator example: ±12 V around the 2 V reference crossings",
      async () => {
        const { nodeVoltageAt } = await simulateExample(OPAMP_COMPARATOR, 0.05);
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.005) - 12)).toBeLessThan(0.05); // sine at 5 V
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.015) + 12)).toBeLessThan(0.05); // sine at −5 V
      },
      RUN_TIMEOUT
    );

    it(
      "Schmitt trigger example: stays LOW through +1 V, HIGH through −1 V",
      async () => {
        const { nodeVoltageAt } = await simulateExample(OPAMP_SCHMITT_TRIGGER, 0.05);
        // Second cycle, 20–40 ms. 3·sin reaches +1 V at ≈ 1.08 ms into the cycle — below V_TH, so
        // the output is still LOW — and has passed +1.5 V by 2 ms, so it is HIGH.
        expect(nodeVoltageAt("u1", "out", 0.02108)).toBeLessThan(-14);
        expect(nodeVoltageAt("u1", "out", 0.0225)).toBeGreaterThan(14);
        // Falling through −1 V at ≈ 11.08 ms: still HIGH, below V_TL = −1.5 V by 12 ms: LOW.
        expect(nodeVoltageAt("u1", "out", 0.03108)).toBeGreaterThan(14);
        expect(nodeVoltageAt("u1", "out", 0.0325)).toBeLessThan(-14);
      },
      RUN_TIMEOUT
    );

    it(
      "summing amplifier example: −(2·V1 + V2) swings −3 V … −1 V",
      async () => {
        const { nodeVoltageAt } = await simulateExample(OPAMP_SUMMING_AMPLIFIER, 0.05);
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.0225) + 3)).toBeLessThan(0.02); // sin peak
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.0275) + 1)).toBeLessThan(0.02); // sin trough
        expect(Math.abs(nodeVoltageAt("u1", "out", 0.025) + 2)).toBeLessThan(0.02);
      },
      RUN_TIMEOUT
    );
  });

  it(
    "academic mode always solves the ideal element, whatever the part is set to",
    async () => {
      const components = [
        part("g", "ground"),
        part("vin", "dc-voltage", { voltage: 1, internalR: 0 }),
        part("rin", "resistor", { resistance: 1000 }),
        part("rf", "resistor", { resistance: 10000 }),
        part("u1", "opamp", { model: "realistic", gain: 1e5, vcc: WIDE_RAILS }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "rin", "a"),
        wire("w2", "vin", "neg", "g", "gnd"),
        wire("w3", "rin", "b", "u1", "in-"),
        wire("w4", "u1", "in-", "rf", "a"),
        wire("w5", "rf", "b", "u1", "out"),
        groundedNonInvertingInput("u1", "g", "w6"),
      ];
      const { nodeVoltage } = await simulate(components, wires, "academic", [".op"]);
      // Exactly −Rf/Rin: no output resistance, no rail margin, nothing to explain away.
      expect(Math.abs(nodeVoltage("u1", "out") + 10)).toBeLessThan(10 * 5e-4);
    },
    RUN_TIMEOUT
  );
});
