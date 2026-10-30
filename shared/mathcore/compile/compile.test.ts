import { describe, expect, it } from "vitest";
import type { Expr } from "../ast/expr";
import { clearCompileCache, compile, compileCacheSize, compileFunction1, realPower, realRoot } from "./compile";
import type { FunctionDef } from "./compile";

const ev = (e: Expr, x = 0, extra: Record<string, number> = {}) => compileFunction1(e, "x", extra)(x);

describe("closure compiler", () => {
  it("evaluates arithmetic and constants", () => {
    expect(ev(["Add", 1, ["Multiply", 2, "x"]], 3)).toBe(7);
    expect(ev(["Subtract", "Pi", "ExponentialE"])).toBeCloseTo(Math.PI - Math.E, 15);
    expect(ev(["Divide", 1, "x"], 0)).toBe(Infinity);
  });

  it("uses real roots for odd denominators (Desmos semantics)", () => {
    expect(ev(["Power", "x", ["Divide", 1, 3]], -8)).toBeCloseTo(-2, 14);
    expect(ev(["Power", "x", ["Divide", 2, 3]], -8)).toBeCloseTo(4, 14);
    expect(ev(["Power", "x", ["Negate", ["Divide", 1, 3]]], -8)).toBeCloseTo(-0.5, 14);
    expect(ev(["Power", "x", 0.5], -4)).toBeNaN();
    expect(ev(["Root", "x", 3], -27)).toBe(-3);
    expect(ev(["Root", "x", 4], -16)).toBeNaN();
    expect(realPower(-8, 1 / 3, 3, 1)).toBeCloseTo(-2, 14);
    expect(realRoot(32, 5)).toBeCloseTo(2, 14);
  });

  it("restrictions and comparisons", () => {
    const restricted: Expr = ["When", "x", ["Less", 0, "x", 1]];
    expect(ev(restricted, 0.5)).toBe(0.5);
    expect(ev(restricted, 2)).toBeNaN();
    expect(ev(["Less", "x", 1], 0)).toBe(1);
    expect(ev(["And", ["Less", "x", 1], ["Greater", "x", -1]], 0)).toBe(1);
  });

  it("sums, products and integrals bind their variable", () => {
    expect(ev(["Sum", ["Power", "n", 2], "n", 1, 10])).toBe(385);
    expect(ev(["Product", "k", "k", 1, 5])).toBe(120);
    expect(ev(["Integrate", ["Power", "t", 2], "t", 0, "x"], 3)).toBeCloseTo(9, 12);
    // A bound variable shadows an outer one and restores it afterwards.
    expect(ev(["Add", "x", ["Sum", "x", "x", 1, 3]], 10)).toBe(16);
  });

  it("numerical derivative matches the symbolic derivative within 1e-7 (STEPS.md §8.1)", () => {
    const cases: Array<[Expr, (x: number) => number]> = [
      [["Sin", "x"], Math.cos],
      [["Exp", ["Power", "x", 2]], (x) => 2 * x * Math.exp(x * x)],
      [["Ln", "x"], (x) => 1 / x],
      [["Arctan", "x"], (x) => 1 / (1 + x * x)],
      [["Power", "x", 5], (x) => 5 * x ** 4],
    ];
    for (const [f, df] of cases) {
      for (const x of [0.3, 1.1, 2.7]) {
        const got = ev(["D", f, "x"], x);
        expect(Math.abs(got - df(x)) / Math.max(1, Math.abs(df(x)))).toBeLessThan(1e-7);
      }
    }
  });

  it("calls user functions, including nested calls of the same function", () => {
    const functions = new Map<string, FunctionDef>([
      ["f", { params: ["x"], body: ["Power", "x", 2] }],
      ["g", { params: ["u", "v"], body: ["Add", ["Apply", "f", "u"], "v"] }],
    ]);
    const h = compileFunction1(["Apply", "f", ["Apply", "f", "x"]], "x", {}, functions);
    expect(h(3)).toBe(81);
    expect(compileFunction1(["Apply", "g", "x", 1], "x", {}, functions)(2)).toBe(5);
    expect(compileFunction1(["D", ["Apply", "f", "x"], "x"], "x", {}, functions)(3)).toBeCloseTo(6, 7);
  });

  it("rejects recursive definitions instead of overflowing", () => {
    const functions = new Map<string, FunctionDef>([["f", { params: ["x"], body: ["Apply", "f", "x"] }]]);
    expect(() => compile(["Apply", "f", "x"], { variables: ["x"], functions })).toThrow(/deeper than/);
  });

  it("throws a CompileError for undefined symbols and non-numeric heads", () => {
    expect(() => compile(["Add", "x", "b"], { variables: ["x"] })).toThrow(/Undefined symbol: b/);
    expect(() => compile(["Matrix", ["List"]], { variables: [] })).toThrow(/Cannot evaluate Matrix/);
  });

  it("compiles once and evaluates many: equal expressions share a cached closure (STEPS.md §7.1)", () => {
    clearCompileCache();
    const a = compile(["Sin", ["Multiply", "a", "x"]], { variables: ["x", "a"] });
    const b = compile(["Sin", ["Multiply", "a", "x"]], { variables: ["x", "a"] });
    expect(a).toBe(b);
    expect(compileCacheSize()).toBe(1);
    // A slider drag only changes the values passed in; nothing recompiles.
    for (let k = 0; k < 100; k++) a.evaluate([1, k / 10]);
    expect(compileCacheSize()).toBe(1);
  });
});

