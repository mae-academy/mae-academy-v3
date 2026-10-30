/**
 * Tanh-sinh with endpoint tails (Phase 3 re-review defect 11): integrable endpoint singularities are accurate and
 * the reported error bound covers the true error; divergent integrals are rejected, including slowly divergent ones.
 */
import { describe, expect, it } from "vitest";
import { integrate, tanhSinh } from "./integrate";

describe("tanh-sinh endpoint singularities", () => {
  const integrable: Array<[string, (x: number) => number, number, number, number, number]> = [
    ["1/√(1−x²) on [−1, 1]", (x) => 1 / Math.sqrt(1 - x * x), -1, 1, Math.PI, 1e-9],
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
    expect(tanhSinh((x) => x ** -0.999, 0, 1).converged).toBe(false);
  });
});
