import { describe, expect, it } from "vitest";
import { classifySystem, parseSystemExpression, shiftTestSamples, stabilitySamples, superpositionSamples } from "./systemClassifier";

function system(source: string) { const parsed = parseSystemExpression(source); if (!parsed.ok) throw new Error(parsed.error); return parsed.system; }
function verdicts(source: string) { return Object.fromEntries(classifySystem(system(source)).pillars.map((pillar) => [pillar.id, pillar.verdict])); }

describe("System Classification engine", () => {
  it("classifies time scaling as linear, time-variant, non-causal, dynamic, and BIBO stable", () => {
    expect(verdicts("y(t)=x(2t)")).toMatchObject({ linearity: "Linear", time: "Time-Variant", causality: "Non-Causal", memory: "Dynamic", stability: "BIBO Stable" });
  });
  it("classifies a time-multiplied input as linear but time-variant and unstable", () => {
    expect(verdicts("y(t)=t*x(t)")).toMatchObject({ linearity: "Linear", time: "Time-Variant", causality: "Causal", memory: "Memoryless", stability: "Unstable" });
  });
  it("detects the affine offset and power counterexamples to linearity", () => {
    expect(verdicts("y(t)=x(t)+5").linearity).toBe("Non-Linear");
    expect(verdicts("y(t)=x^2(t)").linearity).toBe("Non-Linear");
  });
  it("classifies the causal integral as linear, time-invariant, dynamic, and unstable", () => {
    expect(verdicts("y(t)=\\int_{-\\infty}^{t}x(\\tau)d\\tau")).toMatchObject({ linearity: "Linear", time: "Time-Invariant", causality: "Causal", memory: "Dynamic", stability: "Unstable" });
  });
  it("accepts every prime spelling of the first derivative and classifies it identically to Leibniz form", () => {
    for (const source of ["y(t)=x'(t)", "y(t)=x^{\\prime}\\left(t\\right)", "y(t)=x′(t)", "y(t)=\\frac{d}{dt}x(t)"]) {
      expect(verdicts(source)).toMatchObject({ linearity: "Linear", time: "Time-Invariant", causality: "Non-Causal", memory: "Dynamic", stability: "Unstable" });
    }
  });
  it("maps a double prime onto the second-order derivative term", () => {
    expect(system("y(t)=x''(t)").terms).toEqual([{ kind: "derivative", order: 2 }]);
    expect(system("y(t)=\\frac{d^{2}}{dt^{2}}x(t)").terms).toEqual([{ kind: "derivative", order: 2 }]);
  });
  it("still rejects tokens outside the grammar", () => {
    expect(parseSystemExpression("y(t)=q(t)").ok).toBe(false);
  });
  it("builds numerical visual traces that separate for nonlinear and time-variant systems", () => {
    expect(Math.max(...superpositionSamples(system("y(t)=x^2(t)"), 1.2, -0.7).map((point) => Math.abs(point.difference)))).toBeGreaterThan(0.1);
    expect(Math.max(...shiftTestSamples(system("y(t)=x(2t)"), 0.6).map((point) => Math.abs(point.difference)))).toBeGreaterThan(0.1);
  });
  it("makes a bounded step input produce an unbounded integral response", () => {
    const trace = stabilitySamples(system("y(t)=\\int_{-\\infty}^{t}x(\\tau)d\\tau"));
    expect(trace.at(-1)!.input).toBe(1); expect(trace.at(-1)!.output).toBeGreaterThan(7.9);
  });

  // Definite integrals are delegated to the Dirac core, which returns a number, not a grammar error.

  it("accepts a delta integral as a constant source", () => {
    const parsed = parseSystemExpression("y(t)=x(t)+\\int_{0}^{2}e^{t-2}\\delta(2t-4)\\,dt");
    expect(parsed.ok && parsed.system.terms).toEqual([
      { kind: "input-sample", coefficient: { constant: 1, timeSlope: 0 }, argument: { slope: 1, offset: 0 }, power: 1 },
      { kind: "constant", value: 0.5 },
    ]);
  });
  it("keeps the running integral as the accumulation operator", () => {
    expect(parseSystemExpression("y(t)=\\int_{-\\infty}^{t}x(\\tau)\\,d\\tau").ok).toBe(true);
  });
  it("explains an undefined domain instead of a grammar error", () => {
    const parsed = parseSystemExpression("y(t)=\\int_{-\\infty}^{\\infty}\\sqrt{t-1}\\delta(t+2)\\,dt");
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toMatch(/square root/i);
  });

  it("produces enriched step-by-step KaTeX derivation proofs for all 5 pillars", () => {
    const report2t = classifySystem(system("y(t)=x(2t)"));
    const lin2t = report2t.pillars.find((p) => p.id === "linearity")!;
    expect(lin2t.proof.length).toBeGreaterThanOrEqual(3);
    expect(lin2t.proof[0]).toContain("T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,x_1(2t) + b\\,x_2(2t)");
    expect(lin2t.proof.at(-1)).toBe("\\therefore \\text{The system is Linear}");

    const time2t = report2t.pillars.find((p) => p.id === "time")!;
    expect(time2t.proof[0]).toContain("y_{\\text{shifted}}(t) = T\\{x(t - t_0)\\} = x\\left(2t - t_0\\right)");
    expect(time2t.proof[1]).toContain("y(t - t_0) = x\\left(2(t - t_0)\\right) = x\\left(2t - 2t_0\\right)");
    expect(time2t.proof.at(-1)).toBe("\\therefore \\text{The system is Time-Variant}");

    const caus2t = report2t.pillars.find((p) => p.id === "causality")!;
    expect(caus2t.proof[0]).toContain("t_1 = 1");
    expect(caus2t.proof[1]).toContain("y(1) = x\\left(2 \\cdot (1)\\right) = x(2)");
    expect(caus2t.proof.at(-1)).toBe("\\therefore \\text{The system is Non-Causal}");

    const mem2t = report2t.pillars.find((p) => p.id === "memory")!;
    expect(mem2t.proof[1]).toContain("y(2) = x(4) \\ne x(2)");
    expect(mem2t.proof.at(-1)).toBe("\\therefore \\text{The system is Dynamic (Has Memory)}");

    const stab2t = report2t.pillars.find((p) => p.id === "stability")!;
    expect(stab2t.proof[0]).toContain("|x(t)| \\le M_x < \\infty");
    expect(stab2t.proof.at(-1)).toBe("\\therefore \\text{The system is BIBO Stable}");
  });

  it("produces system-specific non-linear and time-variant derivation proofs", () => {
    const reportSq = classifySystem(system("y(t)=x^2(t)"));
    const linSq = reportSq.pillars.find((p) => p.id === "linearity")!;
    expect(linSq.proof.some((step) => step.includes("2ab\\,x_1(t)x_2(t)"))).toBe(true);
    expect(linSq.proof.at(-1)).toBe("\\therefore \\text{The system is Non-Linear}");

    const reportTx = classifySystem(system("y(t)=t*x(t)"));
    const timeTx = reportTx.pillars.find((p) => p.id === "time")!;
    expect(timeTx.proof[0]).toContain("t\\,x(t - t_0)");
    expect(timeTx.proof[1]).toContain("(t - t_0)\\,x(t - t_0)");
    expect(timeTx.proof.at(-1)).toBe("\\therefore \\text{The system is Time-Variant}");

    const stabTx = reportTx.pillars.find((p) => p.id === "stability")!;
    expect(stabTx.proof.some((step) => step.includes("\\lim_{t \\to \\infty}"))).toBe(true);
    expect(stabTx.proof.at(-1)).toBe("\\therefore \\text{The system is Unstable}");
  });
});
