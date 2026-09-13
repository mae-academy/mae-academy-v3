/**
 * Real-ngspice.wasm regression coverage for the op-amp macromodel (validation spec Section VI):
 * open-loop saturation, follower, inverting/non-inverting/summing amps, integrator, differentiator,
 * comparator, and Schmitt trigger. Same full-pipeline `simulate()` as ngspiceRegression.test.ts — see
 * ngspiceRegressionHelpers.ts.
 *
 * The macromodel itself (spiceAdapter.ts's "opamp" case, netlistGenerator.ts's `macroFor` "opamp"
 * case) is a differential-input resistor (10 MΩ) into a gain stage (`EGAIN`) through one dominant
 * pole sized to a 1 MHz unity-gain bandwidth (LM741-class), diode-clamped to ±`vcc` at the pole node,
 * then a 75 Ω output resistor — not a datasheet part (TL072/LM358/OPA2134), which ngspice has no
 * native model for and a full SPICE macromodel for each is out of scope here.
 *
 * The differentiator (Test 6.7) is verified via sine-wave frequency response (amplitude ∝ ω,
 * 90°-phase relationship) rather than a literal square-wave edge, because the canvas's `ac-voltage`
 * part only emits SIN() sources — there is no PWL/pulse source to wire up a literal square wave
 * through this pipeline. Frequency response is the standard, physically equivalent way to
 * characterise a differentiator's transfer function and is what an AC sweep on a bench would show.
 *
 * The Schmitt trigger (Test 6.9) uses a real positive-feedback loop, which is genuinely stiff for
 * this macromodel's dominant-pole + diode-clamp topology (verified against ngspice.wasm: at the
 * spec's own gain=100,000, the regenerative loop's runaway time constant is only ~2 µs and a `.tran`
 * step coarser than that overshoots the diode clamp into a numerically diverging solution — an
 * artifact of the simplified pole/clamp macromodel, not of the underlying circuit). Reducing the
 * open-loop gain to 1,000 - unity-gain bandwidth unchanged - slows the runaway enough for a `.tran` at
 * a 5 µs step to resolve cleanly; the trigger-threshold formula (Vth = Vsat·Rg/(Rg+Rf)) still holds
 * with that gain, just with a wider finite-gain tolerance than the other tests use.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RUN_TIMEOUT,
  WASM_BOOT_TIMEOUT,
  calculatePhaseAngleDifference,
  extractPhasor,
  part,
  simulate,
  warmupNgspice,
  wire,
  type Phasor,
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";

/** Standard part config used everywhere except the Schmitt trigger test (see the file doc comment). */
const IDEAL_OPAMP = { gain: 100_000, vcc: 15 };

/**
 * Steady-state input/output phasors at `frequency`, from a `.tran` run long enough (8 cycles, 200
 * points/cycle) to settle past the macromodel's own startup transient — only the last 3 cycles are
 * fed to `extractPhasor`.
 */
async function acResponse(
  components: ReturnType<typeof part>[],
  wires: ReturnType<typeof wire>[],
  frequency: number,
  outComponentId: string,
  outTerminal: string
): Promise<{ input: Phasor; output: Phasor; phaseDiffDegrees: number; gain: number }> {
  const periods = 8;
  const step = 1 / frequency / 200;
  const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
    `.tran ${step} ${periods / frequency}`,
  ]);
  const inputSeries = nodeVoltageSeries("vin", "pos");
  const outputSeries = nodeVoltageSeries(outComponentId, outTerminal);
  const startIndex = inputSeries.time.findIndex(t => t >= (periods - 3) / frequency);
  const time = inputSeries.time.slice(startIndex);
  const input = extractPhasor(time, inputSeries.values.slice(startIndex), frequency);
  const output = extractPhasor(time, outputSeries.values.slice(startIndex), frequency);
  return {
    input,
    output,
    phaseDiffDegrees: calculatePhaseAngleDifference(input.angleDegrees, output.angleDegrees),
    gain: output.magnitude / input.magnitude,
  };
}

