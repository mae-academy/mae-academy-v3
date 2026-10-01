/**
 * Real ngspice.wasm coverage for classic 1st/2nd-order circuit responses — the "known circuit,
 * SPICE ground truth, verify the math" strategy, applied to the actual engine functions the
 * oscilloscope's measurements are built on (getVrms/getFrequency/getVmean in spiceParser.ts,
 * calculateVpp/calculateVdc in oscilloscopeMeasurements.ts) rather than a fictional
 * `oscilloscope.setInputSignal()` API this app has no such thing as.
 *
 * These run raw hand-written netlists through `runNgspiceWithLog` directly (bypassing the schematic
 * component adapter) — deliberate, not a shortcut: `convertToSpiceComponents` has no path today to
 * emit a one-shot PULSE step or drive a plain R/L/C ladder without going through a full oscilloscope
 * component on the canvas, and these tests are about the transfer functions and transient response
 * themselves, which the adapter-driven ngspiceRegression.*.test.ts siblings don't cover.
 *
 * One correction worth flagging: the "underdamped R=100Ω / critical R=632Ω / overdamped R=2000Ω"
 * values commonly quoted for a 10mH/100µF series RLC don't actually produce those damping ratios —
 * ζ = R/2·√(C/L) for this topology, so R=100Ω here gives ζ=5 (heavily overdamped), not ζ≈0.3.
 * Critical damping is R=2√(L/C)=20Ω, not 632Ω (that formula is for a *parallel* RLC). The R values
 * below are solved from the real formula and checked against actual ngspice output, not copied.
 */
import { describe, expect, it } from "vitest";

import { runNgspiceWithLog } from "@/simulators/circuit-engine/engine/spice/ngspiceTestHarness";
import { getFrequency, getVmean, getVrms, parseSpiceResults } from "@/simulators/circuit-engine/engine/spice/spiceParser";
import { calculateVpp } from "@/simulators/circuit-engine/components/ui-components/oscilloscopeMeasurements";
import type { SamplePoint } from "@shared/circuit/circuitTypes";

const WASM_BOOT_TIMEOUT = 30_000;
const RUN_TIMEOUT = 15_000;

async function runAndParse(netlist: string) {
  const { vectors, log } = await runNgspiceWithLog(netlist);
  return { results: parseSpiceResults(vectors, vectors.time ?? []), log };
}

function toSamples(values: number[], time: number[]): SamplePoint[] {
  return time.map((t, i) => ({ time: t, value: values[i] ?? 0 }));
}

/** Times of the first `count` local maxima (value[i] strictly greater than both neighbors) — for
 * measuring a decaying oscillation's period directly, where a level-crossing detector doesn't apply
 * (see the comment at its call site). */
function findLocalMaximaTimes(values: number[], time: number[], count: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < values.length - 1 && peaks.length < count; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) peaks.push(time[i]);
  }
  return peaks;
}

/** First interpolated crossing time where `values` reaches `target`, rising from below it. */
function findTimeAtValue(values: number[], time: number[], target: number): number {
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] < target && values[i] >= target) {
      const fraction = (target - values[i - 1]) / (values[i] - values[i - 1]);
      return time[i - 1] + fraction * (time[i] - time[i - 1]);
    }
  }
  return NaN;
}

/**
 * Settling time: the first instant after which the signal stays inside [bandLow, bandHigh] for the
 * rest of the record — not just the first moment it happens to touch the band (a signal can dip in
 * and back out, e.g. the initial rise crossing 9.8V before its own overshoot), which is what a naive
 * first-crossing search would wrongly report as "already settled."
 */
function findSettlingTime(values: number[], time: number[], bandLow: number, bandHigh: number): number {
  for (let i = 0; i < values.length; i++) {
    if (values[i] < bandLow || values[i] > bandHigh) continue;
    const staysInBand = values.slice(i).every(value => value >= bandLow && value <= bandHigh);
    if (staysInBand) return time[i];
  }
  return NaN;
}

