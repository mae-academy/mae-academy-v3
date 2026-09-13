/**
 * Real-ngspice.wasm regression coverage for filters and harmonics (validation spec Section X): RC
 * low-pass, RL high-pass, RLC series resonance, rectifier harmonic content (THD), power factor
 * degradation from harmonics, and filtering a harmonic-rich source. Same full-pipeline `simulate()`
 * as ngspiceRegression.test.ts — see ngspiceRegressionHelpers.ts. Harmonic amplitudes come from
 * `extractPhasor` run at each harmonic's own frequency (a single-frequency Fourier projection) rather
 * than a dedicated FFT — exact for a periodic signal sampled over whole cycles, which is what every
 * test here does.
 *
 * Two of the spec's own worked examples don't survive contact with real component values and are
 * corrected here, not reproduced as given:
 *  - The RL high-pass cutoff (f_c = R/(2πL)) needs R=10 Ω with L=1 mH to land at 1591.5 Hz, not the
 *    quoted R=10 kΩ (which would put f_c at ~1.59 MHz, not 1591.5 Hz).
 *  - The RLC resonance's own f₀ = 1/(2π√LC) with R=100Ω/L=100µH/C=100nF is 50.3 kHz, not the quoted
 *    159.15 kHz — R=10 Ω, L=1 mH, C=1 nF reproduces the quoted f₀=159.15kHz AND Q=100 exactly, and is
 *    used here instead.
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
} from "@/simulators/circuit-engine/engine/spice/ngspiceRegressionHelpers";
import { probeBranchKey } from "@/simulators/circuit-engine/engine/spice/spiceAdapter";

/** Input/output magnitude ratio and phase difference at `frequency`, from a settled `.tran` run. */
async function acResponse(
  components: ReturnType<typeof part>[],
  wires: ReturnType<typeof wire>[],
  frequency: number,
  outComponentId: string,
  outTerminal: string
) {
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
    gain: output.magnitude / input.magnitude,
    phaseDiffDegrees: calculatePhaseAngleDifference(input.angleDegrees, output.angleDegrees),
  };
}

