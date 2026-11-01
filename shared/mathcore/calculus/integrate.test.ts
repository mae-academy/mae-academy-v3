/**
 * Tanh-sinh with endpoint tails (Phase 3 re-review defect 11): integrable endpoint singularities are accurate and
 * the reported error bound covers the true error; divergent integrals are rejected, including slowly divergent ones.
 */
import { describe, expect, it } from "vitest";
import { integrate, tanhSinh } from "./integrate";

describe("tanh-sinh endpoint singularities", () => {
  const integrable: Array<[string, (x: number) => number, number, number, number, number]> = [
    ["1/√(1−x²) on [−1, 1]", (x) => 1 / Math.sqrt(1 - x * x), -1, 1, Math.PI, 1e-10],
    ["1/√|x − 0.3| on [0, 1] (interior)", (x) => 1 / Math.sqrt(Math.abs(x - 0.3)), 0, 1, 2 * Math.sqrt(0.3) + 2 * Math.sqrt(0.7), 1e-9],
    ["1/√|x − 1/3| on [0, 1] (interior)", (x) => 1 / Math.sqrt(Math.abs(x - 1 / 3)), 0, 1, 2 * Math.sqrt(1 / 3) + 2 * Math.sqrt(2 / 3), 1e-9],
    ["ln|x − 0.4| on [0, 1] (interior)", (x) => Math.log(Math.abs(x - 0.4)), 0, 1, 0.4 * Math.log(0.4) - 0.4 + 0.6 * Math.log(0.6) - 0.6, 1e-12],
    ["1/√(4−x²) on [−2, 2]", (x) => 1 / Math.sqrt(4 - x * x), -2, 2, Math.PI, 1e-9],
    ["1/√(1−x) on [0, 1]", (x) => 1 / Math.sqrt(1 - x), 0, 1, 2, 1e-9],
    ["1/√(x(1−x)) on [0, 1]", (x) => 1 / Math.sqrt(x * (1 - x)), 0, 1, Math.PI, 1e-9],
    ["1/√(10−x) on [0, 10]", (x) => 1 / Math.sqrt(10 - x), 0, 10, 2 * Math.sqrt(10), 1e-9],
    ["1/√x on [0, 1]", (x) => 1 / Math.sqrt(x), 0, 1, 2, 1e-14],
    ["x^−0.9 on [0, 1]", (x) => x ** -0.9, 0, 1, 10, 1e-13],
    ["ln x on [0, 1]", Math.log, 0, 1, -1, 1e-14],
    ["ln(1−x) on [0, 1]", (x) => Math.log(1 - x), 0, 1, -1, 1e-12],
  ];
  for (const [name, f, a, b, exact, tol] of integrable) {
    it(`${name} within ${tol}`, () => {
      const r = integrate(f, a, b);
      expect(r.converged).toBe(true);
      expect(Math.abs(r.value - exact)).toBeLessThan(tol);
      // When the answer was accepted at the noise floor, the bound covers the true error.
      if (r.estimatedError !== undefined) expect(Math.abs(r.value - exact)).toBeLessThanOrEqual(r.estimatedError);
    });
  }

  it("divergent integrals are rejected, also slowly divergent and near the α = 1 limit", () => {
    const divergent: Array<[(x: number) => number, number, number]> = [
      [(x) => 1 / x, 0, 1],
      [(x) => 1 / (1 - x), 0, 1],
      [(x) => 1 / (x * x), 0, 1],
      [(x) => 1 / Math.abs(x), -1, 1],
      [(x) => 1 / (x * Math.log(1 / x)), 0, 0.5],
      [(x) => 1 / ((1 - x) * Math.log(1 / (1 - x))), 0.5, 1],
      [(x) => Math.tan(x), 0, Math.PI / 2],
    ];
    for (const [f, a, b] of divergent) {
      const r = integrate(f, a, b);
      expect(r.converged, f.toString()).toBe(false);
      expect(r.value).toBeNaN();
    }
  });

  it("known limits: exponents within 1e-3 of 1 and singular ends far from 0 relative to the interval are not converged", () => {
    // ∫₀¹ x^(−0.999) dx = 1000 converges mathematically; the tail exponent is too close to 1 to model.
    expect(tanhSinh((x) => x ** -0.999, 0, 1).converged).toBe(false);
    // Doubles next to 10⁶ are 1.2e-10 apart, too coarse for the tail fit on an interval of length 1.
    expect(integrate((x) => 1 / Math.sqrt(x - 1e6), 1e6, 1e6 + 1).converged).toBe(false);
  });

  it("bounded jumps with zero or tiny mean stay on Simpson (Phase 3 verification)", () => {
    const cases: Array<[(x: number) => number, number, number, number]> = [
      [(x) => Math.floor(3 * x) - 1, 0, 1, 0],
      [(x) => (x < 0.3 ? -7 : 3), 0, 1, 0],
      [(x) => Math.sign(Math.sin(7 * x)), 0, 2 * Math.PI, 0],
      [(x) => Math.sign(Math.cos(x)), 0, 2 * Math.PI, 0],
      [(x) => Math.sign(x - 0.4), 0, 0.80001, 1e-5],
      [(x) => (Math.abs(x) < 0.2 ? 1 : 0) - 0.2, -1, 1, 0],
      [(x) => (x < 0.5 ? -1 : 1.0001), 0, 1, 5e-5],
    ];
    for (const [f, a, b, exact] of cases) {
      const r = integrate(f, a, b);
      expect(r.converged, f.toString()).toBe(true);
      expect(Math.abs(r.value - exact), f.toString()).toBeLessThan(1e-9);
    }
  });

  it("Simpson's samples do not line up with a periodic integrand or skip a narrow peak", () => {
    const saw = integrate((x) => x - Math.floor(x) - 0.5, 0, 10);
    expect(Math.abs(saw.value)).toBeLessThan(1e-9);
    const peak = integrate((x) => Math.exp(-1e6 * (x - 0.3) ** 2), 0, 1);
    expect(Math.abs(peak.value - Math.sqrt(Math.PI / 1e6))).toBeLessThan(1e-12);
  });
});