describe("1st/2nd-order circuit responses (ngspice.wasm)", () => {
  it("boots ngspice once so the first real test below isn't timed against the wasm load", async () => {
    await runNgspiceWithLog("warmup\nV1 n1 0 DC 1\n.op\n.end\n");
  }, WASM_BOOT_TIMEOUT);

  it(
    "RC low-pass at fc (R=10k, C=15.9nF, fc≈1kHz): -3dB, 0.707 peak, 0.5 Vrms",
    async () => {
      const { results } = await runAndParse(`
        RC low-pass
        V1 1 0 SIN(0 1 1000)
        R1 1 2 10k
        C1 2 0 15.9n
        .tran 2u 0.01
        .end
      `);
      const output = results.nodeVoltages["2"];
      const vrms = getVrms(output, results.time);
      const frequency = getFrequency(output, results.time);
      // Attenuation to 1/√2 of the 1V input at f = fc, by definition of the -3dB point.
      expect(vrms).toBeCloseTo(0.5, 1);
      expect(frequency).toBeCloseTo(1000, -1); // within ~50 Hz
    },
    RUN_TIMEOUT
  );

  it(
    "RC low-pass well below fc (f=100Hz): passes through near-unattenuated",
    async () => {
      const { results } = await runAndParse(`
        RC subcutoff
        V1 1 0 SIN(0 1 100)
        R1 1 2 10k
        C1 2 0 15.9n
        .tran 20u 0.1
        .end
      `);
      const output = results.nodeVoltages["2"];
      const vrms = getVrms(output, results.time);
      // 1/sqrt(1+(f/fc)^2) at f=100Hz, fc=1000Hz ≈ 0.995 of the 0.707 Vrms input.
      expect(vrms).toBeGreaterThan(0.68);
    },
    RUN_TIMEOUT
  );

  it(
    "RL high-pass at fc (L=1.5915H, R=10k, fc = R/(2πL) ≈ 1kHz): -3dB, 0.707 peak, 0.5 Vrms",
    async () => {
      const { results } = await runAndParse(`
        RL high-pass
        V1 1 0 SIN(0 1 1000)
        L1 1 2 1.5915
        R1 2 0 10k
        .tran 2u 0.01
        .end
      `);
      const output = results.nodeVoltages["2"];
      const vrms = getVrms(output, results.time);
      const frequency = getFrequency(output, results.time);
      expect(vrms).toBeCloseTo(0.5, 1);
      expect(frequency).toBeCloseTo(1000, -1);
    },
    RUN_TIMEOUT
  );

  // Series RLC (source -> R -> L -> C -> ground), Vc read at the R/L/C junction: ωn = 1/√(LC),
  // ζ = (R/2)·√(C/L) — not R/(2√(L/C)), which is the *parallel* RLC formula.
  const L = 10e-3; // 10 mH
  const C = 100e-6; // 100 µF -> ωn = 1/√(LC) = 1000 rad/s, fn ≈ 159.15 Hz
  function stepNetlist(resistance: number): string {
    return `
      RLC step response
      V1 1 0 PULSE(0 10 0 1n 1n 1 2)
      R1 1 2 ${resistance}
      L1 2 3 ${L}
      C1 3 0 ${C}
      .tran 20u 0.05
      .end
    `;
  }

  it(
    "RLC underdamped step (ζ≈0.3, R=6Ω): overshoots past the 10V final value, then rings down",
    async () => {
      const { results } = await runAndParse(stepNetlist(6));
      const vc = results.nodeVoltages["3"];
      const peak = Math.max(...vc);
      const overshootPct = ((peak - 10) / 10) * 100;
      // Theoretical: exp(-ζπ/√(1-ζ²))*100 ≈ 37% at ζ=0.3.
      expect(overshootPct).toBeGreaterThan(25);
      expect(overshootPct).toBeLessThan(50);
      // Damped oscillation frequency fd = fn·√(1-ζ²) ≈ 152 Hz. getFrequency's mid-level crossing
      // detector doesn't fit this signal shape — its (min+max)/2 level is set by the initial 0V→10V
      // step, but the ring's own amplitude decays quickly to well above that level (real ngspice
      // output: overshoots to 13.7V, then rings between ~8.6V and ~10.5V — never returning below
      // the ~6.85V level the first rise set), so it never re-triggers a second crossing. That's
      // correct behavior for a detector built to read steady periodic signals, not a bug — it just
      // means a decaying transient needs peak-to-peak timing instead, measured here directly.
      const firstTwoPeakTimes = findLocalMaximaTimes(vc, results.time, 2);
      expect(firstTwoPeakTimes).toHaveLength(2);
      const period = firstTwoPeakTimes[1] - firstTwoPeakTimes[0];
      const frequency = 1 / period;
      expect(frequency).toBeGreaterThan(120);
      expect(frequency).toBeLessThan(180);

      // Time to first peak: tp = π/ωd ≈ 3.29 ms.
      expect(firstTwoPeakTimes[0]).toBeGreaterThan(0.0025);
      expect(firstTwoPeakTimes[0]).toBeLessThan(0.004);

      // Settling time (2% band, 9.8–10.2V): ts = 4/(ζωn) ≈ 13.3 ms.
      const settlingTime = findSettlingTime(vc, results.time, 9.8, 10.2);
      expect(settlingTime).toBeGreaterThan(0.011);
      expect(settlingTime).toBeLessThan(0.016);
    },
    RUN_TIMEOUT
  );

  it(
    "RLC critically damped step (ζ=1, R=20Ω): reaches 10V with no overshoot",
    async () => {
      const { results } = await runAndParse(stepNetlist(20));
      const vc = results.nodeVoltages["3"];
      const peak = Math.max(...vc);
      expect(peak).toBeLessThan(10.3); // essentially no overshoot, allowing solver ripple
      expect(peak).toBeGreaterThan(9.5); // still actually reaches the final value

      // Rise time (10%→90%): the commonly-quoted "tr ≈ 2.2/ωn ≈ 2.2ms" estimate is for a 1st-order
      // system's 10-90% rise (2.2τ); a critically-damped 2nd-order step actually rises a bit slower
      // than that (real ngspice output here: ~3.36ms) since (1+ωnt)e^-ωnt starts with zero slope,
      // not linearly — checked against the real curve rather than the borrowed 1st-order estimate.
      const t10 = findTimeAtValue(vc, results.time, 1);
      const t90 = findTimeAtValue(vc, results.time, 9);
      expect(t90 - t10).toBeGreaterThan(0.0025);
      expect(t90 - t10).toBeLessThan(0.004);

      // Settling time (2% band): ts = 4/(ζωn) = 4/1000 = 4 ms — the fastest of the three regimes,
      // checked directly rather than only by comparison to the others below.
      const settlingTime = findSettlingTime(vc, results.time, 9.8, 10.2);
      expect(settlingTime).toBeGreaterThan(0.003);
      expect(settlingTime).toBeLessThan(0.006);
    },
    RUN_TIMEOUT
  );

  it(
    "RLC overdamped step (ζ=2, R=40Ω): real poles λ = -ωn(ζ∓√(ζ²-1)), dominant time constant τ≈3.73ms",
    async () => {
      const { results } = await runAndParse(stepNetlist(40));
      const vc = results.nodeVoltages["3"];
      expect(Math.max(...vc)).toBeLessThan(10.1); // no overshoot at all

      // λ1 = -ωn(ζ-√(ζ²-1)) = -1000(2-√3) ≈ -267.9 — the slower of the two real poles, which
      // dominates the response once the faster one (λ2≈-3732, τ≈0.27ms) has already decayed away.
      // A single-pole system reaches 1-1/e (63.2%) of its final value at t=τ; approximating this
      // 2-pole response the same way and checking it against the analytic τ is what's verified here.
      const tau = 1 / (1000 * (2 - Math.sqrt(3)));
      const t63 = findTimeAtValue(vc, results.time, 6.32);
      expect(t63).toBeGreaterThan(tau * 0.6);
      expect(t63).toBeLessThan(tau * 1.6);

      // Settling time is markedly slower than critical damping's 4ms — the "critical damping is the
      // fastest non-overshooting response" property, verified against real solver output.
      const settlingTime = findSettlingTime(vc, results.time, 9.8, 10.2);
      expect(settlingTime).toBeGreaterThan(0.006);
    },
    RUN_TIMEOUT
  );

  it(
    "LC tank ring-down: a narrow pulse into a lightly-damped L=1mH/C=1µF tank rings at f=1/(2π√LC)≈5033Hz",
    async () => {
      const { results } = await runAndParse(`
        LC tank ring-down
        V1 1 0 PULSE(0 5 0 1n 1n 1u 2u)
        R1 1 2 5
        L1 2 3 1m
        C1 3 0 1u
        .tran 0.2u 0.003
        .end
      `);
      const vc = results.nodeVoltages["3"];
      const time = results.time;
      // Skip the driving pulse itself (t < 3µs) — measure the free ring-down afterward.
      const ringDownStart = time.findIndex(t => t > 3e-6);
      const ringVc = vc.slice(ringDownStart);
      const ringTime = time.slice(ringDownStart);
      const frequency = getFrequency(ringVc, ringTime);
      expect(frequency).toBeGreaterThan(4500);
      expect(frequency).toBeLessThan(5500);
      // Peak-to-peak measured the same way the oscilloscope's own MeasurementTable does — real
      // ringing decays, so this should still be a healthy swing this soon after the pulse.
      const vpp = calculateVpp(toSamples(ringVc, ringTime));
      expect(vpp).toBeGreaterThan(3);
    },
    RUN_TIMEOUT
  );

  it(
    "heavily overdamped R-L-C step (R=1kΩ, L=1mH, C=1µF, ζ≈15.8) doesn't fool measurementWindow's whole-period clip into reading a spurious ~7.5V instead of the true ~22V",
    async () => {
      // Regression for a real bug: the R–L junction of this circuit briefly tracks the 24V source
      // almost instantly (inductor current starts at 0, so R carries none, so no drop across it),
      // then dips as inductor current builds over the fast L/R time constant, then climbs back
      // through the same mid-level on the slow RLC settle — two rising crossings from one transient
      // excursion, not a period. Before the fix, measurementWindow clipped to that "period" (under
      // 7% of the actual 10ms capture) and read the DC level as ~7.5V; it should read close to the
      // true settled value instead. Uses the exact component values that first surfaced this in the
      // running app, not a synthetic reproduction.
      const { results } = await runAndParse(`
        RLC overdamped
        V1 1 0 PULSE(0 24 0 1n 1n 1 2)
        R1 1 2 1k
        L1 2 3 1m
        C1 3 0 1u
        .tran 0.5u 0.01
        .end
      `);
      const junction = results.nodeVoltages["2"];
      expect(getVrms(junction, results.time)).toBeGreaterThan(18);
      expect(getVmean(junction, results.time)).toBeGreaterThan(18);
    },
    RUN_TIMEOUT
  );
});
