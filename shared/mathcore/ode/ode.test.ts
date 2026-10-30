import { describe, expect, it } from "vitest";
import algorithms from "../__golden__/algorithms.json";
import type { Rhs } from "./integrators";
import { rk4, rkf45 } from "./integrators";
import { classify, directionField, findEquilibria, jacobian, newton2, slopeAsField } from "./phase";
import type { Field2 } from "./phase";

/** The same right-hand sides as scripts/mathcore/oracle/generate_algorithms.py `ode()`. */
const RHS: Record<string, Rhs> = {
  gauss: (t, y, o) => void (o[0] = -2 * t * y[0]),
  "rkf-classic": (t, y, o) => void (o[0] = y[0] - t * t + 1),
  "linear-x-minus-y": (t, y, o) => void (o[0] = t - y[0]),
  "backward-exp": (_t, y, o) => void (o[0] = y[0]),
  "lotka-volterra": (_t, y, o) => {
    o[0] = y[0] - y[0] * y[1];
    o[1] = -y[1] + y[0] * y[1];
  },
  "van-der-pol": (_t, y, o) => {
    o[0] = y[1];
    o[1] = (1 - y[0] ** 2) * y[1] - y[0];
  },
  pendulum: (_t, y, o) => {
    o[0] = y[1];
    o[1] = -Math.sin(y[0]);
  },
  "damped-oscillator": (_t, y, o) => {
    o[0] = y[1];
    o[1] = -y[0] - 0.5 * y[1];
  },
};

interface OdeCase {
  id: string;
  t0: number;
  t1: number;
  y0: number[];
  y1: string[];
}
const cases = (algorithms as unknown as { ode: OdeCase[] }).ode;
const y0Of = (c: OdeCase) => (c.id === "backward-exp" ? [Math.E] : c.y0);
const errOf = (got: Float64Array, c: OdeCase) =>
  Math.max(...c.y1.map((w, i) => Math.abs(got[i] - Number(w)) / Math.max(1, Math.abs(Number(w)))));

describe("ODE integrators vs a 30-digit Taylor reference (Phase 6 exit)", () => {
  it("covers scalar, backward and 2D problems", () => {
    expect(cases.map((c) => c.id).sort()).toEqual(Object.keys(RHS).sort());
  });

  for (const c of cases) {
    it(`RKF45 matches ${c.id} within 1e-10`, () => {
      const r = rkf45(RHS[c.id], c.t0, y0Of(c), c.t1, { rtol: 1e-12, atol: 1e-14 });
      expect(r.stopped).toBeUndefined();
      expect(r.t[r.t.length - 1]).toBe(c.t1);
      expect(errOf(r.y[r.y.length - 1], c)).toBeLessThan(1e-10);
    });

    it(`RK4 (fine fixed step) matches ${c.id} within 1e-10`, () => {
      const steps = Math.ceil(Math.abs(c.t1 - c.t0) / 2e-3);
      const r = rk4(RHS[c.id], c.t0, y0Of(c), c.t1, steps);
      expect(errOf(r.y[r.y.length - 1], c)).toBeLessThan(1e-10);
    });
  }

  it("RK4 is fourth order: halving h divides the error by ≈ 16", () => {
    for (const c of cases) {
      const e1 = errOf(rk4(RHS[c.id], c.t0, y0Of(c), c.t1, 40).y.at(-1) as Float64Array, c);
      const e2 = errOf(rk4(RHS[c.id], c.t0, y0Of(c), c.t1, 80).y.at(-1) as Float64Array, c);
      const ratio = e1 / e2;
      expect(ratio, `${c.id} ratio ${ratio}`).toBeGreaterThan(13);
      expect(ratio, `${c.id} ratio ${ratio}`).toBeLessThan(19);
    }
  });

  it("adaptive steps shrink where the solution changes fast (van der Pol)", () => {
    const r = rkf45(RHS["van-der-pol"], 0, [2, 0], 20, { rtol: 1e-8, atol: 1e-10 });
    const steps = r.t.slice(1).map((t, i) => t - r.t[i]);
    expect(Math.max(...steps) / Math.min(...steps)).toBeGreaterThan(3);
  });

  it("integrates backward with h < 0 and the same accuracy", () => {
    const f: Rhs = (_t, y, o) => void (o[0] = Math.cos(y[0]));
    const fwd = rkf45(f, 0, [0], 3, { rtol: 1e-12, atol: 1e-14 });
    const back = rkf45(f, 3, [fwd.y.at(-1)?.[0] ?? 0], 0, { rtol: 1e-12, atol: 1e-14 });
    expect(back.t.at(-1)).toBe(0);
    expect(Math.abs(back.y.at(-1)?.[0] ?? 1)).toBeLessThan(1e-10);
    expect(back.t[1]).toBeLessThan(3); // time decreases
  });

  it("stops cleanly at a blow-up instead of returning garbage (y′ = y², y(0) = 1 explodes at t = 1)", () => {
    const f: Rhs = (_t, y, o) => void (o[0] = y[0] * y[0]);
    const r = rkf45(f, 0, [1], 2, { rtol: 1e-8 });
    expect(r.stopped).toBeDefined();
    expect(r.t.at(-1)).toBeLessThan(1);
    expect(r.y.every((v) => Number.isFinite(v[0]))).toBe(true);
    const fixed = rk4(f, 0, [1], 2, 100);
    expect(fixed.stopped).toBe("non-finite");
  });

  it("honours a stop condition (leaving the view) and the step cap", () => {
    const f: Rhs = (_t, y, o) => void (o[0] = 1);
    const r = rkf45(f, 0, [0], 100, { stop: (_t, y) => y[0] > 5, hMax: 0.5 });
    expect(r.stopped).toBe("left-view");
    expect(r.y.at(-1)?.[0]).toBeGreaterThan(5);
    expect(rkf45(f, 0, [0], 100, { maxSteps: 3, hMax: 0.01 }).stopped).toBe("max-steps");
  });

  it("zero-length interval returns the initial state", () => {
    const r = rkf45(RHS.gauss, 1, [3], 1);
    expect(r.t).toEqual([1]);
    expect(Array.from(r.y[0])).toEqual([3]);
  });
});

