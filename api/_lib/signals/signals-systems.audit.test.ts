/**
 * MAE Academy / Signals & Systems — comprehensive engine audit.
 *
 * The audit specification was written against a hypothetical object-literal API
 * (`signalEngine.calculateEnergy({ type: "sine", frequency: 1 })`). The shipped engines are
 * expression-driven: a typed AST for signals, a `y(t)=…` grammar for systems, and an
 * `H(s)`/`H(z)` grammar for transfer functions. Every test below preserves the *mathematical*
 * assertion of its specification item while addressing the real surface. Deviations from the
 * specification's stated expected values are justified inline where the specification itself
 * was numerically wrong or convention-dependent.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeWindowedSignal,
  detectedFundamentalPeriod,
  evaluateSignal,
  parseSignalExpression,
  type SignalNode,
} from "../../../shared/signals/signalEngine";
import { classifySystem, parseSystemExpression, shiftTestSamples, stabilitySamples, superpositionSamples, type SystemSemantic } from "./systemClassifier";
import { continuousConvolutionAt, discreteConvolution } from "./convolutionEngine";
import { fourierSeries, fourierTransform } from "./fourierEngine";
import { partialSum, waterfallHarmonics } from "../../../shared/signals/seriesSynthesis";
import { parseTransferFunction, polynomialRoots } from "./laplaceEngine";
import { magnitudeLandscape, rocFor } from "../../../shared/signals/transferFunction";

function ast(source: string): SignalNode {
  const parsed = parseSignalExpression(source);
  if (!parsed.ok) throw new Error(`${source} → ${parsed.error}`);
  return parsed.ast;
}

function system(source: string): SystemSemantic {
  const parsed = parseSystemExpression(source);
  if (!parsed.ok) throw new Error(`${source} → ${parsed.error}`);
  return parsed.system;
}

function verdicts(source: string) {
  return Object.fromEntries(classifySystem(system(source)).pillars.map((pillar) => [pillar.id, pillar.verdict]));
}

/** Complex Fourier coefficients relate to the trigonometric form by cₖ = (aₖ − j bₖ)/2. */
function sineCoefficient(series: ReturnType<typeof fourierSeries>, harmonic: number) {
  return -2 * series.coefficients.find((coefficient) => coefficient.harmonic === harmonic)!.imaginary;
}
function cosineCoefficient(series: ReturnType<typeof fourierSeries>, harmonic: number) {
  return 2 * series.coefficients.find((coefficient) => coefficient.harmonic === harmonic)!.real;
}

