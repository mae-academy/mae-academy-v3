import { describe, expect, it } from "vitest";
import en from "@/locales/en/ai.json";
import ar from "@/locales/ar/ai.json";
import es from "@/locales/es/ai.json";

/** Every leaf path, with array lengths included, so a missing translation shows up. */
function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`, ...value.flatMap((v, i) => (typeof v === "object" ? shape(v, `${prefix}[${i}]`) : []))];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

const locales = { en, ar, es };

describe("ai locale files", () => {
  it("have identical keys in en, ar and es", () => {
    expect(shape(ar)).toEqual(shape(en));
    expect(shape(es)).toEqual(shape(en));
  });

  it("no longer carry the removed lab tabs, info cards and per-lab prompts", () => {
    for (const locale of Object.values(locales)) {
      for (const dead of ["labs", "info", "explore", "prompts"]) expect(locale).not.toHaveProperty(dead);
    }
  });

  it("cover the empty state, four suggestions, every error kind and the simulator action", () => {
    for (const locale of Object.values(locales)) {
      expect(locale.empty.title.length).toBeGreaterThan(5);
      for (const key of ["kvl", "rootLocus", "buck", "photo", "photoPrompt"] as const) expect(locale.suggestions[key].length).toBeGreaterThan(3);
      for (const kind of ["rate_limit", "not_configured", "forbidden", "bad_request", "upstream", "network", "interrupted", "empty", "generic"] as const) {
        expect(locale.errors[kind].length).toBeGreaterThan(5);
      }
      expect(locale.actions.openSimulator.length).toBeGreaterThan(5);
    }
  });

  it("keeps the English heading and suggestion wording the product asked for", () => {
    expect(en.empty.title).toBe("What can I help you calculate or build today?");
    expect(en.suggestions.kvl).toBe("Analyze this KVL circuit");
    expect(en.suggestions.rootLocus).toBe("Explain Root Locus angle criteria");
    expect(en.suggestions.buck).toBe("Design a 5V Buck converter");
    expect(en.suggestions.photo).toBe("Solve a schematic from a photo");
    expect(en.actions.openSimulator).toBe("Open in Interactive Simulator");
  });

  it("never shows raw server wording for an unconfigured backend", () => {
    for (const locale of Object.values(locales)) expect(locale.errors.not_configured).not.toMatch(/GEMINI|API_KEY|configured/i);
  });

  it("names the env var in the demo notice, in every language", () => {
    for (const locale of Object.values(locales)) expect(locale.demo.full).toContain("GEMINI_API_KEY");
  });

  it("interpolation placeholders survive translation", () => {
    for (const locale of Object.values(locales)) {
      expect(locale.composer.counter).toContain("{{count}}");
      expect(locale.composer.counter).toContain("{{max}}");
      expect(locale.sidebar.options).toContain("{{title}}");
    }
  });
});