describe("ngspice regression: filters & harmonics (real ngspice.wasm)", () => {
  beforeAll(warmupNgspice, WASM_BOOT_TIMEOUT);

  describe("Test 10.1 — RC low-pass filter (R=10kΩ, C=10nF, f_c=1591.5Hz)", () => {
    const buildLPF = (frequency: number) => ({
      components: [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude: 1, frequency, phase: 0 }),
        part("r1", "resistor", { resistance: 10_000 }),
        part("c1", "capacitor", { capacitance: 10e-9 }),
      ],
      wires: [
        wire("w1", "vin", "pos", "r1", "a"),
        wire("w2", "vin", "neg", "g", "gnd"),
        wire("w3", "r1", "b", "c1", "a"),
        wire("w4", "c1", "b", "g", "gnd"),
      ],
    });

    it.each([
      [100, 0.998, -3.6],
      [500, 0.968, -17],
      [1591.5, 0.707, -45],
      [10_000, 0.157, -81],
      [100_000, 0.0161, -89],
    ])("%s Hz: |H|≈%s, phase≈%s°", async (frequency, expectedGain, expectedPhase) => {
      const { components, wires } = buildLPF(frequency);
      const { gain, phaseDiffDegrees } = await acResponse(components, wires, frequency, "c1", "a");
      expect(Math.abs(gain - expectedGain) / expectedGain).toBeLessThan(0.08);
      expect(Math.abs(phaseDiffDegrees - expectedPhase)).toBeLessThan(6);
    }, RUN_TIMEOUT);

    it(
      "no resonance or peaking anywhere in the sweep (1st order, monotonic rolloff)",
      async () => {
        const gains: number[] = [];
        for (const frequency of [100, 500, 1591.5, 5000, 10_000, 50_000, 100_000]) {
          const { components, wires } = buildLPF(frequency);
          gains.push((await acResponse(components, wires, frequency, "c1", "a")).gain);
        }
        for (let i = 1; i < gains.length; i += 1) {
          expect(gains[i]).toBeLessThanOrEqual(gains[i - 1] * 1.01); // monotonically non-increasing.
        }
      },
      RUN_TIMEOUT * 3
    );
  });

  describe("Test 10.2 — RL high-pass filter (R=10Ω, L=1mH, f_c=1591.5Hz)", () => {
    // Output taken across L (not R): at DC the inductor is a short, so V_L→0 (blocked); at high
    // frequency it's an open, so nearly all of Vin appears across it (passed) — the high-pass shape.
    const buildHPF = (frequency: number) => ({
      components: [
        part("g", "ground"),
        part("vin", "ac-voltage", { amplitude: 1, frequency, phase: 0 }),
        part("r1", "resistor", { resistance: 10 }),
        part("l1", "inductor", { inductance: 1e-3 }),
      ],
      wires: [
        wire("w1", "vin", "pos", "r1", "a"),
        wire("w2", "vin", "neg", "g", "gnd"),
        wire("w3", "r1", "b", "l1", "a"),
        wire("w4", "l1", "b", "g", "gnd"),
      ],
    });

    // |H(f)| = (f/f_c) / √(1+(f/f_c)²): the 500 Hz and 10 kHz rows in the spec's own table (0.148,
    // 0.968) don't satisfy that formula — they're the *low*-pass table's values at those same rows,
    // apparently copy-pasted across. The endpoints (100Hz, f_c, 100kHz) do check out, so only the
    // two middle rows are corrected here (0.2998, 0.9874) to what the transfer function actually
    // gives — verified against ngspice.wasm.
    it.each([
      [100, 0.0157, 86],
      [500, 0.2998, 73],
      [1591.5, 0.707, 45],
      [10_000, 0.9874, 9],
      [100_000, 0.998, 0.9],
    ])("%s Hz: |H|≈%s, phase≈%s°", async (frequency, expectedGain, expectedPhase) => {
      const { components, wires } = buildHPF(frequency);
      const { gain, phaseDiffDegrees } = await acResponse(components, wires, frequency, "l1", "a");
      expect(Math.abs(gain - expectedGain)).toBeLessThan(Math.max(0.05, expectedGain * 0.1));
      expect(Math.abs(phaseDiffDegrees - expectedPhase)).toBeLessThan(6);
    }, RUN_TIMEOUT);

    it(
      "opposite polarity to the low-pass: attenuates low frequencies, passes high ones",
      async () => {
        const { components: lowF, wires: lowW } = buildHPF(100);
        const { components: highF, wires: highW } = buildHPF(100_000);
        const low = await acResponse(lowF, lowW, 100, "l1", "a");
        const high = await acResponse(highF, highW, 100_000, "l1", "a");
        expect(high.gain).toBeGreaterThan(low.gain * 10);
      },
      RUN_TIMEOUT
    );
  });

  describe("Test 10.3 — RLC series resonance (R=10Ω, L=1mH, C=1nF: f₀=159.15kHz, Q=100)", () => {
    const R = 10;
    const L = 1e-3;
    const C = 1e-9;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const Q = (2 * Math.PI * f0 * L) / R;
    const bandwidth = f0 / Q;

    async function currentAt(frequency: number, sourceRms: number, settlePeriods: number) {
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: sourceRms * Math.SQRT2, frequency, phase: 0 }),
        part("am1", "ammeter", { mode: "AC" }),
        part("r1", "resistor", { resistance: R }),
        part("l1", "inductor", { inductance: L }),
        part("c1", "capacitor", { capacitance: C }),
      ];
      const wires = [
        wire("w1", "v1", "pos", "am1", "pos"),
        wire("w2", "am1", "neg", "r1", "a"),
        wire("w3", "r1", "b", "l1", "a"),
        wire("w4", "l1", "b", "c1", "a"),
        wire("w5", "c1", "b", "g", "gnd"),
        wire("w6", "v1", "neg", "g", "gnd"),
      ];
      // High Q means a slow ring-up (τ = 2Q/ω₀ ≈ 0.2 ms here) — many periods are needed to reach
      // the true steady-state amplitude, not just to sample enough cycles for extractPhasor.
      const { readings } = await simulate(components, wires, "practical", [
        `.tran ${1 / frequency / 100} ${settlePeriods / frequency}`,
      ]);
      return readings.am1.value;
    }

    it(
      "f₀, Q and bandwidth match the component values",
      () => {
        expect(f0).toBeCloseTo(159_150, -2);
        expect(Q).toBeCloseTo(100, 0);
        expect(bandwidth).toBeCloseTo(1591.5, -1);
      }
    );

    it(
      "current peaks at f₀ (Z=R, minimum impedance) and drops to ~1/√2 at the -3dB points",
      async () => {
        const iPeak = await currentAt(f0, 10, 1000);
        const iLower = await currentAt(f0 - bandwidth / 2, 10, 1000);
        const iUpper = await currentAt(f0 + bandwidth / 2, 10, 1000);
        expect(iPeak).toBeCloseTo(10 / R, 0); // I_max = V/R = 1.0 A.
        expect(iLower / iPeak).toBeCloseTo(1 / Math.SQRT2, 1);
        expect(iUpper / iPeak).toBeCloseTo(1 / Math.SQRT2, 1);
      },
      RUN_TIMEOUT * 6
    );

    it(
      "far from resonance (f₀/2 and 2f₀) the current is a small fraction of the peak — a real band-pass",
      async () => {
        const iPeak = await currentAt(f0, 10, 1000);
        const iLow = await currentAt(f0 / 2, 10, 30);
        const iHigh = await currentAt(f0 * 2, 10, 30);
        expect(iLow / iPeak).toBeLessThan(0.1);
        expect(iHigh / iPeak).toBeLessThan(0.1);
      },
      RUN_TIMEOUT * 4
    );
  });

  describe("Test 10.4 — harmonic content of rectified outputs (THD)", () => {
    // Fourier-projects a settled rectifier output at DC and several harmonics of 50 Hz.
    async function harmonicsOf(rectifier: "half" | "full") {
      const FREQUENCY = 50;
      const components = [
        part("g", "ground"),
        part("v1", "ac-voltage", { amplitude: 10 * Math.SQRT2, frequency: FREQUENCY, phase: 0 }),
        part("d1", "diode-silicon"),
        ...(rectifier === "full"
          ? [part("d2", "diode-silicon"), part("d3", "diode-silicon"), part("d4", "diode-silicon")]
          : []),
        part("rl", "resistor", { resistance: 1000 }),
      ];
      const wires =
        rectifier === "half"
          ? [
              wire("w1", "v1", "pos", "d1", "anode"),
              wire("w2", "d1", "cathode", "rl", "a"),
              wire("w3", "rl", "b", "g", "gnd"),
              wire("w4", "v1", "neg", "g", "gnd"),
            ]
          : [
              // Full bridge: D1/D2 steer each half-cycle's positive terminal onto rl.a; D3/D4 return
              // the other terminal from rl.b, so rl.a is always the more-positive node.
              wire("w1", "d1", "anode", "v1", "pos"),
              wire("w2", "d1", "cathode", "rl", "a"),
              wire("w3", "d2", "anode", "v1", "neg"),
              wire("w4", "d2", "cathode", "rl", "a"),
              wire("w5", "d3", "anode", "rl", "b"),
              wire("w6", "d3", "cathode", "v1", "pos"),
              wire("w7", "d4", "anode", "rl", "b"),
              wire("w8", "d4", "cathode", "v1", "neg"),
              wire("w9", "rl", "b", "g", "gnd"),
            ];
      const periods = 10;
      const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
        `.tran ${1 / FREQUENCY / 300} ${periods / FREQUENCY}`,
      ]);
      const series = nodeVoltageSeries("rl", "a");
      const startIndex = series.time.findIndex(t => t >= (periods - 4) / FREQUENCY);
      const time = series.time.slice(startIndex);
      const values = series.values.slice(startIndex);
      const dc = values.reduce((sum, v) => sum + v, 0) / values.length;
      const at = (harmonicFrequency: number) => extractPhasor(time, values, harmonicFrequency).magnitude;
      const fundamental = rectifier === "half" ? FREQUENCY : 2 * FREQUENCY;
      const harmonics = [2, 3, 5, 7].map(n => at(n * fundamental));
      const thd = Math.sqrt(harmonics.reduce((sum, h) => sum + h * h, 0)) / at(fundamental);
      return { dc, fundamental: at(fundamental), thd };
    }

    it(
      "half-wave: dominated by DC + fundamental, THD≈45%",
      async () => {
        const { dc, fundamental, thd } = await harmonicsOf("half");
        // Ideal half-wave: DC = Vpk/π, fundamental amplitude = Vpk/2.
        expect(dc).toBeGreaterThan(3);
        expect(dc).toBeLessThan(5.5);
        expect(fundamental).toBeGreaterThan(5);
        expect(thd).toBeGreaterThan(0.3);
        expect(thd).toBeLessThan(0.6);
      },
      RUN_TIMEOUT
    );

    it(
      "full-wave: roughly double the DC of half-wave, lower THD (odd-harmonic content decays faster)",
      async () => {
        const half = await harmonicsOf("half");
        const full = await harmonicsOf("full");
        expect(full.dc).toBeGreaterThan(half.dc * 1.3);
        expect(full.thd).toBeLessThan(half.thd);
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 10.5 — power factor degradation from harmonics (nonlinear rectifier load)", () => {
    it(
      "a bridge-rectifier+filter load draws harmonic-rich current that degrades PF well below 1",
      async () => {
        const FREQUENCY = 230;
        const frequency = 50;
        const components = [
          part("g", "ground"),
          part("v1", "ac-voltage", { amplitude: FREQUENCY * Math.SQRT2, frequency, phase: 0 }),
          part("am1", "ammeter", { mode: "AC" }),
          part("d1", "diode-silicon"),
          part("d2", "diode-silicon"),
          part("d3", "diode-silicon"),
          part("d4", "diode-silicon"),
          part("cf", "capacitor", { capacitance: 10e-6, initialVoltage: 0 }),
          part("rl", "resistor", { resistance: 1000 }),
        ];
        // Full bridge: am1 senses the total current the source delivers into it, whichever diode
        // pair is conducting; cf smooths the rectified DC, making the load genuinely nonlinear.
        const wires = [
          wire("w1", "v1", "pos", "am1", "pos"),
          wire("w2", "am1", "neg", "d1", "anode"),
          wire("w3", "am1", "neg", "d3", "cathode"),
          wire("w4", "v1", "neg", "d2", "anode"),
          wire("w5", "v1", "neg", "d4", "cathode"),
          wire("w6", "d1", "cathode", "rl", "a"),
          wire("w7", "d2", "cathode", "rl", "a"),
          wire("w8", "d3", "anode", "rl", "b"),
          wire("w9", "d4", "anode", "rl", "b"),
          wire("w10", "cf", "a", "rl", "a"),
          wire("w11", "cf", "b", "rl", "b"),
          wire("w12", "rl", "b", "g", "gnd"),
        ];
        const periods = 20;
        const { readings, results, nodeVoltageSeries } = await simulate(components, wires, "practical", [
          `.tran ${1 / frequency / 300} ${periods / frequency} uic`,
        ]);
        const iRms = readings.am1.value;
        const branchCurrent = results.branchCurrents[probeBranchKey("am1")];
        const startIndex = results.time.findIndex(t => t >= (periods - 5) / frequency);
        const time = results.time.slice(startIndex);
        const current = branchCurrent.slice(startIndex);
        const vPos = nodeVoltageSeries("v1", "pos").values.slice(startIndex);
        const vNeg = nodeVoltageSeries("v1", "neg").values.slice(startIndex);
        const differentialVoltage = vPos.map((v, i) => v - vNeg[i]);

        // I₁ (fundamental-only RMS) vs the meter's true I_RMS: harmonics widen the gap.
        const fundamentalCurrentRms = extractPhasor(time, current, frequency).magnitude / Math.SQRT2;
        expect(iRms).toBeGreaterThan(fundamentalCurrentRms * 1.1);

        // Real power via direct v(t)·i(t) time-domain integration (exact for any waveform shape,
        // not just sinusoids) vs apparent power V_RMS × I_RMS: PF = P/S.
        let energy = 0;
        for (let i = 1; i < time.length; i += 1) {
          const dt = time[i] - time[i - 1];
          energy +=
            dt * ((differentialVoltage[i] * current[i] + differentialVoltage[i - 1] * current[i - 1]) / 2);
        }
        const realPower = energy / (time[time.length - 1] - time[0]);
        const vRms = extractPhasor(time, differentialVoltage, frequency).magnitude / Math.SQRT2;
        const apparentPower = vRms * iRms;
        const powerFactor = realPower / apparentPower;
        expect(vRms).toBeCloseTo(FREQUENCY, 0);
        expect(powerFactor).toBeLessThan(0.85); // Degraded well below 1 by the rectifier's harmonics.
        expect(powerFactor).toBeGreaterThan(0.3); // Still delivering real power, not purely reactive.
      },
      RUN_TIMEOUT * 2
    );
  });

  describe("Test 10.6 — the RC low-pass filter attenuates high harmonics more than low ones", () => {
    it(
      "a 100 Hz fundamental passes near-unchanged; its own 15th and 21st harmonics are progressively cut, reducing THD",
      async () => {
        // Reuses Test 10.1's own R/C (f_c=1591.5Hz): the spec's own harmonic table (100/1500/2100Hz
        // at 100%/33%/20%) is injected directly as three series AC sources (voltages of series
        // sources sum instant-by-instant) rather than via a rectifier, whose own harmonics all sit
        // well below this f_c and so wouldn't demonstrate any attenuation at all.
        const components = [
          part("g", "ground"),
          part("va", "ac-voltage", { amplitude: 1, frequency: 100, phase: 0 }),
          part("vb", "ac-voltage", { amplitude: 0.33, frequency: 1500, phase: 0 }),
          part("vc", "ac-voltage", { amplitude: 0.2, frequency: 2100, phase: 0 }),
          part("r1", "resistor", { resistance: 10_000 }),
          part("c1", "capacitor", { capacitance: 10e-9 }),
        ];
        const wires = [
          wire("w1", "va", "pos", "g", "gnd"),
          wire("w2", "va", "neg", "vb", "pos"),
          wire("w3", "vb", "neg", "vc", "pos"),
          wire("w4", "vc", "neg", "r1", "a"),
          wire("w5", "r1", "b", "c1", "a"),
          wire("w6", "c1", "b", "g", "gnd"),
        ];
        const { nodeVoltageSeries } = await simulate(components, wires, "practical", [
          ".tran 0.00001 0.05",
        ]);
        const inputSeries = nodeVoltageSeries("vc", "neg");
        const outputSeries = nodeVoltageSeries("c1", "a");
        const startIndex = inputSeries.time.findIndex(t => t >= 0.02);
        const time = inputSeries.time.slice(startIndex);
        const input = inputSeries.values.slice(startIndex);
        const output = outputSeries.values.slice(startIndex);
        const gainAt = (frequency: number) =>
          extractPhasor(time, output, frequency).magnitude / extractPhasor(time, input, frequency).magnitude;

        const gain100 = gainAt(100);
        const gain1500 = gainAt(1500);
        const gain2100 = gainAt(2100);
        expect(gain100).toBeGreaterThan(0.95); // Fundamental passes almost unchanged.
        expect(gain1500).toBeLessThan(gain100); // Higher harmonics attenuated more...
        expect(gain2100).toBeLessThan(gain1500); // ...progressively, matching -20dB/decade.

        const thdOf = (values: number[]) => {
          const h1 = extractPhasor(time, values, 100).magnitude;
          const h15 = extractPhasor(time, values, 1500).magnitude;
          const h21 = extractPhasor(time, values, 2100).magnitude;
          return Math.sqrt(h15 * h15 + h21 * h21) / h1;
        };
        expect(thdOf(output)).toBeLessThan(thdOf(input));
      },
      RUN_TIMEOUT
    );
  });
});
