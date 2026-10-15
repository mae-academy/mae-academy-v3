import { describe, expect, it } from "vitest";
import { MAX_EXPR_DEPTH, MAX_EXPR_LENGTH, MAX_EXPR_NODES, SAFE_FUNCTION_NAMES, compileExpr, isValidVariableName } from "./safeExpr";

function value(source: string, scope: Record<string, number> = {}): number {
  const compiled = compileExpr(source, Object.keys(scope));
  if (!compiled.ok) throw new Error(`parse failed: ${compiled.message}`);
  return compiled.run(scope);
}
const rejected = (source: string, variables: string[] = ["R", "C", "x"]) => !compileExpr(source, variables).ok;

describe("numeric correctness", () => {
  it("RC cutoff is 159.155 Hz for R = 10 kOhm, C = 100 nF", () => {
    expect(value("1 / (2 * Math.PI * R * C)", { R: 10000, C: 100e-9 })).toBeCloseTo(159.1549, 3);
    expect(value("1/(2*PI*R*C)", { R: 10000, C: 100e-9 })).toBeCloseTo(159.1549, 3);
  });
  it("R = 20 kOhm halves it to 79.577 Hz", () => {
    expect(value("1 / (2 * Math.PI * R * C)", { R: 20000, C: 100e-9 })).toBeCloseTo(79.5775, 3);
  });
  it("second-order damping ratio and natural frequency", () => {
    expect(value("R / 2 * sqrt(C / L)", { R: 10, C: 1e-6, L: 1e-3 })).toBeCloseTo(0.1581, 4);
    expect(value("1 / sqrt(L * C)", { C: 1e-6, L: 1e-3 })).toBeCloseTo(31622.78, 1);
  });
  it("first-order gain in dB at the cutoff is -3.01 dB", () => {
    const gain = "20*Math.log10(1/Math.sqrt(1+Math.pow(x/(1/(2*Math.PI*R*C)),2)))";
    expect(value(gain, { R: 10000, C: 100e-9, x: 159.1549 })).toBeCloseTo(-3.0103, 3);
    expect(value(gain, { R: 10000, C: 100e-9, x: 1 })).toBeCloseTo(0, 3);
  });
  it("number literals: exponents, leading dot, trailing dot", () => {
    expect(value("1e-9")).toBe(1e-9);
    expect(value("100e-9")).toBe(100e-9);
    expect(value(".5 + 5.")).toBe(5.5);
    expect(value("2.5E3")).toBe(2500);
  });
  it("constants and functions with or without the Math. prefix", () => {
    expect(value("PI")).toBe(Math.PI);
    expect(value("Math.E")).toBe(Math.E);
    expect(value("Math.sqrt(16) + sqrt(9)")).toBe(7);
    expect(value("log(E)")).toBe(1);
    expect(value("log10(1000) + log2(8)")).toBe(6);
    expect(value("atan2(1, 1)")).toBeCloseTo(Math.PI / 4, 12);
    expect(value("max(1, 5, 3) - min(4, 2)")).toBe(3);
    expect(value("hypot(3, 4)")).toBe(5);
    expect(value("sign(-3) + floor(2.7) + ceil(2.1) + round(2.5) + abs(-1) + cbrt(27)")).toBe(-1 + 2 + 3 + 3 + 1 + 3);
  });
  it("every whitelisted function is callable", () => {
    for (const name of SAFE_FUNCTION_NAMES) {
      const args = name === "pow" || name === "atan2" ? "1, 2" : "0.5";
      expect(compileExpr(`${name}(${args})`, []).ok, name).toBe(true);
      expect(compileExpr(`Math.${name}(${args})`, []).ok, `Math.${name}`).toBe(true);
    }
  });
});

describe("precedence and associativity", () => {
  it("-2^2 = -4 and (-2)^2 = 4", () => {
    expect(value("-2^2")).toBe(-4);
    expect(value("(-2)^2")).toBe(4);
    expect(value("-2**2")).toBe(-4);
  });
  it("power is right associative and ^ is power, never XOR", () => {
    expect(value("2^3^2")).toBe(512);
    expect(value("2**3**2")).toBe(512);
    expect(value("5^2")).toBe(25);
    expect(value("2^-1")).toBe(0.5);
  });
  it("multiplication before addition, left associative division", () => {
    expect(value("1 + 2 * 3")).toBe(7);
    expect(value("100 / 10 / 2")).toBe(5);
    expect(value("10 - 3 - 2")).toBe(5);
    expect(value("7 % 4 * 2")).toBe(6);
    expect(value("2 * -3")).toBe(-6);
    expect(value("+3 - -3")).toBe(6);
  });
  it("variables", () => {
    expect(value("a * b + c", { a: 2, b: 3, c: 4 })).toBe(10);
  });
});

