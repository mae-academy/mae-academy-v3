import { describe, expect, it } from "vitest";
import { THINKING_BUDGETS, modelChain, sanitizeChatRequest, thinkingSettings } from "./aiService";

describe("single model and thinking effort", () => {
  const body = (extra: Record<string, unknown> = {}) => ({ messages: [{ id: "u", role: "user", content: "hi", timestamp: 1 }], ...extra });

  it("defaults to medium and accepts only the three exact effort names", () => {
    expect(sanitizeChatRequest(body()).thinkingEffort).toBe("medium");
    for (const effort of ["low", "medium", "high"]) expect(sanitizeChatRequest(body({ thinkingEffort: effort })).thinkingEffort).toBe(effort);
    for (const bad of ["HIGH", "extreme", 3, null, {}, true]) expect(sanitizeChatRequest(body({ thinkingEffort: bad })).thinkingEffort).toBe("medium");
  });

  it("maps effort to a Gemini thinking budget and keeps room for the answer on top of it", () => {
    expect(THINKING_BUDGETS).toEqual({ low: 0, medium: 2048, high: 8192 });
    expect(thinkingSettings("low")).toEqual({ thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 16384 });
    expect(thinkingSettings("medium").thinkingConfig).toEqual({ thinkingBudget: 2048 });
    const high = thinkingSettings("high");
    expect(high.thinkingConfig.thinkingBudget).toBe(8192);
    expect(high.maxOutputTokens - high.thinkingConfig.thinkingBudget).toBeGreaterThanOrEqual(16384);
  });

  it("uses gemini-3.7-flash only: GEMINI_MODEL may override it but no other model is ever added as a fallback", () => {
    expect(modelChain({} as NodeJS.ProcessEnv)).toEqual(["gemini-3.7-flash", "gemini-3.7-flash"]);
    expect(modelChain({ GEMINI_MODEL: "  " } as unknown as NodeJS.ProcessEnv)).toEqual(["gemini-3.7-flash", "gemini-3.7-flash"]);
    expect(modelChain({ GEMINI_MODEL: "custom-model" } as unknown as NodeJS.ProcessEnv)).toEqual(["custom-model", "custom-model"]);
  });
});