describe("ngspice regression: op-amps (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 6.1 — open-loop gain: a millivolt-scale differential input saturates the output", () => {
    it.each([
      [1.0005, 1.0, "positive"],
      [1.0, 1.0005, "negative"],
    ] as const)(
      "%s V vs %s V (0.5 mV differential) saturates %s",
      async (vPlus, vMinus, sign) => {
        const components = [
          part("g", "ground"),
          part("vp", "dc-voltage", { voltage: vPlus }),
          part("vn", "dc-voltage", { voltage: vMinus }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vm", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vp", "pos", "op1", "in+"),
          wire("w2", "vp", "neg", "g", "gnd"),
          wire("w3", "vn", "pos", "op1", "in-"),
          wire("w4", "vn", "neg", "g", "gnd"),
          wire("w5", "op1", "out", "rl", "a"),
          wire("w6", "rl", "b", "g", "gnd"),
          wire("w7", "vm", "pos", "op1", "out"),
          wire("w8", "vm", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vm.status).toBe("ready");
        if (sign === "positive") {
          expect(readings.vm.value).toBeGreaterThan(14);
        } else {
          expect(readings.vm.value).toBeLessThan(-14);
        }
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 6.2 — voltage follower (unity-gain buffer)", () => {
    it.each([0, 2.5, 5, 7.5, 10])(
      "Vin=%s V: Vout tracks within 5 mV",
      async vin => {
        const components = [
          part("g", "ground"),
          part("vin", "dc-voltage", { voltage: vin }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 1000 }),
          part("vm", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vin", "pos", "op1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "op1", "out", "op1", "in-"),
          wire("w4", "op1", "out", "rl", "a"),
          wire("w5", "rl", "b", "g", "gnd"),
          wire("w6", "vm", "pos", "op1", "out"),
          wire("w7", "vm", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(Math.abs(readings.vm.value - vin)).toBeLessThan(0.005);
      },
      RUN_TIMEOUT
    );

    it(
      "a heavier load (1 kΩ vs 100 kΩ) doesn't move the output — true buffering",
      async () => {
        const circuitWith = (loadResistance: number) => ({
          components: [
            part("g", "ground"),
            part("vin", "dc-voltage", { voltage: 6 }),
            part("op1", "opamp", IDEAL_OPAMP),
            part("rl", "resistor", { resistance: loadResistance }),
            part("vm", "voltmeter"),
          ],
          wires: [
            wire("w1", "vin", "pos", "op1", "in+"),
            wire("w2", "vin", "neg", "g", "gnd"),
            wire("w3", "op1", "out", "op1", "in-"),
            wire("w4", "op1", "out", "rl", "a"),
            wire("w5", "rl", "b", "g", "gnd"),
            wire("w6", "vm", "pos", "op1", "out"),
            wire("w7", "vm", "neg", "g", "gnd"),
          ],
        });
        const light = await simulate(circuitWith(100_000).components, circuitWith(100_000).wires, "practical");
        const heavy = await simulate(circuitWith(1000).components, circuitWith(1000).wires, "practical");
        expect(Math.abs(light.readings.vm.value - heavy.readings.vm.value)).toBeLessThan(0.005);
      },
      RUN_TIMEOUT * 2
    );

    it(
      "negligible phase shift at 1 kHz (well inside the closed-loop bandwidth)",
      async () => {
        const frequency = 1000;
        const components = [
          part("g", "ground"),
          part("vin", "ac-voltage", { amplitude: 1, frequency, phase: 0 }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "op1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "op1", "out", "op1", "in-"),
          wire("w4", "op1", "out", "rl", "a"),
          wire("w5", "rl", "b", "g", "gnd"),
        ];
        const { phaseDiffDegrees, gain } = await acResponse(components, wires, frequency, "op1", "out");
        expect(Math.abs(phaseDiffDegrees)).toBeLessThan(2);
        expect(gain).toBeCloseTo(1, 2);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 6.3 — inverting amplifier (Rf=10kΩ, Rin=1kΩ, gain = -Rf/Rin = -10)", () => {
    it.each([
      [0.5, -5],
      [1.0, -10],
      [-0.5, 5],
      [-1.0, 10],
    ])(
      "Vin=%s V -> Vout=%s V within 1%%",
      async (vin, expectedVout) => {
        const components = [
          part("g", "ground"),
          part("vin", "dc-voltage", { voltage: vin }),
          part("rin", "resistor", { resistance: 1000 }),
          part("rf", "resistor", { resistance: 10_000 }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vm", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vin", "pos", "rin", "a"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "rin", "b", "op1", "in-"),
          wire("w4", "op1", "in+", "g", "gnd"),
          wire("w5", "rf", "a", "op1", "in-"),
          wire("w6", "rf", "b", "op1", "out"),
          wire("w7", "op1", "out", "rl", "a"),
          wire("w8", "rl", "b", "g", "gnd"),
          wire("w9", "vm", "pos", "op1", "out"),
          wire("w10", "vm", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(Math.abs(readings.vm.value - expectedVout) / Math.abs(expectedVout)).toBeLessThan(0.01);
      },
      RUN_TIMEOUT
    );

    it(
      "gain stays flat near -10 from 100 Hz to 10 kHz, ≈180° inverted at 1 kHz",
      async () => {
        const gainAt = async (frequency: number) => {
          const components = [
            part("g", "ground"),
            part("vin", "ac-voltage", { amplitude: 1, frequency, phase: 0 }),
            part("rin", "resistor", { resistance: 1000 }),
            part("rf", "resistor", { resistance: 10_000 }),
            part("op1", "opamp", IDEAL_OPAMP),
            part("rl", "resistor", { resistance: 10_000 }),
          ];
          const wires = [
            wire("w1", "vin", "pos", "rin", "a"),
            wire("w2", "vin", "neg", "g", "gnd"),
            wire("w3", "rin", "b", "op1", "in-"),
            wire("w4", "op1", "in+", "g", "gnd"),
            wire("w5", "rf", "a", "op1", "in-"),
            wire("w6", "rf", "b", "op1", "out"),
            wire("w7", "op1", "out", "rl", "a"),
            wire("w8", "rl", "b", "g", "gnd"),
          ];
          return acResponse(components, wires, frequency, "op1", "out");
        };
        for (const frequency of [100, 1000, 10_000]) {
          const { gain } = await gainAt(frequency);
          expect(gain).toBeGreaterThan(9.8);
          expect(gain).toBeLessThan(10.2);
        }
        // 180°-inverted, spec's own tolerance, checked at the spec's own frequency (1 kHz): at
        // 10 kHz the closed-loop bandwidth (~GBW/(1+Rf/Rin) ≈ 90 kHz for this Aol/GBW) is close
        // enough that phase lag alone (still flat in gain — see above) adds several extra degrees,
        // same as a real op-amp's own closed-loop rolloff would.
        const { phaseDiffDegrees } = await gainAt(1000);
        expect(Math.abs(Math.abs(phaseDiffDegrees) - 180)).toBeLessThan(5);
      },
      RUN_TIMEOUT * 3
    );
  });

  describe("Test 6.4 — non-inverting amplifier (Rf=10kΩ, R1=1kΩ, gain = 1+Rf/R1 = +11)", () => {
    it.each([
      [0.5, 5.5],
      [0.9, 9.9],
      [1.0, 11.0],
    ])(
      "Vin=%s V -> Vout=%s V within 1%%",
      async (vin, expectedVout) => {
        const components = [
          part("g", "ground"),
          part("vin", "dc-voltage", { voltage: vin }),
          part("r1", "resistor", { resistance: 1000 }),
          part("rf", "resistor", { resistance: 10_000 }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vm", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vin", "pos", "op1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "op1", "in-", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "rf", "a", "op1", "in-"),
          wire("w6", "rf", "b", "op1", "out"),
          wire("w7", "op1", "out", "rl", "a"),
          wire("w8", "rl", "b", "g", "gnd"),
          wire("w9", "vm", "pos", "op1", "out"),
          wire("w10", "vm", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(Math.abs(readings.vm.value - expectedVout) / expectedVout).toBeLessThan(0.01);
      },
      RUN_TIMEOUT
    );

    it(
      "in-phase (≈0°) at 1 kHz",
      async () => {
        const frequency = 1000;
        const components = [
          part("g", "ground"),
          part("vin", "ac-voltage", { amplitude: 1, frequency, phase: 0 }),
          part("r1", "resistor", { resistance: 1000 }),
          part("rf", "resistor", { resistance: 10_000 }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "op1", "in+"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "op1", "in-", "r1", "a"),
          wire("w4", "r1", "b", "g", "gnd"),
          wire("w5", "rf", "a", "op1", "in-"),
          wire("w6", "rf", "b", "op1", "out"),
          wire("w7", "op1", "out", "rl", "a"),
          wire("w8", "rl", "b", "g", "gnd"),
        ];
        const { phaseDiffDegrees, gain } = await acResponse(components, wires, frequency, "op1", "out");
        expect(Math.abs(phaseDiffDegrees)).toBeLessThan(5);
        expect(gain).toBeGreaterThan(10.8);
        expect(gain).toBeLessThan(11.2);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 6.5 — summing amplifier (3 equal-weight inputs)", () => {
    it(
      "Vout = -(V1+V2+V3) for V1=1V, V2=2V, V3=3V (R1=R2=R3=Rf=10kΩ)",
      async () => {
        const components = [
          part("g", "ground"),
          part("v1", "dc-voltage", { voltage: 1 }),
          part("v2", "dc-voltage", { voltage: 2 }),
          part("v3", "dc-voltage", { voltage: 3 }),
          part("r1", "resistor", { resistance: 10_000 }),
          part("r2", "resistor", { resistance: 10_000 }),
          part("r3", "resistor", { resistance: 10_000 }),
          part("rf", "resistor", { resistance: 10_000 }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vm", "voltmeter"),
        ];
        const wires = [
          wire("w1", "v1", "pos", "r1", "a"),
          wire("w2", "v2", "pos", "r2", "a"),
          wire("w3", "v3", "pos", "r3", "a"),
          wire("w4", "v1", "neg", "g", "gnd"),
          wire("w5", "v2", "neg", "g", "gnd"),
          wire("w6", "v3", "neg", "g", "gnd"),
          wire("w7", "r1", "b", "op1", "in-"),
          wire("w8", "r2", "b", "op1", "in-"),
          wire("w9", "r3", "b", "op1", "in-"),
          wire("w10", "op1", "in+", "g", "gnd"),
          wire("w11", "rf", "a", "op1", "in-"),
          wire("w12", "rf", "b", "op1", "out"),
          wire("w13", "op1", "out", "rl", "a"),
          wire("w14", "rl", "b", "g", "gnd"),
          wire("w15", "vm", "pos", "op1", "out"),
          wire("w16", "vm", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        expect(readings.vm.value).toBeCloseTo(-6, 1);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 6.6 — integrator (Rin=10kΩ, C=100nF, τ=1ms), step input", () => {
    it(
      "ramps linearly at -1 V/ms from a 1 V step, and eventually reaches the -vcc rail",
      async () => {
        const components = [
          part("g", "ground"),
          part("vin", "dc-voltage", { voltage: 1 }),
          part("rin", "resistor", { resistance: 10_000 }),
          // IC=0: a bare integrator (no DC feedback path — the cap is open at DC) has no defined
          // operating point at all until the capacitor's initial charge is stated explicitly
          // (verified against ngspice.wasm: without it, `.op` settles on an arbitrary open-loop
          // solution — observed node voltages over 100 V past the rail — before the transient even
          // starts). `UIC` below skips that ill-posed `.op` and starts the sweep from this state
          // directly, exactly like a real integrator reset to 0 V before the ramp begins.
          part("cf", "capacitor", { capacitance: 100e-9, initialVoltage: 0 }),
          part("op1", "opamp", IDEAL_OPAMP),
        ];
        const wires = [
          wire("w1", "vin", "pos", "rin", "a"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "rin", "b", "op1", "in-"),
          wire("w4", "op1", "in+", "g", "gnd"),
          wire("w5", "cf", "a", "op1", "in-"),
          wire("w6", "cf", "b", "op1", "out"),
        ];
        const { nodeVoltageAt } = await simulate(components, wires, "practical", [
          ".tran 0.00001 0.016 UIC",
        ]);
        const at1ms = nodeVoltageAt("op1", "out", 0.001);
        const at2ms = nodeVoltageAt("op1", "out", 0.002);
        const at5ms = nodeVoltageAt("op1", "out", 0.005);
        const at12ms = nodeVoltageAt("op1", "out", 0.012);
        const at15ms = nodeVoltageAt("op1", "out", 0.015);
        // Linear ramp: -1 V/ms within 2%.
        expect(at1ms).toBeCloseTo(-1, 1);
        expect(at5ms).toBeCloseTo(-5, 1);
        // Slope between two early, unsaturated points confirms the rate, not just one endpoint.
        const earlySlopePerMs = (at2ms - at1ms) / 1;
        expect(earlySlopePerMs).toBeCloseTo(-1, 1);
        // 12 ms in (would be -12 V unclamped, still short of the rail) the ramp is still linear —
        // confirms the rate holds well past the first couple of points, not just at the start.
        expect(at12ms).toBeCloseTo(-12, 0);
        // By 15 ms (would be -15 V unclamped) it has run into the rail. Not asserted further out:
        // a bare integrator has no DC feedback path once its op-amp saturates (V(in-) is no longer
        // held near virtual ground), so — like a real integrator with no reset switch or bleed
        // resistor — its post-saturation behavior isn't the well-defined "pinned at -vcc forever"
        // a closed-loop stage would give; only reaching the rail is being checked here.
        expect(at15ms).toBeLessThan(-14);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 6.7 — differentiator (Cin=100nF, Rf=10kΩ), sine-wave frequency response", () => {
    // A literal square-wave edge isn't reachable through this pipeline (ac-voltage only emits
    // SIN()) — see the file doc comment. Amplitude ∝ RC·ω and a 90°-leading-before-inversion (net
    // -90°) phase is the frequency-domain signature of the same V_out = -RC·dV_in/dt transfer
    // function a square wave's edges would exercise in the time domain.
    async function differentiatorResponse(frequency: number) {
      const components = [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude: 1, frequency, phase: 0 }),
        part("cin", "capacitor", { capacitance: 100e-9 }),
        part("rf", "resistor", { resistance: 10_000 }),
        part("op1", "opamp", IDEAL_OPAMP),
        part("rl", "resistor", { resistance: 10_000 }),
      ];
      const wires = [
        wire("w1", "vin", "pos", "cin", "a"),
        wire("w2", "vin", "neg", "g", "gnd"),
        wire("w3", "cin", "b", "op1", "in-"),
        wire("w4", "op1", "in+", "g", "gnd"),
        wire("w5", "rf", "a", "op1", "in-"),
        wire("w6", "rf", "b", "op1", "out"),
        wire("w7", "op1", "out", "rl", "a"),
        wire("w8", "rl", "b", "g", "gnd"),
      ];
      return acResponse(components, wires, frequency, "op1", "out");
    }

    it(
      "amplitude scales with frequency (Rf·C·ω) and phase sits at -90°",
      async () => {
        const at100 = await differentiatorResponse(100);
        const at500 = await differentiatorResponse(500);
        const rfC = 10_000 * 100e-9; // 1e-3 s.
        expect(at100.output.magnitude).toBeCloseTo(rfC * 2 * Math.PI * 100, 2);
        expect(at500.output.magnitude).toBeCloseTo(rfC * 2 * Math.PI * 500, 1);
        // 5x the frequency should give ~5x the output amplitude — the proportionality itself.
        expect(at500.output.magnitude / at100.output.magnitude).toBeCloseTo(5, 0);
        expect(at100.phaseDiffDegrees).toBeCloseTo(-90, 0);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 6.8 — comparator (open loop, no feedback)", () => {
    it.each([
      [5, "positive"],
      [0.5, "positive"],
      [0.001, "positive"],
      [-0.001, "negative"],
      [-0.5, "negative"],
      [-5, "negative"],
    ] as const)(
      "V+ - V- = %s V rails to the %s supply",
      async (differential, sign) => {
        const components = [
          part("g", "ground"),
          part("vp", "dc-voltage", { voltage: differential }),
          part("op1", "opamp", IDEAL_OPAMP),
          part("rl", "resistor", { resistance: 10_000 }),
          part("vm", "voltmeter"),
        ];
        const wires = [
          wire("w1", "vp", "pos", "op1", "in+"),
          wire("w2", "vp", "neg", "g", "gnd"),
          wire("w3", "op1", "in-", "g", "gnd"),
          wire("w4", "op1", "out", "rl", "a"),
          wire("w5", "rl", "b", "g", "gnd"),
          wire("w6", "vm", "pos", "op1", "out"),
          wire("w7", "vm", "neg", "g", "gnd"),
        ];
        const { readings } = await simulate(components, wires, "practical");
        if (sign === "positive") {
          expect(readings.vm.value).toBeGreaterThan(14);
        } else {
          expect(readings.vm.value).toBeLessThan(-14);
        }
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 6.9 — Schmitt trigger (Rg=10kΩ to ground, Rf=100kΩ feedback, positive feedback)", () => {
    it(
      "switches at ±Vsat·Rg/(Rg+Rf) with the threshold shifted by the sign of the last switch (hysteresis)",
      async () => {
        // Lower open-loop gain than IDEAL_OPAMP: the trigger-threshold formula doesn't depend on
        // gain once saturated, and a lower gain keeps the regenerative loop's runaway slow enough
        // for a practical `.tran` step to resolve without diverging — see the file doc comment.
        const gain = 1000;
        const vcc = 15;
        const rg = 10_000;
        const rf = 100_000;
        const frequency = 1;
        const components = [
          part("g", "ground"),
          part("vin", "ac-voltage", { amplitude: 5, frequency, phase: -90 }),
          part("op1", "opamp", { gain, vcc }),
          part("rg", "resistor", { resistance: rg }),
          part("rf", "resistor", { resistance: rf }),
        ];
        const wires = [
          wire("w1", "vin", "pos", "op1", "in-"),
          wire("w2", "vin", "neg", "g", "gnd"),
          wire("w3", "op1", "in+", "rg", "a"),
          wire("w4", "rg", "b", "g", "gnd"),
          wire("w5", "op1", "in+", "rf", "a"),
          wire("w6", "rf", "b", "op1", "out"),
        ];
        const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
          `.tran 0.000005 ${1 / frequency}`,
        ]);
        const inSeries = nodeVoltageSeries("vin", "pos");
        const outSeries = nodeVoltageSeries("op1", "out");
        const transitions: number[] = [];
        for (let i = 1; i < outSeries.values.length; i += 1) {
          const previous = outSeries.values[i - 1];
          const current = outSeries.values[i];
          if (previous !== 0 && Math.sign(current) !== Math.sign(previous)) {
            transitions.push(inSeries.values[i]);
          }
        }
        // One full period of a symmetric ramp through a symmetric trigger: one rising crossing,
        // one falling crossing.
        expect(transitions.length).toBe(2);
        const expectedThreshold = vcc * (rg / (rg + rf));
        for (const vinAtSwitch of transitions) {
          expect(Math.abs(vinAtSwitch)).toBeGreaterThan(expectedThreshold * 0.7);
          expect(Math.abs(vinAtSwitch)).toBeLessThan(expectedThreshold * 1.3);
        }
        // The defining property of hysteresis: the two switch points sit on opposite sides of 0,
        // not both clustered near the same value.
        expect(Math.sign(transitions[0])).not.toBe(Math.sign(transitions[1]));
      },
      RUN_TIMEOUT * 3
    );
  });
});
