import { describe, expect, it } from "vitest";
import { nodeToLatex } from "./diracIntegral";
import { deriveFourierSeriesSteps, deriveTrigSeriesSteps } from "./fourierEngine";
import { parseSignalExpression } from "./signalEngine";
import { deriveForwardFourierSteps, deriveInverseFourierSteps } from "./fourierAnalytic";
import { deriveForwardLaplaceSteps, deriveInverseLaplaceSteps, parseTransferFunction } from "./laplaceEngine";
import { evaluateUnifiedSignal, parseUnifiedSignal } from "@/lib/signals/unifiedSignalParser";

const joined = (steps: Array<{ lines: string[] }>, index: number) => steps[index].lines.join("\n");
function forwardLaplace(source: string) {
  const parsed = parseUnifiedSignal(source); if (!parsed.ok) throw new Error(parsed.error);
  return deriveForwardLaplaceSteps(parsed.node, (node, at) => evaluateUnifiedSignal(node, at), nodeToLatex);
}

describe("Inverse CTFT derivation", () => {
  it("resolves an ideal low-pass spectrum through the sinc kernel with finite cutoff limits", () => {
    const steps = deriveInverseFourierSteps("\\text{rect}\\left(\\frac{\\omega}{4}\\right)");
    expect(steps).toHaveLength(5);
    expect(joined(steps, 1)).toContain("\\int_{-2}^{2}");
    expect(joined(steps, 2)).toContain("\\frac{e^{j\\omega t}}{jt}");
    expect(joined(steps, 3)).toContain("\\operatorname{sinc}");
    expect(joined(steps, 4)).toContain("x(t)=");
  });
  it("identifies the causal decay pair for a first-order spectrum", () => {
    const steps = deriveInverseFourierSteps("\\frac{1}{3+j\\omega}");
    expect(joined(steps, 2)).toContain("p=-3");
    expect(joined(steps, 4)).toContain("e^{-3t}");
  });
  it("sifts an impulse line", () => { expect(joined(deriveInverseFourierSteps("2\\pi\\delta(\\omega)"), 4)).toBe("x(t)=1"); });
});

describe("Forward CTFT derivation", () => {
  it("keeps the verified closed form in Step 5 for rect + tri", () => {
    const parsed = parseUnifiedSignal("\\text{rect}(t)+\\text{tri}(t)"); if (!parsed.ok) throw new Error(parsed.error);
    const steps = deriveForwardFourierSteps(parsed.node);
    expect(steps).toHaveLength(5);
    expect(joined(steps, 4)).toContain("\\operatorname{sinc}^{2}");
  });
});

describe("Forward bilateral Laplace derivation", () => {
  it("states the right-sided ROC and 1/(s+a) for a causal exponential", () => {
    const steps = forwardLaplace("e^{-2t}u(t)");
    expect(joined(steps, 2)).toContain("\\sigma>-2");
    expect(joined(steps, 3)).toContain("\\operatorname{Re}\\{s\\}>-2");
    expect(joined(steps, 4)).toContain("\\frac{1}{s + 2}");
  });
  it("derives the left-sided pair with the opposite ROC", () => {
    const steps = forwardLaplace("e^{3t}u(-t)");
    expect(joined(steps, 2)).toContain("\\sigma<3");
    expect(joined(steps, 4)).toContain("\\frac{-1}{s - 3}");
    expect(joined(steps, 4)).toContain("\\operatorname{Re}\\{s\\}<3");
  });
  it("gives a finite pulse the entire s-plane", () => { expect(joined(forwardLaplace("\\text{rect}(t)"), 3)).toContain("entire"); });
  it("reports an empty ROC for incompatible right- and left-sided terms", () => { expect(joined(forwardLaplace("e^{2t}u(t)+e^{-2t}u(-t)"), 4)).toContain("\\varnothing"); });
});