describe("reviewer findings (Phase 0 review)", () => {
  it("x^{-1/3} as Compute Engine writes it (Divide(Negate(1), 3)) is a real root", () => {
    expect(ev(["Power", "x", ["Divide", ["Negate", 1], 3]], -8)).toBeCloseTo(-0.5, 14);
    expect(ev(["Power", "x", ["Divide", ["Negate", 5], 3]], -1)).toBeCloseTo(-1, 14);
  });

  it("integrates piecewise integrands and integrable endpoint singularities", () => {
    expect(ev(["Integrate", ["Floor", "t"], "t", 0, 2])).toBeCloseTo(1, 10);
    expect(ev(["Integrate", ["Sign", ["Subtract", "t", 0.3]], "t", 0, 1])).toBeCloseTo(0.4, 10);
    expect(ev(["Integrate", ["Ln", "t"], "t", 0, 1])).toBeCloseTo(-1, 10);
    expect(ev(["Integrate", ["Power", "t", ["Divide", ["Negate", 1], 2]], "t", 0, 1])).toBeCloseTo(2, 8);
    // Reversed limits change the sign.
    expect(ev(["Integrate", "t", "t", 1, 0])).toBeCloseTo(-0.5, 12);
  });

  it("user functions read parameters (f(x) = a x with slider a)", () => {
    const functions = new Map<string, FunctionDef>([["f", { params: ["x"], body: ["Multiply", "a", "x"] }]]);
    expect(compileFunction1(["Apply", "f", 2], "x", { a: 3 }, functions)(0)).toBe(6);
    // A function parameter shadows a global of the same name.
    const g = new Map<string, FunctionDef>([["g", { params: ["a"], body: ["Multiply", "a", 10] }]]);
    expect(compileFunction1(["Apply", "g", 2], "x", { a: 3 }, g)(0)).toBe(20);
  });

  it("covers heads the golden corpus does not", () => {
    expect(ev(["Arccot", 0])).toBeCloseTo(Math.PI / 2, 15);
    expect(ev(["Arcsec", 2])).toBeCloseTo(Math.PI / 3, 15);
    expect(ev(["Arccsc", 2])).toBeCloseTo(Math.PI / 6, 15);
    expect(ev(["Coth", 1])).toBeCloseTo(1 / Math.tanh(1), 15);
    expect(ev(["Round", -2.5])).toBe(-3);
    expect(ev(["Log", 8, "x"], 2)).toBeCloseTo(3, 14);
    expect(ev(["Not", ["Less", "x", 0]], 1)).toBe(1);
    expect(ev(["Or", ["Less", "x", 0], ["Greater", "x", 2]], 1)).toBe(0);
  });
});

describe("integral edge cases (Phases 1-2 review)", () => {
  it("a divergent integral is undefined, not a number", () => {
    expect(ev(["Integrate", ["Divide", 1, "t"], "t", -1, 2])).toBeNaN();
    expect(ev(["Integrate", ["Divide", 1, "t"], "t", 0, 1])).toBeNaN();
  });

  it("an interior integrable singularity is integrated (∫₋₁¹ |t|^(-1/2) dt = 4)", () => {
    const body: Expr = ["Power", ["Abs", "t"], ["Divide", ["Negate", 1], 2]];
    expect(ev(["Integrate", body, "t", -1, 1])).toBeCloseTo(4, 6);
  });

  it("bounded jumps still integrate (floor, sign)", () => {
    expect(ev(["Integrate", ["Floor", "t"], "t", 0, 3])).toBeCloseTo(3, 10);
  });
});

describe("integral noise floor (Phase 3 review)", () => {
  // The tail inside the last double next to ±1 is ∫ ≈ √(2·1.1e-16) ≈ 1.5e-8 per end: the floating-point limit for an
  // integrand that only sees x, so 7 digits is the attainable accuracy here.
  it("∫₋₁¹ 1/√(1 − x²) dx = π (singular at both ends) to 7 digits", () => {
    expect(ev(["Integrate", ["Divide", 1, ["Sqrt", ["Subtract", 1, ["Power", "t", 2]]]], "t", -1, 1])).toBeCloseTo(Math.PI, 7);
  });
});
