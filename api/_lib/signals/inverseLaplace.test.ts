import { describe, expect, it } from "vitest";
import { inverseLaplace, parseTransferFunction } from "./laplaceEngine";

const solve = (source: string, roc: "right" | "left" | "two-sided" = "right") => inverseLaplace(parseTransferFunction(source, "s"), roc);

describe("inverse Laplace transform", () => {
  it("1/(s+2) → e^{-2t}u(t)", () => {
    const result = solve("\\frac{1}{s+2}");
    expect(result.timeLatex).toBe("h(t)=e^{-2t}\\,u(t)");
    expect(result.pfeLatex).toBe("H(s)=\\frac{1}{s+2}");
    expect(result.causality).toBe("causal");
  });

  it("s/(s^2+9) → cos(3t)u(t)", () => { expect(solve("\\frac{s}{s^2+9}").timeLatex).toBe("h(t)=\\cos(3t)\\,u(t)"); });

  it("s/(s^2+4) → cos(2t)u(t)", () => {
    const result = solve("\\frac{s}{s^2+4}");
    expect(result.timeLatex).toBe("h(t)=\\cos(2t)\\,u(t)");
    const upper = result.terms.find((term) => term.pole.im > 0);
    expect(upper?.residue.re).toBeCloseTo(0.5, 6);
  });

  it("1/((s+1)(s+3)) → [0.5e^{-t} − 0.5e^{-3t}]u(t)", () => {
    const result = solve("\\frac{1}{(s+1)(s+3)}");
    expect(result.pfeLatex).toBe("H(s)=\\frac{1}{2\\left(s+1\\right)}-\\frac{1}{2\\left(s+3\\right)}");
    expect(result.timeLatex).toBe("h(t)=\\left[\\frac{1}{2}e^{-t}-\\frac{1}{2}e^{-3t}\\right]u(t)");
  });

  it("damped pair 1/(s^2+4s+13) → (1/3)e^{-2t}sin(3t)u(t)", () => {
    expect(solve("\\frac{1}{s^2+4s+13}").timeLatex).toBe("h(t)=\\frac{1}{3}e^{-2t}\\sin(3t)\\,u(t)");
  });

  it("repeated pole 1/(s+1)^2 → t e^{-t} u(t)", () => {
    const result = solve("\\frac{1}{(s+1)^{2}}");
    expect(result.terms.map((term) => [term.order, term.multiplicity])).toEqual([[1, 2], [2, 2]]);
    expect(result.timeLatex).toBe("h(t)=te^{-t}\\,u(t)");
  });

  it("left-sided ROC yields anti-causal −e^{pt}u(−t)", () => {
    const result = solve("\\frac{1}{s-1}", "left");
    expect(result.timeLatex).toBe("h(t)=-e^{t}\\,u(-t)");
    expect(result.causality).toBe("anti-causal");
  });

  it("two-sided strip splits causal and anti-causal poles", () => {
    expect(solve("\\frac{1}{(s+1)(s-2)}", "two-sided").timeLatex).toBe("h(t)=-\\frac{1}{3}e^{-t}\\,u(t)-\\frac{1}{3}e^{2t}\\,u(-t)");
  });

  it("isolates direct δ terms for proper and improper H(s)", () => {
    expect(solve("\\frac{s+3}{s+1}").timeLatex).toBe("h(t)=\\delta(t)+2e^{-t}\\,u(t)");
    const improper = solve("\\frac{s^2}{s+1}");
    expect(improper.properness).toBe("improper");
    expect(improper.timeLatex).toBe("h(t)=-\\delta(t)+\\delta'(t)+e^{-t}\\,u(t)");
  });

  it("1/s → u(t)", () => { expect(solve("\\frac{1}{s}").timeLatex).toBe("h(t)=u(t)"); });
});

import { forwardLaplace } from "./laplaceEngine";
import { evaluateUnifiedSignal, parseUnifiedSignal } from "../../../shared/signals/unifiedSignalParser";
import { nodeToLatex } from "../../../shared/signals/mathExpression";

const forward = (source: string) => {
  const parsed = parseUnifiedSignal(source);
  if (!parsed.ok) throw new Error(parsed.error);
  return forwardLaplace(parsed.node, (node, at) => evaluateUnifiedSignal(node, at), nodeToLatex);
};

describe("forward (unilateral) Laplace transform", () => {
  const cases: Array<[string, string]> = [
    ["e^{-3t}u(t)", "H(s)=\\frac{1}{s + 3}"],
    ["\\sin(2t)u(t)", "H(s)=\\frac{2}{s^{2} + 4}"],
    ["\\delta(t)+4e^{-t}u(t)", "H(s)=\\frac{s + 5}{s + 1}"],
    ["\\cos(3t)u(t)", "H(s)=\\frac{s}{s^{2} + 9}"],
    ["u(t)", "H(s)=\\frac{1}{s}"],
    ["r(t)", "H(s)=\\frac{1}{s^{2}}"],
    ["t\\,e^{-t}u(t)", "H(s)=\\frac{1}{s^{2} + 2s + 1}"],
    ["e^{-2t}\\cos(3t)u(t)", "H(s)=\\frac{s + 2}{s^{2} + 4s + 13}"],
    ["e^{-t}u(t)+e^{-t}u(t)", "H(s)=\\frac{2}{s + 1}"],
  ];
  for (const [source, expected] of cases) it(`${source} → ${expected}`, () => {
    const result = forward(source);
    expect(result.ok && result.transformLatex).toBe(expected);
  });

  it("round-trips through the inverse transform", () => {
    const result = forward("\\delta(t)+4e^{-t}u(t)");
    expect(result.ok && inverseLaplace(result.system, "right").timeLatex).toBe("h(t)=\\delta(t)+4e^{-t}\\,u(t)");
  });

  it("rejects non-rational transforms with a readable reason", () => {
    for (const source of ["u(t-2)", "\\text{rect}(t)", "\\delta(t-1)"]) {
      const result = forward(source);
      expect(result.ok).toBe(false);
    }
  });

  it("flags unilateral reading of terms without u(t)", () => {
    const result = forward("e^{-3t}");
    expect(result.ok && result.notes.length).toBe(1);
  });
});
