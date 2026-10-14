import { describe, expect, it } from "vitest";
import { MAX_SCHEMATIC_PROMPT_CHARS } from "../shared/aiTypes";
import { AiRequestError } from "./aiService";
import { DEFAULT_IMAGE_MODEL, ImageBlockedError, STYLE_PREAMBLE, buildImagePrompt, extractImage, imageModels, parseSchematicRequest } from "./aiImage";

describe("parseSchematicRequest", () => {
  it("trims, strips control characters and collapses whitespace", () => {
    expect(parseSchematicRequest({ prompt: "  A buck\u0000 converter\n\twith  a diode \u007f " })).toBe("A buck converter with a diode");
  });
  it("rejects non-strings, short and long prompts", () => {
    for (const body of [null, undefined, "x", {}, { prompt: 5 }, { prompt: "short" }, { prompt: "   \n   " }, { prompt: "x".repeat(MAX_SCHEMATIC_PROMPT_CHARS + 1) }]) {
      expect(() => parseSchematicRequest(body)).toThrow(AiRequestError);
    }
    expect(parseSchematicRequest({ prompt: "x".repeat(MAX_SCHEMATIC_PROMPT_CHARS) })).toHaveLength(MAX_SCHEMATIC_PROMPT_CHARS);
  });
});

describe("buildImagePrompt", () => {
  it("prepends the fixed style preamble", () => {
    const out = buildImagePrompt("a divider");
    expect(out.startsWith(STYLE_PREAMBLE)).toBe(true);
    expect(out.endsWith("a divider")).toBe(true);
    expect(STYLE_PREAMBLE).toMatch(/white background/);
    expect(STYLE_PREAMBLE).toMatch(/IEC 60617/);
    expect(STYLE_PREAMBLE).toMatch(/No photograph/);
  });
});

describe("imageModels", () => {
  it("defaults, honours the env override and the optional distinct fallback", () => {
    expect(imageModels({})).toEqual([DEFAULT_IMAGE_MODEL]);
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
