import { describe, expect, it } from "vitest";
import { evaluateSignal } from "./signalEngine";
import { canonicalizeSignalLatex, differentiateExpression, evaluateUnifiedSignal, integrateExpression, parseUnifiedSignal, parseUnifiedSignalNode, SIGNAL_TOKENS, OPERATOR_TOKENS, wrapDerivativeLatex, wrapIntegralLatex } from "./unifiedSignalParser";

const valueOf = (latex: string, t: number) => {
  const parsed = parseUnifiedSignal(latex);
  if (!parsed.ok) throw new Error(parsed.error);
  return evaluateUnifiedSignal(parsed.node, t);
};

describe("unifiedSignalParser — tokens", () => {
  it("parses every signal-row token as a standalone signal", () => {
    for (const token of SIGNAL_TOKENS) expect(parseUnifiedSignal(token.insert).ok, token.id).toBe(true);
  });

  it("parses each operator inside a well-formed expression", () => {
    const samples = ["t+1", "t-1", "2\\times t", "t\\div 2", "t^{2}", "\\pi t", "e", "\\ln\\left(t+2\\right)", "\\log_{10}\\left(t+2\\right)"];
    for (const sample of samples) expect(parseUnifiedSignal(sample).ok, sample).toBe(true);
    expect(OPERATOR_TOKENS.map((token) => token.id)).toEqual(["plus", "minus", "times", "divide", "power", "pi", "e", "ln", "log"]);
  });

  it("canonicalizes Λ and bare names onto \\text{tri}", () => {
    expect(canonicalizeSignalLatex("\\Lambda(t)")).toBe("\\text{tri}(t)");
    expect(canonicalizeSignalLatex("tri(t)+rect(t)")).toBe("\\text{tri}(t)+\\text{rect}(t)");
    expect(SIGNAL_TOKENS.find((token) => token.id === "tri")?.label).toBe("\\text{tri}(t)");
  });

  it("evaluates Sa, ln, and log10", () => {
    expect(valueOf("\\text{Sa}(t)", Math.PI / 2)).toBeCloseTo(2 / Math.PI, 9);
    expect(valueOf("\\ln\\left(t\\right)", Math.E)).toBeCloseTo(1, 9);
    expect(valueOf("\\log_{10}\\left(t\\right)", 100)).toBeCloseTo(2, 9);
  });

  it("strips an x(t)= / h(t)= left-hand side", () => {
    expect(valueOf("x(t)=2t", 3)).toBe(6);
    expect(valueOf("h(t)=\\text{rect}(t)", 0)).toBe(1);
  });
});

describe("unifiedSignalParser — symbolic calculus", () => {
  it("d/dt r(t) = u(t) and d/dt u(t) = δ(t)", () => {
    const ramp = differentiateExpression("r(t)");
    expect(ramp.ok && ramp.latex).toContain("u");
    const step = differentiateExpression("u(t)");
    expect(step.ok && step.latex).toContain("\\delta");
  });

  it("product rule with sifting: d/dt[t·u(t)] = u(t)", () => {
    const result = differentiateExpression("t\\,u(t)");
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.latex).not.toContain("\\delta"); expect(valueOf(result.latex, 2)).toBe(1); }
  });

  it("chain rule on sin(2πt)", () => {
    const result = differentiateExpression("\\sin(2\\pi t)");
    expect(result.ok).toBe(true);
    if (result.ok) expect(valueOf(result.latex, 0)).toBeCloseTo(2 * Math.PI, 5);
  });

  it("integrates the step family and sinusoids in closed form", () => {
    const cases: Array<[string, number, number]> = [
      ["u(t)", 2, 2],
      ["\\delta(t-1)", 2, 1],
      ["r(t)", 2, 2],
      ["\\text{rect}(t)", 3, 1],
      ["\\text{tri}(t)", 3, 1],
      ["\\cos(t)", Math.PI / 2, 1],
      ["e^{-t}u(t)", 50, 1],
    ];
    for (const [source, at, expected] of cases) {
      const result = integrateExpression(source);
      expect(result.ok && result.method, source).toBe("symbolic");
      if (result.ok) expect(valueOf(result.latex, at), source).toBeCloseTo(expected, 5);
    }
  });

  it("falls back to a numeric running integral for unresolved terms", () => {
    const result = integrateExpression("t\\,u(t)");
    expect(result.ok && result.method).toBe("numeric");
    if (result.ok) expect(valueOf(result.latex, 2)).toBeCloseTo(2, 2);
  });

  it("evaluates explicit wrappers", () => {
    expect(valueOf(wrapDerivativeLatex("t^{2}"), 3)).toBeCloseTo(6, 9);
    expect(valueOf(wrapDerivativeLatex("\\int_{-\\infty}^{t}\\left[u(\\tau)\\right]\\,d\\tau"), 2)).toBe(1);
    expect(parseUnifiedSignal(wrapDerivativeLatex("u(t)")).ok).toBe(true);
    expect(valueOf(wrapIntegralLatex("\\text{rect}(t)"), 2)).toBeCloseTo(1, 3);
  });
});

