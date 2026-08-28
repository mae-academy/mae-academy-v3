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
  it("builds numerical visual traces that separate for nonlinear and time-variant systems", () => {
    expect(Math.max(...superpositionSamples(system("y(t)=x^2(t)"), 1.2, -0.7).map((point) => Math.abs(point.difference)))).toBeGreaterThan(0.1);
    expect(Math.max(...shiftTestSamples(system("y(t)=x(2t)"), 0.6).map((point) => Math.abs(point.difference)))).toBeGreaterThan(0.1);
  });
  it("makes a bounded step input produce an unbounded integral response", () => {
    const trace = stabilitySamples(system("y(t)=\\int_{-\\infty}^{t}x(\\tau)d\\tau"));
    expect(trace.at(-1)!.input).toBe(1); expect(trace.at(-1)!.output).toBeGreaterThan(7.9);
  });
});