describe("direction fields (STEPS.md §8.3)", () => {
  const view = { xmin: -2, xmax: 2, ymin: -2, ymax: 2, aspect: "equal" as const };
  it("slope arrows follow dy/dx = f(x, y)", () => {
    const d = directionField(slopeAsField((x, y) => x - y), view, 4, 4, { heads: false });
    expect(d.count).toBe(16);
    for (let i = 0; i < d.segments.length; i += 4) {
      const [x0, y0, x1, y1] = d.segments.slice(i, i + 4);
      const xm = (x0 + x1) / 2;
      const ym = (y0 + y1) / 2;
      expect((y1 - y0) / (x1 - x0)).toBeCloseTo(xm - ym, 10);
    }
  });
  it("systems get arrow heads; undefined directions are skipped", () => {
    const d = directionField((x, y) => [y, -x], view, 3, 3, { heads: true });
    // The centre cell is (0, 0) where the field is zero: no arrow. Each arrow is a shaft plus two head lines.
    expect(d.count).toBe(8);
    expect(d.segments.length).toBe(8 * 3 * 4);
    expect(directionField(() => [NaN, 1], view, 3, 3, { heads: false }).count).toBe(0);
  });
});

describe("equilibria and classification (STEPS.md §8.3)", () => {
  const view = { xmin: -3, xmax: 3, ymin: -3, ymax: 3, aspect: "equal" as const };
  const types = (f: Field2) => findEquilibria(f, view).map((e) => [Math.round(e.x * 1e6) / 1e6, Math.round(e.y * 1e6) / 1e6, e.type]);
  it("linear systems: node, saddle, spiral, centre", () => {
    expect(types((x, y) => [-x, -2 * y])).toEqual([[0, 0, "stable-node"]]);
    expect(types((x, y) => [x, 2 * y])).toEqual([[0, 0, "unstable-node"]]);
    expect(types((x, y) => [x, -y])).toEqual([[0, 0, "saddle"]]);
    expect(types((x, y) => [y, -x - 0.5 * y])).toEqual([[0, 0, "stable-spiral"]]);
    expect(types((x, y) => [y, -x + 0.5 * y])).toEqual([[0, 0, "unstable-spiral"]]);
    expect(types((x, y) => [y, -x])).toEqual([[0, 0, "center"]]);
  });
  it("Lotka–Volterra: saddle at the origin, centre at (1, 1)", () => {
    expect(types((x, y) => [x - x * y, -y + x * y])).toEqual([
      [0, 0, "saddle"],
      [1, 1, "center"],
    ]);
  });
  it("Duffing x″ = x − x³: centres at ±1 and a saddle at 0", () => {
    expect(types((x, y) => [y, x - x ** 3])).toEqual([
      [-1, 0, "center"],
      [0, 0, "saddle"],
      [1, 0, "center"],
    ]);
  });
  it("maps types to the four colour classes and flags non-hyperbolic points", () => {
    expect(classify([[-1, 0], [0, -1]]).stability).toBe("attractor");
    expect(classify([[2, 0], [0, 2]]).type).toBe("unstable-degenerate");
    expect(classify([[0, 1], [0, 0]]).stability).toBe("non-hyperbolic");
    expect(classify([[1, 0], [0, -3]]).stability).toBe("saddle");
  });
  it("Newton converges quadratically to an equilibrium and the Jacobian is accurate", () => {
    const f: Field2 = (x, y) => [x * x + y * y - 4, x - y];
    const p = newton2(f, 1, 1.2);
    expect(p?.[0]).toBeCloseTo(Math.SQRT2, 12);
    const J = jacobian(f, 1, 2);
    expect(J[0][0]).toBeCloseTo(2, 8);
    expect(J[0][1]).toBeCloseTo(4, 8);
    expect(J[1][0]).toBeCloseTo(1, 8);
    expect(J[1][1]).toBeCloseTo(-1, 8);
  });
});
