import { describe, expect, it } from "vitest";
import { MAX_IMAGE_PROMPT_CHARS } from "../shared/aiTypes";
import { AiRequestError } from "./aiService";
import { DEFAULT_IMAGE_MODEL, ImageBlockedError, STYLE_PREAMBLE, buildImagePrompt, extractImage, imageErrorResponse, imageModels, parseImageRequest } from "./aiImage";

describe("parseImageRequest", () => {
  it("trims, strips control characters and collapses whitespace", () => {
    expect(parseImageRequest({ prompt: "  A DC\u0000 machine\n\tcutaway  view \u007f " })).toBe("A DC machine cutaway view");
  });
  it("rejects non-strings, short and long prompts; accepts the limits", () => {
    for (const body of [null, undefined, "x", {}, { prompt: 5 }, { prompt: "short" }, { prompt: "   \n   " }, { prompt: "x".repeat(MAX_IMAGE_PROMPT_CHARS + 1) }]) {
      expect(() => parseImageRequest(body)).toThrow(AiRequestError);
    }
    expect(parseImageRequest({ prompt: "x".repeat(MAX_IMAGE_PROMPT_CHARS) })).toHaveLength(MAX_IMAGE_PROMPT_CHARS);
    expect(parseImageRequest({ prompt: "x".repeat(10) })).toHaveLength(10);
  });
});

describe("buildImagePrompt", () => {
  it("prepends the fixed illustration preamble", () => {
    const out = buildImagePrompt("types of motors");
    expect(out.startsWith(STYLE_PREAMBLE)).toBe(true);
    expect(out.endsWith("types of motors")).toBe(true);
    expect(STYLE_PREAMBLE).toMatch(/IEEE textbook/);
    expect(STYLE_PREAMBLE).toMatch(/white background/);
    expect(STYLE_PREAMBLE).toMatch(/not a wiring schematic/);
    expect(STYLE_PREAMBLE).toMatch(/Do not depict any people/);
  });
});

describe("imageModels", () => {
  it("defaults, honours the env override and the optional distinct fallback", () => {
    expect(imageModels({})).toEqual([DEFAULT_IMAGE_MODEL]);
    expect(DEFAULT_IMAGE_MODEL).toBe("gemini-2.5-flash-image");
    expect(imageModels({ GEMINI_IMAGE_MODEL: " m1 " })).toEqual(["m1"]);
    expect(imageModels({ GEMINI_IMAGE_MODEL: "m1", GEMINI_IMAGE_FALLBACK_MODEL: "m2" })).toEqual(["m1", "m2"]);
    expect(imageModels({ GEMINI_IMAGE_MODEL: "m1", GEMINI_IMAGE_FALLBACK_MODEL: "m1" })).toEqual(["m1"]);
  });
});

describe("extractImage", () => {
  const png = Buffer.from([137, 80, 78, 71]);
  it("returns the first inline image, skipping text parts", () => {
    const out = extractImage({ candidates: [{ content: { parts: [{}, { inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] });
    expect(out.mimeType).toBe("image/png");
    expect(out.data.equals(png)).toBe(true);
  });
  it("throws a blocked error when there is no image or the prompt was blocked", () => {
    expect(() => extractImage({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] })).toThrow(ImageBlockedError);
    expect(() => extractImage({})).toThrow(ImageBlockedError);
    expect(() => extractImage({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(/couldn't be generated/);
    expect(() => extractImage({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "text/html", data: "PGI+" } }] } }] })).toThrow(ImageBlockedError);
  });
});

describe("imageErrorResponse", () => {
  it("maps blocked to 422, upstream 429 to 429, anything else to 502 without leaking upstream text", () => {
    expect(imageErrorResponse(new ImageBlockedError("finish:IMAGE_SAFETY")).status).toBe(422);
    const quota = imageErrorResponse(Object.assign(new Error("quota exceeded for key AIza-secret"), { status: 429 }));
    expect(quota.status).toBe(429);
    expect(JSON.stringify(quota)).not.toContain("AIza");
    const generic = imageErrorResponse(Object.assign(new Error("boom AIza-secret"), { status: 500 }));
    expect(generic.status).toBe(502);
    expect(JSON.stringify(generic)).not.toContain("boom");
    expect(imageErrorResponse(new Error("x")).status).toBe(502);
  });
});
