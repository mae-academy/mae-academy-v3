import { describe, expect, it } from "vitest";
import { AI_COOLDOWN_MESSAGE, AI_DAILY_LIMIT_MESSAGE, AiRateLimitError, classifyRateLimit, parseRetryDelaySeconds } from "./aiService";

describe("upstream rate limits (429)", () => {
  const daily = Object.assign(new Error('{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.7-flash\\nPlease retry in 14h51m12.46765378s.","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}'), { status: 429 });
  const minute = Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota. quotaId GenerateContentInputTokensPerModelPerMinute-FreeTier. Please retry in 49.697552046s.","status":"RESOURCE_EXHAUSTED"}}'), { status: 429 });

  it("reads retry hints in every wording Gemini uses", () => {
    expect(parseRetryDelaySeconds("Please retry in 14h51m12.46765378s.")).toBe(53473);
    expect(parseRetryDelaySeconds("Please retry in 49.697552046s.")).toBe(50);
    expect(parseRetryDelaySeconds('"retryDelay":"37s"')).toBe(37);
    expect(parseRetryDelaySeconds("no hint here")).toBeUndefined();
  });

  it("tells a daily quota from a per-minute cooldown", () => {
    const d = classifyRateLimit(daily);
    expect(d?.kind).toBe("daily");
    expect(d?.message).toBe(AI_DAILY_LIMIT_MESSAGE);
    const m = classifyRateLimit(minute);
    expect(m?.kind).toBe("cooldown");
    expect(m?.retryAfterSeconds).toBe(50);
    expect(m?.message).toBe(AI_COOLDOWN_MESSAGE);
  });

  it("ignores everything that is not a 429, and never leaks upstream text into the friendly message", () => {
    expect(classifyRateLimit(Object.assign(new Error("boom"), { status: 500 }))).toBeNull();
    expect(classifyRateLimit(new Error("network down"))).toBeNull();
    expect(classifyRateLimit(null)).toBeNull();
    expect(classifyRateLimit(daily)?.message).not.toMatch(/quota|gemini|PerDay|20/i);
    expect(classifyRateLimit(daily)).toBeInstanceOf(AiRateLimitError);
  });
});