describe("non-finite results are reported, never thrown", () => {
  it("division by zero, huge exponent towers and domain errors", () => {
    expect(value("1/0")).toBe(Infinity);
    expect(value("9**9**9")).toBe(Infinity);
    expect(Number.isNaN(value("sqrt(-1)"))).toBe(true);
    expect(Number.isNaN(value("0/0"))).toBe(true);
    expect(Number.isFinite(value("exp(1000)"))).toBe(false);
  });
});

describe("hostile and malformed input is rejected at parse time", () => {
  const hostile = [
    'constructor.constructor("alert(1)")()',
    "this",
    "window",
    "globalThis",
    "window.alert(1)",
    "__proto__",
    "x.__proto__",
    "Function",
    "Function('return 1')()",
    "eval('1')",
    "constructor",
    "prototype",
    "toString",
    "valueOf",
    "`${1+1}`",
    "'abc'",
    '"abc"',
    "1; alert(1)",
    "1, 2",
    "(1, 2)",
    "a = 1",
    "x == 1",
    "x ? 1 : 2",
    "x[0]",
    "[1,2][0]",
    "{}",
    "Math",
    "Math.",
    "Math.random()",
    "Math.constructor",
    "Math.abs",
    "Math.PI.toFixed(2)",
    "Math['sqrt'](4)",
    "(1)(2)",
    "sqrt",
    "sqrt()",
    "sqrt(1, 2)",
    "pow(1)",
    "R.toString()",
    "new Date()",
    "import('x')",
    "()=>1",
    "x => x",
    "typeof x",
    "void 0",
    "1 +",
    "* 2",
    "(1",
    "1)",
    "",
    "   ",
    "2x",
    "3R",
    "0x10",
    "1e",
    "1..2",
    "x y",
    "R C",
    "unknownName",
    "ＰＩ", // full-width confusables
    "Ｒ",
    "πR",
    "R​",
    "1 + 2",
    "sqrt⁠(4)",
    "//",
    "/* */ 1",
    "1 // c",
    "\\u0041",
    "$",
    "@",
    "R #1",
  ];
  for (const source of hostile) {
    it(`rejects ${JSON.stringify(source)}`, () => {
      expect(rejected(source)).toBe(true);
    });
  }
  it("rejects over-long, over-deep and over-large expressions", () => {
    expect(rejected("1+".repeat(MAX_EXPR_LENGTH) + "1")).toBe(true);
    expect(rejected("(".repeat(MAX_EXPR_DEPTH + 5) + "1" + ")".repeat(MAX_EXPR_DEPTH + 5))).toBe(true);
    expect(rejected("-".repeat(MAX_EXPR_DEPTH + 5) + "1")).toBe(true);
    expect(rejected("2^".repeat(MAX_EXPR_DEPTH + 5) + "2")).toBe(true);
    expect(rejected("sqrt(".repeat(MAX_EXPR_DEPTH + 5) + "1" + ")".repeat(MAX_EXPR_DEPTH + 5))).toBe(true);
    expect(rejected(Array.from({ length: MAX_EXPR_NODES }, () => "1").join("+"))).toBe(true);
    expect(compileExpr("1+".repeat(50) + "1", []).ok).toBe(true);
  });
  it("accepts moderate nesting", () => {
    expect(value("((((((((((1))))))))))")).toBe(1);
  });
  it("a variable that is not declared is an error even when it exists on Object.prototype", () => {
    expect(compileExpr("hasOwnProperty", []).ok).toBe(false);
    expect(compileExpr("toString", ["R"]).ok).toBe(false);
  });
  it("reserved words cannot be declared as variables", () => {
    for (const name of ["constructor", "__proto__", "Math", "sqrt", "this", "PI", "window", "", "a-b", "1a", "R.x"]) {
      expect(isValidVariableName(name), name).toBe(false);
    }
    expect(compileExpr("constructor + 1", ["constructor"]).ok).toBe(false);
    expect(isValidVariableName("R1")).toBe(true);
    expect(isValidVariableName("f_c")).toBe(true);
  });
  it("evaluation ignores prototype-polluting scopes", () => {
    const compiled = compileExpr("R + 1", ["R"]);
    expect(compiled.ok && Number.isNaN(compiled.run(Object.create({ R: 5 })))).toBe(true);
  });
  it("never executes anything: no global side effect", () => {
    const g = globalThis as { __pwned?: unknown };
    for (const source of ['constructor.constructor("globalThis.__pwned=1")()', "Function('globalThis.__pwned=1')()", "this.__pwned=1"]) compileExpr(source, ["x"]);
    expect(g.__pwned).toBeUndefined();
  });
});