describe("Inverse Laplace derivation", () => {
  it("computes cover-up residues and matches them to the ROC", () => {
    const steps = deriveInverseLaplaceSteps(parseTransferFunction("1/((s+1)(s+3))", "s"), "right");
    expect(steps).toHaveLength(5);
    expect(joined(steps, 2)).toContain("A_{1}=\\lim_{s\\to p_{1}}");
    expect(joined(steps, 2)).toContain("-0.5");
    expect(joined(steps, 3)).toContain("right-sided");
    expect(joined(steps, 4)).toContain("e^{-t}");
  });
  it("assigns the pole right of a two-sided strip to the anti-causal term", () => {
    const steps = deriveInverseLaplaceSteps(parseTransferFunction("1/((s+1)(s-2))", "s"), "two-sided");
    expect(joined(steps, 3)).toContain("left-sided");
    expect(joined(steps, 4)).toContain("u(-t)");
  });
  it("uses derivative residues for a repeated pole", () => {
    const steps = deriveInverseLaplaceSteps(parseTransferFunction("1/(s+1)^2", "s"), "right");
    expect(joined(steps, 2)).toContain("\\frac{d^{1}}{ds^{1}}");
    expect(joined(steps, 4)).toContain("te^{-t}");
  });
});

describe("Laplace notation parity", () => {
  it("uses H(s) and h(t) with no X or x leakage for an impulse response", () => {
    const parsed = parseUnifiedSignal("e^{-3t}u(t)"); if (!parsed.ok) throw new Error(parsed.error);
    const steps = deriveForwardLaplaceSteps(parsed.node, (node, at) => evaluateUnifiedSignal(node, at), nodeToLatex, { time: "h", freq: "H" });
    const text = steps.flatMap((step) => step.lines).join("\n");
    expect(text).toContain("H(s)=\\mathcal{L}\\{h(t)\\}=\\int_{-\\infty}^{\\infty}h(t)");
    expect(text).toContain("\\left[\\frac{e^{-(s+3)t}}{-(s+3)}\\right]_{0}^{T}");
    expect(text).toContain("\\operatorname{Re}\\{s\\}>-3");
    expect(text).not.toMatch(/X\(s\)|X_\{1\}|x\(t\)/);
  });
});

describe("Fourier series EFS / TFS derivations", () => {
  const ast = (source: string) => { const parsed = parseSignalExpression(source); if (!parsed.ok) throw new Error(parsed.error); return parsed.ast; };
  it("EFS derives c_k = (d/T0)·Sa(kω0d/2) with the DC term and the k→0 limit, without sinc/CTFT artifacts", () => {
    const steps = deriveFourierSeriesSteps(ast("rect(t)"), 4);
    expect(steps).toHaveLength(4);
    expect(joined(steps, 0)).toContain("c_0=0.25");
    expect(joined(steps, 2)).toContain("\\operatorname{Sa}\\!\\left(\\frac{k\\omega_0\\,1}{2}\\right)");
    expect(joined(steps, 3)).toContain("\\lim_{k\\to0}c_k=0.25=c_0");
    expect(steps.flatMap((step) => step.lines).join("\n")).not.toMatch(/sinc|X\(j/);
  });
  it("EFS gives explicit odd/even harmonic values at 50% duty", () => {
    expect(joined(deriveFourierSeriesSteps(ast("rect(t)"), 2), 3)).toContain("c_{k}=0\\ \\text{for even }k\\ne0");
  });
  it("TFS marks an even signal with b_k = 0 and gives a_0 = 2c_0", () => {
    const steps = deriveTrigSeriesSteps(ast("rect(t)"), 4);
    expect(joined(steps, 0)).toContain("a_0=0.5=2c_0");
    expect(joined(steps, 1)).toContain("\\frac{4\\sin(k\\omega_0\\cdot0.5)}{k\\omega_0T_0}");
    expect(joined(steps, 2)).toContain("b_k=0\\quad\\forall k\\ge1");
  });
  it("TFS puts cos(ω0 t) at a_1 only and flags an odd sine", () => {
    expect(joined(deriveTrigSeriesSteps(ast("cos(2*pi*t)"), 1), 3)).toContain("\\delta_{k,1}");
    expect(joined(deriveTrigSeriesSteps(ast("sin(2*pi*t)"), 1), 2)).toContain("a_0=a_k=0");
  });
});