describe("unifiedSignalParser — system input x(t) and resilience", () => {
  it("differentiates and integrates the symbolic input", () => {
    const d = differentiateExpression("x(t)+5");
    expect(d.ok && d.latex).toBe("x^{\\prime}\\!\\left(t\\right)");
    const chain = differentiateExpression("x(2t)");
    expect(chain.ok && chain.latex).toContain("x^{\\prime}");
    const i = integrateExpression("x(t)");
    expect(i.ok && i.method).toBe("numeric");
    expect(i.ok && i.latex).toContain("x\\!\\left(\\tau\\right)");
  });

  it("keeps x^{2}(t) as a power and reads x'(t) as a derivative", () => {
    expect(parseUnifiedSignal("x^{2}(t)").ok).toBe(true);
    expect(differentiateExpression("x^{\\prime}(t)").ok).toBe(true);
  });

  it("wraps with parentheses and resolves them on reparse", () => {
    expect(wrapDerivativeLatex("t^{2}")).toBe("\\frac{d}{dt}\\left(t^{2}\\right)");
    expect(wrapIntegralLatex("u(t)")).toBe("\\int_{-\\infty}^{t}\\left(u\\!\\left(\\tau\\right)\\right)\\,d\\tau");
    expect(valueOf(wrapDerivativeLatex("t^{2}"), 3)).toBeCloseTo(6, 6);
    expect(valueOf(wrapIntegralLatex("u(t)"), 2)).toBeCloseTo(2, 2);
  });

  it("fails gracefully on invalid input instead of throwing", () => {
    for (const bad of ["", "\\text{rect}(", "foo(t)", "\\frac{d}{dt}(", "t^"]) {
      expect(() => differentiateExpression(bad)).not.toThrow();
      expect(() => integrateExpression(bad)).not.toThrow();
      expect(differentiateExpression(bad).ok).toBe(false);
      expect(() => wrapDerivativeLatex(bad)).not.toThrow();
      expect(() => wrapIntegralLatex(bad)).not.toThrow();
    }
  });

  it("elementary identities: r′=u, u′=δ, ∫δ=u, ∫u=r", () => {
    const check = (result: ReturnType<typeof differentiateExpression>, prefix: string) => { expect(result.ok && result.latex.startsWith(prefix)).toBe(true); };
    check(differentiateExpression("r(t)"), "u");
    check(differentiateExpression("u(t)"), "\\delta");
    check(integrateExpression("\\delta(t)"), "u");
    check(integrateExpression("u(t)"), "r");
  });
});

describe("unifiedSignalParser — SignalNode bridge", () => {
  it("samples bridged signals identically", () => {
    const parsed = parseUnifiedSignalNode("\\text{tri}(t)+\\text{Sa}(t)");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(evaluateSignal(parsed.ast, 0.5)).toBeCloseTo(0.5 + Math.sin(0.5) / 0.5, 9);
  });

  it("bridges running integrals via the cached cumulative table (δ steps included)", () => {
    const parsed = parseUnifiedSignalNode(wrapIntegralLatex("\\text{rect}(t)+\\delta(t-2)"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) { expect(evaluateSignal(parsed.ast, 1)).toBeCloseTo(1, 2); expect(evaluateSignal(parsed.ast, 3)).toBeCloseTo(2, 2); }
  });
});
