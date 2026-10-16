import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackModel, withOverloadFallback } from "./aiService";

describe("withOverloadFallback (preferred model first, lighter model only when Google is overloaded)", () => {
  const overloaded = () => Object.assign(new Error("This model is currently experiencing high demand"), { status: 503 });
  const quota = () => Object.assign(new Error("RESOURCE_EXHAUSTED retry in 5s"), { status: 429 });
  afterEach(() => vi.unstubAllEnvs());

  it("never touches the fallback while the preferred model works", async () => {
    const seen: string[] = [];
    const out = await withOverloadFallback("big", "small", async (m) => { seen.push(m); return m; });
    expect(out).toBe("big");
    expect(seen).toEqual(["big"]);
  });

  it("falls back after a 503 or an exhausted 429, and answers from the fallback model", async () => {
    for (const fail of [overloaded, quota]) {
      const seen: string[] = [];
      const out = await withOverloadFallback("big", "small", async (m) => { seen.push(m); if (m === "big") throw fail(); return m; });
      expect(out).toBe("small");
      expect(seen).toEqual(["big", "small"]);
    }
  });

  it("does not fall back for errors that are not about capacity (bad request, auth)", async () => {
    const seen: string[] = [];
    await expect(withOverloadFallback("big", "small", async (m) => { seen.push(m); throw Object.assign(new Error("bad request"), { status: 400 }); })).rejects.toThrow("bad request");
    expect(seen).toEqual(["big"]);
  });

  it("does not fall back after the request was aborted, or when no fallback is configured", async () => {
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    await expect(withOverloadFallback("big", "small", async () => { calls++; throw overloaded(); }, { signal: ac.signal })).rejects.toMatchObject({ status: 503 });
    await expect(withOverloadFallback("big", undefined, async () => { calls++; throw overloaded(); })).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(2);
  });

  it("reports the preferred model's error when the fallback fails too (e.g. 404 model retired)", async () => {
    await expect(
      withOverloadFallback("big", "small", async (m) => { throw m === "big" ? overloaded() : Object.assign(new Error("no longer available"), { status: 404 }); }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("fallbackModel defaults to gemini-2.5-flash, is overridable, and can be switched off", () => {
    expect(fallbackModel({} as NodeJS.ProcessEnv)).toBe("gemini-2.5-flash");
    expect(fallbackModel({ GEMINI_FALLBACK_MODEL: " gemini-3.6-flash " } as NodeJS.ProcessEnv)).toBe("gemini-3.6-flash");
    for (const off of ["", "off", "OFF", "0"]) expect(fallbackModel({ GEMINI_FALLBACK_MODEL: off } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(fallbackModel({ GEMINI_MODEL: "gemini-2.5-flash" } as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
