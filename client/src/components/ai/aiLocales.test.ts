import { describe, expect, it } from "vitest";
import en from "@/locales/en/ai.json";
import ar from "@/locales/ar/ai.json";
import es from "@/locales/es/ai.json";
import { LAB_CONTEXTS } from "@shared/aiTypes";

/** Every leaf path, with array lengths included, so a missing translation or prompt shows up. */
function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`, ...value.flatMap((v, i) => (typeof v === "object" ? shape(v, `${prefix}[${i}]`) : []))];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe("ai locale files", () => {
  it("have identical keys in en, ar and es", () => {
    expect(shape(ar)).toEqual(shape(en));
    expect(shape(es)).toEqual(shape(en));
  });

  it("cover every lab with a label and four prompts", () => {
    for (const locale of [en, ar, es]) {
      for (const lab of LAB_CONTEXTS) {
        expect(typeof locale.labs[lab]).toBe("string");
        expect(locale.prompts[lab]).toHaveLength(4);
      }
    }
  });

  it("interpolation placeholders survive translation", () => {
    for (const locale of [en, ar, es]) {
      expect(locale.composer.counter).toContain("{{count}}");
      expect(locale.composer.counter).toContain("{{max}}");
      expect(locale.chat.emptyBody).toContain("{{lab}}");
      expect(locale.explore.lab).toContain("{{lab}}");
    }
  });
});
