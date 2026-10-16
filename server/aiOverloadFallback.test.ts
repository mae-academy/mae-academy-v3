import { afterEach, describe, expect, it, vi } from "vitest";
import { codeExecutionEnabled, fallbackModels, isStreamBreak, sanitizeChatRequest, withOverloadFallback } from "./aiService";

describe("isStreamBreak (a dropped connection is resumable; an API error is not)", () => {
  it("recognises transport failures without an HTTP status", () => {
    for (const message of ["Incomplete JSON segment at the end", "fetch failed", "read ECONNRESET", "terminated", "other side closed"]) {
      expect(isStreamBreak(new Error(message))).toBe(true);
    }
  });

  it("never treats an API error (it carries a status) or an unrelated error as a stream break", () => {
    expect(isStreamBreak(Object.assign(new Error("Incomplete JSON segment"), { status: 400 }))).toBe(false);
    expect(isStreamBreak(new Error("bad request"))).toBe(false);
    expect(isStreamBreak(null)).toBe(false);
  });
});

const overloaded = () => Object.assign(new Error("This model is currently experiencing high demand"), { status: 503 });
const quota = () => Object.assign(new Error("RESOURCE_EXHAUSTED retry in 5s"), { status: 429 });
const retired = () => Object.assign(new Error("no longer available to new users"), { status: 404 });

describe("withOverloadFallback (preferred model first, then an ordered cascade of lighter models)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never touches the fallbacks while the preferred model works", async () => {
    const seen: string[] = [];
    const out = await withOverloadFallback(["big", "mid", "small"], async (m) => { seen.push(m); return m; });
    expect(out).toBe("big");
    expect(seen).toEqual(["big"]);
  });

  it("steps down after a 503 or an exhausted 429, and answers from the first tier that works", async () => {
    for (const fail of [overloaded, quota]) {
      const seen: string[] = [];
      const out = await withOverloadFallback(["big", "mid", "small"], async (m) => { seen.push(m); if (m === "big") throw fail(); return m; });
      expect(out).toBe("mid");
      expect(seen).toEqual(["big", "mid"]);
    }
  });

  it("skips retired tiers (404) and keeps going down the list", async () => {
    const seen: string[] = [];
    const out = await withOverloadFallback(["a", "b", "c", "d"], async (m) => {
      seen.push(m);
      if (m === "a") throw overloaded();
      if (m === "b" || m === "c") throw retired();
      return m;
    });
    expect(out).toBe("d");
    expect(seen).toEqual(["a", "b", "c", "d"]);
  });

  it("does not step down for errors that are not about capacity (bad request, auth)", async () => {
    const seen: string[] = [];
    await expect(withOverloadFallback(["big", "small"], async (m) => { seen.push(m); throw Object.assign(new Error("bad request"), { status: 400 }); })).rejects.toThrow("bad request");
    expect(seen).toEqual(["big"]);
  });

  it("does not step down after the request was aborted, or when there is nothing to fall back to", async () => {
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    await expect(withOverloadFallback(["big", "small"], async () => { calls++; throw overloaded(); }, { signal: ac.signal })).rejects.toMatchObject({ status: 503 });
    await expect(withOverloadFallback(["big"], async () => { calls++; throw overloaded(); })).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(2);
  });

  it("reports the preferred model's error when every tier fails (not a retired tier's 404)", async () => {
    await expect(withOverloadFallback(["big", "mid", "small"], async (m) => { throw m === "big" ? quota() : retired(); })).rejects.toMatchObject({ status: 429 });
  });

  it("fallbackModels: default cascade, comma-list override, legacy single var, off switch, no duplicates of the preferred model", () => {
    expect(fallbackModels({} as NodeJS.ProcessEnv)).toEqual(["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]);
    expect(fallbackModels({ GEMINI_FALLBACK_MODELS: " a , b ,a" } as NodeJS.ProcessEnv)).toEqual(["a", "b"]);
    expect(fallbackModels({ GEMINI_FALLBACK_MODEL: "gemini-3.5-flash" } as NodeJS.ProcessEnv)).toEqual(["gemini-3.5-flash"]);
    for (const off of ["", "off", "OFF", "0"]) expect(fallbackModels({ GEMINI_FALLBACK_MODELS: off } as NodeJS.ProcessEnv)).toEqual([]);
    expect(fallbackModels({ GEMINI_MODEL: "gemini-3.6-flash" } as NodeJS.ProcessEnv)).not.toContain("gemini-3.6-flash");
  });
});

describe("code execution is never combined with a PDF (Gemini answers HTTP 400)", () => {
  const pdfDataUrl = `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`;
  const text = sanitizeChatRequest({ messages: [{ role: "user", content: "solve 2+2" }], lab: "circuits" });
  const pdf = sanitizeChatRequest({
    messages: [{ role: "user", content: "solve the exam", document: { name: "exam.pdf", mimeType: "application/pdf", size: 13, dataUrl: pdfDataUrl } }],
    lab: "circuits",
  });

  it("is on for plain text turns and off for turns that carry a PDF", () => {
    expect(codeExecutionEnabled({} as NodeJS.ProcessEnv, text)).toBe(true);
    expect(pdf.document?.kind).toBe("pdf");
    expect(codeExecutionEnabled({} as NodeJS.ProcessEnv, pdf)).toBe(false);
  });

  it("stays off everywhere when GEMINI_CODE_EXECUTION=0", () => {
    expect(codeExecutionEnabled({ GEMINI_CODE_EXECUTION: "0" } as unknown as NodeJS.ProcessEnv, text)).toBe(false);
  });
});