describe("Signals & Systems Simulator — Comprehensive Audit", () => {
  describe("Task 1: Signal Operations & Properties", () => {
    it("Test 1: energy of a unit sinusoid over one period is A²T/2", () => {
      // E = ∫₀¹ sin²(2πt) dt = 0.5
      const result = analyzeWindowedSignal(ast("sin(2*pi*t)"), { from: 0, to: 1 }, "aperiodic");
      expect(result.energyEstimate).toBeCloseTo(0.5, 6);
      expect(result.classification).toBe("Energy");
    });

    it("Test 2: energy of a decaying exponential over [0,5] is (1−e⁻¹⁰)/2", () => {
      // E = ∫₀⁵ (e⁻ᵗ)² dt = (1 − e⁻¹⁰)/2 ≈ 0.4999773
      const result = analyzeWindowedSignal(ast("exp(-t)"), { from: 0, to: 5 }, "aperiodic");
      expect(result.energyEstimate).toBeCloseTo((1 - Math.exp(-10)) / 2, 4);
      expect(evaluateSignal(ast("e^{-t}"), 1)).toBeCloseTo(Math.exp(-1), 12);
    });

    it("Test 3: average power of a periodic sinusoid is A²/2", () => {
      // x(t) = 2·sin(2πt), T₀ = 1 ⇒ P = 4/2 = 2
      const result = analyzeWindowedSignal(ast("2*sin(2*pi*t)"), { from: 0, to: 1 }, "periodic");
      expect(result.averagePower).toBeCloseTo(2, 6);
      expect(result.classification).toBe("Power");
      expect(result.energyEstimate).toBe(Number.POSITIVE_INFINITY);
    });

    it("Test 4: fundamental period of a 3 Hz sinusoid is 1/3", () => {
      expect(detectedFundamentalPeriod(ast("sin(2*pi*3*t)"))).toBeCloseTo(1 / 3, 6);
      // A sum of commensurate harmonics collapses to the LCM of the component periods.
      expect(detectedFundamentalPeriod(ast("sin(2*pi*3*t)+cos(2*pi*2*t)"))).toBeCloseTo(1, 6);
    });
  });

  describe("Task 2: System Classification", () => {
    it("Test 5: y(t)=2x(t) is linear", () => {
      expect(verdicts("y(t)=2*x(t)").linearity).toBe("Linear");
      // Superposition residual must vanish numerically, not just symbolically.
      const residual = Math.max(...superpositionSamples(system("y(t)=2*x(t)"), 1.3, -0.6).map((point) => Math.abs(point.difference)));
      expect(residual).toBeLessThan(1e-9);
    });

    it("Test 6: y(t)=x²(t) is non-linear", () => {
      expect(verdicts("y(t)=x^2(t)").linearity).toBe("Non-Linear");
      const residual = Math.max(...superpositionSamples(system("y(t)=x^2(t)"), 1.3, -0.6).map((point) => Math.abs(point.difference)));
      expect(residual).toBeGreaterThan(0.1);
    });

    it("Test 7: y(t)=x(t)+x(t−1) is time-invariant", () => {
      // The grammar models affine input samples, not memoryless nonlinearities such as sin(x(t)),
      // so the specification's sin(x(t)) probe is realized with the equivalent LTI delay system.
      expect(verdicts("y(t)=x(t)+x(t-1)").time).toBe("Time-Invariant");
      const residual = Math.max(...shiftTestSamples(system("y(t)=x(t)+x(t-1)"), 1).map((point) => Math.abs(point.difference)));
      expect(residual).toBeLessThan(1e-9);
    });

    it("Test 8: y(t)=t·x(t) is time-variant", () => {
      expect(verdicts("y(t)=t*x(t)").time).toBe("Time-Variant");
      const residual = Math.max(...shiftTestSamples(system("y(t)=t*x(t)"), 1).map((point) => Math.abs(point.difference)));
      expect(residual).toBeGreaterThan(0.1);
    });

    it("Test 9: y(t)=x(t)+x(t−1) is causal", () => {
      expect(verdicts("y(t)=x(t)+x(t-1)").causality).toBe("Causal");
    });

    it("Test 10: y(t)=x(t+1)+x(t) is non-causal", () => {
      expect(verdicts("y(t)=x(t+1)+x(t)").causality).toBe("Non-Causal");
      // Time scaling also requires input outside the causal cone.
      expect(verdicts("y(t)=x(2t)").causality).toBe("Non-Causal");
    });

    it("Test 11: y(t)=3x(t) is memoryless", () => {
      expect(verdicts("y(t)=3*x(t)").memory).toBe("Memoryless");
    });

    it("Test 12: y(t)=x(t)+x(t−0.1) has memory of 0.1 s", () => {
      expect(verdicts("y(t)=x(t)+x(t-0.1)").memory).toBe("Dynamic");
      // No getMemoryDuration() exists; the delay is carried on the parsed input-sample term.
      const delays = system("y(t)=x(t)+x(t-0.1)").terms.flatMap((term) => (term.kind === "input-sample" ? [Math.abs(term.argument.offset)] : []));
      expect(Math.max(...delays)).toBeCloseTo(0.1, 6);
    });

    it("Test 13: y(t)=0.5·x(t−1) is BIBO stable", () => {
      expect(verdicts("y(t)=0.5*x(t-1)")).toMatchObject({
        linearity: "Linear",
        time: "Time-Invariant",
        causality: "Causal",
        memory: "Dynamic",
        stability: "BIBO Stable",
      });
      // A bounded unit step must produce a bounded response.
      const outputs = stabilitySamples(system("y(t)=0.5*x(t-1)")).map((point) => Math.abs(point.output));
      expect(Math.max(...outputs)).toBeLessThanOrEqual(0.5 + 1e-9);
    });

    it("Test 14: unbounded-gain and integrating systems are unstable", () => {
      expect(verdicts("y(t)=t*x(t)").stability).toBe("Unstable");
      expect(verdicts("y(t)=\\int_{-\\infty}^{t}x(\\tau)d\\tau").stability).toBe("Unstable");
      const ramp = stabilitySamples(system("y(t)=t*x(t)"));
      expect(ramp.at(-1)!.output).toBeGreaterThan(7.9);
      // The specification's e^t·x(t) is outside the grammar; it must be rejected, never
      // silently misclassified as stable.
      expect(parseSystemExpression("y(t)=exp(t)*x(t)").ok).toBe(false);
    });
  });

  describe("Task 3: Convolution Engine", () => {
    it("Test 15: discrete convolution of [1,2,3] and [1,1]", () => {
      expect(discreteConvolution([1, 2, 3], [1, 1]).values).toEqual([1, 3, 5, 3]);
    });

    it("Test 16: convolution with the unit impulse is the identity", () => {
      expect(discreteConvolution([1, 2, 3, 4, 5], [1]).values).toEqual([1, 2, 3, 4, 5]);
      // Continuous counterpart: x(t) ∗ δ(t−2) = x(t−2), via the symbolic shortcut.
      const shifted = continuousConvolutionAt(ast("tri(t)"), ast("delta(t-2)"), 2.5);
      expect(shifted.usedDeltaShortcut).toBe(true);
      expect(shifted.value).toBeCloseTo(evaluateSignal(ast("tri(t)"), 0.5), 12);
    });

    it("Test 17: convolution is commutative", () => {
      expect(discreteConvolution([1, 2, 3], [1, 1]).values).toEqual(discreteConvolution([1, 1], [1, 2, 3]).values);
      expect(discreteConvolution([2, -1, 4], [0.5, 3, -2]).values).toEqual(discreteConvolution([0.5, 3, -2], [2, -1, 4]).values);
    });

    it("Test 18: per-output contributions record the exact overlapping index pairs", () => {
      const result = discreteConvolution([1, 2, 3], [1, 0.5]);
      // The specification lists y[2] = 3.5 while stating the correct expansion
      // x[1]·h[1] + x[2]·h[0] = 2·0.5 + 3·1, which evaluates to 4. The engine is correct.
      expect(result.values).toEqual([1, 2.5, 4, 1.5]);
      // The engine exposes overlap as contribution records rather than a getConvolutionSteps() list.
      expect(result.contributions.map((step) => step.map((cell) => cell.xIndex))).toEqual([[0], [0, 1], [1, 2], [2]]);
      expect(result.contributions[1]).toEqual([
        { xIndex: 0, hIndex: 1, value: 0.5, active: true },
        { xIndex: 1, hIndex: 0, value: 2, active: true },
      ]);
      // Every contribution must reconstruct its output sample exactly.
      result.values.forEach((value, index) => {
        expect(result.contributions[index].reduce((sum, cell) => sum + cell.value, 0)).toBeCloseTo(value, 12);
      });
    });

    it("Test 18b: output length is len(x)+len(h)−1 and rect ∗ rect is the unit triangle", () => {
      expect(discreteConvolution([1, 2, 3], [1, 0.5, 2, 4]).values).toHaveLength(6);
      const rect = ast("rect(t)");
      expect(continuousConvolutionAt(rect, rect, 0).value).toBeCloseTo(1, 2);
      expect(continuousConvolutionAt(rect, rect, 0.5).value).toBeCloseTo(0.5, 2);
      expect(continuousConvolutionAt(rect, rect, 1.2).value).toBeCloseTo(0, 2);
    });
  });

  describe("Task 4: Fourier Analysis", () => {
    it("Test 19: square-wave series has no DC, no cosines, and bₙ = 4/(nπ) for odd n", () => {
      // sgn(t) on [−T₀/2, T₀/2) is the odd-symmetric unit square wave.
      const series = fourierSeries(ast("sgn(t)"), 1, 6);
      expect(series.omega0).toBeCloseTo(2 * Math.PI, 9);
      expect(series.coefficients.find((coefficient) => coefficient.harmonic === 0)!.real).toBeCloseTo(0, 6);
      expect(sineCoefficient(series, 1)).toBeCloseTo(4 / Math.PI, 2);
      expect(sineCoefficient(series, 2)).toBeCloseTo(0, 6);
      expect(sineCoefficient(series, 3)).toBeCloseTo(4 / (3 * Math.PI), 2);
      expect(cosineCoefficient(series, 1)).toBeCloseTo(0, 6);
      // Hermitian symmetry c₋ₖ = conj(cₖ) for a real signal.
      const positive = series.coefficients.find((coefficient) => coefficient.harmonic === 3)!;
      const negative = series.coefficients.find((coefficient) => coefficient.harmonic === -3)!;
      expect(negative.real).toBeCloseTo(positive.real, 9);
      expect(negative.imaginary).toBeCloseTo(-positive.imaginary, 9);
    });

    it("Test 20: sawtooth series has a₀ = 0.5 and bₙ = (−1)ⁿ⁺¹/(nπ)", () => {
      // The engine integrates over [−T₀/2, T₀/2], so the unit ramp on that window is t + 0.5.
      // The specification's bₙ = −2/(nπ) assumes both the [0,T₀) window AND a peak-to-peak of 2;
      // for a ramp of unit amplitude on the symmetric window the coefficients are (−1)ⁿ⁺¹/(nπ).
      const series = fourierSeries(ast("t+0.5"), 1, 8);
      expect(series.coefficients.find((coefficient) => coefficient.harmonic === 0)!.real).toBeCloseTo(0.5, 6);
      for (let harmonic = 1; harmonic <= 5; harmonic += 1) {
        expect(sineCoefficient(series, harmonic)).toBeCloseTo(Math.pow(-1, harmonic + 1) / (harmonic * Math.PI), 3);
        expect(cosineCoefficient(series, harmonic)).toBeCloseTo(0, 3);
      }
    });

    it("Test 21: the Gaussian transform matches its closed form and is even", () => {
      // x(t) = e^(−πt²) ⇒ X(jω) = e^(−ω²/4π); self-dual in f, Gaussian in ω.
      const transform = fourierTransform(ast("exp(-pi*t^2)"), 1, 8, 320);
      const at = (omega: number) => transform.spectrum[Math.round((omega + 8) / (16 / 320))];
      expect(at(0).magnitude).toBeCloseTo(1, 3);
      expect(at(0).magnitude).toBeCloseTo(Math.max(...transform.spectrum.map((point) => point.magnitude)), 9);
      expect(at(2).magnitude).toBeCloseTo(Math.exp(-1 / Math.PI), 3);
      expect(at(-2).magnitude).toBeCloseTo(at(2).magnitude, 6);
      // A real, even signal has a purely real spectrum.
      expect(Math.max(...transform.spectrum.map((point) => Math.abs(point.imaginary)))).toBeLessThan(1e-6);
    });

    it("Test 22: the rectangular pulse transforms to sinc, analytically and numerically", () => {
      // rect(t) of unit width ⇒ X(jω) = sin(ω/2)/(ω/2); first zero at ω = 2π.
      const transform = fourierTransform(ast("rect(t)"), 1, 2 * Math.PI, 8);
      expect(transform.isStandardRect).toBe(true);
      expect(transform.spectrum[4].omega).toBeCloseTo(0, 9);
      expect(transform.spectrum[4].magnitude).toBeCloseTo(1, 9);
      expect(transform.spectrum[6].magnitude).toBeCloseTo(2 / Math.PI, 6); // ω = π
      expect(transform.spectrum[8].magnitude).toBeCloseTo(0, 6); // ω = 2π, first zero
      // The numerical path (non-canonical AST) must agree with the analytic shortcut.
      const numeric = fourierTransform(ast("1*rect(t)"), 1, 2 * Math.PI, 8);
      expect(numeric.isStandardRect).toBe(false);
      numeric.spectrum.forEach((point, index) => {
        expect(Math.abs(point.magnitude - transform.spectrum[index].magnitude)).toBeLessThan(0.02);
      });
    });

    it("Test 23: time compression x(at) scales the spectrum by 1/|a| and widens it by a", () => {
      const base = fourierTransform(ast("rect(t)"), 1, 4 * Math.PI, 16);
      const compressed = fourierTransform(ast("rect(t)"), 2, 4 * Math.PI, 16);
      // X_a(0) = X(0)/|a|
      expect(compressed.spectrum[8].magnitude).toBeCloseTo(base.spectrum[8].magnitude / 2, 9);
      // The first null moves from ω = 2π to ω = 4π.
      expect(base.spectrum[12].magnitude).toBeCloseTo(0, 6); // ω = 2π
      expect(compressed.spectrum[16].magnitude).toBeCloseTo(0, 6); // ω = 4π
      expect(compressed.spectrum[12].magnitude).toBeGreaterThan(0.1);
      // Duality X_a(ω) = (1/|a|)·X(ω/a) holds pointwise on the shared grid.
      compressed.spectrum.forEach((point, index) => {
        if (index % 2 !== 0) return;
        const source = base.spectrum[8 + (index - 8) / 2];
        expect(point.magnitude).toBeCloseTo(source.magnitude / 2, 6);
      });
    });

    it("Test 24: waterfall traces span one period and reconstruct the partial sum", () => {
      const series = fourierSeries(ast("sgn(t)"), 1, 8);
      const waterfall = waterfallHarmonics(series, 5, 64);
      // The engine emits one trajectory per signed harmonic (k = −5…5), not a [time][harmonic] grid.
      expect(waterfall).toHaveLength(11);
      expect(waterfall.map((trace) => trace.harmonic)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
      waterfall.forEach((trace) => {
        expect(trace.time).toHaveLength(64);
        expect(trace.amplitude).toHaveLength(64);
        expect(trace.time[0]).toBeCloseTo(-series.period / 2, 9);
        expect(trace.time.at(-1)).toBeCloseTo(series.period / 2, 9);
        trace.amplitude.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      });
      // Superposing every trace must equal the band-limited partial sum at the same instant.
      [8, 21, 40, 55].forEach((index) => {
        const stacked = waterfall.reduce((sum, trace) => sum + trace.amplitude[index], 0);
        expect(stacked).toBeCloseTo(partialSum(series, waterfall[0].time[index], 5), 9);
      });
      // The fundamental must dominate every higher harmonic of an odd square wave.
      const energy = (harmonic: number) => Math.max(...waterfall.find((trace) => trace.harmonic === harmonic)!.amplitude.map(Math.abs));
      expect(energy(1)).toBeGreaterThan(energy(3));
      expect(energy(3)).toBeGreaterThan(energy(5));
    });
  });

  describe("Task 5: Laplace & Z-Transform", () => {
    it("Test 25: H(s)=1/(s+2) has a single pole at s=−2", () => {
      const transfer = parseTransferFunction("H(s)=1/(s+2)", "s");
      expect(transfer.numerator).toEqual([1]);
      expect(transfer.denominator).toEqual([1, 2]);
      expect(transfer.poles).toHaveLength(1);
      expect(transfer.poles[0].re).toBeCloseTo(-2, 6);
      expect(transfer.poles[0].im).toBeCloseTo(0, 6);
      expect(transfer.zeros).toHaveLength(0);
    });

    it("Test 26: the unit step H(s)=1/s has a pole at the origin and is not stable", () => {
      const transfer = parseTransferFunction("H(s)=1/s", "s");
      expect(transfer.numerator).toEqual([1]);
      expect(transfer.denominator).toEqual([1, 0]);
      expect(transfer.poles).toHaveLength(1);
      expect(transfer.poles[0].re).toBeCloseTo(0, 6);
      // A pole on the jω axis excludes the axis from the ROC.
      expect(rocFor(transfer, "right").stable).toBe(false);
    });

    it("Test 27: the geometric sequence H(z)=z/(z−0.5) has a right-sided ROC |z|>0.5", () => {
      const transfer = parseTransferFunction("H(z)=z/(z-0.5)", "z");
      expect(transfer.poles[0].re).toBeCloseTo(0.5, 6);
      expect(transfer.zeros[0].re).toBeCloseTo(0, 6);
      const roc = rocFor(transfer, "right");
      expect(roc.kind).toBe("right");
      expect(roc.boundary).toBeCloseTo(0.5, 6);
      expect(roc.stable).toBe(true);
    });

    it("Test 28: ROC boundaries follow the outermost/innermost pole radii", () => {
      const transfer = parseTransferFunction("H(z)=1/(z^2-0.2z-0.15)", "z"); // poles at z = 0.5 and z = −0.3
      expect(transfer.poles.map((pole) => pole.re).sort((a, b) => a - b)).toEqual([-0.3, 0.5]);
      expect(rocFor(transfer, "right").boundary).toBeCloseTo(0.5, 6);
      expect(rocFor(transfer, "right").stable).toBe(true);
      // Left-sided: |z| < innermost radius, which excludes the unit circle.
      const left = rocFor(transfer, "left");
      expect(left.innerBoundary ?? left.boundary).toBeDefined();
      expect(left.latex).toContain("<0.3");
      expect(left.stable).toBe(false);
      // A single-pole system has no annulus, so its two-sided ROC must be degenerate, not 0<|z|<r.
      const single = rocFor(parseTransferFunction("H(z)=1/(z-0.5)", "z"), "two-sided");
      expect(single.innerBoundary).toBeCloseTo(single.boundary, 6);
    });

    it("Test 29: H(z)=1/(z²−1.5z+0.5) has poles at z=1 and z=0.5 and no zeros", () => {
      const transfer = parseTransferFunction("H(z)=1/(z^2-1.5z+0.5)", "z");
      expect(transfer.poles).toHaveLength(2);
      const poles = transfer.poles.map((pole) => pole.re).sort((a, b) => a - b);
      expect(poles[0]).toBeCloseTo(0.5, 6);
      expect(poles[1]).toBeCloseTo(1, 6);
      expect(transfer.zeros).toHaveLength(0);
      // Independent check of the Durand–Kerner solver on the same polynomial.
      expect(polynomialRoots([1, -1.5, 0.5]).map((root) => root.re).sort((a, b) => a - b)).toEqual([0.5, 1]);
    });

    it("Test 30: stability follows pole location — |z|<1 discrete, Re{s}<0 continuous", () => {
      const stable = parseTransferFunction("H(z)=1/(z^2-1.1z+0.24)", "z"); // poles 0.8, 0.3
      expect(stable.poles.map((pole) => pole.re).sort((a, b) => a - b)).toEqual([0.3, 0.8]);
      expect(rocFor(stable, "right").stable).toBe(true);

      const unstable = parseTransferFunction("H(z)=1/(z^2-1.4z+0.33)", "z"); // poles 1.1, 0.3
      expect(Math.max(...unstable.poles.map((pole) => pole.re))).toBeCloseTo(1.1, 6);
      expect(rocFor(unstable, "right").stable).toBe(false);

      expect(rocFor(parseTransferFunction("1/(s^2+4s+13)", "s"), "right").stable).toBe(true); // s = −2 ± j3
      expect(rocFor(parseTransferFunction("1/(s-1)", "s"), "right").stable).toBe(false);
    });

    it("Test 31: the magnitude landscape peaks at poles and vanishes at zeros", () => {
      // H(s) = s/(s+1): one zero at the origin, one pole at s = −1.
      const transfer = parseTransferFunction("s/(s+1)", "s");
      expect(transfer.zeros[0].re).toBeCloseTo(0, 6);
      expect(transfer.poles[0].re).toBeCloseTo(-1, 6);

      const landscape = magnitudeLandscape(transfer, 41, 4, 14);
      expect(landscape.x).toHaveLength(41);
      expect(landscape.y).toHaveLength(41);
      expect(landscape.z).toHaveLength(41);
      landscape.z.forEach((row) => expect(row).toHaveLength(41));
      // z is indexed [imaginary][real] so it feeds a Plotly surface directly.
      const origin = landscape.x.indexOf(0);
      expect(origin).toBe(20);
      expect(landscape.z[origin][origin]).toBeCloseTo(0, 9); // zero at s = 0
      const poleColumn = landscape.x.findIndex((value) => Math.abs(value + 1) < 1e-9);
      expect(landscape.z[origin][poleColumn]).toBeGreaterThan(1); // singularity at s = −1
      // Every sample is finite, non-negative, and honours the clipping ceiling.
      landscape.z.flat().forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(14);
      });
      // The jω evaluation path tracks the surface: |H(jω)| = |ω|/√(1+ω²).
      landscape.path.x.forEach((value) => expect(value).toBe(0));
      landscape.path.z.forEach((value, index) => {
        const omega = landscape.path.y[index];
        expect(value).toBeCloseTo(Math.min(14, Math.abs(omega) / Math.sqrt(1 + omega * omega)), 6);
      });
    });
  });
});
