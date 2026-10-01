import { describe, expect, it } from "vitest";
import { SIMULATOR_SEO, wordCount } from "./simulatorSeoData";

describe("simulator SEO registry", () => {
  it("keeps every docs block between 200 and 300 words", () => {
    const bad = SIMULATOR_SEO.map((e) => [e.key, wordCount(e.docs)] as const).filter(([, n]) => n < 200 || n > 300);
    expect(bad).toEqual([]);
  });
  it("has unique keys, titles and canonical paths", () => {
    for (const field of ["key", "title", "path"] as const) {
      const values = SIMULATOR_SEO.map((e) => e[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });
  it("keeps meta descriptions snippet sized", () => {
    const bad = SIMULATOR_SEO.filter((e) => e.description.length < 100 || e.description.length > 175).map((e) => [e.key, e.description.length]);
    expect(bad).toEqual([]);
  });
});
